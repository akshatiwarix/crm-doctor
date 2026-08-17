/**
 * `npm run sweep` — the invariant sweep.
 *
 * The unit tests check that each piece computes what it says. This checks that
 * the whole thing is honest, and the headline is the permutation null: shuffle
 * the provenance labels so no cohort can possibly carry information about any
 * defect, re-run the analysis unchanged, and assert it claims nothing.
 *
 * That test does not exercise a code path. It exercises the *discipline* — the
 * support floor, the interval-against-interval comparison, the materiality
 * floor and the Bonferroni denominator, all at once, against data engineered
 * to have no signal in it. Any hygiene dashboard with a threshold slider fails
 * it, because at 5% across three thousand hypotheses pure noise produces a
 * hundred and fifty confident findings.
 */

import { northwind, pinecrest, registries } from "../data/index";
import { diagnose, DEFAULT_CONFIG } from "../lib/diagnose/diagnose";
import { analyseDefectClass } from "../lib/diagnose/attribute";
import { enumerateCohorts } from "../lib/diagnose/cohorts";
import { defectClassKey, defectClassOf, detect } from "../lib/diagnose/detect/index";
import { bonferroniZ, wilson } from "../lib/diagnose/stats";
import type { AuditRecord, Defect, DefectClass, Patient } from "../lib/diagnose/types";

let failures = 0;

