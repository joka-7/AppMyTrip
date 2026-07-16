import { Languages } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import { LANGS, type Lang } from "../i18n/store";

/**
 * UI language picker (Hebrew / English / French). Switching updates every
 * translated string live and flips the page direction (RTL for Hebrew, LTR for
 * English/French). The choice is persisted in localStorage by the store.
 *
 * Distinct from LanguageIndicator, which shows the language the AI agent is
 * replying in for a given trip.
 */
export default function LanguageSwitcher() {
  const { lang, setLang, t } = useI18n();

  return (
    <label className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-full transition-colors cursor-pointer">
      <Languages size={16} />
      <span className="sr-only">{t("lang.label")}</span>
      <select
        value={lang}
        onChange={(e) => setLang(e.target.value as Lang)}
        aria-label={t("lang.label")}
        className="bg-transparent outline-none cursor-pointer pe-1"
      >
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </select>
    </label>
  );
}
