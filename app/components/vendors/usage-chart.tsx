// Credits spent per IST day, one vendor, last 30 days: thin columns with a 4px
// rounded top, square at the baseline, hairline grid, the peak labelled, a
// per-column tooltip (hover and keyboard focus) and a table view underneath.
// One series per chart, so no legend box: the title names it. The series color
// is set by the page (LeadsForge slot 1 blue, Apollo slot 2 orange, validated
// against the white card surface); text always stays in ink.
import { useEffect, useRef, useState } from "react";
import { type DayPoint, fmtDay, fmtNum, niceTicks } from "~/lib/vendors/model";

const INK = "#0b0b0b";
const INK_2 = "#52514e";
const MUTED = "#898781";
const GRID = "#e1e0d9";
const AXIS = "#c3c2b7";

/** Width before the first measure (server render); the chart then draws at its real pixel width. */
const DEFAULT_W = 640;
const PLOT_H = 160;
const TOP = 18;
const LEFT = 44;
const RIGHT = 8;
const AXIS_BAND = 24;
const H = TOP + PLOT_H + AXIS_BAND;

/** A column path: 4px rounded top corners, square at the baseline. */
function column(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

export function UsageChart({ title, color, series, today }: { title: string; color: string; series: DayPoint[]; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [W, setW] = useState(DEFAULT_W);
  useEffect(() => {
    const el = box.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const max = Math.max(0, ...series.map((p) => p.credits));
  const ticks = niceTicks(max);
  const top = ticks[ticks.length - 1] || 1;
  const plotW = W - LEFT - RIGHT;
  const slot = plotW / series.length;
  const bw = Math.min(24, slot * 0.7);
  const base = TOP + PLOT_H;
  const yOf = (v: number) => base - (v / top) * PLOT_H;
  const peak = max > 0 ? series.findIndex((p) => p.credits === max) : -1;
  const total = series.reduce((s, p) => s + p.credits, 0);
  const hp = hover != null ? series[hover] : null;

  return (
    <figure className="m-0">
      <figcaption className="mb-1 flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold" style={{ color: INK }}>{title}</span>
        <span className="text-xs" style={{ color: INK_2 }}>{fmtNum(total)} credits in {series.length} days</span>
      </figcaption>
      <div className="relative" ref={box}>
        <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} role="img" aria-label={`${title}. Peak ${fmtNum(max)} credits. Table view below.`} className="block overflow-visible">
          {ticks.map((t) => (
            <g key={t}>
              <line x1={LEFT} x2={W - RIGHT} y1={yOf(t)} y2={yOf(t)} stroke={t === 0 ? AXIS : GRID} strokeWidth={1} shapeRendering="crispEdges" />
              <text x={LEFT - 6} y={yOf(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={MUTED} style={{ fontVariantNumeric: "tabular-nums" }}>
                {t >= 1000 ? `${Math.round(t / 100) / 10}K` : t}
              </text>
            </g>
          ))}
          {series.map((p, i) => {
            const x = LEFT + i * slot + (slot - bw) / 2;
            const showLabel = i === series.length - 1 || (series.length - 1 - i) % 7 === 0;
            return (
              <g key={p.day}>
                {p.credits > 0 && (
                  <path d={column(x, yOf(p.credits), bw, base)} fill={color} opacity={hover === i ? 0.75 : 1} />
                )}
                {showLabel && (
                  <text x={x + bw / 2} y={base + 16} textAnchor="middle" fontSize={11} fill={MUTED}>
                    {p.day === today ? "Today" : fmtDay(p.day, today)}
                  </text>
                )}
              </g>
            );
          })}
          {peak >= 0 && (
            <text x={LEFT + peak * slot + slot / 2} y={yOf(max) - 6} textAnchor="middle" fontSize={11} fontWeight={600} fill={INK}>
              {fmtNum(max)}
            </text>
          )}
          {/* Hit targets: the whole column slot, bigger than the bar. */}
          {series.map((p, i) => (
            <rect
              key={`hit-${p.day}`}
              x={LEFT + i * slot}
              y={TOP}
              width={slot}
              height={PLOT_H}
              fill="transparent"
              tabIndex={0}
              aria-label={`${fmtDay(p.day, today)}: ${fmtNum(p.credits)} credits, ${fmtNum(p.calls)} calls`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              className="cursor-default outline-none focus:stroke-neutral-400"
            />
          ))}
        </svg>
        {hp && hover != null && (
          <div
            className="pointer-events-none absolute z-10 rounded-lg border border-black/10 bg-white px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${((LEFT + hover * slot + slot / 2) / W) * 100}%`,
              top: 0,
              transform: `translateX(${hover > series.length * 0.7 ? "-100%" : hover < series.length * 0.3 ? "0" : "-50%"})`,
            }}
          >
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3 rounded" style={{ background: color }} />
              <span className="font-semibold" style={{ color: INK }}>{fmtNum(hp.credits)} credits</span>
            </div>
            <div style={{ color: INK_2 }}>
              {fmtDay(hp.day, today)}{hp.day === today ? " (today so far)" : ""}, {fmtNum(hp.calls)} calls, {fmtNum(hp.hits)} hits
            </div>
          </div>
        )}
      </div>
      <details className="mt-1 text-xs" style={{ color: INK_2 }}>
        <summary className="cursor-pointer select-none">Table view</summary>
        <div className="mt-1 max-h-56 overflow-y-auto">
          <table className="w-full border-collapse" style={{ fontVariantNumeric: "tabular-nums" }}>
            <thead>
              <tr className="text-left" style={{ color: MUTED }}>
                <th className="py-0.5 pr-3 font-medium">Day (IST)</th>
                <th className="py-0.5 pr-3 text-right font-medium">Credits</th>
                <th className="py-0.5 pr-3 text-right font-medium">Calls</th>
                <th className="py-0.5 text-right font-medium">Hits</th>
              </tr>
            </thead>
            <tbody>
              {[...series].reverse().map((p) => (
                <tr key={p.day} className="border-t" style={{ borderColor: GRID, color: INK }}>
                  <td className="py-0.5 pr-3">{fmtDay(p.day, today)}{p.day === today ? " (today)" : ""}</td>
                  <td className="py-0.5 pr-3 text-right">{fmtNum(p.credits)}</td>
                  <td className="py-0.5 pr-3 text-right">{fmtNum(p.calls)}</td>
                  <td className="py-0.5 text-right">{fmtNum(p.hits)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
