import type { Defect, FieldDescriptor, Patient } from "../types";
import { isBlank } from "./value";

/**
 * The uncontroversial family: the cell is empty.
 *
 * It is listed first and implemented in ten lines so the contrast with
 * `counterfeit.ts` is visible. Every CRM audit product on the market computes
 * exactly this and calls the complement "completeness". The rest of this
 * directory exists because that complement is wrong.
 */
export function detectAbsent(
  patient: Patient,
  fieldsByObject: ReadonlyMap<string, readonly FieldDescriptor[]>,
): Defect[] {
  const defects: Defect[] = [];

  for (const record of patient.records) {
    for (const field of fieldsByObject.get(record.object) ?? []) {
      if (isBlank(record.fields[field.id])) {
        defects.push({
          recordId: record.id,
          object: record.object,
          kind: "ABSENT",
          target: { type: "field", field: field.id },
          detector: "absent",
        });
      }
    }
  }

  return defects;
}
