import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ChecklistPanel from "./ChecklistPanel";
import type { TripData } from "../api";

const trip: TripData = {
  title: "Trip",
  dates: "01/01-03/01",
  checklist: [{ id: "t1", text: "Passport" }],
  days: [
    { dayNum: 1, activities: [], checklist: [{ id: "d1a", text: "Hiking boots" }] },
    { dayNum: 2, activities: [], checklist: [{ id: "d2a", text: "Swimsuit" }] },
  ],
};

function renderPanel(props: Partial<React.ComponentProps<typeof ChecklistPanel>> = {}) {
  return render(
    <ChecklistPanel
      tripData={trip}
      activeDayIndex={0}
      onAddItem={vi.fn()}
      onUpdateItem={vi.fn()}
      onDeleteItem={vi.fn()}
      {...props}
    />,
  );
}

describe("ChecklistPanel", () => {
  beforeEach(() => localStorage.clear());

  it("shows the trip-wide list and only the active day", () => {
    renderPanel();
    expect(screen.getByText("Passport")).toBeInTheDocument();
    expect(screen.getByText("Hiking boots")).toBeInTheDocument();
    expect(screen.queryByText("Swimsuit")).not.toBeInTheDocument();
  });

  it("shows every day once toggled", () => {
    renderPanel();
    fireEvent.click(screen.getByRole("button", { name: "הצגת כל הימים" }));
    expect(screen.getByText("Swimsuit")).toBeInTheDocument();
  });

  it("follows the day the itinerary is on", () => {
    renderPanel({ activeDayIndex: 1 });
    expect(screen.getByText("Swimsuit")).toBeInTheDocument();
    expect(screen.queryByText("Hiking boots")).not.toBeInTheDocument();
  });

  it("adds a trip-wide item with a null target and a day item with its index", () => {
    const onAddItem = vi.fn();
    renderPanel({ onAddItem });

    const [tripInput, dayInput] = screen.getAllByPlaceholderText("מה צריך לקחת?");
    fireEvent.change(tripInput, { target: { value: "Chargers" } });
    fireEvent.click(screen.getAllByRole("button", { name: /הוספה/ })[0]);
    expect(onAddItem).toHaveBeenCalledWith(null, "Chargers");

    fireEvent.change(dayInput, { target: { value: "Sunscreen" } });
    fireEvent.click(screen.getAllByRole("button", { name: /הוספה/ })[1]);
    expect(onAddItem).toHaveBeenCalledWith(0, "Sunscreen");
  });

  it("ignores a blank item", () => {
    const onAddItem = vi.fn();
    renderPanel({ onAddItem });
    fireEvent.change(screen.getAllByPlaceholderText("מה צריך לקחת?")[0], {
      target: { value: "   " },
    });
    expect(screen.getAllByRole("button", { name: /הוספה/ })[0]).toBeDisabled();
    expect(onAddItem).not.toHaveBeenCalled();
  });

  it("edits and deletes an item against the right target", () => {
    const onUpdateItem = vi.fn();
    const onDeleteItem = vi.fn();
    renderPanel({ onUpdateItem, onDeleteItem });

    fireEvent.click(screen.getByLabelText("עריכת הפריט Hiking boots"));
    fireEvent.change(screen.getByLabelText("עריכת הפריט Hiking boots"), {
      target: { value: "Trail shoes" },
    });
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));
    expect(onUpdateItem).toHaveBeenCalledWith(0, "d1a", "Trail shoes");

    fireEvent.click(screen.getByLabelText("מחיקת הפריט Passport"));
    expect(onDeleteItem).toHaveBeenCalledWith(null, "t1");
  });

  it("hides editing affordances for a read-only viewer", () => {
    render(<ChecklistPanel tripData={trip} activeDayIndex={0} />);
    expect(screen.getByText("Passport")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("מה צריך לקחת?")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("מחיקת הפריט Passport")).not.toBeInTheDocument();
  });
});

describe("ChecklistPanel ticks", () => {
  beforeEach(() => localStorage.clear());

  it("ticks an item and survives a remount", () => {
    const { unmount } = renderPanel({ ticksScope: "trip-1" });
    const passport = screen.getByRole("checkbox", { name: /Passport/ });
    expect(passport).not.toBeChecked();

    fireEvent.click(passport);
    expect(screen.getByRole("checkbox", { name: /Passport/ })).toBeChecked();
    expect(screen.getByText("1 מתוך 3 נארזו")).toBeInTheDocument();

    unmount();
    renderPanel({ ticksScope: "trip-1" });
    expect(screen.getByRole("checkbox", { name: /Passport/ })).toBeChecked();
  });

  it("keeps ticks separate per trip, since they are per-viewer not per-trip data", () => {
    const { unmount } = renderPanel({ ticksScope: "trip-1" });
    fireEvent.click(screen.getByRole("checkbox", { name: /Passport/ }));
    unmount();

    renderPanel({ ticksScope: "trip-2" });
    expect(screen.getByRole("checkbox", { name: /Passport/ })).not.toBeChecked();
  });

  it("recovers from a corrupted stored value instead of throwing", () => {
    localStorage.setItem("appmytrip.checklistTicks.trip-1", "{not json");
    renderPanel({ ticksScope: "trip-1" });
    expect(screen.getByRole("checkbox", { name: /Passport/ })).not.toBeChecked();
  });
});

describe("ChecklistPanel suggestions", () => {
  beforeEach(() => localStorage.clear());

  it("shows the suggest button only when a handler is supplied", () => {
    renderPanel();
    expect(screen.queryByRole("button", { name: /הצעות AI/ })).not.toBeInTheDocument();

    const onSuggest = vi.fn();
    renderPanel({ onSuggest });
    fireEvent.click(screen.getByRole("button", { name: /הצעות AI/ }));
    expect(onSuggest).toHaveBeenCalled();
  });

  it("disables the button while running and surfaces a failure", () => {
    renderPanel({ onSuggest: vi.fn(), isSuggesting: true });
    expect(screen.getByRole("button", { name: /מכינים הצעות/ })).toBeDisabled();

    renderPanel({ onSuggest: vi.fn(), suggestError: "לא הצלחנו" });
    expect(screen.getByText("לא הצלחנו")).toBeInTheDocument();
  });
});
