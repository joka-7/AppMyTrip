export function newActivityId(): string {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `act-${Date.now()}`;
}
