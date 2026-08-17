/**
 * Which cohort is the cause — and when the honest answer is "this data cannot
 * say".
 *
 * Industry is missing on 91% of webinar records. It is also missing on 78% of
 * Priya's records, because Priya works most of the webinar leads. Both numbers
 * are correct. Only one of them is a diagnosis, and a tool that prints both
 * sends somebody to interrogate a colleague about a form.
 *
 * THE SUBSUMPTION RULE. For two elevated cohorts A and B, ask whether B tells
 * us anything A does not:
 *
 *   - If B has at least `minSupport` records outside A, look at them. If that
 *     residual sits at background rate, B's elevation lived entirely inside
 *     the overlap and A explains it away.
 *   - If B has fewer than `minSupport` records outside A, B is effectively
 *     contained in A, and the question becomes whether B is *sharper* than A.
 *     It is only worth reporting separately if its Wilson lower bound clears
 *     A's rate — otherwise it is the same finding with more words.
 *
 * THE REFUSAL. When A explains B and B explains A, neither is the cause as far
 * as this data is concerned. They are merged into one `CONFOUNDED` finding
 * naming all of them, and the tool declines to pick. That is not a gap in the
 * analysis; it is the analysis. Fewer than twenty records sit outside the
 * overlap, so no amount of arithmetic will separate them, and the only way to
 * find out is to go and look at how the two came to coincide.
 *
 * THE NEGATIVE RESULT. When no cohort is elevated at all, that is `PERVASIVE`
 * and it is a real finding: the field was never collected, there is no
 * incident to hunt, and the fix is a schema change rather than a conversation.
 */

import { jaccard } from "./cohorts";
import { detectOnset, type OnsetPoint } from "./onset";
import { rateOf, wilson } from "./stats";
import type {
  Cohort,
  DefectClass,
  DiagnosisConfig,
  Finding,
  ISODate,
  Interval,
  Rate,
} from "./types";

export interface ClassInput {
  readonly defectClass: DefectClass;
  /** Record indices this class could possibly apply to — one object's records. */
  readonly population: readonly number[];
  /** Record indices actually carrying the defect. */
  readonly defective: ReadonlySet<number>;
  readonly cohorts: readonly Cohort[];
  /** Parallel to `cohorts`, already restricted to `population`. */
  readonly cohortMembers: readonly (readonly number[])[];
  /** Critical value, already corrected for the whole family of tests. */
  readonly z: number;
  readonly cohortsTested: number;
  readonly dateOf: (recordIndex: number) => ISODate;
  readonly config: DiagnosisConfig;
}

interface Candidate {
  readonly index: number;
  readonly cohort: Cohort;
  readonly members: readonly number[];
  readonly memberSet: ReadonlySet<number>;
  readonly inside: Rate;
  readonly outside: Rate;
  readonly interval: Interval;
}

function rateOver(
  members: Iterable<number>,
  defective: ReadonlySet<number>,
): Rate {
  let total = 0;
  let bad = 0;
  for (const index of members) {
    total++;
    if (defective.has(index)) bad++;
  }
  return rateOf(bad, total);
}

function difference(
  a: readonly number[],
  b: ReadonlySet<number>,
): number[] {
  return a.filter((index) => !b.has(index));
}

