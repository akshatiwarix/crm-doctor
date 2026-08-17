/**
 * The cohort space.
 *
 * A cohort is a conjunction of one or two terms over declared provenance
 * dimensions. Two properties of that definition are load-bearing:
 *
 * **Depth is capped at two.** Not for speed — for the multiplicity correction.
 * `stats.ts` divides the significance threshold by the number of hypotheses
 * tested, and that number has to be a real count of a real space rather than
 * an estimate of an unbounded search. Depth three would turn the correction
 * into a guess and every claim downstream with it. This is the same trade Day
 * 009 made on its rule language: expressiveness given up until exactness got
 * cheap.
 *
 * **Time is not a dimension.** Creation date is the onset axis and appears
 * nowhere here. Without that separation the same defect surfaces twice — once
 * as "elevated among records created in March" and once as "started in March"
 * — and a reader has no way to know it is one disease.
 *
 * Enumeration is over combinations that actually occur. A cohort with no
 * records is not a hypothesis anybody tested, so counting it would inflate the
 * correction and suppress real findings.
 */

import type {
  Cohort,
  CohortTerm,
  DimensionDescriptor,
  Patient,
  Registries,
} from "./types";

export interface CohortIndex {
  readonly cohorts: readonly Cohort[];
  /** Parallel to `cohorts`: the indices into `patient.records` that match. */
  readonly members: readonly (readonly number[])[];
  /** Parallel to `cohorts`: the same membership as a set, for conditioning. */
  readonly memberSets: readonly ReadonlySet<number>[];
}

function termId(term: CohortTerm): string {
  return `${term.dimension}=${term.value}`;
}

export function cohortId(terms: readonly CohortTerm[]): string {
  return [...terms].map(termId).sort().join(" & ");
}

function valueOf(
  record: Patient["records"][number],
  dimension: DimensionDescriptor,
): string | null {
  const value = record.provenance[dimension.key];
  // A record with no import batch belongs to no batch cohort. It is not a
  // member of a "none" cohort — "arrived outside any import" is not a
  // mechanism, and inventing that cohort would put every hand-created record
  // in one bucket and manufacture findings out of it.
  return value === null || value === "" ? null : value;
}

export function enumerateCohorts(
  patient: Patient,
  registries: Registries,
): CohortIndex {
  const dims = registries.dimensions;
  /** cohort id → record indices */
  const buckets = new Map<string, number[]>();
  const terms = new Map<string, CohortTerm[]>();

  const add = (id: string, cohortTerms: CohortTerm[], recordIndex: number) => {
    let bucket = buckets.get(id);
    if (bucket === undefined) {
      bucket = [];
      buckets.set(id, bucket);
      terms.set(id, cohortTerms);
    }
    bucket.push(recordIndex);
  };

  patient.records.forEach((record, index) => {
    const present: CohortTerm[] = [];
    for (const dimension of dims) {
      const value = valueOf(record, dimension);
      if (value === null) continue;
      present.push({ dimension: dimension.id, value });
    }

    for (const term of present) {
      add(cohortId([term]), [term], index);
    }
    for (let i = 0; i < present.length; i++) {
      for (let j = i + 1; j < present.length; j++) {
        const a = present[i];
        const b = present[j];
        if (a === undefined || b === undefined) continue;
        add(cohortId([a, b]), [a, b], index);
      }
    }
  });

  // Sorted by id so the enumeration — and therefore the correction, and
  // therefore every interval — is byte-identical across runs.
  const ids = [...buckets.keys()].sort();
  const cohorts: Cohort[] = [];
  const members: number[][] = [];
  const memberSets: Set<number>[] = [];

  /**
   * Two cohorts covering exactly the same records are one hypothesis described
   * two ways, not two hypotheses. Every record in the 2024-11 vendor batch
   * also has the vendor-import source, so `batch=X` and `source=Y & batch=X`
   * are the same set. Keeping both would inflate the Bonferroni denominator
   * and then report the pair as a confound — the tool solemnly declining to
   * distinguish a set from itself.
   *
   * The simpler description wins: fewest terms, then lowest id.
   */
  const seen = new Map<string, number>();

  for (const id of ids) {
    const bucket = buckets.get(id);
    const cohortTerms = terms.get(id);
    if (bucket === undefined || cohortTerms === undefined) continue;

    const signature = bucket.join(",");
    const existing = seen.get(signature);
    if (existing !== undefined) {
      const incumbent = cohorts[existing];
      if (incumbent !== undefined && cohortTerms.length < incumbent.terms.length) {
        cohorts[existing] = { id, terms: cohortTerms };
      }
      continue;
    }

    seen.set(signature, cohorts.length);
    cohorts.push({ id, terms: cohortTerms });
    members.push(bucket);
    memberSets.push(new Set(bucket));
  }

  return { cohorts, members, memberSets };
}

/**
 * Cohort → prose, using the patient's own labels rather than its ids. A
 * finding that says `owner=u-priya & source=conference` is a database row; a
 * finding that says "records owned by Priya R. that arrived through Conference
 * scan" is something a person can act on.
 */
export function describeCohort(
  cohort: Cohort,
  patient: Patient,
  registries: Registries,
): string {
  const label = (term: CohortTerm): string => {
    const dimension = registries.dimensions.find((d) => d.id === term.dimension);
    const pool =
      dimension?.key === "ownerId" ? patient.users
      : dimension?.key === "sourceId" ? patient.sources
      : dimension?.key === "importBatchId" ? patient.importBatches
      : patient.recordTypes;
    const value = pool.find((entry) => entry.id === term.value)?.label ?? term.value;
    return `${dimension?.label ?? term.dimension} ${value}`;
  };
  return cohort.terms.map(label).join(" and ");
}

/** Overlap of two cohorts as a Jaccard index. 1 means they are the same set of
 *  records, which is the situation `CONFOUNDED` exists to describe. */
export function jaccard(a: ReadonlySet<number>, b: ReadonlySet<number>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const value of small) if (large.has(value)) intersection++;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
