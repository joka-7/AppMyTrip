import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import AiSettingsPanel from "./AiSettingsPanel";

describe("AiSettingsPanel — apiKey mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("adds a key for the provider the user picks", () => {
    render(<AiSettingsPanel />);
    fireEvent.change(screen.getByRole("combobox", { name: "מפתחות API משלכם" }), {
      target: { value: "anthropic" },
    });
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "my-test-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));

    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({
      anthropic: ["my-test-key"],
    });
    expect(localStorage.getItem("tripweaver_api_provider")).toBe("anthropic");
  });

  it("stores several keys for one provider", () => {
    render(<AiSettingsPanel />);
    const input = screen.getByPlaceholderText("API Key...");
    fireEvent.change(input, { target: { value: "key-1" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));
    fireEvent.change(input, { target: { value: "key-2" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));

    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({
      gemini: ["key-1", "key-2"],
    });
  });

  it("removes a saved key", () => {
    localStorage.setItem("tripweaver_api_keys", JSON.stringify({ gemini: ["key-to-remove"] }));
    render(<AiSettingsPanel />);
    fireEvent.click(screen.getByRole("button", { name: /הסרת מפתח/ }));
    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({});
  });

  it("toggles LLM key visibility", () => {
    render(<AiSettingsPanel />);
    const input = screen.getByPlaceholderText("API Key...");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: /הצגת המפתח/ }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: /הסתרת המפתח/ }));
    expect(input).toHaveAttribute("type", "password");
  });

  it("links newcomers to the AI glossary", () => {
    render(<AiSettingsPanel />);
    const link = screen.getByRole("link", {
      name: "חדשים בעולם סוכני ה-AI? מה זה פרומפט, מודל או מפתח API?",
    });
    expect(link).toHaveAttribute(
      "href",
      "https://joka-7.github.io/ModelDispatcher/ai-glossary.html",
    );
  });
});

describe("AiSettingsPanel — mode toggle", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to apiKey mode and persists a switch to external", () => {
    render(<AiSettingsPanel />);
    expect(screen.getByRole("tab", { name: "מפתח API" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "AI חיצוני" }));
    expect(localStorage.getItem("tripweaver_ai_mode")).toBe("external");
    expect(screen.queryByPlaceholderText("API Key...")).toBeNull();
  });

  it("offers links to the free external AI chat apps in external mode", () => {
    render(<AiSettingsPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "AI חיצוני" }));

    const claudeLink = screen.getByRole("link", { name: "Claude" });
    expect(claudeLink).toHaveAttribute("href", "https://claude.ai/new");
    expect(claudeLink).toHaveAttribute("target", "_blank");
    expect(screen.getByRole("link", { name: "ChatGPT" })).toBeInTheDocument();
  });

  it("also offers a free API key as an alternative, for a new AI user", () => {
    render(<AiSettingsPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "AI חיצוני" }));

    const geminiKeyLink = screen.getByRole("link", { name: "קבלת מפתח API חינמי של Gemini" });
    expect(geminiKeyLink).toHaveAttribute("href", "https://aistudio.google.com/apikey");
  });
});
