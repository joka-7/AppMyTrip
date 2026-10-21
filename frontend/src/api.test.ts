import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AgentConfig } from "modeldispatcher-browser-agent";

const dispatcher = vi.hoisted(() => ({ complete: vi.fn() }));
vi.mock("modeldispatcher-browser-agent", async (importOriginal) => ({
  ...(await importOriginal<typeof import("modeldispatcher-browser-agent")>()),
  complete: dispatcher.complete,
}));

import { agentInteract, enhanceTrip, parseTrip } from "./api";
import type { TripData } from "./api";

const trip: TripData = {
  title: "Trip",
  dates: "Mon - Tue",
  language: "en",
  days: [{ dayNum: 1, activities: [] }],
};
const CREDENTIALS = [
  { provider: "groq", api_keys: ["g1"] },
  { provider: "gemini", api_keys: ["k1", "k2"] },
];

describe("api", () => {
  const fetchMock = vi.fn<typeof fetch>();

  beforeEach(() => {
    dispatcher.complete.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  it("parseTrip calls the user's providers directly, in order, and never an app server", async () => {
    dispatcher.complete.mockResolvedValue(JSON.stringify(trip));

    const result = await parseTrip("two days in Rome", null, CREDENTIALS);

    const cfg = dispatcher.complete.mock.calls[0]?.[0] as AgentConfig;
    expect(cfg.providers.map((p) => [p.provider, p.apiKeys])).toEqual([
      ["groq", ["g1"]],
      ["gemini", ["k1", "k2"]],
    ]);
    expect(result).toEqual({
      trip_data: expect.objectContaining({ title: "Trip" }),
      initial_agent_message: null,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("agentInteract returns the updated trip and the agent's reply", async () => {
    dispatcher.complete.mockResolvedValue(
      JSON.stringify({ updated_trip: { ...trip, title: "Renamed" }, agent_reply: "Renamed it" }),
    );

    const result = await agentInteract(trip, "rename the trip", null, CREDENTIALS);

    expect(result.trip_data.title).toBe("Renamed");
    expect(result.agent_reply).toBe("Renamed it");
  });

  it("enhanceTrip returns the trip with the requested extras", async () => {
    const withStop: TripData = {
      ...trip,
      days: [
        {
          dayNum: 1,
          activities: [
            {
              id: "a",
              time: "",
              title: "Museum",
              desc: "",
              type: "attraction",
              map_coordinates: { lat: 1, lng: 1 },
            },
          ],
        },
      ],
    };
    const priced = structuredClone(withStop);
    priced.days[0]!.activities[0]!.price = 15;
    dispatcher.complete.mockResolvedValue(JSON.stringify(priced));

    const result = await enhanceTrip(withStop, { prices: true }, CREDENTIALS);

    expect(result.trip_data.days[0]?.activities[0]?.price).toBe(15);
  });
});
