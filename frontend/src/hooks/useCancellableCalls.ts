import { useCallback, useEffect, useRef } from "react";

/**
 * Hands out an AbortSignal per AI call and cancels every call still running
 * when `scope` changes (e.g. the builder moves to another step) or the
 * component unmounts, so a slow provider can't apply a stale result to a
 * screen the user has already left.
 *
 * Returns:
 *   A function that returns a fresh signal for the next call.
 */
export function useCancellableCalls(scope?: unknown): () => AbortSignal {
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    const live = controllers.current;
    return () => {
      for (const controller of live) controller.abort();
      live.clear();
    };
  }, [scope]);

  return useCallback(() => {
    const controller = new AbortController();
    controllers.current.add(controller);
    return controller.signal;
  }, []);
}
