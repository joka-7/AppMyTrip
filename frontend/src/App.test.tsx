import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import App from "./App";
import * as api from "./api";
import type { TripData } from "./api";

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
    expect(screen.getByText("Sample Trip")).toBeInTheDocument();
    expect(screen.getByText("Museum")).toBeInTheDocument();
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
    expect(screen.getByText("טיול לדוגמה ✨")).toBeInTheDocument();
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
        sampleTrip,
        {
          directions_car: true,
          directions_transit: true,
          prices: true,
          podcast: true,
          links: true,
        },
        null,
        "gemini",
      );
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
});
