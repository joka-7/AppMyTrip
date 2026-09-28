import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CloudMenu from "./CloudMenu";
import * as trips from "../services/tripsStore";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

vi.mock("../services/tripsStore", () => ({
  onAuthChange: vi.fn(),
  completeRedirectSignIn: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutOfGoogle: vi.fn(),
  saveTrip: vi.fn(),
  shareTrip: vi.fn(),
  loadSharedTrip: vi.fn(),
}));

const sampleTrip: TripData = { title: "Trip", dates: "Mon", days: [] };

describe("CloudMenu", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
    // No redirect sign-in pending by default (see tripsStore's completeRedirectSignIn) —
    // individual tests override this to exercise the redirect-completion path.
    vi.mocked(trips.completeRedirectSignIn).mockResolvedValue(null);
  });

  function renderCloudMenu(overrides: Partial<Parameters<typeof CloudMenu>[0]> = {}) {
    return render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={1}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        {...overrides}
      />,
    );
  }

  it("shows a sign-in button when signed out", () => {
    renderCloudMenu();
    expect(screen.getByRole("button", { name: /התחברות עם Google/ })).toBeInTheDocument();
  });

  // Regression guard: a failed sign-in (blocked popup, cancelled OAuth,
  // misconfigured Firebase) used to have nowhere to render — the signed-out
  // branch was just the button, and `notice` was only ever shown inside the
  // signed-in dropdown.
  describe("sign-in failure notice", () => {
    it("shows and can dismiss a notice for an unclassified failure, with the actual error appended", async () => {
      vi.mocked(trips.signInWithGoogle).mockRejectedValue(new Error("something odd"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      renderCloudMenu();
      fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));
      await waitFor(() => {
        expect(screen.getByText(/ההתחברות ל-Google נכשלה\. נסו שוב\./)).toBeInTheDocument();
      });
      expect(screen.getByText(/something odd/)).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "סגירה" }));
      expect(screen.queryByText(/ההתחברות ל-Google נכשלה/)).not.toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });

    // Regression guard: the navbar wraps on mobile, so this button can land
    // anywhere in the wrapped row — an `absolute`-only panel anchored to it
    // could render partly off the edge of the viewport. `fixed` (pinned to
    // the viewport, same as this app's other floating panels) on mobile,
    // only switching to an anchor-relative `absolute` at the `sm:` breakpoint
    // where wrapping isn't a concern, keeps it fully on-screen either way.
    it("pins the notice to the viewport on mobile instead of anchoring it to the button", async () => {
      vi.mocked(trips.signInWithGoogle).mockRejectedValue(new Error("something odd"));
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      renderCloudMenu();
      fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));
      const closeButton = await screen.findByRole("button", { name: "סגירה" });
      const panel = closeButton.closest('[class*="rounded-xl"]');
      expect(panel).toHaveClass("fixed", "inset-x-4", "top-4");
      expect(panel).toHaveClass("sm:absolute", "sm:inset-x-auto");

      consoleErrorSpy.mockRestore();
    });

    it("shows a specific message for a blocked popup", async () => {
      vi.mocked(trips.signInWithGoogle).mockRejectedValue(
        Object.assign(new Error("blocked"), { code: "auth/popup-blocked" }),
      );
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      renderCloudMenu();
      fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));
      await waitFor(() => {
        expect(
          screen.getByText(
            "הדפדפן חסם את חלון ההתחברות של Google. אפשרו חלונות קופצים לאתר הזה ונסו שוב.",
          ),
        ).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    it("shows a specific message naming the actual domain, for an unauthorized domain (e.g. an unauthorized preview deployment)", async () => {
      vi.mocked(trips.signInWithGoogle).mockRejectedValue(
        Object.assign(new Error("domain"), { code: "auth/unauthorized-domain" }),
      );
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      renderCloudMenu();
      fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));
      await waitFor(() => {
        // jsdom's default location is localhost — this asserts the actual
        // hostname is interpolated in, not that it's this specific value.
        expect(
          screen.getByText(new RegExp(`הכתובת ${window.location.hostname} אינה מורשית`)),
        ).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    it("shows a specific message for a network failure", async () => {
      vi.mocked(trips.signInWithGoogle).mockRejectedValue(
        Object.assign(new Error("offline"), { code: "auth/network-request-failed" }),
      );
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      renderCloudMenu();
      fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));
      await waitFor(() => {
        expect(screen.getByText(/בעיית רשת מנעה את ההתחברות/)).toBeInTheDocument();
      });

      consoleErrorSpy.mockRestore();
    });

    it("shows no notice at all when the user just closes the Google popup themselves", async () => {
      vi.mocked(trips.signInWithGoogle).mockRejectedValue(
        Object.assign(new Error("closed"), { code: "auth/popup-closed-by-user" }),
      );
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      renderCloudMenu();
      fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));
      await waitFor(() => {
        expect(trips.signInWithGoogle).toHaveBeenCalled();
      });
      expect(screen.queryByRole("button", { name: "סגירה" })).not.toBeInTheDocument();

      consoleErrorSpy.mockRestore();
    });
  });

  it("signs in and shows the account's display name", async () => {
    vi.mocked(trips.signInWithGoogle).mockResolvedValue({
      uid: "uid-123",
      email: "user@example.com",
      displayName: "User",
    });

    renderCloudMenu();
    fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
  });

  // Regression guard: when no display name is available (an older account, or
  // a provider that doesn't return one), the connect control falls back to the
  // raw email — which can be much longer than a first name — so it still needs
  // to truncate rather than push the navbar into horizontal scroll.
  it("falls back to a truncated email when signed in with no display name", async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({
        uid: "uid-123",
        email: "averylongaddress@example.com",
        displayName: null,
      } as never);
      return () => {};
    });

    renderCloudMenu();

    const email = await screen.findByText("averylongaddress@example.com");
    expect(email).toHaveClass("truncate");
    expect(screen.getByRole("button", { name: /averylongaddress@example.com/ })).toHaveAttribute(
      "title",
      "averylongaddress@example.com",
    );
  });

  it("closes the dropdown via its close button", async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });

    renderCloudMenu();
    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("User"));

    fireEvent.click(screen.getByRole("button", { name: "סגירה" }));

    expect(screen.queryByRole("button", { name: /שמירה/ })).not.toBeInTheDocument();
  });

  it("saves with the selected stage", async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    vi.mocked(trips.saveTrip).mockResolvedValue("trip-1");
    const onTripIdChange = vi.fn();

    renderCloudMenu({ currentStep: 2, onTripIdChange });

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("User"));

    // Defaults to the current builder step (2), matching the "currentStep" prop.
    const stageSelect = screen.getByLabelText(/שמירה בשלב/) as HTMLSelectElement;
    expect(stageSelect.value).toBe("step2");

    // User explicitly picks a different stage before saving.
    fireEvent.change(stageSelect, { target: { value: "step3" } });

    fireEvent.click(screen.getByRole("button", { name: /שמירה/ }));

    await waitFor(() => {
      expect(trips.saveTrip).toHaveBeenCalledWith("uid-123", sampleTrip, {
        appDesign: DEFAULT_APP_DESIGN,
        tripId: undefined,
        stage: "step3",
      });
    });
    expect(onTripIdChange).toHaveBeenCalledWith("trip-1");
    await waitFor(() => {
      expect(screen.getByText("הטיול נשמר בחשבונכם.")).toBeInTheDocument();
    });
  });

  it("saves under a custom name and applies it back to the trip being edited", async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    vi.mocked(trips.saveTrip).mockResolvedValue("trip-1");
    const onUpdateTrip = vi.fn();

    renderCloudMenu({ onUpdateTrip });

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("User"));

    const nameInput = screen.getByPlaceholderText(/לדוגמה: טיול לרומא/) as HTMLInputElement;
    // Defaults to the trip's current title.
    expect(nameInput.value).toBe("Trip");
    fireEvent.change(nameInput, { target: { value: "Rome Family Trip" } });

    fireEvent.click(screen.getByRole("button", { name: /שמירה/ }));

    await waitFor(() => {
      expect(trips.saveTrip).toHaveBeenCalledWith(
        "uid-123",
        { ...sampleTrip, title: "Rome Family Trip" },
        { appDesign: DEFAULT_APP_DESIGN, tripId: undefined, stage: "step1" },
      );
    });
    // The custom name must stick for the trip being edited too, not just the
    // saved Firestore doc, so it doesn't get silently reverted on next save.
    expect(onUpdateTrip).toHaveBeenCalledWith({ title: "Rome Family Trip" });
  });

  it('saving as "Final app" also publishes the trip, not just labels it', async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    vi.mocked(trips.saveTrip).mockResolvedValue("trip-1");
    vi.mocked(trips.shareTrip).mockResolvedValue("https://example.com/?shared=trip-1");

    renderCloudMenu({ currentStep: 4 });

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("User"));

    const stageSelect = screen.getByLabelText(/שמירה בשלב/) as HTMLSelectElement;
    fireEvent.change(stageSelect, { target: { value: "final" } });

    fireEvent.click(screen.getByRole("button", { name: /שמירה/ }));

    await waitFor(() => {
      expect(trips.saveTrip).toHaveBeenCalledWith("uid-123", sampleTrip, {
        appDesign: DEFAULT_APP_DESIGN,
        tripId: undefined,
        stage: "final",
      });
    });
    // "Final app" must actually be shared — not just tagged — so the saved
    // trip really is the finished app when opened, not a look-alike preview.
    await waitFor(() => {
      expect(trips.shareTrip).toHaveBeenCalledWith(
        "uid-123",
        "trip-1",
        sampleTrip,
        DEFAULT_APP_DESIGN,
        undefined,
      );
    });
  });

  it("shares an already-saved trip and shows a distinct notice when the clipboard copy fails", async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    vi.mocked(trips.shareTrip).mockResolvedValue("https://example.com/?shared=trip-1");
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    renderCloudMenu({ tripId: "trip-1", currentStep: 4 });

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("User"));
    fireEvent.click(screen.getByRole("button", { name: /שיתוף/ }));

    // The share itself succeeded — the link must still be shown as a manual
    // fallback — but the notice must be honest that the clipboard copy failed,
    // not the normal "copied to clipboard" success text.
    await waitFor(() => {
      expect(screen.getByText(/ההעתקה ללוח נכשלה/)).toBeInTheDocument();
    });
    expect(screen.getByText("https://example.com/?shared=trip-1")).toBeInTheDocument();
    expect(screen.queryByText("קישור השיתוף הועתק ללוח.")).not.toBeInTheDocument();

    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      configurable: true,
    });
    consoleErrorSpy.mockRestore();
  });
});
