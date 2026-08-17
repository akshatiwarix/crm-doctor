import Link from "next/link";
import {
  describeCohort,
  type Finding,
  type Patient,
  type Registries,
} from "@/lib/diagnose";
import { Chip, Figure, Marking, OnsetSplit, Spread, pct } from "./ui";

export function findingId(finding: Finding): string {
  const target =
    finding.defectClass.target.type === "field"
      ? finding.defectClass.target.field
      : finding.defectClass.target.fields.join("+");
  const where =
    finding.type === "LOCALIZED" ? finding.locus.id
    : finding.type === "UNDERPOWERED" ? finding.cohort.id
    : finding.type === "CONFOUNDED" ? finding.cohorts.map((c) => c.id).join("|")
    : "all";
  return `${finding.type}:${finding.defectClass.object}.${target}.${finding.defectClass.detector}:${where}`;
}

const DEFECT_TONE = {
  ABSENT: "absent",
  COUNTERFEIT: "counterfeit",
  CONTRADICTION: "contradiction",
  ORPHAN: "orphan",
} as const;

function fieldPhrase(finding: Finding): string {
  const target = finding.defectClass.target;
  return target.type === "field" ? target.field : target.fields.join(" / ");
}

function defectPhrase(finding: Finding): string {
  const { kind, detector } = finding.defectClass;
  const field = fieldPhrase(finding);
  switch (kind) {
    case "ABSENT":
      return `${field} is empty`;
    case "COUNTERFEIT":
      return `${field} holds a ${detector} value`;
    case "CONTRADICTION":
      return `${field} disagree`;
    case "ORPHAN":
      return detector.endsWith("unlinked")
        ? "the record has no account at all"
        : "the record names an account that does not exist";
  }
}

function href(view: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  search.set("v", view);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) search.set(key, value);
  }
  return `/?${search.toString()}`;
}

