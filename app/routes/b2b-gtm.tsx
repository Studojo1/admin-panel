import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useModal } from "~/components/common/modal-context";
import { useAdminGuard } from "~/lib/auth-guard";
import type { Route } from "./+types/b2b-gtm";
import { CheckInModal, ContactChangeModal } from "~/components/b2b/check-in-modal";
import {
  Choice,
  ExitModal,
  Field,
  ReactivateModal,
  Shell,
  StageBadge,
  TempBadge,
  authedFetch,
  inputCls,
} from "~/components/b2b/shared";
import {
  ALL_STAGES,
  BLOCKER_LABELS,
  EXITED_STAGES,
  FLAGS,
  OBJECTION_LABELS,
  STAGE_LABELS,
  STALE_ACCOUNT_DAYS,
  TEAM,
  TEAM_VIEWS,
  WORKING_BUCKETS,
  matchesOwnerView,
  mcqBranchFor,
  TEMPERATURES,
  VIEWS,
  WON_STAGES,
  activeFlags,
  addDays,
  companyMatchesView,
  daysSince,
  formatDateTime,
  formatValue,
  isLaterToday,
  isOverdue,
  logSentence,
  toLocalInputValue,
  workingBucket,
  type CallLog,
  type Company,
  type Objection,
  type Stage,
  type Temperature,
  type ViewKey,
  type WorkingBucket,
} from "~/lib/b2b-gtm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "B2B GTM Motion – Admin Panel" }];
}

/** Tabs are either a ViewKey or a per-person sheet ("owner:Vivaan", "owner:" = mine). */
function matchesTab(c: Company, tab: string, now: Date): boolean {
  if (tab.startsWith("owner:")) return matchesOwnerView(c, tab.slice(6));
  return companyMatchesView(c, tab as ViewKey, now);
}

/**
 * Today / Tomorrow / Day after in words, and the explicit date for anything
 * further out (and anything in the past). Calendar-day based, so "Tomorrow"
 * means the next date regardless of the clock time.
 */
function relativeWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  const dateStr = d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  // Whole-calendar-day difference between the two dates (ignores time of day).
  const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((startOf(d) - startOf(now)) / dayMs);

  if (diffDays === 0) return `Today ${time}`;
  if (diffDays === 1) return `Tomorrow ${time}`;
  if (diffDays === 2) return `Day after ${time}`;
  // Everything else — past or 3+ days out — shows the actual date.
  return `${dateStr} ${time}`;
}

interface Stats {
  total: number;
  due_now: number;
  hot: number;
  blocked: number;
  exited: number;
  brochures: number;
  leads_wanted: number;
  leads_to_fix: number;
  accounts: number;
  renewals_due: number;
  committed_value: string;
}

interface ObjectionStat {
  objection: string;
  detail: string | null;
  n: number;
}

