import { describe, expect, it } from "vitest";
import { safeUrl } from "./safeUrl";

describe("safeUrl", () => {
  it("passes through http(s) URLs unchanged", () => {
    expect(safeUrl("https://example.com/album")).toBe("https://example.com/album");
    expect(safeUrl("http://example.com")).toBe("http://example.com");
  });

  it("passes through relative URLs (no explicit scheme)", () => {
    expect(safeUrl("/logo.png")).toBe("/logo.png");
  });

  it("rejects javascript: URLs", () => {
    expect(safeUrl("javascript:alert(1)")).toBeNull();
  });

  it("rejects data: URLs", () => {
    expect(safeUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
  });

  it("rejects other non-http(s) schemes", () => {
    expect(safeUrl("vbscript:msgbox(1)")).toBeNull();
    expect(safeUrl("file:///etc/passwd")).toBeNull();
  });

  it("returns null for empty/whitespace/null/undefined input", () => {
    expect(safeUrl("")).toBeNull();
    expect(safeUrl("   ")).toBeNull();
    expect(safeUrl(null)).toBeNull();
    expect(safeUrl(undefined)).toBeNull();
  });

  it("trims surrounding whitespace on an otherwise-valid URL", () => {
    expect(safeUrl("  https://example.com  ")).toBe("https://example.com");
  });
});
