import { describe, it, expect } from "vitest";
import { sequenceLabel } from "./sequenceLabel";

describe("sequenceLabel", () => {
  it("labels the first stops A, B, C …", () => {
    expect(sequenceLabel(0)).toBe("A");
    expect(sequenceLabel(1)).toBe("B");
    expect(sequenceLabel(2)).toBe("C");
    expect(sequenceLabel(25)).toBe("Z");
  });

  it("rolls over to AA, AB … past 26 stops", () => {
    expect(sequenceLabel(26)).toBe("AA");
    expect(sequenceLabel(27)).toBe("AB");
    expect(sequenceLabel(51)).toBe("AZ");
    expect(sequenceLabel(52)).toBe("BA");
  });
});
