import {
  describeCohort,
  type Cohort,
  type Defect,
  type Diagnosis,
  type Patient,
  type Registries,
} from "@/lib/diagnose";
import { Chip, Figure, Marking, Panel } from "./ui";
import { findingId } from "./Findings";

const LIMIT = 60;

const DEFECT_TONE = {
  ABSENT: "absent",
  COUNTERFEIT: "counterfeit",
  CONTRADICTION: "contradiction",
  ORPHAN: "orphan",
} as const;

/**
 * The records behind a finding.
 *
 * Reached from a finding, filtered to that finding's cohort and defect class,
 * so a reader can check the claim against rows rather than taking it. The cap
 * is stated: a list that silently stops at sixty reads as "there were sixty".
 */
export function Records({
  diagnosis,
  patient,
  registries,
  selected,
}: {
  diagnosis: Diagnosis;
  patient: Patient;
  registries: Registries;
  selected: string | null;
}) {
  const finding =
    selected === null
      ? undefined
      : diagnosis.findings.find((f) => findingId(f) === selected);

  const cohort: Cohort | undefined =
    finding?.type === "LOCALIZED" ? finding.locus
    : finding?.type === "UNDERPOWERED" ? finding.cohort
    : finding?.type === "CONFOUNDED" ? finding.cohorts[0]
    : undefined;

  const inCohort = (record: Patient["records"][number]): boolean => {
    if (cohort === undefined) return true;
    return cohort.terms.every((term) => {
      const dimension = registries.dimensions.find((d) => d.id === term.dimension);
      if (dimension === undefined) return false;
      return record.provenance[dimension.key] === term.value;
    });
  };

  const matchesClass = (defect: Defect): boolean => {
    if (finding === undefined) return true;
    const c = finding.defectClass;
    const same =
      defect.kind === c.kind &&
      defect.detector === c.detector &&
      defect.object === c.object;
    if (!same) return false;
    if (defect.target.type !== c.target.type) return false;
    return JSON.stringify(defect.target) === JSON.stringify(c.target);
  };

  const byRecord = new Map<string, Defect[]>();
  for (const defect of diagnosis.defects) {
    if (!matchesClass(defect)) continue;
    byRecord.set(defect.recordId, [...(byRecord.get(defect.recordId) ?? []), defect]);
  }

  const matching = patient.records.filter(
    (record) => byRecord.has(record.id) && inCohort(record),
  );
  const shown = matching.slice(0, LIMIT);

  return (
    <div className="flex flex-col gap-5">
      <p className="claim max-w-prose">
        {finding === undefined ? (
          <>Every record carrying a defect. Open a finding to filter this list to it.</>
        ) : (
          <>
            <Figure>{matching.length.toLocaleString()}</Figure> records carry this
            defect
            {cohort === undefined
              ? ""
              : ` in ${describeCohort(cohort, patient, registries)}`}
            . {matching.length > LIMIT ? `The first ${LIMIT} are listed below — the rest are in the CSV.` : ""}
          </>
        )}
      </p>

      <Panel
        title="Records"
        note={`showing ${shown.length.toLocaleString()} of ${matching.length.toLocaleString()}`}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-rule">
              <th className="w-32 px-4 py-2 text-left">
                <Marking>Record</Marking>
              </th>
              <th className="px-4 py-2 text-left">
                <Marking>Name</Marking>
              </th>
              <th className="px-4 py-2 text-left">
                <Marking>Defect</Marking>
              </th>
              <th className="px-4 py-2 text-left">
                <Marking>Provenance</Marking>
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((record) => {
              const defects = byRecord.get(record.id) ?? [];
              return (
                <tr key={record.id} className="border-b border-rule/60 text-sm last:border-0">
                  <td className="px-4 py-2 font-mono text-xs text-faint">{record.id}</td>
                  <td className="px-4 py-2">{record.fields.name ?? "—"}</td>
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {defects.slice(0, 3).map((defect, i) => (
                        <Chip key={i} tone={DEFECT_TONE[defect.kind]}>
                          {defect.target.type === "field"
                            ? defect.target.field
                            : defect.target.fields.join("/")}
                          {defect.observed === undefined ? "" : `: ${defect.observed}`}
                        </Chip>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-slate">
                    {record.provenance.sourceId} · {record.provenance.ownerId} ·{" "}
                    {record.provenance.createdAt}
                  </td>
                </tr>
              );
            })}
            {shown.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-xs text-faint">
                  No records match.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </Panel>

      <p className="max-w-prose text-xs leading-relaxed text-faint">
        A contradiction chip names the pair of fields, never one of them. There is
        no ground truth about which side is wrong, and this tool does not decide —
        which is also why it never offers to fix one.
      </p>
    </div>
  );
}
