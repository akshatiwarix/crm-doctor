/**
 * Getting findings out, and getting a view back in.
 *
 * The CSV carries the epistemic class in a column, not in the row order. A
 * spreadsheet sorts, and the moment somebody sorts by "records affected" a
 * six-record non-claim lands next to a four-hundred-record proof. `class` and
 * `claim` are the first two columns so the distinction survives being pasted
 * into a deck.
 */

import type { Cohort, Diagnosis, Finding, Patient, Registries } from "./types";
import { describeCohort } from "./cohorts";

const COLUMNS = [
  "class",
  "claim",
  "object",
  "field",
  "defect",
  "detector",
  "cohort",
  "records",
  "defective",
  "rate",
  "background",
  "interval_low",
  "interval_high",
  "onset",
  "onset_date",
] as const;

function escape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function fieldOf(finding: Finding): string {
  const target = finding.defectClass.target;
  return target.type === "field" ? target.field : target.fields.join(" + ");
}

function cohortText(
  cohorts: readonly Cohort[],
  patient: Patient,
  registries: Registries,
): string {
  return cohorts.map((c) => describeCohort(c, patient, registries)).join(" · ");
}

export function findingsToCsv(
  diagnosis: Diagnosis,
  patient: Patient,
  registries: Registries,
): string {
  const rows: string[][] = [[...COLUMNS]];

  for (const finding of diagnosis.findings) {
    const common = [
      finding.type,
      // Spelled out rather than left implicit: a reader in a spreadsheet has
      // none of the console's typography to tell them which rows are claims.
      finding.type === "UNDERPOWERED" ? "not claimed" : "claimed",
      finding.defectClass.object,
      fieldOf(finding),
      finding.defectClass.kind,
      finding.defectClass.detector,
    ];

    if (finding.type === "LOCALIZED") {
      rows.push([
        ...common,
        cohortText([finding.locus], patient, registries),
        String(finding.inside.total),
        String(finding.inside.defective),
        finding.inside.rate.toFixed(4),
        finding.outside.rate.toFixed(4),
        finding.interval.lower.toFixed(4),
        finding.interval.upper.toFixed(4),
        finding.onset.class,
        finding.onset.at ?? "",
      ]);
    } else if (finding.type === "CONFOUNDED") {
      rows.push([
        ...common,
        cohortText(finding.cohorts, patient, registries),
        String(finding.rates[0]?.total ?? 0),
        String(finding.rates[0]?.defective ?? 0),
        (finding.rates[0]?.rate ?? 0).toFixed(4),
        "",
        (finding.intervals[0]?.lower ?? 0).toFixed(4),
        (finding.intervals[0]?.upper ?? 0).toFixed(4),
        "",
        "",
      ]);
    } else if (finding.type === "PERVASIVE") {
      rows.push([
        ...common,
        "no cohort",
        String(finding.overall.total),
        String(finding.overall.defective),
        finding.overall.rate.toFixed(4),
        "",
        "",
        "",
        "",
        "",
      ]);
    } else {
      rows.push([
        ...common,
        cohortText([finding.cohort], patient, registries),
        String(finding.inside.total),
        String(finding.inside.defective),
        finding.inside.rate.toFixed(4),
        finding.outside.rate.toFixed(4),
        finding.interval.lower.toFixed(4),
        finding.interval.upper.toFixed(4),
        finding.reason,
        "",
      ]);
    }
  }

  return rows.map((row) => row.map(escape).join(",")).join("\n") + "\n";
}

// ---------------------------------------------------------------------------
// Permalink
// ---------------------------------------------------------------------------

export interface ConsoleView {
  readonly patientId: string;
  readonly view: "vitals" | "findings" | "cohorts" | "records";
  /** Index into the rendered findings list, or null. */
  readonly finding: string | null;
  readonly showUnderpowered: boolean;
}

export const DEFAULT_VIEW: ConsoleView = {
  patientId: "northwind",
  view: "vitals",
  finding: null,
  showUnderpowered: false,
};

export function encodeView(view: ConsoleView): string {
  const params = new URLSearchParams();
  params.set("p", view.patientId);
  params.set("v", view.view);
  if (view.finding !== null) params.set("f", view.finding);
  if (view.showUnderpowered) params.set("u", "1");
  return params.toString();
}

/**
 * Permissive on the way in. A link that has been through a chat client and
 * lost a parameter should land on the console rather than on an error — but a
 * garbled *view* must not silently become a different view, so unknown values
 * fall back to the default rather than being coerced.
 */
export function decodeView(query: string): ConsoleView {
  const params = new URLSearchParams(query.startsWith("?") ? query.slice(1) : query);
  const view = params.get("v");
  const known = ["vitals", "findings", "cohorts", "records"] as const;
  return {
    patientId: params.get("p") ?? DEFAULT_VIEW.patientId,
    view: known.find((v) => v === view) ?? DEFAULT_VIEW.view,
    finding: params.get("f"),
    showUnderpowered: params.get("u") === "1",
  };
}
