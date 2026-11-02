// Stu self-check: the journey log against the product's own tables (calls,
// onboarding, jobs, emails, payments), per step, since the log began. A gap over
// 2% is flagged, and every Stu page shows a red banner while one is. Computed
// on load from the same data the pages use; no cron.
import { useMemo } from "react";
import { CARD, Num, PageTitle, useStu } from "~/components/stu/ui";
import { CHECK_THRESHOLD_PCT, fmtIst, selfCheck } from "~/lib/stu/model";

export default function StuSelfCheck() {
  const { data, filters } = useStu();
  const c = useMemo(() => selfCheck(data, filters), [data, filters]);
  return (
    <div>
      <PageTitle
        title="Self-check"
        sub={`Each step's people in the journey log against its ground-truth table, since the log began${c.from ? ` (${fmtIst(c.from)})` : ""}. Flagged above ${CHECK_THRESHOLD_PCT}%.`}
      />
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
