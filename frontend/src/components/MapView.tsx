import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from "react-leaflet";
import { useEffect } from "react";
import L from "leaflet";
import { renderToStaticMarkup } from "react-dom/server";
import { ExternalLink, Utensils, Bed, Landmark, Plane } from "lucide-react";
import type { Activity } from "../api";

/**
 * Builds a Google Maps directions URL for the day's stops in order. Opening the real
 * Google Maps app/site (rather than embedding Google's tiles, which needs a paid API
 * key) gets users turn-by-turn directions, travel duration, and a map in their own
 * device/account language for free.
 */
function googleMapsDirectionsUrl(coordActs: Activity[]): string {
  const points = coordActs.map((a) => `${a.map_coordinates!.lat},${a.map_coordinates!.lng}`);
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

function markerIcon(type: Activity["type"]) {
  const Icon = MARKER_ICONS[type] ?? Landmark;
  const html = renderToStaticMarkup(
    <div
      className={`p-1.5 rounded-full text-white shadow-lg ${MARKER_COLORS[type]}`}
      style={{ display: "inline-flex" }}
    >
      <Icon size={14} />
    </div>,
  );
  return L.divIcon({
    html,
    className: "",
    iconSize: [28, 28],
    iconAnchor: [14, 28],
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
}: {
  activities: Activity[];
  onUpdateActivity?: (activityId: string, patch: Partial<Activity>) => void;
}) {
  const coordActs = activities.filter((a) => a.map_coordinates);

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
      {coordActs.length > 1 && (
        <a
          href={googleMapsDirectionsUrl(coordActs)}
          target="_blank"
          rel="noopener noreferrer"
          className="self-start flex items-center gap-1.5 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors"
        >
          <ExternalLink size={14} />
          פתיחת מסלול והוראות הגעה ב-Google Maps
        </a>
      )}
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
          {coordActs.map((act) => (
            <Marker
              key={act.id}
              position={[act.map_coordinates!.lat, act.map_coordinates!.lng]}
              icon={markerIcon(act.type)}
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
              <Popup>{act.title}</Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
