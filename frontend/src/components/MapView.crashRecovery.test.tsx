import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { Activity } from "../api";
import * as mapsKey from "../services/mapsKey";

// A separate file (not MapView.test.tsx) so this test gets a fresh dynamic
// import of MapView — its lazy(() => import("./GoogleMapView")) wrapper
// resolves (and caches) only once per module instance, and MapView.test.tsx
// already exercises that resolution for a different stub.

const activityWithCoords: Activity = {
  id: "a1",
  time: "10:00",
  title: "Museum",
  desc: "desc",
  type: "attraction",
  map_coordinates: { lat: 41.9, lng: 12.5 },
};

describe("MapView Google Maps crash recovery", () => {
  it("falls back to OpenStreetMap instead of crashing the whole app when the Google Maps subtree throws", async () => {
    // Regression test for the real-world crash: "Cannot read properties of
    // undefined (reading 'setAt')" — a Google Maps SDK internal error thrown
    // deep inside its render/effect cycle. GoogleMapsErrorBoundary should
    // contain it to the map tab, not take down the whole app.
    vi.spyOn(mapsKey, "getGoogleMapsKeys").mockReturnValue(["some-key"]);
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("./GoogleMapView", () => ({
      default: () => {
        throw new Error("Cannot read properties of undefined (reading 'setAt')");
      },
    }));

    const { default: MapView } = await import("./MapView");
    const { container } = render(<MapView activities={[activityWithCoords]} />);

    await waitFor(() => {
      expect(container.querySelector(".leaflet-container")).toBeInTheDocument();
    });
    expect(screen.getByText(/חזרנו למפת OpenStreetMap/)).toBeInTheDocument();

    vi.doUnmock("./GoogleMapView");
  });
});
