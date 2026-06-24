import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import DriveMenu from "./DriveMenu";
import * as drive from "../services/googleDrive";
import type { TripData } from "../api";

vi.mock("../services/googleDrive", () => ({
  onAuthChange: vi.fn(),
  signInWithGoogle: vi.fn(),
  signOutOfGoogle: vi.fn(),
  getCachedAccessToken: vi.fn(),
  ensureAppFolder: vi.fn(),
  listTrips: vi.fn(),
  saveTrip: vi.fn(),
  loadTrip: vi.fn(),
  deleteTrip: vi.fn(),
  shareTrip: vi.fn(),
}));

const sampleTrip: TripData = { title: "Trip", dates: "Mon", days: [] };

describe("DriveMenu", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(drive.onAuthChange).mockImplementation(() => () => {});
  });

  it("shows a sign-in button when signed out", () => {
    render(<DriveMenu tripData={sampleTrip} onLoadTrip={vi.fn()} />);
    expect(screen.getByRole("button", { name: /התחברות עם Google/ })).toBeInTheDocument();
  });

  it("signs in, lists Drive trips, and loads a selected trip", async () => {
    vi.mocked(drive.signInWithGoogle).mockResolvedValue({
      accessToken: "token-123",
      email: "user@example.com",
      displayName: "User",
    });
    vi.mocked(drive.ensureAppFolder).mockResolvedValue("folder-1");
    vi.mocked(drive.listTrips).mockResolvedValue([
      { id: "file-1", name: "My Trip.json", modifiedTime: "2024-01-01" },
    ]);
    vi.mocked(drive.loadTrip).mockResolvedValue(sampleTrip);

    const onLoadTrip = vi.fn();
    render(<DriveMenu tripData={sampleTrip} onLoadTrip={onLoadTrip} />);

    fireEvent.click(screen.getByRole("button", { name: /התחברות עם Google/ }));

    await waitFor(() => {
      expect(screen.getByText("user@example.com")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("user@example.com"));
    fireEvent.click(screen.getByText("My Trip"));

    await waitFor(() => {
      expect(onLoadTrip).toHaveBeenCalledWith(sampleTrip);
    });
    expect(drive.loadTrip).toHaveBeenCalledWith("token-123", "file-1");
  });
});
