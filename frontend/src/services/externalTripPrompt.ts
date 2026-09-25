// The no-key escape hatch for every AI-backed builder step: this app calls its
// own backend, which calls the LLM server-side (see services/apiKey.ts) —
// there's no browser-to-provider BYOK call to fall back to the way
// modeldispatcher-browser-agent's own escape hatch works. Instead, this builds
// the same prompts the backend would send (see backend/services/llm.py's
// `parse_trip_text`, `enhance_trip`, and `_agent_interaction_full`), so the
// user can hand one to a free AI chat app themselves and paste the JSON reply
// back in — the app then continues exactly as if the backend had answered.
// Duplicated by hand from the backend; keep both in sync if either changes.
// `tripDataSchema.json`/`agentResponseSchema.json` are literal dumps of the
// backend's own `TripData.model_json_schema()` / `AgentResponse.model_json_schema()`,
// not hand-written, so they can't drift on their own — only a real schema
// change on either side needs re-syncing.
//
// Step 2 (enhance) and Step 3 (chat) are more involved server-side than Step 1:
// enhance_trip fires one small, narrowly-scoped LLM call per selected option
// (run concurrently) and merges the results back by activity/day id; the chat
// agent classifies each message and often scopes its edit to just the day(s)
// it touches. Neither is something a person can replicate by hand through
// copy-paste. What follows instead combines every selected option (or the
// chat turn) into the single request-the-whole-updated-trip-back shape both
// of those already fall back to internally (enhance's non-parallel case, and
// the chat agent's own `_agent_interaction_full` safety net) — less scoped
// than the real multi-call pipeline, but a faithful, single-shot stand-in for
// someone pasting through an external chat app.

import type { EnhanceOptions, TripData } from "../api";
import agentResponseSchema from "../data/agentResponseSchema.json";
import tripDataSchema from "../data/tripDataSchema.json";

/** The full prompt to hand an external AI chat app for Stage 1: parse free
 * trip text into a structured itinerary. Mirrors the backend's system +
 * user prompt for `parse_trip_text`, combined into one message since a
 * one-off external chat has no separate system-prompt slot. */
export function buildTripParsePrompt(rawText: string, preferences: string): string {
  const preferencesFragment = preferences.trim() ? `IMPORTANT: ${preferences.trim()} ` : "";
  const instructions =
    "You are an expert travel planner AI. Your task is to parse the user's free text " +
    "into a structured JSON trip schedule. " +
    preferencesFragment +
    "Generate realistic latitude ('lat') and longitude ('lng') for 'map_coordinates' for each activity. " +
    "Leave 'price', 'url', 'hasPodcast', 'podcast_brief', 'directions_car' and " +
    "'directions_transit' null/false for now — those are filled in later by an optional, " +
    "opt-in enhancement step, so don't spend effort estimating them here. " +
    "Detect the dominant language of the user's free text (e.g. if most of the words/verbs are " +
    "Hebrew, the dominant language is Hebrew) and set the 'language' field to its ISO 639-1 code " +
    "('he' for Hebrew, 'en' for English, etc.). Write the title, activity titles/descriptions, and " +
    "all other generated text in that same detected language.";

  return (
    `${instructions}\n\n` +
    `User Request: ${rawText}\n\n` +
    "Output strict JSON matching this schema, and nothing else — no markdown fences, no commentary: " +
    JSON.stringify(tripDataSchema)
  );
}

/** One instruction per Step 2 option, mirroring backend/services/llm.py's
 * `_ENHANCE_OPTION_SPECS` — each tells the model which field(s) to fill in
 * while leaving everything else untouched. */
const ENHANCE_OPTION_INSTRUCTIONS: Record<keyof EnhanceOptions, string> = {
  directions_car:
    "For each activity (except the first of its day), fill 'directions_car' with " +
    "short driving directions/notes from the previous activity. Leave every other " +
    "field exactly as given.",
  directions_transit:
    "For each activity (except the first of its day), fill 'directions_transit' with " +
    "short public-transit directions/notes from the previous activity. Leave every " +
    "other field exactly as given.",
  prices:
    "Fill 'price' with the typical cost of each activity (entry ticket, average meal " +
    "cost, nightly rate, etc.) in the trip's local currency, when you can reasonably " +
    "estimate it. Leave every other field exactly as given.",
  podcast:
    "For historical/cultural sites, set 'hasPodcast' to true and write a short " +
    "'podcast_brief' (2-4 sentences of real historical/cultural context about the " +
    "site, beyond what 'desc' already says). Leave every other field exactly as given.",
  links:
    "Fill 'url' with each activity's real official website or listing page, if you " +
    "know one. Leave every other field exactly as given.",
  travel_mode:
    "For each activity EXCEPT the first of its day, set 'travel_mode' to how a " +
    "traveller realistically gets there from the previous activity. A single day is " +
    "normally mixed — drive to a trailhead, hike, take a bus back, walk to dinner — " +
    "so decide each leg on its own rather than giving a whole day one mode. Use " +
    "'hiking' when the activity is itself a trail/trek/nature walk, 'walking' for a " +
    "short walk between city stops, 'transit' where a bus/train/metro/ferry is the " +
    "normal way, 'bicycling' only when cycling is genuinely the intended way, and " +
    "'driving' otherwise. Leave 'travel_mode' null on the first activity of each day " +
    "— there is no previous stop to travel from. Leave every other field exactly as " +
    "given.",
  packing:
    "Fill in the packing checklists. For each day, set that day's 'checklist' to what " +
    "a traveller needs for THAT day specifically, based on its activities — walking " +
    "shoes for a trail day, a swimsuit for a beach day, modest dress for a religious " +
    "site, cash where cards aren't taken. Set the trip-level 'checklist' to essentials " +
    "for the whole trip (documents, chargers, adapters, medication). Keep every item " +
    "under six words, give each a short unique 'id', and keep any items already there. " +
    "Do not put day-specific items in the trip-level list. Leave every other field " +
    "exactly as given.",
};

