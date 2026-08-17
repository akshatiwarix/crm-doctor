import type {
  Defect,
  DefectClass,
  DiagnosisConfig,
  FieldDescriptor,
  Patient,
  Registries,
} from "../types";
import { detectAbsent } from "./absent";
import { detectContradictions } from "./contradiction";
import { detectCounterfeit } from "./counterfeit";
import { detectOrphans } from "./orphan";

export { derive } from "./contradiction";
export * from "./value";

export function fieldsByObject(
  patient: Patient,
): Map<string, readonly FieldDescriptor[]> {
  const map = new Map<string, FieldDescriptor[]>();
  for (const field of patient.fields) {
    const list = map.get(field.object);
    if (list === undefined) map.set(field.object, [field]);
    else list.push(field);
  }
  return map;
}

/**
 * Every record against every check.
 *
 * Order is stable and deterministic — absent, counterfeit, contradiction,
 * orphan — because `npm run sweep` asserts findings are byte-identical across
 * runs, and a `Map` iteration order that depended on insertion timing would
 * make that assertion meaningless rather than false.
 */
export function detect(
  patient: Patient,
  registries: Registries,
  config: DiagnosisConfig,
): Defect[] {
  const byObject = fieldsByObject(patient);
  return [
    ...detectAbsent(patient, byObject),
    ...detectCounterfeit(patient, registries, config, byObject),
    ...detectContradictions(patient, registries),
    ...detectOrphans(patient, registries),
  ];
}

/**
 * The grouping key for findings. The detector is part of it deliberately:
 * "four hundred accounts were stamped `Technology` by one import" and "sixty
 * accounts say `n/a`" are two diagnoses with two different fixes, and rolling
 * them into one completeness number is how both get missed.
 */
export function defectClassKey(defect: Defect | DefectClass): string {
  const target =
    defect.target.type === "field"
      ? defect.target.field
      : defect.target.fields.join("+");
  return `${defect.object}|${defect.kind}|${target}|${defect.detector}`;
}

export function defectClassOf(defect: Defect): DefectClass {
  return {
    kind: defect.kind,
    target: defect.target,
    detector: defect.detector,
    object: defect.object,
  };
}
