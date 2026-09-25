import { useI18n } from "../i18n/useI18n";
import {
  buildExternalChatUrl,
  copyToClipboard,
  EXTERNAL_CHAT_PROVIDERS,
} from "../services/externalChat";

/** One row of "ChatGPT / Claude / Gemini / Groq" deep links for `question` —
 * shared by ChatPanel's failure-notice/proactive-toggle paths and
 * BuilderStep1's no-key escape hatch. */
export default function ExternalChatLinks({ question }: { question: string }) {
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
