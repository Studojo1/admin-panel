// Shared pieces of the Stu pages: the outlet context, a clickable number that
// opens the people behind it, the source note and the drill-down list.
import { Link, useOutletContext } from "react-router";
import { CHANNELS } from "~/lib/utm-dictionary";
import { type Cell, type Filters, type StuData, type WireUser, type WireVisitor, fmtIst, fmtN, istDay, trackedFromText } from "~/lib/stu/model";

export interface StuCtx {
  data: StuData;
  filters: Filters;
  setFilters: (f: Partial<Filters>) => void;
  drill: (title: string, cell: Cell) => void;
}

export const useStu = () => useOutletContext<StuCtx>();

export const CARD = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";

export const channelLabel = (key: string): string => CHANNELS.find((c) => c.key === key)?.label ?? key;

/** A number that lists its people when clicked. */
export function Num({ cell, title, fmt, className = "" }: { cell: Cell; title: string; fmt?: (n: number) => string; className?: string }) {
  const { drill } = useStu();
  if (cell.na) {
    return <span className={`text-neutral-400 ${className}`} title="Not available here yet: the journey log or its table is not live in this environment">n/a</span>;
  }
  const text = fmt ? fmt(cell.v) : fmtN(cell.v);
  const people = cell.users.length + (cell.visitors?.length ?? 0);
  const old = <CellMark cell={cell} />;
  if (!people) return <span className={`tabular-nums ${className}`}>{text}{old}</span>;
  return (
    <>
      <button
        type="button"
        onClick={() => drill(title, cell)}
        className={`tabular-nums underline decoration-dotted decoration-neutral-400 underline-offset-2 hover:decoration-violet-600 ${className}`}
        title={`${cell.users.length} people${cell.visitors?.length ? `, ${cell.visitors.length} visitors` : ""}: click for the list`}
      >
        {text}
      </button>
      {old}
    </>
  );
}

/** REAL-VISITORS: a visitor number from a log with no page_view at all, so crawlers are in it. */
export function OldMark() {
  return <sup className="ml-0.5 text-[9px] font-semibold uppercase text-amber-600" title="This log has no page_view yet, so the visitor count is the server's visited_home, crawlers included (the old count)">old</sup>;
}

/** ADMIN-FIX (5 Nov 2026): a visitor number whose range starts before visitors were tracked counts from that time. */
export function TrackedMark({ from }: { from: number }) {
  const at = trackedFromText(from);
  return <sup className="ml-0.5 whitespace-nowrap text-[9px] font-semibold text-amber-700" title={`Visitors are counted by page_view, which the site has sent since ${at} IST. The range starts before then, so this counts from ${at}.`}>from {at}</sup>;
}

/** The old or tracked-from mark a cell needs, if any. */
export function CellMark({ cell }: { cell: Cell }) {
  if (cell.old) return <OldMark />;
  if (cell.trackedFrom != null) return <TrackedMark from={cell.trackedFrom} />;
  return null;
}

export function SourceNote({ children }: { children: React.ReactNode }) {
  // DAILY-WIDTH (14 Nov 2026): a note wraps at about 60 characters, so a long one never widens its column (the Daily
  // table's metric column is nowrap and sticky; a 370 character note pushed every day column off the screen).
  return <div className="mt-0.5 max-w-[360px] whitespace-normal text-[10px] leading-tight text-neutral-400">source: {children}</div>;
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h1 className="font-['Clash_Display'] text-2xl font-bold text-neutral-900">{title}</h1>
      {sub && <p className="mt-1 text-sm text-neutral-600">{sub}</p>}
    </div>
  );
}

/** What the drill-down needs: the Stu dataset, or the Overview's people for one section. */
export interface DrillPeople {
  users: Pick<WireUser, "id" | "email" | "name" | "internal" | "joined" | "existing" | "ch">[];
  visitors: (Pick<WireVisitor, "id" | "u"> & Partial<Pick<WireVisitor, "device" | "inapp">>)[];
}

export function DrillModal({ title, cell, data, onClose }: { title: string; cell: Cell; data: DrillPeople; onClose: () => void }) {
  const users = cell.users.map((i) => ({ i, u: data.users[i] })).filter((x) => x.u).sort((a, b) => b.u.joined - a.u.joined);
  const visitors = cell.visitors ?? [];
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/40 p-4 pt-16" onClick={onClose}>
      <div className={`max-h-[80vh] w-full max-w-3xl overflow-hidden ${CARD}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b-2 border-neutral-900 bg-neutral-50 px-5 py-3">
          <div>
            <h2 className="font-['Clash_Display'] text-lg font-bold">{title}</h2>
            <p className="text-xs text-neutral-500">
              {fmtN(cell.v)} shown; {users.length} people{visitors.length ? `, ${visitors.length} visitors` : ""} behind it
            </p>
          </div>
          <button onClick={onClose} className="rounded-lg border-2 border-neutral-900 px-3 py-1 text-sm font-semibold hover:bg-neutral-100">Close</button>
        </div>
        <div className="max-h-[65vh] overflow-y-auto">
          {users.length > 0 && (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-white text-left text-xs uppercase text-neutral-500">
                <tr><th className="px-4 py-2">Person</th><th className="px-4 py-2">Joined (IST)</th><th className="px-4 py-2">Channel</th><th className="px-4 py-2" /></tr>
              </thead>
              <tbody>
                {users.map(({ i, u }) => (
                  <tr key={i} className="border-t border-neutral-100">
                    <td className="px-4 py-2">
                      <div className="font-medium text-neutral-900">{u.email || u.id}</div>
                      <div className="text-xs text-neutral-500">{u.name}{u.internal ? ` · internal: ${u.internal}` : ""}{u.existing ? " · older account" : ""}</div>
                    </td>
                    <td className="px-4 py-2 whitespace-nowrap text-neutral-700">{fmtIst(u.joined)}</td>
                    <td className="px-4 py-2 text-neutral-700">{channelLabel(u.ch)}</td>
                    <td className="px-4 py-2 text-right"><Link to={`/journeys?u=${encodeURIComponent(u.id)}`} onClick={onClose} className="text-violet-700 hover:underline">Journey</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {visitors.length > 0 && (
            <div className="border-t-2 border-neutral-200 px-4 py-3">
              <div className="mb-2 text-xs font-bold uppercase text-neutral-500">Visitor ids (before sign-in)</div>
              <div className="flex flex-wrap gap-1.5">
                {visitors.slice(0, 1000).map((v) => {
                  const w = data.visitors.find((x) => x.id === v);
                  const u = w && w.u >= 0 ? data.users[w.u] : null;
                  const dev = w && "device" in w ? [w.device, w.inapp && w.inapp !== "none" ? `in ${w.inapp}` : null].filter(Boolean).join(", ") : "";
                  return (
                    <span key={v} className="rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[11px] text-neutral-700" title={u ? `became ${u.email}` : "no account yet"}>
                      {v.slice(0, 12)}{dev ? ` (${dev})` : ""}{u ? ` → ${u.email}` : ""}
                    </span>
                  );
                })}
              </div>
            </div>
          )}
          {!users.length && !visitors.length && <div className="p-6 text-sm text-neutral-500">Nobody.</div>}
        </div>
      </div>
    </div>
  );
}

export const joinedDay = (data: StuData, i: number) => istDay(data.users[i].joined);
