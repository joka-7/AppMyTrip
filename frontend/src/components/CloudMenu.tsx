import { useCallback, useEffect, useRef, useState } from "react";
import { Cloud, CloudOff, LogOut, PencilLine, Save, Share2, Trash2, X } from "lucide-react";
import type { TripData } from "../api";
import { useDismissable } from "../hooks/useDismissable";
import { useBackToClose } from "../hooks/useBackToClose";
import { useI18n, type TranslationKey } from "../i18n/useI18n";
import LinkDisplay from "./LinkDisplay";
import { appendErrorDetail } from "../services/errorMessage";
import { shareMessage } from "../services/shareLink";
import {
  type TripStage,
  createEditLink,
  deleteAllMyData,
  disableEditLink,
  editLinkFor,
  onAuthChange,
  saveTrip,
  shareTrip,
  signInWithGoogle,
  signOutOfGoogle,
} from "../services/tripsStore";

/** Share-duration choices shown next to the share button; 0 means "forever" (no expiry field stored). */
const SHARE_DURATIONS: { labelKey: TranslationKey; days: number }[] = [
  { labelKey: "share.days7", days: 7 },
  { labelKey: "share.days30", days: 30 },
  { labelKey: "share.days90", days: 90 },
  { labelKey: "share.forever", days: 0 },
];

/** "Save as" choices shown next to the save button, so a trip's saved name can
 * record which stage of the builder it was saved from. */
const SAVE_STAGES: { labelKey: TranslationKey; stage: TripStage }[] = [
  { labelKey: "cloud.stage.step1", stage: "step1" },
  { labelKey: "cloud.stage.step2", stage: "step2" },
  { labelKey: "cloud.stage.step3", stage: "step3" },
  { labelKey: "cloud.stage.step4", stage: "step4" },
  { labelKey: "cloud.stage.final", stage: "final" },
];

function stageForStep(step: number): TripStage {
  return step >= 1 && step <= 4 ? (`step${step}` as TripStage) : "final";
}
import type { AppDesign } from "../services/appDesign";

/** Sign-in + Save/Share controls backed by the user's Google Drive — see MyTripsButton for
 * viewing/loading/deleting past trips, split out into its own nav entry. */
