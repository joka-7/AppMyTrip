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

// Month name → 0-indexed month, for "day (range) + month name + year" dates
// (e.g. "20-27 ביולי 2026", "20-27 July 2026", "July 20-27, 2026") — a very
// common way to write a date range that contains neither a D/M/Y numeric date
// nor an explicit weekday name, so it was previously never recognized at all.
const HEBREW_MONTH_NAME_TO_INDEX: Record<string, number> = {
  ינואר: 0,
  פברואר: 1,
  מרץ: 2,
  מרס: 2,
  אפריל: 3,
  מאי: 4,
  יוני: 5,
  יולי: 6,
  אוגוסט: 7,
  ספטמבר: 8,
  אוקטובר: 9,
  נובמבר: 10,
  דצמבר: 11,
};

const ENGLISH_MONTH_NAME_TO_INDEX: Record<string, number> = {
  jan: 0,
  january: 0,
  feb: 1,
  february: 1,
  mar: 2,
  march: 2,
  apr: 3,
  april: 3,
  may: 4,
  jun: 5,
  june: 5,
  jul: 6,
  july: 6,
  aug: 7,
  august: 7,
  sep: 8,
  sept: 8,
  september: 8,
  oct: 9,
  october: 9,
  nov: 10,
  november: 10,
  dec: 11,
  december: 11,
};

const FRENCH_MONTH_NAME_TO_INDEX: Record<string, number> = {
  janvier: 0,
  février: 1,
  fevrier: 1,
  mars: 2,
  avril: 3,
  mai: 4,
  juin: 5,
  juillet: 6,
  août: 7,
  aout: 7,
  septembre: 8,
  octobre: 9,
  novembre: 10,
  décembre: 11,
  decembre: 11,
};

/** Builds a `day + monthName + year` matcher for the given month-name dictionary
 * (day-first order — "20-27 <month> <year>", the common order in Hebrew/English/
 * French). Only matches when a year is present: without one there's no way to
 * compute a real date, and guessing a year risks a silently *wrong* weekday
 * rather than the current, honest "omit it" behavior. */
function dayMonthYear(
  text: string,
  months: Record<string, number>,
  monthPrefix: string,
): number | null {
  const names = Object.keys(months)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const match = text.match(
    new RegExp(
      `(\\d{1,2})(?:\\s*[-–]\\s*\\d{1,2})?\\s+${monthPrefix}(${names})\\.?,?\\s+(\\d{4})`,
      "i",
    ),
  );
  if (!match) return null;
  const [, day, monthName, year] = match;
  const monthIndex = months[monthName.toLowerCase()];
  if (monthIndex === undefined) return null;
  const date = new Date(Number(year), monthIndex, Number(day));
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

/** Month-first order ("July 20-27, 2026") — common in English, rarer elsewhere. */
function monthDayYear(text: string, months: Record<string, number>): number | null {
  const names = Object.keys(months)
    .sort((a, b) => b.length - a.length)
    .join("|");
  const match = text.match(
    new RegExp(`(${names})\\.?\\s+(\\d{1,2})(?:\\s*[-–]\\s*\\d{1,2})?,?\\s+(\\d{4})`, "i"),
  );
  if (!match) return null;
  const [, monthName, day, year] = match;
  const monthIndex = months[monthName.toLowerCase()];
  if (monthIndex === undefined) return null;
  const date = new Date(Number(year), monthIndex, Number(day));
  return Number.isNaN(date.getTime()) ? null : date.getDay();
}

/** Maps a Sun=0..Sat=6 weekday index to its single Hebrew letter (with wraparound). */
export function hebrewWeekdayLetter(weekdayIndex: number): string {
  return HEBREW_WEEKDAY_LETTERS[((weekdayIndex % 7) + 7) % 7];
}

/**
 * Best-effort extraction of day 1's weekday out of the trip's freeform `dates`
 * string, so day tabs can show a "(א')"-style letter without needing a real
 * calendar date. Tries, in order: an explicit numeric date (e.g.
 * "12/06/2025 - 18/06/2025" or "2025-06-12"); a day + month-name + year (e.g.
 * "20-27 ביולי 2026", "20-27 July 2026", "July 20-27, 2026"); a Hebrew weekday
 * name or letter right after "יום" (e.g. "יום א׳ – יום ג׳", "יום ראשון");
 * English weekday names (e.g. "Mon - Wed", "Thursday - Sunday"); then French
 * weekday names (e.g. "lundi au mercredi").
 * Returns null (omit the weekday) when none is found, rather than guessing —
 * notably, a month-name date with no year is left unrecognized rather than
 * assuming which year, since a wrong guess there would be silently incorrect.
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

  // "day (range) + month name + year" — e.g. "20-27 ביולי 2026", "20-27 July
  // 2026", "July 20-27, 2026" — no numeric D/M/Y and no weekday name at all,
  // which the checks above and below can't catch.
  const monthYear =
    dayMonthYear(text, HEBREW_MONTH_NAME_TO_INDEX, "ב?") ??
    dayMonthYear(text, ENGLISH_MONTH_NAME_TO_INDEX, "") ??
    monthDayYear(text, ENGLISH_MONTH_NAME_TO_INDEX) ??
    dayMonthYear(text, FRENCH_MONTH_NAME_TO_INDEX, "");
  if (monthYear !== null) return monthYear;

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
