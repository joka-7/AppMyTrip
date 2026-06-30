import { Volume2, X } from "lucide-react";
import type { Activity } from "../api";

export default function PodcastPlayer({
  activity,
  progress,
  error,
  onClose,
}: {
  activity: Activity;
  progress: number;
  error?: string | null;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-16 left-2 right-2 bg-white text-ink rounded-xl p-3 shadow-card border border-outline/20 flex flex-col gap-2 animate-slide-up z-10">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
            <Volume2 size={14} className="text-primary" />
          </div>
          <div className="truncate">
            <p className="text-xs text-ink-muted">מאזינים כעת...</p>
            <p className="text-sm font-bold truncate">{activity.title}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-ink-muted hover:text-ink">
          <X size={18} />
        </button>
      </div>
      {error ? (
        <p className="text-xs text-red-600">{error}</p>
      ) : (
        <>
          {activity.podcast_brief && (
            <p className="text-xs text-ink-muted line-clamp-2">{activity.podcast_brief}</p>
          )}
          <div className="w-full bg-surface-container h-1.5 rounded-full overflow-hidden">
            <div
              className="bg-primary h-full transition-all duration-300 ease-linear"
              style={{ width: `${progress}%` }}
            ></div>
          </div>
        </>
      )}
    </div>
  );
}
