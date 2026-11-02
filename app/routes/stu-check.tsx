// Stu self-check: the journey log against the product's own tables (calls,
// onboarding, jobs, emails, payments), per step, since the log began. A gap over
// 2% is flagged, and every Stu page shows a red banner while one is. Computed
// on load from the same data the pages use; no cron.
import { useMemo, useState } from "react";
import { CARD, Num, PageTitle, useStu } from "~/components/stu/ui";
import { CHECK_THRESHOLD_PCT, type CheckWindow, fmtIst, selfCheck } from "~/lib/stu/model";

export default function StuSelfCheck() {
  const { data, filters } = useStu();
  const [win, setWin] = useState<CheckWindow>("live");
  const c = useMemo(() => selfCheck(data, filters, win), [data, filters, win]);
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle
          title="Self-check"
          sub={`Each step's people in the journey log against its ground-truth table, ${win === "live" ? "since the log's first live event" : "since the log's first event, the backfill included"}${c.from ? ` (${fmtIst(c.from)})` : ""}. Flagged above ${CHECK_THRESHOLD_PCT}%. The page range does not apply here.`}
        />
        <div className="mb-4 flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5">
          {([{ v: "live", l: "Live logging" }, { v: "all", l: "With the backfill" }] as const).map((x) => (
            <button key={x.v} onClick={() => setWin(x.v)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${win === x.v ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{x.l}</button>
          ))}
        </div>
      </div>
      {data.journeyLive && (
        <div className={`mb-4 p-3 text-xs text-neutral-600 ${CARD}`}>
          {win === "all" ? "The backfill (props.backfill) rebuilt the days before live logging from the product's tables with its own rules, so a gap here can be the backfill's, not the live logging's. " : ""}
          Known differences (2 Nov 2026, career-agent fixes asked for): older studojo.com accounts got no backfilled signed_up (their account date is before the backfill's start; live logging records them);
          a job added to outreach turns its match to applied with no job_saved, so Saved a job differs; a desk call with Stu counts as chatting in the tables but writes no chatted.
        </div>
      )}
      {data.journeyLive && c.from == null && (
        <div className={`mb-4 p-3 text-sm ${CARD}`}>No live journey events yet, only the backfill: switch to "With the backfill" to compare it.</div>
      )}
      {!data.journeyLive ? (
        <div className={`mb-6 p-4 text-sm ${CARD}`}>The journey log is not in this database yet, so there is nothing to compare. The pages count from the product's tables meanwhile.</div>
      ) : (
        <div className={`mb-6 overflow-x-auto ${CARD}`}>
          <table className="w-full text-sm">
            <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr>
                <th className="px-4 py-2">Step</th><th className="px-3 py-2 text-right">Table</th><th className="px-3 py-2 text-right">Journey log</th>
                <th className="px-3 py-2 text-right">Only in table</th><th className="px-3 py-2 text-right">Only in log</th><th className="px-3 py-2 text-right">Gap</th>
              </tr>
            </thead>
            <tbody>
              {c.rows.map((r) => (
                <tr key={r.key} className={`border-t border-neutral-100 ${r.flagged ? "bg-red-50" : ""}`}>
                  <td className="px-4 py-1.5 font-medium">{r.label}</td>
                  <td className="px-3 py-1.5 text-right"><Num cell={r.truth} title={`${r.label}: in the table`} /></td>
                  <td className="px-3 py-1.5 text-right"><Num cell={r.journey} title={`${r.label}: in the journey log`} /></td>
                  <td className="px-3 py-1.5 text-right"><Num cell={r.onlyTruth} title={`${r.label}: in the table, not the log`} /></td>
                  <td className="px-3 py-1.5 text-right"><Num cell={r.onlyJourney} title={`${r.label}: in the log, not the table`} /></td>
                  <td className={`px-3 py-1.5 text-right font-bold ${r.flagged ? "text-red-700" : "text-emerald-700"}`}>{r.gap == null ? "" : `${r.gap}%`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div className={`overflow-x-auto ${CARD}`}>
          <div className="border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2 font-['Clash_Display'] font-bold">Step names in the journey log</div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="px-4 py-1.5">Name</th><th className="px-3 py-1.5">Counts as</th><th className="px-3 py-1.5 text-right">Events</th><th className="px-3 py-1.5 text-right">People</th><th className="px-3 py-1.5 text-right">Visitors</th><th className="px-3 py-1.5">Last</th></tr></thead>
            <tbody>
              {data.journeySteps.map((s) => (
                <tr key={s.step} className={`border-t border-neutral-100 ${s.as ? "" : "bg-amber-50"}`}>
                  <td className="px-4 py-1.5 font-mono text-xs">{s.step}</td>
                  <td className="px-3 py-1.5 text-xs">{s.as ?? "not in STEPS (app/lib/stu/model.ts)"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{s.events}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{s.users}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{s.visitors}</td>
                  <td className="whitespace-nowrap px-3 py-1.5 text-xs">{fmtIst(s.last)}</td>
                </tr>
              ))}
              {!data.journeySteps.length && <tr><td colSpan={6} className="px-4 py-4 text-neutral-500">No events.</td></tr>}
            </tbody>
          </table>
        </div>
        <div className={`p-4 text-sm ${CARD}`}>
          <div className="mb-2 font-['Clash_Display'] font-bold">This environment</div>
          <div>Journey log: {data.journeyLive ? "live" : "not in the database"}; source rows: {data.sourceLive ? "live" : "not in the database"}.</div>
          <div className="mt-1">Tables missing here: {data.missing.length ? data.missing.join(", ") : "none"}.</div>
          <div className="mt-1">Journey events by env: {data.envs.length ? data.envs.map((e) => `${e.env} ${e.n}`).join(", ") : "none"}.</div>
          <div className="mt-1">Test accounts left out: {data.testUsers.join(", ")}.</div>
          <div className="mt-1">Product users read: {data.users.length} ({data.users.filter((u) => u.internal).length} internal).</div>
        </div>
      </div>
    </div>
  );
}
