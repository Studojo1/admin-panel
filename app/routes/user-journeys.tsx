import { useEffect, useState, useCallback } from "react";
import { getToken } from "~/lib/api";
import { AdminHeader } from "~/components";

async function phQuery(query: string) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}
async function phGet(type: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ type, ...params }).toString();
  const res = await fetch(`/api/posthog?${qs}`, { credentials: "include" });
  if (!res.ok) throw new Error(`PostHog ${type} ${res.status}`);
  return res.json();
}

const envWhere = (e: string) => e === "prod" ? "AND properties.$host LIKE '%studojo.com%'" : e === "staging" ? "AND properties.$host LIKE '%studojo.pro%'" : "";

// Ordered outreach funnel milestones — the furthest one reached = where they got to;
// the next one is where they dropped.
const STEPS = [
  { key: "reached", label: "Reached outreach" },
  { key: "resume", label: "Uploaded resume" },
  { key: "quiz_started", label: "Started quiz" },
  { key: "quiz_done", label: "Completed quiz" },
  { key: "leads", label: "Saw leads" },
  { key: "pay_click", label: "Tapped pay" },
  { key: "checkout", label: "Reached checkout" },
  { key: "paid", label: "Paid" },
] as const;

// Other Studojo tools a signed-up user may have used (detected via pageview path).
const PRODUCTS = [
  { key: "p_resume", label: "Resume builder", cls: "bg-blue-100 text-blue-700" },
  { key: "p_intern", label: "Internship Dojo", cls: "bg-emerald-100 text-emerald-700" },
  { key: "p_coach", label: "Career Coach", cls: "bg-amber-100 text-amber-700" },
  { key: "p_assign", label: "Assignment Dojo", cls: "bg-fuchsia-100 text-fuchsia-700" },
  { key: "p_human", label: "Humanizer", cls: "bg-cyan-100 text-cyan-700" },
] as const;

// Only people PostHog has identified with an email = signed-up users. Anonymous
// (no email) visitors are intentionally excluded — we don't track them here.
function listHogql(days: number, env: string) {
  return `
    SELECT person_id,
      any(person.properties.email) AS email,
      min(timestamp) AS first_seen,
      max(timestamp) AS last_seen,
      count() AS events,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS reached,
      maxIf(1, event='resume_uploaded') AS resume,
      maxIf(1, event='quiz_started') AS quiz_started,
      maxIf(1, event='quiz_question_answered' AND toInt(properties.question_number) >= 13) AS quiz_done,
      max(if(event='quiz_question_answered', toInt(properties.question_number), 0)) AS quiz_qmax,
      maxIf(1, event='leads_loaded') AS leads,
      maxIf(1, event='pay_now_clicked') AS pay_click,
      maxIf(1, event='checkout_opened') AS checkout,
      maxIf(1, event='payment_confirmed') AS paid,
      maxIf(1, event='$pageview' AND (properties.$pathname LIKE '/careers%' OR properties.$pathname LIKE '/jrs%')) AS p_resume,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/dojos/internships%') AS p_intern,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/cc%') AS p_coach,
      maxIf(1, event='$pageview' AND (properties.$pathname LIKE '/dojos/assignment%' OR properties.$pathname LIKE '/assignments%')) AS p_assign,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/dojos/humanizer%') AS p_human,
      any(person.properties.$initial_utm_source) AS utm_source,
      any(person.properties.$initial_utm_medium) AS utm_medium,
      any(person.properties.$initial_utm_campaign) AS utm_campaign,
      any(person.properties.$initial_referring_domain) AS ref_domain,
      any(properties.$device_type) AS device,
      any(properties.$geoip_country_name) AS country
    FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}
    GROUP BY person_id
    HAVING email != '' AND email IS NOT NULL
    ORDER BY last_seen DESC LIMIT 300`;
}

