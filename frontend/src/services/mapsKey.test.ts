import { describe, it, expect, beforeEach } from "vitest";
import { addGoogleMapsKey, removeGoogleMapsKey, getGoogleMapsKeys } from "./mapsKey";

describe("mapsKey storage (multiple Google Maps keys)", () => {
  beforeEach(() => localStorage.clear());

  it("stores several keys in order and ignores blanks/duplicates", () => {
    addGoogleMapsKey("maps-1");
    addGoogleMapsKey("maps-2");
    addGoogleMapsKey("maps-1");
    addGoogleMapsKey("  ");
    expect(getGoogleMapsKeys()).toEqual(["maps-1", "maps-2"]);
  });

  it("removes a single key", () => {
    addGoogleMapsKey("a");
    addGoogleMapsKey("b");
    removeGoogleMapsKey("a");
    expect(getGoogleMapsKeys()).toEqual(["b"]);
  });

  it("migrates the old single-key format into a list", () => {
    localStorage.setItem("tripweaver_google_maps_key", "legacy-maps-key");
    expect(getGoogleMapsKeys()).toEqual(["legacy-maps-key"]);
    expect(localStorage.getItem("tripweaver_google_maps_key")).toBeNull();
  });
});
