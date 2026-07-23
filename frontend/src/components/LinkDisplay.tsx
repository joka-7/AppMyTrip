import { useState } from "react";
import { Check, Copy, ExternalLink } from "lucide-react";
import { useI18n } from "../i18n/useI18n";

/** A saved/shared link, shown as readonly text (not just silently copied to
 * the clipboard) so the user can actually see and verify it, plus copy/open. */
export default function LinkDisplay({ url }: { url: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="flex flex-col gap-1.5 bg-primary/5 border border-primary/20 rounded-lg p-2">
      {/* A single-line <input> would just truncate a long URL with no way to
          read the rest of it — wrap it across lines instead so it's always
          fully visible; still selectable/copyable by hand, plus the button. */}
      <p
        className="bg-white border border-outline/40 rounded-md px-2 py-1 text-xs text-ink break-all select-all"
        dir="ltr"
      >
        {url}
      </p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button
          onClick={handleCopy}
          className="flex items-center gap-1 bg-primary hover:bg-primary-dark text-white px-2 py-1 rounded-md text-xs"
        >
          {copied ? <Check size={12} /> : <Copy size={12} />}
          {copied ? t("step4.copied") : t("step4.copyLink")}
        </button>
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 bg-white border border-outline/40 hover:bg-surface-container text-primary px-2 py-1 rounded-md text-xs"
        >
          <ExternalLink size={12} />
          {t("step4.openLink")}
        </a>
      </div>
    </div>
  );
}
