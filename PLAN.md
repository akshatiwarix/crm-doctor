# Day 010 — CRM Doctor — Implementation Plan

Day 010 of a 100-day building challenge. The concept is fixed by the master backlog
(`~/Desktop/100-days-portfolio-execution-plan.md`): *a diagnostic tool that examines CRM-style data
and surfaces missing, inconsistent or suspicious records.* Every choice below came out of a
decision-by-decision interview across four rounds and is deliberate rather than a default. The 31
settled decisions are recorded at the bottom; treat them as decided, not as open questions to
relitigate.

**Time limit:** one day. Feature-frozen at plan sign-off.

---

## Problem

Every CRM is diseased and every company knows it. The knowing takes the form of a number: *41% of
our accounts are missing industry*. That number gets into a slide, someone buys an enrichment
vendor, the number goes down for a quarter, and then it comes back — because nobody ever found out
**where it came from**.

That is the whole problem. A defect rate is a symptom. Symptoms do not tell you what to do.

Bad CRM data is not randomly distributed, and it is not a fog that settles evenly over the org. It
is **produced**, by a small number of identifiable mechanisms:

- A form went live on a date and quietly stopped collecting a field.
- An import batch wrote the same wrong value four hundred times in one afternoon.
- An integration ran once with the wrong field mapping and overwrote a column.
- One rep fills company and never fills country, and has done for two years.
- A form default shipped as `United States` and half the EMEA pipeline now says it is American.

Each of those has a **locus** — a cohort of records where it lives — and an **onset** — a date when
it started, and sometimes a date when it stopped. A tool that reports `41%` and stops has thrown
away both, and has handed the user a number they can only respond to by buying something.

There is a second lie underneath the first one, and it is worse because it is invisible.
**Completeness metrics count placeholders as data.** A field that is 98% populated and 40%
placeholder — `Other`, `N/A`, `Unknown`, `Test Co`, `000-000-0000`, `employees = 1`, four hundred
accounts stamped `Technology` by one import — reports as *healthy*. It is worse than a field that
is 60% empty, because everything downstream believes it. The routing rules fire on it. The scoring
model weights it. The segmentation query returns it. Nothing anywhere in the stack distinguishes
*populated* from *known*.

So the interesting problems are:

- Can a defect be **localized** — attributed to a cohort of records — with a claim that survives
  scrutiny rather than a correlation that looks suggestive?
- When two cohorts both look guilty because they overlap, can the tool **tell them apart** — and
  when it genuinely cannot, will it say so instead of picking one?
- Can the **onset** of a defect be found exactly, and can a defect that has already **stopped** be
  distinguished from one that is still happening?
- What is the honest **completeness** of a field, once values that are present but not knowledge
  are excluded?
- How much of this can be done **deterministically**, and what is the irreducible residue that
  needs a model?

### What this repo is not

Five sibling days own the neighbouring problems and this one does not build any of them.

- **Day 003 `lead-cleaner`** owns *fixing*. **CRM Doctor never writes a corrected value.** No
  normalization output, no merge, no "clean it" button, no suggested replacement. Diagnosis is not
  treatment, and the moment a fix button lands this repo becomes a worse `lead-cleaner`.
- **Day 018 `crm-duplicate-graph`** owns duplicates. **No dup detection, no fuzzy matching, no
  similarity scoring, no merge candidates.** This is the hardest refusal to hold, because dedupe is
  the first thing anyone thinks of under "CRM hygiene". Refuse it entirely.
- **Day 030 `stage-validator`** owns opportunity stage versus activity. No opportunities in the
  data model at all.
- **Day 025 `crm-timeline`** owns activity records. No activities, no tasks, no emails.
- **Day 038 `revops-audit`** owns the scorecard. **No health score.** See *The number that is never
  reported*.
- **Day 011 `title-normalizer` / Day 013 `domain-detective`** own normalization of titles and
  domains. A malformed title here is *evidence of a counterfeit value*, never a normalization
  target.