export default function CloudMenu({
  tripData,
  appDesign,
  tripId,
  currentStep,
  onTripIdChange,
  onUpdateTrip,
}: {
  tripData: TripData;
  appDesign: AppDesign;
  /** Id of the trip currently being edited, shared with the step-4 deploy flow. */
  tripId: string | null;
  /** Current builder step (1-4) — used as the default "save as" stage. */
  currentStep: number;
  onTripIdChange: (tripId: string | null) => void;
  /** Applies a renamed title back to the trip being edited, so a name typed
   * into the save box (see BuilderStep4's own name field for the same idea)
   * sticks around instead of only living in the saved Firestore doc. */
  onUpdateTrip: (patch: Partial<Pick<TripData, "title">>) => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState<string | null>(null);
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => setIsOpen(false), []);
  const menuRef = useDismissable(isOpen, closeMenu);
  useBackToClose(isOpen, closeMenu);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [shareDays, setShareDays] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [editUrl, setEditUrl] = useState<string | null>(null);
  // Show the trip's existing edit link, if any, whenever the menu opens.
  useEffect(() => {
    if (!isOpen || !uid || !tripId) {
      setEditUrl(null);
      return;
    }
    let cancelled = false;
    editLinkFor(tripId)
      .then((link) => {
        if (!cancelled) setEditUrl(link);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [isOpen, uid, tripId]);
  const [saveStage, setSaveStage] = useState<TripStage>(() => stageForStep(currentStep));
  useEffect(() => {
    setSaveStage(stageForStep(currentStep));
  }, [currentStep]);
  // Local editable copy of the trip name for the save box — tracks
  // tripData.title until the user types their own (same pattern as
  // BuilderStep4's own trip-name field).
  const [saveName, setSaveName] = useState(tripData.title);
  const saveNameTouchedRef = useRef(false);
  const handleChangeSaveName = (value: string) => {
    saveNameTouchedRef.current = true;
    setSaveName(value);
  };
  useEffect(() => {
    if (!saveNameTouchedRef.current) setSaveName(tripData.title);
  }, [tripData.title]);
  useEffect(() => {
    return onAuthChange((user) => {
      if (user) {
        setEmail(user.email);
        setUid(user.uid);
        setDisplayName(user.displayName);
      } else {
        setEmail(null);
        setUid(null);
        setDisplayName(null);
      }
    });
  }, []);

  // Google sign-in errors (see driveSync.ts) carry a stable `.code` worth
  // telling apart: the user closing the popup isn't a failure at all, a
  // blocked popup and an unreachable Google each need a different fix, and
  // anything else gets the actual message appended so it's diagnosable.
  const describeSignInError = useCallback(
    (err: unknown): string | null => {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code: unknown }).code)
          : null;
      switch (code) {
        case "popup_closed":
        case "access_denied":
          return null;
        case "popup_failed_to_open":
          return t("cloud.signInPopupBlocked");
        case "gis-load-failed":
        case "offline":
          return t("cloud.signInNetworkFailed");
        default:
          return appendErrorDetail(
            t("cloud.signInFailed"),
            err instanceof Error ? err.message : String(err),
          );
      }
    },
    [t],
  );

  const handleSignIn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const session = await signInWithGoogle();
      setEmail(session.email);
      setUid(session.uid);
      setDisplayName(session.displayName);
    } catch (err) {
      console.error(err);
      setNotice(describeSignInError(err));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOutOfGoogle();
    setEmail(null);
    setUid(null);
    setDisplayName(null);
    onTripIdChange(null);
    setIsOpen(false);
  };

  // Two-step confirm, like deleting a single trip: the first click arms it.
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const handleDeleteAllData = async () => {
    if (!confirmDeleteAll) {
      setConfirmDeleteAll(true);
      return;
    }
    setConfirmDeleteAll(false);
    setBusy(true);
    setNotice(null);
    try {
      await deleteAllMyData();
      setEmail(null);
      setUid(null);
      setDisplayName(null);
      onTripIdChange(null);
      setIsOpen(false);
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.deleteMyDataFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async () => {
    if (!uid) return;
    setBusy(true);
    setNotice(null);
    setShareUrl(null);
    try {
      const namedTrip = { ...tripData, title: saveName.trim() || tripData.title };
      const savedId = await saveTrip(namedTrip, {
        appDesign,
        tripId: tripId ?? undefined,
        stage: saveStage,
      });
      onTripIdChange(savedId);
      onUpdateTrip({ title: namedTrip.title });
      // "Final app" means the actual finished/shared app, not a look-alike —
      // so publish it for real, the same as the Share button does, instead of
      // just labeling it "final" without anything backing that up.
      if (saveStage === "final") {
        const link = await shareTrip(savedId, namedTrip, appDesign, shareDays || undefined);
        setShareUrl(link);
      }
      setNotice(t("cloud.saved"));
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.saveFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleCreateEditLink = async () => {
    if (!uid || !tripId) {
      setNotice(t("cloud.shareBeforeSave"));
      return;
    }
    setBusy(true);
    setNotice(null);
    try {
      setEditUrl(await createEditLink(tripId));
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.editLinkFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleDisableEditLink = async () => {
    if (!tripId) return;
    setBusy(true);
    setNotice(null);
    try {
      await disableEditLink(tripId);
      setEditUrl(null);
      setNotice(t("cloud.editLinkDisabled"));
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.editLinkFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleShare = async () => {
    if (!uid || !tripId) {
      setNotice(t("cloud.shareBeforeSave"));
      return;
    }
    setBusy(true);
    setNotice(null);
    setShareUrl(null);
    try {
      const link = await shareTrip(tripId, tripData, appDesign, shareDays || undefined);
      setShareUrl(link);
      // The share itself succeeded regardless of whether the clipboard write
      // does — LinkDisplay renders the link below either way, so a clipboard
      // failure just needs its own honest notice instead of claiming success.
      try {
        await navigator.clipboard.writeText(link);
        setNotice(t("cloud.shareCopied"));
      } catch (clipboardErr) {
        console.error(clipboardErr);
        setNotice(t("cloud.shareCopyFailed"));
      }
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.shareFailed"));
    } finally {
      setBusy(false);
    }
  };

  if (!email) {
    return (
      <div className="relative">
        <button
          onClick={handleSignIn}
          disabled={busy}
          aria-label={busy ? t("cloud.signingIn") : t("cloud.signIn")}
          title={busy ? t("cloud.signingIn") : t("cloud.signIn")}
          className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
        >
          <CloudOff size={18} />
          {busy ? t("cloud.signingIn") : t("cloud.signIn")}
        </button>
        {/* A failed sign-in (blocked popup, cancelled OAuth, misconfigured
            Firebase, ...) used to have nowhere to render — this branch was
            just the button, with `notice` only ever shown inside the
            signed-in dropdown below. `fixed` (not `absolute`) on mobile,
            same as every other floating panel in this file: the navbar
            wraps there, so this button can land anywhere in the wrapped
            row — anchoring to it directly let the panel run straight off
            the edge of the viewport instead of staying fully on-screen. */}
        {notice && (
          <div
            className="fixed inset-x-4 top-4 w-auto
              sm:absolute sm:inset-x-auto sm:top-full sm:end-0 sm:mt-1 sm:w-64
              sm:max-w-[calc(100vw-2rem)] bg-white border border-outline/20 rounded-xl
              shadow-lg p-3 z-40 text-start"
          >
            <div className="flex items-start gap-2">
              <p className="flex-1 text-xs text-amber-700">{notice}</p>
              <button
                onClick={() => setNotice(null)}
                aria-label={t("apiKey.close")}
                className="shrink-0 text-ink-muted hover:text-ink"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="relative min-w-0" ref={menuRef}>
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        title={displayName ?? email}
        className="flex items-center gap-1.5 max-w-[10rem] sm:max-w-none min-w-0 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
      >
        <Cloud size={18} className="shrink-0" />
        <span className="truncate">{displayName?.split(" ")[0] || email}</span>
      </button>

      {isOpen && (
        <div
          role="menu"
          className="fixed inset-x-4 top-4 max-h-[calc(100vh-2rem)] w-auto overflow-y-auto
              sm:absolute sm:inset-x-auto sm:top-auto sm:end-0 sm:mt-2 sm:max-h-[70vh] sm:w-96
              sm:max-w-[calc(100vw-2rem)] sm:overflow-y-auto bg-white rounded-xl shadow-lg
              border border-outline/20 p-4 z-40 text-start"
        >
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-xs font-semibold text-ink-muted truncate">
              {displayName ?? email}
            </span>
            <button
              type="button"
              onClick={closeMenu}
              aria-label={t("apiKey.close")}
              className="shrink-0 text-ink-muted hover:text-ink"
            >
              <X size={16} />
            </button>
          </div>

          {notice && <p className="text-xs text-amber-700 mb-2">{notice}</p>}
          {shareUrl && (
            <div className="mb-3">
              <LinkDisplay
                url={shareUrl}
                shareTitle={tripData.title}
                shareText={shareMessage(tripData, shareUrl)}
              />
            </div>
          )}

          {tripId && (
            <div className="mb-3 border border-outline/20 rounded-lg p-2">
              <p className="text-xs font-semibold text-ink-muted mb-1">{t("cloud.editLink")}</p>
              {editUrl ? (
                <>
                  <p className="text-xs text-amber-700 mb-1">{t("cloud.editLinkWarning")}</p>
                  <LinkDisplay
                    url={editUrl}
                    shareTitle={tripData.title}
                    shareText={shareMessage(tripData, editUrl)}
                  />
                  <button
                    onClick={handleDisableEditLink}
                    disabled={busy}
                    className="mt-1 text-xs text-red-700 hover:text-red-800"
                  >
                    {t("cloud.disableEditLink")}
                  </button>
                </>
              ) : (
                <button
                  onClick={handleCreateEditLink}
                  disabled={busy}
                  className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-primary"
                >
                  <PencilLine size={14} />
                  {t("cloud.createEditLink")}
                </button>
              )}
            </div>
          )}

          <input
            type="text"
            value={saveName}
            onChange={(e) => handleChangeSaveName(e.target.value)}
            placeholder={t("step4.tripNamePlaceholder")}
            aria-label={t("step4.tripNameLabel")}
            className="w-full border border-outline/40 rounded-md px-2.5 py-1.5 text-sm mb-2"
          />
          <div className="flex gap-2 mb-2">
            <button
              onClick={handleSave}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 bg-primary hover:bg-primary-dark text-white text-sm px-3 py-2 rounded-lg"
            >
              <Save size={14} />
              {t("common.save")}
            </button>
            <button
              onClick={handleShare}
              disabled={busy}
              className="flex-1 flex items-center justify-center gap-1.5 bg-surface-container hover:bg-surface-container-high text-ink-muted text-sm px-3 py-2 rounded-lg"
            >
              <Share2 size={14} />
              {t("cloud.share")}
            </button>
          </div>
          <label className="block text-xs text-ink-muted mb-2">
            {t("cloud.saveAsLabel")}{" "}
            <select
              value={saveStage}
              onChange={(e) => setSaveStage(e.target.value as TripStage)}
              className="border border-outline/40 rounded-md px-1.5 py-0.5 text-xs"
            >
              {SAVE_STAGES.map((opt) => (
                <option key={opt.stage} value={opt.stage}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-xs text-ink-muted mb-4">
            {t("cloud.shareValidity")}{" "}
            <select
              value={shareDays}
              onChange={(e) => setShareDays(Number(e.target.value))}
              className="border border-outline/40 rounded-md px-1.5 py-0.5 text-xs"
            >
              {SHARE_DURATIONS.map((opt) => (
                <option key={opt.days} value={opt.days}>
                  {t(opt.labelKey)}
                </option>
              ))}
            </select>
          </label>

          <div className="flex items-center justify-between gap-2">
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"
            >
              <LogOut size={14} />
              {t("cloud.signOut")}
            </button>
            <button
              onClick={handleDeleteAllData}
              disabled={busy}
              className="flex items-center gap-1.5 text-xs text-red-700 hover:text-red-800"
            >
              <Trash2 size={14} />
              {confirmDeleteAll ? t("cloud.deleteMyDataConfirm") : t("cloud.deleteMyData")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
