export default function Home() {
  return (
    <main className="mx-auto flex max-w-3xl flex-1 flex-col justify-center gap-6 px-6 py-24">
      <p className="marking">Day 010 · scaffold</p>
      <h1 className="claim text-3xl">CRM Doctor</h1>
      <p className="claim max-w-prose text-slate">
        A defect rate is a symptom. This console localises every defect to a
        cohort and an onset date, and reports what is <em>known</em> rather than
        what is populated.
      </p>
      <p className="text-sm text-faint">
        The console lands in commit 15. The engine comes first — see PLAN.md.
      </p>
    </main>
  );
}
