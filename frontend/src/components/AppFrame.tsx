import { useRef, useState } from "react";
import { Calendar, ChevronLeft, ChevronRight, Map, MessageCircle, Smartphone } from "lucide-react";
import type { TripData } from "../api";
import { usePodcastPlayer } from "../hooks/usePodcastPlayer";
import ItineraryList from "./ItineraryList";
import MapView from "./MapView";
import PodcastPlayer from "./PodcastPlayer";
import type { Theme } from "./ThemeSelector";

const THEME_CLASSES: Record<Theme, string> = {
  blue: "bg-blue-600",
  green: "bg-emerald-600",
  dark: "bg-slate-800",
};

// Above this many days, the tab strip can overflow its visible width, so we
// add explicit scroll buttons rather than relying on a hidden scrollbar.
const SCROLL_ARROW_THRESHOLD = 4;

/**
 * The actual generated-app UI: header, day tabs, itinerary/map content,
 * podcast player and bottom nav. Rendered inside a phone bezel by
 * PhonePreview (live builder preview) and full-screen by SharedAppPage
 * (the standalone link people share with trip participants).
 */
export default function AppFrame({
  tripData,
  theme,
  chatDisabledHint,
}: {
  tripData: TripData;
  theme: Theme;
  chatDisabledHint: string;
}) {
  const [activeDay, setActiveDay] = useState(0);
  const [activeTab, setActiveTab] = useState<"itinerary" | "map">("itinerary");
  const { playingPodcast, progress, togglePlay, stop } = usePodcastPlayer();
  const tabsRef = useRef<HTMLDivElement>(null);

  const themeClass = THEME_CLASSES[theme] ?? THEME_CLASSES.blue;

  // Empty-state safe accessors: tripData may have no days yet (before parsing).
  const days = tripData.days ?? [];
  const hasTrip = days.length > 0;
  const safeDayIdx = Math.min(activeDay, Math.max(0, days.length - 1));
  const day = days[safeDayIdx];

  const scrollTabs = (direction: 1 | -1) => {
    tabsRef.current?.scrollBy({ left: direction * 140, behavior: "smooth" });
  };

  return (
    <div className="w-full h-full flex flex-col bg-gray-50">
      {/* App Header */}
      <div
        className={`${themeClass} text-white pt-10 pb-4 px-6 shadow-md transition-colors duration-300`}
      >
        <h2 className="text-xl font-bold">{tripData.title || "האפליקציה שלך"}</h2>
        <p className="text-sm opacity-80">{tripData.dates || "התצוגה המקדימה תתעדכן לפי הטקסט"}</p>
      </div>

      {/* Days Tabs */}
      {hasTrip && (
        <div className="flex items-center bg-white border-b">
          {days.length > SCROLL_ARROW_THRESHOLD && (
            <button
              onClick={() => scrollTabs(-1)}
              aria-label="גלילה לימים קודמים"
              className="flex-shrink-0 px-2 py-3 text-gray-400 hover:text-blue-600"
            >
              <ChevronRight size={18} />
            </button>
          )}
          <div ref={tabsRef} className="flex overflow-x-auto hide-scrollbar">
            {days.map((d, idx) => (
              <button
                key={idx}
                onClick={() => setActiveDay(idx)}
                className={`px-6 py-3 font-medium whitespace-nowrap border-b-2 transition-colors ${
                  safeDayIdx === idx
                    ? `border-blue-600 text-blue-600`
                    : "border-transparent text-gray-500"
                }`}
              >
                יום {d.dayNum}
              </button>
            ))}
          </div>
          {days.length > SCROLL_ARROW_THRESHOLD && (
            <button
              onClick={() => scrollTabs(1)}
              aria-label="גלילה לימים נוספים"
              className="flex-shrink-0 px-2 py-3 text-gray-400 hover:text-blue-600"
            >
              <ChevronLeft size={18} />
            </button>
          )}
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 bg-gray-50 pb-24">
        {!hasTrip && (
          <div className="h-full flex flex-col items-center justify-center text-center text-gray-400 gap-3 px-6">
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
          />
        )}

        {hasTrip && activeTab === "map" && (
          <div className="h-full w-full animate-fade-in">
            <MapView activities={day.activities} />
          </div>
        )}
      </div>

      {/* Floating Podcast Player (Global) */}
      {playingPodcast && (
        <PodcastPlayer activity={playingPodcast} progress={progress} onClose={stop} />
      )}

      {/* Bottom Navigation */}
      <div className="bg-white border-t flex justify-around p-3 pb-6 z-20 relative shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <button
          onClick={() => setActiveTab("itinerary")}
          className={`flex flex-col items-center gap-1 ${activeTab === "itinerary" ? "text-blue-600" : "text-gray-400"}`}
        >
          <Calendar size={20} />
          <span className="text-[10px]">לו"ז</span>
        </button>
        <button
          onClick={() => setActiveTab("map")}
          className={`flex flex-col items-center gap-1 ${activeTab === "map" ? "text-blue-600" : "text-gray-400"}`}
        >
          <Map size={20} />
          <span className="text-[10px]">מפה</span>
        </button>
        <button
          disabled
          title={chatDisabledHint}
          className="flex flex-col items-center gap-1 text-gray-300 cursor-not-allowed"
        >
          <MessageCircle size={20} />
          <span className="text-[10px]">צ'אט AI</span>
        </button>
      </div>
    </div>
  );
}
