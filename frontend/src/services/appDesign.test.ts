import { describe, it, expect } from "vitest";
import {
  DEFAULT_APP_DESIGN,
  headerBackgroundStyle,
  normalizeAppDesign,
  resolveDefaultTab,
  themeClassForDesign,
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

describe("headerBackgroundStyle", () => {
  it("builds a background-image from a safe photo headerImageUrl", () => {
    const design = {
      ...DEFAULT_APP_DESIGN,
      headerStyle: "photo" as const,
      headerImageUrl: "https://example.com/photo.jpg",
    };
    expect(headerBackgroundStyle(design)?.backgroundImage).toContain(
      "https://example.com/photo.jpg",
    );
  });

  it("ignores an unsafe (javascript:) headerImageUrl and falls through to the default style", () => {
    const design = {
      ...DEFAULT_APP_DESIGN,
      headerStyle: "photo" as const,
      headerImageUrl: "javascript:alert(1)",
    };
    expect(headerBackgroundStyle(design)).toBeUndefined();
  });
});

describe("themeClassForDesign", () => {
  it("returns no theme class for a photo header with a safe image URL", () => {
    const design = {
      ...DEFAULT_APP_DESIGN,
      headerStyle: "photo" as const,
      headerImageUrl: "https://example.com/photo.jpg",
    };
    expect(themeClassForDesign(design)).toBe("");
  });

  it("falls back to the normal theme class when the photo header's URL is unsafe", () => {
    const design = {
      ...DEFAULT_APP_DESIGN,
      headerStyle: "photo" as const,
      headerImageUrl: "javascript:alert(1)",
    };
    expect(themeClassForDesign(design)).not.toBe("");
  });
});