---

## Intended user

A RevOps or data-ops person who has been handed a CRM they did not build and asked to "clean it
up". Their working questions:

- Industry is missing on a third of accounts. Is that everywhere, or is it one source?
- Is this still happening, or did it stop in March and nobody told me?
- Our dashboards say `industry` is 98% complete. Is it?
- Two things look guilty. Which one do I actually go fix?
- Which of these alarming numbers am I allowed to believe, given how few records they cover?

Secondary user: the hiring manager reading the repo, who should see that the interesting part is
`lib/diagnose/attribute.ts` and the permutation null in `scripts/sweep.mts`, not the UI.

---

## User journey

1. Land on **Vitals**. Every field renders two bars: **populated** and **known**. `industry: 98%
   populated · 61% known`. The gap is the first thing on screen and it is the product.
2. Open **Findings**. `LOCALIZED` findings first, each one a sentence with a locus and a date:
   *industry is absent on 91% of `source=webinar` records created after 2025-03-14 (n=140), against
   a 4% base rate elsewhere.*
3. Read the one marked `HEALED`. The phone-number defect stopped in January. It is scar tissue, not
   a bleeding wound. Nothing needs fixing at the source; the backfill is optional.
4. Read the one marked `CONFOUNDED`. Owner *Priya* and source *webinar* are both elevated, and
   conditioning each on the other does not separate them, because Priya owns most webinar records.
   The tool names both and **declines to pick**. It states, in the finding, that this data cannot
   distinguish them and what would.
5. Read the one marked `PERVASIVE`. `employees` is absent on 44% of accounts and no cohort is
   elevated. There is no incident to find — the field was never required. That is a different
   problem with a different fix, and reporting it as a localized defect would have sent someone
   hunting for an incident that never happened.
6. Scroll past the rule into **`UNDERPOWERED`**. Six records, five defective, 83% — and the Wilson
   lower bound does not clear base rate, so it is not a claim. It is listed, counted separately,
   and never added to anything.
7. Open **Cohorts**. The full enumerated space, every cohort's rate drawn against base rate with
   its interval. A line states how many cohorts were tested and that the significance threshold was
   corrected for exactly that number.
8. Click through to **Records**, filtered to the cohort, per-record defect chips visible.
9. Switch patient in the header to the small org. Almost everything is `UNDERPOWERED`. The tool has
   nothing to say and says so.

---

## MVP scope

**In:**

- Two generated patients (orgs) — accounts and contacts, with provenance metadata.
- Four defect kinds: `ABSENT`, `COUNTERFEIT` (six detector families), `CONTRADICTION` (four check
  kinds), `ORPHAN`.
- Cohort enumeration over declared, non-temporal provenance dimensions, conjunctions of depth ≤ 2.
- Wilson score interval lower bound against base rate, with a Bonferroni-adjusted z over the exact
  enumerated cohort count, plus hard min support n ≥ 20.
- Single exhaustive change-point over creation order, three onset classes.
- Conditioning and subsumption to a minimal explanatory locus; `CONFOUNDED` when it fails.
- Four finding types: `LOCALIZED`, `PERVASIVE`, `CONFOUNDED`, `UNDERPOWERED`.
- Vitals: populated versus known, per field.
- One Gemini call, on the residue only: strings that pass all six deterministic counterfeit
  families and still look wrong.
- Console: Vitals · Findings · Cohorts · Records. Permalink. CSV export of findings.
- Invariant sweep including a permutation null.

**Out (explicitly) — as binding as the In list:**

Schema-decay / field-graveyard audit · CSV upload and column mapping · live HubSpot or Salesforce
OAuth · multi-segment onset (more than one change-point) · depth-3 cohorts or general subgroup
search · **any write, fix, suggestion, or normalized output** · **duplicate detection of any kind**
· opportunities, activities, tasks · **any health score** · chart library, stats library, date
library.

