import { useCallback, useEffect, useState } from "react";
import { FolderOpen, X } from "lucide-react";
import type { TripData } from "../api";
import { useDismissable } from "../hooks/useDismissable";
import { useBackToClose } from "../hooks/useBackToClose";
import { useI18n, type TranslationKey } from "../i18n/useI18n";
import type { AppDesign } from "../services/appDesign";
import {
  type CloudTripSummary,
  type TripStage,
  deleteSharedTrip,
  deleteTrip,
  listTrips,
  loadTrip,
  onAuthChange,
} from "../services/tripsStore";

const STAGE_LABEL_KEYS: Record<TripStage, TranslationKey> = {
  step1: "cloud.stage.step1",
  step2: "cloud.stage.step2",
  step3: "cloud.stage.step3",
  step4: "cloud.stage.step4",
  final: "cloud.stage.final",
};

/**
 * Dedicated "My Trips" nav entry — split out of CloudMenu so viewing/loading
 * past trips has its own discoverable icon+label instead of being buried
 * inside the connect button's dropdown (where it was easy to miss entirely).
 * Renders nothing while signed out, since there's nothing to list.
 */
export default function MyTripsButton({
  tripId,
  onTripIdChange,
  onLoadTrip,
}: {
  /** Id of the trip currently being edited — used to clear it if that exact trip gets deleted. */
  tripId: string | null;
  onTripIdChange: (tripId: string | null) => void;
  onLoadTrip: (trip: TripData, tripId: string, appDesign: AppDesign) => void;
}) {
  const { t } = useI18n();
  const [uid, setUid] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [trips, setTrips] = useState<CloudTripSummary[]>([]);
  const [tripsLoading, setTripsLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const closePanel = useCallback(() => {
    setIsOpen(false);
    setConfirmDeleteId(null);
  }, []);
  const panelRef = useDismissable(isOpen, closePanel);
  useBackToClose(isOpen, closePanel);

  useEffect(() => {
    return onAuthChange((user) => {
      setUid(user?.uid ?? null);
      if (!user) setIsOpen(false);
    });
  }, []);

  const refreshTrips = useCallback(async (id: string) => {
    setTrips(await listTrips(id));
  }, []);

  const handleOpen = useCallback(
    (id: string) => {
      setIsOpen(true);
      setNotice(null);
      setTripsLoading(true);
      refreshTrips(id)
        .catch((err) => {
          console.error(err);
          setNotice(t("cloud.loadFailed"));
        })
        .finally(() => setTripsLoading(false));
    },
    [refreshTrips, t],
  );

  // The final/shared app's "My Trips" link navigates back here with
  // "myTrips=1" (see SharedAppPage's homeHref) so landing on the builder
  // also reopens the trips list, instead of requiring an extra manual click.
  useEffect(() => {
    if (!uid) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("myTrips") !== "1") return;
    handleOpen(uid);
    params.delete("myTrips");
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }, [uid, handleOpen]);

  const handleLoad = async (trip: CloudTripSummary) => {
    if (!uid) return;
    // A trip saved as "Final app" was actually published (see CloudMenu's
    // handleSave) — open the real "?shared=" link instead of loading it back
    // into the builder, so "final" really means the finished app, not a
    // look-alike preview you can still navigate away from into planning.
    if (trip.stage === "final") {
      const url = new URL(window.location.href);
      url.searchParams.set("shared", trip.id);
      window.location.assign(url.toString());
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      const { trip: loaded, appDesign: loadedAppDesign } = await loadTrip(uid, trip.id);
      onLoadTrip(loaded, trip.id, loadedAppDesign);
      closePanel();
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.loadFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (trip: CloudTripSummary) => {
    if (!uid) return;
    // Two-step confirm: first click arms the button, second click deletes.
    // Accidental hover-clicks used to wipe both the private trip and its
    // public share link with no undo.
    if (confirmDeleteId !== trip.id) {
      setConfirmDeleteId(trip.id);
      return;
    }
    setBusy(true);
    setConfirmDeleteId(null);
    try {
      await deleteTrip(uid, trip.id);
      // Best-effort: also revoke any public share link so it doesn't outlive the trip.
      await deleteSharedTrip(trip.id).catch((err) => console.error(err));
      await refreshTrips(uid);
      if (tripId === trip.id) onTripIdChange(null);
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.deleteFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!uid) return null;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => handleOpen(uid)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={t("cloud.myTrips")}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
      >
        <FolderOpen size={18} />
        {t("cloud.myTrips")}
      </button>

      {isOpen && (
        <div
          role="menu"
          className="fixed inset-x-4 top-4 max-h-[calc(100vh-2rem)] w-auto overflow-y-auto
              sm:absolute sm:inset-x-auto sm:top-auto sm:end-0 sm:mt-2 sm:max-h-[70vh] sm:w-80
              sm:max-w-[calc(100vw-2rem)] sm:overflow-y-auto bg-white rounded-xl shadow-lg
              border border-outline/20 p-4 z-40 text-start"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted">
              <FolderOpen size={14} />
              {t("cloud.myTrips")}
            </div>
            <button
              type="button"
              onClick={closePanel}
              aria-label={t("apiKey.close")}
              className="shrink-0 text-ink-muted hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          {notice && <p className="text-xs text-amber-700 mb-2">{notice}</p>}

          <ul className="max-h-64 overflow-y-auto space-y-1">
            {tripsLoading ? (
              <li className="text-xs text-ink-muted py-2">{t("cloud.loadingTrips")}</li>
            ) : (
              trips.length === 0 && (
                <li className="text-xs text-ink-muted py-2">{t("cloud.noTrips")}</li>
              )
            )}
            {trips.map((trip) => (
              <li key={trip.id} className="flex items-center gap-1 group">
                <button
                  onClick={() => handleLoad(trip)}
                  disabled={busy}
                  title={trip.name}
                  className="flex-1 min-w-0 flex items-center gap-1.5 text-sm text-ink text-start hover:text-primary px-2 py-1.5 rounded-lg hover:bg-surface-container"
                >
                  <span className="truncate">{trip.name}</span>
                  {trip.stage && (
                    <span className="shrink-0 text-[10px] font-medium text-ink-muted bg-surface-container-high px-1.5 py-0.5 rounded-full">
                      {t(STAGE_LABEL_KEYS[trip.stage])}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => handleDelete(trip)}
                  disabled={busy}
                  aria-label={
                    confirmDeleteId === trip.id
                      ? t("cloud.deleteConfirmAria", { name: trip.name })
                      : t("cloud.deleteAria", { name: trip.name })
                  }
                  className={`p-1 ${
                    confirmDeleteId === trip.id
                      ? "opacity-100 text-red-600 font-semibold text-[10px] px-1.5"
                      : "opacity-0 group-hover:opacity-100 focus:opacity-100 text-ink-muted hover:text-red-500"
                  }`}
                >
                  {confirmDeleteId === trip.id ? t("cloud.deleteConfirm") : <X size={14} />}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
