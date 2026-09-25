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

describe("buildTripEnhancePrompt", () => {
  it("returns null when nothing is selected and every activity already has coordinates", () => {
    expect(buildTripEnhancePrompt(sampleTrip, {})).toBeNull();
  });

  it("includes the instruction for each selected option only", () => {
    const prompt = buildTripEnhancePrompt(sampleTrip, { prices: true, packing: true });
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
    const prompt = buildTripEnhancePrompt(tripMissingCoords, {});
    expect(prompt).toContain("Some activities have 'map_coordinates' set to null");
  });

  it("embeds the current trip and the TripData schema", () => {
    const prompt = buildTripEnhancePrompt(sampleTrip, { prices: true });
    expect(prompt).toContain('"title":"Rome trip"');
    expect(prompt).toContain('"title":"TripData"');
  });
});

describe("buildAgentTurnPrompt", () => {
  it("includes the current trip and the user's message", () => {
    const prompt = buildAgentTurnPrompt(sampleTrip, "Add a museum on day 1", null);
    expect(prompt).toContain('"title":"Rome trip"');
    expect(prompt).toContain("User Message: Add a museum on day 1");
  });

  it("includes the preferences fragment when given", () => {
    const prompt = buildAgentTurnPrompt(sampleTrip, "anything", "vegan");
    expect(prompt).toContain("IMPORTANT: vegan");
  });

  it("embeds the AgentResponse JSON schema so the reply can be validated on return", () => {
    const prompt = buildAgentTurnPrompt(sampleTrip, "anything", null);
    expect(prompt).toContain('"title":"AgentResponse"');
    expect(prompt).toContain('"required":["updated_trip","agent_reply"]');
  });
});
