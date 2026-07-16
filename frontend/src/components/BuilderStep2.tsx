import { useState } from "react";
import {
  Car,
  ChevronLeft,
  ChevronRight,
  Link as LinkIcon,
  Train,
  Volume2,
  Wallet,
} from "lucide-react";
import type { EnhanceOptions } from "../api";
import { useI18n, type TranslationKey } from "../i18n/useI18n";

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
];

export default function BuilderStep2({
  onSubmit,
  onSkip,
  onBack,
  isEnhancing,
}: {
  onSubmit: (options: EnhanceOptions) => void;
  onSkip: () => void;
  onBack: () => void;
  isEnhancing: boolean;
}) {
  const { t } = useI18n();
  const [options, setOptions] = useState<EnhanceOptions>({});

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
        ) : (
          <button
            onClick={() => onSubmit(options)}
            disabled={isEnhancing}
            className="bg-primary hover:bg-primary-dark disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
          >
            {isEnhancing ? t("step2.submitting") : t("step2.submit")}
            {!isEnhancing && <ChevronRight size={20} />}
          </button>
        )}
      </div>
    </div>
  );
}
