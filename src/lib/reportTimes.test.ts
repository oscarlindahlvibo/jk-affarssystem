import { describe, expect, it } from "vitest";
import { formatTimeRange, normalizeTime, spanMinutes } from "./reportTimes";

describe("start- och sluttid på rapporter", () => {
  it("räknar minuter mellan start och slut, även över midnatt", () => {
    expect(spanMinutes("07:30", "15:00")).toBe(450);
    expect(spanMinutes("22:00", "02:30")).toBe(270);
    expect(spanMinutes("07:30:00", "15:00:00")).toBe(450);
  });
  it("ger null för saknade eller ogiltiga klockslag", () => {
    expect(spanMinutes("07:30", null)).toBeNull();
    expect(spanMinutes("25:00", "10:00")).toBeNull();
    expect(normalizeTime("7:30")).toBeNull();
  });
  it("formaterar intervall utan sekunder", () => {
    expect(formatTimeRange("07:30:00", "15:00:00")).toBe("07:30–15:00");
    expect(formatTimeRange("07:30", null)).toBeNull();
  });
});
