import Link from "next/link";
import { patientById, patients, registries } from "@/data";
import { DEFAULT_CONFIG, detect, diagnose, findingsToCsv } from "@/lib/diagnose";
import { candidatesFor, residueSize, triageableFields } from "@/lib/triage/candidates";
import { Cohorts } from "./components/Cohorts";
import { DownloadCsv } from "./components/DownloadCsv";
import { Findings } from "./components/Findings";
import { Records } from "./components/Records";
import { TriagePanel } from "./components/TriagePanel";
import { Vitals } from "./components/Vitals";
import { Figure, pct } from "./components/ui";

const VIEWS = ["vitals", "findings", "cohorts", "records"] as const;
type View = (typeof VIEWS)[number];

function first(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function Console(props: PageProps<"/">) {
  const params = await props.searchParams;

  const patientId = first(params.p) ?? "northwind";
  const patient = patientById(patientId);
  const requested = first(params.v);
  const view: View = VIEWS.find((v) => v === requested) ?? "vitals";
  const selectedFinding = first(params.f);
  const selectedClass = first(params.c);
  const showUnderpowered = first(params.u) === "1";

  const diagnosis = diagnose(patient, registries);
  const claims = diagnosis.findings.filter((f) => f.type !== "UNDERPOWERED");
  const nonClaims = diagnosis.findings.length - claims.length;

  const defects = detect(patient, registries, DEFAULT_CONFIG);
  const triageFields = triageableFields(patient).map((field) => ({
    object: field.object,
    id: field.id,
    label: field.label,
    residue: residueSize(patient, defects, field.object, field.id),
  }));
  // Touch the candidate selector on the server so a field with an empty
  // residue never reaches the panel as a live option.
  const withResidue = triageFields.filter(
    (f) => candidatesFor(patient, defects, f.object, f.id).length > 0,
  );

  const worst = [...diagnosis.vitals]
    .filter((v) => v.total > 0)
    .sort(
      (a, b) => (b.populated - b.known) / b.total - (a.populated - a.known) / a.total,
    )[0];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-5 py-8">
      <header className="flex flex-col gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold tracking-tight">CRM Doctor</h1>
            <p className="mt-1 max-w-prose text-xs leading-relaxed text-slate">
              A defect rate is a symptom. Every finding below carries a locus and,
              where the data supports one, a date.
            </p>
          </div>
          <div className="flex items-center gap-2">
            {patients.map((p) => (
              <Link
                key={p.id}
                href={`/?p=${p.id}&v=${view}`}
                className={`rounded-xs border px-2.5 py-1 text-[11px] ${
                  p.id === patient.id
                    ? "border-accent bg-accent-soft text-accent"
                    : "border-rule text-slate hover:border-rule-strong"
                }`}
              >
                {p.name}
              </Link>
            ))}
            <DownloadCsv
              csv={findingsToCsv(diagnosis, patient, registries)}
              filename={`${patient.id}-findings.csv`}
            />
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-rule bg-rule sm:grid-cols-4">
          <Stat label="Records" value={patient.records.length.toLocaleString()} />
          <Stat
            label="Hypotheses tested"
            value={diagnosis.cohortsTested.toLocaleString()}
          />
          <Stat label="Claimed" value={String(claims.length)} />
          <Stat label="Not claimed" value={String(nonClaims)} muted />
        </dl>

        {worst === undefined ? null : (
          <p className="text-[11px] text-faint">
            Widest gap between populated and known:{" "}
            <span className="text-slate">{worst.label}</span> —{" "}
            <Figure>{pct(worst.populated / worst.total)}</Figure> populated,{" "}
            <Figure>{pct(worst.known / worst.total)}</Figure> known.
          </p>
        )}

        <nav className="flex gap-1 border-b border-rule">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={`/?p=${patient.id}&v=${v}${showUnderpowered ? "&u=1" : ""}`}
              className={`-mb-px border-b-2 px-3 py-2 text-xs uppercase tracking-wider ${
                v === view
                  ? "border-accent text-accent"
                  : "border-transparent text-faint hover:text-slate"
              }`}
            >
              {v}
            </Link>
          ))}
        </nav>
      </header>

      <main className="flex flex-col gap-8">
        {view === "vitals" ? <Vitals vitals={diagnosis.vitals} /> : null}
        {view === "findings" ? (
          <Findings
            findings={diagnosis.findings}
            patient={patient}
            registries={registries}
            cohortsTested={diagnosis.cohortsTested}
            showUnderpowered={showUnderpowered}
          />
        ) : null}
        {view === "cohorts" ? (
          <Cohorts
            diagnosis={diagnosis}
            patient={patient}
            registries={registries}
            selectedClass={selectedClass}
          />
        ) : null}
        {view === "records" ? (
          <Records
            diagnosis={diagnosis}
            patient={patient}
            registries={registries}
            selected={selectedFinding}
          />
        ) : null}

        {view === "vitals" && withResidue.length > 0 ? (
          <TriagePanel patientId={patient.id} fields={withResidue} />
        ) : null}
      </main>

      <footer className="mt-4 border-t border-rule pt-4 text-[11px] leading-relaxed text-faint">
        <p className="max-w-prose">
          Claims and non-claims are counted separately and are never summed.
          Deterministic findings and model verdicts are never merged. There is no
          score anywhere on this page, and nothing here will offer to fix a record
          — diagnosis is not treatment.
        </p>
        <p className="mt-2">
          Day 010 of a 100-day build challenge ·{" "}
          <a
            className="underline underline-offset-2"
            href="https://github.com/akshatiwarix/crm-doctor"
          >
            source
          </a>{" "}
          · the corpus is synthetic and every domain ends in{" "}
          <code>.example</code>
        </p>
      </footer>
    </div>
  );
}

function Stat({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={`bg-card px-4 py-3 ${muted ? "opacity-70" : ""}`}>
      <dt className="marking">{label}</dt>
      <dd
        className={`mt-1 figure text-lg ${muted ? "text-unclaimed" : "text-ink"}`}
      >
        {value}
      </dd>
    </div>
  );
}
