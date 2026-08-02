import { useCallback, type Dispatch, type SetStateAction } from "react";
import type { Activity, ChecklistItem, EnhanceOptions, TripData, TripDay } from "../api";
import type { ChecklistTarget } from "../components/ChecklistPanel";
import { tripStartWeekdayIndex } from "../services/hebrewDate";
import { newActivityId } from "../services/id";
import { normalizeTripForLoad } from "../services/normalizeTrip";
import { enhanceActivities, mergeEnhancedActivities } from "../services/tripEnhance";

type TripUpdater = Dispatch<SetStateAction<TripData>>;

/** Keeps `dayNum` equal to `index + 1` after an add/delete/reorder — day tabs,
 * the print view, and `icsExport`'s calendar-date math all key off `dayNum`
 * being a gapless 1..N sequence matching array order. */
function renumberDays(days: TripDay[]): TripDay[] {
  return days.map((d, idx) => (d.dayNum === idx + 1 ? d : { ...d, dayNum: idx + 1 }));
}

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

  const handleAddDay = useCallback(() => {
    setTrip((prev) => ({
      ...prev,
      days: [...prev.days, { dayNum: prev.days.length + 1, activities: [] }],
    }));
  }, [setTrip]);

  const handleDeleteDay = useCallback(
    (dayIndex: number) => {
      setTrip((prev) => ({
        ...prev,
        days: renumberDays(prev.days.filter((_, idx) => idx !== dayIndex)),
      }));
    },
    [setTrip],
  );

  /** Moves the day at `fromIndex` to `toIndex`, shifting the days in between —
   * covers "move earlier/later" (adjacent index) and "move to start/end"
   * (index 0 / last index) with one primitive. */
  const handleMoveDay = useCallback(
    (fromIndex: number, toIndex: number) => {
      setTrip((prev) => {
        if (
          fromIndex === toIndex ||
          fromIndex < 0 ||
          fromIndex >= prev.days.length ||
          toIndex < 0 ||
          toIndex >= prev.days.length
        ) {
          return prev;
        }
        const days = [...prev.days];
        const [moved] = days.splice(fromIndex, 1);
        days.splice(toIndex, 0, moved);
        return { ...prev, days: renumberDays(days) };
      });
    },
    [setTrip],
  );

  // Checklist edits. `target` is a day index, or null for the trip-wide list —
  // the two live on different objects (TripDay.checklist / TripData.checklist)
  // but are the same edit from the user's point of view, so one set of handlers
  // covers both rather than duplicating three functions per scope.
  const patchChecklist = useCallback(
    (target: ChecklistTarget, update: (items: ChecklistItem[]) => ChecklistItem[]) => {
      setTrip((prev) => {
        if (target === null) return { ...prev, checklist: update(prev.checklist ?? []) };
        return {
          ...prev,
          days: prev.days.map((d, idx) =>
            idx !== target ? d : { ...d, checklist: update(d.checklist ?? []) },
          ),
        };
      });
    },
    [setTrip],
  );

  const handleAddChecklistItem = useCallback(
    (target: ChecklistTarget, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      patchChecklist(target, (items) => [...items, { id: newActivityId(), text: trimmed }]);
    },
    [patchChecklist],
  );

  const handleUpdateChecklistItem = useCallback(
    (target: ChecklistTarget, itemId: string, text: string) => {
      const trimmed = text.trim();
      if (!trimmed) return;
      patchChecklist(target, (items) =>
        items.map((item) => (item.id === itemId ? { ...item, text: trimmed } : item)),
      );
    },
    [patchChecklist],
  );

  const handleDeleteChecklistItem = useCallback(
    (target: ChecklistTarget, itemId: string) => {
      patchChecklist(target, (items) => items.filter((item) => item.id !== itemId));
    },
    [patchChecklist],
  );

  return {
    handleUpdateActivity,
    handleAddActivity,
    handleDeleteActivity,
    handleUpdateTrip,
    handleAddDay,
    handleDeleteDay,
    handleMoveDay,
    handleAddChecklistItem,
    handleUpdateChecklistItem,
    handleDeleteChecklistItem,
  };
}
