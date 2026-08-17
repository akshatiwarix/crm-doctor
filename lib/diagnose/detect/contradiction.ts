/**
 * Two fields that disagree.
 *
 * Every check is a data descriptor from `data/`, interpreted here by four
 * small evaluators. Adding a check is a data edit; there is no `if` in this
 * file that names a CRM field.
 *
 * Two rules that are easy to get wrong and are load-bearing:
 *
 *   - A defect fires only when BOTH sides derive. One side failing to derive
 *     is an absence, and absence already has a detector. Conflating them
 *     inflates the contradiction count with records that are merely empty.
 *   - A contradiction names the PAIR. There is no ground truth about which of
 *     two disagreeing fields is wrong, and this package never decides — which
 *     is also why it never offers to fix one.
 */

import type {
  AuditRecord,
  BandTable,
  CheckDescriptor,
  Defect,
  Deriver,
  MappingTable,
  Patient,
  Registries,
} from "../types";
import { isBlank, normalize } from "./value";

function longestMatch(
  value: string,
  table: MappingTable,
  match: (value: string, key: string) => boolean,
): string | null {
  let best: { key: string; value: string } | null = null;
  for (const entry of table.entries) {
    if (!match(value, normalize(entry.key))) continue;
    if (best === null || entry.key.length > best.key.length) {
      best = { key: entry.key, value: entry.value };
    }
  }
  return best?.value ?? null;
}

function bandOf(value: string, table: BandTable): string | null {
  const n = Number(value.replace(/[,\s$]/g, ""));
  if (!Number.isFinite(n)) return null;
  for (const band of table.bands) {
    if (n >= band.min && n <= band.max) return band.value;
  }
  return null;
}

/** Raw cell value → comparable key, or null when the value says nothing. */
export function derive(
  value: string,
  deriver: Deriver,
  tables: ReadonlyMap<string, MappingTable>,
  bands: ReadonlyMap<string, BandTable>,
): string | null {
  const v = normalize(value);
  switch (deriver.via) {
    case "identity":
      return v === "" ? null : v;
    case "lookup": {
      const table = tables.get(deriver.table);
      if (table === undefined) return null;
      return longestMatch(v, table, (a, b) => a === b);
    }
    case "prefix": {
      const table = tables.get(deriver.table);
      if (table === undefined) return null;
      // Phone country codes. Normalising to `+digits` first is what lets one
      // table cover `+44 20 …`, `0044 20 …` and `(44) 20 …`.
      const dialled = v.replace(/[^\d+]/g, "").replace(/^00/, "+");
      return longestMatch(dialled, table, (a, b) => a.startsWith(b));
    }
    case "suffix": {
      const table = tables.get(deriver.table);
      if (table === undefined) return null;
      const host = v.replace(/^https?:\/\//, "").split(/[/?#]/)[0] ?? v;
      return longestMatch(host, table, (a, b) => a.endsWith(b));
    }
    case "band": {
      const table = bands.get(deriver.table);
      if (table === undefined) return null;
      return bandOf(v, table);
    }
  }
}

export function detectContradictions(
  patient: Patient,
  registries: Registries,
): Defect[] {
  const defects: Defect[] = [];
  const tables = new Map(registries.tables.map((t) => [t.id, t]));
  const bands = new Map(registries.bands.map((b) => [b.id, b]));
  const accounts = new Map(
    patient.records.filter((r) => r.object === "account").map((r) => [r.id, r]),
  );

  const emit = (
    record: AuditRecord,
    check: CheckDescriptor,
    fields: readonly [string, string],
    observed: string,
  ) => {
    defects.push({
      recordId: record.id,
      object: record.object,
      kind: "CONTRADICTION",
      target: { type: "pair", fields },
      detector: check.id,
      observed,
    });
  };

  for (const check of registries.checks) {
    if (check.kind === "orphan") continue; // owned by detect/orphan.ts

    for (const record of patient.records) {
      if (record.object !== check.object) continue;

      if (check.kind === "mismatch") {
        const rightRecord =
          check.scope === "contactToAccount"
            ? record.accountId === null
              ? undefined
              : accounts.get(record.accountId)
            : record;
        if (rightRecord === undefined) continue;

        const leftRaw = record.fields[check.left.field];
        const rightRaw = rightRecord.fields[check.right.field];
        if (isBlank(leftRaw) || isBlank(rightRaw)) continue;

        const left = derive(leftRaw, check.left.derive, tables, bands);
        const right = derive(rightRaw, check.right.derive, tables, bands);
        // Both sides must derive. One side that does not is an absence.
        if (left === null || right === null) continue;
        if (left !== right) {
          emit(record, check, [check.left.field, check.right.field], `${leftRaw} / ${rightRaw}`);
        }
        continue;
      }

      if (check.kind === "ordering") {
        const a = record.fields[check.earlier];
        const b = record.fields[check.later];
        if (isBlank(a) || isBlank(b)) continue;
        // ISO strings, compared lexicographically. No date library, no clock.
        if (a > b) {
          emit(record, check, [check.earlier, check.later], `${a} > ${b}`);
        }
        continue;
      }

      if (check.kind === "band") {
        const leftRaw = record.fields[check.left.field];
        const rightRaw = record.fields[check.right.field];
        if (isBlank(leftRaw) || isBlank(rightRaw)) continue;
        const leftTable = bands.get(check.left.table);
        const rightTable = bands.get(check.right.table);
        if (leftTable === undefined || rightTable === undefined) continue;
        const left = bandOf(leftRaw, leftTable);
        const right = bandOf(rightRaw, rightTable);
        if (left === null || right === null) continue;
        if (!check.compatible.includes(`${left}|${right}`)) {
          emit(
            record,
            check,
            [check.left.field, check.right.field],
            `${left} / ${right}`,
          );
        }
      }
    }
  }

  return defects;
}
