import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import CloudMenu from "./CloudMenu";
import * as trips from "../services/tripsStore";
import type { TripData } from "../api";

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
    render(<CloudMenu tripData={sampleTrip} onLoadTrip={vi.fn()} />);
    expect(screen.getByRole("button", { name: /התחברות עם Google/ })).toBeInTheDocument();
  });

  it("signs in, lists trips, and loads a selected trip", async () => {
    vi.mocked(trips.signInWithGoogle).mockResolvedValue({
      uid: "uid-123",
      email: "user@example.com",
      displayName: "User",
    });
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01" },
    ]);
    vi.mocked(trips.loadTrip).mockResolvedValue(sampleTrip);

    const onLoadTrip = vi.fn();
    render(<CloudMenu tripData={sampleTrip} onLoadTrip={onLoadTrip} />);

    fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("user@example.com"));
    fireEvent.click(screen.getByText("My Trip"));

    await waitFor(() => {
      expect(onLoadTrip).toHaveBeenCalledWith(sampleTrip);
    });
    expect(trips.loadTrip).toHaveBeenCalledWith("uid-123", "trip-1");
  });
});
