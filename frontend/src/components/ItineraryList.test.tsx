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
    expect(screen.getByText("פודקאסט היסטורי")).toBeInTheDocument();
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

    fireEvent.click(screen.getByText("פודקאסט היסטורי"));
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

  it("lets the user fill in price and link when manually adding an activity, leaving location unset", () => {
    const onAddActivity = vi.fn();
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
        onAddActivity={onAddActivity}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "הוספת פעילות ליום זה" }));
    fireEvent.change(screen.getByPlaceholderText("שם הפעילות"), {
      target: { value: "New Spot" },
    });
    fireEvent.change(screen.getByText("מחיר").closest("label")!.querySelector("input")!, {
      target: { value: "42" },
    });
    fireEvent.change(screen.getByText("קישור לאתר").closest("label")!.querySelector("input")!, {
      target: { value: "https://example.com" },
    });
    // Location is picked via an embedded map (LocationPicker), left unset here.
    expect(screen.getByText(/לחצו על המפה לבחירת מיקום/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "הוספה" }));

    expect(onAddActivity).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "New Spot",
        price: 42,
        url: "https://example.com",
        map_coordinates: null,
      }),
    );
  });

  it("lets the user clear an existing location via the map picker when editing", () => {
    const onUpdateActivity = vi.fn();
    const activitiesWithCoords: Activity[] = [
      { ...activities[0], map_coordinates: { lat: 41.9, lng: 12.5 } },
    ];
    render(
      <ItineraryList
        activities={activitiesWithCoords}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={onUpdateActivity}
      />,
    );

    fireEvent.click(screen.getByLabelText("עריכת פעילות"));
    fireEvent.click(screen.getByRole("button", { name: "ניקוי מיקום" }));
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));

    expect(onUpdateActivity).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ map_coordinates: null }),
    );
  });

  it("does not show a delete button when onDeleteActivity is not provided", () => {
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
      />,
    );

    expect(screen.queryByLabelText("מחיקת פעילות")).not.toBeInTheDocument();
  });

  it("calls onDeleteActivity with the clicked activity's id", () => {
    const onDeleteActivity = vi.fn();
    render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
        onDeleteActivity={onDeleteActivity}
      />,
    );

    const deleteButtons = screen.getAllByLabelText("מחיקת פעילות");
    fireEvent.click(deleteButtons[1]);
    expect(onDeleteActivity).toHaveBeenCalledWith("a2");
  });
});

