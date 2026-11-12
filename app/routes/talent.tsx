// Talent search (12 Nov 2026, the owner: "we do have studojo student data right after the call ... make a page which
// is like a graph to do a student search for like hiring managers to find the students"). Type what a hiring manager
// needs ("data analyst python sql bengaluru"), narrow by city, job type, experience, grad year, budget and intent; the
// graph shows who matches which part of it and the list ranks them. A profile opens beside the graph with what the call
// and the resume gave us. Only students whose page lets hiring managers on Studojo find them are searched. A shortlist
// copies as plain text for a hiring manager, with no email address or phone number in it.
// The filters live in the URL (?q, city, type, exp, grad, active, budget, relocate, internal) and ?id opens a profile.
// Read only (/api/talent, app/lib/talent).
import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AdminHeader } from "~/components";
import { KIT_CSS } from "~/components/stu/overview-kit";
import { CARD } from "~/components/stu/ui";
import { GraphLegend, TalentGraph, intentColor } from "~/components/talent/talent-graph";
import { useAdminGuard } from "~/lib/auth-guard";
import { fetchTalent } from "~/lib/talent/client";
import {
  BUDGETS, DEFAULT_FILTERS, type Brief, type ExpFilter, type Filters, type Hub, MODE_LABEL, TYPE_LABEL, type TypeFilter,
  askText, briefOf, expText, intentLabel, shortlistText,
} from "~/lib/talent/model";
import type { TalentEnvelope, WireResult } from "~/lib/talent/wire";

export function meta() {
  return [{ title: "Talent search · Studojo Admin" }];
}

const SELECT = "rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5 text-sm";
const EXAMPLES = ["data analyst python sql", "social media manager mumbai", "full stack developer intern 2026", "founder's office bengaluru"];
const SHORTLIST_KEY = "talent-shortlist-v1";
const TERM_KIND: Record<string, string> = { city: "City", grad: "Grad", type: "Type", mode: "Mode", exp: "Experience" };

function readShortlist(): Brief[] {
  try {
    const v = JSON.parse(localStorage.getItem(SHORTLIST_KEY) || "[]");
    return Array.isArray(v) ? v.filter((x) => x && typeof x.id === "string") : [];
  } catch {
    return [];
  }
}
function saveShortlist(list: Brief[]) {
  try {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify(list));
  } catch {
    // private window or blocked storage: the shortlist lasts this visit only
  }
}

