import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import MapView from "./MapView";
import type { Activity } from "../api";

const activityWithCoords: Activity = {
  id: "a1",
  time: "10:00",
  title: "Museum",
  desc: "desc",
  type: "attraction",
  map_coordinates: { lat: 41.9, lng: 12.5 },
};

const activityWithoutCoords: Activity = {
  id: "a2",
  time: "11:00",
  title: "TBD",
  desc: "desc",
  type: "food",
  map_coordinates: null,
};

describe("MapView", () => {
  it("renders a marker for each activity with coordinates", () => {
    const { container } = render(
      <MapView activities={[activityWithCoords, activityWithoutCoords]} />,
    );
    expect(container.querySelectorAll(".leaflet-marker-icon")).toHaveLength(1);
  });

  it("shows an empty state when no activities have coordinates", () => {
    render(<MapView activities={[activityWithoutCoords]} />);
    expect(screen.getByText(/אין קואורדינטות להצגה/)).toBeInTheDocument();
  });

  it("links to Google Maps by place name (not just raw coordinates) when focused on a single activity", () => {
    render(
      <MapView activities={[activityWithCoords]} focusActivityId="a1" onClearFocus={() => {}} />,
    );
    const link = screen.getByRole("link", { name: "פתיחה ב-Google Maps" });
    const query = new URL(link.getAttribute("href")!).searchParams.get("query");
    expect(query).toContain("Museum");
    expect(query).toContain("41.9,12.5");
  });

  it("shows the map (not the empty state) with an add hint when onAddActivity is provided, even with no activities", () => {
    render(<MapView activities={[activityWithoutCoords]} onAddActivity={vi.fn()} />);
    expect(screen.queryByText(/אין קואורדינטות להצגה/)).not.toBeInTheDocument();
    expect(screen.getByText(/לחצו על המפה כדי להוסיף פעילות חדשה/)).toBeInTheDocument();
  });

  it("opens a pending-activity form when the map is clicked, and calls onAddActivity on save", () => {
    const onAddActivity = vi.fn();
    const { container } = render(
      <MapView activities={[activityWithCoords]} onAddActivity={onAddActivity} />,
    );

    fireEvent.click(container.querySelector(".leaflet-container")!);
    fireEvent.change(screen.getByPlaceholderText("שם הפעילות"), {
      target: { value: "New Cafe" },
    });
    fireEvent.click(screen.getByRole("button", { name: "הוספה" }));

    expect(onAddActivity).toHaveBeenCalledWith(
      expect.objectContaining({ title: "New Cafe", type: "attraction" }),
    );
    const [[newActivity]] = onAddActivity.mock.calls;
    expect(newActivity.map_coordinates).toEqual(
      expect.objectContaining({ lat: expect.any(Number), lng: expect.any(Number) }),
    );
  });

  it("does not offer click-to-add while focused on a single activity", () => {
    const onAddActivity = vi.fn();
    const { container } = render(
      <MapView
        activities={[activityWithCoords]}
        onAddActivity={onAddActivity}
        focusActivityId="a1"
        onClearFocus={() => {}}
      />,
    );

    fireEvent.click(container.querySelector(".leaflet-container")!);
    expect(screen.queryByPlaceholderText("שם הפעילות")).not.toBeInTheDocument();
  });
});
