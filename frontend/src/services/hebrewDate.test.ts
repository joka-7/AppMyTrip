import { describe, expect, it } from "vitest";
import { tripStartWeekdayIndex, weekdayTabLabel } from "./hebrewDate";

describe("tripStartWeekdayIndex", () => {
  it("parses ISO start dates", () => {
    // 2025-06-12 is a Thursday (4)
    expect(tripStartWeekdayIndex("2025-06-12 - 2025-06-18")).toBe(4);
  });

  it("parses D/M/Y start dates", () => {
    expect(tripStartWeekdayIndex("12/06/2025 - 18/06/2025")).toBe(4);
  });

  it("parses Hebrew weekday letters after יום", () => {
    expect(tripStartWeekdayIndex("יום א׳ – יום ג׳")).toBe(0);
    expect(tripStartWeekdayIndex("יום ג' - יום ה'")).toBe(2);
  });

  it("parses Hebrew weekday names after יום", () => {
    expect(tripStartWeekdayIndex("יום ראשון - יום שלישי")).toBe(0);
  });

  it("parses English weekday names", () => {
    expect(tripStartWeekdayIndex("Mon - Wed")).toBe(1);
    expect(tripStartWeekdayIndex("Thu - Sun")).toBe(4);
  });

  it("returns null when no weekday can be inferred", () => {
    expect(tripStartWeekdayIndex("15-20 ביוני")).toBeNull();
    expect(tripStartWeekdayIndex("")).toBeNull();
  });
});

describe("weekdayTabLabel", () => {
  it("returns Hebrew letters by default", () => {
    expect(weekdayTabLabel(0)).toBe("א'");
    expect(weekdayTabLabel(1)).toBe("ב'");
  });

  it("returns English short names when language is en", () => {
    expect(weekdayTabLabel(0, "en")).toBe("Sun");
    expect(weekdayTabLabel(1, "en")).toBe("Mon");
  });
});
