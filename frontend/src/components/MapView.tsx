import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { useEffect, useState } from "react";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowRight, ExternalLink, MapPinPlus, Utensils, Bed, Landmark, Plane } from "lucide-react";
import type { Activity } from "../api";
import { useI18n } from "../i18n/useI18n";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL_KEYS } from "../services/activityTypes";
import { newActivityId } from "../services/id";
import { googleMapsPlaceUrl, googleMapsDirectionsUrl } from "../services/mapLinks";
import { sequenceLabel } from "../services/sequenceLabel";

const MARKER_COLORS: Record<Activity["type"], string> = {
  food: "bg-secondary",
  lodging: "bg-indigo-500",
  attraction: "bg-emerald-500",
  transport: "bg-sky-500",
};

const MARKER_ICONS: Record<Activity["type"], typeof Utensils> = {
  food: Utensils,
  lodging: Bed,
  attraction: Landmark,
  transport: Plane,
};

// Each stop's marker keeps its type colour + icon, plus an order badge (A, B,
// C …) matching the sequence Google Maps shows when the "directions" link opens
// the same stops — so the visit order is visible on the in-app map too.
function markerIcon(type: Activity["type"], label: string) {
  const Icon = MARKER_ICONS[type] ?? Landmark;
  const html = renderToStaticMarkup(
    <div style={{ position: "relative", display: "inline-flex" }}>
      <div
        className={`p-1.5 rounded-full text-white shadow-lg ${MARKER_COLORS[type]}`}
        style={{ display: "inline-flex" }}
      >
        <Icon size={14} />
      </div>
      <span
        style={{
          position: "absolute",
          top: -6,
          right: -6,
          minWidth: 16,
          height: 16,
          padding: "0 3px",
          boxSizing: "border-box",
          borderRadius: 9999,
          background: "#ffffff",
          color: "#1a1a1a",
          fontSize: 10,
          fontWeight: 700,
          lineHeight: "14px",
          textAlign: "center",
          border: "1px solid rgba(0,0,0,0.15)",
          boxShadow: "0 1px 2px rgba(0,0,0,0.3)",
        }}
      >
        {label}
      </span>
    </div>,
  );
  return L.divIcon({
    html,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

const PENDING_ICON = L.divIcon({
  html: '<div style="width:16px;height:16px;border-radius:9999px;background:#f59e0b;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function FitBounds({ activities }: { activities: Activity[] }) {
  const map = useMap();
  useEffect(() => {
    const coords = activities
      .filter((a) => a.map_coordinates)
      .map((a) => [a.map_coordinates!.lat, a.map_coordinates!.lng] as [number, number]);
    if (coords.length === 0) return;
    if (coords.length === 1) {
      map.setView(coords[0], 14);
    } else {
      map.fitBounds(coords, { padding: [32, 32] });
    }
  }, [activities, map]);
  return null;
}

/** Clicking anywhere on the map that isn't an existing marker/popup starts a new
 * pending activity at that spot — disabled while a single activity is focused. */
function ClickToAdd({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (coords: { lat: number; lng: number }) => void;
}) {
  useMapEvents({
    click(e) {
      if (!enabled) return;
      const target = e.originalEvent.target as HTMLElement;
      if (target.closest(".leaflet-marker-icon") || target.closest(".leaflet-popup")) return;
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

const FALLBACK_CENTER: [number, number] = [41.9028, 12.4964];

export default function MapView({
  activities,
  onUpdateActivity,
  onAddActivity,
  focusActivityId,
  onClearFocus,
}: {
  activities: Activity[];
  onUpdateActivity?: (activityId: string, patch: Partial<Activity>) => void;
  onAddActivity?: (activity: Activity) => void;
  /** When set, show only this single activity's pin instead of the whole day. */
  focusActivityId?: string | null;
  onClearFocus?: () => void;
}) {
  const { t } = useI18n();
  const [pendingLocation, setPendingLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [pendingTitle, setPendingTitle] = useState("");
  const [pendingType, setPendingType] = useState<Activity["type"]>("attraction");

  const allCoordActs = activities.filter((a) => a.map_coordinates);
  const focusedAct = focusActivityId
    ? allCoordActs.find((a) => a.id === focusActivityId)
    : undefined;
  const coordActs = focusedAct ? [focusedAct] : allCoordActs;
  const canAdd = Boolean(onAddActivity) && !focusedAct;

  if (coordActs.length === 0 && !onAddActivity) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center text-ink-muted text-sm rounded-xl border border-outline/40 bg-surface-container-low">
        {t("map.noCoords")}
      </div>
    );
  }

  const center: [number, number] = coordActs[0]
    ? [coordActs[0].map_coordinates!.lat, coordActs[0].map_coordinates!.lng]
    : FALLBACK_CENTER;

  // Straight line connecting the day's stops in chronological order — not a
  // real driving/walking route (no routing API involved), just a visual cue
  // for the order activities happen in.
  const routePoints: [number, number][] = coordActs.map((a) => [
    a.map_coordinates!.lat,
    a.map_coordinates!.lng,
  ]);

  // A, B, C … labels keyed to each stop's position in the full day's order, so
  // a focused single pin still shows its real letter (not always "A").
  const labelByActId = new Map(allCoordActs.map((a, i) => [a.id, sequenceLabel(i)]));

  const savePending = () => {
    if (!pendingLocation || !pendingTitle.trim() || !onAddActivity) return;
    onAddActivity({
      id: newActivityId(),
      time: "",
      title: pendingTitle.trim(),
      desc: "",
      type: pendingType,
      map_coordinates: pendingLocation,
    });
    setPendingLocation(null);
    setPendingTitle("");
    setPendingType("attraction");
  };

  const cancelPending = () => {
    setPendingLocation(null);
    setPendingTitle("");
    setPendingType("attraction");
  };

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {focusedAct && onClearFocus && (
          <button
            onClick={onClearFocus}
            className="self-start flex items-center gap-1.5 text-xs font-medium text-ink-muted hover:text-ink bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowRight size={14} />
            {t("map.backToFullDay")}
          </button>
        )}
        {focusedAct ? (
          <a
            href={googleMapsPlaceUrl(focusedAct)}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-dark bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ExternalLink size={14} />
            {t("map.openInGoogleMaps")}
          </a>
        ) : (
          coordActs.length > 1 && (
            <a
              href={googleMapsDirectionsUrl(coordActs)}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary-dark bg-primary/10 hover:bg-primary/20 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={14} />
              {t("map.openRoute")}
            </a>
          )
        )}
        {canAdd && !pendingLocation && (
          <span className="flex items-center gap-1.5 text-xs text-ink-muted">
            <MapPinPlus size={14} />
            {t("map.clickToAdd")}
          </span>
        )}
      </div>

      {pendingLocation && (
        <div className="flex flex-wrap items-center gap-2 bg-white border border-outline/40 rounded-lg p-2 animate-fade-in">
          <input
            type="text"
            autoFocus
            value={pendingTitle}
            onChange={(e) => setPendingTitle(e.target.value)}
            placeholder={t("itinerary.activityNamePlaceholder")}
            className="flex-1 min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
          />
          <select
            value={pendingType}
            onChange={(e) => setPendingType(e.target.value as Activity["type"])}
            className="border border-outline/40 rounded-lg p-1.5 text-sm"
          >
            {ACTIVITY_TYPES.map((type) => (
              <option key={type} value={type}>
                {t(ACTIVITY_TYPE_LABEL_KEYS[type])}
              </option>
            ))}
          </select>
          <button
            onClick={savePending}
            disabled={!pendingTitle.trim()}
            className="bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-xs px-3 py-1.5 rounded-lg"
          >
            {t("common.add")}
          </button>
          <button
            onClick={cancelPending}
            className="bg-surface-container hover:bg-surface-container-high text-ink-muted text-xs px-3 py-1.5 rounded-lg"
          >
            {t("common.cancel")}
          </button>
        </div>
      )}

      <div className="flex-1 rounded-xl overflow-hidden border border-outline/40 shadow-inner">
        <MapContainer
          center={center}
          zoom={coordActs[0] ? 13 : 2}
          scrollWheelZoom
          touchZoom
          doubleClickZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitBounds activities={coordActs} />
          <ClickToAdd enabled={canAdd} onPick={setPendingLocation} />
          {routePoints.length > 1 && (
            <Polyline
              positions={routePoints}
              pathOptions={{ color: "#1a5276", weight: 3, opacity: 0.6, dashArray: "6 8" }}
            />
          )}
          {coordActs.map((act) => (
            <Marker
              key={act.id}
              position={[act.map_coordinates!.lat, act.map_coordinates!.lng]}
              icon={markerIcon(act.type, labelByActId.get(act.id) ?? "")}
              draggable={Boolean(onUpdateActivity)}
              eventHandlers={
                onUpdateActivity
                  ? {
                      dragend: (e) => {
                        const { lat, lng } = e.target.getLatLng();
                        onUpdateActivity(act.id, { map_coordinates: { lat, lng } });
                      },
                    }
                  : undefined
              }
            >
              <Popup>
                <div className="flex flex-col gap-1">
                  <span className="font-semibold">
                    {labelByActId.get(act.id) ? `${labelByActId.get(act.id)}. ` : ""}
                    {act.title}
                  </span>
                  <a
                    href={googleMapsPlaceUrl(act)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary-dark text-xs"
                  >
                    {t("map.openInGoogleMaps")}
                  </a>
                </div>
              </Popup>
            </Marker>
          ))}
          {pendingLocation && (
            <Marker
              position={[pendingLocation.lat, pendingLocation.lng]}
              icon={PENDING_ICON}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  setPendingLocation({ lat, lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>
    </div>
  );
}
