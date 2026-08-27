import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import App from "./App";
import * as api from "./api";
import { ApiError } from "./api";
import type { TripData } from "./api";
import { setLang } from "./i18n/store";

// Automocking (bare `vi.mock("./api")`) replaces ApiError's constructor too,
// so `new ApiError(status, detail)` in tests loses status/detail — keep the
// real class and only mock the network-calling functions.
vi.mock("./api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./api")>();
  return {
    ...actual,
    parseTrip: vi.fn(),
    agentInteract: vi.fn(),
    generateMedia: vi.fn(),
    enhanceTrip: vi.fn(),
  };
});
vi.mock("./services/tripsStore", () => ({
  onAuthChange: () => () => {},
  signInWithGoogle: vi.fn(),
  signOutOfGoogle: vi.fn(),
  listTrips: vi.fn(),
  saveTrip: vi.fn(),
  loadTrip: vi.fn(),
  deleteTrip: vi.fn(),
  shareTrip: vi.fn(),
  loadSharedTrip: vi.fn().mockRejectedValue(new Error("not shared")),
}));

const sampleTrip: TripData = {
  title: "Sample Trip",
  dates: "Mon - Wed",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "a1",
          time: "10:00",
          title: "Museum",
          desc: "desc",
          type: "attraction",
          hasPodcast: false,
        },
      ],
    },
  ],
};

