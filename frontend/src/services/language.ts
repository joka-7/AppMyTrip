import type { Lang } from "../i18n/store";

/**
 * Friendly, localized display name for an ISO 639-1 language code — e.g. "fr"
 * shown as "צרפתית" (he), "French" (en) or "français" (fr). Uses the platform's
 * Intl.DisplayNames so we don't hand-maintain a name table per UI language, and
 * falls back to the uppercased raw code when the code is unknown or the API is
 * unavailable.
 */
export function languageLabel(code: string | null | undefined, uiLang: Lang): string {
  const fallback = uiLang === "he" ? "עברית" : uiLang === "fr" ? "français" : "English";
  if (!code) return fallback;
  try {
    const name = new Intl.DisplayNames([uiLang], { type: "language" }).of(code.toLowerCase());
    if (name && name.toLowerCase() !== code.toLowerCase()) return name;
  } catch {
    // Intl.DisplayNames not available — fall through to the raw code.
  }
  return code.toUpperCase();
}
