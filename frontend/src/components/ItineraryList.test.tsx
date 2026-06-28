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
    expect(screen.getByText("האזן לפודקאסט היסטורי")).toBeInTheDocument();
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

    fireEvent.click(screen.getByText("האזן לפודקאסט היסטורי"));
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
});
