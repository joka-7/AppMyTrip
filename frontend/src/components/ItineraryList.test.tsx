import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ItineraryList from "./ItineraryList";
import type { Activity } from "../api";

const activities: Activity[] = [
  { id: "a1", time: "10:00", title: "Museum", desc: "desc", type: "attraction", hasPodcast: true },
  { id: "a2", time: "13:00", title: "Lunch", desc: "desc2", type: "food", hasPodcast: false },
];

describe("ItineraryList", () => {
  it("renders each activity and a podcast trigger only when hasPodcast is true", () => {
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
      />,
    );

    expect(screen.getByText("Museum")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("פודקאסט היסטורי")).toBeInTheDocument();
  });

  it("calls onPlayPodcast with the clicked activity", () => {
    const onPlayPodcast = vi.fn();
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={onPlayPodcast}
        onUpdateActivity={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByText("פודקאסט היסטורי"));
    expect(onPlayPodcast).toHaveBeenCalledWith(activities[0]);
  });

  it("shows the playing state for the active podcast", () => {
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={activities[0]}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
      />,
    );

    expect(screen.getByText("מתנגן כעת...")).toBeInTheDocument();
  });

  it("lets the user fill in price and link when manually adding an activity, leaving location unset", () => {
    const onAddActivity = vi.fn();
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
        onAddActivity={onAddActivity}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "הוספת פעילות ליום זה" }));
    fireEvent.change(screen.getByPlaceholderText("שם הפעילות"), {
      target: { value: "New Spot" },
    });
    fireEvent.change(screen.getByText("מחיר").closest("label")!.querySelector("input")!, {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByText("קישור לאתר").closest("label")!.querySelector("input")!, {
      target: { value: "https://example.com" },
    });
    // Location is picked via an embedded map (LocationPicker), left unset here.
    expect(screen.getByText(/לחצו על המפה לבחירת מיקום/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "הוספה" }));

    expect(onAddActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New Spot",
        price: 42,
        url: "https://example.com",
        map_coordinates: null,
      }),
    );
  });

  it("lets the user clear an existing location via the map picker when editing", () => {
    const onUpdateActivity = vi.fn();
    const activitiesWithCoords: Activity[] = [
      { ...activities[0], map_coordinates: { lat: 41.9, lng: 12.5 } },
    ];
    render(
      <ItineraryList
        activities={activitiesWithCoords}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={onUpdateActivity}
      />,
    );

    fireEvent.click(screen.getByLabelText("עריכת פעילות"));
    fireEvent.click(screen.getByRole("button", { name: "ניקוי מיקום" }));
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));

    expect(onUpdateActivity).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ map_coordinates: null }),
    );
  });

  it("does not show a delete button when onDeleteActivity is not provided", () => {
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("מחיקת פעילות")).not.toBeInTheDocument();
  });

  it("calls onDeleteActivity with the clicked activity's id", () => {
    const onDeleteActivity = vi.fn();
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
        onDeleteActivity={onDeleteActivity}
      />,
    );

    const deleteButtons = screen.getAllByLabelText("מחיקת פעילות");
    fireEvent.click(deleteButtons[1]);
    expect(onDeleteActivity).toHaveBeenCalledWith("a2");
  });
});
