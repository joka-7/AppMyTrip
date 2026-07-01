import { ChevronLeft, ChevronRight } from "lucide-react";

export default function BuilderStep1({
  rawText,
  onChangeRawText,
  preferences,
  onChangePreferences,
  onSubmit,
  isProcessing,
  hasExistingTrip,
  onContinueWithoutReprocessing,
}: {
  rawText: string;
  onChangeRawText: (text: string) => void;
  preferences: string;
  onChangePreferences: (text: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  /** True once a trip was already parsed this session — lets the user go back here to tweak text without losing the ability to return without re-running the AI. */
  hasExistingTrip: boolean;
  onContinueWithoutReprocessing: () => void;
}) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-4">בוא נתחיל לבנות. ספרו לי על הטיול</h2>
      <p className="text-ink-muted mb-6">
        הדביקו הודעות ווצאפ, סיכומים או סתם שרבטו את הרעיונות שלכם.
      </p>
      <textarea
        value={rawText}
        onChange={(e) => onChangeRawText(e.target.value)}
        className="w-full h-48 p-4 border border-outline/40 rounded-xl focus:ring-2 focus:ring-primary/50 outline-none resize-none mb-4 shadow-sm"
        placeholder="למשל: ביום ראשון טסים ללונדון..."
      />
      <label className="block text-sm font-medium text-ink-muted mb-2">
        העדפות (אופציונלי) — למשל חלבי, טבעוני, נגישות
      </label>
      <input
        type="text"
        value={preferences}
        onChange={(e) => onChangePreferences(e.target.value)}
        className="w-full p-3 border border-outline/40 rounded-xl focus:ring-2 focus:ring-primary/50 outline-none mb-6 shadow-sm"
        placeholder="למשל: רוצים אוכל חלבי"
      />
      <div className="flex gap-3">
        {hasExistingTrip && (
          <button
            onClick={onContinueWithoutReprocessing}
            disabled={isProcessing}
            className="bg-surface-container hover:bg-surface-container-high disabled:opacity-60 text-ink-muted px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
          >
            <ChevronLeft size={20} />
            המשך לעריכה (ללא ניתוח מחדש)
          </button>
        )}
        <button
          onClick={onSubmit}
          disabled={isProcessing}
          className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
        >
          {isProcessing
            ? "ה-AI מנתח את הטקסט..."
            : hasExistingTrip
              ? "נתח מחדש (יחליף את הטיול הקיים)"
              : "צור מבנה אפליקציה ראשוני"}
          {!isProcessing && <ChevronRight size={20} />}
        </button>
      </div>
    </div>
  );
}
