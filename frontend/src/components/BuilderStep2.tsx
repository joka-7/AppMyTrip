import { useState } from "react";
import {
  Backpack,
  Car,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  Route,
  Send,
  Train,
  Volume2,
  Wallet,
} from "lucide-react";
import { PasteExternalReply } from "modeldispatcher-react-ui";
import "modeldispatcher-react-ui/styles.css";
import type { EnhanceOptions, TripData } from "../api";
import { useRotatingHint } from "../hooks/useRotatingHint";
import { useI18n, type TranslationKey } from "../i18n/useI18n";
import ExternalChatLinks from "./ExternalChatLinks";
import {
  buildExternalChatUrl,
  copyToClipboard,
  EXTERNAL_CHAT_PROVIDERS,
  loadFavoriteExternalChat,
  type AiMode,
} from "../services/externalChat";
import { buildTripEnhancePrompt } from "../services/externalTripPrompt";
import { parseExternalTripReply } from "../services/externalTripReply";

const OPTIONS: {
  key: keyof EnhanceOptions;
  labelKey: TranslationKey;
  Icon: typeof Car;
}[] = [
  { key: "directions_car", labelKey: "step2.opt.directions_car", Icon: Car },
  { key: "directions_transit", labelKey: "step2.opt.directions_transit", Icon: Train },
  { key: "prices", labelKey: "step2.opt.prices", Icon: Wallet },
  { key: "podcast", labelKey: "step2.opt.podcast", Icon: Volume2 },
  { key: "links", labelKey: "step2.opt.links", Icon: LinkIcon },
  { key: "travel_mode", labelKey: "step2.opt.travel_mode", Icon: Route },
  { key: "packing", labelKey: "step2.opt.packing", Icon: Backpack },
];

const ENHANCE_HINTS: readonly TranslationKey[] = [
  "step2.hint.fetching",
  "step2.hint.enriching",
  "step2.hint.almost",
];

export default function BuilderStep2({
  tripData,
  onSubmit,
  onSkip,
  onBack,
  isEnhancing,
  aiMode,
  onExternalReplyParsed,
}: {
  tripData: TripData;
  onSubmit: (options: EnhanceOptions) => void;
  onSkip: () => void;
  onBack: () => void;
  isEnhancing: boolean;
  /** Which BYOK path this app uses (see services/externalChat.ts's AiMode):
   * "apiKey" submits to this app's own backend as before; "external" skips
   * the backend call entirely and hands a combined enrichment prompt to the
   * visitor's chosen free chat app instead. */
  aiMode: AiMode;
  /** Called with the fully enhanced trip parsed from a pasted external-AI
   * reply — continues exactly as a successful backend enhance would. */
  onExternalReplyParsed: (tripData: TripData) => void;
}) {
  const { t } = useI18n();
  const [options, setOptions] = useState<EnhanceOptions>({});
  const [replyError, setReplyError] = useState(false);
  const [showOtherProviders, setShowOtherProviders] = useState(false);
  const waitHint = useRotatingHint(isEnhancing, ENHANCE_HINTS);

  const toggle = (key: keyof EnhanceOptions) =>
    setOptions((prev) => ({ ...prev, [key]: !prev[key] }));

  const hasSelection = Object.values(options).some(Boolean);
  const allSelected = OPTIONS.every(({ key }) => options[key]);
  const toggleAll = () =>
    setOptions(
      allSelected
        ? {}
        : OPTIONS.reduce((acc, { key }) => ({ ...acc, [key]: true }), {} as EnhanceOptions),
    );

  const favoriteId = aiMode === "external" ? loadFavoriteExternalChat() : null;
  const favoriteProvider = EXTERNAL_CHAT_PROVIDERS.find((p) => p.id === favoriteId);
  const question = buildTripEnhancePrompt(tripData, options);

  function handleExternalReply(rawReply: string): void {
    try {
      onExternalReplyParsed(parseExternalTripReply(rawReply));
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
    <div className="animate-fade-in">
      <h2 className="text-2xl font-bold mb-2">{t("step2.heading")}</h2>
      <p className="text-ink-muted mb-6">{t("step2.subtitle")}</p>

      <label className="flex items-center gap-3 p-3 mb-3 bg-primary/5 rounded-xl border border-primary/20 cursor-pointer group">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={toggleAll}
          className="w-5 h-5 accent-primary rounded"
        />
        <span className="text-sm font-semibold text-primary">{t("step2.selectAll")}</span>
      </label>

      <div className="space-y-3 mb-6">
        {OPTIONS.map(({ key, labelKey, Icon }) => (
          <label
            key={key}
            className="flex items-center gap-3 p-3 bg-surface-container rounded-xl border border-outline/20 cursor-pointer group"
          >
            <input
              type="checkbox"
              checked={!!options[key]}
              onChange={() => toggle(key)}
              className="w-5 h-5 accent-primary rounded"
            />
            <Icon size={18} className="text-primary shrink-0" />
            <span className="text-sm font-medium text-ink group-hover:text-primary transition-colors">
              {t(labelKey)}
            </span>
          </label>
        ))}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onBack}
          disabled={isEnhancing}
          className="bg-surface-container hover:bg-surface-container-high disabled:opacity-60 text-ink-muted px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
        >
          <ChevronLeft size={20} />
          {t("common.back")}
        </button>
        {!hasSelection ? (
          <button
            onClick={onSkip}
            disabled={isEnhancing}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            {t("step2.skip")}
            <ChevronRight size={20} />
          </button>
        ) : aiMode === "apiKey" ? (
          <button
            onClick={() => onSubmit(options)}
            disabled={isEnhancing}
            aria-busy={isEnhancing}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            {isEnhancing ? t("step2.submitting") : t("step2.submit")}
            {!isEnhancing && <ChevronRight size={20} />}
          </button>
        ) : (
          <button
            onClick={favoriteProvider ? handleSendToFavorite : () => setShowOtherProviders(true)}
            className="bg-primary hover:bg-primary-dark text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            <Send size={20} />
            {favoriteProvider
              ? t("step2.external.sendToFavorite", { favorite: favoriteProvider.name })
              : t("step2.external.sendButton")}
          </button>
        )}
      </div>
      {waitHint && (
        <p className="mt-3 text-sm text-ink-muted text-center animate-fade-in" aria-live="polite">
          {t(waitHint)}
        </p>
      )}

      {aiMode === "external" && hasSelection && question && (
        <div className="mt-6 pt-6 border-t border-outline/20">
          <h3 className="text-sm font-semibold mb-1">{t("step2.external.heading")}</h3>
          <p className="text-xs text-ink-muted mb-2">{t("step2.external.intro")}</p>
          {favoriteProvider && !showOtherProviders && (
            <button
              type="button"
              onClick={() => setShowOtherProviders(true)}
              className="text-xs text-primary hover:text-primary-dark underline mb-3"
            >
              {t("step2.external.tryAnother")}
            </button>
          )}
          {(!favoriteProvider || showOtherProviders) && (
            <div className="mb-3">
              <ExternalChatLinks question={question} />
            </div>
          )}
          <PasteExternalReply
            label={t("step2.external.pasteLabel")}
            placeholder={t("step2.external.pastePlaceholder")}
            applyLabel={t("step2.external.pasteApply")}
            onApply={handleExternalReply}
          />
          {replyError && (
            <p className="mt-2 text-xs text-red-600">{t("step2.external.invalidReply")}</p>
          )}
        </div>
      )}
    </div>
  );
}
