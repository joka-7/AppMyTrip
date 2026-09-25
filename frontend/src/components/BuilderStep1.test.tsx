import { describe, it, expect, vi } from "vitest";
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
    hasAnyApiKey: true,
    onExternalReplyParsed: vi.fn(),
    ...overrides,
  };
}

describe("BuilderStep1 — no-key escape hatch", () => {
  it("is hidden once any provider has a saved key", () => {
    render(<BuilderStep1 {...baseProps({ hasAnyApiKey: true })} />);
    expect(screen.queryByText("עדיין אין לכם מפתח API?")).toBeNull();
  });

  it("is hidden until the user has typed some trip text", () => {
    render(<BuilderStep1 {...baseProps({ hasAnyApiKey: false, rawText: "" })} />);
    expect(screen.queryByText("עדיין אין לכם מפתח API?")).toBeNull();
  });

  it("offers external AI chat links carrying the full parse prompt", () => {
    render(<BuilderStep1 {...baseProps({ hasAnyApiKey: false })} />);
    const claudeLink = screen.getByRole("link", { name: "Claude" });
    const url = new URL(claudeLink.getAttribute("href")!);
    const question = url.searchParams.get("q")!;
    expect(question).toContain("We're flying to Rome on Sunday");
    expect(question).toContain('"title":"TripData"');
  });

  it("parses a pasted valid reply and hands it to onExternalReplyParsed", () => {
    const onExternalReplyParsed = vi.fn();
    render(<BuilderStep1 {...baseProps({ hasAnyApiKey: false, onExternalReplyParsed })} />);

    fireEvent.change(screen.getByLabelText("הדביקו כאן את תשובת ה-AI"), {
      target: { value: VALID_TRIP_JSON },
    });
    fireEvent.click(screen.getByRole("button", { name: "השתמש בתשובה הזו" }));

    expect(onExternalReplyParsed).toHaveBeenCalledTimes(1);
    expect(onExternalReplyParsed.mock.calls[0][0].title).toBe("Rome trip");
  });

  it("shows an inline error for a reply that isn't a valid trip", () => {
    const onExternalReplyParsed = vi.fn();
    render(<BuilderStep1 {...baseProps({ hasAnyApiKey: false, onExternalReplyParsed })} />);

    fireEvent.change(screen.getByLabelText("הדביקו כאן את תשובת ה-AI"), {
      target: { value: "not json at all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "השתמש בתשובה הזו" }));

    expect(onExternalReplyParsed).not.toHaveBeenCalled();
    expect(screen.getByText(/זה לא נראה כמו טיול תקין עדיין/)).toBeInTheDocument();
  });
});
