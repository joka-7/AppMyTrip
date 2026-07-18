import { useRef, useState } from "react";
import type { RefObject } from "react";
import { Download, Save, Share2, Upload, UserCog, UserPlus } from "lucide-react";
import type { Activity, TripData } from "../api";
import { useI18n } from "../i18n/useI18n";
import type { AppDesign } from "../services/appDesign";
import { exportTripToFile, importTripFromFile } from "../services/tripFile";
import { getCurrentSession, saveTrip, signInWithGoogle } from "../services/tripsStore";
import { useTripBranding } from "../hooks/useTripBranding";
import ApiKeyMenu from "./ApiKeyMenu";
import AppFrame from "./AppFrame";
import InstallAppButton from "./InstallAppButton";
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
  onUpdateActivity,
  onAddActivity,
  onDeleteActivity,
  onUpdateTrip,
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
  onUpdateActivity: (dayIndex: number, activityId: string, patch: Partial<Activity>) => void;
  onAddActivity: (dayIndex: number, activity: Activity) => void;
  onDeleteActivity?: (dayIndex: number, activityId: string) => void;
  onUpdateTrip: (patch: Partial<Pick<TripData, "title" | "dates" | "photo_album_url">>) => void;
  onImportTrip: (tripData: TripData, appDesign: AppDesign) => void;
  /** Whether the signed-in visitor may save changes back to this link and add other admins. */
  isAdmin: boolean;
  onSaveChanges: () => Promise<void>;
  onAddAdmin: (email: string) => Promise<void>;
  onCreateNewLink: () => Promise<string>;
}) {
  const { t, dir } = useI18n();
  useTripBranding(appDesign, tripData.title);
  const [saveStatus, setSaveStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saveChangesStatus, setSaveChangesStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [newLinkStatus, setNewLinkStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [addAdminStatus, setAddAdminStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [adminEmailInput, setAdminEmailInput] = useState("");

  const handleSaveToAccount = async () => {
    setSaveStatus("working");
    try {
      const session = getCurrentSession() ?? (await signInWithGoogle());
      await saveTrip(session.uid, tripData, { appDesign });
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
    try {
      const link = await onCreateNewLink();
      await navigator.clipboard.writeText(link).catch(() => {});
      setNewLinkStatus("done");
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
    <div className="h-dvh overflow-hidden bg-surface-container flex justify-center" dir={dir}>
      <div className="w-full max-w-md h-dvh bg-surface shadow-2xl flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-2 bg-white border-b border-outline/20 text-xs">
          <button
            onClick={() => exportTripToFile(tripData, appDesign)}
            className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg"
          >
            <Download size={14} />
            {t("sharedPage.export")}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg"
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
          <button
            onClick={handleSaveToAccount}
            disabled={saveStatus === "working"}
            className="flex items-center gap-1 text-primary hover:text-primary-dark bg-primary/10 hover:bg-primary/20 disabled:opacity-60 px-2.5 py-1.5 rounded-lg"
          >
            <UserPlus size={14} />
            {saveStatus === "working" ? t("sharedPage.saving") : t("sharedPage.saveToAccount")}
          </button>
          <button
            onClick={handleCreateNewLink}
            disabled={newLinkStatus === "working"}
            className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high disabled:opacity-60 px-2.5 py-1.5 rounded-lg"
          >
            <Share2 size={14} />
            {newLinkStatus === "working" ? t("sharedPage.saving") : t("sharedPage.shareNewLink")}
          </button>
          {isAdmin && (
            <button
              onClick={handleSaveChanges}
              disabled={saveChangesStatus === "working"}
              className="flex items-center gap-1 text-white bg-primary hover:bg-primary-dark disabled:opacity-60 px-2.5 py-1.5 rounded-lg"
            >
              <Save size={14} />
              {saveChangesStatus === "working"
                ? t("sharedPage.saving")
                : t("sharedPage.saveChanges")}
            </button>
          )}
          <ApiKeyMenu />
          <InstallAppButton />
        </div>
        {isAdmin && (
          <form
            onSubmit={handleAddAdmin}
            className="flex items-center gap-2 p-2 bg-surface-container-low border-b border-outline/20 text-xs"
          >
            <UserCog size={14} className="text-ink-muted shrink-0" />
            <input
              type="email"
              value={adminEmailInput}
              onChange={(e) => setAdminEmailInput(e.target.value)}
              placeholder={t("sharedPage.addAdminPlaceholder")}
              className="flex-1 min-w-0 border border-outline/40 rounded-md px-2 py-1 text-xs bg-surface"
            />
            <button
              type="submit"
              disabled={addAdminStatus === "working"}
              className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high disabled:opacity-60 px-2.5 py-1.5 rounded-lg shrink-0"
            >
              {addAdminStatus === "working" ? t("sharedPage.saving") : t("sharedPage.addAdmin")}
            </button>
          </form>
        )}
        {saveStatus === "done" && (
          <p className="text-xs text-green-700 text-center py-1 bg-green-50 border-b border-green-200">
            {t("sharedPage.savedNotice")}
          </p>
        )}
        {saveStatus === "error" && (
          <p className="text-xs text-red-700 text-center py-1 bg-red-50 border-b border-red-200">
            {t("sharedPage.saveFailed")}
          </p>
        )}
        {saveChangesStatus === "done" && (
          <p className="text-xs text-green-700 text-center py-1 bg-green-50 border-b border-green-200">
            {t("sharedPage.saveChangesDone")}
          </p>
        )}
        {saveChangesStatus === "error" && (
          <p className="text-xs text-red-700 text-center py-1 bg-red-50 border-b border-red-200">
            {t("sharedPage.saveChangesFailed")}
          </p>
        )}
        {newLinkStatus === "done" && (
          <p className="text-xs text-green-700 text-center py-1 bg-green-50 border-b border-green-200">
            {t("sharedPage.newLinkCopied")}
          </p>
        )}
        {newLinkStatus === "error" && (
          <p className="text-xs text-red-700 text-center py-1 bg-red-50 border-b border-red-200">
            {t("sharedPage.newLinkFailed")}
          </p>
        )}
        {addAdminStatus === "done" && (
          <p className="text-xs text-green-700 text-center py-1 bg-green-50 border-b border-green-200">
            {t("sharedPage.addAdminDone")}
          </p>
        )}
        {addAdminStatus === "error" && (
          <p className="text-xs text-red-700 text-center py-1 bg-red-50 border-b border-red-200">
            {t("sharedPage.addAdminFailed")}
          </p>
        )}
        {importError && (
          <p className="text-xs text-red-700 text-center py-1 bg-red-50 border-b border-red-200">
            {importError}
          </p>
        )}
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
            onUpdateActivity={onUpdateActivity}
            onAddActivity={onAddActivity}
            onDeleteActivity={onDeleteActivity}
            onUpdateTrip={onUpdateTrip}
            isLocalOnly
            localOnlyNoticeText={t(isAdmin ? "sharedPage.adminHint" : "sharedPage.localOnlyNotice")}
            welcomeStorageKey={tripId}
          />
        </div>
      </div>
    </div>
  );
}
