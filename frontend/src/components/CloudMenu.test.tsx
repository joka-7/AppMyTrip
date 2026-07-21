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
        onLoadTrip={vi.fn()}
        onImportTrip={vi.fn()}
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
        onLoadTrip={onLoadTrip}
        onImportTrip={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("user@example.com"));
    fireEvent.click(screen.getByText("My Trip"));

    await waitFor(() => {
      expect(onLoadTrip).toHaveBeenCalledWith(sampleTrip, "trip-1", {
        ...DEFAULT_APP_DESIGN,
        theme: "green",
      });
    });
    expect(trips.loadTrip).toHaveBeenCalledWith("uid-123", "trip-1");
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
        onLoadTrip={vi.fn()}
        onImportTrip={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("user@example.com"));

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
        onLoadTrip={vi.fn()}
        onImportTrip={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });
    expect(trips.listTrips).toHaveBeenCalledWith("uid-123");

    fireEvent.click(screen.getByText("user@example.com"));
    await waitFor(() => {
      expect(screen.getByText("My Trip")).toBeInTheDocument();
    });
  });
});
