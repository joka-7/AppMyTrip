// The "nothing left to try" escape hatch: when every saved/pooled credential
// has failed (see api.ts's ApiError / App.tsx's describeApiError — by the
// time the frontend sees an error at all, the backend has already rotated
// through every provider getAllCredentials() sent), offer the user's message
// back to them as a link straight into a free, public AI chat product instead
// of just leaving them stuck. No key, no backend call — it's just a deep
// link into a product they can already use for free in another tab.
//
// Backed by modeldispatcher-browser-agent's own EXTERNAL_CHAT_PROVIDERS
// table (a few of our other apps standardise their BYOK AI calls on this same
// package) rather than a hand-duplicated copy of it — this app still opens
// links declaratively via <a href> instead of that package's imperative
// `openExternalChat()`, so only the provider data table is reused here, not
// that function.
//
// Same caveat as that package: the query-prefill parameters it uses
// (claude.ai/new?q=, chatgpt.com/?q=, Google Search's udm=50 AI Mode) are
// undocumented, reverse-engineered conventions, not a stable API any vendor
// promises to keep working. Groq has no known one, so it just gets the plain
// homepage. A UI using this should always also copy the question to the
// clipboard (see copyToClipboard below) so a broken/removed parameter never
// loses the user's question, just demotes it from "already typed in" to
// "ready to paste."

import {
  EXTERNAL_CHAT_PROVIDERS as PACKAGE_EXTERNAL_CHAT_PROVIDERS,
  loadExternalChatFavorite,
  saveExternalChatFavorite,
  type ExternalChatProviderId,
} from "modeldispatcher-browser-agent";

export type { ExternalChatProviderId };
export type ExternalChatProvider = (typeof PACKAGE_EXTERNAL_CHAT_PROVIDERS)[ExternalChatProviderId];

export const EXTERNAL_CHAT_PROVIDERS: ExternalChatProvider[] = Object.values(
  PACKAGE_EXTERNAL_CHAT_PROVIDERS,
);

/** The URL to open for `provider` given `question` — pre-filled where a
 * prefill parameter is known, the plain homepage otherwise. */
export function buildExternalChatUrl(provider: ExternalChatProvider, question: string): string {
  return provider.buildUrl ? provider.buildUrl(question) : provider.homeUrl;
}

/** Best-effort clipboard copy — never throws (a permissions denial or a
 * non-secure context shouldn't break the link click that triggered this). */
export function copyToClipboard(text: string): void {
  navigator.clipboard?.writeText(text).catch(() => {
    // Nothing actionable to do here — the link still opens either way, and
    // the caller has no UI slot to report a background clipboard failure
    // into. Silently accepted, same as this file's other unofficial-API
    // caveats.
  });
}

// Which of the two BYOK paths Step 1 uses: "apiKey" calls this app's own
// backend with a saved key (see services/apiKey.ts), same as always;
// "external" skips the backend call entirely and hands the parse prompt to
// the visitor's chosen free chat app instead, pasting its reply back in.
// A persisted, explicit choice (set in AiSettingsPanel) rather than the
// automatic "no key saved yet" detection this used to be — that made Step 1
// attempt (and fail) a backend call before ever explaining why.
export type AiMode = "apiKey" | "external";
const AI_MODE_STORAGE_KEY = "tripweaver_ai_mode";

export function getAiMode(): AiMode {
  return localStorage.getItem(AI_MODE_STORAGE_KEY) === "external" ? "external" : "apiKey";
}

export function setAiMode(mode: AiMode): void {
  localStorage.setItem(AI_MODE_STORAGE_KEY, mode);
}

const FAVORITE_STORAGE_KEY = "tripweaver_ai_external_favorite";

/** The chat app to lead with in external mode, or `null` until one is
 * chosen — reuses modeldispatcher-browser-agent's own persistence so the
 * stored value's ids always match EXTERNAL_CHAT_PROVIDERS above. */
export function loadFavoriteExternalChat(): ExternalChatProviderId | null {
  return loadExternalChatFavorite(undefined, FAVORITE_STORAGE_KEY);
}

export function saveFavoriteExternalChat(favorite: ExternalChatProviderId | null): void {
  saveExternalChatFavorite(favorite, undefined, FAVORITE_STORAGE_KEY);
}
