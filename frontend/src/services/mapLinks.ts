// Builders for external Google Maps deep links opened from the map view.
//
// These intentionally open the real Google Maps app/site (rather than needing a
// paid tile embed) so users get turn-by-turn directions, travel times, reviews
// and hours for free, in their own device/account language.
//
// IMPORTANT: the `?api=1&query=` search parameter accepts EITHER a place name OR
// "lat,lng" — never a "name @lat,lng" mash-up. Passing the latter makes Google
// search for that literal text and fail to resolve the place (the bug this
// module replaces). To open a *named* place biased to its exact coordinates we
// use the path form `/maps/search/<name>/@<lat>,<lng>,<zoom>z`, which Google
// resolves to the real listing nearest that point.

import type { Activity } from "../api";

const PLACE_ZOOM = 15;

/**
 * Link to a single place. Opens the named listing (with its reviews/hours)
 * centered on the activity's coordinates, so Maps resolves the right place even
 * when the name alone would be ambiguous across cities. Falls back to a bare
 * coordinate pin only when the activity has no title.
 */
export function googleMapsPlaceUrl(act: Activity): string {
  const { lat, lng } = act.map_coordinates!;
  const name = act.title.trim();
  if (!name) {
    const url = new URL("https://www.google.com/maps/search/");
    url.searchParams.set("api", "1");
    url.searchParams.set("query", `${lat},${lng}`);
    return url.toString();
  }
  return `https://www.google.com/maps/search/${encodeURIComponent(name)}/@${lat},${lng},${PLACE_ZOOM}z`;
}

/**
 * Directions through the day's stops in order. Uses exact `lat,lng` for every
 * origin/destination/waypoint (not place names) so the route always hits the
 * precise pins the user sees, instead of risking a same-named place elsewhere.
 */
export function googleMapsDirectionsUrl(coordActs: Activity[]): string {
  const points = coordActs.map((a) => `${a.map_coordinates!.lat},${a.map_coordinates!.lng}`);
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
