// The "nothing left to try" escape hatch: when every saved/pooled credential
// has failed (see api.ts's ApiError / App.tsx's describeApiError — by the
// time the frontend sees an error at all, the backend has already rotated
// through every provider getAllCredentials() sent), offer the user's message
// back to them as a link straight into a free, public AI chat product instead
// of just leaving them stuck. No key, no backend call — it's just a deep
// link into a product they can already use for free in another tab.
//
// Mirrors `openExternalChat`/`EXTERNAL_CHAT_PROVIDERS` in
// @joka-7/modeldispatcher-browser-agent (the shared browser-agent package a
// few of our other apps are standardising their own BYOK AI calls on) —
// duplicated here rather than taken as a dependency because that package
// isn't actually published yet (no version tag pushed on ModelDispatcher),
// and this app opens links declaratively via <a href> rather than
// window.open(), which didn't fit that package's imperative API. Worth
// revisiting as a real dependency once it's published.
//
// Same caveat as that package: the query-prefill parameters below
// (claude.ai/new?q=, chatgpt.com/?q=, Google Search's udm=50 AI Mode) are
// undocumented, reverse-engineered conventions, not a stable API any vendor
// promises to keep working. Groq has no known one, so it just gets the plain
// homepage. A UI using this should always also copy the question to the
// clipboard (see copyToClipboard below) so a broken/removed parameter never
// loses the user's question, just demotes it from "already typed in" to
// "ready to paste."

export type ExternalChatProviderId = "chatgpt" | "claude" | "gemini" | "groq";

export interface ExternalChatProvider {
  readonly id: ExternalChatProviderId;
  readonly name: string;
  readonly homeUrl: string;
  readonly buildUrl: ((question: string) => string) | null;
}

export const EXTERNAL_CHAT_PROVIDERS: ExternalChatProvider[] = [
  {
    id: "chatgpt",
    name: "ChatGPT",
    homeUrl: "https://chatgpt.com/",
    buildUrl: (question) =>
      `https://chatgpt.com/?${new URLSearchParams({ q: question, hints: "search" })}`,
  },
  {
    id: "claude",
    name: "Claude",
    homeUrl: "https://claude.ai/new",
    buildUrl: (question) => `https://claude.ai/new?${new URLSearchParams({ q: question })}`,
  },
  {
    id: "gemini",
    name: "Gemini",
    homeUrl: "https://www.google.com/",
    // gemini.google.com itself has no known prefill parameter. Google
    // Search's AI Mode does (udm=50), and is the more reliable target.
    buildUrl: (question) =>
      `https://www.google.com/search?${new URLSearchParams({ q: question, udm: "50" })}`,
  },
  {
    id: "groq",
    name: "Groq",
    homeUrl: "https://groq.com/",
    buildUrl: null,
  },
];

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
