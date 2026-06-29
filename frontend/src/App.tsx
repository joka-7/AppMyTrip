import React, { useState, useEffect, useRef } from "react";
import { Wand2 } from "lucide-react";
import { parseTrip, agentInteract, generateMedia, enhanceTrip } from "./api";
import type { Activity, EnhanceOptions, TripData } from "./api";
import ApiKeyMenu from "./components/ApiKeyMenu";
import ApiNotice from "./components/ApiNotice";
import BuilderStep1 from "./components/BuilderStep1";
import BuilderStep2 from "./components/BuilderStep2";
import BuilderStep3, { type AgentMessage } from "./components/BuilderStep3";
import BuilderStep4 from "./components/BuilderStep4";
import CloudMenu from "./components/CloudMenu";
import InstallAppButton from "./components/InstallAppButton";
import PhonePreview from "./components/PhonePreview";
import ProgressBar from "./components/ProgressBar";
import SharedAppPage from "./components/SharedAppPage";
import type { Theme } from "./components/ThemeSelector";
import { getApiKey, getApiProvider } from "./services/apiKey";
import { loadSharedTrip } from "./services/tripsStore";
import "leaflet/dist/leaflet.css";

// Present only on "?shared=<tripId>" links — those open straight into the
// standalone generated app (no builder chrome), so people the trip is
// shared with see something that looks like the real app, not the editor.
const SHARED_TRIP_ID = new URLSearchParams(window.location.search).get("shared");

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
  "טענתי טיול לדוגמה כדי שתוכלו לראות איך האפליקציה עובדת. כדי לפרסר טקסט אמיתי, הגדירו מפתח Gemini API משלכם (כפתור 'הגדרת מפתח API' למעלה) — או המשיכו לערוך ידנית.";

// Falls back to the wand icon until frontend/public/logo.png is committed.
function AppLogo() {
  const [failed, setFailed] = useState(false);
  if (failed) return <Wand2 className="text-blue-600" />;
  return (
    <img
      src="/logo.png"
      alt="AppMyTrip"
      className="w-8 h-8 rounded-lg"
      onError={() => setFailed(true)}
    />
  );
}

// --- Main App Builder Component ---

