/**
 * When it started, and whether it stopped.
 *
 * "Industry is missing on 39% of webinar records" is a fact. "It was 4% until
 * 14 March and 91% since" is a diagnosis, and it is the only output of this
 * tool a reader will act on the same afternoon.
 *
 * Three decisions worth defending:
 *
 * **Exhaustive, not sampled.** Every one of the N−1 splits is evaluated. The
 * series is at most a few thousand records and the criterion is two additions
 * per candidate, so there is no reason to be clever and every reason not to
 * be: a sampled change-point would make the date approximate, and a date is
 * exactly the thing a reader treats as exact.
 *
 * **One change-point, never two.** A second one would let the tool describe a
 * bounded window, which is more expressive and much easier to fit to noise.
 * One split, thresholded, is a claim that survives being wrong occasionally.
 *
 * **Three classes, not one.** `HEALED` is the whole reason this file earns its
 * place. A defect that stopped in January is scar tissue: the backfill is
 * optional and there is no leak to plug. Every hygiene product on the market
 * gives it the same red as an active incident, and that is why their output
 * gets ignored.
 *
 * Splits may only fall between two different dates. A date is the unit being
 * reported, and a split inside one would name a date whose own records sit on
 * both sides of it.
 */

import { logLikelihoodGain, rateOf } from "./stats";
import type { DiagnosisConfig, ISODate, Onset } from "./types";

export interface OnsetPoint {
  readonly date: ISODate;
  readonly defective: boolean;
}

export function detectOnset(
  points: readonly OnsetPoint[],
  config: DiagnosisConfig,
): Onset {
  // ISO strings, compared lexicographically. No date library, no clock.
  const sorted = [...points].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const n = sorted.length;
  const overall = rateOf(sorted.filter((p) => p.defective).length, n);
  const chronic: Onset = {
    class: "CHRONIC",
    at: null,
    before: overall,
    after: overall,
    gain: 0,
  };

  if (n < config.onsetMinSide * 2) return chronic;

  // Running count of defects, so each candidate split costs two lookups.
  const prefix = new Array<number>(n + 1).fill(0);
  for (let i = 0; i < n; i++) {
    prefix[i + 1] = (prefix[i] ?? 0) + (sorted[i]?.defective === true ? 1 : 0);
  }

  let best: { index: number; gain: number } | null = null;

  for (let i = config.onsetMinSide; i <= n - config.onsetMinSide; i++) {
    const here = sorted[i]?.date;
    const previous = sorted[i - 1]?.date;
    // Only between two different dates — see the note above.
    if (here === undefined || previous === undefined || here === previous) continue;

    const beforeDefective = prefix[i] ?? 0;
    const afterDefective = (prefix[n] ?? 0) - beforeDefective;
    const gain = logLikelihoodGain(beforeDefective, i, afterDefective, n - i);
    if (best === null || gain > best.gain) best = { index: i, gain };
  }

  if (best === null || best.gain < config.onsetThreshold) return chronic;

  const i = best.index;
  const beforeDefective = prefix[i] ?? 0;
  const afterDefective = (prefix[n] ?? 0) - beforeDefective;
  const before = rateOf(beforeDefective, i);
  const after = rateOf(afterDefective, n - i);

  return {
    class: after.rate > before.rate ? "ONSET" : "HEALED",
    at: sorted[i]?.date ?? null,
    before,
    after,
    gain: best.gain,
  };
}