export function Findings({
  findings,
  patient,
  registries,
  cohortsTested,
  showUnderpowered,
}: {
  findings: readonly Finding[];
  patient: Patient;
  registries: Registries;
  cohortsTested: number;
  showUnderpowered: boolean;
}) {
  const localized = findings.filter((f) => f.type === "LOCALIZED");
  const confounded = findings.filter((f) => f.type === "CONFOUNDED");
  const pervasive = findings.filter((f) => f.type === "PERVASIVE");
  const underpowered = findings.filter((f) => f.type === "UNDERPOWERED");

  return (
    <div className="flex flex-col gap-10">
      <Section
        title="Localised"
        blurb="Elevated in one cohort, and the elevation survives conditioning on every cohort that overlaps it."
        count={localized.length}
      >
        {localized.map((finding) => {
          if (finding.type !== "LOCALIZED") return null;
          return (
            <article
              key={findingId(finding)}
              className="rounded-sm border border-rule bg-card p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip tone={DEFECT_TONE[finding.defectClass.kind]}>
                  {finding.defectClass.kind}
                </Chip>
                <Chip>{finding.defectClass.object}</Chip>
                <OnsetChip finding={finding} />
              </div>

              <p className="claim">
                <strong className="font-semibold">{defectPhrase(finding)}</strong> on{" "}
                <Figure>{pct(finding.inside.rate)}</Figure> of{" "}
                {describeCohort(finding.locus, patient, registries)} records (
                <Figure>{finding.inside.defective.toLocaleString()}</Figure> of{" "}
                <Figure>{finding.inside.total.toLocaleString()}</Figure>), against{" "}
                <Figure>{pct(finding.outside.rate)}</Figure> everywhere else.
                {finding.onset.at === null
                  ? " No change-point clears the threshold, so this has always been true here."
                  : finding.onset.class === "ONSET"
                    ? ` It starts on ${finding.onset.at}.`
                    : ` It stopped on ${finding.onset.at}.`}
              </p>

              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div>
                  <Marking>Rate, with interval, against background</Marking>
                  <div className="mt-2">
                    <Spread
                      rate={finding.inside.rate}
                      lower={finding.interval.lower}
                      upper={finding.interval.upper}
                      background={finding.outside.rate}
                    />
                  </div>
                  <p className="mt-1.5 text-[11px] figure text-faint">
                    {pct(finding.interval.lower)} – {pct(finding.interval.upper)}, corrected
                    for {cohortsTested.toLocaleString()} hypotheses
                  </p>
                </div>

                {finding.onset.at === null ? null : (
                  <div>
                    <Marking>
                      {finding.onset.class === "ONSET" ? "Onset" : "Healed"} · width is
                      record count
                    </Marking>
                    <div className="mt-2">
                      <OnsetSplit
                        before={finding.onset.before}
                        after={finding.onset.after}
                        tone={finding.onset.class === "ONSET" ? "active" : "healed"}
                      />
                    </div>
                    <p className="mt-1.5 text-[11px] figure text-faint">
                      before {finding.onset.at}: {pct(finding.onset.before.rate)} (n=
                      {finding.onset.before.total}) · after:{" "}
                      {pct(finding.onset.after.rate)} (n={finding.onset.after.total})
                    </p>
                  </div>
                )}
              </div>

              {finding.attributable.length === 0 ? null : (
                <p className="mt-4 border-t border-rule pt-3 text-[11px] text-faint">
                  {finding.attributable.length} other cohort
                  {finding.attributable.length === 1 ? " looks" : "s look"} elevated and{" "}
                  {finding.attributable.length === 1 ? "is" : "are"} attributable to this
                  one — {finding.attributable.slice(0, 3).map((c) => describeCohort(c, patient, registries)).join("; ")}
                  {finding.attributable.length > 3 ? ", …" : ""}
                </p>
              )}

              <Link
                href={href("records", { f: findingId(finding) })}
                className="mt-3 inline-block text-[11px] text-accent underline underline-offset-2"
              >
                See the records
              </Link>
            </article>
          );
        })}
      </Section>

      <Section
        title="Confounded"
        blurb="Two cohorts are elevated and are very nearly the same records, so almost nothing sits outside the overlap to test with. The tool names both and declines to pick."
        count={confounded.length}
      >
        {confounded.map((finding) => {
          if (finding.type !== "CONFOUNDED") return null;
          return (
            <article
              key={findingId(finding)}
              className="rounded-sm border border-confounded/40 bg-confounded-soft/40 p-4"
            >
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Chip tone={DEFECT_TONE[finding.defectClass.kind]}>
                  {finding.defectClass.kind}
                </Chip>
                <Chip>overlap {finding.overlap.toFixed(2)}</Chip>
              </div>
              <p className="claim">
                <strong className="font-semibold">{defectPhrase(finding)}</strong> on{" "}
                <Figure>{pct(finding.rates[0]?.rate ?? 0)}</Figure> of{" "}
                {finding.cohorts
                  .map((c) => describeCohort(c, patient, registries))
                  .join(" and of ")}{" "}
                records. These two cohorts are{" "}
                <Figure>{pct(finding.overlap)}</Figure> the same records.{" "}
                <strong className="font-semibold">
                  This data cannot say which of them is the cause.
                </strong>
              </p>
              <p className="mt-3 text-xs leading-relaxed text-slate">
                Fewer than twenty records sit outside the overlap, so conditioning
                each on the other separates nothing. No amount of arithmetic will
                resolve it — finding out means looking at how the two came to
                coincide.
              </p>
            </article>
          );
        })}
      </Section>

      <Section
        title="Pervasive"
        blurb="Elevated nowhere. No cohort beats the background, so there is no incident to hunt — the field was never collected."
        count={pervasive.length}
      >
        <div className="rounded-sm border border-rule bg-card">
          {pervasive.map((finding) => {
            if (finding.type !== "PERVASIVE") return null;
            return (
              <div
                key={findingId(finding)}
                className="flex flex-wrap items-baseline justify-between gap-3 border-b border-rule/60 px-4 py-3 last:border-0"
              >
                <p className="claim">
                  {defectPhrase(finding)} on{" "}
                  <Figure>{pct(finding.overall.rate)}</Figure> of{" "}
                  {finding.defectClass.object}s, and no cohort explains it.
                </p>
                <p className="text-[11px] figure text-faint">
                  {finding.overall.defective.toLocaleString()} of{" "}
                  {finding.overall.total.toLocaleString()} ·{" "}
                  {finding.cohortsTested.toLocaleString()} hypotheses tested
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <section>
        <div className="mb-3 border-t-2 border-dashed border-rule-strong pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="marking">Not claimed · {underpowered.length}</h2>
            <Link
              href={href("findings", { u: showUnderpowered ? undefined : "1" })}
              className="text-[11px] text-accent underline underline-offset-2"
            >
              {showUnderpowered ? "Hide" : "Show"}
            </Link>
          </div>
          <p className="mt-2 max-w-prose text-xs leading-relaxed text-slate">
            Visibly elevated, not defensibly elevated. These are counted here and
            are never added to anything above — summing them with the claims would
            destroy the meaning of the threshold, which is the only reason any
            number on this page can be believed.
          </p>
        </div>

        {!showUnderpowered ? null : (
          <div className="rounded-sm border border-dashed border-rule-strong">
            {underpowered.map((finding) => {
              if (finding.type !== "UNDERPOWERED") return null;
              return (
                <div
                  key={findingId(finding)}
                  className="flex flex-wrap items-baseline justify-between gap-3 border-b border-dashed border-rule px-4 py-2.5 text-xs text-unclaimed last:border-0"
                >
                  <span>
                    {defectPhrase(finding)} ·{" "}
                    {describeCohort(finding.cohort, patient, registries)}
                  </span>
                  <span className="figure whitespace-nowrap">
                    {finding.inside.defective}/{finding.inside.total} ={" "}
                    {pct(finding.inside.rate)} · vs {pct(finding.outside.rate)} ·{" "}
                    {finding.reason === "MIN_SUPPORT"
                      ? "too few records to claim"
                      : `interval ${pct(finding.interval.lower)}–${pct(finding.interval.upper)} reaches the background`}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

function OnsetChip({ finding }: { finding: Finding }) {
  if (finding.type !== "LOCALIZED") return null;
  const { onset } = finding;
  const label =
    onset.class === "ONSET" ? "still happening"
    : onset.class === "HEALED" ? "stopped"
    : "always been true";
  const tone =
    onset.class === "ONSET"
      ? "border-active/50 text-active bg-active-soft"
      : onset.class === "HEALED"
        ? "border-healed/50 text-healed bg-healed-soft"
        : "border-chronic/50 text-chronic bg-chronic-soft";
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${tone}`}
    >
      {onset.class} · {label}
    </span>
  );
}

function Section({
  title,
  blurb,
  count,
  children,
}: {
  title: string;
  blurb: string;
  count: number;
  children: React.ReactNode;
}) {
  return (
    <section>
      <header className="mb-3">
        <h2 className="marking">
          {title} · {count}
        </h2>
        <p className="mt-2 max-w-prose text-xs leading-relaxed text-slate">{blurb}</p>
      </header>
      {count === 0 ? (
        <p className="rounded-sm border border-rule bg-card px-4 py-3 text-xs text-faint">
          Nothing in this class.
        </p>
      ) : (
        <div className="flex flex-col gap-3">{children}</div>
      )}
    </section>
  );
}
