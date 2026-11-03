// Stu Daily: one row per metric, one column per day (or 3 days, or week), newest
// first, green or red against the period before. Every cell opens its people.
import { useMemo, useState } from "react";
import { CARD, Num, PageTitle, SourceNote, useStu } from "~/components/stu/ui";
import { dailyTable, fmtInr } from "~/lib/stu/model";

const GROUPS = [{ g: 1, label: "Daily" }, { g: 3, label: "3-day" }, { g: 7, label: "Weekly" }];

export default function StuDaily() {
  const { data, filters } = useStu();
  const [group, setGroup] = useState(1);
  const table = useMemo(() => dailyTable(data, filters, group), [data, filters, group]);
  const order = table.cols.map((_, i) => i).reverse();
  let lastGroup = "";

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Daily" sub="Newest first. Green: up on the period before; red: down. Test rows are never coloured. Click any number for the people behind it." />
        <div className="mb-4 flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5">
          {GROUPS.map((x) => (
            <button key={x.g} onClick={() => setGroup(x.g)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${group === x.g ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{x.label}</button>
          ))}
        </div>
      </div>
      <div className={`overflow-hidden ${CARD}`}>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-neutral-50">
                <th className="sticky left-0 z-10 min-w-[230px] border-b border-neutral-200 bg-neutral-50 px-4 py-2 text-left font-semibold text-neutral-700">Metric</th>
                <th className="border-b border-l border-neutral-200 px-3 py-2 text-right font-semibold text-neutral-900">Total</th>
                {order.map((ci) => (
                  <th key={ci} className="whitespace-nowrap border-b border-l border-neutral-200 px-3 py-2 text-right font-semibold text-neutral-700">{table.cols[ci].label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {table.rows.map((r) => {
                const head = r.def.group !== lastGroup;
                lastGroup = r.def.group;
                const fmt = r.def.kind === "inr" ? fmtInr : undefined;
                return [
                  head ? (
                    <tr key={`g-${r.def.group}`}>
                      <td colSpan={order.length + 2} className="sticky left-0 border-b border-neutral-200 bg-violet-50 px-4 py-1 text-[11px] font-bold uppercase tracking-wide text-violet-800">{r.def.group}</td>
                    </tr>
                  ) : null,
                  <tr key={r.def.key} className={r.def.kind === "test" ? "bg-amber-50/40" : ""}>
                    <td className="sticky left-0 z-10 whitespace-nowrap border-b border-neutral-100 bg-white px-4 py-1.5">
                      <div className={`font-medium ${r.def.label.startsWith("  ") ? "pl-4 text-neutral-600" : "text-neutral-900"}`}>{r.def.label.trim()}</div>
                      <SourceNote>{r.def.source(data)}</SourceNote>
                    </td>
                    <td className="border-b border-l border-neutral-100 px-3 py-1.5 text-right font-bold">
                      <Num cell={r.total} fmt={fmt} title={`${r.def.label.trim()}, ${filters.start} to ${filters.end}`} />
                    </td>
                    {order.map((ci) => {
                      const cur = r.cells[ci];
                      const prev = ci > 0 ? r.cells[ci - 1] : null;
                      // An old visitor count (crawlers in it) next to a real one is not a rise or a fall.
                      const tone = r.def.kind === "test" || !prev || cur.na || prev.na || cur.old !== prev.old
                        ? ""
                        : cur.v > prev.v ? "bg-emerald-100 text-emerald-900" : cur.v < prev.v ? "bg-red-100 text-red-900" : "";
                      return (
                        <td key={ci} className={`border-b border-l border-neutral-100 px-3 py-1.5 text-right font-semibold ${tone}`}>
                          <Num cell={cur} fmt={fmt} title={`${r.def.label.trim()}, ${table.cols[ci].label}`} />
                        </td>
                      );
                    })}
                  </tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="mt-3 text-xs text-neutral-500">
        Sign-ups are new Stu users that day; an older studojo.com account counts on the day of its first Stu step. Step rows ("first time") count each person once, on the day they first did it; the other rows count every event.
        The channel filter applies to visitors by their first source and to people by their sign-up source.
      </p>
    </div>
  );
}
