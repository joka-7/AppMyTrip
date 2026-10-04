import { ExternalLink } from "lucide-react";
import { useI18n } from "../i18n/useI18n";
import {
  buildExternalChatUrl,
  copyToClipboard,
  EXTERNAL_CHAT_PROVIDERS,
  externalChatSignUpUrl,
} from "../services/externalChat";

/** One row of "ChatGPT / Claude / Gemini / Groq" deep links for `question`,
 * plus a "don't have an account yet?" sign-up link per provider — shared by
 * ChatPanel's failure-notice/proactive-toggle paths and BuilderStep1's
 * no-key escape hatch. */
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
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {EXTERNAL_CHAT_PROVIDERS.map((provider) => {
          const signUpUrl = externalChatSignUpUrl(provider);
          if (!signUpUrl) return null;
          return (
            <a
              key={provider.id}
              href={signUpUrl}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-1 font-medium text-primary hover:text-primary-dark"
            >
              <ExternalLink size={12} />
              {t("chat.newUser", { provider: provider.name })}
            </a>
          );
        })}
      </div>
    </div>
  );
}
