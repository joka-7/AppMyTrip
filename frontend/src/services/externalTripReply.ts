import type { TripData } from "../api";
import { isValidTripData } from "./tripFile";

/** Thrown when a pasted external-AI reply isn't usable JSON, or isn't
 * shaped like a trip once parsed. */
export class InvalidExternalReplyError extends Error {
  constructor() {
    super("The pasted reply isn't a valid trip.");
    this.name = "InvalidExternalReplyError";
  }
}

/** Strips a ```json ... ``` (or plain ``` ... ```) fence around the reply,
 * since most chat apps wrap a JSON answer in one even when told not to. */
function stripCodeFence(text: string): string {
  const fenced = text.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return fenced ? fenced[1] : text;
}

/** Parses and validates a pasted external-AI reply for Stage 1 (see
 * externalTripPrompt.ts) into a `TripData`. Throws `InvalidExternalReplyError`
 * for anything that isn't valid JSON shaped like a trip — the caller has no
 * other way to tell a genuine parse failure from a well-formed empty trip. */
export function parseExternalTripReply(rawReply: string): TripData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFence(rawReply.trim()));
  } catch {
    throw new InvalidExternalReplyError();
  }
  if (!isValidTripData(parsed)) {
    throw new InvalidExternalReplyError();
  }
  return parsed;
}
