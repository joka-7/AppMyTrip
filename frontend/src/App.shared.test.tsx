import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DEFAULT_APP_DESIGN } from "./services/appDesign";

vi.mock("./api");
vi.mock("./services/tripsStore", () => ({
  onAuthChange: vi.fn(() => () => {}),
  getCurrentSession: vi.fn(() => null),
  signInWithGoogle: vi.fn(),
  signOutOfGoogle: vi.fn(),
  listTrips: vi.fn(),
  saveTrip: vi.fn(),
  loadTrip: vi.fn(),
  deleteTrip: vi.fn(),
  shareTrip: vi.fn(),
  loadSharedTrip: vi.fn(),
  saveSharedTrip: vi.fn(),
  addSharedTripAdmin: vi.fn(),
}));

const emptyMeta = {
  ownerId: "owner-1",
  ownerEmail: "owner@example.com",
  adminEmails: [],
  expiresAt: null,
};

// A "?shared=<id>" link must open straight into the standalone generated
// app — not the builder — since that's what gets handed to trip
// participants. The shared-trip-id check happens at module load time off
// window.location.search, so this file (and its URL) needs to be isolated
// from App.test.tsx's no-param case; vitest already isolates modules per file.
describe("App shared-trip viewer", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.history.pushState({}, "", "/?shared=trip-1");
  });

  it("renders only the standalone app for a shared link, without builder chrome", async () => {
    const trips = await import("./services/tripsStore");
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
    vi.mocked(trips.getCurrentSession).mockReturnValue(null);
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon - Wed", days: [] },
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
      meta: emptyMeta,
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Shared Trip")).toBeInTheDocument();
    });

    expect(screen.queryByText("TripWeaver AI")).not.toBeInTheDocument();
    expect(screen.queryByText(/שלב \d מתוך 4/)).not.toBeInTheDocument();
    // A non-admin visitor shouldn't see the save-in-place button.
    expect(screen.queryByText("שמירת שינויים")).not.toBeInTheDocument();
  });

  it("shows an error message if the shared trip fails to load", async () => {
    const trips = await import("./services/tripsStore");
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
    vi.mocked(trips.getCurrentSession).mockReturnValue(null);
    vi.mocked(trips.loadSharedTrip).mockRejectedValue(new Error("not found"));

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText(/טעינת הטיול המשותף נכשלה/)).toBeInTheDocument();
    });
  });

  it("shows admin controls and saves changes in place for a signed-in admin", async () => {
    const trips = await import("./services/tripsStore");
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "admin-1", email: "admin@example.com", displayName: "Admin" } as never);
      return () => {};
    });
    vi.mocked(trips.getCurrentSession).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      displayName: "Admin",
    });
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon - Wed", days: [] },
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
      meta: { ...emptyMeta, adminEmails: ["admin@example.com"] },
    });
    vi.mocked(trips.saveSharedTrip).mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("הגדרות")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("הגדרות"));

    await waitFor(() => {
      expect(screen.getByText("שמירת שינויים")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() => {
      expect(trips.saveSharedTrip).toHaveBeenCalledWith(
        "trip-1",
        expect.objectContaining({ title: "Shared Trip" }),
        expect.objectContaining({ theme: "green" }),
      );
    });
    await waitFor(() => {
      expect(screen.getByText("השינויים נשמרו בקישור הזה.")).toBeInTheDocument();
    });
  });

  it("lets an admin add another admin by email", async () => {
    const trips = await import("./services/tripsStore");
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "admin-1", email: "admin@example.com", displayName: "Admin" } as never);
      return () => {};
    });
    vi.mocked(trips.getCurrentSession).mockReturnValue({
      uid: "admin-1",
      email: "admin@example.com",
      displayName: "Admin",
    });
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon - Wed", days: [] },
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
      meta: { ...emptyMeta, adminEmails: ["admin@example.com"] },
    });
    vi.mocked(trips.addSharedTripAdmin).mockResolvedValue(undefined);

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("הגדרות")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("הגדרות"));

    const input = await screen.findByPlaceholderText("הוספת מנהל לפי אימייל...");
    fireEvent.change(input, { target: { value: "Friend@Example.com" } });
    fireEvent.click(screen.getByText("הוספת מנהל"));

    await waitFor(() => {
      expect(trips.addSharedTripAdmin).toHaveBeenCalledWith("trip-1", "Friend@Example.com");
    });
    await waitFor(() => {
      expect(
        screen.getByText("נוסף/ה בהצלחה — עכשיו גם הם יכולים לשמור שינויים בקישור הזה."),
      ).toBeInTheDocument();
    });
  });
});
