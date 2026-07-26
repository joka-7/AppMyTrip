// A trip's photo_album_url, an activity's url, and appDesign's headerImageUrl/
// pwaIconUrl are all free-text strings that can arrive from untrusted places —
// an LLM response, a hand-edited/imported trip JSON file, or (for a shared
// link) whatever its admin typed. Rendered unchecked, a "javascript:" value in
// an <a href> executes on click, and "data:" is a similarly unexpected vector
// for a URL field. Restricting to http(s) at the point each one is actually
// used (an <a href>, a CSS url(), a <link>'s href) closes that off without
// having to trust — or duplicate this check across — every place the value
// could have come from.
export function safeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  if (!trimmed) return null;
  try {
    // Relative URLs (e.g. "/logo.png") have no protocol and resolve safely
    // against the current origin — only a URL with an *explicit*, non-http(s)
    // scheme (javascript:, data:, vbscript:, file:, …) needs to be rejected.
    const parsed = new URL(trimmed, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? trimmed : null;
  } catch {
    return null;
  }
}
