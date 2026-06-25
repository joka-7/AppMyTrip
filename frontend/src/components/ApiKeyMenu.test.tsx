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
    expect(localStorage.getItem("tripweaver_api_key")).toBe("my-test-key");
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

  it("clears a previously saved key", () => {
    localStorage.setItem("tripweaver_api_key", "existing-key");
    localStorage.setItem("tripweaver_api_provider", "groq");
    render(<ApiKeyMenu />);

    fireEvent.click(screen.getByRole("button", { name: /מפתח API מוגדר/ }));
    fireEvent.click(screen.getByRole("button", { name: /הסרה/ }));

    expect(screen.getByRole("button", { name: /הגדרת מפתח API/ })).toBeInTheDocument();
    expect(localStorage.getItem("tripweaver_api_key")).toBeNull();
    expect(localStorage.getItem("tripweaver_api_provider")).toBeNull();
  });
});
