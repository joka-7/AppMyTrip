import { useState } from "react";
import { ListChecks, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import type { ChecklistItem, TripData } from "../api";
import { useI18n } from "../i18n/useI18n";
import { useChecklistTicks } from "../hooks/useChecklistTicks";

/** `null` targets the trip-wide list; a number targets that day index. */
export type ChecklistTarget = number | null;

/**
 * "What we need" — the per-day and trip-wide list of things to bring.
 *
 * Ticks are per-viewer (see useChecklistTicks) while the items themselves live
 * on the trip, so a shared link shows everyone the same list but lets each
 * person pack their own bag.
 */
export default function ChecklistPanel({
  tripData,
  activeDayIndex,
  ticksScope,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onSuggest,
  isSuggesting,
  suggestError,
}: {
  tripData: TripData;
  /** Which day the itinerary is currently showing — listed first, before the rest. */
  activeDayIndex: number;
  ticksScope?: string;
  onAddItem?: (target: ChecklistTarget, text: string) => void;
  onUpdateItem?: (target: ChecklistTarget, itemId: string, text: string) => void;
  onDeleteItem?: (target: ChecklistTarget, itemId: string) => void;
  onSuggest?: () => void;
  isSuggesting?: boolean;
  suggestError?: string | null;
}) {
  const { t } = useI18n();
  const { ticked, toggle } = useChecklistTicks(ticksScope);
  const [showAllDays, setShowAllDays] = useState(false);

  const days = tripData.days ?? [];
  const tripItems = tripData.checklist ?? [];
  const editable = Boolean(onAddItem && onUpdateItem && onDeleteItem);

  const totalItems = tripItems.length + days.reduce((n, d) => n + (d.checklist?.length ?? 0), 0);
  const allIds = [
    ...tripItems.map((i) => i.id),
    ...days.flatMap((d) => (d.checklist ?? []).map((i) => i.id)),
  ];
  const doneCount = allIds.filter((id) => ticked.has(id)).length;

  const visibleDays = showAllDays
    ? days.map((day, index) => ({ day, index }))
    : days
        .map((day, index) => ({ day, index }))
        .filter(({ index }) => index === Math.min(activeDayIndex, days.length - 1));

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {totalItems > 0 && (
          <span className="text-xs font-semibold text-ink-muted">
            {t("checklist.packed", { done: doneCount, total: totalItems })}
          </span>
        )}
        <div className="flex flex-wrap items-center gap-2 ms-auto">
          {days.length > 1 && (
            <button
              onClick={() => setShowAllDays((v) => !v)}
              className="text-xs font-semibold text-primary hover:text-primary-dark bg-primary/10 hover:bg-primary/20 px-2.5 py-1 rounded-full transition-colors"
            >
              {showAllDays ? t("checklist.showThisDay") : t("checklist.showAllDays")}
            </button>
          )}
          {onSuggest && (
            <button
              onClick={onSuggest}
              disabled={isSuggesting}
              className="flex items-center gap-1.5 text-xs font-semibold text-secondary-dark bg-secondary/10 hover:bg-secondary/20 disabled:opacity-60 px-2.5 py-1 rounded-full transition-colors"
            >
              <Sparkles size={13} />
              {isSuggesting ? t("checklist.suggesting") : t("checklist.suggest")}
            </button>
          )}
        </div>
      </div>

      {suggestError && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          {suggestError}
        </p>
      )}

      {totalItems === 0 && !editable && (
        <div className="h-full flex flex-col items-center justify-center text-center text-ink-muted gap-3 px-6 py-10">
          <ListChecks size={36} className="opacity-40" />
          <p className="text-sm">{t("checklist.empty")}</p>
        </div>
      )}

      <ChecklistSection
        heading={t("checklist.tripWide")}
        target={null}
        items={tripItems}
        ticked={ticked}
        onToggle={toggle}
        onAddItem={onAddItem}
        onUpdateItem={onUpdateItem}
        onDeleteItem={onDeleteItem}
        showEmptyHint={totalItems === 0 && editable}
      />

      {visibleDays.map(({ day, index }) => (
        <ChecklistSection
          key={day.dayNum}
          heading={t("checklist.dayHeading", { num: day.dayNum })}
          target={index}
          items={day.checklist ?? []}
          ticked={ticked}
          onToggle={toggle}
          onAddItem={onAddItem}
          onUpdateItem={onUpdateItem}
          onDeleteItem={onDeleteItem}
        />
      ))}
    </div>
  );
}

