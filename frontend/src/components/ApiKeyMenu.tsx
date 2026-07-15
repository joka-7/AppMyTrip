import { useState } from "react";
import { Check, Eye, EyeOff, KeyRound, MapPin, Plus, Trash2 } from "lucide-react";
import {
  addApiKey,
  getApiKeysForProvider,
  getApiProvider,
  PROVIDERS,
  removeApiKey,
  setApiProvider,
  type LLMProvider,
} from "../services/apiKey";
import {
  addGoogleMapsKey,
  getGoogleMapsKeys,
  GOOGLE_MAPS_KEY_URL,
  removeGoogleMapsKey,
} from "../services/mapsKey";

/** Masks a key for display so it's recognizable without exposing the whole secret. */
function maskKey(key: string): string {
  if (key.length <= 8) return "••••";
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

/** A saved key chip with a remove button. */
function KeyRow({ value, onRemove }: { value: string; onRemove: () => void }) {
  const masked = maskKey(value);
  return (
    <div className="flex items-center justify-between gap-2 bg-surface-container rounded-lg px-2.5 py-1.5">
      <span className="text-xs font-mono text-ink-muted truncate" dir="ltr">
        {masked}
      </span>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`הסרת מפתח ${masked}`}
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
 * free-tier keys together outlast any single key's quota. An optional Google Maps
 * key (also supporting several) swaps the in-app map to real Google Maps. Every
 * key is stored only in localStorage and never touches our backend's env vars.
 */
export default function ApiKeyMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const [provider, setProvider] = useState<LLMProvider>(getApiProvider());
  const [llmKeys, setLlmKeys] = useState<string[]>(() => getApiKeysForProvider(provider));
  const [llmDraft, setLlmDraft] = useState("");
  const [showLlmDraft, setShowLlmDraft] = useState(false);

  const [mapsKeys, setMapsKeys] = useState<string[]>(() => getGoogleMapsKeys());
  const [mapsDraft, setMapsDraft] = useState("");
  const [showMapsDraft, setShowMapsDraft] = useState(false);

  const handleProviderChange = (next: LLMProvider) => {
    setProvider(next);
    setApiProvider(next);
    setLlmKeys(getApiKeysForProvider(next));
    setLlmDraft("");
  };

  const handleAddLlmKey = () => {
    const trimmed = llmDraft.trim();
    if (!trimmed) return;
    addApiKey(trimmed, provider);
    setLlmKeys(getApiKeysForProvider(provider));
    setLlmDraft("");
  };

  const handleRemoveLlmKey = (key: string) => {
    removeApiKey(key, provider);
    setLlmKeys(getApiKeysForProvider(provider));
  };

  const handleAddMapsKey = () => {
    const trimmed = mapsDraft.trim();
    if (!trimmed) return;
    addGoogleMapsKey(trimmed);
    setMapsKeys(getGoogleMapsKeys());
    setMapsDraft("");
  };

  const handleRemoveMapsKey = (key: string) => {
    removeGoogleMapsKey(key);
    setMapsKeys(getGoogleMapsKeys());
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
          ? `מפתח API מוגדר${llmKeys.length > 1 ? ` (${llmKeys.length})` : ""}`
          : "הגדרת מפתח API"}
      </button>

      {isOpen && (
        <div className="absolute left-0 mt-2 w-80 bg-white rounded-xl shadow-lg border border-outline/20 p-4 z-40 text-right">
          <h3 className="text-sm font-bold text-ink mb-1">מפתחות API משלכם</h3>
          <p className="text-xs text-ink-muted mb-3">
            בחרו ספק והדביקו מפתח API משלכם — חינמי ב-
            <a href={keyUrl} target="_blank" rel="noreferrer" className="text-primary underline">
              {keyUrl.replace("https://", "")}
            </a>
            . אפשר להוסיף כמה מפתחות; כשאחד מגיע למגבלת הקצב נעבור אוטומטית לבא. הכול נשמר רק בדפדפן
            שלכם.
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

          <div className="relative mb-2">
            <input
              type={showLlmDraft ? "text" : "password"}
              value={llmDraft}
              onChange={(e) => setLlmDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddLlmKey()}
              placeholder="API Key..."
              className="w-full border border-outline/40 rounded-lg px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
            <button
              type="button"
              onClick={() => setShowLlmDraft((v) => !v)}
              aria-label={showLlmDraft ? "הסתרת המפתח" : "הצגת המפתח"}
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
            הוספת מפתח
          </button>

          <div className="border-t border-outline/20 mt-4 pt-4">
            <h3 className="text-sm font-bold text-ink mb-1 flex items-center gap-1.5">
              <MapPin size={14} />
              מפתחות Google Maps (רשות)
            </h3>
            <p className="text-xs text-ink-muted mb-3">
              עם מפתח Google Maps תוצג מפת Google אמיתית בתוך האפליקציה במקום מפת OpenStreetMap. ללא
              מפתח הכול עובד כרגיל. השיגו מפתח ב-
              <a
                href={GOOGLE_MAPS_KEY_URL}
                target="_blank"
                rel="noreferrer"
                className="text-primary underline"
              >
                Google Cloud
              </a>
              , והגבילו אותו לדומיין שלכם. שינוי ייכנס לתוקף לאחר רענון הדף.
            </p>

            {mapsKeys.length > 0 && (
              <div className="flex flex-col gap-1.5 mb-2">
                {mapsKeys.map((key) => (
                  <KeyRow key={key} value={key} onRemove={() => handleRemoveMapsKey(key)} />
                ))}
              </div>
            )}

            <div className="relative mb-2">
              <input
                type={showMapsDraft ? "text" : "password"}
                value={mapsDraft}
                onChange={(e) => setMapsDraft(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleAddMapsKey()}
                placeholder="Google Maps API Key..."
                className="w-full border border-outline/40 rounded-lg px-3 py-2 pl-9 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button
                type="button"
                onClick={() => setShowMapsDraft((v) => !v)}
                aria-label={showMapsDraft ? "הסתרת מפתח Google Maps" : "הצגת מפתח Google Maps"}
                className="absolute left-2 top-1/2 -translate-y-1/2 text-ink-muted hover:text-ink"
              >
                {showMapsDraft ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            <button
              onClick={handleAddMapsKey}
              disabled={!mapsDraft.trim()}
              aria-label="הוספת מפתח Google Maps"
              className="w-full flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-sm px-3 py-2 rounded-lg"
            >
              <Plus size={14} />
              הוספת מפתח
            </button>
          </div>

          <button
            onClick={() => setIsOpen(false)}
            className="w-full flex items-center justify-center gap-1.5 text-ink-muted hover:text-ink text-sm px-3 py-2 rounded-lg mt-3"
          >
            <Check size={14} />
            סגירה
          </button>
        </div>
      )}
    </div>
  );
}
