import { ChevronRight } from "lucide-react";

export default function BuilderStep1({
  rawText,
  onChangeRawText,
  onSubmit,
  isProcessing,
}: {
  rawText: string;
  onChangeRawText: (text: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
}) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-4">בוא נתחיל לבנות. ספרו לי על הטיול</h2>
      <p className="text-gray-600 mb-6">
        הדביקו הודעות ווצאפ, סיכומים או סתם שרבטו את הרעיונות שלכם.
      </p>
      <textarea
        value={rawText}
        onChange={(e) => onChangeRawText(e.target.value)}
        className="w-full h-48 p-4 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none resize-none mb-6 shadow-sm"
        placeholder="למשל: ביום ראשון טסים ללונדון..."
      />
      <button
        onClick={onSubmit}
        disabled={isProcessing}
        className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 w-full justify-center transition-colors shadow-md"
      >
        {isProcessing ? "ה-AI מנתח את הטקסט..." : "צור מבנה אפליקציה ראשוני"}
        {!isProcessing && <ChevronRight size={20} />}
      </button>
    </div>
  );
}
