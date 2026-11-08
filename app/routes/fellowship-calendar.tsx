import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AdminHeader } from "~/components";
import { FellowshipProgramSwitch } from "~/components/fellowship-program-switch";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { welcomeWhatsapp } from "~/lib/ugc-creators";
import type { Route } from "./+types/fellowship-calendar";
import "./fellowship-calendar.css";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Editorial calendar · Growth Fellowship · Studojo Admin" }];
}

// The Growth Fellowship's editorial calendar: every fellow by day, with each
// post's status, and the review flow for the posts Vanshika's Claude Code
// writes. Claude's drafts wait here ("To review"); a fellow sees a post only
// after someone approves it. Listed under Live tools in Navigate
// (/fellowship-program/calendar), next to the dashboard; applicants stay on /fellowship.

// ---------------------------------------------------------------- types (mirror app/lib/fellowship.server.ts)
type Kind = "personal" | "studojo";
interface Feedback { id: string; t: string; text: string; by?: string; resolvedAt?: string; reply?: string }
interface Version { t: string; by: "claude" | "team"; title: string; body: string; note?: string }
interface Verdict { level: "good" | "okay" | "bad" | "ugly" | null; ratio: number | null; base: number | null; basis: string | null }
interface Review { approvedAt: string; approvedBy: string | null; angle: string; claudeTitle: string; claudeBody: string; editedByTeam: boolean; feedback: Feedback[]; blocked?: { at: string; by: string; reason: string } | null; teamPhotos?: string[] }
interface Post {
  id: number; creatorId: number; title: string; body: string; kind: Kind; due: string; status: string; copiedAt: string | null; ownLine: string | null;
  postedAt: string | null; url: string | null; impressions: number | null; reactions: number | null; comments: number | null; screenshot: string | null;
  metricsAt: string | null; review: Review | null; insight: string | null; createdBy: string | null; verdict: Verdict | null;
  photoIdea: string | null; photos: string[]; photoHelpAt: string | null;
  analytics: PostAnalytics | null; analyticsFiles: string[];
  fellowVersion: { text: string; at: string } | null; versionReply: string | null;
}
interface AnalyticsWeek {
  id: number; file: string; uploadedAt: string; periodStart: string | null; periodEnd: string | null; totals: Record<string, number>;
  daily: Record<string, string | number>[];
  posts: { url: string | null; publishedOn: string | null; impressions: number | null; engagements: number | null; postId: number | null }[];
  demographics: Record<string, { value: string; pct: number }[]>;
}
interface PostAnalytics { uploadedAt: string; file: string; postedOn: string | null; postUrl: string | null; metrics: Record<string, number>; demographics: Record<string, { value: string; pct: number }[]> }
interface Draft { id: number; creatorId: number; title: string; body: string; kind: Kind; due: string; angle: string; photoIdea: string; status: "review" | "changes"; batch: string | null; feedback: Feedback[]; versions: Version[]; updatedAt: string }
interface Standing {
  thisWeek: { due: number; posted: number; missed: number }; lastWeek: { due: number; posted: number }; run: number; completedWeeks: number;
  impressions: number; awaitingNumbers: number; atRisk: boolean; lastActivity: string | null; nextMilestone: { name: string; weeksToGo: number } | null; milestonesReached: string[];
}
interface Fellow {
  id: number; name: string; first: string; slug: string | null; link: string | null; college: string | null; field: string | null; cohort: string | null;
  status: string; email: string | null; whatsapp: string | null; linkedin: string | null; joined: string; connectionsAtJoin: number | null; connections: number | null;
  learnings: string; teamNotes: string; nudgedAt: string | null; internAt: string | null; referredAt: string | null; stories: number; earlierPosts: number; standing: Standing; posts: Post[]; drafts: Draft[];
}
interface Rules {
  goal: { impressions: number; creators: number; by: string }; plan: { by: string; creators: number; impressions: number }[];
  postingDays: string[]; postsPerWeek: number; partnershipLabel: string; milestones: { id: string; weeks: number; name: string }[];
}
interface Story { id: number; creatorId: number; prompt: string | null; text: string; spoken: boolean; createdAt: string }
interface Desk {
  today: string; thisWeek: string; rules: Rules; playbook: { text: string; updatedAt: string | null; by: string | null }; programmeStart: string;
  totals: { impressions: number; studojoImpressions: number; measuredPosts: number; avgPerPost: number; storiesCollected: number; draftsWaiting: number; draftsSentBack: number; versionsWaiting: number };
  weekly: { week: string; impressions: number; partial: boolean }[]; stories: Story[]; fellows: Fellow[];
}

// ---------------------------------------------------------------- helpers
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const DOWL = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
// Weeks run Wednesday to Tuesday (the founder, 5 Nov 2026), so the calendar's columns start on Wednesday.
const DSHORT = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"];
const day = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(y, m - 1, d)); };
const fmt = (s: string) => { const x = day(s); return `${x.getUTCDate()} ${MON[x.getUTCMonth()]}`; };
const dow = (s: string) => DOW[day(s).getUTCDay()];
const addDays = (s: string, n: number) => { const x = day(s); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const diff = (a: string, b: string) => Math.round((day(b).getTime() - day(a).getTime()) / 86400000);
const weekOf = (s: string) => addDays(s, -((day(s).getUTCDay() + 4) % 7));
const istDay = (t: string | number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(t));
const num = (n: number) => Number(n || 0).toLocaleString("en-US");
const kfmt = (n: number) => (n >= 1e6 ? (n / 1e6).toFixed(n % 1e6 ? 1 : 0) + "M" : n >= 1000 ? String(Math.round(n / 100) / 10).replace(/\.0$/, "") + "K" : String(n));
const plural = (n: number, one: string, many = one + "s") => `${num(n)} ${n === 1 ? one : many}`;
const initials = (name: string) => name.split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
const avClass = (name: string) => "av-" + ((name.split("").reduce((a, c) => a + c.charCodeAt(0), 0) % 5) + 1);
const POST_MAX = 3000;
const ago = (iso: string | null) => {
  if (!iso) return "No activity yet";
  const mins = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? "Yesterday" : `${days} days ago`;
};
const safeUrl = (u: string | null) => (u && /^https?:\/\//i.test(u) ? u : null);
// Analytics screenshots the fellow uploaded: a JSON array of "fellow-proof/…" refs (an old plain link may come first).
const proofRefs = (v: string | null): string[] => {
  if (!v) return [];
  if (/^https?:\/\//i.test(v)) return [v];
  try { const a = JSON.parse(v); return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : []; } catch { return []; }
};
const waDigits = (w: string | null) => { const d = (w || "").replace(/\D/g, ""); return d.length >= 10 ? d : null; };
// The team sends from WhatsApp Web, not the app. One named tab, reused: WhatsApp Web only works in one tab at a time.
const WA_TAB = "studojo_whatsapp_web";
const waWeb = (digits: string, text: string) => `https://web.whatsapp.com/send?phone=${digits}&text=${encodeURIComponent(text)}`;
/** A wa.me link (from the shared helpers) as the same chat in WhatsApp Web. */
const toWaWeb = (wa: string | null) => { if (!wa) return null; try { const u = new URL(wa); return waWeb(u.pathname.replace(/\D/g, ""), u.searchParams.get("text") ?? ""); } catch { return null; } };

async function api<T = Desk>(path: string, body?: unknown): Promise<T> {
  const token = await getToken();
  const res = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok) throw new Error((j && j.error) || `Something went wrong (${res.status}). Please try again.`);
  return j as T;
}
async function copyText(text: string) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    const ta = document.createElement("textarea"); ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand("copy"); } catch { ok = false; } ta.remove(); return ok;
  }
}

// ---------------------------------------------------------------- icons (the design's sprite)
const ICONS: Record<string, ReactNode> = {
  cal: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  people: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.2a6.5 6.5 0 0 1 3.5 5.8" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2.2" /><path d="M15 5.6V5a1.2 1.2 0 0 0-1.2-1.2H5A1.2 1.2 0 0 0 3.8 5v8.8A1.2 1.2 0 0 0 5 15h.6" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3.2 2" /></>,
  chart: <path d="M5 20v-6M12 20V5M19 20v-10" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5.5M12 16.6v.01" /></>,
  pen: <><path d="M12.5 20h8" /><path d="M16.6 3.6a2.1 2.1 0 0 1 3 3L7.3 18.9l-4 1 1-4z" /></>,
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5.5l11 6.5-11 6.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  x: <path d="M6 6l12 12M18 6L6 18" />,
  left: <path d="M15 6l-6 6 6 6" />,
  right: <path d="M9 6l6 6-6 6" />,
  down: <path d="M6 9l6 6 6-6" />,
  up: <path d="M6 15l6-6 6 6" />,
  search: <><circle cx="11" cy="11" r="6.5" /><path d="M20 20l-4.2-4.2" /></>,
  chat: <><path d="M20.5 11.5a8.5 8.5 0 0 1-12.4 7.6L3.5 20.5l1.4-4.4A8.5 8.5 0 1 1 20.5 11.5z" /><path d="M9 10.5h6M9 13.5h4" /></>,
  wand: <path d="M4 20l11-11M14 4v3M12.5 5.5h3M19 9v3M17.5 10.5h3" />,
  link: <><path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1" /><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" /></>,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />,
  back: <path d="M9 14L4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" /></>,
};
const Icon = ({ id, sm }: { id: string; sm?: boolean }) => (
  <svg className={`i${sm ? " i-sm" : ""}`} viewBox="0 0 24 24" aria-hidden="true">{ICONS[id]}</svg>
);

// ---------------------------------------------------------------- statuses
type Slot = { key: string; label: string; icon: string };
const SLOT: Record<string, Slot> = {
  review: { key: "review", label: "To review", icon: "pen" },
  back: { key: "back", label: "Sent back", icon: "chat" },
  ready: { key: "ready", label: "Ready", icon: "clock" },
  copied: { key: "copied", label: "Copied", icon: "copy" },
  posted: { key: "posted", label: "Posted", icon: "check" },
  numbers: { key: "numbers", label: "Numbers in", icon: "chart" },
  missed: { key: "missed", label: "Missed", icon: "alert" },
  paused: { key: "paused", label: "Paused", icon: "pause" },
  blocked: { key: "blocked", label: "Blocked", icon: "alert" },
  photo: { key: "photo", label: "Needs photo", icon: "alert" },
  askedPhoto: { key: "photo", label: "No photo: offered a stock image", icon: "alert" },
  version: { key: "review", label: "Their version to approve", icon: "pen" },
};
const LEGEND = ["review", "back", "photo", "ready", "copied", "posted", "numbers", "missed", "blocked", "paused"];
function postSlot(p: Post, today: string, paused: boolean): Slot {
  if (p.status === "blocked") return SLOT.blocked;
  if (p.status === "posted") return p.impressions != null ? SLOT.numbers : SLOT.posted;
  if (p.due < today) return SLOT.missed;
  if (paused) return SLOT.paused;
  // The fellow rewrote it: locked on their page until the team decides.
  if (p.fellowVersion) return SLOT.version;
  // No post goes up without a photo: the fellow's page keeps it locked until one is added.
  if (!p.photos.length) return p.photoHelpAt ? SLOT.askedPhoto : SLOT.photo;
  return p.copiedAt ? SLOT.copied : SLOT.ready;
}
const draftSlot = (d: Draft) => (d.status === "changes" ? SLOT.back : SLOT.review);
function fellowState(f: Fellow): [string, string, string] {
  if (f.status === "paused") return ["paused", "Paused", "pill-paused"];
  if (f.standing.atRisk) return ["at risk", "At risk", "pill-risk"];
  if (!f.posts.length && !f.drafts.length) return ["new", "New", "pill-new"];
  return ["active", "Active", "pill-active"];
}
const StatePill = ({ f }: { f: Fellow }) => {
  const [k, label, cls] = fellowState(f);
  return <span className={`pill ${cls}`}>{k === "at risk" ? <Icon id="alert" /> : k === "paused" ? <Icon id="pause" /> : <span className="dotc" />}{label}</span>;
};
const VERDICT: Record<string, [string, string]> = { good: ["Good", "v-good"], okay: ["Okay", "v-okay"], bad: ["Bad", "v-bad"], ugly: ["Ugly", "v-ugly"] };
const VerdictPill = ({ v }: { v: Verdict | null }) => {
  if (!v) return null;
  if (!v.level) return <span className="vpill v-okay">Too early to compare</span>;
  const [label, cls] = VERDICT[v.level];
  return <span className={`vpill ${cls}`}>{label} · {v.ratio}× {v.basis}</span>;
};

type DrawerState =
  | { mode: "fellow"; id: number }
  | { mode: "review"; id: number; draftId?: number }
  | { mode: "post"; id: number | null; postId?: number; date?: string; from?: "fellow"; text?: string }
  | { mode: "add-fellow" }
  | { mode: "queue" };
type AttKind = "review" | "blocked" | "nudge" | "numbers" | "stories" | "ask";
type NudgeState = { id: number; post?: Post; ask?: boolean } | null;

export default function FellowshipCalendar() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [D, setD] = useState<Desk | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [week, setWeek] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [fStatus, setFStatus] = useState("all");
  const [fField, setFField] = useState("all");
  const [fCohort, setFCohort] = useState("all");
  const [sort, setSort] = useState("attention");
  const [dir, setDir] = useState(1);
  const [att, setAtt] = useState<AttKind>("review");
  const [attAll, setAttAll] = useState(false);
  const [drawer, setDrawer] = useState<DrawerState | null>(null);
  const [nudge, setNudge] = useState<NudgeState>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(null), 3200);
  }, []);

  const load = useCallback(async () => {
    try { const d = await api("/api/fellowship-calendar"); setD(d); setLoadError(null); }
    catch (e) { setLoadError((e as Error).message); }
  }, []);
  useEffect(() => { if (isAuthorized) load(); }, [isAuthorized, load]);
  // Fresh numbers when coming back to the tab, and every two minutes while nothing is open.
  useEffect(() => {
    if (!isAuthorized) return;
    const onVis = () => { if (document.visibilityState === "visible" && !drawer && !nudge) load(); };
    document.addEventListener("visibilitychange", onVis);
    const t = setInterval(() => { if (document.visibilityState === "visible" && !drawer && !nudge) load(); }, 120000);
    return () => { document.removeEventListener("visibilitychange", onVis); clearInterval(t); };
  }, [isAuthorized, drawer, nudge, load]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { if (nudge) setNudge(null); else if (drawer) setDrawer(null); } };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [drawer, nudge]);
  useEffect(() => { document.documentElement.style.overflow = drawer || nudge ? "hidden" : ""; return () => { document.documentElement.style.overflow = ""; }; }, [drawer, nudge]);

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
          <div className="loading">{loadError ? <div className="empty"><b>The calendar didn't load</b>{loadError}<div style={{ marginTop: 12 }}><button className="btn btn-primary" type="button" onClick={load}>Try again</button></div></div> : "Loading the calendar…"}</div>
        ) : (
          <Desk
            D={D} setD={setD} reload={load} toast={toast}
            week={week ?? D.thisWeek} setWeek={setWeek}
            filters={{ q, setQ, fStatus, setFStatus, fField, setFField, fCohort, setFCohort, sort, setSort, dir, setDir }}
            att={att} setAtt={setAtt} attAll={attAll} setAttAll={setAttAll}
            drawer={drawer} setDrawer={setDrawer} nudge={nudge} setNudge={setNudge}
          />
        )}
        <div className={`toast${toastMsg ? " on" : ""}`} role="status" aria-live="polite">{toastMsg ? <><Icon id="check" /><span>{toastMsg}</span></> : null}</div>
      </div>
    </>
  );
}

