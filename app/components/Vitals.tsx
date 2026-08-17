import type { FieldVitals } from "@/lib/diagnose";
import { Figure, Marking, Panel, VitalsBar, pct } from "./ui";

/**
 * The landing view, and the argument in one screen.
 *
 * Every completeness dashboard ever built draws the left number. The gap
 * between the two is what this repo is about, so it is the first thing on
 * screen and it is sorted to the top.
 */
export function Vitals({ vitals }: { vitals: readonly FieldVitals[] }) {
  const objects = ["account", "contact"] as const;
  const worst = [...vitals].sort(
    (a, b) =>
      (b.populated - b.known) / Math.max(1, b.total) -
      (a.populated - a.known) / Math.max(1, a.total),
  );
  const headline = worst.find((v) => v.populated > v.known);

  return (
    <div className="flex flex-col gap-6">
      {headline === undefined ? null : (
        <p className="claim max-w-prose text-lg">
          <strong className="font-semibold">{headline.label}</strong> is{" "}
          <Figure>{pct(headline.populated / headline.total)}</Figure> populated and{" "}
          <Figure>{pct(headline.known / headline.total)}</Figure> known. Every
          completeness report in the company shows the first number.
        </p>
      )}

      {objects.map((object) => {
        const rows = vitals.filter((v) => v.object === object && v.total > 0);
        if (rows.length === 0) return null;
        return (
          <Panel
            key={object}
            title={`${object}s`}
            note={`${rows[0]?.total.toLocaleString()} records`}
          >
            <table className="w-full">
              <thead>
                <tr className="border-b border-rule">
                  <th className="w-48 px-4 py-2 text-left">
                    <Marking>Field</Marking>
                  </th>
                  <th className="px-4 py-2 text-left">
                    <Marking>Known · populated · absent</Marking>
                  </th>
                  <th className="w-24 px-4 py-2 text-right">
                    <Marking>Populated</Marking>
                  </th>
                  <th className="w-24 px-4 py-2 text-right">
                    <Marking>Known</Marking>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const gap = row.populated - row.known;
                  return (
                    <tr key={row.field} className="border-b border-rule/60 last:border-0">
                      <td className="px-4 py-3 text-sm">{row.label}</td>
                      <td className="px-4 py-3">
                        <VitalsBar
                          total={row.total}
                          populated={row.populated}
                          known={row.known}
                        />
                        {gap > 0 ? (
                          <p className="mt-1.5 text-[11px] text-counterfeit">
                            <Figure>{gap.toLocaleString()}</Figure> values are present and
                            are not knowledge
                          </p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-right text-sm figure text-slate">
                        {pct(row.populated / row.total)}
                      </td>
                      <td
                        className={`px-4 py-3 text-right text-sm figure ${
                          gap > 0 ? "font-semibold text-counterfeit" : "text-slate"
                        }`}
                      >
                        {pct(row.known / row.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Panel>
        );
      })}

      <p className="max-w-prose text-xs leading-relaxed text-faint">
        A value counts as <em>known</em> only if it survived all six counterfeit
        families. The hatched part of each bar is populated and counterfeit;
        the empty part is absent. Nothing here is summed into a score.
      </p>
    </div>
  );
}
