import type { Activity } from "../api";
import type { TranslationKey } from "../i18n/store";

/** Activity types in display order, with their translation keys. */
export const ACTIVITY_TYPES: Activity["type"][] = ["attraction", "food", "lodging", "transport"];

export const ACTIVITY_TYPE_LABEL_KEYS: Record<Activity["type"], TranslationKey> = {
  attraction: "activityType.attraction",
  food: "activityType.food",
  lodging: "activityType.lodging",
  transport: "activityType.transport",
};
