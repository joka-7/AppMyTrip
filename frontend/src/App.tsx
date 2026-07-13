import React, { useState, useEffect, useRef } from "react";
import { Wand2 } from "lucide-react";
import { parseTrip, agentInteract, generateMedia, enhanceTrip, ApiError } from "./api";
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
const isRateLimited = (err: unknown): boolean => err instanceof ApiError && err.status === 429;

// Turns a failed API call into a specific, honest Hebrew explanation instead of a
// generic "something went wrong" — but never shows the backend's raw `detail` text
// verbatim, since that's a developer-facing string (sometimes an entire Pydantic
// validation dump) that isn't fit for a chat bubble. Instead, classify by HTTP status
// into a short, clean explanation a non-technical user can actually act on.
const describeApiError = (err: unknown, fallback: string): string => {
  if (isRateLimited(err)) {
    return "ספק ה-AI מגביל קצב בקשות כרגע — נסו שוב בעוד דקה, או הוסיפו מפתח API משלכם בהגדרות כדי להימנע מהגבלה משותפת.";
  }
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return "לא הוגדר מפתח API ל-AI. הוסיפו מפתח משלכם בהגדרות (כפתור 'הגדרת מפתח API').";
      case 413:
        return "הבקשה גדולה מדי עבור ה-AI. נסו לפצל אותה לבקשות קצרות יותר.";
      case 422:
        return "התשובה שהתקבלה מה-AI לא הייתה תקינה. נסו לנסח את הבקשה מחדש או לנסות שוב.";
      // 409: our own truncation guard rejected an otherwise-successful response
      // (it dropped most of the itinerary) — distinct from an actual provider
      // failure, so it gets its own, more specific message.
      case 409:
        return "התשובה מה-AI נראתה כאילו מחקה את רוב הלו\"ז, אז השארנו אותו כפי שהיה. נסו שוב, או פצלו את הבקשה לשלבים קטנים יותר.";
      case 502:
      case 504:
        return "ספק ה-AI לא הצליח להשיב כרגע (תקלה זמנית בשירות). נסו שוב בעוד רגע.";
      default:
        return fallback;
    }
  }
  return fallback;
};

