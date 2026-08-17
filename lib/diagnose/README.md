# `lib/diagnose`

The engine. It imports `zod` and nothing else — not `next`, not `react`, not
`@/data`, not `@google/genai`, no DOM globals, no clock.

That is enforced twice: by an eslint `no-restricted-imports` rule in
`eslint.config.mjs`, and by `purity.test.ts`, which reads this directory's
source off disk and checks every import statement with no allowlist at all. The
test is the real boundary; the lint rule is there to fail fast in an editor.

The reason is not tidiness. A diagnostic engine that cannot reach a network
client cannot emit a finding that is not a consequence of its arguments, and an
engine with no clock cannot emit a finding that depends on when it ran. Every
number this package produces is reproducible from the patient and the
registries alone.

## What it computes

```
patient
 ├─ 1. DETECT       every record × every check   ──► Defect[]     (deterministic)
 ├─ 2. ENUMERATE    declared dims, depth ≤ 2     ──► Cohort[]     (count is exact)
 ├─ 3. TEST         Wilson vs base rate, n ≥ 20  ──► elevated | UNDERPOWERED
 ├─ 4. ATTRIBUTE    condition, subsume           ──► locus | CONFOUNDED | PERVASIVE
 ├─ 5. ONSET        change-point on the locus    ──► ONSET | HEALED | CHRONIC
 └─ 6. VITALS       populated vs known           ──► per-field pair
```

## The three rules that keep it honest

**Nothing here is field-specific.** The engine never names `industry` or
`country`. Field kinds, declared defaults, sentinel lists, mapping tables and
contradiction checks all arrive as descriptors from `data/`. An `if (field ===
...)` inside this directory is a bug, not a shortcut.

**Dates are ISO strings compared lexicographically.** No date library, no
`Date`, no clock. `schema.ts` rejects dates that are well-formed but unreal
(`2025-02-31`), because lexicographic ordering is only sound on real dates.

**Claims and non-claims are different types.** `UNDERPOWERED` is not a weaker
`LOCALIZED`; it is a separate member of the `Finding` union, and no function in
this package sums the two. If a caller wants one number for "problems found",
this package will not give it to them.