interface Filters {
  q: string; setQ: (v: string) => void; fStatus: string; setFStatus: (v: string) => void; fField: string; setFField: (v: string) => void;
  fCohort: string; setFCohort: (v: string) => void; sort: string; setSort: (v: string) => void; dir: number; setDir: (v: number) => void;
}
interface DeskProps {
  D: Desk; setD: (d: Desk) => void; reload: () => Promise<void>; toast: (m: string) => void; week: string; setWeek: (w: string) => void; filters: Filters;
  att: AttKind; setAtt: (a: AttKind) => void; attAll: boolean; setAttAll: (v: boolean) => void;
  drawer: DrawerState | null; setDrawer: (d: DrawerState | null) => void; nudge: NudgeState; setNudge: (n: NudgeState) => void;
}

function Desk(P: DeskProps) {
  const { D, toast, week, setWeek, filters: F, drawer, setDrawer } = P;
  const today = D.today, THIS = D.thisWeek;
  const POST_DAYS = D.rules.postingDays.map((d) => DSHORT.indexOf(d)).filter((i) => i >= 0);
  const PPW = D.rules.postsPerWeek;
  const weekNo = (w: string) => Math.floor(diff(D.programmeStart, w) / 7) + 1;
  const LAST_WEEK = weekOf(D.rules.goal.by);
  const range = (w: string) => `${fmt(w)} to ${fmt(addDays(w, 6))}`;
  const byId = (id: number) => D.fellows.find((f) => f.id === id) ?? null;
  const live = D.fellows.filter((f) => f.status !== "removed");

  // Act on the desk and take the fresh copy the server sends back.
  const act = useCallback(async (body: Record<string, unknown>, done?: string) => {
    try { const d = await api("/api/fellowship-calendar", body); P.setD(d); if (done) toast(done); return d; }
    catch (e) { toast((e as Error).message); return null; }
  }, [P, toast]);
  // A photo the team adds to a post, for a fellow who has none: the server answers with the fresh desk.
  const uploadPhoto = useCallback(async (postId: number, file: File) => {
    try {
      const jpeg = await toJpeg(file);
      const token = await getToken();
      const res = await fetch(`/api/fellowship-proof?post=${postId}`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "image/jpeg" }, body: jpeg });
      const j = await res.json().catch(() => null);
      if (!res.ok) throw new Error((j && j.error) || `Something went wrong (${res.status}). Please try again.`);
      P.setD(j as Desk); toast("Photo added. The post is unlocked on their page."); return true;
    } catch (e) { toast((e as Error).message); return false; }
  }, [P, toast]);
  // f7's creator APIs answer with one creator, so reload the desk after them.
  const creatorApi = useCallback(async (path: string, body: Record<string, unknown>, done?: string) => {
    try { const r = await api<Record<string, unknown>>(path, body); await P.reload(); if (done) toast(done); return r; }
    catch (e) { toast((e as Error).message); return null; }
  }, [P, toast]);

  // ------------------------------------------------ overview
  const T = D.totals, G = D.rules.goal;
  const pct = G.impressions ? (T.impressions / G.impressions) * 100 : 0;
  // The founder's plan, not a straight line: interpolate between its checkpoints from zero at the programme start.
  const planPts: [string, number][] = [[D.programmeStart, 0], ...D.rules.plan.map((p) => [p.by, p.impressions] as [string, number])];
  const planToday = (() => {
    if (today <= planPts[0][0]) return 0;
    for (let i = 1; i < planPts.length; i++) {
      const [a, va] = planPts[i - 1], [b, vb] = planPts[i];
      if (today <= b) return Math.round(va + ((vb - va) * diff(a, today)) / Math.max(1, diff(a, b)));
    }
    return planPts[planPts.length - 1][1];
  })();
  const nextCheckpoint = D.rules.plan.find((p) => p.by >= today) ?? D.rules.plan[D.rules.plan.length - 1];
  const daysLeft = Math.max(0, diff(today, G.by));
  const weeksLeft = Math.max(1, Math.round(daysLeft / 7));
  const perWeek = Math.round(Math.max(0, G.impressions - T.impressions) / weeksLeft / 1000) * 1000;
  const fullWeeks = D.weekly.filter((w) => !w.partial);
  const lastFull = fullWeeks[fullWeeks.length - 1];
  const dueThisWeek = live.reduce((s, f) => s + f.standing.thisWeek.due, 0);
  const postedThisWeek = live.reduce((s, f) => s + f.standing.thisWeek.posted, 0);
  const activeThisWeek = live.filter((f) => f.standing.thisWeek.posted > 0).length;
  const atRisk = live.filter((f) => f.status !== "paused" && f.standing.atRisk).length;
  const numbersAwaiting = live.reduce((s, f) => s + f.standing.awaitingNumbers, 0);

  // ------------------------------------------------ needs attention
  const reviewList = live.filter((f) => f.drafts.some((d) => d.status === "review")).sort((a, b) => a.drafts[0].due.localeCompare(b.drafts[0].due));
  const nudgeReason = (f: Fellow) => {
    const s = f.standing, r: string[] = [];
    if (s.atRisk) r.push(`0 of ${s.thisWeek.due} posted this week`);
    if (s.lastWeek.due && s.lastWeek.posted === 0) r.push("posted nothing last week");
    else if (s.lastWeek.due - s.lastWeek.posted >= 2) r.push(`missed ${s.lastWeek.due - s.lastWeek.posted} of ${s.lastWeek.due} last week`);
    return r;
  };
  const nudgeList = live.filter((f) => f.status !== "paused" && nudgeReason(f).length)
    .sort((a, b) => nudgeReason(b).length - nudgeReason(a).length || a.name.localeCompare(b.name));
  const numbersList = live.flatMap((f) => f.posts.filter((p) => p.status === "posted" && p.impressions == null && p.postedAt && Date.parse(p.postedAt) < Date.now() - 7 * 86400000).map((p) => ({ f, p })))
    .sort((a, b) => String(a.p.postedAt).localeCompare(String(b.p.postedAt)));
  const storyList = D.stories.filter((s) => byId(s.creatorId));
  // Approved posts the team took back: the fellow sees a warning until someone fixes and releases them.
  const blockedList = live.flatMap((f) => f.posts.filter((p) => p.status === "blocked").map((p) => ({ f, p }))).sort((a, b) => a.p.due.localeCompare(b.p.due));
  // Posts are written from what fellows tell us: ask anyone with little shared so far.
  const askList = live.filter((f) => f.status === "active" && f.stories < 3).sort((a, b) => a.stories - b.stories || a.name.localeCompare(b.name));
  const nudgedToday = (f: Fellow) => !!f.nudgedAt && istDay(f.nudgedAt) === today;

  // ------------------------------------------------ calendar rows
  const fields = [...new Set(live.map((f) => f.field || "Other"))].sort();
  const cohorts = [...new Set(live.map((f) => f.cohort).filter(Boolean) as string[])].sort();
  const postedIn = (f: Fellow, w: string) => f.posts.filter((p) => p.status === "posted" && weekOf(p.due) === w).length;
  const itemsOn = (f: Fellow, date: string) => [...f.drafts.filter((d) => d.due === date).map((d) => ({ d })), ...f.posts.filter((p) => p.due === date).map((p) => ({ p }))];
  const weekEmpty = (f: Fellow, w: string) => ![...f.drafts, ...f.posts].some((x) => weekOf(x.due) === w);
  // Days drawn full width: the posting days, plus any other day with a post this week (launch week's Sunday),
  // so no post shrinks to a dot.
  const WIDE = [0, 1, 2, 3, 4, 5, 6].filter((d) => POST_DAYS.includes(d) || live.some((f) => itemsOn(f, addDays(week, d)).length > 0));
  const RISK: Record<string, number> = { "at risk": 0, new: 1, active: 2, paused: 3 };
  const list = useMemo(() => {
    const qq = F.q.trim().toLowerCase();
    const out = live.filter((f) =>
      (F.fStatus === "all" || fellowState(f)[0] === F.fStatus) && (F.fField === "all" || (f.field || "Other") === F.fField) &&
      (F.fCohort === "all" || f.cohort === F.fCohort) && (!qq || `${f.name} ${f.college ?? ""} ${f.field ?? ""}`.toLowerCase().includes(qq)));
    const act = (f: Fellow) => (f.standing.lastActivity ? -Date.parse(f.standing.lastActivity) : Infinity);
    const cmp: Record<string, (a: Fellow, b: Fellow) => number> = {
      attention: (a, b) => RISK[fellowState(a)[0]] - RISK[fellowState(b)[0]] || b.drafts.length - a.drafts.length || postedIn(a, week) - postedIn(b, week) || a.name.localeCompare(b.name),
      name: (a, b) => a.name.localeCompare(b.name),
      posted: (a, b) => postedIn(b, week) - postedIn(a, week) || a.name.localeCompare(b.name),
      run: (a, b) => b.standing.run - a.standing.run || a.name.localeCompare(b.name),
      completed: (a, b) => b.standing.completedWeeks - a.standing.completedWeeks || a.name.localeCompare(b.name),
      impressions: (a, b) => b.standing.impressions - a.standing.impressions,
      active: (a, b) => act(a) - act(b) || a.name.localeCompare(b.name),
      status: (a, b) => RISK[fellowState(a)[0]] - RISK[fellowState(b)[0]] || a.name.localeCompare(b.name),
    };
    return out.sort((a, b) => (cmp[F.sort] ?? cmp.attention)(a, b) * F.dir);
  }, [live, F.q, F.fStatus, F.fField, F.fCohort, F.sort, F.dir, week]); // eslint-disable-line react-hooks/exhaustive-deps

  const writeWeekCmd = (names: string[], w: string) =>
    `/write-week ${names.join(", ")}: ${PPW} posts ${names.length > 1 ? "each " : ""}for the week of ${fmt(w)} ${day(w).getUTCFullYear()}`;
  const plannable = week > THIS ? live.filter((f) => f.status === "active" && weekEmpty(f, week)) : [];
  const copyPlan = async (names: string[], w: string) => {
    const ok = await copyText(writeWeekCmd(names, w));
    toast(ok ? `Copied. Paste it into Claude Code: it writes the drafts and they land here for review.` : "Couldn't copy. Try again.");
  };

  const sortTh = (key: string, label: string, cls = "") => {
    const on = F.sort === key;
    return (
      <th className={cls} scope="col" aria-sort={on ? (F.dir === 1 ? "ascending" : "descending") : undefined}>
        <button className="sorter" type="button" onClick={() => { if (F.sort === key) F.setDir(-F.dir); else { F.setSort(key); F.setDir(1); } }}>
          {label}<Icon id={on && F.dir === -1 ? "up" : "down"} />
        </button>
      </th>
    );
  };
  const tag = week === THIS ? "This week" : week === addDays(THIS, 7) ? "Next week" : week === addDays(THIS, -7) ? "Last week" : week < THIS ? "Past week" : "Ahead";

  return (
    <main>
      <div className="wrap">
        <div className="page-head">
          <div>
            <h1>Editorial calendar</h1>
            <p>{cohorts.length ? `${cohorts.length === 1 ? `Cohort ${cohorts[0]}` : `${cohorts.length} cohorts`} · ` : ""}{plural(live.length, "fellow")} · Week {weekNo(THIS)} of the fellowship · {DOWL[day(today).getUTCDay()]} {fmt(today)}</p>
          </div>
          <div className="head-actions">
            <FellowshipProgramSwitch />
            <button className="btn btn-line" type="button" onClick={() => setDrawer({ mode: "add-fellow" })}><Icon id="plus" />Add a fellow</button>
            <button className="btn btn-primary" type="button" onClick={() => setDrawer({ mode: "queue" })}><Icon id="pen" />Review posts{T.draftsWaiting + T.versionsWaiting ? ` (${T.draftsWaiting + T.versionsWaiting})` : ""}</button>
          </div>
        </div>

        <div className="band">
          <section className="card overview" aria-labelledby="ov-title">
            <div className="goal">
              <div>
                <p className="eyebrow" id="ov-title">Programme goal</p>
                <div className="hero"><b>{num(T.impressions)}</b><span>impressions of {num(G.impressions)} by {fmt(G.by)}</span><span className="pct">{pct.toFixed(0)}% there</span></div>
                <div className="gm" role="img" aria-label={`${num(T.impressions)} of ${num(G.impressions)} impressions. The plan for today is ${num(planToday)}.`}>
                  <div className="gm-track">
                    <div className="gm-fill" style={{ width: `${Math.min(100, pct).toFixed(2)}%` }} />
                    <div className="gm-pace" style={{ left: `${Math.min(100, (planToday / G.impressions) * 100).toFixed(2)}%` }}><span style={planToday / G.impressions < 0.15 ? { left: 0, transform: "none" } : planToday / G.impressions > 0.85 ? { left: "auto", right: 0, transform: "none" } : undefined}>Plan for today: {kfmt(planToday)}</span></div>
                  </div>
                  <div className="gm-scale"><span>0</span><span>250K</span><span>500K</span><span>750K</span><span>1M</span></div>
                </div>
                <p className="gm-note">
                  {daysLeft} days to go. Reaching {kfmt(G.impressions)} needs <b>about {num(perWeek)} impressions a week</b> from here.
                  {lastFull ? ` The last full week brought ${num(lastFull.impressions)}.` : ""}
                  {T.avgPerPost ? ` At ${num(T.avgPerPost)} impressions a post, that is about ${num(Math.round(perWeek / T.avgPerPost))} posts a week, and ${num(dueThisWeek)} are due this week.` : ` ${num(dueThisWeek)} posts are due this week.`}
                  {nextCheckpoint ? ` The plan says ${num(nextCheckpoint.impressions)} impressions and ${nextCheckpoint.creators} fellows by ${fmt(nextCheckpoint.by)}.` : ""}
                </p>
              </div>
              <WeekChart weekly={D.weekly.filter((w) => w.week >= D.programmeStart).slice(-4)} perWeek={perWeek} weekNo={weekNo} />
            </div>
            <dl className="stats">
              <div className="stat"><dt>Posts this week</dt><dd>{postedThisWeek} <small>of {dueThisWeek}</small></dd><div className="bar"><i style={{ width: `${dueThisWeek ? (postedThisWeek / dueThisWeek) * 100 : 0}%` }} /></div></div>
              <div className="stat"><dt>Fellows</dt><dd>{live.length} <small>of {nextCheckpoint?.creators ?? G.creators} by {fmt(nextCheckpoint?.by ?? G.by)}</small></dd><div className="bar"><i style={{ width: `${Math.min(100, (live.length / (nextCheckpoint?.creators || G.creators)) * 100)}%` }} /></div></div>
              <div className="stat"><dt>Active this week</dt><dd>{activeThisWeek} <small>of {live.length}</small></dd></div>
              <div className={`stat${atRisk ? " warn" : ""}`}><dt>At risk</dt><dd>{atRisk}</dd></div>
              <div className="stat"><dt>Numbers awaiting</dt><dd>{numbersAwaiting}</dd></div>
              <div className="stat"><dt>Studojo-post impressions</dt><dd>{kfmt(T.studojoImpressions)}</dd></div>
            </dl>
          </section>

          <section className="card attention" aria-labelledby="att-title">
            <div className="att-head">
              <h2 className="card-title" id="att-title">Needs attention today</h2>
              <div className="seg" role="tablist" aria-label="Needs attention">
                {([["review", "To review", T.draftsWaiting], ...(blockedList.length ? [["blocked", "Blocked", blockedList.length] as const] : []), ["nudge", "Nudge", nudgeList.length], ["numbers", "Numbers due", numbersList.length], ["stories", "New stories", storyList.length], ["ask", "Ask for stories", askList.length]] as const).map(([k, label, n]) => (
                  <button key={k} type="button" role="tab" aria-selected={P.att === k} onClick={() => { P.setAtt(k); P.setAttAll(false); }}>{label} <b>{n}</b></button>
                ))}
              </div>
            </div>
            <Attention
              kind={P.att} all={P.attAll} setAll={P.setAttAll} today={today}
              reviewList={reviewList} nudgeList={nudgeList} nudgeReason={nudgeReason} nudgedToday={nudgedToday} numbersList={numbersList} storyList={storyList}
              byId={byId} openFellow={(id) => setDrawer({ mode: "fellow", id })} openReview={(id) => setDrawer({ mode: "review", id })}
              nudge={(id, post, ask) => P.setNudge({ id, post, ask })} sentBack={T.draftsSentBack} askList={askList} blockedList={blockedList} openPost={(fid, pid) => setDrawer({ mode: "post", id: fid, postId: pid })}
            />
          </section>
        </div>

        <section className="card cal" aria-labelledby="week-title">
          <div className="cal-bar">
            <div className="weeknav">
              <button className="icon-btn" type="button" aria-label="Previous week" disabled={week <= D.programmeStart} onClick={() => setWeek(addDays(week, -7))}><Icon id="left" /></button>
              <button className="icon-btn" type="button" aria-label="Next week" disabled={week >= LAST_WEEK} onClick={() => setWeek(addDays(week, 7))}><Icon id="right" /></button>
              <h2 id="week-title">Week {weekNo(week)} <span>{range(week)} · {tag}</span></h2>
              {week !== THIS ? <button className="btn btn-quiet btn-sm" type="button" onClick={() => setWeek(THIS)}>Back to this week</button> : null}
            </div>
            <span className="spacer" />
            {plannable.length ? <button className="btn btn-outline btn-sm" type="button" onClick={() => copyPlan(plannable.map((f) => f.name), week)}><Icon id="wand" />Plan week {weekNo(week)} for {plural(plannable.length, "fellow")}</button> : null}
            <ul className="legend" aria-label="Post status colours">
              {LEGEND.map((k) => <li key={k}><span className={`sw slot s-${k}`} style={{ minHeight: 0, padding: 0, width: 14, height: 14 }} />{SLOT[k].label}</li>)}
            </ul>
          </div>
          <div className="filters" role="search">
            <label className="search"><span className="sr">Search fellows</span><Icon id="search" /><input className="input" type="search" placeholder="Search fellows, colleges, fields" value={F.q} onChange={(e) => F.setQ(e.target.value)} autoComplete="off" /></label>
            <select className="select" aria-label="Status" value={F.fStatus} onChange={(e) => F.setFStatus(e.target.value)}>
              <option value="all">All statuses</option>
              {["at risk", "active", "new", "paused"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)} ({live.filter((f) => fellowState(f)[0] === s).length})</option>)}
            </select>
            <select className="select" aria-label="Field" value={F.fField} onChange={(e) => F.setFField(e.target.value)}>
              <option value="all">All fields</option>{fields.map((f) => <option key={f}>{f}</option>)}
            </select>
            {cohorts.length > 1 ? <select className="select" aria-label="Cohort" value={F.fCohort} onChange={(e) => F.setFCohort(e.target.value)}><option value="all">All cohorts</option>{cohorts.map((c) => <option key={c} value={c}>Cohort {c}</option>)}</select> : null}
            <select className="select" aria-label="Sort" value={F.sort} onChange={(e) => { F.setSort(e.target.value); F.setDir(1); }}>
              {[["attention", "Needs attention first"], ["name", "Name"], ["posted", "Posted this week"], ["run", "Weekly run"], ["completed", "Completed weeks"], ["impressions", "Impressions"], ["active", "Last active"]].map(([v, l]) => <option key={v} value={v}>Sort: {l}</option>)}
            </select>
            <span className="count" aria-live="polite">{list.length === live.length ? `All ${plural(live.length, "fellow")}` : `${list.length} of ${plural(live.length, "fellow")}`}</span>
          </div>
          <div className="cal-scroll" tabIndex={0} aria-label="Calendar, scrolls sideways">
            <table className="grid">
              <caption className="sr">Posts for week {weekNo(week)}, {range(week)}, by fellow</caption>
              <colgroup>
                <col className="k-who" /><col className="k-st" /><col className="k-wk" /><col className="k-run" /><col className="k-done" /><col className="k-imp" /><col className="k-act" />
                {[0, 1, 2, 3, 4, 5, 6].map((d) => <col key={d} className={WIDE.includes(d) ? "k-on" : addDays(week, d) === today ? "k-today" : "k-off"} />)}
              </colgroup>
              <thead>
                <tr>
                  {sortTh("name", "Fellow", "c-who")}{sortTh("status", "Status")}{sortTh("posted", week === THIS ? "This week" : `Posted wk ${weekNo(week)}`, "num")}
                  {sortTh("run", "Weekly run", "num")}{sortTh("completed", "Completed weeks", "num")}{sortTh("impressions", "Impressions", "num")}{sortTh("active", "Last active")}
                  {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                    const date = addDays(week, d), on = WIDE.includes(d), isToday = date === today;
                    return <th key={d} className={`d ${on ? "d-on" : "d-off"}${isToday ? " is-today" : ""}`} scope="col"><span className="dd">{on ? DSHORT[d] : DSHORT[d][0]}</span><span className="dn">{day(date).getUTCDate()}</span>{isToday ? <span className="tdy">Today</span> : null}</th>;
                  })}
                </tr>
              </thead>
              <tbody>
                {list.length ? list.map((f) => {
                  const pt = postedIn(f, week);
                  const joinW = weekOf(f.joined || today);
                  let days: ReactNode;
                  if (week < joinW) days = <td className="d" colSpan={7}><span className="span-note">Joined {fmt(f.joined)}</span></td>;
                  else if (week > THIS && weekEmpty(f, week)) {
                    const off = (d: number) => <td key={d} className={`d d-off${addDays(week, d) === today ? " is-today" : ""}`} />;
                    days = <>{off(0)}<td className="d plan-cell" colSpan={5}>{f.status === "paused"
                      ? <span className="span-note"><Icon id="pause" sm /> Paused. Resume to plan posts.</span>
                      : <button className="plan-btn" type="button" onClick={() => copyPlan([f.name], week)}><Icon id="wand" />Plan week {weekNo(week)}: copy the Claude Code request</button>}</td>{off(6)}</>;
                  } else {
                    days = [0, 1, 2, 3, 4, 5, 6].map((d) => {
                      const date = addDays(week, d), on = POST_DAYS.includes(d), wide = WIDE.includes(d), isToday = date === today ? " is-today" : "";
                      const items = itemsOn(f, date);
                      const label = `${f.name}, ${DSHORT[d]} ${fmt(date)}`;
                      if (!items.length) {
                        if (!on) return <td key={d} className={`d d-off${isToday}`} />;
                        if (f.status === "paused" && date >= today) return <td key={d} className={`d d-on${isToday}`}><span className="slot s-paused" aria-label={`${label}, paused`}><span className="st"><Icon id="pause" />Paused</span></span></td>;
                        if (date < today) return <td key={d} className={`d d-on${isToday}`} />;
                        // Posts come from Claude (Vanshika's Claude Code), never typed in here: an open day stays empty.
                        return <td key={d} className={`d d-on${isToday}`} aria-label={`${label}: nothing planned`} />;
                      }
                      const it = items[0];
                      const s = "d" in it && it.d ? draftSlot(it.d) : postSlot((it as { p: Post }).p, today, f.status === "paused");
                      const title = "d" in it && it.d ? it.d.title : (it as { p: Post }).p.title;
                      const kind = "d" in it && it.d ? it.d.kind : (it as { p: Post }).p.kind;
                      const open = () => ("d" in it && it.d ? setDrawer({ mode: "review", id: f.id, draftId: it.d.id }) : setDrawer({ mode: "post", id: f.id, postId: (it as { p: Post }).p.id }));
                      return (
                        <td key={d} className={`d ${wide ? "d-on" : "d-off"}${isToday}`}>
                          <button className={`slot s-${s.key}`} type="button" onClick={open} title={title} aria-label={`${label}, ${kind === "studojo" ? "Studojo" : "personal"} post, ${s.label}`} style={wide ? undefined : { padding: 4, minHeight: 30 }}>
                            {wide ? <><span className="st"><Icon id={s.icon} />{s.label}{items.length > 1 ? ` +${items.length - 1}` : ""}</span><span className="k">{title || (kind === "studojo" ? "Studojo post" : "Personal post")}</span></> : <span className="mini-dot" style={{ background: "currentColor" }} />}
                          </button>
                        </td>
                      );
                    });
                  }
                  return (
                    <tr key={f.id}>
                      <th className="c-who" scope="row"><button className="who-btn" type="button" onClick={() => setDrawer({ mode: "fellow", id: f.id })}><span className={`avatar sm ${avClass(f.name)}`} aria-hidden="true">{initials(f.name)}</span><span><b>{f.name}</b><small>{[f.college, f.field].filter(Boolean).join(" · ") || "No college or field yet"}</small></span></button></th>
                      <td className="cell"><StatePill f={f} />{nudgedToday(f) ? <span className="nudged"><Icon id="check" sm />Nudged</span> : null}</td>
                      <td className="cell num"><span className="wk3"><b>{pt}</b><small>/ {PPW}</small><span className="pips" aria-hidden="true">{Array.from({ length: PPW }, (_, k) => <i key={k} className={k < pt ? "on" : ""} />)}</span></span></td>
                      <td className="cell num">{f.standing.run}<span className="unit">wk</span></td>
                      <td className="cell num">{f.standing.completedWeeks}</td>
                      <td className="cell num">{num(f.standing.impressions)}</td>
                      <td className="cell muted">{ago(f.standing.lastActivity)}</td>
                      {days}
                    </tr>
                  );
                }) : <tr><td colSpan={14}><div className="empty"><b>{live.length ? "No fellows match" : "No fellows yet"}</b>{live.length ? "Try a different search or clear a filter." : "Make someone a fellow from the Applicants page, or add one here."}</div></td></tr>}
              </tbody>
            </table>
          </div>
        </section>

        <Results D={D} act={act} />
      </div>

      {drawer ? (
        <div className="drawer">
          <div className="scrim" onClick={() => setDrawer(null)} />
          <aside className="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
            {drawer.mode === "fellow" && byId(drawer.id) ? <FellowView f={byId(drawer.id)!} D={D} act={act} creatorApi={creatorApi} setDrawer={setDrawer} nudge={(id) => P.setNudge({ id })} copyPlan={copyPlan} toast={toast} /> : null}
            {drawer.mode === "review" && byId(drawer.id) ? <ReviewView f={byId(drawer.id)!} D={D} act={act} setDrawer={setDrawer} draftId={drawer.draftId} /> : null}
            {drawer.mode === "post" ? <PostEditor D={D} state={drawer} byId={byId} act={act} upload={uploadPhoto} creatorApi={creatorApi} setDrawer={setDrawer} postDays={POST_DAYS} /> : null}
            {drawer.mode === "add-fellow" ? <AddFellow D={D} creatorApi={creatorApi} setDrawer={setDrawer} toast={toast} /> : null}
            {drawer.mode === "queue" ? <QueueView D={D} setDrawer={setDrawer} /> : null}
            {((drawer.mode === "fellow" || drawer.mode === "review") && !byId(drawer.id)) ? <><div className="sheet-head"><span className="crumb">Gone</span><CloseBtn onClick={() => setDrawer(null)} /></div><div className="sheet-body"><div className="empty"><b>That fellow isn't here any more</b></div></div></> : null}
          </aside>
        </div>
      ) : null}
      {P.nudge && byId(P.nudge.id) ? <NudgeDialog f={byId(P.nudge.id)!} post={P.nudge.post} ask={P.nudge.ask} close={() => P.setNudge(null)} act={act} toast={toast} today={today} /> : null}
    </main>
  );
}