type Row = {
  pid: string; email: string; first: string; last: string; events: number;
  flags: Record<string, number>; products: Record<string, number>; qmax: number;
  device: string; country: string;
  utmSource: string; utmMedium: string; utmCampaign: string; refDomain: string;
};
const fmtTime = (t: string) => new Date(t).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const ago = (t: string) => {
  const s = (Date.now() - new Date(t).getTime()) / 1000;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
};
const PRESETS = [7, 14, 30] as const;
const ENVS = [{ k: "all", l: "All" }, { k: "prod", l: "studojo.com" }, { k: "staging", l: "studojo.pro" }] as const;
const MILESTONE_EVENTS = new Set(["resume_uploaded", "quiz_started", "profile_quiz_completed", "quiz_question_answered", "discovery_started", "discovery_completed", "discovery_failed", "leads_loaded", "pay_now_clicked", "checkout_opened", "payment_confirmed", "resume_upload_failed", "checkout_abandoned", "payment_failed", "back_to_leads_clicked", "get_emails_clicked", "lead_contact_clicked", "signed_up"]);

// How the person first arrived. Email beats ad beats referrer beats direct.
function source(r: Row): { label: string; cls: string } {
  const med = (r.utmMedium || "").toLowerCase();
  const src = (r.utmSource || "").toLowerCase();
  const ref = (r.refDomain || "").toLowerCase();
  const isEmail = med === "email" || src.includes("email") || src.includes("newsletter") || /mail|gmail|outlook/.test(ref);
  if (isEmail) return { label: r.utmCampaign ? `Email · ${r.utmCampaign}` : "Email", cls: "bg-violet-100 text-violet-700" };
  if (src) return { label: r.utmCampaign ? `${r.utmSource} · ${r.utmCampaign}` : r.utmSource, cls: "bg-sky-100 text-sky-700" };
  if (ref && ref !== "$direct" && ref !== "") return { label: ref, cls: "bg-neutral-100 text-neutral-600" };
  return { label: "Direct", cls: "bg-neutral-100 text-neutral-500" };
}

