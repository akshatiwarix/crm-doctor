/**
 * The trust boundary.
 *
 * A schema is a request; a validator is a guarantee. Everything entering the
 * engine — the generated corpora, the check registry, the mapping tables, a
 * permalink off a URL — passes through here first, and the parse happens at
 * import time so a malformed corpus fails the build rather than producing a
 * confident finding about nothing.
 *
 * Three checks below are not shape checks and are the reason this file exists
 * rather than a pile of `as` casts:
 *
 *   - a contact may not reference itself as its own account
 *   - `createdAt` and `lastModifiedAt` must be well-formed ISO dates, because
 *     onset orders records by string comparison and a malformed date would
 *     sort silently into the wrong half
 *   - every check and every deriver must name a table that actually exists
 */

import { z } from "zod";
import type { Patient, Registries } from "./types";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isoDate = z
  .string()
  .regex(ISO_DATE, "expected an ISO date, YYYY-MM-DD")
  .refine((value) => {
    const [y, m, d] = value.split("-").map(Number);
    if (y === undefined || m === undefined || d === undefined) return false;
    if (m < 1 || m > 12 || d < 1 || d > 31) return false;
    // Lexicographic ordering is only sound on real dates; 2025-02-31 would
    // sort between the 30th and March, which is a lie the analyser would
    // never recover from.
    const days = [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    return d <= (days[m - 1] ?? 0);
  }, "not a real calendar date");

function isLeap(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

const entityLabel = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const provenance = z
  .object({
    ownerId: z.string().min(1),
    sourceId: z.string().min(1),
    importBatchId: z.string().min(1).nullable(),
    recordType: z.string().min(1),
    createdAt: isoDate,
    lastModifiedAt: isoDate,
  })
  .readonly();

const fieldDescriptor = z
  .object({
    id: z.string().min(1),
    object: z.enum(["account", "contact"]),
    label: z.string().min(1),
    kind: z.enum(["text", "picklist", "number", "email", "phone", "url", "date"]),
    declaredDefault: z.string().min(1).optional(),
    sentinels: z.array(z.string()).readonly().optional(),
  })
  .readonly();

const auditRecord = z
  .object({
    id: z.string().min(1),
    object: z.enum(["account", "contact"]),
    accountId: z.string().min(1).nullable(),
    fields: z.record(z.string(), z.string().nullable()),
    provenance,
  })
  .readonly()
  .refine(
    (record) => record.object !== "account" || record.accountId === null,
    "an account may not carry an accountId",
  )
  .refine(
    (record) => record.accountId !== record.id,
    "a contact may not be its own account",
  );

export const patientSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    users: z.array(entityLabel).readonly(),
    sources: z.array(entityLabel).readonly(),
    importBatches: z.array(entityLabel).readonly(),
    recordTypes: z.array(entityLabel).readonly(),
    fields: z.array(fieldDescriptor).readonly(),
    records: z.array(auditRecord).readonly(),
  })
  .readonly()
  .refine(
    (patient) => new Set(patient.records.map((r) => r.id)).size === patient.records.length,
    "record ids must be unique",
  );

// ---------------------------------------------------------------------------
// Registries
// ---------------------------------------------------------------------------

const deriver = z.discriminatedUnion("via", [
  z.object({ via: z.literal("identity") }),
  z.object({ via: z.literal("lookup"), table: z.string().min(1) }),
  z.object({ via: z.literal("prefix"), table: z.string().min(1) }),
  z.object({ via: z.literal("suffix"), table: z.string().min(1) }),
  z.object({ via: z.literal("band"), table: z.string().min(1) }),
]);

const checkDescriptor = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mismatch"),
    id: z.string().min(1),
    label: z.string().min(1),
    object: z.enum(["account", "contact"]),
    scope: z.enum(["record", "contactToAccount"]),
    left: z.object({ field: z.string().min(1), derive: deriver }),
    right: z.object({ field: z.string().min(1), derive: deriver }),
  }),
  z.object({
    kind: z.literal("ordering"),
    id: z.string().min(1),
    label: z.string().min(1),
    object: z.enum(["account", "contact"]),
    earlier: z.string().min(1),
    later: z.string().min(1),
  }),
  z.object({
    kind: z.literal("band"),
    id: z.string().min(1),
    label: z.string().min(1),
    object: z.enum(["account", "contact"]),
    left: z.object({ field: z.string().min(1), table: z.string().min(1) }),
    right: z.object({ field: z.string().min(1), table: z.string().min(1) }),
    compatible: z.array(z.string()).readonly(),
  }),
  z.object({
    kind: z.literal("orphan"),
    id: z.string().min(1),
    label: z.string().min(1),
    object: z.enum(["account", "contact"]),
    reference: z.literal("accountId"),
  }),
]);

const mappingTable = z
  .object({
    id: z.string().min(1),
    entries: z
      .array(z.object({ key: z.string().min(1), value: z.string().min(1) }))
      .readonly(),
  })
  .readonly();

const bandTable = z
  .object({
    id: z.string().min(1),
    bands: z
      .array(
        z.object({
          min: z.number(),
          max: z.number(),
          value: z.string().min(1),
        }),
      )
      .readonly(),
  })
  .readonly();

export const registriesSchema = z
  .object({
    dimensions: z
      .array(
        z.object({
          id: z.string().min(1),
          label: z.string().min(1),
          key: z.enum(["ownerId", "sourceId", "importBatchId", "recordType"]),
        }),
      )
      .readonly(),
    checks: z.array(checkDescriptor).readonly(),
    tables: z.array(mappingTable).readonly(),
    bands: z.array(bandTable).readonly(),
    sentinels: z.array(z.string()).readonly(),
    reserved: z.array(z.string()).readonly(),
  })
  .readonly()
  .superRefine((registries, ctx) => {
    const tables = new Set(registries.tables.map((t) => t.id));
    const bands = new Set(registries.bands.map((b) => b.id));

    const requireTable = (via: string, table: string, where: string) => {
      const pool = via === "band" ? bands : tables;
      if (!pool.has(table)) {
        ctx.addIssue({
          code: "custom",
          message: `${where} names ${via} table "${table}", which is not declared`,
        });
      }
    };

    for (const check of registries.checks) {
      if (check.kind === "mismatch") {
        for (const side of [check.left, check.right]) {
          if (side.derive.via !== "identity") {
            requireTable(side.derive.via, side.derive.table, `check "${check.id}"`);
          }
        }
      }
      if (check.kind === "band") {
        requireTable("band", check.left.table, `check "${check.id}"`);
        requireTable("band", check.right.table, `check "${check.id}"`);
      }
    }
  });

/** Parse at import. A malformed corpus should fail the build, not produce a
 *  confident finding about nothing. */
export function parsePatient(input: unknown): Patient {
  return patientSchema.parse(input) as Patient;
}

export function parseRegistries(input: unknown): Registries {
  return registriesSchema.parse(input) as Registries;
}
