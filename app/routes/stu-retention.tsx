// Stu Retention: who comes back to the desk on day 1, day 7 and day 30 after the
// IST day they joined, by week of joining. Desk opens come from the journey log.
import { useMemo, useState } from "react";
import { CARD, Num, PageTitle, SourceNote, useStu } from "~/components/stu/ui";
import { RETENTION_DAYS, fmtPct, retention } from "~/lib/stu/model";

export default function StuRetention() {
  const { data, filters } = useStu();
  const [orLater, setOrLater] = useState(false);
  const rows = useMemo(() => retention(data, filters, orLater), [data, filters, orLater]);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Retention" sub={`People who joined Stu from ${filters.start} to ${filters.end} (IST), by week of joining (weeks start Monday).`} />
        <div className="mb-4 flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5">
          {[{ v: false, l: "On day N" }, { v: true, l: "On day N or later" }].map((x) => (
            <button key={x.l} onClick={() => setOrLater(x.v)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${orLater === x.v ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{x.l}</button>
          ))}
        </div>
      </div>
      <div className={`overflow-x-auto ${CARD}`}>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">Week of joining</th>
              <th className="px-3 py-2 text-right">People</th>
              {RETENTION_DAYS.map((n) => <th key={n} className="px-3 py-2 text-right">D{n}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.week} className="border-t border-neutral-100">
                <td className="px-4 py-2 font-medium">{r.week}</td>
                <td className="px-3 py-2 text-right font-bold"><Num cell={r.size} title={`Joined in the week of ${r.week}`} /></td>
                {RETENTION_DAYS.map((n) => {
                  const c = r.d[`d${n}`];
                  return (
                    <td key={n} className="px-3 py-2 text-right">
                      <div className="font-bold">{c.value == null ? (c.eligible.v ? "n/a" : "") : fmtPct(c.value)}</div>
                      <div className="text-[11px] text-neutral-500">
                        <Num cell={c.back} title={`Week of ${r.week}: back on D${n}${orLater ? " or later" : ""}`} /> of <Num cell={c.eligible} title={`Week of ${r.week}: D${n} has come`} />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
            {!rows.length && <tr><td colSpan={5} className="px-4 py-6 text-center text-neutral-500">Nobody joined in this range.</td></tr>}
          </tbody>
        </table>
      </div>
      <SourceNote>
        {data.journeyLive ? "journey log" : "journey log (not live yet)"}: opened_desk, one a person a IST day. Out of: people whose day N has already come. Day 0 is the IST day they joined.
      </SourceNote>
    </div>
  );
}
