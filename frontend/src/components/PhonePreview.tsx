import type { RefObject } from "react";
import type { Activity, TripData } from "../api";
import type { AppDesign } from "../services/appDesign";
import AppFrame from "./AppFrame";
import type { ChecklistTarget } from "./ChecklistPanel";
import type { AgentMessage } from "./ChatPanel";

export default function PhonePreview({
  tripData,
  appDesign,
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
  onAddChecklistItem,
  onUpdateChecklistItem,
  onDeleteChecklistItem,
  onSuggestChecklist,
  isSuggestingChecklist,
  checklistSuggestError,
}: {
  tripData: TripData;
  appDesign: AppDesign;
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
  onUpdateTrip: (patch: Partial<Pick<TripData, "title" | "dates">>) => void;
  onAddDay?: () => void;
  onDeleteDay?: (dayIndex: number) => void;
  onMoveDay?: (fromIndex: number, toIndex: number) => void;
  onAddChecklistItem?: (target: ChecklistTarget, text: string) => void;
  onUpdateChecklistItem?: (target: ChecklistTarget, itemId: string, text: string) => void;
  onDeleteChecklistItem?: (target: ChecklistTarget, itemId: string) => void;
  onSuggestChecklist?: () => void;
  isSuggestingChecklist?: boolean;
  checklistSuggestError?: string | null;
}) {
  return (
    <div className="w-[350px] h-[700px] border-[12px] border-ink rounded-[2.5rem] overflow-hidden flex flex-col bg-surface shadow-2xl relative mx-auto print:w-full print:h-auto print:border-0 print:rounded-none print:shadow-none print:overflow-visible">
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
        onAddChecklistItem={onAddChecklistItem}
        onUpdateChecklistItem={onUpdateChecklistItem}
        onDeleteChecklistItem={onDeleteChecklistItem}
        onSuggestChecklist={onSuggestChecklist}
        isSuggestingChecklist={isSuggestingChecklist}
        checklistSuggestError={checklistSuggestError}
      />
    </div>
  );
}
