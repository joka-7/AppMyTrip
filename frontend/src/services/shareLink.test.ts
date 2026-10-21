import { describe, it, expect, afterEach } from "vitest";
import { buildShareUrl, shareMessage } from "./shareLink";

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

describe("buildShareUrl", () => {
  it("puts the key in the #fragment, which browsers never send to a server", () => {
    setLocation("https://appmytrip.example/");
    const parsed = new URL(buildShareUrl("share-123", "key_ABC-def"));
    expect(parsed.searchParams.get("shared")).toBe("share-123");
    expect(new URLSearchParams(parsed.hash.slice(1)).get("k")).toBe("key_ABC-def");
    expect(parsed.search).not.toContain("key_ABC-def");
  });

  it("carries nothing readable about the trip in the URL", () => {
    setLocation("https://appmytrip.example/");
    const parsed = new URL(buildShareUrl("share-123", "k"));
    expect([...parsed.searchParams.keys()]).toEqual(["shared"]);
  });

  // The old implementation built from window.location.href, so sharing a new
  // link from an already-open "?shared=..." page dragged the previous trip's
  // parameters into the new link.
  it("drops the current page's query instead of carrying it over", () => {
    setLocation("https://appmytrip.example/?shared=old-trip&trip=old-name&debug=1");
    const parsed = new URL(buildShareUrl("new-share", "k"));
    expect(parsed.searchParams.get("shared")).toBe("new-share");
    expect(parsed.searchParams.get("debug")).toBeNull();
    expect(parsed.searchParams.getAll("shared")).toHaveLength(1);
  });

  it("keeps a non-root path, for a sub-directory deployment", () => {
    setLocation("https://example.com/apps/trip/?shared=x");
    expect(new URL(buildShareUrl("t1", "k")).pathname).toBe("/apps/trip/");
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
