import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useBackToClose } from "./useBackToClose";

describe("useBackToClose", () => {
  beforeEach(() => {
    // Each test starts from a clean history entry so pushState/back calls
    // below don't drift across tests sharing the same jsdom window.
    window.history.replaceState(null, "");
  });

  it("pushes a history entry when it opens", () => {
    const lengthBefore = window.history.length;
    renderHook(() => useBackToClose(true, vi.fn()));
    expect(window.history.length).toBe(lengthBefore + 1);
  });

  it("does not push a history entry while closed", () => {
    const lengthBefore = window.history.length;
    renderHook(() => useBackToClose(false, vi.fn()));
    expect(window.history.length).toBe(lengthBefore);
  });

  it("calls onClose on a back/popstate event while open", () => {
    const onClose = vi.fn();
    renderHook(() => useBackToClose(true, onClose));

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not react to popstate once closed again", () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }) => useBackToClose(open, onClose), {
      initialProps: { open: true },
    });

    rerender({ open: false });
    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("consumes its pushed history entry via history.back() when closed by other means (e.g. an X button)", () => {
    const backSpy = vi.spyOn(window.history, "back");
    const { rerender } = renderHook(({ open }) => useBackToClose(open, vi.fn()), {
      initialProps: { open: true },
    });

    rerender({ open: false });

    expect(backSpy).toHaveBeenCalledTimes(1);
    backSpy.mockRestore();
  });

  it("does not call history.back() when it closes via its own popstate handler", () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }) => useBackToClose(open, onClose), {
      initialProps: { open: true },
    });

    act(() => {
      window.dispatchEvent(new PopStateEvent("popstate"));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    const backSpy = vi.spyOn(window.history, "back");
    rerender({ open: false });
    expect(backSpy).not.toHaveBeenCalled();
    backSpy.mockRestore();
  });
});