---

## Stack

Inherited from Days 001–009, unchanged, so a reviewer types the same commands in every repo.

- Next.js 16 (App Router), React 19, TypeScript `strict` + `noUncheckedIndexedAccess`.
- Tailwind CSS 4 via `@tailwindcss/postcss`.
- Zod 4 as the trust boundary at every import and every model response.
- Vitest, config in `vitest.config.mts` (`.mts` deliberately — the extension is what stops Vite's
  config loader warning about ESM-in-CJS), globbing `lib/**/*.test.ts` only.
- `@google/genai`, model `gemini-3.6-flash`, `responseMimeType: "application/json"` with a native
  `responseSchema`, `ThinkingLevel.MINIMAL`, `temperature: 0`.
- npm as the committed package manager. `npm install && npm run dev` is what a reviewer types
  without reading.
- Scripts run through `vite-node -c vitest.config.mts`, not bare `node` — the engine uses
  extensionless relative imports Node's ESM resolver rejects, and the `@/` alias lives in the
  Vitest config.
- Deploy: Vercel.

**No chart library, no stats library, no date library.** Wilson, Bonferroni, the Bernoulli
log-likelihood and every bar and interval in the UI are hand-rolled. The engine having zero
dependencies beyond Zod is part of the claim, not an aesthetic preference.

---

## Data sources

None external. The corpus is generated by a committed, seeded, deterministic generator and its
output is committed as static data. Nothing is fetched at runtime. Every domain ends in `.example`;
no real company, person or email address is described anywhere in this repo.

---

## System / architecture

```
                    ┌─ server component ──► data/*.ts (Zod-validated at import)
Browser ────────────┤
                    ├─ lib/diagnose (pure) ──► same functions client- and server-side
                    │
                    └─ POST /api/triage ──► key check ──► rate limit ──► model ──► Zod ──► Verdict[]
```

`lib/diagnose/` is the engine and is **dependency-free and framework-free** — it imports `zod` and
nothing else. Not `next`, not `react`, not `@/data`, not `@google/genai`, no DOM globals, no
`Date.now()`. An eslint `no-restricted-imports` rule scoped to that directory enforces it, and the
package carries its own `README.md`. This is not stylistic: a diagnostic engine that cannot reach a
network client cannot emit a finding that is not a consequence of its arguments.

### Modules

| module | responsibility |
|---|---|
| `types.ts` | the contract — records, provenance, defects, cohorts, findings, onset |
| `schema.ts` | Zod schemas for patients and check registries; parsed at import, throws on bad data |
| `detect/absent.ts` | field emptiness |
| `detect/counterfeit.ts` | six families — sentinel, structural, reserved, schema-default, batch-stamp, field-shift |
| `detect/contradiction.ts` | four kinds — mismatch, ordering, band, over declared mapping tables |
| `detect/orphan.ts` | referential breaks between contacts and accounts |
| `detect/index.ts` | the detector registry; a check is a data descriptor, never an `if` in the engine |
| `cohorts.ts` | enumeration over declared dimensions, conjunctions of depth ≤ 2, non-temporal |
| `stats.ts` | Wilson score interval, Bonferroni-adjusted z, Bernoulli log-likelihood |
| `onset.ts` | exhaustive single change-point, three onset classes |
| `attribute.ts` | conditioning, subsumption to a minimal locus, `CONFOUNDED` |
| `vitals.ts` | populated versus known, per field |
| `diagnose.ts` | the pipeline |
| `export.ts` | CSV serialisation, permalink encode/decode |

`lib/triage/` holds the Gemini call, prompt, response schema and rate limiter. `data/` holds the
generator, the committed corpora, the declared dimensions, the check registry and the mapping
tables. `app/` is the single console.

### The pipeline

