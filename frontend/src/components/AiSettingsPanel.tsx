import { useState } from "react";
import { Eye, EyeOff, KeyRound, Plus, Send, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import {
  addApiKey,
  getApiKeysForProvider,
  getApiProvider,
  getBackend,
  PROVIDERS,
  removeApiKey,
  setApiProvider,
  setBackend,
  type Backend,
  type LLMProvider,
} from "../services/apiKey";
import {
  EXTERNAL_CHAT_PROVIDERS,
  getAiMode,
  loadFavoriteExternalChat,
  saveFavoriteExternalChat,
  setAiMode,
  type AiMode,
  type ExternalChatProviderId,
} from "../services/externalChat";

/** Masks a key for display so it's recognizable without exposing the whole secret. */
function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** A saved key chip with a remove button. */
function KeyRow({ value, onRemove }: { value: string; onRemove: () => void }) {
  const { t } = useI18n();
  const masked = maskKey(value);
  return (
    <div className="flex items-center justify-between gap-2 bg-surface-container rounded-lg px-2.5 py-1.5">
      <span className="text-xs font-mono text-ink-muted truncate" dir="ltr">
        {masked}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={t("apiKey.removeAria", { key: masked })}
        className="text-ink-muted hover:text-red-600 shrink-0"
      >
        <Trash2 size={14} />
      </button>
    </div>
  );
}

/**
 * The AI settings content rendered inside SettingsMenu's ⋮ dropdown (pure
 * content, no toggle button or open/close state of its own — that used to
 * live here as ApiKeyMenu before this became one section among several).
 *
 * Leads with a mode choice, same idea as shas-radar's <ModelPicker>: "apiKey"
 * lets the visitor pick a provider (Gemini, OpenAI, Claude, or Groq) and
 * store one or more of their own keys, sent to the backend and rotated
 * through on a rate limit; "external" skips keys entirely and picks a free
 * chat app to hand Step 1's parse prompt to instead (see BuilderStep1 and
 * services/externalChat.ts's AiMode). Every key and the favorite choice are
 * stored only in localStorage and never touch our backend's env vars.
 */
export default function AiSettingsPanel() {
  const { t } = useI18n();
  const [mode, setMode] = useState<AiMode>(getAiMode());
  const [provider, setProvider] = useState<LLMProvider>(getApiProvider());
  const [activeProvider, setActiveProvider] = useState<LLMProvider>(getApiProvider());
  const [llmKeys, setLlmKeys] = useState<string[]>(() => getApiKeysForProvider(provider));
  const [llmDraft, setLlmDraft] = useState("");
  const [showLlmDraft, setShowLlmDraft] = useState(false);
  const [backend, setBackendState] = useState<Backend>(getBackend());
  const [favorite, setFavorite] = useState<ExternalChatProviderId | null>(() =>
    loadFavoriteExternalChat(),
  );

  const handleModeChange = (next: AiMode) => {
    setAiMode(next);
    setMode(next);
  };

  const handleFavoriteChange = (next: ExternalChatProviderId | null) => {
    saveFavoriteExternalChat(next);
    setFavorite(next);
  };

  const handleBackendChange = (next: Backend) => {
    setBackend(next);
    setBackendState(next);
  };

  // Browsing to a different provider here (to view/add its keys) must not by
  // itself change which provider gets tried first on real requests — that
  // used to happen silently and could bump a working provider behind a new,
  // possibly-flaky one just because the user opened this dropdown.
  const handleProviderChange = (next: LLMProvider) => {
    setProvider(next);
    setLlmKeys(getApiKeysForProvider(next));
    setLlmDraft("");
  };

  const handleAddLlmKey = () => {
    const trimmed = llmDraft.trim();
    if (!trimmed) return;
    addApiKey(trimmed, provider);
    setLlmKeys(getApiKeysForProvider(provider));
    setLlmDraft("");
    setActiveProvider(getApiProvider());
  };

  const handleMakePrimary = () => {
    setApiProvider(provider);
    setActiveProvider(provider);
  };

  const handleRemoveLlmKey = (key: string) => {
    removeApiKey(key, provider);
    setLlmKeys(getApiKeysForProvider(provider));
  };

  const keyUrl = PROVIDERS.find((p) => p.value === provider)?.keyUrl ?? PROVIDERS[0].keyUrl;

  return (
    <div>
      <h3 className="text-sm font-bold text-ink mb-1">{t("apiKey.heading")}</h3>

      <div className="flex gap-1.5 bg-surface-container rounded-lg p-1 mb-3" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "apiKey"}
          onClick={() => handleModeChange("apiKey")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-2 py-1.5 rounded-md transition-colors ${
            mode === "apiKey" ? "bg-white text-primary shadow-sm" : "text-ink-muted"
          }`}
        >
          <KeyRound size={14} />
          {t("apiKey.modeApiKey")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "external"}
          onClick={() => handleModeChange("external")}
          className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold px-2 py-1.5 rounded-md transition-colors ${
            mode === "external" ? "bg-white text-primary shadow-sm" : "text-ink-muted"
          }`}
        >
          <Send size={14} />
          {t("apiKey.modeExternal")}
        </button>
      </div>

      {mode === "apiKey" ? (
        <>
          <p className="text-xs text-ink-muted mb-3">
            {t("apiKey.descriptionBefore")}
            <a href={keyUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              {keyUrl.replace("https://", "")}
            </a>
            {t("apiKey.descriptionAfter")}
          </p>
          <p className="text-[11px] text-ink-muted/80 mb-3">{t("apiKey.trustNote")}</p>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
            aria-label={t("apiKey.heading")}
            className="w-full border border-outline/40 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-primary/50"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>

          {llmKeys.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {llmKeys.map((key) => (
                <KeyRow key={key} value={key} onRemove={() => handleRemoveLlmKey(key)} />
              ))}
            </div>
          )}

          {provider === activeProvider ? (
            <p className="text-[11px] text-ink-muted mb-2">{t("apiKey.primaryNote")}</p>
          ) : (
            llmKeys.length > 0 && (
              <button
                type="button"
                onClick={handleMakePrimary}
                className="text-[11px] text-primary hover:text-primary-dark underline mb-2"
              >
                {t("apiKey.makePrimary")}
              </button>
            )
          )}

          <div className="relative mb-2">
            <input
              type={showLlmDraft ? "text" : "password"}
              value={llmDraft}
              onChange={(e) => setLlmDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLlmKey()}
              placeholder={t("apiKey.inputPlaceholder")}
              className="w-full border border-outline/40 rounded-lg px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={() => setShowLlmDraft((v) => !v)}
              aria-label={showLlmDraft ? t("apiKey.hideAria") : t("apiKey.showAria")}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              {showLlmDraft ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <button
            onClick={handleAddLlmKey}
            disabled={!llmDraft.trim()}
            className="w-full flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg"
          >
            <Plus size={14} />
            {t("apiKey.addKey")}
          </button>

          <div className="mt-3 pt-3 border-t border-outline/10">
            <label className="block text-xs font-medium text-ink-muted mb-1">
              {t("apiKey.backendLabel")}
            </label>
            <select
              value={backend}
              onChange={(e) => handleBackendChange(e.target.value as Backend)}
              aria-label={t("apiKey.backendLabel")}
              className="w-full border border-outline/40 rounded-lg px-3 py-2 text-sm mb-1 focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <option value="legacy">{t("apiKey.backendLegacy")}</option>
              <option value="model_dispatcher">{t("apiKey.backendModelDispatcher")}</option>
            </select>
            <p className="text-[11px] text-ink-muted/80">{t("apiKey.backendNote")}</p>
          </div>
        </>
      ) : (
        <div role="radiogroup" aria-label={t("apiKey.favoriteHeading")}>
          <p className="text-xs text-ink-muted mb-3">{t("apiKey.externalDescription")}</p>
          <p className="text-xs font-medium text-ink-muted mb-1.5">{t("apiKey.favoriteHeading")}</p>
          <div className="flex flex-col gap-1 mb-1">
            <label className="flex items-center gap-2 text-sm text-ink px-1 py-1 cursor-pointer">
              <input
                type="radio"
                name="ai-external-favorite"
                checked={favorite === null}
                onChange={() => handleFavoriteChange(null)}
              />
              {t("apiKey.favoriteNone")}
            </label>
            {EXTERNAL_CHAT_PROVIDERS.map((p) => (
              <label
                key={p.id}
                className="flex items-center gap-2 text-sm text-ink px-1 py-1 cursor-pointer"
              >
                <input
                  type="radio"
                  name="ai-external-favorite"
                  checked={favorite === p.id}
                  onChange={() => handleFavoriteChange(p.id)}
                />
                {p.name}
              </label>
            ))}
          </div>
          <p className="text-[11px] text-ink-muted/80 mt-2">{t("apiKey.favoriteHint")}</p>
        </div>
      )}
    </div>
  );
}
