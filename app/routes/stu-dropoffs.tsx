// Stu Drop-offs: where people stop (the furthest step each reached) and why,
// when the product knows: mic denied, a failed call by reason, a dropped call,
// hung up in the first minute, no resume, never opened the desk, saved nothing.
import { useMemo } from "react";
import { CARD, Num, PageTitle, SourceNote, useStu } from "~/components/stu/ui";
import { cellOf, dropoffs, fmtPct, pct, stepSource } from "~/lib/stu/model";

const OUTCOME: Record<string, string> = {
  completed: "Completed",
  failed: "Failed (server)",
  never_connected: "Never connected",
  dropped: "Dropped (connection went)",
  no_resume: "Ended with no resume",
  no_answers: "Ended before the answers",
  hung_up_first_minute: "Hung up in the first minute",
  ended_early: "Ended after a minute, not completed",
  live: "Still live",
};

export default function StuDropoffs() {
  const { data, filters } = useStu();
  const d = useMemo(() => dropoffs(data, filters), [data, filters]);
  const total = d.stuck.reduce((a, s) => a + s.cell.v, 0);
  return (
    <div>
      <PageTitle title="Drop-offs" sub={`People who joined Stu from ${filters.start} to ${filters.end} (IST): the furthest step each reached, and the reasons the product records.`} />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`overflow-hidden ${CARD}`}>
          <div className="border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2 font-['Clash_Display'] font-bold">Where people stop (furthest step)</div>
          <table className="w-full text-sm">
            <tbody>
              {d.stuck.map((s) => (
                <tr key={s.key} className="border-t border-neutral-100">
                  <td className="px-4 py-1.5">
                    {s.n}. {s.label}
                    <SourceNote>{stepSource(data, s.key)}</SourceNote>
                  </td>
                  <td className="px-3 py-1.5 text-right font-bold"><Num cell={s.cell} title={`Stopped at ${s.n}. ${s.label}`} /></td>
                  <td className="px-3 py-1.5 text-right text-neutral-500">{fmtPct(pct(s.cell.v, total))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex flex-col gap-6">
          <div className={`overflow-hidden ${CARD}`}>
            <div className="border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2 font-['Clash_Display'] font-bold">Why, when we know</div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="px-4 py-1.5">Reason</th><th className="px-3 py-1.5 text-right">People</th><th className="px-3 py-1.5 text-right">Out of</th><th className="px-3 py-1.5 text-right">%</th></tr></thead>
              <tbody>
                {d.reasons.map((r) => (
                  <tr key={r.key} className="border-t border-neutral-100">
                    <td className="px-4 py-1.5">{r.label}<SourceNote>{r.source}</SourceNote></td>
                    <td className="px-3 py-1.5 text-right font-bold"><Num cell={r.cell} title={r.label} /></td>
                    <td className="px-3 py-1.5 text-right"><Num cell={r.of} title={`${r.label}: out of`} /></td>
                    <td className="px-3 py-1.5 text-right text-neutral-500">{r.cell.na ? "n/a" : fmtPct(pct(r.cell.v, r.of.v))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={`overflow-hidden ${CARD}`}>
            <div className="border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2 font-['Clash_Display'] font-bold">How the cohort's calls ended (onboarding, returning, build)</div>
            <table className="w-full text-sm">
              <tbody>
                {d.callOutcomes.map((o) => (
                  <tr key={o.key} className="border-t border-neutral-100">
                    <td className="px-4 py-1.5">{OUTCOME[o.key] ?? o.key}</td>
                    <td className="px-3 py-1.5 text-right font-bold"><Num cell={o.cell} title={`Calls: ${OUTCOME[o.key] ?? o.key}`} /></td>
                    <td className="px-3 py-1.5 text-right text-neutral-500">people: <Num cell={cellOf(o.cell.users)} title={`People with a call: ${OUTCOME[o.key] ?? o.key}`} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="px-4 pb-2"><SourceNote>career_voice_calls status, error, duration_s and timeline (each call)</SourceNote></div>
          </div>
        </div>
      </div>
    </div>
  );
}
