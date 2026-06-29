import { useState } from "react";
import {
  Car,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  Train,
  Volume2,
  Wallet,
} from "lucide-react";
import type { EnhanceOptions } from "../api";

const OPTIONS: {
  key: keyof EnhanceOptions;
  label: string;
  Icon: typeof Car;
}[] = [
  { key: "directions_car", label: "הוספת הוראות הגעה ברכב", Icon: Car },
  { key: "directions_transit", label: "הוספת הוראות הגעה בתחבורה ציבורית", Icon: Train },
  { key: "prices", label: "הוספת מחירים משוערים", Icon: Wallet },
  { key: "podcast", label: "הוספת פודקאסט היסטורי", Icon: Volume2 },
  { key: "links", label: "הוספת קישורים לאתרי האטרקציות/תחבורה", Icon: LinkIcon },
];

export default function BuilderStep2({
  onSubmit,
  onSkip,
  onBack,
  isEnhancing,
}: {
  onSubmit: (options: EnhanceOptions) => void;
  onSkip: () => void;
  onBack: () => void;
  isEnhancing: boolean;
}) {
  const [options, setOptions] = useState<EnhanceOptions>({});

  const toggle = (key: keyof EnhanceOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const hasSelection = Object.values(options).some(Boolean);
  const allSelected = OPTIONS.every(({ key }) => options[key]);
  const toggleAll = () =>
    setOptions(
      allSelected
        ? {}
        : OPTIONS.reduce((acc, { key }) => ({ ...acc, [key]: true }), {} as EnhanceOptions),
    );

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-2">שיפורים נוספים (אופציונלי)</h2>
      <p className="text-gray-600 mb-6">
        כל פירוט נוסף דורש פנייה נוספת לבינה המלאכותית, כך שהזמן שיקח תלוי בכמה תבחרו. אפשר גם לדלג
        ולהוסיף את אלה ידנית מאוחר יותר מתוך הלו"ז.
      </p>

      <label className="flex items-center gap-3 p-3 mb-3 bg-blue-50 rounded-xl border border-blue-100 cursor-pointer group">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="w-5 h-5 accent-blue-600 rounded"
        />
        <span className="text-sm font-semibold text-blue-700">בחר את כל האפשרויות</span>
      </label>

      <div className="space-y-3 mb-6">
        {OPTIONS.map(({ key, label, Icon }) => (
          <label
            key={key}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={!!options[key]}
              onChange={() => toggle(key)}
              className="w-5 h-5 accent-blue-600 rounded"
            />
            <Icon size={18} className="text-blue-500 shrink-0" />
            <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
              {label}
            </span>
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={isEnhancing}
          className="bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
        >
          <ChevronLeft size={20} />
          חזרה
        </button>
        {!hasSelection ? (
          <button
            onClick={onSkip}
            disabled={isEnhancing}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            דלג, המשך לסוכן
            <ChevronRight size={20} />
          </button>
        ) : (
          <button
            onClick={() => onSubmit(options)}
            disabled={isEnhancing}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            {isEnhancing ? "מוסיף את הפרטים..." : "הוסף את הפרטים שנבחרו"}
            {!isEnhancing && <ChevronRight size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}
