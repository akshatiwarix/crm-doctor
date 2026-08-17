import { describe, expect, it } from "vitest";
import { computeVitals } from "./vitals";
import type { AuditRecord, Defect, Patient } from "./types";

function account(id: string, fields: Record<string, string | null>): AuditRecord {
  return {
    id,
    object: "account",
    accountId: null,
    fields,
    provenance: {
      ownerId: "u1",
      sourceId: "s1",
      importBatchId: null,
      recordType: "standard",
      createdAt: "2025-01-01",
      lastModifiedAt: "2025-01-01",
    },
  };
}

const patient: Patient = {
  id: "t",
  name: "T",
  users: [{ id: "u1", label: "U" }],
  sources: [{ id: "s1", label: "S" }],
  importBatches: [],
  recordTypes: [{ id: "standard", label: "Standard" }],
  fields: [
    { id: "industry", object: "account", label: "Industry", kind: "picklist" },
    { id: "email", object: "contact", label: "Email", kind: "email" },
  ],
  records: [
    account("a1", { industry: "Software" }),
    account("a2", { industry: "n/a" }),
    account("a3", { industry: "   " }),
    account("a4", { industry: null }),
    account("a5", { industry: "Logistics" }),
  ],
};

const counterfeit: Defect = {
  recordId: "a2",
  object: "account",
  kind: "COUNTERFEIT",
  target: { type: "field", field: "industry" },
  detector: "sentinel",
  observed: "n/a",
};

describe("computeVitals", () => {
  it("counts a counterfeit value as populated but not as known", () => {
    // The whole product in one assertion. Three of five records have something
    // in the cell; only two of them have knowledge in it.
    const [industry] = computeVitals(patient, [counterfeit]);
    expect(industry).toMatchObject({
      total: 5,
      populated: 3,
      known: 2,
      counterfeit: 1,
    });
  });

  it("treats whitespace as unpopulated", () => {
    const [industry] = computeVitals(patient, []);
    expect(industry?.populated).toBe(3);
  });

  it("keeps known at or below populated", () => {
    // Asserted here and again in the sweep across both corpora. It holds by
    // construction — `known` is `populated` minus counterfeits — and that is
    // exactly the kind of one-liner a refactor inverts.
    for (const vitals of computeVitals(patient, [counterfeit])) {
      expect(vitals.known).toBeLessThanOrEqual(vitals.populated);
      expect(vitals.populated).toBeLessThanOrEqual(vitals.total);
    }
  });

  it("does not count a defect from another object against this field", () => {
    const wrongObject: Defect = { ...counterfeit, object: "contact", recordId: "a2" };
    const [industry] = computeVitals(patient, [wrongObject]);
    expect(industry?.known).toBe(3);
  });

  it("ignores non-counterfeit defects", () => {
    // An absent field is already not populated, and a contradiction is about a
    // pair. Subtracting either from `known` would double-count the record.
    const absent: Defect = {
      recordId: "a4",
      object: "account",
      kind: "ABSENT",
      target: { type: "field", field: "industry" },
      detector: "absent",
    };
    const [industry] = computeVitals(patient, [absent]);
    expect(industry?.known).toBe(3);
  });

  it("reports a field belonging to an object with no records as empty", () => {
    const [, email] = computeVitals(patient, []);
    expect(email).toMatchObject({ total: 0, populated: 0, known: 0 });
  });
});
