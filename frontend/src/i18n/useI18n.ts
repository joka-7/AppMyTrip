import { useSyncExternalStore } from "react";
import {
  dirFor,
  getLang,
  setLang,
  subscribe,
  translate,
  type Lang,
  type TranslationKey,
} from "./store";

/**
 * React binding for the i18n store. Components re-render when the language
 * changes. `t` is the translate function; `dir` is the current writing
 * direction (for roots that need an explicit `dir` attribute).
 */
export function useI18n() {
  const lang = useSyncExternalStore(subscribe, getLang, getLang);
  return {
    lang,
    dir: dirFor(lang),
    setLang,
    t: (key: TranslationKey, params?: Record<string, string | number>) => translate(key, params),
  };
}

export type { Lang, TranslationKey };
