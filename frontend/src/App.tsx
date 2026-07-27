import React, {
  lazy,
  Suspense,
  useState,
  useEffect,
  useRef,
  type Dispatch,
  type SetStateAction,
} from "react";
import { ChevronLeft, Smartphone, Wand2 } from "lucide-react";
import { parseTrip, agentInteract, generateMedia, enhanceTrip, ApiError } from "./api";
import type { EnhanceOptions, TripData } from "./api";
import ApiKeyMenu from "./components/ApiKeyMenu";
import ApiNotice from "./components/ApiNotice";
import BuilderStep1 from "./components/BuilderStep1";
import type { AgentMessage } from "./components/BuilderStep3";
import CloudMenu from "./components/CloudMenu";
import InstallAppButton from "./components/InstallAppButton";
import ProgressBar from "./components/ProgressBar";
import { useTripEditing } from "./hooks/useTripEditing";
import { DEFAULT_APP_DESIGN, type AppDesign } from "./services/appDesign";
import { getApiKeys, getApiProvider, getAllCredentials } from "./services/apiKey";
import {
  clearDraft,
  isRecoverableDraft,
  loadDraft,
  saveDraft,
  type BuilderDraft,
} from "./services/draftStore";
import { normalizeTripForLoad } from "./services/normalizeTrip";
import {
  ALL_ENHANCE_OPTIONS,
  effectiveEnhanceOptions,
  enhanceActivities,
  findNewActivities,
  mergeEnhancedActivities,
} from "./services/tripEnhance";
import {
  addSharedTripAdmin,
  getCurrentSession,
  loadSharedTrip,
  onAuthChange,
  saveSharedTrip,
  saveTrip,
  shareTrip,
  signInWithGoogle,
  type CloudSession,
} from "./services/tripsStore";
import { translate } from "./i18n/store";
import { useI18n } from "./i18n/useI18n";
import LanguageSwitcher from "./components/LanguageSwitcher";

// Step 1 stays eager (it's the first paint of the builder). Later steps, the
// live phone preview (and thus AppFrame), and the shared-app shell are lazy
// so their code stays out of the main chunk until needed.
const AppFrame = lazy(() => import("./components/AppFrame"));
const BuilderStep2 = lazy(() => import("./components/BuilderStep2"));
const BuilderStep3 = lazy(() => import("./components/BuilderStep3"));
const BuilderStep4 = lazy(() => import("./components/BuilderStep4"));
const PhonePreview = lazy(() => import("./components/PhonePreview"));
const SharedAppPage = lazy(() => import("./components/SharedAppPage"));

function StepFallback() {
  return <div className="min-h-[12rem] animate-pulse rounded-xl bg-surface-container" />;
}

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
// generic "something went wrong" — but doesn't show most backend `detail` text
// verbatim, since that's often a developer-facing string (sometimes an entire
// Pydantic validation dump) that isn't fit for a chat bubble. Instead, classify by
// HTTP status into a short, clean explanation a non-technical user can act on.
//
// 502/504 (the provider/every-key-failed case) is the one exception: its `detail`
// is always our own short, already-user-facing summary (which key/provider failed
// and why — see LLMService._summarize_failures on the backend), not a raw dump, and
// it's exactly the case people otherwise have to dig through server logs to
// diagnose. Appending it here means the actual cause is visible right in the app.
const describeApiError = (err: unknown, fallback: string): string => {
  if (isRateLimited(err)) {
    return translate("apiError.rateLimited");
  }
  if (err instanceof ApiError) {
    switch (err.status) {
      case 401:
        return translate("apiError.noKey");
      case 413:
        return translate("apiError.tooLarge");
      case 422:
        return translate("apiError.invalidResponse");
      // 409: our own truncation guard rejected an otherwise-successful response
      // (it dropped most of the itinerary) — distinct from an actual provider
      // failure, so it gets its own, more specific message.
      case 409:
        return translate("apiError.truncated");
      case 502:
      case 504:
        return appendErrorDetail(translate("apiError.providerDown"), err.detail);
      default:
        return fallback;
    }
  }
  return fallback;
};

