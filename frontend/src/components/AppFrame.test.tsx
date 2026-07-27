import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { createRef } from "react";
import AppFrame from "./AppFrame";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

vi.mock("./MapView", () => ({
  default: () => <div data-testid="map-view">Map</div>,
}));

const trip: TripData = {
  title: "Frame Trip",
  dates: "Mon - Tue",
  days: [
    {
      dayNum: 1,
      activities: [
        {
          id: "a1",
          time: "10:00",
          title: "Museum",
          desc: "A stop",
          type: "attraction",
          price: 12,
        },
      ],
    },
  ],
};

describe("AppFrame", () => {
  it("renders the trip header and switches between itinerary and price tabs", () => {
    render(
      <AppFrame
        tripData={trip}
        appDesign={DEFAULT_APP_DESIGN}
        agentMessages={[]}
        chatInput=""
        onChangeChatInput={vi.fn()}
        onSendMessage={vi.fn()}
        chatEndRef={createRef()}
        onUpdateActivity={vi.fn()}
        onUpdateTrip={vi.fn()}
      />,
    );

    expect(screen.getByText("Frame Trip")).toBeInTheDocument();
    expect(screen.getByText("Museum")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "תמחור" }));
    expect(screen.getByText(/סה"כ לטיול|Total/i)).toBeInTheDocument();
  });

  it("shows the empty-state copy when the trip has no days", () => {
    render(
      <AppFrame
        tripData={{ title: "", dates: "", days: [] }}
        appDesign={DEFAULT_APP_DESIGN}
        agentMessages={[]}
        chatInput=""
        onChangeChatInput={vi.fn()}
        onSendMessage={vi.fn()}
        chatEndRef={createRef()}
        onUpdateActivity={vi.fn()}
        onUpdateTrip={vi.fn()}
      />,
    );
    expect(screen.getByText(/הזינו את תיאור הטיול/)).toBeInTheDocument();
  });
});
