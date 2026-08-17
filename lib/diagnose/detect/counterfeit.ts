/**
 * Present, structured like data, not data.
 *
 * This is the family the product is really about. A field that is 98%
 * populated and 40% placeholder reports as healthy on every completeness
 * dashboard ever built, and everything downstream believes it — routing fires
 * on it, scoring weights it, segmentation returns it.
 *
 * Six families, and a value is assigned to exactly one of them. Reporting a
 * value twice would double-count the same record inside a rate, and rates are
 * the unit of every finding here.
 *
 * PRECEDENCE — the most specific *mechanism* wins, not the cheapest test:
 *
 *   schemaDefault > batchStamp > sentinel > reserved > structural > fieldShift
 *
 * A declared default names a schema decision somebody made once. A batch stamp
 * names an import that ran on a Tuesday. A sentinel only names a typist. Given
 * a field whose declared default happens to be the word `Unknown`, the useful
 * diagnosis is "your picklist ships with this default and 58% of records never
 * moved off it", not "somebody typed a placeholder" — the first has a fix and
 * the second does not. That ordering is why the two corpus-level families are
 * evaluated first even though they cost a whole extra pass.
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

/**
 * Nonsense with structure.
 *
 * Keyboard runs and unpronounceability are tests for *typed* nonsense and are
 * restricted to fields that hold prose. Applied to a number they are simply
 * wrong: `23456` employees contains `2345`, and a phone number contains a
 * keyboard run by definition. A detector that fires on correct data is worse
 * than no detector, because it teaches the reader to ignore the column.
 */
function isStructuralNonsense(value: string, field: FieldDescriptor): boolean {
  if (isAllPunctuation(value)) return true;

  // A repeated character is nonsense in a name and in a phone number. In a
  // numeric field it is arithmetic: 22 employees and 33 employees are real
  // headcounts, and flagging them would put a false positive on roughly one
  // account in forty.
  const numeric = field.kind === "number" || field.kind === "date";
  if (!numeric && isSingleRepeatedCharacter(value)) return true;

  // Keyboard runs and unpronounceability test for *typed* nonsense, so they
  // only apply to fields that hold prose. `23456` employees contains `2345`,
  // and a phone number contains a keyboard run by definition. A detector that
  // fires on correct data is worse than no detector: it teaches the reader to
  // ignore the column.
  const prose =
    field.kind === "text" ||
    field.kind === "picklist" ||
    field.kind === "url" ||
    field.kind === "email";
  if (!prose) return false;
  return hasKeyboardRun(value) || isUnpronounceable(value);
}

/** Format-valid and reserved by standard: `example.com`, `555-01xx`,
 *  `000-000-0000`. These pass every validator and mean nothing. */
function isReserved(value: string, registries: Registries): boolean {
  const v = normalize(value);
  return registries.reserved.some((token) => v.includes(normalize(token)));
}

/** The string's shape disagrees with the field's declared kind — a phone in
 *  the company field, an email in the phone field. */
function isFieldShift(value: string, field: FieldDescriptor): boolean {
  const shape = shapeOf(value);
  if (shape === null) return false;
  switch (field.kind) {
    case "phone":
      return shape !== "phone";
    case "email":
      return shape !== "email";
    case "url":
      return shape === "email";
    case "text":
    case "picklist":
      return shape !== "url";
    default:
      return false;
  }
}

export function detectCounterfeit(
  patient: Patient,
  registries: Registries,
  config: DiagnosisConfig,
  fieldsByObject: ReadonlyMap<string, readonly FieldDescriptor[]>,
): Defect[] {
  // Pass one: tallies. The two corpus-level families cannot decide anything
  // about a value until they know how often it occurs.
  const fieldValueCounts = new Map<string, Map<string, number>>();
  const fieldTotals = new Map<string, number>();
  const batchValueCounts = new Map<string, Map<string, number>>();
  const batchTotals = new Map<string, number>();

  const bump = (
    counts: Map<string, Map<string, number>>,
    totals: Map<string, number>,
    key: string,
    value: string,
  ) => {
    let inner = counts.get(key);
    if (inner === undefined) {
      inner = new Map();
      counts.set(key, inner);
    }
    inner.set(value, (inner.get(value) ?? 0) + 1);
    totals.set(key, (totals.get(key) ?? 0) + 1);
  };

  for (const record of patient.records) {
    for (const field of fieldsByObject.get(record.object) ?? []) {
      const raw = record.fields[field.id];
      if (isBlank(raw)) continue;
      const v = normalize(raw);
      const fieldKey = `${record.object}:${field.id}`;
      bump(fieldValueCounts, fieldTotals, fieldKey, v);
      const batch = record.provenance.importBatchId;
      if (batch !== null) {
        bump(batchValueCounts, batchTotals, `${batch}:${fieldKey}`, v);
      }
    }
  }

  const share = (
    counts: Map<string, Map<string, number>>,
    totals: Map<string, number>,
    key: string,
    value: string,
  ): { share: number; total: number } => {
    const total = totals.get(key) ?? 0;
    if (total === 0) return { share: 0, total: 0 };
    return { share: (counts.get(key)?.get(value) ?? 0) / total, total };
  };

  // Pass two: one family per value, in precedence order.
  const defects: Defect[] = [];
  for (const record of patient.records) {
    for (const field of fieldsByObject.get(record.object) ?? []) {
      const raw = record.fields[field.id];
      if (isBlank(raw)) continue;
      const v = normalize(raw);
      const fieldKey = `${record.object}:${field.id}`;

      const family = ((): CounterfeitFamily | null => {
        // schemaDefault — requires BOTH a declared default AND an anomalous
        // share. Share alone is never enough: `United States` legitimately
        // dominates a US company's CRM, and flagging it would be the exact
        // false-confidence failure this repo exists to refuse.
        if (
          field.declaredDefault !== undefined &&
          normalize(field.declaredDefault) === v &&
          share(fieldValueCounts, fieldTotals, fieldKey, v).share >=
            config.defaultShareThreshold
        ) {
          return "schemaDefault";
        }

        // batchStamp — one identical non-trivial value across most of an
        // import batch. Four hundred accounts stamped `Technology` by one
        // import is not four hundred known industries.
        const batch = record.provenance.importBatchId;
        if (batch !== null) {
          const { share: s, total } = share(
            batchValueCounts,
            batchTotals,
            `${batch}:${fieldKey}`,
            v,
          );
          if (total >= config.minSupport && s >= config.batchStampThreshold) {
            return "batchStamp";
          }
        }

        if (isSentinel(raw, field, registries)) return "sentinel";
        if (isReserved(raw, registries)) return "reserved";
        if (isStructuralNonsense(raw, field)) return "structural";
        if (isFieldShift(raw, field)) return "fieldShift";
        return null;
      })();

      if (family !== null) {
        defects.push({
          recordId: record.id,
          object: record.object,
          kind: "COUNTERFEIT",
          target: { type: "field", field: field.id },
          detector: family,
          observed: raw,
        });
      }
    }
  }

  return defects;
}
