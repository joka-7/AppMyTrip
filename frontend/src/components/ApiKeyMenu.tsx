import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, Trash2 } from "lucide-react";
import {
  clearApiKey,
  getApiKeyForProvider,
  getApiProvider,
  PROVIDERS,
  setApiKey,
  type LLMProvider,
} from "../services/apiKey";

/**
 * Lets each user pick their preferred LLM provider (Gemini, OpenAI, Claude,
 * or Groq) and paste in their own API key for it, so the app calls the LLM
 * with their key/quota instead of sharing the developer's. Each provider's
 * key is stored separately in localStorage and sent with each builder
 * request; never touches our backend's env vars.
 */
export default function ApiKeyMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<LLMProvider>(getApiProvider());
  const [draft, setDraft] = useState(getApiKeyForProvider(provider) ?? "");
  const [savedKey, setSavedKey] = useState(getApiKeyForProvider(provider));
  const [showKey, setShowKey] = useState(false);

  const handleProviderChange = (next: LLMProvider) => {
    setProvider(next);
    const existing = getApiKeyForProvider(next);
    setDraft(existing ?? "");
    setSavedKey(existing);
  };

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setApiKey(trimmed, provider);
    setSavedKey(trimmed);
    setIsOpen(false);
  };

  const handleClear = () => {
    clearApiKey(provider);
    setSavedKey(null);
    setDraft("");
  };

  const keyUrl = PROVIDERS.find((p) => p.value === provider)?.keyUrl ?? PROVIDERS[0].keyUrl;

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-full transition-colors ${
          savedKey
            ? "text-green-700 bg-green-50 hover:bg-green-100"
            : "text-amber-700 bg-amber-50 hover:bg-amber-100"
        }`}
      >
        <KeyRound size={16} />
        {savedKey ? "מפתח API מוגדר" : "הגדרת מפתח API"}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-outline/20 p-4 z-40 text-right">
          <h3 className="text-sm font-bold text-ink mb-1">מפתח API משלכם</h3>
          <p className="text-xs text-ink-muted mb-3">
            כדי שכל משתמש ישלם על השימוש שלו (ולא ישתמש במכסה של מפתח אחר), בחרו ספק והדביקו כאן
            מפתח API משלכם — חינמי ב-
            <a href={keyUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              {keyUrl.replace("https://", "")}
            </a>
            . כל ספק שומר את המפתח שלו בנפרד, רק בדפדפן שלכם.
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
          <div className="relative mb-3">
            <input
              type={showKey ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="API Key..."
              className="w-full border border-outline/40 rounded-lg px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={() => setShowKey((v) => !v)}
              aria-label={showKey ? "הסתרת המפתח" : "הצגת המפתח"}
              className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
            >
              {showKey ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!draft.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg"
            >
              <Check size={14} />
              שמירה
            </button>
            {savedKey && (
              <button
                onClick={handleClear}
                className="flex-1 flex items-center justify-center gap-1.5 bg-surface-container hover:bg-surface-container-high text-ink-muted text-sm px-3 py-2 rounded-lg"
              >
                <Trash2 size={14} />
                הסרה
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
