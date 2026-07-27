import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  ImageIcon,
  Map,
  MessageCircle,
  Pencil,
  Smartphone,
  X,
} from "lucide-react";
import type { Activity, TripData } from "../api";
import { useI18n, type Lang } from "../i18n/useI18n";
import { usePodcastPlayer } from "../hooks/usePodcastPlayer";
import {
  type AppDesign,
  type AppTab,
  BACKGROUND_TEMPLATE_CLASSES,
  DENSITY_CLASSES,
  effectiveCurrency,
  FONT_CLASSES,
  formatTripDates,
  headerBackgroundStyle,
  resolveAccentDark,
  resolveDefaultTab,
  themeClassForDesign,
} from "../services/appDesign";
import { hebrewWeekdayLetter, tripStartWeekdayIndex } from "../services/hebrewDate";
import { safeUrl } from "../services/safeUrl";
import type { AgentMessage } from "./ChatPanel";
import ChatPanel from "./ChatPanel";
import ItineraryList from "./ItineraryList";
import PodcastPlayer from "./PodcastPlayer";
import PriceSummary from "./PriceSummary";

// Leaflet + react-leaflet are large and only needed on the map tab — keep them
// out of the initial AppFrame chunk.
const MapView = lazy(() => import("./MapView"));

const SCROLL_ARROW_THRESHOLD = 4;

const NAV_TABS: {
  id: AppTab;
  icon: typeof Calendar;
  labelKey:
    | "appFrame.tab.itinerary"
    | "appFrame.tab.map"
    | "appFrame.tab.price"
    | "appFrame.tab.chat";
}[] = [
  { id: "itinerary", icon: Calendar, labelKey: "appFrame.tab.itinerary" },
  { id: "map", icon: Map, labelKey: "appFrame.tab.map" },
  { id: "price", icon: DollarSign, labelKey: "appFrame.tab.price" },
  { id: "chat", icon: MessageCircle, labelKey: "appFrame.tab.chat" },
];

function weekdayLabel(index: number, lang: Lang): string {
  if (lang === "he") return `${hebrewWeekdayLetter(index)}'`;
  const date = new Date(2024, 0, 7 + (((index % 7) + 7) % 7));
  return new Intl.DateTimeFormat(lang, { weekday: "short" }).format(date);
}

function startDayIndex(days: TripData["days"], startDay: number): number {
  if (!days.length) return 0;
  const idx = days.findIndex((d) => d.dayNum === startDay);
  return idx >= 0 ? idx : 0;
}

/**
 * The actual generated-app UI: header, day tabs, itinerary/map/chat content,
 * podcast player and bottom nav. Rendered inside a phone bezel by
 * PhonePreview (live builder preview) and full-screen by SharedAppPage
 * (the standalone link people share with trip participants).
 */