```
patient
 ├─ 1. DETECT       every record × every check   ──► Defect[]        (pure, deterministic)
 ├─ 2. ENUMERATE    declared dims, depth ≤ 2     ──► Cohort[]        (pure, count is exact)
 ├─ 3. TEST         Wilson vs base rate, n ≥ 20  ──► elevated | UNDERPOWERED
 ├─ 4. ATTRIBUTE    condition, subsume           ──► locus | CONFOUNDED | PERVASIVE
 ├─ 5. ONSET        change-point on the locus    ──► ONSET | HEALED | CHRONIC
 └─ 6. VITALS       populated vs known           ──► per-field pair
                                                     ↑
 (residue of step 1) ──► POST /api/triage ──► model verdicts, rendered in their own column,
                                              never merged into a deterministic count
```

Steps 1–6 are a pure function of the patient and the registries. The engine ships to the browser;
switching patient or toggling a detector re-derives everything with no round trip.

**Dimensions, checks, mapping tables and sentinel lists are data, not code.** If you find yourself
writing `if (field === "industry")` inside `lib/diagnose/`, the fact belongs in `data/` as a
descriptor.

---

## Data model

### Records under audit

`Account` and `Contact` only. Contacts belong to accounts, which is where the cross-object defects
come from. Every record carries provenance:

```
provenance: { ownerId, sourceId, importBatchId | null, recordType, createdAt, lastModifiedAt }
```

`users`, `sources` and `importBatches` are **provenance metadata, not records under audit**. They
are never scanned for defects.

### Cohort

A cohort is a conjunction of **at most two** constraints over declared provenance dimensions —
`owner`, `source`, `importBatch`, `recordType`. The depth cap is the same trade Day 009 made on its
rule language: expressiveness given up until the space became exactly enumerable and multiplicity
became a known number rather than a hand-wave.

**Time is not a cohort dimension.** `createdMonth` is deliberately excluded from the conjunction
space. Cohorts are non-temporal; time enters only through onset. Without this rule the same defect
gets reported twice wearing different hats.

### Defect

`{ recordId, kind, fieldOrPair, evidence }`. `kind ∈ { ABSENT, COUNTERFEIT, CONTRADICTION, ORPHAN }`.
Evidence names the detector family or check id that fired.

### Finding

| type | claim |
|---|---|
| `LOCALIZED` | elevated in cohort C, survives conditioning; carries onset and interval |
| `PERVASIVE` | no cohort beats base rate — the field was never collected, there is no incident |
| `CONFOUNDED` | ≥ 2 cohorts, conditioning does not separate them, tool declines to pick |
| `UNDERPOWERED` | elevation visible, fails n ≥ 20 or the Wilson bound; *cannot claim* |

Onset (`ONSET` / `HEALED` / `CHRONIC`) is an attribute of `LOCALIZED`, not a fifth type.

---

## Method

### Significance

A cohort's defect rate is reported as elevated only if its **Wilson score interval lower bound
exceeds the base rate**, with `z` adjusted Bonferroni-style over the **exact** number of cohorts
enumerated, and with hard min support **n ≥ 20**.

The cohort space is bounded and fully enumerated, so the multiplicity denominator is a real number
this code knows, not an estimate. The UI states it. This will suppress genuine defects in small
cohorts — that is correct, and those appear under `UNDERPOWERED` with `n too small to claim`
rather than being dropped silently.

### Attribution

Cohort B is **explained by** cohort A when the defect rate in `B \ A` falls back to base rate.
Findings reduce to a minimal explanatory set; subsumed cohorts are listed as *attributable to* the
locus rather than as findings of their own.

When two cohorts are near-collinear and neither survives conditioning on the other, the tool emits
`CONFOUNDED` naming both and stating that this data cannot distinguish them. **This refusal is the
product.** Every competing tool prints both and lets the user go interrogate the wrong person.

### Onset

