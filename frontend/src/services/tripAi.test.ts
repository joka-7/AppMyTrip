import { describe, it, expect } from "vitest";
import {
  AllProvidersExhaustedError,
  NoProviderConfiguredError,
} from "modeldispatcher-browser-agent";
import type { AgentConfig, RequestOptions } from "modeldispatcher-browser-agent";
import type { Activity, TripData } from "../api";
import {
  ApiError,
  agentConfigFrom,
  createTripAi,
  detectDayNumbers,
  extractJson,
  looksTruncated,
  mentionsAddingADay,
  mentionsDeletion,
  sanitizeTrip,
  type CompleteFn,
} from "./tripAi";

const CFG: AgentConfig = {
  providers: [{ provider: "gemini", model: "gemini-2.5-flash", apiKeys: ["k"] }],
  ollamaUrl: "",
};

const act = (id: string, extra: Partial<Activity> = {}): Activity => ({
  id,
  time: "10:00",
  title: `Stop ${id}`,
  desc: "",
  type: "attraction",
  map_coordinates: { lat: 1, lng: 2 },
  ...extra,
});

/** A trip of `days` days with `perDay` activities each, ids "d<day>a<n>". */
const tripOf = (days: number, perDay = 1): TripData => ({
  title: "Trip",
  dates: "",
  language: "en",
  days: Array.from({ length: days }, (_, d) => ({
    dayNum: d + 1,
    activities: Array.from({ length: perDay }, (_, a) => act(`d${d + 1}a${a + 1}`)),
  })),
});

interface Call {
  system: string;
  prompt: string;
  options: RequestOptions | undefined;
}

/** A fake AI: answers each call from `reply(system, prompt)`, recording every call. */
function fakeAi(reply: (system: string, prompt: string) => unknown) {
  const calls: Call[] = [];
  const complete: CompleteFn = async (_cfg, prompt, options) => {
    const system = options?.systemInstruction ?? "";
    calls.push({ system, prompt, options });
    const answer = reply(system, prompt);
    if (answer instanceof Error) throw answer;
    return typeof answer === "string" ? answer : JSON.stringify(answer);
  };
  return { ai: createTripAi({ complete }), calls };
}

const isTriage = (system: string) => system.includes("triaging");
const isScoped = (system: string) => system.includes("editing specific day");
const isAddDays = (system: string) => system.includes("adding brand-new day");

describe("detectDayNumbers", () => {
  it.each([
    ["add day 8 - a hike", [8]],
    ["הוסף עוד יום (8) - הטרק האלפיני", [8]],
    ["תוסיף ליום 8 - 10:00 – 15:00 – הטרק", [8]],
    ["jour 8 - randonnée", [8]],
    ["rename the museum", []],
    ["the last day of the trip", []],
    ["day 3 and day 5, swap them", [3, 5]],
  ])("%s -> %j", (message, expected) => {
    expect(detectDayNumbers(message)).toEqual(expected);
  });
});

describe("mentionsAddingADay", () => {
  it.each([
    ["add another day", true],
    ["add a day", true],
    ["add one more day", true],
    ["add 2 more days", true],
    ["הוסף עוד יום", true],
    ["הוסיפו עוד יום, יום רגיעה ליד האגם", true],
    ["תוסיף עוד יום", true],
    ["ajoutez un jour", true],
    ["add a restaurant", false],
    ["add a stop to the day", false],
    ["הוסף פעילות ליום", false],
    ["הוסף תמונות לכל יום", false],
    ["add photos to every day", false],
    ["add photos today", false],
    ["הוסף עצירה היום", false],
    ["rename the museum", false],
  ])("%s -> %s", (message, expected) => {
    expect(mentionsAddingADay(message)).toBe(expected);
  });
});

