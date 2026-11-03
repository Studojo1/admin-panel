import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminHeader } from "~/components";
import { FellowshipProgramSwitch } from "~/components/fellowship-program-switch";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/fellowship-program";
import "./fellowship-calendar.css";
import "./fellowship-program.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Program dashboard · Growth Fellowship · Studojo Admin" }];
}

// The Growth Fellowship programme dashboard: the founder's plan against what
// happened, applicants to posting fellows, where every post is in the
// pipeline, week by week, and one row per fellow. Read only; the review work
// happens on the calendar (/fellowship-program/calendar).

// ---------------------------------------------------------------- types (mirror programmeDashboard in app/lib/fellowship.server.ts)
interface Point { by: string; creators: number; posting: number; impressions: number }
interface Standing {
  thisWeek: { due: number; posted: number; missed: number }; lastWeek: { due: number; posted: number }; run: number; completedWeeks: number;
  impressions: number; atRisk: boolean; lastActivity: string | null; nextMilestone: { name: string; weeksToGo: number } | null;
}
interface Row {
  id: number; name: string; college: string | null; field: string | null; cohort: string | null; status: string; joined: string;
  connectionsAtJoin: number | null; connections: number | null; standing: Standing; posted: number; measured: number; avg: number;
  best: { title: string; impressions: number; url: string | null } | null; lastPosted: string | null; scheduled: number; drafts: number; stories: number; earlierPosts: number;
}
interface Week { week: string; partial: boolean; due: number; postedOfDue: number; posted: number; studojo: number; impressions: number; posting: number; joined: number }
interface Dash {
  today: string; thisWeek: string; programmeStart: string;
  rules: { goal: { impressions: number; creators: number; by: string }; plan: Point[]; postsPerWeek: number; studojoPerWeek: number | null };
  now: { creators: number; posting: number; impressions: number; avgPerPost: number };
  checkpoints: (Point & { actual: { creators: number; posting: number; impressions: number } | null })[];
  postsWeek: { target: number; scheduled: number; posted: number; dueByToday: number; missed: number; postedToday: number; total: number };
  daily: { day: string; due: number; postedOfDue: number; posted: number }[];
  funnel: { applied: number; fellows: number; postedOnce: number; postingThisWeek: number };
  pipeline: { drafting: number; sentBack: number; scheduled: number; overdue: number; blocked: number; posted: number; awaitingNumbers: number; withAnalytics: number; measured: number; needPhoto: number; askedForPhoto: number };
  weekly: Week[]; kinds: { kind: "personal" | "studojo"; posted: number; impressions: number; avg: number }[]; fellows: Row[];
}

