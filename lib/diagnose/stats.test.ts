import { describe, expect, it } from "vitest";
import {
  bernoulliLogLikelihood,
  bonferroniZ,
  invNorm,
  logLikelihoodGain,
  wilson,
} from "./stats";

/**
 * Statistics written from memory and tested against themselves are not
 * evidence. Every expected value below comes from a published source, not from
 * running this code and pasting the output.
 */

describe("invNorm", () => {
  it("matches the standard normal quantiles everyone has memorised", () => {
    expect(invNorm(0.975)).toBeCloseTo(1.959964, 6);
    expect(invNorm(0.95)).toBeCloseTo(1.644854, 6);
    expect(invNorm(0.99)).toBeCloseTo(2.326348, 6);
    expect(invNorm(0.999)).toBeCloseTo(3.090232, 6);
    expect(invNorm(0.5)).toBeCloseTo(0, 10);
  });

  it("is antisymmetric about a half", () => {
    for (const p of [0.001, 0.02, 0.2, 0.4]) {
      expect(invNorm(p)).toBeCloseTo(-invNorm(1 - p), 9);
    }
  });

  it("stays accurate deep in the tail, which is where the correction lives", () => {
    // Testing a thousand cohorts at alpha 0.05 puts the threshold at
    // p = 0.99995, so the approximation has to hold out there or every
    // interval is wrong by an amount nobody would notice.
    expect(invNorm(1 - 5e-5)).toBeCloseTo(3.890592, 5);
    expect(invNorm(1 - 1e-6)).toBeCloseTo(4.753424, 5);
  });

  it("refuses probabilities outside the open unit interval", () => {
    expect(() => invNorm(0)).toThrow(RangeError);
    expect(() => invNorm(1)).toThrow(RangeError);
  });
});

describe("wilson", () => {
  const z95 = 1.959964;

  it("matches published 95% Wilson intervals", () => {
    // Standard worked examples: 50/100, 5/10, 0/10.
    const half = wilson(50, 100, z95);
    expect(half.lower).toBeCloseTo(0.4038, 4);
    expect(half.upper).toBeCloseTo(0.5962, 4);

    const small = wilson(5, 10, z95);
    expect(small.lower).toBeCloseTo(0.2366, 4);
    expect(small.upper).toBeCloseTo(0.7634, 4);

    const none = wilson(0, 10, z95);
    expect(none.lower).toBe(0);
    expect(none.upper).toBeCloseTo(0.2775, 4);
  });

  it("does not claim certainty at the extremes", () => {
    // The Wald interval gives zero width for 0/40 and asserts the rate is
    // exactly 0. A CRM audit spends most of its time at the extremes, so that
    // failure mode would be the common case rather than an edge case.
    expect(wilson(0, 40, z95).upper).toBeGreaterThan(0);
    expect(wilson(40, 40, z95).lower).toBeLessThan(1);
  });

  it("never leaves the unit interval", () => {
    for (const [d, n] of [[0, 3], [3, 3], [1, 4], [19, 20]] as const) {
      const interval = wilson(d, n, 4.5);
      expect(interval.lower).toBeGreaterThanOrEqual(0);
      expect(interval.upper).toBeLessThanOrEqual(1);
    }
  });

  it("narrows as n grows at a fixed rate", () => {
    const width = (n: number) => {
      const i = wilson(n / 2, n, z95);
      return i.upper - i.lower;
    };
    expect(width(1000)).toBeLessThan(width(100));
    expect(width(100)).toBeLessThan(width(10));
  });
});

describe("bonferroniZ", () => {
  it("is the one-sided critical value at the corrected level", () => {
    expect(bonferroniZ(0.05, 1)).toBeCloseTo(invNorm(0.95), 9);
    expect(bonferroniZ(0.05, 1000)).toBeCloseTo(invNorm(1 - 0.00005), 9);
  });

  it("gets stricter as the space grows", () => {
    expect(bonferroniZ(0.05, 5000)).toBeGreaterThan(bonferroniZ(0.05, 100));
  });

  it("treats a zero-sized family as a single test rather than dividing by zero", () => {
    expect(bonferroniZ(0.05, 0)).toBe(bonferroniZ(0.05, 1));
  });
});

describe("logLikelihoodGain", () => {
  it("is zero when both sides have the same rate", () => {
    expect(logLikelihoodGain(10, 100, 20, 200)).toBeCloseTo(0, 9);
  });

  it("grows with the size of the step and with the number of records", () => {
    const small = logLikelihoodGain(5, 100, 10, 100);
    const large = logLikelihoodGain(5, 100, 90, 100);
    expect(large).toBeGreaterThan(small);

    const few = logLikelihoodGain(1, 20, 18, 20);
    const many = logLikelihoodGain(5, 100, 90, 100);
    expect(many).toBeGreaterThan(few);
  });

  it("is never negative — a two-rate model cannot fit worse than one rate", () => {
    for (const [a, b, c, d] of [[3, 40, 3, 40], [0, 10, 10, 10], [7, 13, 2, 31]] as const) {
      expect(logLikelihoodGain(a, b, c, d)).toBeGreaterThanOrEqual(-1e-9);
    }
  });

  it("agrees with the hand-computed value for a clean step", () => {
    // 0/50 then 50/50. Split log-likelihood is 0 on both sides. Pooled is
    // 50·ln(0.5) + 50·ln(0.5) = 100·ln(0.5) = -69.3147. Gain = +69.3147.
    expect(logLikelihoodGain(0, 50, 50, 50)).toBeCloseTo(69.3147, 4);
  });
});

describe("bernoulliLogLikelihood", () => {
  it("is zero at a degenerate rate and at zero trials", () => {
    expect(bernoulliLogLikelihood(0, 10)).toBe(0);
    expect(bernoulliLogLikelihood(10, 10)).toBe(0);
    expect(bernoulliLogLikelihood(0, 0)).toBe(0);
  });

  it("matches the hand-computed value at a half", () => {
    expect(bernoulliLogLikelihood(5, 10)).toBeCloseTo(10 * Math.log(0.5), 9);
  });
});
