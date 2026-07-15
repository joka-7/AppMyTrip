// Vite's code-split dynamic imports (e.g. lazy(() => import("./GoogleMapView")))
// embed a content-hashed chunk URL at build time. A tab left open across a
// deploy — or a stale service-worker cache still serving the pre-deploy bundle —
// keeps referencing that OLD hash, which no longer exists once the new build
// replaces dist/assets/. The server's SPA fallback then returns index.html
// (text/html) for that request, which the browser rejects as an invalid module
// script — surfacing as "Failed to fetch dynamically imported module".
//
// Vite fires `vite:preloadError` on window for exactly this case. The fix is a
// one-time hard reload to fetch the current index.html/bundle, guarded against
// looping if something is persistently broken (e.g. a real network outage)
// rather than just a stale chunk.

const RELOAD_GUARD_KEY = "tripweaver_stale_chunk_reload";

/** Reloads once per tab session; a second failure in the same session is left
 * alone rather than looping forever. */
export function recoverFromStaleChunk(reload: () => void = () => window.location.reload()): void {
  if (sessionStorage.getItem(RELOAD_GUARD_KEY)) return;
  sessionStorage.setItem(RELOAD_GUARD_KEY, "1");
  reload();
}

export function installStaleChunkRecovery(): void {
  window.addEventListener("vite:preloadError", () => recoverFromStaleChunk());
}
