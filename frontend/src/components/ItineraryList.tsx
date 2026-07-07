import { useState } from "react";
import {
  Bed,
  Landmark,
  Link as LinkIcon,
  MapPin,
  Pause,
  Pencil,
  Plane,
  Play,
  Plus,
  Trash2,
  Utensils,
  Volume2,
} from "lucide-react";
import type { Activity } from "../api";
import { ACTIVITY_TYPE_LABELS } from "../services/activityTypes";
import { newActivityId } from "../services/id";
import LocationPicker from "./LocationPicker";

const ACTIVITY_ICONS: Record<Activity["type"], typeof Utensils> = {
  food: Utensils,
  lodging: Bed,
  transport: Plane,
  attraction: Landmark,
};

// Per-category accent used for the card's leading border and the price chip,
// matching the Stitch design system's "status border" pattern.
const ACTIVITY_ACCENT: Record<Activity["type"], { border: string; chip: string }> = {
  attraction: { border: "border-s-emerald-500", chip: "bg-emerald-100 text-emerald-700" },
  food: { border: "border-s-secondary", chip: "bg-secondary/10 text-secondary-dark" },
  lodging: { border: "border-s-indigo-500", chip: "bg-indigo-100 text-indigo-700" },
  transport: { border: "border-s-sky-500", chip: "bg-sky-100 text-sky-700" },
};

