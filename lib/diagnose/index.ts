/**
 * The engine's public surface.
 *
 * Everything below is importable from `@/lib/diagnose`. Everything not listed
 * is internal, and `purity.test.ts` guards the other half of the contract —
 * that none of it can reach a network client, a filesystem or a clock.
 */

export type {
  AuditRecord,
  BandCheck,
  BandTable,
  CheckDescriptor,
  ClaimedFinding,
  Cohort,
  CohortTerm,
  ConfoundedFinding,
  CounterfeitFamily,
  Defect,
  DefectClass,
  DefectKind,
  Deriver,
  Diagnosis,
  DiagnosisConfig,
  DimensionDescriptor,
  EntityLabel,
  FieldDescriptor,
  FieldKind,
  FieldTarget,
  FieldVitals,
  Finding,
  ISODate,
  Interval,
  LocalizedFinding,
  MappingTable,
  MismatchCheck,
  ObjectName,
  Onset,
  OnsetClass,
  OrderingCheck,
  OrphanCheck,
  Patient,
  PervasiveFinding,
  Provenance,
  Rate,
  RecordId,
  Registries,
  UnderpoweredFinding,
  UnderpoweredReason,
} from "./types";

export { parsePatient, parseRegistries } from "./schema";
export { DEFAULT_CONFIG, claimed, diagnose, underpowered } from "./diagnose";
export { cohortId, describeCohort, enumerateCohorts, jaccard } from "./cohorts";
export { analyseDefectClass } from "./attribute";
export { detect, defectClassKey, defectClassOf, fieldsByObject } from "./detect/index";
export { detectOnset } from "./onset";
export { bonferroniZ, invNorm, rateOf, wilson } from "./stats";
export { computeVitals } from "./vitals";
export {
  DEFAULT_VIEW,
  decodeView,
  encodeView,
  findingsToCsv,
  type ConsoleView,
} from "./export";
