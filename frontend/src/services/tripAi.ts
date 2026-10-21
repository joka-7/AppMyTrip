// Trip generation, run entirely in the browser with the user's own AI key.
//
// The prompt, the itinerary and the key go straight from this device to the
// user's AI provider through modeldispatcher-browser-agent: no AppMyTrip
// server ever sees them. Ported from the former backend (backend/services/
// llm.py and routers/builder.py), keeping its behaviour:
//   - parse: free text -> structured itinerary;
//   - agent: a chat turn, scoped to the day(s) it touches when that is safe
//     (local heuristics first, a tiny classification call otherwise), with the
//     whole-trip turn as the fallback, and a guard that rejects a reply which
//     silently drops most of the itinerary (retried once);
//   - enhance: one small, focused call per opted-in extra, run concurrently,
//     each allowed to write back only its own fields.
// Every AI reply is untrusted input: it is parsed defensively and sanitised
// into a well-formed TripData before anything uses it.
import {
  AllProvidersExhaustedError,
  type AgentConfig,
  NoProviderConfiguredError,
  type ProviderId,
  type RequestOptions,
} from "modeldispatcher-browser-agent";
import type {
  Activity,
  ChecklistItem,
  EnhanceOptions,
  TravelMode,
  TripData,
  TripDay,
} from "../api";
import agentDayIntentSchema from "../data/agentDayIntentSchema.json";
import agentResponseSchema from "../data/agentResponseSchema.json";
import agentScopedResponseSchema from "../data/agentScopedResponseSchema.json";
import tripDataSchema from "../data/tripDataSchema.json";

/** Output budgets per call shape. Some providers (Groq notably) reject a
 * request that asks for more than a model allows, however small the prompt. */
export const MAX_TOKENS_CLASSIFY = 1024;
export const MAX_TOKENS_SCOPED_EDIT = 8192;
export const MAX_TOKENS_FULL_TRIP = 16384;

/** Models used per provider: the same ones the backend used, chosen for long JSON output. */
export const TRIP_MODELS: Record<SupportedProvider, string> = {
  gemini: "gemini-2.5-flash",
  openai: "gpt-4o-mini",
  anthropic: "claude-sonnet-4-5-20250929",
  groq: "openai/gpt-oss-120b",
};

export type SupportedProvider = Extract<ProviderId, "gemini" | "openai" | "anthropic" | "groq">;
const SUPPORTED: readonly SupportedProvider[] = ["gemini", "openai", "anthropic", "groq"];

/** One saved provider + its key(s), in the order they should be tried. */
export interface ProviderKeys {
  provider: string;
  api_keys: string[];
}

/**
 * A failed AI step, classified by the same statuses the app already explains
 * to users (see App.tsx's describeApiError): 401 no usable key, 409 reply
 * dropped most of the trip, 422 reply was not a valid trip, 429 every key is
 * rate-limited, 502 every provider failed.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`AI request failed (${status}): ${detail}`);
    this.name = "ApiError";
  }
}

export type CompleteFn = (
  cfg: AgentConfig,
  prompt: string,
  options?: RequestOptions,
) => Promise<string>;

/** Builds the provider fallback list from the saved keys; unsupported providers are skipped. */
export function agentConfigFrom(credentials: readonly ProviderKeys[]): AgentConfig {
  const providers = credentials.flatMap((c) =>
    (SUPPORTED as readonly string[]).includes(c.provider) && c.api_keys.length > 0
      ? [
          {
            provider: c.provider as SupportedProvider,
            model: TRIP_MODELS[c.provider as SupportedProvider],
            apiKeys: c.api_keys,
          },
        ]
      : [],
  );
  return { providers, ollamaUrl: "" };
}

// ---------------------------------------------------------------------------
// Parsing and sanitising AI replies
// ---------------------------------------------------------------------------

const ACTIVITY_TYPES = ["attraction", "food", "lodging", "transport"] as const;
const TRAVEL_MODES: readonly TravelMode[] = [
  "driving",
  "walking",
  "bicycling",
  "transit",
  "hiking",
];
const MAX_DAYS = 120;
const MAX_ACTIVITIES_PER_DAY = 150;
const MAX_CHECKLIST = 100;

const isObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** Pulls the JSON object out of a model's reply: tolerates code fences and stray prose around it. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  const candidate = fenced ? fenced[1] : trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) throw new ApiError(422, "The AI's reply was not JSON.");
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      throw new ApiError(422, "The AI's reply was not valid JSON.");
    }
  }
}

function str(value: unknown, max: number): string {
  return typeof value === "string" ? value.slice(0, max) : "";
}

function optStr(value: unknown, max: number): string | null {
  return typeof value === "string" && value.trim() ? value.slice(0, max) : null;
}

function optNum(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function sanitizeCoordinates(value: unknown): { lat: number; lng: number } | null {
  if (!isObject(value)) return null;
  const lat = optNum(value.lat);
  const lng = optNum(value.lng);
  if (lat === null || lng === null || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

function sanitizeChecklist(value: unknown): ChecklistItem[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(isObject)
    .slice(0, MAX_CHECKLIST)
    .map((item, i) => ({ id: str(item.id, 200) || `item-${i + 1}`, text: str(item.text, 300) }))
    .filter((item) => item.text);
}

function sanitizeActivity(value: unknown): Activity | null {
  if (!isObject(value)) return null;
  const type = (ACTIVITY_TYPES as readonly unknown[]).includes(value.type)
    ? (value.type as Activity["type"])
    : // An off-schema type ('sightseeing') is coerced rather than discarding the whole reply.
      "attraction";
  const travelMode = TRAVEL_MODES.includes(value.travel_mode as TravelMode)
    ? (value.travel_mode as TravelMode)
    : null;
  return {
    id: str(value.id, 200),
    time: str(value.time, 20),
    title: str(value.title, 300),
    desc: str(value.desc, 4000),
    type,
    hasPodcast: value.hasPodcast === true,
    podcast_url: null,
    podcast_brief: optStr(value.podcast_brief, 4000),
    map_coordinates: sanitizeCoordinates(value.map_coordinates),
    price: optNum(value.price),
    url: optStr(value.url, 2000),
    directions_car: optStr(value.directions_car, 4000),
    directions_transit: optStr(value.directions_transit, 4000),
    map_url: optStr(value.map_url, 2000),
    travel_mode: travelMode,
  };
}

function sanitizeDay(value: unknown, index: number): TripDay | null {
  if (!isObject(value) || !Array.isArray(value.activities)) return null;
  const dayNum = Number.isInteger(value.dayNum) ? (value.dayNum as number) : index + 1;
  return {
    dayNum,
    activities: value.activities
      .slice(0, MAX_ACTIVITIES_PER_DAY)
      .map(sanitizeActivity)
      .filter((a): a is Activity => a !== null),
    checklist: sanitizeChecklist(value.checklist),
  };
}

function sanitizeDays(value: unknown): TripDay[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .slice(0, MAX_DAYS)
    .map(sanitizeDay)
    .filter((d): d is TripDay => d !== null);
}

/** A well-formed TripData from an AI reply, or a 422 when it is not shaped like a trip. */
export function sanitizeTrip(value: unknown): TripData {
  if (!isObject(value)) throw new ApiError(422, "The AI's reply was not a trip.");
  const days = sanitizeDays(value.days);
  if (days === null) throw new ApiError(422, "The AI's reply had no days.");
  return {
    title: str(value.title, 300),
    dates: str(value.dates, 200),
    days,
    language: optStr(value.language, 10) ?? "he",
    photo_album_url: optStr(value.photo_album_url, 2000),
    checklist: sanitizeChecklist(value.checklist),
  };
}

// ---------------------------------------------------------------------------
// Chat-turn heuristics (ported with the backend's own test cases)
// ---------------------------------------------------------------------------

// JavaScript's \b only knows ASCII letters, unlike Python's; these lookarounds
// give the same Unicode-aware word boundary for Hebrew, Arabic, Hindi, etc.
const W = "[\\p{L}\\p{M}\\p{N}_]";
const START = `(?<!${W})`;
const END = `(?!${W})`;

const DAY_NUMBER_PATTERN = new RegExp(
  `(?:${START}day${END}|${START}[לבה]?יום${END}|${START}jour${END})[\\s:#()-]*(?:number|no\\.?|מספר)?[\\s:#()-]*(\\d+)`,
  "giu",
);

/** Day numbers explicitly mentioned ("day 8", "יום 8", "jour 8"); empty means "not confident". */
export function detectDayNumbers(message: string): number[] {
  const found = new Set<number>();
  for (const match of message.matchAll(DAY_NUMBER_PATTERN)) found.add(Number(match[1]));
  return [...found].sort((a, b) => a - b);
}

// "add a/another day" with no number. "day"/"יום" must be a bare word close
// after the verb, so "add X to the day" (ליום) and "today" (היום) don't match,
// and "every/each day" (לכל/בכל) is excluded.
const ADD_DAY_PATTERN = new RegExp(
  `${START}(?:add|הוסיפ${W}*|תוסיפ${W}*|הוסף|תוסיף|נוסיף|ajout${W}*)${END}` +
    `(?:\\s+\\S+){0,3}?\\s+` +
    `(?<!כל )(?<!לכל )(?<!בכל )(?<!every )(?<!each )` +
    `${START}(?:days?|ימים|יום|jours?)${END}`,
  "iu",
);

export function mentionsAddingADay(message: string): boolean {
  return ADD_DAY_PATTERN.test(message);
}

// Words that mean the user asked to delete things, so a big drop in activities
// is intended, not a truncated reply. Matched broadly across languages because
// people often chat in a different language than the itinerary's.
const DELETION_KEYWORDS = [
  // Hebrew
  "מחק",
  "מחיקה",
  "תמחק",
  "הסר",
  "הסרה",
  "תסיר",
  "בטל",
  "ביטול",
  // English
  "delete",
  "remove",
  "cancel",
  // French
  "supprime",
  "supprimer",
  "enlève",
  "enlever",
  "annule",
  "annuler",
  // Spanish
  "elimina",
  "eliminar",
  "borra",
  "borrar",
  "quitar",
  "cancela",
  "cancelar",
  // German
  "lösche",
  "löschen",
  "entferne",
  "entfernen",
  "storniere",
  "stornieren",
  // Italian
  "cancella",
  "cancellare",
  "rimuovi",
  "rimuovere",
  // Portuguese
  "apaga",
  "apagar",
  "remover",
  // Russian
  "удали",
  "удалить",
  "убери",
  "убрать",
  "отмени",
  "отменить",
  // Arabic
  "احذف",
  "حذف",
  "ألغِ",
  "إلغاء",
  "أزل",
  // Turkish
  "silme",
  "kaldır",
  "iptal",
  // Dutch
  "verwijder",
  "verwijderen",
  "annuleer",
  "annuleren",
  // Hindi
  "हटाओ",
  "हटाना",
  "मिटाओ",
  "मिटाना",
  "रद्द",
];
// Chinese/Japanese/Korean don't separate words with spaces: substring match is right there.
const CJK_DELETION_KEYWORDS = [
  "删除",
  "取消",
  "移除",
  "削除",
  "取り消",
  "キャンセル",
  "삭제",
  "취소",
  "제거",
];

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
// Trailing combining marks (an Arabic diacritic, a Hindi vowel sign) are part
// of the word already, so the end boundary is anchored after the last base letter.
const stripTrailingMarks = (s: string) => s.replace(/\p{M}+$/u, "");
const WORD_END = new RegExp(`^${W}`, "u");

export function mentionsDeletion(message: string): boolean {
  const lowered = message.toLowerCase();
  if (CJK_DELETION_KEYWORDS.some((kw) => lowered.includes(kw))) return true;
  // Match the keyword at a word start, then require that it also ends at a word
  // end (ignoring the combining marks the keyword itself carries).
  for (const kw of DELETION_KEYWORDS) {
    const base = stripTrailingMarks(kw.toLowerCase());
    const re = new RegExp(`${START}${escapeRegExp(base)}`, "giu");
    for (const m of lowered.matchAll(re)) {
      const rest = lowered.slice((m.index ?? 0) + base.length).replace(/^\p{M}+/u, "");
      if (!WORD_END.test(rest)) return true;
    }
  }
  return false;
}

const activityCount = (trip: TripData) => trip.days.reduce((n, d) => n + d.activities.length, 0);

/** A reply that dropped >65% of a trip with at least 6 activities, unless the user asked to delete. */
export function looksTruncated(previous: TripData, updated: TripData, message: string): boolean {
  if (mentionsDeletion(message)) return false;
  const before = activityCount(previous);
  if (before < 6) return false;
  return activityCount(updated) < before * 0.35;
}

// ---------------------------------------------------------------------------
// The AI steps
// ---------------------------------------------------------------------------

const NO_LATER_FIELDS =
  "leave 'price', 'url', 'hasPodcast', 'podcast_brief', 'directions_car' and " +
  "'directions_transit' null/false — those are filled in later by an optional, " +
  "opt-in enhancement step.";

interface EnhanceSpec {
  flag: keyof EnhanceOptions | "map_coordinates";
  instruction: string;
  activityFields?: (keyof Activity)[];
  dayFields?: (keyof TripDay)[];
  tripFields?: (keyof TripData)[];
}

const ENHANCE_SPECS: EnhanceSpec[] = [
  {
    flag: "directions_car",
    instruction:
      "For each activity (except the first of its day), fill 'directions_car' with short " +
      "driving directions/notes from the previous activity. Leave every other field exactly as given.",
    activityFields: ["directions_car"],
  },
  {
    flag: "directions_transit",
    instruction:
      "For each activity (except the first of its day), fill 'directions_transit' with short " +
      "public-transit directions/notes from the previous activity. Leave every other field exactly as given.",
    activityFields: ["directions_transit"],
  },
  {
    flag: "prices",
    instruction:
      "Fill 'price' with the typical cost of each activity (entry ticket, average meal cost, " +
      "nightly rate, etc.) in the trip's local currency, when you can reasonably estimate it. " +
      "Leave every other field exactly as given.",
    activityFields: ["price"],
  },
  {
    flag: "podcast",
    instruction:
      "For historical/cultural sites, set 'hasPodcast' to true and write a short 'podcast_brief' " +
      "(2-4 sentences of real historical/cultural context about the site, beyond what 'desc' " +
      "already says). Leave every other field exactly as given.",
    activityFields: ["hasPodcast", "podcast_brief"],
  },
  {
    flag: "links",
    instruction:
      "Fill 'url' with each activity's real official website or listing page, if you know one. " +
      "Leave every other field exactly as given.",
    activityFields: ["url"],
  },
  {
    flag: "travel_mode",
    instruction:
      "For each activity EXCEPT the first of its day, set 'travel_mode' to how a traveller " +
      "realistically gets there from the previous activity. A single day is normally mixed — " +
      "drive to a trailhead, hike, take a bus back, walk to dinner — so decide each leg on its " +
      "own rather than giving a whole day one mode. Use 'hiking' when the activity is itself a " +
      "trail/trek/nature walk, 'walking' for a short walk between city stops, 'transit' where a " +
      "bus/train/metro/ferry is the normal way, 'bicycling' only when cycling is genuinely the " +
      "intended way, and 'driving' otherwise. Leave 'travel_mode' null on the first activity of " +
      "each day — there is no previous stop to travel from. Leave every other field exactly as given.",
    activityFields: ["travel_mode"],
  },
  {
    flag: "packing",
    instruction:
      "Fill in the packing checklists. For each day, set that day's 'checklist' to what a " +
      "traveller needs for THAT day specifically, based on its activities — walking shoes for a " +
      "trail day, a swimsuit for a beach day, modest dress for a religious site, cash where cards " +
      "aren't taken. Set the trip-level 'checklist' to essentials for the whole trip (documents, " +
      "chargers, adapters, medication). Keep every item under six words, give each a short unique " +
      "'id', and keep any items already there. Do not put day-specific items in the trip-level " +
      "list. Leave every other field exactly as given.",
    dayFields: ["checklist"],
    tripFields: ["checklist"],
  },
];

const MISSING_COORDINATES: EnhanceSpec = {
  flag: "map_coordinates",
  instruction:
    "Some activities have 'map_coordinates' set to null (e.g. ones added manually by the user " +
    "without a real location). Fill in 'map_coordinates' with realistic latitude ('lat') and " +
    "longitude ('lng') for those activities based on their title and description. Leave every " +
    "other field, and any activity that already has 'map_coordinates' set, exactly as given.",
  activityFields: ["map_coordinates"],
};

// A reply that leaves a field empty never erases what the trip already had.
const hasValue = (value: unknown) =>
  value !== null && value !== undefined && !(Array.isArray(value) && value.length === 0);

const schemaText = (schema: unknown) =>
  `Output strict JSON matching this schema: ${JSON.stringify(schema)}`;

/** Turns the dispatcher's failures into the statuses the app explains to users. */
function classify(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err instanceof NoProviderConfiguredError) {
    return new ApiError(401, "No AI key is configured.");
  }
  if (err instanceof AllProvidersExhaustedError) {
    const errors = err.attempts.map((a) => a.error);
    if (errors.length > 0 && errors.every((e) => /\b429\b|rate.?limit/i.test(e))) {
      return new ApiError(429, "Every saved key is rate-limited.");
    }
    if (errors.length > 0 && errors.every((e) => /\b40[13]\b|api.?key|unauthori[sz]ed/i.test(e))) {
      return new ApiError(401, "None of the saved keys worked.");
    }
    const summary = err.attempts.map((a) => `${a.provider}: ${a.error}`).join("; ");
    return new ApiError(502, summary || "Every AI provider failed.");
  }
  return new ApiError(502, err instanceof Error ? err.message : String(err));
}

export function createTripAi({ complete }: { complete: CompleteFn }) {
  async function ask(
    cfg: AgentConfig,
    system: string,
    user: string,
    maxTokens = MAX_TOKENS_FULL_TRIP,
  ): Promise<unknown> {
    let text: string;
    try {
      text = await complete(cfg, user, { systemInstruction: system, jsonMode: true, maxTokens });
    } catch (err) {
      throw classify(err);
    }
    return extractJson(text);
  }

  const prefs = (preferences?: string | null) => (preferences ? `IMPORTANT: ${preferences} ` : "");

  async function parseTripText(
    rawText: string,
    preferences: string | null | undefined,
    cfg: AgentConfig,
  ): Promise<TripData> {
    const system =
      "You are an expert travel planner AI. Your task is to parse the user's free text into a " +
      "structured JSON trip schedule. " +
      prefs(preferences) +
      "Generate realistic latitude ('lat') and longitude ('lng') for 'map_coordinates' for each " +
      "activity. For now, " +
      NO_LATER_FIELDS +
      " Detect the dominant language of the user's free text (e.g. if most of the words/verbs are " +
      "Hebrew, the dominant language is Hebrew) and set the 'language' field to its ISO 639-1 code " +
      "('he' for Hebrew, 'en' for English, etc.). Write the title, activity titles/descriptions, and " +
      "all other generated text in that same detected language.";
    const user = `User Request: ${rawText}\n\n${schemaText(tripDataSchema)}`;
    return sanitizeTrip(await ask(cfg, system, user));
  }

  type Intent = { action: "add_days" | "edit_days" | "general"; dayNumbers: number[] };

  async function resolveIntent(trip: TripData, message: string, cfg: AgentConfig): Promise<Intent> {
    const existing = new Set(trip.days.map((d) => d.dayNum));
    const mentioned = detectDayNumbers(message);
    if (mentioned.length > 0) {
      if (mentioned.every((n) => !existing.has(n))) return { action: "add_days", dayNumbers: [] };
      if (mentioned.every((n) => existing.has(n)))
        return { action: "edit_days", dayNumbers: mentioned };
    } else if (mentionsAddingADay(message)) {
      return { action: "add_days", dayNumbers: [] };
    }
    if (trip.days.length === 0) return { action: "general", dayNumbers: [] };
    // Classification is only an optimisation, so any failure means "general".
    try {
      const summaries = trip.days
        .map(
          (d) =>
            `Day ${d.dayNum}: ` +
            (d.activities
              .map((a) => a.title)
              .join(", ")
              .slice(0, 200) || "(empty)"),
        )
        .join("\n");
      const system =
        "You are triaging a travel-itinerary chat message so the app knows how much of the trip " +
        "to send for the actual edit — you are NOT performing the edit itself. Given a one-line " +
        "summary of each existing day and the user's message, decide: 'add_days' if the message " +
        "only asks to add one or more brand-new day(s) and nothing existing needs to change; " +
        "'edit_days' if it asks to change, remove from, or add something to specific existing " +
        "day(s) — list every day number it affects; 'general' if it's ambiguous, references the " +
        "whole trip, or needs restructuring (reordering/renumbering days, changing the trip " +
        "title/dates, or anything spanning many days). When unsure, choose 'general' — it's " +
        "always safe, just slower.";
      const user =
        `Existing days:\n${summaries}\n\nUser message: ${message}\n\n` +
        schemaText(agentDayIntentSchema);
      const raw = await ask(cfg, system, user, MAX_TOKENS_CLASSIFY);
      if (!isObject(raw)) return { action: "general", dayNumbers: [] };
      const action =
        raw.action === "add_days" || raw.action === "edit_days" ? raw.action : "general";
      const dayNumbers = Array.isArray(raw.day_numbers)
        ? raw.day_numbers.filter((n): n is number => Number.isInteger(n))
        : [];
      return { action, dayNumbers };
    } catch {
      return { action: "general", dayNumbers: [] };
    }
  }

  function scopedReply(raw: unknown): { days: TripDay[]; reply: string } {
    if (!isObject(raw)) throw new ApiError(422, "Scoped reply was not an object.");
    const days = sanitizeDays(raw.days);
    if (!days || days.length === 0) throw new ApiError(422, "Scoped reply had no days.");
    return { days, reply: str(raw.agent_reply, 4000) };
  }

  async function addDays(
    trip: TripData,
    message: string,
    preferences: string | null | undefined,
    cfg: AgentConfig,
  ) {
    const existing = new Set(trip.days.map((d) => d.dayNum));
    const next = Math.max(0, ...existing) + 1;
    const system =
      "You are a helpful travel assistant AI adding brand-new day(s) to the end of an existing " +
      "trip itinerary. You're only shown the trip's basic info and its last existing day for " +
      "continuity — every earlier day is unaffected and already fine, so don't regenerate them; " +
      "only output the new day(s) in 'days'. " +
      `Number the new day(s) starting from ${next} and increasing by 1. ` +
      `The itinerary's language (ISO 639-1, currently '${trip.language ?? "he"}') indicates which ` +
      "language to write 'agent_reply' and the new activities in. " +
      prefs(preferences) +
      "Always include realistic 'map_coordinates' for new locations, but on the new activities " +
      NO_LATER_FIELDS;
    const context = {
      title: trip.title,
      dates: trip.dates,
      existing_day_count: trip.days.length,
      last_day: trip.days[trip.days.length - 1] ?? null,
    };
    const user =
      `Trip context: ${JSON.stringify(context)}\nUser Message: ${message}\n\n` +
      schemaText(agentScopedResponseSchema);
    const { days, reply } = scopedReply(await ask(cfg, system, user, MAX_TOKENS_SCOPED_EDIT));
    if (days.some((d) => existing.has(d.dayNum))) throw new ApiError(422, "Day-number collision.");
    return { trip: { ...trip, days: [...trip.days, ...days] }, reply };
  }

  async function editDays(
    trip: TripData,
    message: string,
    dayNumbers: number[],
    preferences: string | null | undefined,
    cfg: AgentConfig,
  ) {
    const targets = trip.days.filter((d) => dayNumbers.includes(d.dayNum));
    if (targets.length === 0) throw new ApiError(422, "None of the classified days exist.");
    const system =
      "You are a helpful travel assistant AI editing specific day(s) of a larger trip itinerary. " +
      "Only the day(s) below are shown to you — every other day already exists and is unaffected, " +
      "so don't worry about them or try to reproduce them. The 'Days' below are the full source of " +
      "truth for these day(s), including activities the user added manually that may be missing " +
      "fields like 'map_coordinates' or 'hasPodcast' — copy each one through to the output " +
      "UNCHANGED unless the user's request specifically asks you to add, remove, or modify it. " +
      "Never drop an activity just because it looks incomplete; preserve its id and other fields " +
      "as-is, including 'map_url', 'travel_mode' and each day's 'checklist'. " +
      `The itinerary's language (ISO 639-1, currently '${trip.language ?? "he"}') indicates which ` +
      "language to write 'agent_reply' in. " +
      prefs(preferences) +
      "Always include realistic 'map_coordinates' for new locations, but on newly added activities " +
      NO_LATER_FIELDS;
    const user =
      `Days: ${JSON.stringify(targets)}\nUser Message: ${message}\n\n` +
      schemaText(agentScopedResponseSchema);
    const { days, reply } = scopedReply(await ask(cfg, system, user, MAX_TOKENS_SCOPED_EDIT));
    if (!days.every((d) => dayNumbers.includes(d.dayNum))) {
      throw new ApiError(422, "Unexpected day number.");
    }
    const byNum = new Map(days.map((d) => [d.dayNum, d]));
    return { trip: { ...trip, days: trip.days.map((d) => byNum.get(d.dayNum) ?? d) }, reply };
  }

  async function fullTurn(
    trip: TripData,
    message: string,
    preferences: string | null | undefined,
    cfg: AgentConfig,
  ) {
    const system =
      "You are a helpful travel assistant AI. The user is reviewing their current trip itinerary. " +
      "Your task is to listen to the user's request, update the JSON itinerary accordingly, and " +
      "provide a friendly conversational response. The 'Current Itinerary' below is the full " +
      "source of truth, including activities the user added manually that may be missing fields " +
      "like 'map_coordinates' or 'hasPodcast' — copy every day and activity through to " +
      "'updated_trip' UNCHANGED unless the user's request specifically asks you to add, remove, or " +
      "modify it. Never drop an activity just because it looks incomplete; preserve its id and " +
      "other fields as-is, including 'price', 'url', 'directions_car', 'directions_transit', " +
      "'podcast_brief', 'map_url' and 'travel_mode'. Copy each day's 'checklist' and the " +
      "trip-level 'checklist' through unchanged too, unless the user asks about what to bring. " +
      `The itinerary's 'language' field (ISO 639-1 code, currently '${trip.language ?? "he"}') ` +
      "indicates which language to reply in — write 'agent_reply' in that same language. If the " +
      "user's message is clearly written in a different dominant language (most of its words/verbs " +
      "are in another language), switch to that language instead and update " +
      "'updated_trip.language' to match; otherwise keep 'updated_trip.language' unchanged. " +
      prefs(preferences) +
      "Always include realistic 'map_coordinates' for new locations, but on newly added " +
      "activities " +
      NO_LATER_FIELDS +
      " When the request changes the number of days or the overall structure of the trip (e.g. " +
      "adding/removing a day, or moving an activity to a different day), reassign each affected " +
      "activity's 'dayNum' and reorder the 'days' array so it stays consistent — for example, an " +
      "end-of-trip activity like a flight home or hotel checkout must always end up on the actual " +
      "last day, not stranded on the day it was originally on.";
    const user =
      `Current Itinerary: ${JSON.stringify(trip)}\nUser Message: ${message}\n\n` +
      `Update the itinerary and reply. ${schemaText(agentResponseSchema)}`;
    const raw = await ask(cfg, system, user);
    if (!isObject(raw)) throw new ApiError(422, "The AI's reply was not an object.");
    const updated = sanitizeTrip(raw.updated_trip);
    // A missing reply text is a formatting slip, not a failed edit: keep the edit.
    const reply = str(raw.agent_reply, 4000) || (updated.language === "he" ? "בוצע!" : "Done!");
    return { trip: updated, reply };
  }

  async function agentTurnOnce(
    trip: TripData,
    message: string,
    preferences: string | null | undefined,
    cfg: AgentConfig,
  ) {
    const intent = await resolveIntent(trip, message, cfg);
    try {
      if (intent.action === "add_days") return await addDays(trip, message, preferences, cfg);
      if (intent.action === "edit_days" && intent.dayNumbers.length > 0) {
        return await editDays(trip, message, intent.dayNumbers, preferences, cfg);
      }
    } catch (err) {
      // A scoped attempt that doesn't check out falls back to the whole-trip turn;
      // provider failures (no key, rate limits) are not retried that way.
      if (!(err instanceof ApiError) || err.status !== 422) throw err;
    }
    return fullTurn(trip, message, preferences, cfg);
  }

  /** One chat turn. Rejects (409) a reply that still drops most of the trip after one retry. */
  async function agentTurn(
    trip: TripData,
    message: string,
    preferences: string | null | undefined,
    cfg: AgentConfig,
  ): Promise<{ trip: TripData; reply: string }> {
    let result = await agentTurnOnce(trip, message, preferences, cfg);
    if (looksTruncated(trip, result.trip, message)) {
      result = await agentTurnOnce(trip, message, preferences, cfg);
      if (looksTruncated(trip, result.trip, message)) {
        throw new ApiError(
          409,
          "The AI's response looks incomplete — it dropped most of the existing itinerary.",
        );
      }
    }
    return result;
  }

  async function enhanceOne(
    trip: TripData,
    spec: EnhanceSpec,
    cfg: AgentConfig,
  ): Promise<TripData> {
    const system =
      "You are an expert travel planner AI enriching an existing trip itinerary with one extra " +
      "detail the user explicitly opted into. The 'Current Itinerary' is the full source of truth " +
      "— copy every day and activity through to 'updated_trip' UNCHANGED, including each day's " +
      "'dayNum' and every activity's id, time, title, desc, type and any already-set fields; only " +
      "fill in the specific new field(s) requested below. " +
      `The itinerary's language (ISO 639-1, currently '${trip.language ?? "he"}') indicates which ` +
      "language to write any new text in (e.g. 'podcast_brief', the directions notes, or checklist " +
      "items) — do not switch to English or any other language. " +
      spec.instruction;
    const user = `Current Itinerary: ${JSON.stringify(trip)}\n\n${schemaText(tripDataSchema)}`;
    return sanitizeTrip(await ask(cfg, system, user));
  }

  /**
   * Fills the opted-in extras, plus (always) coordinates for activities
   * missing them. One focused call per extra, concurrently; each may write
   * back only its own fields, matched by activity id and day number. Fails
   * only when every call failed.
   */
  async function enhanceTrip(
    trip: TripData,
    options: EnhanceOptions,
    cfg: AgentConfig,
  ): Promise<TripData> {
    const selected = ENHANCE_SPECS.filter((spec) => options[spec.flag as keyof EnhanceOptions]);
    if (trip.days.some((d) => d.activities.some((a) => !a.map_coordinates))) {
      selected.push(MISSING_COORDINATES);
    }
    if (selected.length === 0) return trip;
    const results = await Promise.allSettled(selected.map((spec) => enhanceOne(trip, spec, cfg)));
    const merged: TripData = structuredClone(trip);
    const activitiesById = new Map(
      merged.days.flatMap((d) => d.activities.map((a) => [a.id, a] as const)),
    );
    const daysByNum = new Map(merged.days.map((d) => [d.dayNum, d]));
    let firstError: unknown = null;
    let anySucceeded = false;
    selected.forEach((spec, i) => {
      const result = results[i];
      if (result.status === "rejected") {
        firstError ??= result.reason;
        return;
      }
      anySucceeded = true;
      const enhanced = result.value;
      for (const field of spec.tripFields ?? []) {
        if (hasValue(enhanced[field])) {
          (merged as unknown as Record<string, unknown>)[field] = enhanced[field];
        }
      }
      for (const day of enhanced.days) {
        const target = daysByNum.get(day.dayNum);
        if (target) {
          for (const field of spec.dayFields ?? []) {
            if (hasValue(day[field]))
              (target as unknown as Record<string, unknown>)[field] = day[field];
          }
        }
        for (const act of day.activities) {
          const targetAct = activitiesById.get(act.id);
          if (!targetAct) continue;
          if (spec === MISSING_COORDINATES && targetAct.map_coordinates) continue;
          for (const field of spec.activityFields ?? []) {
            if (hasValue(act[field]))
              (targetAct as unknown as Record<string, unknown>)[field] = act[field];
          }
        }
      }
    });
    if (!anySucceeded && firstError) throw firstError;
    return merged;
  }

  return { parseTripText, agentTurn, enhanceTrip };
}
