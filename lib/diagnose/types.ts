/**
 * The contract.
 *
 * Three things are worth knowing before reading anything else.
 *
 * 1. The engine is field-agnostic. It never names `industry` or `country`. A
 *    field's kind, its declared default and its sentinel list arrive as a
 *    `FieldDescriptor` from `data/`; a contradiction arrives as a
 *    `CheckDescriptor` interpreted by four small evaluators. If a fact about a
 *    particular CRM field ends up inside `lib/diagnose/`, it is in the wrong
 *    place.
 *
 * 2. Dates are ISO-8601 strings and are compared lexicographically. That is
 *    not laziness — it is why this package needs no date library and contains
 *    no clock. `"2025-03-14" < "2025-03-15"` is true for the same reason the
 *    calendar says so, and an engine with no clock cannot emit a finding that
 *    depends on when it ran.
 *
 * 3. A `Finding` is not a defect. A defect is one bad cell in one record. A
 *    finding is a *claim about where defects come from*, and the four finding
 *    types differ in how much the data licenses that claim.
 */

/** ISO-8601 date, `YYYY-MM-DD`. Ordered by string comparison, never parsed. */
export type ISODate = string;

export type RecordId = string;
export type FieldId = string;
export type ObjectName = "account" | "contact";

// ---------------------------------------------------------------------------
// Provenance
// ---------------------------------------------------------------------------

/**
 * Where a record came from. This is the only thing a cohort may be built out
 * of, and none of it is ever audited for defects — a rep is not a record.
 */
export interface Provenance {
  readonly ownerId: string;
  readonly sourceId: string;
  readonly importBatchId: string | null;
  readonly recordType: string;
  readonly createdAt: ISODate;
  readonly lastModifiedAt: ISODate;
}

/**
 * A declared cohort dimension. Deliberately *not* including creation date:
 * cohorts are non-temporal, and time enters the analysis only through onset.
 * Without that separation the same defect gets reported twice wearing
 * different hats.
 */
export interface DimensionDescriptor {
  readonly id: string;
  readonly label: string;
  readonly key: "ownerId" | "sourceId" | "importBatchId" | "recordType";
}

export interface EntityLabel {
  readonly id: string;
  readonly label: string;
}

// ---------------------------------------------------------------------------
// Records under audit
// ---------------------------------------------------------------------------

export type FieldKind =
  | "text"
  | "picklist"
  | "number"
  | "email"
  | "phone"
  | "url"
  | "date";

export interface FieldDescriptor {
  readonly id: FieldId;
  readonly object: ObjectName;
  readonly label: string;
  readonly kind: FieldKind;
  /**
   * The value this field ships with in the CRM's own schema. Required for the
   * schema-default counterfeit family, which fires only on a declared default
   * *and* an anomalous share — share alone is never enough, because
   * `United States` legitimately dominates a US company's CRM.
   */
  readonly declaredDefault?: string;
  /** Sentinels beyond the global list that are meaningless in this field. */
  readonly sentinels?: readonly string[];
}

export interface AuditRecord {
  readonly id: RecordId;
  readonly object: ObjectName;
  /** Present only on contacts. The other half of every `ORPHAN` defect. */
  readonly accountId: RecordId | null;
  readonly fields: Readonly<Record<FieldId, string | null>>;
  readonly provenance: Provenance;
}

export interface Patient {
  readonly id: string;
  readonly name: string;
  readonly users: readonly EntityLabel[];
  readonly sources: readonly EntityLabel[];
  readonly importBatches: readonly EntityLabel[];
  readonly recordTypes: readonly EntityLabel[];
  readonly fields: readonly FieldDescriptor[];
  readonly records: readonly AuditRecord[];
}

// ---------------------------------------------------------------------------
// Contradiction checks, declared as data
// ---------------------------------------------------------------------------

/**
 * How a raw cell value becomes a comparable key. Two fields contradict when
 * their derived keys disagree and both were derivable — never when one side
 * simply failed to derive, which is an absence, not a disagreement.
 */
export type Deriver =
  | { readonly via: "identity" }
  | { readonly via: "lookup"; readonly table: string }
  /** Longest-prefix match. Phone country codes. */
  | { readonly via: "prefix"; readonly table: string }
  /** Longest-suffix match. TLDs off a domain or an email. */
  | { readonly via: "suffix"; readonly table: string }
  /** The host out of an email address or a URL, `www.` stripped. Comparing a
   *  contact's email domain against its account's website is the whole reason
   *  this exists. */
  | { readonly via: "host" }
  /** Numeric bucket. Headcount and revenue bands. */
  | { readonly via: "band"; readonly table: string };

