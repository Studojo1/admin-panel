// Stu Sources: the funnel per channel (or source, campaign, device, in-app browser, city), with
// revenue per channel. The source is the person's first touch, saved when they
// reach Stu (career_agent.career_user_source), else the journey log's first.
import { useMemo, useState } from "react";
import { CARD, Num, PageTitle, SourceNote, channelLabel, useStu } from "~/components/stu/ui";
import { SOURCE_STEPS, STEP_BY_KEY, cellOf, fmtInr, fmtPct, pct, sources } from "~/lib/stu/model";

const SPLITS = [
  { v: "channel", l: "Channel" },
  { v: "source", l: "utm source / medium" },
  { v: "campaign", l: "Campaign" },
  { v: "device", l: "Device" },
  { v: "inapp", l: "In-app browser" },
  { v: "city", l: "City" },
];

export default function StuSources() {
  const { data, filters } = useStu();
  const [by, setBy] = useState("channel");
  const s = useMemo(() => sources(data, filters, by), [data, filters, by]);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle title="Sources" sub={`People who joined Stu from ${filters.start} to ${filters.end} (IST), split by where they came from.`} />
        <div className="mb-4 flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5">
          {SPLITS.map((x) => (
            <button key={x.v} onClick={() => setBy(x.v)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${by === x.v ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{x.l}</button>
          ))}
        </div>
      </div>
      {!data.sourceLive && (
        <div className="mb-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900">
          career_agent.career_user_source is not in this database yet, so people show as "Not captured" until the source capture at /start goes live.
        </div>
      )}
      <div className={`overflow-x-auto ${CARD}`}>
        <table className="w-full text-sm">
          <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
            <tr>
              <th className="px-4 py-2">{SPLITS.find((x) => x.v === by)?.l}</th>
              {by === "channel" && <th className="px-3 py-2 text-right">Visitors</th>}
              {SOURCE_STEPS.map((k) => <th key={k} className="px-3 py-2 text-right">{STEP_BY_KEY[k].label}</th>)}
              <th className="px-3 py-2 text-right">Revenue (real)</th>
              <th className="px-3 py-2 text-right">Test payers</th>
            </tr>
          </thead>
          <tbody>
            {s.rows.map((r) => {
              const label = by === "channel" ? channelLabel(r.key) : r.key;
              const vis = s.visitors.get(r.key) ?? [];
              return (
                <tr key={r.key} className="border-t border-neutral-100">
                  <td className="px-4 py-2 font-medium">{label}</td>
                  {by === "channel" && (
                    <td className="px-3 py-2 text-right">
                      <Num cell={data.journeyLive ? { v: vis.length, users: [], visitors: vis } : { v: 0, users: [], na: true }} title={`Visitors from ${label}`} />
                    </td>
                  )}
                  {SOURCE_STEPS.map((k) => {
                    const c = r.steps[k];
                    return (
                      <td key={k} className="px-3 py-2 text-right">
                        <div className="font-bold"><Num cell={c} title={`${label}: ${STEP_BY_KEY[k].label}`} /></div>
                        {k !== "signed_up" && <div className="text-[11px] text-neutral-500">{fmtPct(pct(c.v, r.users.length))}</div>}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2 text-right font-bold"><Num cell={r.revenue} fmt={fmtInr} title={`${label}: revenue (real)`} /></td>
                  <td className="px-3 py-2 text-right"><Num cell={r.testPaid} title={`${label}: test payers`} /></td>
                </tr>
              );
            })}
            {!s.rows.length && <tr><td colSpan={SOURCE_STEPS.length + 4} className="px-4 py-6 text-center text-neutral-500">Nobody joined in this range.</td></tr>}
          </tbody>
        </table>
      </div>
      <SourceNote>
        channel: career_user_source.first_touch (utm tags, referrer, click ids), else the first journey event with a source, else the visitor's; grouped as on admin.studojo.com. Steps as on the Funnel page (unnested). Revenue: career_credit_orders paid, not test, less refunds; autopay charges {data.settleLive ? "once Razorpay has paid them out to the bank (career_settlements)" : "when charged"}.
        Cohort: <Num cell={cellOf(s.cohort)} title="Cohort" />
      </SourceNote>
    </div>
  );
}