const CloseBtn = ({ onClick }: { onClick: () => void }) => <button className="icon-btn" type="button" aria-label="Close" onClick={onClick}><Icon id="x" /></button>;

function WeekChart({ weekly, perWeek, weekNo }: { weekly: Desk["weekly"]; perWeek: number; weekNo: (w: string) => number }) {
  const W = 270, H = 168, top = 30, base = 134, plotH = base - top;
  const max = Math.max(1, ...weekly.map((w) => w.impressions), perWeek);
  const y = (v: number) => base - (v / max) * plotH;
  const bw = 30, gap = (W - weekly.length * bw) / weekly.length;
  const ty = y(perWeek);
  return (
    <div className="wk-chart">
      <p className="wk-cap">Impressions by week</p>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Impressions by week: ${weekly.map((w) => kfmt(w.impressions)).join(", ")}. Needed from now: ${kfmt(perWeek)} a week.`}>
        <line x1="0" x2={W} y1={base} y2={base} stroke="var(--line-2)" strokeWidth="1" />
        <line x1="0" x2={W} y1={ty} y2={ty} stroke="var(--ink-2)" strokeWidth="1.25" strokeDasharray="4 4" />
        <text className="t" x={W} y={ty - 6} textAnchor="end">Needed each week from now: {kfmt(perWeek)}</text>
        {weekly.map((w, k) => {
          const x = gap / 2 + k * (bw + gap), h = Math.max(0, base - y(w.impressions)), r = Math.min(4, h);
          const path = h ? `M${x},${base} L${x},${base - h + r} Q${x},${base - h} ${x + r},${base - h} L${x + bw - r},${base - h} Q${x + bw},${base - h} ${x + bw},${base - h + r} L${x + bw},${base} Z` : "";
          return (
            <g key={w.week}>
              <title>{`Week ${weekNo(w.week)}: ${num(w.impressions)} impressions${w.partial ? " so far" : ""}`}</title>
              {path ? <path d={path} fill="var(--accent)" fillOpacity={w.partial ? 0.42 : 1} /> : null}
              <text className="v" x={x + bw / 2} y={base - h - 6} textAnchor="middle">{kfmt(w.impressions)}</text>
              <text x={x + bw / 2} y={base + 16} textAnchor="middle">{w.partial ? "This week" : `Week ${weekNo(w.week)}`}</text>
              {w.partial ? <text x={x + bw / 2} y={base + 29} textAnchor="middle">so far</text> : null}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// A fellow's pictures (analytics screenshots, post photos). Images come through /api/fellowship-proof with the admin
// token, so they're fetched here and shown from object URLs (an <img> can't send the token).
function useProofImages(refs: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState<Record<string, string>>({});
  useEffect(() => {
    let on = true; const made: string[] = [];
    (async () => {
      const token = await getToken();
      for (const r of refs) {
        if (safeUrl(r)) continue;
        try {
          const res = await fetch(`/api/fellowship-proof?ref=${encodeURIComponent(r)}`, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) { const j = await res.json().catch(() => null); if (on) setFailed((m) => ({ ...m, [r]: (j && j.error) || "Couldn't load it" })); continue; }
          const u = URL.createObjectURL(await res.blob()); made.push(u);
          if (on) setUrls((m) => ({ ...m, [r]: u }));
        } catch { if (on) setFailed((m) => ({ ...m, [r]: "Couldn't load it" })); }
      }
    })();
    return () => { on = false; made.forEach((u) => URL.revokeObjectURL(u)); };
  }, [refs]);
  return { urls, failed };
}

function ProofShots({ value }: { value: string | null }) {
  const refs = useMemo(() => proofRefs(value), [value]);
  const { urls, failed } = useProofImages(refs);
  return (
    <div className="proofs">
      <h3 className="label" style={{ margin: 0 }}>Analytics screenshots{refs.length ? ` (${refs.length})` : ""}</h3>
      {refs.length ? (
        <div className="proof-grid">
          {refs.map((r, i) => safeUrl(r)
            ? <a key={r} className="proof-link" href={safeUrl(r)!} target="_blank" rel="noopener noreferrer">Screenshot link</a>
            : urls[r]
              ? <a key={r} href={urls[r]} target="_blank" rel="noopener noreferrer"><img src={urls[r]} alt={`Analytics screenshot ${i + 1}`} /></a>
              : <span key={r} className="proof-wait">{failed[r] ?? "Loading…"}</span>)}
        </div>
      ) : <p className="hint">None yet. Fellows upload their analytics screenshots at the end of each week.</p>}
    </div>
  );
}

/** A photo as a JPEG for upload: long side at most 2048 px, like the fellow's page sends. */
async function toJpeg(file: File): Promise<Blob> {
  const bmp = await createImageBitmap(file).catch(() => { throw new Error("That file isn't a picture the page can read. Try a JPEG or PNG."); });
  const scale = Math.min(1, 2048 / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height); bmp.close();
  const blob = await new Promise<Blob | null>((r) => c.toBlob(r, "image/jpeg", 0.85));
  if (!blob) throw new Error("Couldn't read that picture. Try another one.");
  if (blob.size > 5 * 1024 * 1024) throw new Error("That photo is too big even after shrinking it. Try another one.");
  return blob;
}

// The photo that goes up with a post. No post goes up without one (the founder, 3 Nov 2026): the fellow adds their
// own on their page, and their page keeps the post locked until it has one. When they have none, their page offers stock images for it.
function PostPhotos({ p, first, act, upload }: {
  p: Post; first: string; act: (b: Record<string, unknown>, done?: string) => Promise<Desk | null>; upload: ((postId: number, file: File) => Promise<boolean>) | null;
}) {
  const key = p.photos.join("|");
  const refs = useMemo(() => p.photos, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const { urls, failed } = useProofImages(refs);
  const [idea, setIdea] = useState(p.photoIdea ?? "");
  const [busy, setBusy] = useState(false);
  const [rm, setRm] = useState<string | null>(null);
  useEffect(() => setIdea(p.photoIdea ?? ""), [p.photoIdea]);
  const posted = p.status === "posted";
  const team = new Set(p.review?.teamPhotos ?? []);
  const full = p.photos.length >= 4;
  return (
    <section className="compose" aria-label="Photo">
      <div className="sec-h"><h3>Photo</h3><span>{p.photos.length ? `${p.photos.length} added` : posted ? "None" : "Needed before it can go up"}</span></div>
      {!posted && !p.photos.length ? <p className={`note ${p.photoHelpAt ? "note-bad" : "note-warn"}`}><Icon id="alert" /><span>{p.photoHelpAt
        ? <><b>{first} has no photo for this</b> (said so {fmt(istDay(p.photoHelpAt))}). Their page is offering them a stock image: it unlocks once they say yes or add their own.</>
        : <>{first} can't copy or post this until it has a photo. They add their own on their page.</>}</span></p> : null}
      {p.photos.length ? <div className="proof-grid">{p.photos.map((r, i) => (
        <figure key={r} className="photo-fig">
          {urls[r] ? <a href={urls[r]} target="_blank" rel="noopener noreferrer"><img src={urls[r]} alt={`Photo ${i + 1} for this post`} /></a> : <span className="proof-wait">{failed[r] ?? "Loading…"}</span>}
          <figcaption>{team.has(r) ? "Added by the team" : `${first}'s photo`}
            {posted ? null : rm === r
              ? <span className="inline-confirm">Remove it?<button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={async () => { setBusy(true); await act({ intent: "photo-remove", id: p.id, ref: r }, "Photo removed."); setBusy(false); setRm(null); }}>Remove</button><button className="btn btn-quiet btn-sm" type="button" onClick={() => setRm(null)}>Keep</button></span>
              : <button className="btn btn-quiet btn-sm" type="button" onClick={() => setRm(r)}><Icon id="trash" />Remove</button>}
          </figcaption>
        </figure>))}</div> : null}
      {posted ? (p.photoIdea ? <p className="hint">Photo idea: {p.photoIdea}</p> : null) : <>
        <div className="field"><label htmlFor={`pi-${p.id}`}>Photo idea, shown to {first}</label>
          <div className="photo-idea-row"><input className="input" id={`pi-${p.id}`} value={idea} maxLength={500} onChange={(e) => setIdea(e.target.value)} placeholder="For example: a photo of you with your team at the hackathon" />
            <button className="btn btn-line btn-sm" type="button" disabled={busy || idea.trim() === (p.photoIdea ?? "")} onClick={async () => { setBusy(true); await act({ intent: "photo-idea", id: p.id, photoIdea: idea.trim() }, "Photo idea saved."); setBusy(false); }}>Save</button></div></div>
        {upload ? <label className="btn btn-line btn-sm photo-add" aria-disabled={full || busy}>
          <input type="file" accept="image/*" className="sr" disabled={full || busy} onChange={async (e) => { const file = e.target.files?.[0]; e.target.value = ""; if (!file) return; setBusy(true); await upload(p.id, file); setBusy(false); }} />
          <Icon id="plus" />{busy ? "Working…" : full ? "4 photos is the most" : `Add a photo for ${first}`}</label> : null}
      </>}
    </section>
  );
}

