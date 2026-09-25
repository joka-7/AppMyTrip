import { describe, it, expect } from "vitest";
import {
  InvalidExternalReplyError,
  parseExternalAgentReply,
  parseExternalTripReply,
} from "./externalTripReply";

const VALID_TRIP_JSON = JSON.stringify({
  title: "Rome trip",
  dates: "Mon-Fri",
  days: [{ dayNum: 1, activities: [], checklist: [] }],
});

describe("parseExternalTripReply", () => {
  it("parses a plain JSON reply", () => {
    const trip = parseExternalTripReply(VALID_TRIP_JSON);
    expect(trip.title).toBe("Rome trip");
    expect(trip.days).toHaveLength(1);
  });

  it("strips a ```json ... ``` fence, which most chat apps add even when told not to", () => {
    const fenced = "```json\n" + VALID_TRIP_JSON + "\n```";
    const trip = parseExternalTripReply(fenced);
    expect(trip.title).toBe("Rome trip");
  });

  it("strips a plain ``` ... ``` fence with no language tag", () => {
    const fenced = "```\n" + VALID_TRIP_JSON + "\n```";
    const trip = parseExternalTripReply(fenced);
    expect(trip.title).toBe("Rome trip");
  });

  it("throws InvalidExternalReplyError for text that isn't JSON", () => {
    expect(() => parseExternalTripReply("Sure, here's your trip: enjoy Rome!")).toThrow(
      InvalidExternalReplyError,
    );
  });

  it("throws InvalidExternalReplyError for valid JSON that isn't shaped like a trip", () => {
    expect(() => parseExternalTripReply(JSON.stringify({ hello: "world" }))).toThrow(
      InvalidExternalReplyError,
    );
  });

  it("throws InvalidExternalReplyError when a day is missing its activities array", () => {
    const malformed = JSON.stringify({ title: "x", dates: "y", days: [{ dayNum: 1 }] });
    expect(() => parseExternalTripReply(malformed)).toThrow(InvalidExternalReplyError);
  });
});

const VALID_AGENT_REPLY_JSON = JSON.stringify({
  updated_trip: {
    title: "Rome trip",
    dates: "Mon-Fri",
    days: [{ dayNum: 1, activities: [], checklist: [] }],
  },
  agent_reply: "Added the museum to day 1!",
});

describe("parseExternalAgentReply", () => {
  it("parses the updated trip and the conversational reply", () => {
    const turn = parseExternalAgentReply(VALID_AGENT_REPLY_JSON);
    expect(turn.updatedTrip.title).toBe("Rome trip");
    expect(turn.agentReply).toBe("Added the museum to day 1!");
  });

  it("strips a ```json ... ``` fence, which most chat apps add even when told not to", () => {
    const fenced = "```json\n" + VALID_AGENT_REPLY_JSON + "\n```";
    const turn = parseExternalAgentReply(fenced);
    expect(turn.agentReply).toBe("Added the museum to day 1!");
  });

  it("throws InvalidExternalReplyError for text that isn't JSON", () => {
    expect(() => parseExternalAgentReply("Sure, I added it!")).toThrow(InvalidExternalReplyError);
  });

  it("throws InvalidExternalReplyError when agent_reply is missing", () => {
    const malformed = JSON.stringify({
      updated_trip: { title: "x", dates: "y", days: [] },
    });
    expect(() => parseExternalAgentReply(malformed)).toThrow(InvalidExternalReplyError);
  });

  it("throws InvalidExternalReplyError when updated_trip isn't shaped like a trip", () => {
    const malformed = JSON.stringify({ updated_trip: { hello: "world" }, agent_reply: "hi" });
    expect(() => parseExternalAgentReply(malformed)).toThrow(InvalidExternalReplyError);
  });
});
