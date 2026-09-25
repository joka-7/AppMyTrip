import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import FileActions from "./FileActions";
import * as icsExport from "../services/icsExport";
import * as pdfExport from "../services/pdfExport";
import * as tripFile from "../services/tripFile";
import type { TripData } from "../api";
import { DEFAULT_APP_DESIGN } from "../services/appDesign";

vi.mock("../services/icsExport", () => ({ exportTripToIcs: vi.fn() }));
vi.mock("../services/pdfExport", () => ({ exportTripToPdf: vi.fn() }));
vi.mock("../services/tripFile", () => ({
  exportTripToFile: vi.fn(),
  importTripFromFile: vi.fn(),
}));

const tripWithDays: TripData = {
  title: "Trip",
  dates: "Mon",
  days: [{ dayNum: 1, activities: [], checklist: [] }],
};
const emptyTrip: TripData = { title: "Trip", dates: "Mon", days: [] };

function renderActions(tripData: TripData, onImportTrip = vi.fn()) {
  const printTargetRef = { current: document.createElement("div") };
  return {
    onImportTrip,
    ...render(
      <FileActions
        tripData={tripData}
        appDesign={DEFAULT_APP_DESIGN}
        printTargetRef={printTargetRef}
        onImportTrip={onImportTrip}
      />,
    ),
  };
}

describe("FileActions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("exports the trip to a file when clicked", () => {
    renderActions(tripWithDays);
    fireEvent.click(screen.getByRole("button", { name: "ייצוא" }));
    expect(tripFile.exportTripToFile).toHaveBeenCalledWith(tripWithDays, DEFAULT_APP_DESIGN);
  });

  it("disables calendar/print/PDF export when the trip has no days yet", () => {
    renderActions(emptyTrip);
    expect(screen.getByRole("button", { name: "ייצוא ליומן" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "הדפסה" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "הורדת PDF" })).toBeDisabled();
    // Export-to-file and import stay available regardless.
    expect(screen.getByRole("button", { name: "ייצוא" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "ייבוא" })).toBeEnabled();
  });

  it("imports a file and reports success", async () => {
    vi.mocked(tripFile.importTripFromFile).mockResolvedValue({
      tripData: tripWithDays,
      appDesign: DEFAULT_APP_DESIGN,
    });
    const onImportTrip = vi.fn();
    const { container } = renderActions(emptyTrip, onImportTrip);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["{}"], "trip.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(onImportTrip).toHaveBeenCalledWith(tripWithDays, DEFAULT_APP_DESIGN);
    });
    expect(screen.getByText("הטיול יובא מהקובץ.")).toBeInTheDocument();
  });

  it("shows the import failure reason instead of a silent failure", async () => {
    vi.mocked(tripFile.importTripFromFile).mockRejectedValue(new Error("bad file"));
    const { container } = renderActions(emptyTrip);

    const input = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["not json"], "trip.json", { type: "application/json" });
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("bad file")).toBeInTheDocument();
    });
  });

  // Regression guard: this notice used to live only inside CloudMenu's
  // signed-in dropdown, so a PDF export failure while signed out had nowhere
  // to render (see the module docstring). FileActions owns its own notice now.
  it("reports a PDF export failure", async () => {
    vi.mocked(pdfExport.exportTripToPdf).mockRejectedValue(new Error("render failed"));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderActions(tripWithDays);

    fireEvent.click(screen.getByRole("button", { name: "הורדת PDF" }));

    await waitFor(() => {
      expect(screen.getByText("יצירת ה-PDF נכשלה.")).toBeInTheDocument();
    });
    consoleErrorSpy.mockRestore();
  });

  it("exports to the calendar and prints when the trip has days", () => {
    const printSpy = vi.spyOn(window, "print").mockImplementation(() => {});
    renderActions(tripWithDays);

    fireEvent.click(screen.getByRole("button", { name: "ייצוא ליומן" }));
    expect(icsExport.exportTripToIcs).toHaveBeenCalledWith(tripWithDays);

    fireEvent.click(screen.getByRole("button", { name: "הדפסה" }));
    expect(printSpy).toHaveBeenCalled();

    printSpy.mockRestore();
  });
});
