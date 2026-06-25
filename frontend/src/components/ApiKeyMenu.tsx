import { useState } from "react";
import { Check, KeyRound, Trash2 } from "lucide-react";
import {
  clearApiKey,
  getApiKey,
  getApiProvider,
  PROVIDERS,
  setApiKey,
  type LLMProvider,
} from "../services/apiKey";

/**
 * Lets each user pick their preferred LLM provider (Gemini, OpenAI, Claude,
 * or Groq) and paste in their own API key for it, so the app calls the LLM
 * with their key/quota instead of sharing the developer's. Stored in
 * localStorage and sent with each builder request; never touches our
 * backend's env vars.
 */
export default function ApiKeyMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [draft, setDraft] = useState(getApiKey() ?? "");
  const [provider, setProvider] = useState<LLMProvider>(getApiProvider());
  const [savedKey, setSavedKey] = useState(getApiKey());

  const handleSave = () => {
    const trimmed = draft.trim();
    if (!trimmed) return;
    setApiKey(trimmed, provider);
    setSavedKey(trimmed);
    setIsOpen(false);
  };

  const handleClear = () => {
    clearApiKey();
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
        <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-gray-200 p-4 z-40 text-right">
          <h3 className="text-sm font-bold text-gray-800 mb-1">מפתח API משלכם</h3>
          <p className="text-xs text-gray-500 mb-3">
            כדי שכל משתמש ישלם על השימוש שלו (ולא ישתמש במכסה של מפתח אחר), בחרו ספק והדביקו כאן
            מפתח API משלכם — חינמי ב-
            <a href={keyUrl} target="_blank" rel="noreferrer" className="text-blue-600 underline">
              {keyUrl.replace("https://", "")}
            </a>
            . המפתח נשמר רק בדפדפן שלכם.
          </p>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value as LLMProvider)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {PROVIDERS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          <input
            type="password"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="API Key..."
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex gap-2">
            <button
              onClick={handleSave}
              disabled={!draft.trim()}
              className="flex-1 flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg"
            >
              <Check size={14} />
              שמירה
            </button>
            {savedKey && (
              <button
                onClick={handleClear}
                className="flex-1 flex items-center justify-center gap-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-3 py-2 rounded-lg"
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
