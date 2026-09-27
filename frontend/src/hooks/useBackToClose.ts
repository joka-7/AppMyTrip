import { useEffect, useRef } from "react";

/**
 * Makes the device/browser back button close an open overlay (dropdown,
 * modal, nested panel) instead of falling through to the wizard's own
 * step-back handling (see App.tsx's popstate listener) or exiting the app
 * outright — the failure mode before this existed. Pushes a history entry
 * the moment the overlay opens; a back press pops it, and this closes the
 * overlay instead of navigating away. Closing any other way (X button,
 * outside click, Escape) consumes that same entry via history.back() so a
 * later real back press doesn't land on a stale "overlay was open" state.
 */
export function useBackToClose(open: boolean, onClose: () => void): void {
  const pushedRef = useRef(false);
  // onClose is read via a ref, not a dependency: a caller passing a fresh
  // inline closure each render (the common case) must not retrigger this
  // effect, or every render would push another history entry.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    window.history.pushState({ overlay: true }, "");
    pushedRef.current = true;

    const onPopState = () => {
      pushedRef.current = false;
      onCloseRef.current();
    };
    window.addEventListener("popstate", onPopState);
    return () => {
      window.removeEventListener("popstate", onPopState);
      if (pushedRef.current) {
        pushedRef.current = false;
        window.history.back();
      }
    };
  }, [open]);
}
