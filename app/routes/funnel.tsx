import { useEffect, useState, useCallback } from "react";
import { getToken } from "~/lib/api";
import { AdminHeader } from "~/components";

// ── helpers ─────────────────────────────────────────────────────────────────
async function phQuery(query: string) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  return res.json();
}
const fmt = (n: number) => (n ?? 0).toLocaleString("en-US");
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
const niceDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

// Macro funnel: signups come from the DB (authoritative), the rest from PostHog events.
const STEPS = [
  { key: "visits", label: "Website visits" },
  { key: "signups", label: "Signed up" },
  { key: "outreach", label: "Reached outreach" },
  { key: "resume", label: "Uploaded resume" },
  { key: "quiz", label: "Completed profile quiz" },
  { key: "leads", label: "Saw their leads" },
  { key: "paypage", label: "Reached payment page" },
  { key: "paytap", label: "Tapped pay" },
  { key: "abandoned", label: "Abandoned checkout" },
  { key: "paid", label: "Paid" },
] as const;

type Row = Record<string, any> & { day: string };

// Environment filter — events carry $host (studojo.com = prod, studojo.pro = staging).
function envWhere(env: string) {
  if (env === "prod") return "AND properties.$host LIKE '%studojo.com%'";
  if (env === "staging") return "AND properties.$host LIKE '%studojo.pro%'";
  return "";
}
// Time filter in IST (events are UTC; +330 min → India calendar day), so
// "Today"/"Yesterday" mean the founder's day. `tc` is a full WHERE fragment.
const IST_DAY = "toDate(timestamp + INTERVAL 330 MINUTE)";
function timeClause(start: string, end: string) {
  return `${IST_DAY} >= toDate('${start}') AND ${IST_DAY} <= toDate('${end}')`;
}
function macroHogql(tc: string, env: string) {
  return `
    SELECT ${IST_DAY} AS day,
      uniqIf(person_id, event='$pageview') AS visits,
      uniqIf(person_id, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS outreach,
      uniqIf(person_id, event='resume_uploaded') AS resume,
      uniqIf(person_id, event='profile_quiz_completed') AS quiz,
      uniqIf(person_id, event='leads_loaded') AS leads,
      uniqIf(person_id, event='$pageview' AND properties.$pathname LIKE '/outreach/enrichment%') AS paypage,
      uniqIf(person_id, event='pay_now_clicked') AS paytap,
      uniqIf(person_id, event='checkout_abandoned') AS abandoned
    FROM events WHERE ${tc} ${envWhere(env)}
    GROUP BY day ORDER BY day DESC`;
}
// True nested funnel: range-level unique people, each step requires ALL prior
// steps, so counts are always monotonic (no more ">100% kept"). One row.
function nestedHogql(tc: string, env: string) {
  return `
    SELECT
      countIf(v) AS visited,
      countIf(v AND ro) AS reached,
      countIf(v AND ro AND ru) AS resume,
      countIf(v AND ro AND ru AND qz) AS quiz,
      countIf(v AND ro AND ru AND qz AND ld) AS leads,
      countIf(v AND ro AND ru AND qz AND ld AND pp) AS paypage,
      countIf(v AND ro AND ru AND qz AND ld AND pp AND pt) AS paytap
    FROM (
      SELECT person_id,
        max(event='$pageview') AS v,
        max(event='$pageview' AND properties.$pathname LIKE '/outreach%') AS ro,
        max(event='resume_uploaded') AS ru,
        max(event='profile_quiz_completed') AS qz,
        max(event='leads_loaded') AS ld,
        max(event='$pageview' AND properties.$pathname LIKE '/outreach/enrichment%') AS pp,
        max(event='pay_now_clicked') AS pt
      FROM events WHERE ${tc} ${envWhere(env)}
      GROUP BY person_id
    )`;
}
// Where the outreach drop-offs went: of people who reached the outreach page but
// never uploaded a resume, how many forked to another Studojo tool instead.
function forkHogql(tc: string, env: string) {
  return `
    SELECT
      count() AS cohort,
      countIf(careers OR coach OR assignment OR internships OR humanizer) AS any_other,
      countIf(careers) AS careers,
      countIf(coach) AS coach,
      countIf(assignment) AS assignment,
      countIf(internships) AS internships,
      countIf(humanizer) AS humanizer
    FROM (
      SELECT person_id,
        max(event='$pageview' AND properties.$pathname LIKE '/outreach%') AS ro,
        max(event='resume_uploaded') AS ru,
        max(event='$pageview' AND properties.$pathname LIKE '/careers%') AS careers,
        max(event='$pageview' AND properties.$pathname LIKE '/cc%') AS coach,
        max(event='$pageview' AND (properties.$pathname LIKE '/assignments%' OR properties.$pathname LIKE '/dojos/assignment%')) AS assignment,
        max(event='$pageview' AND properties.$pathname LIKE '/dojos/internships%') AS internships,
        max(event='$pageview' AND properties.$pathname LIKE '/dojos/humanizer%') AS humanizer
      FROM events WHERE ${tc} ${envWhere(env)}
      GROUP BY person_id
    )
    WHERE ro AND NOT ru`;
}
function quizHogql(tc: string, env: string) {
  return `
    SELECT toInt(properties.question_number) AS q, uniq(person_id) AS people
    FROM events WHERE event='quiz_question_answered' AND ${tc} ${envWhere(env)}
      AND isNotNull(properties.question_number)
    GROUP BY q ORDER BY q ASC LIMIT 20`;
}
const DETAIL_EVENTS = [
  "resume_upload_started", "resume_uploaded", "resume_upload_failed",
  "quiz_started", "profile_quiz_completed",
  "discovery_started", "discovery_completed", "discovery_failed",
  "lead_contact_clicked", "get_emails_clicked",
  "tier_selected", "pay_now_clicked", "coupon_applied",
  "checkout_opened", "checkout_abandoned", "payment_failed", "payment_confirmed",
  "back_to_leads_clicked",
];
function detailHogql(tc: string, env: string) {
  const list = DETAIL_EVENTS.map((e) => `'${e}'`).join(",");
  return `
    SELECT event, uniq(person_id) AS people, count() AS total
    FROM events WHERE event IN (${list}) AND ${tc} ${envWhere(env)}
    GROUP BY event ORDER BY people DESC`;
}
// Median time between key steps (seconds), per person, first occurrence of each.
const TIMINGS = [
  { key: "quiz", label: "Quiz: start → complete", a: "quiz_started", b: "profile_quiz_completed" },
  { key: "leads", label: "Resume → saw leads", a: "resume_uploaded", b: "leads_loaded" },
  { key: "pay", label: "Tapped pay → paid", a: "pay_now_clicked", b: "payment_confirmed" },
  { key: "visitpay", label: "First visit → paid", a: "$pageview", b: "payment_confirmed" },
];
function timingHogql(tc: string, env: string) {
  const cols = TIMINGS.map((t) =>
    `medianIf(dateDiff('second', t_${t.key}_a, t_${t.key}_b), t_${t.key}_a > toDateTime('2000-01-01') AND t_${t.key}_b > t_${t.key}_a) AS ${t.key}`
  ).join(",\n      ");
  const inner = TIMINGS.map((t) =>
    `minIf(timestamp, event='${t.a}') AS t_${t.key}_a, minIf(timestamp, event='${t.b}') AS t_${t.key}_b`
  ).join(",\n        ");
  return `
    SELECT ${cols}
    FROM (
      SELECT person_id,
        ${inner}
      FROM events WHERE ${tc} ${envWhere(env)}
      GROUP BY person_id
    )`;
}
const DIMS: Record<string, { label: string; expr: string }> = {
  device: { label: "Device", expr: "properties.$device_type" },
  country: { label: "Country", expr: "properties.$geoip_country_name" },
  source: { label: "Traffic source", expr: "coalesce(nullIf(properties.utm_source, ''), properties.$referring_domain, '(direct)')" },
};
function breakdownHogql(tc: string, dim: string, env: string) {
  return `
    SELECT ${DIMS[dim].expr} AS seg,
      uniqIf(person_id, event='$pageview') AS visits,
      uniqIf(person_id, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS outreach,
      uniqIf(person_id, event='resume_uploaded') AS resume,
      uniqIf(person_id, event='leads_loaded') AS leads,
      uniqIf(person_id, event='payment_confirmed') AS paid
    FROM events WHERE ${tc} ${envWhere(env)}
    GROUP BY seg ORDER BY visits DESC LIMIT 12`;
}
function checkoutHogql(tc: string, env: string) {
  return `
    SELECT
      uniqIf(person_id, event='pay_now_clicked') AS clicked,
      uniqIf(person_id, event='checkout_opened') AS opened,
      uniqIf(person_id, event='payment_confirmed') AS paid,
      uniqIf(person_id, event='checkout_abandoned') AS abandoned,
      uniqIf(person_id, event='payment_failed') AS failed
    FROM events WHERE ${tc} ${envWhere(env)}`;
}
const fmtDur = (s: number) => {
  if (!s || s < 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
};

// IST calendar date, `offsetDays` ago (0 = today).
const istDate = (offsetDays = 0) => new Date(Date.now() + 330 * 60000 - offsetDays * 86400000).toISOString().slice(0, 10);
const RANGES = [
  { key: "today", label: "Today", range: () => ({ start: istDate(0), end: istDate(0) }) },
  { key: "yesterday", label: "Yesterday", range: () => ({ start: istDate(1), end: istDate(1) }) },
  { key: "7d", label: "7d", range: () => ({ start: istDate(6), end: istDate(0) }) },
  { key: "14d", label: "14d", range: () => ({ start: istDate(13), end: istDate(0) }) },
  { key: "30d", label: "30d", range: () => ({ start: istDate(29), end: istDate(0) }) },
] as const;
const ENVS: { key: "all" | "prod" | "staging"; label: string }[] = [
  { key: "all", label: "All" }, { key: "prod", label: "studojo.com" }, { key: "staging", label: "studojo.pro" },
];

export default function FunnelPage() {
  const [rangeKey, setRangeKey] = useState("7d");
  const [rows, setRows] = useState<Row[]>([]);
  const [funnel, setFunnel] = useState<Record<string, number>>({ visited: 0, reached: 0, resume: 0, quiz: 0, leads: 0 });
  const [dbTotals, setDbTotals] = useState<{ signups: number; paid: number }>({ signups: 0, paid: 0 });
  const [quiz, setQuiz] = useState<{ q: number; people: number }[]>([]);
  const [fork, setFork] = useState<Record<string, number> | null>(null);
  const [checkout, setCheckout] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<{ event: string; people: number; total: number }[]>([]);
  const [timing, setTiming] = useState<Record<string, number>>({});
  const [env, setEnv] = useState<"all" | "prod" | "staging">("all");
  const [dim, setDim] = useState<"none" | "device" | "country" | "source">("none");
  const [bdRows, setBdRows] = useState<any[]>([]);
  const [bdLoading, setBdLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (rk: string, e: string) => {
    setLoading(true); setError("");
    try {
      const { start, end } = (RANGES.find((r) => r.key === rk) ?? RANGES[2]).range();
      const tc = timeClause(start, end);
      const token = await getToken();
      const [macro, nestedRes, quizRes, coRes, detailRes, timingRes, forkRes, signupsRes] = await Promise.all([
        phQuery(macroHogql(tc, e)),
        phQuery(nestedHogql(tc, e)),
        phQuery(quizHogql(tc, e)),
        phQuery(checkoutHogql(tc, e)),
        phQuery(detailHogql(tc, e)),
        phQuery(timingHogql(tc, e)),
        phQuery(forkHogql(tc, e)).catch(() => ({ results: [] })),
        fetch(`/api/dashboard?start=${start}&end=${end}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} }).then((r) => r.json()).catch(() => ({ daily: [] })),
      ]);
      const fk = forkRes.results?.[0] ?? [];
      setFork(fk.length ? {
        cohort: +fk[0] || 0, any_other: +fk[1] || 0, careers: +fk[2] || 0,
        coach: +fk[3] || 0, assignment: +fk[4] || 0, internships: +fk[5] || 0, humanizer: +fk[6] || 0,
      } : null);
      // Signups AND paid come from Postgres (authoritative). PostHog's
      // payment_confirmed was empty historically, which is why Paid showed 0.
      const signupMap: Record<string, number> = {};
      const paidMap: Record<string, number> = {};
      let signupTot = 0; let paidTot = 0;
      for (const row of signupsRes?.daily ?? []) {
        signupMap[row.day] = row.signups ?? 0; paidMap[row.day] = row.paid ?? 0;
        signupTot += row.signups ?? 0; paidTot += row.paid ?? 0;
      }
      setDbTotals({ signups: signupTot, paid: paidTot });

      // Top funnel = nested range-level unique people (monotonic).
      const nr = nestedRes.results?.[0] ?? [];
      setFunnel({ visited: +nr[0] || 0, reached: +nr[1] || 0, resume: +nr[2] || 0, quiz: +nr[3] || 0, leads: +nr[4] || 0, paypage: +nr[5] || 0, paytap: +nr[6] || 0 });

      // Day-by-day grid = per-day independent counts (trend).
      const macroRows: Row[] = (macro.results ?? []).map((r: any[]) => {
        const day = String(r[0]).slice(0, 10);
        return { day, visits: +r[1] || 0, outreach: +r[2] || 0, resume: +r[3] || 0, quiz: +r[4] || 0, leads: +r[5] || 0, paypage: +r[6] || 0, paytap: +r[7] || 0, abandoned: +r[8] || 0, paid: paidMap[day] || 0, signups: signupMap[day] || 0 };
      });
      setRows(macroRows);
      setQuiz((quizRes.results ?? []).map((r: any[]) => ({ q: +r[0], people: +r[1] || 0 })));
      const co = coRes.results?.[0] ?? [];
      setCheckout({ clicked: +co[0] || 0, opened: +co[1] || 0, paid: +co[2] || 0, abandoned: +co[3] || 0, failed: +co[4] || 0 });
      setDetail((detailRes.results ?? []).map((r: any[]) => ({ event: String(r[0]), people: +r[1] || 0, total: +r[2] || 0 })));
      const tr = timingRes.results?.[0] ?? [];
      const tObj: Record<string, number> = {};
      TIMINGS.forEach((t, i) => { tObj[t.key] = +tr[i] || 0; });
      setTiming(tObj);
    } catch (e: any) {
      setError(e?.message || "Failed to load funnel");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(rangeKey, env); }, [rangeKey, env, load]);

  // Breakdown by device / country / source — runs only when a dimension is picked.
  useEffect(() => {
    if (dim === "none") { setBdRows([]); return; }
    let cancelled = false;
    setBdLoading(true);
    const { start, end } = (RANGES.find((r) => r.key === rangeKey) ?? RANGES[2]).range();
    phQuery(breakdownHogql(timeClause(start, end), dim, env))
      .then((res) => { if (!cancelled) setBdRows(res.results ?? []); })
      .catch(() => { if (!cancelled) setBdRows([]); })
      .finally(() => { if (!cancelled) setBdLoading(false); });
    return () => { cancelled = true; };
  }, [dim, rangeKey, env]);

  const rangeLabel = RANGES.find((r) => r.key === rangeKey)?.label ?? rangeKey;
  const rangeTitle = rangeKey === "today" ? "Today" : rangeKey === "yesterday" ? "Yesterday" : `Last ${rangeLabel}`;

  // Strict outreach funnel (nested) + acquisition context. Paid from DB.
  const visited = funnel.visited || 0;
  // Full journey, logically ordered & monotonic:
  //   visits → reached /outreach page → signed up → resume → quiz → leads → payment page → tapped pay → paid
  // "Reached outreach" is a /outreach pageview (anonymous incl.), so it sits ABOVE signup.
  // Signups & Paid are authoritative from Postgres; the rest are unique people from PostHog.
  const FUNNEL = [
    { label: "Reached outreach page", val: funnel.reached || 0, prev: visited, note: "viewed /outreach" },
    { label: "Signed up", val: dbTotals.signups || 0, prev: funnel.reached || 0, note: "DB" },
    { label: "Uploaded resume", val: funnel.resume || 0, prev: dbTotals.signups || 0 },
    { label: "Completed profile quiz", val: funnel.quiz || 0, prev: funnel.resume || 0 },
    { label: "Saw their leads", val: funnel.leads || 0, prev: funnel.quiz || 0 },
    { label: "Reached payment page", val: funnel.paypage || 0, prev: funnel.leads || 0 },
    { label: "Tapped pay", val: funnel.paytap || 0, prev: funnel.paypage || 0 },
    { label: "Paid", val: dbTotals.paid || 0, prev: funnel.paytap || 0, note: "DB" },
  ];
  const quizMax = Math.max(1, ...quiz.map((x) => x.people));

  const card = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-3 mb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-3xl font-bold text-neutral-900">Funnel</h1>
            <p className="text-sm text-neutral-600 mt-1">Every step from website visit to paid, plus quiz and checkout drop-off.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
              {ENVS.map((e) => (
                <button key={e.key} onClick={() => setEnv(e.key)} className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${env === e.key ? "bg-neutral-900 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{e.label}</button>
              ))}
            </div>
            {RANGES.map((r) => (
              <button key={r.key} onClick={() => setRangeKey(r.key)} className={`rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${rangeKey === r.key ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`}>{r.label}</button>
            ))}
          </div>
        </div>

        {error && <div className="mb-6 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm text-red-700">{error}</div>}

        {loading ? (
          <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" /></div>
        ) : (
          <>
            {/* Macro funnel */}
            <div className={`mb-8 p-5 md:p-6 ${card}`}>
              <div className="flex items-baseline justify-between mb-4">
                <h2 className="font-['Clash_Display'] text-xl font-bold">{rangeTitle}</h2>
                <span className="text-xs text-neutral-500">nested funnel · unique people who completed every prior step · IST</span>
              </div>

              {/* Acquisition (top of funnel, not strictly sequential) */}
              <div className="grid grid-cols-2 gap-4 mb-5">
                <div className="rounded-xl border-2 border-neutral-900 bg-neutral-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Website visits</p>
                  <p className="font-['Clash_Display'] text-3xl font-bold text-neutral-900 mt-1">{fmt(visited)}</p>
                </div>
                <div className="rounded-xl border-2 border-neutral-900 bg-neutral-50 p-4">
                  <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500">Signed up</p>
                  <p className="font-['Clash_Display'] text-3xl font-bold text-neutral-900 mt-1">{fmt(dbTotals.signups)} <span className="text-base font-semibold text-neutral-400">· {pct(dbTotals.signups, visited)}% of visits</span></p>
                </div>
              </div>

              {/* Strict outreach funnel */}
              <p className="text-[11px] font-bold uppercase tracking-wide text-neutral-500 mb-2">Outreach funnel</p>
              <div className="space-y-3">
                {FUNNEL.map((s, i) => {
                  const ofVisits = pct(s.val, visited);
                  const ofReached = pct(s.val, FUNNEL[0].val);
                  const kept = Math.min(100, pct(s.val, s.prev));
                  const drop = 100 - kept;
                  return (
                    <div key={s.label} className="flex items-center gap-4">
                      <div className="w-44 flex-shrink-0 text-sm font-semibold">{i + 1}. {s.label}{(s as any).note && <span className="block text-[10px] font-normal text-neutral-400">{(s as any).note}</span>}</div>
                      <div className="flex-1 h-8 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200">
                        <div className={`h-full flex items-center px-2 ${s.label === "Paid" ? "bg-emerald-500" : "bg-violet-500"}`} style={{ width: `${Math.max(ofReached, 3)}%` }}><span className="text-xs font-bold text-white whitespace-nowrap">{fmt(s.val)}</span></div>
                      </div>
                      <div className="w-16 text-right text-sm font-bold">{ofVisits}%<span className="block text-[10px] font-normal text-neutral-400">of visits</span></div>
                      <div className={`w-32 text-right text-xs font-semibold ${i === 0 ? "text-neutral-400" : drop > 60 ? "text-red-600" : drop > 30 ? "text-amber-600" : "text-emerald-600"}`}>{i === 0 ? "base" : `${kept}% kept · ${drop}% drop`}</div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Where the outreach drop-offs went */}
            {fork && fork.cohort > 0 && (
              <div className={`p-5 md:p-6 mb-8 ${card}`}>
                <h2 className="font-['Clash_Display'] text-xl font-bold mb-1">Where the drop-offs went</h2>
                <p className="text-xs text-neutral-500 mb-4">
                  Of the <b>{fmt(fork.cohort)}</b> people who reached outreach but never uploaded a resume,
                  {" "}<b>{fmt(fork.any_other)}</b> ({pct(fork.any_other, fork.cohort)}%) used another Studojo tool instead.
                </p>
                <div className="space-y-2">
                  {[
                    { label: "Career Coach (chat)", v: fork.coach },
                    { label: "Resume / Careers", v: fork.careers },
                    { label: "Assignment Dojo", v: fork.assignment },
                    { label: "Internships Dojo", v: fork.internships },
                    { label: "Humanizer", v: fork.humanizer },
                    { label: "Used no other tool (pure drop)", v: Math.max(0, fork.cohort - fork.any_other) },
                  ].map((t) => (
                    <div key={t.label} className="flex items-center gap-3">
                      <div className="w-48 flex-shrink-0 text-sm font-medium">{t.label}</div>
                      <div className="flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200">
                        <div className="h-full bg-violet-400 flex items-center px-2" style={{ width: `${Math.max(pct(t.v, fork.cohort), t.v > 0 ? 4 : 0)}%` }}>
                          {t.v > 0 && <span className="text-xs font-bold text-white">{fmt(t.v)}</span>}
                        </div>
                      </div>
                      <div className="w-14 text-right text-sm font-bold">{pct(t.v, fork.cohort)}%</div>
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-400 mt-3">A person can appear under more than one tool. Cohort = reached /outreach, no resume upload (PostHog person-level).</p>
              </div>
            )}

            {/* Quiz + Checkout drop-off */}
            <div className="grid gap-6 lg:grid-cols-2 mb-8">
              <div className={`p-5 md:p-6 ${card}`}>
                <h2 className="font-['Clash_Display'] text-xl font-bold mb-1">Quiz drop-off</h2>
                <p className="text-xs text-neutral-500 mb-4">How many people answered each question. Where the bar shrinks is where they quit.</p>
                {quiz.length === 0 ? <p className="text-sm text-neutral-400 py-6 text-center">No quiz data yet (events start after the latest deploy).</p> : (
                  <div className="space-y-2">
                    {quiz.map((x, i) => {
                      const prev = i === 0 ? x.people : quiz[i - 1].people;
                      const drop = i === 0 ? 0 : 100 - pct(x.people, prev);
                      return (
                        <div key={x.q} className="flex items-center gap-3">
                          <div className="w-14 flex-shrink-0 text-xs font-semibold text-neutral-600">Q{x.q}</div>
                          <div className="flex-1 h-7 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200">
                            <div className="h-full bg-emerald-500 flex items-center px-2" style={{ width: `${Math.max(pct(x.people, quizMax), 4)}%` }}><span className="text-[11px] font-bold text-white">{fmt(x.people)}</span></div>
                          </div>
                          <div className={`w-16 text-right text-xs font-semibold ${drop > 30 ? "text-red-600" : "text-neutral-400"}`}>{i === 0 ? "—" : `-${drop}%`}</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className={`p-5 md:p-6 ${card}`}>
                <h2 className="font-['Clash_Display'] text-xl font-bold mb-1">Checkout drop-off</h2>
                <p className="text-xs text-neutral-500 mb-4">Tapped pay → reached Razorpay/Dodo → paid. Plus who abandoned or failed.</p>
                {(checkout.clicked || 0) === 0 ? <p className="text-sm text-neutral-400 py-6 text-center">No checkout data yet (events start after the latest deploy).</p> : (
                  <div className="space-y-3">
                    {[["Tapped pay", checkout.clicked], ["Reached checkout", checkout.opened], ["Paid", checkout.paid]].map(([label, val], i, arr) => {
                      const prev = i === 0 ? (val as number) : (arr[i - 1][1] as number);
                      const drop = i === 0 ? 0 : 100 - pct(val as number, prev);
                      return (
                        <div key={label as string} className="flex items-center gap-3">
                          <div className="w-32 flex-shrink-0 text-sm font-semibold">{label}</div>
                          <div className="flex-1 h-8 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200">
                            <div className="h-full bg-violet-500 flex items-center px-2" style={{ width: `${Math.max(pct(val as number, checkout.clicked || 1), 4)}%` }}><span className="text-xs font-bold text-white">{fmt(val as number)}</span></div>
                          </div>
                          <div className={`w-16 text-right text-xs font-semibold ${drop > 40 ? "text-red-600" : "text-neutral-400"}`}>{i === 0 ? "—" : `-${drop}%`}</div>
                        </div>
                      );
                    })}
                    <div className="flex gap-3 pt-2 mt-1 border-t border-neutral-100">
                      <span className="rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1 text-xs font-semibold text-amber-700">{fmt(checkout.abandoned || 0)} abandoned</span>
                      <span className="rounded-lg bg-red-50 border border-red-200 px-2.5 py-1 text-xs font-semibold text-red-700">{fmt(checkout.failed || 0)} failed</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Time between steps */}
            <div className={`mb-8 p-5 md:p-6 ${card}`}>
              <h2 className="font-['Clash_Display'] text-xl font-bold mb-1">Time between steps</h2>
              <p className="text-xs text-neutral-500 mb-4">Median time people take to move from one step to the next.</p>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {TIMINGS.map((t) => (
                  <div key={t.key} className="rounded-xl border-2 border-neutral-900 bg-neutral-50 p-4 text-center">
                    <p className="font-['Clash_Display'] text-2xl font-bold text-neutral-900">{fmtDur(timing[t.key] || 0)}</p>
                    <p className="text-[11px] text-neutral-600 mt-1">{t.label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Breakdown by segment */}
            <div className={`mb-8 p-5 md:p-6 ${card}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                <div>
                  <h2 className="font-['Clash_Display'] text-xl font-bold">Funnel by segment</h2>
                  <p className="text-xs text-neutral-500 mt-0.5">Compare conversion across device, country, or traffic source.</p>
                </div>
                <div className="flex items-center gap-2">
                  {(["none", "device", "country", "source"] as const).map((d) => (
                    <button key={d} onClick={() => setDim(d)} className={`rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${dim === d ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`}>{d === "none" ? "None" : DIMS[d].label}</button>
                  ))}
                </div>
              </div>
              {dim === "none" ? (
                <p className="text-sm text-neutral-400 py-6 text-center">Pick a dimension above to break the funnel down.</p>
              ) : bdLoading ? (
                <div className="flex justify-center py-8"><div className="h-6 w-6 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" /></div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead><tr className="bg-neutral-50 text-left text-neutral-700">
                      <th className="px-3 py-2 border-b border-neutral-200">{DIMS[dim].label}</th>
                      {["Visits", "Reached outreach", "Resume", "Saw leads", "Paid", "Visit→Paid"].map((h) => <th key={h} className="px-3 py-2 text-right border-b border-neutral-200 whitespace-nowrap">{h}</th>)}
                    </tr></thead>
                    <tbody>
                      {bdRows.map((r, i) => {
                        const [seg, v, o, re, le, pa] = [String(r[0] ?? "(unknown)"), +r[1] || 0, +r[2] || 0, +r[3] || 0, +r[4] || 0, +r[5] || 0];
                        return (
                          <tr key={i} className={i % 2 ? "bg-neutral-50/40" : "bg-white"}>
                            <td className="px-3 py-2 font-medium border-b border-neutral-100 max-w-[200px] truncate">{seg}</td>
                            <td className="px-3 py-2 text-right border-b border-neutral-100 tabular-nums">{fmt(v)}</td>
                            <td className="px-3 py-2 text-right border-b border-neutral-100 tabular-nums">{fmt(o)}</td>
                            <td className="px-3 py-2 text-right border-b border-neutral-100 tabular-nums">{fmt(re)}</td>
                            <td className="px-3 py-2 text-right border-b border-neutral-100 tabular-nums">{fmt(le)}</td>
                            <td className="px-3 py-2 text-right border-b border-neutral-100 tabular-nums font-semibold">{fmt(pa)}</td>
                            <td className={`px-3 py-2 text-right border-b border-neutral-100 tabular-nums font-bold ${pct(pa, v) >= 2 ? "text-emerald-600" : "text-neutral-500"}`}>{pct(pa, v)}%</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* All tracked events */}
            <div className={`mb-8 p-5 md:p-6 ${card}`}>
              <h2 className="font-['Clash_Display'] text-xl font-bold mb-1">All tracked events</h2>
              <p className="text-xs text-neutral-500 mb-4">Every semantic event · {rangeTitle.toLowerCase()}. People = unique users, Total = raw count.</p>
              {detail.length === 0 ? <p className="text-sm text-neutral-400 py-6 text-center">No events yet (new events start collecting after the latest deploy).</p> : (
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-sm">
                    <thead><tr className="bg-neutral-50 text-left text-neutral-700">
                      <th className="px-3 py-2 border-b border-neutral-200">Event</th>
                      <th className="px-3 py-2 text-right border-b border-neutral-200">People</th>
                      <th className="px-3 py-2 text-right border-b border-neutral-200">Total</th>
                    </tr></thead>
                    <tbody>
                      {detail.map((e, i) => (
                        <tr key={e.event} className={i % 2 ? "bg-neutral-50/40" : "bg-white"}>
                          <td className="px-3 py-2 font-mono text-[13px] border-b border-neutral-100">{e.event}</td>
                          <td className="px-3 py-2 text-right border-b border-neutral-100 tabular-nums font-semibold">{fmt(e.people)}</td>
                          <td className="px-3 py-2 text-right border-b border-neutral-100 tabular-nums text-neutral-500">{fmt(e.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* Per-day grid */}
            <div className={`overflow-hidden ${card}`}>
              <div className="px-5 py-3 border-b-2 border-neutral-900 bg-neutral-50"><h2 className="font-['Clash_Display'] text-lg font-bold">Day by day</h2></div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead><tr className="bg-neutral-50">
                    <th className="sticky left-0 z-10 bg-neutral-50 text-left px-4 py-3 font-semibold text-neutral-700 border-b border-neutral-200 min-w-[180px]">Step</th>
                    {rows.map((r) => <th key={r.day} className="px-3 py-3 text-right font-semibold text-neutral-700 border-b border-l border-neutral-200 whitespace-nowrap">{niceDay(r.day)}</th>)}
                  </tr></thead>
                  <tbody>
                    {STEPS.map((s, i) => (
                      <tr key={s.key} className={i % 2 ? "bg-neutral-50/40" : "bg-white"}>
                        <td className="sticky left-0 z-10 bg-inherit px-4 py-2.5 font-medium border-b border-neutral-100 whitespace-nowrap"><span className="text-neutral-400 mr-1.5">{i + 1}</span>{s.label}</td>
                        {rows.map((r) => {
                          const val = r[s.key] || 0;
                          const conv = i === 0 ? 100 : pct(val, r.visits || 0);
                          return <td key={r.day} className="px-3 py-2.5 text-right border-b border-l border-neutral-100 tabular-nums"><span className="font-semibold">{fmt(val)}</span>{i > 0 && <span className="block text-[10px] text-neutral-400">{conv}%</span>}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-neutral-400 mt-4">Signups and Paid from Postgres (authoritative). Other steps = unique people in PostHog. "Reached outreach" = a /outreach pageview. Note: PostHog events span all environments; new quiz/checkout events appear once that build is live.</p>
          </>
        )}
      </main>
    </div>
  );
}