// Navigation used to live only on the map tab, and every route opened as a walk.
describe("ItineraryList navigation links", () => {
  const near: Activity[] = [
    {
      id: "n1",
      time: "09:00",
      title: "Hotel",
      desc: "",
      type: "lodging",
      map_coordinates: { lat: 41.9, lng: 12.5 },
    },
    // ~400m away — a walk.
    {
      id: "n2",
      time: "10:00",
      title: "Museum",
      desc: "",
      type: "attraction",
      map_coordinates: { lat: 41.9036, lng: 12.5 },
    },
    // ~55km away — a drive.
    {
      id: "n3",
      time: "14:00",
      title: "Castle",
      desc: "",
      type: "attraction",
      map_coordinates: { lat: 42.4, lng: 12.5 },
    },
  ];

  function renderNav(activities: Activity[]) {
    return render(
      <ItineraryList
        activities={activities}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={vi.fn()}
      />,
    );
  }

  it("offers a Google Maps link on every stop that has a location", () => {
    renderNav(near);
    expect(screen.getAllByLabelText("פתיחת המיקום ב-Google Maps")).toHaveLength(3);
  });

  it("labels each leg with the mode inferred from the distance", () => {
    renderNav(near);
    // No leg into the first stop, so only two directions links.
    expect(screen.getByLabelText("הוראות הגעה מהעצירה הקודמת (הליכה ברגל)")).toBeInTheDocument();
    expect(screen.getByLabelText("הוראות הגעה מהעצירה הקודמת (נסיעה ברכב)")).toBeInTheDocument();
  });

  it("opens the leg in that mode", () => {
    renderNav(near);
    const walk = screen.getByLabelText("הוראות הגעה מהעצירה הקודמת (הליכה ברגל)");
    expect(new URL(walk.getAttribute("href")!).searchParams.get("travelmode")).toBe("walking");
  });

  it("shows Waze only for a genuine driving leg", () => {
    renderNav(near);
    const waze = screen.getAllByRole("link", { name: /Waze/ });
    // Only the ~55km drive to the Castle. Not the 400m walk to the Museum, and
    // not the day's first stop — that has no leg into it at all, so there is no
    // journey to navigate and offering Waze there was just noise.
    expect(waze.map((link) => link.getAttribute("aria-label"))).toEqual(["ניווט ל-Castle ב-Waze"]);
    expect(waze[0].getAttribute("href")).toContain("waze.com");
  });

  it("shows no mode chip on the day's first stop", () => {
    renderNav(near);
    // Two legs for three stops.
    expect(screen.getAllByLabelText(/הוראות הגעה מהעצירה הקודמת/)).toHaveLength(2);
  });

  it("hides coordinate-based navigation for a pin the user flagged as wrong", () => {
    // A short link overrides the Maps link but can't repair the pin, so Waze and
    // directions would still lead somewhere wrong.
    renderNav([near[0], { ...near[2], map_url: "https://maps.app.goo.gl/aBcDeF" }]);
    expect(screen.queryByRole("link", { name: /Waze/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/הוראות הגעה מהעצירה הקודמת/)).not.toBeInTheDocument();
    // The pasted link itself is still offered — that one is trustworthy.
    expect(screen.getAllByLabelText("פתיחת המיקום ב-Google Maps")[1]).toHaveAttribute(
      "href",
      "https://maps.app.goo.gl/aBcDeF",
    );
  });

  it("shows no navigation at all for a stop with neither coordinates nor a link", () => {
    renderNav([{ id: "x", time: "", title: "Somewhere", desc: "", type: "attraction" }]);
    expect(screen.queryByLabelText("פתיחת המיקום ב-Google Maps")).not.toBeInTheDocument();
  });

  it("uses a pasted map_url instead of the generated coordinate link", () => {
    const pasted = "https://www.google.com/maps/place/Real/@41.5,12.1,17z";
    renderNav([{ ...near[0], map_url: pasted }]);
    expect(screen.getByLabelText("פתיחת המיקום ב-Google Maps")).toHaveAttribute("href", pasted);
  });
});

describe("ItineraryList map link editing", () => {
  const single: Activity[] = [
    {
      id: "a1",
      time: "10:00",
      title: "Wrong pin",
      desc: "",
      type: "attraction",
      map_coordinates: { lat: 1, lng: 1 },
    },
  ];

  it("repairs the pin from a pasted link that carries coordinates", () => {
    const onUpdateActivity = vi.fn();
    render(
      <ItineraryList
        activities={single}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={onUpdateActivity}
      />,
    );

    fireEvent.click(screen.getByLabelText("עריכת פעילות"));
    const pasted = "https://www.google.com/maps/place/Colosseo/@41.8902,12.4922,17z";
    fireEvent.change(screen.getByLabelText(/קישור ל-Google Maps/), { target: { value: pasted } });
    expect(screen.getByText("המיקום על המפה עודכן לפי הקישור")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));
    expect(onUpdateActivity).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({
        map_url: pasted,
        map_coordinates: { lat: 41.8902, lng: 12.4922 },
      }),
    );
  });

  it("keeps the old pin and says so for a short link with no coordinates", () => {
    const onUpdateActivity = vi.fn();
    render(
      <ItineraryList
        activities={single}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={onUpdateActivity}
      />,
    );

    fireEvent.click(screen.getByLabelText("עריכת פעילות"));
    fireEvent.change(screen.getByLabelText(/קישור ל-Google Maps/), {
      target: { value: "https://maps.app.goo.gl/aBcDeF" },
    });
    expect(
      screen.getByText("הקישור יישמר, אך לא ניתן לעדכן ממנו את הסימון על המפה"),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));
    expect(onUpdateActivity).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ map_coordinates: { lat: 1, lng: 1 } }),
    );
  });

  it("lets the user override the inferred travel mode", () => {
    const onUpdateActivity = vi.fn();
    render(
      <ItineraryList
        activities={single}
        themeClass="bg-blue-600"
        playingPodcast={null}
        onPlayPodcast={vi.fn()}
        onUpdateActivity={onUpdateActivity}
      />,
    );

    fireEvent.click(screen.getByLabelText("עריכת פעילות"));
    fireEvent.change(screen.getByLabelText(/אופן ההגעה/), { target: { value: "bicycling" } });
    fireEvent.click(screen.getByRole("button", { name: "שמירה" }));
    expect(onUpdateActivity).toHaveBeenCalledWith(
      "a1",
      expect.objectContaining({ travel_mode: "bicycling" }),
    );
  });
});
