/**
 * What the model is allowed to look at.
 *
 * The residue, and nothing else: distinct values in a text or picklist field
 * that survived all six deterministic counterfeit families. Anything a regex
 * can settle has already been settled, and sending it to a model would be
 * paying tokens to re-derive an answer the engine already has — and worse,
 * introducing a way for the two to disagree.
 *
 * Deterministic and capped. Same patient and same field always produce the
 * same candidate list in the same order, so a triage result can be cached, and
 * a field with three thousand distinct values costs one request rather than
 * fifty.
 */

import type { Defect, FieldDescriptor, Patient } from "@/lib/diagnose";

export const MAX_CANDIDATES = 60;

export interface Candidate {
  readonly value: string;
  /** How many records carry it. Sent to the model — a value on one record and
   *  a value on four hundred are different kinds of suspicious. */
  readonly count: number;
}

/** How many distinct values the field has that the deterministic families did
 *  not settle. The console prints this next to the cap, because a queue that
 *  silently truncates reads as "we looked at everything". */
export function residueSize(
  patient: Patient,
  defects: readonly Defect[],
  object: string,
  field: string,
): number {
  const flagged = new Set(
    defects
      .filter(
        (d) =>
          d.kind === "COUNTERFEIT" &&
          d.object === object &&
          d.target.type === "field" &&
          d.target.field === field,
      )
      .map((d) => d.recordId),
  );
  const values = new Set<string>();
  for (const record of patient.records) {
    if (record.object !== object || flagged.has(record.id)) continue;
    const value = record.fields[field];
    if (value === null || value === undefined || value.trim() === "") continue;
    values.add(value);
  }
  return values.size;
}

export function triageableFields(patient: Patient): FieldDescriptor[] {
  // Numbers, dates, phones and emails have shapes, and a shape is something
  // the deterministic families already check. Only prose is genuinely
  // undecidable by pattern.
  return patient.fields.filter((f) => f.kind === "text" || f.kind === "picklist");
}

export function candidatesFor(
  patient: Patient,
  defects: readonly Defect[],
  object: string,
  field: string,
): Candidate[] {
  const alreadyFlagged = new Set(
    defects
      .filter(
        (d) =>
          d.kind === "COUNTERFEIT" &&
          d.object === object &&
          d.target.type === "field" &&
          d.target.field === field,
      )
      .map((d) => d.recordId),
  );

  const counts = new Map<string, number>();
  for (const record of patient.records) {
    if (record.object !== object) continue;
    if (alreadyFlagged.has(record.id)) continue;
    const value = record.fields[field];
    if (value === null || value === undefined || value.trim() === "") continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }

  const populated = [...counts.values()].reduce((sum, n) => sum + n, 0);
  const nearlyUnique = counts.size > populated * 0.5;

  return [...counts.entries()]
    .map(([value, count]) => ({ value, count, priority: priorityOf(value, count, nearlyUnique) }))
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        b.count - a.count ||
        (a.value < b.value ? -1 : 1),
    )
    .slice(0, MAX_CANDIDATES)
    .map(({ value, count }) => ({ value, count }));
}

/**
 * Queue order, and only queue order.
 *
 * The residue of a large field does not fit in one request, so something has
 * to decide which values are looked at first. These three signals do — and
 * they are emphatically not detectors: nothing here flags anything, nothing
 * here reaches a finding, and a value with priority zero is not thereby
 * declared clean. It is declared un-looked-at, which the console says out
 * loud along with how many values were left in the queue.
 *
 * Sorting by rarity instead, which is the obvious first idea, is useless here:
 * in a field of 2,300 distinct company names, "appears once" describes almost
 * every real value and every fake one equally.
 */
function priorityOf(value: string, count: number, nearlyUnique: boolean): number {
  let priority = 0;
  // A company name on three records, in a field where names are otherwise
  // unique, is worth a human's half-second.
  if (nearlyUnique && count > 1) priority += 2;
  // Parentheses and brackets are where people put the annotation they could
  // not put anywhere else.
  if (/[(\[{]/.test(value)) priority += 1;
  // Template text tends to end in an index.
  if (/\d\s*$/.test(value)) priority += 1;
  return priority;
}
