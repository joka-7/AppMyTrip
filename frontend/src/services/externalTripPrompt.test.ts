import { describe, it, expect } from "vitest";
import type { TripData } from "../api";
import {
  buildAgentTurnPrompt,
  buildTripEnhancePrompt,
  buildTripParsePrompt,
} from "./externalTripPrompt";

const sampleTrip: TripData = {
  title: "Rome trip",
  dates: "Mon-Fri",
  language: "en",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "a1",
          time: "09:00",
          title: "Colosseum",
          desc: "Ancient amphitheater",
          type: "attraction",
          map_coordinates: { lat: 41.89, lng: 12.49 },
        },
      ],
    },
  ],
};

describe("buildTripParsePrompt", () => {
  it("includes the raw trip text as the user request", () => {
    const prompt = buildTripParsePrompt("On Sunday we fly to London", "", "en");
    expect(prompt).toContain("User Request: On Sunday we fly to London");
  });

  it("includes the preferences fragment when preferences are given", () => {
    const prompt = buildTripParsePrompt("some trip", "vegan, wheelchair accessible", "en");
    expect(prompt).toContain("IMPORTANT: vegan, wheelchair accessible");
  });

  it("omits the preferences fragment when preferences are blank", () => {
    const prompt = buildTripParsePrompt("some trip", "   ", "en");
    expect(prompt).not.toContain("IMPORTANT:");
  });

  it("embeds the TripData JSON schema so the reply can be validated on return", () => {
    const prompt = buildTripParsePrompt("some trip", "", "en");
    expect(prompt).toContain('"title":"TripData"');
    expect(prompt).toContain('"required":["title","dates"]');
  });

  it("tells the model to answer with strict JSON only", () => {
    const prompt = buildTripParsePrompt("some trip", "", "en");
    expect(prompt).toMatch(/no markdown fences, no commentary/);
  });

  // Regression guard: this used to tell the model to detect the dominant
  // language of the pasted text itself, so a Hebrew paste produced a
  // Hebrew-language trip even when the app's own UI was set to English.
  it("tells the model to write in the app's selected language, not detect it from the pasted text", () => {
    const prompt = buildTripParsePrompt("היי, אנחנו טסים לרומא", "", "en");
    expect(prompt).toContain("The user's app is set to English (ISO 639-1 code 'en')");
    expect(prompt).toContain("set the 'language' field to 'en'");
    expect(prompt).not.toMatch(/detect the dominant language/i);
  });

  it("reflects a different selected language", () => {
    const prompt = buildTripParsePrompt("some trip", "", "fr");
    expect(prompt).toContain("The user's app is set to French (ISO 639-1 code 'fr')");
    expect(prompt).toContain("set the 'language' field to 'fr'");
  });
});

describe("buildTripEnhancePrompt", () => {
  it("returns null when nothing is selected and every activity already has coordinates", () => {
    expect(buildTripEnhancePrompt(sampleTrip, {}, "en")).toBeNull();
  });

  it("includes the instruction for each selected option only", () => {
    const prompt = buildTripEnhancePrompt(sampleTrip, { prices: true, packing: true }, "en");
    expect(prompt).toContain("Fill 'price' with the typical cost");
    expect(prompt).toContain("Fill in the packing checklists");
    expect(prompt).not.toContain("driving directions/notes");
  });

  it("adds the missing-coordinates instruction when an activity lacks them, even with no option selected", () => {
    const tripMissingCoords: TripData = {
      ...sampleTrip,
      days: [
        {
          dayNum: 1,
          activities: [{ ...sampleTrip.days[0].activities[0], map_coordinates: null }],
        },
      ],
    };
    const prompt = buildTripEnhancePrompt(tripMissingCoords, {}, "en");
    expect(prompt).toContain("Some activities have 'map_coordinates' set to null");
  });

  it("embeds the current trip and the TripData schema", () => {
    const prompt = buildTripEnhancePrompt(sampleTrip, { prices: true }, "en");
    expect(prompt).toContain('"title":"Rome trip"');
    expect(prompt).toContain('"title":"TripData"');
  });

  // The trip itself is already in English ("language": "en") here, but the
  // instruction should name the app's selected language explicitly rather
  // than only relying on the trip's own (possibly stale) field.
  it("tells the model to write new text in the app's selected language", () => {
    const prompt = buildTripEnhancePrompt(sampleTrip, { prices: true }, "he");
    expect(prompt).toContain("The user's app is set to Hebrew (ISO 639-1 code 'he')");
  });
});

describe("buildAgentTurnPrompt", () => {
  it("includes the current trip and the user's message", () => {
    const prompt = buildAgentTurnPrompt(sampleTrip, "Add a museum on day 1", null, "en");
    expect(prompt).toContain('"title":"Rome trip"');
    expect(prompt).toContain("User Message: Add a museum on day 1");
  });

  it("includes the preferences fragment when given", () => {
    const prompt = buildAgentTurnPrompt(sampleTrip, "anything", "vegan", "en");
    expect(prompt).toContain("IMPORTANT: vegan");
  });

  it("embeds the AgentResponse JSON schema so the reply can be validated on return", () => {
    const prompt = buildAgentTurnPrompt(sampleTrip, "anything", null, "en");
    expect(prompt).toContain('"title":"AgentResponse"');
    expect(prompt).toContain('"required":["updated_trip","agent_reply"]');
  });

  // Regression guard: replying only in the trip's own (possibly stale)
  // language field used to mean a chat message typed in a different
  // language than the app's UI could steer the whole reply away from what
  // the user actually has the app set to.
  it("tells the model to default to the app's selected language for the reply", () => {
    const prompt = buildAgentTurnPrompt(sampleTrip, "anything", null, "en");
    expect(prompt).toContain("Write 'agent_reply' in English (the app's current UI language");
    expect(prompt).toContain("otherwise set 'updated_trip.language' to 'en'");
  });
});
