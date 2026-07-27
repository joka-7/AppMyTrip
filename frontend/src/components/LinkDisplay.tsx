import { useState } from "react";
import { Check, Copy, ExternalLink, X } from "lucide-react";
import { useI18n } from "../i18n/useI18n";

/** A saved/shared link, shown as readonly text (not just silently copied to
 * the clipboard) so the user can actually see and verify it, plus copy/open. */
export default function LinkDisplay({ url }: { url: string }) {
  const { t } = useI18n();
  const [copyStatus, setCopyStatus] = useState<"idle" | "copied" | "failed">("idle");
  const handleCopy = async () => {
    // navigator.clipboard.writeText rejects (e.g. no clipboard permission,
    // insecure context) more often than it looks — silently swallowing that
    // and still showing "Copied!" would leave the user thinking a paste will
    // work when it won't. The raw URL above stays visible either way as a
    // manual fallback.
    try {
      await navigator.clipboard.writeText(url);
      setCopyStatus("copied");
    } catch (err) {
      console.error(err);
      setCopyStatus("failed");
    }
    setTimeout(() => setCopyStatus("idle"), 2000);
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
          {copyStatus === "copied" ? (
            <Check size={12} />
          ) : copyStatus === "failed" ? (
            <X size={12} />
          ) : (
            <Copy size={12} />
          )}
          {copyStatus === "copied"
            ? t("step4.copied")
            : copyStatus === "failed"
              ? t("step4.copyFailed")
              : t("step4.copyLink")}
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