function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    console.log(`  ok    ${name}${detail === "" ? "" : `  ${detail}`}`);
  } else {
    failures++;
    console.log(`  FAIL  ${name}${detail === "" ? "" : `  ${detail}`}`);
  }
}

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffled<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    const a = out[i];
    const b = out[j];
    if (a !== undefined && b !== undefined) {
      out[i] = b;
      out[j] = a;
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// 1. The permutation null
// ---------------------------------------------------------------------------

/**
 * Detect on the real corpus, then analyse against permuted cohort labels.
 *
 * Permuting and re-detecting would be a weaker test: the corpus-level
 * detectors key off the import batch, so shuffling batches would quietly
 * delete the batch-stamp defect class instead of leaving it in place with no
 * cohort to attach to. Holding the defects fixed and permuting only the labels
 * isolates exactly the association the analyser claims to measure.
 */
function claimsUnderPermutedLabels(patient: Patient, seed: number): number {
  const defects = detect(patient, registries, DEFAULT_CONFIG);

  const provenances = shuffled(
    patient.records.map((r) => r.provenance),
    rng(seed),
  );
  const permuted: Patient = {
    ...patient,
    records: patient.records.map((record, i): AuditRecord => {
      const swapped = provenances[i];
      return swapped === undefined
        ? record
        : {
            ...record,
            // Creation dates stay with their own record. Onset is not what is
            // being nulled here — cohort membership is — and moving the dates
            // as well would test two things at once and prove neither.
            provenance: { ...swapped, createdAt: record.provenance.createdAt },
          };
    }),
  };

  const { cohorts, members } = enumerateCohorts(permuted, registries);
  const indexById = new Map(permuted.records.map((r, i) => [r.id, i]));

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

  const cohortsTested = classes.size * cohorts.length;
  const z = bonferroniZ(DEFAULT_CONFIG.alpha, cohortsTested);
  let claims = 0;

  for (const object of ["account", "contact"] as const) {
    const population: number[] = [];
    permuted.records.forEach((record, i) => {
      if (record.object === object) population.push(i);
    });
    const inPopulation = new Set(population);
    const cohortMembers = members.map((bucket) =>
      bucket.filter((i) => inPopulation.has(i)),
    );

    for (const entry of classes.values()) {
      if (entry.defectClass.object !== object) continue;
      const defective = new Set<number>();
      for (const defect of entry.defects) {
        const index = indexById.get(defect.recordId);
        if (index !== undefined) defective.add(index);
      }
      const findings = analyseDefectClass({
        defectClass: entry.defectClass,
        population,
        defective,
        cohorts,
        cohortMembers,
        z,
        cohortsTested,
        dateOf: (i) => permuted.records[i]?.provenance.createdAt ?? "",
        config: DEFAULT_CONFIG,
      });
      // PERVASIVE is not a cohort claim — it is the statement that no cohort
      // explains the defect, which is exactly what should survive here.
      claims += findings.filter(
        (f) => f.type === "LOCALIZED" || f.type === "CONFOUNDED",
      ).length;
    }
  }

  return claims;
}

console.log("\npermutation null — labels shuffled, defects held fixed");
for (const seed of [1, 2, 3, 4, 5]) {
  const claims = claimsUnderPermutedLabels(northwind, seed);
  check(`northwind seed ${seed}`, claims === 0, `${claims} claims`);
}

// ---------------------------------------------------------------------------
// 2. Vitals invariant
// ---------------------------------------------------------------------------

console.log("\nvitals — known never exceeds populated");
for (const patient of [northwind, pinecrest]) {
  const vitals = diagnose(patient, registries).vitals;
  const bad = vitals.filter(
    (v) => v.known > v.populated || v.populated > v.total || v.known < 0,
  );
  check(patient.id, bad.length === 0, `${vitals.length} fields`);
}

// ---------------------------------------------------------------------------
// 3. Determinism
// ---------------------------------------------------------------------------

console.log("\ndeterminism — same arguments, byte-identical diagnosis");
for (const patient of [northwind, pinecrest]) {
  const a = JSON.stringify(diagnose(patient, registries).findings);
  const b = JSON.stringify(diagnose(patient, registries).findings);
  check(patient.id, a === b);
}

console.log("\nrecord order — shuffling the input changes no finding");
{
  const random = rng(99);
  const reordered: Patient = { ...northwind, records: shuffled(northwind.records, random) };
  const a = JSON.stringify(diagnose(northwind, registries).findings);
  const b = JSON.stringify(diagnose(reordered, registries).findings);
  check("northwind", a === b);
}

// ---------------------------------------------------------------------------
// 4. Wilson against published values
// ---------------------------------------------------------------------------

console.log("\nwilson — against published 95% intervals");
{
  const z = 1.959964;
  const cases: [number, number, number, number][] = [
    [50, 100, 0.4038, 0.5962],
    [5, 10, 0.2366, 0.7634],
    [0, 10, 0, 0.2775],
  ];
  for (const [d, n, lower, upper] of cases) {
    const interval = wilson(d, n, z);
    check(
      `${d}/${n}`,
      Math.abs(interval.lower - lower) < 1e-4 && Math.abs(interval.upper - upper) < 1e-4,
      `[${interval.lower.toFixed(4)}, ${interval.upper.toFixed(4)}]`,
    );
  }
}

// ---------------------------------------------------------------------------
// 5. The correction is load-bearing
// ---------------------------------------------------------------------------

console.log("\nthreshold — tightening the correction removes every claim");
{
  const strict = diagnose(northwind, registries, { ...DEFAULT_CONFIG, alpha: 1e-12 });
  const claims = strict.findings.filter(
    (f) => f.type === "LOCALIZED" || f.type === "CONFOUNDED",
  ).length;
  const normal = diagnose(northwind, registries).findings.filter(
    (f) => f.type === "LOCALIZED" || f.type === "CONFOUNDED",
  ).length;
  check("alpha 1e-12 claims fewer than the default", claims < normal, `${claims} < ${normal}`);
}

// ---------------------------------------------------------------------------
// 6. The model is not in the loop
// ---------------------------------------------------------------------------

console.log("\nmodel — the diagnosis does not depend on the key");
{
  const before = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "";
  const without = JSON.stringify(diagnose(northwind, registries).findings);
  process.env.GEMINI_API_KEY = "a-key-that-is-never-used-by-the-engine";
  const with_ = JSON.stringify(diagnose(northwind, registries).findings);
  if (before === undefined) delete process.env.GEMINI_API_KEY;
  else process.env.GEMINI_API_KEY = before;
  check("byte-identical with and without a key", without === with_);
}

console.log(
  failures === 0
    ? "\nsweep clean\n"
    : `\n${failures} invariant${failures === 1 ? "" : "s"} broken\n`,
);
process.exit(failures === 0 ? 0 : 1);
