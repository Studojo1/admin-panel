import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { toast } from "sonner";
import type { Route } from "./+types/career-coach";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Career Coach — Studojo Admin" }];
}

// Read the career-coach backend that matches this admin panel's environment.
// admin.studojo.pro -> studojo.pro data (staging); everything else -> studojo.com
// (production, where real students use the coach). Falls back to .com on the server.
const CC_API = (() => {
  if (typeof window !== "undefined" && window.location.hostname.includes(".pro")) {
    return "https://studojo.pro/api/v1/cc";
  }
  return "https://studojo.com/api/v1/cc";
})();

// Main Studojo platform origin (for cross-platform user activity: sign-in
// method, login history, tool usage). The admin panel calls it directly from
// the browser using the shared .studojo.com / .studojo.pro session cookie, so
// no server-to-server secret is needed.
const MAIN_API = (() => {
  if (typeof window !== "undefined" && window.location.hostname.includes(".pro")) {
    return "https://studojo.pro";
  }
  return "https://studojo.com";
})();

// ── Types ──────────────────────────────────────────────────────────────────

interface OverviewData {
  students: { total: number; active_last_hour: number; active_today: number; active_this_week: number; active_this_month: number };
  conversations: { total: number; avg_messages_per_session: number };
  dna: { total_generated: number; accuracy_rate: number; inaccuracy_count: number };
  tools: { total_clicks: number };
  active_per_hour?: { hour: string; label: string; active_users: number }[];
  generated_at: string;
}

interface FunnelStage {
  stage: string;
  count: number;
  conversion_rate: number;
  step_conversion_rate?: number;
  dropped_from_prev?: number;
  note?: string;
}

interface FunnelData {
  funnel_stages: FunnelStage[];
  overall_completion_rate: number;
  biggest_drop_off: string;
  biggest_drop_off_detail?: string;
  side_actions?: {
    uploaded_resume: number;
    logged_check_in: number;
    clicked_resume_maker: number;
    clicked_outreach_dojo: number;
    clicked_any_tool: number;
    explored_new_path: number;
  };
  profiling_depth?: {
    buckets: Record<string, number>;
    avg_user_messages: number;
  };
}

interface DropoffStage {
  stage: string;
  count: number;
  avg_messages_before_dropoff: number;
}

interface DropoffData {
  dropoff_by_stage: DropoffStage[];
}

interface StudentRow {
  id: string;
  name: string | null;
  email: string | null;
  archetype: string | null;
  session_count: number;
  last_seen: string | null;
  created_at: string | null;
  has_resume: boolean;
  resume_filename: string | null;
}

interface ScoreImprover {
  student_id: string;
  from_score: number;
  to_score: number;
  improvement: number;
}

interface ScoreData {
  students_who_improved: number;
  avg_readiness_improvement: number;
  total_actions_completed: number;
  top_improvers: ScoreImprover[];
}

interface PathData {
  top_target_roles: { role: string; count: number }[];
  top_target_industries: { industry: string; count: number }[];
}

interface QuestionItem {
  question?: string;
  content?: string;
  text?: string;
  state?: string;
  created_at?: string;
}

interface QuestionData {
  recent_questions?: QuestionItem[];
  questions?: QuestionItem[];
}

interface StudentDetail {
  primary_path?: {
    target_role?: string;
    target_industry?: string;
    readiness_score?: number;
    reply_probability?: number;
    one_line_summary?: string;
    skills_you_have?: string[];
    skills_to_build?: (string | { skill: string })[];
  };
  student?: {
    name?: string;
    email?: string;
    session_count?: number;
  };
}

interface StudentActivity {
  main_platform_linked?: boolean;
  coach?: {
    name?: string;
    email?: string;
    first_seen?: string;
    last_seen?: string;
    session_count?: number;
    events?: { type: string; data?: Record<string, unknown>; at?: string }[];
    states_reached?: { state: string; first_at?: string }[];
  };
  main_platform?: {
    found?: boolean;
    user?: {
      name?: string;
      email?: string;
      created_at?: string;
      last_login_method?: string | null;
      email_verified?: boolean;
      role?: string | null;
    };
    signup_methods?: { method: string; provider_id: string; linked_at?: string }[];
    logins?: { at?: string; ip?: string; user_agent?: string }[];
    tools?: {
      resume_maker?: { used: boolean; count: number; items?: { name?: string; created_at?: string }[] };
      internship_applications?: { used: boolean; count: number; items?: { status?: string; created_at?: string }[] };
      career_applications?: { used: boolean; count: number; items?: { status?: string; payment_status?: string; amount?: number; created_at?: string }[] };
    };
    profile?: { referral_source?: string | null; college?: string; year_of_study?: string; course?: string } | null;
  };
}

type Tab = "overview" | "funnel" | "students" | "scores" | "paths" | "questions";

// ── Helpers ────────────────────────────────────────────────────────────────

function esc(t: unknown): string {
  return String(t ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "2-digit" });
}

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN");
}

