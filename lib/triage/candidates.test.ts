import { describe, expect, it } from "vitest";
import { northwind, registries } from "@/data/index";
import { DEFAULT_CONFIG, detect } from "@/lib/diagnose";
import { MAX_CANDIDATES, candidatesFor, triageableFields } from "./candidates";
import { rateLimit, resetRateLimit } from "./rate-limit";

const defects = detect(northwind, registries, DEFAULT_CONFIG);
const candidates = candidatesFor(northwind, defects, "account", "name");

describe("candidatesFor", () => {
  it("sends only what the deterministic families passed", () => {
    // Paying tokens to re-derive an answer the engine already has would be
    // waste; worse, it would create a way for the two to disagree.
    const flagged = new Set(
      defects
        .filter(
          (d) =>
            d.kind === "COUNTERFEIT" &&
            d.object === "account" &&
            d.target.type === "field" &&
            d.target.field === "name",
        )
        .map((d) => d.observed),
    );
    expect(flagged.size).toBeGreaterThan(0);
    for (const candidate of candidates) expect(flagged.has(candidate.value)).toBe(false);
  });

  it("includes the plausible fakes, which is the whole point", () => {
    const values = new Set(candidates.map((c) => c.value));
    expect(values.has("Nick's Sandbox Co")).toBe(true);
    expect(values.has("ACME (DO NOT USE)")).toBe(true);
  });

  it("is capped and deterministic", () => {
    expect(candidates.length).toBeLessThanOrEqual(MAX_CANDIDATES);
    expect(JSON.stringify(candidates)).toBe(
      JSON.stringify(candidatesFor(northwind, defects, "account", "name")),
    );
  });

  it("never offers a blank value", () => {
    for (const candidate of candidates) expect(candidate.value.trim()).not.toBe("");
  });

  it("offers only fields where a pattern genuinely cannot decide", () => {
    // A number, a date, a phone and an email all have shapes, and a shape is
    // what the deterministic families check.
    for (const field of triageableFields(northwind)) {
      expect(["text", "picklist"]).toContain(field.kind);
    }
  });
});

describe("rateLimit", () => {
  it("allows six in a window and then refuses with a wait", () => {
    resetRateLimit();
    const now = 1_000_000;
    for (let i = 0; i < 6; i++) expect(rateLimit("ip", now).ok).toBe(true);
    const blocked = rateLimit("ip", now);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("forgets a caller once the window has passed", () => {
    resetRateLimit();
    for (let i = 0; i < 6; i++) rateLimit("ip", 1_000_000);
    expect(rateLimit("ip", 1_000_000 + 60_001).ok).toBe(true);
  });

  it("counts callers separately", () => {
    resetRateLimit();
    for (let i = 0; i < 6; i++) rateLimit("a", 1_000_000);
    expect(rateLimit("b", 1_000_000).ok).toBe(true);
  });
});
