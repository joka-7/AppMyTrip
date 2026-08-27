import type { Activity, TripData } from "../api";

/** Escapes text for ICS TEXT values (RFC 5545). */
function icsEscape(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Formats a local Date as `YYYYMMDD` or `YYYYMMDDTHHMMSS` (floating, no TZ). */
function formatIcsLocal(date: Date, withTime: boolean): string {
  const y = date.getFullYear();
  const m = pad2(date.getMonth() + 1);
  const d = pad2(date.getDate());
  if (!withTime) return `${y}${m}${d}`;
  return `${y}${m}${d}T${pad2(date.getHours())}${pad2(date.getMinutes())}${pad2(date.getSeconds())}`;
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "trip";
}

/**
 * Best-effort absolute start date from free-text `trip.dates`. Returns null when
 * the string only has weekdays / relative ranges (those still export relative to today).
 */
export function parseTripStartDate(datesText: string): Date | null {
  const text = datesText.trim();
  if (!text) return null;

  const iso = text.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const date = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const dmy = text.match(/(\d{1,2})[./](\d{1,2})[./](\d{4})/);
  if (dmy) {
    const date = new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1]));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const months =
    "january|february|march|april|may|june|july|august|september|october|november|december|" +
    "jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec|" +
    "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre|" +
    "ינואר|פברואר|מרץ|מרס|אפריל|מאי|יוני|יולי|אוגוסט|ספטמבר|אוקטובר|נובמבר|דצמבר";

  const monthIndex: Record<string, number> = {
    january: 0,
    jan: 0,
    february: 1,
    feb: 1,
    march: 2,
    mar: 2,
    april: 3,
    apr: 3,
    may: 4,
    june: 5,
    jun: 5,
    july: 6,
    jul: 6,
    august: 7,
    aug: 7,
    september: 8,
    sep: 8,
    sept: 8,
    october: 9,
    oct: 9,
    november: 10,
    nov: 10,
    december: 11,
    dec: 11,
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

  const dayFirst = text.match(
    new RegExp(`(\\d{1,2})(?:\\s*[-–]\\s*\\d{1,2})?\\s+(?:ב)?(${months})\\.?,?\\s+(\\d{4})`, "i"),
  );
  if (dayFirst) {
    const mi = monthIndex[dayFirst[2].toLowerCase()] ?? monthIndex[dayFirst[2]];
    if (mi !== undefined) {
      const date = new Date(Number(dayFirst[3]), mi, Number(dayFirst[1]));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  const monthFirst = text.match(
    new RegExp(`(${months})\\.?\\s+(\\d{1,2})(?:\\s*[-–]\\s*\\d{1,2})?,?\\s+(\\d{4})`, "i"),
  );
  if (monthFirst) {
    const mi = monthIndex[monthFirst[1].toLowerCase()] ?? monthIndex[monthFirst[1]];
    if (mi !== undefined) {
      const date = new Date(Number(monthFirst[3]), mi, Number(monthFirst[2]));
      if (!Number.isNaN(date.getTime())) return date;
    }
  }

  return null;
}

/** Parses leading `HH:MM` (optional range) from activity.time. */
export function parseActivityStartTime(time: string): { hours: number; minutes: number } | null {
  const match = time.trim().match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return { hours, minutes };
}

function dayDate(tripStart: Date, dayNum: number): Date {
  return new Date(
    tripStart.getFullYear(),
    tripStart.getMonth(),
    tripStart.getDate() + (dayNum - 1),
  );
}

function activityEventLines(
  trip: TripData,
  tripStart: Date,
  dayNum: number,
  activity: Activity,
  index: number,
): string[] {
  const base = dayDate(tripStart, dayNum);
  const parsedTime = parseActivityStartTime(activity.time ?? "");
  const start = new Date(base);
  if (parsedTime) {
    start.setHours(parsedTime.hours, parsedTime.minutes, 0, 0);
  } else {
    start.setHours(9, 0, 0, 0);
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const uid = `${activity.id || `a${index}`}@appmytrip`;
  const stamp = formatIcsLocal(new Date(), true);
  const descParts = [activity.desc, activity.directions_car, activity.directions_transit].filter(
    Boolean,
  );

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatIcsLocal(start, true)}`,
    `DTEND:${formatIcsLocal(end, true)}`,
    `SUMMARY:${icsEscape(activity.title || "Activity")}`,
    ...(descParts.length ? [`DESCRIPTION:${icsEscape(descParts.join("\\n"))}`] : []),
    ...(activity.url ? [`URL:${activity.url}`] : []),
    "END:VEVENT",
  ];
}

/** Builds an RFC 5545 calendar document for every activity in the trip. */
export function buildIcsCalendar(trip: TripData): string {
  const tripStart = parseTripStartDate(trip.dates ?? "") ?? new Date();
  const events: string[] = [];
  for (const day of trip.days ?? []) {
    day.activities.forEach((activity, index) => {
      events.push(...activityEventLines(trip, tripStart, day.dayNum, activity, index));
    });
  }

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//AppMyTrip//EN",
    `X-WR-CALNAME:${icsEscape(trip.title || "Trip")}`,
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

/** Triggers a browser download of the trip as a `.ics` calendar file. */
export function exportTripToIcs(trip: TripData): void {
  const blob = new Blob([buildIcsCalendar(trip)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(trip.title)}.ics`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
