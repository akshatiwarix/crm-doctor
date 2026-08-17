/**
 * The statistics. Hand-rolled, no library.
 *
 * Three functions, and the reason each one is here rather than a `>` on a
 * point estimate:
 *
 * **Wilson, not Wald.** Six records with five defective is 83%, and a naive
 * interval around it either runs past 1 or, at the other end, gives a
 * zero-width interval for 0/40 and claims certainty. Wilson behaves at both
 * extremes and at small n, which is exactly where a CRM audit spends its time.
 *
 * **Bonferroni over an exact count.** `cohorts.ts` enumerates a bounded space,
 * so the number of hypotheses tested is a number this code knows rather than
 * an estimate. That is the whole reason the depth cap exists. Testing a
 * thousand cohorts at 5% and reporting the ones that clear it would produce
 * fifty findings from noise alone — which is what a hygiene dashboard with a
 * threshold slider actually is.
 *
 * **Bernoulli log-likelihood for onset.** A change-point needs a criterion
 * that trades fit against the cost of asserting a split at all, or every
 * series gets a change-point wherever the noise happens to be highest.
 *
 * Every value here is checked against a published one in `stats.test.ts`.
 * Statistics written from memory and tested against themselves are not
 * evidence.
 */

import type { Interval, Rate } from "./types";

export function rateOf(defective: number, total: number): Rate {
  return { defective, total, rate: total === 0 ? 0 : defective / total };
}

/**
 * Inverse standard normal CDF — Peter Acklam's rational approximation,
 * relative error below 1.15e-9 across the whole range.
 *
 * The published refinement is a Halley step against an erfc, and it is
 * deliberately absent: the cheap Abramowitz-Stegun erfc is itself only good to
 * about 1.2e-7, so "refining" against it makes the answer worse — it moves
 * `invNorm(0.5)` off zero by 4e-8. A refinement that is less accurate than the
 * thing it refines is a decoration.
 */
export function invNorm(p: number): number {
  if (p <= 0 || p >= 1) throw new RangeError(`invNorm expects 0 < p < 1, got ${p}`);

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
             1.383577518672690e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
             6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
             -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
             3.754408661907416];

  const pLow = 0.02425;
  const pHigh = 1 - pLow;
  let x: number;

  const at = (xs: readonly number[], i: number): number => xs[i] ?? 0;

  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    x =
      (((((at(c, 0) * q + at(c, 1)) * q + at(c, 2)) * q + at(c, 3)) * q + at(c, 4)) * q + at(c, 5)) /
      ((((at(d, 0) * q + at(d, 1)) * q + at(d, 2)) * q + at(d, 3)) * q + 1);
  } else if (p <= pHigh) {
    const q = p - 0.5;
    const r = q * q;
    x =
      ((((((at(a, 0) * r + at(a, 1)) * r + at(a, 2)) * r + at(a, 3)) * r + at(a, 4)) * r + at(a, 5)) * q) /
      (((((at(b, 0) * r + at(b, 1)) * r + at(b, 2)) * r + at(b, 3)) * r + at(b, 4)) * r + 1);
  } else {
    const q = Math.sqrt(-2 * Math.log(1 - p));
    x =
      -(((((at(c, 0) * q + at(c, 1)) * q + at(c, 2)) * q + at(c, 3)) * q + at(c, 4)) * q + at(c, 5)) /
      ((((at(d, 0) * q + at(d, 1)) * q + at(d, 2)) * q + at(d, 3)) * q + 1);
  }

  return x;
}

/**
 * The critical value for one *one-sided* test at family-wise level `alpha`
 * across `tests` hypotheses.
 *
 * One-sided is the right shape: the question is only ever "is this cohort
 * WORSE than base rate", never "is it different". A two-sided threshold here
 * would be a quiet 2× loosening dressed up as conservatism.
 */
export function bonferroniZ(alpha: number, tests: number): number {
  const n = Math.max(1, tests);
  return invNorm(1 - alpha / n);
}

/**
 * Wilson score interval. `z` is the critical value, so the caller decides the
 * correction rather than this function assuming 95%.
 */
export function wilson(defective: number, total: number, z: number): Interval {
  if (total === 0) return { lower: 0, upper: 1 };
  const p = defective / total;
  const z2 = z * z;
  const denominator = 1 + z2 / total;
  const centre = (p + z2 / (2 * total)) / denominator;
  const half =
    (z * Math.sqrt((p * (1 - p)) / total + z2 / (4 * total * total))) / denominator;
  return {
    lower: Math.max(0, centre - half),
    upper: Math.min(1, centre + half),
  };
}

/** Log-likelihood of `defective` successes in `total` Bernoulli trials at the
 *  maximum-likelihood rate. Zero when the rate is 0 or 1. */
export function bernoulliLogLikelihood(defective: number, total: number): number {
  if (total === 0) return 0;
  const p = defective / total;
  if (p === 0 || p === 1) return 0;
  return defective * Math.log(p) + (total - defective) * Math.log(1 - p);
}

/**
 * How much better a two-rate model fits than one pooled rate.
 *
 * This is the criterion onset thresholds against. A split that improves fit by
 * almost nothing is noise, and reporting a date for it would be the most
 * confidently wrong thing this tool could say — a date is the one output a
 * reader will act on immediately.
 */
export function logLikelihoodGain(
  beforeDefective: number,
  beforeTotal: number,
  afterDefective: number,
  afterTotal: number,
): number {
  const split =
    bernoulliLogLikelihood(beforeDefective, beforeTotal) +
    bernoulliLogLikelihood(afterDefective, afterTotal);
  const pooled = bernoulliLogLikelihood(
    beforeDefective + afterDefective,
    beforeTotal + afterTotal,
  );
  return split - pooled;
}
