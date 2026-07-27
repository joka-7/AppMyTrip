import { describe, it, expect, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useTripBranding } from "./useTripBranding";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

describe("useTripBranding", () => {
  beforeEach(() => {
    document.title = "Original";
  });

  it("sets document.title from the trip short name and restores it on unmount", () => {
    const { unmount } = renderHook(() =>
      useTripBranding({ ...DEFAULT_APP_DESIGN, pwaShortName: "Rome Trip" }, "Fallback Title"),
    );
    expect(document.title).toBe("Rome Trip");
    unmount();
    expect(document.title).toBe("Original");
  });

  it("falls back to the trip title when no short name is set", () => {
    renderHook(() => useTripBranding({ ...DEFAULT_APP_DESIGN, pwaShortName: "  " }, "Family Trip"));
    expect(document.title).toBe("Family Trip");
  });
});
