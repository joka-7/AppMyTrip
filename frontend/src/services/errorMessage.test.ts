import { describe, it, expect } from "vitest";
import { appendErrorDetail } from "./errorMessage";

describe("appendErrorDetail", () => {
  it("appends the detail after the friendly message", () => {
    const result = appendErrorDetail("Something went wrong.", "ECONNREFUSED at provider X");
    expect(result).toContain("Something went wrong.");
    expect(result).toContain("ECONNREFUSED at provider X");
  });

  it("returns the message unchanged when the detail is blank", () => {
    expect(appendErrorDetail("Something went wrong.", "   ")).toBe("Something went wrong.");
  });

  it("truncates a very long detail", () => {
    const longDetail = "x".repeat(300);
    const result = appendErrorDetail("Something went wrong.", longDetail);
    expect(result).toContain("…");
    expect(result.length).toBeLessThan("Something went wrong.".length + 300);
  });
});