export default function UserJourneys() {
  const [days, setDays] = useState(14);
  const [env, setEnv] = useState("all");
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<Record<string, any[]>>({});
  const [tlLoading, setTlLoading] = useState(false);

  const load = useCallback(async (d: number, e: string) => {
    setLoading(true); setError(""); setOpen(null);
    try {
      const token = await getToken();
      const [res, paidRes] = await Promise.all([
        phQuery(listHogql(d, e)),
        fetch(`/api/paid-emails`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }).then((r) => r.json()).catch(() => ({ emails: [] })),
      ]);
      const paidSet = new Set<string>((paidRes.emails ?? []).map((x: string) => (x || "").toLowerCase()));
      const cols = res.columns ?? [];
      const idx = (n: string) => cols.indexOf(n);
      setRows((res.results ?? []).map((r: any[]) => {
        const email = r[idx("email")] || "";
        const paid = (email && paidSet.has(email.toLowerCase())) || +r[idx("paid")] === 1 ? 1 : 0;
        return {
          pid: String(r[idx("person_id")]),
          email,
          first: r[idx("first_seen")],
          last: r[idx("last_seen")],
          events: +r[idx("events")] || 0,
          qmax: +r[idx("quiz_qmax")] || 0,
          device: r[idx("device")] || "",
          country: r[idx("country")] || "",
          utmSource: r[idx("utm_source")] || "",
          utmMedium: r[idx("utm_medium")] || "",
          utmCampaign: r[idx("utm_campaign")] || "",
          refDomain: r[idx("ref_domain")] || "",
          flags: { reached: +r[idx("reached")], resume: +r[idx("resume")], quiz_started: +r[idx("quiz_started")], quiz_done: +r[idx("quiz_done")], leads: +r[idx("leads")], pay_click: +r[idx("pay_click")], checkout: +r[idx("checkout")], paid },
          products: { p_resume: +r[idx("p_resume")], p_intern: +r[idx("p_intern")], p_coach: +r[idx("p_coach")], p_assign: +r[idx("p_assign")], p_human: +r[idx("p_human")] },
        };
      }));
    } catch (e: any) { setError(e?.message || "Failed"); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(days, env); }, [days, env, load]);

  const openTimeline = async (pid: string) => {
    if (open === pid) { setOpen(null); return; }
    setOpen(pid);
    if (timeline[pid]) return;
    setTlLoading(true);
    try {
      const res = await phGet("person_events", { person_id: pid });
      const cols: string[] = res.columns ?? [];
      const events = (res.results ?? []).map((r: any[]) => {
        const o: any = {};
        cols.forEach((c, i) => { o[c.replace("properties.", "")] = r[i]; });
        return o;
      }).reverse(); // chronological
      setTimeline((t) => ({ ...t, [pid]: events }));
    } catch { setTimeline((t) => ({ ...t, [pid]: [] })); } finally { setTlLoading(false); }
  };

  const furthest = (f: Record<string, number>) => { let i = -1; STEPS.forEach((s, k) => { if (f[s.key]) i = k; }); return i; };
  const filtered = rows.filter((r) => !search || r.email.toLowerCase().includes(search.toLowerCase()) || r.pid.includes(search));

  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";
  const propSummary = (e: any) => {
    const bits: string[] = [];
    if (e.question_number) bits.push(`Q${e.question_number}${e.answer_type ? ` (${e.answer_type})` : ""}`);
    if (e.tier) bits.push(`tier ${e.tier}`);
    if (e.provider) bits.push(e.provider);
    if (e.company) bits.push(e.company);
    if (e.coupon_code) bits.push(`coupon ${e.coupon_code}`);
    if (e.reason) bits.push(String(e.reason).slice(0, 40));
    if (e.file_type) bits.push(e.file_type);
    if (e.event === "$pageview" && e.$pathname) bits.push(e.$pathname);
    return bits.join(" · ");
  };

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[100rem] px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-3xl font-bold text-neutral-900">User Journeys</h1>
            <p className="text-sm text-neutral-600 mt-1">Signed-up users only — how they arrived, which tools they used, and where they dropped off.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search email…" className="rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm focus:outline-none shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]" />
            <div className="flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
              {ENVS.map((e) => <button key={e.k} onClick={() => setEnv(e.k)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${env === e.k ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{e.l}</button>)}
            </div>
            {PRESETS.map((p) => <button key={p} onClick={() => setDays(p)} className={`rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${days === p ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`}>{p}d</button>)}
          </div>
        </div>

        {error && <div className="mb-6 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" /></div>
        ) : (
          <div className={`overflow-hidden ${card}`}>
            <div className="px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-['Clash_Display'] text-lg font-bold">{filtered.length} signed-up users</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />did step</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white border-2 border-violet-300" />passed (no event)</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-400 ring-2 ring-red-200" />dropped here</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />never reached</span>
                <span className="text-neutral-400">· click a row for the full path</span>
              </div>
            </div>
            <div className="divide-y divide-neutral-100">
              {filtered.map((r) => {
                const fi = furthest(r.flags);
                const paid = r.flags.paid === 1;
                const usedProducts = PRODUCTS.filter((p) => r.products[p.key]);
                const dropLabel = paid
                  ? "Converted"
                  : fi >= 0
                    ? (fi < STEPS.length - 1 ? `Dropped before: ${STEPS[fi + 1].label}` : "Reached last step")
                    : usedProducts.length > 0 ? "Other tools only" : "Signed up only";
                const src = source(r);
                return (
                  <div key={r.pid}>
                    <button onClick={() => openTimeline(r.pid)} className="w-full text-left px-4 py-3 hover:bg-neutral-50 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-sm text-neutral-900 truncate">{r.email}</p>
                        <p className="text-[11px] text-neutral-500 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                          <span className={`inline-block rounded px-1.5 py-0.5 font-semibold ${src.cls}`}>{src.label}</span>
                          <span>{r.events} events · {r.device || "?"} · {r.country || "?"} · last {ago(r.last)}</span>
                        </p>
                        {usedProducts.length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {usedProducts.map((p) => <span key={p.key} className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${p.cls}`}>{p.label}</span>)}
                          </div>
                        )}
                      </div>
                      {/* quiz progress */}
                      <div className="w-28 text-center flex-shrink-0">
                        {r.flags.quiz_done ? (
                          <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold bg-violet-100 text-violet-700">Quiz done</span>
                        ) : r.qmax > 0 || r.flags.quiz_started ? (
                          <span className="inline-block rounded-full px-2 py-0.5 text-[11px] font-bold bg-amber-50 text-amber-700">Quiz: Q{r.qmax || 1}</span>
                        ) : (
                          <span className="text-[11px] text-neutral-300">no quiz</span>
                        )}
                      </div>
                      {/* step dots — solid = did it, hollow = passed but no event, red = drop, gray = never reached */}
                      <div className="flex items-center gap-1">
                        {STEPS.map((s, k) => {
                          const done = r.flags[s.key];
                          let cls: string, title: string;
                          if (done) { cls = s.key === "paid" ? "bg-emerald-500" : "bg-violet-500"; title = `${s.label} ✓`; }
                          else if (k < fi) { cls = "bg-white border-2 border-violet-300"; title = `${s.label} — passed through, but no event recorded`; }
                          else if (k === fi + 1 && !paid) { cls = "bg-red-400 ring-2 ring-red-200"; title = `${s.label} — dropped here`; }
                          else { cls = "bg-neutral-200"; title = `${s.label} — never reached`; }
                          return <span key={s.key} title={title} className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
                        })}
                      </div>
                      <div className="w-48 text-right">
                        <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${paid ? "bg-emerald-100 text-emerald-700" : fi < 0 ? "bg-neutral-100 text-neutral-500" : "bg-red-50 text-red-700"}`}>{dropLabel}</span>
                      </div>
                    </button>
                    {open === r.pid && (
                      <div className="bg-neutral-50 px-5 py-4 border-t border-neutral-100">
                        {tlLoading && !timeline[r.pid] ? (
                          <div className="flex justify-center py-4"><div className="h-5 w-5 animate-spin rounded-full border-2 border-violet-500 border-t-transparent" /></div>
                        ) : (timeline[r.pid] ?? []).length === 0 ? (
                          <p className="text-sm text-neutral-400 py-2">No events found.</p>
                        ) : (
                          <ol className="relative border-l-2 border-neutral-200 ml-2 space-y-3">
                            {(timeline[r.pid] ?? []).map((e, i) => (
                              <li key={i} className="ml-4">
                                <span className={`absolute -left-[7px] h-3 w-3 rounded-full ${MILESTONE_EVENTS.has(e.event) ? "bg-violet-500" : e.event === "payment_confirmed" ? "bg-emerald-500" : "bg-neutral-300"}`} />
                                <div className="flex items-baseline gap-2 flex-wrap">
                                  <span className={`font-mono text-[13px] ${MILESTONE_EVENTS.has(e.event) || e.event === "payment_confirmed" ? "font-bold text-neutral-900" : "text-neutral-700"}`}>{e.event}</span>
                                  <span className="text-[11px] text-neutral-400">{fmtTime(e.timestamp)}</span>
                                  {propSummary(e) && <span className="text-[11px] text-neutral-500">{propSummary(e)}</span>}
                                </div>
                              </li>
                            ))}
                          </ol>
                        )}
                        <p className="text-[11px] text-neutral-400 mt-3">Showing up to 80 most-recent events. Open this person in PostHog for the full session replay.</p>
                      </div>
                    )}
                  </div>
                );
              })}
              {filtered.length === 0 && <p className="text-sm text-neutral-400 py-10 text-center">No signed-up users in this window.</p>}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
