import type { Page } from "@playwright/test";

/** What the fake AI provider answers for each kind of call tripAi.ts makes. */
export interface MockAiReplies {
  /** The trip a parse call returns, or "fail" to make the provider unreachable. */
  parse?: object | "fail";
  /** The whole-trip chat turn's reply. */
  agent?: { trip: object; reply: string };
}

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

const chatCompletion = (content: object) => ({
  choices: [{ message: { role: "assistant", content: JSON.stringify(content) } }],
});

/**
 * Saves a (fake) Groq key and answers Groq's API in place of the provider, so
 * the flow is deterministic and needs no real key or network access. The app
 * calls the provider straight from the browser (src/services/tripAi.ts), so
 * this is the only network boundary there is to fake.
 */
export async function mockAi(page: Page, replies: MockAiReplies): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("tripweaver_api_keys", JSON.stringify({ groq: ["e2e-fake-key"] }));
    localStorage.setItem("tripweaver_api_provider", "groq");
  });
  await page.route(GROQ_URL, async (route) => {
    const body = route.request().postDataJSON() as {
      messages: { role: string; content: string }[];
    };
    const system = body.messages.find((m) => m.role === "system")?.content ?? "";
    if (system.includes("parse the user's free text")) {
      if (replies.parse === "fail" || !replies.parse) return route.abort("failed");
      return route.fulfill({ json: chatCompletion(replies.parse) });
    }
    if (system.includes("triaging")) {
      return route.fulfill({ json: chatCompletion({ action: "general", day_numbers: [] }) });
    }
    if (replies.agent) {
      return route.fulfill({
        json: chatCompletion({
          updated_trip: replies.agent.trip,
          agent_reply: replies.agent.reply,
        }),
      });
    }
    return route.abort("failed");
  });
}
