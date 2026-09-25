import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import BuilderStep3 from "./BuilderStep3";
import type { TripData } from "../api";

const VALID_AGENT_REPLY_JSON = JSON.stringify({
  updated_trip: {
    title: "Rome trip",
    dates: "Mon-Fri",
    days: [{ dayNum: 1, activities: [], checklist: [] }],
  },
  agent_reply: "Added the museum to day 1!",
});

const sampleTrip: TripData = {
  title: "Rome trip",
  dates: "Mon-Fri",
  days: [{ dayNum: 1, activities: [] }],
};

function baseProps(overrides: Partial<Parameters<typeof BuilderStep3>[0]> = {}) {
  return {
    agentMessages: [],
    chatEndRef: { current: null },
    chatInput: "",
    onChangeChatInput: vi.fn(),
    onSendMessage: vi.fn(),
    isSendingMessage: false,
    chatNotice: null,
    onRetryChat: undefined,
    failedChatText: null,
    onContinue: vi.fn(),
    onBack: vi.fn(),
    isGeneratingMedia: false,
    tripData: sampleTrip,
    tripDates: "",
    onChangeTripDates: vi.fn(),
    preferences: "",
    aiMode: "apiKey" as const,
    onExternalTurnApplied: vi.fn(),
    ...overrides,
  };
}

describe("BuilderStep3 — apiKey mode", () => {
  it("hides the external-AI section", () => {
    render(<BuilderStep3 {...baseProps()} />);
    expect(screen.queryByText("שליחה ל-AI חיצוני")).toBeNull();
  });
});

describe("BuilderStep3 — external AI mode", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("prompts for text before offering anything to send", () => {
    render(<BuilderStep3 {...baseProps({ aiMode: "external", chatInput: "" })} />);
    expect(screen.getByText("הקלידו הודעה למעלה כדי לשלוח אותה ל-AI חיצוני.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();
  });

  it("offers external AI chat links carrying the current trip and message", () => {
    render(
      <BuilderStep3 {...baseProps({ aiMode: "external", chatInput: "Add a museum on day 1" })} />,
    );
    const claudeLink = screen.getByRole("link", { name: "Claude" });
    const url = new URL(claudeLink.getAttribute("href")!);
    const question = url.searchParams.get("q")!;
    expect(question).toContain("User Message: Add a museum on day 1");
    expect(question).toContain('"title":"Rome trip"');
  });

  it("parses a pasted valid reply, applies the turn, and clears the input", () => {
    const onExternalTurnApplied = vi.fn();
    const onChangeChatInput = vi.fn();
    render(
      <BuilderStep3
        {...baseProps({
          aiMode: "external",
          chatInput: "Add a museum on day 1",
          onExternalTurnApplied,
          onChangeChatInput,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("הדביקו כאן את תשובת ה-AI"), {
      target: { value: VALID_AGENT_REPLY_JSON },
    });
    fireEvent.click(screen.getByRole("button", { name: "השתמש בתשובה הזו" }));

    expect(onExternalTurnApplied).toHaveBeenCalledTimes(1);
    const [userMessage, turn] = onExternalTurnApplied.mock.calls[0];
    expect(userMessage).toBe("Add a museum on day 1");
    expect(turn.agentReply).toBe("Added the museum to day 1!");
    expect(turn.updatedTrip.title).toBe("Rome trip");
    expect(onChangeChatInput).toHaveBeenCalledWith("");
  });

  it("shows an inline error for a reply that isn't valid, and doesn't apply anything", () => {
    const onExternalTurnApplied = vi.fn();
    render(
      <BuilderStep3
        {...baseProps({
          aiMode: "external",
          chatInput: "Add a museum",
          onExternalTurnApplied,
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText("הדביקו כאן את תשובת ה-AI"), {
      target: { value: "not json at all" },
    });
    fireEvent.click(screen.getByRole("button", { name: "השתמש בתשובה הזו" }));

    expect(onExternalTurnApplied).not.toHaveBeenCalled();
    expect(screen.getByText(/זה לא נראה כמו תשובה תקינה עדיין/)).toBeInTheDocument();
  });

  it("leads with a one-click send to the saved favorite, with other apps a click away", () => {
    localStorage.setItem("tripweaver_ai_external_favorite", "claude");
    render(<BuilderStep3 {...baseProps({ aiMode: "external", chatInput: "Add a museum" })} />);

    expect(screen.getByRole("button", { name: /שליחה ל-Claude/ })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "נסו אפליקציית AI אחרת" }));
    expect(screen.getByRole("link", { name: "Claude" })).toBeInTheDocument();
  });
});
