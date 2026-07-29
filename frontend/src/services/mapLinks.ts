// Builders for external Google Maps deep links opened from the map view.
//
// These intentionally open the real Google Maps app/site (rather than needing a
// paid tile embed) so users get turn-by-turn directions, travel times, reviews
// and hours for free, in their own device/account language.
//
// IMPORTANT: always pass exact coordinates ("lat,lng"), never a place name —
// neither as the `?api=1&query=` value nor via the `/maps/search/<name>/@<lat>,
// <lng>,<zoom>z` path form. Both were tried (see git history) and both let
// Google's text search win over the coordinate bias for a common/ambiguous
// name (a chain, a generic "Beach"/"Market", a name that also exists in
// another city), silently opening a same-named place miles from the activity's
// real spot. A bare coordinate always resolves to the exact point — no drift,
// even though the pin shows as a plain location instead of a named listing.

import type { Activity } from "../api";

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

/**
 * Link to a single place, as its exact coordinates — see the module note above
 * for why a name (even coordinate-biased) isn't used: Google can still resolve
 * it to a different, same-named place instead of the activity's real spot.
 */
export function googleMapsPlaceUrl(act: Activity): string {
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
export function googleMapsDirectionsUrl(coordActs: Activity[]): string {
  const points = coordActs.map((act) => directionsStop(act));
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
