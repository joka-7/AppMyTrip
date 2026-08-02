// Building the link (and the message) a trip gets shared with.
//
// A shared link used to be a bare "?shared=<id>" — pasted into WhatsApp it shows
// as an opaque URL with nothing identifying the trip, because a static SPA
// serves the same Open Graph tags for every link and chat apps only render what
// the crawler sees. Putting a readable slug in the URL itself is what makes the
// trip's name visible wherever the link lands, no server rendering involved.

import type { TripData } from "../api";

/** Longest slug we'll put in a URL — enough to read, short enough not to wrap. */
const MAX_SLUG_LENGTH = 60;

/**
 * A readable, URL-safe fragment of the trip's title.
 *
 * Hebrew (and any other non-Latin) letters are kept as-is: they survive
 * `URLSearchParams` percent-encoding and chat apps and browsers display them
 * decoded, which is the entire point. Only characters that would make the link
 * awkward to read or paste are dropped.
 */
export function tripSlug(title: string): string {
  const slug = title
    .trim()
    .replace(/["'`]/g, "")
    // Anything that isn't a letter, number or mark becomes a separator.
    .replace(/[^\p{L}\p{N}\p{M}]+/gu, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG_LENGTH)
    // A trailing separator left by the slice reads like a truncation artefact.
    .replace(/-+$/g, "");
  return slug;
}

/**
 * The URL to share for a trip.
 *
 * Built from origin + pathname rather than the current href on purpose: href
 * carries whatever query the current page happens to have, so sharing a new
 * link from an already-open "?shared=..." page used to drag the old parameters
 * along with it.
 */
export function buildShareUrl(tripId: string, title: string): string {
  const url = new URL(window.location.pathname, window.location.origin);
  // Slug first, so the trip's name is visible before the opaque id even when a
  // chat app truncates the middle of a long link.
  const slug = tripSlug(title);
  if (slug) url.searchParams.set("trip", slug);
  url.searchParams.set("shared", tripId);
  return url.toString();
}

/** The message that goes out with the link — the trip's name and dates, then the URL. */
export function shareMessage(trip: Pick<TripData, "title" | "dates">, url: string): string {
  const heading = [trip.title.trim(), trip.dates.trim()].filter(Boolean).join(" — ");
  return heading ? `${heading}\n${url}` : url;
}
