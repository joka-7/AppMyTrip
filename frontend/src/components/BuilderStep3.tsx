import { ChevronLeft, ChevronRight } from "lucide-react";
import type { RefObject } from "react";

export interface AgentMessage {
  role: string;
  text: string;
}

export default function BuilderStep3({
  agentMessages,
  chatEndRef,
  chatInput,
  onChangeChatInput,
  onSendMessage,
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

      <div className="bg-gray-50 rounded-xl p-4 flex-1 min-h-[250px] overflow-y-auto mb-4 border border-gray-200 flex flex-col gap-4 shadow-inner">
        {agentMessages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} animate-fade-in`}
          >
            <div
              className={`max-w-[80%] p-3 text-sm ${
                msg.role === "user"
                  ? "bg-blue-600 text-white rounded-2xl rounded-tr-sm shadow-md"
                  : "bg-white border border-gray-200 text-gray-800 rounded-2xl rounded-tl-sm shadow-sm"
              }`}
            >
              {msg.text}
            </div>
          </div>
        ))}
        <div ref={chatEndRef} />
      </div>

      <form onSubmit={onSendMessage} className="flex gap-2 mb-4">
        <input
          type="text"
          value={chatInput}
          onChange={(e) => onChangeChatInput(e.target.value)}
          placeholder="ענה לסוכן (למשל: 'כן, תוסיף')"
          className="flex-1 border border-gray-300 rounded-xl p-3 outline-none focus:ring-2 focus:ring-blue-500 shadow-sm"
        />
        <button
          type="submit"
          className="bg-gray-800 hover:bg-gray-900 text-white px-6 rounded-xl font-medium transition-colors shadow-sm"
        >
          שלח
        </button>
      </form>

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
