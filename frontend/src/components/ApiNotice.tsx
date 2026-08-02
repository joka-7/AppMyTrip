import { AlertTriangle, RotateCcw, X } from "lucide-react";

export default function ApiNotice({
  message,
  onDismiss,
  actionLabel,
  onAction,
}: {
  message: string | null;
  onDismiss: () => void;
  /** Optional retry affordance (e.g. re-running a failed Step 2 enhancement)
   * shown next to the dismiss button; omitted entirely when there's nothing
   * sensible to retry. */
  actionLabel?: string;
  onAction?: () => void;
}) {
  if (!message) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-4">
      <div className="flex flex-wrap items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 shadow-sm">
        <AlertTriangle size={18} className="shrink-0" />
        <span className="flex-1 min-w-0 whitespace-pre-line">{message}</span>
        {onAction && actionLabel && (
          <button
            onClick={onAction}
            className="shrink-0 flex items-center gap-1 font-medium text-amber-800 hover:text-amber-900 bg-amber-100 hover:bg-amber-200 px-2.5 py-1 rounded-lg"
          >
            <RotateCcw size={14} />
            {actionLabel}
          </button>
        )}
        <button onClick={onDismiss} className="shrink-0 text-amber-500 hover:text-amber-700">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
