import { useEffect, useState, useCallback, useRef } from "react";
import { getToken } from "~/lib/api";
import { AdminHeader } from "~/components";
import { posthogFetch } from "~/lib/posthog-client";

async function phQuery(query: string) {
  const res = await posthogFetch("/api/posthog?type=query", {
    method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog ${res.status}`);
  return res.json();
}
async function phGet(type: string, params: Record<string, string>) {
  const qs = new URLSearchParams({ type, ...params }).toString();
  const res = await posthogFetch(`/api/posthog?${qs}`, { credentials: "include" });
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
  { key: "pricing", label: "Saw pricing" },
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
// Activity is what the person did on the site. Server events carry no website host
// (the campaign worker's email_sent and followup_sent, reminder nudges), so a customer
// whose campaign is sending stays in PostHog without visiting. Those events still count
// toward the steps; the page lists only people with at least one site event.
const SITE = "isNotNull(properties.$host) AND properties.$host != ''";
const LIST_LIMIT = 2000;
function listHogql(days: number, env: string) {
  return `
    SELECT person_id,
      any(person.properties.email) AS email,
      minIf(timestamp, ${SITE}) AS first_seen,
      maxIf(timestamp, ${SITE}) AS last_seen,
      countIf(${SITE}) AS events,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS reached,
      maxIf(1, event='resume_uploaded') AS resume,
      maxIf(1, event='quiz_started') AS quiz_started,
      -- Q12 and Q13 left the quiz in June, so no answer reaches 13: completion is its own event (as on /funnel).
      maxIf(1, event='profile_quiz_completed') AS quiz_done,
      max(if(event='quiz_question_answered', toInt(properties.question_number), 0)) AS quiz_qmax,
      maxIf(1, event='leads_loaded') AS leads,
      maxIf(1, event='pricing_viewed' OR (event='$pageview' AND properties.$pathname LIKE '/outreach/enrichment%')) AS pricing,
      maxIf(1, event='pay_now_clicked') AS pay_click,
      maxIf(1, event='checkout_opened') AS checkout,
      -- No paid flag from payment_confirmed: it also fires for 100% coupon and credits-only orders,
      -- and for test payments on studojo.pro. Money comes from /api/paid-emails (payment_orders).
      maxIf(1, event='$pageview' AND (properties.$pathname LIKE '/careers%' OR properties.$pathname LIKE '/jrs%')) AS p_resume,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/dojos/internships%') AS p_intern,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/cc%') AS p_coach,
      maxIf(1, event='$pageview' AND (properties.$pathname LIKE '/dojos/assignment%' OR properties.$pathname LIKE '/assignments%')) AS p_assign,
      maxIf(1, event='$pageview' AND properties.$pathname LIKE '/dojos/humanizer%') AS p_human,
      any(person.properties.$initial_utm_source) AS utm_source,
      any(person.properties.$initial_utm_medium) AS utm_medium,
      any(person.properties.$initial_utm_campaign) AS utm_campaign,
      any(person.properties.$initial_referring_domain) AS ref_domain,
      anyIf(properties.$device_type, ${SITE}) AS device,
      anyIf(properties.$geoip_country_name, ${SITE}) AS country
    FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}
    GROUP BY person_id
    HAVING email != '' AND email IS NOT NULL
    ORDER BY last_seen DESC LIMIT ${LIST_LIMIT}`;
}

type Payment = { email: string; at: string; currency: string; amount_cents: number; refunded_cents: number; plan_id: string | null; status: string };
type Row = {
  pid: string; email: string; first: string; last: string; events: number;
  flags: Record<string, number>; products: Record<string, number>; qmax: number;
  device: string; country: string;
  utmSource: string; utmMedium: string; utmCampaign: string; refDomain: string;
  // Money from payment_orders: every real-money payment of this person, any date.
  payments: Payment[];
  // Got the product without paying: a 100% coupon order, or a campaign run on credits.
  free: boolean;
  // A team account (admin or ops role, or a studojo.com address): its orders are tests.
  team: boolean;
  // Payments did not load, and the order went through: neither paid nor free can be said.
  moneyUnknown: boolean;
};

const kept = (p: Payment) => p.amount_cents - p.refunded_cents;
// "₹1,825", "$20", "₹2,065.50"
function fmtAmount(cents: number, cur: string): string {
  const n = (cents / 100).toLocaleString(cur === "INR" ? "en-IN" : "en-US", { minimumFractionDigits: cents % 100 ? 2 : 0, maximumFractionDigits: 2 });
  return cur === "INR" ? `₹${n}` : cur === "USD" ? `$${n}` : `${cur} ${n}`;
}
// Money kept across payments, rupees first: "₹1,825 + $20"
function fmtMoney(payments: Payment[]): string {
  const byCur = new Map<string, number>();
  for (const p of payments) if (kept(p) > 0) byCur.set(p.currency, (byCur.get(p.currency) ?? 0) + kept(p));
  return [...byCur]
    .sort(([a], [b]) => (a === "INR" ? -1 : b === "INR" ? 1 : a.localeCompare(b)))
    .map(([cur, cents]) => fmtAmount(cents, cur))
    .join(" + ");
}
// "email_200" -> "200 emails"; anything else as stored.
function planLabel(id: string | null): string {
  const m = /^(email|linkedin|both)_(\d+)$/.exec(id ?? "");
  if (!m) return id ?? "";
  return `${m[2]} ${m[1] === "email" ? "emails" : m[1] === "linkedin" ? "LinkedIn credits" : "emails + LinkedIn"}`;
}
// "30 Sep", or "30 Sep 2025" outside this year. Fixed names: locales disagree on "Sep" and "Sept".
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const fmtDay = (t: string) => {
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ` ${d.getFullYear()}` : ""}`;
};
// "₹1,825 for 200 emails on 30 Sep", "…, refunded ₹825"
const describePayment = (p: Payment) =>
  `${fmtAmount(p.amount_cents, p.currency)}${p.plan_id ? ` for ${planLabel(p.plan_id)}` : ""} on ${fmtDay(p.at)}` +
  (p.refunded_cents ? `, refunded ${fmtAmount(p.refunded_cents, p.currency)}` : "");

