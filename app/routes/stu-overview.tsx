// Stu Overview: the admin root and the landing page after login (owner, 2 Nov
// 2026: "in one view I can understand what is going on"). One scrollable screen:
// KPI tiles, the funnel, 30-day trends, sources, call health, drop-offs,
// engagement and retention, a live feed and an alerts strip. Each section is one
// call to /api/stu/overview, all in parallel, refreshed every 60 s. The numbers
// come from the same model functions as the Stu pages (app/lib/stu/overview.ts),
// and every number opens the people behind it.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router";
import { BarElement, CategoryScale, Chart as ChartJS, Filler, LinearScale, LineElement, PointElement, Tooltip } from "chart.js";
import { Bar, Line } from "react-chartjs-2";
import { AdminHeader } from "~/components";
import { DrillModal, type DrillPeople, channelLabel } from "~/components/stu/ui";
import { getToken } from "~/lib/api";
import { useAdminGuard } from "~/lib/auth-guard";
import { VendorsTile } from "~/components/vendors/overview-tile";
import { type Cell, addDays, fmtDur, fmtInr, fmtN, fmtPct, todayIst } from "~/lib/stu/model";
import type { Alert, FeedRow, FunnelBar, Insight, KpiTile, OvEnvelope, OvSection, PowerRow, SourceRow } from "~/lib/stu/overview";
import { HEAT_DAYS } from "~/lib/stu/overview";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, BarElement, Tooltip, Filler);

export function meta() {
  return [{ title: "Overview · Stu · Studojo Admin" }];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const REFRESH_MS = 60_000;
const SECTIONS: OvSection[] = ["insights", "alerts", "kpis", "usage", "power", "funnel", "trends", "sources", "calls", "dropoffs", "engagement", "feed"];
const TABS = [
  { to: "/", label: "Overview" }, { to: "/daily", label: "Daily" }, { to: "/funnel", label: "Funnel" }, { to: "/ratios", label: "Ratios" },
  { to: "/drop-offs", label: "Drop-offs" }, { to: "/sources", label: "Sources" }, { to: "/journeys", label: "Journeys" },
  { to: "/retention", label: "Retention" }, { to: "/self-check", label: "Self-check" },
];
type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "custom", label: "Custom" },
];

// ------------------------------------------------------------------ theme