export function analyseDefectClass(input: ClassInput): Finding[] {
  const { config, defective, defectClass, population } = input;
  const overall = rateOver(population, defective);
  const findings: Finding[] = [];

  const elevated: Candidate[] = [];

  for (const [index, cohort] of input.cohorts.entries()) {
    const members = input.cohortMembers[index] ?? [];
    if (members.length === 0) continue;
    // A cohort covering the whole population says nothing about localisation.
    if (members.length === population.length) continue;

    const memberSet = new Set(members);
    const inside = rateOver(members, defective);
    const outside = rateOver(
      population.filter((i) => !memberSet.has(i)),
      defective,
    );
    const interval = wilson(inside.defective, inside.total, input.z);
    // The background rate is an estimate too. Comparing an interval against a
    // point estimate of it treats the background as exactly known, and with a
    // small complement that is how a cohort at 3% "significantly exceeds" a
    // background of 0/91. Both sides get an interval; they must not overlap.
    const outsideInterval = wilson(outside.defective, outside.total, input.z);

    // Significance is not materiality: across three thousand records 4% versus
    // 2.5% clears any threshold and changes nothing anybody would do.
    const material = inside.rate >= outside.rate * config.minLift;

    // A non-claim is only reported when it would have been interesting had it
    // been claimable. Listing every one-record cohort would be noise wearing
    // the costume of rigour.
    const notable =
      material &&
      inside.defective >= config.underpoweredMinDefects &&
      inside.rate >= outside.rate * config.underpoweredMultiple;

    if (inside.total < config.minSupport) {
      if (notable) {
        findings.push({
          type: "UNDERPOWERED",
          defectClass,
          cohort,
          inside,
          outside,
          interval,
          reason: "MIN_SUPPORT",
        });
      }
      continue;
    }

    if (interval.lower > outsideInterval.upper && material) {
      elevated.push({ index, cohort, members, memberSet, inside, outside, interval });
    } else if (notable) {
      findings.push({
        type: "UNDERPOWERED",
        defectClass,
        cohort,
        inside,
        outside,
        interval,
        reason: "INTERVAL_OVERLAPS_BASE",
      });
    }
  }

  if (elevated.length === 0) {
    // No cohort explains it. That is a finding, not an absence of one — but
    // only once there is enough of the defect to be talking about at all.
    if (overall.defective >= config.minSupport) {
      findings.push({
        type: "PERVASIVE",
        defectClass,
        overall,
        cohortsTested: input.cohortsTested,
      });
    }
    return findings;
  }

  // ---- the subsumption relation ------------------------------------------

  /** Does A account for B's elevation? */
  const explains = (a: Candidate, b: Candidate): boolean => {
    const residual = difference(b.members, a.memberSet);
    if (residual.length >= config.minSupport) {
      // Background is measured outside both, so a large overlapping cohort
      // cannot drag the comparison toward its own rate.
      const background = rateOver(
        population.filter((i) => !a.memberSet.has(i) && !b.memberSet.has(i)),
        defective,
      );
      const residualRate = rateOver(residual, defective);
      return residualRate.rate <= background.rate + config.subsumptionTolerance;
    }
    // B is effectively inside A. It earns its own finding only by being
    // sharper than A, not merely by being narrower.
    return b.interval.lower <= a.inside.rate;
  };

  const n = elevated.length;
  const explainMatrix: boolean[][] = elevated.map((a) =>
    elevated.map((b) => (a === b ? false : explains(a, b))),
  );

  // Mutual explanation means neither is the cause. Merge into one cluster.
  const parent = elevated.map((_, i) => i);
  const find = (i: number): number => {
    let root = i;
    while ((parent[root] ?? root) !== root) root = parent[root] ?? root;
    return root;
  };
  const union = (i: number, j: number) => {
    const a = find(i);
    const b = find(j);
    if (a !== b) parent[Math.max(a, b)] = Math.min(a, b);
  };
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (explainMatrix[i]?.[j] !== true || explainMatrix[j]?.[i] !== true) continue;
      const a = elevated[i];
      const b = elevated[j];
      if (a === undefined || b === undefined) continue;

      // Containment is not confounding. `source=webinar` and `source=webinar
      // & type=standard` mutually explain each other, but one is literally
      // inside the other — that is the same finding with a redundant extra
      // term, and reporting it as "we cannot tell these apart" would be the
      // tool failing to recognise a set as a subset of itself. The broader,
      // simpler description wins and the refinement becomes attributable.
      const aInsideB = difference(a.members, b.memberSet).length === 0;
      const bInsideA = difference(b.members, a.memberSet).length === 0;
      if (aInsideB || bInsideA) {
        const subset = aInsideB ? i : j;
        const superset = subset === i ? j : i;
        const row = explainMatrix[subset];
        if (row !== undefined) row[superset] = false;
        continue;
      }

      // Mutual explanation alone is not a confound either. A broad, weakly
      // elevated container and the sharp cohort inside it explain each other
      // in the arithmetic, but they are plainly separable. Confounding is
      // specifically two cohorts drawn from *different* dimensions that turn
      // out to be very nearly the same records, so almost nothing sits outside
      // the overlap to test with.
      if (jaccard(a.memberSet, b.memberSet) >= config.confoundOverlap) {
        union(i, j);
        continue;
      }

      // Otherwise the sharper cohort is the locus and the container is
      // attributable to it.
      const sharper = a.inside.rate >= b.inside.rate ? i : j;
      const duller = sharper === i ? j : i;
      const row = explainMatrix[duller];
      if (row !== undefined) row[sharper] = false;
    }
  }

  const clusters = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    const bucket = clusters.get(root);
    if (bucket === undefined) clusters.set(root, [i]);
    else bucket.push(i);
  }

  // A cluster is dropped when every member is explained away by something
  // outside it. Its cohorts become `attributable` on whatever survived.
  const surviving: number[][] = [];
  const dropped: number[] = [];
  for (const members of clusters.values()) {
    const inCluster = new Set(members);
    const allExplained = members.every((b) =>
      elevated.some(
        (_, a) => !inCluster.has(a) && explainMatrix[a]?.[b] === true,
      ),
    );
    if (allExplained) dropped.push(...members);
    else surviving.push(members);
  }

  for (const cluster of surviving) {
    if (cluster.length > 1) {
      const members = cluster
        .map((i) => elevated[i])
        .filter((c): c is Candidate => c !== undefined)
        // Simplest first, then by id, so the rendering is stable and the
        // one-term cohort leads.
        .sort((a, b) =>
          a.cohort.terms.length - b.cohort.terms.length ||
          (a.cohort.id < b.cohort.id ? -1 : 1),
        );
      const [first, second] = members;
      findings.push({
        type: "CONFOUNDED",
        defectClass,
        cohorts: members.map((c) => c.cohort),
        rates: members.map((c) => c.inside),
        intervals: members.map((c) => c.interval),
        overlap:
          first !== undefined && second !== undefined
            ? jaccard(first.memberSet, second.memberSet)
            : 0,
      });
      continue;
    }

    const index = cluster[0];
    if (index === undefined) continue;
    const locus = elevated[index];
    if (locus === undefined) continue;

    const attributable = dropped
      .filter((b) => explainMatrix[index]?.[b] === true)
      .map((b) => elevated[b]?.cohort)
      .filter((c): c is Cohort => c !== undefined);

    const points: OnsetPoint[] = locus.members.map((recordIndex) => ({
      date: input.dateOf(recordIndex),
      defective: defective.has(recordIndex),
    }));

    findings.push({
      type: "LOCALIZED",
      defectClass,
      locus: locus.cohort,
      inside: locus.inside,
      outside: locus.outside,
      interval: locus.interval,
      onset: detectOnset(points, config),
      attributable,
    });
  }
  return findings;
}