describe("mentionsDeletion", () => {
  it.each([
    ["please remove the museum", true],
    ["I already removed my suitcase from the list", false],
    ["this is unrelated text", false],
    ["من فضلك ألغِ هذا", true],
    ["कृपया हटाना इसे", true],
    ["请删除这个活动", true],
    ["これを削除してください", true],
    ["이것을 삭제해주세요", true],
    ["Supprime tous les jours sauf le premier", true],
    ["תמחק את היום השני", true],
  ])("%s -> %s", (message, expected) => {
    expect(mentionsDeletion(message)).toBe(expected);
  });
});

describe("looksTruncated", () => {
  const nineDays = tripOf(9);
  const oneDay = tripOf(1);
  it.each([
    [
      "a reply that collapses 9 days to 1, unasked",
      nineDays,
      oneDay,
      "I removed my suitcase already",
      true,
    ],
    [
      "the same collapse when the user asked to delete",
      nineDays,
      oneDay,
      "please remove everything",
      false,
    ],
    ["a small trip, where any drop is plausible", tripOf(5), oneDay, "shorten it", false],
    ["a reply that keeps most of the trip", nineDays, tripOf(8), "shorten it", false],
  ])("%s -> %s", (_label, before, after, message, expected) => {
    expect(looksTruncated(before, after, message)).toBe(expected);
  });
});

describe("extractJson", () => {
  it.each([
    ['{"a":1}', { a: 1 }],
    ['```json\n{"a":1}\n```', { a: 1 }],
    ['Sure! Here it is: {"a":1} Enjoy.', { a: 1 }],
  ])("parses %j", (text, expected) => {
    expect(extractJson(text)).toEqual(expected);
  });

  it.each(["no json here", "{ not json }"])("rejects %j with a 422", (text) => {
    expect(() => extractJson(text)).toThrow(expect.objectContaining({ status: 422 }));
  });
});

describe("sanitizeTrip", () => {
  it("coerces an untrusted reply into a well-formed trip", () => {
    const trip = sanitizeTrip({
      title: "T",
      days: [
        {
          activities: [
            {
              id: "x",
              title: "Museum",
              type: "sightseeing",
              travel_mode: "teleport",
              map_coordinates: { lat: 300, lng: 2 },
              price: "cheap",
              podcast_url: "https://evil.example/a.mp3",
              extra: "dropped",
            },
            "not an activity",
          ],
        },
        "not a day",
      ],
    });
    expect(trip.days).toHaveLength(1);
    expect(trip.days[0].dayNum).toBe(1);
    expect(trip.days[0].activities).toEqual([
      expect.objectContaining({
        id: "x",
        type: "attraction",
        travel_mode: null,
        map_coordinates: null,
        price: null,
        podcast_url: null,
      }),
    ]);
    expect(trip.days[0].activities[0]).not.toHaveProperty("extra");
    expect(trip.language).toBe("he");
  });

  it.each([null, "trip", [], { title: "no days" }])("rejects %j with a 422", (value) => {
    expect(() => sanitizeTrip(value)).toThrow(expect.objectContaining({ status: 422 }));
  });
});

describe("agentConfigFrom", () => {
  it("keeps supported providers with keys, in order, with their trip model", () => {
    const cfg = agentConfigFrom([
      { provider: "groq", api_keys: ["g1", "g2"] },
      { provider: "openrouter", api_keys: ["o"] },
      { provider: "openai", api_keys: [] },
      { provider: "anthropic", api_keys: ["a"] },
    ]);
    expect(cfg.providers).toEqual([
      { provider: "groq", model: "openai/gpt-oss-120b", apiKeys: ["g1", "g2"] },
      { provider: "anthropic", model: "claude-sonnet-4-5-20250929", apiKeys: ["a"] },
    ]);
  });
});

