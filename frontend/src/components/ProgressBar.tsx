import { useI18n } from "../i18n/useI18n";
import type { TranslationKey } from "../i18n/useI18n";

const STEPS: { num: number; labelKey: TranslationKey }[] = [
  { num: 1, labelKey: "progress.step1" },
  { num: 2, labelKey: "progress.step2" },
  { num: 3, labelKey: "progress.step3" },
  { num: 4, labelKey: "progress.step4" },
];

export default function ProgressBar({
  step,
  maxStepReached,
  onStepClick,
}: {
  step: number;
  /** Furthest step reached this session — a circle is only clickable up to
   * here, since going forward past it means a step that doesn't have
   * content yet. */
  maxStepReached: number;
  onStepClick: (step: number) => void;
}) {
  const { t } = useI18n();
  return (
    <div className="flex items-start justify-between mb-10 relative">
      <div className="absolute left-0 right-0 top-5 h-1 bg-surface-container -z-10"></div>
      {STEPS.map((s) => {
        const reached = s.num <= maxStepReached;
        return (
          <button
            key={s.num}
            type="button"
            onClick={() => reached && onStepClick(s.num)}
            disabled={!reached}
            aria-current={step === s.num ? "step" : undefined}
            className={`flex flex-col items-center gap-2 bg-white px-2 ${
              reached ? "cursor-pointer" : "cursor-default"
            }`}
          >
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-sm transition-colors duration-500 ${
                step >= s.num
                  ? "bg-primary text-white shadow-md"
                  : "bg-surface-container text-ink-muted"
              } ${reached && step !== s.num ? "hover:ring-2 hover:ring-primary/40" : ""}`}
            >
              {s.num}
            </div>
            <span
              className={`text-xs ${step >= s.num ? "text-ink font-medium" : "text-ink-muted"}`}
            >
              {t(s.labelKey)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
