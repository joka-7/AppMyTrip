// API client for the TripWeaver backend.
//
// Base URL is configurable via VITE_API_URL (see .env.example); it defaults to
// the local FastAPI dev server.
import { cleanEnvVar } from "./services/env";

export const API_BASE_URL: string = (
  cleanEnvVar(import.meta.env.VITE_API_URL as string | undefined) ?? "http://localhost:8000"
).replace(/\/+$/, "");

export interface Activity {
  id: string;
  time: string;
  title: string;
  desc: string;
  type: "attraction" | "food" | "lodging" | "transport";
  hasPodcast?: boolean;
  podcast_url?: string | null;
  /** Short historical/contextual brief about the site, narrated in the podcast in addition to `desc`. */
  podcast_brief?: string | null;
  map_coordinates?: { lat: number; lng: number } | null;
  /** Cost of this activity, in the trip's currency. */
  price?: number | null;
  /** Link to the activity's official site or listing. */
  url?: string | null;
  /** Driving directions/notes to reach this activity from the previous stop. */
  directions_car?: string | null;
  /** Public-transit directions/notes to reach this activity from the previous stop. */
  directions_transit?: string | null;
  /**
   * User-supplied Google Maps link, overriding the one built from
   * `map_coordinates`. Set when the AI's coordinates landed on the wrong place
   * and the user pasted the real listing instead.
   */
  map_url?: string | null;
  /**
   * How you get to *this* activity from the previous stop. Normally left unset
   * and inferred (see services/travelMode.ts); an explicit value is a user (or
   * AI) override that always wins.
   */
  travel_mode?: TravelMode | null;
}

/**
 * How a leg between two stops is travelled. The first four match Google Maps'
 * `travelmode` values; `hiking` is an app-level distinction (a trail is not a
 * city stroll) that maps to `walking` when building a Maps link — see
 * `googleTravelMode` in services/travelMode.ts.
 */
export type TravelMode = "driving" | "walking" | "bicycling" | "transit" | "hiking";

/** One thing to bring/prepare, either for a single day or for the whole trip. */
export interface ChecklistItem {
  id: string;
  text: string;
}

export interface TripDay {
  dayNum: number;
  activities: Activity[];
  /** What's needed for this specific day (boots for a trail day, swimsuit for a beach day). */
  checklist?: ChecklistItem[];
}

export interface TripData {
  title: string;
  dates: string;
  days: TripDay[];
  /** ISO 639-1 code of the trip's dominant language (e.g. "he", "en"); the agent replies in this language. */
  language?: string;
  /** Link to a shared photo album for the whole trip. */
  photo_album_url?: string | null;
  /** Sun=0..Sat=6 weekday of day 1 — persisted so saved/imported trips keep tab labels. */
  startWeekday?: number | null;
  /** Trip-wide essentials (passport, chargers) — things not tied to one day. */
  checklist?: ChecklistItem[];
}

/** Which optional, LLM-generated extras Step 2 should fill in. */
export interface EnhanceOptions {
  directions_car?: boolean;
  directions_transit?: boolean;
  prices?: boolean;
  podcast?: boolean;
  links?: boolean;
  /** Fills the per-day and trip-wide "what to bring" checklists. */
  packing?: boolean;
  /** Fills each activity's `travel_mode`. */
  travel_mode?: boolean;
}

/** One saved provider + its key(s). Sent as the `credentials` list so the backend
 * can fall through to another saved provider when one is exhausted/invalid, and
 * only errors once every one has failed. */
export interface ProviderCredentials {
  provider: string;
  api_keys: string[];
}

export interface ParseResponse {
  trip_data: TripData;
  initial_agent_message: string | null;
}

export interface AgentResponse {
  trip_data: TripData;
  agent_reply: string;
}

export interface GenerateMediaResponse {
  trip_data: TripData;
  status: string;
}

/** Thrown by postJSON on a non-OK response; carries the parsed status/detail
 * so callers can explain the actual failure instead of guessing from the
 * message string. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(`API request failed (${status}): ${detail}`);
    this.name = "ApiError";
  }
}

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail = text;
    try {
      const parsed = JSON.parse(text) as { detail?: unknown };
      if (typeof parsed?.detail === "string" && parsed.detail) {
        detail = parsed.detail;
      }
    } catch {
      // Response body wasn't JSON (e.g. a proxy/502 HTML page) — keep the raw text.
    }
    throw new ApiError(res.status, detail);
  }
  return (await res.json()) as T;
}

/** Stage 1: parse free trip text into a structured itinerary. */
export function parseTrip(
  rawText: string,
  preferences?: string | null,
  apiKeys?: string[] | null,
  provider?: string | null,
  credentials?: ProviderCredentials[] | null,
): Promise<ParseResponse> {
  return postJSON<ParseResponse>("/api/trip/parse", {
    raw_text: rawText,
    preferences: preferences ?? null,
    credentials: credentials ?? null,
    api_keys: apiKeys ?? null,
    provider: provider ?? null,
  });
}

/** Stage 3: send a chat message + current itinerary, get an updated itinerary. */
export function agentInteract(
  tripData: TripData,
  userMessage: string,
  preferences?: string | null,
  apiKeys?: string[] | null,
  provider?: string | null,
  credentials?: ProviderCredentials[] | null,
): Promise<AgentResponse> {
  return postJSON<AgentResponse>("/api/trip/agent", {
    trip_data: tripData,
    user_message: userMessage,
    preferences: preferences ?? null,
    credentials: credentials ?? null,
    api_keys: apiKeys ?? null,
    provider: provider ?? null,
  });
}

/** Stage 4: generate rich media (TTS podcasts) for flagged activities. */
export function generateMedia(tripData: TripData): Promise<GenerateMediaResponse> {
  return postJSON<GenerateMediaResponse>("/api/trip/generate-media", {
    trip_data: tripData,
  });
}

export interface EnhanceResponse {
  trip_data: TripData;
}

/** Stage 2: fills in the optional extras (directions, prices, podcast briefs, links) the user opted into. */
export function enhanceTrip(
  tripData: TripData,
  options: EnhanceOptions,
  apiKeys?: string[] | null,
  provider?: string | null,
  credentials?: ProviderCredentials[] | null,
): Promise<EnhanceResponse> {
  return postJSON<EnhanceResponse>("/api/trip/enhance", {
    trip_data: tripData,
    options,
    credentials: credentials ?? null,
    api_keys: apiKeys ?? null,
    provider: provider ?? null,
  });
}
