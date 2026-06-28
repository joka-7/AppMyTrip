import type { RefObject } from "react";
import type { Activity, TripData } from "../api";
import AppFrame from "./AppFrame";
import type { AgentMessage } from "./ChatPanel";
import type { Theme } from "./ThemeSelector";

export default function PhonePreview({
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
}) {
  return (
    <div className="w-[350px] h-[700px] border-[12px] border-gray-900 rounded-[2.5rem] overflow-hidden flex flex-col bg-gray-50 shadow-2xl relative mx-auto">
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
      />
    </div>
  );
}
