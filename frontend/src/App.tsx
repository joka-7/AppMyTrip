import React, { useState, useEffect, useRef } from "react";
import { Wand2 } from "lucide-react";
import { parseTrip, agentInteract, generateMedia } from "./api";
import type { TripData } from "./api";
import ApiNotice from "./components/ApiNotice";
import BuilderStep1 from "./components/BuilderStep1";
import BuilderStep3, { type AgentMessage } from "./components/BuilderStep3";
import BuilderStep4 from "./components/BuilderStep4";
import CloudMenu from "./components/CloudMenu";
import PhonePreview from "./components/PhonePreview";
import ProgressBar from "./components/ProgressBar";
import type { Theme } from "./components/ThemeSelector";
import { loadSharedTrip } from "./services/tripsStore";
import "leaflet/dist/leaflet.css";

// Empty starting point — the preview shows an empty state until a trip is parsed.
const EMPTY_TRIP: TripData = { title: "", dates: "", days: [] };

// The backend surfaces a 429 status when the LLM provider is rate-limiting
// the configured API key — worth telling the user apart from a generic
// "server unreachable" failure, since it's transient and not a config issue.
const isRateLimited = (err: unknown): boolean =>
  err instanceof Error && err.message.includes("(429)");

// Generic sample trip used as an offline demo / fallback when the backend is
// unreachable (e.g. no GEMINI_API_KEY). Intentionally not tied to a specific
// real destination; coordinates are clustered so the auto-fit map looks sensible.
const DEMO_TRIP: TripData = {
  title: "טיול לדוגמה ✨",
  dates: "יום א׳ – יום ג׳",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "d1-1",
          time: "09:00",
          title: "צ׳ק-אין במלון",
          desc: "השארת מזוודות והתארגנות.",
          type: "lodging",
          hasPodcast: false,
          map_coordinates: { lat: 40.416, lng: -3.703 },
        },
        {
          id: "d1-2",
          time: "11:00",
          title: "אתר היסטורי מרכזי",
          desc: "סיור בלב העיר העתיקה.",
          type: "attraction",
          hasPodcast: true,
          map_coordinates: { lat: 40.419, lng: -3.707 },
        },
        {
          id: "d1-3",
          time: "13:30",
          title: "מסעדה מקומית",
          desc: "ארוחת צהריים במרכז העיר.",
          type: "food",
          hasPodcast: false,
          map_coordinates: { lat: 40.414, lng: -3.7 },
        },
      ],
    },
    {
      dayNum: 2,
      activities: [
        {
          id: "d2-1",
          time: "10:00",
          title: "מוזיאון העיר",
          desc: "תערוכת קבע ותערוכה מתחלפת.",
          type: "attraction",
          hasPodcast: true,
          map_coordinates: { lat: 40.412, lng: -3.692 },
        },
        {
          id: "d2-2",
          time: "16:00",
          title: "שוק מקומי",
          desc: "קניות וטעימות רחוב.",
          type: "attraction",
          hasPodcast: false,
          map_coordinates: { lat: 40.421, lng: -3.698 },
        },
      ],
    },
  ],
};

const DEMO_AGENT_MESSAGE =
  "טענתי טיול לדוגמה כדי שתוכלו לראות איך האפליקציה עובדת. כדי לפרסר טקסט אמיתי, הגדירו GEMINI_API_KEY בשרת — או המשיכו לערוך ידנית.";

// --- Main App Builder Component ---

