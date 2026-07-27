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

  it('"save to my account" actually publishes the trip and shows the real link', async () => {
    const trips = await import("./services/tripsStore");
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
    vi.mocked(trips.getCurrentSession).mockReturnValue({
      uid: "visitor-1",
      email: "visitor@example.com",
      displayName: "Visitor",
    });
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon - Wed", days: [] },
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
      meta: emptyMeta,
    });
    vi.mocked(trips.saveTrip).mockResolvedValue("copy-1");
    vi.mocked(trips.shareTrip).mockResolvedValue("https://example.com/?shared=copy-1");

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("הגדרות")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByText("הגדרות"));
    fireEvent.click(screen.getByText("שמירה לחשבון שלי"));

    await waitFor(() => {
      expect(trips.saveTrip).toHaveBeenCalledWith(
        "visitor-1",
        expect.objectContaining({ title: "Shared Trip" }),
        {
          appDesign: expect.objectContaining({ theme: "green" }),
          tripId: undefined,
          stage: "final",
        },
      );
    });
    // A "final app" save must actually be published (like the Share button
    // does) — not just tagged — otherwise opening it later 404s.
    await waitFor(() => {
      expect(trips.shareTrip).toHaveBeenCalledWith(
        "visitor-1",
        "copy-1",
        expect.objectContaining({ title: "Shared Trip" }),
        expect.objectContaining({ theme: "green" }),
      );
    });
    // The real, full link must be visible on screen, not just silently
    // copied or truncated in an <input>.
    await waitFor(() => {
      expect(screen.getByText("https://example.com/?shared=copy-1")).toBeInTheDocument();
    });

    // Saving again must update the same copy, not create a duplicate.
    fireEvent.click(screen.getByText("שמירה לחשבון שלי"));
    await waitFor(() => {
      expect(trips.saveTrip).toHaveBeenLastCalledWith(
        "visitor-1",
        expect.objectContaining({ title: "Shared Trip" }),
        {
          appDesign: expect.objectContaining({ theme: "green" }),
          tripId: "copy-1",
          stage: "final",
        },
      );
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

// B1/B2/B7: on a shared link there's no Step 2 of its own to remember
// enhancement choices from, and no wizard state to accidentally clobber — but
// the same two bugs (missing enrichment, stale-snapshot overwrites) applied
// here just as much as in the builder, since SharedTripViewer reimplements
// the same handlers. These lock in the fixes.
describe("App shared-trip viewer activity enrichment", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    window.history.pushState({}, "", "/?shared=trip-1");
  });

  it('enriches an activity added via the shared page\'s "+" button', async () => {
    const trips = await import("./services/tripsStore");
    const api = await import("./api");
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
    vi.mocked(trips.getCurrentSession).mockReturnValue(null);
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon - Wed", days: [{ dayNum: 1, activities: [] }] },
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
      meta: emptyMeta,
    });
    vi.mocked(api.enhanceTrip).mockImplementation(async (trip) => ({
      trip_data: {
        ...trip,
        days: trip.days.map((d) => ({
          ...d,
          activities: d.activities.map((a) => ({ ...a, price: 20 })),
        })),
      },
    }));

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: "הוספת פעילות ליום זה" })).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספת פעילות ליום זה" }));
    fireEvent.change(screen.getByPlaceholderText("שם הפעילות"), {
      target: { value: "Manually Added Spot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספה" }));

    await waitFor(() => {
      expect(screen.getByText("Manually Added Spot")).toBeInTheDocument();
    });

    expect(api.enhanceTrip).toHaveBeenCalledTimes(1);
    const [tripArg] = vi.mocked(api.enhanceTrip).mock.calls[0];
    expect(tripArg.days[0].activities.map((a) => a.title)).toEqual(["Manually Added Spot"]);
    await waitFor(() => {
      expect(screen.getByText("₪20")).toBeInTheDocument();
    });
  });

  it("enriches an activity the chat agent adds on a shared link", async () => {
    const trips = await import("./services/tripsStore");
    const api = await import("./api");
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
    vi.mocked(trips.getCurrentSession).mockReturnValue(null);
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon - Wed", days: [{ dayNum: 1, activities: [] }] },
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
      meta: emptyMeta,
    });
    const newActivity = {
      id: "a2",
      time: "13:00",
      title: "Restaurant",
      desc: "lunch",
      type: "food" as const,
      hasPodcast: false,
    };
    vi.mocked(api.agentInteract).mockResolvedValue({
      trip_data: {
        title: "Shared Trip",
        dates: "Mon - Wed",
        days: [{ dayNum: 1, activities: [newActivity] }],
      },
      agent_reply: "Added it!",
    });
    vi.mocked(api.enhanceTrip).mockResolvedValueOnce({
      trip_data: {
        title: "Shared Trip",
        dates: "Mon - Wed",
        days: [{ dayNum: 1, activities: [{ ...newActivity, price: 20 }] }],
      },
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Shared Trip")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "צ'אט AI" }));

    const chatInput = await screen.findByPlaceholderText(/ענה לסוכן/);
    fireEvent.change(chatInput, { target: { value: "תוסיף מסעדה" } });
    fireEvent.submit(chatInput.closest("form")!);

    await waitFor(() => {
      expect(api.enhanceTrip).toHaveBeenCalledTimes(1);
    });
    const [tripArg] = vi.mocked(api.enhanceTrip).mock.calls[0];
    expect(tripArg.days[0].activities.map((a) => a.id)).toEqual(["a2"]);

    fireEvent.click(screen.getByRole("button", { name: 'לו"ז' }));
    await waitFor(() => {
      expect(screen.getByText("Restaurant")).toBeInTheDocument();
    });
    expect(screen.getByText("₪20")).toBeInTheDocument();
  });

  it("normalizes duplicate/empty ids in an agent response so each activity stays independently actionable", async () => {
    const trips = await import("./services/tripsStore");
    const api = await import("./api");
    vi.mocked(trips.onAuthChange).mockImplementation(() => () => {});
    vi.mocked(trips.getCurrentSession).mockReturnValue(null);
    vi.mocked(trips.loadSharedTrip).mockResolvedValue({
      trip: { title: "Shared Trip", dates: "Mon - Wed", days: [{ dayNum: 1, activities: [] }] },
      appDesign: { ...DEFAULT_APP_DESIGN, theme: "green" },
      meta: emptyMeta,
    });
    // Simulates a chat turn whose response has duplicate/empty activity ids —
    // exactly what normalizeTripForLoad (B1) needs to fix up before the app
    // uses those ids as React keys / map badge / edit targets.
    vi.mocked(api.agentInteract).mockResolvedValue({
      trip_data: {
        title: "Shared Trip",
        dates: "Mon - Wed",
        days: [
          {
            dayNum: 1,
            activities: [
              {
                id: "",
                time: "09:00",
                title: "First Stop",
                desc: "",
                type: "attraction",
                hasPodcast: false,
              },
              {
                id: "",
                time: "10:00",
                title: "Second Stop",
                desc: "",
                type: "attraction",
                hasPodcast: false,
              },
            ],
          },
        ],
      },
      agent_reply: "Added both!",
    });
    vi.mocked(api.enhanceTrip).mockResolvedValue({
      trip_data: {
        title: "Shared Trip",
        dates: "Mon - Wed",
        days: [{ dayNum: 1, activities: [] }],
      },
    });

    const { default: App } = await import("./App");
    render(<App />);

    await waitFor(() => {
      expect(screen.getByText("Shared Trip")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "צ'אט AI" }));

    const chatInput = await screen.findByPlaceholderText(/ענה לסוכן/);
    fireEvent.change(chatInput, { target: { value: "תוסיף שתי עצירות" } });
    fireEvent.submit(chatInput.closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Added both!")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: 'לו"ז' }));
    await waitFor(() => {
      expect(screen.getByText("First Stop")).toBeInTheDocument();
      expect(screen.getByText("Second Stop")).toBeInTheDocument();
    });

    // Both activities must be independently actionable — normalization must
    // have assigned them distinct, non-empty ids rather than leaving both "".
    const deleteButtons = screen.getAllByRole("button", { name: "מחיקת פעילות" });
    expect(deleteButtons).toHaveLength(2);
    fireEvent.click(deleteButtons[0]);

    await waitFor(() => {
      expect(screen.queryByText("First Stop")).not.toBeInTheDocument();
    });
    // Deleting the first must not have removed the second (would happen if
    // both shared the same empty id).
    expect(screen.getByText("Second Stop")).toBeInTheDocument();
  });
});
