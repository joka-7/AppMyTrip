import { Palette, Settings, Smartphone } from "lucide-react";
import ThemeSelector, { type Theme } from "./ThemeSelector";

export default function BuilderStep4({
  theme,
  onChangeTheme,
}: {
  theme: Theme;
  onChangeTheme: (theme: Theme) => void;
}) {
  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-2">שלב אחרון: עיצוב האפליקציה שלך</h2>
      <p className="text-gray-600 mb-6">
        בחרו צבעים, פונטים ותצורה לפני שיתוף האפליקציה למשתתפי הטיול.
      </p>

      <div className="space-y-6">
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Palette size={18} className="text-blue-500" /> בחירת צבע נושא
          </h3>
          <ThemeSelector theme={theme} onChange={onChangeTheme} />
        </div>

        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings size={18} className="text-blue-500" /> תכונות פעילות באפליקציה
          </h3>
          <div className="space-y-3">
            <label className="flex items-center gap-3 p-2 cursor-pointer group">
              <input type="checkbox" defaultChecked className="w-5 h-5 accent-blue-600 rounded" />
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                יצירת פודקאסט היסטורי (TTS)
              </span>
            </label>
            <label className="flex items-center gap-3 p-2 cursor-pointer group">
              <input type="checkbox" defaultChecked className="w-5 h-5 accent-blue-600 rounded" />
              <span className="text-sm font-medium text-gray-700 group-hover:text-blue-600 transition-colors">
                מפת התמצאות עם נעצים
              </span>
            </label>
          </div>
        </div>
      </div>

      <button
        disabled
        title="שיגור לאפליקציית מובייל אינו ממומש עדיין — בשלב זה אפשר לשמור ולשתף את הטיול באמצעות כפתור העננה בראש העמוד"
        className="bg-gray-300 text-gray-500 px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-2 w-full justify-center mt-10 cursor-not-allowed"
      >
        <Smartphone size={24} />
        שגר למכשיר! (בקרוב)
      </button>
      <p className="text-xs text-gray-400 text-center mt-2">
        כדי לשמור ולשתף את הטיול כעת, השתמשו בכפתור העננה בראש העמוד.
      </p>
    </div>
  );
}
