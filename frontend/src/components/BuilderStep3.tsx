import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";
import { useI18n } from "../i18n/useI18n";
import ChatPanel, { type AgentMessage } from "./ChatPanel";

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
  tripDates,
  onChangeTripDates,
  language,
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
  tripDates: string;
  onChangeTripDates: (dates: string) => void;
  language?: string | null;
}) {
  const { t } = useI18n();
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
