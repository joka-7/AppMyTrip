import { describe, it, expect } from "vitest";
import {
  DEFAULT_APP_DESIGN,
  normalizeAppDesign,
  resolveDefaultTab,
} from "./appDesign";

describe("normalizeAppDesign", () => {
  it("returns defaults when given nothing", () => {
    expect(normalizeAppDesign()).toEqual(DEFAULT_APP_DESIGN);
  });

  it("merges legacy theme field", () => {
    expect(normalizeAppDesign(undefined, "green").theme).toBe("green");
  });

  it("merges partial appDesign and keeps default visible tabs", () => {
    const result = normalizeAppDesign({ currency: "$", font: "serif" });
    expect(result.currency).toBe("$");
    expect(result.font).toBe("serif");
    expect(result.visibleTabs.chat).toBe(true);
  });
});

describe("resolveDefaultTab", () => {
  it("returns preferred tab when visible", () => {
    expect(resolveDefaultTab("map", DEFAULT_APP_DESIGN.visibleTabs)).toBe("map");
  });

  it("falls back when preferred tab is hidden", () => {
    const tabs = { ...DEFAULT_APP_DESIGN.visibleTabs, price: false };
    expect(resolveDefaultTab("price", tabs)).toBe("itinerary");
  });
});
