import type { Activity, TripData } from "../api";
import { useI18n } from "../i18n/useI18n";
import { ACTIVITY_TYPES, ACTIVITY_TYPE_LABEL_KEYS } from "../services/activityTypes";

const ACTIVITY_TYPE_DOT: Record<Activity["type"], string> = {
  attraction: "bg-emerald-500",
  food: "bg-secondary",
  lodging: "bg-indigo-500",
  transport: "bg-sky-500",
};

// Number formatting locale per UI language (thousands separators etc.); the
// currency symbol (₪) is part of the trip data, not the interface language.
const NUMBER_LOCALE: Record<string, string> = { he: "he-IL", en: "en-US", fr: "fr-FR" };

export default function PriceSummary({
  tripData,
  currency = "₪",
}: {
  tripData: TripData;
  currency?: string;
}) {
  const { t, lang } = useI18n();
  const formatPrice = (value: number): string =>
    value.toLocaleString(NUMBER_LOCALE[lang] ?? "he-IL", { maximumFractionDigits: 2 });
  const formatWithCurrency = (value: number): string => `${formatPrice(value)} ${currency}`;
  const days = tripData.days ?? [];
  const allActivities = days.flatMap((day) => day.activities);
  const grandTotal = allActivities.reduce((sum, act) => sum + (act.price ?? 0), 0);

  if (allActivities.every((act) => act.price == null)) {
    return (
      <div className="h-full flex items-center justify-center text-center text-ink-muted text-sm px-6">
        {t("price.empty")}
      </div>
    );
  }

  const categoryTotals = ACTIVITY_TYPES.map((type) => ({
    type,
    total: allActivities
      .filter((act) => act.type === type)
      .reduce((s, act) => s + (act.price ?? 0), 0),
  })).filter((c) => c.total > 0);

  return (
    <div className="space-y-4 animate-fade-in">
      {categoryTotals.length > 0 && (
        <div className="bg-white p-4 rounded-xl shadow-card border border-outline/20">
          <h4 className="font-bold text-ink text-sm mb-3">{t("price.byCategory")}</h4>
          <div className="grid grid-cols-2 gap-2.5">
            {categoryTotals.map(({ type, total }) => (
              <div key={type} className="flex items-center gap-2 text-sm">
                <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ACTIVITY_TYPE_DOT[type]}`} />
                <span className="text-ink-muted flex-1 truncate">
                  {t(ACTIVITY_TYPE_LABEL_KEYS[type])}
                </span>
                <span className="font-semibold text-ink">{formatWithCurrency(total)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {days.map((day) => {
        const dayTotal = day.activities.reduce((s, act) => s + (act.price ?? 0), 0);
        return (
          <div
            key={day.dayNum}
            className="bg-white p-4 rounded-xl shadow-card border border-outline/20"
          >
            <div className="flex items-center justify-between mb-2">
              <h4 className="font-bold text-ink">{t("appFrame.day", { num: day.dayNum })}</h4>
              <span className="text-sm font-semibold text-ink-muted">
                {formatWithCurrency(dayTotal)}
              </span>
            </div>
            <div className="divide-y divide-outline/20">
              {day.activities.map((act) => (
                <div key={act.id} className="flex items-center gap-2 py-1.5 text-sm text-ink-muted">
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${ACTIVITY_TYPE_DOT[act.type]}`}
                  />
                  <span className="truncate flex-1">{act.title}</span>
                  <span className="shrink-0 ms-2">
                    {act.price != null ? formatWithCurrency(act.price) : "—"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="bg-primary text-white p-4 rounded-xl shadow-card flex items-center justify-between">
        <span className="font-bold">{t("price.total")}</span>
        <span className="font-bold text-lg">{formatWithCurrency(grandTotal)}</span>
      </div>
    </div>
  );
}
