import { describe, it, expect } from "vitest";
import { buildTripParsePrompt } from "./externalTripPrompt";

describe("buildTripParsePrompt", () => {
  it("includes the raw trip text as the user request", () => {
    const prompt = buildTripParsePrompt("On Sunday we fly to London", "");
    expect(prompt).toContain("User Request: On Sunday we fly to London");
  });

  it("includes the preferences fragment when preferences are given", () => {
    const prompt = buildTripParsePrompt("some trip", "vegan, wheelchair accessible");
    expect(prompt).toContain("IMPORTANT: vegan, wheelchair accessible");
  });

  it("omits the preferences fragment when preferences are blank", () => {
    const prompt = buildTripParsePrompt("some trip", "   ");
    expect(prompt).not.toContain("IMPORTANT:");
  });

  it("embeds the TripData JSON schema so the reply can be validated on return", () => {
    const prompt = buildTripParsePrompt("some trip", "");
    expect(prompt).toContain('"title":"TripData"');
    expect(prompt).toContain('"required":["title","dates"]');
  });

  it("tells the model to answer with strict JSON only", () => {
    const prompt = buildTripParsePrompt("some trip", "");
    expect(prompt).toMatch(/no markdown fences, no commentary/);
  });
});
