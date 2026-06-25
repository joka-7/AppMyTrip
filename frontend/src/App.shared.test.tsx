import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("./api");
vi.mock("./services/tripsStore", () => ({
  onAuthChange: () => () => {},
  signInWithGoogle: vi.fn(),
  signOutOfGoogle: vi.fn(),
  listTrips: vi.fn(),
  saveTrip: vi.fn(),
  loadTrip: vi.fn(),
  deleteTrip: vi.fn(),
  shareTrip: vi.fn(),
  loadSharedTrip: vi.fn(),
}));

// A "?shared=<id>" link must open straight into the standalone generated
// app — not the builder — since that's what gets handed to trip
// participants. The shared-trip-id check happens at module load time off
// window.location.search, so this file (and its URL) needs to be isolated
// from App.test.tsx's no-param case; vitest already isolates modules per file.
describe("App shared-trip viewer", () => {
  beforeEach(() => {
    window.history.pushState({}, "", "/?shared=trip-1");
  });

  it("renders only the standalone app for a shared link, without builder chrome", async () => {
    const trips = await import("./services/tripsStore");
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon - Wed", days: [] },
      theme: "green",
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Shared Trip")).toBeInTheDocument();
    });

    expect(screen.queryByText("TripWeaver AI")).not.toBeInTheDocument();
    expect(screen.queryByText(/שלב \d מתוך 4/)).not.toBeInTheDocument();
  });

  it("shows an error message if the shared trip fails to load", async () => {
    const trips = await import("./services/tripsStore");
    vi.mocked(trips.loadSharedTrip).mockRejectedValue(new Error("not found"));

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/טעינת הטיול המשותף נכשלה/)).toBeInTheDocument();
    });
  });
});
