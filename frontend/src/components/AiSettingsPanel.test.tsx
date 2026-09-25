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

  it("defaults the backend selector to legacy and persists a change", () => {
    render(<AiSettingsPanel />);
    const backendSelect = screen.getByRole("combobox", { name: "מנוע השרת" });
    expect(backendSelect).toHaveValue("legacy");

    fireEvent.change(backendSelect, { target: { value: "model_dispatcher" } });
    expect(backendSelect).toHaveValue("model_dispatcher");
    expect(localStorage.getItem("tripweaver_backend")).toBe("model_dispatcher");
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
});

describe("AiSettingsPanel — mode toggle and external favorite", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("defaults to apiKey mode and persists a switch to external", () => {
    render(<AiSettingsPanel />);
    expect(screen.getByRole("tab", { name: "מפתח API" })).toHaveAttribute("aria-selected", "true");

    fireEvent.click(screen.getByRole("tab", { name: "AI חיצוני" }));
    expect(localStorage.getItem("tripweaver_ai_mode")).toBe("external");
    expect(screen.queryByPlaceholderText("API Key...")).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "אפליקציית AI מועדפת" })).toBeInTheDocument();
  });

  it("saves the chosen favorite and reselects it across remounts", () => {
    const { unmount } = render(<AiSettingsPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "AI חיצוני" }));
    fireEvent.click(screen.getByRole("radio", { name: "Claude" }));

    expect(localStorage.getItem("tripweaver_ai_external_favorite")).toBe("claude");
    unmount();

    render(<AiSettingsPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "AI חיצוני" }));
    expect(screen.getByRole("radio", { name: "Claude" })).toBeChecked();
  });

  it('defaults the favorite to "ask me each time"', () => {
    render(<AiSettingsPanel />);
    fireEvent.click(screen.getByRole("tab", { name: "AI חיצוני" }));
    expect(screen.getByRole("radio", { name: "בכל פעם תבחרו בעצמכם" })).toBeChecked();
  });
});
