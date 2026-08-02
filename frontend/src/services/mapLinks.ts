// Builders for external map deep links opened from the itinerary and map views.
//
// These intentionally open the real Google Maps / Waze app or site (rather than
// needing a paid tile embed) so users get turn-by-turn directions, travel times,
// reviews and hours for free, in their own device/account language.
//
// IMPORTANT: when building a link from coordinates, always pass exact
// coordinates ("lat,lng"), never a place name — neither as the `?api=1&query=`
// value nor via the `/maps/search/<name>/@<lat>,<lng>,<zoom>z` path form. Both
// were tried (see git history) and both let Google's text search win over the
// coordinate bias for a common/ambiguous name (a chain, a generic
// "Beach"/"Market", a name that also exists in another city), silently opening a
// same-named place miles from the activity's real spot. A bare coordinate always
// resolves to the exact point — no drift, even though the pin shows as a plain
// location instead of a named listing.
//
// The one exception is `Activity.map_url`: a link the *user* pasted, because the
// AI's coordinates landed somewhere wrong. That's a deliberate human override
// and always wins over the generated link — see googleMapsPlaceUrl.

import type { Activity, TravelMode } from "../api";
import { safeUrl } from "./safeUrl";

// Unlike the search action (below), the directions action has no path-form
// biasing syntax — origin/destination/waypoints are always resolved as a
// literal text query. A plain place name is therefore ambiguous whenever the
// same name exists elsewhere (a generic "Beach", "Market", a chain restaurant,
// a name that also exists in another city): Google can silently resolve it to
// the wrong location, which drops the pin/route far from where the activity
// actually is or fails to draw a route at all. Passing "lat,lng" always
// resolves to the exact point, so every stop always gets a pin.
function directionsStop(act: Activity): string {
  const { lat, lng } = act.map_coordinates!;
  return `${lat},${lng}`;
}

/** A coordinate pair only counts if it's actually on the globe — guards against
 * matching some unrelated number pair elsewhere in a long Maps URL. */
function validCoords(lat: number, lng: number): { lat: number; lng: number } | null {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lat, lng };
}

// The shapes Google actually emits, most-precise first. `!3d<lat>!4d<lng>` is
// the resolved place's own coordinates and is more accurate than the `@` viewport
// centre, so it's tried before it.
const COORD_PATTERNS: RegExp[] = [
  /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
  /[?&](?:q|query|daddr|ll|sll|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
];

/**
 * Pulls the coordinates out of a pasted Google Maps URL, so overriding the link
 * also repairs the in-app pin and the day-route link (which can only be built
 * from coordinates, never from an arbitrary URL).
 *
 * Returns null for shortened links (maps.app.goo.gl / goo.gl/maps): they carry
 * no coordinates and can only be resolved by following the redirect, which the
 * browser can't do cross-origin. Those still work fine as a link override.
 */
export function parseMapUrlCoords(url: string | null | undefined): {
  lat: number;
  lng: number;
} | null {
  if (!url) return null;
  const decoded = (() => {
    try {
      return decodeURIComponent(url);
    } catch {
      return url;
    }
  })();
  for (const pattern of COORD_PATTERNS) {
    const match = decoded.match(pattern);
    if (!match) continue;
    const coords = validCoords(Number(match[1]), Number(match[2]));
    if (coords) return coords;
  }
  return null;
}

/**
 * A usable `map_url` override, or null.
 *
 * Stricter than `safeUrl` alone: that resolves relative values against our own
 * origin, so a typo or a pasted fragment ("maps.google.com/…", or any stray
 * text) would pass as a same-origin link and navigate the user back into the
 * app instead of out to a map. An override is only meaningful as an absolute
 * http(s) URL, so anything else falls back to the generated coordinate link.
 */
export function mapUrlOverride(act: Activity): string | null {
  const url = safeUrl(act.map_url);
  if (!url) return null;
  return /^https?:\/\//i.test(url.trim()) ? url.trim() : null;
}

/** True when we can build any kind of map link for this activity. */
export function hasMapLink(act: Activity): boolean {
  return Boolean(mapUrlOverride(act) || act.map_coordinates);
}

/**
 * Link to a single place. A user-pasted `map_url` wins; otherwise the activity's
 * exact coordinates — see the module note above for why a name (even
 * coordinate-biased) isn't used.
 */
export function googleMapsPlaceUrl(act: Activity): string {
  const override = mapUrlOverride(act);
  if (override) return override;
  const { lat, lng } = act.map_coordinates!;
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", `${lat},${lng}`);
  return url.toString();
}

/**
 * Directions through the day's stops in order, as exact coordinates so every
 * stop reliably gets a pin (see directionsStop above). Google's own directions
 * UI still letters the stops A, B, C, D in route order, matching the in-app
 * map labels.
 */
export function googleMapsDirectionsUrl(coordActs: Activity[], mode: TravelMode): string {
  const points = coordActs.map((act) => directionsStop(act));
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", points[0]);
  url.searchParams.set("destination", points[points.length - 1]);
  if (points.length > 2) {
    url.searchParams.set("waypoints", points.slice(1, -1).join("|"));
  }
  url.searchParams.set("travelmode", mode);
  return url.toString();
}

/** Directions for a single leg — how to get from the previous stop to this one. */
export function googleMapsLegUrl(from: Activity, to: Activity, mode: TravelMode): string {
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", directionsStop(from));
  url.searchParams.set("destination", directionsStop(to));
  url.searchParams.set("travelmode", mode);
  return url.toString();
}

/**
 * Waze navigation to a single stop. Waze is a driving navigator with no
 * multi-stop URL form, so this is only offered for driving legs and never for a
 * whole-day route. `navigate=yes` starts guidance instead of just showing the
 * pin.
 */
export function wazeUrl(act: Activity): string {
  const { lat, lng } = act.map_coordinates!;
  const url = new URL("https://www.waze.com/ul");
  url.searchParams.set("ll", `${lat},${lng}`);
  url.searchParams.set("navigate", "yes");
  return url.toString();
}
