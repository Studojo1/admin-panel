// Shared by the Stu Overview (/) and the Usage page (/usage): the section reads
// from /api/stu/overview, the light palette in the admin's colours, the card
// frame the other Stu pages use, and a number that opens the people behind it.
import { useCallback, useEffect, useRef, useState } from "react";
import { getToken } from "~/lib/api";
import { type Cell, fmtN } from "~/lib/stu/model";
import type { OvEnvelope, OvSection } from "~/lib/stu/overview";
import { CARD, type DrillPeople, OldMark } from "./ui";

export type Env = OvEnvelope<any>;
export interface SectionState { env: Env | null; error: string; loading: boolean }
export type Drill = (title: string, cell: Cell, env: Env) => void;

export const REFRESH_MS = 60_000;

// ------------------------------------------------------------------ palette

/** Chart and panel colours: the admin's violet, amber, emerald and pink, light only like the rest of the admin. */
export const PALETTE = {
  page: "#fafafa", surface: "#ffffff", ink: "#171717", ink2: "#525252", muted: "#737373", grid: "#e5e5e5", axis: "#d4d4d4",
  border: "#171717", track: "#f5f5f5", up: "#047857", down: "#dc2626",
  series: ["#8b5cf6", "#f59e0b", "#10b981", "#ec4899"],
  ordinal: ["#ddd6fe", "#c4b5fd", "#a78bfa", "#8b5cf6", "#6d28d9"],
  seq: ["#f5f3ff", "#ede9fe", "#ddd6fe", "#c4b5fd", "#b9a4fc", "#a78bfa", "#9a74f8", "#8b5cf6", "#7c3aed", "#6d28d9", "#5b21b6", "#4c1d95", "#2e1065"],
  neutral: "#d4d4d4",
};
export type Palette = typeof PALETTE;
export const STATUS = { good: "#10b981", warning: "#f59e0b", serious: "#f97316", critical: "#dc2626" };

const P = PALETTE;
export const KIT_CSS = `
.ov { --page:${P.page}; --surface:${P.surface}; --ink:${P.ink}; --ink2:${P.ink2}; --muted:${P.muted}; --grid:${P.grid}; --axis:${P.axis};
  --border:${P.border}; --track:${P.track}; --up:${P.up}; --down:${P.down}; --s1:${P.series[0]}; --s2:${P.series[1]}; --hover:rgba(139,92,246,0.06);
  color-scheme: light; color: var(--ink); font-family: "Satoshi", ui-sans-serif, system-ui, sans-serif; }
.ov .num { text-decoration: underline dotted; text-decoration-color: #a3a3a3; text-underline-offset: 3px; cursor: pointer; }
.ov .num:hover, .ov .num:focus-visible { text-decoration-color: #7c3aed; outline: none; }
.ov .seg { display:inline-flex; flex-wrap: wrap; border:2px solid #171717; border-radius:10px; padding:2px; gap:2px; background:#fff; }
.ov .seg button { padding: 2px 9px; border-radius: 7px; font-size: 12px; font-weight: 600; color: #525252; }
.ov .seg button:hover { background: #f5f5f5; }
.ov .seg button[aria-pressed="true"] { background: #a855f7; color: #fff; }
.ov .row-hover:hover { background: var(--hover); }
.ov .fade { transition: opacity .2s; }
.ov .tnum { font-variant-numeric: tabular-nums; }
`;

// --------------------------------------------------------------------- data

