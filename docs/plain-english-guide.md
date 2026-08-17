# CRM Doctor — how it works, in plain English

No code in this document. It explains what the tool does, why it sometimes refuses to answer, and why it will not give you a score.

---

## The problem

Someone asks how healthy the CRM is. A report comes back:

> Industry: 59% complete
> Phone: 96% complete
> Job title: 100% complete
> Annual revenue: 56% complete

Everybody nods. Someone buys an enrichment vendor. Three months later the same report comes back with the same numbers, and nobody can say why.

Two things are wrong with that report, and the second one is worse.

### 1. A percentage is a symptom, not a diagnosis

*41% of accounts are missing industry* tells you nothing you can act on. You cannot fix a percentage. You can only buy something and hope.

But bad CRM data is not weather. It does not settle evenly across the org. It is **made**, by a small number of specific events:

- A form went live in March and quietly stopped asking for industry.
- A vendor list was imported one Tuesday and wrote *Technology* on every row it touched.
- A migration ran once with the country mapping wrong.
- One rep has never filled in country, for two years.

Every one of those has a **where** and a **when**. The percentage throws both away.

Compare:

> *41% of accounts are missing industry.*

with:

> *Industry is empty on 41% of records from the webinar form, against 4% everywhere else — and it starts on 15 March. Before that date it was 2%. After it, 90%.*

The first sentence starts a vendor evaluation. The second one starts a conversation with whoever edited the form, and it takes ten minutes.

### 2. "Complete" counts the placeholders

This is the one that matters.

Job title in the shipped example is **100% complete**. Every single contact has something in the box. It is also, on inspection, 59% the word `Unknown` — the value the picklist ships with, which nobody ever changed.

So job title is 100% populated and **41% known**.

Every report in the company shows the first number. Every dashboard, every QBR slide, every data-quality scorecard. Meanwhile the routing rules fire on that field, the scoring model weights it, and the segmentation query returns it — all of them believing there is knowledge in a box that contains a default.

A field that is 60% empty is *better* than a field that is 100% full of placeholders, because at least everybody can see the hole.

CRM Doctor draws both numbers for every field, side by side, and the gap between them is the whole point.

---

## What counts as a defect

Four kinds.

**Empty.** The box has nothing in it. Every audit tool checks this. It is ten lines of code and it is the least interesting thing here.

**Counterfeit.** The box has something in it that is not knowledge. Six kinds:

| kind | example |
|---|---|
| the picklist's own default | `Unknown`, `Other`, `--None--` — but only when most of the field is that value |
| stamped by an import | four hundred accounts all saying `Technology`, all from one batch, all on one afternoon |
| a placeholder somebody typed | `n/a`, `test`, `unknown`, `do not use`, `tbd`, `-` |
| reserved by standard | `example.com`, `000-000-0000`, `555-0100` — these pass every validator and mean nothing |
| nonsense with structure | `asdfgh`, `aaaa`, `xzkqrtv`, `---` |
| in the wrong box | an email address sitting in the phone field |

**Contradiction.** Two boxes disagree. The country says United States and the phone number starts +44. Last activity is dated before first touch. The contact's country does not match its account's.

The tool names the **pair** and never blames one side, because there is no way to know which of the two is wrong — and that is also why it never offers to correct one.

**Orphan.** A contact points at an account that does not exist, or at no account at all.

---

## The four answers

Once it has found the defects, the tool tries to explain where they come from. It can give four answers, and two of them are it admitting the limits of what the data supports.

### Localised — "this one, here, starting then"

> *Industry is empty on 41% of records from the webinar form, against 4% everywhere else. It starts on 15 March.*

This is the answer you want. It has a group of records, a comparison, and a date.

It also comes with a label saying whether the problem is **still happening**:

- **Still happening** — the rate stepped up on a date and stayed up. Something is broken right now. Go and look at it.
- **Stopped** — the rate stepped *down* on a date. This is a scar, not a wound. Somebody already fixed the cause; what remains is old records, and cleaning them up is optional.
- **Always been true** — no date stands out. This was never right. It is a design problem, not an incident.

That middle one is why the tool exists in its current shape. Every hygiene product on the market screams equally loudly about a problem that stopped happening eight months ago, which is exactly how people learn to ignore hygiene products.

### Pervasive — "nowhere in particular"

> *Annual revenue is empty on 44% of accounts, and no group of records explains it.*

Sometimes there is no culprit. The field was simply never required, by anyone, ever. There is no form to fix and no rep to talk to — the fix is a decision about whether the field should exist.

