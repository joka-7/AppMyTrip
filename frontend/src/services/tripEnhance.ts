import type { Activity, EnhanceOptions, TripData } from "../api";
import { enhanceTrip } from "../api";
import { getAllCredentials, getApiKeys, getApiProvider } from "./apiKey";

/** Used when Step 2 was skipped (or on the shared-trip viewer, which has no Step 2). */
export const ALL_ENHANCE_OPTIONS: EnhanceOptions = {
  directions_car: true,
  directions_transit: true,
  prices: true,
  podcast: true,
  links: true,
};

/** Remembered Step 2 selections, or every extra if none were ever chosen. */
export function effectiveEnhanceOptions(options: EnhanceOptions): EnhanceOptions {
  return Object.values(options).some(Boolean) ? options : ALL_ENHANCE_OPTIONS;
}

/** Activities present in `after` but not in `before`, by id. */
export function findNewActivities(before: TripData, after: TripData): Activity[] {
  const priorIds = new Set(before.days.flatMap((d) => d.activities.map((a) => a.id)));
  return after.days.flatMap((d) => d.activities).filter((a) => !priorIds.has(a.id));
}

/**
 * Sends newly-added activities through /api/trip/enhance. Returns an id →
 * Activity map (empty on failure) for the caller to merge into current state.
 */
export async function enhanceActivities(
  activities: Activity[],
  tripMeta: Pick<TripData, "title" | "dates" | "language">,
  options: EnhanceOptions,
): Promise<Map<string, Activity>> {
  if (activities.length === 0) return new Map();
  try {
    const res = await enhanceTrip(
      {
        title: tripMeta.title,
        dates: tripMeta.dates,
        language: tripMeta.language,
        days: [{ dayNum: 1, activities }],
      },
      options,
      getApiKeys(),
      getApiProvider(),
      getAllCredentials(),
    );
    return new Map(res.trip_data.days.flatMap((d) => d.activities).map((a) => [a.id, a]));
  } catch (err) {
    console.error("Failed to enhance newly added activities:", err);
    return new Map();
  }
}

/** Merges an id → Activity map into a trip wherever ids match. */
export function mergeEnhancedActivities(
  trip: TripData,
  enhancedById: Map<string, Activity>,
): TripData {
  if (enhancedById.size === 0) return trip;
  return {
    ...trip,
    days: trip.days.map((d) => ({
      ...d,
      activities: d.activities.map((a) => enhancedById.get(a.id) ?? a),
    })),
  };
}
