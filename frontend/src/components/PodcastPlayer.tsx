import { Volume2, X } from "lucide-react";
import type { Activity } from "../api";

export default function PodcastPlayer({
  activity,
  progress,
  onClose,
}: {
  activity: Activity;
  progress: number;
  onClose: () => void;
}) {
  return (
    <div className="absolute bottom-16 left-2 right-2 bg-gray-900 text-white rounded-xl p-3 shadow-xl flex flex-col gap-2 animate-slide-up z-10">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2 overflow-hidden">
          <div className="w-8 h-8 bg-gray-800 rounded-full flex items-center justify-center">
            <Volume2 size={14} className="text-blue-400" />
          </div>
          <div className="truncate">
            <p className="text-xs text-gray-400">פודקאסט AI</p>
            <p className="text-sm font-bold truncate">{activity.title}</p>
          </div>
        </div>
        <button onClick={onClose} className="text-gray-400 hover:text-white">
          <X size={18} />
        </button>
      </div>
      <div className="w-full bg-gray-700 h-1.5 rounded-full overflow-hidden">
        <div
          className="bg-blue-500 h-full transition-all duration-300 ease-linear"
          style={{ width: `${progress}%` }}
        ></div>
      </div>
    </div>
  );
}
