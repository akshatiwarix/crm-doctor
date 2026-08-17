import { describe, expect, it } from "vitest";
import { detectOnset, type OnsetPoint } from "./onset";
import type { DiagnosisConfig } from "./types";

const config: DiagnosisConfig = {
  minSupport: 20,
  alpha: 0.05,
  onsetThreshold: 8,
  onsetMinSide: 20,
  subsumptionTolerance: 0.02,
  confoundOverlap: 0.75,
  defaultShareThreshold: 0.5,
  batchStampThreshold: 0.8,
};

/** One record per day from 2025-01-01, defective according to `rate(i)`. */
function series(n: number, rate: (i: number) => number): OnsetPoint[] {
  const points: OnsetPoint[] = [];
  for (let i = 0; i < n; i++) {
    const day = 1 + i;
    const month = 1 + Math.floor((day - 1) / 28);
    const inMonth = ((day - 1) % 28) + 1;
    points.push({
      date: `2025-${String(month).padStart(2, "0")}-${String(inMonth).padStart(2, "0")}`,
      // Deterministic rather than random: a change-point test whose input
      // depends on a seed is testing the seed.
      defective: (i * 7919) % 1000 < rate(i) * 1000,
    });
  }
  return points;
}

describe("detectOnset", () => {
  it("recovers the true change-point on a clean step", () => {
    const points = series(120, (i) => (i < 60 ? 0.04 : 0.92));
    const onset = detectOnset(points, config);
    expect(onset.class).toBe("ONSET");
    expect(onset.at).toBe(points[60]?.date);
    expect(onset.before.rate).toBeLessThan(0.1);
    expect(onset.after.rate).toBeGreaterThan(0.85);
  });

  it("calls a step down HEALED", () => {
    // The whole reason this file has three classes rather than one. A defect
    // that stopped is scar tissue, and the console must not shout about it.
    const points = series(120, (i) => (i < 60 ? 0.9 : 0.03));
    const onset = detectOnset(points, config);
    expect(onset.class).toBe("HEALED");
    expect(onset.before.rate).toBeGreaterThan(onset.after.rate);
  });

  it("calls a flat series CHRONIC rather than inventing a date", () => {
    const points = series(200, () => 0.4);
    expect(detectOnset(points, config).class).toBe("CHRONIC");
    expect(detectOnset(points, config).at).toBeNull();
  });

  it("does not split a series shorter than two minimum sides", () => {
    const points = series(30, (i) => (i < 15 ? 0 : 1));
    expect(detectOnset(points, config).class).toBe("CHRONIC");
  });

  it("never splits inside a single date", () => {
    // A date is the unit being reported. A split inside one would name a date
    // whose own records sit on both sides of it.
    const points: OnsetPoint[] = [
      ...Array.from({ length: 30 }, () => ({ date: "2025-01-01", defective: false })),
      ...Array.from({ length: 30 }, () => ({ date: "2025-01-01", defective: true })),
      ...Array.from({ length: 30 }, () => ({ date: "2025-06-01", defective: true })),
    ];
    const onset = detectOnset(points, config);
    expect(onset.at).not.toBe("2025-01-01");
  });

  it("is insensitive to the order the points arrive in", () => {
    const points = series(120, (i) => (i < 60 ? 0.04 : 0.92));
    const shuffled = [...points].reverse();
    expect(detectOnset(shuffled, config)).toEqual(detectOnset(points, config));
  });

  it("declines a step too small to be worth a date, at the default threshold", () => {
    // 40% to 48% over two hundred records. The point estimate moved and a
    // dashboard would draw a line, but a date is the one output a reader acts
    // on immediately, so the bar for printing one is higher than "the number
    // went up".
    expect(detectOnset(series(200, (i) => (i < 100 ? 0.4 : 0.48)), config).class).toBe(
      "CHRONIC",
    );
  });

  it("threshold is the only thing standing between a step and a date", () => {
    const points = series(200, (i) => (i < 100 ? 0.4 : 0.85));
    expect(detectOnset(points, config).class).toBe("ONSET");
    expect(
      detectOnset(points, { ...config, onsetThreshold: 500 }).class,
    ).toBe("CHRONIC");
  });

  it("keeps both sides above the minimum support it was given", () => {
    const points = series(300, (i) => (i < 10 ? 1 : 0.02));
    const onset = detectOnset(points, { ...config, onsetMinSide: 50 });
    if (onset.at !== null) {
      expect(onset.before.total).toBeGreaterThanOrEqual(50);
      expect(onset.after.total).toBeGreaterThanOrEqual(50);
    }
  });

  it("reports the whole series on both sides when CHRONIC", () => {
    const points = series(200, () => 0.4);
    const onset = detectOnset(points, config);
    expect(onset.before).toEqual(onset.after);
    expect(onset.before.total).toBe(200);
  });
});
