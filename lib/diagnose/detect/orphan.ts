import type { Defect, Patient, Registries } from "../types";

/**
 * A reference that points at nothing.
 *
 * Two shapes, and they are one defect kind on purpose: a contact with no
 * account at all and a contact naming an account that does not exist are the
 * same failure from the point of view of anything downstream that tries to
 * follow the link. The detector id distinguishes them for display.
 */
export function detectOrphans(
  patient: Patient,
  registries: Registries,
): Defect[] {
  const orphanChecks = registries.checks.filter((c) => c.kind === "orphan");
  if (orphanChecks.length === 0) return [];

  const accountIds = new Set(
    patient.records.filter((r) => r.object === "account").map((r) => r.id),
  );
  const defects: Defect[] = [];

  for (const check of orphanChecks) {
    for (const record of patient.records) {
      if (record.object !== check.object) continue;
      if (record.accountId === null) {
        defects.push({
          recordId: record.id,
          object: record.object,
          kind: "ORPHAN",
          target: { type: "field", field: "accountId" },
          detector: `${check.id}:unlinked`,
        });
        continue;
      }
      if (!accountIds.has(record.accountId)) {
        defects.push({
          recordId: record.id,
          object: record.object,
          kind: "ORPHAN",
          target: { type: "field", field: "accountId" },
          detector: `${check.id}:dangling`,
          observed: record.accountId,
        });
      }
    }
  }

  return defects;
}
