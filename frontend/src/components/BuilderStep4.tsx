import { useEffect, useRef, useState } from "react";
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
import { useI18n } from "../i18n/useI18n";
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
  const { t, lang } = useI18n();
  const [tripName, setTripName] = useState(tripData.title || t("step4.defaultTripName"));
  // Only the untitled-trip placeholder should track the UI language; a real
  // trip title (typed or loaded) must never be overwritten by a language switch.
  const tripNameTouchedRef = useRef(Boolean(tripData.title));
  const handleChangeTripName = (value: string) => {
    tripNameTouchedRef.current = true;
    setTripName(value);
  };
  useEffect(() => {
    if (!tripNameTouchedRef.current) setTripName(t("step4.defaultTripName"));
  }, [lang, t]);
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
      <h2 className="text-2xl font-bold mb-2">{t("step4.heading")}</h2>
      <p className="text-ink-muted mb-6">{t("step4.subtitle")}</p>

      <div className="space-y-6">
        <div className="bg-surface-container p-5 rounded-xl border border-outline/20">
          <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
            <PencilLine size={18} className="text-primary" /> {t("step4.tripNameLabel")}
          </h3>
          <input
            type="text"
            value={tripName}
            onChange={(e) => handleChangeTripName(e.target.value)}
            placeholder={t("step4.tripNamePlaceholder")}
            className="w-full border border-outline/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        <div className="bg-surface-container p-5 rounded-xl border border-outline/20">
          <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
            <Palette size={18} className="text-primary" /> {t("step4.themeLabel")}
          </h3>
          <ThemeSelector theme={theme} onChange={onChangeTheme} />
        </div>

        <div className="bg-surface-container p-5 rounded-xl border border-outline/20">
          <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
            <Settings size={18} className="text-primary" /> {t("step4.shareValidityLabel")}
          </h3>
          <select
            value={shareDays}
            onChange={(e) => setShareDays(Number(e.target.value))}
            disabled={status === "working"}
            className="w-full border border-outline/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            <option value={7}>{t("share.days7")}</option>
            <option value={30}>{t("share.days30")}</option>
            <option value={90}>{t("share.days90")}</option>
            <option value={0}>{t("share.forever")}</option>
          </select>
        </div>
      </div>

      <button
        onClick={onBack}
        disabled={status === "working"}
        className="bg-surface-container hover:bg-surface-container-high disabled:opacity-60 text-ink-muted px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors mt-10"
      >
        <ChevronLeft size={20} />
        {t("common.back")}
      </button>

      {tripId ? (
        <div className="flex gap-3 mt-3">
          <button
            onClick={() => handleDeploy(false)}
            disabled={status === "working"}
            className="flex-1 bg-secondary hover:bg-secondary-dark disabled:opacity-70 disabled:cursor-wait text-white px-6 py-4 rounded-xl font-bold flex items-center gap-2 justify-center transition-all hover:shadow-lg hover:-translate-y-1"
          >
            {status === "working" ? (
              <Loader2 size={22} className="animate-spin" />
            ) : (
              <Smartphone size={22} />
            )}
            {t("step4.updateExisting")}
          </button>
          <button
            onClick={() => handleDeploy(true)}
            disabled={status === "working"}
            className="flex-1 bg-surface-container hover:bg-surface-container-high disabled:opacity-70 disabled:cursor-wait text-ink-muted px-6 py-4 rounded-xl font-bold flex items-center gap-2 justify-center transition-all"
          >
            <Copy size={20} />
            {t("step4.saveAsNew")}
          </button>
        </div>
      ) : (
        <button
          onClick={() => handleDeploy(true)}
          disabled={status === "working"}
          className="bg-secondary hover:bg-secondary-dark disabled:opacity-70 disabled:cursor-wait text-white px-8 py-4 rounded-xl font-bold text-lg flex items-center gap-2 w-full justify-center mt-3 transition-all hover:shadow-lg hover:-translate-y-1"
        >
          {status === "working" ? (
            <Loader2 size={24} className="animate-spin" />
          ) : (
            <Smartphone size={24} />
          )}
          {status === "working" ? t("step4.deploying") : t("step4.deploy")}
        </button>
      )}

      {status === "done" && shareUrl && (
        <div className="mt-4 bg-primary/5 border border-primary/20 rounded-xl p-4 flex flex-wrap items-center gap-2 animate-fade-in">
          <input
            readOnly
            value={shareUrl}
            className="flex-1 min-w-0 bg-white border border-outline/40 rounded-lg px-3 py-2 text-sm text-ink truncate"
          />
          <button
            onClick={handleCopy}
            className="bg-primary hover:bg-primary-dark text-white px-3 py-2 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
            {copied ? t("step4.copied") : t("step4.copyLink")}
          </button>
          <a
            href={shareUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="bg-white border border-outline/40 hover:bg-surface-container text-primary px-3 py-2 rounded-lg flex items-center gap-1 text-sm font-medium transition-colors"
          >
            <ExternalLink size={16} />
            {t("step4.openLink")}
          </a>
        </div>
      )}

      {status === "error" && (
        <p className="text-sm text-red-600 text-center mt-3">{t("step4.deployError")}</p>
      )}

      <p className="text-xs text-ink-muted text-center mt-2">{t("step4.deployHint")}</p>
    </div>
  );
}