describe("createTripAi().parseTripText", () => {
  it("asks for JSON with the schema and returns the sanitised trip", async () => {
    const { ai, calls } = fakeAi(() => ({ title: "Rome", dates: "", language: "en", days: [] }));
    const trip = await ai.parseTripText("3 days in Rome", "Vegan", CFG);
    expect(trip.title).toBe("Rome");
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toEqual(expect.objectContaining({ jsonMode: true }));
    expect(calls[0].system).toContain("IMPORTANT: Vegan");
    expect(calls[0].prompt).toContain("3 days in Rome");
  });

  it.each([
    ["no provider configured", new NoProviderConfiguredError(), 401],
    [
      "every key rate-limited",
      new AllProvidersExhaustedError([{ provider: "gemini", error: "HTTP 429 Too Many Requests" }]),
      429,
    ],
    [
      "every key rejected",
      new AllProvidersExhaustedError([{ provider: "gemini", error: "HTTP 401 Unauthorized" }]),
      401,
    ],
    [
      "providers failing differently",
      new AllProvidersExhaustedError([
        { provider: "gemini", error: "HTTP 429" },
        { provider: "groq", error: "HTTP 500" },
      ]),
      502,
    ],
    ["an unexpected failure", new TypeError("Failed to fetch"), 502],
  ])("maps %s to %i", async (_label, failure, status) => {
    const { ai } = fakeAi(() => failure);
    await expect(ai.parseTripText("x", null, CFG)).rejects.toEqual(
      expect.objectContaining({ status }),
    );
  });

  it("names the failing provider in a 502's detail", async () => {
    const { ai } = fakeAi(
      () => new AllProvidersExhaustedError([{ provider: "groq", error: "HTTP 500 boom" }]),
    );
    const err = await ai.parseTripText("x", null, CFG).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).detail).toContain("groq: HTTP 500 boom");
  });
});

describe("createTripAi().agentTurn", () => {
  it("edits only the day a message names, leaving the others untouched", async () => {
    const trip = tripOf(3);
    const { ai, calls } = fakeAi((system) =>
      isScoped(system)
        ? { days: [{ dayNum: 2, activities: [act("new")] }], agent_reply: "Changed day 2" }
        : new Error("unexpected call"),
    );
    const result = await ai.agentTurn(trip, "swap the museum on day 2", null, CFG);
    expect(result.reply).toBe("Changed day 2");
    expect(result.trip.days.map((d) => d.activities.map((a) => a.id))).toEqual([
      ["d1a1"],
      ["new"],
      ["d3a1"],
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].prompt).not.toContain("d1a1");
  });

  it("appends new days when the message asks to add a day", async () => {
    const { ai, calls } = fakeAi((system) =>
      isAddDays(system)
        ? { days: [{ dayNum: 3, activities: [act("lake")] }], agent_reply: "Added" }
        : new Error("unexpected call"),
    );
    const result = await ai.agentTurn(tripOf(2), "add another day by the lake", null, CFG);
    expect(result.trip.days.map((d) => d.dayNum)).toEqual([1, 2, 3]);
    expect(calls[0].system).toContain("starting from 3");
  });

  it("falls back to the whole-trip turn when a scoped reply is unusable", async () => {
    const { ai, calls } = fakeAi((system) => {
      if (isScoped(system)) return { days: [{ dayNum: 9, activities: [] }], agent_reply: "?" };
      return { updated_trip: tripOf(3), agent_reply: "Done via full turn" };
    });
    const result = await ai.agentTurn(tripOf(3), "change day 1", null, CFG);
    expect(result.reply).toBe("Done via full turn");
    expect(calls.map((c) => isScoped(c.system))).toEqual([true, false]);
  });

  it("classifies with a small call when the message names no day, and treats a failed triage as general", async () => {
    const { ai, calls } = fakeAi((system) =>
      isTriage(system) ? "not json" : { updated_trip: tripOf(2), agent_reply: "" },
    );
    const result = await ai.agentTurn(tripOf(2), "make it more relaxed", null, CFG);
    expect(calls[0].options?.maxTokens).toBe(1024);
    // A missing reply keeps the edit and says so in the trip's language.
    expect(result.reply).toBe("Done!");
  });

  it("does not retry a provider failure through the whole-trip turn", async () => {
    const { ai, calls } = fakeAi(() => new NoProviderConfiguredError());
    await expect(ai.agentTurn(tripOf(3), "change day 1", null, CFG)).rejects.toEqual(
      expect.objectContaining({ status: 401 }),
    );
    expect(calls).toHaveLength(1);
  });

  it("retries once, then rejects with 409, a reply that drops most of the trip", async () => {
    const { ai, calls } = fakeAi((system) =>
      isTriage(system)
        ? { action: "general", day_numbers: [] }
        : { updated_trip: tripOf(1), agent_reply: "Here you go" },
    );
    await expect(ai.agentTurn(tripOf(9), "make it nicer", null, CFG)).rejects.toEqual(
      expect.objectContaining({ status: 409 }),
    );
    expect(calls.filter((c) => !isTriage(c.system))).toHaveLength(2);
  });

  it("accepts a big drop the user asked for", async () => {
    const { ai } = fakeAi((system) =>
      isTriage(system)
        ? { action: "general", day_numbers: [] }
        : { updated_trip: tripOf(1), agent_reply: "Removed" },
    );
    const result = await ai.agentTurn(tripOf(9), "delete everything but one day", null, CFG);
    expect(result.trip.days).toHaveLength(1);
  });
});