function Attention(p: {
  kind: AttKind; all: boolean; setAll: (v: boolean) => void; today: string;
  reviewList: Fellow[]; nudgeList: Fellow[]; nudgeReason: (f: Fellow) => string[]; nudgedToday: (f: Fellow) => boolean;
  numbersList: { f: Fellow; p: Post }[]; storyList: Story[]; byId: (id: number) => Fellow | null;
  openFellow: (id: number) => void; openReview: (id: number) => void; nudge: (id: number, post?: Post, ask?: boolean) => void; sentBack: number; askList: Fellow[];
  blockedList: { f: Fellow; p: Post }[]; openPost: (fellowId: number, postId: number) => void;
}) {
  const LIM = 4;
  const who = (f: Fellow, line: string) => (
    <><span className={`avatar ${avClass(f.name)}`} aria-hidden="true">{initials(f.name)}</span>
      <div className="who"><b><button type="button" onClick={() => p.openFellow(f.id)}>{f.name}</button></b><span className="why">{line}</span></div></>
  );
  let why = "", rows: ReactNode[] = [], total = 0;
  if (p.kind === "review") {
    total = p.reviewList.length;
    why = total ? `Posts Claude wrote, waiting for someone to approve them. Nothing reaches a fellow before that.${p.sentBack ? ` ${p.sentBack} more are back with Claude for changes.` : ""}` : "Nothing waiting. When Claude Code writes a batch, the drafts land here.";
    rows = (p.all ? p.reviewList : p.reviewList.slice(0, LIM)).map((f) => {
      const ds = f.drafts.filter((d) => d.status === "review");
      return <li key={f.id}>{who(f, `${plural(ds.length, "draft")} · due from ${dow(ds[0].due)} ${fmt(ds[0].due)}`)}<button className="btn btn-primary btn-sm" type="button" onClick={() => p.openReview(f.id)}><Icon id="pen" />Review</button></li>;
    });
  } else if (p.kind === "nudge") {
    total = p.nudgeList.length;
    why = `${DOWL[day(p.today).getUTCDay()]}: fellows behind this week, or who fell behind last week.`;
    rows = (p.all ? p.nudgeList : p.nudgeList.slice(0, LIM)).map((f) => (
      <li key={f.id}>{who(f, `${p.nudgeReason(f).join(" · ")} · active ${ago(f.standing.lastActivity).toLowerCase()}`)}
        {p.nudgedToday(f) ? <span className="done-mark"><Icon id="check" sm />Nudged</span> : <button className="btn btn-outline btn-sm" type="button" onClick={() => p.nudge(f.id)}><Icon id="chat" />Nudge</button>}</li>
    ));
  } else if (p.kind === "numbers") {
    total = p.numbersList.length;
    why = "Posts up for more than a week that still need impressions, reactions and comments.";
    rows = (p.all ? p.numbersList : p.numbersList.slice(0, LIM)).map(({ f, p: post }) => (
      <li key={post.id}>{who(f, `"${post.title}" · posted ${fmt(istDay(post.postedAt!))}`)}<button className="btn btn-outline btn-sm" type="button" onClick={() => p.nudge(f.id, post)}><Icon id="chat" />Ask</button></li>
    ));
  } else if (p.kind === "blocked") {
    total = p.blockedList.length;
    why = "Approved posts the team took back. The fellow sees an \"on hold\" warning instead of the post. Fix each one, then release it.";
    rows = (p.all ? p.blockedList : p.blockedList.slice(0, LIM)).map(({ f, p: post }) => (
      <li key={post.id}>{who(f, `"${post.title}" · due ${dow(post.due)} ${fmt(post.due)}${post.review?.blocked?.reason ? ` · ${post.review.blocked.reason}` : ""}`)}<button className="btn btn-primary btn-sm" type="button" onClick={() => p.openPost(f.id, post.id)}><Icon id="pen" />Fix it</button></li>
    ));
  } else if (p.kind === "ask") {
    total = p.askList.length;
    why = "Fellows who've shared fewer than 3 stories. Their posts are written from these, so ask them to tell us more about their life.";
    rows = (p.all ? p.askList : p.askList.slice(0, LIM)).map((f) => (
      <li key={f.id}>{who(f, `${plural(f.stories, "story", "stories")} so far${f.teamNotes ? "" : " · no call notes yet"}`)}<button className="btn btn-outline btn-sm" type="button" onClick={() => p.nudge(f.id, undefined, true)}><Icon id="chat" />Ask</button></li>
    ));
  } else {
    total = p.storyList.length;
    why = "Stories fellows told on their page. Claude reads them before writing; the best become next week's posts.";
    rows = p.storyList.slice(0, p.all ? 40 : LIM).map((s) => {
      const f = p.byId(s.creatorId)!;
      return (
        <li key={s.id} className="story"><span className={`avatar ${avClass(f.name)}`} aria-hidden="true">{initials(f.name)}</span>
          <div className="who"><b><button type="button" onClick={() => p.openFellow(f.id)}>{f.name}</button></b><span>{s.spoken ? "Spoken" : "Typed"} on {dow(istDay(s.createdAt))} {fmt(istDay(s.createdAt))}{s.prompt ? ` · ${s.prompt}` : ""}</span><q>{s.text.length > 280 ? s.text.slice(0, 280) + "…" : s.text}</q></div></li>
      );
    });
  }
  return (
    <>
      <p className="att-why">{why}</p>
      <ul className="att-list">{rows}</ul>
      {total > LIM ? <div className="att-more"><button className="btn btn-quiet btn-sm" type="button" onClick={() => p.setAll(!p.all)}>{p.all ? "Show fewer" : `Show all ${total}`}</button></div> : null}
    </>
  );
}

