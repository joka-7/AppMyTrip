import { useCallback, useState, type Dispatch, type SetStateAction } from "react";
import type { ChecklistItem, TripData } from "../api";
import { enhanceTrip } from "../api";
import { translate } from "../i18n/store";
import { getAllCredentials, getApiKeys, getApiProvider } from "../services/apiKey";
import { newActivityId } from "../services/id";

type TripUpdater = Dispatch<SetStateAction<TripData>>;

/**
 * Merges suggestions into an existing list by text rather than replacing it.
 *
 * The model is asked to copy existing items through, but it can rewrite or drop
 * ids on the way — matching on text means a suggestion round can only ever add
 * to what the user already wrote, never lose it, and never double up an item
 * they'd already added themselves.
 */
function mergeSuggestions(existing: ChecklistItem[], suggested: ChecklistItem[]): ChecklistItem[] {
  const seen = new Set(existing.map((item) => item.text.trim().toLowerCase()));
  const additions: ChecklistItem[] = [];
  for (const item of suggested) {
    const text = item.text.trim();
    const key = text.toLowerCase();
    if (!text || seen.has(key)) continue;
    seen.add(key);
    // A locally-minted id, so ticks (which key off the id) stay stable even if a
    // later suggestion round returns the same item with a different one.
    additions.push({ id: newActivityId(), text });
  }
  return additions.length ? [...existing, ...additions] : existing;
}

/**
 * Asks the backend to fill the packing checklists, reusing the Stage-2 enhance
 * endpoint rather than adding an endpoint just for this.
 */
export function useChecklistSuggest(trip: TripData, setTrip: TripUpdater) {
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const suggest = useCallback(async () => {
    setIsSuggesting(true);
    setError(null);
    try {
      const res = await enhanceTrip(
        trip,
        { packing: true },
        getApiKeys(),
        getApiProvider(),
        getAllCredentials(),
      );
      const next = res.trip_data;
      setTrip((prev) => ({
        ...prev,
        checklist: mergeSuggestions(prev.checklist ?? [], next.checklist ?? []),
        days: prev.days.map((day) => {
          const match = next.days.find((d) => d.dayNum === day.dayNum);
          if (!match?.checklist?.length) return day;
          return { ...day, checklist: mergeSuggestions(day.checklist ?? [], match.checklist) };
        }),
      }));
    } catch (err) {
      console.error("Failed to suggest checklist items:", err);
      setError(translate("checklist.suggestFailed"));
    } finally {
      setIsSuggesting(false);
    }
  }, [trip, setTrip]);

  return { suggest, isSuggesting, error };
}
