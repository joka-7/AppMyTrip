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

const KEY_STORAGE_KEY = "tripweaver_api_key";
const PROVIDER_STORAGE_KEY = "tripweaver_api_provider";

export function getApiKey(): string | null {
  return localStorage.getItem(KEY_STORAGE_KEY);
}

export function getApiProvider(): LLMProvider {
  const stored = localStorage.getItem(PROVIDER_STORAGE_KEY);
  return PROVIDERS.some((p) => p.value === stored) ? (stored as LLMProvider) : "gemini";
}

export function setApiKey(key: string, provider: LLMProvider): void {
  localStorage.setItem(KEY_STORAGE_KEY, key);
  localStorage.setItem(PROVIDER_STORAGE_KEY, provider);
}

export function clearApiKey(): void {
  localStorage.removeItem(KEY_STORAGE_KEY);
  localStorage.removeItem(PROVIDER_STORAGE_KEY);
}
