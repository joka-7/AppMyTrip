// Framework-agnostic i18n store. Holds the active UI language, persists it to
// localStorage, keeps <html lang/dir> in sync, and exposes translate() for both
// React components (via the useI18n hook) and plain modules (services/hooks).
//
// Hebrew stays the default so the app is unchanged for existing users; English
// and French are fully available and switchable from the language picker. RTL
// is used for Hebrew, LTR for English/French.
import { he, type TranslationKey } from "./translations/he";
import { en } from "./translations/en";
import { fr } from "./translations/fr";

export type Lang = "he" | "en" | "fr";
export type { TranslationKey };

export const LANGS: { code: Lang; label: string }[] = [
  { code: "he", label: "עברית" },
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
];

const DICTS: Record<Lang, Record<TranslationKey, string>> = { he, en, fr };
const STORAGE_KEY = "appmytrip_lang";

function isLang(value: unknown): value is Lang {
  return value === "he" || value === "en" || value === "fr";
}

/** Right-to-left only for Hebrew; English and French are left-to-right. */
export function dirFor(lang: Lang): "rtl" | "ltr" {
  return lang === "he" ? "rtl" : "ltr";
}

function readInitial(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isLang(stored)) return stored;
  } catch {
    // localStorage can throw in private-mode/sandboxed contexts — fall back below.
  }
  return "he";
}

let current: Lang = readInitial();
const listeners = new Set<() => void>();

function applyToDocument(lang: Lang): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang;
  document.documentElement.dir = dirFor(lang);
  const title = DICTS[lang]["document.title"];
  if (title) document.title = title;
}

// Apply immediately on import so the very first paint (and anything rendered
// above the React provider, like the error boundary) gets the right direction.
applyToDocument(current);

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (!isLang(lang) || lang === current) return;
  current = lang;
  try {
    localStorage.setItem(STORAGE_KEY, lang);
  } catch {
    // Persisting is best-effort; the in-memory switch still works.
  }
  applyToDocument(lang);
  listeners.forEach((notify) => notify());
}

export function subscribe(callback: () => void): () => void {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

/**
 * Look up a key in the active language, falling back to Hebrew (the source
 * dictionary) and then the raw key. `{name}` placeholders are replaced by the
 * matching entry in `params`.
 */
export function translate(key: TranslationKey, params?: Record<string, string | number>): string {
  let str = DICTS[current][key] ?? he[key] ?? key;
  if (params) {
    for (const [name, value] of Object.entries(params)) {
      str = str.split(`{${name}}`).join(String(value));
    }
  }
  return str;
}

/** Short alias for use in non-React modules. */
export const t = translate;
