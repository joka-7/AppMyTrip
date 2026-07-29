import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import {
  Download,
  Home,
  Printer,
  Save,
  Settings,
  Share2,
  Upload,
  UserCog,
  UserPlus,
  Calendar,
} from "lucide-react";
import type { Activity, TripData } from "../api";
import { useDismissable } from "../hooks/useDismissable";
import { useI18n } from "../i18n/useI18n";
import type { AppDesign } from "../services/appDesign";
import { exportTripToIcs } from "../services/icsExport";
import { exportTripToFile, importTripFromFile } from "../services/tripFile";
import { getCurrentSession, saveTrip, shareTrip, signInWithGoogle } from "../services/tripsStore";
import { useTripBranding } from "../hooks/useTripBranding";
import ApiKeyMenu from "./ApiKeyMenu";
import AppFrame from "./AppFrame";
import InstallAppButton from "./InstallAppButton";
import LinkDisplay from "./LinkDisplay";
import type { AgentMessage } from "./ChatPanel";

/**
 * What a `?shared=<tripId>` link opens: just the generated app, full-screen,
 * with none of the builder chrome (no AI chat panel, no steps) — meant to
 * look like the real mobile/web app trip participants would use. For most
 * visitors, edits made here (chat or manual) are local-only and never
 * written back to the owner's saved trip — the export/import/save-as-new-copy
 * toolbar exists so a recipient can still keep changes they like. Admins
 * (the owner, or anyone the owner added via onAddAdmin) additionally get a
 * "save changes" button that writes straight back to this same link, and an
 * "add admin" form to grant that same ability to someone else by email.
 */
