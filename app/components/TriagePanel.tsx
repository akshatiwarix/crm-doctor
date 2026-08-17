"use client";

import { useState } from "react";
import { Chip, Figure, Marking, Panel } from "./ui";

interface Verdict {
  value: string;
  verdict: "placeholder" | "real" | "unsure";
  reason: string;
}

/**
 * The model's column, and it is a column.
 *
 * Nothing here is added to a count above, folded into a rate, or allowed near
 * `vitals`. A verdict is a second opinion on a value six deterministic
 * families already passed, and the panel says so before it says anything else
 * — including when there is no key, which is a supported state rather than an
 * error state.
 */
export function TriagePanel({
  patientId,
  fields,
}: {
  patientId: string;
  fields: readonly { object: string; id: string; label: string; residue: number }[];
}) {
  const [field, setField] = useState(fields[0]);
  const [state, setState] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "done"; verdicts: Verdict[]; considered: number }
  >({ kind: "idle" });

  async function run() {
    if (field === undefined) return;
    setState({ kind: "loading" });
    try {
      const response = await fetch("/api/triage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patientId, object: field.object, field: field.id }),
      });
      const body = await response.json();
      if (!response.ok) {
        setState({ kind: "error", message: body.error ?? "Triage failed." });
        return;
      }
      setState({ kind: "done", verdicts: body.verdicts ?? [], considered: body.considered ?? 0 });
    } catch {
      setState({ kind: "error", message: "The triage request did not complete." });
    }
  }

  const flagged =
    state.kind === "done" ? state.verdicts.filter((v) => v.verdict !== "real") : [];

  return (
    <Panel
      title="Second opinion"
      note="model verdicts · never merged into a deterministic count"
    >
      <div className="border-b border-rule px-4 py-3">
        <p className="max-w-prose text-xs leading-relaxed text-slate">
          Six deterministic families run first and settle everything a pattern
          can settle. What survives them —{" "}
          <span className="font-semibold">Nick&apos;s Sandbox Co</span>,{" "}
          <span className="font-semibold">ACME (DO NOT USE)</span>,{" "}
          <span className="font-semibold">Company Name Here</span> — is not
          decidable by regex and is obvious to a person. That gap is the only
          thing a model is used for here.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-b border-rule px-4 py-3">
        <select
          className="rounded-xs border border-rule bg-paper px-2 py-1 text-xs"
          value={field === undefined ? "" : `${field.object}.${field.id}`}
          onChange={(event) => {
            const next = fields.find(
              (f) => `${f.object}.${f.id}` === event.target.value,
            );
            setField(next);
            setState({ kind: "idle" });
          }}
        >
          {fields.map((f) => (
            <option key={`${f.object}.${f.id}`} value={`${f.object}.${f.id}`}>
              {f.object}.{f.label} — {f.residue} distinct values in the residue
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={run}
          disabled={state.kind === "loading"}
          className="rounded-xs border border-accent bg-accent-soft px-3 py-1 text-xs text-accent disabled:opacity-50"
        >
          {state.kind === "loading" ? "Asking…" : "Ask for a second opinion"}
        </button>
      </div>

      <div className="px-4 py-3">
        {state.kind === "idle" ? (
          <p className="text-xs text-faint">
            Nothing has been asked yet. Every finding, every vital and the export
            on this page were produced without the model.
          </p>
        ) : null}

        {state.kind === "loading" ? (
          <p className="text-xs text-faint">Waiting on the model…</p>
        ) : null}

        {state.kind === "error" ? (
          <p className="max-w-prose rounded-xs border border-dashed border-rule-strong px-3 py-2 text-xs leading-relaxed text-slate">
            {state.message}
          </p>
        ) : null}

        {state.kind === "done" ? (
          <div className="flex flex-col gap-3">
            <p className="text-[11px] text-faint">
              <Figure>{state.considered}</Figure> values sent, sorted by a
              disclosed queue order — repetition in a near-unique field,
              bracketed annotations, trailing indices. Values further down the
              queue were not looked at; that is not the same as clean.
            </p>
            {flagged.length === 0 ? (
              <p className="text-xs text-slate">
                The model called every value it was shown real data.
              </p>
            ) : (
              <table className="w-full">
                <thead>
                  <tr className="border-b border-rule">
                    <th className="px-0 py-2 text-left">
                      <Marking>Value</Marking>
                    </th>
                    <th className="w-28 px-3 py-2 text-left">
                      <Marking>Verdict</Marking>
                    </th>
                    <th className="px-0 py-2 text-left">
                      <Marking>Reason</Marking>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {flagged.map((verdict) => (
                    <tr key={verdict.value} className="border-b border-rule/60 last:border-0">
                      <td className="py-2 pr-3 text-sm">{verdict.value}</td>
                      <td className="px-3 py-2">
                        <Chip tone="triage">{verdict.verdict}</Chip>
                      </td>
                      <td className="py-2 text-xs text-slate">{verdict.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
