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

  it("advances to step 3 and renders the parsed itinerary on success", async () => {
    vi.mocked(api.parseTrip).mockResolvedValue({
      trip_data: sampleTrip,
      initial_agent_message: "Welcome!",
    });

    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: /צור מבנה אפליקציה ראשוני/ }));

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

    expect(screen.getByText("סוכן השלמות AI")).toBeInTheDocument();
    expect(screen.getByText("טיול לדוגמה ✨")).toBeInTheDocument();
  });
});
