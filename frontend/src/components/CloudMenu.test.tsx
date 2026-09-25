import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CloudMenu from "./CloudMenu";
import * as trips from "../services/tripsStore";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

vi.mock("../services/tripsStore", () => ({
  onAuthChange: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutOfGoogle: vi.fn(),
  listTrips: vi.fn(),
  saveTrip: vi.fn(),
  loadTrip: vi.fn(),
  deleteTrip: vi.fn(),
  deleteSharedTrip: vi.fn(),
  shareTrip: vi.fn(),
  loadSharedTrip: vi.fn(),
}));

const sampleTrip: TripData = { title: "Trip", dates: "Mon", days: [] };

describe("CloudMenu", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
  });

  it("shows a sign-in button when signed out", () => {
    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={1}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        onLoadTrip={vi.fn()}
      />,
    );
    expect(screen.getByRole("button", { name: /התחברות עם Google/ })).toBeInTheDocument();
  });

  it("signs in, lists trips, and loads a selected trip", async () => {
    vi.mocked(trips.signInWithGoogle).mockResolvedValue({
      uid: "uid-123",
      email: "user@example.com",
      displayName: "User",
    });
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01", stage: null },
    ]);
    vi.mocked(trips.loadTrip).mockResolvedValue({
      trip: sampleTrip,
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
    });

    const onLoadTrip = vi.fn();
    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={1}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        onLoadTrip={onLoadTrip}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("User"));
    fireEvent.click(screen.getByText("My Trip"));

    await waitFor(() => {
      expect(onLoadTrip).toHaveBeenCalledWith(sampleTrip, "trip-1", {
        ...DEFAULT_APP_DESIGN,
        theme: "green",
      });
    });
    expect(trips.loadTrip).toHaveBeenCalledWith("uid-123", "trip-1");
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
    vi.mocked(trips.listTrips).mockResolvedValue([]);

    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={1}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        onLoadTrip={vi.fn()}
      />,
    );

    const email = await screen.findByText("averylongaddress@example.com");
    expect(email).toHaveClass("truncate");
    expect(screen.getByRole("button", { name: /averylongaddress@example.com/ })).toHaveAttribute(
      "title",
      "averylongaddress@example.com",
    );
  });

  it("saves with the selected stage and shows it as a tag once the list refreshes", async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    vi.mocked(trips.listTrips)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        { id: "trip-1", name: "Trip", modifiedTime: "2024-01-01", stage: "step3" },
      ]);
    vi.mocked(trips.saveTrip).mockResolvedValue("trip-1");
    const onTripIdChange = vi.fn();

    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={2}
        onTripIdChange={onTripIdChange}
        onUpdateTrip={vi.fn()}
        onLoadTrip={vi.fn()}
      />,
    );

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

    // The refreshed trip list carries the stage back from Firestore, shown as a tag
    // (scoped to a <span>, since the still-open "save as" <select> also has an
    // option with this same text).
    await waitFor(() => {
      expect(screen.getByText("שלב 3", { selector: "span" })).toBeInTheDocument();
    });
  });

  it("saves under a custom name and applies it back to the trip being edited", async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    vi.mocked(trips.listTrips).mockResolvedValue([]);
    vi.mocked(trips.saveTrip).mockResolvedValue("trip-1");
    const onUpdateTrip = vi.fn();

    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={1}
        onTripIdChange={vi.fn()}
        onUpdateTrip={onUpdateTrip}
        onLoadTrip={vi.fn()}
      />,
    );

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
    vi.mocked(trips.listTrips).mockResolvedValue([]);
    vi.mocked(trips.saveTrip).mockResolvedValue("trip-1");
    vi.mocked(trips.shareTrip).mockResolvedValue("https://example.com/?shared=trip-1");

    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={4}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        onLoadTrip={vi.fn()}
      />,
    );

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
    vi.mocked(trips.listTrips).mockResolvedValue([]);
    vi.mocked(trips.shareTrip).mockResolvedValue("https://example.com/?shared=trip-1");
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("denied")) },
      configurable: true,
    });
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId="trip-1"
        currentStep={4}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        onLoadTrip={vi.fn()}
      />,
    );

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

  it('opening a trip saved as "Final app" goes to its real shared link, not the builder', async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-9", name: "Finished Trip", modifiedTime: "2024-01-01", stage: "final" },
    ]);
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    const onLoadTrip = vi.fn();
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });

    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={1}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        onLoadTrip={onLoadTrip}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("User"));
    fireEvent.click(screen.getByText("Finished Trip"));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalled();
    });
    const navigatedTo = new URL(assignSpy.mock.calls[0][0] as string);
    expect(navigatedTo.searchParams.get("shared")).toBe("trip-9");
    // Must not fall back to loading it into the builder as well.
    expect(trips.loadTrip).not.toHaveBeenCalled();
    expect(onLoadTrip).not.toHaveBeenCalled();

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("loads the trip list for an already-signed-in session without requiring a manual sign-in click", async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01", stage: null },
    ]);
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });

    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={1}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        onLoadTrip={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
    expect(trips.listTrips).toHaveBeenCalledWith("uid-123");

    fireEvent.click(screen.getByText("User"));
    await waitFor(() => {
      expect(screen.getByText("My Trip")).toBeInTheDocument();
    });
  });

  it("requires a second click before deleting a trip", async () => {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01", stage: null },
    ]);
    vi.mocked(trips.deleteTrip).mockResolvedValue(undefined);
    vi.mocked(trips.deleteSharedTrip).mockResolvedValue(undefined);

    render(
      <CloudMenu
        tripData={sampleTrip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId={null}
        currentStep={1}
        onTripIdChange={vi.fn()}
        onUpdateTrip={vi.fn()}
        onLoadTrip={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("User")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("User"));
    await waitFor(() => {
      expect(screen.getByText("My Trip")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: /מחיקת הטיול My Trip/ });
    fireEvent.click(deleteBtn);
    expect(trips.deleteTrip).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /אישור מחיקת הטיול My Trip/ }));
    await waitFor(() => {
      expect(trips.deleteTrip).toHaveBeenCalledWith("uid-123", "trip-1");
    });
    expect(trips.deleteSharedTrip).toHaveBeenCalledWith("trip-1");
  });
});
