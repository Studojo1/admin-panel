import { useEffect, useState, useCallback } from "react";
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
const isoDate = (d: Date) => d.toISOString().slice(0, 10);
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
  { key: "paid", label: "Paid" },
] as const;

type Row = Record<string, any> & { day: string };

// Environment filter — events carry $host (studojo.com = prod, studojo.pro = staging).
function envWhere(env: string) {
  if (env === "prod") return "AND properties.$host LIKE '%studojo.com%'";
  if (env === "staging") return "AND properties.$host LIKE '%studojo.pro%'";
  return "";
}
function macroHogql(days: number, env: string) {
  return `
    SELECT toDate(timestamp) AS day,
      uniqIf(person_id, event='$pageview') AS visits,
      uniqIf(person_id, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS outreach,
      uniqIf(person_id, event='resume_uploaded') AS resume,
      uniqIf(person_id, event='profile_quiz_completed') AS quiz,
      uniqIf(person_id, event='leads_loaded') AS leads,
      uniqIf(person_id, event='payment_confirmed') AS paid
    FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}
    GROUP BY day ORDER BY day DESC`;
}
function quizHogql(days: number, env: string) {
  return `
    SELECT toInt(properties.question_number) AS q, uniq(person_id) AS people
    FROM events WHERE event='quiz_question_answered' AND timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}
      AND isNotNull(properties.question_number)
    GROUP BY q ORDER BY q ASC LIMIT 20`;
}
const DETAIL_EVENTS = [
  "resume_upload_started", "resume_uploaded", "resume_upload_failed",
  "quiz_started", "profile_quiz_completed",
  "lead_contact_clicked", "get_emails_clicked",
  "tier_selected", "pay_now_clicked", "coupon_applied",
  "checkout_opened", "checkout_abandoned", "payment_failed", "payment_confirmed",
  "back_to_leads_clicked",
];
function detailHogql(days: number, env: string) {
  const list = DETAIL_EVENTS.map((e) => `'${e}'`).join(",");
  return `
    SELECT event, uniq(person_id) AS people, count() AS total
    FROM events WHERE event IN (${list}) AND timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}
    GROUP BY event ORDER BY people DESC`;
}
// Median time between key steps (seconds), per person, first occurrence of each.
const TIMINGS = [
  { key: "quiz", label: "Quiz: start → complete", a: "quiz_started", b: "profile_quiz_completed" },
  { key: "leads", label: "Resume → saw leads", a: "resume_uploaded", b: "leads_loaded" },
  { key: "pay", label: "Tapped pay → paid", a: "pay_now_clicked", b: "payment_confirmed" },
  { key: "visitpay", label: "First visit → paid", a: "$pageview", b: "payment_confirmed" },
];
function timingHogql(days: number, env: string) {
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
      FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}
      GROUP BY person_id
    )`;
}
const DIMS: Record<string, { label: string; expr: string }> = {
  device: { label: "Device", expr: "properties.$device_type" },
  country: { label: "Country", expr: "properties.$geoip_country_name" },
  source: { label: "Traffic source", expr: "coalesce(nullIf(properties.utm_source, ''), properties.$referring_domain, '(direct)')" },
};
function breakdownHogql(days: number, dim: string, env: string) {
  return `
    SELECT ${DIMS[dim].expr} AS seg,
      uniqIf(person_id, event='$pageview') AS visits,
      uniqIf(person_id, event='$pageview' AND properties.$pathname LIKE '/outreach%') AS outreach,
      uniqIf(person_id, event='resume_uploaded') AS resume,
      uniqIf(person_id, event='leads_loaded') AS leads,
      uniqIf(person_id, event='payment_confirmed') AS paid
    FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}
    GROUP BY seg ORDER BY visits DESC LIMIT 12`;
}
function checkoutHogql(days: number, env: string) {
  return `
    SELECT
      uniqIf(person_id, event='pay_now_clicked') AS clicked,
      uniqIf(person_id, event='checkout_opened') AS opened,
      uniqIf(person_id, event='payment_confirmed') AS paid,
      uniqIf(person_id, event='checkout_abandoned') AS abandoned,
      uniqIf(person_id, event='payment_failed') AS failed
    FROM events WHERE timestamp >= now() - INTERVAL ${days} DAY ${envWhere(env)}`;
}
const fmtDur = (s: number) => {
  if (!s || s < 0) return "—";
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;
};

const PRESETS = [7, 14, 30] as const;
const ENVS: { key: "all" | "prod" | "staging"; label: string }[] = [
  { key: "all", label: "All" }, { key: "prod", label: "studojo.com" }, { key: "staging", label: "studojo.pro" },
];

export default function FunnelPage() {
  const [days, setDays] = useState(14);
  const [rows, setRows] = useState<Row[]>([]);
  const [quiz, setQuiz] = useState<{ q: number; people: number }[]>([]);
  const [checkout, setCheckout] = useState<Record<string, number>>({});
  const [detail, setDetail] = useState<{ event: string; people: number; total: number }[]>([]);
  const [timing, setTiming] = useState<Record<string, number>>({});
  const [env, setEnv] = useState<"all" | "prod" | "staging">("all");
  const [dim, setDim] = useState<"none" | "device" | "country" | "source">("none");
  const [bdRows, setBdRows] = useState<any[]>([]);
  const [bdLoading, setBdLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async (d: number, e: string) => {
    setLoading(true); setError("");
    try {
      const end = isoDate(new Date());
      const start = isoDate(new Date(Date.now() - d * 86400000));
      const [macro, quizRes, coRes, detailRes, timingRes, signupsRes] = await Promise.all([
        phQuery(macroHogql(d, e)),
        phQuery(quizHogql(d, e)),
        phQuery(checkoutHogql(d, e)),
        phQuery(detailHogql(d, e)),
        phQuery(timingHogql(d, e)),
        fetch(`/api/dashboard?start=${start}&end=${end}`, { credentials: "include" }).then((r) => r.json()).catch(() => ({ daily: [] })),
      ]);
      // Signups AND paid come from Postgres (authoritative). PostHog's
      // payment_confirmed was empty historically, which is why Paid showed 0.
      const signupMap: Record<string, number> = {};
      const paidMap: Record<string, number> = {};
      for (const row of signupsRes?.daily ?? []) { signupMap[row.day] = row.signups ?? 0; paidMap[row.day] = row.paid ?? 0; }

      const macroRows: Row[] = (macro.results ?? []).map((r: any[]) => {
        const day = String(r[0]).slice(0, 10);
        return { day, visits: +r[1] || 0, outreach: +r[2] || 0, resume: +r[3] || 0, quiz: +r[4] || 0, leads: +r[5] || 0, paid: paidMap[day] || 0, signups: signupMap[day] || 0 };
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

  useEffect(() => { load(days, env); }, [days, env, load]);

  // Breakdown by device / country / source — runs only when a dimension is picked.
  useEffect(() => {
    if (dim === "none") { setBdRows([]); return; }
    let cancelled = false;
    setBdLoading(true);
    phQuery(breakdownHogql(days, dim, env))
      .then((res) => { if (!cancelled) setBdRows(res.results ?? []); })
      .catch(() => { if (!cancelled) setBdRows([]); })
      .finally(() => { if (!cancelled) setBdLoading(false); });
    return () => { cancelled = true; };
  }, [dim, days, env]);

  const totals = STEPS.reduce((a, s) => { a[s.key] = rows.reduce((sum, r) => sum + (r[s.key] || 0), 0); return a; }, {} as Record<string, number>);
  const topTotal = totals["visits"] || 0;
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
            {PRESETS.map((p) => (
              <button key={p} onClick={() => setDays(p)} className={`rounded-xl border-2 border-neutral-900 px-3 py-1.5 text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${days === p ? "bg-violet-500 text-white" : "bg-white text-neutral-900 hover:bg-neutral-50"}`}>{p}d</button>
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
                <h2 className="font-['Clash_Display'] text-xl font-bold">Last {days} days</h2>
                <span className="text-xs text-neutral-500">unique people per step · signups from DB, rest from PostHog</span>
              </div>
              <div className="space-y-3">
                {STEPS.map((s, i) => {
                  const val = totals[s.key] || 0;
                  const prev = i === 0 ? val : totals[STEPS[i - 1].key] || 0;
                  const ofTop = pct(val, topTotal);
                  const fromPrev = pct(val, prev);
                  const drop = i === 0 ? 0 : 100 - fromPrev;
                  return (
                    <div key={s.key} className="flex items-center gap-4">
                      <div className="w-44 flex-shrink-0 text-sm font-semibold">{i + 1}. {s.label}</div>
                      <div className="flex-1 h-8 rounded-lg bg-neutral-100 overflow-hidden border border-neutral-200">
                        <div className="h-full bg-violet-500 flex items-center px-2" style={{ width: `${Math.max(ofTop, 3)}%` }}><span className="text-xs font-bold text-white whitespace-nowrap">{fmt(val)}</span></div>
                      </div>
                      <div className="w-14 text-right text-sm font-bold">{ofTop}%</div>
                      <div className={`w-32 text-right text-xs font-semibold ${i === 0 ? "text-neutral-400" : drop > 60 ? "text-red-600" : drop > 30 ? "text-amber-600" : "text-emerald-600"}`}>{i === 0 ? "—" : `${fromPrev}% kept · ${drop}% drop`}</div>
                    </div>
                  );
                })}
              </div>
            </div>

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
              <p className="text-xs text-neutral-500 mb-4">Every semantic event in the last {days} days. People = unique users, Total = raw count.</p>
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
