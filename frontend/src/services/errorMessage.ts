import { translate } from "../i18n/store";

/** Appends a short technical detail to a friendly message so the actual cause
 * is visible in the UI, without needing server log access (or, for a client-only
 * failure like a Firebase auth error, the browser console) to find out why.
 * Labeled and wrapped in Unicode bidi-isolate marks (U+2066/U+2069, invisible
 * themselves) so this often-English/URL-containing technical line doesn't get
 * visually reordered/garbled when embedded in a Hebrew (RTL) sentence —
 * without that, mixed-direction text reads as scrambled rather than just "in
 * a different language." */
export function appendErrorDetail(message: string, detail: string): string {
  const trimmed = detail.trim();
  if (!trimmed) return message;
  const short = trimmed.length > 220 ? `${trimmed.slice(0, 220)}…` : trimmed;
  const label = translate("apiError.technicalDetailLabel");
  // U+2066/U+2069 (LRI/PDI) are invisible Unicode "isolate" marks — written
  // as escapes, not literal characters, so they survive editing/diffing
  // intact. They stop the bidi algorithm from reordering this English/URL
  // text when it's embedded in a Hebrew (RTL) sentence.
  const LRI = "⁦";
  const PDI = "⁩";
  return `${message}\n${label} ${LRI}${short}${PDI}`;
}
