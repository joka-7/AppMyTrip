import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import SettingsMenu from "./SettingsMenu";
import * as tripFile from "../services/tripFile";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

vi.mock("../services/icsExport", () => ({ exportTripToIcs: vi.fn() }));
vi.mock("../services/pdfExport", () => ({ exportTripToPdf: vi.fn() }));
vi.mock("../services/tripFile", () => ({
  exportTripToFile: vi.fn(),
  importTripFromFile: vi.fn(),
}));

const sampleTrip: TripData = { title: "Trip", dates: "Mon", days: [] };

function renderMenu(onImportTrip = vi.fn()) {
  const printTargetRef = { current: document.createElement("div") };
  return render(
    <SettingsMenu
      tripData={sampleTrip}
      appDesign={DEFAULT_APP_DESIGN}
      printTargetRef={printTargetRef}
      onImportTrip={onImportTrip}
    />,
  );
}

describe("SettingsMenu", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    localStorage.clear();
  });

  it("is closed by default and opens on click", () => {
    renderMenu();
    expect(screen.queryByRole("menu")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "הגדרות" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();
  });

  it("groups language, AI settings, and file actions inside the dropdown", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "הגדרות" }));

    const menu = screen.getByRole("menu");
    expect(within(menu).getByText("שפה")).toBeInTheDocument();
    expect(within(menu).getByText("מפתחות API משלכם")).toBeInTheDocument();
    expect(within(menu).getByText("קובץ")).toBeInTheDocument();
    expect(within(menu).getByRole("button", { name: "ייצוא" })).toBeInTheDocument();
  });

  it("closes when Escape is pressed", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "הגדרות" }));
    expect(screen.getByRole("menu")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  // Regression guard: combining three sections here makes the dropdown tall
  // enough to cover the whole viewport on a phone — including the ⋮ button
  // that opened it — so an explicit close control has to work even when
  // outside-click and Escape aren't reachable.
  it("has an always-visible close button that dismisses the menu", () => {
    renderMenu();
    fireEvent.click(screen.getByRole("button", { name: "הגדרות" }));
    const menu = screen.getByRole("menu");

    const closeButton = within(menu).getByRole("button", { name: "סגירה" });
    expect(closeButton).toBeVisible();
    fireEvent.click(closeButton);
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("wires the import action from FileActions through to onImportTrip", async () => {
    vi.mocked(tripFile.importTripFromFile).mockResolvedValue({
      tripData: { ...sampleTrip, days: [{ dayNum: 1, activities: [], checklist: [] }] },
      appDesign: DEFAULT_APP_DESIGN,
    });
    const onImportTrip = vi.fn();
    const { container } = renderMenu(onImportTrip);
    fireEvent.click(screen.getByRole("button", { name: "הגדרות" }));

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["{}"], "trip.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });

    await screen.findByText("הטיול יובא מהקובץ.");
    expect(onImportTrip).toHaveBeenCalledTimes(1);
  });
});