/** Chart colours per theme (dataviz reference palette; validated light and dark). */
const THEME = {
  light: {
    page: "#f9f9f7", surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", muted: "#898781", grid: "#e1e0d9", axis: "#c3c2b7",
    border: "rgba(11,11,11,0.10)", track: "#f0efec", up: "#006300", down: "#d03b3b",
    series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"],
    ordinal: ["#86b6ef", "#5598e7", "#2a78d6", "#1c5cab", "#104281"],
    seq: ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95", "#104281", "#0d366b"],
    neutral: "#c3c2b7",
  },
  dark: {
    page: "#0d0d0d", surface: "#1a1a19", ink: "#f0efec", ink2: "#c3c2b7", muted: "#898781", grid: "#2c2c2a", axis: "#383835",
    border: "rgba(255,255,255,0.10)", track: "#262624", up: "#0ca30c", down: "#e66767",
    series: ["#3987e5", "#d95926", "#199e70", "#c98500"],
    ordinal: ["#184f95", "#256abf", "#3987e5", "#6da7ec", "#9ec5f4"],
    seq: ["#0d366b", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef", "#9ec5f4", "#b7d3f6", "#cde2fb"],
    neutral: "#52514e",
  },
};
type Theme = (typeof THEME)["light"];
const STATUS = { good: "#0ca30c", warning: "#fab219", serious: "#ec835a", critical: "#d03b3b" };

const CSS = `
.ov { --page:${THEME.light.page}; --surface:${THEME.light.surface}; --ink:${THEME.light.ink}; --ink2:${THEME.light.ink2}; --muted:${THEME.light.muted};
  --grid:${THEME.light.grid}; --axis:${THEME.light.axis}; --border:${THEME.light.border}; --track:${THEME.light.track}; --up:${THEME.light.up}; --down:${THEME.light.down};
  --s1:${THEME.light.series[0]}; --s2:${THEME.light.series[1]}; --hover:rgba(11,11,11,0.04);
  color-scheme: light; background: var(--page); color: var(--ink); font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
.ov[data-theme="dark"] { --page:${THEME.dark.page}; --surface:${THEME.dark.surface}; --ink:${THEME.dark.ink}; --ink2:${THEME.dark.ink2}; --muted:${THEME.dark.muted};
  --grid:${THEME.dark.grid}; --axis:${THEME.dark.axis}; --border:${THEME.dark.border}; --track:${THEME.dark.track}; --up:${THEME.dark.up}; --down:${THEME.dark.down};
  --s1:${THEME.dark.series[0]}; --s2:${THEME.dark.series[1]}; --hover:rgba(255,255,255,0.05); color-scheme: dark; }
.ov .card { background: var(--surface); border: 1px solid var(--border); border-radius: 14px; }
.ov .num { text-decoration: underline dotted; text-decoration-color: var(--axis); text-underline-offset: 3px; cursor: pointer; }
.ov .num:hover, .ov .num:focus-visible { text-decoration-color: var(--s1); outline: none; }
.ov .seg { display:inline-flex; flex-wrap: wrap; border:1px solid var(--border); border-radius:10px; padding:2px; gap:2px; background: var(--surface); }
.ov .seg button { padding: 3px 10px; border-radius: 8px; font-size: 12px; font-weight: 600; color: var(--ink2); }
.ov .seg button:hover { background: var(--hover); }
.ov .seg button[aria-pressed="true"] { background: var(--ink); color: var(--surface); }
.ov .ctl { border:1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--ink); padding: 3px 8px; font-size: 13px; }
.ov .row-hover:hover { background: var(--hover); }
.ov .fade { transition: opacity .2s; }
.ov .tnum { font-variant-numeric: tabular-nums; }
`;

function useTheme(): { mode: "auto" | "light" | "dark"; setMode: (m: "auto" | "light" | "dark") => void; dark: boolean } {
  const [mode, setModeState] = useState<"auto" | "light" | "dark">("auto");
  const [osDark, setOsDark] = useState(false);
  useEffect(() => {
    const saved = localStorage.getItem("ov-theme");
    if (saved === "light" || saved === "dark") setModeState(saved);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    setOsDark(mq.matches);
    const on = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  const setMode = (m: "auto" | "light" | "dark") => {
    setModeState(m);
    if (m === "auto") localStorage.removeItem("ov-theme");
    else localStorage.setItem("ov-theme", m);
  };
  return { mode, setMode, dark: mode === "dark" || (mode === "auto" && osDark) };
}

// ------------------------------------------------------------------- data

type Env = OvEnvelope<any>;
interface SectionState { env: Env | null; error: string; loading: boolean }

async function fetchSection(section: OvSection, start: string, end: string, internal: boolean, fresh: boolean): Promise<Env> {
  const token = await getToken();
  const qs = new URLSearchParams({ section, start, end });
  if (internal) qs.set("internal", "1");
  if (fresh) qs.set("fresh", "1");
  const res = await fetch(`/api/stu/overview?${qs}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as Env;
}

const istTime = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(11, 19);
const istShort = (ms: number) => {
  const iso = new Date(ms + 330 * 60_000).toISOString();
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
};
const dayLabel = (day: string) => {
  const d = new Date(day + "T00:00:00Z");
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
};

// -------------------------------------------------------------- drill-down

type Drill = (title: string, cell: Cell, env: Env) => void;

function drillPeople(env: Env): DrillPeople {
  const users: DrillPeople["users"] = [];
  for (const [k, v] of Object.entries(env.people)) users[Number(k)] = v;
  return { users, visitors: Object.entries(env.vlinks).map(([id, u]) => ({ id, u })) };
}

/** A number that opens its people. */
function N({ cell, title, env, drill, fmt, className = "" }: { cell: Cell; title: string; env: Env; drill: Drill; fmt?: (n: number) => string; className?: string }) {
  if (cell.na) return <span className={className} style={{ color: "var(--muted)" }} title="Not available here yet">n/a</span>;
  const text = fmt ? fmt(cell.v) : fmtN(cell.v);
  const people = cell.users.length + (cell.visitors?.length ?? 0);
  if (!people) return <span className={className}>{text}</span>;
  return (
    <button type="button" className={`num ${className}`} onClick={() => drill(title, cell, env)} title={`${cell.users.length} people${cell.visitors?.length ? `, ${cell.visitors.length} visitors` : ""}: click for the list`}>
      {text}
    </button>
  );
}

// ------------------------------------------------------------------- page

export default function StuOverview() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const { mode, setMode, dark } = useTheme();
  const t = dark ? THEME.dark : THEME.light;
  const today = todayIst();

  const range = (params.get("range") as RangeKey) || "today";
  const { start, end } = useMemo(() => {
    if (range === "yesterday") return { start: addDays(today, -1), end: addDays(today, -1) };
    if (range === "7d") return { start: addDays(today, -6), end: today };
    if (range === "30d") return { start: addDays(today, -29), end: today };
    if (range === "custom") {
      const e = DAY_RE.test(params.get("end") || "") ? params.get("end")! : today;
      const s = DAY_RE.test(params.get("start") || "") ? params.get("start")! : addDays(e, -6);
      return { start: s <= e ? s : e, end: e };
    }
    return { start: today, end: today };
  }, [range, params, today]);
  const internal = params.get("internal") === "1";

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) (v == null ? next.delete(k) : next.set(k, v));
    setParams(next, { replace: true });
  };
  const setRange = (key: RangeKey) => setParam(key === "custom" ? { range: key, start, end } : { range: key === "today" ? null : key, start: null, end: null });

  const [state, setState] = useState<Record<string, SectionState>>({});
  const [lastLoad, setLastLoad] = useState<number | null>(null);
  const [drill, setDrill] = useState<{ title: string; cell: Cell; env: Env } | null>(null);
  const openDrill: Drill = useCallback((title, cell, env) => setDrill({ title, cell, env }), []);
  const gen = useRef(0);

  const load = useCallback(
    (fresh: boolean) => {
      const g = ++gen.current;
      setState((s) => Object.fromEntries(SECTIONS.map((k) => [k, { env: s[k]?.env ?? null, error: "", loading: true }])));
      // The first call reads the dataset (fresh when asked); the rest share it.
      const first = fetchSection("kpis", start, end, internal, fresh);
      const all = SECTIONS.map((sec) => {
        const p = sec === "kpis" ? first : first.catch(() => null).then(() => fetchSection(sec, start, end, internal, false));
        return p.then(
          (env) => g === gen.current && setState((s) => ({ ...s, [sec]: { env, error: "", loading: false } })),
          (e: any) => g === gen.current && setState((s) => ({ ...s, [sec]: { env: s[sec]?.env ?? null, error: e?.message || "Failed", loading: false } })),
        );
      });
      Promise.allSettled(all).then(() => g === gen.current && setLastLoad(Date.now()));
    },
    [start, end, internal],
  );

  useEffect(() => {
    if (!isAuthorized) return;
    load(false);
    const id = window.setInterval(() => load(false), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [isAuthorized, load]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const anyEnv = SECTIONS.map((k) => state[k]?.env).find(Boolean) ?? null;
  const generated = anyEnv ? Date.parse(anyEnv.generatedAt) : null;
  const loading = SECTIONS.some((k) => state[k]?.loading);
  const host = typeof window !== "undefined" ? window.location.hostname : "";
  const local = host === "localhost" || host === "127.0.0.1";
  const envLabel = anyEnv ? `${local ? "Local, " : ""}${anyEnv.env === "staging" ? "Staging" : anyEnv.env === "production" ? "Production" : "Unknown"}${local ? " data" : ""}` : "";
  const qs = new URLSearchParams({ start, end, ...(internal ? { internal: "1" } : {}) }).toString();
  const S = (k: OvSection) => state[k] ?? { env: null, error: "", loading: true };
  const rangeText = start === end ? dayLabel(start) : `${dayLabel(start)} to ${dayLabel(end)}`;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{CSS}</style>
      <div className="ov min-h-screen" data-theme={dark ? "dark" : "light"}>
        <main className="mx-auto max-w-[100rem] px-3 py-4 sm:px-6 lg:px-8">
          {/* Header: range, environment, last read, refresh */}
          <div className="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Stu · studojo.pro</span>
                {envLabel && (
                  <span className="rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ border: "1px solid var(--border)", color: "var(--ink)" }}>
                    <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: anyEnv?.env === "production" ? STATUS.good : STATUS.warning }} />
                    {envLabel}
                  </span>
                )}
              </div>
              <h1 className="mt-0.5 text-2xl font-semibold">Overview <span className="text-base font-normal" style={{ color: "var(--ink2)" }}>{rangeText}, IST</span></h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <div className="seg" role="group" aria-label="Date range">
                {RANGES.map((r) => <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}>{r.label}</button>)}
              </div>
              {range === "custom" && (
                <span className="flex items-center gap-1">
                  <input type="date" className="ctl" value={start} max={end} onChange={(e) => e.target.value && setParam({ start: e.target.value })} aria-label="Start day" />
                  <span style={{ color: "var(--muted)" }}>to</span>
                  <input type="date" className="ctl" value={end} min={start} max={today} onChange={(e) => e.target.value && setParam({ end: e.target.value })} aria-label="End day" />
                </span>
              )}
              <label className="ctl flex items-center gap-1.5">
                <input type="checkbox" checked={internal} onChange={(e) => setParam({ internal: e.target.checked ? "1" : null })} /> Include internal
              </label>
              <div className="seg" role="group" aria-label="Theme">
                {(["auto", "light", "dark"] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>{m[0].toUpperCase() + m.slice(1)}</button>)}
              </div>
              <button type="button" className="ctl font-semibold" onClick={() => load(true)} disabled={loading}>{loading ? "Reading" : "Refresh"}</button>
              <span className="text-xs" style={{ color: "var(--ink2)" }} title="Data read time; the page re-reads every 60 s">
                {generated ? `Updated ${istTime(generated)} IST` : "Reading"}{lastLoad ? " · auto 60 s" : ""}
              </span>
            </div>
          </div>
          <nav className="mt-2 flex flex-wrap gap-1" aria-label="Stu pages">
            {TABS.map((x) => (
              <NavLink key={x.to} to={x.to === "/" ? `/?${params.toString()}` : `${x.to}?${qs}`} end className="rounded-lg px-2.5 py-1 text-[13px] font-semibold" style={({ isActive }) => (isActive ? { background: "var(--ink)", color: "var(--surface)" } : { color: "var(--ink2)" })}>
                {x.label}
              </NavLink>
            ))}
          </nav>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            {internal ? "Internal accounts included." : "Excluded: staff (admin, ops), @studojo.com, the test accounts, guests."} People counts are the people who joined Stu in the range unless a card says otherwise. Every number opens the people behind it.
          </p>

          <Insights s={S("insights")} drill={openDrill} />

          <Alerts s={S("alerts")} drill={openDrill} />

          <VendorsTile />

          <div id="kpis"><Kpis s={S("kpis")} t={t} drill={openDrill} range={range} /></div>

          <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-12 [&>*]:min-w-0">
            <div id="engagement" className="lg:col-span-7"><Usage s={S("usage")} drill={openDrill} t={t} /></div>
            <div id="power" className="lg:col-span-5"><Power s={S("power")} drill={openDrill} t={t} qs={qs} /></div>
            <div id="funnel" className="lg:col-span-7"><Funnel s={S("funnel")} drill={openDrill} t={t} /></div>
            <div id="trends" className="lg:col-span-5"><Trends s={S("trends")} drill={openDrill} t={t} /></div>
            <div id="sources" className="lg:col-span-6"><Sources s={S("sources")} drill={openDrill} t={t} /></div>
            <div id="calls" className="lg:col-span-6"><Calls s={S("calls")} drill={openDrill} t={t} /></div>
            <div id="dropoffs" className="lg:col-span-6"><Dropoffs s={S("dropoffs")} drill={openDrill} t={t} qs={qs} /></div>
            <div id="retention" className="lg:col-span-6"><Engagement s={S("engagement")} drill={openDrill} t={t} /></div>
            <div id="feed" className="lg:col-span-12"><Feed s={S("feed")} qs={qs} /></div>
          </div>
        </main>
      </div>
      {drill && <DrillModal title={drill.title} cell={drill.cell} data={drillPeople(drill.env)} onClose={() => setDrill(null)} />}
    </div>
  );
}

// ------------------------------------------------------------- card frame

function Card({ title, sub, s, right, children, minH = 160 }: { title: string; sub?: string; s: SectionState; right?: React.ReactNode; children: (env: Env) => React.ReactNode; minH?: number }) {
  return (
    <section className="card h-full p-4" aria-busy={s.loading}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">{title}</h2>
          {sub && <p className="text-xs" style={{ color: "var(--muted)" }}>{sub}</p>}
        </div>
        {right}
      </div>
      {s.error && <div className="mb-2 text-xs" style={{ color: "var(--down)" }}>Could not read: {s.error}</div>}
      {s.env ? (
        <div className="fade" style={{ opacity: s.loading ? 0.55 : 1 }}>{children(s.env)}</div>
      ) : (
        !s.error && <div className="animate-pulse rounded-lg" style={{ minHeight: minH, background: "var(--track)" }} />
      )}
    </section>
  );
}

function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>)}
    </div>
  );
}

// ------------------------------------------------------------------ alerts

function Alerts({ s, drill }: { s: SectionState; drill: Drill }) {
  const list = (s.env?.body as Alert[] | undefined) ?? null;
  if (!list) return <div className="mt-3 h-9" />;
  if (!list.length) {
    return (
      <div className="card mt-3 flex items-center gap-2 px-4 py-2 text-sm" style={{ color: "var(--ink2)" }}>
        <span aria-hidden style={{ color: STATUS.good }}>✓</span> No alerts: self-check within 2%, calls failing under 20%, every step that fired yesterday has fired today.
      </div>
    );
  }
  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {list.map((a) => (
        <div key={a.key} className="card flex flex-wrap items-center gap-2 px-4 py-2 text-sm" style={{ borderLeft: `4px solid ${a.level === "critical" ? STATUS.critical : STATUS.warning}` }}>
          <span aria-hidden className="font-bold" style={{ color: a.level === "critical" ? STATUS.critical : STATUS.serious }}>{a.level === "critical" ? "▲" : "●"}</span>
          <span className="font-semibold">{a.level === "critical" ? "Critical" : "Check"}</span>
          <span className="min-w-0 flex-1">{a.text}</span>
          {a.cell && a.cell.users.length > 0 && <button type="button" className="num text-xs" onClick={() => drill(a.text, a.cell!, s.env!)}>People</button>}
          {a.href && <Link to={a.href} className="text-xs font-semibold underline" style={{ color: "var(--s1)" }}>Open</Link>}
        </div>
      ))}
    </div>
  );
}

// -------------------------------------------------------------------- KPIs

function Spark({ pts, t, label }: { pts: KpiTile["spark"]; t: Theme; label: string }) {
  const W = 120, H = 30, P = 4;
  const max = Math.max(1, ...pts.map((p) => p.v));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, pts.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  const path = (sel: number[]) => sel.map((i, k) => `${k ? "L" : "M"}${x(i).toFixed(1)},${y(pts[i].v).toFixed(1)}`).join("");
  const all = pts.map((_, i) => i);
  const inR = all.filter((i) => pts[i].inRange);
  const last = pts.length - 1;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="mt-2 block h-[30px]" role="img" aria-label={`${label}, last 14 days`}>
      <path d={path(all)} fill="none" stroke={t.axis} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {inR.length > 1 && <path d={path(inR)} fill="none" stroke={t.series[0]} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
      {pts.map((p, i) => (
        <rect key={p.day} x={x(i) - (W - 2 * P) / (2 * Math.max(1, last))} y={0} width={(W - 2 * P) / Math.max(1, last)} height={H} fill="transparent">
          <title>{`${dayLabel(p.day)}: ${fmtN(p.v)}`}</title>
        </rect>
      ))}
    </svg>
  );
}

function Delta({ cur, prev, inr, range, days }: { cur: number; prev: number | null; inr?: boolean; range: RangeKey; days: number }) {
  if (prev == null) return <span style={{ color: "var(--muted)" }}>no earlier data</span>;
  const diff = cur - prev;
  const vs = range === "today" ? "vs yesterday" : range === "yesterday" ? "vs day before" : `vs prev ${days} days`;
  if (diff === 0) return <span style={{ color: "var(--muted)" }}>no change {vs}</span>;
  const up = diff > 0;
  const p = prev > 0 ? `${Math.abs(Math.round((diff / prev) * 100))}%` : inr ? fmtInr(Math.abs(diff)) : fmtN(Math.abs(diff));
  return (
    <span style={{ color: up ? "var(--up)" : "var(--down)" }}>
      <span aria-hidden>{up ? "▲" : "▼"}</span> {up ? "+" : "-"}{p} <span style={{ color: "var(--muted)" }}>{vs}</span>
    </span>
  );
}

const daysIn = (b: { prevStart: string; prevEnd: string }) => Math.round((Date.parse(b.prevEnd) - Date.parse(b.prevStart)) / 86_400_000) + 1;

function Kpis({ s, t, drill, range }: { s: SectionState; t: Theme; drill: Drill; range: RangeKey }) {
  const body = s.env?.body as { tiles: KpiTile[]; testPayments: Cell; prevStart: string; prevEnd: string } | undefined;
  return (
    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5 xl:grid-cols-9" aria-busy={s.loading}>
      {s.error && !body && <div className="col-span-full text-xs" style={{ color: "var(--down)" }}>Could not read the tiles: {s.error}</div>}
      {(body?.tiles ?? Array.from({ length: 9 }, () => null)).map((tile, k) =>
        tile ? (
          <div key={tile.key} className="card fade min-w-0 px-3 pb-2 pt-2.5" style={{ opacity: s.loading ? 0.55 : 1 }} title={`source: ${tile.source}`}>
            <div className="truncate text-xs font-medium" style={{ color: "var(--ink2)" }}>{tile.label}</div>
            <div className="mt-0.5 text-[26px] font-semibold leading-tight">
              <N cell={tile.cell} env={s.env!} drill={drill} title={tile.label} fmt={tile.inr ? fmtInr : undefined} />
            </div>
            <div className="truncate text-[11px]"><Delta cur={tile.cell.v} prev={tile.prev} inr={tile.inr} range={range} days={tile.spark.length && body ? daysIn(body) : 1} /></div>
            <Spark pts={tile.spark} t={t} label={tile.label} />
            <div className="mt-0.5 truncate text-[10px]" style={{ color: "var(--muted)" }}>
              {tile.key === "revenue" && body!.testPayments.v > 0 ? (
                <>Excludes <N cell={body!.testPayments} env={s.env!} drill={drill} title="Test payments" /> test payment{body!.testPayments.v === 1 ? "" : "s"}</>
              ) : tile.key === "revenue" ? "No test payments in range" : tile.sub ?? "14 days, range in blue"}
            </div>
          </div>
        ) : (
          <div key={k} className="card h-[124px] animate-pulse" />
        ),
      )}
    </div>
  );
}

// ------------------------------------------------------------------ funnel

function Funnel({ s, drill, t }: { s: SectionState; drill: Drill; t: Theme }) {
  const [view, setView] = useState<"key" | "all">("key");
  const body = s.env?.body as { key: FunnelBar[]; all: FunnelBar[]; dropKey: string | null; dropAll: string | null; cohort: number } | undefined;
  return (
    <Card
      title="Funnel, visitor to paid"
      sub="Bars: count; then % of the bar above and the median time from it. Nested: each step counts people who passed the gate steps before it."
      s={s}
      minH={320}
      right={<Seg label="Funnel steps" value={view} onChange={setView} options={[{ v: "key", l: "Key steps" }, { v: "all", l: "All steps" }]} />}
    >
      {(env) => {
        const bars = view === "key" ? body!.key : body!.all;
        const drop = view === "key" ? body!.dropKey : body!.dropAll;
        const max = Math.max(1, ...bars.map((b) => (b.cell.na ? 0 : b.cell.v)));
        const dropBar = bars.find((x) => x.key === drop);
        const dropFrom = dropBar && bars.find((x) => x.key === dropBar.fromKey);
        return (
          <div>
            {dropBar && dropFrom && (
              <p className="mb-2 text-[13px]">
                <span aria-hidden className="mr-1" style={{ color: "var(--down)" }}>▼</span>
                <span className="font-semibold">Biggest drop:</span> {dropFrom.label} to {dropBar.label}, {fmtPct(dropBar.pctPrev)} make it ({fmtN(dropBar.cell.v)} of {fmtN(dropFrom.cell.v)}).
              </p>
            )}
            <div className="grid grid-cols-[minmax(76px,150px)_minmax(0,1fr)_auto] items-center gap-x-2 gap-y-[3px] text-[13px] sm:gap-x-3">
              {bars.map((b, k) => {
                const isDrop = b.key === drop;
                const w = b.cell.na ? 0 : (b.cell.v / max) * 100;
                const phaseStart = k > 0 && bars[k - 1].phase !== b.phase;
                return (
                  <div key={b.key} className="contents">
                    <div className={`truncate ${phaseStart ? "pt-1.5" : ""}`} style={{ color: "var(--ink2)" }} title={`${b.n}. ${b.label}${b.gate ? " (gate)" : ""}`}>
                      {b.label}
                    </div>
                    <div className={`relative h-[22px] ${phaseStart ? "mt-1.5" : ""}`} title={b.untracked ? `${b.label}: the journey log has no events for this step yet` : `${b.label}: ${b.cell.na ? "n/a" : fmtN(b.cell.v)}${b.pctPrev != null ? `, ${b.pctPrev}% of the bar above` : ""}`}>
                      {b.untracked ? <div className="flex h-full items-center whitespace-nowrap text-xs" style={{ color: "var(--muted)" }}>not tracked yet</div> : <div className="flex h-full items-center">
                        <div style={{ width: `${w * 0.8}%`, minWidth: b.cell.v > 0 ? 3 : 0, height: 18, background: b.anon ? t.ordinal[0] : t.series[0], borderRadius: "0 4px 4px 0" }} />
                        <span className="ml-1.5 whitespace-nowrap font-semibold">
                          <N cell={b.cell} env={env} drill={drill} title={`${b.n}. ${b.label}, ${b.anon ? "visitor ids in range" : "joined in range"}`} />
                        </span>
                      </div>}
                    </div>
                    <div className={`tnum whitespace-nowrap text-right text-xs ${phaseStart ? "pt-1.5" : ""}`} style={{ color: isDrop ? "var(--down)" : "var(--ink2)" }}>
                      {b.untracked ? <span style={{ color: "var(--muted)" }}>·</span> : !b.fromKey ? <span style={{ color: "var(--muted)" }}>start</span> : (
                        <>
                          {isDrop && <span aria-label="biggest drop" className="mr-1 font-semibold">▼</span>}
                          <span className={isDrop ? "font-semibold" : ""}>{fmtPct(b.pctPrev)}</span>
                          <span className="ml-2" style={{ color: "var(--muted)" }}>{b.medianMs != null ? fmtDur(b.medianMs) : "·"}</span>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--muted)" }}>
              <span><span className="mr-1 inline-block h-2.5 w-3 rounded-sm align-middle" style={{ background: t.ordinal[0] }} />Visitor ids before sign-in</span>
              <span><span className="mr-1 inline-block h-2.5 w-3 rounded-sm align-middle" style={{ background: t.series[0] }} />People who joined in range ({fmtN(body!.cohort)})</span>
              <span>Right column: % of the tracked bar above, median time from it</span>
            </div>
          </div>
        );
      }}
    </Card>
  );
}

// ------------------------------------------------------------------ trends

const crosshair = {
  id: "ovCrosshair",
  afterDatasetsDraw(chart: any) {
    const active = chart.tooltip?.getActiveElements?.() ?? [];
    if (!active.length) return;
    const x = active[0].element.x;
    const { top, bottom } = chart.chartArea;
    const ctx = chart.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.lineWidth = 1;
    ctx.strokeStyle = chart.options.plugins?.ovCrosshair?.color ?? "#c3c2b7";
    ctx.stroke();
    ctx.restore();
  },
};

interface TrendsBody { days: string[]; series: { key: string; label: string; na: boolean; cells: Cell[] }[]; rates: { key: string; label: string; values: (number | null)[] }[] }

function Trends({ s, drill, t }: { s: SectionState; drill: Drill; t: Theme }) {
  const [view, setView] = useState<"counts" | "rates" | "table">("counts");
  const body = s.env?.body as TrendsBody | undefined;
  return (
    <Card
      title="Last 30 days"
      sub={view === "rates" ? "Conversion, trailing 7 days, %" : "People a day (visitors: visitor ids). Click a point for its people."}
      s={s}
      minH={300}
      right={<Seg label="Trend view" value={view} onChange={setView} options={[{ v: "counts", l: "Counts" }, { v: "rates", l: "Conversion" }, { v: "table", l: "Table" }]} />}
    >
      {(env) => {
        const b = body!;
        const labels = b.days.map(dayLabel);
        const lines = view === "rates" ? b.rates.map((r) => ({ label: r.label, data: r.values })) : b.series.map((x) => ({ label: x.label, data: x.cells.map((c) => (c.na ? null : c.v)) }));
        if (view === "table") {
          return (
            <div className="max-h-[300px] overflow-auto text-xs">
              <table className="tnum w-full">
                <thead className="sticky top-0" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                  <tr><th className="py-1 text-left font-medium">Day</th>{b.series.map((x) => <th key={x.key} className="py-1 text-right font-medium">{x.label}</th>)}{b.rates.map((r) => <th key={r.key} className="py-1 text-right font-medium">{r.label}</th>)}</tr>
                </thead>
                <tbody>
                  {b.days.map((day, k) => ({ day, k })).reverse().map(({ day, k }) => (
                    <tr key={day} style={{ borderTop: "1px solid var(--grid)" }}>
                      <td className="py-1">{dayLabel(day)}</td>
                      {b.series.map((x) => <td key={x.key} className="py-1 text-right"><N cell={x.cells[k]} env={env} drill={drill} title={`${x.label}, ${day}`} /></td>)}
                      {b.rates.map((r) => <td key={r.key} className="py-1 text-right" style={{ color: "var(--ink2)" }}>{fmtPct(r.values[k])}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        const data = {
          labels,
          datasets: lines.map((l, i) => ({
            label: l.label, data: l.data, borderColor: t.series[i], backgroundColor: t.series[i], borderWidth: 2, pointRadius: 0,
            pointHoverRadius: 4, pointHoverBorderWidth: 2, pointHoverBorderColor: t.surface, tension: 0, spanGaps: true,
          })),
        };
        const options: any = {
          responsive: true, maintainAspectRatio: false, animation: false,
          interaction: { mode: "index", intersect: false },
          plugins: {
            legend: { display: false },
            ovCrosshair: { color: t.axis },
            tooltip: {
              backgroundColor: t.surface, borderColor: t.axis, borderWidth: 1, titleColor: t.ink2, bodyColor: t.ink, padding: 8,
              boxWidth: 10, boxHeight: 2, usePointStyle: false,
              callbacks: { label: (c: any) => ` ${c.parsed.y == null ? "n/a" : view === "rates" ? `${c.parsed.y}%` : fmtN(c.parsed.y)}  ${c.dataset.label}` },
            },
          },
          scales: {
            x: { grid: { display: false }, border: { color: t.axis }, ticks: { color: t.muted, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 } } },
            y: { beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5, font: { size: 11 }, callback: (v: any) => (view === "rates" ? `${v}%` : fmtN(Number(v))) } },
          },
          onClick: (evt: any, _els: any, chart: any) => {
            if (view !== "counts") return;
            const hit = chart.getElementsAtEventForMode(evt, "nearest", { intersect: false }, true)[0];
            if (!hit) return;
            const series = b.series[hit.datasetIndex];
            const cell = series?.cells[hit.index];
            if (cell && (cell.users.length || cell.visitors?.length)) drill(`${series.label}, ${b.days[hit.index]}`, cell, env);
          },
        };
        return (
          <div>
            <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--ink2)" }}>
              {lines.map((l, i) => {
                const total = view === "rates" ? null : b.series[i].cells.reduce((a, c) => a + c.v, 0);
                return (
                  <span key={l.label} className="flex items-center gap-1.5">
                    <span className="inline-block h-[2px] w-4 rounded" style={{ background: t.series[i] }} />
                    {l.label}{total != null ? <span style={{ color: "var(--muted)" }}>{fmtN(total)}</span> : null}
                  </span>
                );
              })}
            </div>
            <div className="h-[260px]"><Line data={data} options={options} plugins={[crosshair]} /></div>
          </div>
        );
      }}
    </Card>
  );
}

// ----------------------------------------------------------------- sources

function Sources({ s, drill, t }: { s: SectionState; drill: Drill; t: Theme }) {
  const [by, setBy] = useState<"source" | "campaign">("source");
  const body = s.env?.body as Record<"source" | "campaign", { rows: SourceRow[]; total: number }> | undefined;
  return (
    <Card
      title="Where sign-ups and payers come from"
      sub="First touch of people who joined in range. Top 8, the rest as Other."
      s={s}
      right={<Seg label="Split by" value={by} onChange={setBy} options={[{ v: "source", l: "utm_source" }, { v: "campaign", l: "Campaign" }]} />}
    >
      {(env) => {
        const { rows } = body![by];
        if (!rows.length) return <p className="text-sm" style={{ color: "var(--muted)" }}>Nobody joined in this range.</p>;
        const max = Math.max(1, ...rows.map((r) => r.signups.v));
        return (
          <div>
            <div className="mb-2 flex gap-4 text-xs" style={{ color: "var(--ink2)" }}>
              <span><span className="mr-1 inline-block h-2.5 w-3 rounded-sm align-middle" style={{ background: t.series[0] }} />Sign-ups</span>
              <span><span className="mr-1 inline-block h-2.5 w-3 rounded-sm align-middle" style={{ background: t.series[1] }} />Paid</span>
            </div>
            <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-[13px]">
              <thead className="text-left text-[11px]" style={{ color: "var(--muted)" }}>
                <tr><th className="pb-1 font-medium">{by === "source" ? "Source / medium" : "Campaign"}</th><th className="w-[38%] pb-1 font-medium" /><th className="pb-1 text-right font-medium">Onboarded</th><th className="pb-1 text-right font-medium">Paid %</th><th className="pb-1 text-right font-medium">Revenue</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.key} className="row-hover" style={{ borderTop: "1px solid var(--grid)" }}>
                    <td className="max-w-[150px] truncate py-1.5 pr-2" title={r.key}>{r.key}{r.other ? <span style={{ color: "var(--muted)" }}> ({r.other})</span> : null}</td>
                    <td className="py-1.5">
                      <div className="flex items-center gap-1.5"><div style={{ width: `${(r.signups.v / max) * 80}%`, minWidth: 3, height: 9, background: t.series[0], borderRadius: "0 3px 3px 0" }} /><N cell={r.signups} env={env} drill={drill} title={`Sign-ups from ${r.key}`} className="tnum text-xs font-semibold" /></div>
                      <div className="mt-[2px] flex items-center gap-1.5"><div style={{ width: `${(r.paid.v / max) * 80}%`, minWidth: r.paid.v ? 3 : 0, height: 9, background: t.series[1], borderRadius: "0 3px 3px 0" }} /><N cell={r.paid} env={env} drill={drill} title={`Paid from ${r.key}`} className="tnum text-xs" /></div>
                    </td>
                    <td className="tnum py-1.5 text-right"><N cell={r.onboarded} env={env} drill={drill} title={`Onboarded from ${r.key}`} /></td>
                    <td className="tnum py-1.5 text-right" style={{ color: "var(--ink2)" }}>{fmtPct(r.signups.v ? Math.round((r.paid.v / r.signups.v) * 1000) / 10 : null)}</td>
                    <td className="tnum py-1.5 text-right"><N cell={r.revenue} env={env} drill={drill} title={`Revenue from ${r.key}`} fmt={fmtInr} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        );
      }}
    </Card>
  );
}

// -------------------------------------------------------------- call health

const OUTCOME_STYLE: Record<string, { color: string; icon: string }> = {
  completed: { color: STATUS.good, icon: "✓" },
  failed: { color: STATUS.critical, icon: "✕" },
  dropped: { color: STATUS.serious, icon: "▼" },
  hung_up_first_minute: { color: STATUS.warning, icon: "!" },
};

interface Rate { label: string; value: number | null; num: Cell; den: Cell }
interface CallsBody {
  total: Cell; started: Cell; outcomes: { key: string; label: string; cell: Cell }[];
  reasons: { key: string; label: string; cell: Cell; of: Cell }[];
  micDenied: Rate; failCalls: Rate; failPeople: Rate; medianSeconds: number | null;
}

function StackBar({ segs, onPick }: { segs: { key: string; label: string; v: number; color: string; cell: Cell }[]; onPick: (k: string) => void }) {
  const total = segs.reduce((a, x) => a + x.v, 0);
  if (!total) return <div className="h-[18px] rounded" style={{ background: "var(--track)" }} />;
  return (
    <div className="flex h-[18px] w-full gap-[2px] overflow-hidden rounded">
      {segs.filter((x) => x.v > 0).map((x) => (
        <button key={x.key} type="button" onClick={() => onPick(x.key)} title={`${x.label}: ${fmtN(x.v)} (${Math.round((x.v / total) * 100)}%)`} aria-label={`${x.label}: ${x.v}`}
          className="h-full hover:opacity-80 focus-visible:opacity-80" style={{ flexGrow: x.v, flexBasis: 0, minWidth: 3, background: x.color }} />
      ))}
    </div>
  );
}

function Calls({ s, drill, t }: { s: SectionState; drill: Drill; t: Theme }) {
  const body = s.env?.body as CallsBody | undefined;
  return (
    <Card title="Call health" sub="Onboarding calls by people who joined in range (as Drop-offs and Ratios count them)." s={s}>
      {(env) => {
        const b = body!;
        const oc = (k: string) => b.outcomes.find((o) => o.key === k)?.cell ?? { v: 0, users: [] };
        const segs = b.outcomes.map((o) => ({ key: o.key, label: o.label, v: o.cell.v, cell: o.cell, color: OUTCOME_STYLE[o.key]?.color ?? t.neutral }));
        const tried = Math.max(1, ...b.reasons.map((r) => r.of.v));
        const fig = (label: string, node: React.ReactNode, note?: string) => (
          <div className="min-w-0">
            <div className="truncate text-[11px]" style={{ color: "var(--ink2)" }}>{label}</div>
            <div className="text-xl font-semibold">{node}</div>
            {note && <div className="truncate text-[10px]" style={{ color: "var(--muted)" }}>{note}</div>}
          </div>
        );
        return (
          <div>
            <div className="grid grid-cols-4 gap-2">
              {fig("Started", <N cell={b.started} env={env} drill={drill} title="Calls started" />, `of ${fmtN(b.total.v)} calls`)}
              {fig("Completed", <N cell={oc("completed")} env={env} drill={drill} title="Calls completed" />, fmtPct(b.started.v ? Math.round((oc("completed").v / b.started.v) * 1000) / 10 : null) + " of started")}
              {fig("Failed", <N cell={oc("failed")} env={env} drill={drill} title="Calls failed" />, `${fmtPct(b.failCalls.value)} of calls`)}
              {fig("Dropped", <N cell={oc("dropped")} env={env} drill={drill} title="Calls dropped" />, "connection went")}
            </div>
            <div className="mt-3"><StackBar segs={segs} onPick={(k) => { const o = b.outcomes.find((x) => x.key === k); if (o) drill(`Calls: ${o.label}`, o.cell, env); }} /></div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--ink2)" }}>
              {segs.map((x) => (
                <span key={x.key} className="flex items-center gap-1">
                  <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: x.color }} />
                  {OUTCOME_STYLE[x.key] && <span aria-hidden>{OUTCOME_STYLE[x.key].icon}</span>}{x.label} <span style={{ color: "var(--muted)" }}>{fmtN(x.v)}</span>
                </span>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2" style={{ borderTop: "1px solid var(--grid)", paddingTop: 10 }}>
              {fig("Mic denied (people)", b.micDenied.value == null ? <span style={{ color: "var(--muted)" }}>n/a</span> : <N cell={b.micDenied.num} env={env} drill={drill} title="Mic denied" fmt={() => fmtPct(b.micDenied.value)} />, `${fmtN(b.micDenied.num.v)} of ${fmtN(b.micDenied.den.v)} who tried`)}
              {fig("Failure rate (people)", <N cell={b.failPeople.num} env={env} drill={drill} title="People with a failed call" fmt={() => fmtPct(b.failPeople.value)} />, `${fmtN(b.failPeople.num.v)} of ${fmtN(b.failPeople.den.v)}`)}
              {fig("Median call length", <span>{b.medianSeconds != null ? fmtDur(b.medianSeconds * 1000) : "n/a"}</span>, "started calls")}
            </div>
            <div className="mt-3 text-[11px] font-semibold" style={{ color: "var(--ink2)" }}>Why calls did not finish (people)</div>
            {b.reasons.length ? (
              <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(60px,35%)_auto] items-center gap-x-2 gap-y-1 text-xs">
                {b.reasons.slice(0, 7).map((r) => (
                  <div key={r.key} className="contents">
                    <span className="truncate" title={r.label}>{r.label}</span>
                    <div className="h-[8px] rounded-r" style={{ width: `${(r.cell.v / tried) * 100}%`, minWidth: r.cell.v ? 3 : 0, background: t.series[0] }} />
                    <span className="tnum text-right"><N cell={r.cell} env={env} drill={drill} title={r.label} /> <span style={{ color: "var(--muted)" }}>{fmtPct(r.of.v ? Math.round((r.cell.v / r.of.v) * 1000) / 10 : null)}</span></span>
                  </div>
                ))}
              </div>
            ) : <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>No failed, dropped or short calls.</p>}
          </div>
        );
      }}
    </Card>
  );
}

// ---------------------------------------------------------------- drop-offs

const PHASES = ["Sign up", "Call", "Use", "Outreach", "Pay"];

function Dropoffs({ s, drill, t, qs }: { s: SectionState; drill: Drill; t: Theme; qs: string }) {
  const body = s.env?.body as { stuck: { key: string; n: string; label: string; phase: string; cell: Cell }[]; total: number; reasons: { key: string; label: string; cell: Cell; of: Cell }[] } | undefined;
  return (
    <Card title="Where people stop" sub="Furthest step reached by people who joined in range. Click a step for those people in Journeys." s={s}>
      {(env) => {
        const b = body!;
        const color = (phase: string) => t.ordinal[Math.max(0, PHASES.indexOf(phase))];
        const segs = b.stuck.filter((x) => x.cell.v > 0);
        const top = segs.reduce((m, x) => (x.cell.v > (m?.cell.v ?? -1) ? x : m), null as (typeof segs)[number] | null);
        return (
          <div>
            {top && <p className="mb-2 text-sm">Most stop at <span className="font-semibold">{top.label}</span>: {fmtN(top.cell.v)} of {fmtN(b.total)} ({Math.round((top.cell.v / Math.max(1, b.total)) * 100)}%).</p>}
            <div className="flex h-[22px] w-full gap-[2px] overflow-hidden rounded">
              {segs.map((x) => (
                <Link key={x.key} to={`/journeys?${qs}&cohort=1&stuck=${x.key}`} title={`${x.n}. ${x.label}: ${x.cell.v} (${Math.round((x.cell.v / Math.max(1, b.total)) * 100)}%)`}
                  className="h-full hover:opacity-80" style={{ flexGrow: x.cell.v, flexBasis: 0, minWidth: 3, background: color(x.phase) }} aria-label={`${x.label}: ${x.cell.v}`} />
              ))}
              {!segs.length && <div className="h-full w-full" style={{ background: "var(--track)" }} />}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px]" style={{ color: "var(--ink2)" }}>
              {PHASES.map((p) => <span key={p} className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color(p) }} />{p}</span>)}
            </div>
            <div className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2">
              {segs.map((x) => (
                <div key={x.key} className="row-hover flex items-center justify-between gap-2 rounded px-1 py-[3px] text-xs" style={{ borderTop: "1px solid var(--grid)" }}>
                  <Link to={`/journeys?${qs}&cohort=1&stuck=${x.key}`} className="truncate hover:underline" title="Open these people in Journeys">
                    <span className="mr-1 inline-block h-2 w-2 rounded-sm" style={{ background: color(x.phase) }} />{x.n}. {x.label}
                  </Link>
                  <span className="tnum whitespace-nowrap"><N cell={x.cell} env={env} drill={drill} title={`Stopped at ${x.label}`} /> <span style={{ color: "var(--muted)" }}>{Math.round((x.cell.v / Math.max(1, b.total)) * 100)}%</span></span>
                </div>
              ))}
            </div>
            <div className="mt-3 text-[11px] font-semibold" style={{ color: "var(--ink2)" }}>Gaps worth a look</div>
            <div className="mt-1 grid gap-y-1 text-xs">
              {b.reasons.map((r) => (
                <div key={r.key} className="flex items-center justify-between gap-2">
                  <span className="truncate">{r.label}</span>
                  <span className="tnum whitespace-nowrap"><N cell={r.cell} env={env} drill={drill} title={r.label} /> <span style={{ color: "var(--muted)" }}>of {fmtN(r.of.v)}</span></span>
                </div>
              ))}
            </div>
          </div>
        );
      }}
    </Card>
  );
}

// --------------------------------------------------------------- engagement

interface EngBody {
  headline: { n: number; back: Cell; eligible: Cell; value: number | null }[];
  heat: { day: string; size: Cell; d: { n: number; back: Cell; eligible: number; value: number | null }[] }[];
  active: Cell; chats: Cell; chatters: Cell; jobOpens: Cell; applies: Cell; saved: Cell;
  perActive: { chats: number | null; jobs: number | null; applies: number | null };
}

function Engagement({ s, drill, t }: { s: SectionState; drill: Drill; t: Theme }) {
  const body = s.env?.body as EngBody | undefined;
  return (
    <Card title="Retention" sub="Return to the desk on day N after the IST day they joined (as the Retention page counts it); people whose day N has not come yet are left out." s={s}>
      {(env) => {
        const b = body!;
        const shade = (v: number | null) => {
          if (v == null) return null;
          const k = Math.min(t.seq.length - 1, Math.round((v / 100) * (t.seq.length - 1)));
          return { bg: v === 0 ? t.track : t.seq[k], fg: v === 0 ? t.muted : (t === THEME.dark ? k <= 7 : k >= 6) ? "#ffffff" : "#0b0b0b" };
        };
        const stat = (label: string, node: React.ReactNode, note: string) => (
          <div className="min-w-0">
            <div className="truncate text-[11px]" style={{ color: "var(--ink2)" }}>{label}</div>
            <div className="text-xl font-semibold">{node}</div>
            <div className="truncate text-[10px]" style={{ color: "var(--muted)" }}>{note}</div>
          </div>
        );
        return (
          <div>
            <div className="grid grid-cols-3 gap-2">
              {b.headline.map((h) => stat(`D${h.n} return`, h.value == null ? <span style={{ color: "var(--muted)" }}>n/a</span> : <N cell={h.back} env={env} drill={drill} title={`Back on day ${h.n}`} fmt={() => fmtPct(h.value)} />, `${fmtN(h.back.v)} of ${fmtN(h.eligible.v)}`))}
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2" style={{ borderTop: "1px solid var(--grid)", paddingTop: 10 }}>
              {stat("Active students", <N cell={b.active} env={env} drill={drill} title="Active in range" />, "any activity in range")}
              {stat("Chats per active", <span>{b.perActive.chats ?? "n/a"}</span>, `${fmtN(b.chats.v)} messages, ${fmtN(b.chatters.v)} chatted`)}
              {stat("Jobs opened per active", <span>{b.perActive.jobs ?? "n/a"}</span>, `${fmtN(b.jobOpens.v)} opens`)}
              {stat("Apply clicks per active", <span>{b.perActive.applies ?? "n/a"}</span>, `${fmtN(b.applies.v)} clicks, ${fmtN(b.saved.v)} saved`)}
            </div>
            <div className="mt-3 text-[11px] font-semibold" style={{ color: "var(--ink2)" }}>Cohorts by sign-up day, % back on day N</div>
            {b.heat.length ? (
              <div className="mt-1 overflow-x-auto">
                <table className="tnum w-full border-separate text-[11px]" style={{ borderSpacing: 2 }}>
                  <thead style={{ color: "var(--muted)" }}>
                    <tr><th className="text-left font-medium">Joined</th><th className="text-right font-medium">People</th>{HEAT_DAYS.map((n) => <th key={n} className="font-medium">D{n}</th>)}</tr>
                  </thead>
                  <tbody>
                    {b.heat.map((r) => (
                      <tr key={r.day}>
                        <td className="whitespace-nowrap pr-2">{dayLabel(r.day)}</td>
                        <td className="pr-2 text-right"><N cell={r.size} env={env} drill={drill} title={`Joined ${r.day}`} /></td>
                        {r.d.map((c) => {
                          const sh = shade(c.value);
                          return (
                            <td key={c.n} className="h-[22px] min-w-[38px] rounded text-center" style={{ background: sh?.bg ?? "transparent", color: sh?.fg ?? t.muted }} title={c.value == null ? `D${c.n}: not yet` : `D${c.n}: ${c.back.v} of ${c.eligible} (${c.value}%)`}>
                              {c.value == null ? "" : c.back.v > 0 ? <button type="button" className="h-full w-full" onClick={() => drill(`Joined ${r.day}, back on day ${c.n}`, c.back, env)}>{c.value}%</button> : `${c.value}%`}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>Nobody joined in this range.</p>}
          </div>
        );
      }}
    </Card>
  );
}

// -------------------------------------------------------------------- feed

function Feed({ s, qs }: { s: SectionState; qs: string }) {
  const rows = s.env?.body as FeedRow[] | undefined;
  return (
    <Card title="Live feed" sub="The last 20 journey events, newest first (all days). Click a person for their journey." s={s} minH={200}>
      {(env) => (
        rows!.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead className="text-left text-[11px]" style={{ color: "var(--muted)" }}>
                <tr><th className="pb-1 font-medium">Time (IST)</th><th className="pb-1 font-medium">Step</th><th className="pb-1 font-medium">Who</th><th className="hidden pb-1 font-medium sm:table-cell">Source</th></tr>
              </thead>
              <tbody>
                {rows!.map((r) => {
                  const person = r.u >= 0 ? env.people[r.u] : null;
                  return (
                    <tr key={r.id} className="row-hover" style={{ borderTop: "1px solid var(--grid)" }}>
                      <td className="tnum whitespace-nowrap py-1 pr-3" style={{ color: "var(--ink2)" }}>{istShort(r.at)}</td>
                      <td className="py-1 pr-3" title={r.step}>{r.label}</td>
                      <td className="max-w-[220px] truncate py-1 pr-3">
                        {person ? <Link to={`/journeys?${qs}&u=${encodeURIComponent(person.id)}`} className="hover:underline" style={{ color: "var(--s1)" }}>{r.who}</Link> : <span style={{ color: "var(--muted)" }}>{r.who}</span>}
                        {person?.internal && <span className="ml-1 text-[10px]" style={{ color: "var(--muted)" }}>internal</span>}
                      </td>
                      <td className="hidden max-w-[260px] truncate py-1 sm:table-cell" style={{ color: "var(--ink2)" }}>{r.source.startsWith("channel: ") ? channelLabel(r.source.slice(9)) : r.source}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <p className="text-sm" style={{ color: "var(--muted)" }}>No journey events yet.</p>
      )}
    </Card>
  );
}

// ----------------------------------------------------------------- insights

function Insights({ s, drill }: { s: SectionState; drill: Drill }) {
  const list = (s.env?.body as Insight[] | undefined) ?? null;
  return (
    <section className="card mt-3 px-4 py-3" aria-busy={s.loading}>
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <h2 className="text-[15px] font-semibold">What is going on</h2>
        <span className="text-[11px]" style={{ color: "var(--muted)" }}>By rules, most important first</span>
      </div>
      {s.error && !list && <div className="text-xs" style={{ color: "var(--down)" }}>Could not read: {s.error}</div>}
      {!list && !s.error && <div className="h-[72px] animate-pulse rounded-lg" style={{ background: "var(--track)" }} />}
      {list && (
        <ol className="fade grid gap-x-8 gap-y-1.5 text-[13.5px] leading-snug xl:grid-cols-2" style={{ opacity: s.loading ? 0.55 : 1 }}>
          {list.map((x, k) => (
            <li key={x.key} className="flex items-start gap-2">
              <span className="tnum mt-[1px] inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full text-[11px] font-semibold" style={{ background: "var(--track)", color: "var(--ink2)" }}>{k + 1}</span>
              <span className="min-w-0">
                {x.text}{" "}
                {x.href.startsWith("#") ? (
                  <a href={x.href} className="whitespace-nowrap text-xs font-semibold underline" style={{ color: "var(--s1)" }}>See it</a>
                ) : (
                  <Link to={x.href} className="whitespace-nowrap text-xs font-semibold underline" style={{ color: "var(--s1)" }}>Open</Link>
                )}
                {x.cell && x.cell.users.length > 0 && (
                  <button type="button" className="num ml-2 text-xs" onClick={() => drill(x.text, x.cell!, s.env!)}>{x.cell.users.length} people</button>
                )}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

// ------------------------------------------------------- usage: DAU, WAU, MAU

interface UsageBody {
  dau: Cell; wau: Cell; mau: Cell; avgDau: number; stickiness: number | null;
  trend: { day: string; dau: Cell; wau: number; mau: number; stick: number | null; new: Cell; returning: Cell }[];
  repeat: Cell; cohort: Cell; repeatPct: number | null; repeaters: Cell; oneTime: Cell;
  features: { key: string; label: string; rep: Cell; one: Cell; repPct: number | null; onePct: number | null }[];
  source: string; beacons: boolean;
}

function chartOptions(t: Theme, opts: { pct?: boolean; stacked?: boolean; onClick?: (evt: any, els: any, chart: any) => void }): any {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      ovCrosshair: { color: t.axis },
      tooltip: {
        backgroundColor: t.surface, borderColor: t.axis, borderWidth: 1, titleColor: t.ink2, bodyColor: t.ink, padding: 8, boxWidth: 10, boxHeight: 2,
        callbacks: { label: (c: any) => ` ${c.parsed.y == null ? "n/a" : opts.pct ? `${c.parsed.y}%` : fmtN(c.parsed.y)}  ${c.dataset.label}` },
      },
    },
    scales: {
      x: { stacked: opts.stacked, grid: { display: false }, border: { color: t.axis }, ticks: { color: t.muted, maxTicksLimit: 6, maxRotation: 0, font: { size: 11 } } },
      y: { stacked: opts.stacked, beginAtZero: true, grid: { color: t.grid }, border: { display: false }, ticks: { color: t.muted, precision: 0, maxTicksLimit: 5, font: { size: 11 }, callback: (v: any) => (opts.pct ? `${v}%` : fmtN(Number(v))) } },
    },
    onClick: opts.onClick,
  };
}

function Legend({ items }: { items: { label: string; color: string; line?: boolean; note?: string }[] }) {
  return (
    <div className="mb-2 flex flex-wrap gap-x-4 gap-y-1 text-xs" style={{ color: "var(--ink2)" }}>
      {items.map((x) => (
        <span key={x.label} className="flex items-center gap-1.5">
          <span className={`inline-block ${x.line ? "h-[2px] w-4 rounded" : "h-2.5 w-3 rounded-sm"}`} style={{ background: x.color }} />
          {x.label}{x.note && <span style={{ color: "var(--muted)" }}>{x.note}</span>}
        </span>
      ))}
    </div>
  );
}

function Usage({ s, drill, t }: { s: SectionState; drill: Drill; t: Theme }) {
  const [view, setView] = useState<"newret" | "stick" | "dwm">("newret");
  const body = s.env?.body as UsageBody | undefined;
  return (
    <Card
      title="Engagement"
      sub="Active: any use of Stu that day (IST). DAU on the range's last day, WAU 7 days, MAU 30 days to it."
      s={s}
      minH={360}
      right={<Seg label="Engagement view" value={view} onChange={setView} options={[{ v: "newret", l: "New, returning" }, { v: "stick", l: "Stickiness" }, { v: "dwm", l: "DAU, WAU, MAU" }]} />}
    >
      {(env) => {
        const b = body!;
        const labels = b.trend.map((x) => dayLabel(x.day));
        const pick = (cells: Cell[], name: string) => (_e: any, els: any[]) => {
          const el = els?.[0];
          if (!el) return;
          const c = cells[el.index];
          if (c && c.users.length) drill(`${name}, ${b.trend[el.index].day}`, c, env);
        };
        const stat = (label: string, node: React.ReactNode, note: string) => (
          <div className="min-w-0">
            <div className="truncate text-[11px]" style={{ color: "var(--ink2)" }}>{label}</div>
            <div className="text-xl font-semibold">{node}</div>
            <div className="truncate text-[10px]" style={{ color: "var(--muted)" }}>{note}</div>
          </div>
        );
        let chart: React.ReactNode;
        if (view === "newret") {
          const data = {
            labels,
            datasets: [
              { label: "New (joined that day)", data: b.trend.map((x) => x.new.v), backgroundColor: t.series[0], borderRadius: { topLeft: 0, topRight: 0, bottomLeft: 0, bottomRight: 0 }, borderSkipped: false, maxBarThickness: 18, borderColor: t.surface, borderWidth: { top: 2 } },
              { label: "Returning", data: b.trend.map((x) => x.returning.v), backgroundColor: t.series[1], borderRadius: { topLeft: 4, topRight: 4 }, borderSkipped: false, maxBarThickness: 18 },
            ],
          };
          const cellsAt = (i: number, ds: number) => (ds === 0 ? b.trend[i].new : b.trend[i].returning);
          chart = (
            <>
              <Legend items={[{ label: "New (joined that day)", color: t.series[0] }, { label: "Returning", color: t.series[1] }]} />
              <div className="h-[170px]">
                <Bar data={data} options={chartOptions(t, { stacked: true, onClick: (evt: any, _els: any, ch: any) => {
                  const el = ch.getElementsAtEventForMode(evt, "nearest", { intersect: false }, true)[0];
                  if (!el) return;
                  const c = cellsAt(el.index, el.datasetIndex);
                  if (c.users.length) drill(`${el.datasetIndex === 0 ? "New actives" : "Returning actives"}, ${b.trend[el.index].day}`, c, env);
                } })} />
              </div>
            </>
          );
        } else if (view === "stick") {
          const data = { labels, datasets: [{ label: "DAU / MAU", data: b.trend.map((x) => x.stick), borderColor: t.series[0], backgroundColor: t.series[0], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0, spanGaps: true }] };
          chart = (
            <>
              <div className="mb-2 text-xs" style={{ color: "var(--ink2)" }}>DAU / MAU each day, %</div>
              <div className="h-[170px]"><Line data={data} options={chartOptions(t, { pct: true, onClick: pick(b.trend.map((x) => x.dau), "Active") })} plugins={[crosshair]} /></div>
            </>
          );
        } else {
          const data = {
            labels,
            datasets: [
              { label: "DAU", data: b.trend.map((x) => x.dau.v), borderColor: t.series[0], backgroundColor: t.series[0] },
              { label: "WAU", data: b.trend.map((x) => x.wau), borderColor: t.series[1], backgroundColor: t.series[1] },
              { label: "MAU", data: b.trend.map((x) => x.mau), borderColor: t.series[2], backgroundColor: t.series[2] },
            ].map((x) => ({ ...x, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0 })),
          };
          chart = (
            <>
              <Legend items={[{ label: "DAU", color: t.series[0], line: true }, { label: "WAU (7 days)", color: t.series[1], line: true }, { label: "MAU (30 days)", color: t.series[2], line: true }]} />
              <div className="h-[170px]"><Line data={data} options={chartOptions(t, { onClick: pick(b.trend.map((x) => x.dau), "Active") })} plugins={[crosshair]} /></div>
            </>
          );
        }
        const maxPct = 100;
        return (
          <div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {stat("DAU", <N cell={b.dau} env={env} drill={drill} title="Active on the last day" />, `avg ${b.avgDau} over 7 days`)}
              {stat("WAU", <N cell={b.wau} env={env} drill={drill} title="Active in 7 days" />, "7 days")}
              {stat("MAU", <N cell={b.mau} env={env} drill={drill} title="Active in 30 days" />, "30 days")}
              {stat("Stickiness", <span>{fmtPct(b.stickiness)}</span>, "avg DAU 7 days / MAU")}
              {stat("Repeat users", <N cell={b.repeat} env={env} drill={drill} title="Joined in range, active on 2+ days" />, `${fmtPct(b.repeatPct)} of ${fmtN(b.cohort.v)} sign-ups, 2+ days`)}
            </div>
            <div className="mt-3">{chart}</div>
            <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2" style={{ borderTop: "1px solid var(--grid)", paddingTop: 10 }}>
              <div className="text-[11px] font-semibold" style={{ color: "var(--ink2)" }}>What repeat users use, against one-time users</div>
              <Legend items={[
                { label: "Repeat (2+ days)", color: t.series[0], note: ` ${fmtN(b.repeaters.v)}` },
                { label: "One day only", color: t.series[1], note: ` ${fmtN(b.oneTime.v)}` },
              ]} />
            </div>
            {b.features.length ? (
              <div className="grid grid-cols-[minmax(80px,120px)_minmax(0,1fr)] items-center gap-x-3 gap-y-1.5 text-xs">
                {b.features.map((x) => (
                  <div key={x.key} className="contents">
                    <span className="truncate" style={{ color: "var(--ink2)" }}>{x.label}</span>
                    <div>
                      <div className="flex items-center gap-1.5" title={`Repeat users: ${x.rep.v} (${fmtPct(x.repPct)})`}>
                        <div style={{ width: `${((x.repPct ?? 0) / maxPct) * 85}%`, minWidth: x.rep.v ? 3 : 0, height: 8, background: t.series[0], borderRadius: "0 3px 3px 0" }} />
                        <N cell={x.rep} env={env} drill={drill} title={`Repeat users who used ${x.label}`} fmt={() => fmtPct(x.repPct)} className="tnum text-[11px]" />
                      </div>
                      <div className="mt-[2px] flex items-center gap-1.5" title={`One-time users: ${x.one.v} (${fmtPct(x.onePct)})`}>
                        <div style={{ width: `${((x.onePct ?? 0) / maxPct) * 85}%`, minWidth: x.one.v ? 3 : 0, height: 8, background: t.series[1], borderRadius: "0 3px 3px 0" }} />
                        <N cell={x.one} env={env} drill={drill} title={`One-time users who used ${x.label}`} fmt={() => fmtPct(x.onePct)} className="tnum text-[11px]" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : <p className="text-xs" style={{ color: "var(--muted)" }}>Nobody active in this range.</p>}
            <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>source: {b.source}</p>
          </div>
        );
      }}
    </Card>
  );
}

// -------------------------------------------------------------- power users

interface PowerBody { rule: string; cell: Cell; trend: { day: string; v: number }[]; rows: PowerRow[]; more: number; weekAgo: number | null; byChannel: [string, number][]; source: string }

function Power({ s, drill, t, qs }: { s: SectionState; drill: Drill; t: Theme; qs: string }) {
  const body = s.env?.body as PowerBody | undefined;
  return (
    <Card title="Power users" s={s} minH={360}>
      {(env) => {
        const b = body!;
        const data = { labels: b.trend.map((x) => dayLabel(x.day)), datasets: [{ label: "Power users", data: b.trend.map((x) => x.v), borderColor: t.series[0], backgroundColor: t.series[0], borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: 0 }] };
        return (
          <div>
            <p className="text-[13px]" style={{ color: "var(--ink2)" }}>{b.rule}</p>
            <div className="mt-2 flex flex-wrap items-end gap-x-6 gap-y-1">
              <div>
                <div className="text-[11px]" style={{ color: "var(--ink2)" }}>Now</div>
                <div className="text-[26px] font-semibold leading-tight"><N cell={b.cell} env={env} drill={drill} title="Power users" /></div>
              </div>
              <div className="pb-1 text-xs" style={{ color: "var(--muted)" }}>
                {b.weekAgo != null ? `${b.weekAgo} a week earlier` : ""}
                {b.byChannel.length ? ` · ${b.byChannel.slice(0, 3).map(([c, n]) => `${channelLabel(c)} ${n}`).join(", ")}` : ""}
              </div>
            </div>
            <div className="mt-2 text-[11px]" style={{ color: "var(--ink2)" }}>Power users each day, last 30 days</div>
            <div className="h-[90px]"><Line data={data} options={chartOptions(t, {})} plugins={[crosshair]} /></div>
            {b.rows.length ? (
              <div className="mt-3 max-h-[260px] overflow-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 text-left text-[11px]" style={{ background: "var(--surface)", color: "var(--muted)" }}>
                    <tr><th className="pb-1 font-medium">Who</th><th className="pb-1 font-medium">Last active</th><th className="pb-1 text-right font-medium">Days</th><th className="pb-1 pl-2 font-medium">Top features</th><th className="hidden pb-1 font-medium sm:table-cell">Source</th></tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r) => {
                      const p = env.people[r.u];
                      return (
                        <tr key={r.u} className="row-hover" style={{ borderTop: "1px solid var(--grid)" }}>
                          <td className="max-w-[150px] truncate py-1 pr-2">{p ? <Link to={`/journeys?${qs}&u=${encodeURIComponent(p.id)}`} className="hover:underline" style={{ color: "var(--s1)" }}>{r.who}</Link> : r.who}</td>
                          <td className="tnum whitespace-nowrap py-1 pr-2">{r.lastActive ? dayLabel(r.lastActive) : ""}</td>
                          <td className="tnum py-1 pr-2 text-right" title={`${r.activeDays} active days, ${r.richDays} with 3+ features, in the last 7`}>{r.activeDays}</td>
                          <td className="max-w-[160px] truncate py-1 pl-2 pr-2" style={{ color: "var(--ink2)" }}>{r.top.join(", ")}</td>
                          <td className="hidden max-w-[120px] truncate py-1 sm:table-cell" style={{ color: "var(--ink2)" }}>{r.source || channelLabel(r.ch)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {b.more > 0 && <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>and {b.more} more (open the count for all)</p>}
              </div>
            ) : <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>Nobody meets the rule yet.</p>}
            <p className="mt-2 text-[10px]" style={{ color: "var(--muted)" }}>source: {b.source}</p>
          </div>
        );
      }}
    </Card>
  );
}
