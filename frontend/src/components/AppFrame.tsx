import { useRef, useState } from "react";
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
import { usePodcastPlayer } from "../hooks/usePodcastPlayer";
import { hebrewWeekdayLetter, parseTripStartDate } from "../services/hebrewDate";
import type { AgentMessage } from "./ChatPanel";
import ChatPanel from "./ChatPanel";
import ItineraryList from "./ItineraryList";
import MapView from "./MapView";
import PodcastPlayer from "./PodcastPlayer";
import PriceSummary from "./PriceSummary";
import type { Theme } from "./ThemeSelector";

const THEME_CLASSES: Record<Theme, string> = {
  blue: "bg-primary",
  green: "bg-emerald-700",
  dark: "bg-[#12344d]",
};

// Above this many days, the tab strip can overflow its visible width, so we
// add explicit scroll buttons rather than relying on a hidden scrollbar.
const SCROLL_ARROW_THRESHOLD = 4;

/**
 * The actual generated-app UI: header, day tabs, itinerary/map/chat content,
 * podcast player and bottom nav. Rendered inside a phone bezel by
 * PhonePreview (live builder preview) and full-screen by SharedAppPage
 * (the standalone link people share with trip participants).
 */
export default function AppFrame({
  tripData,
  theme,
  agentMessages,
  chatInput,
  onChangeChatInput,
  onSendMessage,
  chatEndRef,
  isSendingMessage,
  chatNotice,
  onUpdateActivity,
  onAddActivity,
  onUpdateTrip,
  isLocalOnly,
  localOnlyNoticeText,
}: {
  tripData: TripData;
  theme: Theme;
  agentMessages: AgentMessage[];
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  chatEndRef: RefObject<HTMLDivElement>;
  isSendingMessage?: boolean;
  chatNotice?: string | null;
  onUpdateActivity: (dayIndex: number, activityId: string, patch: Partial<Activity>) => void;
  onAddActivity?: (dayIndex: number, activity: Activity) => void;
  onUpdateTrip: (patch: Partial<Pick<TripData, "title" | "dates" | "photo_album_url">>) => void;
  isLocalOnly?: boolean;
  localOnlyNoticeText?: string;
}) {
  const [activeDay, setActiveDay] = useState(0);
  const [activeTab, setActiveTab] = useState<"itinerary" | "map" | "price" | "chat">("itinerary");
  const [focusActivityId, setFocusActivityId] = useState<string | null>(null);
  const [isEditingHeader, setIsEditingHeader] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [datesDraft, setDatesDraft] = useState("");
  const [albumUrlDraft, setAlbumUrlDraft] = useState("");
  const { playingPodcast, progress, error: podcastError, togglePlay, stop } = usePodcastPlayer();
  const tabsRef = useRef<HTMLDivElement>(null);

  const themeClass = THEME_CLASSES[theme] ?? THEME_CLASSES.blue;

  // Empty-state safe accessors: tripData may have no days yet (before parsing).
  const days = tripData.days ?? [];
  const hasTrip = days.length > 0;
  const safeDayIdx = Math.min(activeDay, Math.max(0, days.length - 1));
  const day = days[safeDayIdx];
  const tripStartDate = parseTripStartDate(tripData.dates);

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

  // The tab strip is RTL, so a forward (left-to-right in DOM order) scroll
  // direction is the opposite sign of what scrollBy expects in an LTR
  // container — flip it here rather than at each call site.
  const scrollTabs = (direction: 1 | -1) => {
    tabsRef.current?.scrollBy({ left: -direction * 140, behavior: "smooth" });
  };

  const handleUpdateActivity = (activityId: string, patch: Partial<Activity>) =>
    onUpdateActivity(safeDayIdx, activityId, patch);

  const handleAddActivity = (activity: Activity) => onAddActivity?.(safeDayIdx, activity);

  const handleShowOnMap = (activityId: string) => {
    setFocusActivityId(activityId);
    setActiveTab("map");
  };

  return (
    <div className="w-full h-full flex flex-col bg-surface">
      {/* App Header */}
      <div
        className={`${themeClass} shrink-0 text-white pt-10 pb-4 px-6 shadow-md transition-colors duration-300`}
      >
        {isEditingHeader ? (
          <div className="flex flex-col gap-2">
            <input
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              className="text-xl font-bold bg-white/10 placeholder-white/60 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-white/40"
              placeholder="שם הטיול"
            />
            <input
              value={datesDraft}
              onChange={(e) => setDatesDraft(e.target.value)}
              className="text-sm bg-white/10 placeholder-white/60 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-white/40"
              placeholder="טווח תאריכים"
            />
            <input
              type="url"
              value={albumUrlDraft}
              onChange={(e) => setAlbumUrlDraft(e.target.value)}
              className="text-sm bg-white/10 placeholder-white/60 rounded-lg px-2 py-1 outline-none focus:ring-2 focus:ring-white/40"
              placeholder="קישור לאלבום תמונות (אופציונלי)"
            />
            <div className="flex gap-2 mt-1">
              <button
                onClick={saveHeaderEdit}
                aria-label="שמירת שם וטווח תאריכים"
                className="flex items-center gap-1 text-xs bg-white/20 hover:bg-white/30 rounded-lg px-2 py-1"
              >
                <Check size={12} />
                שמירה
              </button>
              <button
                onClick={() => setIsEditingHeader(false)}
                aria-label="ביטול עריכה"
                className="flex items-center gap-1 text-xs bg-white/10 hover:bg-white/20 rounded-lg px-2 py-1"
              >
                <X size={12} />
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xl font-bold">{tripData.title || "האפליקציה שלך"}</h2>
                {tripData.photo_album_url && (
                  <a
                    href={tripData.photo_album_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="אלבום תמונות הטיול"
                    className="text-white/70 hover:text-white"
                  >
                    <ImageIcon size={16} />
                  </a>
                )}
              </div>
              <p className="text-sm opacity-80">
                {tripData.dates || "התצוגה המקדימה תתעדכן לפי הטקסט"}
              </p>
            </div>
            {hasTrip && (
              <button
                onClick={startEditingHeader}
                aria-label="עריכת שם וטווח תאריכים"
                className="text-white/70 hover:text-white p-1"
              >
                <Pencil size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {isLocalOnly && hasTrip && (
        <p className="shrink-0 bg-amber-50 border-b border-amber-200 text-amber-800 text-xs text-center py-1.5 px-3">
          {localOnlyNoticeText ?? "שינויים שתבצעו כאן יישמרו רק בדפדפן הזה ולא יישלחו לשרת."}
        </p>
      )}

      {/* Days Tabs */}
      {hasTrip && (
        <div className="shrink-0 flex items-center gap-2 bg-white border-b border-outline/40 px-3 py-2.5">
          {days.length > SCROLL_ARROW_THRESHOLD && (
            <button
              onClick={() => scrollTabs(-1)}
              aria-label="גלילה לימים קודמים"
              className="flex-shrink-0 p-1 text-ink-muted hover:text-primary"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div ref={tabsRef} className="flex gap-2 overflow-x-auto hide-scrollbar">
            {days.map((d, idx) => (
              <button
                key={idx}
                onClick={() => {
                  setActiveDay(idx);
                  setFocusActivityId(null);
                }}
                className={`px-4 py-1.5 rounded-full font-semibold text-sm whitespace-nowrap transition-colors ${
                  safeDayIdx === idx
                    ? "bg-primary-dark text-white"
                    : "bg-surface-container text-ink-muted hover:bg-surface-container-high"
                }`}
              >
                יום {d.dayNum}
                {tripStartDate && (
                  <span className="text-[10px] opacity-70">
                    {" "}
                    (
                    {hebrewWeekdayLetter(
                      new Date(tripStartDate.getTime() + (d.dayNum - 1) * 86400000),
                    )}
                    ')
                  </span>
                )}
              </button>
            ))}
          </div>
          {days.length > SCROLL_ARROW_THRESHOLD && (
            <button
              onClick={() => scrollTabs(1)}
              aria-label="גלילה לימים נוספים"
              className="flex-shrink-0 p-1 text-ink-muted hover:text-primary"
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-surface pb-24">
        {!hasTrip && (
          <div className="h-full flex flex-col items-center justify-center text-center text-ink-muted gap-3 px-6">
            <Smartphone size={40} className="opacity-40" />
            <p className="text-sm">
              הזינו את תיאור הטיול כדי לראות כאן תצוגה מקדימה חיה של האפליקציה.
            </p>
          </div>
        )}

        {hasTrip && activeTab === "itinerary" && (
          <ItineraryList
            activities={day.activities}
            themeClass={themeClass}
            playingPodcast={playingPodcast}
            onPlayPodcast={togglePlay}
            onUpdateActivity={handleUpdateActivity}
            onAddActivity={onAddActivity ? handleAddActivity : undefined}
            onShowOnMap={handleShowOnMap}
            isLocalOnly={isLocalOnly}
          />
        )}

        {hasTrip && activeTab === "map" && (
          <div className="h-full w-full animate-fade-in">
            <MapView
              activities={day.activities}
              onUpdateActivity={handleUpdateActivity}
              focusActivityId={focusActivityId}
              onClearFocus={() => setFocusActivityId(null)}
            />
          </div>
        )}

        {hasTrip && activeTab === "price" && (
          <div className="h-full animate-fade-in">
            <PriceSummary tripData={tripData} />
          </div>
        )}

        {hasTrip && activeTab === "chat" && (
          <div className="h-full animate-fade-in">
            <ChatPanel
              agentMessages={agentMessages}
              chatEndRef={chatEndRef}
              chatInput={chatInput}
              onChangeChatInput={onChangeChatInput}
              onSendMessage={onSendMessage}
              isSending={isSendingMessage}
              notice={chatNotice}
              language={tripData.language}
            />
          </div>
        )}
      </div>

      {/* Floating Podcast Player (Global) */}
      {playingPodcast && (
        <PodcastPlayer
          activity={playingPodcast}
          progress={progress}
          error={podcastError}
          onClose={stop}
        />
      )}

      {/* Bottom Navigation */}
      <div className="shrink-0 bg-white border-t border-outline/40 flex justify-around p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] z-20 relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setActiveTab("itinerary")}
          className={`flex flex-col items-center gap-1 ${activeTab === "itinerary" ? "text-secondary-dark" : "text-gray-400"}`}
        >
          <Calendar size={20} />
          <span className="text-[10px]">לו"ז</span>
        </button>
        <button
          onClick={() => setActiveTab("map")}
          className={`flex flex-col items-center gap-1 ${activeTab === "map" ? "text-secondary-dark" : "text-gray-400"}`}
        >
          <Map size={20} />
          <span className="text-[10px]">מפה</span>
        </button>
        <button
          onClick={() => setActiveTab("price")}
          className={`flex flex-col items-center gap-1 ${activeTab === "price" ? "text-secondary-dark" : "text-gray-400"}`}
        >
          <DollarSign size={20} />
          <span className="text-[10px]">תמחור</span>
        </button>
        <button
          onClick={() => setActiveTab("chat")}
          className={`flex flex-col items-center gap-1 ${activeTab === "chat" ? "text-secondary-dark" : "text-gray-400"}`}
        >
          <MessageCircle size={20} />
          <span className="text-[10px]">צ'אט AI</span>
        </button>
      </div>
    </div>
  );
}
