// Building the link (and the message) a trip gets shared with.
//
// A link is `?shared=<shareId>#k=<key>`. The key sits in the #fragment, which
// browsers never send to any server, so neither the host's logs nor the
// database ever see it. Nothing readable about the trip goes in the URL: the
// title is in the message text instead (see shareMessage), which the sender
// chooses to send.

import type { TripData } from "../api";

/**
 * The URL to share for a trip.
 *
 * Built from origin + pathname rather than the current href on purpose: href
 * carries whatever query the current page happens to have, so sharing a new
 * link from an already-open "?shared=..." page used to drag the old parameters
 * along with it.
 */
export function buildShareUrl(shareId: string, key: string): string {
  const url = new URL(window.location.pathname, window.location.origin);
  url.searchParams.set("shared", shareId);
  url.hash = new URLSearchParams({ k: key }).toString();
  return url.toString();
}

/** The message that goes out with the link — the trip's name and dates, then the URL. */
export function shareMessage(trip: Pick<TripData, "title" | "dates">, url: string): string {
  const heading = [trip.title.trim(), trip.dates.trim()].filter(Boolean).join(" — ");
  return heading ? `${heading}\n${url}` : url;
}
