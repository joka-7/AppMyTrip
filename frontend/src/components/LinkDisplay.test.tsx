import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import LinkDisplay from "./LinkDisplay";

// B3: a rejected navigator.clipboard.writeText (no permission, insecure
// context, etc.) must not be silently swallowed into a false "Copied!" —
// the button has to say the copy failed instead, since the user would
// otherwise paste nothing and have no idea why.
describe("LinkDisplay", () => {
  const originalClipboard = navigator.clipboard;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
  });

  it('shows "Copied!" when the clipboard write succeeds', async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });

    render(<LinkDisplay url="https://example.com/?shared=trip-1" />);
    fireEvent.click(screen.getByRole("button", { name: /העתק קישור/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /הועתק!/ })).toBeInTheDocument();
    });
    // The raw URL must stay visible either way, not just the button state.
    expect(screen.getByText("https://example.com/?shared=trip-1")).toBeInTheDocument();
  });

  it('shows a distinct failure state instead of "Copied!" when the clipboard write rejects', async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<LinkDisplay url="https://example.com/?shared=trip-1" />);
    fireEvent.click(screen.getByRole("button", { name: /העתק קישור/ }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /ההעתקה ללוח נכשלה/ })).toBeInTheDocument();
    });
    // The link itself is still right there to copy by hand.
    expect(screen.getByText("https://example.com/?shared=trip-1")).toBeInTheDocument();

    consoleErrorSpy.mockRestore();
  });
});
