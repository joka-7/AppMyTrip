// Each user supplies their own LLM provider API key(s) (e.g. Gemini, OpenAI,
// Claude, or Groq) instead of the app sharing the developer's key/quota across
// everyone who uses it. Several keys can be stored per provider: they're sent to
// the backend as a list and rotated through when one hits its rate limit, which
// lets a few free-tier keys together outlast any single key's quota. Stored only
// in the browser's localStorage — never sent anywhere but our own backend.

export type LLMProvider =
  | "gemini"
  | "openai"
  | "anthropic"
  | "groq"
  | "openrouter"
  | "cerebras"
  | "mistral";

// `free` marks providers with a usable free tier, surfaced in the key menu so
// users can find a no-cost option quickly.
export const PROVIDERS: { value: LLMProvider; label: string; keyUrl: string; free?: boolean }[] = [
  { value: "gemini", label: "Gemini", keyUrl: "https://aistudio.google.com/apikey", free: true },
  { value: "groq", label: "Groq", keyUrl: "https://console.groq.com/keys", free: true },
  {
    value: "openrouter",
    label: "OpenRouter",
    keyUrl: "https://openrouter.ai/keys",
    free: true,
  },
  { value: "cerebras", label: "Cerebras", keyUrl: "https://cloud.cerebras.ai", free: true },
  { value: "mistral", label: "Mistral", keyUrl: "https://console.mistral.ai/api-keys", free: true },
  { value: "openai", label: "OpenAI (GPT)", keyUrl: "https://platform.openai.com/api-keys" },
  { value: "anthropic", label: "Claude", keyUrl: "https://console.anthropic.com/settings/keys" },
];

// Keys are stored per-provider so switching providers doesn't overwrite a
// previously saved key for another provider.
const KEYS_STORAGE_KEY = "tripweaver_api_keys";
const PROVIDER_STORAGE_KEY = "tripweaver_api_provider";
// Pre-per-provider storage format; migrated into KEYS_STORAGE_KEY below.
const LEGACY_KEY_STORAGE_KEY = "tripweaver_api_key";

type KeyMap = Partial<Record<LLMProvider, string[]>>;

// Normalizes any historical shape into the current `{ provider: string[] }`:
// the oldest format stored one bare string under LEGACY_KEY_STORAGE_KEY, and the
// next stored `{ provider: string }` (a single key, not yet a list).
function normalizeKeyMap(raw: unknown): KeyMap {
  if (!raw || typeof raw !== "object") return {};
  const map: KeyMap = {};
  for (const [provider, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!PROVIDERS.some((p) => p.value === provider)) continue;
    const keys = (Array.isArray(value) ? value : [value])
      .filter((k): k is string => typeof k === "string")
      .map((k) => k.trim())
      .filter(Boolean);
    if (keys.length > 0) map[provider as LLMProvider] = keys;
  }
  return map;
}

function loadKeyMap(): KeyMap {
  const legacyKey = localStorage.getItem(LEGACY_KEY_STORAGE_KEY);
  if (legacyKey) {
    const legacyProvider = localStorage.getItem(PROVIDER_STORAGE_KEY) as LLMProvider | null;
    const map: KeyMap = { [legacyProvider ?? "gemini"]: [legacyKey] };
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(map));
    localStorage.removeItem(LEGACY_KEY_STORAGE_KEY);
    return map;
  }
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY);
    return raw ? normalizeKeyMap(JSON.parse(raw)) : {};
  } catch {
    return {};
  }
}

function saveKeyMap(map: KeyMap): void {
  localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(map));
}

export function getApiProvider(): LLMProvider {
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return PROVIDERS.some((p) => p.value === stored) ? (stored as LLMProvider) : "gemini";
}

export function setApiProvider(provider: LLMProvider): void {
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
}

export function getApiKeysForProvider(provider: LLMProvider): string[] {
  return loadKeyMap()[provider] ?? [];
}

/** All keys for the currently-selected provider, sent to the backend to rotate through. */
export function getApiKeys(): string[] {
  return getApiKeysForProvider(getApiProvider());
}

/** Every saved provider + its keys, active provider first, sent to the backend as
 * `credentials` so it can fall through to another saved provider when one is
 * exhausted/invalid — the request only errors once every one has failed. Providers
 * with no saved keys are omitted. */
export function getAllCredentials(): { provider: LLMProvider; api_keys: string[] }[] {
  const map = loadKeyMap();
  const active = getApiProvider();
  // Active provider first so it's still the preferred one; then the rest in the
  // PROVIDERS display order (free options ahead of paid), skipping empties.
  const ordered: LLMProvider[] = [
    active,
    ...PROVIDERS.map((p) => p.value).filter((p) => p !== active),
  ];
  return ordered
    .map((provider) => ({ provider, api_keys: map[provider] ?? [] }))
    .filter((c) => c.api_keys.length > 0);
}

/** Appends a key to a provider's list (ignoring blanks/exact duplicates). Only makes
 * that provider the active (first-tried) one if this is the very first key saved for
 * *any* provider — once a provider is already configured and working, adding a key
 * for a different one is meant to add a fallback, not silently bump it ahead in the
 * `getAllCredentials()` order (which is what actually gets tried first). */
export function addApiKey(key: string, provider: LLMProvider): void {
  const trimmed = key.trim();
  if (!trimmed) return;
  const map = loadKeyMap();
  const hadAnyKeyBefore = Object.values(map).some((keys) => (keys?.length ?? 0) > 0);
  const existing = map[provider] ?? [];
  if (!existing.includes(trimmed)) {
    map[provider] = [...existing, trimmed];
    saveKeyMap(map);
  }
  if (!hadAnyKeyBefore) {
    setApiProvider(provider);
  }
}

/** Removes a single key from a provider's list. */
export function removeApiKey(key: string, provider: LLMProvider): void {
  const map = loadKeyMap();
  const existing = map[provider] ?? [];
  const next = existing.filter((k) => k !== key);
  if (next.length > 0) {
    map[provider] = next;
  } else {
    delete map[provider];
  }
  saveKeyMap(map);
}

// Which LLMService implementation the backend uses to actually call the
// provider — a server-side choice between two equivalent code paths, distinct
// from *which provider/key* above. "legacy" (this app's own httpx retry/
// rotation) is the default and always available; "model_dispatcher" (the
// shared model-dispatcher gateway several of our other apps are also
// standardising on) requires the backend to have that package installed —
// see backend/requirements-model-dispatcher.txt. Sending it when the backend
// doesn't have it configured just falls back to the server's own
// LLM_BACKEND env var default, same as omitting it entirely.
export type Backend = "legacy" | "model_dispatcher";
const BACKEND_STORAGE_KEY = "tripweaver_backend";

export function getBackend(): Backend {
  const stored = localStorage.getItem(BACKEND_STORAGE_KEY);
  return stored === "model_dispatcher" ? "model_dispatcher" : "legacy";
}

export function setBackend(backend: Backend): void {
  localStorage.setItem(BACKEND_STORAGE_KEY, backend);
}