const MISSING_COORDINATES_INSTRUCTION =
  "Some activities have 'map_coordinates' set to null (e.g. ones added manually " +
  "by the user without a real location). Fill in 'map_coordinates' with realistic " +
  "latitude ('lat') and longitude ('lng') for those activities based on their title " +
  "and description. Leave every other field, and any activity that already has " +
  "'map_coordinates' set, exactly as given.";

/** The full prompt to hand an external AI chat app for Stage 2: fill in the
 * optional extras selected in `options` (mirrors backend's `enhance_trip`,
 * combined into one request instead of one small call per option — see this
 * file's header comment). Returns `null` when there is nothing to ask for
 * (no option selected and every activity already has coordinates), matching
 * `enhance_trip`'s own short-circuit. */
export function buildTripEnhancePrompt(trip: TripData, options: EnhanceOptions): string | null {
  const instructions = (Object.keys(options) as (keyof EnhanceOptions)[])
    .filter((key) => options[key])
    .map((key) => ENHANCE_OPTION_INSTRUCTIONS[key]);
  const needsCoordinates = trip.days.some((day) =>
    day.activities.some((activity) => !activity.map_coordinates),
  );
  if (needsCoordinates) instructions.push(MISSING_COORDINATES_INSTRUCTION);
  if (instructions.length === 0) return null;

  const system =
    "You are an expert travel planner AI enriching an existing trip itinerary with the " +
    "extra details the user explicitly opted into. The 'Current Itinerary' is the full " +
    "source of truth — copy every day and activity through to your output UNCHANGED, " +
    "including each day's 'dayNum' and every activity's id, time, title, desc, type and " +
    "any already-set fields; only fill in the specific new field(s) requested below. " +
    `The itinerary's language (ISO 639-1, currently '${trip.language ?? "he"}') indicates ` +
    "which language to write any new text in — do not switch to English or any other " +
    "language. " +
    instructions.join(" ");

  return (
    `${system}\n\n` +
    `Current Itinerary: ${JSON.stringify(trip)}\n\n` +
    "Output strict JSON matching this schema, and nothing else — no markdown fences, no commentary: " +
    JSON.stringify(tripDataSchema)
  );
}

/** The full prompt to hand an external AI chat app for Stage 3: apply one chat
 * turn's requested edit and reply conversationally. Mirrors backend's
 * `_agent_interaction_full` — the safety-net path it already falls back to
 * for edits needing full-trip context, so it's the natural single-shot
 * equivalent for a copy-pasted turn (see this file's header comment). */
export function buildAgentTurnPrompt(
  trip: TripData,
  userMessage: string,
  preferences: string | null,
): string {
  const preferencesFragment = preferences?.trim() ? `IMPORTANT: ${preferences.trim()} ` : "";
  const instructions =
    "You are a helpful travel assistant AI. The user is reviewing their current trip itinerary. " +
    "Your task is to listen to the user's request, update the JSON itinerary accordingly, " +
    "and provide a friendly conversational response. " +
    "The 'Current Itinerary' below is the full source of truth, including activities the user " +
    "added manually that may be missing fields like 'map_coordinates' or 'hasPodcast' — copy " +
    "every day and activity through to 'updated_trip' UNCHANGED unless the user's request " +
    "specifically asks you to add, remove, or modify it. Never drop an activity just because it " +
    "looks incomplete; preserve its id and other fields as-is, including 'price', 'url', " +
    "'directions_car', 'directions_transit', 'podcast_brief', 'map_url' and 'travel_mode'. " +
    "Copy each day's 'checklist' and the trip-level 'checklist' through unchanged too, " +
    "unless the user asks about what to bring. " +
    `The itinerary's 'language' field (ISO 639-1 code, currently '${trip.language ?? "he"}') ` +
    "indicates which language to reply in — write 'agent_reply' in that same language. If the " +
    "user's message is clearly written in a different dominant language (most of its words/verbs " +
    "are in another language), switch to that language instead and update 'updated_trip.language' " +
    "to match; otherwise keep 'updated_trip.language' unchanged. " +
    preferencesFragment +
    "Always include realistic 'map_coordinates' for new locations, but leave 'price', 'url', " +
    "'hasPodcast', 'podcast_brief', 'directions_car' and 'directions_transit' null/false on " +
    "newly added activities — those are filled in later by an optional, opt-in enhancement " +
    "step, so don't spend effort estimating them here. " +
    "When the request changes the number of days or the overall structure of the trip " +
    "(e.g. adding/removing a day, or moving an activity to a different day), reassign each " +
    "affected activity's 'dayNum' and reorder the 'days' array so it stays consistent — for " +
    "example, an end-of-trip activity like a flight home or hotel checkout must always end up " +
    "on the actual last day, not stranded on the day it was originally on.";

  return (
    `${instructions}\n\n` +
    `Current Itinerary: ${JSON.stringify(trip)}\nUser Message: ${userMessage}\n\n` +
    "Update the itinerary and reply. Output strict JSON matching this schema, and nothing else " +
    `— no markdown fences, no commentary: ${JSON.stringify(agentResponseSchema)}`
  );
}