Records ordered by creation time; all `N − 1` splits evaluated; the split maximizing Bernoulli
log-likelihood gain is selected and accepted only if the gain clears a declared threshold and both
sides meet min support. Exact, unsampled, no library. One change-point maximum.

- `ONSET` — step up. Active leak; fix the source.
- `HEALED` — step down. Historical; nothing is currently breaking.
- `CHRONIC` — no split clears threshold. Design gap, not an incident.

Rendered as `before 2025-03-14: 4% (n=812) · after: 91% (n=140)`.

### Counterfeit families

1. **sentinel** — `test`, `asdf`, `n/a`, `none`, `unknown`, `tbd`, `.`, `-`, `do not use`; declared
   per field.
2. **structural** — keyboard runs, single repeated character, no vowels past length k,
   all-punctuation.
3. **reserved** — `example.com`, `test@test.com`, `555-01xx`, `000-000-0000`.
4. **schema default** — requires **both** a declared-default flag in the field descriptor **and**
   an anomalous share. Share alone is never enough; `United States` legitimately dominates a US
   company's CRM.
5. **batch stamp** — one identical non-trivial value across many records inside a single import
   batch. Four hundred accounts stamped `Technology` by one import is not four hundred known
   industries.
6. **field shift** — an email in the phone field, a phone in the company field.

The model sees only what survives all six.

---

## The number that is never reported

**There is no score.** No 0–100, no letter grade, no "CRM health: 68%", no severity weighting, no
summing findings into a total. Day 001 `icp-score` owns weighted arithmetic and Day 038
`revops-audit` owns the scorecard. Findings are typed and counted per class, per cohort.

Rates *are* reported — a rate against a base rate with an interval is the unit of the thesis. The
ban is on aggregation across defect classes into a single figure.

**Two pairs of numbers that are never summed:**

- **Claimed versus underpowered.** Separate sections, separate counts. Adding them destroys the
  meaning of the significance threshold.
- **Deterministic versus model.** Separate columns. A model verdict is a second opinion, not a
  detection.

---

## The corpus and the eight named pathologies

Generated by `data/generate.ts` — fixed seed, deterministic, run once via `npm run corpus`, output
committed as static data. The app never generates at runtime. The generator source is the written
spec of every planted pathology, which is what keeps the test suite honest instead of circular.

**Patients:**

- `northwind` — ~2,400 accounts, ~5,200 contacts. The messy demo.
- `pinecrest` — ~320 accounts, ~600 contacts. Small and mostly clean; its entire job is to show the
  tool declining to claim things.

**Planted pathologies**, each with a test named after it:

1. **the form that stopped asking** — `industry` absent on `source=webinar` after a date →
   `LOCALIZED` + `ONSET`.
2. **the import that stamped** — batch `2024-11-vendor` wrote `industry=Technology` on 400 accounts
   → `COUNTERFEIT`/batch-stamp, `HEALED`.
3. **the confounded pair** — owner Priya ≈ source webinar → `CONFOUNDED`.
4. **the leak that closed** — `phone = 000-000-0000` from a form default, fixed in January →
   `HEALED`.
5. **the field nobody filled** — `employees` absent ~44%, flat across every cohort → `PERVASIVE`.
6. **the integration that overwrote** — 900 records sharing one `lastModifiedAt`, `country` reverted
   to a default → `CONTRADICTION` cluster.
7. **the alarming six** — 6 records, 5 defective, 83% → `UNDERPOWERED`, deliberately not a finding.
8. **the plausible fake** — `Nick's Sandbox Co`, `ACME (DO NOT USE)` — passes all six deterministic
   families; only the model flags it.

3, 5 and 7 are the ones a reviewer should notice, because each is the tool refusing to say
something.

---

## Console

Single page, four views, everything re-derived client-side.

- **Vitals** (landing) — per-field `populated` versus `known` bars. The gap is the punchline and it
  is the first thing on screen.
