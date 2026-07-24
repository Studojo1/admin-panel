import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useModal } from "~/components/common/modal-context";
import { useAdminGuard } from "~/lib/auth-guard";
import type { Route } from "./+types/b2b-gtm";
import { CheckInModal, ContactChangeModal } from "~/components/b2b/check-in-modal";
import {
  Choice,
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
  BLOCKER_TYPES,
  EXITED_STAGES,
  FLAGS,
  OBJECTION_LABELS,
  STAGE_LABELS,
  STALE_ACCOUNT_DAYS,
  TEAM,
  TEAM_VIEWS,
  WORKING_BUCKETS,
  ROLES,
  matchesOwnerView,
  mcqBranchFor,
  nextRelayStep,
  ownerForSlug,
  ownerLabel,
  roleForCompany,
  slugForOwner,
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
  type BlockerType,
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
  const params = useParams();
  // On /b2b-gtm/team/:who this is that person's owner string; null on the board.
  const pageOwner = ownerForSlug(params.who);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [objectionStats, setObjectionStats] = useState<ObjectionStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Either a ViewKey, or "owner:<name>" for a teammate's sheet ("owner:" = mine).
  // A per-person page opens straight onto that person's sheet.
  const [view, setView] = useState<string>(pageOwner !== null ? `owner:${pageOwner}` : "overview");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [contactChange, setContactChange] = useState<Company | null>(null);
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

  // Follow the URL: navigating to another person's page switches the sheet.
  useEffect(() => {
    if (pageOwner !== null) setView(`owner:${pageOwner}`);
  }, [pageOwner]);

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
    // Overview is a roster — alphabetical, so it's easy to find a company by
    // name. Every other tab is a worklist, so it stays soonest-action-first.
    if (view === "overview") {
      return rows.sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    }
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
                {/* Each sheet is a real page you can bookmark / link to. */}
                <Link
                  to={`/b2b-gtm/team/${slugForOwner(t.owner)}`}
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
                </Link>
              </span>
            );
          })}
        </div>

        {/* A real page for the selected teammate: who they are, their load, and an
            inbox of companies just handed to them (last event is a handoff). */}
        {view.startsWith("owner:") && (
          <PersonHeader
            owner={view.slice(6)}
            companies={companies}
            now={now}
            onOpen={(id) => setExpanded(id)}
          />
        )}

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
                      "#",
                      "Company",
                      "Contact",
                      "Phone",
                      "Stage",
                      "Temp",
                      "Handled by",
                      "Next action",
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
                  {visible.map((c, i) => (
                    <Row
                      key={c.id}
                      c={c}
                      serial={i + 1}
                      now={now}
                      expanded={expanded === c.id}
                      onToggle={() => setExpanded(expanded === c.id ? null : c.id)}
                      onContactChange={() => setContactChange(c)}
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

/**
 * The header for a teammate's page: who they are, what they do, their load, and
 * an inbox of companies just handed to them — a company whose most recent event
 * is a handoff (so it was passed to them and nothing's been logged since). Gives
 * the relay a visible "new in your queue" surface.
 */
function PersonHeader({
  owner,
  companies,
  now,
  onOpen,
}: {
  owner: string;
  companies: Company[];
  now: Date;
  onOpen: (id: number) => void;
}) {
  const label = ownerLabel(owner);
  const role = ROLES.find((r) => r.owners.includes(owner));
  const mine = companies.filter((c) => matchesOwnerView(c, owner));
  const overdue = mine.filter((c) => isOverdue(c.next_action_at, now));
  // Freshly handed to them: the latest event on the company is a handoff.
  const inbox = mine.filter((c) => c.last_log?.kind === "handoff");

  return (
    <div className="mb-4 rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2
            className="text-lg font-bold text-gray-900"
            style={{ fontFamily: "Clash Display, sans-serif" }}
          >
            {label}'s pipeline
          </h2>
          {role && <p className="text-xs text-gray-500 mt-0.5">{role.does}</p>}
          <Link to="/b2b-gtm" className="text-[11px] text-violet-600 hover:underline">
            ← Whole board
          </Link>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <div className="text-center">
            <p className="text-lg font-bold text-gray-900">{mine.length}</p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">In queue</p>
          </div>
          <div className="text-center">
            <p className={`text-lg font-bold ${overdue.length ? "text-violet-600" : "text-gray-900"}`}>
              {overdue.length}
            </p>
            <p className="text-[10px] uppercase tracking-wide text-gray-400">Overdue</p>
          </div>
        </div>
      </div>

      {inbox.length > 0 && (
        <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 p-3">
          <p className="text-[11px] font-semibold text-violet-800 uppercase tracking-wide mb-2">
            Just handed to you ({inbox.length}) — pick these up first
          </p>
          <div className="flex flex-wrap gap-2">
            {inbox.map((c) => (
              <button
                key={c.id}
                onClick={() => onOpen(c.id)}
                className="px-2.5 py-1 rounded-lg bg-white border border-violet-300 text-sm text-violet-800 hover:border-violet-400"
                title={c.last_log?.note || undefined}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({
  c,
  serial,
  now,
  expanded,
  onToggle,
  onContactChange,
  onReactivate,
  onSaved,
}: {
  c: Company;
  serial: number;
  now: Date;
  expanded: boolean;
  onToggle: () => void;
  onContactChange: () => void;
  onReactivate: () => void;
  onSaved: () => void;
}) {
  const overdue = isOverdue(c.next_action_at, now);
  const today = isLaterToday(c.next_action_at, now);
  const contact = (c.contacts || []).find((x) => !x.is_inactive) ?? c.contacts?.[0];
  // The active contact may have no number while a past one does (e.g. the person
  // left and their replacement's phone isn't in yet). Surface any number we hold
  // so the row is never blank when we can actually reach someone.
  const phone = contact?.phone || (c.contacts || []).find((x) => x.phone)?.phone || null;
  const isAccount = WON_STAGES.includes(c.stage);
  const exited = EXITED_STAGES.includes(c.stage);
  const quiet = daysSince(c.last_log?.called_at ?? c.updated_at, now);
  const stale = (isAccount || c.stage === "gtm_active") && quiet !== null && quiet > STALE_ACCOUNT_DAYS;

  return (
    <>
      <tr
        onClick={onToggle}
        className={`cursor-pointer hover:bg-gray-50 ${expanded ? "bg-gray-50" : ""} ${
          overdue ? "border-l-4 border-l-violet-500" : ""
        }`}
      >
        <td className="px-3 py-2.5 text-gray-400 w-6">{expanded ? "▾" : "▸"}</td>
        <td className="px-3 py-2.5 text-gray-400 tabular-nums text-xs w-8">{serial}</td>
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
          {phone ? (
            <a
              href={`tel:${phone}`}
              onClick={(e) => e.stopPropagation()}
              className="text-violet-600 hover:underline"
            >
              {phone}
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
      </tr>

      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={9} className="px-3 pb-4 pt-1">
            <ExpandedPanel
              c={c}
              onContactChange={onContactChange}
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
  onContactChange,
  onReactivate,
  onSaved,
}: {
  c: Company;
  onContactChange: () => void;
  onReactivate: () => void;
  onSaved: () => void;
}) {
  // The expanded row is the guided flow and nothing else. Notes, history and
  // editing all live on the full page, reached only via "Study past
  // interactions". Clicking "Log a call" opens the wizard inline right here.
  const [logging, setLogging] = useState(false);

  if (logging) {
    return (
      <CheckInModal
        company={c}
        variant="inline"
        onClose={() => setLogging(false)}
        onSaved={() => {
          setLogging(false);
          onSaved();
        }}
      />
    );
  }

  return (
    <ActionBar
      c={c}
      onLog={() => setLogging(true)}
      onContactChange={onContactChange}
      onReactivate={onReactivate}
      onSaved={onSaved}
    />
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
  onLog,
  onContactChange,
  onReactivate,
  onSaved,
}: {
  c: Company;
  onLog: () => void;
  onContactChange: () => void;
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

  // The next relay hand for this company: who it goes to, the stage it lands in,
  // and why. Null when there's no obvious next hand (already with Ayushi, won,
  // lost, parked).
  const relay = nextRelayStep(c);

  // Advance down the relay: reassign owner, move the stage, log the handoff —
  // one tap, via the note path. `owner` lets the Me→Deal step pick Jeremy/Hegde.
  const advance = async (owner: string, stage: Stage, reason: string) => {
    setBusy(true);
    try {
      await authedFetch("/api/b2b-gtm?action=note", {
        method: "POST",
        body: JSON.stringify({
          company_id: c.id,
          note: `Advanced — ${reason}.`,
          stage,
          new_owner: owner,
          next_action_at: addDays(new Date(), 2).toISOString(),
          next_action_reason: reason,
        }),
      });
      toast.success(`Handed to ${ownerLabel(owner)}`);
      setHanding(false);
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(false);
    }
  };

  // The Me→Deal hand needs a person choice (Jeremy or Hegde); every other relay
  // step has a single fixed destination.
  const relayNeedsChoice = relay?.owner === "Jeremy" && roleForCompany(c) === "Me";

  const logLabel =
    branch === "buy_decision" ? "Log demo / call" : branch === "account" ? "Log a touch" : "Log a call";

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50/60 p-3">
      <p className="text-[11px] font-semibold text-violet-800 uppercase tracking-wide mb-2">
        {branch === "exited" ? promptText : "What do you want to do?"}
      </p>

      {handing ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-gray-700">Hand to whom?</span>
          {["Jeremy", "Hegde"].map((t) => (
            <Choice key={t} onClick={() => advance(t, "negotiating", `${t} to demo & work the deal`)}>
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
      ) : branch === "exited" ? (
        <button
          onClick={onReactivate}
          className="px-3 py-1.5 rounded-xl bg-violet-500 text-white text-sm font-medium"
        >
          Bring back to pipeline
        </button>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {/* Log an interaction — the common move — first and boldest. */}
            <button
              onClick={onLog}
              className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700"
            >
              {logLabel}
            </button>
            {/* The only way to the full page. */}
            <Link
              to={`/b2b-gtm/${c.id}`}
              className="px-4 py-2 rounded-xl bg-white text-gray-800 text-sm font-medium border border-gray-300 hover:border-gray-400"
            >
              Study past interactions →
            </Link>
            {/* Relay advance — hand to the next person. Confirmed by tapping,
                never automatic. Remove-from-pipeline lives on the full page. */}
            {relay && (
              <button
                disabled={busy}
                onClick={() =>
                  relayNeedsChoice
                    ? setHanding(true)
                    : advance(relay.owner, relay.stage, relay.reason)
                }
                className="px-4 py-2 rounded-xl bg-white text-violet-700 text-sm font-medium border border-violet-300 hover:border-violet-400 disabled:opacity-40"
                title={relay.reason}
              >
                {roleForCompany(c) === "Deal"
                  ? "Hand to Ayushi to close →"
                  : roleForCompany(c) === "Vivaan"
                  ? "Hand to me →"
                  : "Push to buy decision →"}
              </button>
            )}
          </div>
          <button
            onClick={onContactChange}
            className="mt-2 text-xs text-sky-700 hover:underline font-medium"
          >
            Contact changed?
          </button>
        </>
      )}
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

/** Interest read from the cold call — drives the starting temperature. */
const INTEREST_OPTS = [
  { key: "interested", label: "Interested", temp: "hot" as Temperature },
  { key: "some", label: "Some interest", temp: "warm" as Temperature },
  { key: "too_early", label: "Too early to tell", temp: "neutral" as Temperature },
  { key: "not_really", label: "Not really", temp: "cold" as Temperature },
];

/**
 * Vivaan's intake sheet. He's cold-called and made a WhatsApp group; here he
 * drops in the company + what he learned, so the handoff to Pranav carries real
 * context instead of a blank row. The qualification is written as the first
 * note (a proper handoff brief) — the next owner arrives knowing the situation.
 */
function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [interest, setInterest] = useState<string | null>(null);
  const [hasBlock, setHasBlock] = useState<boolean | null>(null);
  const [blockType, setBlockType] = useState<BlockerType | null>(null);
  const [blockNote, setBlockNote] = useState("");
  const [notes, setNotes] = useState("");
  const [groupMade, setGroupMade] = useState(true);
  const [saving, setSaving] = useState(false);

  const interestOpt = INTEREST_OPTS.find((o) => o.key === interest);
  // Enough to hand over: who it is, and a read on interest.
  const canSave = !!name.trim() && !!interest && (hasBlock !== true || !!blockType);

  const save = async () => {
    setSaving(true);
    try {
      // Compose the handoff brief — reads back as one note on the timeline.
      const parts = [
        `Cold call by Vivaan. Interest: ${interestOpt?.label ?? "—"}.`,
        hasBlock && blockType
          ? `Block: ${BLOCKER_LABELS[blockType]}${blockNote.trim() ? ` — ${blockNote.trim()}` : ""}.`
          : hasBlock === false
          ? "No block raised."
          : "",
        notes.trim() ? `Notes: ${notes.trim()}` : "",
      ].filter(Boolean);

      await authedFetch("/api/b2b-gtm?action=company", {
        method: "POST",
        body: JSON.stringify({
          name,
          stage: "cold_call_done",
          owner: "Vivaan",
          temperature: interestOpt?.temp ?? null,
          whatsapp_group_made: groupMade,
          notes: parts.join(" "),
          next_action_at: addDays(new Date(), 1).toISOString(),
          next_action_reason: "Vivaan to hand to Pranav",
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
        }),
      });
      toast.success("Added to Pre-GTM — briefed for handoff to Pranav");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Vivaan — add a company" onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        Cold-called them and made a WhatsApp group? Drop them in here with what you learned. It lands
        in Pre-GTM as yours, briefed and ready to hand to Pranav.
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

      <Field label="Were they interested?">
        <div className="flex flex-wrap gap-2">
          {INTEREST_OPTS.map((o) => (
            <Choice key={o.key} active={interest === o.key} onClick={() => setInterest(o.key)}>
              {o.label}
            </Choice>
          ))}
        </div>
      </Field>

      <Field label="Did you hit any block?">
        <div className="flex flex-wrap gap-2">
          <Choice active={hasBlock === true} onClick={() => setHasBlock(true)}>
            Yes
          </Choice>
          <Choice active={hasBlock === false} onClick={() => { setHasBlock(false); setBlockType(null); }}>
            No
          </Choice>
        </div>
      </Field>

      {hasBlock === true && (
        <>
          <Field label="What was the block?">
            <div className="flex flex-wrap gap-2">
              {BLOCKER_TYPES.map((b) => (
                <Choice key={b} active={blockType === b} onClick={() => setBlockType(b)}>
                  {BLOCKER_LABELS[b]}
                </Choice>
              ))}
            </div>
          </Field>
          <Field label="Block detail (optional)">
            <input
              value={blockNote}
              onChange={(e) => setBlockNote(e.target.value)}
              placeholder="e.g. wants pricing before committing"
              className={inputCls}
            />
          </Field>
        </>
      )}

      <Field label="Anything else for Pranav? (optional)">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          placeholder="Their tone, company size, who really decides, what they asked for…"
          className={inputCls}
        />
      </Field>

      <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
        <input
          type="checkbox"
          checked={groupMade}
          onChange={(e) => setGroupMade(e.target.checked)}
          className="rounded"
        />
        WhatsApp group made
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">
          Cancel
        </button>
        <button
          disabled={!canSave || saving}
          onClick={save}
          className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Add & brief for handoff"}
        </button>
      </div>
    </Shell>
  );
}
