import { useState, type RefObject } from "react";
import { ExternalLink } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import {
  buildExternalChatUrl,
  copyToClipboard,
  EXTERNAL_CHAT_PROVIDERS,
} from "../services/externalChat";
import LanguageIndicator from "./LanguageIndicator";

export interface AgentMessage {
  role: string;
  text: string;
}

/** One row of "ChatGPT / Claude / Gemini / Groq" deep links for `question`,
 * shared by both the failure-notice path and the proactive toggle below. */
function ExternalChatLinks({ question }: { question: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-muted">
      <span>{t("chat.askElsewhere")}</span>
      {EXTERNAL_CHAT_PROVIDERS.map((provider) => (
        <a
          key={provider.id}
          href={buildExternalChatUrl(provider, question)}
          target="_blank"
          rel="noreferrer"
          onClick={() => copyToClipboard(question)}
          className="font-medium text-primary hover:text-primary-dark underline"
        >
          {provider.name}
        </a>
      ))}
    </div>
  );
}

/**
 * Message list + input form for the AI agent chat. Reused by BuilderStep3
 * (the dedicated chat step) and by AppFrame's chat tab, in both the live
 * builder preview and the standalone shared-trip page.
 */
export default function ChatPanel({
  agentMessages,
  chatEndRef,
  chatInput,
  onChangeChatInput,
  onSendMessage,
  isSending,
  notice,
  onRetry,
  failedText,
  language,
}: {
  agentMessages: AgentMessage[];
  chatEndRef: RefObject<HTMLDivElement>;
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  isSending?: boolean;
  notice?: string | null;
  /** Shown next to a failed-turn notice so the user can resend without retyping. */
  onRetry?: () => void;
  /** The message that failed to send — when set alongside `notice`, offers it
   * back as a deep link into a free external AI chat (nothing left for us to
   * retry automatically at this point; every saved credential already failed). */
  failedText?: string | null;
  language?: string | null;
}) {
  const { t } = useI18n();
  const [showExternalOptions, setShowExternalOptions] = useState(false);
  const trimmedInput = chatInput.trim();
  return (
    <div className="flex flex-col h-full">
      <div className="flex justify-end mb-2">
        <LanguageIndicator language={language} />
      </div>
      <div className="bg-surface-container-low rounded-xl p-4 flex-1 min-h-[250px] overflow-y-auto mb-4 border border-outline/20 flex flex-col gap-4 shadow-inner">
        {agentMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className={`max-w-[80%] p-3 text-sm whitespace-pre-line ${
                msg.role === "user"
                  ? "bg-primary text-white rounded-2xl rounded-tr-sm shadow-md"
                  : "bg-white border border-outline/20 text-ink rounded-2xl rounded-tl-sm shadow-sm"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start animate-fade-in">
            <div className="max-w-[80%] p-3 bg-white border border-outline/20 text-ink rounded-2xl rounded-tl-sm shadow-sm flex items-center gap-1">
              <span className="w-1.5 h-1.5 bg-ink-muted/50 rounded-full animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 bg-ink-muted/50 rounded-full animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 bg-ink-muted/50 rounded-full animate-bounce" />
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {notice && (
        <div className="flex flex-col gap-1.5 mb-2">
          <div className="flex items-center gap-2">
            <p className="text-xs text-amber-700 flex-1">{notice}</p>
            {onRetry && (
              <button
                type="button"
                onClick={onRetry}
                disabled={isSending}
                className="shrink-0 text-xs font-medium text-primary hover:text-primary-dark disabled:opacity-60 px-2 py-1 rounded-lg bg-primary/10"
              >
                {t("notice.retry")}
              </button>
            )}
          </div>
          {failedText && <ExternalChatLinks question={failedText} />}
        </div>
      )}

      <div className="flex items-center justify-between mb-1">
        <button
          type="button"
          onClick={() => setShowExternalOptions((v) => !v)}
          className="flex items-center gap-1 text-[11px] text-ink-muted hover:text-primary"
        >
          <ExternalLink size={12} />
          {t("chat.askExternallyToggle")}
        </button>
      </div>
      {showExternalOptions && (
        <div className="mb-2">
          {trimmedInput ? (
            <ExternalChatLinks question={trimmedInput} />
          ) : (
            <p className="text-xs text-ink-muted">{t("chat.askExternallyNeedsText")}</p>
          )}
        </div>
      )}

      <form onSubmit={onSendMessage} className="flex gap-2">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => onChangeChatInput(e.target.value)}
          placeholder={t("chat.inputPlaceholder")}
          disabled={isSending}
          className="flex-1 border border-outline/40 rounded-xl p-3 outline-none focus:ring-2 focus:ring-primary/50 shadow-sm disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={isSending}
          className="bg-secondary hover:bg-secondary-dark disabled:opacity-60 text-white px-6 rounded-xl font-medium transition-colors shadow-sm"
        >
          {t("chat.send")}
        </button>
      </form>
    </div>
  );
}
