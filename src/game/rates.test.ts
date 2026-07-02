import { describe, expect, it } from "vitest";
import { RateTracker } from "./rates";

describe("RateTracker", () => {
  it("reports windowed sum scaled to an hourly rate", () => {
    const tracker = new RateTracker(120);
    tracker.add(0, 100);
    tracker.add(1000, 100);
    // 200 over a 120s window → 200/120*3600 = 6000/hr
    expect(tracker.perHour(2000)).toBeCloseTo(6000);
  });

  it("prunes samples older than the window", () => {
    const tracker = new RateTracker(120);
    tracker.add(0, 100);
    expect(tracker.perHour(121_000)).toBe(0);
  });

  it("keeps samples exactly inside the window", () => {
    const tracker = new RateTracker(120);
    tracker.add(10_000, 60);
    expect(tracker.perHour(120_000)).toBeCloseTo((60 / 120) * 3600);
  });
});
