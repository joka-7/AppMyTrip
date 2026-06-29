const STEPS = [
  { num: 1, label: "הזנת טקסט" },
  { num: 2, label: "שיפורים נוספים" },
  { num: 3, label: "סוכן השלמות" },
  { num: 4, label: "עיצוב אפליקציה" },
];

export default function ProgressBar({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-between mb-10 relative">
      <div className="absolute left-0 right-0 top-1/2 h-1 bg-gray-100 -z-10"></div>
      {STEPS.map((s) => (
        <div key={s.num} className="flex flex-col items-center gap-2 bg-white px-2">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-500 ${
              step >= s.num ? "bg-blue-600 text-white shadow-md" : "bg-gray-200 text-gray-400"
            }`}
          >
            {s.num}
          </div>
          <span
            className={`text-xs ${step >= s.num ? "text-gray-800 font-medium" : "text-gray-400"}`}
          >
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
