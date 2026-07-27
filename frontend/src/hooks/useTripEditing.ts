import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Activity, EnhanceOptions, TripData } from "../api";
import { tripStartWeekdayIndex } from "../services/hebrewDate";
import { normalizeTripForLoad } from "../services/normalizeTrip";
import { enhanceActivities, mergeEnhancedActivities } from "../services/tripEnhance";

type TripUpdater = Dispatch<SetStateAction<TripData>>;

/**
 * Shared activity/trip mutation handlers used by both the builder preview and
 * the shared-trip viewer — keeps the enhance-on-add race-safe pattern in one
 * place instead of duplicating ~100 lines across App.tsx.
 */
export function useTripEditing(setTrip: TripUpdater, enhanceOptions: EnhanceOptions) {
  const handleUpdateActivity = useCallback(
    (dayIndex: number, activityId: string, patch: Partial<Activity>) => {
      setTrip((prev) => ({
        ...prev,
        days: prev.days.map((d, idx) =>
          idx !== dayIndex
            ? d
            : {
                ...d,
                activities: d.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a)),
              },
        ),
      }));
    },
    [setTrip],
  );

  const handleAddActivity = useCallback(
    async (dayIndex: number, activity: Activity) => {
      let priorTrip: TripData | null = null;
      // Applied immediately via a functional update — safe against whatever
      // else happens to the trip while the enhancement call below is in flight.
      setTrip((prev) => {
        priorTrip = prev;
        return normalizeTripForLoad({
          ...prev,
          days: prev.days.map((d, idx) =>
            idx !== dayIndex ? d : { ...d, activities: [...d.activities, activity] },
          ),
        });
      });
      if (!priorTrip) return;
      const enhancedById = await enhanceActivities([activity], priorTrip, enhanceOptions);
      if (enhancedById.size === 0) return;
      // Patches by id into whatever the trip looks like *now* — not a snapshot
      // captured before the await — so edits made in the meantime survive.
      setTrip((prev) => normalizeTripForLoad(mergeEnhancedActivities(prev, enhancedById)));
    },
    [setTrip, enhanceOptions],
  );

  const handleDeleteActivity = useCallback(
    (dayIndex: number, activityId: string) => {
      setTrip((prev) => ({
        ...prev,
        days: prev.days.map((d, idx) =>
          idx !== dayIndex
            ? d
            : { ...d, activities: d.activities.filter((a) => a.id !== activityId) },
        ),
      }));
    },
    [setTrip],
  );

  const handleUpdateTrip = useCallback(
    (patch: Partial<Pick<TripData, "title" | "dates" | "photo_album_url">>) => {
      setTrip((prev) => {
        const next = { ...prev, ...patch };
        if (patch.dates !== undefined) {
          next.startWeekday = tripStartWeekdayIndex(patch.dates);
        }
        return next;
      });
    },
    [setTrip],
  );

  return {
    handleUpdateActivity,
    handleAddActivity,
    handleDeleteActivity,
    handleUpdateTrip,
  };
}
