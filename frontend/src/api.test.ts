import { describe, it, expect, vi, beforeEach } from "vitest";
import { parseTrip, agentInteract, generateMedia, API_BASE_URL } from "./api";
import type { TripData } from "./api";

const sampleTrip: TripData = {
  title: "Trip",
  dates: "Mon - Tue",
  days: [{ dayNum: 1, activities: [] }],
};

const fetchMock = vi.fn<typeof fetch>();

describe("api client", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("parseTrip posts raw text to /api/trip/parse and returns the parsed response", async () => {
    const responseBody = { trip_data: sampleTrip, initial_agent_message: "hi" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    } as Response);

    const result = await parseTrip("some trip text");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/trip/parse`,
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raw_text: "some trip text",
          preferences: null,
          api_keys: null,
          provider: null,
        }),
      }),
    );
    expect(result).toEqual(responseBody);
  });

  it("parseTrip threads an explicit preferences string through to the request body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ trip_data: sampleTrip, initial_agent_message: null }),
    } as Response);

    await parseTrip("some trip text", "Vegan");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/trip/parse`,
      expect.objectContaining({
        body: JSON.stringify({
          raw_text: "some trip text",
          preferences: "Vegan",
          api_keys: null,
          provider: null,
        }),
      }),
    );
  });

  it("parseTrip threads the caller's own API keys + provider through to the request body", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ trip_data: sampleTrip, initial_agent_message: null }),
    } as Response);

    await parseTrip("some trip text", null, ["claude-key-a", "claude-key-b"], "anthropic");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/trip/parse`,
      expect.objectContaining({
        body: JSON.stringify({
          raw_text: "some trip text",
          preferences: null,
          api_keys: ["claude-key-a", "claude-key-b"],
          provider: "anthropic",
        }),
      }),
    );
  });

  it("agentInteract posts trip data + message to /api/trip/agent", async () => {
    const responseBody = { trip_data: sampleTrip, agent_reply: "ok" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    } as Response);

    const result = await agentInteract(sampleTrip, "add food");

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/trip/agent`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          trip_data: sampleTrip,
          user_message: "add food",
          preferences: null,
          api_keys: null,
          provider: null,
        }),
      }),
    );
    expect(result).toEqual(responseBody);
  });

  it("generateMedia posts trip data to /api/trip/generate-media", async () => {
    const responseBody = { trip_data: sampleTrip, status: "ok" };
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => responseBody,
    } as Response);

    const result = await generateMedia(sampleTrip);

    expect(fetch).toHaveBeenCalledWith(
      `${API_BASE_URL}/api/trip/generate-media`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ trip_data: sampleTrip, user_message: "" }),
      }),
    );
    expect(result).toEqual(responseBody);
  });

  it("throws an Error when the response is not OK", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    } as Response);

    await expect(parseTrip("text")).rejects.toThrow(/API request failed \(502\)/);
  });
});