function StatCard({
  num,
  label,
  sub,
  color,
}: {
  num: string | number;
  label: string;
  sub?: string;
  color: "purple" | "blue" | "green" | "amber" | "red" | "teal";
}) {
  const colors = {
    purple: { bg: "bg-violet-50", border: "border-violet-200", num: "text-violet-600" },
    blue: { bg: "bg-blue-50", border: "border-blue-200", num: "text-blue-600" },
    green: { bg: "bg-emerald-50", border: "border-emerald-200", num: "text-emerald-600" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", num: "text-amber-600" },
    red: { bg: "bg-red-50", border: "border-red-200", num: "text-red-500" },
    teal: { bg: "bg-teal-50", border: "border-teal-200", num: "text-teal-600" },
  };
  const c = colors[color];
  return (
    <div
      className={`${c.bg} rounded-2xl border-2 ${c.border} p-5 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]`}
    >
      <div className={`font-['Clash_Display'] text-4xl font-black ${c.num}`}>{num}</div>
      <div className="mt-1 text-xs font-semibold uppercase tracking-widest text-neutral-500">{label}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-400">{sub}</div>}
    </div>
  );
}

const FUNNEL_COLORS = ["#8B5CF6", "#A855F7", "#EC4899", "#EF4444", "#F59E0B", "#10B981"];
const STATE_PILL: Record<string, string> = {
  GREETING: "bg-blue-100 text-blue-700",
  PROFILING: "bg-amber-100 text-amber-800",
  DNA_REVIEW: "bg-violet-100 text-violet-700",
  CAREER_ANALYSIS: "bg-violet-100 text-violet-700",
  ROADMAP: "bg-emerald-100 text-emerald-800",
  ONGOING_SUPPORT: "bg-emerald-100 text-emerald-800",
};

// ── Main Component ─────────────────────────────────────────────────────────

export default function CareerCoachAdmin(_: Route.ComponentProps) {
  const { isAuthorized, isPending } = useAdminGuard();

  const [keyError, setKeyError] = useState(false);
  const [authenticated, setAuthenticated] = useState(false);

  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(false);

  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [funnel, setFunnel] = useState<FunnelData | null>(null);
  const [dropoffs, setDropoffs] = useState<DropoffData | null>(null);
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [scores, setScores] = useState<ScoreData | null>(null);
  const [paths, setPaths] = useState<PathData | null>(null);
  const [questions, setQuestions] = useState<QuestionData | null>(null);

  const [selectedStudent, setSelectedStudent] = useState<string | null>(null);
  const [studentDetail, setStudentDetail] = useState<StudentDetail | null>(null);
  const [studentActivity, setStudentActivity] = useState<StudentActivity | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [adminNotes, setAdminNotes] = useState<Record<string, string>>({});

  // No key needed — the admin panel login is the only gate. Load on mount once
  // BetterAuth has authorized the admin.
  useEffect(() => {
    if (isAuthorized) {
      setAuthenticated(true);
      loadAll();
    }
  }, [isAuthorized]);

  const ccHeaders = useCallback(
    () => ({ "Content-Type": "application/json" }),
    [],
  );

  async function loadAll(_key?: string) {
    setLoading(true);
    try {
      const headers = { "Content-Type": "application/json" };
      const [ov, fu, dr, st, sc, pa, qu] = await Promise.all([
        fetch(`${CC_API}/admin/overview`, { headers }).then((r) => r.json()),
        fetch(`${CC_API}/admin/funnel`, { headers }).then((r) => r.json()),
        fetch(`${CC_API}/admin/dropoffs`, { headers }).then((r) => r.json()),
        fetch(`${CC_API}/admin/students`, { headers }).then((r) => r.json()),
        fetch(`${CC_API}/admin/scores`, { headers }).then((r) => r.json()),
        fetch(`${CC_API}/admin/career-paths`, { headers }).then((r) => r.json()),
        fetch(`${CC_API}/admin/questions`, { headers }).then((r) => r.json()),
      ]);
      setOverview(ov);
      setFunnel(fu);
      setDropoffs(dr);
      setStudents(Array.isArray(st) ? st : []);
      setScores(sc);
      setPaths(pa);
      setQuestions(qu);
      toast.success("Career Coach data refreshed");
      setKeyError(false);
    } catch (e) {
      toast.error("Failed to load career coach data");
      if (!overview) setKeyError(true);
    } finally {
      setLoading(false);
    }
  }

  async function openStudentPanel(id: string) {
    setSelectedStudent(id);
    setLoadingDetail(true);
    setStudentDetail(null);
    setStudentActivity(null);
    try {
      const dash = await fetch(`${CC_API}/dashboard/${id}`, {
        headers: ccHeaders(),
      }).then((r) => r.json());
      setStudentDetail(dash);
    } catch {
      toast.error("Could not load student detail");
    } finally {
      setLoadingDetail(false);
    }
    // Activity + cross-platform sign-in/tool log (best-effort, non-blocking).
    // Coach events come from the coach backend; main-platform sign-in/tool data
    // is fetched directly from studojo.com using the admin's shared session
    // cookie (so no server-to-server secret is required).
    const email = students.find((s) => s.id === id)?.email ?? null;
    const [coachAct, mainAct] = await Promise.all([
      fetch(`${CC_API}/admin/student/${id}/activity`, { headers: ccHeaders() })
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      email
        ? fetch(
            `${MAIN_API}/api/admin/cc-user-activity?email=${encodeURIComponent(email)}`,
            { credentials: "include" },
          )
            .then((r) => (r.ok ? r.json() : null))
            .catch(() => null)
        : Promise.resolve(null),
    ]);

    const merged: StudentActivity = (coachAct as StudentActivity) ?? {};
    if (mainAct && (mainAct as { found?: boolean }).found) {
      merged.main_platform = mainAct;
      merged.main_platform_linked = true;
    }
    setStudentActivity(merged);
  }

  function saveNote(id: string, note: string) {
    setAdminNotes((prev) => ({ ...prev, [id]: note }));
    try {
      localStorage.setItem(`cc_admin_note_${id}`, note);
      toast.success("Note saved");
    } catch {}
  }

  function loadNote(id: string): string {
    if (adminNotes[id] !== undefined) return adminNotes[id];
    try {
      return localStorage.getItem(`cc_admin_note_${id}`) ?? "";
    } catch {
      return "";
    }
  }

  async function downloadResume(studentId: string, filename: string) {
    try {
      const r = await fetch(`${CC_API}/admin/student/${studentId}/resume`, {
        headers: ccHeaders(),
      });
      if (!r.ok) { toast.error("Could not download resume"); return; }
      const blob = await r.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename || `resume-${studentId}`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 500);
    } catch {
      toast.error("Resume download failed");
    }
  }

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="text-neutral-500 font-['Satoshi']">Loading…</div>
      </div>
    );
  }

  if (!authenticated) {
    // No key prompt — the admin panel is already behind login. We auto-authenticate
    // using the server-injected key. Show a loading state, or an error if the key
    // is misconfigured on the server.
    return (
      <div className="min-h-screen bg-neutral-50">
        <AdminHeader />
        <div className="flex min-h-[calc(100vh-80px)] items-center justify-center">
          {keyError ? (
            <div className="w-96 rounded-3xl border-2 border-neutral-900 bg-white p-10 text-center shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]">
              <div className="mb-2 font-['Clash_Display'] text-xl font-black text-neutral-900">
                Career Coach analytics unavailable
              </div>
              <p className="text-sm text-neutral-500">
                The dashboard could not reach the career coach backend. Please try refreshing.
              </p>
            </div>
          ) : (
            <div className="text-neutral-500 font-['Satoshi']">Loading career coach analytics…</div>
          )}
        </div>
      </div>
    );
  }

  const TABS: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    { id: "funnel", label: "Funnel" },
    { id: "students", label: "Students" },
    { id: "scores", label: "Scores" },
    { id: "paths", label: "Career Paths" },
    { id: "questions", label: "Q&A" },
  ];

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />

      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        {/* Page header */}
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-3xl font-black text-neutral-900">
              Career Coach
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              {overview
                ? `Updated ${fmtDateTime(overview.generated_at)}`
                : "Live student analytics from the career coaching agent."}
            </p>
          </div>
          <button
            onClick={() => loadAll()}
            disabled={loading}
            className="rounded-full border-2 border-neutral-900 bg-white px-5 py-2 font-['Satoshi'] text-sm font-semibold shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50 hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
          >
            {loading ? "Refreshing…" : "↻ Refresh"}
          </button>
        </div>

        {/* Tabs */}
        <div className="mb-6 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-full border-2 px-4 py-1.5 font-['Satoshi'] text-sm font-semibold transition-all ${
                tab === t.id
                  ? "border-neutral-900 bg-violet-500 text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                  : "border-neutral-200 bg-white text-neutral-700 hover:border-neutral-400"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ── Overview ─────────────────────────────────────────────────────── */}
        {tab === "overview" && (
          <div>
            {overview ? (
              <>
                <div className="mb-4 grid grid-cols-2 gap-4 md:grid-cols-4">
                  <StatCard num={overview.students.active_last_hour ?? 0} label="Active (last hour)" sub={`${overview.students.active_today} today · ${overview.students.active_this_week} this week`} color="purple" />
                  <StatCard num={overview.students.total} label="Total Students" sub={`${overview.students.active_this_month} active this month`} color="blue" />
                  <StatCard num={overview.dna.total_generated} label="DNAs Built" sub={`${overview.dna.accuracy_rate}% accuracy`} color="green" />
                  <StatCard num={`${funnel?.overall_completion_rate ?? 0}%`} label="Completion Rate" sub="landing → roadmap" color="red" />
                </div>

                {/* Active users per hour — last 24h */}
                {overview.active_per_hour && overview.active_per_hour.length > 0 && (
                  <div className="mb-6 rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                    <h3 className="mb-1 font-['Clash_Display'] text-base font-bold">Active users per hour</h3>
                    <p className="mb-4 text-xs text-neutral-500">Distinct students who sent a message, last 24 hours</p>
                    <div className="flex items-end gap-1" style={{ height: 120 }}>
                      {overview.active_per_hour.map((h, i) => {
                        const max = Math.max(...overview.active_per_hour!.map((x) => x.active_users), 1);
                        const pct = (h.active_users / max) * 100;
                        return (
                          <div key={i} className="group flex flex-1 flex-col items-center justify-end" style={{ height: "100%" }}>
                            <div className="mb-1 text-[10px] font-bold text-neutral-700 opacity-0 group-hover:opacity-100">{h.active_users}</div>
                            <div
                              className="w-full rounded-t"
                              style={{
                                height: `${Math.max(pct, h.active_users > 0 ? 6 : 1)}%`,
                                background: h.active_users > 0 ? "#7c3aed" : "#e5e7eb",
                                transition: "height 0.6s ease",
                              }}
                              title={`${h.label}: ${h.active_users} active`}
                            />
                            {i % 3 === 0 && <div className="mt-1 text-[9px] text-neutral-400">{h.label}</div>}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
                <div className="mb-6 grid gap-6 md:grid-cols-2">
                  {/* Mini funnel */}
                  <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                    <h3 className="mb-4 font-['Clash_Display'] text-base font-bold">Conversion Funnel</h3>
                    {(funnel?.funnel_stages ?? []).map((stage, i) => {
                      const max = Math.max(...(funnel?.funnel_stages ?? []).map((s) => s.count), 1);
                      return (
                        <div key={stage.stage} className="mb-3 flex items-center gap-3">
                          <div className="w-36 flex-shrink-0 text-xs font-semibold">{stage.stage}</div>
                          <div className="flex-1 overflow-hidden rounded-full bg-neutral-100" style={{ height: 22 }}>
                            <div
                              className="flex h-full items-center rounded-full pl-2"
                              style={{
                                width: `${Math.max((stage.count / max) * 100, 2)}%`,
                                background: FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                                transition: "width 0.8s ease",
                              }}
                            >
                              <span className="text-xs font-bold text-white">{stage.count}</span>
                            </div>
                          </div>
                          <div className={`w-10 text-right text-xs font-semibold ${stage.conversion_rate < 30 ? "text-red-500" : "text-neutral-400"}`}>
                            {stage.conversion_rate}%
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {/* Drop-offs */}
                  <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                    <h3 className="mb-4 font-['Clash_Display'] text-base font-bold">Drop-off Hotspots</h3>
                    {[...(dropoffs?.dropoff_by_stage ?? [])]
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 5)
                      .map((d) => (
                        <div key={d.stage} className="flex items-center justify-between border-b border-neutral-100 py-3 last:border-0">
                          <div>
                            <div className="text-sm font-semibold">{d.stage}</div>
                            <div className="text-xs text-neutral-400">{d.avg_messages_before_dropoff.toFixed(1)} msgs before leaving</div>
                          </div>
                          <div className="text-2xl font-black text-red-500">{d.count}</div>
                        </div>
                      ))}
                  </div>
                </div>
                {/* Top improvers mini */}
                <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                  <h3 className="mb-4 font-['Clash_Display'] text-base font-bold">Top Score Improvers</h3>
                  {(scores?.top_improvers ?? []).slice(0, 5).length ? (
                    (scores?.top_improvers ?? []).slice(0, 5).map((im) => (
                      <div key={im.student_id} className="flex items-center justify-between border-b border-neutral-100 py-2 last:border-0">
                        <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-neutral-400">{im.student_id}</div>
                        <div className="flex items-center gap-2 text-sm">
                          <span className="text-neutral-400">{im.from_score}</span>
                          <span className="text-neutral-300">→</span>
                          <span className="font-bold">{im.to_score}</span>
                          <span className="font-bold text-emerald-600">+{im.improvement}</span>
                        </div>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-neutral-400">No score movements yet.</p>
                  )}
                </div>
              </>
            ) : (
              <EmptyState loading={loading} />
            )}
          </div>
        )}

        {/* ── Funnel ───────────────────────────────────────────────────────── */}
        {tab === "funnel" && (
          <div className="space-y-6">
            {/* Biggest drop-off callout */}
            {funnel?.biggest_drop_off_detail && (
              <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-5 shadow-[4px_4px_0px_0px_rgba(239,68,68,0.4)]">
                <div className="text-xs font-bold uppercase tracking-widest text-red-500">Biggest drop-off</div>
                <div className="mt-1 font-['Clash_Display'] text-lg font-bold text-neutral-900">{funnel.biggest_drop_off}</div>
                <div className="text-sm text-neutral-600">{funnel.biggest_drop_off_detail}</div>
              </div>
            )}

            {/* Step-by-step funnel with per-step conversion + drop */}
            <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <h3 className="mb-1 font-['Clash_Display'] text-base font-bold">The full journey, step by step</h3>
              <p className="mb-5 text-xs text-neutral-500">Each bar shows students who reached that step. % of previous step is where the drop happens.</p>
              {(funnel?.funnel_stages ?? []).map((stage, i) => {
                const max = Math.max(...(funnel?.funnel_stages ?? []).map((s) => s.count), 1);
                const isBiggest = stage.stage === funnel?.biggest_drop_off;
                const stepConv = stage.step_conversion_rate ?? stage.conversion_rate;
                return (
                  <div key={stage.stage} className="mb-5">
                    <div className="mb-1 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm font-semibold">
                        <span className="text-neutral-400">{i + 1}.</span> {stage.stage}
                        {isBiggest && (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-600">biggest drop</span>
                        )}
                      </div>
                      <div className="text-xs text-neutral-400">{stage.note}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="flex-1 overflow-hidden rounded-full bg-neutral-100" style={{ height: 28 }}>
                        <div
                          className="flex h-full items-center rounded-full pl-3"
                          style={{
                            width: `${Math.max((stage.count / max) * 100, 3)}%`,
                            background: isBiggest ? "#EF4444" : FUNNEL_COLORS[i % FUNNEL_COLORS.length],
                            transition: "width 0.8s ease",
                          }}
                        >
                          <span className="whitespace-nowrap text-xs font-bold text-white">{stage.count} students</span>
                        </div>
                      </div>
                      <div className="w-28 text-right text-xs">
                        <span className={`font-bold ${stepConv < 60 ? "text-red-500" : "text-neutral-700"}`}>{stepConv}%</span>
                        <span className="text-neutral-400"> of prev</span>
                        {!!stage.dropped_from_prev && (
                          <div className="text-[11px] text-red-400">−{stage.dropped_from_prev} dropped</div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
              {!(funnel?.funnel_stages ?? []).length && <EmptyState loading={loading} />}
            </div>

            {/* Profiling depth — where in the conversation they stall */}
            {funnel?.profiling_depth && (
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                <h3 className="mb-1 font-['Clash_Display'] text-base font-bold">Conversation depth</h3>
                <p className="mb-4 text-xs text-neutral-500">
                  How many messages students send. Profiling usually needs ~7+ to complete — short conversations are where DNA never gets built.
                  Average: <span className="font-bold text-neutral-700">{funnel.profiling_depth.avg_user_messages} messages</span>
                </p>
                {Object.entries(funnel.profiling_depth.buckets).map(([bucket, count]) => {
                  const vals = Object.values(funnel.profiling_depth!.buckets);
                  const max = Math.max(...vals, 1);
                  return (
                    <div key={bucket} className="mb-2 flex items-center gap-3">
                      <div className="w-20 flex-shrink-0 text-xs font-semibold">{bucket}</div>
                      <div className="flex-1 overflow-hidden rounded-full bg-neutral-100" style={{ height: 20 }}>
                        <div className="flex h-full items-center rounded-full pl-2" style={{ width: `${Math.max((count / max) * 100, 3)}%`, background: "#7c3aed" }}>
                          <span className="text-[11px] font-bold text-white">{count}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Side actions — engagement signals */}
            {funnel?.side_actions && (
              <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                <h3 className="mb-4 font-['Clash_Display'] text-base font-bold">Engagement actions</h3>
                <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
                  {[
                    ["Uploaded resume", funnel.side_actions.uploaded_resume],
                    ["Logged a check-in", funnel.side_actions.logged_check_in],
                    ["Clicked Resume Maker", funnel.side_actions.clicked_resume_maker],
                    ["Clicked Outreach Dojo", funnel.side_actions.clicked_outreach_dojo],
                    ["Clicked any tool", funnel.side_actions.clicked_any_tool],
                    ["Explored a new path", funnel.side_actions.explored_new_path],
                  ].map(([label, val]) => (
                    <div key={label as string} className="rounded-xl border border-neutral-200 p-3">
                      <div className="text-2xl font-black text-neutral-900">{val as number}</div>
                      <div className="text-xs text-neutral-500">{label as string}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── Students ─────────────────────────────────────────────────────── */}
        {tab === "students" && (
          <div className="rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] overflow-hidden">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-neutral-50">
                  {["ID", "Name", "Email", "Archetype", "Sessions", "Resume", "Last Seen", ""].map((h) => (
                    <th key={h} className="border-b-2 border-neutral-900 px-4 py-3 text-left text-xs font-bold uppercase tracking-widest text-neutral-400">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.length ? students.map((s) => (
                  <tr
                    key={s.id}
                    onClick={() => openStudentPanel(s.id)}
                    className="cursor-pointer border-b border-neutral-100 transition-colors last:border-0 hover:bg-violet-50/40"
                  >
                    <td className="px-4 py-3 font-mono text-xs text-neutral-300" title={s.id}>{s.id.slice(0, 8)}…</td>
                    <td className="px-4 py-3 text-sm font-semibold">{s.name || "—"}</td>
                    <td className="px-4 py-3 text-xs text-neutral-500">{s.email || "—"}</td>
                    <td className="px-4 py-3">
                      {s.archetype ? (
                        <span className="rounded-full bg-violet-100 px-2.5 py-0.5 text-xs font-semibold text-violet-700">{s.archetype}</span>
                      ) : <span className="text-neutral-300 text-xs">—</span>}
                    </td>
                    <td className="px-4 py-3 text-sm font-semibold">{s.session_count}</td>
                    <td className="px-4 py-3">
                      {s.has_resume ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadResume(s.id, s.resume_filename ?? "resume"); }}
                          className="flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 hover:bg-white"
                        >
                          <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          Download
                        </button>
                      ) : <span className="text-xs text-neutral-300">—</span>}
                    </td>
                    <td className="px-4 py-3 text-xs text-neutral-400">{fmtDate(s.last_seen)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={(e) => { e.stopPropagation(); openStudentPanel(s.id); }}
                        className="rounded-full border-2 border-neutral-900 bg-white px-3 py-1 text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-sm text-neutral-400">
                      {loading ? "Loading…" : "No students yet."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Scores ───────────────────────────────────────────────────────── */}
        {tab === "scores" && (
          <div>
            {scores ? (
              <>
                <div className="mb-6 grid grid-cols-3 gap-4">
                  <StatCard num={scores.students_who_improved} label="Students Improved" color="green" />
                  <StatCard num={`+${Math.round(scores.avg_readiness_improvement ?? 0)}`} label="Avg Score Gain" color="purple" />
                  <StatCard num={scores.total_actions_completed} label="Actions Completed" color="amber" />
                </div>
                <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                  <h3 className="mb-5 font-['Clash_Display'] text-base font-bold">Top Improvers</h3>
                  {scores.top_improvers?.length ? scores.top_improvers.map((im) => (
                    <div key={im.student_id} className="flex items-center gap-3 border-b border-neutral-100 py-3 last:border-0">
                      <div className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap font-mono text-xs text-neutral-400">{im.student_id}</div>
                      <div className="flex items-center gap-2 text-sm">
                        <span className="text-neutral-400">{im.from_score}</span>
                        <span className="text-neutral-300">→</span>
                        <span className="font-bold">{im.to_score}</span>
                        <span className="font-bold text-emerald-600">+{im.improvement} pts</span>
                      </div>
                      <button
                        onClick={() => openStudentPanel(im.student_id)}
                        className="rounded-full border-2 border-neutral-900 bg-white px-3 py-1 text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:bg-neutral-50"
                      >
                        View →
                      </button>
                    </div>
                  )) : <p className="text-sm text-neutral-400">No improvements tracked yet.</p>}
                </div>
              </>
            ) : <EmptyState loading={loading} />}
          </div>
        )}

        {/* ── Career Paths ─────────────────────────────────────────────────── */}
        {tab === "paths" && (
          <div className="grid gap-6 md:grid-cols-2">
            <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <h3 className="mb-5 font-['Clash_Display'] text-base font-bold">Top Target Roles</h3>
              <BarList items={(paths?.top_target_roles ?? []).map((r) => ({ label: r.role, count: r.count }))} color="var(--color-violet-500, #8B5CF6)" />
            </div>
            <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <h3 className="mb-5 font-['Clash_Display'] text-base font-bold">Top Target Industries</h3>
              <BarList items={(paths?.top_target_industries ?? []).slice(0, 8).map((i) => ({ label: i.industry, count: i.count }))} color="#3B82F6" />
            </div>
          </div>
        )}

        {/* ── Q&A ──────────────────────────────────────────────────────────── */}
        {tab === "questions" && (
          <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <h3 className="mb-5 font-['Clash_Display'] text-base font-bold">Recent Student Questions</h3>
            {(() => {
              const qs = questions?.recent_questions ?? questions?.questions ?? [];
              return qs.length ? qs.map((item, i) => {
                const text = item.question ?? item.content ?? item.text ?? JSON.stringify(item);
                const state = item.state ?? "—";
                const time = item.created_at ? fmtDateTime(item.created_at) : "";
                return (
                  <div key={i} className="border-b border-neutral-100 py-3 last:border-0">
                    <div className="mb-1 text-sm font-semibold">
                      {text.length > 200 ? text.slice(0, 200) + "…" : text}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-neutral-400">
                      <span className={`rounded-full px-2 py-0.5 font-semibold ${STATE_PILL[state] ?? "bg-neutral-100 text-neutral-500"}`}>{state}</span>
                      {time && <span>{time}</span>}
                    </div>
                  </div>
                );
              }) : (
                <p className="text-sm text-neutral-400">No question data yet — fills as students chat.</p>
              );
            })()}
          </div>
        )}
      </div>

      {/* ── Student Detail Panel ─────────────────────────────────────────── */}
      <AnimatePresence>
        {selectedStudent && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black"
              onClick={() => setSelectedStudent(null)}
            />
            <motion.div
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 300, damping: 30 }}
              className="fixed bottom-0 right-0 top-0 z-50 w-full max-w-md overflow-y-auto border-l-2 border-neutral-900 bg-white p-7 shadow-[-8px_0_0_0_rgba(25,26,35,0.05)]"
            >
              <button
                onClick={() => setSelectedStudent(null)}
                className="absolute right-5 top-5 text-xl font-bold text-neutral-400 hover:text-neutral-900"
              >
                ✕
              </button>

              {loadingDetail ? (
                <div className="flex h-40 items-center justify-center text-neutral-400">Loading…</div>
              ) : studentDetail ? (
                <StudentPanel
                  id={selectedStudent}
                  detail={studentDetail}
                  activity={studentActivity}
                  student={students.find((s) => s.id === selectedStudent)}
                  note={loadNote(selectedStudent)}
                  onSaveNote={(note) => saveNote(selectedStudent, note)}
                />
              ) : (
                <p className="text-sm text-red-500">Could not load student data.</p>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────

function EmptyState({ loading }: { loading: boolean }) {
  return (
    <div className="flex h-32 items-center justify-center rounded-2xl border-2 border-dashed border-neutral-200 text-sm text-neutral-400">
      {loading ? "Loading…" : "No data yet."}
    </div>
  );
}

function BarList({ items, color }: { items: { label: string; count: number }[]; color: string }) {
  const max = Math.max(...items.map((i) => i.count), 1);
  return items.length ? (
    <div className="space-y-3">
      {items.map((item) => (
        <div key={item.label}>
          <div className="mb-1 flex justify-between text-sm font-semibold">
            <span>{item.label}</span>
            <span>{item.count}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-neutral-100">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${Math.round((item.count / max) * 100)}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  ) : (
    <p className="text-sm text-neutral-400">No data yet.</p>
  );
}

function StudentPanel({
  id,
  detail,
  activity,
  student,
  note,
  onSaveNote,
}: {
  id: string;
  detail: StudentDetail;
  activity?: StudentActivity | null;
  student?: StudentRow;
  note: string;
  onSaveNote: (note: string) => void;
}) {
  const [noteVal, setNoteVal] = useState(note);
  const p = detail.primary_path ?? {};
  const s = detail.student ?? {};

  return (
    <div>
      <h2 className="font-['Clash_Display'] mb-1 text-xl font-black">
        {s.name ?? student?.name ?? "Anonymous Student"}
      </h2>
      <div className="mb-5 font-mono text-xs text-neutral-300">{id}</div>

      {/* Profile grid */}
      <div className="mb-5 grid grid-cols-2 gap-3 rounded-2xl border border-neutral-100 bg-neutral-50 p-4">
        {[
          { label: "Target Role", val: p.target_role },
          { label: "Industry", val: p.target_industry },
          { label: "Readiness", val: p.readiness_score ? `${p.readiness_score}%` : undefined, color: "text-violet-600" },
          { label: "Reply Prob.", val: p.reply_probability ? `${p.reply_probability}%` : undefined, color: "text-emerald-600" },
          { label: "Sessions", val: s.session_count ?? student?.session_count },
          { label: "Archetype", val: student?.archetype },
        ].map(({ label, val, color }) => (
          <div key={label}>
            <div className="text-xs text-neutral-400">{label}</div>
            <div className={`text-sm font-semibold ${color ?? ""}`}>{val ?? "—"}</div>
          </div>
        ))}
      </div>

      {/* DNA summary */}
      {p.one_line_summary && (
        <div className="mb-5 rounded-xl bg-violet-50 p-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-widest text-violet-400">DNA Summary</div>
          <div className="text-sm italic text-violet-800 leading-relaxed">{p.one_line_summary}</div>
        </div>
      )}

      {/* Skills */}
      {(p.skills_you_have ?? []).length > 0 && (
        <div className="mb-5">
          <div className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Skills</div>
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(p.skills_you_have ?? []).map((sk) => (
              <span key={sk} className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-700">{sk}</span>
            ))}
          </div>
          {(p.skills_to_build ?? []).length > 0 && (
            <>
              <div className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">To build</div>
              <div className="flex flex-wrap gap-1.5">
                {(p.skills_to_build ?? []).map((sk, i) => {
                  const label = typeof sk === "object" && sk !== null ? (sk as { skill: string }).skill : String(sk);
                  return <span key={i} className="rounded-full border border-amber-300 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-700">{label}</span>;
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Cross-platform activity & sign-in log */}
      <ActivitySection activity={activity} coachEmail={s.email ?? student?.email} />

      {/* Admin notes */}
      <div className="mb-5">
        <div className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">Admin Notes</div>
        <textarea
          rows={3}
          value={noteVal}
          onChange={(e) => setNoteVal(e.target.value)}
          placeholder="Add notes about this student…"
          className="w-full rounded-xl border border-neutral-200 p-3 font-['Satoshi'] text-sm outline-none focus:border-violet-400"
        />
        <button
          onClick={() => onSaveNote(noteVal)}
          className="mt-2 rounded-full border-2 border-neutral-900 bg-gradient-to-r from-violet-500 to-pink-500 px-5 py-2 text-xs font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] hover:-translate-y-0.5 hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-all"
        >
          Save note
        </button>
      </div>

      <div className="text-xs text-neutral-400">Student ID: {id}</div>
    </div>
  );
}

// Human-readable labels for coach analytics event types.
function eventLabel(type: string): string {
  const map: Record<string, string> = {
    conversation_started: "Started a conversation",
    new_path_exploration_started: "Started exploring a new path",
    resume_uploaded: "Uploaded a resume",
    check_in_logged: "Logged a check-in",
    state_reached_profiling: "Reached: Profiling",
    state_reached_career_analysis: "Reached: Career Analysis",
    state_reached_dna_review: "Reached: Career DNA review",
    state_reached_roadmap: "Reached: Roadmap",
    state_reached_ongoing_support: "Reached: Ongoing support",
    tool_click_resume_maker: "Clicked → Resume Maker",
    tool_click_outreach_dojo: "Clicked → Outreach Dojo",
    tool_click_internship_dojo: "Clicked → Internship Dojo",
    tool_click_reports: "Clicked → Reports",
    tool_click_ai_risk: "Clicked → AI Risk Dojo",
  };
  if (map[type]) return map[type];
  if (type.startsWith("tool_click_"))
    return "Clicked → " + type.replace("tool_click_", "").replace(/_/g, " ");
  if (type.startsWith("state_reached_"))
    return "Reached: " + type.replace("state_reached_", "").replace(/_/g, " ");
  return type.replace(/_/g, " ");
}

function ActivitySection({
  activity,
  coachEmail,
}: {
  activity?: StudentActivity | null;
  coachEmail?: string | null;
}) {
  if (!activity) {
    return (
      <div className="mb-5 rounded-xl border border-neutral-100 bg-neutral-50 p-4 text-xs text-neutral-400">
        Loading activity log…
      </div>
    );
  }

  const mp = activity.main_platform;
  const linked = activity.main_platform_linked && mp?.found;
  const tools = mp?.tools;
  const events = activity.coach?.events ?? [];

  return (
    <div className="mb-5">
      <div className="mb-2 text-xs font-bold uppercase tracking-widest text-neutral-400">
        Activity &amp; Sign-in Log
      </div>

      {/* Account / sign-in */}
      <div className="mb-3 rounded-xl border border-neutral-100 bg-neutral-50 p-4 space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-neutral-400">Email</span>
          <span className="font-semibold">{mp?.user?.email ?? coachEmail ?? "—"}</span>
        </div>
        {linked ? (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Signed up</span>
              <span className="font-semibold">{fmtDate(mp?.user?.created_at)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Sign-up method</span>
              <span className="font-semibold">
                {(mp?.signup_methods ?? []).map((m) => m.method).join(", ") || "—"}
              </span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-neutral-400">Last login method</span>
              <span className="font-semibold">{mp?.user?.last_login_method ?? "—"}</span>
            </div>
            {mp?.profile?.referral_source && (
              <div className="flex justify-between text-sm">
                <span className="text-neutral-400">Heard about us via</span>
                <span className="font-semibold">{mp.profile.referral_source}</span>
              </div>
            )}
          </>
        ) : (
          <div className="text-xs text-neutral-400">
            No main-platform (studojo.com) account linked to this email yet — the
            person used the coach without signing in on the main site, or signed
            in with a different email.
          </div>
        )}
      </div>

      {/* Tools used on the main platform */}
      {linked && tools && (
        <div className="mb-3 grid grid-cols-3 gap-2">
          {[
            { label: "Resume Maker", t: tools.resume_maker },
            { label: "Internship apps", t: tools.internship_applications },
            { label: "Career apps", t: tools.career_applications },
          ].map(({ label, t }) => (
            <div
              key={label}
              className={`rounded-xl border p-3 text-center ${
                t?.used ? "border-emerald-300 bg-emerald-50" : "border-neutral-100 bg-neutral-50"
              }`}
            >
              <div className={`text-lg font-black ${t?.used ? "text-emerald-700" : "text-neutral-300"}`}>
                {t?.count ?? 0}
              </div>
              <div className="text-[10px] uppercase tracking-wide text-neutral-400">{label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Recent logins */}
      {linked && (mp?.logins ?? []).length > 0 && (
        <details className="mb-3 rounded-xl border border-neutral-100 bg-white p-3">
          <summary className="cursor-pointer text-xs font-bold text-neutral-500">
            Recent logins ({mp!.logins!.length})
          </summary>
          <div className="mt-2 space-y-1">
            {mp!.logins!.slice(0, 10).map((l, i) => (
              <div key={i} className="flex justify-between gap-2 text-[11px] text-neutral-500">
                <span>{fmtDateTime(l.at)}</span>
                <span className="truncate text-right text-neutral-400" title={l.user_agent}>
                  {l.ip ?? ""}
                </span>
              </div>
            ))}
          </div>
        </details>
      )}

      {/* Coach event timeline */}
      <div className="rounded-xl border border-neutral-100 bg-white p-3">
        <div className="mb-2 text-xs font-bold text-neutral-500">Career-coach activity</div>
        {events.length ? (
          <div className="space-y-1.5">
            {events.slice(-25).reverse().map((e, i) => (
              <div key={i} className="flex justify-between gap-2 text-[11px]">
                <span className="font-medium text-neutral-700">{eventLabel(e.type)}</span>
                <span className="shrink-0 text-neutral-400">{fmtDateTime(e.at)}</span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-[11px] text-neutral-400">No tracked events yet.</p>
        )}
      </div>
    </div>
  );
}
