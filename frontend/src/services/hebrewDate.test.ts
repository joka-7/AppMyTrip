import { describe, it, expect } from "vitest";
import { hebrewWeekdayLetter, tripStartWeekdayIndex } from "./hebrewDate";

describe("tripStartWeekdayIndex", () => {
  it("parses an ISO date", () => {
    // 2025-06-12 is a Thursday
    expect(tripStartWeekdayIndex("2025-06-12 - 2025-06-18")).toBe(4);
  });

  it("parses a DD/MM/YYYY date", () => {
    expect(tripStartWeekdayIndex("12/06/2025 - 18/06/2025")).toBe(4);
  });

  it("parses a DD.MM.YYYY date", () => {
    expect(tripStartWeekdayIndex("12.06.2025 - 18.06.2025")).toBe(4);
  });

  it("falls back to a Hebrew weekday letter after 'יום'", () => {
    expect(tripStartWeekdayIndex("יום א׳ – יום ג׳")).toBe(0);
    expect(tripStartWeekdayIndex("יום ג' - יום ה'")).toBe(2);
  });

  it("falls back to a full Hebrew weekday name after 'יום'", () => {
    expect(tripStartWeekdayIndex("יום ראשון עד יום שלישי")).toBe(0);
    expect(tripStartWeekdayIndex("מיום שני הקרוב")).toBe(1);
  });

  it("parses an English weekday name or abbreviation (earliest one wins)", () => {
    expect(tripStartWeekdayIndex("Thu - Sun")).toBe(4);
    expect(tripStartWeekdayIndex("Thursday to Sunday")).toBe(4);
    expect(tripStartWeekdayIndex("Mon - Wed")).toBe(1);
  });

  it("parses a French weekday name", () => {
    expect(tripStartWeekdayIndex("lundi au mercredi")).toBe(1);
    expect(tripStartWeekdayIndex("jeudi - dimanche")).toBe(4);
  });

  it("returns null for a freeform string with no recognizable date", () => {
    expect(tripStartWeekdayIndex("12-19 ביולי")).toBeNull();
    expect(tripStartWeekdayIndex("בקרוב")).toBeNull();
    expect(tripStartWeekdayIndex("sometime soon")).toBeNull();
  });
});

describe("hebrewWeekdayLetter", () => {
  it("maps 0-6 to the Hebrew weekday letters", () => {
    expect(hebrewWeekdayLetter(0)).toBe("א");
    expect(hebrewWeekdayLetter(6)).toBe("ש");
  });

  it("wraps around past Saturday", () => {
    expect(hebrewWeekdayLetter(7)).toBe("א");
    expect(hebrewWeekdayLetter(8)).toBe("ב");
  });
});
