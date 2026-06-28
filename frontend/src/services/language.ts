/** Hebrew display names for the language codes the AI agent is likely to detect/use. */
const LANGUAGE_NAMES: Record<string, string> = {
  he: "עברית",
  en: "אנגלית",
  ar: "ערבית",
  fr: "צרפתית",
  es: "ספרדית",
  de: "גרמנית",
  ru: "רוסית",
  it: "איטלקית",
  pt: "פורטוגזית",
};

/** Friendly Hebrew label for an ISO 639-1 language code, falling back to the raw code. */
export function languageLabel(code?: string | null): string {
  if (!code) return LANGUAGE_NAMES.he;
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}
