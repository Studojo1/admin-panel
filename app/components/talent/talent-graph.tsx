// The Talent network. TALENT-NET (12 Nov 2026, the owner: "the graph should be like a neural network, where if i click
// then go deeper to see each student"): layered columns left to right, everyone the search found, their career
// families, the open family's roles, the open role's best students. Circle size and line thickness are student counts;
// the open path is lit. Click a family to open its roles, a role to see its students (best first, as the list ranks
// them, with "show more"), a student to open the profile; the breadcrumb goes back. Student dots keep the colour of
// intent or, switched, the work style the resume read found (TALENT-ALL). Plain SVG, light only like the admin. On a
// narrow screen only the open node and its children show. Layout: app/lib/talent/net-layout.ts.
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { type LNode, netLayout } from "~/lib/talent/net-layout";
import { STYLE_LABEL, firstName, intentLabel } from "~/lib/talent/model";
import type { TalentEnvelope, WireResult } from "~/lib/talent/wire";

export const INTENT_COLOR: Record<string, string> = { active: "#7c3aed", open: "#f59e0b" };
export const OTHER_COLOR = "#a3a3a3";
export const intentColor = (i: string | null) => INTENT_COLOR[i ?? ""] ?? OTHER_COLOR;
/** Work style: four hues checked for colour-blind separation (worst pair deutan dE 17), grey when not read. */
export const STYLE_COLOR: Record<string, string> = { "builder-first": "#6d28d9", "strategist-first": "#f59e0b", "operator-first": "#0891b2", hybrid: "#be123c" };
export type ColorBy = "intent" | "style";
export const dotColor = (r: Pick<WireResult, "intent" | "traits">, by: ColorBy) =>
  by === "style" ? STYLE_COLOR[r.traits?.style ?? ""] ?? OTHER_COLOR : intentColor(r.intent);

const INK = "#171717";
const MUTED = "#737373";
const LIT = "#7c3aed";
const SOFT = "#c4b5fd";
const PAGE = 12;
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");
const fmt = (n: number) => n.toLocaleString("en-IN");
const nameOf = (r: WireResult) => (/^a studojo student$/i.test(r.name) ? "Student" : firstName(r.name));

