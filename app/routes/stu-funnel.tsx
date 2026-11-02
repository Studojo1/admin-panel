// Stu Funnel: the people who signed up in the range (owner decision, 1 Nov),
// followed through every later step. Nested (each step counts only people who
// did every earlier gate step) or unnested. Visitors before sign-in are counted
// by visitor id for the same range, above the cohort.
import { useMemo, useState } from "react";
import { CARD, Num, PageTitle, SourceNote, useStu } from "~/components/stu/ui";
import { ANON_STEPS, arriveCells, cellOf, fmtDur, fmtPct, funnel, pct, stepSource } from "~/lib/stu/model";

export default function StuFunnel() {
  const { data, filters } = useStu();
  const [nested, setNested] = useState(true);
  const f = useMemo(() => funnel(data, filters, nested), [data, filters, nested]);
  const arrive = useMemo(() => arriveCells(data, filters), [data, filters]);
  const visitors = arrive.visited_home;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Funnel" sub={`Cohort: ${f.cohort.length} people who joined Stu from ${filters.start} to ${filters.end} (IST), each step counted once per person.`} />
        <div className="mb-4 flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5">
          {[{ v: true, l: "Nested" }, { v: false, l: "Unnested" }].map((x) => (
            <button key={x.l} onClick={() => setNested(x.v)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${nested === x.v ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{x.l}</button>
          ))}
        </div>
      </div>

      <div className={`mb-6 p-4 ${CARD}`}>
        <div className="mb-2 text-xs font-bold uppercase text-neutral-500">Before sign-in, same range (by visitor id, not the cohort)</div>
        <div className="flex flex-wrap gap-6">
          {ANON_STEPS.map((s) => (
            <div key={s.key}>
              <div className="text-xs text-neutral-500">{s.n}. {s.label}</div>
              <div className="font-['Clash_Display'] text-2xl font-bold"><Num cell={arrive[s.key]} title={`${s.label}, visitors ${filters.start} to ${filters.end}`} /></div>
              <SourceNote>{stepSource(data, s.key)}</SourceNote>
            </div>
          ))}
          <div>
            <div className="text-xs text-neutral-500">Visit to sign-up</div>
            <div className="font-['Clash_Display'] text-2xl font-bold">{visitors.na ? "n/a" : fmtPct(pct(f.cohort.length, visitors.v))}</div>
            <SourceNote>sign-ups in range over visitors in range</SourceNote>
          </div>
        </div>
      </div>

      <div className={`overflow-hidden ${CARD}`}>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Step</th>
              <th className="px-3 py-2 text-right">People</th>
              <th className="px-3 py-2 w-[28%]" />
              <th className="px-3 py-2 text-right">% of step before</th>
              <th className="px-3 py-2 text-right">% of sign-ups</th>
              <th className="px-3 py-2 text-right" title="For each person, from the latest earlier step they did">Median time from step before</th>
            </tr>
          </thead>
          <tbody>
            {f.rows.map((r) => (
              <tr key={r.key} className={`border-t border-neutral-100 ${r.test ? "bg-amber-50/50" : ""}`}>
                <td className="px-4 py-2">
                  <div className="font-medium text-neutral-900">
                    {r.n}. {r.label}
                    {nested && r.gate && <span className="ml-2 rounded bg-neutral-900 px-1.5 py-0.5 text-[10px] font-bold text-white" title="Nested: later steps count only people who did this">gate</span>}
                  </div>
                  <SourceNote>{r.source}</SourceNote>
                </td>
                <td className="px-3 py-2 text-right text-base font-bold"><Num cell={r.cell} title={`${r.n}. ${r.label} (${nested ? "nested" : "unnested"}), cohort ${filters.start} to ${filters.end}`} /></td>
                <td className="px-3 py-2">
                  <div className="h-3 w-full rounded bg-neutral-100">
                    <div className={`h-3 rounded ${r.test ? "bg-amber-400" : "bg-violet-500"}`} style={{ width: `${Math.min(100, r.pctSignups ?? 0)}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.cell.na ? "n/a" : fmtPct(r.pctPrev)}</td>
                <td className="px-3 py-2 text-right tabular-nums">{r.cell.na ? "n/a" : fmtPct(r.pctSignups)}</td>
                <td className="px-3 py-2 text-right tabular-nums text-neutral-700">{fmtDur(r.medianFromPrev)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Nested: a step counts only people who also did every earlier gate step (signed up, call started, call completed, onboarded, saw jobs). Branch steps and steps the journey log adds
        (phone, reached Stu, desk, job opens, apply clicks, plans) never gate, so a step with no history yet does not empty the funnel below it. Unnested: everyone in the cohort who did the step.
        Test payments have their own row. Cohort size: <Num cell={cellOf(f.cohort)} title="Cohort" />.
      </p>
    </div>
  );
}
