// Builders for external Google Maps deep links opened from the map view.
//
// These intentionally open the real Google Maps app/site (rather than needing a
// paid tile embed) so users get turn-by-turn directions, travel times, reviews
// and hours for free, in their own device/account language.
//
// IMPORTANT: every link below is built from exact `lat,lng` coordinates, never
// the activity's title text. Google's `?api=1&query=` (search) and
// origin/destination/waypoints (directions) parameters accept a place name,
// but resolve it as a literal text search — with no way to bias it toward a
// specific location. Most itinerary titles aren't real, uniquely-named Google
// listings ("Breakfast", "Check-in", a generic "Beach" or "Market", a name
// that also exists in another city), so a name-based link routinely finds
// nothing at all, or the wrong place elsewhere, and silently opens a map with
// no pin. Coordinates always resolve to the exact point, so a pin always
// shows up — the only tradeoff is losing the named listing's reviews/hours
// when the title happens to match a real business.

import type { Activity } from "../api";

function coordString(act: Activity): string {
  const { lat, lng } = act.map_coordinates!;
  return `${lat},${lng}`;
}

/** Link to a single place, pinned at its exact coordinates. */
export function googleMapsPlaceUrl(act: Activity): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", coordString(act));
  return url.toString();
}

/**
 * Directions through the day's stops in order, as exact coordinates so every
 * stop reliably gets a pin. Google's own directions UI still letters the
 * stops A, B, C, D in route order, matching the in-app map labels.
 */
export function googleMapsDirectionsUrl(coordActs: Activity[]): string {
  const points = coordActs.map((act) => coordString(act));
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", points[0]);
  url.searchParams.set("destination", points[points.length - 1]);
  if (points.length > 2) {
    url.searchParams.set("waypoints", points.slice(1, -1).join("|"));
  }
  url.searchParams.set("travelmode", "walking");
  return url.toString();
}
