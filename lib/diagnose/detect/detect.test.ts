import { describe, expect, it } from "vitest";
import type { AuditRecord, Patient, Registries } from "../types";
import { DEFAULT_CONFIG as config } from "../diagnose";
import { defectClassKey, detect, fieldsByObject } from "./index";
import { detectCounterfeit } from "./counterfeit";
import { derive } from "./contradiction";
import { shapeOf } from "./value";


const registries: Registries = {
  dimensions: [{ id: "owner", label: "Owner", key: "ownerId" }],
  checks: [
    {
      kind: "mismatch",
      id: "country-vs-phone",
      label: "Country versus phone",
      object: "account",
      scope: "record",
      left: { field: "country", derive: { via: "lookup", table: "country" } },
      right: { field: "phone", derive: { via: "prefix", table: "dial" } },
    },
    {
      kind: "ordering",
      id: "created-before-modified",
      label: "Created before modified",
      object: "account",
      earlier: "createdAt",
      later: "modifiedAt",
    },
    {
      kind: "band",
      id: "size-vs-revenue",
      label: "Size versus revenue",
      object: "account",
      left: { field: "employees", table: "headcount" },
      right: { field: "revenue", table: "revenue" },
      compatible: ["small|low", "large|high"],
    },
    {
      kind: "orphan",
      id: "contact-account",
      label: "Contact has an account",
      object: "contact",
      reference: "accountId",
    },
  ],
  tables: [
    { id: "country", entries: [{ key: "united states", value: "US" }, { key: "france", value: "FR" }] },
    { id: "dial", entries: [{ key: "+1", value: "US" }, { key: "+33", value: "FR" }] },
  ],
  bands: [
    {
      id: "headcount",
      bands: [
        { min: 0, max: 49, value: "small" },
        { min: 50, max: 1e9, value: "large" },
      ],
    },
    {
      id: "revenue",
      bands: [
        { min: 0, max: 5_000_000, value: "low" },
        { min: 5_000_001, max: 1e12, value: "high" },
      ],
    },
  ],
  sentinels: ["n/a", "test", "unknown", "do not use"],
  reserved: ["example.com", "000-000-0000", "555-01"],
};

function account(
  id: string,
  fields: Record<string, string | null>,
  batch: string | null = null,
): AuditRecord {
  return {
    id,
    object: "account",
    accountId: null,
    fields,
    provenance: {
      ownerId: "u1",
      sourceId: "s1",
      importBatchId: batch,
      recordType: "standard",
      createdAt: "2025-01-01",
      lastModifiedAt: "2025-06-01",
    },
  };
}

function patientWith(records: readonly AuditRecord[]): Patient {
  return {
    id: "t",
    name: "Test",
    users: [{ id: "u1", label: "U" }],
    sources: [{ id: "s1", label: "S" }],
    importBatches: [{ id: "b1", label: "B" }],
    recordTypes: [{ id: "standard", label: "Standard" }],
    fields: [
      { id: "name", object: "account", label: "Name", kind: "text" },
      {
        id: "industry",
        object: "account",
        label: "Industry",
        kind: "picklist",
        declaredDefault: "Other",
      },
      { id: "phone", object: "account", label: "Phone", kind: "phone" },
      { id: "country", object: "account", label: "Country", kind: "picklist" },
      { id: "website", object: "account", label: "Website", kind: "url" },
      { id: "employees", object: "account", label: "Employees", kind: "number" },
      { id: "revenue", object: "account", label: "Revenue", kind: "number" },
      { id: "createdAt", object: "account", label: "Created", kind: "date" },
      { id: "modifiedAt", object: "account", label: "Modified", kind: "date" },
      { id: "email", object: "contact", label: "Email", kind: "email" },
    ],
    records,
  };
}

describe("absent", () => {
  it("treats whitespace as absent", () => {
    // A CRM storing " " has not collected anything. Counting it as populated
    // is the first way a completeness number starts lying.
    const defects = detect(patientWith([account("a1", { name: "   " })]), registries, config);
    expect(defects.some((d) => d.kind === "ABSENT" && d.target.type === "field" && d.target.field === "name")).toBe(true);
  });
});

