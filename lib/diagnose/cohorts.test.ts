import { describe, expect, it } from "vitest";
import type { AuditRecord, Patient, Registries } from "./types";
import { cohortId, describeCohort, enumerateCohorts, jaccard } from "./cohorts";

const registries = {
  dimensions: [
    { id: "owner", label: "Owner", key: "ownerId" },
    { id: "source", label: "Source", key: "sourceId" },
    { id: "batch", label: "Import batch", key: "importBatchId" },
  ],
  checks: [],
  tables: [],
  bands: [],
  sentinels: [],
  reserved: [],
} as unknown as Registries;

function record(
  id: string,
  ownerId: string,
  sourceId: string,
  importBatchId: string | null,
): AuditRecord {
  return {
    id,
    object: "account",
    accountId: null,
    fields: {},
    provenance: {
      ownerId,
      sourceId,
      importBatchId,
      recordType: "standard",
      createdAt: "2025-01-01",
      lastModifiedAt: "2025-01-01",
    },
  };
}

function patientOf(records: readonly AuditRecord[]): Patient {
  return {
    id: "t",
    name: "T",
    users: [
      { id: "priya", label: "Priya R." },
      { id: "dana", label: "Dana O." },
    ],
    sources: [{ id: "webinar", label: "Webinar form" }],
    importBatches: [{ id: "b1", label: "2024-11 vendor list" }],
    recordTypes: [{ id: "standard", label: "Standard" }],
    fields: [],
    records,
  };
}

const fourRecords = [
  record("r1", "priya", "webinar", null),
  record("r2", "priya", "outbound", null),
  record("r3", "dana", "webinar", null),
  record("r4", "dana", "webinar", null),
];

describe("enumerateCohorts", () => {
  it("enumerates singles and pairs, and nothing empty", () => {
    const { cohorts } = enumerateCohorts(patientOf(fourRecords), registries);
    expect(cohorts.map((c) => c.id).sort()).toEqual([
      // `owner=dana & source=webinar` and `owner=priya & source=outbound` are
      // absent because each covers exactly the records of a simpler cohort.
      "owner=dana",
      "owner=priya",
      "owner=priya & source=webinar",
      "source=outbound",
      "source=webinar",
    ]);
    // `owner=priya & owner=dana` is not a cohort — a record has one owner, so
    // the conjunction is empty and nobody ever tested it.
    expect(cohorts.some((c) => c.id.includes("owner=priya & owner=dana"))).toBe(false);
  });

  it("caps depth at two", () => {
    const { cohorts } = enumerateCohorts(patientOf(fourRecords), registries);
    expect(Math.max(...cohorts.map((c) => c.terms.length))).toBe(2);
  });

  it("collapses cohorts covering exactly the same records", () => {
    // Every record in this batch also has this source, so `batch=b1` and
    // `source=webinar & batch=b1` are one hypothesis described two ways.
    // Keeping both would inflate the Bonferroni denominator and then report
    // the pair as a confound — the tool declining to distinguish a set from
    // itself.
    const patient = patientOf([
      record("r1", "priya", "webinar", "b1"),
      record("r2", "priya", "webinar", "b1"),
      record("r3", "dana", "outbound", null),
    ]);
    const { cohorts, members } = enumerateCohorts(patient, registries);
    const batchLike = cohorts.filter((_, i) => {
      const bucket = members[i];
      return bucket?.length === 2 && bucket[0] === 0 && bucket[1] === 1;
    });
    expect(batchLike).toHaveLength(1);
    // The simpler description survives.
    expect(batchLike[0]?.terms).toHaveLength(1);
  });

  it("puts records with no import batch in no batch cohort", () => {
    // "Arrived outside any import" is not a mechanism. Inventing a `none`
    // cohort would sweep every hand-created record into one bucket and
    // manufacture findings out of it.
    const patient = patientOf([
      record("r1", "priya", "webinar", null),
      record("r2", "dana", "webinar", "b1"),
    ]);
    const { cohorts, members } = enumerateCohorts(patient, registries);
    expect(cohorts.some((c) => c.id.startsWith("batch="))).toBe(true);
    const batch = cohorts.findIndex((c) => c.id === "batch=b1");
    expect(members[batch]).toEqual([1]);
  });

  it("does not include creation date as a dimension", () => {
    // Time is the onset axis. A date cohort would report the same defect twice
    // — once as "elevated in March" and once as "started in March".
    const patient = patientOf(fourRecords);
    const { cohorts } = enumerateCohorts(patient, registries);
    expect(cohorts.some((c) => /created|date|month/i.test(c.id))).toBe(false);
  });

  it("produces a byte-identical enumeration across runs", () => {
    const patient = patientOf([
      record("r1", "priya", "webinar", "b1"),
      record("r2", "dana", "webinar", null),
    ]);
    const a = enumerateCohorts(patient, registries);
    const b = enumerateCohorts(patient, registries);
    expect(JSON.stringify(a.cohorts)).toBe(JSON.stringify(b.cohorts));
  });
});

describe("cohortId", () => {
  it("is order-independent", () => {
    const owner = { dimension: "owner", value: "priya" };
    const source = { dimension: "source", value: "webinar" };
    expect(cohortId([owner, source])).toBe(cohortId([source, owner]));
  });
});

describe("describeCohort", () => {
  it("uses the patient's labels rather than its ids", () => {
    const patient = patientOf(fourRecords);
    const { cohorts } = enumerateCohorts(patient, registries);
    const pair = cohorts.find((c) => c.terms.length === 2);
    expect(pair).toBeDefined();
    expect(describeCohort(pair!, patient, registries)).toBe(
      "Owner Priya R. and Source Webinar form",
    );
  });
});

describe("jaccard", () => {
  it("is 1 for identical sets and 0 for disjoint ones", () => {
    expect(jaccard(new Set([1, 2, 3]), new Set([1, 2, 3]))).toBe(1);
    expect(jaccard(new Set([1, 2]), new Set([3, 4]))).toBe(0);
    expect(jaccard(new Set([1, 2, 3]), new Set([2, 3, 4]))).toBeCloseTo(0.5);
  });
});