export default function SharedAppPage({
  tripData,
  appDesign,
  tripId,
  agentMessages,
  chatInput,
  onChangeChatInput,
  onSendMessage,
  chatEndRef,
  isSendingMessage,
  chatNotice,
  onRetryChat,
  onUpdateActivity,
  onAddActivity,
  onDeleteActivity,
  onUpdateTrip,
  onAddDay,
  onDeleteDay,
  onMoveDay,
  onImportTrip,
  isAdmin,
  onSaveChanges,
  onAddAdmin,
  onCreateNewLink,
}: {
  tripData: TripData;
  appDesign: AppDesign;
  tripId: string;
  agentMessages: AgentMessage[];
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  chatEndRef: RefObject<HTMLDivElement>;
  isSendingMessage?: boolean;
  chatNotice?: string | null;
  onRetryChat?: () => void;
  onUpdateActivity: (dayIndex: number, activityId: string, patch: Partial<Activity>) => void;
  onAddActivity: (dayIndex: number, activity: Activity) => void;
  onDeleteActivity?: (dayIndex: number, activityId: string) => void;
  onUpdateTrip: (patch: Partial<Pick<TripData, "title" | "dates" | "photo_album_url">>) => void;
  onAddDay?: () => void;
  onDeleteDay?: (dayIndex: number) => void;
  onMoveDay?: (fromIndex: number, toIndex: number) => void;
  onImportTrip: (tripData: TripData, appDesign: AppDesign) => void;
  /** Whether the signed-in visitor may save changes back to this link and add other admins. */
  isAdmin: boolean;
  onSaveChanges: () => Promise<void>;
  onAddAdmin: (email: string) => Promise<void>;
  onCreateNewLink: () => Promise<string>;
}) {
  const { t, dir } = useI18n();
  useTripBranding(appDesign, tripData.title);
  const [menuOpen, setMenuOpen] = useState(false);
  const closeMenu = useCallback(() => setMenuOpen(false), []);
  const menuRef = useDismissable(menuOpen, closeMenu);
  const [saveStatus, setSaveStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveChangesStatus, setSaveChangesStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [newLinkStatus, setNewLinkStatus] = useState<
    "idle" | "working" | "done" | "copy-failed" | "error"
  >("idle");
  const [addAdminStatus, setAddAdminStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [saveName, setSaveName] = useState(tripData.title);
  const [saveUrl, setSaveUrl] = useState<string | null>(null);
  const [newLinkUrl, setNewLinkUrl] = useState<string | null>(null);
  // Tracks the copy created by "Save to my account" so a second click updates
  // that same copy instead of creating a new one every time.
  const [savedCopyId, setSavedCopyId] = useState<string | null>(null);
  // "?shared=" is read once at module load (see App.tsx's SHARED_TRIP_ID), so
  // there's no in-app route back to the builder/"My trips" — leaving this
  // view means an actual navigation, dropping the query string.
  const homeHref = window.location.pathname;

  const handleSaveToAccount = async () => {
    setSaveStatus("working");
    setSaveUrl(null);
    try {
      const session = getCurrentSession() ?? (await signInWithGoogle());
      const namedTrip = { ...tripData, title: saveName.trim() || tripData.title };
      // "Final app" must actually be the finished/shared app, not just a
      // label — publish it for real (same as the builder's Share button),
      // otherwise opening it later 404s exactly like a broken share link.
      const savedId = await saveTrip(session.uid, namedTrip, {
        appDesign,
        tripId: savedCopyId ?? undefined,
        stage: "final",
      });
      setSavedCopyId(savedId);
      const url = await shareTrip(session.uid, savedId, namedTrip, appDesign);
      setSaveUrl(url);
      setSaveStatus("done");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
    }
  };

  const handleSaveChanges = async () => {
    setSaveChangesStatus("working");
    try {
      await onSaveChanges();
      setSaveChangesStatus("done");
    } catch (err) {
      console.error(err);
      setSaveChangesStatus("error");
    }
  };

  const handleCreateNewLink = async () => {
    setNewLinkStatus("working");
    setNewLinkUrl(null);
    try {
      const link = await onCreateNewLink();
      setNewLinkUrl(link);
      // The new link was created regardless of whether the clipboard write
      // does — LinkDisplay renders it below either way, so a clipboard
      // failure just needs its own honest status instead of claiming success.
      try {
        await navigator.clipboard.writeText(link);
        setNewLinkStatus("done");
      } catch (clipboardErr) {
        console.error(clipboardErr);
        setNewLinkStatus("copy-failed");
      }
    } catch (err) {
      console.error(err);
      setNewLinkStatus("error");
    }
  };

  const handleAddAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminEmailInput.trim()) return;
    setAddAdminStatus("working");
    try {
      await onAddAdmin(adminEmailInput);
      setAdminEmailInput("");
      setAddAdminStatus("done");
    } catch (err) {
      console.error(err);
      setAddAdminStatus("error");
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImportError(null);
    try {
      const { tripData: imported, appDesign: importedAppDesign } = await importTripFromFile(file);
      onImportTrip(imported, importedAppDesign);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : t("cloud.importFailed"));
    }
  };

  return (
    <div
      className="h-dvh overflow-hidden bg-surface-container flex justify-center print:h-auto print:overflow-visible print:bg-white"
      dir={dir}
    >
      {/* max-w-md only kicks in from the "sm" breakpoint up — on an actual
          phone (which is what this view is really for) it should fill the
          whole screen; the phone-frame look is purely a desktop preview. */}
      <div className="w-full sm:max-w-md h-dvh bg-surface shadow-2xl flex flex-col overflow-hidden print:max-w-none print:h-auto print:shadow-none print:overflow-visible">
        <div className="no-print shrink-0 flex items-center justify-end gap-2 p-2 bg-white border-b border-outline/20">
          <a
            href={homeHref}
            aria-label={t("sharedPage.myTripsAria")}
            className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg text-xs"
          >
            <Home size={14} />
            {t("cloud.myTrips")}
          </a>
          <ApiKeyMenu />
          <InstallAppButton />
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={t("sharedPage.settingsAria")}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg text-xs"
            >
              <Settings size={14} />
              {t("sharedPage.settings")}
            </button>

            {menuOpen && (
              <div
                role="menu"
                className="absolute end-0 mt-2 w-80 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto bg-white rounded-xl shadow-lg border border-outline/20 p-3 z-40 text-start text-xs flex flex-col gap-1.5"
              >
                <button
                  onClick={() => exportTripToFile(tripData, appDesign)}
                  className="flex items-center gap-1.5 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg"
                >
                  <Download size={14} />
                  {t("sharedPage.export")}
                </button>
                <button
                  onClick={() => exportTripToIcs(tripData)}
                  className="flex items-center gap-1.5 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg"
                >
                  <Calendar size={14} />
                  {t("sharedPage.exportIcs")}
                </button>
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg"
                >
                  <Printer size={14} />
                  {t("sharedPage.print")}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg"
                >
                  <Upload size={14} />
                  {t("sharedPage.import")}
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="application/json"
                  onChange={handleImportFile}
                  className="hidden"
                />
                {importError && <p className="text-red-700 px-1">{importError}</p>}

                <input
                  type="text"
                  value={saveName}
                  onChange={(e) => setSaveName(e.target.value)}
                  placeholder={t("step4.tripNamePlaceholder")}
                  aria-label={t("step4.tripNameLabel")}
                  className="border border-outline/40 rounded-md px-2 py-1.5 bg-surface"
                />
                <button
                  onClick={handleSaveToAccount}
                  disabled={saveStatus === "working"}
                  className="flex items-center gap-1.5 text-primary hover:text-primary-dark bg-primary/10 hover:bg-primary/20 disabled:opacity-60 px-2.5 py-1.5 rounded-lg"
                >
                  <UserPlus size={14} />
                  {saveStatus === "working"
                    ? t("sharedPage.saving")
                    : t("sharedPage.saveToAccount")}
                </button>
                {saveStatus === "done" && saveUrl && (
                  <div className="flex flex-col gap-1">
                    <p className="text-green-700 px-1">
                      {t("sharedPage.savedNotice")}{" "}
                      <a href={homeHref} className="underline hover:text-green-800">
                        {t("cloud.myTrips")}
                      </a>
                    </p>
                    <LinkDisplay url={saveUrl} />
                  </div>
                )}
                {saveStatus === "error" && (
                  <p className="text-red-700 px-1">{t("sharedPage.saveFailed")}</p>
                )}

                <button
                  onClick={handleCreateNewLink}
                  disabled={newLinkStatus === "working"}
                  className="flex items-center gap-1.5 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high disabled:opacity-60 px-2.5 py-1.5 rounded-lg"
                >
                  <Share2 size={14} />
                  {newLinkStatus === "working"
                    ? t("sharedPage.saving")
                    : t("sharedPage.shareNewLink")}
                </button>
                {(newLinkStatus === "done" || newLinkStatus === "copy-failed") && newLinkUrl && (
                  <div className="flex flex-col gap-1">
                    <p
                      className={
                        newLinkStatus === "done" ? "text-green-700 px-1" : "text-amber-700 px-1"
                      }
                    >
                      {newLinkStatus === "done"
                        ? t("sharedPage.newLinkCopied")
                        : t("sharedPage.newLinkCopyFailed")}
                    </p>
                    <LinkDisplay url={newLinkUrl} />
                  </div>
                )}
                {newLinkStatus === "error" && (
                  <p className="text-red-700 px-1">{t("sharedPage.newLinkFailed")}</p>
                )}

                {isAdmin && (
                  <div className="border-t border-outline/20 mt-1 pt-1.5 flex flex-col gap-1.5">
                    <button
                      onClick={handleSaveChanges}
                      disabled={saveChangesStatus === "working"}
                      className="flex items-center gap-1.5 text-white bg-primary hover:bg-primary-dark disabled:opacity-60 px-2.5 py-1.5 rounded-lg"
                    >
                      <Save size={14} />
                      {saveChangesStatus === "working"
                        ? t("sharedPage.saving")
                        : t("sharedPage.saveChanges")}
                    </button>
                    {saveChangesStatus === "done" && (
                      <p className="text-green-700 px-1">{t("sharedPage.saveChangesDone")}</p>
                    )}
                    {saveChangesStatus === "error" && (
                      <p className="text-red-700 px-1">{t("sharedPage.saveChangesFailed")}</p>
                    )}

                    <form onSubmit={handleAddAdmin} className="flex items-center gap-1.5">
                      <UserCog size={14} className="text-ink-muted shrink-0" />
                      <input
                        type="email"
                        value={adminEmailInput}
                        onChange={(e) => setAdminEmailInput(e.target.value)}
                        placeholder={t("sharedPage.addAdminPlaceholder")}
                        className="flex-1 min-w-0 border border-outline/40 rounded-md px-2 py-1 bg-surface"
                      />
                      <button
                        type="submit"
                        disabled={addAdminStatus === "working"}
                        className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high disabled:opacity-60 px-2.5 py-1.5 rounded-lg shrink-0"
                      >
                        {addAdminStatus === "working"
                          ? t("sharedPage.saving")
                          : t("sharedPage.addAdmin")}
                      </button>
                    </form>
                    {addAdminStatus === "done" && (
                      <p className="text-green-700 px-1">{t("sharedPage.addAdminDone")}</p>
                    )}
                    {addAdminStatus === "error" && (
                      <p className="text-red-700 px-1">{t("sharedPage.addAdminFailed")}</p>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        <div className="flex-1 min-h-0">
          <AppFrame
            tripData={tripData}
            appDesign={appDesign}
            agentMessages={agentMessages}
            chatInput={chatInput}
            onChangeChatInput={onChangeChatInput}
            onSendMessage={onSendMessage}
            chatEndRef={chatEndRef}
            isSendingMessage={isSendingMessage}
            chatNotice={chatNotice}
            onRetryChat={onRetryChat}
            onUpdateActivity={onUpdateActivity}
            onAddActivity={onAddActivity}
            onDeleteActivity={onDeleteActivity}
            onUpdateTrip={onUpdateTrip}
            onAddDay={onAddDay}
            onDeleteDay={onDeleteDay}
            onMoveDay={onMoveDay}
            isLocalOnly
            localOnlyNoticeText={t(isAdmin ? "sharedPage.adminHint" : "sharedPage.localOnlyNotice")}
            welcomeStorageKey={tripId}
          />
        </div>
      </div>
    </div>
  );
}
