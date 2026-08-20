import { describe, it, expect, vi, afterEach } from "vitest";
import { buildExternalChatUrl, copyToClipboard, EXTERNAL_CHAT_PROVIDERS } from "./externalChat";

function provider(id: string) {
  const p = EXTERNAL_CHAT_PROVIDERS.find((p) => p.id === id);
  if (!p) throw new Error(`no such provider: ${id}`);
  return p;
}

describe("EXTERNAL_CHAT_PROVIDERS", () => {
  it("covers exactly chatgpt, claude, gemini, and groq", () => {
    expect(EXTERNAL_CHAT_PROVIDERS.map((p) => p.id).sort()).toEqual([
      "chatgpt",
      "claude",
      "gemini",
      "groq",
    ]);
  });

  it("every homeUrl is a real https URL", () => {
    for (const p of EXTERNAL_CHAT_PROVIDERS) {
      expect(p.homeUrl).toMatch(/^https:\/\//);
    }
  });
});

describe("buildExternalChatUrl", () => {
  it("embeds the question for a provider with a known prefill parameter", () => {
    const url = buildExternalChatUrl(provider("claude"), "how do I add a museum stop?");
    expect(url).toContain("claude.ai/new?");
    expect(new URL(url).searchParams.get("q")).toBe("how do I add a museum stop?");
  });

  it("falls back to the plain homepage when there's no known prefill parameter", () => {
    const url = buildExternalChatUrl(provider("groq"), "add a beach day");
    expect(url).toBe(provider("groq").homeUrl);
  });

  it("gemini targets Google Search's AI Mode (udm=50), not gemini.google.com", () => {
    const url = buildExternalChatUrl(provider("gemini"), "suggest a day trip");
    expect(url).toContain("google.com/search?");
    expect(url).toContain("udm=50");
  });

  it("URL-encodes special characters in the question", () => {
    const url = buildExternalChatUrl(provider("chatgpt"), "3 days & 2 nights?");
    expect(url).not.toContain("3 days & 2 nights?");
    expect(new URL(url).searchParams.get("q")).toBe("3 days & 2 nights?");
  });
});

describe("copyToClipboard", () => {
  const originalClipboard = navigator.clipboard;
  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", { value: originalClipboard, configurable: true });
  });

  it("writes the text to the clipboard", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    copyToClipboard("hello");

    expect(writeText).toHaveBeenCalledWith("hello");
  });

  it("never throws when the clipboard is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    expect(() => copyToClipboard("hello")).not.toThrow();
  });

  it("never throws when the clipboard write itself rejects", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    expect(() => copyToClipboard("hello")).not.toThrow();
    // Let the rejected promise's .catch() actually run before the test ends.
    await Promise.resolve();
    await Promise.resolve();
  });
});
