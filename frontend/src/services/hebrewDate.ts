const HEBREW_WEEKDAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]; // Sun=0..Sat=6

const HEBREW_WEEKDAY_NAME_TO_INDEX: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

/** Maps a Sun=0..Sat=6 weekday index to its single Hebrew letter (with wraparound). */
export function hebrewWeekdayLetter(weekdayIndex: number): string {
  return HEBREW_WEEKDAY_LETTERS[((weekdayIndex % 7) + 7) % 7];
}

/**
 * Best-effort extraction of day 1's weekday out of the trip's freeform `dates`
 * string, so day tabs can show a "(א')"-style letter without needing a real
 * calendar date. Tries an explicit numeric date first (e.g.
 * "12/06/2025 - 18/06/2025" or "2025-06-12"), then falls back to a Hebrew
 * weekday name or letter right after "יום" (e.g. "יום א׳ – יום ג׳", "יום
 * ראשון") — the format the AI actually produces most of the time, since it
 * rarely knows (or states) real calendar dates. Returns null (omit the
 * weekday) when neither is found, rather than guessing.
 */
export function tripStartWeekdayIndex(datesText: string): number | null {
  const iso = datesText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date.getDay();
  }
  const dmy = datesText.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date.getDay();
  }

  const nameMatch = datesText.match(/יום[ '׳]*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)/);
  if (nameMatch) return HEBREW_WEEKDAY_NAME_TO_INDEX[nameMatch[1]];

  const letterMatch = datesText.match(/יום[ ]*([א-ו]|ש)['׳]/);
  if (letterMatch) return HEBREW_WEEKDAY_LETTERS.indexOf(letterMatch[1]);

  return null;
}
