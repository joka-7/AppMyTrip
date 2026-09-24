import type { TripData } from "../api";
import type { Theme } from "./appDesign";
import { type AppDesign, normalizeAppDesign } from "./appDesign";
import { t } from "../i18n/store";
import { ensureStartWeekday, normalizeTripForLoad } from "./normalizeTrip";

interface TripFilePayload {
  tripData: TripData;
  appDesign?: Partial<AppDesign>;
  /** Legacy export field — merged into appDesign on import. */
  theme?: Theme;
  exportedAt: string;
}

function slugify(title: string): string {
  const slug = title
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "trip";
}

export function exportTripToFile(tripData: TripData, appDesign: AppDesign): void {
  const payload: TripFilePayload = {
    tripData: ensureStartWeekday(tripData),
    appDesign,
    exportedAt: new Date().toISOString(),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${slugify(tripData.title)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/** Structural check for a parsed `TripData` — not full schema validation,
 * just enough to reject an obviously-wrong shape before it reaches the rest
 * of the app. Shared by file import and the pasted-external-reply path
 * (see externalTripReply.ts). */
export function isValidTripData(value: unknown): value is TripData {
  if (!value || typeof value !== "object") return false;
  const trip = value as Partial<TripData>;
  if (!Array.isArray(trip.days)) return false;
  return trip.days.every(
    (day) =>
      day && typeof day === "object" && Array.isArray((day as { activities?: unknown }).activities),
  );
}

export function importTripFromFile(
  file: File,
): Promise<{ tripData: TripData; appDesign: AppDesign }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(t("tripFile.readFailed")));
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result)) as Partial<TripFilePayload>;
        if (!isValidTripData(parsed.tripData)) {
          throw new Error("invalid shape");
        }
        resolve({
          tripData: normalizeTripForLoad(parsed.tripData),
          appDesign: normalizeAppDesign(parsed.appDesign, parsed.theme),
        });
      } catch {
        reject(new Error(t("tripFile.invalid")));
      }
    };
    reader.readAsText(file);
  });
}
