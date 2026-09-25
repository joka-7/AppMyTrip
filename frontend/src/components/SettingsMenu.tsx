import { useCallback, useState } from "react";
import type { RefObject } from "react";
import { MoreVertical } from "lucide-react";
import type { TripData } from "../api";
import type { AppDesign } from "../services/appDesign";
import { useDismissable } from "../hooks/useDismissable";
import { useI18n } from "../i18n/useI18n";
import AiSettingsPanel from "./AiSettingsPanel";
import FileActions from "./FileActions";
import LanguageSwitcher from "./LanguageSwitcher";

/**
 * The single ⋮ overflow button for everything that used to be its own pill
 * in the top nav: language, AI settings (provider keys or external chat —
 * see AiSettingsPanel), and file import/export (see FileActions). Sign-in
 * and the trip save/share/my-trips dropdown stay their own control (see
 * CloudMenu) since they're about *identity*, not a setting.
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
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const menuRef = useDismissable(isOpen, closeMenu);

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label={t("settingsMenu.button")}
        title={t("settingsMenu.button")}
        className="flex items-center justify-center w-9 h-9 rounded-full text-ink-muted hover:bg-surface-container-high transition-colors"
      >
        <MoreVertical size={18} />
      </button>

      {isOpen && (
        <div
          role="menu"
          className="fixed inset-x-4 top-4 max-h-[calc(100vh-2rem)] w-auto overflow-y-auto
            sm:absolute sm:inset-x-auto sm:top-auto sm:end-0 sm:mt-2 sm:max-h-none sm:w-80
            sm:max-w-[calc(100vw-2rem)] sm:overflow-visible bg-white rounded-xl shadow-lg
            border border-outline/20 p-4 z-40 text-start space-y-4"
        >
          <section>
            <h3 className="text-xs font-semibold text-ink-muted mb-1.5">
              {t("settingsMenu.language")}
            </h3>
            <LanguageSwitcher />
          </section>

          <section className="pt-3 border-t border-outline/10">
            <AiSettingsPanel />
          </section>

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
    </div>
  );
}
