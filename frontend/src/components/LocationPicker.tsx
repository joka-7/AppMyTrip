import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import L from "leaflet";
import { useI18n } from "../i18n/useI18n";

const PICKER_ICON = L.divIcon({
  html: '<div style="width:14px;height:14px;border-radius:9999px;background:#2563eb;border:2px solid white;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>',
  className: "",
  iconSize: [14, 14],
  iconAnchor: [7, 7],
});

function ClickToSet({ onPick }: { onPick: (coords: { lat: number; lng: number }) => void }) {
  useMapEvents({
    click(e) {
      onPick({ lat: e.latlng.lat, lng: e.latlng.lng });
    },
  });
  return null;
}

/**
 * A small embedded map for picking an activity's location by clicking or dragging a
 * pin, instead of typing raw latitude/longitude numbers. `value` is null when no
 * location has been set yet (the backend then auto-locates the activity by name).
 */
export default function LocationPicker({
  value,
  onChange,
  defaultCenter = { lat: 41.9028, lng: 12.4964 },
}: {
  value: { lat: number; lng: number } | null;
  onChange: (coords: { lat: number; lng: number } | null) => void;
  defaultCenter?: { lat: number; lng: number };
}) {
  const { t } = useI18n();
  const center = value ?? defaultCenter;
  return (
    <div className="flex flex-col gap-1">
      <div className="h-32 w-full rounded-lg overflow-hidden border border-outline/40">
        <MapContainer
          key={value ? "set" : "unset"}
          center={[center.lat, center.lng]}
          zoom={value ? 14 : 2}
          scrollWheelZoom={false}
          style={{ height: "100%", width: "100%" }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToSet onPick={onChange} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={PICKER_ICON}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const { lat, lng } = e.target.getLatLng();
                  onChange({ lat, lng });
                },
              }}
            />
          )}
        </MapContainer>
      </div>
      <div className="flex items-center justify-between gap-2 text-[11px] text-ink-muted">
        <span>{value ? t("locationPicker.set") : t("locationPicker.unset")}</span>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="shrink-0 text-primary hover:text-primary-dark font-medium"
          >
            {t("locationPicker.clear")}
          </button>
        )}
      </div>
    </div>
  );
}
