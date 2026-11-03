// Stu Auditor (owner, 4 Nov 2026): the daily check of everything that failed.
// Calls that never started or ended unfinished, resume builds that made no
// resume, Stu's reply and tool errors, failed emails and bounces, payments that
// failed or were left, bug tickets and WhatsApp sends that did not go. Each row
// has the person, a plain-words reason and a drill-down; the top line counts
// since yesterday 00:00 IST whatever the range. Read only (/api/stu/auditor).
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AdminHeader } from "~/components";
import { CARD } from "~/components/stu/ui";
import { getToken } from "~/lib/api";
import { useAdminGuard } from "~/lib/auth-guard";
import { type AuditGroup, type AuditReport, type AuditRow, AUDIT_GROUPS, byGroup, byReason, inRange, sinceYesterday, tally } from "~/lib/stu/auditor";
import { addDays, fmtIst, fmtN, todayIst } from "~/lib/stu/model";

export function meta() {
  return [{ title: "Auditor · Stu · Studojo Admin" }];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Stu went live on studojo.com on this IST day. */
const LAUNCH_DAY = "2026-11-03";
type RangeKey = "today" | "yesterday" | "7d" | "30d" | "launch" | "custom";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" }, { key: "launch", label: "Since launch" }, { key: "custom", label: "Custom" },
];
const SHOW = 300;

function Level({ level }: { level: "fail" | "warn" }) {
  return level === "fail"
    ? <span className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-1.5 py-0.5 text-[11px] font-bold text-red-700">✕ Broke</span>
    : <span className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-1.5 py-0.5 text-[11px] font-bold text-amber-800">! Check</span>;
}

const groupLabel = (g: AuditGroup) => AUDIT_GROUPS.find((x) => x.key === g)?.label ?? g;

