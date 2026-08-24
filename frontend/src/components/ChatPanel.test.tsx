import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChatPanel from "./ChatPanel";

describe("ChatPanel", () => {
  const baseProps = {
    agentMessages: [] as { role: string; text: string }[],
    chatEndRef: { current: null },
    chatInput: "",
    onChangeChatInput: vi.fn(),
    onSendMessage: vi.fn((e: React.FormEvent) => e.preventDefault()),
  };

  it("shows a retry button next to a failed-turn notice", () => {
    const onRetry = vi.fn();
    render(
      <ChatPanel
        {...baseProps}
        notice="The update failed — the itinerary didn't change."
        onRetry={onRetry}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "נסו שוב" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("hides the retry button when onRetry is not provided", () => {
    render(<ChatPanel {...baseProps} notice="error" />);
    expect(screen.queryByRole("button", { name: "נסו שוב" })).toBeNull();
  });

  it("offers external AI chat links for the failed message once a notice is showing", () => {
    render(
      <ChatPanel
        {...baseProps}
        notice="The update failed — the itinerary didn't change."
        failedText="add a beach day"
      />,
    );

    const claudeLink = screen.getByRole("link", { name: "Claude" });
    expect(claudeLink).toHaveAttribute("target", "_blank");
    const url = new URL(claudeLink.getAttribute("href")!);
    expect(url.hostname).toBe("claude.ai");
    expect(url.searchParams.get("q")).toBe("add a beach day");

    expect(screen.getByRole("link", { name: "ChatGPT" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Gemini" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Groq" })).toBeTruthy();
  });

  it("hides the external AI chat links when there's no notice", () => {
    render(<ChatPanel {...baseProps} failedText="add a beach day" />);
    expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();
  });

  it("hides the external AI chat links when there's a notice but nothing failed to send", () => {
    // e.g. the media-generation notice, which isn't tied to a chat turn.
    render(<ChatPanel {...baseProps} notice="Generating media failed." />);
    expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();
  });

  it("copies the failed message to the clipboard when an external chat link is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<ChatPanel {...baseProps} notice="The update failed." failedText="add a beach day" />);
    fireEvent.click(screen.getByRole("link", { name: "ChatGPT" }));

    expect(writeText).toHaveBeenCalledWith("add a beach day");
  });

  describe("proactive 'ask externally' toggle", () => {
    it("is collapsed by default, even with no notice at all", () => {
      render(<ChatPanel {...baseProps} chatInput="what should I pack?" />);
      expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();
    });

    it("reveals links for the current draft text once toggled on", () => {
      render(<ChatPanel {...baseProps} chatInput="what should I pack?" />);
      fireEvent.click(screen.getByRole("button", { name: "שאלו AI חיצוני ישירות" }));

      const claudeLink = screen.getByRole("link", { name: "Claude" });
      expect(new URL(claudeLink.getAttribute("href")!).searchParams.get("q")).toBe(
        "what should I pack?",
      );
    });

    it("asks for text instead of showing links when the draft is empty", () => {
      render(<ChatPanel {...baseProps} chatInput="   " />);
      fireEvent.click(screen.getByRole("button", { name: "שאלו AI חיצוני ישירות" }));

      expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();
      expect(screen.getByText("כתבו הודעה קודם כדי לשלוח אותה ל-AI חיצוני.")).toBeInTheDocument();
    });

    it("hides again on a second click", () => {
      render(<ChatPanel {...baseProps} chatInput="what should I pack?" />);
      const toggle = screen.getByRole("button", { name: "שאלו AI חיצוני ישירות" });
      fireEvent.click(toggle);
      expect(screen.getByRole("link", { name: "Claude" })).toBeInTheDocument();

      fireEvent.click(toggle);
      expect(screen.queryByRole("link", { name: "Claude" })).toBeNull();
    });
  });
});
