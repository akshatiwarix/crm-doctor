/**
 * Present, structured like data, not data.
 *
 * This is the family the product is really about. A field that is 98%
 * populated and 40% placeholder reports as healthy on every completeness
 * dashboard ever built, and everything downstream believes it — routing fires
 * on it, scoring weights it, segmentation returns it.
 *
 * Six families. Four are per-value and could run on a single record. Two —
 * `schemaDefault` and `batchStamp` — are corpus-level: they need to know how
 * often a value occurs before they can call it counterfeit, because the same
 * string is evidence or not depending on its company.
 */

import type {
  CounterfeitFamily,
  Defect,
  DiagnosisConfig,
  FieldDescriptor,
  Patient,
  Registries,
} from "../types";
import {
  hasKeyboardRun,
  isAllPunctuation,
  isBlank,
  isSingleRepeatedCharacter,
  isUnpronounceable,
  normalize,
  shapeOf,
} from "./value";

function defect(
  recordId: string,
  object: FieldDescriptor["object"],
  field: string,
  family: CounterfeitFamily,
  observed: string,
): Defect {
  return {
    recordId,
    object,
    kind: "COUNTERFEIT",
    target: { type: "field", field },
    detector: family,
    observed,
  };
}

/** Declared meaningless: `test`, `n/a`, `unknown`, `do not use`, plus whatever
 *  the field descriptor adds. */
function isSentinel(
  value: string,
  field: FieldDescriptor,
  registries: Registries,
): boolean {
  const v = normalize(value);
  if (registries.sentinels.some((s) => normalize(s) === v)) return true;
  return (field.sentinels ?? []).some((s) => normalize(s) === v);
}

/** Nonsense with structure: keyboard runs, one repeated character, no vowels,
 *  no alphanumerics at all. */
function isStructuralNonsense(value: string): boolean {
  return (
    hasKeyboardRun(value) ||
    isSingleRepeatedCharacter(value) ||
    isUnpronounceable(value) ||
    isAllPunctuation(value)
  );
}

/** Format-valid and reserved by standard: `example.com`, `555-01xx`,
 *  `000-000-0000`. These pass every validator and mean nothing. */
function isReserved(value: string, registries: Registries): boolean {
  const v = normalize(value);
  return registries.reserved.some((token) => v.includes(normalize(token)));
}

/**
 * Per-value families. Split out so the corpus-level pass below can reuse them
 * without double-reporting a value that a cheaper family already caught.
 */
function perValueFamily(
  value: string,
  field: FieldDescriptor,
  registries: Registries,
): CounterfeitFamily | null {
  if (isSentinel(value, field, registries)) return "sentinel";
  if (isReserved(value, registries)) return "reserved";
  if (isStructuralNonsense(value)) return "structural";

  // Field shift: the string's shape disagrees with the field's declared kind.
  // Only fires when the shape is confidently something else — a phone in the
  // company field, an email in the phone field.
  const shape = shapeOf(value);
  if (shape !== null) {
    const declared = field.kind;
    const shifted =
      (declared === "phone" && shape !== "phone") ||
      (declared === "email" && shape !== "email") ||
      (declared === "url" && shape === "email") ||
      ((declared === "text" || declared === "picklist") && shape !== "url");
    if (shifted) return "fieldShift";
  }

  return null;
}

export function detectCounterfeit(
  patient: Patient,
  registries: Registries,
  config: DiagnosisConfig,
  fieldsByObject: ReadonlyMap<string, readonly FieldDescriptor[]>,
): Defect[] {
  const defects: Defect[] = [];
  /** `${object}:${field}` → value → count. Drives the two corpus-level
   *  families. */
  const shares = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  /** `${batch}:${object}:${field}` → value → count. */
  const batchShares = new Map<string, Map<string, number>>();
  const batchTotals = new Map<string, number>();

  const bump = (
    outer: Map<string, Map<string, number>>,
    totalsMap: Map<string, number>,
    key: string,
    value: string,
  ) => {
    let inner = outer.get(key);
    if (inner === undefined) {
      inner = new Map();
      outer.set(key, inner);
    }
    inner.set(value, (inner.get(value) ?? 0) + 1);
    totalsMap.set(key, (totalsMap.get(key) ?? 0) + 1);
  };

  // Pass one: per-value families, and tallies for the corpus-level pair.
  const caught = new Set<string>();
  for (const record of patient.records) {
    for (const field of fieldsByObject.get(record.object) ?? []) {
      const raw = record.fields[field.id];
      if (isBlank(raw)) continue;
      const value = raw;
      const fieldKey = `${record.object}:${field.id}`;
      bump(shares, totals, fieldKey, normalize(value));
      if (record.provenance.importBatchId !== null) {
        bump(
          batchShares,
          batchTotals,
          `${record.provenance.importBatchId}:${fieldKey}`,
          normalize(value),
        );
      }

      const family = perValueFamily(value, field, registries);
      if (family !== null) {
        defects.push(defect(record.id, record.object, field.id, family, value));
        caught.add(`${record.id}:${field.id}`);
      }
    }
  }

  // Pass two: the two families that need the whole corpus.
  for (const record of patient.records) {
    for (const field of fieldsByObject.get(record.object) ?? []) {
      const raw = record.fields[field.id];
      if (isBlank(raw)) continue;
      if (caught.has(`${record.id}:${field.id}`)) continue;
      const value = raw;
      const v = normalize(value);
      const fieldKey = `${record.object}:${field.id}`;

      // schemaDefault — requires BOTH a declared default AND an anomalous
      // share. Share alone is never enough: `United States` legitimately
      // dominates a US company's CRM, and flagging it would be the exact
      // false-confidence failure this repo exists to refuse.
      if (
        field.declaredDefault !== undefined &&
        normalize(field.declaredDefault) === v
      ) {
        const count = shares.get(fieldKey)?.get(v) ?? 0;
        const total = totals.get(fieldKey) ?? 0;
        if (total > 0 && count / total >= config.defaultShareThreshold) {
          defects.push(
            defect(record.id, record.object, field.id, "schemaDefault", value),
          );
          continue;
        }
      }

      // batchStamp — one identical non-trivial value across most of an import
      // batch. Four hundred accounts stamped `Technology` by one import is not
      // four hundred known industries.
      const batchId = record.provenance.importBatchId;
      if (batchId !== null) {
        const key = `${batchId}:${fieldKey}`;
        const count = batchShares.get(key)?.get(v) ?? 0;
        const total = batchTotals.get(key) ?? 0;
        if (
          total >= config.minSupport &&
          count / total >= config.batchStampThreshold
        ) {
          defects.push(
            defect(record.id, record.object, field.id, "batchStamp", value),
          );
        }
      }
    }
  }

  return defects;
}
