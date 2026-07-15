import { useCallback, useEffect, useMemo, useState } from "react";
import { GoogleMap, MarkerF, PolylineF, InfoWindowF, useJsApiLoader } from "@react-google-maps/api";
import type { Activity } from "../api";
import { googleMapsPlaceUrl } from "../services/mapLinks";

// Interactive Google Maps surface, used in place of the Leaflet/OSM map when the
// user has configured their own Google Maps JavaScript API key(s). Mirrors the
// Leaflet surface's capabilities: colored markers per activity type, a dashed
// route line through the day's stops, drag-to-reposition, click-to-add, and a
// popup with an "open in Google Maps" link.
//
// Several keys can be supplied: the map loads with the first, and if that key
// fails to load or is rejected (quota/referrer/auth) it rotates to the next one.
// Once every key has failed, `onAllKeysFailed` fires so the caller (MapView) can
// fall back to the always-free OpenStreetMap map instead of leaving Google's own
// unstyled "Oops! Something went wrong" overlay on screen — an invalid/quota'd/
// wrong-referrer key would otherwise strand the user on that broken overlay with
// no way back to a working map.

type Coords = { lat: number; lng: number };

interface SurfaceProps {
  coordActs: Activity[];
  center: [number, number];
  canAdd: boolean;
  draggableMarkers: boolean;
  pendingLocation: Coords | null;
  onMapClick: (coords: Coords) => void;
  onMarkerDragEnd: (activityId: string, coords: Coords) => void;
  onPendingDragEnd: (coords: Coords) => void;
}

export interface GoogleMapViewProps extends SurfaceProps {
  googleMapsApiKeys: string[];
  onAllKeysFailed: () => void;
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

function MapMessage({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-full w-full flex items-center justify-center text-center text-sm text-ink-muted rounded-xl border border-outline/40 bg-surface-container-low p-4">
      {children}
    </div>
  );
}

export default function GoogleMapView({
  googleMapsApiKeys,
  onAllKeysFailed,
  ...surface
}: GoogleMapViewProps) {
  const [keyIndex, setKeyIndex] = useState(0);
  const activeKey = googleMapsApiKeys[keyIndex];

  // Advance to the next key when the current one fails; once none remain,
  // hand off to the caller instead of leaving a broken Google overlay on screen.
  const rotateKey = useCallback(() => {
    setKeyIndex((i) => {
      if (i < googleMapsApiKeys.length - 1) return i + 1;
      onAllKeysFailed();
      return i;
    });
  }, [googleMapsApiKeys.length, onAllKeysFailed]);

  useEffect(() => {
    if (!activeKey) onAllKeysFailed();
  }, [activeKey, onAllKeysFailed]);

  if (!activeKey) return null;

  // Remount the loader whenever the active key changes so the next key's script
  // is used instead of the failed one.
  return (
    <GoogleMapSurface
      key={activeKey}
      googleMapsApiKey={activeKey}
      onKeyFailed={rotateKey}
      {...surface}
    />
  );
}

function GoogleMapSurface({
  googleMapsApiKey,
  onKeyFailed,
  coordActs,
  center,
  canAdd,
  draggableMarkers,
  pendingLocation,
  onMapClick,
  onMarkerDragEnd,
  onPendingDragEnd,
}: SurfaceProps & { googleMapsApiKey: string; onKeyFailed: () => void }) {
  const { isLoaded, loadError } = useJsApiLoader({
    id: "tripweaver-google-map",
    googleMapsApiKey,
  });
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  // The script loaded, but Google itself rejected the key (invalid/quota/wrong
  // referrer) — stop rendering <GoogleMap> so its own broken "Oops!" overlay
  // doesn't linger in the DOM while we rotate away from this key.
  const [authFailed, setAuthFailed] = useState(false);

  // The script tag failed to load outright (e.g. network error).
  useEffect(() => {
    if (loadError) onKeyFailed();
  }, [loadError, onKeyFailed]);

  // An invalid/over-quota key still loads the script but fires gm_authFailure
  // rather than loadError — treat it the same and rotate to the next key.
  useEffect(() => {
    const w = window as unknown as { gm_authFailure?: () => void };
    const previous = w.gm_authFailure;
    w.gm_authFailure = () => {
      setAuthFailed(true);
      onKeyFailed();
    };
    return () => {
      w.gm_authFailure = previous;
    };
  }, [onKeyFailed]);

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

  // A stable identity for the current set of stops, so `routePath` below only
  // gets a new array/object reference when the actual points change — not on
  // every unrelated re-render. Passing a fresh array into <PolylineF> each
  // render makes Google's SDK diff it against its internal MVCArray via
  // setAt() far more often than needed; combined with the Polyline mounting/
  // unmounting whenever the stop count crosses the 1-point threshold below,
  // that churn can race Google's own internal cleanup and throw deep inside
  // its SDK ("Cannot read properties of undefined (reading 'setAt')").
  // Keying <PolylineF> by this same value forces a clean create/destroy on
  // any real structural change instead of an in-place patch, sidestepping
  // that internal diffing path entirely.
  const routeKey = coordActs
    .filter(
      (a) => Number.isFinite(a.map_coordinates?.lat) && Number.isFinite(a.map_coordinates?.lng),
    )
    .map((a) => `${a.id}:${a.map_coordinates!.lat}:${a.map_coordinates!.lng}`)
    .join("|");

  const routePath = useMemo(
    () =>
      coordActs
        .filter(
          (a) => Number.isFinite(a.map_coordinates?.lat) && Number.isFinite(a.map_coordinates?.lng),
        )
        .map((a) => ({ lat: a.map_coordinates!.lat, lng: a.map_coordinates!.lng })),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- routeKey is the intentional, cheaper dependency
    [routeKey],
  );

  if (loadError || authFailed) {
    return <MapMessage>טוען מפה חלופית…</MapMessage>;
  }

  if (!isLoaded) {
    return <MapMessage>טוען את Google Maps…</MapMessage>;
  }

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
          key={routeKey}
          path={routePath}
          options={{ strokeColor: "#1a5276", strokeOpacity: 0.6, strokeWeight: 3 }}
        />
      )}

      {coordActs
        .filter(
          (act) =>
            Number.isFinite(act.map_coordinates?.lat) && Number.isFinite(act.map_coordinates?.lng),
        )
        .map((act) => (
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
