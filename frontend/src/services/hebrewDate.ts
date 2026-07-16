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

// English + French weekday names (full and common abbreviations) → Sun=0..Sat=6,
// so trips written in those languages (e.g. dates like "Thu - Sun") also get a
// weekday on their day tabs. French 3-letter abbreviations are intentionally
// omitted to avoid colliding with month abbreviations (e.g. "mar" = March).
const EN_FR_WEEKDAY_PATTERNS: { re: RegExp; index: number }[] = [
  { re: /\b(sunday|sun|dimanche)\b/i, index: 0 },
  { re: /\b(monday|mon|lundi)\b/i, index: 1 },
  { re: /\b(tuesday|tues|tue|mardi)\b/i, index: 2 },
  { re: /\b(wednesday|wed|mercredi)\b/i, index: 3 },
  { re: /\b(thursday|thurs|thu|jeudi)\b/i, index: 4 },
  { re: /\b(friday|fri|vendredi)\b/i, index: 5 },
  { re: /\b(saturday|sat|samedi)\b/i, index: 6 },
];

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

  // English/French weekday name (e.g. "Thu - Sun", "lundi au mercredi") — take
  // the earliest one in the string as the trip's start day.
  let earliest: { pos: number; index: number } | null = null;
  for (const { re, index } of EN_FR_WEEKDAY_PATTERNS) {
    const match = datesText.match(re);
    if (match?.index !== undefined && (!earliest || match.index < earliest.pos)) {
      earliest = { pos: match.index, index };
    }
  }
  if (earliest) return earliest.index;

  return null;
}
