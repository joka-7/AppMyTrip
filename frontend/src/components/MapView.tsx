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
import "leaflet/dist/leaflet.css";
import { ArrowRight, ExternalLink, MapPinPlus } from "lucide-react";
import type { Activity } from "../api";
import { useI18n } from "../i18n/useI18n";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL_KEYS } from "../services/activityTypes";
import { newActivityId } from "../services/id";
import { googleMapsPlaceUrl, googleMapsDirectionsUrl } from "../services/mapLinks";
import { type MapTileStyle, MAP_TILE_URLS } from "../services/appDesign";
import { sequenceLabel } from "../services/sequenceLabel";

const MARKER_COLORS: Record<Activity["type"], string> = {
  food: "#fe7e4f",
  lodging: "#6366f1",
  attraction: "#10b981",
  transport: "#0ea5e9",
};

// Lucide path data (viewBox 0 0 24 24) for the four activity types — inlined as
// SVG strings so we don't need react-dom/server just to render a marker.
const MARKER_SVG_PATHS: Record<Activity["type"], string> = {
  food: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>',
  lodging:
    '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>',
  attraction:
    '<line x1="3" x2="21" y1="22" y2="22"/><line x1="6" x2="6" y1="18" y2="11"/><line x1="10" x2="10" y1="18" y2="11"/><line x1="14" x2="14" y1="18" y2="11"/><line x1="18" x2="18" y1="18" y2="11"/><polygon points="12 2 20 7 4 7"/>',
  transport:
    '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
};

// Cache divIcons by type+label so re-renders don't rebuild DOM for every
// marker (Leaflet would otherwise treat each new L.divIcon as a different
// icon and re-mount the marker HTML).
const markerIconCache = new Map<string, L.DivIcon>();

// Each stop's marker keeps its type colour + icon, plus an order badge (A, B,
// C …) matching the sequence Google Maps shows when the "directions" link opens
// the same stops — so the visit order is visible on the in-app map too.
function markerIcon(type: Activity["type"], label: string): L.DivIcon {
  const cacheKey = `${type}:${label}`;
  const cached = markerIconCache.get(cacheKey);
  if (cached) return cached;

  const color = MARKER_COLORS[type] ?? MARKER_COLORS.attraction;
  const paths = MARKER_SVG_PATHS[type] ?? MARKER_SVG_PATHS.attraction;
  const safeLabel = label
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
  const html = `<div style="position:relative;display:inline-flex">
  <div style="display:inline-flex;padding:6px;border-radius:9999px;color:#fff;background:${color};box-shadow:0 4px 14px rgba(0,0,0,.18)">
    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>
  </div>
  <span style="position:absolute;top:-6px;right:-6px;min-width:16px;height:16px;padding:0 3px;box-sizing:border-box;border-radius:9999px;background:#fff;color:#1a1a1a;font-size:10px;font-weight:700;line-height:14px;text-align:center;border:1px solid rgba(0,0,0,.15);box-shadow:0 1px 2px rgba(0,0,0,.3)">${safeLabel}</span>
</div>`;

  const icon = L.divIcon({
    html,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
  markerIconCache.set(cacheKey, icon);
  return icon;
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
  mapTileStyle = "streets",
  showRoutes = true,
  routeColor = "#1a5276",
}: {
  activities: Activity[];
  onUpdateActivity?: (activityId: string, patch: Partial<Activity>) => void;
  onAddActivity?: (activity: Activity) => void;
  focusActivityId?: string | null;
  onClearFocus?: () => void;
  mapTileStyle?: MapTileStyle;
  showRoutes?: boolean;
  routeColor?: string;
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
  const tiles = MAP_TILE_URLS[mapTileStyle];

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
  // a focused single pin still shows its real letter (not always "A"). Keyed by
  // the activity object (not its id) so it stays correct even if a loaded trip
  // somehow has missing/duplicate ids — coordActs holds the same object refs.
  const labelByAct = new Map(allCoordActs.map((a, i) => [a, sequenceLabel(i)]));

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

      {/* `isolate` keeps Leaflet's internal stacking contained: its panes/controls
          use z-index values up to 1000, which would otherwise bubble up and paint
          over the app's sticky navbar and its dropdowns (e.g. the API-key menu). */}
      <div className="flex-1 rounded-xl overflow-hidden border border-outline/40 shadow-inner isolate">
        <MapContainer
          center={center}
          zoom={coordActs[0] ? 13 : 2}
          scrollWheelZoom
          touchZoom
          doubleClickZoom
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer attribution={tiles.attribution} url={tiles.url} />
          <FitBounds activities={coordActs} />
          <ClickToAdd enabled={canAdd} onPick={setPendingLocation} />
          {showRoutes && routePoints.length > 1 && (
            <Polyline
              positions={routePoints}
              pathOptions={{ color: routeColor, weight: 3, opacity: 0.6, dashArray: "6 8" }}
            />
          )}
          {coordActs.map((act, i) => (
            <Marker
              key={act.id || `stop-${i}`}
              position={[act.map_coordinates!.lat, act.map_coordinates!.lng]}
              icon={markerIcon(act.type, labelByAct.get(act) ?? "")}
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
                    {labelByAct.get(act) ? `${labelByAct.get(act)}. ` : ""}
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