export default function StuAuditor() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const today = todayIst();

  const range = (RANGES.some((r) => r.key === params.get("range")) ? params.get("range") : "today") as RangeKey;
  const { start, end } = useMemo(() => {
    if (range === "yesterday") return { start: addDays(today, -1), end: addDays(today, -1) };
    if (range === "7d") return { start: addDays(today, -6), end: today };
    if (range === "30d") return { start: addDays(today, -29), end: today };
    if (range === "launch") return { start: LAUNCH_DAY <= today ? LAUNCH_DAY : today, end: today };
    if (range === "custom") {
      const e = DAY_RE.test(params.get("end") || "") ? params.get("end")! : today;
      const s = DAY_RE.test(params.get("start") || "") ? params.get("start")! : addDays(e, -6);
      return { start: s <= e ? s : e, end: e };
    }
    return { start: today, end: today };
  }, [range, params, today]);
  const internal = params.get("internal") === "1";
  const group = (AUDIT_GROUPS.some((g) => g.key === params.get("group")) ? params.get("group") : null) as AuditGroup | null;
  const code = params.get("reason");

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const setRange = (key: RangeKey) => setParam(key === "custom" ? { range: key, start, end } : { range: key === "today" ? null : key, start: null, end: null });

  const [report, setReport] = useState<AuditReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const qs = new URLSearchParams({ start, end, ...(internal ? { internal: "1" } : {}), ...(fresh ? { fresh: "1" } : {}) });
      const res = await fetch(`/api/stu/auditor?${qs}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
      setReport(body as AuditReport);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [start, end, internal]);
  useEffect(() => {
    if (isAuthorized) load(false);
  }, [isAuthorized, load]);

  const rows = useMemo(() => (report ? report.rows.filter((r) => inRange(r, start, end)) : []), [report, start, end]);
  const groups = useMemo(() => byGroup(rows), [rows]);
  const since = useMemo(() => (report ? sinceYesterday(report.rows, report.sinceFrom) : null), [report]);
  const reasons = useMemo(() => byReason(group ? groups[group] : rows), [rows, groups, group]);
  const shown = useMemo(() => rows.filter((r) => (!group || r.group === group) && (!code || `${r.group}|${r.code}` === code)), [rows, group, code]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const qs = new URLSearchParams({ start, end, ...(internal ? { internal: "1" } : {}) }).toString();
  const journey = (r: AuditRow) => `/journeys?${qs}&u=${encodeURIComponent(r.user!)}`;
  const rangeText = start === end ? start : `${start} to ${end}`;
  const t = tally(rows);

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-5 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-purple-700">Stu · <Link to={`/?${qs}`} className="hover:underline">Overview</Link></div>
            <h1 className="font-['Clash_Display'] text-3xl font-bold text-neutral-900">Auditor</h1>
            <p className="mt-1 max-w-3xl text-sm text-neutral-600">
              Everything that failed for the people using Stu, from the product's own records. Each row names the person, says why in plain words and opens to the detail.
              {report ? ` ${report.env === "staging" ? "Staging" : report.env === "production" ? "Production" : "Unknown"} database.` : ""}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <div className="inline-flex flex-wrap gap-0.5 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
              {RANGES.map((r) => (
                <button key={r.key} onClick={() => setRange(r.key)} className={`rounded-lg px-2.5 py-1 font-semibold ${range === r.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{r.label}</button>
              ))}
            </div>
            {range === "custom" && (
              <>
                <input type="date" value={start} max={end} onChange={(e) => e.target.value && setParam({ start: e.target.value })} className="rounded-lg border-2 border-neutral-900 bg-white px-2 py-1" />
                <span className="text-neutral-500">to</span>
                <input type="date" value={end} min={start} onChange={(e) => e.target.value && setParam({ end: e.target.value })} className="rounded-lg border-2 border-neutral-900 bg-white px-2 py-1" />
              </>
            )}
            <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1">
              <input type="checkbox" checked={internal} onChange={(e) => setParam({ internal: e.target.checked ? "1" : null })} />
              Include internal
            </label>
            <button onClick={() => load(true)} disabled={loading} className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-2.5 py-1 font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50">{loading ? "Loading" : "Refresh"}</button>
          </div>
        </div>

        {error && <div className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {!report && !error && (
          <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-purple-500 border-t-transparent" /></div>
        )}

        {report && since && (
          <>
            <section className={`mb-5 rounded-2xl border-2 border-neutral-900 px-5 py-4 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] ${since.all.fail ? "bg-red-50" : since.all.n ? "bg-amber-50" : "bg-emerald-50"}`}>
              <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
                <div className="text-xs font-bold uppercase tracking-wide text-neutral-600">Since yesterday 00:00 IST</div>
                {since.all.n === 0 ? (
                  <div className="font-['Clash_Display'] text-2xl font-bold text-emerald-800">✓ Nothing failed</div>
                ) : (
                  <div className="font-['Clash_Display'] text-2xl font-bold text-neutral-900">
                    {fmtN(since.all.n)} failure{since.all.n === 1 ? "" : "s"} <span className="text-base font-semibold text-neutral-600">for {fmtN(since.all.people)} {since.all.people === 1 ? "person" : "people"}, {fmtN(since.all.fail)} broke</span>
                  </div>
                )}
                <div className="text-sm text-neutral-600">Today {fmtN(since.today.n)} · yesterday {fmtN(since.yesterday.n)}</div>
              </div>
              {since.groups.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {since.groups.map((g) => (
                    <span key={g.key} className="rounded-lg border border-neutral-300 bg-white px-2 py-0.5 text-xs font-semibold text-neutral-700">{g.label}: {fmtN(g.n)}</span>
                  ))}
                </div>
              )}
            </section>

            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-['Clash_Display'] text-lg font-semibold">{rangeText}: {fmtN(t.n)} failure{t.n === 1 ? "" : "s"}, {fmtN(t.people)} {t.people === 1 ? "person" : "people"}</h2>
              <span className="text-xs text-neutral-500">{internal ? "Internal accounts and test rows included" : "Hidden: staff, @studojo.com, the test accounts, guests and test rows"}. Read {fmtIst(Date.parse(report.generatedAt))}.</span>
            </div>
            <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-4">
              {AUDIT_GROUPS.map((g) => {
                const gt = tally(groups[g.key]);
                const notChecked = report.missing.some((m) => g.sources.some((s) => m.startsWith(s)));
                const on = group === g.key;
                return (
                  <button key={g.key} onClick={() => setParam({ group: on ? null : g.key, reason: null })} title={g.sub}
                    className={`rounded-2xl border-2 border-neutral-900 px-4 py-3 text-left shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-colors ${on ? "bg-purple-100" : "bg-white hover:bg-neutral-50"}`}>
                    <div className="text-xs font-bold uppercase tracking-wide text-neutral-500">{g.label}</div>
                    <div className={`mt-1 font-['Clash_Display'] text-2xl font-bold ${gt.fail ? "text-red-700" : gt.n ? "text-amber-700" : "text-neutral-400"}`}>{gt.n ? fmtN(gt.n) : "None"}</div>
                    <div className="text-xs text-neutral-500">{gt.n ? `${fmtN(gt.people)} ${gt.people === 1 ? "person" : "people"}, ${fmtN(gt.fail)} broke` : notChecked ? "not checked here" : "nothing recorded"}</div>
                  </button>
                );
              })}
            </div>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
              <section className={`overflow-hidden ${CARD} self-start`}>
                <div className="flex items-center justify-between border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
                  <h3 className="font-['Clash_Display'] text-base font-semibold">By reason{group ? `: ${groupLabel(group)}` : ""}</h3>
                  {(group || code) && <button onClick={() => setParam({ group: null, reason: null })} className="text-xs font-semibold text-violet-700 hover:underline">Show all</button>}
                </div>
                {reasons.length === 0 ? <p className="p-4 text-sm text-neutral-500">Nothing in this range.</p> : (
                  <table className="w-full text-sm">
                    <tbody>
                      {reasons.map((x) => {
                        const k = `${x.group}|${x.code}`;
                        return (
                          <tr key={k} onClick={() => setParam({ reason: code === k ? null : k })} className={`cursor-pointer border-t border-neutral-100 ${code === k ? "bg-purple-50" : "hover:bg-neutral-50"}`}>
                            <td className="px-4 py-2">
                              <div className="text-neutral-900">{x.reason}</div>
                              <div className="text-[11px] text-neutral-500">{groupLabel(x.group)} · {x.code}</div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-right font-bold tabular-nums">{fmtN(x.rows.length)}<div className="text-[11px] font-normal text-neutral-500">{x.people} {x.people === 1 ? "person" : "people"}</div></td>
                            <td className="px-3 py-2 text-right"><Level level={x.level} /></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </section>

              <section className={`overflow-hidden ${CARD}`}>
                <div className="border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
                  <h3 className="font-['Clash_Display'] text-base font-semibold">Every failure, newest first ({fmtN(shown.length)})</h3>
                  <p className="text-xs text-neutral-500">Click a row for the detail. The name opens that person's journey.</p>
                </div>
                {shown.length === 0 ? <p className="p-4 text-sm text-neutral-500">Nothing failed here in this range.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-white text-left text-xs uppercase text-neutral-500">
                        <tr><th className="px-4 py-2">When (IST)</th><th className="px-3 py-2">Who</th><th className="px-3 py-2">What failed</th><th className="px-3 py-2" /></tr>
                      </thead>
                      <tbody>
                        {(more ? shown : shown.slice(0, SHOW)).map((r) => (
                          <Fragment key={r.id}>
                            <tr onClick={() => setOpen(open === r.id ? null : r.id)} className={`cursor-pointer border-t border-neutral-100 align-top ${open === r.id ? "bg-purple-50" : "hover:bg-neutral-50"}`}>
                              <td className="whitespace-nowrap px-4 py-2 text-neutral-700">{fmtIst(r.at).replace(" IST", "")}</td>
                              <td className="max-w-[220px] px-3 py-2">
                                {r.user ? (
                                  <Link to={journey(r)} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-violet-700 hover:underline" title="Open their journey">{r.email || r.user}</Link>
                                ) : <span className="block truncate text-neutral-500">{r.email || "nobody named"}</span>}
                                <div className="truncate text-xs text-neutral-500">{r.name}{r.internal ? ` · internal: ${r.internal}` : ""}</div>
                              </td>
                              <td className="px-3 py-2">
                                <div className="text-neutral-900">{r.reason}</div>
                                <div className="text-[11px] text-neutral-500">{groupLabel(r.group)}</div>
                              </td>
                              <td className="px-3 py-2 text-right"><Level level={r.level} /></td>
                            </tr>
                            {open === r.id && (
                              <tr className="bg-purple-50/50">
                                <td colSpan={4} className="px-4 pb-3 pt-1">
                                  <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-4 gap-y-1 text-xs">
                                    {r.detail.map(([k, v]) => (
                                      <Fragment key={k}>
                                        <dt className="font-semibold text-neutral-600">{k}</dt>
                                        <dd className="whitespace-pre-wrap break-words text-neutral-900">{v}</dd>
                                      </Fragment>
                                    ))}
                                  </dl>
                                  <div className="mt-2 flex gap-4 text-xs font-semibold">
                                    {r.user && <Link to={journey(r)} className="text-violet-700 hover:underline">Their journey</Link>}
                                    {r.href && <Link to={r.href} className="text-violet-700 hover:underline">Open the ticket</Link>}
                                  </div>
                                </td>
                              </tr>
                            )}
                          </Fragment>
                        ))}
                      </tbody>
                    </table>
                    {!more && shown.length > SHOW && (
                      <button onClick={() => setMore(true)} className="w-full border-t border-neutral-200 py-2 text-sm font-semibold text-violet-700 hover:bg-neutral-50">Show all {fmtN(shown.length)}</button>
                    )}
                  </div>
                )}
              </section>
            </div>

            <div className="mt-5 space-y-1 text-xs text-neutral-500">
              {AUDIT_GROUPS.map((g) => <div key={g.key}><span className="font-semibold text-neutral-600">{g.label}:</span> {g.sub}</div>)}
              {report.missing.length > 0 && <div className="text-amber-800">Not checked in this database: {report.missing.join("; ")}.</div>}
              {report.capped.length > 0 && <div className="text-amber-800">Over 2,000 rows, so these counts are a floor: {report.capped.join(", ")}. Pick a shorter range.</div>}
              <div>Broke: something on our side or the provider's went wrong. Check: worth a look, but it may be the student's own doing (a mic they blocked, a checkout they left, a call they restarted).</div>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
