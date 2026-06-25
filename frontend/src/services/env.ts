// Defensive cleanup for env vars pasted into a hosting provider's dashboard
// (e.g. Vercel) — guards against the literal value ending up wrapped in
// quotes ("like-this") or with stray whitespace/trailing slashes, which
// silently breaks things like Firebase's authDomain (DNS lookup fails on a
// hostname containing quote characters) without an obvious error message.
export function cleanEnvVar(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  let cleaned = value.trim();
  if (
    cleaned.length >= 2 &&
    ((cleaned.startsWith('"') && cleaned.endsWith('"')) ||
      (cleaned.startsWith("'") && cleaned.endsWith("'")))
  ) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  if (cleaned !== value) {
    console.warn(
      `Env var value "${value}" looked malformed (stray quotes/whitespace) — using "${cleaned}" instead. Check your hosting provider's env var settings.`,
    );
  }
  return cleaned;
}
