import { describe, it, expect, afterEach } from "vitest";
import { buildShareUrl, shareMessage, tripSlug } from "./shareLink";

/** jsdom won't navigate, but the location can be replaced wholesale. */
function setLocation(href: string) {
  const url = new URL(href);
  Object.defineProperty(window, "location", {
    configurable: true,
    value: { href: url.href, origin: url.origin, pathname: url.pathname, search: url.search },
  });
}

const originalLocation = window.location;
afterEach(() => {
  Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
});

describe("tripSlug", () => {
  it("keeps Hebrew letters — that's the whole point of a readable link", () => {
    expect(tripSlug("טיול לרומא")).toBe("טיול-לרומא");
  });

  it("slugifies an English title", () => {
    expect(tripSlug("Family trip to Rome!")).toBe("Family-trip-to-Rome");
  });

  it("drops punctuation and collapses runs of separators", () => {
    expect(tripSlug("  Rome — 2026 / spring  ")).toBe("Rome-2026-spring");
    expect(tripSlug("A “quoted” trip")).toBe("A-quoted-trip");
  });

  it("returns an empty slug for a title with nothing usable", () => {
    expect(tripSlug("")).toBe("");
    expect(tripSlug("   ")).toBe("");
    expect(tripSlug("!!! ---")).toBe("");
  });

  it("caps the length without leaving a trailing separator", () => {
    const slug = tripSlug(`${"a".repeat(58)} tail`);
    expect(slug.length).toBeLessThanOrEqual(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("buildShareUrl", () => {
  it("puts the trip name in the link, before the opaque id", () => {
    setLocation("https://appmytrip.example/");
    const url = buildShareUrl("trip-123", "טיול לרומא");
    const parsed = new URL(url);
    expect(parsed.searchParams.get("trip")).toBe("טיול-לרומא");
    expect(parsed.searchParams.get("shared")).toBe("trip-123");
    expect(url.indexOf("trip=")).toBeLessThan(url.indexOf("shared="));
  });

  // The old implementation built from window.location.href, so sharing a new
  // link from an already-open "?shared=..." page dragged the previous trip's
  // parameters into the new link.
  it("drops the current page's query instead of carrying it over", () => {
    setLocation("https://appmytrip.example/?shared=old-trip&trip=old-name&debug=1");
    const parsed = new URL(buildShareUrl("new-trip", "New Trip"));
    expect(parsed.searchParams.get("shared")).toBe("new-trip");
    expect(parsed.searchParams.get("trip")).toBe("New-Trip");
    expect(parsed.searchParams.get("debug")).toBeNull();
    expect(parsed.searchParams.getAll("shared")).toHaveLength(1);
  });

  it("keeps a non-root path, for a sub-directory deployment", () => {
    setLocation("https://example.com/apps/trip/?shared=x");
    expect(new URL(buildShareUrl("t1", "Trip")).pathname).toBe("/apps/trip/");
  });

  it("omits the slug entirely when the title has nothing usable", () => {
    setLocation("https://appmytrip.example/");
    const parsed = new URL(buildShareUrl("trip-123", "  "));
    expect(parsed.searchParams.has("trip")).toBe(false);
    expect(parsed.searchParams.get("shared")).toBe("trip-123");
  });
});

describe("shareMessage", () => {
  it("leads with the trip name and dates, then the link", () => {
    expect(shareMessage({ title: "טיול לרומא", dates: "12-19/07" }, "https://x.test/a")).toBe(
      "טיול לרומא — 12-19/07\nhttps://x.test/a",
    );
  });

  it("skips a missing date range rather than leaving a dangling dash", () => {
    expect(shareMessage({ title: "Rome", dates: "  " }, "https://x.test/a")).toBe(
      "Rome\nhttps://x.test/a",
    );
  });

  it("falls back to the bare link when there's nothing to say about the trip", () => {
    expect(shareMessage({ title: "", dates: "" }, "https://x.test/a")).toBe("https://x.test/a");
  });
});
