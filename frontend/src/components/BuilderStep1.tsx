import { useState } from "react";
import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { PasteExternalReply } from "modeldispatcher-react-ui";
import "modeldispatcher-react-ui/styles.css";
import { useI18n, type TranslationKey } from "../i18n/useI18n";
import { useRotatingHint } from "../hooks/useRotatingHint";
import ExternalChatLinks from "./ExternalChatLinks";
import { buildTripParsePrompt } from "../services/externalTripPrompt";
import { parseExternalTripReply } from "../services/externalTripReply";
import {
  buildExternalChatUrl,
  copyToClipboard,
  EXTERNAL_CHAT_PROVIDERS,
  loadFavoriteExternalChat,
  type AiMode,
} from "../services/externalChat";
import type { TripData } from "../api";

const PARSE_HINTS: readonly TranslationKey[] = [
  "step1.hint.reading",
  "step1.hint.structuring",
  "step1.hint.activities",
];

export default function BuilderStep1({
  rawText,
  onChangeRawText,
  preferences,
  onChangePreferences,
  onSubmit,
  isProcessing,
  hasExistingTrip,
  onContinueWithoutReprocessing,
  aiMode,
  onExternalReplyParsed,
}: {
  rawText: string;
  onChangeRawText: (text: string) => void;
  preferences: string;
  onChangePreferences: (text: string) => void;
  onSubmit: () => void;
  isProcessing: boolean;
  /** True once a trip was already parsed this session — lets the user go back here to tweak text without losing the ability to return without re-running the AI. */
  hasExistingTrip: boolean;
  onContinueWithoutReprocessing: () => void;
  /** Which BYOK path this app uses (see services/externalChat.ts's AiMode,
   * set from the ⋮ menu's AI settings): "apiKey" submits to this app's own
   * backend with a saved key, same as always; "external" skips the backend
   * call entirely (this app never has its own key to fall back to) and hands
   * the parse prompt to the visitor's chosen free chat app instead. */
  aiMode: AiMode;
  /** Called with a trip parsed from a pasted external-AI reply — continues
   * exactly as a successful backend parse would. */
  onExternalReplyParsed: (tripData: TripData) => void;
}) {
  const { t } = useI18n();
  const waitHint = useRotatingHint(isProcessing, PARSE_HINTS);
  const [replyError, setReplyError] = useState(false);
  const [showOtherProviders, setShowOtherProviders] = useState(false);
  const favoriteId = aiMode === "external" ? loadFavoriteExternalChat() : null;
  const favoriteProvider = EXTERNAL_CHAT_PROVIDERS.find((p) => p.id === favoriteId);
  const question = buildTripParsePrompt(rawText, preferences);

  function handleExternalReply(rawReply: string): void {
    try {
      onExternalReplyParsed(parseExternalTripReply(rawReply));
      setReplyError(false);
    } catch {
      setReplyError(true);
    }
  }

  function handleSendToFavorite(): void {
    if (!favoriteProvider) return;
    copyToClipboard(question);
    window.open(buildExternalChatUrl(favoriteProvider, question), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-4">{t("step1.heading")}</h2>
      <p className="text-ink-muted mb-6">{t("step1.subtitle")}</p>
      <textarea
        value={rawText}
        onChange={(e) => onChangeRawText(e.target.value)}
        className="w-full h-48 p-4 border border-outline/40 rounded-xl focus:ring-2 focus:ring-primary/50 outline-none resize-none mb-4 shadow-sm"
        placeholder={t("step1.textareaPlaceholder")}
      />
      <label className="block text-sm font-medium text-ink-muted mb-2">
        {t("step1.preferencesLabel")}
      </label>
      <input
        type="text"
        value={preferences}
        onChange={(e) => onChangePreferences(e.target.value)}
        className="w-full p-3 border border-outline/40 rounded-xl focus:ring-2 focus:ring-primary/50 outline-none mb-6 shadow-sm"
        placeholder={t("step1.preferencesPlaceholder")}
      />
      <div className="flex gap-3">
        {hasExistingTrip && (
          <button
            onClick={onContinueWithoutReprocessing}
            disabled={isProcessing}
            className="bg-surface-container hover:bg-surface-container-high disabled:opacity-60 text-ink-muted px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
          >
            <ChevronLeft size={20} />
            {t("step1.continueWithoutReprocessing")}
          </button>
        )}
        {aiMode === "apiKey" ? (
          <button
            onClick={onSubmit}
            disabled={isProcessing}
            aria-busy={isProcessing}
            className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            {isProcessing
              ? t("step1.processing")
              : hasExistingTrip
                ? t("step1.reprocess")
                : t("step1.submit")}
            {!isProcessing && <ChevronRight size={20} />}
          </button>
        ) : (
          <button
            onClick={favoriteProvider ? handleSendToFavorite : () => setShowOtherProviders(true)}
            disabled={!rawText.trim()}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            <Send size={20} />
            {favoriteProvider
              ? t("step1.external.sendToFavorite", { favorite: favoriteProvider.name })
              : t("step1.external.sendButton")}
          </button>
        )}
      </div>
      {waitHint && (
        <p className="mt-3 text-sm text-ink-muted text-center animate-fade-in" aria-live="polite">
          {t(waitHint)}
        </p>
      )}

      {aiMode === "external" && (
        <div className="mt-6 pt-6 border-t border-outline/20">
          <h3 className="text-sm font-semibold mb-1">{t("step1.external.heading")}</h3>
          <p className="text-xs text-ink-muted mb-2">{t("step1.external.intro")}</p>
          {rawText.trim() && favoriteProvider && !showOtherProviders && (
            <button
              type="button"
              onClick={() => setShowOtherProviders(true)}
              className="text-xs text-primary hover:text-primary-dark underline mb-3"
            >
              {t("step1.external.tryAnother")}
            </button>
          )}
          {rawText.trim() && (!favoriteProvider || showOtherProviders) && (
            <div className="mb-3">
              <ExternalChatLinks question={question} />
            </div>
          )}
          <PasteExternalReply
            label={t("step1.external.pasteLabel")}
            placeholder={t("step1.external.pastePlaceholder")}
            applyLabel={t("step1.external.pasteApply")}
            onApply={handleExternalReply}
          />
          {replyError && (
            <p className="mt-2 text-xs text-red-600">{t("step1.external.invalidReply")}</p>
          )}
        </div>
      )}
    </div>
  );
}
