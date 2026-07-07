import type { Activity } from "../api";

export const ACTIVITY_TYPE_LABELS: Record<Activity["type"], string> = {
  attraction: "אטרקציה",
  food: "אוכל",
  lodging: "לינה",
  transport: "תחבורה",
};
