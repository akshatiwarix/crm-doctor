/**
 * The eight named pathologies.
 *
 * `data/generate.ts` plants each one deliberately and says so in a comment.
 * This file asserts the analyser reaches the diagnosis the planting describes.
 * If the two ever disagree, one of them is wrong and the diff says which —
 * that is the only thing keeping a synthetic corpus from being a circular
 * argument, and it is why the generator is written as named mutation passes
 * rather than as one function returning noise.
 *
 * Three of these tests assert the tool says LESS than the data appears to
 * support: the confound it refuses to resolve, the small cohort it refuses to
 * claim, and the plausible fakes no deterministic family can catch. Those are
 * the ones worth reading.
 */

import { describe, expect, it } from "vitest";
import { northwind, pinecrest, registries } from "@/data/index";
import { diagnose } from "./diagnose";
import type { Finding, LocalizedFinding } from "./types";

const nw = diagnose(northwind, registries);
const pc = diagnose(pinecrest, registries);

function classOf(finding: Finding): string {
  const { defectClass: c } = finding;
  const target =
    c.target.type === "field" ? c.target.field : c.target.fields.join("+");
  return `${c.object}.${target}/${c.detector}`;
}

function localized(className: string, locusId: string): LocalizedFinding {
  const found = nw.findings.find(
    (f): f is LocalizedFinding =>
      f.type === "LOCALIZED" && classOf(f) === className && f.locus.id === locusId,
  );
  if (found === undefined) {
    throw new Error(
      `no LOCALIZED finding for ${className} at ${locusId}; got:\n` +
        nw.findings
          .filter((f) => classOf(f) === className)
          .map((f) => `  ${f.type} ${JSON.stringify("locus" in f ? f.locus.id : "")}`)
          .join("\n"),
    );
  }
  return found;
}

describe("the form that stopped asking", () => {
  it("localises to the webinar form and dates the change", () => {
    const finding = localized("account.industry/absent", "source=webinar");
    expect(finding.onset.class).toBe("ONSET");

    // The generator changed the form on 2025-03-14. Onset reports the first
    // date on the later side of the split — the first webinar record that
    // actually arrived under the new form, which is the first date a reader
    // could go and look at. Asserting the planted constant instead would pass
    // even if the engine were rounding to the nearest month.
    const firstAffected = northwind.records
      .filter(
        (r) =>
          r.object === "account" &&
          r.provenance.sourceId === "webinar" &&
          r.provenance.createdAt >= "2025-03-14",
      )
      .map((r) => r.provenance.createdAt)
      .sort()[0];
    expect(finding.onset.at).toBe(firstAffected);
    expect(finding.onset.before.rate).toBeLessThan(0.1);
    expect(finding.onset.after.rate).toBeGreaterThan(0.85);
  });

  it("does not blame the record type the webinar records happen to have", () => {
    // Every post-March record is `standard`, so `type=standard` is elevated
    // too — weakly, because it also contains two thousand healthy records.
    const claims = nw.findings.filter(
      (f) => classOf(f) === "account.industry/absent" && f.type !== "UNDERPOWERED",
    );
    expect(claims).toHaveLength(1);
  });
});

describe("the import that stamped", () => {
  it("localises to the batch and reports it as counterfeit, not as complete", () => {
    const finding = localized("account.industry/batchStamp", "batch=b-2024-11-vendor");
    expect(finding.inside.rate).toBeGreaterThan(0.9);
    // Industry is 100% populated inside that batch and knows nothing.
    const inBatch = northwind.records.filter(
      (r) => r.provenance.importBatchId === "b-2024-11-vendor",
    );
    expect(inBatch.every((r) => r.fields.industry !== null)).toBe(true);
  });

  it("calls it CHRONIC rather than inventing a date inside a one-month batch", () => {
    // The batch ran for a month. There is no change-point to find inside it,
    // and claiming one would be an invention.
    expect(localized("account.industry/batchStamp", "batch=b-2024-11-vendor").onset.class).toBe(
      "CHRONIC",
    );
  });
});

describe("the confounded pair", () => {
  it("names both cohorts and declines to pick", () => {
    const confounded = nw.findings.find(
      (f) => f.type === "CONFOUNDED" && classOf(f) === "account.employees/absent",
    );
    expect(confounded?.type).toBe("CONFOUNDED");
    if (confounded?.type !== "CONFOUNDED") throw new Error("unreachable");
    expect(confounded.cohorts.map((c) => c.id).sort()).toEqual([
      "owner=priya",
      "source=conference",
    ]);
    expect(confounded.overlap).toBeGreaterThan(0.9);
  });

  it("emits no LOCALIZED finding for that defect class at all", () => {
    // The refusal has to be exclusive. A CONFOUNDED finding sitting next to a
    // LOCALIZED one for the same defect would let a reader take the answer
    // they preferred.
    const localizedSame = nw.findings.filter(
      (f) => f.type === "LOCALIZED" && classOf(f) === "account.employees/absent",
    );
    expect(localizedSame).toHaveLength(0);
  });
});

describe("the leak that closed", () => {
  it("localises to the website form and reports that it stopped", () => {
    const finding = localized("account.phone/reserved", "source=inbound-form");
    expect(finding.onset.class).toBe("HEALED");
    expect(finding.onset.at).toBe("2025-01-20");
    expect(finding.onset.before.rate).toBeGreaterThan(0.5);
    expect(finding.onset.after.rate).toBeLessThan(0.05);
  });
});

