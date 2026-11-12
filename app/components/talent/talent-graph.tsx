// The Talent graph: hubs (the search's terms, or with no search the pool's top skills and wanted roles) pinned on a
// ring, every student a dot pulled toward the hubs it links to, so a student matching every term sits in the middle.
// Dot colour is intent or, switched, the work style the resume read found (TALENT-ALL); dot size how strongly it matched. Hover or focus a dot for who it is, click to open the
// profile; hover a hub to light up its students, click it to search for it. Plain SVG, light only like the admin. On a
// narrow screen the canvas is taller than wide, so the chips and names stay readable.
import { useEffect, useMemo, useRef, useState } from "react";
import { type Hub, type Layout, STYLE_LABEL, firstName, intentLabel, layout } from "~/lib/talent/model";
import type { TalentEnvelope, WireResult } from "~/lib/talent/wire";

const WIDE = { w: 1000, h: 620, chars: 22 };
const NARROW = { w: 460, h: 600, chars: 14 };
const FONT = 14;
const NAME_FONT = 13;
export const INTENT_COLOR: Record<string, string> = { active: "#7c3aed", open: "#f59e0b" };
export const OTHER_COLOR = "#a3a3a3";
export const intentColor = (i: string | null) => INTENT_COLOR[i ?? ""] ?? OTHER_COLOR;
/** Work style: four hues checked for colour-blind separation (worst pair deutan dE 17), grey when not read. */
export const STYLE_COLOR: Record<string, string> = { "builder-first": "#6d28d9", "strategist-first": "#f59e0b", "operator-first": "#0891b2", hybrid: "#be123c" };
export type ColorBy = "intent" | "style";
export const dotColor = (r: Pick<WireResult, "intent" | "traits">, by: ColorBy) =>
  by === "style" ? STYLE_COLOR[r.traits?.style ?? ""] ?? OTHER_COLOR : intentColor(r.intent);

const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const hubWidth = (h: Hub, chars: number) => 32 + Math.min(h.label.length, chars) * 7.8 + String(h.n).length * 8;

interface Box { x0: number; y0: number; x1: number; y1: number }
const hits = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

/**
 * First names for the best matches, placed right, left, above or below their dot, wherever they cover no other dot, no
 * chip and no name already placed; a name with no free place is left off (the tooltip and the list have it). The
 * selected student always gets one.
 */
function placeNames(ids: string[], pos: Layout, names: Map<string, string>, r: (id: string) => number, chips: Box[], forced: string | null, w: number, h: number) {
  const out = new Map<string, { x: number; y: number; anchor: "start" | "end" | "middle" }>();
  const placed: Box[] = [];
  const dots = Object.entries(pos.students).map(([id, p]) => ({ id, box: { x0: p.x - r(id), y0: p.y - r(id), x1: p.x + r(id), y1: p.y + r(id) } }));
  const order = forced ? [forced, ...ids.filter((i) => i !== forced)] : ids;
  for (const id of order) {
    const p = pos.students[id];
    const name = names.get(id);
    if (!p || !name) continue;
    const tw = name.length * NAME_FONT * 0.56 + 4;
    const rad = r(id);
    const tries = [
      { x: p.x + rad + 4, y: p.y + 4.5, anchor: "start" as const, box: { x0: p.x + rad + 3, y0: p.y - 8, x1: p.x + rad + 5 + tw, y1: p.y + 7 } },
      { x: p.x - rad - 4, y: p.y + 4.5, anchor: "end" as const, box: { x0: p.x - rad - 5 - tw, y0: p.y - 8, x1: p.x - rad - 3, y1: p.y + 7 } },
      { x: p.x, y: p.y - rad - 5, anchor: "middle" as const, box: { x0: p.x - tw / 2, y0: p.y - rad - 18, x1: p.x + tw / 2, y1: p.y - rad - 3 } },
      { x: p.x, y: p.y + rad + 14, anchor: "middle" as const, box: { x0: p.x - tw / 2, y0: p.y + rad + 2, x1: p.x + tw / 2, y1: p.y + rad + 17 } },
    ];
    const ok = tries.find((t) =>
      t.box.x0 >= 0 && t.box.x1 <= w && t.box.y0 >= 0 && t.box.y1 <= h &&
      !placed.some((b) => hits(b, t.box)) && !chips.some((b) => hits(b, t.box)) && !dots.some((d) => d.id !== id && hits(d.box, t.box)));
    const pick = ok ?? (id === forced ? tries[0] : null);
    if (!pick) continue;
    placed.push(pick.box);
    out.set(id, { x: pick.x, y: pick.y, anchor: pick.anchor });
  }
  return out;
}

