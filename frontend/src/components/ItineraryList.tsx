import { Bed, Pause, Play, Ticket, Utensils, Volume2 } from "lucide-react";
import type { Activity } from "../api";

export default function ItineraryList({
  activities,
  themeClass,
  playingPodcast,
  onPlayPodcast,
}: {
  activities: Activity[];
  themeClass: string;
  playingPodcast: Activity | null;
  onPlayPodcast: (act: Activity) => void;
}) {
  return (
    <div className="space-y-4">
      {activities.map((act, idx) => (
        <div
          key={act.id}
          className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 animate-fade-in"
        >
          <div className="flex flex-col items-center">
            <div
              className={`p-2 rounded-full ${themeClass} text-white bg-opacity-10 text-opacity-90`}
            >
              {act.type === "food" ? (
                <Utensils size={18} />
              ) : act.type === "lodging" ? (
                <Bed size={18} />
              ) : (
                <Ticket size={18} />
              )}
            </div>
            {idx !== activities.length - 1 && <div className="w-0.5 h-full bg-gray-200 mt-2"></div>}
          </div>
          <div className="flex-1 pb-4">
            <div className="text-xs text-gray-500 font-medium mb-1">{act.time}</div>
            <h4 className="font-bold text-gray-800">{act.title}</h4>
            <p className="text-sm text-gray-600 mt-1">{act.desc}</p>

            {act.hasPodcast && (
              <div
                onClick={() => onPlayPodcast(act)}
                className={`mt-3 flex items-center gap-2 p-2 rounded-lg text-sm cursor-pointer transition-colors ${
                  playingPodcast?.id === act.id
                    ? "bg-blue-600 text-white"
                    : "bg-blue-50 text-blue-700 hover:bg-blue-100"
                }`}
              >
                {playingPodcast?.id === act.id ? (
                  <Pause size={16} fill="currentColor" />
                ) : (
                  <Play size={16} fill="currentColor" />
                )}
                <span className="font-medium">
                  {playingPodcast?.id === act.id ? "מתנגן כעת..." : "האזן לפודקאסט היסטורי"}
                </span>
                {playingPodcast?.id === act.id && (
                  <Volume2 size={16} className="ml-auto animate-pulse" />
                )}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
