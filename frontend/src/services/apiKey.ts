// Each user supplies their own LLM provider API key (e.g. Gemini, OpenAI, Claude,
// or Groq) instead of the app sharing the developer's key/quota across everyone
// who uses it. Stored only in the browser's localStorage — never sent anywhere
// but our own backend.

export type LLMProvider = "gemini" | "openai" | "anthropic" | "groq";

export const PROVIDERS: { value: LLMProvider; label: string; keyUrl: string }[] = [
  { value: "gemini", label: "Gemini", keyUrl: "https://aistudio.google.com/apikey" },
  { value: "openai", label: "OpenAI (GPT)", keyUrl: "https://platform.openai.com/api-keys" },
  { value: "anthropic", label: "Claude", keyUrl: "https://console.anthropic.com/settings/keys" },
  { value: "groq", label: "Groq", keyUrl: "https://console.groq.com/keys" },
];

// Keys are stored per-provider so switching providers doesn't overwrite a
// previously saved key for another provider.
const KEYS_STORAGE_KEY = "tripweaver_api_keys";
const PROVIDER_STORAGE_KEY = "tripweaver_api_provider";
// Pre-per-provider storage format; migrated into KEYS_STORAGE_KEY below.
const LEGACY_KEY_STORAGE_KEY = "tripweaver_api_key";

type KeyMap = Partial<Record<LLMProvider, string>>;

function loadKeyMap(): KeyMap {
  const legacyKey = localStorage.getItem(LEGACY_KEY_STORAGE_KEY);
  if (legacyKey) {
    const legacyProvider = localStorage.getItem(PROVIDER_STORAGE_KEY) as LLMProvider | null;
    const map: KeyMap = { [legacyProvider ?? "gemini"]: legacyKey };
    localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(map));
    localStorage.removeItem(LEGACY_KEY_STORAGE_KEY);
    return map;
  }
  try {
    const raw = localStorage.getItem(KEYS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as KeyMap) : {};
  } catch {
    return {};
  }
}

export function getApiProvider(): LLMProvider {
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return PROVIDERS.some((p) => p.value === stored) ? (stored as LLMProvider) : "gemini";
}

export function getApiKeyForProvider(provider: LLMProvider): string | null {
  return loadKeyMap()[provider] ?? null;
}

export function getApiKey(): string | null {
  return getApiKeyForProvider(getApiProvider());
}

export function setApiKey(key: string, provider: LLMProvider): void {
  const map = loadKeyMap();
  map[provider] = key;
  localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(map));
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
}

export function clearApiKey(provider: LLMProvider): void {
  const map = loadKeyMap();
  delete map[provider];
  localStorage.setItem(KEYS_STORAGE_KEY, JSON.stringify(map));
}
