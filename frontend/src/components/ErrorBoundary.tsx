import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { dirFor, getLang, translate } from "../i18n/store";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Top-level crash guard. Without this, ANY uncaught render error anywhere in
 * the tree unmounts the whole app to a blank white screen with nothing for the
 * user to act on or report — indistinguishable from "the app crashed" with no
 * diagnostic trail. This catches it, shows a recoverable screen, and surfaces
 * the actual error so it can be reported instead of guessed at.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Uncaught error rendering the app:", error, info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    // A class component can't use the useI18n hook; the error screen doesn't
    // need to react to live language switches, so it reads the store directly.
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-surface p-6"
        dir={dirFor(getLang())}
      >
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg border border-outline/20 p-6 text-center">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3" />
          <h1 className="text-lg font-bold text-ink mb-1">{translate("errorBoundary.title")}</h1>
          <p className="text-sm text-ink-muted mb-4">{translate("errorBoundary.subtitle")}</p>
          <button
            onClick={() => window.location.reload()}
            className="inline-flex items-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm font-medium px-4 py-2 rounded-lg mb-4"
          >
            <RefreshCw size={14} />
            {translate("errorBoundary.reload")}
          </button>
          <details className="text-start text-xs text-ink-muted bg-surface-container-low rounded-lg p-2">
            <summary className="cursor-pointer select-none">
              {translate("errorBoundary.details")}
            </summary>
            <pre className="mt-2 whitespace-pre-wrap break-words">{error.message}</pre>
          </details>
        </div>
      </div>
    );
  }
}
