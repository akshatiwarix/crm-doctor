import { describe, expect, it } from "vitest";
import { parsePatient, parseRegistries } from "./schema";

const provenance = {
  ownerId: "u1",
  sourceId: "s1",
  importBatchId: null,
  recordType: "standard",
  createdAt: "2025-01-04",
  lastModifiedAt: "2025-02-01",
};

function patient(overrides: Record<string, unknown> = {}) {
  return {
    id: "p",
    name: "P",
    users: [{ id: "u1", label: "U" }],
    sources: [{ id: "s1", label: "S" }],
    importBatches: [],
    recordTypes: [{ id: "standard", label: "Standard" }],
    fields: [
      { id: "industry", object: "account", label: "Industry", kind: "picklist" },
    ],
    records: [
      {
        id: "a1",
        object: "account",
        accountId: null,
        fields: { industry: "Software" },
        provenance,
      },
    ],
    ...overrides,
  };
}

describe("parsePatient", () => {
  it("accepts a well-formed patient", () => {
    expect(parsePatient(patient()).records).toHaveLength(1);
  });

  it("rejects a date that is well-formed but not a real date", () => {
    // Lexicographic ordering is the reason this package needs no date library.
    // It is only sound on real dates: "2025-02-31" would sort between the 30th
    // and March, and onset would split the corpus in the wrong place.
    expect(() =>
      parsePatient(
        patient({
          records: [
            {
              id: "a1",
              object: "account",
              accountId: null,
              fields: {},
              provenance: { ...provenance, createdAt: "2025-02-31" },
            },
          ],
        }),
      ),
    ).toThrow(/not a real calendar date/);
  });

  it("accepts 29 February in a leap year and rejects it otherwise", () => {
    const withDate = (createdAt: string) =>
      patient({
        records: [
          {
            id: "a1",
            object: "account",
            accountId: null,
            fields: {},
            provenance: { ...provenance, createdAt },
          },
        ],
      });

    expect(() => parsePatient(withDate("2024-02-29"))).not.toThrow();
    expect(() => parsePatient(withDate("2025-02-29"))).toThrow();
  });

  it("rejects a contact that is its own account", () => {
    expect(() =>
      parsePatient(
        patient({
          records: [
            {
              id: "c1",
              object: "contact",
              accountId: "c1",
              fields: {},
              provenance,
            },
          ],
        }),
      ),
    ).toThrow(/its own account/);
  });

  it("rejects an account carrying an accountId", () => {
    expect(() =>
      parsePatient(
        patient({
          records: [
            {
              id: "a1",
              object: "account",
              accountId: "a2",
              fields: {},
              provenance,
            },
          ],
        }),
      ),
    ).toThrow(/may not carry an accountId/);
  });

  it("rejects duplicate record ids", () => {
    const record = {
      id: "a1",
      object: "account",
      accountId: null,
      fields: {},
      provenance,
    };
    expect(() => parsePatient(patient({ records: [record, record] }))).toThrow(
      /unique/,
    );
  });
});

describe("parseRegistries", () => {
  const base = {
    dimensions: [{ id: "owner", label: "Owner", key: "ownerId" }],
    checks: [],
    tables: [{ id: "tld", entries: [{ key: ".fr", value: "FR" }] }],
    bands: [{ id: "headcount", bands: [{ min: 0, max: 49, value: "small" }] }],
    sentinels: ["n/a"],
    reserved: ["example.com"],
  };

  it("accepts registries whose checks name declared tables", () => {
    expect(
      parseRegistries({
        ...base,
        checks: [
          {
            kind: "mismatch",
            id: "country-vs-domain",
            label: "Country versus domain",
            object: "account",
            scope: "record",
            left: { field: "country", derive: { via: "identity" } },
            right: { field: "website", derive: { via: "suffix", table: "tld" } },
          },
        ],
      }).checks,
    ).toHaveLength(1);
  });

  it("rejects a check naming a table that is not declared", () => {
    // A check is data. Data that names a missing table is a finding that would
    // silently never fire, which is exactly the class of bug this repo exists
    // to make impossible elsewhere.
    expect(() =>
      parseRegistries({
        ...base,
        checks: [
          {
            kind: "mismatch",
            id: "broken",
            label: "Broken",
            object: "account",
            scope: "record",
            left: { field: "country", derive: { via: "identity" } },
            right: { field: "phone", derive: { via: "prefix", table: "nope" } },
          },
        ],
      }),
    ).toThrow(/not declared/);
  });

  it("rejects a band check naming a mapping table instead of a band table", () => {
    expect(() =>
      parseRegistries({
        ...base,
        checks: [
          {
            kind: "band",
            id: "size-vs-revenue",
            label: "Size versus revenue",
            object: "account",
            left: { field: "employees", table: "tld" },
            right: { field: "revenue", table: "headcount" },
            compatible: [],
          },
        ],
      }),
    ).toThrow(/not declared/);
  });
});
