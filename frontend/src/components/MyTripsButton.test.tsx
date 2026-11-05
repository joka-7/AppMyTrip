import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import MyTripsButton from "./MyTripsButton";
import * as trips from "../services/tripsStore";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

vi.mock("../services/tripsStore", () => ({
  onAuthChange: vi.fn(),
  listTrips: vi.fn(),
  loadTrip: vi.fn(),
  deleteTrip: vi.fn(),
  shareLinkFor: vi.fn(),
}));

const sampleTrip: TripData = { title: "Trip", dates: "Mon", days: [] };

describe("MyTripsButton", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
  });

  function renderSignedIn(overrides: Partial<Parameters<typeof MyTripsButton>[0]> = {}) {
    vi.mocked(trips.onAuthChange).mockImplementation((callback) => {
      callback({ uid: "uid-123", email: "user@example.com", displayName: "User" } as never);
      return () => {};
    });
    return render(
      <MyTripsButton tripId={null} onTripIdChange={vi.fn()} onLoadTrip={vi.fn()} {...overrides} />,
    );
  }

  it("renders nothing while signed out", () => {
    const { container } = render(
      <MyTripsButton tripId={null} onTripIdChange={vi.fn()} onLoadTrip={vi.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the button once signed in, and opens the trip list on click", async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01", stage: null },
    ]);

    renderSignedIn();

    const button = await screen.findByRole("button", { name: "הטיולים שלי" });
    fireEvent.click(button);

    await waitFor(() => {
      expect(screen.getByText("My Trip")).toBeInTheDocument();
    });
    expect(trips.listTrips).toHaveBeenCalled();
  });

  it("shows a loading message instead of the empty placeholder while trips are still being fetched", async () => {
    let resolveTrips: (value: never[]) => void = () => {};
    vi.mocked(trips.listTrips).mockReturnValue(
      new Promise((resolve) => {
        resolveTrips = resolve;
      }),
    );

    renderSignedIn();
    fireEvent.click(await screen.findByRole("button", { name: "הטיולים שלי" }));

    expect(await screen.findByText("טוען את הטיולים שלך…")).toBeInTheDocument();
    expect(screen.queryByText("אין טיולים שמורים עדיין.")).not.toBeInTheDocument();

    resolveTrips([]);
    await waitFor(() => {
      expect(screen.getByText("אין טיולים שמורים עדיין.")).toBeInTheDocument();
    });
    expect(screen.queryByText("טוען את הטיולים שלך…")).not.toBeInTheDocument();
  });

  it("shows a placeholder when there are no saved trips", async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([]);

    renderSignedIn();
    fireEvent.click(await screen.findByRole("button", { name: "הטיולים שלי" }));

    await waitFor(() => {
      expect(screen.getByText("אין טיולים שמורים עדיין.")).toBeInTheDocument();
    });
  });

  it("closes via its close button", async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([]);

    renderSignedIn();
    fireEvent.click(await screen.findByRole("button", { name: "הטיולים שלי" }));
    await waitFor(() => {
      expect(screen.getByText("אין טיולים שמורים עדיין.")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "סגירה" }));
    expect(screen.queryByText("אין טיולים שמורים עדיין.")).not.toBeInTheDocument();
  });

  it("loads a selected trip", async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01", stage: null },
    ]);
    vi.mocked(trips.loadTrip).mockResolvedValue({
      trip: sampleTrip,
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
    });
    const onLoadTrip = vi.fn();

    renderSignedIn({ onLoadTrip });
    fireEvent.click(await screen.findByRole("button", { name: "הטיולים שלי" }));
    fireEvent.click(await screen.findByText("My Trip"));

    await waitFor(() => {
      expect(onLoadTrip).toHaveBeenCalledWith(sampleTrip, "trip-1", {
        ...DEFAULT_APP_DESIGN,
        theme: "green",
      });
    });
    expect(trips.loadTrip).toHaveBeenCalledWith("trip-1");
  });

  it('opening a trip saved as "Final app" goes to its real shared link, not the builder', async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-9", name: "Finished Trip", modifiedTime: "2024-01-01", stage: "final" },
    ]);
    vi.mocked(trips.shareLinkFor).mockResolvedValue("https://example.com/?shared=share-9#k=key");
    const onLoadTrip = vi.fn();
    const assignSpy = vi.fn();
    const originalLocation = window.location;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...originalLocation, assign: assignSpy },
    });

    renderSignedIn({ onLoadTrip });
    fireEvent.click(await screen.findByRole("button", { name: "הטיולים שלי" }));
    fireEvent.click(await screen.findByText("Finished Trip"));

    await waitFor(() => {
      expect(assignSpy).toHaveBeenCalled();
    });
    expect(trips.shareLinkFor).toHaveBeenCalledWith("trip-9");
    expect(assignSpy).toHaveBeenCalledWith("https://example.com/?shared=share-9#k=key");
    // Must not fall back to loading it into the builder as well.
    expect(trips.loadTrip).not.toHaveBeenCalled();
    expect(onLoadTrip).not.toHaveBeenCalled();

    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it('auto-opens the trip list when navigated here with "myTrips=1", then strips it from the URL', async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01", stage: null },
    ]);
    const originalUrl = window.location.href;
    window.history.replaceState(null, "", "/?myTrips=1");

    renderSignedIn();

    await waitFor(() => {
      expect(screen.getByText("My Trip")).toBeInTheDocument();
    });
    expect(trips.listTrips).toHaveBeenCalled();
    expect(window.location.search).toBe("");

    window.history.replaceState(null, "", originalUrl);
  });

  it("requires a second click before deleting a trip", async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01", stage: null },
    ]);
    vi.mocked(trips.deleteTrip).mockResolvedValue(undefined);

    renderSignedIn();
    fireEvent.click(await screen.findByRole("button", { name: "הטיולים שלי" }));
    await waitFor(() => {
      expect(screen.getByText("My Trip")).toBeInTheDocument();
    });

    const deleteBtn = screen.getByRole("button", { name: /מחיקת הטיול My Trip/ });
    fireEvent.click(deleteBtn);
    expect(trips.deleteTrip).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /אישור מחיקת הטיול My Trip/ }));
    await waitFor(() => {
      expect(trips.deleteTrip).toHaveBeenCalledWith("trip-1");
    });
  });

  it('a "Final app" trip that was never published loads into the builder instead', async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-9", name: "Unpublished", modifiedTime: "2024-01-01", stage: "final" },
    ]);
    vi.mocked(trips.shareLinkFor).mockResolvedValue(null);
    vi.mocked(trips.loadTrip).mockResolvedValue({
      trip: sampleTrip,
      appDesign: DEFAULT_APP_DESIGN,
    });
    const onLoadTrip = vi.fn();

    renderSignedIn({ onLoadTrip });
    fireEvent.click(await screen.findByRole("button", { name: "הטיולים שלי" }));
    fireEvent.click(await screen.findByText("Unpublished"));

    await waitFor(() => {
      expect(onLoadTrip).toHaveBeenCalledWith(sampleTrip, "trip-9", DEFAULT_APP_DESIGN);
    });
  });

  it("clears the currently-edited trip id if that exact trip gets deleted", async () => {
    vi.mocked(trips.listTrips).mockResolvedValue([
      { id: "trip-1", name: "My Trip", modifiedTime: "2024-01-01", stage: null },
    ]);
    vi.mocked(trips.deleteTrip).mockResolvedValue(undefined);
    const onTripIdChange = vi.fn();

    renderSignedIn({ tripId: "trip-1", onTripIdChange });
    fireEvent.click(await screen.findByRole("button", { name: "הטיולים שלי" }));
    await waitFor(() => {
      expect(screen.getByText("My Trip")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /מחיקת הטיול My Trip/ }));
    fireEvent.click(screen.getByRole("button", { name: /אישור מחיקת הטיול My Trip/ }));

    await waitFor(() => {
      expect(onTripIdChange).toHaveBeenCalledWith(null);
    });
  });
});