// Fetch an admin endpoint and keep its status, so a failure is shown instead of
// silently drawing the page without its data (/api/journeys returned 404 for four months).
async function getJson(url: string, headers: Record<string, string>) {
  try {
    const r = await fetch(url, { credentials: "include", headers });
    return { ok: r.ok, status: r.status, body: await r.json().catch(() => ({})) };
  } catch {
    return { ok: false, status: 0, body: {} as any };
  }
}
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
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [teamEmails, setTeamEmails] = useState<Set<string>>(new Set());
  const [automatedOnly, setAutomatedOnly] = useState(0);
  const [warnings, setWarnings] = useState<string[]>([]);
  // Only the latest load may draw: a slow 30-day reply must not land under the 7-day header.
  const loadSeq = useRef(0);
  const [timeline, setTimeline] = useState<Record<string, any[]>>({});
  const [tlLoading, setTlLoading] = useState(false);

  const load = useCallback(async (d: number, e: string) => {
    const my = ++loadSeq.current;
    setLoading(true); setError(""); setOpen(null); setWarnings([]);
    try {
      const token = await getToken();
      const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
      const [res, paidRes, stageRes] = await Promise.all([
        phQuery(listHogql(d, e)),
        getJson(`/api/paid-emails`, authHeaders),
        getJson(`/api/journeys`, authHeaders),
      ]);
      if (my !== loadSeq.current) return;
      const warn: string[] = [];
      if (!paidRes.ok) warn.push(`Payments did not load (HTTP ${paidRes.status || "error"}), so nobody is shown as paid or free.`);
      if (!stageRes.ok) warn.push(`Order steps did not load (HTTP ${stageRes.status || "error"}), so steps come from website tracking only and some may be missing.`);
      if ((res.results ?? []).length >= LIST_LIMIT) warn.push(`Only the ${LIST_LIMIT.toLocaleString("en-US")} most recently active people are shown.`);
      setWarnings(warn);
      setPaymentsLoaded(paidRes.ok);
      const payments: Payment[] = paidRes.body.payments ?? [];
      setAllPayments(payments);
      const paymentsOf = new Map<string, Payment[]>();
      for (const p of payments) paymentsOf.set(p.email, [...(paymentsOf.get(p.email) ?? []), p]);
      const lower = (xs: string[] | undefined) => new Set<string>((xs ?? []).map((x) => (x || "").toLowerCase()));
      const freeSet = lower(paidRes.body.free);
      const teamSet = lower(paidRes.body.team);
      setTeamEmails(teamSet);
      // Authoritative server-side funnel stages (immune to client event loss).
      const dbStages: Record<string, any> = stageRes.body.stages ?? {};
      const cols = res.columns ?? [];
      const idx = (n: string) => cols.indexOf(n);
      const built: Row[] = (res.results ?? []).map((r: any[]) => {
        const email = r[idx("email")] || "";
        const lc = email.toLowerCase();
        const ph = { reached: +r[idx("reached")], resume: +r[idx("resume")], quiz_started: +r[idx("quiz_started")], quiz_done: +r[idx("quiz_done")], leads: +r[idx("leads")], pricing: +r[idx("pricing")], pay_click: +r[idx("pay_click")], checkout: +r[idx("checkout")] };
        // DB stage timestamps win over PostHog. payment_page_reached is stamped when the
        // pricing page opens, so it means "saw pricing" only. A payment_orders row (created
        // when they tap pay) is the server's record of tapping pay; whether the payment
        // window then opened is only in PostHog (checkout_opened).
        const db = dbStages[lc] || {};
        const dbf = (v: any) => (v ? 1 : 0);
        const pays = paymentsOf.get(lc) ?? [];
        const paidMoney = pays.some((p) => kept(p) > 0);
        // An order that went through with no money kept: a 100% coupon, a campaign run on
        // credits, or a payment refunded in full. payment_made_at alone is never proof of money.
        const free = paidRes.ok && !paidMoney && (pays.length > 0 || freeSet.has(lc) || !!db.paid || !!db.launched);
        const moneyUnknown = !paidRes.ok && (!!db.paid || !!db.launched);
        const flags: Record<string, number> = {
          reached: ph.reached,
          resume: dbf(db.resume) || ph.resume,
          quiz_started: dbf(db.quiz_started) || ph.quiz_started,
          quiz_done: dbf(db.quiz_done) || ph.quiz_done,
          leads: dbf(db.leads) || ph.leads,
          pricing: dbf(db.payment_page) || ph.pricing,
          pay_click: dbf(db.checkout) || ph.pay_click,
          checkout: ph.checkout,
          paid: paidMoney ? 1 : 0,
        };
        // Getting the product without paying still means they went through checkout.
        if (free || moneyUnknown) flags.checkout = 1;
        // Monotonic backfill: the funnel is strictly ordered, so reaching a
        // later step proves every earlier step happened. Fill them in so a
        // genuinely-passed step is never shown as a gap (purple, not grey).
        let seenLater = 0;
        for (let k = STEPS.length - 1; k >= 0; k--) {
          if (flags[STEPS[k].key]) seenLater = 1;
          else if (seenLater) flags[STEPS[k].key] = 1;
        }
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
          flags,
          payments: pays,
          free,
          team: teamSet.has(lc),
          moneyUnknown,
          products: { p_resume: +r[idx("p_resume")], p_intern: +r[idx("p_intern")], p_coach: +r[idx("p_coach")], p_assign: +r[idx("p_assign")], p_human: +r[idx("p_human")] },
        };
      });
      // One row per email: PostHog can hold two persons for one address. The list is newest
      // first, so the kept row has the latest visit; the other adds its steps and tools.
      const byEmail = new Map<string, Row>();
      for (const r of built) {
        const k = r.email.toLowerCase();
        const c = byEmail.get(k);
        if (!c) { byEmail.set(k, r); continue; }
        for (const st of STEPS) c.flags[st.key] = c.flags[st.key] || r.flags[st.key];
        for (const pr of PRODUCTS) c.products[pr.key] = c.products[pr.key] || r.products[pr.key];
        c.events += r.events;
        c.qmax = Math.max(c.qmax, r.qmax);
        if (r.first && r.events && (!c.first || !c.events || r.first < c.first)) c.first = r.first;
      }
      const people = [...byEmail.values()];
      setAutomatedOnly(people.filter((r) => r.events === 0).length);
      setRows(people.filter((r) => r.events > 0));
    } catch (e: any) {
      if (my === loadSeq.current) setError(e?.message || "Failed");
    } finally {
      if (my === loadSeq.current) setLoading(false);
    }
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

  // Money in the selected window, from every payment on record (not only the people listed:
  // someone can pay without PostHog knowing their email). A person who paid before the
  // window is still a customer, but adds nothing to this window's revenue.
  // Team accounts' orders are tests, so they are left out of the money and the counts.
  const since = Date.now() - days * 86_400_000;
  const inWindow = (p: Payment) => kept(p) > 0 && new Date(p.at).getTime() >= since;
  const windowPayments = allPayments.filter((p) => inWindow(p) && !teamEmails.has(p.email));
  const listed = new Set(rows.map((r) => r.email.toLowerCase()));
  const notListed = new Set(windowPayments.filter((p) => !listed.has(p.email)).map((p) => p.email)).size;
  const customers = rows.filter((r) => !r.team);
  const paidEarlier = customers.filter((r) => r.flags.paid && !r.payments.some(inWindow)).length;
  const freeOrders = customers.filter((r) => r.free && r.payments.length === 0).length;
  const teamRows = rows.length - customers.length;
  // This admin reads one site's database: admin.studojo.pro the test site's, every other host studojo.com's.
  const dbSite = typeof window !== "undefined" && window.location.hostname.endsWith("studojo.pro") ? "staging" : "prod";
  const dbSiteName = dbSite === "staging" ? "studojo.pro" : "studojo.com";
  const moneyHere = env === "all" || env === dbSite;

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
              <h2 className="font-['Clash_Display'] text-lg font-bold">{filtered.length} signed-up users active on the site in the last {days} days</h2>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500">
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-violet-500" />reached step</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-red-400 ring-2 ring-red-200" />dropped here</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-neutral-200" />never reached</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />paid</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-white ring-2 ring-emerald-400" />got it free</span>
                <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-amber-300" />refunded</span>
                <span className="text-neutral-400">· steps from server records, money from payments · click a row for the path</span>
              </div>
            </div>
            {paymentsLoaded && (moneyHere ? (
              <div className="px-5 py-2.5 border-b border-neutral-100 flex flex-wrap items-center gap-2 text-xs">
                <span className={`inline-block rounded-full px-2.5 py-0.5 font-bold ${windowPayments.length ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"}`}>
                  {windowPayments.length
                    ? `Outreach revenue in the last ${days} days: ${fmtMoney(windowPayments)} from ${windowPayments.length} payment${windowPayments.length === 1 ? "" : "s"}${notListed ? `, ${notListed} by people not listed here` : ""}`
                    : `No outreach payments in the last ${days} days`}
                </span>
                <span className="inline-block rounded-full px-2.5 py-0.5 font-semibold bg-white text-emerald-700 ring-1 ring-emerald-200">{paidEarlier} of these paid before this window</span>
                <span className="inline-block rounded-full px-2.5 py-0.5 font-semibold bg-neutral-100 text-neutral-600">{freeOrders} got it free (coupon or credits)</span>
                {teamRows > 0 && <span className="inline-block rounded-full px-2.5 py-0.5 font-semibold bg-neutral-100 text-neutral-500">{teamRows} team account{teamRows === 1 ? "" : "s"}, not counted</span>}
              </div>
            ) : (
              <div className="px-5 py-2.5 border-b border-neutral-100 text-xs text-neutral-600">
                Revenue shows for {dbSiteName} only, the site whose payments this admin reads. Pick All or {dbSiteName} to see it.
              </div>
            ))}
            {automatedOnly > 0 && (
              <div className="px-5 py-2 border-b border-neutral-100 text-xs text-neutral-500">
                {automatedOnly} more signed-up {automatedOnly === 1 ? "person" : "people"} had only automated events in this window (their campaign's emails, reminders) and {automatedOnly === 1 ? "is" : "are"} not listed.
              </div>
            )}
            {warnings.map((w) => <div key={w} className="px-5 py-2 border-b border-amber-200 bg-amber-50 text-xs text-amber-800">{w}</div>)}
            <div className="divide-y divide-neutral-100">
              {filtered.map((r) => {
                const fi = furthest(r.flags);
                const paid = r.flags.paid === 1;
                const refunded = !paid && r.payments.length > 0;
                const finished = paid || r.free || r.team || r.moneyUnknown; // nothing dropped to show
                const usedProducts = PRODUCTS.filter((p) => r.products[p.key]);
                const lastPay = r.payments.filter((p) => kept(p) > 0).slice(-1)[0];
                // In the window the pill shows that window's money, so the rows add up to the revenue line.
                const nowPays = r.payments.filter(inWindow);
                const paidNow = paid && nowPays.length > 0;
                const dropLabel = r.team
                  ? "Team account"
                  : paidNow
                    ? `Paid ${fmtMoney(nowPays)} · ${fmtDay(nowPays[nowPays.length - 1].at)}`
                    : paid
                      ? `Paid earlier · ${fmtMoney(r.payments)} · ${fmtDay(lastPay.at)}`
                      : refunded
                        ? "Paid, then refunded"
                        : r.free
                          ? "Got it free · no charge"
                          : r.moneyUnknown
                            ? "Order went through · payments not loaded"
                            : fi >= 0
                              ? (fi < STEPS.length - 1 ? `Dropped before: ${STEPS[fi + 1].label}` : "Reached last step")
                              : usedProducts.length > 0 ? "Other tools only" : "Signed up only";
                const pillCls = r.team
                  ? "bg-neutral-100 text-neutral-500"
                  : paidNow
                    ? "bg-emerald-100 text-emerald-800"
                    : paid
                      ? "bg-white text-emerald-700 ring-1 ring-emerald-200"
                      : refunded
                        ? "bg-amber-50 text-amber-800"
                        : r.free || r.moneyUnknown || fi < 0
                          ? "bg-neutral-100 text-neutral-600"
                          : "bg-red-50 text-red-700";
                const pillTitle = [
                  r.team ? "Admin or ops role, or a studojo.com address: its orders are tests, not revenue." : "",
                  ...r.payments.map(describePayment),
                  !r.payments.length && r.free ? "The order went through without money: a 100% coupon, or a campaign run on credits." : "",
                  r.moneyUnknown ? "Payments did not load, so this order cannot be shown as paid or free." : "",
                ].filter(Boolean).join("\n") || undefined;
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
                          else if (s.key === "paid" && refunded) { cls = "bg-amber-300"; title = "Paid, then refunded"; }
                          else if (s.key === "paid" && r.free) { cls = "bg-white ring-2 ring-emerald-400"; title = "Got it without paying (100% coupon or credits)"; }
                          else if (k === fi + 1 && !finished) { cls = "bg-red-400 ring-2 ring-red-200"; title = `${s.label}: dropped here`; }
                          else { cls = "bg-neutral-200"; title = `${s.label}: never reached`; }
                          return <span key={s.key} title={title} className={`h-2.5 w-2.5 rounded-full ${cls}`} />;
                        })}
                      </div>
                      <div className="w-60 text-right">
                        <span title={pillTitle} className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-bold ${pillCls}`}>{dropLabel}</span>
                      </div>
                    </button>
                    {open === r.pid && (
                      <div className="bg-neutral-50 px-5 py-4 border-t border-neutral-100">
                        {(r.payments.length > 0 || r.free || r.team) && (
                          <div className="mb-3 text-[12px] text-neutral-700">
                            <span className="font-semibold">Payments: </span>
                            {r.payments.length
                              ? r.payments.map(describePayment).join(" · ")
                              : r.free ? "none. The order went through on a 100% coupon or on credits." : "none."}
                            {r.team && <span className="text-neutral-500"> Team account: its orders are tests, not revenue.</span>}
                          </div>
                        )}
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