export default function App() {
  const [step, setStep] = useState(1);
  const [rawText, setRawText] = useState(
    "היי, אנחנו טסים לרומא מחרתיים עד יום ראשון. ביום הראשון ננחת, ניסע למלון ליד המדרגות הספרדיות ואז נטייל באזור. ביום השני הקולוסיאום והפורום, ומלא קניות. ביום השלישי הוותיקן. צריכים גם למצוא איפה לאכול, אנחנו שומרים כשרות.",
  );
  const [theme, setTheme] = useState<Theme>("blue");
  const [preferences, setPreferences] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [chatInput, setChatInput] = useState("");
  // Set when a backend call fails and we fall back to local mock behaviour.
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Starts empty; populated by /api/trip/parse (or DEMO_TRIP on fallback).
  const [tripData, setTripData] = useState<TripData>(EMPTY_TRIP);

  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

  // Loads a trip shared via a "?shared=<tripId>" link (no sign-in required).
  useEffect(() => {
    const sharedId = new URLSearchParams(window.location.search).get("shared");
    if (!sharedId) return;
    loadSharedTrip(sharedId)
      .then((trip) => {
        setTripData(trip);
        setAgentMessages([{ role: "agent", text: "טיול משותף נטען. אפשר להמשיך לערוך." }]);
        setStep(3);
      })
      .catch((err) => {
        console.error(err);
        setApiNotice("טעינת הטיול המשותף נכשלה.");
      });
  }, []);

  // Local fallback used when the backend is unreachable, so the prototype
  // remains demoable without a running API / Gemini key.
  const mockAgentReply = (userText: string) => {
    const wantsAdd =
      userText.includes("כן") ||
      userText.includes("תוסיף") ||
      userText.includes("מסעד") ||
      userText.includes("אוכל") ||
      userText.includes("כשר");
    if (wantsAdd) {
      setTripData((prev) => {
        if (prev.days.length === 0) return prev;
        const next = {
          ...prev,
          days: prev.days.map((d) => ({ ...d, activities: [...d.activities] })),
        };
        const target = next.days[1] ?? next.days[0];
        // place the new stop near an existing one so the auto-fit map stays sensible
        const anchor = target.activities.find((a) => a.map_coordinates)?.map_coordinates;
        target.activities.splice(1, 0, {
          id: `food-${Date.now()}`,
          time: "13:30",
          title: "מסעדה מומלצת",
          desc: "נוספה על ידי הסוכן לבקשתך.",
          type: "food",
          hasPodcast: false,
          map_coordinates: anchor ? { lat: anchor.lat + 0.001, lng: anchor.lng + 0.001 } : null,
        });
        return next;
      });
      setAgentMessages((prev) => [
        ...prev,
        { role: "agent", text: 'מצוין! הוספתי מסעדה (בדקו בלו"ז ובמפה). נעבור לשלב העיצוב?' },
      ]);
    } else {
      setAgentMessages((prev) => [
        ...prev,
        { role: "agent", text: "הבנתי. אם הכל מוכן, בואו נתקדם לשלב העיצוב!" },
      ]);
    }
  };

  const handleProcessText = async () => {
    if (!rawText.trim()) return;
    setIsProcessing(true);
    setApiNotice(null);
    try {
      const res = await parseTrip(rawText, preferences || null);
      setTripData(res.trip_data);
      setAgentMessages(
        res.initial_agent_message
          ? [{ role: "agent", text: res.initial_agent_message }]
          : [{ role: "agent", text: 'זיהיתי את הטיול! עברו על הלו"ז ותקנו מה שצריך.' }],
      );
      setStep(3);
    } catch (err) {
      console.error(err);
      setApiNotice(
        isRateLimited(err)
          ? "ספק ה-AI מגביל קצב בקשות כרגע — נסו שוב בעוד דקה. בינתיים נטען טיול לדוגמה."
          : "לא הצלחנו להתחבר לשרת ה-AI — נטען טיול לדוגמה.",
      );
      setTripData(DEMO_TRIP);
      setAgentMessages([{ role: "agent", text: DEMO_AGENT_MESSAGE }]);
      setStep(3);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setAgentMessages((prev) => [...prev, { role: "user", text: userText }]);
    setChatInput("");

    try {
      const res = await agentInteract(tripData, userText, preferences || null);
      setTripData(res.trip_data);
      setAgentMessages((prev) => [...prev, { role: "agent", text: res.agent_reply }]);
    } catch (err) {
      console.error(err);
      setApiNotice(
        isRateLimited(err)
          ? "ספק ה-AI מגביל קצב בקשות כרגע — נסו שוב בעוד דקה. בינתיים מגיב במצב דמו מקומי."
          : "שרת ה-AI לא זמין — מגיב במצב דמו מקומי.",
      );
      mockAgentReply(userText);
    }
  };

  const handleContinueToDesign = async () => {
    setIsGeneratingMedia(true);
    try {
      const res = await generateMedia(tripData);
      setTripData(res.trip_data);
    } catch (err) {
      console.error(err);
      setApiNotice("יצירת המדיה בשרת נכשלה — ממשיכים ללא קבצי אודיו.");
    } finally {
      setIsGeneratingMedia(false);
      setStep(4);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 font-sans text-right" dir="rtl">
      {/* Top Navbar */}
      <nav className="bg-white shadow-sm px-6 py-4 flex justify-between items-center sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <Wand2 className="text-blue-600" />
          <h1 className="text-xl font-bold text-gray-800">TripWeaver AI</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            שלב {step} מתוך 4
          </div>
          <CloudMenu
            tripData={tripData}
            onLoadTrip={(trip) => {
              setTripData(trip);
              setAgentMessages([{ role: "agent", text: "הטיול נטען. אפשר להמשיך לערוך." }]);
              setStep(3);
            }}
          />
        </div>
      </nav>

      <ApiNotice message={apiNotice} onDismiss={() => setApiNotice(null)} />

      <div className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-8">
        {/* Left Side: Builder Interface */}
        <div className="flex-1 bg-white rounded-2xl shadow-sm border border-gray-200 p-8 flex flex-col">
          <ProgressBar step={step} />

          {/* Dynamic Content based on Step */}
          <div className="flex-1">
            {step === 1 && (
              <BuilderStep1
                rawText={rawText}
                onChangeRawText={setRawText}
                preferences={preferences}
                onChangePreferences={setPreferences}
                onSubmit={handleProcessText}
                isProcessing={isProcessing}
              />
            )}

            {step === 3 && (
              <BuilderStep3
                agentMessages={agentMessages}
                chatEndRef={chatEndRef}
                chatInput={chatInput}
                onChangeChatInput={setChatInput}
                onSendMessage={handleSendMessage}
                onContinue={handleContinueToDesign}
                isGeneratingMedia={isGeneratingMedia}
              />
            )}

            {step === 4 && <BuilderStep4 theme={theme} onChangeTheme={setTheme} />}
          </div>
        </div>

        {/* Right Side: App Live Preview */}
        <div className="flex-1 flex justify-center items-center bg-gray-200/50 rounded-2xl border border-gray-200 py-10 relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-bold text-gray-600 uppercase tracking-wider shadow-sm z-10 flex items-center gap-2 border border-gray-100">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Live Preview
          </div>
          <PhonePreview tripData={tripData} theme={theme} />
        </div>
      </div>
    </div>
  );
}
