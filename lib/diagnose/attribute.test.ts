import { describe, expect, it } from "vitest";
import { analyseDefectClass, type ClassInput } from "./attribute";
import { DEFAULT_CONFIG } from "./diagnose";
import { bonferroniZ } from "./stats";
import type { Cohort, DefectClass, Finding } from "./types";

const defectClass: DefectClass = {
  kind: "ABSENT",
  target: { type: "field", field: "industry" },
  detector: "absent",
  object: "account",
};

function cohortOf(id: string, terms: [string, string][]): Cohort {
  return { id, terms: terms.map(([dimension, value]) => ({ dimension, value })) };
}

/**
 * A synthetic population of `size` records, with named cohorts given as index
 * ranges and a defect predicate. Everything is explicit so a failing test says
 * which rule broke rather than which corpus drifted.
 */
function build(options: {
  size: number;
  cohorts: Record<string, readonly number[]>;
  defective: (index: number) => boolean;
  config?: Partial<typeof DEFAULT_CONFIG>;
}): ClassInput {
  const config = { ...DEFAULT_CONFIG, ...options.config };
  const population = Array.from({ length: options.size }, (_, i) => i);
  const names = Object.keys(options.cohorts);
  const cohorts = names.map((name) =>
    cohortOf(name, [[name.split("=")[0] ?? name, name.split("=")[1] ?? name]]),
  );
  const cohortsTested = cohorts.length;
  return {
    defectClass,
    population,
    defective: new Set(population.filter(options.defective)),
    cohorts,
    cohortMembers: names.map((name) => options.cohorts[name] ?? []),
    z: bonferroniZ(config.alpha, cohortsTested),
    cohortsTested,
    // One record per day, so onset has real dates to split on.
    dateOf: (i) => `2025-${String(1 + Math.floor(i / 28)).padStart(2, "0")}-${String((i % 28) + 1).padStart(2, "0")}`,
    config,
  };
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => from + i);

function typesOf(findings: readonly Finding[]) {
  return findings.map((f) => f.type);
}