export async function fetchSection(section: OvSection, start: string, end: string, internal: boolean, fresh: boolean): Promise<Env> {
  const token = await getToken();
  const qs = new URLSearchParams({ section, start, end });
  if (internal) qs.set("internal", "1");
  if (fresh) qs.set("fresh", "1");
  const res = await fetch(`/api/stu/overview?${qs}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as Env;
}

/**
 * Reads the given sections for a range, all in parallel, and again every 60 s.
 * The first section reads the dataset (fresh when asked); the rest share it.
 */
export function useSections(sections: readonly OvSection[], start: string, end: string, internal: boolean, enabled: boolean) {
  const [state, setState] = useState<Record<string, SectionState>>({});
  const [lastLoad, setLastLoad] = useState<number | null>(null);
  const gen = useRef(0);

  const load = useCallback(
    (fresh: boolean) => {
      const g = ++gen.current;
      setState((s) => Object.fromEntries(sections.map((k) => [k, { env: s[k]?.env ?? null, error: "", loading: true }])));
      const first = fetchSection(sections[0], start, end, internal, fresh);
      const all = sections.map((sec, i) => {
        const p = i === 0 ? first : first.catch(() => null).then(() => fetchSection(sec, start, end, internal, false));
        return p.then(
          (env) => g === gen.current && setState((s) => ({ ...s, [sec]: { env, error: "", loading: false } })),
          (e: any) => g === gen.current && setState((s) => ({ ...s, [sec]: { env: s[sec]?.env ?? null, error: e?.message || "Failed", loading: false } })),
        );
      });
      Promise.allSettled(all).then(() => g === gen.current && setLastLoad(Date.now()));
    },
    [sections, start, end, internal],
  );

  useEffect(() => {
    if (!enabled) return;
    load(false);
    const id = window.setInterval(() => load(false), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [enabled, load]);

  const S = (k: OvSection): SectionState => state[k] ?? { env: null, error: "", loading: true };
  const anyEnv = sections.map((k) => state[k]?.env).find(Boolean) ?? null;
  const loading = sections.some((k) => state[k]?.loading);
  return { S, load, loading, lastLoad, anyEnv, generated: anyEnv ? Date.parse(anyEnv.generatedAt) : null };
}

export function drillPeople(env: Env): DrillPeople {
  const users: DrillPeople["users"] = [];
  for (const [k, v] of Object.entries(env.people)) users[Number(k)] = v;
  return { users, visitors: Object.entries(env.vlinks).map(([id, u]) => ({ id, u })) };
}

// ------------------------------------------------------------------- format

export const istTime = (ms: number) => new Date(ms + 330 * 60_000).toISOString().slice(11, 16);
export const istShort = (ms: number) => {
  const iso = new Date(ms + 330 * 60_000).toISOString();
  return `${iso.slice(5, 10)} ${iso.slice(11, 16)}`;
};
export const dayLabel = (day: string) => {
  const d = new Date(day + "T00:00:00Z");
  return `${d.getUTCDate()} ${d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`;
};

// ---------------------------------------------------------------- building blocks

/** A number that opens its people. */
export function N({ cell, title, env, drill, fmt, className = "" }: { cell: Cell; title: string; env: Env; drill: Drill; fmt?: (n: number) => string; className?: string }) {
  if (cell.na) return <span className={className} style={{ color: "var(--muted)" }} title="Not available here yet">n/a</span>;
  const text = fmt ? fmt(cell.v) : fmtN(cell.v);
  const people = cell.users.length + (cell.visitors?.length ?? 0);
  const old = cell.old ? <OldMark /> : null;
  if (!people) return <span className={className}>{text}{old}</span>;
  return (
    <>
      <button type="button" className={`num ${className}`} onClick={() => drill(title, cell, env)} title={`${cell.users.length} people${cell.visitors?.length ? `, ${cell.visitors.length} visitors` : ""}: click for the list`}>
        {text}
      </button>
      {old}
    </>
  );
}

/** The card frame of the Stu pages: 2px ink border, offset shadow, a grey title strip. */
export function Card({ title, sub, s, right, children, minH = 160 }: { title: string; sub?: string; s: SectionState; right?: React.ReactNode; children: (env: Env) => React.ReactNode; minH?: number }) {
  return (
    <section className={`${CARD} h-full overflow-hidden`} aria-busy={s.loading}>
      <div className="flex flex-wrap items-start justify-between gap-2 border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
        <div className="min-w-0">
          <h2 className="font-['Clash_Display'] text-lg font-semibold leading-tight text-neutral-950">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-neutral-500">{sub}</p>}
        </div>
        {right}
      </div>
      <div className="p-4">
        {s.error && <div className="mb-2 text-xs" style={{ color: "var(--down)" }}>Could not read: {s.error}</div>}
        {s.env ? (
          <div className="fade" style={{ opacity: s.loading ? 0.55 : 1 }}>{children(s.env)}</div>
        ) : (
          !s.error && <div className="animate-pulse rounded-lg" style={{ minHeight: minH, background: "var(--track)" }} />
        )}
      </div>
    </section>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { v: T; l: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => <button key={o.v} type="button" aria-pressed={value === o.v} onClick={() => onChange(o.v)}>{o.l}</button>)}
    </div>
  );
}

export function Legend({ items }: { items: { label: string; color: string; line?: boolean; note?: string }[] }) {
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

// ------------------------------------------------------------------- charts

export const crosshair = {
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
    ctx.strokeStyle = chart.options.plugins?.ovCrosshair?.color ?? PALETTE.axis;
    ctx.stroke();
    ctx.restore();
  },
};

export function chartOptions(t: Palette, opts: { pct?: boolean; stacked?: boolean; onClick?: (evt: any, els: any, chart: any) => void }): any {
  return {
    responsive: true, maintainAspectRatio: false, animation: false,
    interaction: { mode: "index", intersect: false },
    plugins: {
      legend: { display: false },
      ovCrosshair: { color: t.axis },
      tooltip: {
        backgroundColor: t.surface, borderColor: t.ink, borderWidth: 1, titleColor: t.ink2, bodyColor: t.ink, padding: 8, boxWidth: 10, boxHeight: 2,
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
