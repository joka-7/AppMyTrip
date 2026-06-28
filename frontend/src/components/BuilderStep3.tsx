import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";
import ChatPanel, { type AgentMessage } from "./ChatPanel";

export type { AgentMessage };

export default function BuilderStep3({
  agentMessages,
  chatEndRef,
  chatInput,
  onChangeChatInput,
  onSendMessage,
  isSendingMessage,
  onContinue,
  onBack,
  isGeneratingMedia,
  tripDates,
  onChangeTripDates,
}: {
  agentMessages: AgentMessage[];
  chatEndRef: RefObject<HTMLDivElement>;
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  isSendingMessage?: boolean;
  onContinue: () => void;
  onBack: () => void;
  isGeneratingMedia: boolean;
  tripDates: string;
  onChangeTripDates: (dates: string) => void;
}) {
  return (
    <div className="animate-fade-in flex flex-col h-full">
      <h2 className="text-2xl font-bold mb-2">סוכן השלמות AI</h2>
      <p className="text-gray-600 mb-4">
        הבינה המלאכותית שלנו עוברת על הלו"ז ומוודאת שלא שכחתם כלום.
      </p>

      <label className="block text-sm font-medium text-gray-600 mb-1">תאריכי הטיול</label>
      <input
        type="text"
        value={tripDates}
        onChange={(e) => onChangeTripDates(e.target.value)}
        placeholder="לדוגמה: 12-19 ביולי"
        className="w-full p-2.5 border border-gray-300 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none mb-4 shadow-sm text-sm"
      />

      <div className="flex-1 mb-4 min-h-[250px]">
        <ChatPanel
          agentMessages={agentMessages}
          chatEndRef={chatEndRef}
          chatInput={chatInput}
          onChangeChatInput={onChangeChatInput}
          onSendMessage={onSendMessage}
          isSending={isSendingMessage}
        />
      </div>

      <div className="flex gap-3 mt-auto">
        <button
          onClick={onBack}
          disabled={isGeneratingMedia}
          className="bg-gray-100 hover:bg-gray-200 disabled:opacity-60 text-gray-700 px-6 py-3 rounded-xl font-medium flex items-center gap-2 transition-colors"
        >
          <ChevronLeft size={20} />
          חזרה
        </button>
        <button
          onClick={onContinue}
          disabled={isGeneratingMedia}
          className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 flex-1 justify-center transition-colors shadow-md"
        >
          {isGeneratingMedia ? "מייצר מדיה (פודקאסטים)..." : "המשך לעיצוב האפליקציה"}
          {!isGeneratingMedia && <ChevronRight size={20} />}
        </button>
      </div>
    </div>
  );
}
