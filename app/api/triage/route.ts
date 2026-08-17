import { NextResponse } from "next/server";
import { z } from "zod";
import { patientById, registries } from "@/data";
import { DEFAULT_CONFIG, detect } from "@/lib/diagnose";
import { candidatesFor } from "@/lib/triage/candidates";
import { MissingKeyError, ModelError, triage } from "@/lib/triage/generate";
import { rateLimit } from "@/lib/triage/rate-limit";

const bodySchema = z.object({
  patientId: z.string().min(1).max(64),
  object: z.enum(["account", "contact"]),
  field: z.string().min(1).max(64),
});

export async function POST(request: Request) {
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Pick a field to triage." }, { status: 400 });
  }

  const key = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(key, Date.now());
  if (!limit.ok) {
    return NextResponse.json(
      {
        error: `Triage is limited to six requests a minute. Try again in ${limit.retryAfterSeconds}s — every finding, every vital and the export work without it.`,
      },
      { status: 429, headers: { "retry-after": String(limit.retryAfterSeconds) } },
    );
  }

  const patient = patientById(parsed.data.patientId);
  const descriptor = patient.fields.find(
    (f) => f.id === parsed.data.field && f.object === parsed.data.object,
  );
  if (descriptor === undefined) {
    return NextResponse.json({ error: "No such field on that object." }, { status: 400 });
  }
  if (descriptor.kind !== "text" && descriptor.kind !== "picklist") {
    // Numbers, dates, phones and emails have shapes, and shapes are what the
    // deterministic families already check.
    return NextResponse.json(
      { error: "Only text and picklist fields have a residue worth a second opinion." },
      { status: 400 },
    );
  }

  // Detection runs first, here, so the model demonstrably only ever sees what
  // the six deterministic families passed.
  const defects = detect(patient, registries, DEFAULT_CONFIG);
  const candidates = candidatesFor(patient, defects, parsed.data.object, parsed.data.field);

  try {
    return NextResponse.json(await triage(descriptor.label, parsed.data.object, candidates));
  } catch (error) {
    if (error instanceof MissingKeyError) {
      return NextResponse.json(
        {
          error:
            "No GEMINI_API_KEY is configured, so the residue cannot be triaged. Everything else on this page is deterministic and unaffected — the six counterfeit families, every finding, the vitals and the export all ran without it.",
        },
        { status: 501 },
      );
    }
    if (error instanceof ModelError) {
      return NextResponse.json(
        { error: `The model did not return verdicts the console will accept. ${error.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: "Triage failed." }, { status: 500 });
  }
}
