import { describe, it, expect, vi, beforeEach } from "vitest";
import { recoverFromStaleChunk, installStaleChunkRecovery } from "./staleChunkRecovery";

describe("recoverFromStaleChunk", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("reloads once when a stale chunk fails to load", () => {
    const reload = vi.fn();
    recoverFromStaleChunk(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does not reload again within the same tab session, to avoid an infinite loop", () => {
    const reload = vi.fn();
    recoverFromStaleChunk(reload);
    recoverFromStaleChunk(reload);
    recoverFromStaleChunk(reload);
    expect(reload).toHaveBeenCalledTimes(1);
  });
});

describe("installStaleChunkRecovery", () => {
  beforeEach(() => {
    sessionStorage.clear();
  });

  it("triggers the reload guard when Vite's vite:preloadError event fires", () => {
    // jsdom's window.location.reload isn't stubbable, so this exercises the
    // real reload path (a harmless no-op in jsdom) and checks its one
    // observable side effect: the session guard that prevents reload loops.
    installStaleChunkRecovery();
    expect(sessionStorage.getItem("tripweaver_stale_chunk_reload")).toBeNull();

    window.dispatchEvent(new Event("vite:preloadError"));

    expect(sessionStorage.getItem("tripweaver_stale_chunk_reload")).toBe("1");
  });
});
