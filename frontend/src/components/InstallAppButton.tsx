import { useState } from "react";
import { Download, Share, SquarePlus, X } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import { useInstallPrompt } from "../hooks/useInstallPrompt";

/**
 * Surfaces installability everywhere it's relevant: a one-click native
 * install prompt on Chrome/Edge (desktop + Android), and step-by-step
 * "Add to Home Screen" instructions on iOS Safari, which never exposes a
 * programmatic install API. Renders nothing once the app is already
 * installed or on browsers that support neither path.
 */
export default function InstallAppButton() {
  const { t } = useI18n();
  const { canInstall, isIos, installed, promptInstall } = useInstallPrompt();
  const [showIosHelp, setShowIosHelp] = useState(false);

  if (installed || (!canInstall && !isIos)) return null;

  return (
    <>
      <button
        onClick={() => (canInstall ? promptInstall() : setShowIosHelp(true))}
        className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg text-xs"
      >
        <Download size={14} />
        {t("install.button")}
      </button>

      {showIosHelp && (
        <div
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
          onClick={() => setShowIosHelp(false)}
        >
          <div
            className="bg-white rounded-2xl p-5 max-w-sm w-full shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-bold text-ink">{t("install.iosTitle")}</h3>
              <button
                onClick={() => setShowIosHelp(false)}
                className="text-ink-muted hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <ol className="text-sm text-ink-muted flex flex-col gap-3">
              <li className="flex items-center gap-2">
                <Share size={16} className="text-primary flex-shrink-0" />
                {t("install.iosStep1")}
              </li>
              <li className="flex items-center gap-2">
                <SquarePlus size={16} className="text-primary flex-shrink-0" />
                {t("install.iosStep2")}
              </li>
            </ol>
          </div>
        </div>
      )}
    </>
  );
}