// ---------------------------------------------------------------- helpers (same as the calendar)
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const DOWS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const day = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (s: string) => { const x = day(s); return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const addDays = (s: string, n: number) => { const x = day(s); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diff = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86400000);
const num = (n: number) => Number(n || 0).toLocaleString("en-US");
const kfmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M" : n >= 1000 ? String(Math.round(n / 100) / 10).replace(/\.0$/, "") + "K" : String(n));
const plural = (n: number, one: string, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const avClass = (name: string) => "av-" + ((name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 5) + 1);
const ago = (iso: string | null) => {
  if (!iso) return "Not yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
};

async function api<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error((j && j.error) || `Something went wrong (${res.status}). Please try again.`);
  return j as T;
}

function rowState(f: Row): [string, string] {
  if (f.status === "paused") return ["Paused", "pill-paused"];
  if (f.standing.atRisk) return ["At risk", "pill-risk"];
  if (!f.posted && !f.scheduled && !f.drafts) return ["No posts yet", "pill-new"];
  return ["Active", "pill-active"];
}

export default function FellowshipProgram() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [D, setD] = useState<Dash | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [at, setAt] = useState<string | null>(null);

  const load = useCallback(async () => {
    try { setD(await api<Dash>("/api/fellowship-dashboard")); setLoadError(null); setAt(new Date().toISOString()); }
    catch (e) { setLoadError((e as Error).message); }
  }, []);
  useEffect(() => { if (isAuthorized) load(); }, [isAuthorized, load]);
  // Fresh numbers when coming back to the tab, and every two minutes while it's open.
  useEffect(() => {
    if (!isAuthorized) return;
    const onVis = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => { if (document.visibilityState === "visible") load(); }, 120000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(t); };
  }, [isAuthorized, load]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-[#F5F5F0]"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" /></div>;
  }
  if (!isAuthorized) return null;

  return (
    <>
      <AdminHeader />
      {/* The header stays outside .fx so this page's styles never reach it. */}
      <div className="fx">
        {!D ? (
          <div className="loading">{loadError ? <div className="empty"><b>The dashboard didn't load</b>{loadError}<div style={{ marginTop: 12 }}><button className="btn btn-primary" type="button" onClick={load}>Try again</button></div></div> : "Loading the dashboard…"}</div>
        ) : <Dashboard D={D} at={at} />}
      </div>
    </>
  );
}

function Dashboard({ D, at }: { D: Dash; at: string | null }) {
  const { today, rules } = D;
  const G = rules.goal;
  const weekNo = (w: string) => Math.floor(diff(D.programmeStart, w) / 7) + 1;
  // The founder's plan, not a straight line: interpolate between its checkpoints from zero at the programme start.
  const planFor = (key: "creators" | "posting" | "impressions") => {
    const pts: [string, number][] = [[D.programmeStart, 0], ...rules.plan.map((p) => [p.by, p[key]] as [string, number])];
    if (today <= pts[0][0]) return 0;
    for (let i = 1; i < pts.length; i++) {
      const [a, va] = pts[i - 1], [b, vb] = pts[i];
      if (today <= b) return Math.round(va + ((vb - va) * diff(a, today)) / Math.max(1, diff(a, b)));
    }
    return pts[pts.length - 1][1];
  };
  const next = rules.plan.find((p) => p.by >= today) ?? rules.plan[rules.plan.length - 1];
  const tiles = [
    { key: "creators" as const, label: "Fellows", value: D.now.creators, note: "with a fellow page" },
    { key: "posting" as const, label: "Posting", value: D.now.posting, note: "posted in the last 7 days" },
    { key: "impressions" as const, label: "Impressions", value: D.now.impressions, note: D.now.avgPerPost ? `${num(D.now.avgPerPost)} a post on average` : "from posts with numbers" },
  ];
  const daysLeft = Math.max(0, diff(today, G.by));

  return (
    <main>
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Program dashboard</h1>
            <p>Growth Fellowship · Week {weekNo(D.thisWeek)} · {DOWL[day(today).getUTCDay()]} {fmt(today)} · {daysLeft} days to {fmt(G.by)}{at ? ` · Updated ${new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}` : ""}</p>
          </div>
          <div className="head-actions">
            <FellowshipProgramSwitch />
          </div>
        </div>

        <section className="card pd-plan" aria-labelledby="plan-title">
          <div className="pd-head">
            <div>
              <h2 className="card-title" id="plan-title">Against the plan</h2>
              <p className="card-sub">The plan's line between checkpoints, from zero at the start on {fmt(D.programmeStart)}. Next checkpoint: {fmt(next.by)}.</p>
            </div>
          </div>
          <div className="pd-tiles">
            {tiles.map((t) => {
              const plan = planFor(t.key), gap = t.value - plan, goal = t.key === "impressions" ? G.impressions : t.key === "creators" ? G.creators : rules.plan[rules.plan.length - 1].posting;
              const fmtV = t.key === "impressions" ? kfmt : num;
              return (
                <div className="pd-tile" key={t.key}>
                  <p className="eyebrow">{t.label}</p>
                  <div className="pd-big"><b className="tnum">{fmtV(t.value)}</b><span>{t.note}</span></div>
                  <div className="pd-meter" role="img" aria-label={`${num(t.value)} of ${num(goal)} by ${fmt(G.by)}. Plan for today: ${num(plan)}.`}>
                    <div className="pd-fill" style={{ width: `${Math.min(100, (t.value / Math.max(1, goal)) * 100).toFixed(2)}%` }} />
                    <div className="pd-pace" style={{ left: `${Math.min(100, (plan / Math.max(1, goal)) * 100).toFixed(2)}%` }} title={`Plan for today: ${num(plan)}`} />
                  </div>
                  <p className="pd-line">
                    <span className={`pill ${gap >= 0 ? "pill-active" : "pill-risk"}`}>{gap >= 0 ? "On plan" : `Behind by ${fmtV(-gap)}`}</span>
                    <span>Plan for today {fmtV(plan)} · {fmtV(next[t.key])} by {fmt(next.by)} · {fmtV(goal)} by {fmt(G.by)}</span>
                  </p>
                </div>
              );
            })}
            <PostsTile w={D.postsWeek} postsPerWeek={rules.postsPerWeek} />
          </div>
          <div className="pd-scroll" tabIndex={0} aria-label="Checkpoints, scrolls sideways">
            <table className="pd-table">
              <thead>
                <tr><th>Checkpoint</th><th className="num">Fellows</th><th className="num">Posting</th><th className="num">Impressions</th><th>Where we were</th></tr>
              </thead>
              <tbody>
                {D.checkpoints.map((c) => {
                  const a = c.actual;
                  const cell = (plan: number, actual: number | undefined, f: (n: number) => string = num) => (
                    <td className="num">{a ? <><b className={actual! >= plan ? "pd-ok" : "pd-short"}>{f(actual!)}</b> <small>of {f(plan)}</small></> : <small>plan {f(plan)}</small>}</td>
                  );
                  const short = a ? [a.creators < c.creators, a.posting < c.posting, a.impressions < c.impressions].filter(Boolean).length : 0;
                  return (
                    <tr key={c.by} className={c === next ? "pd-next" : undefined}>
                      <th scope="row">{fmt(c.by)}{c === next ? <span className="pd-tag">Next</span> : null}</th>
                      {cell(c.creators, a?.creators)}{cell(c.posting, a?.posting)}{cell(c.impressions, a?.impressions, kfmt)}
                      <td>{!a ? <span className="pd-muted">Ahead</span> : short ? <span className="pd-muted">Short on {short} of 3</span> : <span className="pd-muted">Met</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <div className="pd-two">
          <Funnel f={D.funnel} />
          <Pipeline p={D.pipeline} />
        </div>

        <Weekly D={D} weekNo={weekNo} />

        <Fellows D={D} />
      </div>
    </main>
  );
}

// Posts this week: what's posted, against what's scheduled and the target (every active fellow's weekly posts).
function PostsTile({ w, postsPerWeek }: { w: Dash["postsWeek"]; postsPerWeek: number }) {
  const goal = Math.max(1, w.target);
  const [label, cls] = w.missed ? [`${num(w.missed)} missed`, "pill-risk"] : w.scheduled < w.target ? [`${num(w.target - w.scheduled)} not scheduled yet`, "pill-risk"] : ["On track", "pill-active"];
  return (
    <div className="pd-tile">
      <p className="eyebrow">Posts this week</p>
      <div className="pd-big"><b className="tnum">{num(w.posted)}</b><span>posted · {num(w.postedToday)} today</span></div>
      <div className="pd-meter" role="img" aria-label={`${num(w.posted)} posted of a target of ${num(w.target)}. ${num(w.dueByToday)} were due by today.`}>
        <div className="pd-fill" style={{ width: `${Math.min(100, (w.posted / goal) * 100).toFixed(2)}%` }} />
        <div className="pd-pace" style={{ left: `${Math.min(100, (w.dueByToday / goal) * 100).toFixed(2)}%` }} title={`Due by today: ${num(w.dueByToday)}`} />
      </div>
      <p className="pd-line">
        <span className={`pill ${cls}`}>{label}</span>
        <span>{num(w.dueByToday)} due by today · {num(w.scheduled)} scheduled · target {num(w.target)} ({postsPerWeek} a fellow) · {num(w.total)} posted in all</span>
      </p>
    </div>
  );
}

function Funnel({ f }: { f: Dash["funnel"] }) {
  const steps = [
    ["Applied", f.applied, "Every application on the form"],
    ["Selected (fellows)", f.fellows, "Selected and given a fellow page"],
    ["Posted at least once", f.postedOnce, "Marked a post as posted"],
    ["Posted this week", f.postingThisWeek, "Since Monday, India time"],
  ] as const;
  const top = Math.max(1, f.applied);
  return (
    <section className="card pd-card" aria-labelledby="funnel-title">
      <h2 className="card-title" id="funnel-title">Applicant to posting fellow</h2>
      <p className="card-sub">Where people stop. Each step shows its share of the step before.</p>
      <ol className="pd-funnel">
        {steps.map(([label, n, hint], i) => {
          const prev = i ? steps[i - 1][1] : 0;
          return (
            <li key={label} title={`${label}: ${num(n)}. ${hint}.`}>
              <div className="pd-f-top"><span>{label}</span><b className="tnum">{num(n)}</b>{i ? <small>{prev ? `${Math.round((n / prev) * 100)}%` : "–"}</small> : <small />}</div>
              <div className="pd-f-bar"><i style={{ width: `${Math.max(n ? 1.5 : 0, (n / top) * 100).toFixed(2)}%` }} /></div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Pipeline({ p }: { p: Dash["pipeline"] }) {
  const stages: [string, number, string, boolean][] = [
    ["Claude's drafts to review", p.drafting, "Waiting on the calendar for someone to approve", false],
    ["Sent back to Claude", p.sentBack, "Claude rewrites these with /revise", false],
    ["Approved, coming up", p.scheduled, "On the fellow's page, due today or later", false],
    ["Approved, waiting for a photo", p.needPhoto, "Locked on the fellow's page until it has a photo", false],
    ["Fellow asked us for a photo", p.askedForPhoto, "They have none of their own: add one on the calendar", p.askedForPhoto > 0],
    ["Approved, past due", p.overdue, "Due before today and not marked posted", p.overdue > 0],
    ["Blocked", p.blocked, "Taken back by the team; the fellow sees a warning", p.blocked > 0],
    ["Posted", p.posted, "Marked posted by the fellow or the team", false],
    ["Posted, analytics in", p.withAnalytics, "The fellow uploaded the post's LinkedIn analytics export", false],
    ["Posted, numbers missing", p.awaitingNumbers, "No impressions yet", p.awaitingNumbers > 0],
    ["Posted with numbers", p.measured, "Counted in impressions and verdicts", false],
  ];
  return (
    <section className="card pd-card" aria-labelledby="pipe-title">
      <h2 className="card-title" id="pipe-title">Posts in the pipeline</h2>
      <p className="card-sub">From Claude's draft to a post with numbers. Nothing reaches a fellow before approval.</p>
      <dl className="pd-pipe">
        {stages.map(([label, n, hint, warn]) => (
          <div key={label} className={warn ? "warn" : undefined} title={hint}>
            <dt>{label}<small>{hint}</small></dt>
            <dd className="tnum">{num(n)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function Weekly({ D, weekNo }: { D: Dash; weekNo: (w: string) => number }) {
  const maxImp = Math.max(1, ...D.weekly.map((w) => w.impressions));
  const [personal, studojo] = D.kinds;
  return (
    <section className="card pd-card" aria-labelledby="weekly-title">
      <div className="pd-head">
        <div>
          <h2 className="card-title" id="weekly-title">Week by week</h2>
          <p className="card-sub">Posts count in the week they went up. "Posted of due" is that week's planned posts, blocked ones left out. Target: {plural(D.rules.postsPerWeek, "post")} a fellow a week{D.rules.studojoPerWeek != null ? `, ${D.rules.studojoPerWeek} about Studojo` : ""}.</p>
        </div>
        <dl className="pd-kinds">
          <div><dt>Personal posts</dt><dd className="tnum">{num(personal.posted)} <small>· {kfmt(personal.impressions)} impressions{personal.avg ? ` · ${num(personal.avg)} avg` : ""}</small></dd></div>
          <div><dt>Studojo posts</dt><dd className="tnum">{num(studojo.posted)} <small>· {kfmt(studojo.impressions)} impressions{studojo.avg ? ` · ${num(studojo.avg)} avg` : ""}</small></dd></div>
        </dl>
      </div>
      <div>
        <p className="eyebrow">This week, day by day</p>
        <ol className="pd-days">
          {D.daily.map((d) => (
            <li key={d.day} className={d.day === D.today ? "today" : d.day > D.today ? "ahead" : undefined} title={`${fmt(d.day)}: ${num(d.posted)} posted that day; ${num(d.postedOfDue)} of ${num(d.due)} posts due that day are posted`}>
              <span>{DOWS[day(d.day).getUTCDay()]} {day(d.day).getUTCDate()}{d.day === D.today ? " · today" : ""}</span>
              <b className="tnum">{num(d.posted)}</b>
              <small>posted{d.due ? ` · ${num(d.postedOfDue)} of ${num(d.due)} due` : " · none due"}</small>
            </li>
          ))}
        </ol>
      </div>
      <div className="pd-scroll" tabIndex={0} aria-label="Weeks, scrolls sideways">
        <table className="pd-table">
          <thead>
            <tr><th>Week</th><th className="num">Fellows joined</th><th className="num">Fellows posting</th><th className="pd-barcol">Posted of due</th><th className="num">Posts up</th><th className="num">Studojo posts</th><th className="pd-barcol">Impressions</th></tr>
          </thead>
          <tbody>
            {[...D.weekly].reverse().map((w) => (
              <tr key={w.week}>
                <th scope="row">Week {weekNo(w.week)} <small>{fmt(w.week)} to {fmt(addDays(w.week, 6))}{w.partial ? " · so far" : ""}</small></th>
                <td className="num">{num(w.joined)}</td>
                <td className="num">{num(w.posting)}</td>
                <td className="pd-barcol" title={`${num(w.postedOfDue)} of ${num(w.due)} posts due that week are posted`}>
                  <div className="pd-cellbar"><span className="tnum">{num(w.postedOfDue)} <small>of {num(w.due)}</small></span><div><i style={{ width: `${w.due ? (w.postedOfDue / w.due) * 100 : 0}%` }} /></div></div>
                </td>
                <td className="num">{num(w.posted)}</td>
                <td className="num">{num(w.studojo)}</td>
                <td className="pd-barcol" title={`${num(w.impressions)} impressions from posts that went up that week`}>
                  <div className="pd-cellbar"><span className="tnum">{kfmt(w.impressions)}</span><div><i style={{ width: `${(w.impressions / maxImp) * 100}%`, opacity: w.partial ? 0.5 : 1 }} /></div></div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const SORTS: [string, string, (a: Row, b: Row) => number][] = [
  ["impressions", "Impressions", (a, b) => b.standing.impressions - a.standing.impressions],
  ["week", "Posted this week", (a, b) => b.standing.thisWeek.posted - a.standing.thisWeek.posted],
  ["run", "Weekly run", (a, b) => b.standing.run - a.standing.run],
  ["avg", "Average a post", (a, b) => b.avg - a.avg],
  ["growth", "Connections gained", (a, b) => gained(b) - gained(a)],
  ["joined", "Newest first", (a, b) => b.joined.localeCompare(a.joined)],
  ["name", "Name", (a, b) => a.name.localeCompare(b.name)],
];
const gained = (f: Row) => (f.connections != null && f.connectionsAtJoin != null ? f.connections - f.connectionsAtJoin : -Infinity);

function Fellows({ D }: { D: Dash }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("impressions");
  const live = D.fellows.filter((f) => f.status !== "removed");
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cmp = SORTS.find((x) => x[0] === sort)?.[2] ?? SORTS[0][2];
    return live.filter((f) => !s || [f.name, f.college, f.field].some((v) => v?.toLowerCase().includes(s))).sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name));
  }, [live, q, sort]);
  return (
    <section className="card pd-card" aria-labelledby="fellows-title">
      <div className="pd-head">
        <div>
          <h2 className="card-title" id="fellows-title">Fellows</h2>
          <p className="card-sub">{plural(live.length, "fellow")}. Review their posts and drafts on the calendar.</p>
        </div>
        <div className="pd-filters" role="search">
          <label className="search"><span className="sr">Search fellows</span><svg className="i" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="M16 16l4.5 4.5" /></svg><input className="input" type="search" placeholder="Search name, college, field" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" /></label>
          <select className="select" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            {SORTS.map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
          </select>
        </div>
      </div>
      <div className="pd-scroll" tabIndex={0} aria-label="Fellows, scrolls sideways">
        <table className="pd-table pd-fellows">
          <thead>
            <tr>
              <th>Fellow</th><th>Status</th><th className="num">This week</th><th className="num">Run</th><th className="num">Weeks done</th>
              <th className="num">Posts up</th><th>Last posted</th><th className="num">Impressions</th><th className="num">Avg a post</th><th>Best post</th>
              <th className="num">Connections</th><th className="num">Coming up</th><th className="num">Drafts</th><th>Next milestone</th><th>Last active</th>
            </tr>
          </thead>
          <tbody>
            {list.length ? list.map((f) => {
              const [label, cls] = rowState(f), s = f.standing, g = gained(f);
              return (
                <tr key={f.id}>
                  <th scope="row">
                    <div className="pd-who"><span className={`avatar sm ${avClass(f.name)}`} aria-hidden="true">{initials(f.name)}</span>
                      <div><b>{f.name}</b><small>{[f.college, f.field].filter(Boolean).join(" · ") || "—"}{f.joined ? ` · joined ${fmt(f.joined)}` : ""}</small></div></div>
                  </th>
                  <td><span className={`pill ${cls}`}>{label}</span></td>
                  <td className="num">{s.thisWeek.due ? <>{s.thisWeek.posted} <small>of {s.thisWeek.due}</small>{s.thisWeek.missed ? <small className="pd-short"> · {s.thisWeek.missed} missed</small> : null}</> : <small>none due</small>}</td>
                  <td className="num">{s.run ? plural(s.run, "week") : <small>0</small>}</td>
                  <td className="num">{num(s.completedWeeks)}</td>
                  <td className="num">{num(f.posted)}</td>
                  <td>{f.lastPosted ? fmt(f.lastPosted) : <small>Not yet</small>}</td>
                  <td className="num"><b>{kfmt(s.impressions)}</b></td>
                  <td className="num">{f.avg ? num(f.avg) : <small>–</small>}</td>
                  <td className="pd-best">{f.best ? (f.best.url ? <a href={f.best.url} target="_blank" rel="noreferrer">{f.best.title}</a> : f.best.title) : <small>–</small>}{f.best ? <small> · {kfmt(f.best.impressions)}</small> : null}</td>
                  <td className="num">{f.connections ?? f.connectionsAtJoin ?? <small>–</small>}{Number.isFinite(g) && g ? <small className={g > 0 ? "pd-ok" : "pd-short"}> {g > 0 ? "+" : ""}{num(g)}</small> : null}</td>
                  <td className="num">{num(f.scheduled)}</td>
                  <td className="num">{num(f.drafts)}</td>
                  <td>{s.nextMilestone ? <>{s.nextMilestone.name} <small>in {plural(s.nextMilestone.weeksToGo, "week")}</small></> : <small>All reached</small>}</td>
                  <td><small>{ago(s.lastActivity)}</small></td>
                </tr>
              );
            }) : <tr><td colSpan={15}><div className="empty"><b>{live.length ? "No fellows match" : "No fellows yet"}</b>{live.length ? "Try a different search." : "Make someone a fellow from the Growth Fellowship page."}</div></td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}
