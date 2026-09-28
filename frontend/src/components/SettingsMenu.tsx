import { useCallback, useState } from "react";
import type { RefObject } from "react";
import { ChevronLeft, MoreVertical, Settings as SettingsIcon, X } from "lucide-react";
import type { TripData } from "../api";
import type { AppDesign } from "../services/appDesign";
import { useDismissable } from "../hooks/useDismissable";
import { useBackToClose } from "../hooks/useBackToClose";
import { useI18n } from "../i18n/useI18n";
import AiSettingsPanel from "./AiSettingsPanel";
import FileActions from "./FileActions";
import LanguageSwitcher from "./LanguageSwitcher";

/**
 * The ⋮ overflow "Menu" button for everything that used to be its own pill in
 * the top nav: file import/export (see FileActions) directly, plus a nested
 * "Settings" screen (language + AI settings — see AiSettingsPanel) reached
 * through its own row rather than dumped flat into the same dropdown, so
 * "Menu" (things you do) and "Settings" (things you configure) stay distinct.
 * Sign-in/save/share and My Trips stay their own controls (see CloudMenu and
 * MyTripsButton) since they're about *identity and content*, not a setting.
 */
export default function SettingsMenu({
  tripData,
  appDesign,
  printTargetRef,
  onImportTrip,
}: {
  tripData: TripData;
  appDesign: AppDesign;
  printTargetRef: RefObject<HTMLDivElement>;
  onImportTrip: (trip: TripData, appDesign: AppDesign) => void;
}) {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setSettingsOpen(false);
  }, []);
  const menuRef = useDismissable(isOpen, closeMenu);
  useBackToClose(isOpen, closeMenu);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  useBackToClose(settingsOpen, closeSettings);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={t("settingsMenu.button")}
        className="shrink-0 flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
      >
        <MoreVertical size={18} />
        {t("settingsMenu.button")}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="fixed inset-x-4 top-4 max-h-[calc(100vh-2rem)] w-auto overflow-y-auto
            sm:absolute sm:inset-x-auto sm:top-auto sm:end-0 sm:mt-2 sm:max-h-[70vh] sm:w-80
            sm:max-w-[calc(100vw-2rem)] sm:overflow-y-auto bg-white rounded-xl shadow-lg
            border border-outline/20 p-4 z-40 text-start space-y-4"
        >
          {/* Combining sections here makes this tall enough to cover the whole
              screen on a phone, including the ⋮ button that opened it — so
              closing can't rely on useDismissable's outside-click/Escape
              alone; this stays reachable regardless of scroll position or
              content height. */}
          <div className="sticky top-0 -mx-4 -mt-4 flex items-center justify-between gap-2 rounded-t-xl border-b border-outline/10 bg-white px-4 py-3">
            <h2 className="text-sm font-semibold text-ink">{t("settingsMenu.button")}</h2>
            <button
              type="button"
              onClick={closeMenu}
              aria-label={t("apiKey.close")}
              className="flex items-center justify-center w-7 h-7 rounded-full text-ink-muted hover:bg-surface-container-high transition-colors"
            >
              <X size={16} />
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex w-full items-center gap-2 text-sm text-ink hover:bg-surface-container px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <SettingsIcon size={16} />
            {t("settingsMenu.settings")}
          </button>

          <section className="pt-3 border-t border-outline/10">
            <h3 className="text-xs font-semibold text-ink-muted mb-1.5">
              {t("settingsMenu.fileActions")}
            </h3>
            <FileActions
              tripData={tripData}
              appDesign={appDesign}
              printTargetRef={printTargetRef}
              onImportTrip={onImportTrip}
            />
          </section>
        </div>
      )}

      {settingsOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={t("settingsMenu.settings")}
          className="fixed inset-x-4 top-4 max-h-[calc(100vh-2rem)] w-auto overflow-y-auto
            sm:absolute sm:inset-x-auto sm:top-auto sm:end-0 sm:mt-2 sm:max-h-[70vh] sm:w-80
            sm:max-w-[calc(100vw-2rem)] sm:overflow-y-auto bg-white rounded-xl shadow-lg
            border border-outline/20 p-4 z-50 text-start space-y-4"
        >
          <div className="sticky top-0 -mx-4 -mt-4 flex items-center gap-2 rounded-t-xl border-b border-outline/10 bg-white px-4 py-3">
            <button
              type="button"
              onClick={closeSettings}
              className="flex items-center gap-1 text-ink-muted hover:text-primary text-xs -ms-1 px-1.5 py-1 rounded-lg"
            >
              <ChevronLeft size={14} />
              {t("common.back")}
            </button>
            <h2 className="text-sm font-semibold text-ink">{t("settingsMenu.settings")}</h2>
          </div>

          <section>
            <h3 className="text-xs font-semibold text-ink-muted mb-1.5">
              {t("settingsMenu.language")}
            </h3>
            <LanguageSwitcher />
          </section>

          <section className="pt-3 border-t border-outline/10">
            <AiSettingsPanel />
          </section>
        </div>
      )}
    </div>
  );
}