// ---------------------------------------------------------------- results + lessons
function Results({ D, act }: { D: Desk; act: (b: Record<string, unknown>, done?: string) => Promise<Desk | null> }) {
  const posts = D.fellows.flatMap((f) => f.posts).filter((p) => p.status === "posted" && p.impressions != null);
  const n = (k: string) => posts.filter((p) => p.verdict?.level === k).length;
  const avg = (k: Kind) => { const ps = posts.filter((p) => p.kind === k); return ps.length ? Math.round(ps.reduce((s, p) => s + (p.impressions ?? 0), 0) / ps.length) : null; };
  const sj = avg("studojo"), ps = avg("personal");
  return (
    <section className="card results" aria-labelledby="res-title">
      <div>
        <h2 className="card-title" id="res-title">How the posts are doing</h2>
        <p className="card-sub">Each post against the fellow's usual (or the programme's, for their first few). Open a post to see Claude's note on why.</p>
        <div className="vgrid">
          {(["good", "okay", "bad", "ugly"] as const).map((k) => <div key={k} className={`vbox ${VERDICT[k][1]}`}><b>{n(k)}</b><span>{VERDICT[k][0]}</span></div>)}
        </div>
        <p className="card-sub" style={{ marginTop: 12 }}>
          {posts.length ? <>Studojo posts average <b>{sj == null ? "–" : num(sj)}</b> impressions; their own stories <b>{ps == null ? "–" : num(ps)}</b>. {plural(posts.length, "post")} with numbers in.</> : "Numbers show up here once fellows post and report them."}
        </p>
      </div>
      <div>
        <h2 className="card-title">Lessons Claude follows</h2>
        <p className="card-sub"><b>What this is:</b> the writing rules Claude follows for every fellow's posts. Claude reads this list before it writes anything. Once posts have their numbers, Claude adds what worked and what didn't, and what your edits taught it (for example, "posts that open with a real moment get more impressions"). It stays empty until posts have results. You can edit or delete any line, and Claude follows whatever is here.</p>
        <div style={{ marginTop: 10 }}>
          <NotesBox saved={D.playbook.text} label="Lessons for every fellow" placeholder="Nothing yet. Claude adds lessons as results come in." meta={D.playbook.updatedAt ? `Last changed ${fmt(istDay(D.playbook.updatedAt))} by ${D.playbook.by === "claude" ? "Claude" : D.playbook.by || "the team"}` : ""}
            onSave={(text) => act({ intent: "playbook", text }, "Lessons saved")} />
        </div>
      </div>
    </section>
  );
}