export default function Talent() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const grad = Number(params.get("grad"));
  const filters: Filters = {
    ...DEFAULT_FILTERS,
    q: params.get("q") || "",
    city: params.get("city") || "",
    type: (["internship", "full_time"].includes(params.get("type") || "") ? params.get("type") : "any") as TypeFilter,
    exp: (["fresher", "1-3", "3+"].includes(params.get("exp") || "") ? params.get("exp") : "any") as ExpFilter,
    grad: Number.isInteger(grad) && grad > 1990 ? grad : null,
    active: params.get("active") === "1",
    budget: params.get("budget") || "",
    relocate: params.get("relocate") !== "0",
  };
  const internal = params.get("internal") === "1";
  const open = params.get("id");
  const key = JSON.stringify([filters, internal]);

  const setParam = useCallback((patch: Record<string, string | null>) => {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(patch)) {
        if (v == null || v === "" || v === "any") next.delete(k);
        else next.set(k, v);
      }
      return next;
    }, { replace: true });
  }, [setParams]);

  const [draft, setDraft] = useState(filters.q);
  useEffect(() => setDraft(filters.q), [filters.q]);

  const [data, setData] = useState<TalentEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (fresh = false) => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchTalent(filters, { internal, fresh }));
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized, load]);

  const [shortlist, setShortlist] = useState<Brief[]>([]);
  useEffect(() => setShortlist(readShortlist()), []);
  const listed = useMemo(() => new Set(shortlist.map((b) => b.id)), [shortlist]);
  const toggle = (r: WireResult) => {
    const next = listed.has(r.id) ? shortlist.filter((b) => b.id !== r.id) : [...shortlist, briefOf(r)];
    setShortlist(next);
    saveShortlist(next);
  };
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shortlistText(shortlist));
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("The browser did not allow copying. Select the text in the shortlist instead.");
    }
  };

  const onHub = (h: Hub) => {
    if (h.kind === "term") return;
    const words = filters.q.trim();
    setParam({ q: words ? `${words}, ${h.label}` : h.label, id: null });
  };

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const results = data?.results ?? [];
  const chosen = results.find((r) => r.id === open) ?? null;
  const searching = (data?.terms.length ?? 0) > 0;
  const envName = data ? (data.env === "staging" ? "Staging" : "Production") : "";
  const filtered = !!(filters.city || filters.type !== "any" || filters.exp !== "any" || filters.grad != null || filters.active || filters.budget);

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{KIT_CSS}</style>
      <div className="ov mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-purple-700">Stu · For hiring managers</div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">Talent search</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
              <span>
                Students who finished their call and let hiring managers on Studojo find their page
                {data ? `: ${data.pool.toLocaleString("en-IN")}` : ""}. Profiles come from the call and the resume, in their words; nothing here is checked by us.
              </span>
              {envName && (
                <span className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${data?.env === "production" ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"}`}>{envName}</span>
              )}
            </p>
          </div>
          <button type="button" onClick={() => load(true)} className="self-start rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50 lg:self-auto">
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>

        <form className="mt-5 flex flex-col gap-2 sm:flex-row" onSubmit={(e) => { e.preventDefault(); setParam({ q: draft.trim() || null, id: null }); }}>
          <input type="search" value={draft} onChange={(e) => setDraft(e.target.value)} aria-label="What the hiring manager needs"
            placeholder="What does the hiring manager need? A role, skills, a city, a grad year: data analyst python sql bengaluru"
            className="min-w-0 flex-1 rounded-xl border-2 border-neutral-900 bg-white px-4 py-3 text-base shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] outline-none focus:bg-violet-50/40" />
          <button type="submit" className="rounded-xl border-2 border-neutral-900 bg-purple-500 px-5 py-3 text-base font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] hover:bg-purple-600">Search</button>
        </form>
        {!filters.q && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
            <span>Try:</span>
            {EXAMPLES.map((x) => (
              <button key={x} type="button" onClick={() => setParam({ q: x, id: null })} className="rounded-full border border-neutral-300 bg-white px-2.5 py-1 font-medium text-neutral-700 hover:border-purple-500 hover:text-purple-700">{x}</button>
            ))}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="City" value={filters.city} onChange={(e) => setParam({ city: e.target.value, id: null })} className={SELECT}>
            <option value="">Any city</option>
            {(data?.cities ?? []).map((c) => <option key={c.key} value={c.key}>{c.label} ({c.n})</option>)}
          </select>
          <select aria-label="Job type" value={filters.type} onChange={(e) => setParam({ type: e.target.value, id: null })} className={SELECT}>
            <option value="any">Internship or full-time</option>
            <option value="internship">Internship</option>
            <option value="full_time">Full-time</option>
          </select>
          <select aria-label="Experience" value={filters.exp} onChange={(e) => setParam({ exp: e.target.value, id: null })} className={SELECT}>
            <option value="any">Any experience</option>
            <option value="fresher">Fresher (under a year)</option>
            <option value="1-3">1 to 3 years</option>
            <option value="3+">3 years or more</option>
          </select>
          <select aria-label="Graduation year" value={filters.grad ?? ""} onChange={(e) => setParam({ grad: e.target.value, id: null })} className={SELECT}>
            <option value="">Any grad year</option>
            {(data?.grads ?? []).map((g) => <option key={g} value={g}>Graduates {g}</option>)}
          </select>
          <select aria-label="Budget" value={filters.budget} onChange={(e) => setParam({ budget: e.target.value, id: null })} className={SELECT}>
            <option value="">Any budget</option>
            {BUDGETS.map((b) => <option key={b.key} value={b.key}>{b.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5">
            <input type="checkbox" checked={filters.active} onChange={(e) => setParam({ active: e.target.checked ? "1" : null, id: null })} /> Actively looking only
          </label>
          {filters.city && (
            <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5">
              <input type="checkbox" checked={filters.relocate} onChange={(e) => setParam({ relocate: e.target.checked ? null : "0", id: null })} /> Include willing to relocate
            </label>
          )}
          <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5">
            <input type="checkbox" checked={internal} onChange={(e) => setParam({ internal: e.target.checked ? "1" : null })} /> Include internal
          </label>
          {(filtered || filters.q) && (
            <button type="button" onClick={() => setParams(new URLSearchParams(), { replace: true })} className="font-semibold text-purple-700 hover:underline">Clear all</button>
          )}
        </div>

        {data && searching && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-neutral-600">
            <span>Read as:</span>
            {data.terms.map((t) => (
              <span key={`${t.kind}:${t.key}`} className="rounded-md border-[1.5px] border-neutral-900 bg-violet-50 px-2 py-0.5 font-semibold text-neutral-900">
                {t.kind === "text" ? t.label : `${TERM_KIND[t.kind]}: ${t.label}`}
              </span>
            ))}
            <span className="ml-1">Use commas to keep words together, like "growth marketing, d2c".</span>
          </div>
        )}

        {error && <div className={`mt-4 p-4 text-sm text-red-700 ${CARD}`}>{error}</div>}
        {data && !data.live && (
          <div className={`mt-4 p-4 text-sm text-neutral-600 ${CARD}`}>The candidate tables are not in this database yet (career_agent.career_cand_profile and career_cand_claims).</div>
        )}

        {data && data.live && (
          <>
            <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
              <div className={`p-4 ${CARD}`}>
                <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-base font-bold text-neutral-950">
                    {searching ? `${data.total.toLocaleString("en-IN")} student${data.total === 1 ? "" : "s"} match` : "The pool by skill and wanted role"}
                  </h2>
                  <span className="text-xs text-neutral-500">
                    {data.total > data.results.length ? `The graph and list show the best ${data.results.length}` : `${data.graph.links.length} on the graph`}
                  </span>
                </div>
                <TalentGraph data={data} selected={open} onSelect={(id) => setParam({ id })} onHub={onHub} dim={loading} />
                <div className="mt-3 border-t border-neutral-100 pt-3"><GraphLegend searching={searching} /></div>
              </div>
              <div className={`max-h-[860px] overflow-y-auto ${CARD}`}>
                {chosen ? (
                  <Profile r={chosen} terms={data.terms.length} onClose={() => setParam({ id: null })} listed={listed.has(chosen.id)} onToggle={() => toggle(chosen)} />
                ) : (
                  <div className="p-6 text-sm text-neutral-500">
                    <div className="font-semibold text-neutral-800">Pick a student</div>
                    Click a dot on the graph or a row below to see their profile here.
                    {shortlist.length > 0 && <Shortlist list={shortlist} copied={copied} onCopy={copy} onRemove={(id) => { const n = shortlist.filter((b) => b.id !== id); setShortlist(n); saveShortlist(n); }} onOpen={(id) => setParam({ id })} canOpen={(id) => results.some((r) => r.id === id)} />}
                  </div>
                )}
              </div>
            </div>

            {chosen && shortlist.length > 0 && (
              <div className={`mt-4 p-4 ${CARD}`}>
                <Shortlist list={shortlist} copied={copied} onCopy={copy} onRemove={(id) => { const n = shortlist.filter((b) => b.id !== id); setShortlist(n); saveShortlist(n); }} onOpen={(id) => setParam({ id })} canOpen={(id) => results.some((r) => r.id === id)} />
              </div>
            )}

            <div className={`relative mt-6 overflow-x-auto ${CARD}`}>
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Student</th>
                    <th className="px-3 py-2">Wants</th>
                    <th className="px-3 py-2">Experience</th>
                    <th className="px-3 py-2">City</th>
                    <th className="px-3 py-2">{searching ? "Matched" : "Top skills"}</th>
                    <th className="px-3 py-2"><span className="sr-only">Shortlist</span></th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.id} onClick={() => setParam({ id: r.id })} className={`cursor-pointer border-t border-neutral-100 align-top hover:bg-violet-50 ${open === r.id ? "bg-violet-100" : ""}`}>
                      <td className="px-3 py-2.5 text-xs text-neutral-500 tnum">{i + 1}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: intentColor(r.intent) }} title={intentLabel(r.intent)} />
                          <span className="font-semibold text-neutral-950">{r.name}</span>
                        </div>
                        <div className="mt-0.5 line-clamp-1 max-w-[340px] text-xs text-neutral-500">{r.headline || [r.title, r.org].filter(Boolean).join(", ") || r.status || ""}</div>
                      </td>
                      <td className="px-3 py-2.5 text-xs text-neutral-700">
                        <div className="line-clamp-2 max-w-[220px]">{r.rolesWanted.slice(0, 2).join(", ") || "Not said"}</div>
                        <div className="text-neutral-500">{r.types.map((t) => TYPE_LABEL[t] ?? t).join(", ")}</div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-xs text-neutral-700">{expText(r.expMonths)}{r.grad ? <div className="text-neutral-500">Grad {r.grad}</div> : null}</td>
                      <td className="px-3 py-2.5 text-xs text-neutral-700"><div className="line-clamp-2 max-w-[160px]">{r.cities.slice(0, 3).join(", ") || "Not said"}</div></td>
                      <td className="px-3 py-2.5 text-xs">
                        {searching ? (
                          <span className="font-semibold text-neutral-950">{r.matched} of {data.terms.length}<span className="ml-1 font-normal text-neutral-500">{r.hits.map((h) => h.term).join(", ")}</span></span>
                        ) : (
                          <span className="text-neutral-600">{r.skills.slice(0, 4).map((s) => s.label).join(", ")}</span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        <button type="button" onClick={(e) => { e.stopPropagation(); toggle(r); }} aria-pressed={listed.has(r.id)}
                          className={`rounded-lg border-2 px-2 py-0.5 text-xs font-bold ${listed.has(r.id) ? "border-purple-600 bg-purple-500 text-white" : "border-neutral-900 bg-white text-neutral-800 hover:bg-violet-50"}`}>
                          {listed.has(r.id) ? "Shortlisted" : "Shortlist"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!results.length && (
                    <tr><td colSpan={7} className="px-3 py-8 text-center text-neutral-500">No student matches. Try fewer words or loosen a filter.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-neutral-400">
              {data.hidden > 0 && !internal ? `${data.hidden} internal account${data.hidden === 1 ? "" : "s"} left out. ` : ""}
              Ranked by how many words they match, how strongly, then actively looking first, the fuller profile and the newest call.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string | null | undefined }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-neutral-400">{k}</div>
      <div className="text-sm text-neutral-900">{v || <span className="text-neutral-400">Not said</span>}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-purple-700">{title}</h3>
      {children}
    </div>
  );
}

const srcChip = (src: string) => (
  <span className="ml-1.5 rounded border border-neutral-200 px-1 py-px text-[10px] font-semibold text-neutral-500">{src === "call" ? "Said on the call" : src === "resume" ? "Resume" : src}</span>
);

function Profile({ r, terms, onClose, listed, onToggle }: { r: WireResult; terms: number; onClose: () => void; listed: boolean; onToggle: () => void }) {
  const [contact, setContact] = useState(false);
  useEffect(() => setContact(false), [r.id]);
  const matchedSkills = new Set(r.hits.filter((h) => h.where === "Skill").map((h) => h.detail.toLowerCase()));
  const now = [r.title, r.org].filter(Boolean).join(", ");
  return (
    <div className="p-5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="inline-block h-3 w-3 shrink-0 rounded-full" style={{ background: intentColor(r.intent) }} />
            <span className="text-xs font-semibold text-neutral-600">{intentLabel(r.intent)}</span>
          </div>
          <h2 className="mt-1 font-['Clash_Display'] text-2xl font-medium leading-tight text-neutral-950">{r.name}</h2>
          {r.headline && <p className="mt-1 text-sm text-neutral-700">{r.headline}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Close profile" className="rounded-lg border-2 border-neutral-900 bg-white px-2 text-lg font-bold leading-7 hover:bg-neutral-50">×</button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" onClick={onToggle} aria-pressed={listed}
          className={`rounded-lg border-2 px-3 py-1 text-sm font-bold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${listed ? "border-neutral-900 bg-purple-500 text-white" : "border-neutral-900 bg-white text-neutral-900 hover:bg-violet-50"}`}>
          {listed ? "On the shortlist" : "Add to shortlist"}
        </button>
        <Link to={`/journeys?u=${encodeURIComponent(r.id)}`} className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1 text-sm font-semibold hover:bg-violet-50">Journey</Link>
        <button type="button" onClick={() => setContact((v) => !v)} className="rounded-lg border-2 border-neutral-300 bg-white px-3 py-1 text-sm font-semibold text-neutral-600 hover:border-neutral-900">
          {contact ? r.email || "No email" : "Show email (staff only)"}
        </button>
      </div>

      {terms > 0 && r.hits.length > 0 && (
        <Section title={`Why they match: ${r.matched} of ${terms}`}>
          <ul className="space-y-1">
            {r.hits.map((h) => (
              <li key={h.term} className="text-sm">
                <span className="rounded-md border-[1.5px] border-neutral-900 bg-violet-50 px-1.5 py-px text-xs font-semibold">{h.term}</span>
                <span className="ml-2 text-xs font-semibold text-neutral-500">{h.where}:</span> <span className="text-neutral-800">{h.detail}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3">
        <Fact k="Now" v={now || r.status} />
        <Fact k="Experience" v={expText(r.expMonths)} />
        <Fact k="Education" v={[r.degree, r.degreeStatus === "pursuing" ? "pursuing" : null, r.grad ? `graduates ${r.grad}` : null].filter(Boolean).join(", ")} />
        <Fact k="Cities" v={[r.cities.slice(0, 4).join(", "), r.relocate === "yes" ? "will relocate" : r.relocate === "maybe" ? "might relocate" : null].filter(Boolean).join("; ")} />
        <Fact k="Wants" v={r.types.map((t) => TYPE_LABEL[t] ?? t).join(", ")} />
        <Fact k="Work mode" v={r.modes.map((m) => MODE_LABEL[m] ?? m).join(", ")} />
        <Fact k="Asks for" v={askText(r)} />
        <Fact k="Can start" v={[r.from === "now" ? "Now" : r.from, r.notice ? `notice: ${r.notice}` : null].filter(Boolean).join(", ")} />
      </div>

      {r.rolesWanted.length > 0 && (
        <Section title="Roles they want">
          <div className="flex flex-wrap gap-1.5">
            {r.rolesWanted.map((x) => <span key={x} className="rounded-full border-[1.5px] border-neutral-900 bg-violet-50 px-2 py-0.5 text-xs font-semibold">{x}</span>)}
            {r.rolesAdjacent.slice(0, 4).map((x) => <span key={x} className="rounded-full border border-neutral-300 px-2 py-0.5 text-xs text-neutral-600">{x}</span>)}
          </div>
          {r.sectors.length > 0 && <p className="mt-1.5 text-xs text-neutral-600">Sectors: {r.sectors.join(", ")}</p>}
          {r.values.length > 0 && <p className="mt-0.5 text-xs text-neutral-600">What matters to them: {r.values.join(", ")}</p>}
        </Section>
      )}

      {r.summary && (
        <Section title="From the call">
          <p className="whitespace-pre-line text-sm leading-relaxed text-neutral-800">{r.summary}</p>
        </Section>
      )}

      {r.roles.length > 0 && (
        <Section title="Experience">
          <ul className="space-y-1.5">
            {r.roles.map((k, i) => (
              <li key={i} className="text-sm text-neutral-800">
                {k.text}{k.org && !k.text.toLowerCase().includes(k.org.toLowerCase()) ? <span className="text-neutral-500">, {k.org}</span> : null}
                {k.when && <span className="ml-1.5 text-xs text-neutral-500">{k.when}</span>}{srcChip(k.src)}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {(r.outcomes.length > 0 || r.projects.length > 0) && (
        <Section title="What they did">
          <ul className="list-disc space-y-1 pl-4">
            {[...r.outcomes, ...r.projects].map((k, i) => (
              <li key={i} className="text-sm text-neutral-800">{k.text}{srcChip(k.src)}</li>
            ))}
          </ul>
        </Section>
      )}

      {r.skills.length > 0 && (
        <Section title="Skills on the resume">
          <div className="flex flex-wrap gap-1.5">
            {r.skills.map((s) => (
              <span key={s.key} className={`rounded-full px-2 py-0.5 text-xs ${matchedSkills.has(s.label.toLowerCase()) ? "border-[1.5px] border-purple-600 bg-purple-500 font-semibold text-white" : "border border-neutral-300 text-neutral-700"}`}>{s.label}</span>
            ))}
          </div>
        </Section>
      )}

      {r.said.length > 0 && (
        <Section title="Skills they described on the call">
          <ul className="list-disc space-y-1 pl-4">{r.said.map((s, i) => <li key={i} className="text-sm text-neutral-800">{s}</li>)}</ul>
        </Section>
      )}

      {r.credentials.length > 0 && (
        <Section title="Credentials">
          <ul className="space-y-1">{r.credentials.map((k, i) => <li key={i} className="text-sm text-neutral-800">{k.text}{srcChip(k.src)}</li>)}</ul>
        </Section>
      )}

      <p className="mt-6 text-[11px] text-neutral-400">Profile from {new Date(r.derivedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" })}. In the student's own words, not checked by Studojo.</p>
    </div>
  );
}

function Shortlist({ list, copied, onCopy, onRemove, onOpen, canOpen }: {
  list: Brief[]; copied: boolean; onCopy: () => void; onRemove: (id: string) => void; onOpen: (id: string) => void; canOpen: (id: string) => boolean;
}) {
  return (
    <div className="mt-4 text-left">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-bold text-neutral-950">Shortlist: {list.length}</div>
        <button type="button" onClick={onCopy} className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-3 py-1 text-sm font-bold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-purple-600">
          {copied ? "Copied" : "Copy for the hiring manager"}
        </button>
      </div>
      <p className="mt-1 text-xs text-neutral-500">Copies who they are, what they want and their skills as plain text. No email address or phone number. Kept in this browser only.</p>
      <ul className="mt-2 divide-y divide-neutral-100">
        {list.map((b) => (
          <li key={b.id} className="flex items-center gap-2 py-1.5 text-sm">
            <button type="button" onClick={() => onOpen(b.id)} disabled={!canOpen(b.id)} title={canOpen(b.id) ? "Open profile" : "Not in this search: clear the search to open"}
              className="min-w-0 flex-1 truncate text-left font-semibold text-neutral-900 enabled:hover:text-purple-700 disabled:cursor-default">
              {b.name}<span className="ml-2 font-normal text-neutral-500">{b.headline}</span>
            </button>
            <button type="button" onClick={() => onRemove(b.id)} aria-label={`Remove ${b.name}`} className="px-1 font-bold text-neutral-400 hover:text-red-600">×</button>
          </li>
        ))}
      </ul>
    </div>
  );
}