export function TalentNet({ data, fam, role, selected, colorBy, dim, onFam, onRole, onStudent }: {
  data: TalentEnvelope;
  fam: string;
  role: string;
  selected: string | null;
  colorBy: ColorBy;
  dim: boolean;
  onFam: (key: string) => void; // "" closes the family
  onRole: (key: string) => void; // "" closes the role
  onStudent: (id: string) => void;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(([e]) => setNarrow(e.contentRect.width < 620));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const [shown, setShown] = useState(PAGE);
  useEffect(() => setShown(PAGE), [role, data.terms.length, data.total]);
  const [allRoles, setAllRoles] = useState(false);
  useEffect(() => setAllRoles(false), [fam]);
  const [hover, setHover] = useState<string | null>(null);

  // The results are the open role's students only once the API has answered for that role.
  const ready = data.fam === fam && data.role === role;
  const byId = useMemo(() => new Map(data.results.map((r) => [r.id, r])), [data]);
  const famNet = data.net.families.find((f) => f.key === fam) ?? null;
  const roleNet = famNet?.roles.find((r) => r.key === role) ?? null;
  const students = ready && roleNet ? data.results.slice(0, shown).map((r) => ({ id: r.id, name: nameOf(r) })) : [];
  const canShowMore = ready && students.length < data.results.length;
  const L = useMemo(
    () => netLayout(data.net, { fam: famNet ? fam : null, role: roleNet ? role : null }, students, roleNet?.n ?? 0, { narrow, allRoles, more: canShowMore }),
    [data, fam, role, narrow, allRoles, shown, ready], // eslint-disable-line react-hooks/exhaustive-deps
  );

  const act = (n: LNode) => {
    if (n.kind === "pool") onFam("");
    else if (n.kind === "fam") onFam(n.open ? "" : n.key);
    else if (n.kind === "role") onRole(n.open ? "" : n.key);
    else if (n.kind === "more") setAllRoles((v) => !v);
    else if (n.kind === "show") setShown((v) => v + PAGE);
    else onStudent(n.key);
  };
  // On a narrow screen the open node on the left goes up a level.
  const up = (n: LNode) => (narrow && n.open && n.x < 60 ? (n.kind === "role" ? onRole("") : n.kind === "fam" ? onFam("") : null) : act(n));
  const hovered = L.nodes.find((n) => n.id === hover) ?? null;

  return (
    <div ref={wrap} className={`relative fade ${dim ? "opacity-60" : ""}`}>
      <nav aria-label="Where you are in the network" className="mb-2 flex flex-wrap items-center gap-1 text-sm">
        <Crumb on={!famNet} onClick={() => onFam("")}>All {fmt(data.net.n)}</Crumb>
        {famNet && <><span className="text-neutral-400">›</span><Crumb on={!roleNet} onClick={() => onRole("")}>{famNet.label} {fmt(famNet.n)}</Crumb></>}
        {roleNet && <><span className="text-neutral-400">›</span><Crumb on>{roleNet.label} {fmt(roleNet.n)}</Crumb></>}
        {fam && !famNet && <span className="ml-1 text-xs text-neutral-500">No student in this family for this search.</span>}
      </nav>
      {data.net.n === 0 ? (
        <div className="flex h-[360px] items-center justify-center rounded-xl bg-neutral-50 p-6 text-center text-sm text-neutral-500">
          No student matches this search. Try fewer words or loosen a filter.
        </div>
      ) : (
        <svg viewBox={`0 0 ${L.w} ${L.h}`} className="block h-auto w-full select-none" role="group" aria-label="Students by career family and role">
          {L.cols.map((c) => (
            <g key={`c${c.x}`}>
              {c.title && <text x={c.x - 8} y={22} fontSize={12} fontWeight={700} fill={MUTED} letterSpacing={0.6}>{c.title.toUpperCase()}</text>}
              {c.hint && <text x={c.x - 8} y={L.h / 2} fontSize={14} fill={MUTED}>{c.hint}</text>}
            </g>
          ))}
          {L.edges.map((e) => {
            const anyOpen = !!famNet;
            const hot = hover === e.to;
            return (
              <path key={e.id} d={e.d} fill="none" strokeLinecap="round" strokeWidth={e.w}
                stroke={hot || (e.on && anyOpen) ? LIT : e.on ? SOFT : "#d4d4d4"} strokeOpacity={hot ? 0.9 : e.on ? (anyOpen ? 0.55 : 0.6) : 0.35} />
            );
          })}
          {L.nodes.map((n) => (
            <NodeMark key={n.id} n={n} r={n.kind === "student" ? byId.get(n.key) : undefined} colorBy={colorBy} selected={selected === n.key}
              hot={hover === n.id} onHover={setHover} onAct={() => up(n)} />
          ))}
        </svg>
      )}
      {hovered && <Tip n={hovered} data={data} w={L.w} h={L.h} r={hovered.kind === "student" ? byId.get(hovered.key) : undefined} colorBy={colorBy} />}
      {roleNet && ready && students.length >= data.results.length && roleNet.n > data.results.length && (
        <p className="mt-1 text-xs text-neutral-500">The graph shows the best {data.results.length} of {fmt(roleNet.n)}; the list below has the same {data.results.length}.</p>
      )}
    </div>
  );
}

function Crumb({ on, onClick, children }: { on: boolean; onClick?: () => void; children: ReactNode }) {
  return on ? (
    <span aria-current="location" className="rounded-md border-[1.5px] border-neutral-900 bg-violet-50 px-2 py-0.5 font-semibold text-neutral-950">{children}</span>
  ) : (
    <button type="button" onClick={onClick} className="rounded-md px-2 py-0.5 font-semibold text-purple-700 hover:bg-violet-50 hover:underline">{children}</button>
  );
}

function NodeMark({ n, r, colorBy, selected, hot, onHover, onAct }: {
  n: LNode; r: WireResult | undefined; colorBy: ColorBy; selected: boolean; hot: boolean; onHover: (id: string | null) => void; onAct: () => void;
}) {
  const faded = !n.on && !hot;
  const words = n.kind === "student" ? `${n.label}. ${r?.headline ?? ""}. Open profile.` : n.kind === "more" || n.kind === "show" ? n.label
    : `${n.label}: ${n.count} students. ${n.open ? "Close." : "Open."}`;
  const hitX = n.x - n.r - 4;
  const hitW = Math.max(n.end - hitX + 4, 2 * n.r + 8);
  const fill = n.kind === "pool" ? "#8b5cf6" : n.open ? LIT : n.key === "none" ? "#ffffff" : n.key === "other" ? "#f5f5f5" : hot ? "#ddd6fe" : "#ede9fe";
  return (
    <g tabIndex={0} role="button" aria-label={words} className="cursor-pointer outline-none" opacity={faded ? 0.55 : 1}
      onMouseEnter={() => onHover(n.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(n.id)} onBlur={() => onHover(null)}
      onClick={onAct} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onAct(); } }}>
      <rect x={hitX} y={n.y - 13} width={hitW} height={26} rx={6} fill={hot && n.kind !== "student" ? "#f5f3ff" : "transparent"} />
      {n.kind === "student" ? (
        <>
          {selected && <circle cx={n.x} cy={n.y} r={n.r + 4} fill="none" stroke={INK} strokeWidth={2} />}
          <circle cx={n.x} cy={n.y} r={n.r} fill={r ? dotColor(r, colorBy) : OTHER_COLOR} stroke="#ffffff" strokeWidth={2} />
          <text x={n.x + n.r + 6} y={n.y + 4.5} fontSize={13} fontWeight={selected ? 800 : 600} fill={INK} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">{n.label}</text>
        </>
      ) : n.kind === "more" || n.kind === "show" ? (
        <>
          <circle cx={n.x} cy={n.y} r={n.r + 3} fill="#ffffff" stroke={LIT} strokeWidth={1.5} strokeDasharray="2 2" />
          <text x={n.x + 12} y={n.y + 4.5} fontSize={13} fontWeight={700} fill={LIT}>{n.label}</text>
        </>
      ) : (
        <>
          {n.kind === "pool" && <circle cx={n.x} cy={n.y} r={n.r + 5} fill="none" stroke="#ddd6fe" strokeWidth={4} />}
          <circle cx={n.x} cy={n.y} r={n.r} fill={fill} stroke={INK} strokeWidth={1.5} strokeDasharray={n.key === "none" ? "3 2" : undefined} />
          {n.kind === "pool" ? (
            n.label && (
              <text x={n.x} y={n.y + n.r + 18} fontSize={13} fontWeight={700} fill={INK} textAnchor="middle">
                {n.count}
              </text>
            )
          ) : (
            n.label && (
              <text x={n.x + n.r + 8} y={n.y + 5} fontSize={14} fontWeight={n.open ? 800 : 650} fill={INK} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
                {n.label}
                <tspan dx={6} fontSize={13} fontWeight={600} fill={MUTED} className="tnum">{n.count}</tspan>
              </text>
            )
          )}
        </>
      )}
    </g>
  );
}

