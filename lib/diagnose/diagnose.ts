/**
 * The pipeline.
 *
 * Detect, enumerate, test, attribute, date, and measure — in that order, as a
 * pure function of the patient and the registries. Nothing here reads a clock,
 * a network or a filesystem, so the same two arguments always produce the same
 * diagnosis, and `npm run sweep` can assert exactly that.
 *
 * The one number this file computes that the UI must repeat out loud is
 * `cohortsTested`. It is the Bonferroni denominator, it is an exact count of a
 * real space rather than an estimate, and stating it is the difference between
 * "these cohorts look bad" and "we tested this many hypotheses and these are
 * the ones that survived the correction".
 */

import { enumerateCohorts } from "./cohorts";
import { defectClassKey, defectClassOf, detect } from "./detect/index";
import { analyseDefectClass } from "./attribute";
import { bonferroniZ } from "./stats";
import type {
  Defect,
  DefectClass,
  Diagnosis,
  DiagnosisConfig,
  Finding,
  OnsetClass,
  Patient,
  Registries,
} from "./types";
import { computeVitals } from "./vitals";

export const DEFAULT_CONFIG: DiagnosisConfig = {
  minSupport: 20,
  alpha: 0.05,
  onsetThreshold: 8,
  onsetMinSide: 20,
  subsumptionTolerance: 0.02,
  confoundOverlap: 0.75,
  minLift: 2,
  defaultShareThreshold: 0.5,
  batchStampThreshold: 0.8,
  underpoweredMinDefects: 5,
  underpoweredMultiple: 2,
};

/** Ordering for display. Claims first, then the honest negatives, then the
 *  non-claims — and the sections are never summed. */
const TYPE_ORDER: Record<Finding["type"], number> = {
  LOCALIZED: 0,
  CONFOUNDED: 1,
  PERVASIVE: 2,
  UNDERPOWERED: 3,
};

export function diagnose(
  patient: Patient,
  registries: Registries,
  config: DiagnosisConfig = DEFAULT_CONFIG,
): Diagnosis {
  const defects = detect(patient, registries, config);
  const { cohorts, members } = enumerateCohorts(patient, registries);

  const indexById = new Map(patient.records.map((record, i) => [record.id, i]));
  const dateOf = (i: number) => patient.records[i]?.provenance.createdAt ?? "";

  // Population and cohort membership per object, computed once rather than per
  // defect class — there are two objects and twenty-odd classes.
  const objects = ["account", "contact"] as const;
  const byObject = new Map<
    string,
    { population: number[]; cohortMembers: number[][] }
  >();
  for (const object of objects) {
    const population: number[] = [];
    patient.records.forEach((record, i) => {
      if (record.object === object) population.push(i);
    });
    const inPopulation = new Set(population);
    byObject.set(object, {
      population,
      cohortMembers: members.map((bucket) =>
        bucket.filter((i) => inPopulation.has(i)),
      ),
    });
  }

  // Group defects into classes. The detector is part of the class, so a
  // batch-stamped industry and an `n/a` industry are two diagnoses.
  const classes = new Map<string, { defectClass: DefectClass; defects: Defect[] }>();
  for (const defect of defects) {
    const key = defectClassKey(defect);
    const entry = classes.get(key);
    if (entry === undefined) {
      classes.set(key, { defectClass: defectClassOf(defect), defects: [defect] });
    } else {
      entry.defects.push(defect);
    }
  }

  // Every (class, cohort) pair is one hypothesis. Correcting over the cohort
  // count alone would understate the family by the number of classes and quietly
  // reinflate the false-positive rate this whole design exists to hold down.
  const cohortsTested = classes.size * cohorts.length;
  const z = bonferroniZ(config.alpha, cohortsTested);

  const findings: Finding[] = [];
  // Sorted by key so the output is byte-identical across runs.
  for (const key of [...classes.keys()].sort()) {
    const entry = classes.get(key);
    if (entry === undefined) continue;
    const scope = byObject.get(entry.defectClass.object);
    if (scope === undefined) continue;

    const defective = new Set<number>();
    for (const defect of entry.defects) {
      const index = indexById.get(defect.recordId);
      if (index !== undefined) defective.add(index);
    }

    findings.push(
      ...analyseDefectClass({
        defectClass: entry.defectClass,
        population: scope.population,
        defective,
        cohorts,
        cohortMembers: scope.cohortMembers,
        z,
        cohortsTested,
        dateOf,
        config,
      }),
    );
  }

  findings.sort(
    (a, b) =>
      TYPE_ORDER[a.type] - TYPE_ORDER[b.type] ||
      ONSET_ORDER[onsetOf(a)] - ONSET_ORDER[onsetOf(b)] ||
      severityOf(b) - severityOf(a) ||
      (defectClassKey(a.defectClass) < defectClassKey(b.defectClass) ? -1 : 1),
  );

  return {
    patientId: patient.id,
    vitals: computeVitals(patient, defects),
    findings,
    defects,
    cohortsTested,
    config,
  };
}

/**
 * Still happening, then always been true, then stopped.
 *
 * This is a categorical sort on a typed attribute, exactly like sorting by
 * finding type — not a severity number, and nothing is weighted or summed. It
 * earns its place because a defect that stopped in January and one that is
 * running today need different things done about them today, and a list that
 * interleaves them makes the reader work that out one card at a time.
 */
const ONSET_ORDER: Record<OnsetClass | "none", number> = {
  ONSET: 0,
  CHRONIC: 1,
  HEALED: 2,
  none: 1,
};

function onsetOf(finding: Finding): OnsetClass | "none" {
  return finding.type === "LOCALIZED" ? finding.onset.class : "none";
}

/**
 * How many records a finding is about — used only to order a list.
 *
 * This is deliberately not a score and is never rendered. It is a count of
 * affected records, it never mixes defect classes, and nothing in the UI sums
 * or displays it. Sorting a list is the one thing a number like this may do
 * here; the moment it appears on screen it becomes the "CRM health: 68%" this
 * repo exists to refuse.
 */
function severityOf(finding: Finding): number {
  switch (finding.type) {
    case "LOCALIZED":
      return finding.inside.defective;
    case "CONFOUNDED":
      return finding.rates[0]?.defective ?? 0;
    case "PERVASIVE":
      return finding.overall.defective;
    case "UNDERPOWERED":
      return finding.inside.defective;
  }
}

export function claimed(findings: readonly Finding[]) {
  return findings.filter((f) => f.type !== "UNDERPOWERED");
}

export function underpowered(findings: readonly Finding[]) {
  return findings.filter((f) => f.type === "UNDERPOWERED");
}