/** Appends a short backend error detail to a friendly message so the actual cause
 * is visible in the UI, without needing server log access to find out why. Labeled
 * and wrapped in Unicode bidi-isolate marks (U+2066/U+2069, invisible themselves) so
 * this often-English/URL-containing technical line doesn't get visually reordered/
 * garbled when embedded in a Hebrew (RTL) sentence — without that, mixed-direction
 * text reads as scrambled rather than just "in a different language." */
function appendErrorDetail(message: string, detail: string): string {
  const trimmed = detail.trim();
  if (!trimmed) return message;
  const short = trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed;
  const label = translate("apiError.technicalDetailLabel");
  // U+2066/U+2069 (LRI/PDI) are invisible Unicode "isolate" marks — written
  // as escapes, not literal characters, so they survive editing/diffing
  // intact. They stop the bidi algorithm from reordering this English/URL
  // text when it's embedded in a Hebrew (RTL) sentence.
  const LRI = "⁦";
  const PDI = "⁩";
  return `${message}\n${label} ${LRI}${short}${PDI}`;
}

// Generic sample trip used as an offline demo / fallback when the backend is
// unreachable (e.g. no GEMINI_API_KEY). Intentionally not tied to a specific
// real destination; coordinates are clustered so the auto-fit map looks sensible.
// Built lazily so the activity titles/descriptions render in the current UI
// language.
const buildDemoTrip = (): TripData => ({
  title: translate("demo.title"),
  dates: translate("demo.dates"),
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "d1-1",
          time: "09:00",
          title: translate("demo.d1a1.title"),
          desc: translate("demo.d1a1.desc"),
          type: "lodging",
          hasPodcast: false,
          map_coordinates: { lat: 40.416, lng: -3.703 },
        },
        {
          id: "d1-2",
          time: "11:00",
          title: translate("demo.d1a2.title"),
          desc: translate("demo.d1a2.desc"),
          type: "attraction",
          hasPodcast: true,
          map_coordinates: { lat: 40.419, lng: -3.707 },
        },
        {
          id: "d1-3",
          time: "13:30",
          title: translate("demo.d1a3.title"),
          desc: translate("demo.d1a3.desc"),
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
          title: translate("demo.d2a1.title"),
          desc: translate("demo.d2a1.desc"),
          type: "attraction",
          hasPodcast: true,
          map_coordinates: { lat: 40.412, lng: -3.692 },
        },
        {
          id: "d2-2",
          time: "16:00",
          title: translate("demo.d2a2.title"),
          desc: translate("demo.d2a2.desc"),
          type: "attraction",
          hasPodcast: false,
          map_coordinates: { lat: 40.421, lng: -3.698 },
        },
      ],
    },
  ],
});

// Falls back to the wand icon until frontend/public/logo.png is committed.
function AppLogo() {
  const [failed, setFailed] = useState(false);
  if (failed) return <Wand2 size={44} className="text-primary" />;
  return (
    <img
      src="/logo.png"
      alt="AppMyTrip"
      className="w-14 h-14 sm:w-16 sm:h-16 rounded-xl"
      onError={() => setFailed(true)}
    />
  );
}

// --- Main App Builder Component ---