describe("createTripAi().enhanceTrip", () => {
  it("writes back only each extra's own fields, never erasing existing values", async () => {
    const trip: TripData = {
      ...tripOf(1, 2),
      checklist: [{ id: "p", text: "Passport" }],
    };
    trip.days[0].activities[1] = act("d1a2", { map_coordinates: null, price: 7 });
    const { ai, calls } = fakeAi((system) => {
      const reply = structuredClone(trip);
      const [first, second] = reply.days[0].activities;
      if (system.includes("Fill 'price'")) {
        first.price = 12;
        first.title = "Renamed by the AI";
        second.price = null;
      }
      if (system.includes("map_coordinates' set to null")) {
        first.map_coordinates = { lat: 50, lng: 50 };
        second.map_coordinates = { lat: 3, lng: 4 };
      }
      return reply;
    });
    const result = await ai.enhanceTrip(trip, { prices: true }, CFG);
    const [first, second] = result.days[0].activities;
    expect(first.price).toBe(12);
    expect(first.title).toBe("Stop d1a1");
    expect(first.map_coordinates).toEqual({ lat: 1, lng: 2 });
    expect(second.map_coordinates).toEqual({ lat: 3, lng: 4 });
    expect(second.price).toBe(7);
    expect(calls).toHaveLength(2);
  });

  it("fills day checklists without wiping a trip checklist the reply left empty", async () => {
    const trip: TripData = { ...tripOf(1), checklist: [{ id: "p", text: "Passport" }] };
    const { ai } = fakeAi(() => {
      const reply = structuredClone(trip);
      reply.checklist = [];
      reply.days[0].checklist = [{ id: "b", text: "Boots" }];
      return reply;
    });
    const result = await ai.enhanceTrip(trip, { packing: true }, CFG);
    expect(result.checklist).toEqual([{ id: "p", text: "Passport" }]);
    expect(result.days[0].checklist).toEqual([{ id: "b", text: "Boots" }]);
  });

  it("keeps the extras that succeeded when another fails", async () => {
    const trip = tripOf(1);
    const { ai } = fakeAi((system) => {
      if (system.includes("Fill 'url'")) return new TypeError("Failed to fetch");
      const reply = structuredClone(trip);
      reply.days[0].activities[0].price = 5;
      return reply;
    });
    const result = await ai.enhanceTrip(trip, { prices: true, links: true }, CFG);
    expect(result.days[0].activities[0].price).toBe(5);
  });

  it("fails when every extra failed", async () => {
    const { ai } = fakeAi(() => new NoProviderConfiguredError());
    await expect(ai.enhanceTrip(tripOf(1), { prices: true }, CFG)).rejects.toEqual(
      expect.objectContaining({ status: 401 }),
    );
  });

  it("makes no call when nothing is selected and every activity has a location", async () => {
    const { ai, calls } = fakeAi(() => new Error("unexpected call"));
    const trip = tripOf(2);
    expect(await ai.enhanceTrip(trip, {}, CFG)).toBe(trip);
    expect(calls).toHaveLength(0);
  });
});