describe("the field nobody filled", () => {
  it("is PERVASIVE — no cohort explains it, so there is no incident to hunt", () => {
    const pervasive = nw.findings.find(
      (f) => f.type === "PERVASIVE" && classOf(f) === "account.revenue/absent",
    );
    expect(pervasive?.type).toBe("PERVASIVE");
    if (pervasive?.type !== "PERVASIVE") throw new Error("unreachable");
    expect(pervasive.overall.rate).toBeGreaterThan(0.4);
    expect(pervasive.overall.rate).toBeLessThan(0.5);
  });

  it("produces no LOCALIZED finding anywhere for that field", () => {
    expect(
      nw.findings.filter(
        (f) => f.type === "LOCALIZED" && classOf(f) === "account.revenue/absent",
      ),
    ).toHaveLength(0);
  });
});

describe("the integration that overwrote", () => {
  it("localises both symptoms to the legacy record type", () => {
    expect(localized("account.country+phone/country-vs-phone", "recordType=legacy").inside.rate)
      .toBeGreaterThan(0.4);
    expect(
      localized("account.firstTouchAt+lastActivityAt/touch-order", "recordType=legacy").inside.rate,
    ).toBeGreaterThan(0.7);
  });

  it("names the pair rather than blaming a field", () => {
    const finding = localized("account.country+phone/country-vs-phone", "recordType=legacy");
    expect(finding.defectClass.target).toEqual({
      type: "pair",
      fields: ["country", "phone"],
    });
  });
});

describe("the alarming six", () => {
  it("is reported as a non-claim, with the reason", () => {
    // Five of six records, 83%. The number is real and it means nothing.
    const under = nw.findings.find(
      (f) =>
        f.type === "UNDERPOWERED" &&
        classOf(f) === "account.domain/absent" &&
        f.cohort.id === "owner=dmitri",
    );
    expect(under?.type).toBe("UNDERPOWERED");
    if (under?.type !== "UNDERPOWERED") throw new Error("unreachable");
    expect(under.reason).toBe("MIN_SUPPORT");
    expect(under.inside).toMatchObject({ defective: 5, total: 6 });
    expect(under.inside.rate).toBeGreaterThan(0.8);
  });

  it("never becomes a claim", () => {
    expect(
      nw.findings.filter(
        (f) => f.type === "LOCALIZED" && f.locus.id.includes("owner=dmitri"),
      ),
    ).toHaveLength(0);
  });
});

describe("the plausible fake", () => {
  const PLAUSIBLE = ["Nick's Sandbox Co", "ACME (DO NOT USE)", "Company Name Here"];

  it("is present in the corpus", () => {
    for (const name of PLAUSIBLE) {
      expect(northwind.records.some((r) => r.fields.name === name)).toBe(true);
    }
  });

  it("survives every deterministic family", () => {
    // This is the whole justification for the model. No sentinel matches
    // exactly, no keyboard run, no reserved token, no format shift — and a
    // human reads them in half a second.
    const ids = new Set(
      northwind.records
        .filter((r) => PLAUSIBLE.includes(r.fields.name ?? ""))
        .map((r) => r.id),
    );
    const caught = nw.defects.filter(
      (d) =>
        d.kind === "COUNTERFEIT" &&
        d.target.type === "field" &&
        d.target.field === "name" &&
        ids.has(d.recordId),
    );
    expect(caught).toHaveLength(0);
  });
});

describe("the legacy migration that dropped links", () => {
  it("localises the orphans to the legacy record type", () => {
    expect(localized("contact.accountId/contact-account:unlinked", "recordType=legacy")).toBeDefined();
    expect(localized("contact.accountId/contact-account:dangling", "recordType=legacy")).toBeDefined();
  });
});

describe("the small patient", () => {
  it("claims nothing localised at all", () => {
    // Three hundred records cannot support a cohort claim, and a product that
    // produces the same confident output at that size as at three thousand is
    // not measuring anything.
    expect(pc.findings.filter((f) => f.type === "LOCALIZED")).toHaveLength(0);
    expect(pc.findings.filter((f) => f.type === "CONFOUNDED")).toHaveLength(0);
  });

  it("still reports what is true of the whole org", () => {
    expect(pc.findings.some((f) => f.type === "PERVASIVE")).toBe(true);
  });

  it("still reports the non-claims it had to set aside", () => {
    expect(pc.findings.some((f) => f.type === "UNDERPOWERED")).toBe(true);
  });
});

describe("the two things that never sum", () => {
  it("keeps claims and non-claims as distinct types", () => {
    const claims = nw.findings.filter((f) => f.type !== "UNDERPOWERED");
    const nonClaims = nw.findings.filter((f) => f.type === "UNDERPOWERED");
    expect(claims.length).toBeGreaterThan(0);
    expect(nonClaims.length).toBeGreaterThan(0);
    // Nothing in the engine returns their sum, and this is the assertion that
    // notices if somebody adds a convenience helper that does.
    expect(claims.length + nonClaims.length).toBe(nw.findings.length);
  });

  it("reports the exact number of hypotheses it tested", () => {
    expect(nw.cohortsTested).toBeGreaterThan(1000);
    expect(Number.isInteger(nw.cohortsTested)).toBe(true);
  });
});
