import { useEffect, useState } from "react";
import type { TranslationKey } from "../i18n/useI18n";

/**
 * Cycles through status copy while a long-running operation is active so the
 * UI can show stepwise progress instead of a single frozen spinner label.
 */
export function useRotatingHint(
  active: boolean,
  hints: readonly TranslationKey[],
  intervalMs = 4000,
): TranslationKey | null {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!active || hints.length === 0) {
      setIndex(0);
      return;
    }
    const id = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % hints.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [active, hints, intervalMs]);

  if (!active || hints.length === 0) return null;
  return hints[index] ?? null;
}
