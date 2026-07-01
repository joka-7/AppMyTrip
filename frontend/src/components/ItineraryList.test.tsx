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

  it("lets the user fill in price, link, and location directly when manually adding an activity", () => {
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
    fireEvent.change(screen.getByText("קו רוחב (lat)").closest("label")!.querySelector("input")!, {
      target: { value: "1.5" },
    });
    fireEvent.change(screen.getByText("קו אורך (lng)").closest("label")!.querySelector("input")!, {
      target: { value: "2.5" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספה" }));

    expect(onAddActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New Spot",
        price: 42,
        url: "https://example.com",
        map_coordinates: { lat: 1.5, lng: 2.5 },
      }),
    );
  });
});
