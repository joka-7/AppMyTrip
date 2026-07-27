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
});
