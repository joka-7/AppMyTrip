// The app's AI steps: parse, enhance and chat.
//
// They run on this device: each call goes from the browser straight to the
// user's own AI provider with the user's own key (see services/tripAi.ts).
// There is no AppMyTrip server in between.
import { complete } from "modeldispatcher-browser-agent";
import { agentConfigFrom, createTripAi, type ProviderKeys } from "./services/tripAi";

export { ApiError } from "./services/tripAi";

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

export interface ParseResponse {
  trip_data: TripData;
  initial_agent_message: string | null;
}

export interface AgentResponse {
  trip_data: TripData;
  agent_reply: string;
}

export interface EnhanceResponse {
  trip_data: TripData;
}

const tripAi = createTripAi({ complete });

/**
 * Stage 1: parse free trip text into a structured itinerary.
 *
 * Args:
 *   credentials: every saved provider and its keys, tried in order.
 */
export async function parseTrip(
  rawText: string,
  preferences: string | null,
  credentials: readonly ProviderKeys[],
): Promise<ParseResponse> {
  const trip = await tripAi.parseTripText(rawText, preferences, agentConfigFrom(credentials));
  return { trip_data: trip, initial_agent_message: null };
}

/** Stage 3: send a chat message + current itinerary, get an updated itinerary. */
export async function agentInteract(
  tripData: TripData,
  userMessage: string,
  preferences: string | null,
  credentials: readonly ProviderKeys[],
): Promise<AgentResponse> {
  const { trip, reply } = await tripAi.agentTurn(
    tripData,
    userMessage,
    preferences,
    agentConfigFrom(credentials),
  );
  return { trip_data: trip, agent_reply: reply };
}

/** Stage 2: fills in the optional extras (directions, prices, podcast briefs, links) the user opted into. */
export async function enhanceTrip(
  tripData: TripData,
  options: EnhanceOptions,
  credentials: readonly ProviderKeys[],
): Promise<EnhanceResponse> {
  const trip = await tripAi.enhanceTrip(tripData, options, agentConfigFrom(credentials));
  return { trip_data: trip };
}
