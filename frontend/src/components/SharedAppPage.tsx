import { useCallback, useRef, useState } from "react";
import type { RefObject } from "react";
import { Home, Save, Share2, UserPlus, X } from "lucide-react";
import type { Activity, TripData } from "../api";
import { useDismissable } from "../hooks/useDismissable";
import { useBackToClose } from "../hooks/useBackToClose";
import { useI18n } from "../i18n/useI18n";
import type { AppDesign } from "../services/appDesign";
import { getCurrentSession, saveTrip, shareTrip, signInWithGoogle } from "../services/tripsStore";
import { useTripBranding } from "../hooks/useTripBranding";
import AppFrame from "./AppFrame";
import type { ChecklistTarget } from "./ChecklistPanel";
import InstallAppButton from "./InstallAppButton";
import LinkDisplay from "./LinkDisplay";
import SettingsMenu from "./SettingsMenu";
import { shareMessage } from "../services/shareLink";
import type { AgentMessage } from "./ChatPanel";

/**
 * What a `?shared=<tripId>` link opens: just the generated app, full-screen,
 * with none of the builder chrome (no AI chat panel, no steps) — meant to
 * look like the real mobile/web app trip participants would use. For most
 * visitors, edits made here (chat or manual) are local-only and never
 * written back to the owner's saved trip — the export/import/save-as-new-copy
 * toolbar exists so a recipient can still keep changes they like. Share
 * links are read-only: the link's content is encrypted with a key only the
 * link carries, and only the owner can re-publish it from their own account.
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
  failedChatText,
  onUpdateActivity,
  onAddActivity,
  onDeleteActivity,
  onUpdateTrip,
  onAddDay,
  onDeleteDay,
  onMoveDay,
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onSuggestChecklist,
  isSuggestingChecklist,
  checklistSuggestError,
  onImportTrip,
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
  failedChatText?: string | null;
  onUpdateActivity: (dayIndex: number, activityId: string, patch: Partial<Activity>) => void;
  onAddActivity: (dayIndex: number, activity: Activity) => void;
  onDeleteActivity?: (dayIndex: number, activityId: string) => void;
  onUpdateTrip: (patch: Partial<Pick<TripData, "title" | "dates" | "photo_album_url">>) => void;
  onAddDay?: () => void;
  onDeleteDay?: (dayIndex: number) => void;
  onMoveDay?: (fromIndex: number, toIndex: number) => void;
  onAddChecklistItem?: (target: ChecklistTarget, text: string) => void;
  onUpdateChecklistItem?: (target: ChecklistTarget, itemId: string, text: string) => void;
  onDeleteChecklistItem?: (target: ChecklistTarget, itemId: string) => void;
  onSuggestChecklist?: () => void;
  isSuggestingChecklist?: boolean;
  checklistSuggestError?: string | null;
  onImportTrip: (tripData: TripData, appDesign: AppDesign) => void;
  onCreateNewLink: () => Promise<string>;
}) {
  const { t, dir } = useI18n();
  useTripBranding(appDesign, tripData.title);
  const [saveShareOpen, setSaveShareOpen] = useState(false);
  const closeSaveShare = useCallback(() => setSaveShareOpen(false), []);
  const saveShareRef = useDismissable(saveShareOpen, closeSaveShare);
  useBackToClose(saveShareOpen, closeSaveShare);
  const [saveStatus, setSaveStatus] = useState<"idle" | "working" | "done" | "error">("idle");
  const pdfTargetRef = useRef<HTMLDivElement>(null);
  const [newLinkStatus, setNewLinkStatus] = useState<
    "idle" | "working" | "done" | "copy-failed" | "error"
  >("idle");
  const [saveName, setSaveName] = useState(tripData.title);
  const [saveUrl, setSaveUrl] = useState<string | null>(null);
  const [newLinkUrl, setNewLinkUrl] = useState<string | null>(null);
  // Tracks the copy created by "Save to my account" so a second click updates
  // that same copy instead of creating a new one every time.
  const [savedCopyId, setSavedCopyId] = useState<string | null>(null);
  // "?shared=" is read once at module load (see App.tsx's SHARED_TRIP_ID), so
  // there's no in-app route back to the builder/"My trips" — leaving this
  // view means an actual navigation, dropping the query string. "myTrips=1"
  // tells the builder to auto-open the saved-trips list instead of landing
  // on its default screen (see MyTripsButton's handling of the same flag).
  const homeHref = `${window.location.pathname}?myTrips=1`;

  const handleSaveToAccount = async () => {
    setSaveStatus("working");
    setSaveUrl(null);
    try {
      await (getCurrentSession() ?? signInWithGoogle());
      const namedTrip = { ...tripData, title: saveName.trim() || tripData.title };
      // "Final app" must actually be the finished/shared app, not just a
      // label — publish it for real (same as the builder's Share button),
      // otherwise opening it later 404s exactly like a broken share link.
      const savedId = await saveTrip(namedTrip, {
        appDesign,
        tripId: savedCopyId ?? undefined,
        stage: "final",
      });
      setSavedCopyId(savedId);
      const url = await shareTrip(savedId, namedTrip, appDesign);
      setSaveUrl(url);
      setSaveStatus("done");
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
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

  return (
    <div
      className="h-dvh overflow-hidden bg-surface-container flex justify-center print:h-auto print:overflow-visible print:bg-white pdf-shared-shell"
      dir={dir}
    >
      {/* max-w-md only kicks in from the "sm" breakpoint up — on an actual
          phone (which is what this view is really for) it should fill the
          whole screen; the phone-frame look is purely a desktop preview. */}
      <div
        ref={pdfTargetRef}
        className="w-full sm:max-w-md h-dvh bg-surface shadow-2xl flex flex-col overflow-hidden print:max-w-none print:h-auto print:shadow-none print:overflow-visible pdf-shared-frame"
      >
        <div className="no-print shrink-0 flex flex-wrap items-center justify-end gap-2 p-2 bg-white border-b border-outline/20">
          <a
            href={homeHref}
            aria-label={t("sharedPage.myTripsAria")}
            className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg text-xs"
          >
            <Home size={14} />
            {t("cloud.myTrips")}
          </a>
          <InstallAppButton />
          <div className="relative" ref={saveShareRef}>
            <button
              onClick={() => setSaveShareOpen((v) => !v)}
              aria-label={t("sharedPage.saveShareAria")}
              aria-expanded={saveShareOpen}
              aria-haspopup="menu"
              className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg text-xs"
            >
              <Save size={14} />
              {t("sharedPage.saveShare")}
            </button>

            {saveShareOpen && (
              <div
                role="menu"
                className="fixed inset-x-4 top-4 max-h-[calc(100vh-2rem)] w-auto overflow-y-auto
                  sm:absolute sm:inset-x-auto sm:top-auto sm:end-0 sm:mt-2 sm:w-80
                  sm:max-w-[calc(100vw-2rem)] sm:max-h-[70vh] sm:overflow-y-auto bg-white rounded-xl shadow-lg
                  border border-outline/20 p-3 z-40 text-start text-xs flex flex-col gap-1.5"
              >
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="font-semibold text-ink">{t("sharedPage.saveShare")}</span>
                  <button
                    type="button"
                    onClick={closeSaveShare}
                    aria-label={t("apiKey.close")}
                    className="shrink-0 text-ink-muted hover:text-ink"
                  >
                    <X size={14} />
                  </button>
                </div>

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
                    <LinkDisplay
                      url={saveUrl}
                      shareTitle={tripData.title}
                      shareText={shareMessage(tripData, saveUrl)}
                    />
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
                    <LinkDisplay
                      url={newLinkUrl}
                      shareTitle={tripData.title}
                      shareText={shareMessage(tripData, newLinkUrl)}
                    />
                  </div>
                )}
                {newLinkStatus === "error" && (
                  <p className="text-red-700 px-1">{t("sharedPage.newLinkFailed")}</p>
                )}
              </div>
            )}
          </div>
          <SettingsMenu
            tripData={tripData}
            appDesign={appDesign}
            printTargetRef={pdfTargetRef}
            onImportTrip={onImportTrip}
          />
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
            failedChatText={failedChatText}
            onUpdateActivity={onUpdateActivity}
            onAddActivity={onAddActivity}
            onDeleteActivity={onDeleteActivity}
            onUpdateTrip={onUpdateTrip}
            onAddDay={onAddDay}
            onDeleteDay={onDeleteDay}
            onMoveDay={onMoveDay}
            onAddChecklistItem={onAddChecklistItem}
            onUpdateChecklistItem={onUpdateChecklistItem}
            onDeleteChecklistItem={onDeleteChecklistItem}
            onSuggestChecklist={onSuggestChecklist}
            isSuggestingChecklist={isSuggestingChecklist}
            checklistSuggestError={checklistSuggestError}
            isLocalOnly
            localOnlyNoticeText={t("sharedPage.localOnlyNotice")}
            welcomeStorageKey={tripId}
          />
        </div>
      </div>
    </div>
  );
}
