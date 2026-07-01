import { useState } from "react";
import { Globe } from "lucide-react";
import { languageLabel } from "../services/language";

/**
 * Small chip showing which language the AI agent is currently replying in
 * for this trip (detected from the trip's source text). Clicking it reveals
 * a one-line explainer rather than navigating anywhere.
 */
export default function LanguageIndicator({ language }: { language?: string | null }) {
  const [showInfo, setShowInfo] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowInfo((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-full transition-colors"
      >
        <Globe size={14} />
        {languageLabel(language)}
      </button>

      {showInfo && (
        <div className="absolute left-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-outline/20 p-3 z-40 text-right text-xs text-ink-muted">
          שפת התשובות של הסוכן נקבעת לפי השפה השלטת בטקסט הטיול שהזנתם, ומתעדכנת אוטומטית אם תכתבו
          לו בשפה אחרת.
        </div>
      )}
    </div>
  );
}