/** What a node is, on hover or focus: a family's share and biggest roles, a role's count, a student's why line. */
function Tip({ n, data, w, h, r, colorBy }: { n: LNode; data: TalentEnvelope; w: number; h: number; r: WireResult | undefined; colorBy: ColorBy }) {
  const x = n.x / w;
  const flip = x > 0.55;
  const fam = n.kind === "fam" ? data.net.families.find((f) => f.key === n.key) : undefined;
  const role = n.kind === "role" ? data.net.families.flatMap((f) => f.roles.map((x) => ({ ...x, fam: f.label }))).find((x) => x.key === n.key) : undefined;
  if (n.kind === "more" || n.kind === "show" || n.kind === "pool") return null;
  return (
    <div className="pointer-events-none absolute z-10 w-64 max-w-[75%] rounded-xl border-2 border-neutral-900 bg-white p-3 text-xs shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]"
      style={{ left: `${x * 100}%`, top: `calc(${(n.y / h) * 100}% + 34px)`, transform: `translate(${flip ? "calc(-100% + 10px)" : "-10px"}, 0)` }}>
      {fam && (
        <>
          <div className="text-sm font-bold text-neutral-950">{fam.label}</div>
          <div className="mt-0.5 text-neutral-600">{fmt(fam.n)} students, {pct(fam.n, data.net.n)} of {fmt(data.net.n)}</div>
          {fam.roles.length > 0 && <div className="mt-1.5 text-neutral-700">{fam.roles.slice(0, 3).map((x) => `${x.label} ${fmt(x.n)}`).join(" · ")}</div>}
          <div className="mt-1.5 font-semibold text-purple-700">{n.open ? "Click to close" : "Click to open its roles"}</div>
        </>
      )}
      {role && (
        <>
          <div className="text-sm font-bold text-neutral-950">{role.label}</div>
          <div className="mt-0.5 text-neutral-600">{fmt(role.n)} students in {role.fam}</div>
          <div className="mt-1.5 font-semibold text-purple-700">{n.open ? "Click to close" : "Click to see the best of them"}</div>
        </>
      )}
      {r && (
        <>
          <div className="text-sm font-bold text-neutral-950">{r.name}</div>
          {r.headline && <div className="mt-0.5 line-clamp-2 text-neutral-600">{r.headline}</div>}
          <div className="mt-1.5 text-neutral-700">{r.place.why}</div>
          <div className="mt-1.5 flex items-center gap-1.5 text-neutral-700">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: dotColor(r, colorBy) }} />
            {colorBy === "style" ? STYLE_LABEL[r.traits?.style ?? ""] ?? "Work style not read" : r.source === "call" ? intentLabel(r.intent) : "Old product"}
            {data.terms.length > 0 && <span className="ml-auto font-semibold text-neutral-950">{r.matched} of {data.terms.length} matched</span>}
          </div>
        </>
      )}
    </div>
  );
}

export function GraphLegend({ colorBy }: { colorBy: ColorBy }) {
  const dot = (c: string) => <span className="inline-block h-3 w-3 rounded-full border-2 border-white ring-1 ring-neutral-200" style={{ background: c }} />;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-neutral-600">
      <span>Circle size and line thickness: number of students. Click a family, then a role, then a student.</span>
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
    </div>
  );
}
