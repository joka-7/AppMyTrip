import { ExternalLink } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import { PROVIDERS } from "../services/apiKey";
import {
  buildExternalChatUrl,
  copyToClipboard,
  EXTERNAL_CHAT_PROVIDERS,
} from "../services/externalChat";

const FREE_KEY_PROVIDERS = PROVIDERS.filter((p) => p.free);

/** One row of "ChatGPT / Claude / Gemini / Groq" deep links for `question`,
 * plus a second row pointing new users at a free API key instead (reusing
 * the same provider table AiSettingsPanel's "apiKey" mode already shows a
 * "get a free key" link from, rather than a one-off sign-up-link map for
 * the chat products themselves) — shared by ChatPanel's
 * failure-notice/proactive-toggle paths and the builder steps' no-key
 * escape hatch. */
export default function ExternalChatLinks({ question }: { question: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col gap-1 text-xs text-ink-muted">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
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
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className="flex items-center gap-1">
          <ExternalLink size={12} />
          {t("chat.getFreeKey")}
        </span>
        {FREE_KEY_PROVIDERS.map((provider) => (
          <a
            key={provider.value}
            href={provider.keyUrl}
            target="_blank"
            rel="noreferrer"
            aria-label={t("chat.getFreeKeyAria", { provider: provider.label })}
            className="font-medium text-primary hover:text-primary-dark underline"
          >
            {provider.label}
          </a>
        ))}
      </div>
    </div>
  );
}