function TripBuilder() {
  const [step, setStep] = useState(1);
  const [rawText, setRawText] = useState(
    "היי, אנחנו טסים לרומא מחרתיים עד יום ראשון. ביום הראשון ננחת, ניסע למלון ליד המדרגות הספרדיות ואז נטייל באזור. ביום השני הקולוסיאום והפורום, ומלא קניות. ביום השלישי הוותיקן. צריכים גם למצוא איפה לאכול.",
  );
  const [theme, setTheme] = useState<Theme>("blue");
  const [preferences, setPreferences] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatInput, setChatInput] = useState("");
  // Set when a backend call fails and we fall back to local mock behaviour.
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Starts empty; populated by /api/trip/parse (or DEMO_TRIP on fallback).
  const [tripData, setTripData] = useState<TripData>(EMPTY_TRIP);
  // Id of the trip currently being edited, once saved/loaded — null means
  // "not saved yet", so the next deploy/save creates a new trip rather than
  // overwriting one. Shared between CloudMenu and BuilderStep4 so both stay
  // in sync about which trip is "current".
  const [tripId, setTripId] = useState<string | null>(null);

  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

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
      const res = await parseTrip(rawText, preferences || null, getApiKey(), getApiProvider());
      setTripData(res.trip_data);
      setTripId(null);
      setAgentMessages(
        res.initial_agent_message
          ? [{ role: "agent", text: res.initial_agent_message }]
          : [{ role: "agent", text: 'זיהיתי את הטיול! עברו על הלו"ז ותקנו מה שצריך.' }],
      );
      setStep(2);
    } catch (err) {
      console.error(err);
      setApiNotice(
        isRateLimited(err)
          ? "ספק ה-AI מגביל קצב בקשות כרגע — נסו שוב בעוד דקה. בינתיים נטען טיול לדוגמה."
          : "לא הצלחנו להתחבר לשרת ה-AI — נטען טיול לדוגמה.",
      );
      setTripData(DEMO_TRIP);
      setAgentMessages([{ role: "agent", text: DEMO_AGENT_MESSAGE }]);
      setStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleEnhance = async (options: EnhanceOptions) => {
    setIsEnhancing(true);
    try {
      const res = await enhanceTrip(tripData, options, getApiKey(), getApiProvider());
      setTripData(res.trip_data);
    } catch (err) {
      console.error(err);
      setApiNotice('הוספת הפרטים הנוספים נכשלה — ממשיכים עם הלו"ז הנוכחי.');
    } finally {
      setIsEnhancing(false);
      setStep(3);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userText = chatInput;
    setAgentMessages((prev) => [...prev, { role: "user", text: userText }]);
    setChatInput("");
    setIsSendingMessage(true);

    try {
      const res = await agentInteract(
        tripData,
        userText,
        preferences || null,
        getApiKey(),
        getApiProvider(),
      );
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
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleUpdateActivity = (dayIndex: number, activityId: string, patch: Partial<Activity>) => {
    setTripData((prev) => ({
      ...prev,
      days: prev.days.map((d, idx) =>
        idx !== dayIndex
          ? d
          : {
              ...d,
              activities: d.activities.map((a) => (a.id === activityId ? { ...a, ...patch } : a)),
            },
      ),
    }));
  };

  const handleAddActivity = (dayIndex: number, activity: Activity) => {
    setTripData((prev) => ({
      ...prev,
      days: prev.days.map((d, idx) =>
        idx !== dayIndex ? d : { ...d, activities: [...d.activities, activity] },
      ),
    }));
  };

  const handleUpdateTrip = (
    patch: Partial<Pick<TripData, "title" | "dates" | "photo_album_url">>,
  ) => {
    setTripData((prev) => ({ ...prev, ...patch }));
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
      <nav className="bg-white shadow-sm px-4 sm:px-6 py-4 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <AppLogo />
          <h1 className="text-lg sm:text-xl font-bold text-gray-800">תכנון טיול באמצעות AI</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-sm font-medium text-gray-500 bg-gray-100 px-3 py-1 rounded-full">
            שלב {step} מתוך 4
          </div>
          <InstallAppButton />
          <ApiKeyMenu />
          <CloudMenu
            tripData={tripData}
            theme={theme}
            tripId={tripId}
            onTripIdChange={setTripId}
            onLoadTrip={(trip, loadedTripId, loadedTheme) => {
              setTripData(trip);
              setTripId(loadedTripId);
              setTheme(loadedTheme);
              setAgentMessages([{ role: "agent", text: "הטיול נטען. אפשר להמשיך לערוך." }]);
              setStep(3);
            }}
            onImportTrip={(trip, importedTheme) => {
              setTripData(trip);
              setTripId(null);
              setTheme(importedTheme);
              setAgentMessages([{ role: "agent", text: "הטיול יובא מקובץ. אפשר להמשיך לערוך." }]);
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
                hasExistingTrip={tripData.days.length > 0}
                onContinueWithoutReprocessing={() => setStep(3)}
              />
            )}

            {step === 2 && (
              <BuilderStep2
                onSubmit={handleEnhance}
                onSkip={() => setStep(3)}
                onBack={() => setStep(1)}
                isEnhancing={isEnhancing}
              />
            )}

            {step === 3 && (
              <BuilderStep3
                agentMessages={agentMessages}
                chatEndRef={chatEndRef}
                chatInput={chatInput}
                onChangeChatInput={setChatInput}
                onSendMessage={handleSendMessage}
                isSendingMessage={isSendingMessage}
                onContinue={handleContinueToDesign}
                onBack={() => setStep(2)}
                isGeneratingMedia={isGeneratingMedia}
                tripDates={tripData.dates}
                onChangeTripDates={(dates) => setTripData((prev) => ({ ...prev, dates }))}
                language={tripData.language}
              />
            )}

            {step === 4 && (
              <BuilderStep4
                theme={theme}
                onChangeTheme={setTheme}
                tripData={tripData}
                tripId={tripId}
                onSaved={(savedId, title) => {
                  setTripId(savedId);
                  setTripData((prev) => ({ ...prev, title }));
                }}
                onBack={() => setStep(3)}
              />
            )}
          </div>
        </div>

        {/* Right Side: App Live Preview */}
        <div className="flex-1 flex justify-center items-center bg-gray-200/50 rounded-2xl border border-gray-200 py-10 relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-bold text-gray-600 uppercase tracking-wider shadow-sm z-10 flex items-center gap-2 border border-gray-100">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Live Preview
          </div>
          <PhonePreview
            tripData={tripData}
            theme={theme}
            agentMessages={agentMessages}
            chatInput={chatInput}
            onChangeChatInput={setChatInput}
            onSendMessage={handleSendMessage}
            chatEndRef={chatEndRef}
            isSendingMessage={isSendingMessage}
            onUpdateActivity={handleUpdateActivity}
            onAddActivity={handleAddActivity}
            onUpdateTrip={handleUpdateTrip}
          />
        </div>
      </div>
    </div>
  );
}

// Loads a "?shared=<tripId>" link's trip and renders only the generated
// app — no builder chrome, no AI chat — so it looks like the real
// mobile/web app trip participants would actually use.
function SharedTripViewer({ tripId }: { tripId: string }) {
  const [trip, setTrip] = useState<TripData | null>(null);
  const [theme, setTheme] = useState<Theme>("blue");
  const [error, setError] = useState<string | null>(null);

  // Strictly local-only state: a separate instance from TripBuilder's, never
  // backed by Firestore. handleSendMessage/handleUpdateActivity below only
  // ever call setTrip — nothing here imports saveTrip/shareTrip.
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadSharedTrip(tripId)
      .then((result) => {
        setTrip(result.trip);
        setTheme(result.theme);
        setAgentMessages([
          {
            role: "agent",
            text: 'שלחו הודעה כדי לשנות את הלו"ז — שינויים כאן נשארים רק בדפדפן שלכם.',
          },
        ]);
      })
      .catch((err) => {
        console.error(err);
        setError(
          err instanceof Error && err.message.includes("expired")
            ? "קישור השיתוף הזה פג תוקף."
            : "טעינת הטיול המשותף נכשלה. ייתכן שהקישור שגוי או שהטיול הוסר.",
        );
      });
  }, [tripId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !trip) return;

    const userText = chatInput;
    setAgentMessages((prev) => [...prev, { role: "user", text: userText }]);
    setChatInput("");
    setIsSendingMessage(true);
    setChatNotice(null);

    try {
      const res = await agentInteract(trip, userText, null, getApiKey(), getApiProvider());
      setTrip(res.trip_data);
      setAgentMessages((prev) => [...prev, { role: "agent", text: res.agent_reply }]);
    } catch (err) {
      console.error(err);
      setChatNotice(
        isRateLimited(err)
          ? "ספק ה-AI מגביל קצב בקשות כרגע — נסו שוב בעוד דקה."
          : "צ'אט ה-AI לא זמין כרגע. נסו שוב מאוחר יותר.",
      );
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleUpdateActivity = (dayIndex: number, activityId: string, patch: Partial<Activity>) => {
    setTrip((prev) =>
      prev
        ? {
            ...prev,
            days: prev.days.map((d, idx) =>
              idx !== dayIndex
                ? d
                : {
                    ...d,
                    activities: d.activities.map((a) =>
                      a.id === activityId ? { ...a, ...patch } : a,
                    ),
                  },
            ),
          }
        : prev,
    );
  };

  const handleAddActivity = (dayIndex: number, activity: Activity) => {
    setTrip((prev) =>
      prev
        ? {
            ...prev,
            days: prev.days.map((d, idx) =>
              idx !== dayIndex ? d : { ...d, activities: [...d.activities, activity] },
            ),
          }
        : prev,
    );
  };

  const handleUpdateTrip = (
    patch: Partial<Pick<TripData, "title" | "dates" | "photo_album_url">>,
  ) => {
    setTrip((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-center text-gray-500 p-6"
        dir="rtl"
      >
        {error}
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-gray-400" dir="rtl">
        טוען את הטיול...
      </div>
    );
  }

  return (
    <SharedAppPage
      tripData={trip}
      theme={theme}
      agentMessages={agentMessages}
      chatInput={chatInput}
      onChangeChatInput={setChatInput}
      onSendMessage={handleSendMessage}
      chatEndRef={chatEndRef}
      isSendingMessage={isSendingMessage}
      chatNotice={chatNotice}
      onUpdateActivity={handleUpdateActivity}
      onAddActivity={handleAddActivity}
      onUpdateTrip={handleUpdateTrip}
      onImportTrip={(importedTrip, importedTheme) => {
        setTrip(importedTrip);
        setTheme(importedTheme);
      }}
    />
  );
}

export default function App() {
  return SHARED_TRIP_ID ? <SharedTripViewer tripId={SHARED_TRIP_ID} /> : <TripBuilder />;
}
