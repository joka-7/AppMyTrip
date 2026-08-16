// How you get from one stop to the next.
//
// A single day is routinely mixed — drive to the trailhead, hike, bus back,
// walk to dinner — so the mode belongs to the *leg* between two stops, never to
// the day. There is no leg into a day's first stop, which is why the functions
// here return null for it rather than guessing.
//
// Inference is deliberately conservative. It only claims a mode it can actually
// justify: the activity says what it is (a hike, a bus), or the stops are close
// enough that walking is the obvious answer. Everything else is driving, which
// is both the common case and the one mode that always has a usable link.
// Cycling is never guessed from distance — an earlier version put "Cycling" on a
// restaurant 3km away, which is exactly the kind of confident nonsense this
// avoids.
import { Bike, Car, Footprints, Mountain, TrainFront } from "lucide-react";
import type { Activity, TravelMode } from "../api";
import type { TranslationKey } from "../i18n/useI18n";

type Coordinates = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

const toRadians = (deg: number): number => (deg * Math.PI) / 180;

/** Great-circle distance in km. Straight-line, so it under-reads real travel
 * distance — the threshold below is chosen with that in mind. */
export function haversineKm(a: Coordinates, b: Coordinates): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

// Matched case-insensitively against an activity's title + description. Order
// matters: an activity is checked against transit first, then hiking, then
// cycling, then plain walking — "מסלול אופניים" is a ride, not a hike.
const MODE_KEYWORDS: { mode: TravelMode; words: string[] }[] = [
  {
    mode: "transit",
    words: [
      // Hebrew
      "אוטובוס",
      "רכבת",
      "מעבורת",
      "רכבל",
      "מטרו",
      "תחבורה ציבורית",
      "שאטל",
      // English
      "bus",
      "train",
      "ferry",
      "metro",
      "subway",
      "tram",
      "shuttle",
      "cable car",
      "public transport",
      // French
      "métro",
      "metro",
      "tramway",
      "navette",
    ],
  },
  {
    mode: "hiking",
    words: [
      // Hebrew
      "טיול רגלי",
      "מסלול הליכה",
      "טרק",
      "שביל",
      "נחל",
      "הר ",
      // English
      "hike",
      "hiking",
      "trek",
      "trail",
      "summit",
      // French
      "randonnée",
      "randonnee",
      "sentier",
    ],
  },
  {
    mode: "bicycling",
    words: ["אופניים", "bike", "biking", "bicycle", "cycling", "vélo", "velo"],
  },
  {
    mode: "walking",
    words: ["הליכה", "ברגל", "walking tour", "on foot", "stroll", "à pied", "a pied"],
  },
];

// Straight-line cutoff for "obviously walkable". Deliberately the only distance
// rule: past this, driving is the safe answer, and the user (or the AI) can say
// otherwise per activity.
const WALKING_MAX_KM = 1.5;

function keywordMode(act: Activity): TravelMode | null {
  const haystack = `${act.title} ${act.desc}`.toLowerCase();
  for (const { mode, words } of MODE_KEYWORDS) {
    if (words.some((word) => haystack.includes(word))) return mode;
  }
  return null;
}

/**
 * How the traveller gets from `prev` to `act`.
 *
 * Returns null when there is no leg — the first stop of a day, which you reach
 * from wherever you slept rather than from another activity. Callers use that to
 * omit the mode chip and its navigation links entirely instead of inventing a
 * mode for a journey the itinerary doesn't describe.
 */
export function legTravelMode(prev: Activity | undefined, act: Activity): TravelMode | null {
  if (!prev) return null;
  if (act.travel_mode) return act.travel_mode;

  const byKeyword = keywordMode(act);
  if (byKeyword) return byKeyword;

  const from = prev.map_coordinates;
  const to = act.map_coordinates;
  // Without both endpoints there's no distance to reason from; driving is the
  // mode that covers any gap and always produces a usable link.
  if (!from || !to) return "driving";

  return haversineKm(from, to) <= WALKING_MAX_KM ? "walking" : "driving";
}

/** Google Maps only understands four modes; hiking is walking as far as its
 * directions are concerned, even though the app labels it separately. */
export function googleTravelMode(
  mode: TravelMode,
): "driving" | "walking" | "bicycling" | "transit" {
  return mode === "hiking" ? "walking" : mode;
}

/** Waze is a driving navigator — it has no walking, cycling or transit mode, so
 * offering it for any other leg would send people the wrong way. */
export function isDrivingMode(mode: TravelMode | null): boolean {
  return mode === "driving";
}

export const TRAVEL_MODES: TravelMode[] = ["driving", "transit", "bicycling", "walking", "hiking"];

export const TRAVEL_MODE_LABEL_KEYS: Record<TravelMode, TranslationKey> = {
  driving: "travelMode.driving",
  transit: "travelMode.transit",
  bicycling: "travelMode.bicycling",
  walking: "travelMode.walking",
  hiking: "travelMode.hiking",
};

// Declared once here rather than per-component: the activity-type icon maps are
// already copied across ItineraryList/MapView/PriceSummary, and that pattern
// shouldn't spread any further.
export const TRAVEL_MODE_ICONS: Record<TravelMode, typeof Car> = {
  driving: Car,
  transit: TrainFront,
  bicycling: Bike,
  walking: Footprints,
  hiking: Mountain,
};
