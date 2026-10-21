import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DEFAULT_APP_DESIGN } from "./services/appDesign";

vi.mock("./api");
vi.mock("./services/tripsStore", () => ({
  onAuthChange: vi.fn(() => () => {}),
  claimDeviceData: vi.fn(),
  getCurrentSession: vi.fn(() => null),
  signInWithGoogle: vi.fn(),
  saveTrip: vi.fn(),
  shareTrip: vi.fn(),
  loadSharedTrip: vi.fn(),
  saveSharedEdit: vi.fn(),
  SharedTripUnavailableError: class SharedTripUnavailableError extends Error {},
}));

// The link's fragment is read once at module load, so this file gets its own
// edit-link URL (App.shared.test.tsx covers the view link).
describe("App opened through an edit link", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.history.pushState({}, "", "/?shared=share-1#k=key-1&e=edit-1");
  });

  it("saves changes back to the link with the link's key and edit token", async () => {
    const trips = await import("./services/tripsStore");
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon", days: [] },
      appDesign: DEFAULT_APP_DESIGN,
      meta: { expiresAt: null },
    });
    vi.mocked(trips.saveSharedEdit).mockResolvedValue();

    const { default: App } = await import("./App");
    render(<App />);

    fireEvent.click(await screen.findByText("שמירה ושיתוף", {}, { timeout: 5000 }));
    fireEvent.click(screen.getByText("שמירת שינויים"));

    await waitFor(() => {
      expect(trips.saveSharedEdit).toHaveBeenCalledWith(
        "share-1",
        "key-1",
        "edit-1",
        expect.objectContaining({ title: "Shared Trip" }),
        DEFAULT_APP_DESIGN,
      );
    });
  });
});
