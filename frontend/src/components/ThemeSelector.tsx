export type Theme = "blue" | "green" | "dark";

const THEME_SWATCHES: { value: Theme; className: string }[] = [
  { value: "blue", className: "bg-blue-600 ring-blue-200" },
  { value: "green", className: "bg-emerald-600 ring-emerald-200" },
  { value: "dark", className: "bg-slate-800 ring-slate-200" },
];

export default function ThemeSelector({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <div className="flex gap-4">
      {THEME_SWATCHES.map((swatch) => (
        <button
          key={swatch.value}
          onClick={() => onChange(swatch.value)}
          className={`w-12 h-12 rounded-full transition-all ${swatch.className.split(" ")[0]} ${
            theme === swatch.value
              ? `ring-4 ${swatch.className.split(" ")[1]} scale-110`
              : "hover:scale-105"
          }`}
        ></button>
      ))}
    </div>
  );
}
