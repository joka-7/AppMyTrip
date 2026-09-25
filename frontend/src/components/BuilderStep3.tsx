import { ChevronLeft, ChevronRight, Send } from "lucide-react";
import { useState, type RefObject } from "react";
import { PasteExternalReply } from "modeldispatcher-react-ui";
import "modeldispatcher-react-ui/styles.css";
import type { TripData } from "../api";
import { useI18n } from "../i18n/useI18n";
import ChatPanel, { type AgentMessage } from "./ChatPanel";
import ExternalChatLinks from "./ExternalChatLinks";
import {
  buildExternalChatUrl,
  copyToClipboard,
  EXTERNAL_CHAT_PROVIDERS,
  loadFavoriteExternalChat,
  type AiMode,
} from "../services/externalChat";
import { buildAgentTurnPrompt } from "../services/externalTripPrompt";
import { parseExternalAgentReply, type ExternalAgentTurn } from "../services/externalTripReply";

export type { AgentMessage };

export default function BuilderStep3({
  agentMessages,
  chatEndRef,
  chatInput,
  onChangeChatInput,
  onSendMessage,
  isSendingMessage,
  chatNotice,
  onRetryChat,
  failedChatText,
  onContinue,
  onBack,
  isGeneratingMedia,
  tripData,
  tripDates,
  onChangeTripDates,
  preferences,
  language,
  aiMode,
  onExternalTurnApplied,
}: {
  agentMessages: AgentMessage[];
  chatEndRef: RefObject<HTMLDivElement>;
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  isSendingMessage?: boolean;
  chatNotice?: string | null;
  onRetryChat?: () => void;
  failedChatText?: string | null;
  onContinue: () => void;
  onBack: () => void;
  isGeneratingMedia: boolean;
  /** Needed (alongside `chatInput`) to build the external-AI prompt below —
   * this step's own chat form still goes through `onSendMessage` unchanged
   * (see App.tsx's sendChatMessage), same as the live-preview's own chat tab
   * that reuses it; only this extra section is builder-specific. */
  tripData: TripData;
  tripDates: string;
  onChangeTripDates: (dates: string) => void;
  preferences: string;
  language?: string | null;
  /** Which BYOK path this app uses (see services/externalChat.ts's AiMode). */
  aiMode: AiMode;
  /** Called with the user's message and the updated trip + reply parsed from
   * a pasted external-AI reply — applies the turn exactly as a successful
   * backend chat turn would (minus the follow-up auto-enhance pass, which
   * needs its own backend key). */
  onExternalTurnApplied: (userMessage: string, turn: ExternalAgentTurn) => void;
}) {
  const { t } = useI18n();
  const [replyError, setReplyError] = useState(false);
  const [showOtherProviders, setShowOtherProviders] = useState(false);

  const favoriteId = aiMode === "external" ? loadFavoriteExternalChat() : null;
  const favoriteProvider = EXTERNAL_CHAT_PROVIDERS.find((p) => p.id === favoriteId);
  const trimmedInput = chatInput.trim();
  const question = trimmedInput ? buildAgentTurnPrompt(tripData, trimmedInput, preferences) : null;

  function handleExternalReply(rawReply: string): void {
    try {
      const turn = parseExternalAgentReply(rawReply);
      onExternalTurnApplied(trimmedInput, turn);
      onChangeChatInput("");
      setReplyError(false);
    } catch {
      setReplyError(true);
    }
  }

  function handleSendToFavorite(): void {
    if (!favoriteProvider || !question) return;
    copyToClipboard(question);
    window.open(buildExternalChatUrl(favoriteProvider, question), "_blank", "noopener,noreferrer");
  }

  return (
    <div className="animate-fade-in flex flex-col h-full">
      <h2 className="text-2xl font-bold mb-2">{t("step3.heading")}</h2>
      <p className="text-ink-muted mb-4">{t("step3.subtitle")}</p>

      <label className="block text-sm font-medium text-ink-muted mb-1">
        {t("step3.datesLabel")}
      </label>
      <input
        type="text"
        value={tripDates}
        onChange={(e) => onChangeTripDates(e.target.value)}
        placeholder={t("step3.datesPlaceholder")}
        className="w-full p-2.5 border border-outline/40 rounded-xl focus:ring-2 focus:ring-primary/50 outline-none mb-4 shadow-sm text-sm"
      />

      <div className="flex-1 mb-4 min-h-[250px]">
        <ChatPanel
          agentMessages={agentMessages}
          chatEndRef={chatEndRef}
          chatInput={chatInput}
          onChangeChatInput={onChangeChatInput}
          onSendMessage={onSendMessage}
          isSending={isSendingMessage}
          notice={chatNotice}
          onRetry={onRetryChat}
          failedText={failedChatText}
          language={language}
        />
      </div>

      {aiMode === "external" && (
        <div className="mb-4 pt-4 border-t border-outline/20">
          <h3 className="text-sm font-semibold mb-1">{t("step3.external.heading")}</h3>
          <p className="text-xs text-ink-muted mb-2">{t("step3.external.intro")}</p>
          {question ? (
            favoriteProvider ? (
              <>
                <button
                  type="button"
                  onClick={handleSendToFavorite}
                  className="mb-2 flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm px-4 py-2 rounded-xl font-medium transition-colors shadow-sm"
                >
                  <Send size={16} />
                  {t("step3.external.sendToFavorite", { favorite: favoriteProvider.name })}
                </button>
                {!showOtherProviders && (
                  <button
                    type="button"
                    onClick={() => setShowOtherProviders(true)}
                    className="block text-xs text-primary hover:text-primary-dark underline mb-3"
                  >
                    {t("step3.external.tryAnother")}
                  </button>
                )}
                {showOtherProviders && (
                  <div className="mb-3">
                    <ExternalChatLinks question={question} />
                  </div>
                )}
              </>
            ) : (
              <div className="mb-3">
                <ExternalChatLinks question={question} />
              </div>
            )
          ) : (
            <p className="text-xs text-ink-muted mb-3">{t("step3.external.needsText")}</p>
          )}
          <PasteExternalReply
            label={t("step3.external.pasteLabel")}
            placeholder={t("step3.external.pastePlaceholder")}
            applyLabel={t("step3.external.pasteApply")}
            onApply={handleExternalReply}
          />
          {replyError && (
            <p className="mt-2 text-xs text-red-600">{t("step3.external.invalidReply")}</p>
          )}
        </div>
      )}

      <div className="flex gap-3 mt-auto">
        <button
          onClick={onBack}
          disabled={isGeneratingMedia}
          className="bg-surface-container hover:bg-surface-container-high disabled:opacity-60 text-ink-muted px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
        >
          <ChevronLeft size={20} />
          {t("common.back")}
        </button>
        <button
          onClick={onContinue}
          disabled={isGeneratingMedia}
          className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
        >
          {isGeneratingMedia ? t("step3.generating") : t("step3.continue")}
          {!isGeneratingMedia && <ChevronRight size={20} />}
        </button>
      </div>
    </div>
  );
}
