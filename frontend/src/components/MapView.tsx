import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { ArrowRight, ExternalLink, Utensils, Bed, Landmark, Plane } from "lucide-react";
import type { Activity } from "../api";

/** Stop-order label for map markers and Google Maps waypoints (A, B, C, …). */
function stopLabel(index: number): string {
  return index < 26 ? String.fromCharCode(65 + index) : `${index + 1}`;
}

/**
 * A Google Maps search query for an activity: the place's name, biased toward its
 * generated coordinates so Maps resolves the actual named place rather than a bare
 * GPS pin — which is all a plain "lat,lng" query produces.
 */
function placeQuery(act: Activity): string {
  const { lat, lng } = act.map_coordinates!;
  return act.title.trim() ? `${act.title.trim()} @${lat},${lng}` : `${lat},${lng}`;
}

/** Builds a Google Maps URL centered on a single place (no routing). */
function googleMapsPlaceUrl(act: Activity): string {
  const url = new URL("https://www.google.com/maps/search/");
  url.searchParams.set("api", "1");
  url.searchParams.set("query", placeQuery(act));
  return url.toString();
}

/**
 * Builds a Google Maps directions URL for the day's stops in order. Opening the real
 * Google Maps app/site (rather than embedding Google's tiles, which needs a paid API
 * key) gets users turn-by-turn directions, travel duration, and a map in their own
 * device/account language for free.
 */
function googleMapsDirectionsUrl(coordActs: Activity[]): string {
  const points = coordActs.map(placeQuery);
  const url = new URL("https://www.google.com/maps/dir/");
  url.searchParams.set("api", "1");
  url.searchParams.set("origin", points[0]);
  url.searchParams.set("destination", points[points.length - 1]);
  if (points.length > 2) {
    url.searchParams.set("waypoints", points.slice(1, -1).join("|"));
  }
  url.searchParams.set("travelmode", "walking");
  return url.toString();
}

const MARKER_COLORS: Record<Activity["type"], string> = {
  food: "bg-red-500",
  lodging: "bg-indigo-500",
  attraction: "bg-blue-500",
  transport: "bg-amber-500",
};

const MARKER_ICONS: Record<Activity["type"], typeof Utensils> = {
  food: Utensils,
  lodging: Bed,
  attraction: Landmark,
  transport: Plane,
};

function markerIcon(type: Activity["type"], label: string) {
  const Icon = MARKER_ICONS[type] ?? Landmark;
  const html = renderToStaticMarkup(
    <div className="relative" style={{ width: 32, height: 36 }}>
      <div
        className={`absolute left-0 top-3 p-1.5 rounded-full text-white shadow-lg ${MARKER_COLORS[type]}`}
        style={{ display: "inline-flex" }}
      >
        <Icon size={14} />
      </div>
      <div
        className="absolute right-0 top-0 min-w-[18px] h-[18px] px-0.5 rounded-full bg-white text-[11px] font-bold text-gray-800 border border-gray-300 shadow flex items-center justify-center leading-none"
        style={{ display: "flex" }}
      >
        {label}
      </div>
    </div>,
  );
  return L.divIcon({
    html,
    className: "",
    iconSize: [32, 36],
    iconAnchor: [16, 36],
  });
}

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

export default function MapView({
  activities,
  onUpdateActivity,
  focusActivityId,
  onClearFocus,
}: {
  activities: Activity[];
  onUpdateActivity?: (activityId: string, patch: Partial<Activity>) => void;
  /** When set, show only this single activity's pin instead of the whole day. */
  focusActivityId?: string | null;
  onClearFocus?: () => void;
}) {
  const allCoordActs = activities.filter((a) => a.map_coordinates);
  const focusedAct = focusActivityId
    ? allCoordActs.find((a) => a.id === focusActivityId)
    : undefined;
  const coordActs = focusedAct ? [focusedAct] : allCoordActs;

  if (coordActs.length === 0) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center text-gray-400 text-sm rounded-xl border border-gray-200 bg-gray-50">
        אין קואורדינטות להצגה על המפה ביום זה.
      </div>
    );
  }

  const center: [number, number] = [
    coordActs[0].map_coordinates!.lat,
    coordActs[0].map_coordinates!.lng,
  ];

  // Straight line connecting the day's stops in chronological order — not a
  // real driving/walking route (no routing API involved), just a visual cue
  // for the order activities happen in.
  const routePoints: [number, number][] = coordActs.map((a) => [
    a.map_coordinates!.lat,
    a.map_coordinates!.lng,
  ]);

  return (
    <div className="h-full w-full flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        {focusedAct && onClearFocus && (
          <button
            onClick={onClearFocus}
            className="self-start flex items-center gap-1.5 text-xs font-medium text-gray-600 hover:text-gray-800 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ArrowRight size={14} />
            חזרה למפת היום המלאה
          </button>
        )}
        {focusedAct ? (
          <a
            href={googleMapsPlaceUrl(focusedAct)}
            target="_blank"
            rel="noopener noreferrer"
            className="self-start flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
          >
            <ExternalLink size={14} />
            פתיחה ב-Google Maps
          </a>
        ) : (
          coordActs.length > 1 && (
            <a
              href={googleMapsDirectionsUrl(coordActs)}
              target="_blank"
              rel="noopener noreferrer"
              className="self-start flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
            >
              <ExternalLink size={14} />
              פתיחת מסלול והוראות הגעה ב-Google Maps
            </a>
          )
        )}
      </div>
      <div className="flex-1 rounded-xl overflow-hidden border border-gray-200 shadow-inner">
        <MapContainer
          center={center}
          zoom={13}
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
          {routePoints.length > 1 && (
            <Polyline
              positions={routePoints}
              pathOptions={{ color: "#2563eb", weight: 3, opacity: 0.6, dashArray: "6 8" }}
            />
          )}
          {coordActs.map((act, index) => (
            <Marker
              key={act.id}
              position={[act.map_coordinates!.lat, act.map_coordinates!.lng]}
              icon={markerIcon(act.type, stopLabel(index))}
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
                <span className="font-semibold">{stopLabel(index)}.</span> {act.title}
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
