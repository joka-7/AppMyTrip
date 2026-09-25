import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BuilderStep2 from "./BuilderStep2";
import type { TripData } from "../api";

const VALID_TRIP_JSON = JSON.stringify({
  title: "Rome trip",
  dates: "Mon-Fri",
  days: [{ dayNum: 1, activities: [], checklist: [] }],
});

const sampleTrip: TripData = {
  title: "Rome trip",
  dates: "Mon-Fri",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "a1",
          time: "09:00",
          title: "Colosseum",
          desc: "Ancient amphitheater",
          type: "attraction",
          map_coordinates: { lat: 41.89, lng: 12.49 },
        },
      ],
    },
  ],
};

function baseProps(overrides: Partial<Parameters<typeof BuilderStep2>[0]> = {}) {
  return {
    tripData: sampleTrip,
    onSubmit: vi.fn(),
    onSkip: vi.fn(),
    onBack: vi.fn(),
    isEnhancing: false,
    aiMode: "apiKey" as const,
    onExternalReplyParsed: vi.fn(),
    ...overrides,
  };
}

describe("BuilderStep2 — apiKey mode", () => {
  it("skips straight through when nothing is selected", () => {
    const onSkip = vi.fn();
    render(<BuilderStep2 {...baseProps({ onSkip })} />);
    fireEvent.click(screen.getByRole("button", { name: /דלג, המשך לסוכן/ }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });

  it("submits the selected options to the backend and hides the external-AI section", () => {
    const onSubmit = vi.fn();
    render(<BuilderStep2 {...baseProps({ onSubmit })} />);
    fireEvent.click(screen.getByText("הוספת מחירים משוערים"));
    fireEvent.click(screen.getByRole("button", { name: /הוסף את הפרטים שנבחרו/ }));
    expect(onSubmit).toHaveBeenCalledWith({ prices: true });
    expect(screen.queryByText("שליחה ל-AI חיצוני")).toBeNull();
  });
});

describe("BuilderStep2 — external AI mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("offers external AI chat links carrying the enrichment prompt once an option is selected", () => {
    render(<BuilderStep2 {...baseProps({ aiMode: "external" })} />);
    expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();

    fireEvent.click(screen.getByText("הוספת מחירים משוערים"));
    fireEvent.click(screen.getByRole("button", { name: "שליחה ל-AI חיצוני" }));

    const claudeLink = screen.getByRole("link", { name: "Claude" });
    const url = new URL(claudeLink.getAttribute("href")!);
    const question = url.searchParams.get("q")!;
    expect(question).toContain("Fill 'price' with the typical cost");
    expect(question).toContain('"title":"Rome trip"');
  });

  it("parses a pasted valid reply and hands it to onExternalReplyParsed", () => {
    const onExternalReplyParsed = vi.fn();
    render(<BuilderStep2 {...baseProps({ aiMode: "external", onExternalReplyParsed })} />);
    fireEvent.click(screen.getByText("הוספת מחירים משוערים"));

    fireEvent.change(screen.getByLabelText("הדביקו כאן את תשובת ה-AI"), {
      target: { value: VALID_TRIP_JSON },
    });
    fireEvent.click(screen.getByRole("button", { name: "השתמש בתשובה הזו" }));

    expect(onExternalReplyParsed).toHaveBeenCalledTimes(1);
    expect(onExternalReplyParsed.mock.calls[0][0].title).toBe("Rome trip");
  });

  it("shows an inline error for a reply that isn't a valid trip", () => {
    render(<BuilderStep2 {...baseProps({ aiMode: "external" })} />);
    fireEvent.click(screen.getByText("הוספת מחירים משוערים"));

    fireEvent.change(screen.getByLabelText("הדביקו כאן את תשובת ה-AI"), {
      target: { value: "not json at all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "השתמש בתשובה הזו" }));

    expect(screen.getByText(/זה לא נראה כמו טיול תקין עדיין/)).toBeInTheDocument();
  });

  it("leads with a one-click send to the saved favorite, with other apps a click away", () => {
    localStorage.setItem("tripweaver_ai_external_favorite", "claude");
    render(<BuilderStep2 {...baseProps({ aiMode: "external" })} />);
    fireEvent.click(screen.getByText("הוספת מחירים משוערים"));

    expect(screen.getByRole("button", { name: /שליחה ל-Claude/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "נסו אפליקציית AI אחרת" }));
    expect(screen.getByRole("link", { name: "Claude" })).toBeInTheDocument();
  });

  it("still skips straight through when nothing is selected", () => {
    const onSkip = vi.fn();
    render(<BuilderStep2 {...baseProps({ aiMode: "external", onSkip })} />);
    fireEvent.click(screen.getByRole("button", { name: /דלג, המשך לסוכן/ }));
    expect(onSkip).toHaveBeenCalledTimes(1);
  });
});
