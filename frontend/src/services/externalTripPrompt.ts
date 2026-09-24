// The no-key escape hatch for Stage 1: this app calls its own backend, which
// calls the LLM server-side (see services/apiKey.ts) — there's no browser-to-
// provider BYOK call to fall back to the way modeldispatcher-browser-agent's
// own escape hatch works. Instead, this builds the exact same prompt the
// backend would send (see backend/services/llm.py's `parse_trip_text`), so
// the user can hand it to a free AI chat app themselves and paste the JSON
// reply back in — the app then continues exactly as if the backend had
// answered. Duplicated by hand from the backend; keep both in sync if either
// changes. `tripDataSchema.json` is a literal dump of the backend's
// `TripData.model_json_schema()`, not hand-written, so it can't drift on its
// own — only a real schema change on either side needs re-syncing.

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
