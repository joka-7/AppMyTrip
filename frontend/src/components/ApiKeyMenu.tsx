import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import {
  addApiKey,
  getApiKeysForProvider,
  getApiProvider,
  PROVIDERS,
  removeApiKey,
  setApiProvider,
  type LLMProvider,
} from "../services/apiKey";

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
 * Lets each user pick their preferred LLM provider (Gemini, OpenAI, Claude, or
 * Groq) and store one or more of their own API keys for it. Multiple keys are
 * sent to the backend and rotated through when one hits its rate limit, so a few
 * free-tier keys together outlast any single key's quota. Every key is stored
 * only in localStorage and never touches our backend's env vars.
 */
export default function ApiKeyMenu() {
  const { t } = useI18n();
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<LLMProvider>(getApiProvider());
  const [activeProvider, setActiveProvider] = useState<LLMProvider>(getApiProvider());
  const [llmKeys, setLlmKeys] = useState<string[]>(() => getApiKeysForProvider(provider));
  const [llmDraft, setLlmDraft] = useState("");
  const [showLlmDraft, setShowLlmDraft] = useState(false);

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
  const hasKeys = llmKeys.length > 0;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
          hasKeys
            ? "text-green-700 bg-green-50 hover:bg-green-100"
            : "text-amber-700 bg-amber-50 hover:bg-amber-100"
        }`}
      >
        <KeyRound size={16} />
        {hasKeys
          ? llmKeys.length > 1
            ? t("apiKey.configuredCount", { count: llmKeys.length })
            : t("apiKey.configured")
          : t("apiKey.setKey")}
      </button>

      {isOpen && (
        <div className="absolute end-0 mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white rounded-xl shadow-lg border border-outline/20 p-4 z-40 text-start">
          <h3 className="text-sm font-bold text-ink mb-1">{t("apiKey.heading")}</h3>
          <p className="text-xs text-ink-muted mb-3">
            {t("apiKey.descriptionBefore")}
            <a href={keyUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              {keyUrl.replace("https://", "")}
            </a>
            {t("apiKey.descriptionAfter")}
          </p>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as LLMProvider)}
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
            hasKeys && (
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

          <button
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center justify-center gap-1.5 text-ink-muted hover:text-ink text-sm px-3 py-2 rounded-lg mt-3"
          >
            <Check size={14} />
            {t("apiKey.close")}
          </button>
        </div>
      )}
    </div>
  );
}
