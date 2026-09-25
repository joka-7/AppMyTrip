import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BuilderStep1 from "./BuilderStep1";

const VALID_TRIP_JSON = JSON.stringify({
  title: "Rome trip",
  dates: "Mon-Fri",
  days: [{ dayNum: 1, activities: [], checklist: [] }],
});

function baseProps(overrides: Partial<Parameters<typeof BuilderStep1>[0]> = {}) {
  return {
    rawText: "We're flying to Rome on Sunday",
    onChangeRawText: vi.fn(),
    preferences: "",
    onChangePreferences: vi.fn(),
    onSubmit: vi.fn(),
    isProcessing: false,
    hasExistingTrip: false,
    onContinueWithoutReprocessing: vi.fn(),
    aiMode: "apiKey" as const,
    onExternalReplyParsed: vi.fn(),
    ...overrides,
  };
}

describe("BuilderStep1 — apiKey mode", () => {
  it("submits to the backend and hides the external-AI section", () => {
    const onSubmit = vi.fn();
    render(<BuilderStep1 {...baseProps({ aiMode: "apiKey", onSubmit })} />);
    expect(screen.queryByText("שליחה ל-AI חיצוני")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe("BuilderStep1 — external AI mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("offers external AI chat links carrying the full parse prompt", () => {
    render(<BuilderStep1 {...baseProps({ aiMode: "external" })} />);
    const claudeLink = screen.getByRole("link", { name: "Claude" });
    const url = new URL(claudeLink.getAttribute("href")!);
    const question = url.searchParams.get("q")!;
    expect(question).toContain("We're flying to Rome on Sunday");
    expect(question).toContain('"title":"TripData"');
  });

  it("hides the chat links until the user has typed some trip text, but still shows the paste-back box", () => {
    render(<BuilderStep1 {...baseProps({ aiMode: "external", rawText: "" })} />);
    expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();
    expect(screen.getByLabelText("הדביקו כאן את תשובת ה-AI")).toBeInTheDocument();
  });

  it("parses a pasted valid reply and hands it to onExternalReplyParsed", () => {
    const onExternalReplyParsed = vi.fn();
    render(<BuilderStep1 {...baseProps({ aiMode: "external", onExternalReplyParsed })} />);

    fireEvent.change(screen.getByLabelText("הדביקו כאן את תשובת ה-AI"), {
      target: { value: VALID_TRIP_JSON },
    });
    fireEvent.click(screen.getByRole("button", { name: "השתמש בתשובה הזו" }));

    expect(onExternalReplyParsed).toHaveBeenCalledTimes(1);
    expect(onExternalReplyParsed.mock.calls[0][0].title).toBe("Rome trip");
  });

  it("shows an inline error for a reply that isn't a valid trip", () => {
    const onExternalReplyParsed = vi.fn();
    render(<BuilderStep1 {...baseProps({ aiMode: "external", onExternalReplyParsed })} />);

    fireEvent.change(screen.getByLabelText("הדביקו כאן את תשובת ה-AI"), {
      target: { value: "not json at all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "השתמש בתשובה הזו" }));

    expect(onExternalReplyParsed).not.toHaveBeenCalled();
    expect(screen.getByText(/זה לא נראה כמו טיול תקין עדיין/)).toBeInTheDocument();
  });

  it("leads with a one-click send to the saved favorite, with other apps a click away", () => {
    localStorage.setItem("tripweaver_ai_external_favorite", "claude");
    render(<BuilderStep1 {...baseProps({ aiMode: "external" })} />);

    expect(screen.getByRole("button", { name: /שליחה ל-Claude/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "נסו אפליקציית AI אחרת" }));
    expect(screen.getByRole("link", { name: "Claude" })).toBeInTheDocument();
  });
});