describe("analyseDefectClass", () => {
  it("localises a defect that lives in one cohort", () => {
    const findings = analyseDefectClass(
      build({
        size: 400,
        cohorts: { "source=webinar": range(0, 100), "source=outbound": range(100, 400) },
        defective: (i) => i < 90,
      }),
    );
    const localized = findings.filter((f) => f.type === "LOCALIZED");
    expect(localized).toHaveLength(1);
    expect(localized[0]?.type === "LOCALIZED" && localized[0].locus.id).toBe("source=webinar");
  });

  it("reports PERVASIVE when no cohort is elevated", () => {
    // The honest negative result. The field was never collected; there is no
    // incident to hunt and the fix is a schema change, not a conversation.
    const findings = analyseDefectClass(
      build({
        size: 400,
        cohorts: { "source=a": range(0, 200), "source=b": range(200, 400) },
        defective: (i) => i % 5 === 0,
      }),
    );
    expect(typesOf(findings)).toContain("PERVASIVE");
    expect(typesOf(findings)).not.toContain("LOCALIZED");
  });

  it("does not report PERVASIVE for a handful of defects", () => {
    const findings = analyseDefectClass(
      build({
        size: 400,
        cohorts: { "source=a": range(0, 200), "source=b": range(200, 400) },
        defective: (i) => i < 3,
      }),
    );
    expect(typesOf(findings)).not.toContain("PERVASIVE");
  });

  it("refuses to pick between two cohorts that are nearly the same records", () => {
    // The refusal is the product. Fewer than `minSupport` records sit outside
    // the overlap, so no arithmetic can separate them — the only way to find
    // out is to go and look at how the two came to coincide.
    const owner = range(0, 200);
    const source = range(5, 205);
    const findings = analyseDefectClass(
      build({
        size: 600,
        cohorts: { "owner=priya": owner, "source=conference": source },
        defective: (i) => i < 205 && i % 10 !== 0,
      }),
    );
    const confounded = findings.find((f) => f.type === "CONFOUNDED");
    expect(confounded).toBeDefined();
    if (confounded?.type !== "CONFOUNDED") throw new Error("unreachable");
    expect(confounded.cohorts.map((c) => c.id).sort()).toEqual([
      "owner=priya",
      "source=conference",
    ]);
    expect(confounded.overlap).toBeGreaterThan(0.9);
  });

  it("does not call containment a confound", () => {
    // `source=webinar` and `source=webinar & type=standard` explain each other
    // in the arithmetic, but one is literally inside the other. Reporting that
    // as "we cannot tell these apart" would be the tool failing to recognise a
    // set as a subset of itself.
    // The refinement drops fifteen records — fewer than `minSupport`, so
    // neither side can be tested against the other — and its rate is no
    // sharper. That is containment, not confounding.
    const outer = range(0, 300);
    const inner = range(0, 285);
    const findings = analyseDefectClass(
      build({
        size: 900,
        cohorts: { "source=webinar": outer, "pair=webinar-standard": inner },
        defective: (i) => i < 300 && i % 10 !== 0,
      }),
    );
    expect(typesOf(findings)).not.toContain("CONFOUNDED");
    const localized = findings.filter((f) => f.type === "LOCALIZED");
    expect(localized).toHaveLength(1);
    // The broader, simpler description wins; the refinement is attributable.
    expect(localized[0]?.type === "LOCALIZED" && localized[0].locus.id).toBe("source=webinar");
  });

  it("attributes an overlapping cohort to the locus rather than reporting it twice", () => {
    // Priya owns most webinar records. Her elevation is the webinar form's.
    const webinar = range(0, 150);
    const priya = [...range(0, 120), ...range(400, 600)];
    const findings = analyseDefectClass(
      build({
        size: 900,
        cohorts: { "source=webinar": webinar, "owner=priya": priya },
        defective: (i) => i < 140,
      }),
    );
    const localized = findings.filter((f) => f.type === "LOCALIZED");
    expect(localized).toHaveLength(1);
    if (localized[0]?.type !== "LOCALIZED") throw new Error("unreachable");
    expect(localized[0].locus.id).toBe("source=webinar");
    expect(localized[0].attributable.map((c) => c.id)).toEqual(["owner=priya"]);
  });

  it("reports a small alarming cohort as a non-claim, not a claim", () => {
    // Six records, five defective, 83%. The number is real and it means
    // nothing.
    const findings = analyseDefectClass(
      build({
        size: 600,
        cohorts: { "owner=dmitri": range(0, 6), "owner=rest": range(6, 600) },
        defective: (i) => i < 5,
      }),
    );
    expect(typesOf(findings)).not.toContain("LOCALIZED");
    const under = findings.find((f) => f.type === "UNDERPOWERED");
    expect(under?.type === "UNDERPOWERED" && under.reason).toBe("MIN_SUPPORT");
  });

  it("reports an interval that still overlaps the background as a non-claim", () => {
    // Twenty-two records clears the support floor, but 23% against a 10%
    // background over that few records is an interval that reaches down into
    // the background's own interval. Both sides are estimates.
    const findings = analyseDefectClass(
      build({
        size: 600,
        cohorts: { "owner=x": range(0, 22), "owner=rest": range(22, 600) },
        defective: (i) => i < 5 || (i >= 22 && i % 10 === 0),
      }),
    );
    const under = findings.filter((f) => f.type === "UNDERPOWERED");
    expect(under.map((f) => f.type === "UNDERPOWERED" && f.reason)).toContain(
      "INTERVAL_OVERLAPS_BASE",
    );
    expect(typesOf(findings)).not.toContain("LOCALIZED");
  });

  it("never emits a claim and a non-claim for the same cohort", () => {
    const input = build({
      size: 400,
      cohorts: { "source=webinar": range(0, 100), "source=outbound": range(100, 400) },
      defective: (i) => i < 90,
    });
    const findings = analyseDefectClass(input);
    const seen = new Map<string, string[]>();
    for (const f of findings) {
      const id =
        f.type === "LOCALIZED" ? f.locus.id
        : f.type === "UNDERPOWERED" ? f.cohort.id
        : null;
      if (id === null) continue;
      seen.set(id, [...(seen.get(id) ?? []), f.type]);
    }
    for (const types of seen.values()) expect(types).toHaveLength(1);
  });

  it("requires materiality as well as significance", () => {
    // 30% against 20% across three thousand records is unambiguously
    // significant — the intervals do not come close to touching — and it is
    // still not a diagnosis. Nobody reorganises a CRM over a 1.5× lift.
    const options = {
      size: 3000,
      cohorts: { "type=standard": range(0, 1500), "type=legacy": range(1500, 3000) },
      defective: (i: number) => (i < 1500 ? i % 10 < 3 : i % 10 < 2),
    };
    expect(typesOf(analyseDefectClass(build(options)))).not.toContain("LOCALIZED");
    expect(
      typesOf(analyseDefectClass(build({ ...options, config: { minLift: 1.1 } }))),
    ).toContain("LOCALIZED");
  });

  it("does not claim against a background estimated from almost nothing", () => {
    // 8 of 229 against 0 of 91. A point estimate of zero is not a known zero,
    // and treating it as one is how a clean org produces confident findings.
    const findings = analyseDefectClass(
      build({
        size: 320,
        cohorts: { "type=standard": range(0, 229), "type=legacy": range(229, 320) },
        defective: (i) => i < 229 && i % 28 === 0,
      }),
    );
    expect(typesOf(findings)).not.toContain("LOCALIZED");
  });

  it("carries the onset of the locus", () => {
    const findings = analyseDefectClass(
      build({
        size: 500,
        cohorts: { "source=webinar": range(0, 200), "source=other": range(200, 500) },
        defective: (i) => i >= 100 && i < 200,
      }),
    );
    const localized = findings.find((f) => f.type === "LOCALIZED");
    if (localized?.type !== "LOCALIZED") throw new Error("expected a localized finding");
    expect(localized.onset.class).toBe("ONSET");
    expect(localized.onset.before.rate).toBe(0);
    expect(localized.onset.after.rate).toBe(1);
  });
});
