import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ApiKeyMenu from "./ApiKeyMenu";

describe("ApiKeyMenu", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("shows an unconfigured state and saves a key + provider the user picks", () => {
    render(<ApiKeyMenu />);

    expect(screen.getByRole("button", { name: /הגדרת מפתח API/ })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /הגדרת מפתח API/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "anthropic" } });
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "my-test-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));

    expect(screen.getByRole("button", { name: /מפתח API מוגדר/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({
      anthropic: "my-test-key",
    });
    expect(localStorage.getItem("tripweaver_api_provider")).toBe("anthropic");
  });

  it("defaults to the Gemini provider when none was previously chosen", () => {
    render(<ApiKeyMenu />);

    fireEvent.click(screen.getByRole("button", { name: /הגדרת מפתח API/ }));
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "my-gemini-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));

    expect(localStorage.getItem("tripweaver_api_provider")).toBe("gemini");
  });

  it("keeps each provider's key separate when switching providers", () => {
    render(<ApiKeyMenu />);

    fireEvent.click(screen.getByRole("button", { name: /הגדרת מפתח API/ }));
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "gemini-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));

    fireEvent.click(screen.getByRole("button", { name: /מפתח API מוגדר/ }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "groq" } });
    // Switching provider shouldn't show the gemini key as if it belonged to groq.
    expect(screen.getByPlaceholderText("API Key...")).toHaveValue("");
    fireEvent.change(screen.getByPlaceholderText("API Key..."), {
      target: { value: "groq-key" },
    });
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));

    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({
      gemini: "gemini-key",
      groq: "groq-key",
    });
  });

  it("clears a previously saved key", () => {
    localStorage.setItem("tripweaver_api_keys", JSON.stringify({ groq: "existing-key" }));
    localStorage.setItem("tripweaver_api_provider", "groq");
    render(<ApiKeyMenu />);

    fireEvent.click(screen.getByRole("button", { name: /מפתח API מוגדר/ }));
    fireEvent.click(screen.getByRole("button", { name: /הסרה/ }));

    expect(screen.getByRole("button", { name: /הגדרת מפתח API/ })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem("tripweaver_api_keys") ?? "{}")).toEqual({});
  });

  it("toggles key visibility", () => {
    render(<ApiKeyMenu />);
    fireEvent.click(screen.getByRole("button", { name: /הגדרת מפתח API/ }));

    const input = screen.getByPlaceholderText("API Key...");
    expect(input).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: /הצגת המפתח/ }));
    expect(input).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: /הסתרת המפתח/ }));
    expect(input).toHaveAttribute("type", "password");
  });
});
