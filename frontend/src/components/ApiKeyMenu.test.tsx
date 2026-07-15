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
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "anthropic" } });
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

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "groq" } });
    fireEvent.change(screen.getByPlaceholderText("API Key..."), { target: { value: "groq-key" } });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח" }));

    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({
      gemini: ["gemini-key"],
      groq: ["groq-key"],
    });
  });

  it("removes a saved key", () => {
    localStorage.setItem("tripweaver_api_keys", JSON.stringify({ gemini: ["key-to-remove"] }));
    render(<ApiKeyMenu />);
    openMenu();

    fireEvent.click(screen.getByRole("button", { name: /הסרת מפתח/ }));
    expect(screen.getByRole("button", { name: /הגדרת מפתח API/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({});
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

  it("adds and removes optional Google Maps keys separately from the LLM keys", () => {
    render(<ApiKeyMenu />);
    openMenu();

    fireEvent.change(screen.getByPlaceholderText("Google Maps API Key..."), {
      target: { value: "maps-key-123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספת מפתח Google Maps" }));
    expect(JSON.parse(localStorage.getItem("tripweaver_google_maps_keys") ?? "[]")).toEqual([
      "maps-key-123",
    ]);
    // The LLM key store is untouched by the Maps key.
    expect(localStorage.getItem("tripweaver_api_keys")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /הסרת מפתח/ }));
    expect(localStorage.getItem("tripweaver_google_maps_keys")).toBeNull();
  });
});
