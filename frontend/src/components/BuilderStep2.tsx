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
      <p className="text-ink-muted mb-6">
        כל פירוט נוסף דורש פנייה נוספת לבינה המלאכותית, כך שהזמן שיקח תלוי בכמה תבחרו. אפשר גם לדלג
        ולהוסיף את אלה ידנית מאוחר יותר מתוך הלו"ז.
      </p>

      <label className="flex items-center gap-3 p-3 mb-3 bg-primary/5 rounded-xl border border-primary/20 cursor-pointer group">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="w-5 h-5 accent-primary rounded"
        />
        <span className="text-sm font-semibold text-primary">בחר את כל האפשרויות</span>
      </label>

      <div className="space-y-3 mb-6">
        {OPTIONS.map(({ key, label, Icon }) => (
          <label
            key={key}
            className="flex items-center gap-3 p-3 bg-surface-container rounded-xl border border-outline/20 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={!!options[key]}
              onChange={() => toggle(key)}
              className="w-5 h-5 accent-primary rounded"
            />
            <Icon size={18} className="text-primary shrink-0" />
            <span className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
              {label}
            </span>
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={isEnhancing}
          className="bg-surface-container hover:bg-surface-container-high disabled:opacity-60 text-ink-muted px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
        >
          <ChevronLeft size={20} />
          חזרה
        </button>
        {!hasSelection ? (
          <button
            onClick={onSkip}
            disabled={isEnhancing}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            דלג, המשך לסוכן
            <ChevronRight size={20} />
          </button>
        ) : (
          <button
            onClick={() => onSubmit(options)}
            disabled={isEnhancing}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            {isEnhancing ? "מוסיף את הפרטים..." : "הוסף את הפרטים שנבחרו"}
            {!isEnhancing && <ChevronRight size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}
