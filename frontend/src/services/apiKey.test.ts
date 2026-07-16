import { describe, it, expect, beforeEach } from "vitest";
import {
  addApiKey,
  removeApiKey,
  getApiKeys,
  getApiKeysForProvider,
  getAllCredentials,
  getApiProvider,
  setApiProvider,
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

  it("keeps each provider's keys separate and makes the added provider active", () => {
    addApiKey("gem", "gemini");
    addApiKey("groq-key", "groq");
    expect(getApiProvider()).toBe("groq");
    expect(getApiKeys()).toEqual(["groq-key"]);
    setApiProvider("gemini");
    expect(getApiKeys()).toEqual(["gem"]);
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
    // The last-added provider (openai) is active, so it must come first.
    expect(getApiProvider()).toBe("openai");
    expect(getAllCredentials()).toEqual([
      { provider: "openai", api_keys: ["oai"] },
      { provider: "gemini", api_keys: ["gem"] },
      { provider: "groq", api_keys: ["groq-1", "groq-2"] },
    ]);
  });

  it("skips providers with no saved keys", () => {
    addApiKey("gem", "gemini");
    setApiProvider("gemini");
    expect(getAllCredentials()).toEqual([{ provider: "gemini", api_keys: ["gem"] }]);
  });
});
