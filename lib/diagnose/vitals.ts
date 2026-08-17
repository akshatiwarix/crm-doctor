/**
 * Populated versus known.
 *
 * The gap between these two numbers is the product. A field that is 98%
 * populated and 61% known is worse than one that is 61% populated and 61%
 * known, because the first one passes every completeness check in the company
 * and the routing rules fire on it.
 *
 * `known ≤ populated` is an invariant, asserted in the sweep for every field
 * on every patient. It holds by construction here — `known` is `populated`
 * minus the counterfeits — and the assertion exists because the construction
 * is one line and one line is exactly the kind of thing a refactor breaks.
 */

import { isBlank } from "./detect/value";
import type { Defect, FieldVitals, Patient } from "./types";

export function computeVitals(
  patient: Patient,
  defects: readonly Defect[],
): FieldVitals[] {
  /** `${object}:${field}` → record ids with a counterfeit value there. */
  const counterfeit = new Map<string, Set<string>>();
  for (const defect of defects) {
    if (defect.kind !== "COUNTERFEIT") continue;
    if (defect.target.type !== "field") continue;
    const key = `${defect.object}:${defect.target.field}`;
    const bucket = counterfeit.get(key);
    if (bucket === undefined) counterfeit.set(key, new Set([defect.recordId]));
    else bucket.add(defect.recordId);
  }

  return patient.fields.map((field) => {
    const key = `${field.object}:${field.id}`;
    const fakes = counterfeit.get(key) ?? new Set<string>();
    let total = 0;
    let populated = 0;
    let counterfeited = 0;

    for (const record of patient.records) {
      if (record.object !== field.object) continue;
      total++;
      if (isBlank(record.fields[field.id])) continue;
      populated++;
      if (fakes.has(record.id)) counterfeited++;
    }

    return {
      field: field.id,
      object: field.object,
      label: field.label,
      total,
      populated,
      known: populated - counterfeited,
      counterfeit: counterfeited,
    };
  });
}
