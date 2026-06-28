import { useRef, useState } from "react";
import type { RefObject } from "react";
import { Download, Upload, UserPlus } from "lucide-react";
import type { Activity, TripData } from "../api";
import { exportTripToFile, importTripFromFile } from "../services/tripFile";
import { getCurrentSession, saveTrip, signInWithGoogle } from "../services/tripsStore";
import ApiKeyMenu from "./ApiKeyMenu";
import AppFrame from "./AppFrame";
import InstallAppButton from "./InstallAppButton";
import type { AgentMessage } from "./ChatPanel";
import type { Theme } from "./ThemeSelector";

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
  theme,
  agentMessages,
  chatInput,
  onChangeChatInput,
  onSendMessage,
  chatEndRef,
  isSendingMessage,
  chatNotice,
  onUpdateActivity,
  onAddActivity,
  onUpdateTrip,
  onImportTrip,
}: {
  tripData: TripData;
  theme: Theme;
  agentMessages: AgentMessage[];
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  chatEndRef: RefObject<HTMLDivElement>;
  isSendingMessage?: boolean;
  chatNotice?: string | null;
  onUpdateActivity: (dayIndex: number, activityId: string, patch: Partial<Activity>) => void;
  onAddActivity: (dayIndex: number, activity: Activity) => void;
  onUpdateTrip: (patch: Partial<Pick<TripData, "title" | "dates">>) => void;
  onImportTrip: (tripData: TripData, theme: Theme) => void;
}) {
  const [saveStatus, setSaveStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const [importError, setImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSaveToAccount = async () => {
    setSaveStatus("working");
    try {
      const session = getCurrentSession() ?? (await signInWithGoogle());
      await saveTrip(session.uid, tripData, { theme });
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
      const { tripData: imported, theme: importedTheme } = await importTripFromFile(file);
      onImportTrip(imported, importedTheme);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "ייבוא הקובץ נכשל.");
    }
  };

  return (
    <div className="h-dvh overflow-hidden bg-gray-200 flex justify-center" dir="rtl">
      <div className="w-full max-w-md h-dvh bg-gray-50 shadow-2xl flex flex-col overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 p-2 bg-white border-b border-gray-200 text-xs">
          <button
            onClick={() => exportTripToFile(tripData, theme)}
            className="flex items-center gap-1 text-gray-600 hover:text-blue-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg"
          >
            <Download size={14} />
            ייצוא לקובץ
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1 text-gray-600 hover:text-blue-600 bg-gray-100 hover:bg-gray-200 px-2.5 py-1.5 rounded-lg"
          >
            <Upload size={14} />
            ייבוא מקובץ
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
            className="flex items-center gap-1 text-blue-700 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 disabled:opacity-60 px-2.5 py-1.5 rounded-lg"
          >
            <UserPlus size={14} />
            {saveStatus === "working" ? "שומר..." : "שמירה לחשבון שלי"}
          </button>
          <ApiKeyMenu />
          <InstallAppButton />
        </div>
        {saveStatus === "done" && (
          <p className="text-xs text-green-700 text-center py-1 bg-green-50 border-b border-green-200">
            נשמר לחשבון שלך! אפשר למצוא אותו ב&quot;הטיולים שלי&quot;.
          </p>
        )}
        {saveStatus === "error" && (
          <p className="text-xs text-red-700 text-center py-1 bg-red-50 border-b border-red-200">
            השמירה לחשבון נכשלה. נסו שוב.
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
            theme={theme}
            agentMessages={agentMessages}
            chatInput={chatInput}
            onChangeChatInput={onChangeChatInput}
            onSendMessage={onSendMessage}
            chatEndRef={chatEndRef}
            isSendingMessage={isSendingMessage}
            chatNotice={chatNotice}
            onUpdateActivity={onUpdateActivity}
            onAddActivity={onAddActivity}
            onUpdateTrip={onUpdateTrip}
            isLocalOnly
            localOnlyNoticeText="שינויים שתבצעו כאן (כולל דרך הצ'אט) יישמרו רק בדפדפן הזה ולא יישלחו לשרת."
          />
        </div>
      </div>
    </div>
  );
}
