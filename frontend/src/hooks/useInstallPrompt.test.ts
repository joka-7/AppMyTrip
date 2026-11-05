import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";

const native = vi.hoisted(() => ({ value: false }));
vi.mock("@capacitor/core", () => ({ Capacitor: { isNativePlatform: () => native.value } }));

import { useInstallPrompt } from "./useInstallPrompt";

afterEach(() => {
  native.value = false;
});

describe("useInstallPrompt", () => {
  it.each([
    ["a browser tab", false, false],
    ["the Android app", true, true],
  ])("treats %s as installed: %s", (_name, isNative, expected) => {
    native.value = isNative;
    const { result } = renderHook(() => useInstallPrompt());
    expect(result.current.installed).toBe(expected);
    expect(result.current.canInstall).toBe(false);
  });
});
