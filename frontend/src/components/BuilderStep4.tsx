import { useState } from "react";
import {
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  Loader2,
  PencilLine,
  Smartphone,
  Palette,
  Settings,
} from "lucide-react";
import type { TripData } from "../api";
import { getCurrentSession, saveTrip, shareTrip, signInWithGoogle } from "../services/tripsStore";
import ThemeSelector, { type Theme } from "./ThemeSelector";

export default function BuilderStep4({
  theme,
  onChangeTheme,
  tripData,
  tripId,
  onSaved,
  onBack,
}: {
  theme: Theme;
  onChangeTheme: (theme: Theme) => void;
  tripData: TripData;
  /** Id of the trip if it was already saved/loaded this session; null for a brand-new trip. */
  tripId: string | null;
  /** Called once a deploy succeeds, so the parent can track the (possibly new) trip id/name. */
  onSaved: (tripId: string, title: string) => void;
  onBack: () => void;
}) {
  const [tripName, setTripName] = useState(tripData.title || "הטיול שלי");
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [shareDays, setShareDays] = useState(0);

  const handleDeploy = async (asNewCopy: boolean) => {
    setStatus("working");
    setShareUrl(null);
    try {
      const namedTrip = { ...tripData, title: tripName.trim() || tripData.title };
      const session = getCurrentSession() ?? (await signInWithGoogle());
      const savedId = await saveTrip(session.uid, namedTrip, {
        theme,
        tripId: asNewCopy ? undefined : (tripId ?? undefined),
      });
      const url = await shareTrip(session.uid, savedId, namedTrip, theme, shareDays || undefined);
      setShareUrl(url);
      setStatus("done");
      onSaved(savedId, namedTrip.title);
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const handleCopy = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-2">שלב אחרון: עיצוב האפליקציה שלך</h2>
      <p className="text-gray-600 mb-6">
        בחרו צבעים, פונטים ותצורה לפני שיתוף האפליקציה למשתתפי הטיול.
      </p>

      <div className="space-y-6">
        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <PencilLine size={18} className="text-blue-500" /> שם הטיול
          </h3>
          <input
            type="text"
            value={tripName}
            onChange={(e) => setTripName(e.target.value)}
            placeholder="לדוגמה: טיול לרומא עם המשפחה"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Palette size={18} className="text-blue-500" /> בחירת צבע נושא
          </h3>
          <ThemeSelector theme={theme} onChange={onChangeTheme} />
        </div>

        <div className="bg-gray-50 p-5 rounded-xl border border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 mb-4 flex items-center gap-2">
            <Settings size={18} className="text-blue-500" /> תוקף קישור השיתוף
          </h3>
          <select
            value={shareDays}
            onChange={(e) => setShareDays(Number(e.target.value))}
            disabled={status === "working"}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value={7}>7 ימים</option>
            <option value={30}>30 יום</option>
            <option value={90}>90 יום</option>
            <option value={0}>לתמיד</option>
          </select>
        </div>
      </div>

      <button
        onClick={onBack}
        disabled={status === "working"}
        className="bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors mt-10"
      >
        <ChevronLeft size={20} />
        חזרה
      </button>

      {tripId ? (
        <div className="flex gap-3 mt-3">
          <button
            onClick={() => handleDeploy(false)}
            disabled={status === "working"}
            className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-70 disabled:cursor-wait text-white px-6 py-4 rounded-xl font-bold flex items-center gap-2 justify-center transition-all hover:shadow-lg hover:-translate-y-1"
          >
            {status === "working" ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <Smartphone size={22} />
            )}
            עדכון הטיול הקיים
          </button>
          <button
            onClick={() => handleDeploy(true)}
            disabled={status === "working"}
            className="flex-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-70 disabled:cursor-wait text-gray-700 px-6 py-4 rounded-xl font-bold flex items-center gap-2 justify-center transition-all"
          >
            <Copy size={20} />
            שמירה כעותק חדש
          </button>
        </div>
      ) : (
        <button
          onClick={() => handleDeploy(true)}
          disabled={status === "working"}
          className="bg-green-600 hover:bg-green-700 disabled:opacity-70 disabled:cursor-wait text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-2 w-full justify-center mt-3 transition-all hover:shadow-lg hover:-translate-y-1"
        >
          {status === "working" ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Smartphone size={24} />
          )}
          {status === "working" ? "משגר..." : "שגר למכשיר! שמרו ושתפו את הטיול"}
        </button>
      )}

      {status === "done" && shareUrl && (
        <div className="mt-4 bg-green-50 border border-green-200 rounded-xl p-4 flex flex-wrap items-center gap-2 animate-fade-in">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 min-w-0 bg-white border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-700 truncate"
          />
          <button
            onClick={handleCopy}
            className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? "הועתק!" : "העתק קישור"}
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-green-300 hover:bg-green-100 text-green-700 px-3 py-2 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
          >
            <ExternalLink size={16} />
            מעבר לקישור
          </a>
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-red-600 text-center mt-3">
          משהו השתבש בעת השמירה והשיתוף. נסו שוב בעוד רגע.
        </p>
      )}

      <p className="text-xs text-gray-400 text-center mt-2">
        השיגור שומר את הטיול בחשבון Google שלכם (תתבצע התחברות אם צריך) ומפיק קישור שניתן לשתף עם
        משתתפי הטיול.
      </p>
    </div>
  );
}
