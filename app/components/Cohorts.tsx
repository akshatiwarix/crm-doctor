import Link from "next/link";
import {
  DEFAULT_CONFIG,
  bonferroniZ,
  defectClassKey,
  describeCohort,
  enumerateCohorts,
  wilson,
  type Defect,
  type Diagnosis,
  type Patient,
  type Registries,
} from "@/lib/diagnose";
import { Figure, Marking, Panel, Spread, pct } from "./ui";

/**
 * The enumerated space, with the denominator stated out loud.
 *
 * This view exists because "these cohorts look bad" and "we tested this many
 * hypotheses and these are the ones that survived the correction" are
 * different sentences, and only the second one is worth anything. The count is
 * printed at the top, not in a footnote.
 */
export function Cohorts({
  diagnosis,
  patient,
  registries,
  selectedClass,
}: {
  diagnosis: Diagnosis;
  patient: Patient;
  registries: Registries;
  selectedClass: string | null;
}) {
  const classes = new Map<string, { label: string; defects: Defect[] }>();
  for (const defect of diagnosis.defects) {
    const key = defectClassKey(defect);
    const target =
      defect.target.type === "field"
        ? defect.target.field
        : defect.target.fields.join(" / ");
    const entry = classes.get(key);
    if (entry === undefined) {
      classes.set(key, {
        label: `${defect.object}.${target} — ${defect.detector}`,
        defects: [defect],
      });
    } else {
      entry.defects.push(defect);
    }
  }

  const keys = [...classes.keys()].sort(
    (a, b) => (classes.get(b)?.defects.length ?? 0) - (classes.get(a)?.defects.length ?? 0),
  );
  const active = selectedClass !== null && classes.has(selectedClass) ? selectedClass : keys[0];
  const entry = active === undefined ? undefined : classes.get(active);

  const { cohorts, members } = enumerateCohorts(patient, registries);
  const object = entry?.defects[0]?.object ?? "account";
  const population: number[] = [];
  patient.records.forEach((record, i) => {
    if (record.object === object) population.push(i);
  });
  const inPopulation = new Set(population);
  const indexById = new Map(patient.records.map((r, i) => [r.id, i]));
  const defective = new Set(
    (entry?.defects ?? [])
      .map((d) => indexById.get(d.recordId))
      .filter((i): i is number => i !== undefined),
  );
  const z = bonferroniZ(DEFAULT_CONFIG.alpha, diagnosis.cohortsTested);

  const rows = cohorts
    .map((cohort, i) => {
      const bucket = (members[i] ?? []).filter((index) => inPopulation.has(index));
      const total = bucket.length;
      const bad = bucket.filter((index) => defective.has(index)).length;
      const outsideTotal = population.length - total;
      const outsideBad = defective.size - bad;
      return {
        cohort,
        total,
        bad,
        rate: total === 0 ? 0 : bad / total,
        background: outsideTotal === 0 ? 0 : outsideBad / outsideTotal,
        interval: wilson(bad, total, z),
      };
    })
    .filter((row) => row.total > 0)
    .sort((a, b) => b.rate - a.rate || b.total - a.total)
    .slice(0, 40);

  return (
    <div className="flex flex-col gap-5">
      <p className="claim max-w-prose">
        The cohort space is conjunctions of at most two declared provenance
        dimensions, so it is bounded and countable. This patient has{" "}
        <Figure>{cohorts.length.toLocaleString()}</Figure> distinct cohorts and{" "}
        <Figure>{classes.size}</Figure> defect classes —{" "}
        <Figure>{diagnosis.cohortsTested.toLocaleString()}</Figure> hypotheses,
        and the significance threshold is divided by exactly that number rather
        than by an estimate.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {keys.slice(0, 18).map((key) => (
          <Link
            key={key}
            href={`/?v=cohorts&c=${encodeURIComponent(key)}&p=${patient.id}`}
            className={`rounded-xs border px-2 py-1 text-[11px] ${
              key === active
                ? "border-accent bg-accent-soft text-accent"
                : "border-rule text-slate hover:border-rule-strong"
            }`}
          >
            {classes.get(key)?.label}
          </Link>
        ))}
      </div>

      <Panel
        title={classes.get(active ?? "")?.label ?? "cohorts"}
        note={`top 40 of ${cohorts.length} cohorts by rate · z = ${z.toFixed(3)}`}
      >
        <table className="w-full">
          <thead>
            <tr className="border-b border-rule">
              <th className="px-4 py-2 text-left">
                <Marking>Cohort</Marking>
              </th>
              <th className="w-20 px-4 py-2 text-right">
                <Marking>n</Marking>
              </th>
              <th className="w-20 px-4 py-2 text-right">
                <Marking>Rate</Marking>
              </th>
              <th className="w-64 px-4 py-2 text-left">
                <Marking>Interval vs background</Marking>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              // Below the support floor the interval is drawn as an empty
              // dashed box rather than as a very wide bar. A wide bar still
              // reads as a measurement; the dashed box reads as "we did not
              // measure this", which is what it means.
              const claimable = row.total >= DEFAULT_CONFIG.minSupport;
              return (
                <tr
                  key={row.cohort.id}
                  className={`border-b border-rule/60 text-sm last:border-0 ${
                    row.total < DEFAULT_CONFIG.minSupport ? "text-unclaimed" : ""
                  }`}
                >
                  <td className="px-4 py-2">
                    <span>{describeCohort(row.cohort, patient, registries)}</span>
                    {row.total < DEFAULT_CONFIG.minSupport ? (
                      <span className="mt-0.5 block text-[10px] uppercase tracking-wide">
                        n too small to claim
                      </span>
                    ) : null}
                  </td>
                  <td className="px-4 py-2 text-right figure">{row.total}</td>
                  <td className="px-4 py-2 text-right figure">{pct(row.rate)}</td>
                  <td className="px-4 py-2">
                    {claimable ? (
                      <Spread
                        rate={row.rate}
                        lower={row.interval.lower}
                        upper={row.interval.upper}
                        background={row.background}
                      />
                    ) : (
                      <div className="h-4 rounded-xs border border-dashed border-rule-strong" />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <p className="max-w-prose text-xs leading-relaxed text-faint">
        A row sitting above the background mark is not a finding. It becomes one
        only if its interval clears the background&apos;s own interval, it holds at
        least {DEFAULT_CONFIG.minSupport} records, it reaches {DEFAULT_CONFIG.minLift}×
        the background rate, and no overlapping cohort explains it away.
      </p>
    </div>
  );
}
