import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  clearDraft,
  isRecoverableDraft,
  loadDraft,
  saveDraft,
  type BuilderDraftInput,
} from "./draftStore";
import { DEFAULT_APP_DESIGN } from "./appDesign";

const sample: BuilderDraftInput = {
  step: 3,
  rawText: "flying to rome",
  rawTextTouched: true,
  preferences: "",
  tripData: {
    title: "Rome",
    dates: "Mon - Wed",
    days: [{ dayNum: 1, activities: [] }],
  },
  appDesign: DEFAULT_APP_DESIGN,
  tripId: null,
  agentMessages: [{ role: "agent", text: "hi" }],
  enhanceOptions: { prices: true },
};

describe("draftStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it("round-trips a draft through localStorage", () => {
    saveDraft(sample);
    const loaded = loadDraft();
    expect(loaded?.step).toBe(3);
    expect(loaded?.tripData.title).toBe("Rome");
    expect(loaded?.enhanceOptions).toEqual({ prices: true });
    expect(loaded?.version).toBe(1);
  });

  it("treats trips with days (or touched raw text) as recoverable", () => {
    expect(isRecoverableDraft(null)).toBe(false);
    expect(
      isRecoverableDraft({
        version: 1,
        savedAt: new Date().toISOString(),
        ...sample,
        tripData: { title: "", dates: "", days: [] },
        rawTextTouched: false,
      }),
    ).toBe(false);
    expect(
      isRecoverableDraft({
        version: 1,
        savedAt: new Date().toISOString(),
        ...sample,
      }),
    ).toBe(true);
  });

  it("clearDraft removes the stored payload", () => {
    saveDraft(sample);
    clearDraft();
    expect(loadDraft()).toBeNull();
  });

  it("returns null for corrupt JSON", () => {
    localStorage.setItem("appmytrip.builderDraft.v1", "{not-json");
    expect(loadDraft()).toBeNull();
  });

  it("swallows quota errors on save", () => {
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    expect(() => saveDraft(sample)).not.toThrow();
    spy.mockRestore();
  });
});