describe("counterfeit", () => {
  const run = (records: readonly AuditRecord[]) => {
    const patient = patientWith(records);
    return detectCounterfeit(patient, registries, config, fieldsByObject(patient));
  };

  it("catches sentinels case- and space-insensitively", () => {
    const defects = run([account("a1", { name: "  N/A  " })]);
    expect(defects.filter((d) => d.detector === "sentinel")).toHaveLength(1);
  });

  it("catches keyboard runs, repeated characters and unpronounceable strings", () => {
    const defects = run([
      account("a1", { name: "asdfgh" }),
      account("a2", { name: "aaaa" }),
      account("a3", { name: "xzkqrtv" }),
      account("a4", { name: "---" }),
    ]);
    expect(defects.filter((d) => d.detector === "structural")).toHaveLength(4);
  });

  it("catches reserved values that pass every format validator", () => {
    const defects = run([
      account("a1", { website: "https://acme.example.com" }),
      account("a2", { phone: "000-000-0000" }),
    ]);
    expect(defects.filter((d) => d.detector === "reserved")).toHaveLength(2);
  });

  it("catches an email sitting in the phone field", () => {
    const defects = run([account("a1", { phone: "ops@acme.example" })]);
    expect(defects.filter((d) => d.detector === "fieldShift")).toHaveLength(1);
  });

  it("does not flag a real company name", () => {
    const defects = run([account("a1", { name: "Northwind Logistics" })]);
    expect(defects).toHaveLength(0);
  });

  it("needs BOTH a declared default and an anomalous share", () => {
    // Share alone is never enough. `United States` legitimately dominates a US
    // company's CRM, and flagging it would be the exact false-confidence
    // failure this repo exists to refuse.
    const dominantButNotDeclared = Array.from({ length: 30 }, (_, i) =>
      account(`a${i}`, { country: "United States" }),
    );
    expect(run(dominantButNotDeclared)).toHaveLength(0);

    const declaredButRare = [
      account("a0", { industry: "Other" }),
      ...Array.from({ length: 30 }, (_, i) =>
        account(`b${i}`, { industry: "Software" }),
      ),
    ];
    expect(run(declaredButRare).filter((d) => d.detector === "schemaDefault")).toHaveLength(0);

    const declaredAndDominant = Array.from({ length: 30 }, (_, i) =>
      account(`c${i}`, { industry: "Other" }),
    );
    expect(run(declaredAndDominant).filter((d) => d.detector === "schemaDefault")).toHaveLength(30);
  });

  it("catches one value stamped across an import batch", () => {
    const stamped = Array.from({ length: 25 }, (_, i) =>
      account(`a${i}`, { industry: "Technology" }, "b1"),
    );
    const defects = run(stamped);
    expect(defects.filter((d) => d.detector === "batchStamp")).toHaveLength(25);
  });

  it("does not call a batch stamped when the batch is genuinely varied", () => {
    const varied = Array.from({ length: 25 }, (_, i) =>
      account(`a${i}`, { industry: i % 2 === 0 ? "Technology" : "Logistics" }, "b1"),
    );
    expect(run(varied).filter((d) => d.detector === "batchStamp")).toHaveLength(0);
  });

  it("prefers the declared default over the sentinel that shadows it", () => {
    // `Unknown` is both a global sentinel and a real picklist default. The
    // useful diagnosis is "your picklist ships with this default and most
    // records never moved off it" — that has a fix. "Somebody typed a
    // placeholder" does not.
    const patient = patientWith(
      Array.from({ length: 30 }, (_, i) => account(`a${i}`, { industry: "Unknown" })),
    );
    const withDefault: Patient = {
      ...patient,
      fields: patient.fields.map((f) =>
        f.id === "industry" ? { ...f, declaredDefault: "Unknown" } : f,
      ),
    };
    const registriesWithUnknown: Registries = {
      ...registries,
      sentinels: [...registries.sentinels, "unknown"],
    };
    const defects = detectCounterfeit(
      withDefault,
      registriesWithUnknown,
      config,
      fieldsByObject(withDefault),
    );
    expect(new Set(defects.map((d) => d.detector))).toEqual(new Set(["schemaDefault"]));
  });

  it("does not flag real headcounts that happen to repeat a digit", () => {
    // 22 employees is arithmetic, not nonsense. Applying the repeated-
    // character test to a numeric field puts a false positive on roughly one
    // account in forty, and a detector that fires on correct data teaches the
    // reader to ignore the column.
    const defects = run([
      account("a1", { employees: "22" }),
      account("a2", { employees: "23456" }),
      account("a3", { phone: "+1 4567 123456" }),
    ]);
    expect(defects).toHaveLength(0);
  });

  it("reports each counterfeit value under exactly one family", () => {
    // A value that is both a sentinel and structurally nonsense must not
    // produce two defects, or the same records get counted twice in a rate.
    const defects = run([account("a1", { name: "n/a" })]);
    expect(defects).toHaveLength(1);
  });
});

