import type { RefObject } from "react";
import { useI18n } from "../i18n/useI18n";
import LanguageIndicator from "./LanguageIndicator";

export interface AgentMessage {
  role: string;
  text: string;
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
  language,
}: {
  agentMessages: AgentMessage[];
  chatEndRef: RefObject<HTMLDivElement>;
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  isSending?: boolean;
  notice?: string | null;
  language?: string | null;
}) {
  const { t } = useI18n();
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
              className={`max-w-[80%] p-3 text-sm ${
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

      {notice && <p className="text-xs text-amber-700 mb-2">{notice}</p>}

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
