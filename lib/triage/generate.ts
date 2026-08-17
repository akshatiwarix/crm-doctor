/**
 * The model's one job: a second opinion on values the deterministic families
 * could not settle.
 *
 * `Nick's Sandbox Co`. `ACME (DO NOT USE)`. `Copy of Harbor Systems`. `Company
 * Name Here`. No sentinel matches exactly, no keyboard run, no reserved token,
 * no format shift — and a human reads them in half a second. That gap is real,
 * it is not closable by pattern, and it is the only place in this repo where a
 * model is the right tool.
 *
 * What it does NOT do, and what the console must never let it appear to do:
 *
 *   - it never detects — the six families ran first and it only sees what they
 *     passed
 *   - it never localises, never dates anything, never resolves a confound
 *   - its verdicts are rendered in their own column and are never added to a
 *     deterministic count, never fed into a rate, and never reach `vitals`
 *
 * The whole console works with `GEMINI_API_KEY` unset. The sweep asserts the
 * diagnosis is byte-identical either way.
 */

import { GoogleGenAI, Type } from "@google/genai";
import { z } from "zod";
import type { Candidate } from "./candidates";

const MODEL = "gemini-3.6-flash";

export class MissingKeyError extends Error {}
export class ModelError extends Error {}

const responseSchema = {
  type: Type.OBJECT,
  properties: {
    verdicts: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          value: { type: Type.STRING },
          verdict: {
            type: Type.STRING,
            enum: ["placeholder", "real", "unsure"],
          },
          reason: { type: Type.STRING },
        },
        required: ["value", "verdict", "reason"],
      },
    },
  },
  required: ["verdicts"],
};

/** A response schema is a request. A validator is a guarantee. */
const verdictsSchema = z.object({
  verdicts: z.array(
    z.object({
      value: z.string(),
      verdict: z.enum(["placeholder", "real", "unsure"]),
      reason: z.string().max(240),
    }),
  ),
});

export type Verdict = z.infer<typeof verdictsSchema>["verdicts"][number];

function prompt(fieldLabel: string, objectName: string, candidates: readonly Candidate[]): string {
  return `You are reviewing values from the "${fieldLabel}" field of ${objectName} records in a CRM.

Every value below already passed six deterministic checks: exact sentinel match
(n/a, test, unknown, …), keyboard runs and repeated characters, reserved
strings (example.com, 000-000-0000, 555-01…), the field's declared default
value, values stamped identically across an import batch, and values whose
shape belongs to a different field. So none of them is obviously junk by
pattern. Your job is the residue only.

For each value, decide whether a person maintaining this CRM would call it real
data or a placeholder that a pattern could not catch.

placeholder — internal or throwaway text sitting where real data belongs:
  sandbox and demo accounts, "do not use" and "merge me" annotations, "copy of"
  and "duplicate of" prefixes, template text left in place ("Company Name
  Here", "New Account 4"), a person's scratch record.
real — a plausible value for this field, even if unusual, foreign-language,
  abbreviated, oddly capitalised, or a very small or obscure organisation.
unsure — you genuinely cannot tell. Use it. A wrong "placeholder" costs a real
  record; "unsure" costs nothing, because these verdicts are advisory and are
  displayed in their own column beside the deterministic findings, never merged
  into them.

reason: at most fifteen words, and only about this value. Never speculate about
how the CRM got into this state, never suggest a fix, never propose a corrected
value — this tool diagnoses and does not treat.

Return a verdict for every value, using the value exactly as given.

Values (with how many records carry each):
${candidates.map((c) => `- ${JSON.stringify(c.value)} (${c.count} record${c.count === 1 ? "" : "s"})`).join("\n")}`;
}

export interface TriageResult {
  readonly verdicts: readonly Verdict[];
  readonly considered: number;
}

export async function triage(
  fieldLabel: string,
  objectName: string,
  candidates: readonly Candidate[],
): Promise<TriageResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (apiKey === undefined || apiKey.trim() === "") {
    throw new MissingKeyError("GEMINI_API_KEY is not set");
  }
  if (candidates.length === 0) return { verdicts: [], considered: 0 };

  const client = new GoogleGenAI({ apiKey });

  let text: string | undefined;
  try {
    const response = await client.models.generateContent({
      model: MODEL,
      contents: prompt(fieldLabel, objectName, candidates),
      config: {
        responseMimeType: "application/json",
        responseSchema,
        // Constrained classification against a fixed schema, not reasoning.
        temperature: 0,
      },
    });
    text = response.text;
  } catch (error) {
    throw new ModelError(error instanceof Error ? error.message : "model call failed");
  }

  if (text === undefined) throw new ModelError("the model returned no text");

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ModelError("the model returned text that is not JSON");
  }

  const result = verdictsSchema.safeParse(parsed);
  if (!result.success) throw new ModelError(result.error.issues[0]?.message ?? "bad shape");

  // Drop anything the model invented. A verdict on a value that is not in the
  // corpus has nothing to attach to, and silently keeping it would put a row
  // on screen that no record supports.
  const offered = new Set(candidates.map((c) => c.value));
  return {
    verdicts: result.data.verdicts.filter((v) => offered.has(v.value)),
    considered: candidates.length,
  };
}