export function TalentGraph({ data, selected, onSelect, onHub, dim, colorBy }: {
  data: TalentEnvelope;
  selected: string | null;
  onSelect: (id: string) => void;
  onHub: (h: Hub) => void;
  dim: boolean;
  colorBy: ColorBy;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 620));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data.graph.links.length > 0]); // the empty state and the graph are different elements
  const { w: W, h: H, chars } = narrow ? NARROW : WIDE;

  const [hover, setHover] = useState<{ kind: "s" | "h"; key: string } | null>(null);
  const searching = data.terms.length > 0;
  const byId = useMemo(() => new Map(data.results.map((r) => [r.id, r])), [data]);
  const maxScore = useMemo(() => Math.max(1, ...data.results.map((r) => r.score)), [data]);
  const radius = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of data.results) m.set(r.id, searching ? 6 + 7 * (r.score / maxScore) : 7);
    return (id: string) => m.get(id) ?? 7;
  }, [data, searching, maxScore]);
  const widths = useMemo(() => new Map(data.graph.hubs.map((h) => [h.key, hubWidth(h, chars)])), [data, chars]);
  const pos: Layout = useMemo(() => {
    const rank: Record<string, number> = {};
    data.graph.links.forEach((l, i) => (rank[l.id] = i));
    return layout(data.graph, rank, W, H, radius, (k) => (widths.get(k) ?? 120) / 2);
  }, [data, radius, widths, W, H]);
  const labels = useMemo(() => {
    const chips = data.graph.hubs.map((h) => {
      const q = pos.hubs[h.key];
      const half = (widths.get(h.key) ?? 120) / 2;
      return { x0: q.x - half, y0: q.y - 17, x1: q.x + half + 3, y1: q.y + 18 };
    });
    const names = new Map(data.results.map((r) => [r.id, firstName(r.name)]));
    const ids = data.graph.links.slice(0, searching ? (narrow ? 8 : 14) : 0).map((l) => l.id);
    return placeNames(ids, pos, names, radius, chips, selected && pos.students[selected] ? selected : null, W, H);
  }, [data, pos, widths, radius, searching, narrow, selected, W, H]);

  const lit = (id: string, hubs: string[]) => {
    if (!hover) return selected ? id === selected : true;
    return hover.kind === "s" ? hover.key === id : hubs.includes(hover.key);
  };
  const hovered = hover?.kind === "s" ? byId.get(hover.key) : undefined;
  const hp = hovered ? pos.students[hovered.id] : undefined;

  if (!data.graph.links.length) {
    return (
      <div ref={wrap} className="flex h-[420px] items-center justify-center rounded-xl bg-neutral-50 p-6 text-center text-sm text-neutral-500">
        {data.total ? "These students share no skill or role often enough to draw. The list below has them." : "No student matches this search. Try fewer words or loosen a filter."}
      </div>
    );
  }

  return (
    <div ref={wrap} className={`relative fade ${dim ? "opacity-50" : ""}`}>
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full select-none" role="group" aria-label="Students and what they match">
        <ellipse cx={W / 2} cy={H / 2} rx={W * 0.38} ry={H * 0.36} fill="none" stroke="#ede9fe" strokeWidth={1.5} strokeDasharray="4 6" />
        {/* edges first, under everything */}
        {data.graph.links.map((l) => {
          const p = pos.students[l.id];
          const on = lit(l.id, l.hubs) && (hover || selected);
          return l.hubs.map((k) => {
            const q = pos.hubs[k];
            const hubOn = hover?.kind === "h" ? hover.key === k : true;
            const strong = !!on && hubOn;
            return (
              <line key={`${l.id}-${k}`} x1={p.x} y1={p.y} x2={q.x} y2={q.y}
                stroke={strong ? "#7c3aed" : "#d4d4d4"} strokeWidth={strong ? 1.75 : 1}
                strokeOpacity={hover || selected ? (strong ? 0.9 : 0.2) : searching ? 0.6 : 0.4} />
            );
          });
        })}
        {/* hubs */}
        {data.graph.hubs.map((h) => {
          const q = pos.hubs[h.key];
          const w = widths.get(h.key) ?? 120;
          const on = hover?.kind === "h" && hover.key === h.key;
          const fill = h.kind === "skill" ? "#ffffff" : "#f5f3ff";
          return (
            <g key={h.key} transform={`translate(${q.x - w / 2},${q.y - 16})`} tabIndex={0} role="button" className="cursor-pointer outline-none"
              aria-label={`${h.label}: ${h.n} students.${searching ? "" : " Search for it."}`}
              onMouseEnter={() => setHover({ kind: "h", key: h.key })} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ kind: "h", key: h.key })} onBlur={() => setHover(null)}
              onClick={() => onHub(h)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onHub(h); } }}>
              <rect x={3} y={3} width={w} height={32} rx={9} fill="#171717" />
              <rect x={on ? -1 : 0} y={on ? -1 : 0} width={w} height={32} rx={9} fill={on ? "#ede9fe" : fill} stroke="#171717" strokeWidth={1.5} />
              <text x={12} y={21} fontSize={FONT} fontWeight={700} fill="#171717">{short(h.label, chars)}</text>
              <text x={w - 10} y={21} fontSize={FONT - 1} fontWeight={600} fill="#525252" textAnchor="end" className="tnum">{h.n}</text>
            </g>
          );
        })}
        {/* students */}
        {data.graph.links.map((l) => {
          const r = byId.get(l.id);
          if (!r) return null;
          const p = pos.students[l.id];
          const rad = radius(l.id);
          const on = lit(l.id, l.hubs);
          const sel = selected === l.id;
          return (
            <g key={l.id} tabIndex={0} role="button" className="cursor-pointer outline-none" opacity={on ? 1 : 0.3}
              aria-label={`${r.name}. ${r.headline ?? ""}. ${intentLabel(r.intent)}. Open profile.`}
              onMouseEnter={() => setHover({ kind: "s", key: l.id })} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover({ kind: "s", key: l.id })} onBlur={() => setHover(null)}
              onClick={() => onSelect(l.id)} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onSelect(l.id); } }}>
              <circle cx={p.x} cy={p.y} r={Math.max(12, rad + 5)} fill="transparent" />
              {sel && <circle cx={p.x} cy={p.y} r={rad + 4} fill="none" stroke="#171717" strokeWidth={2} />}
              <circle cx={p.x} cy={p.y} r={rad} fill={dotColor(r, colorBy)} stroke="#ffffff" strokeWidth={2} />
            </g>
          );
        })}
        {/* names last, over the edges and dots, never under them */}
        {[...labels.entries()].map(([id, t]) => {
          const r = byId.get(id);
          const l = data.graph.links.find((x) => x.id === id);
          if (!r || !l) return null;
          return (
            <text key={`n-${id}`} x={t.x} y={t.y} textAnchor={t.anchor} fontSize={NAME_FONT} fontWeight={600} fill="#171717"
              stroke="#ffffff" strokeWidth={3} paintOrder="stroke" pointerEvents="none" opacity={lit(id, l.hubs) ? 1 : 0.3}>
              {firstName(r.name)}
            </text>
          );
        })}
      </svg>
      {hovered && hp && <Tip r={hovered} x={hp.x / W} y={hp.y / H} terms={data.terms.length} colorBy={colorBy} />}
    </div>
  );
}

