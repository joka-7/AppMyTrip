import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useState } from "react";
import { useTripEditing } from "./useTripEditing";
import type { Activity, TripData } from "../api";
import * as tripEnhance from "../services/tripEnhance";

vi.mock("../services/tripEnhance", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../services/tripEnhance")>();
  return {
    ...actual,
    enhanceActivities: vi.fn(async () => new Map()),
  };
});

const baseTrip = (): TripData => ({
  title: "T",
  dates: "Mon - Wed",
  days: [{ dayNum: 1, activities: [] }],
});

describe("useTripEditing", () => {
  beforeEach(() => {
    vi.mocked(tripEnhance.enhanceActivities).mockResolvedValue(new Map());
  });

  it("updates, adds, and deletes activities through the shared setters", async () => {
    const { result } = renderHook(() => {
      const [trip, setTrip] = useState(baseTrip());
      const editing = useTripEditing(setTrip, { prices: true });
      return { trip, ...editing };
    });

    const activity: Activity = {
      id: "a1",
      time: "10:00",
      title: "Museum",
      desc: "",
      type: "attraction",
    };

    await act(async () => {
      await result.current.handleAddActivity(0, activity);
    });
    expect(result.current.trip.days[0].activities).toHaveLength(1);
    expect(tripEnhance.enhanceActivities).toHaveBeenCalled();

    act(() => {
      result.current.handleUpdateActivity(0, "a1", { title: "Gallery" });
    });
    expect(result.current.trip.days[0].activities[0].title).toBe("Gallery");

    act(() => {
      result.current.handleDeleteActivity(0, "a1");
    });
    expect(result.current.trip.days[0].activities).toHaveLength(0);
  });

  it("adds, deletes, and moves days, keeping dayNum a gapless sequence", () => {
    const { result } = renderHook(() => {
      const [trip, setTrip] = useState<TripData>({
        title: "T",
        dates: "Mon - Wed",
        days: [
          {
            dayNum: 1,
            activities: [{ id: "a1", time: "", title: "Day 1", desc: "", type: "food" }],
          },
          { dayNum: 2, activities: [] },
          { dayNum: 3, activities: [] },
        ],
      });
      const editing = useTripEditing(setTrip, {});
      return { trip, ...editing };
    });

    act(() => {
      result.current.handleAddDay();
    });
    expect(result.current.trip.days).toHaveLength(4);
    expect(result.current.trip.days.map((d) => d.dayNum)).toEqual([1, 2, 3, 4]);

    // Move the original day 1 (with its activity) to the end.
    act(() => {
      result.current.handleMoveDay(0, 3);
    });
    expect(result.current.trip.days.map((d) => d.dayNum)).toEqual([1, 2, 3, 4]);
    expect(result.current.trip.days[3].activities[0]?.title).toBe("Day 1");
    expect(result.current.trip.days[0].activities).toHaveLength(0);

    act(() => {
      result.current.handleDeleteDay(0);
    });
    expect(result.current.trip.days).toHaveLength(3);
    expect(result.current.trip.days.map((d) => d.dayNum)).toEqual([1, 2, 3]);
    // The day that carried the activity (formerly last) is now last again.
    expect(result.current.trip.days[2].activities[0]?.title).toBe("Day 1");
  });

  it("ignores out-of-range handleMoveDay calls", () => {
    const { result } = renderHook(() => {
      const [trip, setTrip] = useState(baseTrip());
      const editing = useTripEditing(setTrip, {});
      return { trip, ...editing };
    });

    act(() => {
      result.current.handleMoveDay(0, 5);
    });
    expect(result.current.trip.days).toEqual(baseTrip().days);
  });

  it("refreshes startWeekday when dates change", () => {
    const { result } = renderHook(() => {
      const [trip, setTrip] = useState(baseTrip());
      const editing = useTripEditing(setTrip, {});
      return { trip, ...editing };
    });

    act(() => {
      result.current.handleUpdateTrip({ dates: "2026-07-20 - 2026-07-22" });
    });
    expect(result.current.trip.dates).toContain("2026-07-20");
    expect(result.current.trip.startWeekday).toBe(1); // Monday
  });

  it("merges enhancement results by id without clobbering later edits to other activities", async () => {
    vi.mocked(tripEnhance.enhanceActivities).mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 20));
      return new Map([
        [
          "a1",
          {
            id: "a1",
            time: "10:00",
            title: "Museum",
            desc: "enhanced",
            type: "attraction",
            price: 12,
          },
        ],
      ]);
    });

    const { result } = renderHook(() => {
      const [trip, setTrip] = useState<TripData>({
        ...baseTrip(),
        days: [
          {
            dayNum: 1,
            activities: [
              {
                id: "keep",
                time: "09:00",
                title: "Keep me",
                desc: "",
                type: "food",
              },
            ],
          },
        ],
      });
      const editing = useTripEditing(setTrip, { prices: true });
      return { trip, ...editing };
    });

    const addPromise = act(async () => {
      await result.current.handleAddActivity(0, {
        id: "a1",
        time: "10:00",
        title: "Museum",
        desc: "",
        type: "attraction",
      });
    });

    act(() => {
      result.current.handleDeleteActivity(0, "keep");
    });

    await addPromise;
    await waitFor(() => {
      const activities = result.current.trip.days[0].activities;
      expect(activities.map((a) => a.id)).toEqual(["a1"]);
      expect(activities[0]?.price).toBe(12);
    });
  });
});