function ChecklistSection({
  heading,
  target,
  items,
  ticked,
  onToggle,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  showEmptyHint,
}: {
  heading: string;
  target: ChecklistTarget;
  items: ChecklistItem[];
  ticked: Set<string>;
  onToggle: (itemId: string) => void;
  onAddItem?: (target: ChecklistTarget, text: string) => void;
  onUpdateItem?: (target: ChecklistTarget, itemId: string, text: string) => void;
  onDeleteItem?: (target: ChecklistTarget, itemId: string) => void;
  showEmptyHint?: boolean;
}) {
  const { t } = useI18n();
  const [newText, setNewText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  // A read-only viewer with nothing in this section has nothing to show.
  if (items.length === 0 && !onAddItem) return null;

  const submitNew = () => {
    const text = newText.trim();
    if (!text || !onAddItem) return;
    onAddItem(target, text);
    setNewText("");
  };

  const submitEdit = (itemId: string) => {
    const text = editText.trim();
    if (text && onUpdateItem) onUpdateItem(target, itemId, text);
    setEditingId(null);
    setEditText("");
  };

  return (
    <section className="bg-white p-4 rounded-xl shadow-card border border-outline/20 break-inside-avoid">
      <h4 className="font-bold text-ink text-sm mb-2">{heading}</h4>

      {showEmptyHint && items.length === 0 && (
        <p className="text-xs text-ink-muted mb-2">{t("checklist.empty")}</p>
      )}

      <ul className="divide-y divide-outline/20">
        {items.map((item) => {
          const isTicked = ticked.has(item.id);
          return (
            <li key={item.id} className="flex items-center gap-2 py-1.5 min-w-0">
              {editingId === item.id ? (
                <>
                  <input
                    autoFocus
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && submitEdit(item.id)}
                    aria-label={t("checklist.editAria", { text: item.text })}
                    className="flex-1 min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
                  />
                  <button
                    onClick={() => submitEdit(item.id)}
                    className="shrink-0 bg-primary hover:bg-primary-dark text-white text-xs px-2.5 py-1 rounded-lg"
                  >
                    {t("common.save")}
                  </button>
                </>
              ) : (
                <>
                  <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isTicked}
                      onChange={() => onToggle(item.id)}
                      className="shrink-0 w-4 h-4 accent-primary"
                    />
                    <span
                      className={`text-sm truncate ${
                        isTicked ? "line-through text-ink-muted" : "text-ink"
                      }`}
                    >
                      {item.text}
                    </span>
                  </label>
                  {onUpdateItem && (
                    <button
                      onClick={() => {
                        setEditingId(item.id);
                        setEditText(item.text);
                      }}
                      aria-label={t("checklist.editAria", { text: item.text })}
                      className="shrink-0 text-amber-500 hover:text-amber-700 p-1"
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                  {onDeleteItem && (
                    <button
                      onClick={() => onDeleteItem(target, item.id)}
                      aria-label={t("checklist.deleteAria", { text: item.text })}
                      className="shrink-0 text-red-500 hover:text-red-700 p-1"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </>
              )}
            </li>
          );
        })}
      </ul>

      {onAddItem && (
        <div className="flex items-center gap-2 mt-2 min-w-0 no-print">
          <input
            value={newText}
            onChange={(e) => setNewText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNew()}
            placeholder={t("checklist.addPlaceholder")}
            aria-label={`${heading} — ${t("checklist.addAria")}`}
            className="flex-1 min-w-0 border border-outline/40 rounded-lg p-1.5 text-sm"
          />
          <button
            onClick={submitNew}
            disabled={!newText.trim()}
            className="shrink-0 flex items-center gap-1 bg-primary hover:bg-primary-dark disabled:opacity-50 text-white text-xs px-2.5 py-1.5 rounded-lg"
          >
            <Plus size={13} />
            {t("checklist.add")}
          </button>
        </div>
      )}
    </section>
  );
}
