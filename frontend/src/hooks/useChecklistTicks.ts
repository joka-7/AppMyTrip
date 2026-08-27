import { useCallback, useEffect, useState } from "react";

const STORAGE_PREFIX = "appmytrip.checklistTicks.";

/**
 * Which checklist items this viewer has ticked off.
 *
 * Deliberately per-device rather than part of the trip: a shared trip link is
 * read-only for most of the people it's sent to, and everyone packs their own
 * bag. Keeping ticks in localStorage means a participant can use the list
 * without write access, and one person ticking "passport" doesn't tell the rest
 * of the group they're done.
 *
 * `scope` separates the builder's own trip from each shared link, so two trips
 * open in the same browser don't share tick state.
 */
export function useChecklistTicks(scope: string | undefined) {
  const storageKey = `${STORAGE_PREFIX}${scope ?? "builder"}`;
  const [ticked, setTicked] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Storage can throw (Safari private mode) or hold something another version
    // wrote — a broken tick list should never take the tab down with it.
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed: unknown = raw ? JSON.parse(raw) : [];
      setTicked(new Set(Array.isArray(parsed) ? parsed.filter((v) => typeof v === "string") : []));
    } catch {
      setTicked(new Set());
    }
  }, [storageKey]);

  const toggle = useCallback(
    (itemId: string) => {
      setTicked((prev) => {
        const next = new Set(prev);
        if (!next.delete(itemId)) next.add(itemId);
        try {
          localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // Ticks are a convenience; losing persistence isn't worth an error.
        }
        return next;
      });
    },
    [storageKey],
  );

  return { ticked, toggle };
}
