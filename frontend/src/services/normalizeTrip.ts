import type { TripData } from "../api";
import { tripStartWeekdayIndex } from "./hebrewDate";
import { newActivityId } from "./id";

/**
 * Returns a trip in which every activity has a unique, non-empty `id`.
 *
 * New trips get their ids from the parser, but trip JSON loaded from an older
 * export, the cloud, or a hand-edited file can omit them (or repeat them).
 * Without unique ids the map's A/B/C order badges collapse (all stops resolve
 * to the same letter), Leaflet marker keys collide, and per-activity edits —
 * which target an activity by id — misfire. Normalizing on the way in fixes all
 * three at once.
 */
export function ensureActivityIds(trip: TripData): TripData {
  const seen = new Set<string>();
  return {
    ...trip,
    days: (trip.days ?? []).map((day) => ({
      ...day,
      activities: (day.activities ?? []).map((act) => {
        const id = act.id && !seen.has(act.id) ? act.id : newActivityId();
        seen.add(id);
        return act.id === id ? act : { ...act, id };
      }),
    })),
  };
}

/** Fills `startWeekday` from `dates` when missing — keeps tab labels on import/save. */
export function ensureStartWeekday(trip: TripData): TripData {
  if (trip.startWeekday != null && trip.startWeekday >= 0 && trip.startWeekday <= 6) {
    return trip;
  }
  const computed = tripStartWeekdayIndex(trip.dates ?? "");
  if (computed == null) return trip;
  return { ...trip, startWeekday: computed };
}

/** Normalize a trip loaded from JSON, Firestore, or the API before editing. */
export function normalizeTripForLoad(trip: TripData): TripData {
  return ensureStartWeekday(ensureActivityIds(trip));
}
