import { useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronLeft,
  Copy,
  ExternalLink,
  Layout,
  Loader2,
  Smartphone,
  Palette,
  Settings,
  Sparkles,
  User,
} from "lucide-react";
import type { TripData } from "../api";
import { useI18n } from "../i18n/useI18n";
import {
  type AppDesign,
  type AppDensity,
  type AppFont,
  type AppTab,
  type BackgroundTemplate,
  type CardLayout,
  type CornerStyle,
  type DateFormatStyle,
  type HeaderStyle,
  type MapTileStyle,
  CURRENCIES,
  CUSTOM_CURRENCY,
  type VisibleTabs,
} from "../services/appDesign";
import { getCurrentSession, saveTrip, shareTrip, signInWithGoogle } from "../services/tripsStore";
import ThemeSelector from "./ThemeSelector";

const FONTS: AppFont[] = ["sans", "rounded", "serif"];
const DENSITIES: AppDensity[] = ["compact", "comfortable", "spacious"];
const TABS: AppTab[] = ["itinerary", "map", "price", "chat"];
const HEADER_STYLES: HeaderStyle[] = ["solid", "gradient", "photo"];
const BACKGROUNDS: BackgroundTemplate[] = ["plain", "dots", "grid", "waves", "warm", "cool"];
const CARD_LAYOUTS: CardLayout[] = ["list", "timeline"];
const CORNERS: CornerStyle[] = ["rounded", "sharp"];
const DATE_FORMATS: DateFormatStyle[] = ["short", "numeric"];
const MAP_TILES: MapTileStyle[] = ["streets", "satellite"];
const TAB_LABEL_KEYS = {
  itinerary: "appFrame.tab.itinerary",
  map: "appFrame.tab.map",
  price: "appFrame.tab.price",
  chat: "appFrame.tab.chat",
} as const;

const inputClass =
  "w-full border border-outline/40 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50";

