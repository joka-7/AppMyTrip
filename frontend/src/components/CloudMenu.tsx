import { useCallback, useEffect, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  Cloud,
  Calendar,
  Download,
  FileDown,
  LogIn,
  LogOut,
  Printer,
  Save,
  Share2,
  FolderOpen,
  Upload,
  X,
} from "lucide-react";
import type { TripData } from "../api";
import { useDismissable } from "../hooks/useDismissable";
import { useI18n, type TranslationKey } from "../i18n/useI18n";
import { exportTripToIcs } from "../services/icsExport";
import { exportTripToPdf } from "../services/pdfExport";
import { exportTripToFile, importTripFromFile } from "../services/tripFile";
import LinkDisplay from "./LinkDisplay";
import { shareMessage } from "../services/shareLink";
import {
  type CloudTripSummary,
  type TripStage,
  deleteSharedTrip,
  deleteTrip,
  listTrips,
  loadTrip,
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

const STAGE_LABEL_KEYS: Record<TripStage, TranslationKey> = {
  step1: "cloud.stage.step1",
  step2: "cloud.stage.step2",
  step3: "cloud.stage.step3",
  step4: "cloud.stage.step4",
  final: "cloud.stage.final",
};

function stageForStep(step: number): TripStage {
  return step >= 1 && step <= 4 ? (`step${step}` as TripStage) : "final";
}
import type { AppDesign } from "../services/appDesign";

/** Sign-in + "My Trips" + Save/Share controls backed by Firestore. */
export default function CloudMenu({
  tripData,
  appDesign,
  tripId,
  currentStep,
  printTargetRef,
  onTripIdChange,
  onLoadTrip,
  onImportTrip,
  onUpdateTrip,
}: {
  tripData: TripData;
  appDesign: AppDesign;
  /** Id of the trip currently being edited, shared with the step-4 deploy flow. */
  tripId: string | null;
  /** Current builder step (1-4) — used as the default "save as" stage. */
  currentStep: number;
  /** The live-preview DOM node "Download PDF" captures — same subtree the Print button prints. */
  printTargetRef: RefObject<HTMLDivElement>;
  onTripIdChange: (tripId: string | null) => void;
  onLoadTrip: (trip: TripData, tripId: string, appDesign: AppDesign) => void;
  onImportTrip: (trip: TripData, appDesign: AppDesign) => void;
  /** Applies a renamed title back to the trip being edited, so a name typed
   * into the save box (see BuilderStep4's own name field for the same idea)
   * sticks around instead of only living in the saved Firestore doc. */
  onUpdateTrip: (patch: Partial<Pick<TripData, "title">>) => void;
}) {
  const { t } = useI18n();
  const [email, setEmail] = useState<string | null>(null);
  const [uid, setUid] = useState<string | null>(null);
  const [trips, setTrips] = useState<CloudTripSummary[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const closeMenu = useCallback(() => {
    setIsOpen(false);
    setConfirmDeleteId(null);
  }, []);
  const menuRef = useDismissable(isOpen, closeMenu);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shareDays, setShareDays] = useState(0);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    try {
      const { tripData: imported, appDesign: importedAppDesign } = await importTripFromFile(file);
      onImportTrip(imported, importedAppDesign);
      setNotice(t("cloud.importSuccess"));
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t("cloud.importFailed"));
    }
  };

  const handleExportPdf = async () => {
    if (!printTargetRef.current) {
      throw new Error("printTargetRef is not attached to a rendered element");
    }
    setBusy(true);
    setNotice(null);
    try {
      await exportTripToPdf(printTargetRef.current, tripData.title);
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.exportPdfFailed"));
    } finally {
      setBusy(false);
    }
  };

  const refreshTrips = async (id: string) => {
    setTrips(await listTrips(id));
  };

  useEffect(() => {
    return onAuthChange((user) => {
      if (user) {
        setEmail(user.email);
        setUid(user.uid);
        refreshTrips(user.uid);
      } else {
        setEmail(null);
        setUid(null);
        setTrips([]);
      }
    });
  }, []);

  const handleSignIn = async () => {
    setBusy(true);
    setNotice(null);
    try {
      const session = await signInWithGoogle();
      setEmail(session.email);
      setUid(session.uid);
      await refreshTrips(session.uid);
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.signInFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleSignOut = async () => {
    await signOutOfGoogle();
    setEmail(null);
    setUid(null);
    setTrips([]);
    onTripIdChange(null);
    setIsOpen(false);
  };

  const handleSave = async () => {
    if (!uid) return;
    setBusy(true);
    setNotice(null);
    setShareUrl(null);
    try {
      const namedTrip = { ...tripData, title: saveName.trim() || tripData.title };
      const savedId = await saveTrip(uid, namedTrip, {
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
        const link = await shareTrip(uid, savedId, namedTrip, appDesign, shareDays || undefined);
        setShareUrl(link);
      }
      await refreshTrips(uid);
      setNotice(t("cloud.saved"));
    } catch (err) {
      console.error(err);
      setNotice(t("cloud.saveFailed"));
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
      const link = await shareTrip(uid, tripId, tripData, appDesign, shareDays || undefined);
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

  const handleLoad = async (trip: CloudTripSummary) => {
    if (!uid) return;
    // A trip saved as "Final app" was actually published (see handleSave) —
    // open the real "?shared=" link instead of loading it back into the
    // builder, so "final" really means the finished app, not a look-alike
    // preview you can still navigate away from into planning.
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
      setIsOpen(false);
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

  const fileImportControls = (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="application/json"
        onChange={handleImportFile}
        className="hidden"
      />
      <button
        onClick={() => exportTripToFile(tripData, appDesign)}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
      >
        <Download size={16} />
        {t("cloud.export")}
      </button>
      <button
        onClick={() => exportTripToIcs(tripData)}
        disabled={tripData.days.length === 0}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors"
      >
        <Calendar size={16} />
        {t("cloud.exportIcs")}
      </button>
      <button
        onClick={() => window.print()}
        disabled={tripData.days.length === 0}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors"
      >
        <Printer size={16} />
        {t("cloud.print")}
      </button>
      <button
        onClick={handleExportPdf}
        disabled={tripData.days.length === 0 || busy}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high disabled:opacity-50 px-3 py-1.5 rounded-full transition-colors"
      >
        <FileDown size={16} />
        {t("cloud.exportPdf")}
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
      >
        <Upload size={16} />
        {t("cloud.import")}
      </button>
    </>
  );

  if (!email) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        {fileImportControls}
        <button
          onClick={handleSignIn}
          disabled={busy}
          className="flex items-center gap-2 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
        >
          <LogIn size={16} />
          {busy ? t("cloud.signingIn") : t("cloud.signIn")}
        </button>
      </div>
    );
  }

  return (
    // flex-wrap, same as the signed-out branch above: the parent navbar can only
    // break *between* its children, so without this the four file controls plus
    // the email chip become one unbreakable ~500px row and push the whole
    // document into horizontal scroll on a phone.
    <div className="flex flex-wrap items-center gap-2">
      {fileImportControls}
      <div className="relative min-w-0" ref={menuRef}>
        <button
          onClick={() => setIsOpen((v) => !v)}
          aria-expanded={isOpen}
          aria-haspopup="menu"
          className="flex items-center gap-2 max-w-[12rem] sm:max-w-none min-w-0 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
        >
          <Cloud size={16} className="shrink-0" />
          {/* A long address is one unbreakable token; as a flex item it has
              min-width:auto and would otherwise refuse to shrink. */}
          <span className="truncate">{email}</span>
        </button>

        {isOpen && (
          <div
            role="menu"
            className="fixed inset-x-4 top-4 max-h-[calc(100vh-2rem)] w-auto overflow-y-auto
              sm:absolute sm:inset-x-auto sm:top-auto sm:end-0 sm:mt-2 sm:max-h-none sm:w-96
              sm:max-w-[calc(100vw-2rem)] sm:overflow-visible bg-white rounded-xl shadow-lg
              border border-outline/20 p-4 z-40 text-start"
          >
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

            <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted mb-2">
              <FolderOpen size={14} />
              {t("cloud.myTrips")}
            </div>
            <ul className="max-h-48 overflow-y-auto space-y-1 mb-3">
              {trips.length === 0 && (
                <li className="text-xs text-ink-muted py-2">{t("cloud.noTrips")}</li>
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

            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 text-xs text-ink-muted hover:text-ink"
            >
              <LogOut size={14} />
              {t("cloud.signOut")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