describe("App builder flow", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("advances to step 2 and on to step 3 after skipping enhancements", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));

    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /דלג, המשך לסוכן/ }));

    await waitFor(() => {
      expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    });

    expect(screen.getByText("Welcome!")).toBeInTheDocument();
    // Live phone preview (AppFrame) is code-split — wait for it to mount.
    await waitFor(() => {
      expect(screen.getByText("Sample Trip")).toBeInTheDocument();
      expect(screen.getByText("Museum")).toBeInTheDocument();
    });
    expect(screen.queryByText(/לא הצלחנו להתחבר לשרת ה-AI/)).not.toBeInTheDocument();
  });

  it("falls back to the demo trip and shows a notice when the backend call fails", async () => {
    vi.mocked(api.parseTrip).mockRejectedValue(new Error("network down"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));

    await waitFor(() => {
      expect(screen.getByText(/לא הצלחנו להתחבר לשרת ה-AI/)).toBeInTheDocument();
    });

    expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /דלג, המשך לסוכן/ }));

    await waitFor(() => {
      expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByText("טיול לדוגמה ✨")).toBeInTheDocument();
    });
  });

  it("selects every enhancement option with the 'select all' checkbox", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });
    vi.mocked(api.enhanceTrip).mockResolvedValue({ trip_data: sampleTrip });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("בחר את כל האפשרויות"));
    fireEvent.click(screen.getByRole("button", { name: /הוסף את הפרטים שנבחרו/ }));

    await waitFor(() => {
      expect(api.enhanceTrip).toHaveBeenCalledWith(
        expect.objectContaining(sampleTrip),
        {
          directions_car: true,
          directions_transit: true,
          prices: true,
          podcast: true,
          links: true,
          travel_mode: true,
          packing: true,
        },
        [],
        "gemini",
        [],
        "legacy",
      );
    });
  });

  it("offers a one-click retry when Step 2's enhancement call fails, and it works", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });
    vi.mocked(api.enhanceTrip).mockRejectedValueOnce(new Error("network down"));

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("הוספת מחירים משוערים"));
    fireEvent.click(screen.getByRole("button", { name: /הוסף את הפרטים שנבחרו/ }));

    // The failure notice must not block the wizard from moving on...
    await waitFor(() => {
      expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    });
    expect(
      screen.getByText('הוספת הפרטים הנוספים נכשלה — ממשיכים עם הלו"ז הנוכחי.'),
    ).toBeInTheDocument();

    // ...but a retry button must be offered, re-running the exact same options.
    vi.mocked(api.enhanceTrip).mockResolvedValueOnce({
      trip_data: { ...sampleTrip, title: "Enhanced Trip" },
    });
    fireEvent.click(screen.getByRole("button", { name: "נסו שוב" }));

    await waitFor(() => {
      expect(api.enhanceTrip).toHaveBeenLastCalledWith(
        expect.objectContaining(sampleTrip),
        { prices: true },
        [],
        "gemini",
        [],
        "legacy",
      );
    });
    await waitFor(() => {
      expect(screen.getByText("Enhanced Trip")).toBeInTheDocument();
    });
    // The notice (and its retry button) must clear on success.
    expect(
      screen.queryByText('הוספת הפרטים הנוספים נכשלה — ממשיכים עם הלו"ז הנוכחי.'),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "נסו שוב" })).not.toBeInTheDocument();
  });

  it("re-applies the chosen Step 2 enhancements to activities the chat agent adds later", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });

    const newActivity = {
      id: "a2",
      time: "13:00",
      title: "Restaurant",
      desc: "lunch",
      type: "food" as const,
      hasPodcast: false,
    };
    const tripWithNewActivity: TripData = {
      ...sampleTrip,
      days: [{ dayNum: 1, activities: [...sampleTrip.days[0].activities, newActivity] }],
    };
    vi.mocked(api.agentInteract).mockResolvedValue({
      trip_data: tripWithNewActivity,
      agent_reply: "Added it!",
    });
    vi.mocked(api.enhanceTrip).mockResolvedValueOnce({ trip_data: sampleTrip });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("בחר את כל האפשרויות"));
    fireEvent.click(screen.getByRole("button", { name: /הוסף את הפרטים שנבחרו/ }));
    await waitFor(() => {
      expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    });
    vi.mocked(api.enhanceTrip).mockClear();
    vi.mocked(api.enhanceTrip).mockResolvedValueOnce({
      trip_data: {
        ...tripWithNewActivity,
        days: [{ dayNum: 1, activities: [{ ...newActivity, price: 20 }] }],
      },
    });

    fireEvent.change(screen.getByPlaceholderText(/ענה לסוכן/), {
      target: { value: "תוסיף מסעדה" },
    });
    fireEvent.submit(screen.getByPlaceholderText(/ענה לסוכן/).closest("form")!);

    await waitFor(() => {
      expect(screen.getByText("Restaurant")).toBeInTheDocument();
    });

    // the new activity should have been sent through enhanceTrip and merged back in
    expect(api.enhanceTrip).toHaveBeenCalledTimes(1);
    const [tripArg] = vi.mocked(api.enhanceTrip).mock.calls[0];
    expect(tripArg.days[0].activities.map((a) => a.id)).toEqual(["a2"]);
    expect(screen.getByText("₪20")).toBeInTheDocument();
  });

  it("shows the backend's actual failure detail alongside the friendly message on a 502", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });
    vi.mocked(api.agentInteract).mockRejectedValue(
      new ApiError(
        502,
        "LLM API rejected the request: 404 Not Found for url 'https://openrouter.ai/api/v1/chat/completions'",
      ),
    );

    render(<App />);
    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: /דלג, המשך לסוכן/ }));
    await waitFor(() => {
      expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByPlaceholderText(/ענה לסוכן/), {
      target: { value: "תוסיף יום נוסף" },
    });
    fireEvent.submit(screen.getByPlaceholderText(/ענה לסוכן/).closest("form")!);

    // Shown both in the dismissible top banner and in the chat bubble.
    await waitFor(() => {
      expect(
        screen.getAllByText((_, el) => (el?.textContent ?? "").includes("ספק ה-AI לא הצליח להשיב"))
          .length,
      ).toBeGreaterThan(0);
    });
    expect(
      screen.getAllByText((_, el) => (el?.textContent ?? "").includes("404 Not Found")).length,
    ).toBeGreaterThan(0);
  });

  it("re-applies the chosen Step 2 enhancements to an activity added manually via the '+' button", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });
    vi.mocked(api.enhanceTrip).mockResolvedValueOnce({ trip_data: sampleTrip });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText("בחר את כל האפשרויות"));
    fireEvent.click(screen.getByRole("button", { name: /הוסף את הפרטים שנבחרו/ }));
    await waitFor(() => {
      expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    });
    vi.mocked(api.enhanceTrip).mockClear();
    vi.mocked(api.enhanceTrip).mockImplementation(async (trip) => ({
      trip_data: {
        ...trip,
        days: trip.days.map((d) => ({
          ...d,
          activities: d.activities.map((a) => ({ ...a, price: 15 })),
        })),
      },
    }));

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
      expect(screen.getByText("₪15")).toBeInTheDocument();
    });
  });

  it("still enriches a manually added activity with every extra after Step 2 was skipped", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /דלג, המשך לסוכן/ }));
    await waitFor(() => {
      expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    });

    vi.mocked(api.enhanceTrip).mockImplementation(async (trip) => ({
      trip_data: {
        ...trip,
        days: trip.days.map((d) => ({
          ...d,
          activities: d.activities.map((a) => ({
            ...a,
            price: 15,
            url: "https://example.com",
            map_coordinates: { lat: 1, lng: 2 },
          })),
        })),
      },
    }));

    fireEvent.click(screen.getByRole("button", { name: "הוספת פעילות ליום זה" }));
    fireEvent.change(screen.getByPlaceholderText("שם הפעילות"), {
      target: { value: "Manually Added Spot" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספה" }));

    await waitFor(() => {
      expect(screen.getByText("Manually Added Spot")).toBeInTheDocument();
    });

    expect(api.enhanceTrip).toHaveBeenCalledTimes(1);
    const [, optionsArg] = vi.mocked(api.enhanceTrip).mock.calls[0];
    expect(optionsArg).toEqual({
      directions_car: true,
      directions_transit: true,
      prices: true,
      podcast: true,
      links: true,
    });
    await waitFor(() => {
      expect(screen.getByText("₪15")).toBeInTheDocument();
    });
  });

  it("returns to the enhancement options, not straight to step 3, after 'continue without reprocessing'", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });

    // back to step 1 — a trip already exists, so "continue without reprocessing" appears
    fireEvent.click(screen.getByRole("button", { name: "חזרה" }));
    await waitFor(() => {
      expect(screen.getByText("בוא נתחיל לבנות. ספרו לי על הטיול")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /המשך לעריכה \(ללא ניתוח מחדש\)/ }));

    // must land back on the enhancement options (step 2), not skip straight to step 3
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });
  });

  it("steps back in-app instead of exiting when the browser back button is pressed", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /דלג, המשך לסוכן/ }));
    await waitFor(() => {
      expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    });

    // Simulate the device/browser back button: this should pop the history
    // entry pushed for step 3 and bring the in-app wizard back to step 2,
    // not leave the page entirely.
    window.history.back();
    await waitFor(() => {
      expect(screen.getByText("שיפורים נוספים (אופציונלי)")).toBeInTheDocument();
    });
  });

  describe("language switch", () => {
    beforeEach(() => {
      setLang("he");
    });

    afterEach(() => {
      setLang("he");
    });

    it("updates the untouched Step 1 example text live, but never overwrites what the user typed", async () => {
      render(<App />);

      const hebrewExample = /היי, אנחנו טסים לרומא/;
      const englishExample = /Hi, we're flying to Rome/;
      expect(screen.getByDisplayValue(hebrewExample)).toBeInTheDocument();

      // Untouched: switching language updates the example text in place.
      await act(async () => {
        fireEvent.change(screen.getByRole("combobox", { name: /שפת הממשק/ }), {
          target: { value: "en" },
        });
      });
      expect(screen.getByDisplayValue(englishExample)).toBeInTheDocument();

      // Touched: once the user edits the field, further language switches
      // must leave their text alone.
      fireEvent.change(screen.getByDisplayValue(englishExample), {
        target: { value: "My own trip notes" },
      });
      await act(async () => {
        fireEvent.change(screen.getByRole("combobox", { name: /Interface language/ }), {
          target: { value: "fr" },
        });
      });
      expect(screen.getByDisplayValue("My own trip notes")).toBeInTheDocument();
    });
  });
});
