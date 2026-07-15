import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect } from "react";
import MapView from "./MapView";
import type { Activity } from "../api";
import * as mapsKey from "../services/mapsKey";

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

  it("links to Google Maps by place name biased to its coordinates when focused on a single activity", () => {
    render(
      <MapView activities={[activityWithCoords]} focusActivityId="a1" onClearFocus={() => {}} />,
    );
    const link = screen.getByRole("link", { name: "פתיחה ב-Google Maps" });
    const href = link.getAttribute("href")!;
    // Named place biased to its coordinates via the valid path form — not the
    // old "name @lat,lng" query that Google failed to resolve.
    expect(href).toBe("https://www.google.com/maps/search/Museum/@41.9,12.5,15z");
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

  it("falls back to the OpenStreetMap map (instead of a dead Google Maps overlay) once every Google Maps key fails", async () => {
    // Regression test: previously, when a configured Google Maps key was
    // invalid/quota'd/wrong-referrer, Google's own broken "Oops!" overlay was
    // left on screen with no way back to a working map.
    vi.spyOn(mapsKey, "getGoogleMapsKeys").mockReturnValue(["bad-key"]);
    function StubGoogleMapView({ onAllKeysFailed }: { onAllKeysFailed: () => void }) {
      useEffect(() => onAllKeysFailed(), [onAllKeysFailed]);
      return null;
    }
    vi.doMock("./GoogleMapView", () => ({ default: StubGoogleMapView }));

    const { container } = render(<MapView activities={[activityWithCoords]} />);

    await waitFor(() => {
      expect(container.querySelector(".leaflet-container")).toBeInTheDocument();
    });
    expect(screen.getByText(/חזרנו למפת OpenStreetMap/)).toBeInTheDocument();

    vi.doUnmock("./GoogleMapView");
  });
});