function Tip({ r, x, y, terms, colorBy }: { r: WireResult; x: number; y: number; terms: number; colorBy: ColorBy }) {
  const flip = x > 0.55;
  return (
    <div className="pointer-events-none absolute z-10 w-60 max-w-[70%] rounded-xl border-2 border-neutral-900 bg-white p-3 text-xs shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]"
      style={{ left: `${x * 100}%`, top: `${y * 100}%`, transform: `translate(${flip ? "calc(-100% - 14px)" : "14px"}, -50%)` }}>
      <div className="text-sm font-bold text-neutral-950">{r.name}</div>
      {r.headline && <div className="mt-0.5 line-clamp-2 text-neutral-600">{r.headline}</div>}
      <div className="mt-1.5 flex items-center gap-1.5 text-neutral-700">
        <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dotColor(r, colorBy) }} />
        {colorBy === "style" ? STYLE_LABEL[r.traits?.style ?? ""] ?? "Work style not read" : r.source === "call" ? intentLabel(r.intent) : "Old product"}
        {terms > 0 && <span className="ml-auto font-semibold text-neutral-950">{r.matched} of {terms} matched</span>}
      </div>
    </div>
  );
}

export function GraphLegend({ searching, colorBy }: { searching: boolean; colorBy: ColorBy }) {
  const dot = (c: string) => <span className="inline-block h-3 w-3 rounded-full border-2 border-white ring-1 ring-neutral-200" style={{ background: c }} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-600">
      {colorBy === "style" ? (
        <>
          {Object.entries(STYLE_COLOR).map(([k, c]) => <span key={k} className="flex items-center gap-1.5">{dot(c)} {STYLE_LABEL[k]}</span>)}
          <span className="flex items-center gap-1.5">{dot(OTHER_COLOR)} Not read (from the resume, by our AI)</span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5">{dot(INTENT_COLOR.active)} Actively looking</span>
          <span className="flex items-center gap-1.5">{dot(INTENT_COLOR.open)} Open to offers</span>
          <span className="flex items-center gap-1.5">{dot(OTHER_COLOR)} Not looking, did not say, or old product</span>
        </>
      )}
      {searching ? (
        <>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-9 rounded-md border-[1.5px] border-neutral-900 bg-violet-50" /> A word from your search</span>
          <span>Bigger dot: stronger match · middle of the ring: matches everything</span>
        </>
      ) : (
        <>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-9 rounded-md border-[1.5px] border-neutral-900 bg-violet-50" /> A role they want</span>
          <span className="flex items-center gap-1.5"><span className="inline-block h-3.5 w-9 rounded-md border-[1.5px] border-neutral-900 bg-white" /> A skill on their resume</span>
          <span>Click a chip to search for it</span>
        </>
      )}
    </div>
  );
}
