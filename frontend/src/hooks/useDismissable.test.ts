import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDismissable } from "./useDismissable";

describe("useDismissable", () => {
  it("calls onClose on Escape when open", () => {
    const onClose = vi.fn();
    renderHook(() => useDismissable(true, onClose));

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("ignores Escape when closed", () => {
    const onClose = vi.fn();
    renderHook(() => useDismissable(false, onClose));

    act(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("calls onClose on mousedown outside the container", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useDismissable(true, onClose));

    const inside = document.createElement("div");
    Object.defineProperty(result.current, "current", {
      configurable: true,
      get: () => inside,
    });

    act(() => {
      document.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on mousedown inside the container", () => {
    const onClose = vi.fn();
    const { result } = renderHook(() => useDismissable(true, onClose));

    const inside = document.createElement("div");
    document.body.appendChild(inside);
    Object.defineProperty(result.current, "current", {
      configurable: true,
      get: () => inside,
    });

    act(() => {
      inside.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });

    expect(onClose).not.toHaveBeenCalled();
    document.body.removeChild(inside);
  });
});
