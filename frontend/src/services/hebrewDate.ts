const HEBREW_WEEKDAY_LETTERS = ["א", "ב", "ג", "ד", "ה", "ו", "ש"]; // Sun=0..Sat=6
const APOSTROPHE = "[''\u05F3\u2019]";

const HEBREW_WEEKDAY_NAME_TO_INDEX: Record<string, number> = {
  ראשון: 0,
  שני: 1,
  שלישי: 2,
  רביעי: 3,
  חמישי: 4,
  שישי: 5,
  שבת: 6,
};

const ENGLISH_WEEKDAY_NAME_TO_INDEX: Record<string, number> = {
  sun: 0,
  sunday: 0,
  mon: 1,
  monday: 1,
  tue: 2,
  tues: 2,
  tuesday: 2,
  wed: 3,
  weds: 3,
  wednesday: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  thursday: 4,
  fri: 5,
  friday: 5,
  sat: 6,
  saturday: 6,
};

// French weekday names → Sun=0..Sat=6. Only full names are listed: the common
// 3-letter abbreviations collide with French month abbreviations (e.g. "mar" =
// mardi/Tuesday but also mars/March), so matching them would misread date ranges.
const FRENCH_WEEKDAY_NAME_TO_INDEX: Record<string, number> = {
  dimanche: 0,
  lundi: 1,
  mardi: 2,
  mercredi: 3,
  jeudi: 4,
  vendredi: 5,
  samedi: 6,
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
 * ראשון"), then English weekday names (e.g. "Mon - Wed", "Thursday - Sunday"),
 * then French weekday names (e.g. "lundi au mercredi").
 * Returns null (omit the weekday) when none is found, rather than guessing.
 */
export function tripStartWeekdayIndex(datesText: string): number | null {
  const text = datesText.trim();
  if (!text) return null;

  const iso = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    const [, y, m, d] = iso;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date.getDay();
  }
  const dmy = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const [, d, m, y] = dmy;
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return Number.isNaN(date.getTime()) ? null : date.getDay();
  }

  const nameMatch = text.match(
    new RegExp(`יום[ ${APOSTROPHE}]*(ראשון|שני|שלישי|רביעי|חמישי|שישי|שבת)`),
  );
  if (nameMatch) return HEBREW_WEEKDAY_NAME_TO_INDEX[nameMatch[1]];

  const letterMatch = text.match(new RegExp(`יום[ ]*([א-ו]|ש)${APOSTROPHE}`));
  if (letterMatch) return HEBREW_WEEKDAY_LETTERS.indexOf(letterMatch[1]);

  // Bare Hebrew letter at the start, e.g. "א'–ג'" saved without the "יום" prefix.
  const bareLetterMatch = text.match(new RegExp(`^([א-ו]|ש)${APOSTROPHE}`));
  if (bareLetterMatch) return HEBREW_WEEKDAY_LETTERS.indexOf(bareLetterMatch[1]);

  const englishMatch = text.match(
    /\b(Sun|Mon|Tue|Wed|Thu|Fri|Sat|Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday)\b/i,
  );
  if (englishMatch) {
    return ENGLISH_WEEKDAY_NAME_TO_INDEX[englishMatch[1].toLowerCase()] ?? null;
  }

  const frenchMatch = datesText.match(/\b(dimanche|lundi|mardi|mercredi|jeudi|vendredi|samedi)\b/i);
  if (frenchMatch) {
    return FRENCH_WEEKDAY_NAME_TO_INDEX[frenchMatch[1].toLowerCase()] ?? null;
  }

  return null;
}
