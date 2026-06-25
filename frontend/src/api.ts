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
  is_kosher?: boolean | null;
  hasPodcast?: boolean;
  podcast_url?: string | null;
  map_coordinates?: { lat: number; lng: number } | null;
}

export interface TripDay {
  dayNum: number;
  activities: Activity[];
}

export interface TripData {
  title: string;
  dates: string;
  days: TripDay[];
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

async function postJSON<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`API ${path} failed (${res.status}): ${detail}`);
  }
  return (await res.json()) as T;
}

/** Stage 1: parse free trip text into a structured itinerary. */
export function parseTrip(
  rawText: string,
  preferences?: string | null,
  apiKey?: string | null,
  provider?: string | null,
): Promise<ParseResponse> {
  return postJSON<ParseResponse>("/api/trip/parse", {
    raw_text: rawText,
    preferences: preferences ?? null,
    api_key: apiKey ?? null,
    provider: provider ?? null,
  });
}

/** Stage 3: send a chat message + current itinerary, get an updated itinerary. */
export function agentInteract(
  tripData: TripData,
  userMessage: string,
  preferences?: string | null,
  apiKey?: string | null,
  provider?: string | null,
): Promise<AgentResponse> {
  return postJSON<AgentResponse>("/api/trip/agent", {
    trip_data: tripData,
    user_message: userMessage,
    preferences: preferences ?? null,
    api_key: apiKey ?? null,
    provider: provider ?? null,
  });
}

/** Stage 4: generate rich media (TTS podcasts) for flagged activities. */
export function generateMedia(tripData: TripData): Promise<GenerateMediaResponse> {
  return postJSON<GenerateMediaResponse>("/api/trip/generate-media", {
    trip_data: tripData,
    user_message: "",
  });
}
