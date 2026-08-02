// How you get from one stop to the next.
//
// The itinerary model has no notion of a "leg" — activities are just an ordered
// list per day — so the mode is derived from the pair (previous stop, this
// stop). Deriving it rather than requiring it means every trip, including ones
// that never went through the optional enhance step, gets sensible directions
// links instead of the flat "walking" that used to be hardcoded for everything.
import { Bike, Car, Footprints, TrainFront } from "lucide-react";
import type { Activity, TravelMode } from "../api";
import type { TranslationKey } from "../i18n/useI18n";

type Coordinates = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km. Straight-line, so it under-reads real travel
 * distance — the thresholds below are chosen with that in mind. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Words that mean the activity *is* the walk — a trail, a trek, a walking tour.
// Those are on foot however far apart the endpoints are, so this outranks the
// distance check below. Matched case-insensitively against title + desc.
const ON_FOOT_KEYWORDS = [
  // Hebrew
  "טיול רגלי",
  "מסלול הליכה",
  "הליכה",
  "מסלול",
  "טרק",
  "שביל",
  // English
  "hike",
  "hiking",
  "trek",
  "trail",
  "walking tour",
  "on foot",
  // French
  "randonnée",
  "randonnee",
  "sentier",
  "à pied",
];

// Straight-line distance cutoffs, in km. Deliberately conservative: a leg only
// counts as walkable when it's genuinely short, and anything past cycling range
// falls through to driving (which is also the only mode Waze can take).
const WALKING_MAX_KM = 1.2;
const CYCLING_MAX_KM = 6;

function mentionsOnFoot(act: Activity): boolean {
  const haystack = `${act.title} ${act.desc}`.toLowerCase();
  return ON_FOOT_KEYWORDS.some((word) => haystack.includes(word));
}

/**
 * Works out how the traveller reaches `act` from `prev`, in precedence order:
 * an explicit override, then the activity being a hike in its own right, then
 * an explicit transport leg, then straight-line distance.
 *
 * Falls back to driving when either stop has no coordinates: it's the mode that
 * covers the most ground, and picking it keeps a usable (Waze-capable)
 * navigation link rather than none.
 */
export function inferTravelMode(prev: Activity | undefined, act: Activity): TravelMode {
  if (act.travel_mode) return act.travel_mode;
  if (mentionsOnFoot(act)) return "walking";
  if (act.type === "transport") return "driving";

  const from = prev?.map_coordinates;
  const to = act.map_coordinates;
  if (!from || !to) return "driving";

  const km = haversineKm(from, to);
  if (km <= WALKING_MAX_KM) return "walking";
  if (km <= CYCLING_MAX_KM) return "bicycling";
  return "driving";
}

// Ranked by how much ground the mode covers, so a day's route can pick the most
// demanding leg rather than the first one.
const MODE_WEIGHT: Record<TravelMode, number> = {
  walking: 0,
  bicycling: 1,
  transit: 2,
  driving: 3,
};

/** The mode a whole day's route should open in — the most demanding leg wins, so
 * a day that involves any driving doesn't open as a walking route. */
export function dominantTravelMode(activities: Activity[]): TravelMode {
  let dominant: TravelMode = "walking";
  // From index 1: there is no leg *into* the first stop of a day, and asking for
  // one would hit inferTravelMode's no-predecessor "driving" fallback and drag
  // every day to driving.
  activities.slice(1).forEach((act, idx) => {
    const mode = inferTravelMode(activities[idx], act);
    if (MODE_WEIGHT[mode] > MODE_WEIGHT[dominant]) dominant = mode;
  });
  return dominant;
}

export const TRAVEL_MODES: TravelMode[] = ["driving", "transit", "bicycling", "walking"];

export const TRAVEL_MODE_LABEL_KEYS: Record<TravelMode, TranslationKey> = {
  driving: "travelMode.driving",
  transit: "travelMode.transit",
  bicycling: "travelMode.bicycling",
  walking: "travelMode.walking",
};

// Declared once here rather than per-component: the activity-type icon maps are
// already copied across ItineraryList/MapView/PriceSummary, and that pattern
// shouldn't spread any further.
export const TRAVEL_MODE_ICONS: Record<TravelMode, typeof Car> = {
  driving: Car,
  transit: TrainFront,
  bicycling: Bike,
  walking: Footprints,
};
