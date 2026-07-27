import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { usePodcastPlayer } from "./usePodcastPlayer";
import type { Activity } from "../api";

const activity: Activity = {
  id: "a1",
  time: "09:00",
  title: "Museum",
  desc: "A historic museum.",
  type: "attraction",
  hasPodcast: true,
};

function makeVoice(lang: string): SpeechSynthesisVoice {
  return { lang, name: lang, voiceURI: lang, default: false, localService: true } as never;
}

// B4: the fallback browser-TTS narration used to always search for a Hebrew
// voice regardless of the trip's language — a French/English trip's podcast
// would silently get read in whatever default voice the browser picks
// instead of matching the trip's actual language.
describe("usePodcastPlayer voice selection", () => {
  let voices: SpeechSynthesisVoice[];
  let speak: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    voices = [makeVoice("en-US"), makeVoice("fr-FR"), makeVoice("he-IL")];
    speak = vi.fn();
    (window as unknown as { speechSynthesis: unknown }).speechSynthesis = {
      getVoices: () => voices,
      addEventListener: vi.fn(),
      cancel: vi.fn(),
      speak,
    };
    // jsdom doesn't implement the Web Speech API at all.
    (window as unknown as { SpeechSynthesisUtterance: unknown }).SpeechSynthesisUtterance = class {
      voice: SpeechSynthesisVoice | null = null;
      onend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor(public text: string) {}
    };
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("picks a voice matching the trip's language, not a hardcoded Hebrew one", async () => {
    const { result } = renderHook(() => usePodcastPlayer("fr"));
    act(() => result.current.togglePlay(activity));

    await vi.waitFor(() => expect(speak).toHaveBeenCalled());
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.voice?.lang).toBe("fr-FR");
  });

  it("falls back to Hebrew when the trip has no language set", async () => {
    const { result } = renderHook(() => usePodcastPlayer(undefined));
    act(() => result.current.togglePlay(activity));

    await vi.waitFor(() => expect(speak).toHaveBeenCalled());
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.voice?.lang).toBe("he-IL");
  });

  it("leaves the voice unset when no installed voice matches the trip's language", async () => {
    voices = [makeVoice("he-IL")];
    const { result } = renderHook(() => usePodcastPlayer("en"));
    act(() => result.current.togglePlay(activity));

    await vi.waitFor(() => expect(speak).toHaveBeenCalled());
    const utterance = speak.mock.calls[0][0] as SpeechSynthesisUtterance;
    expect(utterance.voice).toBeNull();
  });
});
