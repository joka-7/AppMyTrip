import { describe, it, expect, vi } from "vitest";
import { cleanEnvVar } from "./env";

describe("cleanEnvVar", () => {
  it("passes through a clean value unchanged", () => {
    expect(cleanEnvVar("appmytrip-96bdd.firebaseapp.com")).toBe("appmytrip-96bdd.firebaseapp.com");
  });

  it("strips accidental wrapping double quotes", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(cleanEnvVar('"appmytrip-96bdd.firebaseapp.com"')).toBe(
      "appmytrip-96bdd.firebaseapp.com",
    );
  });

  it("strips accidental wrapping single quotes and surrounding whitespace", () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(cleanEnvVar(" 'appmytrip-96bdd.firebaseapp.com' ")).toBe(
      "appmytrip-96bdd.firebaseapp.com",
    );
  });

  it("returns undefined unchanged", () => {
    expect(cleanEnvVar(undefined)).toBeUndefined();
  });
});