- **Findings** — `LOCALIZED` / `PERVASIVE` / `CONFOUNDED` sections; `UNDERPOWERED` collapsed below
  a rule. Onset renders inline as a before/after split bar, not a time series.
- **Cohorts** — the full enumerated space, rate against base rate with intervals drawn; states the
  tested-cohort count and that the threshold was corrected for exactly that number.
- **Records** — filtered list with per-record defect chips, reachable from any finding.

Patient switcher in the header. Permalink. CSV export of findings.

**Language discipline:** engine identifiers stay clinical-technical, UI copy stays plain, the
medical metaphor lives in the README and nowhere else. No "symptoms" tab, no "prescription" panel,
no stethoscope. The name carries it.

---

## Implementation task order

Each line is one commit, pushed to `main` immediately.

```
 1  plan: Day 010 CRM Doctor — defect etiology and the settled decisions
 2  docs: CLAUDE.md — engine boundary, the two things that never sum
 3  chore: Next 16 scaffold with the engine boundary lint rule
 4  feat(diagnose): type contract, corpus schema, trust boundary
 5  feat(diagnose): four detector families — absent, counterfeit, contradiction, orphan
 6  feat(data): the generator — two patients, eight planted pathologies
 7  feat(diagnose): cohort enumeration at depth two
 8  feat(diagnose): Wilson bounds, Bonferroni over the enumerated space
 9  feat(diagnose): change-point onset and the three onset classes
10  feat(diagnose): conditioning, subsumption, and the refusal to guess
11  feat(diagnose): vitals — populated versus known
12  test: eight named pathologies and the permutation null sweep
13  feat(diagnose): CSV, permalink, public surface, and the boundary test
14  feat(triage): the model's one job — residual counterfeit verdicts
15  feat(app): the console — vitals, findings, cohorts, records
16  docs: README, the plain-English guide, and screenshots from the live deployment
```

The engine is complete and tested through commit 13 before any UI exists. If the day runs short,
what is missing is a console over a proved engine, not a shell over nothing.

---

## Validation / test plan

Unit tests per module, one test per named pathology, and `npm run sweep` — the invariant sweep:

- **Wilson matches published table values.** The statistics are hand-rolled, so they are checked
  against a source, not against themselves.
- **Permutation null.** Shuffle cohort labels against defects and assert claimed findings drop to
  ~0 under the Bonferroni correction. This tests the *discipline*, not the code, and it is the most
  defensible thing in the repo.
- **Onset recovers the true change-point** on synthetic step data.
- **`known ≤ populated`**, every field, both patients, always.
- **`GEMINI_API_KEY` unset → byte-identical deterministic findings.**
- **Injecting a pure-noise provenance dimension creates zero findings.**
- **Engine purity** — `lib/diagnose/` imports nothing but `zod`; asserted by test as well as lint.

---

## Deployment plan

Vercel, `main` auto-deploy. `GEMINI_API_KEY` set in project env. Every view renders with the key
unset — missing key returns **501** with a message pointing at the builder, model failure returns
**502**, and the console renders both as an inert state, never as a broken page.

---

## README plan

Days 001–009 voice. Why I Built This (the two lies: rate-without-locus, populated-as-known) · What
It Does (the finding-type table, the counterfeit families) · Demo (screenshots from the live
deployment: the vitals gap, the localized finding with its onset, the `CONFOUNDED` refusal) · How
It Works (pipeline, the depth-2 trade, the permutation null) · What It Deliberately Does Not Do
(the six sibling refusals) · Run It Locally. Plus `docs/plain-english-guide.md` matching the
sibling PDFs.

---

## Definition of done

- `npm run build`, `typecheck`, `lint`, `test`, `sweep` all clean.
- Deployed to Vercel; live URL in the README.
- Every view renders with `GEMINI_API_KEY` unset.
- Eight pathology tests passing, each named after its pathology.
- Permutation null passes; `known ≤ populated` holds for every field on both patients.
- Screenshots taken from the live deployment, not localhost.
- Grep-level: no score, no fix/clean/merge button, no dedupe, no opportunity object anywhere.
- Pushed to `main` at every commit, not squashed at the end.

