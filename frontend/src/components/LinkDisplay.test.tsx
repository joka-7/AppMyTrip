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

// A pasted link on its own says nothing about the trip. The share sheet is what
// carries the name and dates into WhatsApp/Telegram alongside the URL.
describe("LinkDisplay sharing", () => {
  const originalClipboard = navigator.clipboard;
  const originalShare = (navigator as { share?: unknown }).share;
  const url = "https://example.com/?trip=Rome&shared=trip-1";
  const shareText = `Rome — 12-19/07\n${url}`;

  afterEach(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    Object.defineProperty(navigator, "share", { value: originalShare, configurable: true });
  });

  it("offers no share button when there's no message to send", () => {
    render(<LinkDisplay url={url} />);
    expect(screen.queryByRole("button", { name: /שיתוף/ })).not.toBeInTheDocument();
  });

  it("hands the trip name, message and link to the native share sheet", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { value: share, configurable: true });

    render(<LinkDisplay url={url} shareTitle="Rome" shareText={shareText} />);
    fireEvent.click(screen.getByRole("button", { name: /שיתוף/ }));

    await waitFor(() => {
      expect(share).toHaveBeenCalledWith({ title: "Rome", text: shareText, url });
    });
  });

  it("copies the whole message, not just the URL, where there's no share sheet", async () => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });

    render(<LinkDisplay url={url} shareTitle="Rome" shareText={shareText} />);
    fireEvent.click(screen.getByRole("button", { name: /שיתוף/ }));

    await waitFor(() => expect(writeText).toHaveBeenCalledWith(shareText));
    expect(await screen.findByRole("button", { name: /הועתק!/ })).toBeInTheDocument();
  });

  it("stays quiet when the user dismisses the share sheet", async () => {
    const abort = Object.assign(new Error("cancelled"), { name: "AbortError" });
    Object.defineProperty(navigator, "share", {
      value: vi.fn().mockRejectedValue(abort),
      configurable: true,
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(<LinkDisplay url={url} shareTitle="Rome" shareText={shareText} />);
    fireEvent.click(screen.getByRole("button", { name: /שיתוף/ }));

    await waitFor(() => expect(navigator.share).toHaveBeenCalled());
    expect(consoleErrorSpy).not.toHaveBeenCalled();
    consoleErrorSpy.mockRestore();
  });
});
