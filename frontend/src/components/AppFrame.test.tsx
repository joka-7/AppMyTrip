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

  it("lets the user add, reorder, and delete days from the manage-days panel", () => {
    const twoDayTrip: TripData = {
      title: "Frame Trip",
      dates: "Mon - Wed",
      days: [
        { dayNum: 1, activities: [] },
        { dayNum: 2, activities: [] },
      ],
    };
    const onAddDay = vi.fn();
    const onDeleteDay = vi.fn();
    const onMoveDay = vi.fn();

    render(
      <AppFrame
        tripData={twoDayTrip}
        appDesign={DEFAULT_APP_DESIGN}
        agentMessages={[]}
        chatInput=""
        onChangeChatInput={vi.fn()}
        onSendMessage={vi.fn()}
        chatEndRef={createRef()}
        onUpdateActivity={vi.fn()}
        onUpdateTrip={vi.fn()}
        onAddDay={onAddDay}
        onDeleteDay={onDeleteDay}
        onMoveDay={onMoveDay}
      />,
    );

    // Panel starts collapsed.
    expect(screen.queryByText("הוספת יום")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "ניהול ימים" }));
    expect(screen.getByText("הוספת יום")).toBeInTheDocument();

    fireEvent.click(screen.getByText("הוספת יום"));
    expect(onAddDay).toHaveBeenCalledTimes(1);

    const moveLaterButtons = screen.getAllByRole("button", { name: "העברה מאוחר יותר" });
    fireEvent.click(moveLaterButtons[0]);
    expect(onMoveDay).toHaveBeenCalledWith(0, 1);

    const deleteButtons = screen.getAllByRole("button", { name: "מחיקת יום" });
    fireEvent.click(deleteButtons[1]);
    expect(onDeleteDay).toHaveBeenCalledWith(1);
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
