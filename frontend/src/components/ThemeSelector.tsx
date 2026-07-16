import type { Theme } from "../services/appDesign";
import { THEME_SWATCH_CLASSES } from "../services/appDesign";

export type { Theme };

const THEME_ORDER: Theme[] = ["blue", "green", "dark", "coral", "purple", "sand"];

export default function ThemeSelector({
  theme,
  onChange,
}: {
  theme: Theme;
  onChange: (theme: Theme) => void;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      {THEME_ORDER.map((value) => {
        const swatch = THEME_SWATCH_CLASSES[value];
        return (
          <button
            key={value}
            type="button"
            onClick={() => onChange(value)}
            className={`w-10 h-10 rounded-full transition-all ${swatch.bg} ${
              theme === value ? `ring-4 ${swatch.ring} scale-110` : "hover:scale-105"
            }`}
          />
        );
      })}
    </div>
  );
}
