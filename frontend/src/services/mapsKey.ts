// Optional Google Maps JavaScript API key(s), supplied by the user (same
// "bring your own key" model as the LLM keys). When at least one is set, the map
// view renders real interactive Google Maps tiles; when none are set, it falls
// back to the free OpenStreetMap/Leaflet map so the app works with no key and no
// billing. Several keys can be stored: the map tries them in order and advances
// to the next if one fails to load (e.g. quota/referrer error), mirroring the
// LLM key rotation.
//
// Stored only in the browser's localStorage — it never touches our backend.
// A Maps JS API key is meant to be used in the browser and should be locked to
// the site's domain (HTTP referrer restriction) in the Google Cloud console.

const STORAGE_KEY = "tripweaver_google_maps_keys";
// Pre-multi-key format: a single bare string under this key. Migrated below.
const LEGACY_STORAGE_KEY = "tripweaver_google_maps_key";

export const GOOGLE_MAPS_KEY_URL = "https://console.cloud.google.com/google/maps-apis/credentials";

function load(): string[] {
  try {
    const legacy = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const migrated = [legacy.trim()].filter(Boolean);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      localStorage.removeItem(LEGACY_STORAGE_KEY);
      return migrated;
    }
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean);
  } catch {
    return [];
  }
}

function save(keys: string[]): void {
  if (keys.length > 0) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

/** All configured Google Maps keys, in the order they should be tried. */
export function getGoogleMapsKeys(): string[] {
  return load();
}

/** Appends a key (ignoring blanks/exact duplicates). */
export function addGoogleMapsKey(key: string): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  const keys = load();
  if (!keys.includes(trimmed)) save([...keys, trimmed]);
}

/** Removes a single key. */
export function removeGoogleMapsKey(key: string): void {
  save(load().filter((k) => k !== key));
}
