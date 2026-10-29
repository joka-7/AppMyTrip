import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import { useCancellableCalls } from "./useCancellableCalls";

describe("useCancellableCalls", () => {
  it.each([
    ["the scope stays the same", 1, 1, false],
    ["the scope changes", 1, 2, true],
  ])("when %s, a running call's cancelled state is %s", (_label, first, second, cancelled) => {
    const { result, rerender } = renderHook(({ scope }) => useCancellableCalls(scope), {
      initialProps: { scope: first },
    });
    const signal = result.current();

    rerender({ scope: second });

    expect(signal.aborted).toBe(cancelled);
  });

  it("cancels every running call on unmount, and new calls get fresh signals", () => {
    const { result, unmount, rerender } = renderHook(({ scope }) => useCancellableCalls(scope), {
      initialProps: { scope: 1 },
    });
    const before = result.current();
    rerender({ scope: 2 });
    const after = result.current();

    unmount();

    expect([before.aborted, after.aborted]).toEqual([true, true]);
    expect(after).not.toBe(before);
  });
});
