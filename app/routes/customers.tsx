// Customers (13 Nov 2026, the owner: "I want to give a team member access to see all our customer data so they can
// focus on finding companies for some super promising ones and get them hired ... Ensure that admin also has all scout
// access. Don't need to create a new scout role. Just make this entire page for admin. On dashboard."). Every Stu
// customer, ranked by how likely they are doing well and happy (a hiring manager said yes, a reply, paid, thanked Stu;
// complaints pull down), with the views a placement push needs (starred, said yes, paid, active, the team's picks, may
// be unhappy). A customer opens beside the list with everything we hold: contact, what they want, the profile and resume,
// the call, Stu's matches, the companies already emailed and the replies (so the team does not repeat them), what they
// said to Stu, the plan. The team stars a customer, keeps a note, and logs the companies it finds for them with where
// each stands (idea, told them, applied, interviewing, offer, hired, dropped). Those notes stay on this dashboard; nothing
// is written to Stu. The view, search, order and open customer live in the URL (?view, q, sort, id, internal).
// Data: /api/customers (app/lib/customers).
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { KIT_CSS } from "~/components/stu/overview-kit";
import { CARD } from "~/components/stu/ui";
import { useAdminGuard } from "~/lib/auth-guard";
import { type DeskState, fetchCustomer, fetchCustomers, saveDesk } from "~/lib/customers/client";
import {
  type CustomersEnvelope, type ListFilters, PICK_LABEL, PICK_STATUSES, type PickStatus, type Sort, TAG_LABEL, type Tag, VIEWS, type View,
  type WireCustomer, type WireDetail, type WirePick, ago, filterCustomers, fmtRupees, inView, tagsOf, waLink,
} from "~/lib/customers/model";

export function meta() {
  return [{ title: "Customers · Studojo Admin" }];
}

const SELECT = "rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5 text-sm";
const BTN = "rounded-lg border-2 border-neutral-900 bg-white px-3 py-1 text-sm font-semibold hover:bg-violet-50";
const INPUT = "w-full rounded-lg border-2 border-neutral-300 bg-white px-2.5 py-1.5 text-sm outline-none focus:border-neutral-900";
const PAGE = 100;

const TAG_STYLE: Record<Tag, string> = {
  yes: "border-emerald-600 bg-emerald-50 text-emerald-800",
  replied: "border-emerald-400 bg-white text-emerald-700",
  paid: "border-violet-600 bg-violet-50 text-violet-800",
  thanked: "border-sky-500 bg-sky-50 text-sky-800",
  unhappy: "border-orange-500 bg-orange-50 text-orange-800",
  refund: "border-red-600 bg-red-50 text-red-700",
  active: "border-neutral-900 bg-white text-neutral-800",
  quiet: "border-neutral-300 bg-white text-neutral-500",
  new: "border-amber-500 bg-amber-50 text-amber-800",
};
const PICK_STYLE: Record<PickStatus, string> = {
  idea: "border-neutral-300 text-neutral-600",
  told: "border-sky-500 text-sky-700",
  applied: "border-violet-500 text-violet-700",
  interview: "border-amber-500 text-amber-700",
  offer: "border-emerald-500 text-emerald-700",
  hired: "border-emerald-700 bg-emerald-600 text-white",
  dropped: "border-neutral-300 text-neutral-400 line-through",
};

function Chip({ tag }: { tag: Tag }) {
  return <span className={`whitespace-nowrap rounded-full border-[1.5px] px-2 py-px text-[11px] font-semibold ${TAG_STYLE[tag]}`}>{TAG_LABEL[tag]}</span>;
}

function Star({ on, onClick, label }: { on: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onClick(); }} aria-pressed={on} aria-label={label} title={on ? "Starred: click to unstar" : "Star as promising"}
      className={`text-xl leading-none ${on ? "text-amber-500" : "text-neutral-300 hover:text-amber-400"}`}>
      {on ? "★" : "☆"}
    </button>
  );
}