export interface MappingTable {
  readonly id: string;
  readonly entries: readonly { readonly key: string; readonly value: string }[];
}

export interface BandTable {
  readonly id: string;
  readonly bands: readonly {
    readonly min: number;
    readonly max: number;
    readonly value: string;
  }[];
}

interface CheckBase {
  readonly id: string;
  readonly label: string;
  readonly object: ObjectName;
}

/**
 * Two derived keys must agree. `scope: "record"` compares two fields of the
 * same record; `scope: "contactToAccount"` compares a contact field against a
 * field on its parent account.
 *
 * A mismatch names the *pair*. There is no ground truth about which of the two
 * fields is wrong, and this package never decides — see decision 23.
 */
export interface MismatchCheck extends CheckBase {
  readonly kind: "mismatch";
  readonly scope: "record" | "contactToAccount";
  readonly left: { readonly field: FieldId; readonly derive: Deriver };
  readonly right: { readonly field: FieldId; readonly derive: Deriver };
}

/** Date A must not fall after date B. Lexicographic on ISO strings. */
export interface OrderingCheck extends CheckBase {
  readonly kind: "ordering";
  readonly earlier: FieldId;
  readonly later: FieldId;
}

/** Two numeric fields whose declared bands must be compatible. */
export interface BandCheck extends CheckBase {
  readonly kind: "band";
  readonly left: { readonly field: FieldId; readonly table: string };
  readonly right: { readonly field: FieldId; readonly table: string };
  /** Band pairs that are allowed to co-occur, as `"leftBand|rightBand"`. */
  readonly compatible: readonly string[];
}

/** A reference that points at nothing. */
export interface OrphanCheck extends CheckBase {
  readonly kind: "orphan";
  readonly reference: "accountId";
}

export type CheckDescriptor =
  | MismatchCheck
  | OrderingCheck
  | BandCheck
  | OrphanCheck;

export interface Registries {
  readonly dimensions: readonly DimensionDescriptor[];
  readonly checks: readonly CheckDescriptor[];
  readonly tables: readonly MappingTable[];
  readonly bands: readonly BandTable[];
  /** Sentinels meaningless in any field: `test`, `n/a`, `-`, `unknown`, … */
  readonly sentinels: readonly string[];
  /** Format-valid but reserved: `example.com`, `555-01`, `000-000-0000`, … */
  readonly reserved: readonly string[];
}

// ---------------------------------------------------------------------------
// Defects
// ---------------------------------------------------------------------------

export type DefectKind = "ABSENT" | "COUNTERFEIT" | "CONTRADICTION" | "ORPHAN";

export type CounterfeitFamily =
  | "sentinel"
  | "structural"
  | "reserved"
  | "schemaDefault"
  | "batchStamp"
  | "fieldShift";

export type FieldTarget =
  | { readonly type: "field"; readonly field: FieldId }
  | { readonly type: "pair"; readonly fields: readonly [FieldId, FieldId] };

export interface Defect {
  readonly recordId: RecordId;
  readonly object: ObjectName;
  readonly kind: DefectKind;
  readonly target: FieldTarget;
  /** Counterfeit family or check id. Part of the defect class, so a
   *  batch-stamped industry and an `n/a` industry are different diseases. */
  readonly detector: string;
  /** The offending value, kept for display. Never used to derive a finding. */
  readonly observed?: string;
}

/**
 * The grouping key for findings. Detector is part of it deliberately: "four
 * hundred accounts were stamped `Technology` by one import" and "sixty
 * accounts say `n/a`" are two diagnoses, not one completeness number.
 */
export interface DefectClass {
  readonly kind: DefectKind;
  readonly target: FieldTarget;
  readonly detector: string;
  readonly object: ObjectName;
}

// ---------------------------------------------------------------------------
// Cohorts
// ---------------------------------------------------------------------------

export interface CohortTerm {
  readonly dimension: string;
  readonly value: string;
}

/** A conjunction of one or two terms. Depth is capped at two so the space is
 *  exactly enumerable and the multiplicity correction has a real denominator
 *  rather than an estimate. */