export default function B2BGtm() {
  const { isAuthorized, isPending } = useAdminGuard();
  const { showConfirm } = useModal();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [objectionStats, setObjectionStats] = useState<ObjectionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Either a ViewKey, or "owner:<name>" for a teammate's sheet ("owner:" = mine).
  const [view, setView] = useState<string>("overview");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [checkIn, setCheckIn] = useState<Company | null>(null);
  const [contactChange, setContactChange] = useState<Company | null>(null);
  const [exitCompany, setExitCompany] = useState<Company | null>(null);
  const [reactivateCompany, setReactivateCompany] = useState<Company | null>(null);
  const [adding, setAdding] = useState(false);
  // Sub-filter for the Working tab. `all` = the whole active pile.
  const [workingSub, setWorkingSub] = useState<WorkingBucket | "all">("all");
  const notifiedRef = useRef<Set<number>>(new Set());

  /**
   * A clock that actually ticks. A `new Date()` created during render is a new
   * object every time but never a valid memo dependency, so filters silently
   * kept comparing against a stale moment. This gives every memo a real,
   * changing input.
   */
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);
  const now = useMemo(() => new Date(nowMs), [nowMs]);

  const load = useCallback(async () => {
    try {
      const data = await authedFetch("/api/b2b-gtm");
      setCompanies(data.companies || []);
      setStats(data.stats || null);
      setObjectionStats(data.objection_stats || []);
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isPending || !isAuthorized) return;
    load();
  }, [isPending, isAuthorized, load]);

  useEffect(() => {
    if (isPending || !isAuthorized) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") Notification.requestPermission();
  }, [isPending, isAuthorized]);

  useEffect(() => {
    if (isPending || !isAuthorized) return;
    const tick = () => {
      const t = new Date();
      for (const c of companies) {
        if (!isOverdue(c.next_action_at, t)) continue;
        if (notifiedRef.current.has(c.id)) continue;
        notifiedRef.current.add(c.id);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const contact = c.contacts?.find((x) => !x.is_inactive)?.name;
          new Notification(`Call ${c.name}${contact ? ` (${contact})` : ""}`, {
            body: c.next_action_reason || c.last_log?.note || "Follow-up due now",
            tag: `b2b-${c.id}`,
          });
        }
      }
    };
    tick();
    const id = setInterval(() => {
      tick();
      load();
    }, 60_000);
    return () => clearInterval(id);
  }, [companies, isPending, isAuthorized, load]);

  const overdue = useMemo(
    () => companies.filter((c) => isOverdue(c.next_action_at, now)),
    [companies, now]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const rows = companies.filter((c) => {
      if (!matchesTab(c, view, now)) return false;
      // Working sub-buckets: needs-decision / in-buy-decision / stale.
      if (view === "working" && workingSub !== "all" && workingBucket(c, now) !== workingSub) {
        return false;
      }
      if (!q) return true;
      const hay = [c.name, c.notes, ...(c.contacts || []).map((x) => x.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
    // Soonest first; anything without a date sinks to the bottom.
    return rows.sort((a, b) => {
      const at = a.next_action_at ? +new Date(a.next_action_at) : Infinity;
      const bt = b.next_action_at ? +new Date(b.next_action_at) : Infinity;
      return at - bt;
    });
  }, [companies, view, search, now, workingSub]);

  if (isPending) return null;

  const seed = async () => {
    const ok = await showConfirm(
      "Import the 21 rows from your sheet? Stages are inferred from your notes and will need a quick review. Does nothing if leads already exist.",
      "Import"
    );
    if (!ok) return;
    try {
      const r = await authedFetch("/api/b2b-gtm?action=seed", { method: "POST", body: "{}" });
      toast.success(r.seeded ? `Imported ${r.count} companies` : `Already has ${r.count} companies`);
      load();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <AdminHeader />
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1
              className="text-2xl font-bold text-gray-900"
              style={{ fontFamily: "Clash Display, sans-serif" }}
            >
              B2B GTM Motion
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {stats ? (
                <>
                  {stats.total} companies · {overdue.length} overdue · {formatValue(stats.committed_value)}{" "}
                  committed
                  {stats.brochures > 0 ? ` · ${stats.brochures} brochure` : ""}
                  {stats.leads_wanted > 0 ? ` · ${stats.leads_wanted} need leads` : ""}
                  {stats.leads_to_fix > 0 ? ` · ${stats.leads_to_fix} leads to fix` : ""}
                </>
              ) : (
                "Every lead always has a next action."
              )}
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setAdding(true)}
              title="New companies enter Pre-GTM as Vivaan's, then get handed to you"
              className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium border-2 border-neutral-900 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all"
            >
              + Add to Pre-GTM
            </button>
            {companies.length === 0 && !loading && (
              <button
                onClick={seed}
                className="px-4 py-2 rounded-xl bg-white text-gray-700 text-sm font-medium border border-gray-300 hover:bg-gray-50"
              >
                Import sheet
              </button>
            )}
          </div>
        </div>

        {/* Tabs run horizontally: the table needs the width. */}
        <div className="flex items-center gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
          {VIEWS.map((v) => {
            const count = companies.filter((c) => matchesTab(c, v.key, now)).length;
            const active = view === v.key;
            return (
              <button
                key={v.key}
                onClick={() => {
                  setView(v.key);
                  if (v.key !== "working") setWorkingSub("all");
                }}
                className={`px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
                  active
                    ? "border-violet-500 text-gray-900 font-semibold"
                    : "border-transparent text-gray-500 hover:text-gray-900"
                }`}
              >
                {v.label}
                <span className={`ml-1.5 text-xs ${active ? "text-violet-600" : "text-gray-400"}`}>
                  {count}
                </span>
              </button>
            );
          })}

          {/* Exit tab, tucked in the corner — parked companies, out of the way. */}
          <button
            onClick={() => {
              setView("exit");
              setWorkingSub("all");
            }}
            className={`ml-auto px-3 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors ${
              view === "exit"
                ? "border-gray-500 text-gray-900 font-semibold"
                : "border-transparent text-gray-400 hover:text-gray-700"
            }`}
          >
            Exited
            <span className="ml-1.5 text-xs text-gray-400">
              {companies.filter((c) => EXITED_STAGES.includes(c.stage)).length}
            </span>
          </button>
        </div>

        {/* Working sub-buckets: tells you what to actually do with the active pile. */}
        {view === "working" && (
          <div className="flex items-center gap-1.5 mb-4 flex-wrap">
            {(["all", ...WORKING_BUCKETS.map((b) => b.key)] as const).map((k) => {
              const label =
                k === "all" ? "All" : WORKING_BUCKETS.find((b) => b.key === k)!.label;
              const count =
                k === "all"
                  ? companies.filter((c) => matchesTab(c, "working", now)).length
                  : companies.filter(
                      (c) => matchesTab(c, "working", now) && workingBucket(c, now) === k
                    ).length;
              const active = workingSub === k;
              return (
                <button
                  key={k}
                  onClick={() => setWorkingSub(k as WorkingBucket | "all")}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    active
                      ? "bg-violet-500 text-white border-violet-500 font-medium"
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {label}
                  <span className={`ml-1 ${active ? "text-violet-100" : "text-gray-400"}`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* One sheet per person, in pipeline order: Vivaan → Me → Jeremy/Hegde → Ayushi. */}
        <div className="flex items-center gap-1.5 mb-4 flex-wrap">
          <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mr-1">
            Sheets
          </span>
          {TEAM_VIEWS.map((t, i) => {
            const count = companies.filter((c) => matchesOwnerView(c, t.owner)).length;
            const due = companies.filter(
              (c) => matchesOwnerView(c, t.owner) && isOverdue(c.next_action_at, now)
            ).length;
            const active = view === t.key;
            return (
              <span key={t.key} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-gray-300 text-xs">→</span>}
                <button
                  onClick={() => setView(t.key)}
                  title={t.does}
                  className={`px-2.5 py-1 rounded-full text-xs border transition-colors ${
                    active
                      ? "bg-neutral-900 text-white border-neutral-900 font-medium"
                      : "bg-white text-gray-600 border-gray-300 hover:border-gray-400"
                  }`}
                >
                  {t.label}
                  <span className={`ml-1 ${active ? "text-gray-300" : "text-gray-400"}`}>
                    {count}
                  </span>
                  {due > 0 && (
                    <span className="ml-1 px-1 rounded-full bg-violet-500 text-white text-[10px]">
                      {due}
                    </span>
                  )}
                </button>
              </span>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mb-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search company, contact or notes…"
            className="flex-1 max-w-md px-4 py-2 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
          {objectionStats.length > 0 && (
            <div className="ml-auto flex items-center gap-2 text-xs text-gray-500 overflow-x-auto">
              <span className="font-semibold uppercase tracking-wide shrink-0">Why we lose:</span>
              {objectionStats.slice(0, 5).map((o, i) => (
                <span
                  key={i}
                  className="px-2 py-0.5 rounded-full bg-white border border-gray-200 whitespace-nowrap"
                  title={o.detail || undefined}
                >
                  {o.detail || OBJECTION_LABELS[o.objection as Objection] || o.objection}
                  <span className="ml-1 font-semibold text-gray-900">{o.n}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : visible.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            Nothing here.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <div className="px-3 py-1.5 border-b border-gray-100 text-[11px] text-gray-400">
              Showing all {visible.length}
              {visible.length === 1 ? " company" : " companies"}
              {search.trim() ? " matching your search" : ""} — scroll for more
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {[
                      "",
                      "Company",
                      "Contact",
                      "Phone",
                      "Stage",
                      "Temp",
                      "Handled by",
                      "Next action",
                      "Context",
                      "",
                    ].map((h, i) => (
                      <th
                        key={i}
                        className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {visible.map((c) => (
                    <Row
                      key={c.id}
                      c={c}
                      now={now}
                      expanded={expanded === c.id}
                      onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                      onCheckIn={() => setCheckIn(c)}
                      onContactChange={() => setContactChange(c)}
                      onExit={() => setExitCompany(c)}
                      onReactivate={() => setReactivateCompany(c)}
                      onSaved={load}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {checkIn && (
        <CheckInModal
          company={checkIn}
          onClose={() => setCheckIn(null)}
          onSaved={() => {
            notifiedRef.current.delete(checkIn.id);
            setCheckIn(null);
            load();
          }}
        />
      )}
      {contactChange && (
        <ContactChangeModal
          company={contactChange}
          onClose={() => setContactChange(null)}
          onSaved={() => {
            setContactChange(null);
            load();
          }}
        />
      )}
      {adding && (
        <AddModal
          onClose={() => setAdding(false)}
          onSaved={() => {
            setAdding(false);
            load();
          }}
        />
      )}
      {exitCompany && (
        <ExitModal
          company={exitCompany}
          onClose={() => setExitCompany(null)}
          onSaved={() => {
            setExitCompany(null);
            load();
          }}
        />
      )}
      {reactivateCompany && (
        <ReactivateModal
          company={reactivateCompany}
          onClose={() => setReactivateCompany(null)}
          onSaved={() => {
            setReactivateCompany(null);
            load();
          }}
        />
      )}
    </div>
  );
}

function Row({
  c,
  now,
  expanded,
  onToggle,
  onCheckIn,
  onContactChange,
  onExit,
  onReactivate,
  onSaved,
}: {
  c: Company;
  now: Date;
  expanded: boolean;
  onToggle: () => void;
  onCheckIn: () => void;
  onContactChange: () => void;
  onExit: () => void;
  onReactivate: () => void;
  onSaved: () => void;
}) {
  const overdue = isOverdue(c.next_action_at, now);
  const today = isLaterToday(c.next_action_at, now);
  const contact = (c.contacts || []).find((x) => !x.is_inactive) ?? c.contacts?.[0];
  const isAccount = WON_STAGES.includes(c.stage);
  const exited = EXITED_STAGES.includes(c.stage);
  const quiet = daysSince(c.last_log?.called_at ?? c.updated_at, now);
  const stale = (isAccount || c.stage === "gtm_active") && quiet !== null && quiet > STALE_ACCOUNT_DAYS;
  const context = c.last_log?.note || c.notes;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer hover:bg-gray-50 ${expanded ? "bg-gray-50" : ""} ${
          overdue ? "border-l-4 border-l-violet-500" : ""
        }`}
      >
        <td className="px-3 py-2.5 text-gray-400 w-6">{expanded ? "▾" : "▸"}</td>
        <td className="px-3 py-2.5 font-medium text-gray-900 whitespace-nowrap">
          <div className="flex items-center gap-1.5">
            {c.name}
            {activeFlags(c).map((f) => (
              <span
                key={f.key}
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${f.dot}`}
                title={c[f.noteKey] ? `${f.label}: ${c[f.noteKey]}` : f.label}
              />
            ))}
            {stale && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title={`Quiet ${quiet}d`} />
            )}
            {c.needs_my_followup && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-violet-100 text-violet-700 border border-violet-200 shrink-0"
                title={c.my_followup_note || "I need to follow up"}
              >
                My follow-up
              </span>
            )}
          </div>
        </td>
        <td className="px-3 py-2.5 text-gray-600 whitespace-nowrap">{contact?.name || "—"}</td>
        <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap text-xs">
          {contact?.phone ? (
            <a
              href={`tel:${contact.phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-violet-600 hover:underline"
            >
              {contact.phone}
            </a>
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <StageBadge s={c.stage} />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <TempBadge t={c.temperature} />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
          <OwnerPicker c={c} onSaved={onSaved} />
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap text-xs">
          {exited ? (
            <span className="text-gray-400">Parked</span>
          ) : c.next_action_at ? (
            <span
              className={
                overdue ? "text-violet-700 font-semibold" : today ? "text-gray-900" : "text-gray-500"
              }
              title={formatDateTime(c.next_action_at)}
            >
              {relativeWhen(c.next_action_at, now)}
            </span>
          ) : (
            <span className="text-rose-600 font-medium">Not set</span>
          )}
          {!exited && quiet !== null && quiet > 0 && (
            <span className="block text-[10px] text-gray-400">
              quiet {quiet}d{stale ? " · stale" : ""}
            </span>
          )}
        </td>
        <td className="px-3 py-2.5 text-gray-600 text-xs max-w-md">
          <span className="line-clamp-1">{context || "—"}</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          {exited ? (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onReactivate();
              }}
              className="px-2.5 py-1 rounded-lg bg-violet-500 text-white text-xs font-medium hover:bg-violet-600"
            >
              Bring back
            </button>
          ) : (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onCheckIn();
              }}
              className="px-2.5 py-1 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-700"
            >
              Log call
            </button>
          )}
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={10} className="px-3 pb-4 pt-1">
            <ExpandedPanel
              c={c}
              now={now}
              onContactChange={onContactChange}
              onCheckIn={onCheckIn}
              onExit={onExit}
              onReactivate={onReactivate}
              onSaved={onSaved}
            />
          </td>
        </tr>
      )}
    </>
  );
}

function ExpandedPanel({
  c,
  now,
  onContactChange,
  onCheckIn,
  onExit,
  onReactivate,
  onSaved,
}: {
  c: Company;
  now: Date;
  onContactChange: () => void;
  onCheckIn: () => void;
  onExit: () => void;
  onReactivate: () => void;
  onSaved: () => void;
}) {
  const [showDetails, setShowDetails] = useState(false);
  const [stage, setStage] = useState<Stage>(c.stage);
  const [temperature, setTemperature] = useState<Temperature | null>(c.temperature);
  const [myFollowup, setMyFollowup] = useState(c.needs_my_followup);
  const [myFollowupNote, setMyFollowupNote] = useState(c.my_followup_note ?? "");
  const [flags, setFlags] = useState<Record<string, boolean>>({
    needs_brochure: c.needs_brochure,
    needs_leads: c.needs_leads,
    leads_change: c.leads_change,
  });
  const [flagNotes, setFlagNotes] = useState<Record<string, string>>({
    brochure_note: c.brochure_note ?? "",
    leads_note: c.leads_note ?? "",
    leads_change_note: c.leads_change_note ?? "",
  });
  const [notes, setNotes] = useState(c.notes ?? "");
  const [nextAt, setNextAt] = useState(
    c.next_action_at ? toLocalInputValue(new Date(c.next_action_at)) : ""
  );
  const [nextReason, setNextReason] = useState(c.next_action_reason ?? "");
  const [dealValue, setDealValue] = useState(c.deal_value ?? "");
  const [saving, setSaving] = useState(false);

  const isAccount = WON_STAGES.includes(c.stage);
  const activeContacts = (c.contacts || []).filter((x) => !x.is_inactive);
  const pastContacts = (c.contacts || []).filter((x) => x.is_inactive);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=company", {
        method: "PATCH",
        body: JSON.stringify({
          id: c.id,
          fields: {
            // owner is handled by the row picker; sending a stale copy here
            // would silently revert it.
            stage,
            temperature,
            notes,
            next_action_at: nextAt ? new Date(nextAt).toISOString() : null,
            next_action_reason: nextReason,
            deal_value: dealValue === "" ? null : Number(dealValue),
            needs_my_followup: myFollowup,
            my_followup_note: myFollowupNote,
            needs_brochure: flags.needs_brochure,
            brochure_note: flagNotes.brochure_note,
            needs_leads: flags.needs_leads,
            leads_note: flagNotes.leads_note,
            leads_change: flags.leads_change,
            leads_change_note: flagNotes.leads_change_note,
          },
        }),
      });
      toast.success("Saved");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      {/* Guided next-action, chosen from where this company is. Leads the panel
          so the common move is one tap; the rest is collapsed below. */}
      <ActionBar
        c={c}
        onCheckIn={onCheckIn}
        onExit={onExit}
        onReactivate={onReactivate}
        onSaved={onSaved}
      />

      <div className="grid lg:grid-cols-3 gap-5 mt-4">
        <div className="lg:col-span-2 space-y-3">
          {/* The running record. Every call, every bit of feedback, dated —
              the single most useful thing, so it stays open. */}
          <NotesFeed companyId={c.id} onSaved={onSaved} />

          {c.blocker_note && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
              <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide">
                Blocker{c.blocker_type ? ` — ${BLOCKER_LABELS[c.blocker_type] ?? c.blocker_type}` : ""}
              </p>
              <p className="text-sm text-amber-900 mt-0.5">{c.blocker_note}</p>
            </div>
          )}

          {c.lost_feedback && (
            <div className="rounded-lg bg-rose-50 border border-rose-200 p-2.5">
              <p className="text-[10px] font-semibold text-rose-800 uppercase tracking-wide">
                Why we lost{c.lost_reason ? ` — ${c.lost_reason.replace(/_/g, " ")}` : ""}
              </p>
              <p className="text-sm text-rose-900 mt-0.5">{c.lost_feedback}</p>
              {c.comeback_at && (
                <p className="text-xs text-rose-700 mt-1">
                  Comeback {formatDateTime(c.comeback_at)}
                </p>
              )}
            </div>
          )}

          {c.they_reachout_on && (
            <p className="text-xs text-gray-500">They said they'd reach out: {c.they_reachout_on}</p>
          )}

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Next action
              </p>
              <input
                type="datetime-local"
                value={nextAt}
                onChange={(e) => setNextAt(e.target.value)}
                className={inputCls}
              />
            </div>
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Why
              </p>
              <input
                value={nextReason}
                onChange={(e) => setNextReason(e.target.value)}
                placeholder="Why are we calling them then?"
                className={inputCls}
              />
            </div>
          </div>

          <button
            onClick={() => setShowDetails((v) => !v)}
            className="text-xs text-gray-500 hover:text-gray-800 font-medium"
          >
            {showDetails ? "▾ Hide details & edit" : "▸ Details, background & edit"}
          </button>

          {showDetails && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                About this company
              </p>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={2}
                placeholder="Background that stays true: size, what they do, how their BD team works…"
                className={inputCls}
              />
            </div>
          )}
        </div>

        {/* Editable fields + contacts — collapsed by default (progressive disclosure). */}
        <div className={`space-y-3 ${showDetails ? "" : "hidden"}`}>
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Stage
            </p>
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value as Stage)}
              className={inputCls}
            >
              {ALL_STAGES.map((s) => (
                <option key={s} value={s}>
                  {STAGE_LABELS[s]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Temperature
            </p>
            <div className="flex gap-1.5">
              {TEMPERATURES.map((t) => (
                <Choice key={t} active={temperature === t} onClick={() => setTemperature(t)}>
                  {t}
                </Choice>
              ))}
            </div>
          </div>

          {isAccount && (
            <div>
              <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                Committed value (₹)
              </p>
              <input
                type="number"
                value={dealValue}
                onChange={(e) => setDealValue(e.target.value)}
                className={inputCls}
              />
              {c.next_purchase_due ? (
                <p className="text-xs text-gray-500 mt-1">
                  Next purchase {formatDateTime(c.next_purchase_due)}
                </p>
              ) : (
                <p className="text-xs text-rose-600 mt-1">
                  No next purchase date — a win without one goes quiet.
                </p>
              )}
            </div>
          )}

          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Contacts
            </p>
            {activeContacts.map((x) => (
              <p key={x.id} className="text-sm text-gray-700">
                {x.name || "Unnamed"}
                {x.role ? ` · ${x.role}` : ""}
                {x.phone ? ` · ${x.phone}` : ""}
              </p>
            ))}
            {pastContacts.map((x) => (
              <p key={x.id} className="text-xs text-gray-400 line-through">
                {x.name || x.phone}
                {x.left_note ? ` — ${x.left_note}` : ""}
              </p>
            ))}
            <AddContact companyId={c.id} onSaved={onSaved} />
            <button
              onClick={onContactChange}
              className="mt-1.5 text-xs text-sky-700 hover:underline font-medium"
            >
              Contact changed?
            </button>
          </div>

          {/* Independent of owner: they keep the company, I still chase it. */}
          <div className="rounded-lg border border-violet-200 bg-violet-50 p-2">
            <label className="flex items-center gap-2 text-sm text-gray-800">
              <input
                type="checkbox"
                checked={myFollowup}
                onChange={(e) => setMyFollowup(e.target.checked)}
                className="rounded"
              />
              I need to follow up
              {c.owner && <span className="text-xs text-gray-500">({c.owner} is handling it)</span>}
            </label>
            {myFollowup && (
              <input
                value={myFollowupNote}
                onChange={(e) => setMyFollowupNote(e.target.value)}
                placeholder="What do I need to chase?"
                className={inputCls + " mt-1.5 text-xs"}
              />
            )}
          </div>

          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              What we owe them
            </p>
            {FLAGS.map((f) => (
              <div key={f.key} className="mb-1.5">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!flags[f.key]}
                    onChange={(e) => setFlags({ ...flags, [f.key]: e.target.checked })}
                    className="rounded"
                  />
                  {f.label}
                </label>
                {flags[f.key] && (
                  <input
                    value={flagNotes[f.noteKey] ?? ""}
                    onChange={(e) => setFlagNotes({ ...flagNotes, [f.noteKey]: e.target.value })}
                    placeholder={f.placeholder}
                    className={inputCls + " mt-1 text-xs"}
                  />
                )}
              </div>
            ))}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              disabled={saving}
              onClick={save}
              className="flex-1 px-3 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <Link
              to={`/b2b-gtm/${c.id}`}
              className="px-3 py-2 rounded-xl bg-white text-gray-600 text-sm font-medium border border-gray-300 hover:bg-gray-50"
            >
              Full page
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * The guided next-action bar — the MCQ. Which buttons show is decided purely by
 * where the company IS (mcqBranchFor), so a cold Pre-GTM lead is never offered
 * "push to buy decision" and a won account isn't asked to log a cold call.
 *
 * The headline action for each branch matches the owner's real job: on my own
 * warm leads that's Push to buy decision / Exit; Vivaan's early leads it's
 * Hand to me; parked companies it's Bring back.
 */
function ActionBar({
  c,
  onCheckIn,
  onExit,
  onReactivate,
  onSaved,
}: {
  c: Company;
  onCheckIn: () => void;
  onExit: () => void;
  onReactivate: () => void;
  onSaved: () => void;
}) {
  const branch = mcqBranchFor(c);
  const [handing, setHanding] = useState(false);
  const [busy, setBusy] = useState(false);

  const promptText =
    branch === "pre_gtm"
      ? "Vivaan's lead — what's the move?"
      : branch === "mine_active"
      ? "Your call: push it forward or let it go?"
      : branch === "buy_decision"
      ? "In the buy decision — log how it's going."
      : branch === "blocked"
      ? "Blocked — chase it or park it?"
      : branch === "account"
      ? "Won account — keep it growing."
      : branch === "feedback"
      ? "Lost — capture feedback or schedule the comeback."
      : "Parked out of the pipeline.";

  // Hand a company to whoever works the buy decision. Reassigns owner, moves the
  // stage to negotiating, logs the handoff — all in one tap, via the note path.
  const handTo = async (owner: string) => {
    setBusy(true);
    try {
      await authedFetch("/api/b2b-gtm?action=note", {
        method: "POST",
        body: JSON.stringify({
          company_id: c.id,
          note: `Pushed to buy decision — handed to ${owner}.`,
          stage: "negotiating",
          new_owner: owner,
          next_action_at: addDays(new Date(), 2).toISOString(),
          next_action_reason: `${owner} to work the buy decision`,
        }),
      });
      toast.success(`Handed to ${owner}`);
      setHanding(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      <p className="text-[11px] font-semibold text-violet-800 uppercase tracking-wide mb-2">
        {promptText}
      </p>

      {handing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-700">Hand to whom?</span>
          {TEAM.filter((t) => t !== "Vivaan").map((t) => (
            <Choice key={t} onClick={() => handTo(t)}>
              {t}
            </Choice>
          ))}
          <button
            onClick={() => setHanding(false)}
            className="text-xs text-gray-500 hover:text-gray-800"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {branch === "exited" ? (
            <button
              onClick={onReactivate}
              className="px-3 py-1.5 rounded-xl bg-violet-500 text-white text-sm font-medium"
            >
              Bring back to pipeline
            </button>
          ) : (
            <>
              {(branch === "mine_active" || branch === "pre_gtm") && (
                <button
                  disabled={busy}
                  onClick={() => setHanding(true)}
                  className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-sm font-medium disabled:opacity-40"
                >
                  Push to buy decision →
                </button>
              )}
              <button
                onClick={onCheckIn}
                className="px-3 py-1.5 rounded-xl bg-white text-gray-800 text-sm font-medium border border-gray-300 hover:border-gray-400"
              >
                {branch === "buy_decision"
                  ? "Log demo / call"
                  : branch === "account"
                  ? "Log a touch"
                  : "Log a call"}
              </button>
              <button
                onClick={onExit}
                className="px-3 py-1.5 rounded-xl bg-white text-rose-600 text-sm font-medium border border-rose-200 hover:border-rose-300"
              >
                Remove from pipeline
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Add another person at a company that already exists — a second stakeholder,
 * not a replacement. Distinct from "Contact changed", which retires the old
 * contact; this one just adds alongside.
 */
function AddContact({ companyId, onSaved }: { companyId: number; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=contact", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          name: name.trim() || null,
          phone: phone.trim() || null,
          role: role.trim() || null,
        }),
      });
      toast.success("Contact added");
      setName("");
      setPhone("");
      setRole("");
      setOpen(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="mt-1.5 mr-3 text-xs text-violet-600 hover:underline font-medium"
      >
        + Add contact
      </button>
    );
  }

  return (
    <div className="mt-2 rounded-lg border border-gray-200 bg-gray-50 p-2">
      <div className="grid grid-cols-2 gap-1.5">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="px-2 py-1 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone"
          className="px-2 py-1 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
      </div>
      <input
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Role (optional)"
        className="w-full mt-1.5 px-2 py-1 rounded-lg border border-gray-300 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
      />
      <div className="flex justify-end gap-2 mt-1.5">
        <button onClick={() => setOpen(false)} className="text-xs text-gray-500">
          Cancel
        </button>
        <button
          disabled={saving || (!name.trim() && !phone.trim())}
          onClick={save}
          className="px-2.5 py-1 rounded-lg bg-neutral-900 text-white text-xs font-medium disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
    </div>
  );
}

/**
 * Assign a company without expanding the row. Saves on change.
 *
 * Deliberately a labelled control rather than a colour: a tint would collide
 * with the flag dots (yellow already means "brochure", green "needs leads")
 * and would still need memorising.
 */
function OwnerPicker({ c, onSaved }: { c: Company; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);

  const assign = async (value: string) => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=company", {
        method: "PATCH",
        body: JSON.stringify({ id: c.id, fields: { owner: value } }),
      });
      toast.success(value ? `Assigned to ${value}` : "Assigned to you");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <select
      value={c.owner ?? ""}
      disabled={saving}
      onChange={(e) => assign(e.target.value)}
      className={`text-xs rounded-full border px-2 py-0.5 cursor-pointer focus:outline-none focus:ring-2 focus:ring-violet-400 disabled:opacity-50 ${
        c.owner
          ? "bg-sky-100 text-sky-700 border-sky-200 font-medium"
          : "bg-white text-gray-400 border-gray-200"
      }`}
    >
      <option value="">Me</option>
      {TEAM.map((t) => (
        <option key={t} value={t}>
          {t}
        </option>
      ))}
    </select>
  );
}

/**
 * The running record. Every call, note and contact change, newest first, with
 * a box to add another. Notes are dated entries that never overwrite each
 * other — the accumulation is the context.
 */
function NotesFeed({ companyId, onSaved }: { companyId: number; onSaved: () => void }) {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState("");
  const [withDate, setWithDate] = useState(false);
  const [nextAt, setNextAt] = useState(toLocalInputValue(addDays(new Date(), 1)));
  const [saving, setSaving] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await authedFetch(`/api/b2b-gtm?company_id=${companyId}`);
      setLogs(d.logs || []);
    } catch {
      // The panel is still usable without the feed.
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=note", {
        method: "POST",
        body: JSON.stringify({
          company_id: companyId,
          note: text.trim(),
          next_action_at: withDate && nextAt ? new Date(nextAt).toISOString() : null,
        }),
      });
      setText("");
      setWithDate(false);
      toast.success("Note added");
      await load();
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const shown = showAll ? logs : logs.slice(0, 4);

  return (
    <div>
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
        Notes &amp; history {logs.length > 0 && <span className="text-gray-400">({logs.length})</span>}
      </p>

      <div className="rounded-lg border border-gray-200 bg-gray-50 p-2 mb-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          placeholder="What did they say? Their tone, any context — add as much as you like."
          className="w-full px-2 py-1.5 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
        />
        <div className="flex items-center gap-2 mt-1.5 flex-wrap">
          <label className="flex items-center gap-1.5 text-xs text-gray-600">
            <input
              type="checkbox"
              checked={withDate}
              onChange={(e) => setWithDate(e.target.checked)}
              className="rounded"
            />
            Set a follow-up
          </label>
          {withDate && (
            <input
              type="datetime-local"
              value={nextAt}
              onChange={(e) => setNextAt(e.target.value)}
              className="px-2 py-1 rounded-lg border border-gray-300 text-xs bg-white"
            />
          )}
          <button
            disabled={!text.trim() || saving}
            onClick={add}
            className="ml-auto px-3 py-1 rounded-lg bg-neutral-900 text-white text-xs font-medium disabled:opacity-40"
          >
            {saving ? "Adding…" : "Add note"}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-xs text-gray-400">Loading notes…</p>
      ) : logs.length === 0 ? (
        <p className="text-xs text-gray-400">
          Nothing logged yet — add the first note above with what they said and their tone.
        </p>
      ) : (
        <>
          <div className="space-y-1.5">
            {shown.map((l) => (
              <LogEntry key={l.id} l={l} />
            ))}
          </div>
          {logs.length > 4 && (
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-xs text-violet-600 hover:underline mt-1.5"
            >
              {showAll ? "Show less" : `Show all ${logs.length}`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function LogEntry({ l }: { l: CallLog }) {
  const tone =
    l.kind === "contact_change"
      ? "border-sky-200 bg-sky-50"
      : l.kind === "note"
      ? "border-violet-200 bg-violet-50"
      : l.kind === "handoff"
      ? "border-emerald-200 bg-emerald-50"
      : "border-gray-200 bg-white";
  return (
    <div className={`rounded-lg border p-2 ${tone}`}>
      {/* The event as a plain sentence — "Called them on 17th Jul 2026, no answer". */}
      <p className="text-sm text-gray-800">{logSentence(l)}</p>
      {l.note && <p className="text-sm text-gray-600 mt-0.5 italic">“{l.note}”</p>}
      <div className="flex items-center gap-1.5 flex-wrap text-[11px] mt-1">
        {l.attendees && <span className="text-gray-500">with {l.attendees}</span>}
        {l.objection && (
          <span className="px-1.5 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
            {l.objection === "other" && l.objection_note
              ? l.objection_note
              : OBJECTION_LABELS[l.objection]}
          </span>
        )}
        {l.value_discussed && (
          <span className="px-1.5 py-0.5 rounded-full font-medium bg-green-100 text-green-700 border border-green-200">
            {formatValue(l.value_discussed)}
          </span>
        )}
        {l.logged_by && <span className="text-gray-400 ml-auto">{l.logged_by.split("@")[0]}</span>}
      </div>
    </div>
  );
}

/**
 * Add a company to the top of the funnel. This is Vivaan's entry point: new
 * companies always land in Pre-GTM owned by Vivaan, who then hands to Me. Kept
 * deliberately minimal — the detail gets filled in once it's being worked.
 */
function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=company", {
        method: "POST",
        body: JSON.stringify({
          name,
          stage: "cold_call_done",
          owner: "Vivaan",
          whatsapp_group_made: false,
          notes: notes.trim() || null,
          next_action_at: addDays(new Date(), 1).toISOString(),
          next_action_reason: "Cold call / qualify",
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
        }),
      });
      toast.success("Added to Pre-GTM (Vivaan's)");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Add to Pre-GTM" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        New companies start in Pre-GTM as <span className="font-medium">Vivaan's</span> to cold-call
        and qualify. He hands each one to you once there's a WhatsApp group and they've seen sample
        leads.
      </p>
      <Field label="Company">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Contact name">
          <input
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Phone">
          <input
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>
      <Field label="Anything known so far (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="Where the lead came from, size, who to ask for…"
          className={inputCls}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">
          Cancel
        </button>
        <button
          disabled={!name.trim() || saving}
          onClick={save}
          className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add to Pre-GTM"}
        </button>
      </div>
    </Shell>
  );
}
