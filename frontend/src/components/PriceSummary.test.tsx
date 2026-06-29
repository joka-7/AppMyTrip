import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import PriceSummary from "./PriceSummary";
import type { TripData } from "../api";

const tripData: TripData = {
  title: "Trip",
  dates: "",
  days: [
    {
      dayNum: 1,
      activities: [
        { id: "a1", time: "10:00", title: "Museum", desc: "", type: "attraction", price: 50 },
        { id: "a2", time: "13:00", title: "Lunch", desc: "", type: "food", price: 30 },
      ],
    },
    {
      dayNum: 2,
      activities: [
        { id: "a3", time: "09:00", title: "Hotel", desc: "", type: "lodging", price: 100 },
      ],
    },
  ],
};

describe("PriceSummary", () => {
  it("shows each day's items and subtotal, plus a grand total", () => {
    render(<PriceSummary tripData={tripData} />);

    expect(screen.getByText("Museum")).toBeInTheDocument();
    expect(screen.getByText("Lunch")).toBeInTheDocument();
    expect(screen.getByText("Hotel")).toBeInTheDocument();
    expect(screen.getByText('סה"כ לטיול')).toBeInTheDocument();
    expect(screen.getByText("180 ₪")).toBeInTheDocument();
  });

  it("shows an empty state when no prices were entered", () => {
    const empty: TripData = {
      title: "Trip",
      dates: "",
      days: [
        {
          dayNum: 1,
          activities: [{ id: "a1", time: "10:00", title: "Museum", desc: "", type: "attraction" }],
        },
      ],
    };
    render(<PriceSummary tripData={empty} />);

    expect(screen.getByText(/עדיין לא הוזנו מחירים/)).toBeInTheDocument();
  });
});