export default function Customers() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const view = (VIEWS.some((v) => v.key === params.get("view")) ? params.get("view") : "all") as View;
  const sort = (["recent", "new"].includes(params.get("sort") || "") ? params.get("sort") : "rank") as Sort;
  const q = params.get("q") || "";
  const open = params.get("id");
  const internal = params.get("internal") === "1";
  const [data, setData] = useState<CustomersEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [draft, setDraft] = useState(q);
  const [shown, setShown] = useState(PAGE);
  const [now, setNow] = useState(() => Date.now());

  const setParam = useCallback((o: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(o)) {
        if (v == null || v === "") next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchCustomers({ internal, fresh }));
      setNow(Date.now());
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [internal]);

  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized, load]);
  useEffect(() => setDraft(q), [q]);
  useEffect(() => setShown(PAGE), [view, q, sort]);

  const all = data?.customers ?? [];
  const filters: ListFilters = { view, q, sort };
  const list = useMemo(() => filterCustomers(all, filters, now), [all, view, q, sort, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const counts = useMemo(() => Object.fromEntries(VIEWS.map((v) => [v.key, all.filter((c) => inView(c, v.key, now)).length])) as Record<View, number>, [all, now]);
  const hired = all.filter((c) => c.hired).length;
  const openPicks = all.reduce((a, c) => a + c.picksOpen, 0);

  /** A change to one customer's star, note or picks, mirrored into the list. */
  const patch = useCallback((id: string, d: DeskState) => {
    setData((prev) => prev && {
      ...prev,
      customers: prev.customers.map((c) => c.id !== id ? c : {
        ...c, star: d.star, note: d.note, picks: d.picks.length,
        picksOpen: d.picks.filter((p) => !["hired", "dropped"].includes(p.status)).length, hired: d.picks.some((p) => p.status === "hired"),
      }),
    });
  }, []);

  const toggleStar = useCallback(async (c: WireCustomer) => {
    try {
      patch(c.id, await saveDesk({ op: "star", id: c.id, star: !c.star }));
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
    }
  }, [patch]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const chosen = all.find((c) => c.id === open) ?? null;
  const envName = data ? (data.env === "staging" ? "Staging" : "Production") : "";

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{KIT_CSS}</style>
      <div className="ov mx-auto max-w-[1600px] px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-purple-700">Stu · Get them hired</div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">Customers</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
              <span>Everyone who set up Stu, with everything we hold on them. Star the promising ones, find them companies, and log where each stands.</span>
              {envName && (
                <span className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${data?.env === "production" ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"}`}>{envName}</span>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5 text-sm">
              <input type="checkbox" checked={internal} onChange={(e) => setParam({ internal: e.target.checked ? "1" : null })} /> Include internal accounts
            </label>
            <button type="button" onClick={() => load(true)} className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50">
              {loading ? "Loading..." : "Refresh"}
            </button>
          </div>
        </div>

        {error && <div className="mt-4 rounded-xl border-2 border-red-600 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

        {data && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Stat label="Customers" value={all.length} onClick={() => setParam({ view: null })} />
            <Stat label="Hiring manager said yes" value={counts.yes} onClick={() => setParam({ view: "yes" })} />
            <Stat label="Paid" value={counts.paid} onClick={() => setParam({ view: "paid" })} />
            <Stat label="Active this week" value={counts.active} onClick={() => setParam({ view: "active" })} />
            <Stat label="Starred" value={counts.starred} onClick={() => setParam({ view: "starred" })} />
            <Stat label="Open team picks · hired" value={`${openPicks} · ${hired}`} onClick={() => setParam({ view: "picks" })} />
          </div>
        )}

        <div className="mt-5 flex flex-col gap-2 xl:flex-row xl:items-center">
          <div className="seg flex-wrap" role="group" aria-label="View">
            {VIEWS.map((v) => (
              <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setParam({ view: v.key === "all" ? null : v.key })}>
                {v.label} <span className="opacity-60">{data ? counts[v.key] : ""}</span>
              </button>
            ))}
          </div>
          <form className="flex min-w-0 flex-1 gap-2" onSubmit={(e) => { e.preventDefault(); setParam({ q: draft.trim() || null }); }}>
            <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={() => setParam({ q: draft.trim() || null })}
              aria-label="Search customers" placeholder="Name, email, phone, role or city: data analyst bengaluru"
              className="min-w-0 flex-1 rounded-xl border-2 border-neutral-900 bg-white px-3 py-2 text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] outline-none focus:bg-violet-50/40" />
            <select aria-label="Order" value={sort} onChange={(e) => setParam({ sort: e.target.value === "rank" ? null : e.target.value })} className={SELECT}>
              <option value="rank">Most promising first</option>
              <option value="recent">Last active first</option>
              <option value="new">Newest sign-ups first</option>
            </select>
          </form>
        </div>

        <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(420px,560px)]">
          <div className="min-w-0">
            <div className={`relative overflow-x-auto ${CARD}`}>
              <table className="w-full min-w-[820px] text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="w-8 px-3 py-2"><span className="sr-only">Star</span></th>
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-3 py-2">Wants</th>
                    <th className="px-3 py-2">Outreach</th>
                    <th className="px-3 py-2">Last active</th>
                    <th className="px-3 py-2">Team</th>
                    <th className="px-3 py-2 text-right">Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {list.slice(0, shown).map((c) => (
                    <tr key={c.id} onClick={() => setParam({ id: c.id })}
                      className={`cursor-pointer border-t border-neutral-100 align-top hover:bg-violet-50/50 ${c.id === open ? "bg-violet-50" : ""}`}>
                      <td className="px-3 py-2.5"><Star on={c.star} onClick={() => toggleStar(c)} label={`Star ${c.name || c.email}`} /></td>
                      <td className="px-3 py-2.5">
                        <div className="font-semibold text-neutral-950">{c.name || c.email}{c.internal && <span className="ml-1.5 text-[11px] font-semibold text-neutral-400">({c.internal})</span>}</div>
                        {c.headline && <div className="mt-0.5 line-clamp-1 max-w-[320px] text-xs text-neutral-500">{c.headline}</div>}
                        <div className="mt-1 flex max-w-[360px] flex-wrap gap-1">{tagsOf(c.s, c.signedUp, now).filter((t) => t !== "quiet").map((t) => <Chip key={t} tag={t} />)}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-700">
                        <div className="line-clamp-2 max-w-[220px]">{c.roles.slice(0, 3).join(", ") || <span className="text-neutral-400">No roles yet</span>}</div>
                        <div className="mt-0.5 max-w-[220px] truncate text-neutral-500">{[...c.cities.slice(0, 3), c.remote ? "remote" : ""].filter(Boolean).join(", ")}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-700">
                        <div>{c.s.sent} sent{c.s.companies ? ` · ${c.s.companies} cos` : ""}</div>
                        {c.s.replies > 0 && <div className="font-semibold text-emerald-700">{c.s.replies} repl{c.s.replies === 1 ? "y" : "ies"}{c.s.posReplies ? `, ${c.s.posReplies} yes` : ""}</div>}
                        {c.s.paid && <div className="text-violet-700">Paid ({c.s.paid})</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-600">{ago(c.s.lastSeen, now)}<div className="text-neutral-400">{c.s.days21} day{c.s.days21 === 1 ? "" : "s"} in 3 wks</div></td>
                      <td className="px-3 py-2.5 text-xs">
                        {c.hired ? <span className="font-bold text-emerald-700">Hired</span> : c.picks ? <span>{c.picksOpen} open of {c.picks}</span> : <span className="text-neutral-300">None</span>}
                        {c.note && <div className="mt-0.5 line-clamp-1 max-w-[140px] text-neutral-500" title={c.note}>{c.note}</div>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-neutral-800">{c.score}</td>
                    </tr>
                  ))}
                  {data && !list.length && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">Nobody here. Try another view or fewer words.</td></tr>
                  )}
                  {!data && !error && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">Loading customers...</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            {list.length > shown && (
              <button type="button" onClick={() => setShown((n) => n + PAGE)} className={`mt-3 ${BTN}`}>Show {Math.min(PAGE, list.length - shown)} more of {list.length - shown}</button>
            )}
            <p className="mt-3 text-xs text-neutral-400">
              Most promising first: starred, then a hiring manager saying yes (counts most), any reply, paying, thanking Stu, then desk and resume calls,
              emails sent, active days and jobs saved or applied to. Complaints and a refund ask pull a customer down. Thanks and complaints are read from
              their own short messages to Stu, by keywords, so check them before you call.
              {data ? ` Read ${ago(data.at, now)}.` : ""}
            </p>
          </div>

          <div className={`max-h-[calc(100vh-120px)] overflow-y-auto lg:sticky lg:top-4 ${CARD}`}>
            {open ? (
              <Panel key={open} id={open} summary={chosen} now={now} onClose={() => setParam({ id: null })} onDesk={patch} onStar={toggleStar} />
            ) : (
              <div className="p-6 text-sm text-neutral-500">
                <div className="font-semibold text-neutral-800">Pick a customer</div>
                Click a row to see everything we hold on them, the companies they have already emailed, and the team's notes and picks.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, onClick }: { label: string; value: number | string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={`p-3 text-left hover:bg-violet-50 ${CARD}`}>
      <div className="text-2xl font-bold tabular-nums text-neutral-950">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</div>
      <div className="text-xs font-semibold text-neutral-500">{label}</div>
    </button>
  );
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mt-6">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-bold uppercase tracking-wide text-purple-700">{title}</h3>
        {right}
      </div>
      {children}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: ReactNode }) {
  const empty = v == null || v === "" || (Array.isArray(v) && !v.length);
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{k}</div>
      <div className="text-sm text-neutral-900">{empty ? <span className="text-neutral-400">Not said</span> : v}</div>
    </div>
  );
}

const joined = (xs: string[]) => (xs.length ? xs.join(", ") : null);
const fmtDate = (ms: number | null) => (ms ? new Date(ms).toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" }) : "");
const fmtWhen = (ms: number) => new Date(ms).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "Asia/Kolkata" });

function why(c: WireCustomer): string {
  const s = c.s;
  const parts = [
    s.posReplies ? `${s.posReplies} hiring manager${s.posReplies === 1 ? "" : "s"} said yes` : "",
    s.replies > s.posReplies ? `${s.replies - s.posReplies} other repl${s.replies - s.posReplies === 1 ? "y" : "ies"}` : "",
    s.paid ? `paid (${s.paid})` : "",
    s.praise ? `thanked Stu ${s.praise}×` : "",
    s.gripes ? `complained ${s.gripes}×` : "",
    s.refund ? "asked for a refund" : "",
    s.desk + s.build ? `${s.desk + s.build} desk or resume call${s.desk + s.build === 1 ? "" : "s"}` : "",
    s.sent ? `${s.sent} emails sent` : "",
    s.days21 ? `active ${s.days21} day${s.days21 === 1 ? "" : "s"} in 3 weeks` : "",
    s.saved + s.applied ? `${s.saved} saved, ${s.applied} applied` : "",
  ].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing yet";
}

function Panel({ id, summary, now, onClose, onDesk, onStar }: {
  id: string; summary: WireCustomer | null; now: number; onClose: () => void; onDesk: (id: string, d: DeskState) => void; onStar: (c: WireCustomer) => void;
}) {
  const [d, setD] = useState<WireDetail | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    let gone = false;
    setD(null);
    setErr("");
    fetchCustomer(id).then((x) => { if (!gone) setD(x); }, (e) => { if (!gone) setErr(e?.message || "Failed to load"); });
    return () => { gone = true; };
  }, [id]);

  const c = summary ?? d?.c ?? null;
  const desk = useCallback(async (body: Record<string, unknown>, ok?: string) => {
    try {
      const out = await saveDesk({ ...body, id });
      setD((prev) => prev && { ...prev, picks: out.picks, c: { ...prev.c, star: out.star, note: out.note } });
      onDesk(id, out);
      if (ok) toast.success(ok);
      return true;
    } catch (e: any) {
      toast.error(e?.message || "Could not save");
      return false;
    }
  }, [id, onDesk]);

  if (err) return <div className="p-6 text-sm text-red-700">{err} <button type="button" onClick={onClose} className="ml-2 underline">Close</button></div>;
  if (!c) return <div className="p-6 text-sm text-neutral-500">Loading...</div>;
  const wa = waLink(c.phone);

  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <Star on={c.star} onClick={() => onStar(c)} label="Star as promising" />
        <div className="min-w-0 flex-1">
          <h2 className="font-['Clash_Display'] text-2xl font-medium leading-tight text-neutral-950">{c.name || c.email}</h2>
          {c.headline && <p className="mt-0.5 text-sm text-neutral-700">{c.headline}</p>}
          <div className="mt-1.5 flex flex-wrap gap-1">{tagsOf(c.s, c.signedUp, now).map((t) => <Chip key={t} tag={t} />)}</div>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-lg border-2 border-neutral-900 bg-white px-2 text-lg font-bold leading-7 hover:bg-neutral-50">×</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        {c.phone && <a href={`tel:${c.phone}`} className={BTN}>{c.phone}</a>}
        {wa && c.whatsapp && <a href={wa} target="_blank" rel="noreferrer" className={BTN}>WhatsApp</a>}
        {c.email && <a href={`mailto:${c.email}`} className={`${BTN} max-w-full truncate`}>{c.email}</a>}
        <Link to={`/journeys?u=${encodeURIComponent(c.id)}`} className={BTN}>Journey</Link>
        <Link to={`/talent?id=${encodeURIComponent(c.id)}`} className={BTN}>Talent profile</Link>
      </div>
      <p className="mt-2 text-xs text-neutral-500">
        Signed up {fmtDate(c.signedUp)} · last active {ago(c.s.lastSeen, now)} · rank {c.score}: {why(c)}
      </p>

      {!d ? (
        <div className="mt-6 text-sm text-neutral-500">Loading their details...</div>
      ) : (
        <>
          <TeamDesk d={d} desk={desk} />

          <Section title="Companies already in their outreach" right={<span className="text-xs text-neutral-400">{d.outreach.length}</span>}>
            {d.outreach.length ? (
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                {d.outreach.map((o, i) => (
                  <li key={i} className="px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="font-semibold text-neutral-900">{o.company || o.to.split("@")[1]?.replace(">", "") || "Unknown company"}</span>
                      <span className={`text-xs font-semibold ${o.tag === "positive" ? "text-emerald-700" : o.replied ? "text-emerald-600" : "text-neutral-500"}`}>
                        {o.replied ? `${o.tag === "positive" ? "Said yes" : "Replied"} ${fmtDate(o.replied)}` : `${o.status}${o.sent ? `, ${o.sent} sent` : ""}`}
                      </span>
                    </div>
                    <div className="text-xs text-neutral-500">{[o.title, o.to].filter(Boolean).join(" · ")}</div>
                    {o.reply && <div className="mt-1 whitespace-pre-wrap rounded-lg bg-emerald-50 px-2 py-1 text-xs text-emerald-900">{o.reply}</div>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-neutral-400">No emails yet.</p>}
          </Section>

          <Section title="What they want">
            <div className="grid grid-cols-2 gap-3">
              <Fact k="Roles" v={joined(d.wants.roles)} />
              <Fact k="Also open to" v={joined(d.wants.adjacent)} />
              <Fact k="Cities" v={joined(d.wants.cities)} />
              <Fact k="Relocate" v={d.wants.relocate} />
              <Fact k="Work mode" v={joined(d.wants.modes)} />
              <Fact k="Job type" v={joined(d.wants.types)} />
              <Fact k="Pay (fixed, a year)" v={d.wants.payYear ? fmtRupees(d.wants.payYear) : null} />
              <Fact k="Stipend (a month)" v={d.wants.stipendMonth ? fmtRupees(d.wants.stipendMonth) : null} />
              <Fact k="Paid now" v={d.wants.payNow} />
              <Fact k="Notice or start" v={[d.wants.notice, d.wants.from].filter(Boolean).join(", ")} />
              <Fact k="Looking" v={d.wants.intent} />
              <Fact k="Company stage" v={joined(d.wants.stages)} />
              <Fact k="Sectors" v={joined(d.wants.sectors)} />
              <Fact k="Values" v={joined(d.wants.values)} />
              <Fact k="Won't do" v={joined([...d.wants.refused, ...d.wants.sectorsRefused])} />
              <Fact k="Avoid companies" v={joined(d.wants.avoid)} />
            </div>
            {d.wants.whyNow && <p className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-sm text-neutral-800"><span className="font-semibold">Why now: </span>{d.wants.whyNow}</p>}
          </Section>

          <Section title="Profile">
            <div className="grid grid-cols-2 gap-3">
              <Fact k="Now" v={[d.profile.title, d.profile.org].filter(Boolean).join(", ")} />
              <Fact k="Experience" v={d.profile.expMonths != null ? `${Math.floor(d.profile.expMonths / 12)} y ${d.profile.expMonths % 12} m` : null} />
              <Fact k="Degree" v={d.profile.degree} />
              <Fact k="Graduates" v={d.profile.grad ? String(d.profile.grad) : null} />
            </div>
            {d.profile.summary && <p className="mt-3 text-sm text-neutral-800">{d.profile.summary}</p>}
            {d.profile.experience.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {d.profile.experience.map((e, i) => <li key={i}><span className="font-semibold">{e.title}</span>{e.company ? `, ${e.company}` : ""} <span className="text-xs text-neutral-400">{e.when}</span></li>)}
              </ul>
            )}
            {d.profile.education.length > 0 && (
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                {d.profile.education.map((e, i) => <li key={i}>{e.school}{e.degree ? `, ${e.degree}` : ""} <span className="text-xs text-neutral-400">{e.when}</span></li>)}
              </ul>
            )}
            {d.profile.skills.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1">{d.profile.skills.map((s) => <span key={s} className="rounded-md border border-neutral-200 px-1.5 py-px text-xs text-neutral-700">{s}</span>)}</div>
            )}
            {d.profile.projects.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-neutral-600">
                {d.profile.projects.map((p, i) => <li key={i}><span className="font-semibold text-neutral-800">{p.name}</span>{p.tech ? ` (${p.tech})` : ""}</li>)}
              </ul>
            )}
            {d.profile.links.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2 text-xs">{d.profile.links.map((l) => <a key={l} href={l} target="_blank" rel="noreferrer" className="text-purple-700 underline">{l.replace(/^https?:\/\/(www\.)?/, "").slice(0, 50)}</a>)}</div>
            )}
          </Section>

          {d.call?.summary && (
            <Section title={`Their call with Stu, ${fmtDate(d.call.at)} (${d.call.minutes} min)`}>
              <p className="text-sm text-neutral-800">{d.call.summary}</p>
            </Section>
          )}

          <Section title="Stu's matches" right={<span className="text-xs text-neutral-400">{Object.entries(d.matches.counts).map(([k, n]) => `${n} ${k}`).join(" · ")}</span>}>
            {d.matches.top.length ? (
              <ul className="divide-y divide-neutral-100 rounded-xl border border-neutral-200">
                {d.matches.top.map((m, i) => (
                  <li key={i} className="flex items-baseline justify-between gap-2 px-3 py-1.5 text-sm">
                    <span className="min-w-0">
                      {m.link ? <a href={m.link} target="_blank" rel="noreferrer" className="font-semibold text-neutral-900 hover:underline">{m.title}</a> : <span className="font-semibold">{m.title}</span>}
                      <span className="text-neutral-600">, {m.company}</span>
                      {m.where && <span className="text-xs text-neutral-400"> · {m.where}</span>}
                    </span>
                    <span className={`shrink-0 text-xs font-semibold ${m.state === "applied" ? "text-emerald-700" : m.state === "saved" ? "text-violet-700" : m.state === "passed" ? "text-neutral-400" : "text-neutral-500"}`}>{m.state} · {m.score}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-neutral-400">No matches.</p>}
          </Section>

          <Section title="What they said to Stu" right={<span className="text-xs text-neutral-400">latest {d.said.length}</span>}>
            {d.said.length ? (
              <ul className="space-y-1.5">
                {d.said.map((m, i) => (
                  <li key={i} className={`rounded-lg px-2.5 py-1.5 text-sm ${m.tone === "gripe" ? "bg-orange-50 text-orange-900" : m.tone === "praise" ? "bg-sky-50 text-sky-900" : "bg-neutral-50 text-neutral-800"}`}>
                    <div className="text-[11px] text-neutral-400">{fmtWhen(m.at)} · {m.via === "whatsapp" ? "WhatsApp" : "Chat"}</div>
                    <div className="line-clamp-4 whitespace-pre-wrap">{m.text}</div>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-neutral-400">Nothing yet.</p>}
          </Section>

          <Section title="Plan and payments">
            <div className="text-sm text-neutral-800">
              <div>Plan: {d.plan.plan || "free"}</div>
              {d.plan.grants.map((g, i) => <div key={i} className="text-xs text-neutral-600">{g.source}{g.ends ? `, until ${fmtDate(g.ends)}` : ""}</div>)}
              {d.plan.orders.map((o, i) => <div key={i} className="text-xs text-neutral-600">{o.item || "Order"}: ₹{o.rupees.toLocaleString("en-IN")} on {fmtDate(o.at)}</div>)}
            </div>
            {d.calls.length > 0 && (
              <div className="mt-2 text-xs text-neutral-500">Calls with Stu: {d.calls.map((x) => `${x.mode} ${fmtDate(x.at)} (${x.minutes} min)`).join(", ")}</div>
            )}
          </Section>

          <Section title="Resume" right={d.resume.file ? <span className="text-xs text-neutral-400">{d.resume.file}</span> : undefined}>
            {d.resume.text ? (
              <details className="rounded-xl border border-neutral-200">
                <summary className="cursor-pointer px-3 py-2 text-sm font-semibold text-neutral-800">Show the resume text</summary>
                <pre className="max-h-[480px] overflow-auto whitespace-pre-wrap px-3 pb-3 font-['Satoshi'] text-xs text-neutral-800">{d.resume.text}</pre>
              </details>
            ) : <p className="text-sm text-neutral-400">No resume text.</p>}
          </Section>
        </>
      )}
    </div>
  );
}

function TeamDesk({ d, desk }: { d: WireDetail; desk: (body: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [note, setNote] = useState(d.c.note);
  const [form, setForm] = useState({ company: "", role: "", link: "", contact: "", note: "", status: "idea" as PickStatus });
  const [saving, setSaving] = useState(false);
  useEffect(() => setNote(d.c.note), [d.c.note]);

  const add = async () => {
    if (!form.company.trim()) return toast.error("Add the company");
    setSaving(true);
    if (await desk({ op: "pick", ...form }, "Pick added")) setForm({ company: "", role: "", link: "", contact: "", note: "", status: "idea" });
    setSaving(false);
  };

  return (
    <Section title="Team: notes and picks" right={<span className="text-xs text-neutral-400">Only on this dashboard; the customer does not see these</span>}>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== d.c.note && desk({ op: "note", note }, "Note saved")}
        rows={2} placeholder="A note for the team: what they are great at, what to push for, when to call..." className={INPUT} />

      {d.picks.length > 0 && (
        <ul className="mt-3 space-y-2">
          {d.picks.map((p) => <PickRow key={p.id} p={p} desk={desk} />)}
        </ul>
      )}

      <div className="mt-3 rounded-xl border-2 border-dashed border-neutral-300 p-3">
        <div className="mb-2 text-xs font-bold text-neutral-700">Add a company for them</div>
        <div className="grid grid-cols-2 gap-2">
          <input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} placeholder="Company *" className={INPUT} />
          <input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} placeholder="Role" className={INPUT} />
          <input value={form.link} onChange={(e) => setForm({ ...form, link: e.target.value })} placeholder="Job or company link" className={INPUT} />
          <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Who to reach (name, email)" className={INPUT} />
          <input value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} placeholder="Why it fits" className={`${INPUT} col-span-2`} />
        </div>
        <div className="mt-2 flex items-center gap-2">
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as PickStatus })} className={SELECT} aria-label="Where it stands">
            {PICK_STATUSES.map((s) => <option key={s} value={s}>{PICK_LABEL[s]}</option>)}
          </select>
          <button type="button" disabled={saving} onClick={add}
            className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-3 py-1.5 text-sm font-bold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-purple-600 disabled:opacity-60">
            {saving ? "Adding..." : "Add"}
          </button>
        </div>
      </div>
    </Section>
  );
}

function PickRow({ p, desk }: { p: WirePick; desk: (body: Record<string, unknown>, ok?: string) => Promise<boolean> }) {
  const [note, setNote] = useState(p.note);
  useEffect(() => setNote(p.note), [p.note]);
  return (
    <li className="rounded-xl border border-neutral-200 px-3 py-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          {p.link ? <a href={p.link} target="_blank" rel="noreferrer" className="font-semibold text-neutral-950 hover:underline">{p.company}</a> : <span className="font-semibold text-neutral-950">{p.company}</span>}
          {p.role && <span className="text-neutral-600">, {p.role}</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <select value={p.status} onChange={(e) => desk({ op: "pick-update", pickId: p.id, status: e.target.value })} aria-label={`Where ${p.company} stands`}
            className={`rounded-full border-[1.5px] bg-white px-2 py-0.5 text-xs font-semibold ${PICK_STYLE[p.status]}`}>
            {PICK_STATUSES.map((s) => <option key={s} value={s}>{PICK_LABEL[s]}</option>)}
          </select>
          <button type="button" aria-label={`Remove ${p.company}`} title="Remove"
            onClick={() => { if (window.confirm(`Remove ${p.company} from their picks?`)) desk({ op: "pick-delete", pickId: p.id }, "Removed"); }}
            className="px-1 text-neutral-400 hover:text-red-600">×</button>
        </div>
      </div>
      {p.contact && <div className="text-xs text-neutral-600">Reach: {p.contact}</div>}
      <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== p.note && desk({ op: "pick-update", pickId: p.id, note })}
        placeholder="Note" className="mt-1 w-full border-0 border-b border-transparent bg-transparent px-0 py-0.5 text-xs text-neutral-700 outline-none hover:border-neutral-200 focus:border-neutral-900" />
      <div className="text-[11px] text-neutral-400">Added {fmtDate(p.createdAt)}{p.by ? ` · last change by ${p.by}` : ""}</div>
    </li>
  );
}
