import { useState } from "react";
import {
  Bed,
  DollarSign,
  ImageIcon,
  Landmark,
  Link as LinkIcon,
  MapPin,
  Pause,
  Pencil,
  Plane,
  Play,
  Plus,
  Utensils,
  Volume2,
} from "lucide-react";
import type { Activity } from "../api";

function newActivityId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `act-${Date.now()}`;
}

const ACTIVITY_ICONS: Record<Activity["type"], typeof Utensils> = {
  food: Utensils,
  lodging: Bed,
  transport: Plane,
  attraction: Landmark,
};

const ACTIVITY_TYPE_LABELS: Record<Activity["type"], string> = {
  attraction: "אטרקציה",
  food: "אוכל",
  lodging: "לינה",
  transport: "תחבורה",
};

export default function ItineraryList({
  activities,
  themeClass,
  playingPodcast,
  onPlayPodcast,
  onUpdateActivity,
  onAddActivity,
  onShowOnMap,
  isLocalOnly,
}: {
  activities: Activity[];
  themeClass: string;
  playingPodcast: Activity | null;
  onPlayPodcast: (act: Activity) => void;
  onUpdateActivity: (activityId: string, patch: Partial<Activity>) => void;
  onAddActivity?: (activity: Activity) => void;
  onShowOnMap?: (activityId: string) => void;
  isLocalOnly?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Activity>>({});
  const [isAdding, setIsAdding] = useState(false);

  const startEdit = (act: Activity) => {
    setEditingId(act.id);
    setDraft({
      time: act.time,
      title: act.title,
      desc: act.desc,
      type: act.type,
      price: act.price,
      url: act.url,
      photo_url: act.photo_url,
      map_coordinates: act.map_coordinates,
    });
  };

  const saveEdit = (activityId: string) => {
    onUpdateActivity(activityId, draft);
    setEditingId(null);
    setDraft({});
  };

  const startAdd = () => {
    setIsAdding(true);
    setDraft({ time: "", title: "", desc: "", type: "attraction" });
  };

  const saveAdd = () => {
    if (!draft.title?.trim()) return;
    // Default the new pin to an existing activity's spot (e.g. the day's first
    // stop) so it's visible on the map right away instead of being silently
    // dropped from it; the user can drag it to the right place afterwards.
    const nearbyCoords = activities.find((a) => a.map_coordinates)?.map_coordinates ?? null;
    onAddActivity?.({
      id: newActivityId(),
      time: draft.time ?? "",
      title: draft.title.trim(),
      desc: draft.desc ?? "",
      type: draft.type ?? "attraction",
      map_coordinates: nearbyCoords,
    });
    setIsAdding(false);
    setDraft({});
  };

  return (
    <div className="space-y-4">
      {activities.map((act, idx) => {
        const Icon = ACTIVITY_ICONS[act.type] ?? Landmark;
        const isEditing = editingId === act.id;
        return (
          <div
            key={act.id}
            className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex gap-4 animate-fade-in"
          >
            <div className="flex flex-col items-center">
              <div
                className={`p-2 rounded-full ${themeClass} text-white bg-opacity-10 text-opacity-90`}
              >
                <Icon size={18} />
              </div>
              {idx !== activities.length - 1 && (
                <div className="w-0.5 h-full bg-gray-200 mt-2"></div>
              )}
            </div>
            <div className="flex-1 pb-4">
              {isEditing ? (
                <div className="flex flex-col gap-2">
                  <input
                    type="time"
                    value={draft.time ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                    className="border border-gray-300 rounded-lg p-1.5 text-xs w-32"
                  />
                  <input
                    type="text"
                    value={draft.title ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className="border border-gray-300 rounded-lg p-1.5 text-sm font-bold"
                  />
                  <textarea
                    value={draft.desc ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))}
                    className="border border-gray-300 rounded-lg p-1.5 text-sm"
                    rows={2}
                  />
                  <select
                    value={draft.type ?? act.type}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, type: e.target.value as Activity["type"] }))
                    }
                    className="border border-gray-300 rounded-lg p-1.5 text-sm w-32"
                  >
                    {Object.entries(ACTIVITY_TYPE_LABELS).map(([type, label]) => (
                      <option key={type} value={type}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2">
                    <label className="flex-1 flex flex-col gap-1 text-[11px] text-gray-500">
                      מחיר
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.price ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            price: e.target.value === "" ? null : Number(e.target.value),
                          }))
                        }
                        className="border border-gray-300 rounded-lg p-1.5 text-sm"
                      />
                    </label>
                    <label className="flex-1 flex flex-col gap-1 text-[11px] text-gray-500">
                      קישור לאתר
                      <input
                        type="url"
                        value={draft.url ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                        className="border border-gray-300 rounded-lg p-1.5 text-sm"
                      />
                    </label>
                  </div>
                  <label className="flex flex-col gap-1 text-[11px] text-gray-500">
                    קישור לתמונה
                    <input
                      type="url"
                      value={draft.photo_url ?? ""}
                      onChange={(e) => setDraft((d) => ({ ...d, photo_url: e.target.value }))}
                      className="border border-gray-300 rounded-lg p-1.5 text-sm"
                    />
                  </label>
                  <div className="flex gap-2">
                    <label className="flex-1 flex flex-col gap-1 text-[11px] text-gray-500">
                      קו רוחב (lat)
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.map_coordinates?.lat ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            map_coordinates:
                              e.target.value === ""
                                ? null
                                : { lat: Number(e.target.value), lng: d.map_coordinates?.lng ?? 0 },
                          }))
                        }
                        className="border border-gray-300 rounded-lg p-1.5 text-sm"
                      />
                    </label>
                    <label className="flex-1 flex flex-col gap-1 text-[11px] text-gray-500">
                      קו אורך (lng)
                      <input
                        type="number"
                        inputMode="decimal"
                        value={draft.map_coordinates?.lng ?? ""}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            map_coordinates:
                              e.target.value === ""
                                ? null
                                : { lat: d.map_coordinates?.lat ?? 0, lng: Number(e.target.value) },
                          }))
                        }
                        className="border border-gray-300 rounded-lg p-1.5 text-sm"
                      />
                    </label>
                  </div>
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => saveEdit(act.id)}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-xs px-3 py-1.5 rounded-lg"
                    >
                      שמירה
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setDraft({});
                      }}
                      className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg"
                    >
                      ביטול
                    </button>
                    {isLocalOnly && (
                      <span className="text-[10px] text-amber-600">לא נשמר בשרת</span>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-xs text-gray-500 font-medium mb-1">{act.time}</div>
                      <div className="flex items-center gap-1.5">
                        <h4 className="font-bold text-gray-800">{act.title}</h4>
                        {act.photo_url && (
                          <a
                            href={act.photo_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            aria-label="תמונות של הפעילות"
                            className="text-gray-400 hover:text-blue-600"
                          >
                            <ImageIcon size={14} />
                          </a>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {act.url && (
                        <a
                          href={act.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="קישור לאתר הפעילות"
                          className="text-gray-400 hover:text-blue-600 p-1"
                        >
                          <LinkIcon size={14} />
                        </a>
                      )}
                      <button
                        onClick={() => startEdit(act)}
                        aria-label="עריכת מחיר"
                        className="flex items-center gap-0.5 text-gray-400 hover:text-blue-600 p-1"
                      >
                        <DollarSign size={14} />
                        {act.price != null && <span className="text-[11px]">{act.price}</span>}
                      </button>
                      {onShowOnMap && act.map_coordinates && (
                        <button
                          onClick={() => onShowOnMap(act.id)}
                          aria-label="הצגת הפעילות על המפה"
                          className="text-gray-400 hover:text-blue-600 p-1"
                        >
                          <MapPin size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(act)}
                        aria-label="עריכת פעילות"
                        className="text-gray-400 hover:text-blue-600 p-1"
                      >
                        <Pencil size={14} />
                      </button>
                    </div>
                  </div>
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
                </>
              )}
            </div>
          </div>
        );
      })}

      {onAddActivity && (
        <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-fade-in">
          {isAdding ? (
            <div className="flex flex-col gap-2">
              <input
                type="time"
                value={draft.time ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                className="border border-gray-300 rounded-lg p-1.5 text-xs w-32"
              />
              <input
                type="text"
                value={draft.title ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="שם הפעילות"
                className="border border-gray-300 rounded-lg p-1.5 text-sm font-bold"
              />
              <textarea
                value={draft.desc ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))}
                placeholder="תיאור קצר"
                className="border border-gray-300 rounded-lg p-1.5 text-sm"
                rows={2}
              />
              <select
                value={draft.type ?? "attraction"}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, type: e.target.value as Activity["type"] }))
                }
                className="border border-gray-300 rounded-lg p-1.5 text-sm w-32"
              >
                {Object.entries(ACTIVITY_TYPE_LABELS).map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 items-center">
                <button
                  onClick={saveAdd}
                  disabled={!draft.title?.trim()}
                  className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                >
                  הוספה
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setDraft({});
                  }}
                  className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs px-3 py-1.5 rounded-lg"
                >
                  ביטול
                </button>
                {isLocalOnly && <span className="text-[10px] text-amber-600">לא נשמר בשרת</span>}
              </div>
            </div>
          ) : (
            <button
              onClick={startAdd}
              className="w-full flex items-center justify-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 py-1"
            >
              <Plus size={16} />
              הוספת פעילות
            </button>
          )}
        </div>
      )}
    </div>
  );
}
