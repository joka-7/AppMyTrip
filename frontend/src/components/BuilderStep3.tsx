import { ChevronRight } from "lucide-react";
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
  isGeneratingMedia,
}: {
  agentMessages: AgentMessage[];
  chatEndRef: RefObject<HTMLDivElement>;
  chatInput: string;
  onChangeChatInput: (text: string) => void;
  onSendMessage: (e: React.FormEvent) => void;
  onContinue: () => void;
  isGeneratingMedia: boolean;
}) {
  return (
    <div className="animate-fade-in flex flex-col h-full">
      <h2 className="text-2xl font-bold mb-2">סוכן השלמות AI</h2>
      <p className="text-gray-600 mb-6">
        הבינה המלאכותית שלנו עוברת על הלו"ז ומוודאת שלא שכחתם כלום.
      </p>

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

      <button
        onClick={onContinue}
        disabled={isGeneratingMedia}
        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white px-8 py-3 rounded-xl font-medium flex items-center gap-2 w-full justify-center transition-colors shadow-md mt-auto"
      >
        {isGeneratingMedia ? "מייצר מדיה (פודקאסטים)..." : "המשך לעיצוב האפליקציה"}
        {!isGeneratingMedia && <ChevronRight size={20} />}
      </button>
    </div>
  );
}
