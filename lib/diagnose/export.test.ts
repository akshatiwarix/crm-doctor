import { describe, expect, it } from "vitest";
import { northwind, registries } from "@/data/index";
import { diagnose } from "./diagnose";
import { DEFAULT_VIEW, decodeView, encodeView, findingsToCsv } from "./export";

const diagnosis = diagnose(northwind, registries);
const csv = findingsToCsv(diagnosis, northwind, registries);
const lines = csv.trim().split("\n");

describe("findingsToCsv", () => {
  it("carries the epistemic class in a column, not in the row order", () => {
    // A spreadsheet sorts. The moment somebody sorts by records affected, a
    // six-record non-claim lands next to a four-hundred-record proof.
    expect(lines[0]?.startsWith("class,claim,")).toBe(true);
    const underpowered = lines.filter((line) => line.includes("UNDERPOWERED"));
    expect(underpowered.length).toBeGreaterThan(0);
    for (const line of underpowered) expect(line).toContain("not claimed");
  });

  it("emits one row per finding and nothing else", () => {
    expect(lines).toHaveLength(diagnosis.findings.length + 1);
  });

  it("escapes cohort descriptions containing a comma or a quote", () => {
    const escaped = findingsToCsv(
      {
        ...diagnosis,
        findings: [
          {
            type: "PERVASIVE",
            defectClass: {
              kind: "ABSENT",
              target: { type: "field", field: 'weird","field' },
              detector: "absent",
              object: "account",
            },
            overall: { defective: 1, total: 2, rate: 0.5 },
            cohortsTested: 1,
          },
        ],
      },
      northwind,
      registries,
    );
    expect(escaped).toContain('"weird"",""field"');
    expect(escaped.trim().split("\n")).toHaveLength(2);
  });

  it("never writes a total across finding types", () => {
    // Nothing in the file sums a claim with a non-claim. The CSV is rows, and
    // whoever opens it can sum whatever they like — but the tool will not hand
    // them the number.
    expect(csv).not.toMatch(/^total/im);
  });
});

describe("permalink", () => {
  it("round-trips", () => {
    const view = {
      patientId: "pinecrest",
      view: "findings",
      finding: "account.industry/absent",
      showUnderpowered: true,
    } as const;
    expect(decodeView(encodeView(view))).toEqual(view);
  });

  it("falls back to the console rather than an error on a mangled link", () => {
    expect(decodeView("")).toEqual(DEFAULT_VIEW);
    expect(decodeView("?p=pinecrest")).toMatchObject({
      patientId: "pinecrest",
      view: "vitals",
    });
  });

  it("does not coerce an unknown view into a different one", () => {
    // Landing on the wrong pane is worse than landing on the default: it looks
    // like the link worked.
    expect(decodeView("?v=proofs").view).toBe(DEFAULT_VIEW.view);
  });

  it("tolerates a leading question mark either way", () => {
    expect(decodeView("?p=pinecrest&v=cohorts")).toEqual(decodeView("p=pinecrest&v=cohorts"));
  });
});