export default function AppFrame({
  tripData,
  appDesign,
  agentMessages,
  chatInput,
  onChangeChatInput,
  onSendMessage,
  chatEndRef,
  isSendingMessage,
  chatNotice,
  onRetryChat,
  onUpdateActivity,
  onAddActivity,
  onDeleteActivity,
  onUpdateTrip,
  isLocalOnly,
  localOnlyNoticeText,
  welcomeStorageKey,
}: {
  tripData: TripData;
  appDesign: AppDesign;
  agentMessages: AgentMessage[];
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  chatEndRef: RefObject<HTMLDivElement>;
  isSendingMessage?: boolean;
  chatNotice?: string | null;
  onRetryChat?: () => void;
  onUpdateActivity: (dayIndex: number, activityId: string, patch: Partial<Activity>) => void;
  onAddActivity?: (dayIndex: number, activity: Activity) => void;
  onDeleteActivity?: (dayIndex: number, activityId: string) => void;
  onUpdateTrip: (patch: Partial<Pick<TripData, "title" | "dates" | "photo_album_url">>) => void;
  isLocalOnly?: boolean;
  localOnlyNoticeText?: string;
  /** When set, a non-empty welcomeMessage is shown once until dismissed (shared-link flow). */
  welcomeStorageKey?: string;
}) {
  const { t, lang } = useI18n();
  const days = tripData.days ?? [];
  const hasTrip = days.length > 0;
  const [activeDay, setActiveDay] = useState(() => startDayIndex(days, appDesign.startDay));
  const [activeTab, setActiveTab] = useState<AppTab>(() =>
    resolveDefaultTab(appDesign.defaultTab, appDesign.visibleTabs),
  );
  const [focusActivityId, setFocusActivityId] = useState<string | null>(null);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [datesDraft, setDatesDraft] = useState("");
  const [albumUrlDraft, setAlbumUrlDraft] = useState("");
  const [showWelcome, setShowWelcome] = useState(false);
  const {
    playingPodcast,
    progress,
    error: podcastError,
    togglePlay,
    stop,
  } = usePodcastPlayer(tripData.language);
  const tabsRef = useRef<HTMLDivElement>(null);

  const themeClass = themeClassForDesign(appDesign);
  const accentColor = resolveAccentDark(appDesign);
  const density = DENSITY_CLASSES[appDesign.density];
  const fontClass = FONT_CLASSES[appDesign.font];
  const bgClass = BACKGROUND_TEMPLATE_CLASSES[appDesign.backgroundTemplate];
  const safeDayIdx = Math.min(activeDay, Math.max(0, days.length - 1));
  const day = days[safeDayIdx];
  const tripStartWeekday = tripData.startWeekday ?? tripStartWeekdayIndex(tripData.dates);
  const navById = Object.fromEntries(NAV_TABS.map((tab) => [tab.id, tab]));
  const visibleNavTabs = appDesign.tabOrder
    .filter((id) => appDesign.visibleTabs[id])
    .map((id) => navById[id])
    .filter(Boolean);
  const displayDates = formatTripDates(tripData.dates, appDesign.dateFormat);
  const currency = effectiveCurrency(appDesign);
  const albumUrl = safeUrl(tripData.photo_album_url);

  // Only jump to the configured start day when the trip's day *count* changes
  // (a genuinely different/reloaded trip, or a day added/removed) — not on
  // every edit, which creates a new `days` array reference (e.g. deleting a
  // single activity) without changing which day the user is looking at.
  useEffect(() => {
    setActiveDay(startDayIndex(days, appDesign.startDay));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appDesign.startDay, days.length]);

  useEffect(() => {
    setActiveTab(resolveDefaultTab(appDesign.defaultTab, appDesign.visibleTabs));
  }, [appDesign.defaultTab, appDesign.visibleTabs]);

  useEffect(() => {
    if (!appDesign.visibleTabs[activeTab]) {
      setActiveTab(resolveDefaultTab(appDesign.defaultTab, appDesign.visibleTabs));
    }
  }, [appDesign.visibleTabs, activeTab, appDesign.defaultTab]);

  useEffect(() => {
    if (!welcomeStorageKey || !appDesign.welcomeMessage.trim()) {
      setShowWelcome(false);
      return;
    }
    const dismissed = localStorage.getItem(`welcome-dismissed-${welcomeStorageKey}`);
    setShowWelcome(!dismissed);
  }, [welcomeStorageKey, appDesign.welcomeMessage]);

  const dismissWelcome = () => {
    if (welcomeStorageKey) {
      localStorage.setItem(`welcome-dismissed-${welcomeStorageKey}`, "1");
    }
    setShowWelcome(false);
  };

  const startEditingHeader = () => {
    setTitleDraft(tripData.title);
    setDatesDraft(tripData.dates);
    setAlbumUrlDraft(tripData.photo_album_url ?? "");
    setIsEditingHeader(true);
  };

  const saveHeaderEdit = () => {
    onUpdateTrip({
      title: titleDraft,
      dates: datesDraft,
      photo_album_url: albumUrlDraft.trim() || null,
    });
    setIsEditingHeader(false);
  };

  const scrollTabs = (direction: 1 | -1) => {
    tabsRef.current?.scrollBy({ left: -direction * 140, behavior: "smooth" });
  };

  const handleUpdateActivity = (activityId: string, patch: Partial<Activity>) =>
    onUpdateActivity(safeDayIdx, activityId, patch);

  const handleAddActivity = (activity: Activity) => onAddActivity?.(safeDayIdx, activity);

  const handleDeleteActivity = (activityId: string) => {
    onDeleteActivity?.(safeDayIdx, activityId);
    setFocusActivityId((prev) => (prev === activityId ? null : prev));
  };

  const handleShowOnMap = (activityId: string) => {
    if (!appDesign.visibleTabs.map) return;
    setFocusActivityId(activityId);
    setActiveTab("map");
  };

  const headerStyle = headerBackgroundStyle(appDesign);
  const useCustomHeader = Boolean(headerStyle);

  return (
    <div className={`w-full h-full flex flex-col ${fontClass} print:h-auto`}>
      <div
        className={`${useCustomHeader ? "" : themeClass} shrink-0 text-white pt-10 pb-4 px-6 shadow-md transition-colors duration-300 relative`}
        style={headerStyle}
      >
        {isEditingHeader ? (
          <div className="flex flex-col gap-2">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className={`${density.headerTitle} font-bold bg-white/10 placeholder-white/60 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-white/40`}
              placeholder={t("appFrame.titlePlaceholder")}
            />
            <input
              value={datesDraft}
              onChange={(e) => setDatesDraft(e.target.value)}
              className={`${density.headerSub} bg-white/10 placeholder-white/60 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-white/40`}
              placeholder={t("appFrame.datesPlaceholder")}
            />
            <input
              type="url"
              value={albumUrlDraft}
              onChange={(e) => setAlbumUrlDraft(e.target.value)}
              className={`${density.headerSub} bg-white/10 placeholder-white/60 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-white/40`}
              placeholder={t("appFrame.albumPlaceholder")}
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={saveHeaderEdit}
                aria-label={t("appFrame.saveHeaderAria")}
                className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 rounded-lg px-2 py-1"
              >
                <Check size={12} />
                {t("common.save")}
              </button>
              <button
                onClick={() => setIsEditingHeader(false)}
                aria-label={t("appFrame.cancelEditAria")}
                className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg px-2 py-1"
              >
                <X size={12} />
                {t("common.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className={`${density.headerTitle} font-bold`}>
                  {tripData.title || t("appFrame.titleFallback")}
                </h2>
                {albumUrl && (
                  <a
                    href={albumUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={t("appFrame.albumAria")}
                    className="text-white/70 hover:text-white"
                  >
                    <ImageIcon size={16} />
                  </a>
                )}
              </div>
              <p className={`${density.headerSub} opacity-80`}>
                {displayDates || t("appFrame.datesFallback")}
              </p>
              {appDesign.organizerName && (
                <p className={`${density.headerSub} opacity-90 mt-0.5`}>
                  {appDesign.organizerName}
                </p>
              )}
              {appDesign.tagline && (
                <p className={`${density.headerSub} opacity-70 italic mt-0.5`}>
                  {appDesign.tagline}
                </p>
              )}
            </div>
            {hasTrip && (
              <button
                onClick={startEditingHeader}
                aria-label={t("appFrame.editHeaderAria")}
                className="text-white/70 hover:text-white p-1"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {showWelcome && (
        <div className="shrink-0 bg-primary/10 border-b border-primary/20 px-4 py-3 flex items-start gap-3 animate-fade-in">
          <p className="flex-1 text-sm text-ink">{appDesign.welcomeMessage}</p>
          <button
            onClick={dismissWelcome}
            className="shrink-0 text-xs font-medium text-primary hover:text-primary-dark px-2 py-1 rounded-lg bg-white/80"
          >
            {t("step4.welcomeDismiss")}
          </button>
        </div>
      )}

      {isLocalOnly && hasTrip && (
        <p className="no-print shrink-0 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5 px-3">
          {localOnlyNoticeText ?? t("appFrame.localOnlyNotice")}
        </p>
      )}

      {hasTrip && (
        <div className="no-print shrink-0 flex items-center gap-2 bg-white border-b border-outline/40 px-3 py-2.5">
          {days.length > SCROLL_ARROW_THRESHOLD && (
            <button
              onClick={() => scrollTabs(-1)}
              aria-label={t("appFrame.scrollPrevAria")}
              className="flex-shrink-0 p-1 text-ink-muted hover:text-primary"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div ref={tabsRef} role="tablist" className="flex gap-2 overflow-x-auto hide-scrollbar">
            {days.map((d, idx) => (
              <button
                key={idx}
                role="tab"
                aria-selected={safeDayIdx === idx}
                aria-label={t("appFrame.day", { num: d.dayNum })}
                onClick={() => {
                  setActiveDay(idx);
                  setFocusActivityId(null);
                }}
                className={`px-4 py-1.5 rounded-full font-semibold text-sm whitespace-nowrap transition-colors ${
                  safeDayIdx === idx
                    ? "text-white"
                    : "bg-surface-container text-ink-muted hover:bg-surface-container-high"
                }`}
                style={safeDayIdx === idx ? { backgroundColor: accentColor } : undefined}
              >
                {t("appFrame.day", { num: d.dayNum })}
                {tripStartWeekday !== null && (
                  <span className="text-[10px] opacity-70">
                    {" "}
                    ({weekdayLabel(tripStartWeekday + d.dayNum - 1, lang)})
                  </span>
                )}
              </button>
            ))}
          </div>
          {days.length > SCROLL_ARROW_THRESHOLD && (
            <button
              onClick={() => scrollTabs(1)}
              aria-label={t("appFrame.scrollNextAria")}
              className="flex-shrink-0 p-1 text-ink-muted hover:text-primary"
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>
      )}

      <div
        className={`flex-1 overflow-y-auto ${density.contentPad} ${bgClass} pb-24 print:overflow-visible print:pb-0 print:bg-white`}
      >
        {!hasTrip && (
          <div className="h-full flex flex-col items-center justify-center text-center text-ink-muted gap-3 px-6">
            <Smartphone size={40} className="opacity-40" />
            <p className="text-sm">{t("appFrame.emptyState")}</p>
          </div>
        )}

        {/* One list per day: inactive days stay display:none on screen (so
            Testing Library / a11y tree only see the active day) and are forced
            visible again by the print stylesheet so the full itinerary prints. */}
        {hasTrip && appDesign.visibleTabs.itinerary && (
          <div
            className={activeTab === "itinerary" ? "space-y-8" : "space-y-8 print-only-block"}
            style={activeTab === "itinerary" ? undefined : { display: "none" }}
          >
            {days.map((d, idx) => (
              <section
                key={d.dayNum}
                className="break-inside-avoid print-day"
                style={idx === safeDayIdx ? undefined : { display: "none" }}
              >
                <h2
                  className="text-lg font-bold mb-3"
                  style={idx === safeDayIdx ? { display: "none" } : undefined}
                >
                  {t("appFrame.day", { num: d.dayNum })}
                </h2>
                <ItineraryList
                  activities={d.activities}
                  themeClass={themeClass}
                  accentColor={accentColor}
                  playingPodcast={idx === safeDayIdx ? playingPodcast : null}
                  onPlayPodcast={togglePlay}
                  onUpdateActivity={idx === safeDayIdx ? handleUpdateActivity : () => {}}
                  onAddActivity={
                    idx === safeDayIdx && onAddActivity ? handleAddActivity : undefined
                  }
                  onDeleteActivity={
                    idx === safeDayIdx && onDeleteActivity ? handleDeleteActivity : undefined
                  }
                  onShowOnMap={
                    idx === safeDayIdx && appDesign.visibleTabs.map ? handleShowOnMap : undefined
                  }
                  isLocalOnly={isLocalOnly}
                  currency={currency}
                  cardPad={density.cardPad}
                  cardLayout={appDesign.cardLayout}
                  cornerStyle={appDesign.cornerStyle}
                  showPodcasts={appDesign.showPodcasts}
                />
              </section>
            ))}
          </div>
        )}

        {hasTrip && activeTab === "map" && appDesign.visibleTabs.map && (
          <div className="h-full w-full animate-fade-in print:hidden">
            <Suspense
              fallback={
                <div className="h-full flex items-center justify-center text-ink-muted text-sm">
                  …
                </div>
              }
            >
              <MapView
                activities={day.activities}
                onUpdateActivity={handleUpdateActivity}
                onAddActivity={onAddActivity ? handleAddActivity : undefined}
                focusActivityId={focusActivityId}
                onClearFocus={() => setFocusActivityId(null)}
                mapTileStyle={appDesign.mapTileStyle}
                showRoutes={appDesign.showMapRoutes}
                routeColor={accentColor}
              />
            </Suspense>
          </div>
        )}

        {hasTrip && activeTab === "price" && appDesign.visibleTabs.price && (
          <div className="h-full animate-fade-in print:hidden">
            <PriceSummary tripData={tripData} currency={currency} />
          </div>
        )}

        {hasTrip && activeTab === "chat" && appDesign.visibleTabs.chat && (
          <div className="h-full animate-fade-in print:hidden">
            <ChatPanel
              agentMessages={agentMessages}
              chatEndRef={chatEndRef}
              chatInput={chatInput}
              onChangeChatInput={onChangeChatInput}
              onSendMessage={onSendMessage}
              isSending={isSendingMessage}
              notice={chatNotice}
              onRetry={onRetryChat}
              language={tripData.language}
            />
          </div>
        )}
      </div>

      {playingPodcast && (
        <div className="no-print">
          <PodcastPlayer
            activity={playingPodcast}
            progress={progress}
            error={podcastError}
            onClose={stop}
          />
        </div>
      )}

      {visibleNavTabs.length > 0 && (
        <div className="no-print shrink-0 bg-white border-t border-outline/40 flex justify-around p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
          {visibleNavTabs.map(({ id, icon: Icon, labelKey }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              aria-current={activeTab === id ? "page" : undefined}
              aria-label={t(labelKey)}
              className={`flex flex-col items-center gap-1 ${activeTab === id ? "text-secondary-dark" : "text-ink-muted"}`}
            >
              <Icon size={20} aria-hidden />
              <span className={density.navLabel}>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
