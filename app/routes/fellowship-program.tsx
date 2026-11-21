import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Link } from "react-router";
import { AdminHeader } from "~/components";
import { AdminTour, type TourStep } from "~/components/admin-tour";
import { FellowshipProgramSwitch } from "~/components/fellowship-program-switch";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/fellowship-program";
import "./fellowship-calendar.css";
import "./fellowship-program.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Program dashboard · Growth Fellowship · Studojo Admin" }];
}

// The Growth Fellowship programme dashboard: the few numbers that matter against the founder's plan, what needs
// the team today, and one row per fellow with this week's posts as they see them on their own page. Read only;
// the review work happens on the calendar (/fellowship-program/calendar). Same look as the fellows' page.

// ---------------------------------------------------------------- types (mirror programmeDashboard in app/lib/fellowship.server.ts)
interface Point { by: string; creators: number; posting: number; impressions: number }
interface Standing {
  thisWeek: { due: number; posted: number; missed: number }; lastWeek: { due: number; posted: number }; run: number; completedWeeks: number;
  impressions: number; atRisk: boolean; lastActivity: string | null; nextMilestone: { name: string; weeksToGo: number } | null;
}
interface LinkedInFile { at: string; periodStart: string | null; periodEnd: string | null; impressions: number | null; membersReached: number | null; newFollowers: number | null }
type DayState = "posted" | "missed" | "today" | "ahead" | "blocked";
interface Row {
  id: number; name: string; college: string | null; field: string | null; cohort: string | null; status: string; joined: string;
  connectionsAtJoin: number | null; connections: number | null; standing: Standing; posted: number; measured: number; avg: number;
  best: { title: string; impressions: number; url: string | null } | null; lastPosted: string | null; scheduled: number; drafts: number; stories: number; earlierPosts: number;
  written: number; studojoImpressions: number; noLink: number; linkedinFile: LinkedInFile | null; link: string | null;
  week: { id: number; due: string; kind: "personal" | "studojo"; title: string; state: DayState }[];
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
  pipeline: {
    drafting: number; sentBack: number; scheduled: number; overdue: number; overdueThisWeek: number; blocked: number; posted: number; awaitingNumbers: number; withAnalytics: number;
    measured: number; needPhoto: number; askedForPhoto: number; fellowVersions: number; noLink: number;
  };
  files: { fresh: number; active: number; impressions: number };
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
const istDay = (t: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const ago = (iso: string | null) => {
  if (!iso) return "Not yet";
  const m = Math.round((Date.now() - Date.parse(iso)) / 60000);
  return m < 60 ? `${Math.max(1, m)} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : m < 2880 ? "Yesterday" : `${Math.round(m / 1440)} days ago`;
};
const pct = (n: number, of: number) => Math.min(100, (n / Math.max(1, of)) * 100);

async function api<T>(path: string): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, { headers: { Authorization: `Bearer ${token}` } });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error((j && j.error) || `Something went wrong (${res.status}). Please try again.`);
  return j as T;
}

const Icon = ({ d }: { d: ReactNode }) => <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{d}</svg>;
const ICONS = {
  review: <><path d="M4 20h4L19 9l-4-4L4 16v4z" /><path d="M13.5 6.5l4 4" /></>,
  late: <><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2" /></>,
  link: <><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
  numbers: <path d="M5 20v-6M12 20V5M19 20v-10" />,
  file: <><path d="M7 3.5h7l4 4V20a.5.5 0 0 1-.5.5h-10.5A.5.5 0 0 1 6.5 20V4a.5.5 0 0 1 .5-.5z" /><path d="M14 3.5V8h4" /></>,
  person: <><circle cx="12" cy="8.5" r="3.5" /><path d="M5 20c1.2-3.6 3.8-5.5 7-5.5s5.8 1.9 7 5.5" /></>,
  write: <><path d="M5 5h14M5 10h14M5 15h8" /></>,
  open: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
};

// The dashboard's tour: what each part is for, for whoever on the team opens it first.
const TOUR: TourStep[] = [
  { title: "The Program dashboard", body: "How the fellowship is doing, what needs the team today, and every fellow's week. It's for reading: the work itself happens on the Editorial calendar." },
  { sel: '[data-tour="pd-plan"]', title: "The numbers that matter", body: "Studojo post impressions against the 1M goal (only Studojo posts count), this week's posts, fellows who posted in the last 7 days, and fellows who sent this week's LinkedIn file." },
  { sel: '[data-tour="pd-attention"]', title: "Needs the team", body: "Only what needs someone today: drafts to review, posts past due, posts with no link (so their numbers can't come in), missing LinkedIn files." },
  { sel: '[data-tour="pd-fellows"]', title: "Fellows", body: "One row per fellow. The dots are this week's posts, the same days the fellow sees on their page: green posted, red missed, blue today. Open page shows you exactly what they see." },
  { sel: '[data-tour="pd-weekly"]', title: "Week by week and the plan", body: "Each week, Wednesday to Tuesday, and the founder's checkpoints. Open them when you need them." },
  { sel: '[data-tour="program-switch"]', title: "Dashboard and calendar", body: "Go to the Editorial calendar to review drafts, nudge fellows and see each day's posts. Take this tour again any time from Take the tour." },
];
// "No posts yet" only when nothing was ever written for them; someone with posts who never marked one posted hasn't posted.
function rowState(f: Row): [string, string] {
  if (f.status === "paused") return ["Paused", "pill-paused"];
  if (f.standing.atRisk) return ["At risk", "pill-risk"];
  if (!f.written && !f.drafts) return ["No posts yet", "pill-new"];
  if (!f.posted) return ["Hasn't posted", "pill-risk"];
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
    return <div className="flex min-h-screen items-center justify-center bg-[#F5F5F7]"><div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-[#0A66C2] border-r-transparent" /></div>;
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
  const daysLeft = Math.max(0, diff(today, G.by));
  const live = D.fellows.filter((f) => f.status !== "removed");
  const active = live.filter((f) => f.status === "active");
  const impPlan = planFor("impressions"), impGap = D.now.impressions - impPlan;
  const w = D.postsWeek;
  const perDay = daysLeft ? Math.ceil(Math.max(0, G.impressions - D.now.impressions) / daysLeft) : 0;

  return (
    <main>
      <div className="wrap pd">
        <div className="pd-top">
          <div>
            <p className="pd-date">{DOWL[day(today).getUTCDay()]}, {fmt(today)} · Week {weekNo(D.thisWeek)} · {daysLeft ? `${plural(daysLeft, "day")} to ${fmt(G.by)}` : `Goal date ${fmt(G.by)}`}</p>
            <h1>Growth Fellowship</h1>
          </div>
          <div className="head-actions">
            {at ? <span className="pd-updated">Updated {new Date(at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}</span> : null}
            <FellowshipProgramSwitch />
            <AdminTour page="fellowship-program" steps={TOUR} />
          </div>
        </div>

        <section className="pd-stats" aria-label="The numbers that matter" data-tour="pd-plan">
          <Stat label="Studojo post impressions" value={kfmt(D.now.impressions)} of={`of ${kfmt(G.impressions)} by ${fmt(G.by)}`} fill={pct(D.now.impressions, G.impressions)} mark={pct(impPlan, G.impressions)} markLabel={`Plan for today: ${kfmt(impPlan)}`}
            foot={<><span className={`pill ${impGap >= 0 ? "pill-active" : "pill-risk"}`}>{impGap >= 0 ? "On plan" : `Behind plan by ${kfmt(-impGap)}`}</span>{perDay ? <span>Needs {kfmt(perDay)} a day from here</span> : null}</>} />
          <Stat label="Posted this week" value={num(w.posted)} of={`of ${num(w.scheduled)} due this week`} fill={pct(w.posted, w.scheduled)} mark={pct(w.dueByToday, w.scheduled)} markLabel={`Due by today: ${num(w.dueByToday)}`}
            foot={<>{w.missed ? <span className="pill pill-risk">{num(w.missed)} past due</span> : <span className="pill pill-active">Nothing past due</span>}<span>{num(w.postedToday)} today</span></>} />
          <Stat label="Fellows posting" value={num(D.now.posting)} of={`of ${num(active.length)} active fellows`} fill={pct(D.now.posting, active.length)}
            foot={<span>Posted at least once in the last 7 days</span>} />
          <Stat label="LinkedIn files this week" value={num(D.files.fresh)} of={`of ${num(D.files.active)} active fellows`} fill={pct(D.files.fresh, D.files.active)}
            foot={<span>{D.files.impressions ? `${kfmt(D.files.impressions)} impressions on their accounts` : "Fellows upload it every Sunday"}</span>} />
        </section>

        <div className="pd-cols">
          <Attention D={D} active={active} />
          <section className="card pd-card" aria-labelledby="days-title">
            <h2 className="card-title" id="days-title">This week</h2>
            <p className="card-sub">{fmt(D.thisWeek)} to {fmt(addDays(D.thisWeek, 6))}. Posts that went up each day, and that day's posts done.</p>
            <ol className="pd-days">
              {D.daily.map((d) => (
                <li key={d.day} className={d.day === today ? "today" : d.day > today ? "ahead" : undefined} title={`${fmt(d.day)}: ${num(d.posted)} posted that day; ${num(d.postedOfDue)} of ${num(d.due)} posts due that day are posted`}>
                  <span>{DOWS[day(d.day).getUTCDay()]} {day(d.day).getUTCDate()}</span>
                  <b className="tnum">{num(d.posted)}</b>
                  <small>{d.due ? `${num(d.postedOfDue)} of ${num(d.due)} done` : "none due"}</small>
                </li>
              ))}
            </ol>
          </section>
        </div>

        <Fellows D={D} />

        <More D={D} weekNo={weekNo} />
      </div>
    </main>
  );
}

function Stat({ label, value, of, fill, mark, markLabel, foot }: { label: string; value: string; of: string; fill: number; mark?: number; markLabel?: string; foot: ReactNode }) {
  return (
    <div className="card pd-stat">
      <p className="pd-label">{label}</p>
      <p className="pd-value"><b className="tnum">{value}</b><span>{of}</span></p>
      <div className="pd-meter" role="img" aria-label={`${value} ${of}${markLabel ? `. ${markLabel}` : ""}`}>
        <div className="pd-fill" style={{ width: `${fill.toFixed(2)}%` }} />
        {mark != null ? <div className="pd-pace" style={{ left: `${mark.toFixed(2)}%` }} title={markLabel} /> : null}
      </div>
      <p className="pd-foot">{foot}</p>
    </div>
  );
}

// Only what needs someone today. Each line says what it is and why it matters; nothing shows at zero.
function Attention({ D, active }: { D: Dash; active: Row[] }) {
  const p = D.pipeline, w = D.postsWeek;
  const noFile = D.files.active - D.files.fresh;
  const atRisk = active.filter((f) => f.standing.atRisk).length;
  const unwritten = Math.max(0, w.target - w.scheduled);
  const items: [keyof typeof ICONS, number, string, string, string, string][] = [
    ["review", p.drafting, "draft to review", "drafts to review", "Claude's drafts. A fellow sees a post only after someone approves it.", "warn"],
    ["write", unwritten, "post not written for this week", "posts not written for this week", `${num(w.scheduled)} approved of ${num(w.target)} (each active fellow's weekly posts).`, "warn"],
    ["review", p.fellowVersions, "fellow's own version to approve", "fellows' own versions to approve", "Their post stays locked until you approve it or keep the original.", "warn"],
    ["late", p.overdueThisWeek, "post past due this week", "posts past due this week", "Due before today and not marked posted on the fellow's page.", "bad"],
    ["late", p.overdue - p.overdueThisWeek, "post from earlier weeks never marked posted", "posts from earlier weeks never marked posted", "Fellows still see these under Numbers and can mark them posted.", "warn"],
    ["person", atRisk, "fellow at risk", "fellows at risk", "Posts due this week and none posted yet.", "bad"],
    ["link", p.noLink, "post with no link", "posts with no link", "Marked posted without the post's link, so their numbers can't come in from the LinkedIn file.", "warn"],
    ["numbers", p.awaitingNumbers, "post with no numbers", "posts with no numbers", "Posted, and no impressions yet. They don't count toward the goal until they have numbers.", "warn"],
    ["file", noFile, "fellow without this week's LinkedIn file", "fellows without this week's LinkedIn file", "Each Sunday's file fills in their posts' numbers.", "warn"],
  ];
  const shown = items.filter((x) => x[1] > 0);
  return (
    <section className="card pd-card" aria-labelledby="att-title" data-tour="pd-attention">
      <div className="pd-head">
        <h2 className="card-title" id="att-title">Needs the team</h2>
        <Link className="btn btn-primary btn-sm" to="/fellowship-program/calendar">Open the calendar</Link>
      </div>
      {shown.length ? (
        <ul className="pd-att">
          {shown.map(([ic, n, one, many, why, tone]) => (
            <li key={many} className={tone}>
              <span className="pd-att-ic"><Icon d={ICONS[ic]} /></span>
              <span className="pd-att-main"><b>{plural(n, one, many)}</b><small>{why}</small></span>
            </li>
          ))}
        </ul>
      ) : <p className="pd-calm"><Icon d={ICONS.check} />Nothing needs the team right now.</p>}
    </section>
  );
}

const SORTS: [string, string, (a: Row, b: Row) => number][] = [
  ["week", "This week", (a, b) => b.standing.thisWeek.posted - a.standing.thisWeek.posted || b.standing.thisWeek.due - a.standing.thisWeek.due],
  ["impressions", "Studojo impressions", (a, b) => b.studojoImpressions - a.studojoImpressions],
  ["all", "All impressions", (a, b) => b.standing.impressions - a.standing.impressions],
  ["active", "Last active", (a, b) => (b.standing.lastActivity ?? "").localeCompare(a.standing.lastActivity ?? "")],
  ["risk", "Needs attention first", (a, b) => Number(b.standing.atRisk) - Number(a.standing.atRisk) || b.standing.thisWeek.missed - a.standing.thisWeek.missed],
  ["joined", "Newest first", (a, b) => b.joined.localeCompare(a.joined)],
  ["name", "Name", (a, b) => a.name.localeCompare(b.name)],
];
const DOT_LABEL: Record<DayState, string> = { posted: "posted", missed: "past due, not posted", today: "due today", ahead: "coming up", blocked: "on hold" };

function Fellows({ D }: { D: Dash }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("week");
  const live = D.fellows.filter((f) => f.status !== "removed");
  const since = addDays(D.today, -7);
  const list = useMemo(() => {
    const s = q.trim().toLowerCase();
    const cmp = SORTS.find((x) => x[0] === sort)?.[2] ?? SORTS[0][2];
    return live.filter((f) => !s || [f.name, f.college, f.field].some((v) => v?.toLowerCase().includes(s))).sort((a, b) => cmp(a, b) || a.name.localeCompare(b.name));
  }, [live, q, sort]);
  return (
    <section className="card pd-card" aria-labelledby="fellows-title" data-tour="pd-fellows">
      <div className="pd-head">
        <div>
          <h2 className="card-title" id="fellows-title">Fellows</h2>
          <p className="card-sub">{plural(live.length, "fellow")}. The dots are this week's posts, as each fellow sees them on their page.</p>
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
              <th>Fellow</th><th>This week</th><th className="num">Posts up</th><th className="num">Studojo impressions</th><th className="num">All impressions</th>
              <th>Last posted</th><th>LinkedIn file</th><th>Last active</th><th><span className="sr">Their page</span></th>
            </tr>
          </thead>
          <tbody>
            {list.length ? list.map((f) => {
              const [label, cls] = rowState(f), s = f.standing, file = f.linkedinFile;
              const fresh = !!file && istDay(file.at) > since;
              return (
                <tr key={f.id}>
                  <th scope="row">
                    <div className="pd-who"><span className={`avatar sm ${avClass(f.name)}`} aria-hidden="true">{initials(f.name)}</span>
                      <div><b>{f.name}</b>{cls !== "pill-active" ? <span className={`pill pill-xs ${cls}`}>{label}</span> : null}<small>{[f.college, f.field].filter(Boolean).join(" · ") || "No college saved"}</small></div></div>
                  </th>
                  <td>
                    {f.week.length ? (
                      <div className="pd-week" aria-label={`${s.thisWeek.posted} of ${s.thisWeek.due} posted this week`}>
                        <span className="pd-dots">{f.week.map((p) => <i key={p.id} className={`d-${p.state}${p.kind === "studojo" ? " sj" : ""}`} title={`${DOWS[day(p.due).getUTCDay()]} ${fmt(p.due)}${p.kind === "studojo" ? " · Studojo" : ""}: ${p.title} (${DOT_LABEL[p.state]})`} />)}</span>
                        <small className="tnum">{s.thisWeek.posted}/{s.thisWeek.due}</small>
                      </div>
                    ) : <small>{f.status === "paused" ? "Paused" : f.written ? "Nothing written this week" : "Nothing written yet"}</small>}
                  </td>
                  <td className="num">{num(f.posted)}{f.noLink ? <small className="pd-short" title="Marked posted without a link: their numbers can't come in"> · {f.noLink} no link</small> : null}</td>
                  <td className="num"><b>{kfmt(f.studojoImpressions)}</b></td>
                  <td className="num">{kfmt(s.impressions)}{f.measured < f.posted ? <small title="Posts with numbers, of posts up"> · {f.measured}/{f.posted}</small> : null}</td>
                  <td>{f.lastPosted ? fmt(f.lastPosted) : <small>Not yet</small>}</td>
                  <td>{file ? <span className={fresh ? "" : "pd-muted"} title={file.periodStart && file.periodEnd ? `${fmt(file.periodStart)} to ${fmt(file.periodEnd)}` : undefined}>{fmt(istDay(file.at))}{file.impressions != null ? <small> · {kfmt(file.impressions)}</small> : null}</span> : <small>Never</small>}</td>
                  <td><small>{ago(s.lastActivity)}</small></td>
                  <td>{f.link ? <a className="pd-open" href={f.link} target="_blank" rel="noreferrer" title="Their page, as they see it" aria-label={`Open ${f.name}'s page`}><Icon d={ICONS.open} /><span>Page</span></a> : null}</td>
                </tr>
              );
            }) : <tr><td colSpan={9}><div className="empty"><b>{live.length ? "No fellows match" : "No fellows yet"}</b>{live.length ? "Try a different search." : "Make someone a fellow from the Growth Fellowship page."}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <p className="pd-key" aria-hidden="true"><span><i className="d-posted" />Posted</span><span><i className="d-missed" />Past due</span><span><i className="d-today" />Today</span><span><i className="d-ahead" />Coming up</span><span><i className="d-ahead sj" />Studojo post</span></p>
    </section>
  );
}

// The detail most days don't need: week by week, the plan's checkpoints, applicants, every post stage.
function More({ D, weekNo }: { D: Dash; weekNo: (w: string) => number }) {
  const maxImp = Math.max(1, ...D.weekly.map((w) => w.impressions));
  const [personal, studojo] = D.kinds;
  const f = D.funnel, p = D.pipeline;
  const funnel: [string, number][] = [["Applied", f.applied], ["Fellows", f.fellows], ["Posted once", f.postedOnce], ["Posted this week", f.postingThisWeek]];
  const stages: [string, number][] = [
    ["Drafts to review", p.drafting], ["Sent back to Claude", p.sentBack], ["Fellows' own versions", p.fellowVersions], ["Approved, coming up", p.scheduled],
    ["Waiting for a photo", p.needPhoto], ["Offered a stock image", p.askedForPhoto], ["Past due", p.overdue], ["On hold", p.blocked],
    ["Posted", p.posted], ["Posted with no link", p.noLink], ["Posted, numbers in", p.measured], ["Posted, no numbers yet", p.awaitingNumbers],
  ];
  return (
    <div className="pd-more" data-tour="pd-weekly">
      <details className="card">
        <summary><span><b>Week by week</b><small>Posts count in the week they went up. Studojo posts: {num(studojo.posted)} ({kfmt(studojo.impressions)} impressions). Personal: {num(personal.posted)} ({kfmt(personal.impressions)}).</small></span></summary>
        <div className="pd-scroll" tabIndex={0} aria-label="Weeks, scrolls sideways">
          <table className="pd-table">
            <thead>
              <tr><th>Week</th><th className="pd-barcol">Posted of due</th><th className="num">Fellows posting</th><th className="num">Posts up</th><th className="num">Studojo posts</th><th className="pd-barcol">Studojo impressions</th><th className="num">Joined</th></tr>
            </thead>
            <tbody>
              {[...D.weekly].reverse().map((w) => (
                <tr key={w.week}>
                  <th scope="row">Week {weekNo(w.week)} <small>{fmt(w.week)} to {fmt(addDays(w.week, 6))}{w.partial ? " · so far" : ""}</small></th>
                  <td className="pd-barcol"><div className="pd-cellbar"><span className="tnum">{num(w.postedOfDue)} <small>of {num(w.due)}</small></span><div><i style={{ width: `${pct(w.postedOfDue, w.due)}%` }} /></div></div></td>
                  <td className="num">{num(w.posting)}</td>
                  <td className="num">{num(w.posted)}</td>
                  <td className="num">{num(w.studojo)}</td>
                  <td className="pd-barcol"><div className="pd-cellbar"><span className="tnum">{kfmt(w.impressions)}</span><div><i style={{ width: `${pct(w.impressions, maxImp)}%`, opacity: w.partial ? 0.5 : 1 }} /></div></div></td>
                  <td className="num">{num(w.joined)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="card">
        <summary><span><b>The plan's checkpoints</b><small>Fellows, fellows posting and Studojo impressions against each date in the founder's plan.</small></span></summary>
        <div className="pd-scroll" tabIndex={0} aria-label="Checkpoints, scrolls sideways">
          <table className="pd-table">
            <thead><tr><th>Checkpoint</th><th className="num">Fellows</th><th className="num">Posting</th><th className="num">Studojo impressions</th></tr></thead>
            <tbody>
              {D.checkpoints.map((c) => {
                const a = c.actual;
                const cell = (plan: number, actual: number | undefined, fm: (n: number) => string = num) => (
                  <td className="num">{a ? <><b className={actual! >= plan ? "pd-ok" : "pd-short"}>{fm(actual!)}</b> <small>of {fm(plan)}</small></> : <small>plan {fm(plan)}</small>}</td>
                );
                return <tr key={c.by}><th scope="row">{fmt(c.by)}</th>{cell(c.creators, a?.creators)}{cell(c.posting, a?.posting)}{cell(c.impressions, a?.impressions, kfmt)}</tr>;
              })}
            </tbody>
          </table>
        </div>
      </details>
      <details className="card">
        <summary><span><b>Applicants and every post stage</b><small>From application to posting fellow, and where every post is.</small></span></summary>
        <div className="pd-two">
          <ol className="pd-funnel">{funnel.map(([l, n], i) => <li key={l}><b className="tnum">{num(n)}</b><span>{l}</span>{i ? <small>{funnel[i - 1][1] ? `${Math.round((n / funnel[i - 1][1]) * 100)}%` : "–"}</small> : null}</li>)}</ol>
          <dl className="pd-pipe">{stages.map(([l, n]) => <div key={l}><dt>{l}</dt><dd className="tnum">{num(n)}</dd></div>)}</dl>
        </div>
      </details>
    </div>
  );
}