export default function ItineraryList({
  activities,
  themeClass,
  playingPodcast,
  onPlayPodcast,
  onUpdateActivity,
  onAddActivity,
  onDeleteActivity,
  onShowOnMap,
  isLocalOnly,
}: {
  activities: Activity[];
  themeClass: string;
  playingPodcast: Activity | null;
  onPlayPodcast: (act: Activity) => void;
  onUpdateActivity: (activityId: string, patch: Partial<Activity>) => void;
  onAddActivity?: (activity: Activity) => void;
  onDeleteActivity?: (activityId: string) => void;
  onShowOnMap?: (activityId: string) => void;
  isLocalOnly?: boolean;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Partial<Activity>>({});
  const [isAdding, setIsAdding] = useState(false);

  // Centers the location picker's mini map near the day's other stops instead of
  // defaulting to a fixed spot halfway across the world.
  const anchorCenter = activities.find((a) => a.map_coordinates)?.map_coordinates ?? undefined;

  const startEdit = (act: Activity) => {
    setEditingId(act.id);
    setDraft({
      time: act.time,
      title: act.title,
      desc: act.desc,
      type: act.type,
      price: act.price,
      url: act.url,
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
    // If the user left price/link/location blank, the backend always looks up a
    // real location (and any other enabled extras) for activities missing them
    // (see enhanceNewActivities in App.tsx), so leaving map_coordinates null here
    // is safe — it gets filled in instead of reusing another activity's spot.
    onAddActivity?.({
      id: newActivityId(),
      time: draft.time ?? "",
      title: draft.title.trim(),
      desc: draft.desc ?? "",
      type: draft.type ?? "attraction",
      price: draft.price ?? null,
      url: draft.url ?? null,
      map_coordinates: draft.map_coordinates ?? null,
    });
    setIsAdding(false);
    setDraft({});
  };

  return (
    <div className="space-y-4">
      {activities.map((act) => {
        const Icon = ACTIVITY_ICONS[act.type] ?? Landmark;
        const accent = ACTIVITY_ACCENT[act.type] ?? ACTIVITY_ACCENT.attraction;
        const isEditing = editingId === act.id;
        return (
          <div
            key={act.id}
            className={`bg-white p-4 rounded-xl shadow-card border border-outline/20 border-s-4 ${accent.border} animate-fade-in`}
          >
            <div className="flex-1 min-w-0">
              {isEditing ? (
                <div className="flex flex-col gap-2 min-w-0">
                  <input
                    type="time"
                    value={draft.time ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                    className="border border-outline/40 rounded-lg p-1.5 text-xs w-32"
                  />
                  <input
                    type="text"
                    value={draft.title ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                    className="w-full min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm font-bold"
                  />
                  <textarea
                    value={draft.desc ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))}
                    className="w-full min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
                    rows={2}
                  />
                  <select
                    value={draft.type ?? act.type}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, type: e.target.value as Activity["type"] }))
                    }
                    className="border border-outline/40 rounded-lg p-1.5 text-sm w-32"
                  >
                    {Object.entries(ACTIVITY_TYPE_LABELS).map(([type, label]) => (
                      <option key={type} value={type}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <div className="flex gap-2 min-w-0">
                    <label className="flex-1 min-w-0 flex flex-col gap-1 text-[11px] text-ink-muted">
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
                        className="w-full min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
                      />
                    </label>
                    <label className="flex-1 min-w-0 flex flex-col gap-1 text-[11px] text-ink-muted">
                      קישור לאתר
                      <input
                        type="url"
                        value={draft.url ?? ""}
                        onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                        className="w-full min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
                      />
                    </label>
                  </div>
                  <LocationPicker
                    value={draft.map_coordinates ?? null}
                    onChange={(coords) => setDraft((d) => ({ ...d, map_coordinates: coords }))}
                    defaultCenter={anchorCenter}
                  />
                  <div className="flex gap-2 items-center">
                    <button
                      onClick={() => saveEdit(act.id)}
                      className="bg-primary hover:bg-primary-dark text-white text-xs px-3 py-1.5 rounded-lg"
                    >
                      שמירה
                    </button>
                    <button
                      onClick={() => {
                        setEditingId(null);
                        setDraft({});
                      }}
                      className="bg-surface-container hover:bg-surface-container-high text-ink-muted text-xs px-3 py-1.5 rounded-lg"
                    >
                      ביטול
                    </button>
                    {onDeleteActivity && (
                      <button
                        onClick={() => {
                          onDeleteActivity(act.id);
                          setEditingId(null);
                          setDraft({});
                        }}
                        className="bg-red-50 hover:bg-red-100 text-red-600 text-xs px-3 py-1.5 rounded-lg flex items-center gap-1"
                      >
                        <Trash2 size={12} />
                        מחיקה
                      </button>
                    )}
                    {isLocalOnly && (
                      <span className="text-[10px] text-amber-600">לא נשמר בשרת</span>
                    )}
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-secondary-dark font-bold text-xs">
                      <Icon size={14} />
                      <span>{act.time}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      {act.url && (
                        <a
                          href={act.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          aria-label="קישור לאתר הפעילות"
                          className="text-sky-500 hover:text-sky-700 p-1"
                        >
                          <LinkIcon size={14} />
                        </a>
                      )}
                      {onShowOnMap && act.map_coordinates && (
                        <button
                          onClick={() => onShowOnMap(act.id)}
                          aria-label="הצגת הפעילות על המפה"
                          className="text-emerald-500 hover:text-emerald-700 p-1"
                        >
                          <MapPin size={14} />
                        </button>
                      )}
                      <button
                        onClick={() => startEdit(act)}
                        aria-label="עריכת פעילות"
                        className="text-amber-500 hover:text-amber-700 p-1"
                      >
                        <Pencil size={14} />
                      </button>
                      {onDeleteActivity && (
                        <button
                          onClick={() => onDeleteActivity(act.id)}
                          aria-label="מחיקת פעילות"
                          className="text-red-500 hover:text-red-700 p-1"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                  </div>
                  <h4 className="font-bold text-ink mt-1">{act.title}</h4>
                  <p className="text-sm text-ink-muted mt-1">{act.desc}</p>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    <button
                      onClick={() => startEdit(act)}
                      aria-label="עריכת מחיר"
                      className={`rounded-full px-2.5 py-1 text-xs font-semibold ${accent.chip}`}
                    >
                      {act.price != null ? `₪${act.price}` : "הוספת מחיר"}
                    </button>

                    {act.hasPodcast && (
                      <button
                        onClick={() => onPlayPodcast(act)}
                        className={`flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
                          playingPodcast?.id === act.id
                            ? `${themeClass} text-white`
                            : "bg-surface-container text-primary hover:bg-surface-container-high"
                        }`}
                      >
                        {playingPodcast?.id === act.id ? (
                          <Pause size={13} fill="currentColor" />
                        ) : (
                          <Play size={13} fill="currentColor" />
                        )}
                        {playingPodcast?.id === act.id ? "מתנגן כעת..." : "פודקאסט היסטורי"}
                        {playingPodcast?.id === act.id && (
                          <Volume2 size={13} className="animate-pulse" />
                        )}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {onAddActivity && (
        <div
          className={`p-4 rounded-xl animate-fade-in ${
            isAdding
              ? "bg-white shadow-card border border-outline/20"
              : "border-2 border-dashed border-outline bg-transparent"
          }`}
        >
          {isAdding ? (
            <div className="flex flex-col gap-2">
              <input
                type="time"
                value={draft.time ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, time: e.target.value }))}
                className="border border-outline/40 rounded-lg p-1.5 text-xs w-32"
              />
              <input
                type="text"
                value={draft.title ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
                placeholder="שם הפעילות"
                className="w-full min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm font-bold"
              />
              <textarea
                value={draft.desc ?? ""}
                onChange={(e) => setDraft((d) => ({ ...d, desc: e.target.value }))}
                placeholder="תיאור קצר"
                className="w-full min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
                rows={2}
              />
              <select
                value={draft.type ?? "attraction"}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, type: e.target.value as Activity["type"] }))
                }
                className="border border-outline/40 rounded-lg p-1.5 text-sm w-32"
              >
                {Object.entries(ACTIVITY_TYPE_LABELS).map(([type, label]) => (
                  <option key={type} value={type}>
                    {label}
                  </option>
                ))}
              </select>
              <div className="flex gap-2 min-w-0">
                <label className="flex-1 min-w-0 flex flex-col gap-1 text-[11px] text-ink-muted">
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
                    className="w-full min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
                  />
                </label>
                <label className="flex-1 min-w-0 flex flex-col gap-1 text-[11px] text-ink-muted">
                  קישור לאתר
                  <input
                    type="url"
                    value={draft.url ?? ""}
                    onChange={(e) => setDraft((d) => ({ ...d, url: e.target.value }))}
                    className="w-full min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
                  />
                </label>
              </div>
              <LocationPicker
                value={draft.map_coordinates ?? null}
                onChange={(coords) => setDraft((d) => ({ ...d, map_coordinates: coords }))}
                defaultCenter={anchorCenter}
              />
              <div className="flex gap-2 items-center">
                <button
                  onClick={saveAdd}
                  disabled={!draft.title?.trim()}
                  className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
                >
                  הוספה
                </button>
                <button
                  onClick={() => {
                    setIsAdding(false);
                    setDraft({});
                  }}
                  className="bg-surface-container hover:bg-surface-container-high text-ink-muted text-xs px-3 py-1.5 rounded-lg"
                >
                  ביטול
                </button>
                {isLocalOnly && <span className="text-[10px] text-amber-600">לא נשמר בשרת</span>}
              </div>
            </div>
          ) : (
            <button
              onClick={startAdd}
              className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-primary hover:text-primary-dark py-1"
            >
              <Plus size={16} />
              הוספת פעילות ליום זה
            </button>
          )}
        </div>
      )}
    </div>
  );
}