---

## Cut order if the day runs out

Only in this order:

1. The `pinecrest` second patient — one patient still demonstrates all four finding types.
2. The Cohorts view — findings carry their own intervals, so it is an inspector, not load-bearing.
3. The `triage` model call entirely — pathology 8 downgrades to a documented limitation, and the
   repo already promises to work without a key.

**Never cut:** `CONFOUNDED`, `UNDERPOWERED`, `PERVASIVE`, the permutation null, the
populated-versus-known split. Those five *are* the project.

---

## Post-MVP (not in this build)

Schema-decay audit (orphaned picklist values, unwritten fields, duplicate field definitions) ·
bring-your-own CSV with column mapping · live HubSpot / Salesforce connectors · multi-segment onset
· depth-3 cohort search with a proper FDR procedure · defect-to-consumer impact graph across the
other 99 days.

---

## Settled decisions

1. Thesis is **etiology**: no defect rate is reported without a locus and an onset. Not a linter,
   not a scorecard.
2. **Populated ≠ known** is the load-bearing sub-claim; every field renders both numbers.
3. Object under audit is **records**; schema facts enter only as causes, never as their own finding
   class or view.
4. **Accounts and contacts only.** No opportunities, no activities, no tasks.
5. `users`, `sources`, `importBatches` are provenance metadata, never audited.
6. Input is a **generated corpus only**. No upload, no OAuth, no runtime fetch.
7. Corpus comes from a **seeded deterministic generator**; output is committed static data.
8. **Two patients**: one messy, one small whose job is to show the tool declining.
9. Cohorts are conjunctions of **at most two** declared provenance dimensions.
10. **Time is not a cohort dimension.** Cohorts are non-temporal; time enters only via onset.
11. Significance is **Wilson lower bound > base rate**, Bonferroni-adjusted z over the exact
    enumerated cohort count, **n ≥ 20** hard floor.
12. The tested-cohort count is stated in the UI.
13. Attribution is **conditioning and subsumption** to a minimal explanatory locus.
14. When conditioning cannot separate cohorts, emit **`CONFOUNDED`** and decline to pick.
15. Onset is a **single exhaustive change-point**, Bernoulli log-likelihood, thresholded.
16. Three onset classes: `ONSET`, `HEALED`, `CHRONIC`. `HEALED` is a first-class outcome.
17. Four finding types: `LOCALIZED`, `PERVASIVE`, `CONFOUNDED`, `UNDERPOWERED`.
18. `UNDERPOWERED` is reported, counted separately, and **never summed** with claims.
19. Four defect kinds: `ABSENT`, `COUNTERFEIT`, `CONTRADICTION`, `ORPHAN`.
20. Six counterfeit families; schema-default requires a declared flag **and** anomalous share.
21. A counterfeit value **counts as absent** for completeness.
22. Contradictions are **declared as data** over four check kinds with mapping tables in `data/`.
23. A contradiction **names the pair, never blames a field.** There is no ground truth about which
    side is wrong.
24. **No fix, no write, no suggestion, no normalized output** (Day 003).
25. **No duplicate detection of any kind** (Day 018).
26. **No score** (Day 001, Day 038). Rates in, aggregate score out.
27. Model's one job is **residual counterfeit verdicts**; it never detects, never localizes, never
    attributes. Verdicts render in their own column and never merge into deterministic counts.
28. Engine `lib/diagnose/` imports **`zod` and nothing else**, enforced by lint and by test.
29. **No chart library, no stats library, no date library.**
30. The **permutation null** is a required invariant in `npm run sweep`.
31. Medical metaphor lives in the README only; engine names are clinical-technical, UI copy is
    plain.
