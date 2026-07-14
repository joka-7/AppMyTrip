// Optional Google Maps JavaScript API key, supplied by the user (same
// "bring your own key" model as the LLM keys). When set, the map view renders
// real interactive Google Maps tiles; when absent, it falls back to the free
// OpenStreetMap/Leaflet map so the app works with no key and no billing.
//
// Stored only in the browser's localStorage — it never touches our backend.
// A Maps JS API key is meant to be used in the browser and should be locked to
// the site's domain (HTTP referrer restriction) in the Google Cloud console.

const STORAGE_KEY = "tripweaver_google_maps_key";

export const GOOGLE_MAPS_KEY_URL = "https://console.cloud.google.com/google/maps-apis/credentials";

export function getGoogleMapsKey(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setGoogleMapsKey(key: string): void {
  localStorage.setItem(STORAGE_KEY, key);
}

export function clearGoogleMapsKey(): void {
  localStorage.removeItem(STORAGE_KEY);
}
