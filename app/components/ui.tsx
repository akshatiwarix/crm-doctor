/**
 * Console primitives.
 *
 * Two of these carry an argument rather than a style. `VitalsBar` draws
 * populated and known as two marks on one track with the difference left
 * hatched, because that difference is the product and colouring it in would
 * make it look like a third category of data rather than an absence. `Spread`
 * draws an interval as an interval — a claim rendered as a single number
 * invites a reader to compare it with another single number, which is the
 * habit the whole engine exists to interrupt.
 */

import type { ReactNode } from "react";

export function pct(value: number): string {
  if (value === 0) return "0%";
  if (value < 0.01) return `${(value * 100).toFixed(1)}%`;
  return `${Math.round(value * 100)}%`;
}

export function Marking({ children }: { children: ReactNode }) {
  return <p className="marking">{children}</p>;
}

export function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rounded-sm border border-rule bg-card">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-rule px-4 py-3">
        <h2 className="marking">{title}</h2>
        {note === undefined ? null : (
          <p className="text-[11px] text-faint">{note}</p>
        )}
      </header>
      {children}
    </section>
  );
}

/**
 * One field's completeness, drawn twice.
 *
 * The solid bar is what is known. The hatched extension is what is populated
 * but counterfeit — present, structured like data, not data. The empty
 * remainder is absent. A dashboard draws only the first two together and calls
 * the total "complete".
 */
export function VitalsBar({
  total,
  populated,
  known,
}: {
  total: number;
  populated: number;
  known: number;
}) {
  if (total === 0) return <div className="h-3 rounded-xs bg-rule/40" />;
  const knownPct = (known / total) * 100;
  const fakePct = ((populated - known) / total) * 100;
  return (
    <div className="flex h-3 w-full overflow-hidden rounded-xs bg-unclaimed-soft">
      <div className="bg-claimed" style={{ width: `${knownPct}%` }} />
      <div
        className="hatch-counterfeit border-y border-r border-confounded/40"
        style={{ width: `${fakePct}%` }}
      />
    </div>
  );
}

/** A rate with its interval, drawn against the background rate. */
export function Spread({
  rate,
  lower,
  upper,
  background,
}: {
  rate: number;
  lower: number;
  upper: number;
  background?: number;
}) {
  const scale = (value: number) => `${Math.min(100, Math.max(0, value * 100))}%`;
  return (
    <div className="relative h-4 w-full rounded-xs bg-unclaimed-soft/70">
      <div
        className="absolute inset-y-1 rounded-xs bg-claimed/25"
        style={{ left: scale(lower), width: `${Math.max(0.5, (upper - lower) * 100)}%` }}
      />
      <div
        className="absolute inset-y-0 w-[2px] bg-claimed"
        style={{ left: scale(rate) }}
      />
      {background === undefined ? null : (
        <div
          className="absolute inset-y-0 w-[2px] bg-active/70"
          style={{ left: scale(background) }}
          title={`background ${pct(background)}`}
        />
      )}
    </div>
  );
}

/**
 * Before and after a change-point, as two bars of proportional width.
 *
 * Width is record count and height-fill is rate, so a step that looks dramatic
 * on two records cannot look the same as a step on eight hundred.
 */
export function OnsetSplit({
  before,
  after,
  tone,
}: {
  before: { rate: number; total: number };
  after: { rate: number; total: number };
  tone: "active" | "healed";
}) {
  const span = before.total + after.total || 1;
  const colour = tone === "active" ? "bg-active" : "bg-healed";
  return (
    <div className="flex h-8 w-full items-end gap-px">
      <div className="flex h-full items-end" style={{ width: `${(before.total / span) * 100}%` }}>
        <div
          className={`w-full ${tone === "active" ? "bg-chronic/50" : colour}`}
          style={{ height: `${Math.max(2, before.rate * 100)}%` }}
        />
      </div>
      <div className="flex h-full items-end" style={{ width: `${(after.total / span) * 100}%` }}>
        <div
          className={`w-full ${tone === "active" ? colour : "bg-chronic/50"}`}
          style={{ height: `${Math.max(2, after.rate * 100)}%` }}
        />
      </div>
    </div>
  );
}

export function Chip({
  tone = "neutral",
  children,
}: {
  tone?: "neutral" | "absent" | "counterfeit" | "contradiction" | "orphan" | "triage";
  children: ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: "border-rule-strong text-slate",
    absent: "border-absent/50 text-absent",
    counterfeit: "border-counterfeit/50 text-counterfeit hatch-counterfeit",
    contradiction: "border-contradiction/50 text-contradiction",
    orphan: "border-orphan/50 text-orphan",
    triage: "border-triage/50 text-triage",
  };
  return (
    <span
      className={`inline-flex items-center rounded-xs border px-1.5 py-0.5 text-[10px] tracking-wide uppercase ${tones[tone] ?? tones.neutral}`}
    >
      {children}
    </span>
  );
}

export function Figure({ children }: { children: ReactNode }) {
  return <span className="figure">{children}</span>;
}
