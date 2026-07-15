import { Component, type ReactNode } from "react";

interface Props {
  /** Called once when the Google Maps subtree throws, so the caller (MapView)
   * can fall back to the always-working OpenStreetMap map. */
  onError: () => void;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

/**
 * Scoped crash guard around the Google Maps subtree specifically. Google's
 * Maps JS SDK does imperative, sometimes-async DOM/array mutations (e.g.
 * Polyline's internal MVCArray) outside our control; if it throws, this stops
 * the failure from taking down the whole app (chat, itinerary, everything)
 * and instead degrades just the map tab to the free OpenStreetMap fallback.
 */
export default class GoogleMapsErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error) {
    console.error("Google Maps crashed, falling back to OpenStreetMap:", error);
    this.props.onError();
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
