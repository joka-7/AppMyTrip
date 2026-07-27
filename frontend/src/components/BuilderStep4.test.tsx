import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import BuilderStep4 from "./BuilderStep4";
import * as trips from "../services/tripsStore";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

vi.mock("../services/tripsStore", () => ({
  getCurrentSession: vi.fn(),
  signInWithGoogle: vi.fn(),
  saveTrip: vi.fn(),
  shareTrip: vi.fn(),
}));

const trip: TripData = { title: "Design Trip", dates: "Mon", days: [] };

describe("BuilderStep4", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("renders design controls and deploys a new trip", async () => {
    vi.mocked(trips.getCurrentSession).mockReturnValue({
      uid: "u1",
      email: "a@b.com",
      displayName: "A",
    });
    vi.mocked(trips.saveTrip).mockResolvedValue("trip-9");
    vi.mocked(trips.shareTrip).mockResolvedValue("https://example.com/?shared=trip-9");
    const onSaved = vi.fn();

    render(
      <BuilderStep4
        appDesign={DEFAULT_APP_DESIGN}
        onChangeAppDesign={vi.fn()}
        tripData={trip}
        onUpdateTrip={vi.fn()}
        tripId={null}
        onSaved={onSaved}
        onBack={vi.fn()}
      />,
    );

    expect(screen.getByText(/שלב אחרון: עיצוב האפליקציה/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /שגר למכשיר/ }));

    await waitFor(() => {
      expect(trips.saveTrip).toHaveBeenCalled();
      expect(trips.shareTrip).toHaveBeenCalled();
      expect(onSaved).toHaveBeenCalledWith("trip-9", "Design Trip");
    });
    await waitFor(() => {
      expect(screen.getByDisplayValue("https://example.com/?shared=trip-9")).toBeInTheDocument();
    });
  });

  it("calls onBack when the back button is pressed", () => {
    const onBack = vi.fn();
    render(
      <BuilderStep4
        appDesign={DEFAULT_APP_DESIGN}
        onChangeAppDesign={vi.fn()}
        tripData={trip}
        onUpdateTrip={vi.fn()}
        tripId={null}
        onSaved={vi.fn()}
        onBack={onBack}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "חזרה" }));
    expect(onBack).toHaveBeenCalled();
  });
});