function NotesBox({ saved, label, placeholder, meta, onSave }: { saved: string; label: string; placeholder: string; meta?: string; onSave: (t: string) => Promise<unknown> }) {
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const last = useRef(saved);
  useEffect(() => { if (saved !== last.current) { if (text === last.current) setText(saved); last.current = saved; } }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = text.trim() !== (saved || "").trim();
  return (
    <div className="field">
      <textarea className="input" aria-label={label} placeholder={placeholder} rows={6} value={text} onChange={(e) => setText(e.target.value)} style={{ fieldSizing: "content", minHeight: 120 } as React.CSSProperties} />
      <div className="text-meta"><span className="cnt">{dirty ? <span className="dirty">Unsaved changes</span> : meta}</span>
        <button className="btn btn-primary btn-sm" type="button" disabled={!dirty || busy} onClick={async () => { setBusy(true); await onSave(text); setBusy(false); }}><Icon id="check" />Save</button></div>
    </div>
  );
}

// ---------------------------------------------------------------- fellow drawer
function FellowView({ f, D, act, creatorApi, setDrawer, nudge, copyPlan, toast }: {
  f: Fellow; D: Desk; act: (b: Record<string, unknown>, done?: string) => Promise<Desk | null>; creatorApi: (p: string, b: Record<string, unknown>, d?: string) => Promise<unknown>;
  setDrawer: (d: DrawerState | null) => void; nudge: (id: number) => void; copyPlan: (names: string[], w: string) => void; toast: (m: string) => void;
}) {
  const [extras, setExtras] = useState<{ stories: Story[]; earlierPosts: { id: number; title: string | null; body: string; posted_on: string | null; impressions: number | null }[]; applicationNotes: string; weeks?: AnalyticsWeek[] } | null>(null);
  const [confirmPause, setConfirmPause] = useState(false);
  useEffect(() => { let on = true; api<typeof extras>(`/api/fellowship-calendar?fellow=${f.id}`).then((x) => { if (on) setExtras(x); }).catch(() => {}); return () => { on = false; }; }, [f.id, f.stories, f.earlierPosts]);
  const s = f.standing, today = D.today, THIS = D.thisWeek;
  const grew = f.connections != null && f.connectionsAtJoin != null ? f.connections - f.connectionsAtJoin : null;
  const weeks: string[] = [];
  for (let w = addDays(THIS, 7); w >= weekOf(f.joined || today); w = addDays(w, -7)) weeks.push(w);
  const hasNext = [...f.posts, ...f.drafts].some((x) => weekOf(x.due) === addDays(THIS, 7));
  const left = s.thisWeek.due - s.thisWeek.posted;
  return (
    <>
      <div className="sheet-head"><span className="crumb">Fellow</span>
        {f.status === "active" ? <button className="btn btn-quiet btn-sm" type="button" onClick={() => setConfirmPause(true)}><Icon id="pause" />Pause</button> : null}
        <CloseBtn onClick={() => setDrawer(null)} /></div>
      <div className="sheet-body">
        <div className="prof"><span className={`avatar lg ${avClass(f.name)}`} aria-hidden="true">{initials(f.name)}</span>
          <div><h2 id="sheet-title">{f.name}</h2><p>{[f.college, f.field, f.cohort ? `Cohort ${f.cohort}` : null].filter(Boolean).join(" · ")}</p><p>Joined {f.joined ? fmt(f.joined) : "–"} · Last active {ago(s.lastActivity).toLowerCase()}</p><StatePill f={f} />{f.internAt ? <span className="pill pill-new" style={{ marginLeft: 6 }}>Growth intern since {fmt(istDay(f.internAt))}</span> : null}{f.referredAt ? <span className="pill pill-new" style={{ marginLeft: 6 }}>Referred {fmt(istDay(f.referredAt))}</span> : null}</div></div>
        <div className="actions">
          {f.status === "paused" ? <button className="btn btn-primary" type="button" onClick={() => creatorApi("/api/ugc-creators", { intent: "set-status", id: f.id, status: "active" }, `${f.first} is back on the calendar.`)}><Icon id="play" />Resume</button> : null}
          {f.drafts.some((d) => d.status === "review") ? <button className="btn btn-primary" type="button" onClick={() => setDrawer({ mode: "review", id: f.id })}><Icon id="pen" />Review {plural(f.drafts.filter((d) => d.status === "review").length, "draft")}</button> : null}
          {f.status === "active" && left > 0 ? <button className="btn btn-outline" type="button" onClick={() => nudge(f.id)}><Icon id="chat" />Nudge on WhatsApp</button> : null}
          {f.status === "active" && !hasNext ? <button className="btn btn-line" type="button" onClick={() => copyPlan([f.name], addDays(THIS, 7))}><Icon id="wand" />Plan next week</button> : null}
        </div>
        {confirmPause ? <div className="confirm" role="alert"><p><b>Pause {f.first}?</b> Their open posts stop showing as due, and they drop out of nudges until you resume.</p><div className="actions">
          <button className="btn btn-primary" type="button" onClick={async () => { setConfirmPause(false); await creatorApi("/api/ugc-creators", { intent: "set-status", id: f.id, status: "paused" }, `${f.first} is paused.`); }}>Pause {f.first}</button>
          <button className="btn btn-quiet" type="button" onClick={() => setConfirmPause(false)}>Keep active</button></div></div> : null}
        {f.link ? (
          <div className="field"><span className="label">Their page (private: only send it to {f.first})</span>
            <div className="linkbox"><input className="input" readOnly value={f.link} onFocus={(e) => e.target.select()} aria-label={`${f.name}'s page`} />
              <button className="btn btn-line btn-sm" type="button" onClick={async () => toast((await copyText(f.link!)) ? `Link copied. Send it to ${f.first} on WhatsApp.` : "Couldn't copy the link.")}><Icon id="copy" />Copy</button>
              <a className="btn btn-line btn-sm" href={f.link} target="_blank" rel="noopener noreferrer"><Icon id="link" />Open</a></div>
            <p className="hint">{[f.whatsapp ? `WhatsApp ${f.whatsapp}` : "No WhatsApp number", f.email].filter(Boolean).join(" · ")}{safeUrl(f.linkedin) ? <> · <a href={safeUrl(f.linkedin)!} target="_blank" rel="noopener noreferrer">LinkedIn profile</a></> : null}</p></div>
        ) : null}
        <dl className="kv">
          <div><dt>This week</dt><dd>{s.thisWeek.posted} of {s.thisWeek.due}</dd></div>
          <div><dt>Weekly run</dt><dd>{s.run} wk</dd></div>
          <div><dt>Completed</dt><dd>{s.completedWeeks} wk</dd></div>
          <div><dt>Impressions</dt><dd>{num(s.impressions)}</dd></div>
          <div><dt>Connections</dt><dd>{f.connections != null ? num(f.connections) : "–"}{grew != null ? <small>{grew >= 0 ? "+" : ""}{grew} since joining</small> : null}</dd></div>
        </dl>
        <div className="ms" aria-label="Milestones">{D.rules.milestones.map((m) => <span key={m.id} className={s.milestonesReached.includes(m.id) ? "on" : ""}>{s.milestonesReached.includes(m.id) ? <Icon id="check" sm /> : null}{m.name} · {m.weeks} wk</span>)}</div>

        <section aria-labelledby="pw-h"><div className="sec-h"><h3 id="pw-h">Posts by week</h3><span>Select a post to open it</span></div>
          {weeks.map((w) => {
            const items = [...f.drafts.filter((d) => weekOf(d.due) === w).map((d) => ({ due: d.due, d })), ...f.posts.filter((p) => weekOf(p.due) === w).map((p) => ({ due: p.due, p }))].sort((a, b) => a.due.localeCompare(b.due));
            if (!items.length && w < THIS) return null;
            const posted = items.filter((x) => "p" in x && x.p && x.p.status === "posted").length;
            const label = w === THIS ? "This week" : w > THIS ? "Next week" : `${posted} of ${items.length} posted`;
            return (
              <div className="wkb" key={w}><div className="wkb-h"><b>Week of {fmt(w)}</b><span>{label}</span></div>
                {items.length ? items.map((x) => {
                  const sl = "d" in x && x.d ? draftSlot(x.d) : postSlot((x as { p: Post }).p, today, f.status === "paused");
                  const t = "d" in x && x.d ? x.d.title : (x as { p: Post }).p.title;
                  const p = "p" in x ? (x as { p: Post }).p : null;
                  const meta = p ? [p.kind === "studojo" ? "Studojo" : "Their story", p.impressions != null ? `${num(p.impressions)} impressions` : null].filter(Boolean).join(" · ") : `${("d" in x && x.d?.kind === "studojo") ? "Studojo" : "Their story"} · Claude's draft`;
                  return <div className="prow" key={`${"d" in x && x.d ? "d" + x.d.id : "p" + p!.id}`}><span className="dt">{dow(x.due)} {fmt(x.due)}</span><span className="tt"><b>{t}</b><small>{meta}</small></span>
                    <button className={`slot s-${sl.key}`} type="button" onClick={() => ("d" in x && x.d ? setDrawer({ mode: "review", id: f.id, draftId: x.d.id }) : setDrawer({ mode: "post", id: f.id, postId: p!.id, from: "fellow" }))}><span className="st"><Icon id={sl.icon} />{sl.label}</span></button></div>;
                }) : <div className="prow"><span className="dt" /><span className="tt"><small>Nothing planned yet.</small></span>{f.status === "active" ? <button className="btn btn-outline btn-sm" type="button" onClick={() => copyPlan([f.name], w)}><Icon id="wand" />Plan this week</button> : <span />}</div>}
              </div>
            );
          })}
        </section>

        <section aria-labelledby="wa-h"><div className="sec-h"><h3 id="wa-h">LinkedIn analytics</h3><span>Uploaded by {f.first} each week</span></div>
          <WeeklyAnalytics weeks={extras?.weeks ?? null} f={f} /></section>
        <section aria-labelledby="ab-h"><div className="sec-h"><h3 id="ab-h">About them</h3><span>Notes from your calls. Claude reads these before writing</span></div>
          <NotesBox saved={f.teamNotes} label={`About ${f.name}`} placeholder="Their goals, the roles they want, what they've done, how they talk, anything to avoid."
            onSave={(text) => act({ intent: "notes", id: f.id, teamNotes: text }, "Notes saved")} />
          {extras?.applicationNotes ? <details className="more" style={{ marginTop: 8 }}><summary>Notes from when they applied</summary><p className="post-text" style={{ marginTop: 8 }}>{extras.applicationNotes}</p></details> : null}</section>
        <section aria-labelledby="ww-h"><div className="sec-h"><h3 id="ww-h">What works for them</h3><span>Claude keeps this up to date from results</span></div>
          <NotesBox saved={f.learnings} label={`What works for ${f.name}`} placeholder="Nothing yet. Claude fills this in once their posts have numbers."
            onSave={(text) => act({ intent: "notes", id: f.id, learnings: text }, "Saved")} /></section>
        <section aria-labelledby="st-h"><div className="sec-h"><h3 id="st-h">Stories</h3><span>{plural(f.stories, "story", "stories")} shared</span></div>
          {extras?.stories.length ? extras.stories.map((st) => <div className="storyb" key={st.id}><p className="m">{st.spoken ? "Spoken" : "Typed"} · {dow(istDay(st.createdAt))} {fmt(istDay(st.createdAt))}{st.prompt ? ` · ${st.prompt}` : ""}</p><p className="q">{st.text}</p></div>)
            : <div className="storyb"><p className="m">{f.stories ? "Loading…" : `${f.first} hasn't shared a story yet. Their page asks them about their experiences.`}</p></div>}
        </section>
        <section aria-labelledby="ep-h"><div className="sec-h"><h3 id="ep-h">Earlier posts</h3><span>Written before the dashboard, so Claude never repeats them</span></div>
          {extras?.earlierPosts.length ? extras.earlierPosts.map((e) => <details className="storyb more" key={e.id}><summary>{e.title || "Post"}{e.posted_on ? ` · ${fmt(e.posted_on)}` : ""}{e.impressions != null ? ` · ${num(e.impressions)} impressions` : ""}</summary><p className="post-text" style={{ marginTop: 8 }}>{e.body}</p></details>)
            : <div className="storyb"><p className="m">{f.earlierPosts ? "Loading…" : "None yet. Claude Code can add the posts written for them before the dashboard."}</p></div>}
        </section>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- speaking feedback
// The browser's own speech-to-text (Google in Chrome, Apple in Safari), in Indian English: the words land in the
// feedback box as the team talks, to check before sending. No audio reaches Studojo. Browsers without it just type.
type SpeechRec = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
function MicButton({ onText }: { onText: (text: string) => void }) {
  const [on, setOn] = useState(false);
  const [err, setErr] = useState("");
  const rec = useRef<SpeechRec | null>(null);
  const keep = useRef(false);
  const Ctor = typeof window === "undefined" ? null : ((window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition) as (new () => SpeechRec) | undefined;
  useEffect(() => () => { keep.current = false; rec.current?.stop(); }, []);
  if (!Ctor) return null;
  const start = () => {
    const r = new Ctor();
    r.lang = "en-IN"; r.continuous = true; r.interimResults = false;
    r.onresult = (e) => { for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) { const t = e.results[i][0].transcript.trim(); if (t) onText(t); } };
    r.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      keep.current = false;
      setErr(e.error === "not-allowed" || e.error === "service-not-allowed" ? "Allow the microphone for this site to speak, or type instead." : e.error === "network" ? "Speaking needs an internet connection." : "Speaking stopped. Tap Speak to carry on.");
    };
    // The browser ends a session after a pause: carry on until they tap stop.
    r.onend = () => { if (keep.current) { try { r.start(); return; } catch { /* fall through */ } } setOn(false); };
    rec.current = r; keep.current = true; setErr(""); setOn(true);
    try { r.start(); } catch { keep.current = false; setOn(false); setErr("Couldn't start the microphone."); }
  };
  const stop = () => { keep.current = false; rec.current?.stop(); setOn(false); };
  return (
    <>
      <button className={`btn btn-sm ${on ? "btn-primary" : "btn-outline"}`} type="button" aria-pressed={on} onClick={on ? stop : start}><Icon id="mic" />{on ? "Listening… tap to stop" : "Speak"}</button>
      {err ? <span className="hint" role="alert">{err}</span> : null}
    </>
  );
}

// ---------------------------------------------------------------- review queue: every draft Claude has written
// The one place posts come in. Claude (Vanshika's Claude Code) writes them; the team edits, speaks feedback and
// sends a draft back, or approves it, and only then does it reach the fellow's page.
function QueueView({ D, setDrawer }: { D: Desk; setDrawer: (d: DrawerState | null) => void }) {
  const rows = D.fellows.flatMap((f) => f.drafts.map((d) => ({ f, d }))).sort((a, b) => (a.d.status === b.d.status ? 0 : a.d.status === "review" ? -1 : 1) || a.d.due.localeCompare(b.d.due) || a.d.id - b.d.id);
  const waiting = rows.filter((r) => r.d.status === "review"), back = rows.filter((r) => r.d.status === "changes");
  const versions = D.fellows.flatMap((f) => f.posts.filter((p) => p.status === "ready" && p.fellowVersion).map((p) => ({ f, p }))).sort((a, b) => a.p.fellowVersion!.at.localeCompare(b.p.fellowVersion!.at));
  const item = ({ f, d }: { f: Fellow; d: Draft }) => (
    <div className="prow" key={d.id}><span className="dt">{dow(d.due)} {fmt(d.due)}</span>
      <span className="tt"><b>{d.title || "Untitled post"}</b><small>{f.name} · {d.kind === "studojo" ? "Studojo" : "Their story"}{d.status === "changes" ? " · waiting for Claude's revision" : d.versions.filter((v) => v.by === "claude").length > 1 ? " · revised by Claude" : ""}</small></span>
      <button className={`btn btn-sm ${d.status === "review" ? "btn-primary" : "btn-line"}`} type="button" onClick={() => setDrawer({ mode: "review", id: f.id, draftId: d.id })}>{d.status === "review" ? "Review" : "Open"}</button></div>
  );
  return (
    <>
      <div className="sheet-head"><span className="crumb">Review posts</span><CloseBtn onClick={() => setDrawer(null)} /></div>
      <div className="sheet-body">
        <div>
          <h2 id="sheet-title" style={{ margin: 0, font: "600 23px/1.2 var(--serif)" }}>Posts to review</h2>
          <p className="card-sub">Claude writes every post from the fellow's call notes and stories. Open one to edit it, speak or type your feedback and send it back, or approve it. Nothing reaches a fellow until you approve it.</p>
        </div>
        {versions.length ? <section aria-labelledby="q-ver"><div className="sec-h"><h3 id="q-ver">Fellows' own versions</h3><span>{versions.length}</span></div>
          {versions.map(({ f, p }) => (
            <div className="prow" key={p.id}><span className="dt">{dow(p.due)} {fmt(p.due)}</span>
              <span className="tt"><b>{p.title}</b><small>{f.name} rewrote this post · sent {fmt(istDay(p.fellowVersion!.at))} · locked on their page until you decide</small></span>
              <button className="btn btn-sm btn-primary" type="button" onClick={() => setDrawer({ mode: "post", id: f.id, postId: p.id })}>Review</button></div>
          ))}</section> : null}
        <section aria-labelledby="q-wait"><div className="sec-h"><h3 id="q-wait">Waiting for you</h3><span>{waiting.length}</span></div>
          {waiting.length ? waiting.map(item) : <div className="empty"><b>No posts waiting</b>When Claude writes posts, they appear here. Ask Vanshika's Claude Code to write a fellow's week, or use "Plan week" on the calendar to copy the request.</div>}
        </section>
        {back.length ? <section aria-labelledby="q-back"><div className="sec-h"><h3 id="q-back">Sent back to Claude</h3><span>{back.length}</span></div>{back.map(item)}
          <p className="hint">Claude picks these up the next time it checks for feedback, and the revised post comes back to "Waiting for you".</p></section> : null}
      </div>
    </>
  );
}

// ---------------------------------------------------------------- a posted post's LinkedIn analytics export
const METRIC_ORDER = ["impressions", "membersReached", "reactions", "comments", "reposts", "saves", "sends", "profileViewers", "followersGained"];
const metricLabel = (k: string) => ({ membersReached: "Members reached", profileViewers: "Profile viewers", followersGained: "Followers gained" } as Record<string, string>)[k]
  ?? k.replace(/([a-z])([A-Z])/g, "$1 $2").replace(/^./, (c) => c.toUpperCase());
function AnalyticsBox({ p, first }: { p: Post; first: string }) {
  const a = p.analytics;
  const [err, setErr] = useState("");
  const download = async () => {
    setErr("");
    try {
      const token = await getToken();
      const res = await fetch(`/api/fellowship-proof?ref=${encodeURIComponent(a!.file)}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { const j = await res.json().catch(() => null); setErr((j && j.error) || "Couldn't download it"); return; }
      const u = URL.createObjectURL(await res.blob());
      const link = document.createElement("a"); link.href = u; link.download = `linkedin-analytics-${first.toLowerCase()}-${p.id}.xlsx`; link.click();
      setTimeout(() => URL.revokeObjectURL(u), 10_000);
    } catch { setErr("Couldn't download it"); }
  };
  if (!a) return <div className="proofs"><h3 className="label" style={{ margin: 0 }}>LinkedIn analytics</h3><p className="hint">Not in yet. The numbers fill in from {first}'s weekly LinkedIn export once it covers the day this went up.</p></div>;
  const keys = [...METRIC_ORDER.filter((k) => k in a.metrics), ...Object.keys(a.metrics).filter((k) => !METRIC_ORDER.includes(k))];
  return (
    <div className="proofs">
      <h3 className="label" style={{ margin: 0 }}>LinkedIn analytics <small className="hint">uploaded {a.uploadedAt ? fmt(istDay(a.uploadedAt)) : ""}{p.analyticsFiles.length > 1 ? ` · ${p.analyticsFiles.length} uploads, latest shown` : ""}</small></h3>
      <dl className="kv">{keys.map((k) => <div key={k}><dt>{metricLabel(k)}</dt><dd>{num(a.metrics[k])}</dd></div>)}</dl>
      {Object.entries(a.demographics).filter(([, rows]) => rows.length).map(([k, rows]) => (
        <details className="more" key={k}><summary>Who saw it: {k}</summary>
          <ul className="thread">{rows.slice(0, 8).map((r) => <li key={r.value}>{r.value} <b>{(r.pct * 100).toFixed(1)}%</b></li>)}</ul></details>
      ))}
      {a.file ? <div className="actions"><button className="btn btn-line btn-sm" type="button" onClick={download}><Icon id="down" />Download the file</button>{err ? <span className="hint" role="alert">{err}</span> : null}</div> : null}
    </div>
  );
}

// ---------------------------------------------------------------- a fellow's weekly LinkedIn export (account-wide, 7 days)
async function downloadRef(ref: string, name: string): Promise<string | null> {
  try {
    const token = await getToken();
    const res = await fetch(`/api/fellowship-proof?ref=${encodeURIComponent(ref)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { const j = await res.json().catch(() => null); return (j && j.error) || "Couldn't download it"; }
    const u = URL.createObjectURL(await res.blob());
    const link = document.createElement("a"); link.href = u; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(u), 10_000);
    return null;
  } catch { return "Couldn't download it"; }
}
function WeeklyAnalytics({ weeks, f }: { weeks: AnalyticsWeek[] | null; f: Fellow }) {
  const [err, setErr] = useState("");
  if (!weeks) return <div className="storyb"><p className="m">Loading…</p></div>;
  if (!weeks.length) return <div className="storyb"><p className="m">No upload yet. {f.first}'s page asks for LinkedIn's weekly export every Sunday.</p></div>;
  const [w, ...older] = weeks;
  const span = (x: AnalyticsWeek) => (x.periodStart && x.periodEnd ? `${fmt(x.periodStart)} to ${fmt(x.periodEnd)}` : `uploaded ${fmt(istDay(x.uploadedAt))}`);
  const keys = [...["impressions", "membersReached", "newFollowers", "totalFollowers"].filter((k) => k in w.totals), ...Object.keys(w.totals).filter((k) => !["impressions", "membersReached", "newFollowers", "totalFollowers"].includes(k))];
  const title = (id: number | null) => (id != null ? f.posts.find((p) => p.id === id)?.title ?? null : null);
  return (
    <div className="proofs">
      <h3 className="label" style={{ margin: 0 }}>Week of {span(w)} <small className="hint">uploaded {fmt(istDay(w.uploadedAt))}</small></h3>
      {keys.length ? <dl className="kv">{keys.map((k) => <div key={k}><dt>{metricLabel(k)}</dt><dd>{num(w.totals[k])}</dd></div>)}</dl> : null}
      {w.posts.length ? <details className="more" open><summary>Posts in this export ({w.posts.length})</summary>
        <ul className="thread">{w.posts.map((p, i) => <li key={`${p.url}-${i}`}><b>{title(p.postId) ?? (p.postId != null ? `Post ${p.postId}` : "A post not from the fellowship")}</b>{p.publishedOn ? ` · ${fmt(p.publishedOn)}` : ""} · {p.impressions != null ? `${num(p.impressions)} impressions` : "no impressions"}{p.engagements != null ? ` · ${num(p.engagements)} engagements` : ""}</li>)}</ul></details> : null}
      {w.daily.length ? <details className="more"><summary>Day by day</summary>
        <ul className="thread">{w.daily.map((d) => <li key={String(d.date)}>{fmt(String(d.date))}: {Object.entries(d).filter(([k]) => k !== "date").map(([k, v]) => `${metricLabel(k)} ${num(Number(v))}`).join(" · ")}</li>)}</ul></details> : null}
      {Object.entries(w.demographics).filter(([, rows]) => rows.length).map(([k, rows]) => (
        <details className="more" key={k}><summary>Who saw it: {k}</summary>
          <ul className="thread">{rows.slice(0, 8).map((r) => <li key={r.value}>{r.value} <b>{(r.pct * 100).toFixed(1)}%</b></li>)}</ul></details>
      ))}
      <div className="actions"><button className="btn btn-line btn-sm" type="button" onClick={async () => setErr((await downloadRef(w.file, `linkedin-week-${f.first.toLowerCase()}-${w.periodEnd ?? w.id}.xlsx`)) ?? "")}><Icon id="down" />Download the file</button>{err ? <span className="hint" role="alert">{err}</span> : null}</div>
      {older.length ? <details className="more"><summary>Earlier weeks ({older.length})</summary>
        <ul className="thread">{older.map((x) => <li key={x.id}>{span(x)}: {x.totals.impressions != null ? `${num(x.totals.impressions)} impressions` : "no impressions total"}{x.totals.newFollowers != null ? ` · ${num(x.totals.newFollowers)} new followers` : ""}</li>)}</ul></details> : null}
    </div>
  );
}

// ---------------------------------------------------------------- review drawer: Claude's drafts for one fellow
function ReviewView({ f, D, act, setDrawer, draftId }: { f: Fellow; D: Desk; act: (b: Record<string, unknown>, done?: string) => Promise<Desk | null>; setDrawer: (d: DrawerState | null) => void; draftId?: number }) {
  const [confirmAll, setConfirmAll] = useState(false);
  const all = f.drafts.slice().sort((a, b) => a.due.localeCompare(b.due) || a.id - b.id);
  const shown = draftId ? all.filter((d) => d.id === draftId) : all;
  const ready = all.filter((d) => d.status === "review" && d.due >= D.today);
  return (
    <>
      <div className="sheet-head">
        <button className="back" type="button" onClick={() => setDrawer({ mode: "fellow", id: f.id })}><Icon id="left" />{f.name}</button><span className="crumb" />
        <CloseBtn onClick={() => setDrawer(null)} /></div>
      <div className="sheet-body">
        <div>
          <h2 id="sheet-title" style={{ margin: 0, font: "600 23px/1.2 var(--serif)" }}>{draftId && shown.length ? "Review this draft" : `Review ${f.first}'s drafts`}</h2>
          <p className="card-sub">Claude wrote these. Edit, approve, or send back with what to change. Approved posts go straight to {f.first}'s page.</p>
        </div>
        {!draftId && ready.length > 1 ? (confirmAll
          ? <div className="confirm" role="alert"><p><b>Approve all {ready.length}?</b> They go to {f.first}'s page now, on their due days.</p><div className="actions">
              <button className="btn btn-primary" type="button" onClick={async () => { setConfirmAll(false); const d = await act({ intent: "approve-all", id: f.id }); if (d) setDrawer({ mode: "fellow", id: f.id }); }}><Icon id="check" />Approve all {ready.length}</button>
              <button className="btn btn-quiet" type="button" onClick={() => setConfirmAll(false)}>Cancel</button></div></div>
          : <div><button className="btn btn-outline" type="button" onClick={() => setConfirmAll(true)}><Icon id="check" />Approve all {ready.length}</button></div>) : null}
        {shown.length ? <div>{shown.map((d) => <DraftCard key={d.id} d={d} f={f} today={D.today} act={act} />)}</div>
          : <div className="empty"><b>Nothing left to review</b>{draftId ? "That draft was approved or removed." : `${f.first} has no drafts waiting.`}</div>}
        {draftId && all.length > 1 ? <button className="btn btn-quiet" type="button" onClick={() => setDrawer({ mode: "review", id: f.id })}>See all {all.length} of {f.first}'s drafts</button> : null}
      </div>
    </>
  );
}

function DraftCard({ d, f, today, act }: { d: Draft; f: Fellow; today: string; act: (b: Record<string, unknown>, done?: string) => Promise<Desk | null> }) {
  const [title, setTitle] = useState(d.title);
  const [body, setBody] = useState(d.body);
  const [kind, setKind] = useState<Kind>(d.kind);
  const [due, setDue] = useState(d.due);
  const [photoIdea, setPhotoIdea] = useState(d.photoIdea);
  const [busy, setBusy] = useState(false);
  const [back, setBack] = useState<string | null>(null);
  const [confirmRm, setConfirmRm] = useState(false);
  // Take the server's newer copy (Claude revised it) unless the team is mid-edit.
  const seen = useRef(d.updatedAt);
  const dirty = title.trim() !== d.title || body.trim() !== d.body.trim() || kind !== d.kind || due !== d.due || photoIdea.trim() !== d.photoIdea;
  useEffect(() => {
    if (d.updatedAt !== seen.current) { seen.current = d.updatedAt; if (!dirty) { setTitle(d.title); setBody(d.body); setKind(d.kind); setDue(d.due); setPhotoIdea(d.photoIdea); } }
  }, [d.updatedAt]); // eslint-disable-line react-hooks/exhaustive-deps
  const edits = { title: title.trim(), body: body.trim(), kind, due, photoIdea: photoIdea.trim() };
  const run = async (b: Record<string, unknown>, done: string) => { setBusy(true); const r = await act({ id: d.id, ...b }, done); setBusy(false); return r; };
  const byClaude = d.versions.filter((v) => v.by === "claude").length;
  const lastV = d.versions[d.versions.length - 1];
  const ver = lastV?.by === "team" ? "Edited by the team" : byClaude > 1 ? `Revised by Claude (draft ${byClaude})` : "Claude's first draft";
  const open = d.feedback.filter((x) => !x.resolvedAt);
  return (
    <article className={`dcard${dirty ? " is-dirty" : ""}${busy ? " is-busy" : ""}`} aria-label={title}>
      <div className="dtop">
        <select className="select" aria-label="Post type" value={kind} onChange={(e) => setKind(e.target.value as Kind)}><option value="personal">Their story</option><option value="studojo">Studojo</option></select>
        <input className="input" type="date" aria-label="Due date" value={due} min={today} onChange={(e) => setDue(e.target.value)} />
        <span className="ver">{ver}</span>
      </div>
      {d.status === "changes" ? <p className="note note-warn"><Icon id="alert" /><span><b>Waiting for Claude.</b> Sent back {open.length ? fmt(istDay(open[open.length - 1].t)) : ""}. It stays off {f.first}'s page until it's approved.</span></p> : null}
      <input className="input" aria-label="Title" value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} style={{ fontWeight: 650 }} />
      <textarea className="input dbody" aria-label="Post text" value={body} onChange={(e) => setBody(e.target.value)} />
      <div className="text-meta"><span className={`cnt${body.trim().length > POST_MAX ? " over" : ""}`}>{num(body.trim().length)} / 3,000 characters</span>{dirty ? <span className="dirty">Unsaved edits</span> : null}</div>
      {d.angle ? <p className="why-line"><b>Why this post: </b>{d.angle}</p> : null}
      <div className="field"><label htmlFor={`dpi-${d.id}`}>Photo idea, shown to {f.first} with the post</label>
        <input className="input" id={`dpi-${d.id}`} value={photoIdea} maxLength={500} onChange={(e) => setPhotoIdea(e.target.value)} placeholder="Which of their own photos to post with it" />
        {!photoIdea.trim() ? <p className="hint">No photo idea yet. {f.first} can still add any photo, but can't post without one.</p> : null}</div>
      {d.feedback.length ? <ul className="thread" aria-label="Feedback so far">{d.feedback.map((x) => <li key={x.id}><b>{x.by ? x.by.split("@")[0] : "Team"}, {fmt(istDay(x.t))}:</b> {x.text}{x.resolvedAt ? <><br /><b>Claude, {fmt(istDay(x.resolvedAt))}:</b> {x.reply || "Revised"}</> : null}</li>)}</ul> : null}
      {back !== null ? (
        <div className="backbox">
          <label className="label" htmlFor={`fb-${d.id}`}>Tell Claude what to change. Type it, or tap Speak and say it.</label>
          <textarea className="input" id={`fb-${d.id}`} placeholder="For example: open with the internship, cut the last paragraph, sound less formal." value={back} onChange={(e) => setBack(e.target.value)} autoFocus rows={4} />
          <div className="actions">
            <MicButton onText={(t) => setBack((v) => `${(v ?? "").trimEnd()}${v && v.trim() ? " " : ""}${t}`)} />
            <button className="btn btn-primary btn-sm" type="button" disabled={back.trim().length < 3} onClick={async () => { const r = await run({ intent: "send-back", ...edits, feedback: back.trim() }, "Sent back. Claude revises it next time it checks for feedback."); if (r) setBack(null); }}><Icon id="chat" />Send back</button>
            <button className="btn btn-quiet btn-sm" type="button" onClick={() => setBack(null)}>Cancel</button></div>
        </div>
      ) : null}
      <div className="actions">
        <button className="btn btn-primary btn-sm" type="button" onClick={() => run({ intent: "approve", ...edits }, `Approved. It's on ${f.first}'s page for ${dow(due)} ${fmt(due)}.`)}><Icon id="check" />Approve</button>
        <button className="btn btn-line btn-sm" type="button" disabled={!dirty} onClick={() => run({ intent: "save", ...edits }, "Edits saved. It's still waiting for approval.")}>Save edits</button>
        {back === null ? <button className="btn btn-line btn-sm" type="button" onClick={() => setBack("")}><Icon id="mic" />Give feedback</button> : null}
        {confirmRm
          ? <span className="inline-confirm">Remove this draft?<button className="btn btn-primary btn-sm" type="button" onClick={() => run({ intent: "remove" }, "Draft removed.")}><Icon id="trash" />Remove</button><button className="btn btn-quiet btn-sm" type="button" onClick={() => setConfirmRm(false)}>Keep</button></span>
          : <button className="btn btn-quiet btn-sm" type="button" onClick={() => setConfirmRm(true)}><Icon id="trash" />Remove</button>}
      </div>
    </article>
  );
}

// ---------------------------------------------------------------- post editor (team-written posts and approved ones)
function PostEditor({ D, state, byId, act, upload, creatorApi, setDrawer, postDays }: {
  D: Desk; state: Extract<DrawerState, { mode: "post" }>; byId: (id: number) => Fellow | null; act: (b: Record<string, unknown>, done?: string) => Promise<Desk | null>;
  upload: (postId: number, file: File) => Promise<boolean>;
  creatorApi: (p: string, b: Record<string, unknown>, d?: string) => Promise<unknown>; setDrawer: (d: DrawerState | null) => void; postDays: number[];
}) {
  const [fid, setFid] = useState<number | null>(state.id);
  const f = fid ? byId(fid) : null;
  const existing = f && state.postId ? f.posts.find((p) => p.id === state.postId) ?? null : null;
  const today = D.today;
  const taken = new Set(f ? [...f.posts, ...f.drafts].map((x) => x.due) : []);
  const isPostDay = (s: string) => postDays.includes((day(s).getUTCDay() + 4) % 7);
  const freeDays = (n: number) => { const out: string[] = []; for (let k = 0; out.length < n && k < 60; k++) { const s = addDays(today, k); if (isPostDay(s) && !taken.has(s)) out.push(s); } return out; };
  const [kind, setKind] = useState<Kind>(existing?.kind ?? "personal");
  const [date, setDate] = useState<string>(existing?.due ?? state.date ?? "");
  const [title, setTitle] = useState(existing?.title ?? "");
  const [text, setText] = useState(existing?.body ?? state.text ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"delete" | "block" | null>(null);
  const [blockWhy, setBlockWhy] = useState("");
  const [url, setUrl] = useState(existing?.url ?? "");
  const [nums, setNums] = useState({ impressions: existing?.impressions ?? "", reactions: existing?.reactions ?? "", comments: existing?.comments ?? "" } as Record<string, string | number>);
  useEffect(() => { if (f && !date && !existing) setDate(freeDays(1)[0] ?? ""); }, [fid]); // eslint-disable-line react-hooks/exhaustive-deps
  const backTo = () => (state.from === "fellow" && f ? setDrawer({ mode: "fellow", id: f.id }) : setDrawer(null));
  const head = (
    <div className="sheet-head">
      {state.from === "fellow" && f ? <button className="back" type="button" onClick={backTo}><Icon id="left" />{f.name}</button> : <span className="crumb">Post editor</span>}
      <span className="crumb" /><CloseBtn onClick={() => setDrawer(null)} /></div>
  );

  // A post that's already up: the fellow's record. Read it, record numbers, see how it did.
  if (existing && existing.status === "posted") {
    const r = existing.review && existing.review.claudeBody != null ? existing.review : null;
    return (
      <>{head}<div className="sheet-body">
        <div><h2 id="sheet-title" style={{ margin: 0, font: "600 23px/1.2 var(--serif)" }}>{existing.title}</h2><p className="card-sub">{f!.name} · {existing.kind === "studojo" ? "Studojo" : "Their story"} · due {dow(existing.due)} {fmt(existing.due)}{existing.postedAt ? ` · posted ${fmt(istDay(existing.postedAt))}` : ""}</p></div>
        <div className="actions">{safeUrl(existing.url) ? <a className="btn btn-line btn-sm" href={safeUrl(existing.url)!} target="_blank" rel="noopener noreferrer"><Icon id="link" />LinkedIn post</a> : null}
          <VerdictPill v={existing.verdict} /></div>
        {existing.insight ? <p className="note note-ok"><Icon id="chart" /><span><b>Claude: </b>{existing.insight}</span></p> : existing.impressions != null ? <p className="hint">Claude hasn't written its note on this one yet.</p> : null}
        <AnalyticsBox p={existing} first={f!.first} />
        {proofRefs(existing.screenshot).length ? <ProofShots value={existing.screenshot} /> : null}
        <PostPhotos p={existing} first={f!.first} act={act} upload={null} />
        <p className="post-text">{existing.body}</p>
        {r && r.editedByTeam ? <details className="more"><summary>What Claude wrote before the team's edits</summary><p className="post-text" style={{ marginTop: 8 }}>{r.claudeBody}</p></details> : null}
        <form className="compose" onSubmit={async (e) => { e.preventDefault(); setBusy(true); await act({ intent: "record", id: existing.id, url, ...nums }, "Numbers saved"); setBusy(false); }}>
          <h3 className="label" style={{ margin: 0 }}>Numbers</h3>
          <div className="numrow">{(["impressions", "reactions", "comments"] as const).map((k) => <div className="field" key={k}><label htmlFor={`n-${k}`}>{k[0].toUpperCase() + k.slice(1)}</label><input className="input" id={`n-${k}`} inputMode="numeric" value={nums[k] ?? ""} onChange={(e) => setNums({ ...nums, [k]: e.target.value.replace(/[^\d]/g, "") })} /></div>)}</div>
          <div className="field"><label htmlFor="n-url">LinkedIn post link</label><input className="input" id="n-url" value={url ?? ""} onChange={(e) => setUrl(e.target.value)} placeholder="https://www.linkedin.com/posts/…" /></div>
          <div className="stack-actions"><button className="btn btn-primary" type="submit" disabled={busy}><Icon id="check" />Save numbers</button></div>
        </form>
      </div></>
    );
  }

  const save = async () => {
    setErr(null);
    if (!f) return setErr("Choose who this post is for.");
    if (!date) return setErr("Pick a date.");
    if (title.trim().length < 2) return setErr("Give the post a short title.");
    if (text.trim().length < 20) return setErr("Write the post text.");
    setBusy(true);
    const body = existing ? { intent: "update-post", postId: existing.id, title: title.trim(), body: text.trim(), kind, dueDate: date } : { intent: "add-post", title: title.trim(), body: text.trim(), kind, dueDate: date };
    const ok = await creatorApi(`/api/ugc-creators/${f.id}`, body, `${existing ? "Saved" : "Added"}: ${dow(date)} ${fmt(date)} for ${f.first}. It's on their page now.`);
    setBusy(false);
    if (ok) backTo();
  };
  const sugg = f ? freeDays(3) : [];
  return (
    <>{head}<div className="sheet-body">
      {existing?.fellowVersion && f ? <VersionBox key={`${existing.id}-${existing.fellowVersion.at}`} p={existing} first={f.first} act={act} /> : null}
      {existing && !existing.fellowVersion && existing.versionReply && existing.status === "ready" ? <p className="note note-warn"><Icon id="chat" /><span>You kept the original instead of {f?.first}'s version. They see: "{existing.versionReply}"</span></p> : null}
      <form className="compose" noValidate onSubmit={(e) => { e.preventDefault(); save(); }}>
        {existing?.status === "blocked" ? (
          <div className="note note-bad" role="alert"><Icon id="alert" /><span><b>Blocked{existing.review?.blocked ? ` by ${existing.review.blocked.by.split("@")[0]} on ${fmt(istDay(existing.review.blocked.at))}` : ""}.</b> {existing.review?.blocked?.reason ? `What needs doing: ${existing.review.blocked.reason}. ` : ""}{f?.first} sees an "on hold" warning instead of this post. Fix it below and save, then release it.</span>
            <button className="btn btn-primary btn-sm" type="button" disabled={busy} onClick={async () => { setBusy(true); const r = await act({ intent: "release", id: existing.id }, `Released. It's back on ${f?.first}'s page.`); setBusy(false); if (r) backTo(); }}><Icon id="check" />Release to {f?.first}</button></div>
        ) : null}
        <div><h2 id="sheet-title">{existing ? "Edit post" : "New post"}</h2><p className="who-line">{f ? `For ${f.name}${existing ? ` · ${dow(existing.due)} ${fmt(existing.due)}` : ""}. A post written here goes straight to their page.` : "Pick who it's for, then write it."}</p></div>
        {!state.id ? <div className="field"><label htmlFor="pe-who">Fellow</label><select className="select" id="pe-who" value={fid ?? ""} onChange={(e) => { setFid(e.target.value ? Number(e.target.value) : null); setDate(""); }}>
          <option value="">Choose a fellow</option>{D.fellows.filter((x) => x.status !== "removed").sort((a, b) => a.name.localeCompare(b.name)).map((x) => <option key={x.id} value={x.id}>{x.name}{x.status === "paused" ? " (paused)" : ""}</option>)}</select></div> : null}
        <fieldset className="field" style={{ border: 0, padding: 0, margin: 0 }}><legend className="label" style={{ marginBottom: 6 }}>Type</legend>
          <div className="typeseg">
            <label><input type="radio" name="pe-kind" value="personal" checked={kind === "personal"} onChange={() => setKind("personal")} />Their story</label>
            <label><input type="radio" name="pe-kind" value="studojo" checked={kind === "studojo"} onChange={() => setKind("studojo")} /><span className="mk" aria-hidden="true">S</span>Studojo post</label>
          </div></fieldset>
        <div className="field"><label htmlFor="pe-date">Post date</label>
          <div className="date-row"><input className="input" id="pe-date" type="date" min={today} value={date} onChange={(e) => setDate(e.target.value)} />
            {sugg.length ? <div className="sugg"><span className="lbl">Free:</span>{sugg.map((s) => <button key={s} type="button" aria-pressed={date === s} onClick={() => setDate(s)}>{dow(s)} {fmt(s)}</button>)}</div> : null}</div>
          {date && !isPostDay(date) ? <p className="note note-warn"><Icon id="alert" /><span>Fellows post on {D.rules.postingDays.join(", ")}.{sugg[0] ? ` ${dow(sugg[0])} ${fmt(sugg[0])} is free.` : ""}</span></p> : null}
          {date && taken.has(date) && date !== existing?.due ? <p className="note note-warn"><Icon id="alert" /><span>{f?.first} already has a post on {dow(date)} {fmt(date)}.</span></p> : null}
        </div>
        <div className="field"><label htmlFor="pe-title">Title</label><input className="input" id="pe-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A short name the fellow will see" autoComplete="off" /></div>
        <div className="field"><label htmlFor="pe-text">Post text</label>
          <textarea className="input" id="pe-text" rows={10} maxLength={POST_MAX} value={text} onChange={(e) => setText(e.target.value)} placeholder="Write it the way it will appear on LinkedIn" />
          <div className="text-meta">
            <span className="cnt">{num(text.length)} / 3,000</span></div>
        </div>
        {err ? <div className="note note-bad" role="alert"><Icon id="alert" /><span>{err}</span></div> : null}
        <div className="stack-actions">
          <button className="btn btn-primary" type="submit" disabled={busy}><Icon id="check" />{existing ? "Save post" : "Add post"}</button>
          <button className="btn btn-quiet" type="button" onClick={backTo}>Cancel</button>
        </div>
      </form>
      {existing ? <PostPhotos p={existing} first={f!.first} act={act} upload={upload} /> : null}
      {existing ? (
        <section className="compose" aria-label="More">
          <div className="sec-h"><h3>More</h3><span>{existing.copiedAt ? `${f!.first} copied it ${fmt(istDay(existing.copiedAt))}` : "Not copied yet"}</span></div>
          <div className="actions">
            {existing.status !== "blocked" ? <button className="btn btn-line btn-sm" type="button" onClick={async () => { await act({ intent: "record", id: existing.id, posted: true, url }, `Marked as posted for ${f!.first}.`); }}><Icon id="check" />Mark as posted</button> : null}
            {existing.status !== "blocked" && confirm !== "block" ? <button className="btn btn-line btn-sm" type="button" onClick={() => { setBlockWhy(""); setConfirm("block"); }}><Icon id="pause" />Block</button> : null}
            {confirm === "delete" ? <span className="inline-confirm">Delete this post?<button className="btn btn-primary btn-sm" type="button" onClick={async () => { const r = await creatorApi(`/api/ugc-creators/${f!.id}`, { intent: "delete-post", postId: existing.id }, "Post deleted."); if (r) backTo(); }}><Icon id="trash" />Delete</button><button className="btn btn-quiet btn-sm" type="button" onClick={() => setConfirm(null)}>Keep</button></span>
              : <button className="btn btn-quiet btn-sm" type="button" onClick={() => setConfirm("delete")}><Icon id="trash" />Delete</button>}
          </div>
          {confirm === "block" ? (
            <div className="backbox">
              <label className="label" htmlFor="pe-block">What needs fixing?</label>
              <textarea className="input" id="pe-block" rows={2} autoFocus value={blockWhy} onChange={(e) => setBlockWhy(e.target.value)} placeholder="For example: wrong company name in line 3; check the date with them." />
              <p className="hint">{existing.copiedAt ? `${f!.first} already copied it. ` : ""}{f!.first} will see an "on hold" warning instead of the post until you release it.</p>
              <div className="actions">
                <button className="btn btn-primary btn-sm" type="button" disabled={blockWhy.trim().length < 3} onClick={async () => { const r = await act({ intent: "block", id: existing.id, reason: blockWhy.trim() }, `Blocked. ${f!.first} sees an "on hold" warning until you release it.`); if (r) setConfirm(null); }}><Icon id="pause" />Block it</button>
                <button className="btn btn-quiet btn-sm" type="button" onClick={() => setConfirm(null)}>Cancel</button></div>
            </div>
          ) : null}
          {existing.review && existing.review.claudeBody != null ? <p className="hint">Written by Claude{existing.review.editedByTeam ? ", edited by the team," : ""} and approved by {existing.review.approvedBy?.split("@")[0] ?? "the team"} on {fmt(istDay(existing.review.approvedAt))}.</p> : null}
        </section>
      ) : null}
    </div></>
  );
}

// ---------------------------------------------------------------- a fellow's own version of an approved post
// They rewrote it on their page; it stays locked there until the team approves their version (edited here if it
// needs it), which becomes the post, or keeps the original and tells them why.
function VersionBox({ p, first, act }: { p: Post; first: string; act: (b: Record<string, unknown>, done?: string) => Promise<Desk | null> }) {
  const [text, setText] = useState(p.fellowVersion!.text);
  const [keep, setKeep] = useState(false);
  const [reply, setReply] = useState("");
  const [busy, setBusy] = useState(false);
  const run = async (b: Record<string, unknown>, done: string) => { setBusy(true); await act(b, done); setBusy(false); };
  return (
    <section className="compose" aria-label={`${first}'s own version`}>
      <div className="sec-h"><h3>{first}'s own version</h3><span>sent {fmt(istDay(p.fellowVersion!.at))}</span></div>
      <p className="note note-warn"><Icon id="alert" /><span><b>{first} rewrote this post in their own words</b> and can't post it until you decide. Edit their version if it needs it, then approve it, or keep the original and tell them why.</span></p>
      <div className="field"><label htmlFor="fv-text">Their version</label>
        <textarea className="input" id="fv-text" rows={12} maxLength={POST_MAX} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="text-meta"><span className="cnt">{num(text.length)} / 3,000</span>{text !== p.fellowVersion!.text ? <button className="btn-link" type="button" onClick={() => setText(p.fellowVersion!.text)}>Undo my edits</button> : null}</div></div>
      <details className="more"><summary>The post as it is now</summary><p className="post-text" style={{ marginTop: 8 }}>{p.body}</p></details>
      {!keep ? (
        <div className="actions">
          <button className="btn btn-primary btn-sm" type="button" disabled={busy || text.trim().length < 20} onClick={() => run({ intent: "version-approve", id: p.id, text: text.trim() }, `Approved. ${first} can post their version now.`)}><Icon id="check" />Approve {text === p.fellowVersion!.text ? "their version" : "with my edits"}</button>
          <button className="btn btn-line btn-sm" type="button" onClick={() => setKeep(true)}>Keep the original</button>
        </div>
      ) : (
        <div className="backbox">
          <label className="label" htmlFor="fv-reply">Tell {first} why (their page shows this)</label>
          <textarea className="input" id="fv-reply" rows={3} autoFocus value={reply} onChange={(e) => setReply(e.target.value)} placeholder="For example: the opening line is what makes it work on LinkedIn, so we kept it. Add your own line at the top instead." />
          <div className="actions">
            <MicButton onText={(t) => setReply((v) => `${v.trimEnd()}${v.trim() ? " " : ""}${t}`)} />
            <button className="btn btn-primary btn-sm" type="button" disabled={busy || reply.trim().length < 3} onClick={() => run({ intent: "version-keep", id: p.id, reply: reply.trim() }, `Kept the original. ${first} sees your note and can post it.`)}>Keep the original</button>
            <button className="btn btn-quiet btn-sm" type="button" onClick={() => setKeep(false)}>Cancel</button></div>
        </div>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- add a fellow by hand
function AddFellow({ D, creatorApi, setDrawer, toast }: { D: Desk; creatorApi: (p: string, b: Record<string, unknown>, d?: string) => Promise<unknown>; setDrawer: (d: DrawerState | null) => void; toast: (m: string) => void }) {
  const [v, setV] = useState({ fullName: "", college: "", field: "", cohort: [...new Set(D.fellows.map((f) => f.cohort).filter(Boolean))].sort().pop() ?? "", linkedinUrl: "", whatsapp: "", email: "" });
  const [done, setDone] = useState<{ name: string; link: string | null; whatsapp: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  if (done) {
    const wa = done.link ? toWaWeb(welcomeWhatsapp(done.name, done.whatsapp, done.link)) : null;
    return (<><div className="sheet-head"><span className="crumb">New fellow</span><CloseBtn onClick={() => setDrawer(null)} /></div>
      <div className="sheet-body"><div><h2 id="sheet-title" style={{ margin: 0, font: "600 23px/1.2 var(--serif)" }}>{done.name} is in</h2><p className="card-sub">Send them their private page. No login needed.</p></div>
        {done.link ? <div className="linkbox"><input className="input" readOnly value={done.link} onFocus={(e) => e.target.select()} aria-label="Their page" /><button className="btn btn-line btn-sm" type="button" onClick={async () => toast((await copyText(done.link!)) ? "Link copied." : "Couldn't copy.")}><Icon id="copy" />Copy</button></div> : null}
        <div className="actions">{wa ? <a className="btn btn-primary" href={wa} target={WA_TAB} rel="noopener noreferrer"><Icon id="chat" />Send welcome in WhatsApp Web</a> : null}
          <button className="btn btn-line" type="button" onClick={() => { setDone(null); setV({ ...v, fullName: "", college: "", field: "", linkedinUrl: "", whatsapp: "", email: "" }); }}><Icon id="plus" />Add another</button></div></div></>);
  }
  return (<><div className="sheet-head"><span className="crumb">New fellow</span><CloseBtn onClick={() => setDrawer(null)} /></div>
    <div className="sheet-body">
      <form className="compose" onSubmit={async (e) => {
        e.preventDefault();
        if (v.fullName.trim().length < 2) { toast("Add their name first."); return; }
        setBusy(true);
        const r = (await creatorApi("/api/ugc-creators", { intent: "create", ...v }, `${v.fullName.trim()} is added.`)) as { creator?: { link: string | null } } | null;
        setBusy(false);
        if (r) setDone({ name: v.fullName.trim(), link: r.creator?.link ?? null, whatsapp: v.whatsapp });
      }}>
        <div><h2 id="sheet-title">Add a fellow</h2><p className="who-line">For someone who didn't apply through the form. Applicants become fellows from the Applicants page.</p></div>
        {([["fullName", "Name"], ["college", "College"], ["field", "Field"], ["cohort", "Cohort"], ["linkedinUrl", "LinkedIn profile"], ["whatsapp", "WhatsApp number"], ["email", "Email"]] as const).map(([k, label]) => (
          <div className="field" key={k}><label htmlFor={`af-${k}`}>{label}</label><input className="input" id={`af-${k}`} value={v[k]} onChange={set(k)} autoComplete="off" required={k === "fullName"} /></div>
        ))}
        <div className="stack-actions"><button className="btn btn-primary" type="submit" disabled={busy}><Icon id="plus" />Add fellow</button><button className="btn btn-quiet" type="button" onClick={() => setDrawer(null)}>Cancel</button></div>
      </form>
    </div></>);
}

// ---------------------------------------------------------------- WhatsApp nudge (posts this week, or numbers for one post)
function NudgeDialog({ f, post, ask, close, act, toast, today }: { f: Fellow; post?: Post; ask?: boolean; close: () => void; act: (b: Record<string, unknown>, done?: string) => Promise<Desk | null>; toast: (m: string) => void; today: string }) {
  const left = f.standing.thisWeek.due - f.standing.thisWeek.posted;
  const link = f.link ?? "";
  const initial = ask
    ? `Hi ${f.first}, to write posts that really sound like you, we'd love to hear more about your life: an experience that shaped you, a setback, something you're proud of, or why you chose your course. There are a few questions waiting for you on your page, and you can write as much or as little as you like: ${link}`
    : post
    ? `Hi ${f.first}, could you add the numbers for your post "${post.title}"${post.postedAt ? ` from ${fmt(istDay(post.postedAt))}` : ""}? Impressions, reactions and comments, on your page: ${link}`
    : `Hi ${f.first}, a quick nudge: ${left === 1 ? "1 post is" : `${left} posts are`} waiting for you this week. They're ready to copy on your page: ${link}`;
  const [text, setText] = useState(initial);
  const digits = waDigits(f.whatsapp);
  void today;
  return (
    <div className="modal-wrap">
      <div className="scrim" onClick={close} />
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="ng-title">
        <button className="icon-btn x" type="button" aria-label="Close" onClick={close}><Icon id="x" /></button>
        <h2 id="ng-title">{ask ? `Ask ${f.first} for stories` : post ? `Ask ${f.first} for numbers` : `Nudge ${f.first} on WhatsApp`}</h2>
        <p className="to"><span className={`avatar sm ${avClass(f.name)}`} aria-hidden="true">{initials(f.name)}</span><span>To <b>{f.name}</b> · {f.whatsapp || "no WhatsApp number saved"}</span></p>
        <div className="chat"><div className="bubble"><label className="sr" htmlFor="ng-text">Message</label><textarea id="ng-text" rows={4} value={text} onChange={(e) => setText(e.target.value)} autoFocus /><span className="tm">Now</span></div></div>
        <p className="hint">You can edit the message.{post || ask ? "" : ` Then mark ${f.first} as nudged so the team knows.`}</p>
        <div className="actions">
          {digits ? <a className="btn btn-primary" href={waWeb(digits, text)} target={WA_TAB} rel="noopener noreferrer"><Icon id="chat" />Open in WhatsApp Web</a> : null}
          <button className={`btn ${digits ? "btn-line" : "btn-primary"}`} type="button" onClick={async () => toast((await copyText(text)) ? "Message copied. Paste it into WhatsApp." : "Select the message and copy it.")}><Icon id="copy" />Copy message</button>
          {!post && !ask ? <button className="btn btn-outline" type="button" onClick={async () => { const r = await act({ intent: "nudged", id: f.id }, `${f.first} marked as nudged today.`); if (r) close(); }}><Icon id="check" />Mark as nudged</button> : null}
        </div>
      </div>
    </div>
  );
}