function TripBuilder() {
  const { t, dir, lang } = useI18n();
  const [step, setStep] = useState(1);
  const [rawText, setRawText] = useState(() => translate("step1.exampleRawText"));
  // The example text is a placeholder, not real user input — if the user
  // hasn't touched it yet, keep it in sync when they switch UI language
  // instead of leaving it stuck in whatever language the app opened in.
  const rawTextTouchedRef = useRef(false);
  const handleChangeRawText = (text: string) => {
    rawTextTouchedRef.current = true;
    setRawText(text);
  };
  useEffect(() => {
    if (!rawTextTouchedRef.current) setRawText(translate("step1.exampleRawText"));
  }, [lang]);
  const [appDesign, setAppDesign] = useState<AppDesign>(DEFAULT_APP_DESIGN);
  const [preferences, setPreferences] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isGeneratingMedia, setIsGeneratingMedia] = useState(false);
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatInput, setChatInput] = useState("");
  // Set when a backend call fails and we fall back to local mock behaviour.
  const [apiNotice, setApiNotice] = useState<string | null>(null);
  // Chat-turn failures stay in the chat panel (with a Retry button) rather than
  // competing with the top ApiNotice used for parse/enhance/media.
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [failedChatText, setFailedChatText] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Starts empty; populated by /api/trip/parse (or DEMO_TRIP on fallback).
  const [tripData, setTripData] = useState<TripData>(EMPTY_TRIP);
  // Id of the trip currently being edited, once saved/loaded — null means
  // "not saved yet", so the next deploy/save creates a new trip rather than
  // overwriting one. Shared between CloudMenu and BuilderStep4 so both stay
  // in sync about which trip is "current".
  const [tripId, setTripId] = useState<string | null>(null);
  // Shows the trip full-screen, exactly as AppFrame renders it on a "?shared="
  // link — the actual "final app" look, as opposed to the builder chrome
  // around it. Opened automatically after loading a saved trip from
  // CloudMenu, or manually via the nav bar's preview button.
  const [previewOpen, setPreviewOpen] = useState(false);

  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  // Offer to restore a mid-build draft after a refresh — only set once on mount.
  const [pendingDraft, setPendingDraft] = useState<BuilderDraft | null>(() => {
    const draft = loadDraft();
    return isRecoverableDraft(draft) ? draft : null;
  });
  // Skip the first autosave tick so mounting with an empty builder does not
  // overwrite a recoverable draft before the user chooses Restore / Discard.
  const draftReadyRef = useRef(!pendingDraft);

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
    setFailedEnhanceOptions(null);
    try {
      const res = await parseTrip(
        rawText,
        preferences || null,
        getApiKeys(),
        getApiProvider(),
        getAllCredentials(),
      );
      setTripData(normalizeTripForLoad(res.trip_data));
      setTripId(null);
      setAgentMessages(
        res.initial_agent_message
          ? [{ role: "agent", text: res.initial_agent_message }]
          : [{ role: "agent", text: t("agent.initial") }],
      );
      goToStep(2);
    } catch (err) {
      console.error(err);
      setApiNotice(isRateLimited(err) ? t("notice.rateLimitedDemo") : t("notice.unreachableDemo"));
      setFailedEnhanceOptions(null);
      setTripData(normalizeTripForLoad(buildDemoTrip()));
      setAgentMessages([{ role: "agent", text: t("agent.demo") }]);
      goToStep(2);
    } finally {
      setIsProcessing(false);
    }
  };

  // Remembered so activities added later via chat can get the same Step 2 extras.
  const [enhanceOptions, setEnhanceOptions] = useState<EnhanceOptions>({});
  // Set only when handleEnhance fails, so ApiNotice can offer a one-click
  // retry with the same options — the wizard still moves on to step 3 either
  // way (a failed "nice to have" pass shouldn't block editing), but losing
  // the chosen extras with no easy way back was worse than necessary.
  const [failedEnhanceOptions, setFailedEnhanceOptions] = useState<EnhanceOptions | null>(null);

  const applyDraft = (draft: BuilderDraft) => {
    rawTextTouchedRef.current = draft.rawTextTouched;
    setRawText(draft.rawText);
    setPreferences(draft.preferences);
    setTripData(draft.tripData);
    setAppDesign(draft.appDesign);
    setTripId(draft.tripId);
    setAgentMessages(draft.agentMessages);
    setEnhanceOptions(draft.enhanceOptions);
    setStep(draft.step);
    window.history.replaceState({ appStep: draft.step }, "");
    draftReadyRef.current = true;
    setPendingDraft(null);
  };

  const discardDraft = () => {
    clearDraft();
    draftReadyRef.current = true;
    setPendingDraft(null);
  };

  // Debounced local draft so a refresh mid-build can offer recovery.
  useEffect(() => {
    if (!draftReadyRef.current) return;
    const timer = window.setTimeout(() => {
      saveDraft({
        step,
        rawText,
        rawTextTouched: rawTextTouchedRef.current,
        preferences,
        tripData,
        appDesign,
        tripId,
        agentMessages,
        enhanceOptions,
      });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [step, rawText, preferences, tripData, appDesign, tripId, agentMessages, enhanceOptions]);

  const handleEnhance = async (options: EnhanceOptions) => {
    setEnhanceOptions(options);
    setIsEnhancing(true);
    try {
      const res = await enhanceTrip(
        tripData,
        options,
        getApiKeys(),
        getApiProvider(),
        getAllCredentials(),
      );
      setTripData(normalizeTripForLoad(res.trip_data));
      setFailedEnhanceOptions(null);
      setApiNotice(null);
    } catch (err) {
      console.error(err);
      setApiNotice(t("notice.enhanceFailed"));
      setFailedEnhanceOptions(options);
    } finally {
      setIsEnhancing(false);
      goToStep(3);
    }
  };

  const sendChatMessage = async (userText: string) => {
    if (!userText.trim()) return;

    const priorTrip = tripData;
    setAgentMessages((prev) => [...prev, { role: "user", text: userText }]);
    setChatInput("");
    setChatNotice(null);
    setIsSendingMessage(true);

    try {
      const res = await agentInteract(
        priorTrip,
        userText,
        preferences || null,
        getApiKeys(),
        getApiProvider(),
        getAllCredentials(),
      );
      // Applied right away — the agent's edit is the authoritative new state,
      // not something to hold back while the (slower) enhancement pass below
      // runs. That second pass only ever *patches* newly-added activities by
      // id into whatever the trip looks like by the time it resolves, so it
      // can never clobber an edit made while it was in flight.
      setTripData(normalizeTripForLoad(res.trip_data));
      setAgentMessages((prev) => [...prev, { role: "agent", text: res.agent_reply }]);
      setFailedChatText(null);

      const newActivities = findNewActivities(priorTrip, res.trip_data);
      if (newActivities.length > 0) {
        const enhancedById = await enhanceActivities(
          newActivities,
          res.trip_data,
          effectiveEnhanceOptions(enhanceOptions),
        );
        if (enhancedById.size > 0) {
          setTripData((prev) => normalizeTripForLoad(mergeEnhancedActivities(prev, enhancedById)));
        }
      }
    } catch (err) {
      console.error(err);
      const message = describeApiError(err, t("notice.updateFailed"));
      setChatNotice(message);
      setFailedChatText(userText);
      setFailedEnhanceOptions(null);
      setAgentMessages((prev) => [...prev, { role: "agent", text: message }]);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendChatMessage(chatInput);
  };

  const handleRetryChat = async () => {
    if (!failedChatText) return;
    await sendChatMessage(failedChatText);
  };

  const { handleUpdateActivity, handleAddActivity, handleDeleteActivity, handleUpdateTrip } =
    useTripEditing(setTripData, effectiveEnhanceOptions(enhanceOptions));

  const handleContinueToDesign = async () => {
    setIsGeneratingMedia(true);
    try {
      const res = await generateMedia(tripData);
      setTripData(normalizeTripForLoad(res.trip_data));
    } catch (err) {
      console.error(err);
      setApiNotice(t("notice.mediaFailed"));
      setFailedEnhanceOptions(null);
    } finally {
      setIsGeneratingMedia(false);
      goToStep(4);
    }
  };

  return (
    <div className="min-h-screen bg-surface font-sans" dir={dir}>
      {/* Top Navbar */}
      <nav className="no-print bg-white shadow-card border-b border-outline/20 px-4 sm:px-6 py-4 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <AppLogo />
          <h1 className="text-lg sm:text-xl font-bold text-ink">{t("nav.title")}</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
          <div className="text-sm font-medium text-ink-muted bg-surface-container px-3 py-1 rounded-full">
            {t("nav.step", { step })}
          </div>
          <LanguageSwitcher />
          <InstallAppButton />
          <ApiKeyMenu />
          {tripData.days.length > 0 && (
            <button
              onClick={() => setPreviewOpen(true)}
              className="flex items-center gap-1.5 text-sm font-medium text-ink-muted bg-surface-container hover:bg-surface-container-high px-3 py-1.5 rounded-full transition-colors"
            >
              <Smartphone size={16} />
              {t("nav.preview")}
            </button>
          )}
          <CloudMenu
            tripData={tripData}
            appDesign={appDesign}
            tripId={tripId}
            currentStep={step}
            onTripIdChange={setTripId}
            onUpdateTrip={handleUpdateTrip}
            onLoadTrip={(trip, loadedTripId, loadedAppDesign) => {
              setTripData(trip);
              setTripId(loadedTripId);
              setAppDesign(loadedAppDesign);
              setAgentMessages([{ role: "agent", text: t("agent.loaded") }]);
              // Reaching here means the trip wasn't saved as "Final app" (that
              // case navigates straight to the real "?shared=" link instead,
              // see CloudMenu's handleLoad) — it's still in progress, so land
              // on the design/publish step rather than the from-scratch chat
              // editor. The nav bar's "Preview app" button is there if the
              // user wants a quick look without leaving the builder.
              goToStep(4);
            }}
            onImportTrip={(trip, importedAppDesign) => {
              setTripData(trip);
              setTripId(null);
              setAppDesign(importedAppDesign);
              setAgentMessages([{ role: "agent", text: t("agent.imported") }]);
              goToStep(3);
            }}
          />
        </div>
      </nav>

      {pendingDraft && (
        <ApiNotice
          message={t("draft.recoverPrompt")}
          onDismiss={discardDraft}
          actionLabel={t("draft.restore")}
          onAction={() => applyDraft(pendingDraft)}
        />
      )}

      <ApiNotice
        message={apiNotice}
        onDismiss={() => {
          setApiNotice(null);
          setFailedEnhanceOptions(null);
        }}
        actionLabel={failedEnhanceOptions ? t("notice.retry") : undefined}
        onAction={failedEnhanceOptions ? () => handleEnhance(failedEnhanceOptions) : undefined}
      />

      <div className="max-w-7xl mx-auto p-6 flex flex-col lg:flex-row gap-8 print:block print:max-w-none print:p-0">
        {/* Left Side: Builder Interface */}
        <div className="no-print flex-1 bg-white rounded-2xl shadow-card border border-outline/20 p-8 flex flex-col">
          <ProgressBar step={step} />

          {/* Dynamic Content based on Step */}
          <div className="flex-1">
            {step === 1 && (
              <BuilderStep1
                rawText={rawText}
                onChangeRawText={handleChangeRawText}
                preferences={preferences}
                onChangePreferences={setPreferences}
                onSubmit={handleProcessText}
                isProcessing={isProcessing}
                hasExistingTrip={tripData.days.length > 0}
                onContinueWithoutReprocessing={() => goToStep(2)}
              />
            )}
            <Suspense fallback={<StepFallback />}>
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
                  chatNotice={chatNotice}
                  onRetryChat={failedChatText ? handleRetryChat : undefined}
                  onContinue={handleContinueToDesign}
                  onBack={() => goToStep(2)}
                  isGeneratingMedia={isGeneratingMedia}
                  tripDates={tripData.dates}
                  onChangeTripDates={(dates) => handleUpdateTrip({ dates })}
                  language={tripData.language}
                />
              )}

              {step === 4 && (
                <BuilderStep4
                  appDesign={appDesign}
                  onChangeAppDesign={(patch) => setAppDesign((prev) => ({ ...prev, ...patch }))}
                  tripData={tripData}
                  onUpdateTrip={(patch) => handleUpdateTrip(patch)}
                  tripId={tripId}
                  onSaved={(savedId, title) => {
                    setTripId(savedId);
                    setTripData((prev) => ({ ...prev, title }));
                  }}
                  onBack={() => goToStep(3)}
                />
              )}
            </Suspense>
          </div>
        </div>

        {/* Right Side: App Live Preview */}
        <div className="flex-1 flex justify-center items-center bg-surface-container rounded-2xl border border-outline/20 py-10 relative overflow-hidden print:bg-white print:border-0 print:rounded-none print:py-0 print:shadow-none print:block">
          <div className="no-print absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-4 py-1.5 rounded-full text-xs font-bold text-ink-muted uppercase tracking-wider shadow-sm z-10 flex items-center gap-2 border border-outline/20">
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse"></span>
            Live Preview
          </div>
          <Suspense
            fallback={
              <div className="w-[350px] h-[700px] rounded-[2.5rem] animate-pulse bg-surface-container-high" />
            }
          >
            <PhonePreview
              tripData={tripData}
              appDesign={appDesign}
              agentMessages={agentMessages}
              chatInput={chatInput}
              onChangeChatInput={setChatInput}
              onSendMessage={handleSendMessage}
              chatEndRef={chatEndRef}
              isSendingMessage={isSendingMessage}
              chatNotice={chatNotice}
              onRetryChat={failedChatText ? handleRetryChat : undefined}
              onUpdateActivity={handleUpdateActivity}
              onAddActivity={handleAddActivity}
              onDeleteActivity={handleDeleteActivity}
              onUpdateTrip={handleUpdateTrip}
            />
          </Suspense>
        </div>
      </div>

      {previewOpen && (
        <div
          className="fixed inset-0 z-50 h-dvh overflow-hidden bg-surface-container flex justify-center"
          dir={dir}
        >
          <div className="w-full sm:max-w-md h-dvh bg-surface shadow-2xl flex flex-col overflow-hidden">
            <div className="shrink-0 flex items-center gap-2 p-2 bg-white border-b border-outline/20">
              <button
                onClick={() => setPreviewOpen(false)}
                className="flex items-center gap-1 text-ink-muted hover:text-primary bg-surface-container hover:bg-surface-container-high px-2.5 py-1.5 rounded-lg text-xs"
              >
                <ChevronLeft size={14} />
                {t("common.back")}
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <Suspense fallback={<StepFallback />}>
                <AppFrame
                  tripData={tripData}
                  appDesign={appDesign}
                  agentMessages={agentMessages}
                  chatInput={chatInput}
                  onChangeChatInput={setChatInput}
                  onSendMessage={handleSendMessage}
                  chatEndRef={chatEndRef}
                  isSendingMessage={isSendingMessage}
                  chatNotice={chatNotice}
                  onRetryChat={failedChatText ? handleRetryChat : undefined}
                  onUpdateActivity={handleUpdateActivity}
                  onAddActivity={handleAddActivity}
                  onDeleteActivity={handleDeleteActivity}
                  onUpdateTrip={handleUpdateTrip}
                />
              </Suspense>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Loads a "?shared=<tripId>" link's trip and renders only the generated
// app — no builder chrome, no AI chat — so it looks like the real
// mobile/web app trip participants would actually use.
function SharedTripViewer({ tripId }: { tripId: string }) {
  const { t, dir } = useI18n();
  const [trip, setTrip] = useState<TripData | null>(null);
  const [appDesign, setAppDesign] = useState<AppDesign>(DEFAULT_APP_DESIGN);
  const [error, setError] = useState<string | null>(null);

  // Edits below (chat or manual) only ever call setTrip — this is local-only
  // state, never backed by Firestore. adminEmails/session exist purely to
  // decide whether to show admin controls (save-in-place, add-admin); the
  // actual writes go through saveSharedTrip/addSharedTripAdmin, gated by
  // firestore.rules on the server side.
  const [agentMessages, setAgentMessages] = useState<AgentMessage[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const [chatNotice, setChatNotice] = useState<string | null>(null);
  const [failedChatText, setFailedChatText] = useState<string | null>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const [session, setSession] = useState<CloudSession | null>(getCurrentSession());
  const [adminEmails, setAdminEmails] = useState<string[]>([]);

  useEffect(() => {
    loadSharedTrip(tripId)
      .then((result) => {
        setTrip(result.trip);
        setAppDesign(result.appDesign);
        setAdminEmails(result.meta.adminEmails);
        setAgentMessages([{ role: "agent", text: translate("agent.sharedIntro") }]);
      })
      .catch((err) => {
        console.error(err);
        setError(
          err instanceof Error && err.message.includes("expired")
            ? translate("shared.expired")
            : translate("shared.loadFailed"),
        );
      });
  }, [tripId]);

  useEffect(
    () =>
      onAuthChange((user) =>
        setSession(
          user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null,
        ),
      ),
    [],
  );

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [agentMessages]);

  const isAdmin = Boolean(session?.email && adminEmails.includes(session.email.toLowerCase()));

  const handleSaveChanges = async () => {
    if (!trip) throw new Error("Trip not loaded yet.");
    await saveSharedTrip(tripId, trip, appDesign);
  };

  const handleAddAdmin = async (email: string) => {
    await addSharedTripAdmin(tripId, email);
    const normalized = email.trim().toLowerCase();
    setAdminEmails((prev) => (prev.includes(normalized) ? prev : [...prev, normalized]));
  };

  const handleCreateNewLink = async (): Promise<string> => {
    if (!trip) throw new Error("Trip not loaded yet.");
    const currentSession = session ?? (await signInWithGoogle());
    const newTripId = await saveTrip(currentSession.uid, trip, { appDesign, stage: "final" });
    return shareTrip(currentSession.uid, newTripId, trip, appDesign);
  };

  const sendChatMessage = async (userText: string) => {
    if (!userText.trim() || !trip) return;

    const priorTrip = trip;
    setAgentMessages((prev) => [...prev, { role: "user", text: userText }]);
    setChatInput("");
    setIsSendingMessage(true);
    setChatNotice(null);

    try {
      const res = await agentInteract(
        priorTrip,
        userText,
        null,
        getApiKeys(),
        getApiProvider(),
        getAllCredentials(),
      );
      // See TripBuilder's own handleSendMessage for why this is normalized and
      // applied immediately, with new activities enhanced (and merged in) as a
      // separate, non-blocking step below.
      setTrip(normalizeTripForLoad(res.trip_data));
      setAgentMessages((prev) => [...prev, { role: "agent", text: res.agent_reply }]);
      setFailedChatText(null);

      const newActivities = findNewActivities(priorTrip, res.trip_data);
      if (newActivities.length > 0) {
        // No Step 2 of its own to remember a subset of extras from — always
        // fetch every extra, same as TripBuilder's own no-Step-2-selection
        // fallback.
        const enhancedById = await enhanceActivities(
          newActivities,
          res.trip_data,
          ALL_ENHANCE_OPTIONS,
        );
        if (enhancedById.size > 0) {
          setTrip((prev) =>
            prev ? normalizeTripForLoad(mergeEnhancedActivities(prev, enhancedById)) : prev,
          );
        }
      }
    } catch (err) {
      console.error(err);
      setChatNotice(describeApiError(err, t("notice.updateFailed")));
      setFailedChatText(userText);
    } finally {
      setIsSendingMessage(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await sendChatMessage(chatInput);
  };

  const handleRetryChat = async () => {
    if (!failedChatText) return;
    await sendChatMessage(failedChatText);
  };

  const setLoadedTrip: Dispatch<SetStateAction<TripData>> = (action) => {
    setTrip((prev) => {
      if (!prev) return prev;
      return typeof action === "function" ? action(prev) : action;
    });
  };
  const { handleUpdateActivity, handleAddActivity, handleDeleteActivity, handleUpdateTrip } =
    useTripEditing(setLoadedTrip, ALL_ENHANCE_OPTIONS);

  if (error) {
    return (
      <div
        className="min-h-screen flex items-center justify-center text-center text-ink-muted p-6"
        dir={dir}
      >
        {error}
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen flex items-center justify-center text-ink-muted" dir={dir}>
        {t("shared.loading")}
      </div>
    );
  }

  return (
    <Suspense fallback={<StepFallback />}>
      <SharedAppPage
        tripData={trip}
        appDesign={appDesign}
        tripId={tripId}
        agentMessages={agentMessages}
        chatInput={chatInput}
        onChangeChatInput={setChatInput}
        onSendMessage={handleSendMessage}
        chatEndRef={chatEndRef}
        isSendingMessage={isSendingMessage}
        chatNotice={chatNotice}
        onRetryChat={failedChatText ? handleRetryChat : undefined}
        onUpdateActivity={handleUpdateActivity}
        onAddActivity={handleAddActivity}
        onDeleteActivity={handleDeleteActivity}
        onUpdateTrip={handleUpdateTrip}
        onImportTrip={(importedTrip, importedAppDesign) => {
          setTrip(importedTrip);
          setAppDesign(importedAppDesign);
        }}
        isAdmin={isAdmin}
        onSaveChanges={handleSaveChanges}
        onAddAdmin={handleAddAdmin}
        onCreateNewLink={handleCreateNewLink}
      />
    </Suspense>
  );
}

export default function App() {
  return SHARED_TRIP_ID ? <SharedTripViewer tripId={SHARED_TRIP_ID} /> : <TripBuilder />;
}