export default function BuilderStep4({
  appDesign,
  onChangeAppDesign,
  tripData,
  onUpdateTrip,
  tripId,
  onSaved,
  onBack,
}: {
  appDesign: AppDesign;
  onChangeAppDesign: (patch: Partial<AppDesign>) => void;
  tripData: TripData;
  onUpdateTrip: (patch: Partial<Pick<TripData, "title" | "photo_album_url">>) => void;
  /** Id of the trip if it was already saved/loaded this session; null for a brand-new trip. */
  tripId: string | null;
  /** Called once a deploy succeeds, so the parent can track the (possibly new) trip id/name. */
  onSaved: (tripId: string, title: string) => void;
  onBack: () => void;
}) {
  const { t, lang } = useI18n();
  const [tripName, setTripName] = useState(tripData.title || t("step4.defaultTripName"));
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

  const patchDesign = (patch: Partial<AppDesign>) => onChangeAppDesign(patch);

  const patchVisibleTab = (tab: keyof VisibleTabs, visible: boolean) => {
    const next = { ...appDesign.visibleTabs, [tab]: visible };
    const anyVisible = Object.values(next).some(Boolean);
    patchDesign({
      visibleTabs: anyVisible ? next : { ...next, itinerary: true },
    });
  };

  const moveTab = (tab: AppTab, direction: -1 | 1) => {
    const order = [...appDesign.tabOrder];
    const idx = order.indexOf(tab);
    if (idx < 0) return;
    const swap = idx + direction;
    if (swap < 0 || swap >= order.length) return;
    [order[idx], order[swap]] = [order[swap], order[idx]];
    patchDesign({ tabOrder: order });
  };

  const toggleGroup = (
    label: string,
    values: readonly string[],
    current: string,
    keyPrefix: string,
    onPick: (value: string) => void,
  ) => (
    <div>
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <div className="flex flex-wrap gap-2 mt-2">
        {values.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onPick(value)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              current === value
                ? "bg-primary text-white"
                : "bg-white border border-outline/40 text-ink-muted hover:bg-surface-container"
            }`}
          >
            {t(`${keyPrefix}.${value}` as "step4.font.sans")}
          </button>
        ))}
      </div>
    </div>
  );

  const handleDeploy = async (asNewCopy: boolean) => {
    setStatus("working");
    setShareUrl(null);
    try {
      const namedTrip = { ...tripData, title: tripName.trim() || tripData.title };
      const session = getCurrentSession() ?? (await signInWithGoogle());
      const savedId = await saveTrip(session.uid, namedTrip, {
        appDesign,
        tripId: asNewCopy ? undefined : (tripId ?? undefined),
      });
      const url = await shareTrip(
        session.uid,
        savedId,
        namedTrip,
        appDesign,
        shareDays || undefined,
      );
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
            <User size={18} className="text-primary" /> {t("step4.sectionIdentity")}
          </h3>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">{t("step4.tripNameLabel")}</span>
              <input
                type="text"
                value={tripName}
                onChange={(e) => handleChangeTripName(e.target.value)}
                placeholder={t("step4.tripNamePlaceholder")}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                {t("step4.organizerLabel")}
              </span>
              <input
                type="text"
                value={appDesign.organizerName}
                onChange={(e) => patchDesign({ organizerName: e.target.value })}
                placeholder={t("step4.organizerPlaceholder")}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">{t("step4.taglineLabel")}</span>
              <input
                type="text"
                value={appDesign.tagline}
                onChange={(e) => patchDesign({ tagline: e.target.value })}
                placeholder={t("step4.taglinePlaceholder")}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">{t("step4.albumLabel")}</span>
              <input
                type="url"
                value={tripData.photo_album_url ?? ""}
                onChange={(e) => onUpdateTrip({ photo_album_url: e.target.value.trim() || null })}
                placeholder={t("step4.albumPlaceholder")}
                className={`${inputClass} mt-1`}
                dir="ltr"
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                {t("step4.dateFormatLabel")}
              </span>
              <select
                value={appDesign.dateFormat}
                onChange={(e) => patchDesign({ dateFormat: e.target.value as DateFormatStyle })}
                className={`${inputClass} mt-1`}
              >
                {DATE_FORMATS.map((fmt) => (
                  <option key={fmt} value={fmt}>
                    {t(`step4.dateFormat.${fmt}`)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">{t("step4.currencyLabel")}</span>
              <select
                value={
                  CURRENCIES.includes(appDesign.currency as (typeof CURRENCIES)[number])
                    ? appDesign.currency
                    : CUSTOM_CURRENCY
                }
                onChange={(e) => patchDesign({ currency: e.target.value })}
                className={`${inputClass} mt-1`}
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
                <option value={CUSTOM_CURRENCY}>{t("step4.currencyCustom")}</option>
              </select>
              {(appDesign.currency === CUSTOM_CURRENCY ||
                !CURRENCIES.includes(appDesign.currency as (typeof CURRENCIES)[number])) && (
                <input
                  type="text"
                  value={appDesign.customCurrency}
                  onChange={(e) =>
                    patchDesign({ currency: CUSTOM_CURRENCY, customCurrency: e.target.value })
                  }
                  placeholder={t("step4.currencyCustomPlaceholder")}
                  className={`${inputClass} mt-2`}
                  dir="ltr"
                />
              )}
            </label>
          </div>
        </div>

        <div className="bg-surface-container p-5 rounded-xl border border-outline/20">
          <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
            <Palette size={18} className="text-primary" /> {t("step4.sectionLook")}
          </h3>
          <div className="space-y-4">
            <div>
              <span className="text-xs font-medium text-ink-muted">{t("step4.themeLabel")}</span>
              <div className="mt-2">
                <ThemeSelector
                  theme={appDesign.theme}
                  onChange={(theme) => patchDesign({ theme })}
                />
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                {t("step4.accentColorLabel")}
              </span>
              <div className="flex gap-2 mt-2 items-center">
                <input
                  type="color"
                  value={appDesign.customAccentColor ?? "#1a5276"}
                  onChange={(e) => patchDesign({ customAccentColor: e.target.value })}
                  className="w-10 h-10 rounded-lg border border-outline/40 cursor-pointer"
                />
                <input
                  type="text"
                  value={appDesign.customAccentColor ?? ""}
                  onChange={(e) =>
                    patchDesign({ customAccentColor: e.target.value.trim() || null })
                  }
                  placeholder="#1a5276"
                  className={`${inputClass} flex-1`}
                  dir="ltr"
                />
                <button
                  type="button"
                  onClick={() => patchDesign({ customAccentColor: null })}
                  className="text-xs text-ink-muted hover:text-primary px-2 py-1"
                >
                  {t("common.cancel")}
                </button>
              </div>
            </label>
            {toggleGroup(
              t("step4.headerStyleLabel"),
              HEADER_STYLES,
              appDesign.headerStyle,
              "step4.headerStyle",
              (v) => patchDesign({ headerStyle: v as HeaderStyle }),
            )}
            {toggleGroup(t("step4.fontLabel"), FONTS, appDesign.font, "step4.font", (v) =>
              patchDesign({ font: v as AppFont }),
            )}
            {toggleGroup(
              t("step4.densityLabel"),
              DENSITIES,
              appDesign.density,
              "step4.density",
              (v) => patchDesign({ density: v as AppDensity }),
            )}
            {toggleGroup(
              t("step4.backgroundTemplateLabel"),
              BACKGROUNDS,
              appDesign.backgroundTemplate,
              "step4.backgroundTemplate",
              (v) => patchDesign({ backgroundTemplate: v as BackgroundTemplate }),
            )}
            {toggleGroup(
              t("step4.cardLayoutLabel"),
              CARD_LAYOUTS,
              appDesign.cardLayout,
              "step4.cardLayout",
              (v) => patchDesign({ cardLayout: v as CardLayout }),
            )}
            {toggleGroup(
              t("step4.cornerStyleLabel"),
              CORNERS,
              appDesign.cornerStyle,
              "step4.cornerStyle",
              (v) => patchDesign({ cornerStyle: v as CornerStyle }),
            )}
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                {t("step4.headerImageLabel")}
              </span>
              <input
                type="url"
                value={appDesign.headerImageUrl ?? ""}
                onChange={(e) =>
                  patchDesign({
                    headerImageUrl: e.target.value.trim() || null,
                    ...(e.target.value.trim() ? { headerStyle: "photo" as HeaderStyle } : {}),
                  })
                }
                placeholder={t("step4.headerImagePlaceholder")}
                className={`${inputClass} mt-1`}
                dir="ltr"
              />
            </label>
          </div>
        </div>

        <div className="bg-surface-container p-5 rounded-xl border border-outline/20">
          <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
            <Layout size={18} className="text-primary" /> {t("step4.sectionBehavior")}
          </h3>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                {t("step4.defaultTabLabel")}
              </span>
              <select
                value={appDesign.defaultTab}
                onChange={(e) => patchDesign({ defaultTab: e.target.value as AppTab })}
                className={`${inputClass} mt-1`}
              >
                {TABS.map((tab) => (
                  <option key={tab} value={tab}>
                    {t(TAB_LABEL_KEYS[tab])}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">{t("step4.startDayLabel")}</span>
              <select
                value={appDesign.startDay}
                onChange={(e) => patchDesign({ startDay: Number(e.target.value) })}
                className={`${inputClass} mt-1`}
              >
                {(tripData.days ?? []).length > 0 ? (
                  tripData.days.map((d) => (
                    <option key={d.dayNum} value={d.dayNum}>
                      {t("appFrame.day", { num: d.dayNum })}
                    </option>
                  ))
                ) : (
                  <option value={1}>{t("appFrame.day", { num: 1 })}</option>
                )}
              </select>
            </label>
            <div>
              <span className="text-xs font-medium text-ink-muted">
                {t("step4.visibleTabsLabel")}
              </span>
              <div className="flex flex-wrap gap-3 mt-2">
                {TABS.map((tab) => (
                  <label key={tab} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="checkbox"
                      checked={appDesign.visibleTabs[tab]}
                      onChange={(e) => patchVisibleTab(tab, e.target.checked)}
                      className="rounded border-outline/40 text-primary focus:ring-primary/50"
                    />
                    {t(TAB_LABEL_KEYS[tab])}
                  </label>
                ))}
              </div>
            </div>
            <div>
              <span className="text-xs font-medium text-ink-muted">{t("step4.tabOrderLabel")}</span>
              <ul className="mt-2 space-y-1">
                {appDesign.tabOrder.map((tab) => (
                  <li
                    key={tab}
                    className="flex items-center justify-between gap-2 bg-white border border-outline/30 rounded-lg px-3 py-2 text-sm"
                  >
                    <span>{t(TAB_LABEL_KEYS[tab])}</span>
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => moveTab(tab, -1)}
                        className="text-xs px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high"
                        aria-label={t("step4.tabMoveUp")}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveTab(tab, 1)}
                        className="text-xs px-2 py-1 rounded bg-surface-container hover:bg-surface-container-high"
                        aria-label={t("step4.tabMoveDown")}
                      >
                        ↓
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {toggleGroup(
              t("step4.mapTileLabel"),
              MAP_TILES,
              appDesign.mapTileStyle,
              "step4.mapTile",
              (v) => patchDesign({ mapTileStyle: v as MapTileStyle }),
            )}
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={appDesign.showMapRoutes}
                onChange={(e) => patchDesign({ showMapRoutes: e.target.checked })}
                className="rounded border-outline/40 text-primary focus:ring-primary/50"
              />
              {t("step4.showMapRoutes")}
            </label>
            <label className="flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={appDesign.showPodcasts}
                onChange={(e) => patchDesign({ showPodcasts: e.target.checked })}
                className="rounded border-outline/40 text-primary focus:ring-primary/50"
              />
              {t("step4.showPodcasts")}
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted flex items-center gap-1">
                <Sparkles size={14} /> {t("step4.welcomeLabel")}
              </span>
              <textarea
                value={appDesign.welcomeMessage}
                onChange={(e) => patchDesign({ welcomeMessage: e.target.value })}
                placeholder={t("step4.welcomePlaceholder")}
                rows={2}
                className={`${inputClass} mt-1 resize-y`}
              />
            </label>
          </div>
        </div>

        <div className="bg-surface-container p-5 rounded-xl border border-outline/20">
          <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
            <Smartphone size={18} className="text-primary" /> {t("step4.sectionBranding")}
          </h3>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">
                {t("step4.pwaShortNameLabel")}
              </span>
              <input
                type="text"
                value={appDesign.pwaShortName}
                onChange={(e) => patchDesign({ pwaShortName: e.target.value })}
                placeholder={t("step4.pwaShortNamePlaceholder")}
                maxLength={12}
                className={`${inputClass} mt-1`}
              />
            </label>
            <label className="block">
              <span className="text-xs font-medium text-ink-muted">{t("step4.pwaIconLabel")}</span>
              <input
                type="url"
                value={appDesign.pwaIconUrl ?? ""}
                onChange={(e) => patchDesign({ pwaIconUrl: e.target.value.trim() || null })}
                placeholder={t("step4.pwaIconPlaceholder")}
                className={`${inputClass} mt-1`}
                dir="ltr"
              />
            </label>
          </div>
        </div>

        <div className="bg-surface-container p-5 rounded-xl border border-outline/20">
          <h3 className="text-sm font-bold text-ink mb-4 flex items-center gap-2">
            <Settings size={18} className="text-primary" /> {t("step4.shareValidityLabel")}
          </h3>
          <select
            value={shareDays}
            onChange={(e) => setShareDays(Number(e.target.value))}
            disabled={status === "working"}
            className={inputClass}
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
