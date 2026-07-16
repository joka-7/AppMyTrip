import { useRef, useState } from "react";
import type { RefObject } from "react";
import { Download, Upload, UserPlus } from "lucide-react";
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
 * look like the real mobile/web app trip participants would use. Edits made
 * here (chat or manual) are local-only and are never written back to the
 * owner's saved trip; the export/import/save-as-new-copy toolbar exists so a
 * recipient can still keep changes they like.
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
}) {
  const { t, dir } = useI18n();
  useTripBranding(appDesign, tripData.title);
  const [saveStatus, setSaveStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
          <ApiKeyMenu />
          <InstallAppButton />
        </div>
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
            localOnlyNoticeText={t("sharedPage.localOnlyNotice")}
            welcomeStorageKey={tripId}
          />
        </div>
      </div>
    </div>
  );
}
