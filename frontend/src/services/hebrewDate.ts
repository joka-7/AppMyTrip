const HEBREW_WEEKDAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]; // Date#getDay(): Sun=0..Sat=6

export function hebrewWeekdayLetter(date: Date): string {
  return HEBREW_WEEKDAY_LETTERS[date.getDay()];
}

/**
 * Best-effort extraction of a trip's start date out of the freeform `dates`
 * string (e.g. "12/06/2025 - 18/06/2025"). Returns null when no recognizable
 * date is found, rather than guessing — callers should just omit the weekday
 * letter in that case.
 */
export function parseTripStartDate(datesText: string): Date | null {
  const iso = datesText.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const dmy = datesText.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date;
  }
  return null;
}
