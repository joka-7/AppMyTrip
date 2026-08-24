import { describe, it, expect, beforeEach } from "vitest";
import {
  addApiKey,
  removeApiKey,
  getApiKeys,
  getApiKeysForProvider,
  getAllCredentials,
  getApiProvider,
  setApiProvider,
  getBackend,
  setBackend,
} from "./apiKey";

describe("apiKey storage (multiple keys per provider)", () => {
  beforeEach(() => localStorage.clear());

  it("stores several keys for a provider and returns them in order", () => {
    addApiKey("gem-1", "gemini");
    addApiKey("gem-2", "gemini");
    expect(getApiKeysForProvider("gemini")).toEqual(["gem-1", "gem-2"]);
  });

  it("ignores blank and duplicate keys", () => {
    addApiKey("dup", "gemini");
    addApiKey("dup", "gemini");
    addApiKey("   ", "gemini");
    expect(getApiKeysForProvider("gemini")).toEqual(["dup"]);
  });

  it("keeps each provider's keys separate", () => {
    addApiKey("gem", "gemini");
    addApiKey("groq-key", "groq");
    expect(getApiKeysForProvider("gemini")).toEqual(["gem"]);
    expect(getApiKeysForProvider("groq")).toEqual(["groq-key"]);
  });

  it("makes the very first key ever saved the active provider", () => {
    addApiKey("gem", "gemini");
    expect(getApiProvider()).toBe("gemini");
    expect(getApiKeys()).toEqual(["gem"]);
  });

  it("does not silently reassign the active provider once one is already set", () => {
    // A working provider shouldn't get bumped behind a newly-added backup key —
    // that only happens if the user explicitly promotes it (setApiProvider).
    addApiKey("gem", "gemini");
    addApiKey("groq-key", "groq");
    expect(getApiProvider()).toBe("gemini");
    setApiProvider("groq");
    expect(getApiProvider()).toBe("groq");
  });

  it("removes a single key without touching the others", () => {
    addApiKey("a", "openai");
    addApiKey("b", "openai");
    removeApiKey("a", "openai");
    expect(getApiKeysForProvider("openai")).toEqual(["b"]);
  });

  it("migrates the old single-string-per-provider format into a list", () => {
    localStorage.setItem("tripweaver_api_keys", JSON.stringify({ gemini: "legacy-key" }));
    expect(getApiKeysForProvider("gemini")).toEqual(["legacy-key"]);
  });

  it("migrates the oldest single-key format (bare string + provider) into a list", () => {
    localStorage.setItem("tripweaver_api_key", "very-old-key");
    localStorage.setItem("tripweaver_api_provider", "groq");
    expect(getApiKeysForProvider("groq")).toEqual(["very-old-key"]);
    // The legacy key is cleaned up after migration.
    expect(localStorage.getItem("tripweaver_api_key")).toBeNull();
  });
});

describe("getAllCredentials", () => {
  beforeEach(() => localStorage.clear());

  it("returns an empty list when no keys are saved", () => {
    expect(getAllCredentials()).toEqual([]);
  });

  it("lists every saved provider with the active one first", () => {
    addApiKey("gem", "gemini");
    addApiKey("groq-1", "groq");
    addApiKey("groq-2", "groq");
    addApiKey("oai", "openai");
    // gemini was the first key ever saved, so it stays active/first even
    // though groq and openai were added afterward — adding a backup key for
    // another provider must not silently bump a working one out of first place.
    expect(getApiProvider()).toBe("gemini");
    expect(getAllCredentials()).toEqual([
      { provider: "gemini", api_keys: ["gem"] },
      { provider: "groq", api_keys: ["groq-1", "groq-2"] },
      { provider: "openai", api_keys: ["oai"] },
    ]);
  });

  it("skips providers with no saved keys", () => {
    addApiKey("gem", "gemini");
    setApiProvider("gemini");
    expect(getAllCredentials()).toEqual([{ provider: "gemini", api_keys: ["gem"] }]);
  });
});

describe("backend selection", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to legacy when nothing is stored", () => {
    expect(getBackend()).toBe("legacy");
  });

  it("remembers an explicit choice", () => {
    setBackend("model_dispatcher");
    expect(getBackend()).toBe("model_dispatcher");
  });

  it("falls back to legacy for a corrupted/unknown stored value", () => {
    localStorage.setItem("tripweaver_backend", "not-a-real-backend");
    expect(getBackend()).toBe("legacy");
  });
});