Reporting this as though it had a cause would send somebody hunting for an incident that never happened. So it gets its own answer.

### Confounded — "two suspects, and this data cannot tell them apart"

This is the most important thing the tool does.

> *Employees is empty on 68% of Priya's records.*
> *Employees is empty on 68% of conference-scan records.*

Both true. Both alarming. And they are the same problem, because Priya works almost every conference lead — the two groups are 95% the same records.

If you print both, somebody goes and has an awkward conversation with Priya about a problem caused by a conference scanner app.

If you pick one, you are guessing.

So the tool prints both, says they are 95% the same records, and says plainly: **this data cannot say which of them is the cause.** Fewer than twenty records sit outside the overlap, so there is nothing left to compare. The only way to find out is to go and look at how the two came to coincide.

Every competing product prints both without the sentence.

### Not claimed — "the number is real and it means nothing"

> *Five of six of Dmitri's partner records have no website. That is 83%.*

Six records. Eighty-three percent. If you saw that on a dashboard you would act on it.

You should not. Six records is not enough to distinguish "Dmitri has a problem" from "Dmitri happened to get six odd records". Flip a coin six times and you will get five heads about one time in ten.

These are listed — the tool does not hide them — in their own section, below a dashed line, with the reason. And they are **never added to the count of real findings**, because the moment you add them the threshold means nothing, and the threshold is the only reason any number on the page can be believed.

---

## Why you should believe the numbers

Here is the problem with every data-quality dashboard that has a threshold slider.

The tool checks 152 groups of records against 22 kinds of defect. That is 3,344 separate questions. If each one is allowed a 5% chance of being wrong, then on data with **no problems in it at all** you would expect roughly 167 confident-looking findings.

That is not a hypothetical. The test suite does exactly this: it shuffles the labels so that no group can possibly have anything to do with any defect, then runs the analysis unchanged.

- With the correction applied: **1 finding across ten shuffles.**
- With the correction removed and nothing else changed: **545.** About fifty-five per run.

Both numbers come from the same data, which has no signal in it whatsoever.

So the threshold is tightened in proportion to how many questions were asked — and the console prints the number of questions on screen, because "these groups look bad" and "we asked 3,344 questions and these are the ones that survived" are different statements and only the second one is worth anything.

Four things have to be true before anything is called a finding:

1. At least 20 records in the group. Below that, nothing is claimed, ever.
2. The group's rate must be at least twice the background rate. Being *statistically* different is not the same as being *worth doing something about*: 4% against 2.5% across three thousand records passes any test and changes nobody's Tuesday.
3. The group's range of plausible rates must not overlap the background's. Both numbers are estimates, and treating the background as exactly known is how a clean org produces confident nonsense.
4. No overlapping group explains it away.

---

## Where the AI is, and where it is not

None of the above uses a model. All of it is arithmetic on the records, and it produces the same answer every time it runs — the test suite checks that the output is byte-for-byte identical with and without an API key configured.

The model gets exactly one job.

Six mechanical checks catch everything a pattern can catch. What they cannot catch is this:

> `Nick's Sandbox Co`
> `ACME (DO NOT USE)`
> `Copy of Harbor Systems`
> `Company Name Here`
> `Demo Account (internal)`

No placeholder word matches exactly. No keyboard mashing. Nothing reserved. Nothing in the wrong box. A person reads all five in about a second and knows every one is junk, and no regular expression will ever get there.

So the model is shown those — only those, only what the six checks already passed — and asked one question: would somebody maintaining this CRM call this real data or a placeholder? It is told to answer *unsure* freely, because a wrong "placeholder" costs a real record and an "unsure" costs nothing.

Its answers appear in their own column, marked as the model's, and are never added to any of the counts above. It never decides where a defect comes from, never dates anything, and never resolves a confusion between two groups.

The live demo runs with no key at all. Everything except that one panel works.

---

## What it will not do

**It will not fix anything.** No corrected values, no merge, no "clean it" button, no suggested replacements. It tells you what is wrong and where it came from, and stops. Diagnosis is not treatment.

**It will not find duplicates.** That is a different tool with a different shape.

**It will not give you a score.** No 0–100, no letter grade, no "CRM health: 68%". Every score does the same thing: it averages a problem you can fix in an afternoon together with a problem that is a two-quarter migration, and produces a number that goes on a slide and changes nothing.

There are rates on the screen, and each one is attached to a specific defect in a specific group of records, and none of them are ever added together.
