import { useEffect, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import type { Activity } from "../api";
import { googleMapsPlaceUrl } from "../services/mapLinks";

// Interactive Google Maps surface, used in place of the Leaflet/OSM map when the
// user has configured their own Google Maps JavaScript API key. Mirrors the
// Leaflet surface's capabilities: colored markers per activity type, a dashed
// route line through the day's stops, drag-to-reposition, click-to-add, and a
// popup with an "open in Google Maps" link.

type Coords = { lat: number; lng: number };

export interface GoogleMapViewProps {
  googleMapsApiKey: string;
  coordActs: Activity[];
  center: [number, number];
  canAdd: boolean;
  draggableMarkers: boolean;
  pendingLocation: Coords | null;
  onMapClick: (coords: Coords) => void;
  onMarkerDragEnd: (activityId: string, coords: Coords) => void;
  onPendingDragEnd: (coords: Coords) => void;
}

// Hex equivalents of the Leaflet surface's Tailwind marker colors, so both
// backends look the same.
const MARKER_HEX: Record<Activity["type"], string> = {
  food: "#f43f5e",
  lodging: "#6366f1",
  attraction: "#10b981",
  transport: "#0ea5e9",
};

const CONTAINER_STYLE = { width: "100%", height: "100%" };

function circleSymbol(color: string, scale: number): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    fillColor: color,
    fillOpacity: 1,
    strokeColor: "#ffffff",
    strokeWeight: 2,
    scale,
  };
}

export default function GoogleMapView({
  googleMapsApiKey,
  coordActs,
  center,
  canAdd,
  draggableMarkers,
  pendingLocation,
  onMapClick,
  onMarkerDragEnd,
  onPendingDragEnd,
}: GoogleMapViewProps) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "tripweaver-google-map",
    googleMapsApiKey,
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  // Keep the viewport framed on the current day's stops, matching Leaflet's FitBounds.
  useEffect(() => {
    if (!map || coordActs.length === 0) return;
    if (coordActs.length === 1) {
      const { lat, lng } = coordActs[0].map_coordinates!;
      map.setCenter({ lat, lng });
      map.setZoom(14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    coordActs.forEach((a) =>
      bounds.extend({ lat: a.map_coordinates!.lat, lng: a.map_coordinates!.lng }),
    );
    map.fitBounds(bounds, 40);
  }, [map, coordActs]);

  if (loadError) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center text-sm text-ink-muted rounded-xl border border-outline/40 bg-surface-container-low p-4">
        לא הצלחנו לטעון את Google Maps — ודאו שמפתח ה-API תקין ומורשה לדומיין הזה, או הסירו אותו כדי
        לחזור למפת OpenStreetMap.
      </div>
    );
  }

  if (!isLoaded) {
    return (
      <div className="h-full w-full flex items-center justify-center text-center text-sm text-ink-muted rounded-xl border border-outline/40 bg-surface-container-low">
        טוען את Google Maps…
      </div>
    );
  }

  const routePath = coordActs.map((a) => ({
    lat: a.map_coordinates!.lat,
    lng: a.map_coordinates!.lng,
  }));

  return (
    <GoogleMap
      mapContainerStyle={CONTAINER_STYLE}
      center={{ lat: center[0], lng: center[1] }}
      zoom={coordActs[0] ? 13 : 2}
      onLoad={setMap}
      onUnmount={() => setMap(null)}
      onClick={(e) => {
        if (canAdd && e.latLng) onMapClick({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      }}
      options={{
        streetViewControl: false,
        mapTypeControl: false,
        fullscreenControl: false,
      }}
    >
      {routePath.length > 1 && (
        <PolylineF
          path={routePath}
          options={{ strokeColor: "#1a5276", strokeOpacity: 0.6, strokeWeight: 3 }}
        />
      )}

      {coordActs.map((act) => (
        <MarkerF
          key={act.id}
          position={{ lat: act.map_coordinates!.lat, lng: act.map_coordinates!.lng }}
          icon={circleSymbol(MARKER_HEX[act.type] ?? MARKER_HEX.attraction, 8)}
          draggable={draggableMarkers}
          onClick={() => setOpenId(act.id)}
          onDragEnd={(e) => {
            if (e.latLng) onMarkerDragEnd(act.id, { lat: e.latLng.lat(), lng: e.latLng.lng() });
          }}
        >
          {openId === act.id && (
            <InfoWindowF
              position={{ lat: act.map_coordinates!.lat, lng: act.map_coordinates!.lng }}
              onCloseClick={() => setOpenId(null)}
            >
              <div className="flex flex-col gap-1 text-right">
                <span className="font-semibold">{act.title}</span>
                <a
                  href={googleMapsPlaceUrl(act)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:text-primary-dark text-xs"
                >
                  פתיחה ב-Google Maps
                </a>
              </div>
            </InfoWindowF>
          )}
        </MarkerF>
      ))}

      {pendingLocation && (
        <MarkerF
          position={pendingLocation}
          icon={circleSymbol("#f59e0b", 7)}
          draggable
          onDragEnd={(e) => {
            if (e.latLng) onPendingDragEnd({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          }}
        />
      )}
    </GoogleMap>
  );
}