export interface Cohort {
  readonly id: string;
  readonly terms: readonly CohortTerm[];
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

export interface Rate {
  readonly defective: number;
  readonly total: number;
  /** `defective / total`, or 0 when `total` is 0. */
  readonly rate: number;
}

export interface Interval {
  readonly lower: number;
  readonly upper: number;
}

export type OnsetClass = "ONSET" | "HEALED" | "CHRONIC";

export interface Onset {
  readonly class: OnsetClass;
  /** First date on the later side of the split. Null when `CHRONIC`. */
  readonly at: ISODate | null;
  readonly before: Rate;
  readonly after: Rate;
  /** Bernoulli log-likelihood gain of the accepted split, 0 when `CHRONIC`. */
  readonly gain: number;
}

// ---------------------------------------------------------------------------
// Findings
// ---------------------------------------------------------------------------

/** Elevated in one cohort, and the elevation survives conditioning on every
 *  cohort that overlaps it. */
export interface LocalizedFinding {
  readonly type: "LOCALIZED";
  readonly defectClass: DefectClass;
  readonly locus: Cohort;
  readonly inside: Rate;
  readonly outside: Rate;
  readonly interval: Interval;
  readonly onset: Onset;
  /** Cohorts that looked elevated only because they overlap the locus. */
  readonly attributable: readonly Cohort[];
}

/** Elevated nowhere in particular. The field was never collected — a design
 *  gap, not an incident. Reporting this as localized sends somebody hunting
 *  for an incident that never happened. */
export interface PervasiveFinding {
  readonly type: "PERVASIVE";
  readonly defectClass: DefectClass;
  readonly overall: Rate;
  readonly cohortsTested: number;
}

/** Two or more cohorts are elevated and conditioning cannot separate them.
 *  The tool names them all and declines to pick. */
export interface ConfoundedFinding {
  readonly type: "CONFOUNDED";
  readonly defectClass: DefectClass;
  readonly cohorts: readonly Cohort[];
  readonly rates: readonly Rate[];
  readonly intervals: readonly Interval[];
  /** Jaccard overlap of the record sets, the reason they cannot be told
   *  apart. 1 means the two cohorts are the same set of records. */
  readonly overlap: number;
}

export type UnderpoweredReason = "MIN_SUPPORT" | "INTERVAL_OVERLAPS_BASE";

/** Visibly elevated, not defensibly elevated. Reported, counted in its own
 *  section, and never summed with claims — adding the two destroys the meaning
 *  of the significance threshold, which is the only reason any number in this
 *  app can be believed. */
export interface UnderpoweredFinding {
  readonly type: "UNDERPOWERED";
  readonly defectClass: DefectClass;
  readonly cohort: Cohort;
  readonly inside: Rate;
  readonly outside: Rate;
  readonly interval: Interval;
  readonly reason: UnderpoweredReason;
}

export type Finding =
  | LocalizedFinding
  | PervasiveFinding
  | ConfoundedFinding
  | UnderpoweredFinding;

export type ClaimedFinding =
  | LocalizedFinding
  | PervasiveFinding
  | ConfoundedFinding;

// ---------------------------------------------------------------------------
// Vitals
// ---------------------------------------------------------------------------

/** `known <= populated` is an invariant, asserted in the sweep for every field
 *  on every patient. A counterfeit value counts as absent. */
export interface FieldVitals {
  readonly field: FieldId;
  readonly object: ObjectName;
  readonly label: string;
  readonly total: number;
  readonly populated: number;
  readonly known: number;
  readonly counterfeit: number;
}

// ---------------------------------------------------------------------------
// Diagnosis
// ---------------------------------------------------------------------------

export interface DiagnosisConfig {
  /** Hard floor on cohort size. Below it nothing is ever claimed. */
  readonly minSupport: number;
  /** Family-wise error rate the Bonferroni correction targets. */
  readonly alpha: number;
  /** Minimum Bernoulli log-likelihood gain for a change-point to be accepted. */
  readonly onsetThreshold: number;
  /** Minimum records either side of an accepted change-point. */
  readonly onsetMinSide: number;
  /** A cohort is subsumed when its residual rate lands within this many
   *  proportion points of base rate. */
  readonly subsumptionTolerance: number;
  /** Above this Jaccard overlap two cohorts are treated as inseparable. */
  readonly confoundOverlap: number;
  /** Minimum ratio of cohort rate to background rate. Significance is not
   *  materiality: across three thousand records a 4%-versus-2.5% difference
   *  clears any threshold and changes nothing anybody would do. */
  readonly minLift: number;
  /** A non-claim is only worth showing if it would have been interesting.
   *  Below these it is not reported at all — an `UNDERPOWERED` section listing
   *  every one-record cohort is noise wearing the costume of rigour. */
  readonly underpoweredMinDefects: number;
  readonly underpoweredMultiple: number;
  /** Share above which a declared default is treated as anomalous. */
  readonly defaultShareThreshold: number;
  /** Share of a batch that one identical value must reach to be a stamp. */
  readonly batchStampThreshold: number;
}

export interface Diagnosis {
  readonly patientId: string;
  readonly vitals: readonly FieldVitals[];
  readonly findings: readonly Finding[];
  readonly defects: readonly Defect[];
  readonly cohortsTested: number;
  readonly config: DiagnosisConfig;
}
