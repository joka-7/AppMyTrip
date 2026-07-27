import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { createRef } from "react";
import SharedAppPage from "./SharedAppPage";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

vi.mock("../services/tripsStore", () => ({
  getCurrentSession: vi.fn(() => null),
  signInWithGoogle: vi.fn(),
  saveTrip: vi.fn(),
  shareTrip: vi.fn(),
}));

vi.mock("../hooks/useTripBranding", () => ({
  useTripBranding: vi.fn(),
}));

vi.mock("./AppFrame", () => ({
  default: () => <div data-testid="app-frame">App frame</div>,
}));

const trip: TripData = { title: "Shared", dates: "Mon", days: [{ dayNum: 1, activities: [] }] };

describe("SharedAppPage", () => {
  it("shows settings and lets a visitor save to their account", async () => {
    const trips = await import("../services/tripsStore");
    vi.mocked(trips.getCurrentSession).mockReturnValue({
      uid: "v1",
      email: "v@example.com",
      displayName: "V",
    });
    vi.mocked(trips.saveTrip).mockResolvedValue("copy-1");
    vi.mocked(trips.shareTrip).mockResolvedValue("https://example.com/?shared=copy-1");

    render(
      <SharedAppPage
        tripData={trip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId="trip-1"
        agentMessages={[]}
        chatInput=""
        onChangeChatInput={vi.fn()}
        onSendMessage={vi.fn()}
        chatEndRef={createRef()}
        onUpdateActivity={vi.fn()}
        onAddActivity={vi.fn()}
        onUpdateTrip={vi.fn()}
        onImportTrip={vi.fn()}
        isAdmin={false}
        onSaveChanges={vi.fn()}
        onAddAdmin={vi.fn()}
        onCreateNewLink={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("הגדרות"));
    fireEvent.click(screen.getByText("שמירה לחשבון שלי"));

    await waitFor(() => {
      expect(trips.saveTrip).toHaveBeenCalled();
      expect(trips.shareTrip).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(screen.getByText("https://example.com/?shared=copy-1")).toBeInTheDocument();
    });
  });

  it("shows admin save-changes controls when isAdmin is true", async () => {
    const onSaveChanges = vi.fn().mockResolvedValue(undefined);
    render(
      <SharedAppPage
        tripData={trip}
        appDesign={DEFAULT_APP_DESIGN}
        tripId="trip-1"
        agentMessages={[]}
        chatInput=""
        onChangeChatInput={vi.fn()}
        onSendMessage={vi.fn()}
        chatEndRef={createRef()}
        onUpdateActivity={vi.fn()}
        onAddActivity={vi.fn()}
        onUpdateTrip={vi.fn()}
        onImportTrip={vi.fn()}
        isAdmin
        onSaveChanges={onSaveChanges}
        onAddAdmin={vi.fn()}
        onCreateNewLink={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("הגדרות"));
    fireEvent.click(screen.getByText("שמירת שינויים"));
    await waitFor(() => {
      expect(onSaveChanges).toHaveBeenCalled();
    });
  });
});