describe("contradiction", () => {
  it("fires only when both sides derive", () => {
    const bothDerive = detect(
      patientWith([account("a1", { country: "France", phone: "+1 415 555 0134" })]),
      registries,
      config,
    ).filter((d) => d.detector === "country-vs-phone");
    expect(bothDerive).toHaveLength(1);

    // An undeliverable side is an absence, and absence already has a detector.
    const oneSideUnknown = detect(
      patientWith([account("a2", { country: "Freedonia", phone: "+1 415 555 0134" })]),
      registries,
      config,
    ).filter((d) => d.detector === "country-vs-phone");
    expect(oneSideUnknown).toHaveLength(0);
  });

  it("names the pair rather than blaming a field", () => {
    const defect = detect(
      patientWith([account("a1", { country: "France", phone: "+1 415 555 0134" })]),
      registries,
      config,
    ).find((d) => d.detector === "country-vs-phone");
    expect(defect?.target).toEqual({ type: "pair", fields: ["country", "phone"] });
  });

  it("compares dates lexicographically with no date library", () => {
    const defects = detect(
      patientWith([account("a1", { createdAt: "2025-06-01", modifiedAt: "2025-01-01" })]),
      registries,
      config,
    );
    expect(defects.some((d) => d.detector === "created-before-modified")).toBe(true);
  });

  it("flags incompatible bands and accepts compatible ones", () => {
    const bad = detect(
      patientWith([account("a1", { employees: "5", revenue: "40000000" })]),
      registries,
      config,
    ).filter((d) => d.detector === "size-vs-revenue");
    expect(bad).toHaveLength(1);

    const good = detect(
      patientWith([account("a2", { employees: "5", revenue: "400000" })]),
      registries,
      config,
    ).filter((d) => d.detector === "size-vs-revenue");
    expect(good).toHaveLength(0);
  });
});

describe("orphan", () => {
  it("separates unlinked from dangling", () => {
    const contact = (id: string, accountId: string | null): AuditRecord => ({
      id,
      object: "contact",
      accountId,
      fields: { email: "a@b.example" },
      provenance: {
        ownerId: "u1",
        sourceId: "s1",
        importBatchId: null,
        recordType: "standard",
        createdAt: "2025-01-01",
        lastModifiedAt: "2025-01-01",
      },
    });

    const defects = detect(
      patientWith([account("a1", {}), contact("c1", null), contact("c2", "nope")]),
      registries,
      config,
    ).filter((d) => d.kind === "ORPHAN");

    expect(defects.map((d) => d.detector).sort()).toEqual([
      "contact-account:dangling",
      "contact-account:unlinked",
    ]);
  });
});

describe("derive", () => {
  const tables = new Map(registries.tables.map((t) => [t.id, t]));
  const bands = new Map(registries.bands.map((b) => [b.id, b]));

  it("normalises the two ways an international dialling code is marked", () => {
    for (const written of ["+33 1 23 45 67 89", "0033 1 23 45 67 89"]) {
      expect(derive(written, { via: "prefix", table: "dial" }, tables, bands)).toBe("FR");
    }
  });

  it("declines to derive a country from a number with no international prefix", () => {
    // `(33) 123456789` might be France, or it might be a local number that
    // happens to start with 33. A deriver that guessed here would manufacture
    // contradictions out of correct data, which is worse than missing some.
    expect(derive("(33) 123456789", { via: "prefix", table: "dial" }, tables, bands)).toBeNull();
    expect(derive("415 555 0134", { via: "prefix", table: "dial" }, tables, bands)).toBeNull();
  });

  it("prefers the longest matching key", () => {
    const longer = new Map([
      ["dial", { id: "dial", entries: [{ key: "+1", value: "US" }, { key: "+1809", value: "DO" }] }],
    ]);
    expect(derive("+1809 555 0134", { via: "prefix", table: "dial" }, longer, bands)).toBe("DO");
  });
});

describe("shapeOf", () => {
  it("does not mistake a name containing digits for a phone number", () => {
    expect(shapeOf("Acme 2024 Holdings")).toBeNull();
    expect(shapeOf("+44 20 7946 0958")).toBe("phone");
    expect(shapeOf("ops@acme.example")).toBe("email");
  });
});

describe("defectClassKey", () => {
  it("separates two counterfeit families on the same field", () => {
    // A batch-stamped industry and an `n/a` industry are two diagnoses with
    // two different fixes. Rolling them into one completeness number is how
    // both get missed.
    const patient = patientWith([
      account("a1", { industry: "n/a" }),
      ...Array.from({ length: 25 }, (_, i) =>
        account(`b${i}`, { industry: "Technology" }, "b1"),
      ),
    ]);
    const keys = new Set(
      detect(patient, registries, config)
        .filter((d) => d.kind === "COUNTERFEIT")
        .map(defectClassKey),
    );
    expect(keys.size).toBe(2);
  });
});
