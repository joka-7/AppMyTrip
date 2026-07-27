import type { EnhanceOptions, TripData } from "../api";
import type { AgentMessage } from "../components/ChatPanel";
import { type AppDesign, normalizeAppDesign } from "./appDesign";
import { normalizeTripForLoad } from "./normalizeTrip";

const DRAFT_KEY = "appmytrip.builderDraft.v1";

export interface BuilderDraft {
  version: 1;
  savedAt: string;
  step: number;
  rawText: string;
  rawTextTouched: boolean;
  preferences: string;
  tripData: TripData;
  appDesign: AppDesign;
  tripId: string | null;
  agentMessages: AgentMessage[];
  enhanceOptions: EnhanceOptions;
}

export type BuilderDraftInput = Omit<BuilderDraft, "version" | "savedAt">;

/** True when a draft has enough content that losing it on refresh would hurt. */
export function isRecoverableDraft(draft: BuilderDraft | null | undefined): boolean {
  if (!draft) return false;
  if ((draft.tripData.days?.length ?? 0) > 0) return true;
  if (draft.rawTextTouched && draft.rawText.trim().length > 0) return true;
  return false;
}

export function loadDraft(): BuilderDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<BuilderDraft>;
    if (parsed.version !== 1 || !parsed.tripData || typeof parsed.step !== "number") {
      return null;
    }
    return {
      version: 1,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : new Date().toISOString(),
      step: parsed.step,
      rawText: typeof parsed.rawText === "string" ? parsed.rawText : "",
      rawTextTouched: Boolean(parsed.rawTextTouched),
      preferences: typeof parsed.preferences === "string" ? parsed.preferences : "",
      tripData: normalizeTripForLoad(parsed.tripData as TripData),
      appDesign: normalizeAppDesign(parsed.appDesign),
      tripId: typeof parsed.tripId === "string" ? parsed.tripId : null,
      agentMessages: Array.isArray(parsed.agentMessages)
        ? (parsed.agentMessages as AgentMessage[])
        : [],
      enhanceOptions:
        parsed.enhanceOptions && typeof parsed.enhanceOptions === "object"
          ? parsed.enhanceOptions
          : {},
    };
  } catch {
    return null;
  }
}

export function saveDraft(input: BuilderDraftInput): void {
  const payload: BuilderDraft = {
    version: 1,
    savedAt: new Date().toISOString(),
    ...input,
  };
  try {
    localStorage.setItem(DRAFT_KEY, JSON.stringify(payload));
  } catch (err) {
    // Quota / private mode — draft recovery is best-effort.
    console.error(err);
  }
}

export function clearDraft(): void {
  try {
    localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* ignore */
  }
}