// Fallback used to enrich activities added after Step 2 (via chat or the "+" button)
// when the user skipped Step 2 entirely and so never chose any extras to remember.
const ALL_ENHANCE_OPTIONS: EnhanceOptions = {
  directions_car: true,
  directions_transit: true,
  prices: true,
  podcast: true,
  links: true,
};

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
  if (failed) return <Wand2 className="text-primary" />;
  return (
    <img
      src="/logo.png"
      alt="AppMyTrip"
      className="w-12 h-12 rounded-xl"
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

  // Pressing the device/browser back button has no router to act on by default,
  // so it exits the app outright instead of stepping back within the wizard.
  // Push a history entry per step and consume popstate ourselves so back/forward
  // move between steps in-app; only once the user is back at step 1 does a
  // further back press fall through to actually leaving the page.
  useEffect(() => {
    window.history.replaceState({ appStep: 1 }, "");
    const onPopState = (e: PopStateEvent) => {
      const state = e.state as { appStep?: number } | null;
      setStep(state?.appStep ?? 1);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  const goToStep = (next: number) => {
    setStep(next);
    window.history.pushState({ appStep: next }, "");
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
      goToStep(2);
    } catch (err) {
      console.error(err);
      setApiNotice(
        isRateLimited(err)
          ? "ספק ה-AI מגביל קצב בקשות כרגע — נסו שוב בעוד דקה. בינתיים נטען טיול לדוגמה."
          : "לא הצלחנו להתחבר לשרת ה-AI — נטען טיול לדוגמה.",
      );
      setTripData(DEMO_TRIP);
      setAgentMessages([{ role: "agent", text: DEMO_AGENT_MESSAGE }]);
      goToStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  // Remembered so activities added later via chat can get the same Step 2 extras.
  const [enhanceOptions, setEnhanceOptions] = useState<EnhanceOptions>({});

  const handleEnhance = async (options: EnhanceOptions) => {
    setEnhanceOptions(options);
    setIsEnhancing(true);
    try {
      const res = await enhanceTrip(tripData, options, getApiKey(), getApiProvider());
      setTripData(res.trip_data);
    } catch (err) {
      console.error(err);
      setApiNotice('הוספת הפרטים הנוספים נכשלה — ממשיכים עם הלו"ז הנוכחי.');
    } finally {
      setIsEnhancing(false);
      goToStep(3);
    }
  };

  // Re-runs the remembered Step 2 enhancements (or, if the user skipped Step 2 and so
  // never chose any, every extra) on activities just added, whether by the chat agent
  // or manually via the "+" button in the live preview — manual adds also have no real
  // location yet, which the backend always fills in regardless of which options apply.
  const enhanceNewActivities = async (before: TripData, after: TripData): Promise<TripData> => {
    const priorIds = new Set(before.days.flatMap((d) => d.activities.map((a) => a.id)));
    const newActivities = after.days
      .flatMap((d) => d.activities)
      .filter((a) => !priorIds.has(a.id));
    if (newActivities.length === 0) return after;

    const options = Object.values(enhanceOptions).some(Boolean)
      ? enhanceOptions
      : ALL_ENHANCE_OPTIONS;

    try {
      const res = await enhanceTrip(
        {
          title: after.title,
          dates: after.dates,
          language: after.language,
          days: [{ dayNum: 1, activities: newActivities }],
        },
        options,
        getApiKey(),
        getApiProvider(),
      );
      const enhancedById = new Map(
        res.trip_data.days.flatMap((d) => d.activities).map((a) => [a.id, a]),
      );
      return {
        ...after,
        days: after.days.map((day) => ({
          ...day,
          activities: day.activities.map((a) => enhancedById.get(a.id) ?? a),
        })),
      };
    } catch (err) {
      console.error("Failed to enhance newly added activities:", err);
      return after;
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
      setTripData(await enhanceNewActivities(tripData, res.trip_data));
      setAgentMessages((prev) => [...prev, { role: "agent", text: res.agent_reply }]);
    } catch (err) {
      console.error(err);
      const message = describeApiError(err, 'העדכון נכשל — הלו"ז לא השתנה.');
      setApiNotice(message);
      setAgentMessages((prev) => [...prev, { role: "agent", text: message }]);
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

  const handleAddActivity = async (dayIndex: number, activity: Activity) => {
    const before = tripData;
    const after: TripData = {
      ...tripData,
      days: tripData.days.map((d, idx) =>
        idx !== dayIndex ? d : { ...d, activities: [...d.activities, activity] },
      ),
    };
    setTripData(after);
    setTripData(await enhanceNewActivities(before, after));
  };

  const handleDeleteActivity = (dayIndex: number, activityId: string) => {
    setTripData((prev) => ({
      ...prev,
      days: prev.days.map((d, idx) =>
        idx !== dayIndex
          ? d
          : { ...d, activities: d.activities.filter((a) => a.id !== activityId) },
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
      goToStep(4);
    }
  };

  return (
    <div className="min-h-screen bg-surface font-sans text-right" dir="rtl">
      {/* Top Navbar */}
      <nav className="bg-white shadow-card border-b border-outline/20 px-4 sm:px-6 py-4 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <AppLogo />
          <h1 className="text-lg sm:text-xl font-bold text-ink">תכנון טיול באמצעות AI</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-sm font-medium text-ink-muted bg-surface-container px-3 py-1 rounded-full">
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
              goToStep(3);
            }}
            onImportTrip={(trip, importedTheme) => {
              setTripData(trip);
              setTripId(null);
              setTheme(importedTheme);
              setAgentMessages([{ role: "agent", text: "הטיול יובא מקובץ. אפשר להמשיך לערוך." }]);
              goToStep(3);
            }}
          />
        </div>
      </nav>

      <ApiNotice message={apiNotice} onDismiss={() => setApiNotice(null)} />

      <div className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-8">
        {/* Left Side: Builder Interface */}
        <div className="flex-1 bg-white rounded-2xl shadow-card border border-outline/20 p-8 flex flex-col">
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
                onContinueWithoutReprocessing={() => goToStep(2)}
              />
            )}

            {step === 2 && (
              <BuilderStep2
                onSubmit={handleEnhance}
                onSkip={() => goToStep(3)}
                onBack={() => goToStep(1)}
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
                onBack={() => goToStep(2)}
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
                onBack={() => goToStep(3)}
              />
            )}
          </div>
        </div>

        {/* Right Side: App Live Preview */}
        <div className="flex-1 flex justify-center items-center bg-surface-container rounded-2xl border border-outline/20 py-10 relative overflow-hidden">
          <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-bold text-ink-muted uppercase tracking-wider shadow-sm z-10 flex items-center gap-2 border border-outline/20">
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
            onDeleteActivity={handleDeleteActivity}
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
      setChatNotice(describeApiError(err, 'העדכון נכשל — הלו"ז לא השתנה.'));
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

  const handleDeleteActivity = (dayIndex: number, activityId: string) => {
    setTrip((prev) =>
      prev
        ? {
            ...prev,
            days: prev.days.map((d, idx) =>
              idx !== dayIndex
                ? d
                : { ...d, activities: d.activities.filter((a) => a.id !== activityId) },
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
        className="min-h-screen flex items-center justify-center text-center text-ink-muted p-6"
        dir="rtl"
      >
        {error}
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-muted" dir="rtl">
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
      onDeleteActivity={handleDeleteActivity}
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
