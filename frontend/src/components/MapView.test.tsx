import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
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
      <MapView
        activities={[activityWithCoords]}
        focusActivityId="a1"
        onClearFocus={() => {}}
      />,
    );
    const link = screen.getByRole("link", { name: "פתיחה ב-Google Maps" });
    const query = new URL(link.getAttribute("href")!).searchParams.get("query");
    expect(query).toContain("Museum");
    expect(query).toContain("41.9,12.5");
  });
});
