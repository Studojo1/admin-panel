// The Stu section (new product, studojo.pro) at the root of the admin panel:
// the admin gate, the shared range / channel / internal controls (kept in the
// address, so a view can be shared), the self-check banner, and the drill-down.
import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useSearchParams } from "react-router";
import { AdminHeader } from "~/components";
import { DrillModal, type StuCtx, channelLabel } from "~/components/stu/ui";
import { useAdminGuard } from "~/lib/auth-guard";
import { fetchStu } from "~/lib/stu/client";
import { type Cell, type Filters, type StuData, addDays, fmtIst, scopeUsers, selfCheck, todayIst } from "~/lib/stu/model";

export function meta() {
  return [{ title: "Stu tracking · Studojo Admin" }];
}

const TABS = [
  { to: "/", label: "Daily", end: true },
  { to: "/funnel", label: "Funnel" },
  { to: "/ratios", label: "Ratios" },
  { to: "/drop-offs", label: "Drop-offs" },
  { to: "/sources", label: "Sources" },
  { to: "/journeys", label: "Journeys" },
  { to: "/retention", label: "Retention" },
  { to: "/self-check", label: "Self-check" },
];

/** Stu's history starts here (the backfill goes back to 25 Oct 2026). */
const HISTORY_START = "2026-10-25";
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function StuLayout() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const [data, setData] = useState<StuData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [drill, setDrill] = useState<{ title: string; cell: Cell } | null>(null);

  const today = todayIst();
  const filters: Filters = useMemo(() => {
    const end = DAY_RE.test(params.get("end") || "") ? params.get("end")! : today;
    const start = DAY_RE.test(params.get("start") || "") ? params.get("start")! : addDays(end, -13);
    return { start: start <= end ? start : end, end, internal: params.get("internal") === "1", channel: params.get("channel") || "all" };
  }, [params, today]);

  const setFilters = useCallback(
    (f: Partial<Filters>) => {
      const next = new URLSearchParams(params);
      const merged = { ...filters, ...f };
      next.set("start", merged.start);
      next.set("end", merged.end);
      if (merged.internal) next.set("internal", "1");
      else next.delete("internal");
      if (merged.channel && merged.channel !== "all") next.set("channel", merged.channel);
      else next.delete("channel");
      setParams(next, { replace: true });
    },
    [params, filters, setParams],
  );

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchStu(fresh));
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (isAuthorized) load(false);
  }, [isAuthorized, load]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const channels = data ? [...new Set(scopeUsers(data, { ...filters, channel: "all" }).map((i) => data.users[i].ch))].sort() : [];
  const check = data ? selfCheck(data, filters) : null;
  const ctx: StuCtx | null = data ? { data, filters, setFilters, drill: (title, cell) => setDrill({ title, cell }) } : null;
  const qs = params.toString() ? `?${params.toString()}` : "";
  const preset = (days: number) => setFilters({ start: addDays(today, -(days - 1)), end: today });

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-violet-700">Stu · studojo.pro</div>
            <nav className="mt-1 flex flex-wrap gap-1">
              {TABS.map((t) => (
                <NavLink
                  key={t.to}
                  to={`${t.to}${qs}`}
                  end={t.end}
                  className={({ isActive }) =>
                    `rounded-lg border-2 px-3 py-1.5 text-sm font-semibold ${isActive ? "border-neutral-900 bg-neutral-900 text-white" : "border-transparent text-neutral-700 hover:border-neutral-300 hover:bg-white"}`
                  }
                >
                  {t.label}
                  {t.to === "/self-check" && check && check.flagged > 0 ? <span className="ml-1 rounded bg-red-500 px-1 text-[10px] text-white">{check.flagged}</span> : null}
                </NavLink>
              ))}
            </nav>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {[7, 14, 30, 90].map((n) => (
              <button key={n} onClick={() => preset(n)} className="rounded-lg border-2 border-neutral-900 bg-white px-2.5 py-1 font-semibold hover:bg-neutral-100">{n}d</button>
            ))}
            <button onClick={() => setFilters({ start: HISTORY_START, end: today })} className="rounded-lg border-2 border-neutral-900 bg-white px-2.5 py-1 font-semibold hover:bg-neutral-100">Since 25 Oct</button>
            <input type="date" value={filters.start} max={filters.end} onChange={(e) => e.target.value && setFilters({ start: e.target.value })} className="rounded-lg border-2 border-neutral-900 px-2 py-1" />
            <span className="text-neutral-500">to</span>
            <input type="date" value={filters.end} min={filters.start} onChange={(e) => e.target.value && setFilters({ end: e.target.value })} className="rounded-lg border-2 border-neutral-900 px-2 py-1" />
            <select value={filters.channel} onChange={(e) => setFilters({ channel: e.target.value })} className="rounded-lg border-2 border-neutral-900 bg-white px-2 py-1">
              <option value="all">All channels</option>
              {channels.map((c) => <option key={c} value={c}>{channelLabel(c)}</option>)}
            </select>
            <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1">
              <input type="checkbox" checked={filters.internal} onChange={(e) => setFilters({ internal: e.target.checked })} />
              Include internal
            </label>
            <button onClick={() => load(true)} disabled={loading} className="rounded-lg border-2 border-neutral-900 bg-violet-500 px-2.5 py-1 font-semibold text-white disabled:opacity-50">{loading ? "Loading" : "Refresh"}</button>
          </div>
        </div>

        {data && (
          <p className="mb-3 text-xs text-neutral-500">
            Days are IST. Read {fmtIst(Date.parse(data.generatedAt))}. {filters.internal ? "Internal accounts included" : "Excluded: staff (admin, ops), @studojo.com, the test accounts, guests"}.
            Every number opens the people behind it.
          </p>
        )}
        {data && !data.journeyLive && (
          <div className="mb-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900">
            The journey log (career_agent.career_journey_events) is not in this database yet. Numbers from the product's own tables show; steps only the log records show n/a until it goes live.
          </div>
        )}
        {check && check.flagged > 0 && (
          <NavLink to={`/self-check${qs}`} className="mb-3 block rounded-xl border-2 border-red-500 bg-red-50 px-4 py-2 text-sm font-semibold text-red-800">
            Self-check: {check.flagged} step{check.flagged === 1 ? "" : "s"} where the journey log and the product's tables differ by more than 2%. Open the self-check.
          </NavLink>
        )}
        {error && <div className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {!data && !error && (
          <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" /></div>
        )}
        {ctx && <Outlet context={ctx} />}
        {drill && data && <DrillModal title={drill.title} cell={drill.cell} data={data} onClose={() => setDrill(null)} />}
      </main>
    </div>
  );
}
