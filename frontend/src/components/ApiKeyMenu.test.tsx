import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ApiKeyMenu from "./ApiKeyMenu";

function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: /הגדרת מפתח API|מפתח API מוגדר/ }));
}

describe("ApiKeyMenu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an unconfigured state and adds a key for the provider the user picks", () => {
    render(<ApiKeyMenu />);
    expect(screen.getByRole("button", { name: /הגדרת מפתח API/ })).toBeInTheDocument();

    openMenu();
    fireEvent.change(screen.getByRole("combobox", { name: "מפתחות API משלכם" }), {
      target: { value: "anthropic" },
    });
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "my-test-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));

    expect(screen.getByRole("button", { name: /מפתח API מוגדר/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({
      anthropic: ["my-test-key"],
    });
    expect(localStorage.getItem("tripweaver_api_provider")).toBe("anthropic");
  });

  it("defaults to the Gemini provider when none was previously chosen", () => {
    render(<ApiKeyMenu />);
    openMenu();
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "my-gemini-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));

    expect(localStorage.getItem("tripweaver_api_provider")).toBe("gemini");
  });

  it("stores several keys for one provider and shows the count on the button", () => {
    render(<ApiKeyMenu />);
    openMenu();
    const input = screen.getByPlaceholderText("API Key...");
    fireEvent.change(input, { target: { value: "key-1" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));
    fireEvent.change(input, { target: { value: "key-2" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));

    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({
      gemini: ["key-1", "key-2"],
    });
    expect(screen.getByRole("button", { name: /מפתח API מוגדר \(2\)/ })).toBeInTheDocument();
  });

  it("keeps each provider's keys separate when switching providers", () => {
    render(<ApiKeyMenu />);
    openMenu();
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "gemini-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));

    fireEvent.change(screen.getByRole("combobox", { name: "מפתחות API משלכם" }), {
      target: { value: "groq" },
    });
    fireEvent.change(screen.getByPlaceholderText("API Key..."), { target: { value: "groq-key" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));

    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({
      gemini: ["gemini-key"],
      groq: ["groq-key"],
    });
  });

  it("adding a backup key for another provider doesn't bump the active one", () => {
    render(<ApiKeyMenu />);
    openMenu();
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "gemini-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));
    expect(localStorage.getItem("tripweaver_api_provider")).toBe("gemini");

    // Just browsing to another provider (without adding a key) must not
    // change the active provider either.
    fireEvent.change(screen.getByRole("combobox", { name: "מפתחות API משלכם" }), {
      target: { value: "openrouter" },
    });
    expect(localStorage.getItem("tripweaver_api_provider")).toBe("gemini");

    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "openrouter-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));
    expect(localStorage.getItem("tripweaver_api_provider")).toBe("gemini");

    // The user can still explicitly promote a different provider.
    fireEvent.click(screen.getByRole("button", { name: "הפוך לספק הראשי" }));
    expect(localStorage.getItem("tripweaver_api_provider")).toBe("openrouter");
  });

  it("removes a saved key", () => {
    localStorage.setItem("tripweaver_api_keys", JSON.stringify({ gemini: ["key-to-remove"] }));
    render(<ApiKeyMenu />);
    openMenu();

    fireEvent.click(screen.getByRole("button", { name: /הסרת מפתח/ }));
    expect(screen.getByRole("button", { name: /הגדרת מפתח API/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({});
  });

  it("defaults the backend selector to legacy and persists a change", () => {
    render(<ApiKeyMenu />);
    openMenu();
    const backendSelect = screen.getByRole("combobox", { name: "מנוע השרת" });
    expect(backendSelect).toHaveValue("legacy");

    fireEvent.change(backendSelect, { target: { value: "model_dispatcher" } });
    expect(backendSelect).toHaveValue("model_dispatcher");
    expect(localStorage.getItem("tripweaver_backend")).toBe("model_dispatcher");
  });

  it("remembers a previously chosen backend across remounts", () => {
    localStorage.setItem("tripweaver_backend", "model_dispatcher");
    render(<ApiKeyMenu />);
    openMenu();
    expect(screen.getByRole("combobox", { name: "מנוע השרת" })).toHaveValue("model_dispatcher");
  });

  it("toggles LLM key visibility", () => {
    render(<ApiKeyMenu />);
    openMenu();
    const input = screen.getByPlaceholderText("API Key...");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: /הצגת המפתח/ }));
    expect(input).toHaveAttribute("type", "text");
    fireEvent.click(screen.getByRole("button", { name: /הסתרת המפתח/ }));
    expect(input).toHaveAttribute("type", "password");
  });
});
