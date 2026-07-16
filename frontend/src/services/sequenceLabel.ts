// Turns a 0-based stop index into the same A, B, C … labels Google Maps uses
// for the stops along a route, so the in-app map matches the external
// "directions" link. Rolls over to AA, AB … for days with more than 26 stops.
export function sequenceLabel(index: number): string {
  let n = index;
  let label = "";
  do {
    label = String.fromCharCode(65 + (n % 26)) + label;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return label;
}
