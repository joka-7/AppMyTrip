import { AlertTriangle, X } from "lucide-react";

export default function ApiNotice({
  message,
  onDismiss,
}: {
  message: string | null;
  onDismiss: () => void;
}) {
  if (!message) return null;

  return (
    <div className="max-w-7xl mx-auto px-6 pt-4">
      <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 text-amber-800 text-sm rounded-xl px-4 py-3 shadow-sm">
        <AlertTriangle size={18} className="shrink-0" />
        <span className="flex-1 whitespace-pre-line">{message}</span>
        <button onClick={onDismiss} className="text-amber-500 hover:text-amber-700">
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
