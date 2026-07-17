import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { useModal } from "~/components/common/modal-context";
import { toast } from "sonner";
import type { Route } from "./+types/b2b-gtm";
import {
  ALL_STAGES,
  BLOCKED_STAGES,
  BLOCKER_TYPES,
  LOST_REASONS,
  LOST_REASON_LABELS,
  OBJECTIONS,
  OBJECTION_LABELS,
  OUTCOMES,
  OUTCOME_LABELS,
  STAGE_LABELS,
  STALE_ACCOUNT_DAYS,
  TEMPERATURES,
  VIEWS,
  WON_STAGES,
  addDays,
  addHours,
  addMinutes,
  companyMatchesView,
  daysSince,
  formatDateTime,
  formatValue,
  isOverdue,
  objectionRequired,
  stageForOutcome,
  suggestNextAction,
  toLocalInputValue,
  type BlockerType,
  type CallLog,
  type Company,
  type LostReason,
  type Objection,
  type Outcome,
  type Stage,
  type Temperature,
  type ViewKey,
} from "~/lib/b2b-gtm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "B2B GTM Motion – Admin Panel" }];
}

async function authedFetch(url: string, opts: RequestInit = {}) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

interface Stats {
  total: number;
  due_now: number;
  hot: number;
  blocked: number;
  brochures: number;
  accounts: number;
  renewals_due: number;
  committed_value: string;
}

const TEMP_STYLES: Record<Temperature, string> = {
  hot: "bg-red-100 text-red-700 border-red-200",
  warm: "bg-orange-100 text-orange-700 border-orange-200",
  neutral: "bg-gray-100 text-gray-600 border-gray-200",
  cold: "bg-blue-100 text-blue-700 border-blue-200",
};

function TempBadge({ t }: { t: Temperature | null }) {
  if (!t) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${TEMP_STYLES[t]}`}
    >
      {t}
    </span>
  );
}

function StageBadge({ s }: { s: Stage }) {
  const won = WON_STAGES.includes(s);
  const blocked = BLOCKED_STAGES.includes(s);
  const lost = s.startsWith("closed_lost") || s === "feedback_pending" || s === "comeback_scheduled";
  const cls = won
    ? "bg-green-100 text-green-700 border-green-200"
    : blocked
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : lost
    ? "bg-rose-100 text-rose-700 border-rose-200"
    : "bg-violet-100 text-violet-700 border-violet-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {STAGE_LABELS[s] ?? s}
    </span>
  );
}

function BrochureBadge() {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
      Brochure needed
    </span>
  );
}

export default function B2BGtm() {
  const { isAuthorized, isPending } = useAdminGuard();
  const { showConfirm } = useModal();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [objectionStats, setObjectionStats] = useState<{ objection: string; n: number }[]>([]);
  const [me, setMe] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("overview");
  const [search, setSearch] = useState("");
  const [checkIn, setCheckIn] = useState<Company | null>(null);
  const [detail, setDetail] = useState<Company | null>(null);
  const [adding, setAdding] = useState(false);
  const notifiedRef = useRef<Set<number>>(new Set());

  const load = useCallback(async () => {
    try {
      const data = await authedFetch("/api/b2b-gtm");
      setCompanies(data.companies || []);
      setStats(data.stats || null);
      setObjectionStats(data.objection_stats || []);
      setMe(data.me || "");
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

  // Ask once, up front, so the 30-minute callbacks can actually reach you.
  useEffect(() => {
    if (isPending || !isAuthorized) return;
    if (typeof Notification === "undefined") return;
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, [isPending, isAuthorized]);

  // Poll for due items. Fires an OS notification even when the tab is backgrounded.
  useEffect(() => {
    if (isPending || !isAuthorized) return;
    const tick = () => {
      const now = new Date();
      for (const c of companies) {
        if (!isOverdue(c.next_action_at, now)) continue;
        if (notifiedRef.current.has(c.id)) continue;
        notifiedRef.current.add(c.id);
        if (typeof Notification !== "undefined" && Notification.permission === "granted") {
          const contact = c.contacts?.[0]?.name ? ` (${c.contacts[0].name})` : "";
          new Notification(`Call ${c.name}${contact}`, {
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

  const now = new Date();

  const dueList = useMemo(
    () =>
      companies
        .filter((c) => isOverdue(c.next_action_at, now))
        .sort(
          (a, b) =>
            new Date(a.next_action_at!).getTime() - new Date(b.next_action_at!).getTime()
        ),
    [companies]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (!companyMatchesView(c, view, now)) return false;
      if (!q) return true;
      const hay = [c.name, c.notes, ...(c.contacts || []).map((x) => x.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [companies, view, search]);

  if (isPending) return null;

  const seed = async () => {
    const ok = await showConfirm(
      "Import the 21 rows from B2B GTM Motion - Sheet1.csv? Stages are inferred from your notes and will need a quick review. Does nothing if leads already exist.",
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
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h1
              className="text-2xl font-bold text-gray-900"
              style={{ fontFamily: "Clash Display, sans-serif" }}
            >
              B2B GTM Motion
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Every lead always has a next action. A win is a baseline to grow, a no is feedback to
              collect.
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button
              onClick={() => setAdding(true)}
              className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium border-2 border-neutral-900 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all"
            >
              + Add company
            </button>
            {companies.length === 0 && !loading && (
              <button
                onClick={seed}
                className="px-4 py-2 rounded-xl bg-white text-gray-700 text-sm font-medium border border-gray-300 hover:bg-gray-50"
              >
                Import Excel
              </button>
            )}
          </div>
        </div>

        {dueList.length > 0 && (
          <div className="mb-6 rounded-2xl border-2 border-neutral-900 bg-violet-500 text-white px-5 py-4 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <p className="font-bold" style={{ fontFamily: "Clash Display, sans-serif" }}>
              {dueList.length} {dueList.length === 1 ? "call" : "calls"} due now
            </p>
            <p className="text-sm text-violet-50 mt-0.5">
              {dueList
                .slice(0, 4)
                .map((c) => c.name)
                .join(", ")}
              {dueList.length > 4 ? ` and ${dueList.length - 4} more` : ""}
            </p>
            <button
              onClick={() => setView("today")}
              className="mt-2 text-sm font-medium underline underline-offset-2"
            >
              Open today's list
            </button>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            {[
              { label: "Due now", value: stats.due_now, alert: stats.due_now > 0 },
              { label: "Hot", value: stats.hot },
              { label: "Blocked", value: stats.blocked },
              { label: "Accounts", value: stats.accounts },
              { label: "Renewals ≤7d", value: stats.renewals_due, alert: stats.renewals_due > 0 },
              { label: "Brochures", value: stats.brochures, alert: stats.brochures > 0 },
              { label: "Committed", value: formatValue(stats.committed_value) },
            ].map((s) => (
              <div
                key={s.label}
                className={`bg-white rounded-2xl border p-4 shadow-sm ${
                  s.alert ? "border-violet-400" : "border-gray-200"
                }`}
              >
                <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                  {s.label}
                </p>
                <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-6">
          <nav className="w-48 shrink-0">
            <ul className="space-y-1">
              {VIEWS.map((v) => {
                const count = companies.filter((c) => companyMatchesView(c, v.key, now)).length;
                return (
                  <li key={v.key}>
                    <button
                      onClick={() => setView(v.key)}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm flex justify-between items-center ${
                        view === v.key
                          ? "bg-neutral-900 text-white font-medium"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <span>{v.label}</span>
                      <span className={view === v.key ? "text-gray-300" : "text-gray-400"}>
                        {count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {objectionStats.length > 0 && (
              <div className="mt-6 bg-white rounded-2xl border border-gray-200 p-4">
                <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
                  Why we lose
                </p>
                {objectionStats.map((o) => (
                  <div key={o.objection} className="flex justify-between text-xs py-0.5">
                    <span className="text-gray-600">
                      {OBJECTION_LABELS[o.objection as Objection] ?? o.objection}
                    </span>
                    <span className="font-semibold text-gray-900">{o.n}</span>
                  </div>
                ))}
              </div>
            )}
          </nav>

          <div className="flex-1 min-w-0">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search company, contact or notes…"
              className="w-full mb-4 px-4 py-2 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
            />

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
              <div className="space-y-3">
                {visible.map((c) => (
                  <LeadCard
                    key={c.id}
                    c={c}
                    now={now}
                    onCheckIn={() => setCheckIn(c)}
                    onOpen={() => setDetail(c)}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {checkIn && (
        <CheckInModal
          company={checkIn}
          onClose={() => setCheckIn(null)}
          onSaved={() => {
            setCheckIn(null);
            notifiedRef.current.delete(checkIn.id);
            load();
          }}
        />
      )}

      {detail && (
        <DetailModal
          company={detail}
          me={me}
          onClose={() => setDetail(null)}
          onSaved={() => {
            setDetail(null);
            load();
          }}
        />
      )}

      {adding && <AddModal onClose={() => setAdding(false)} onSaved={() => { setAdding(false); load(); }} />}
    </div>
  );
}

function LeadCard({
  c,
  now,
  onCheckIn,
  onOpen,
}: {
  c: Company;
  now: Date;
  onCheckIn: () => void;
  onOpen: () => void;
}) {
  const overdue = isOverdue(c.next_action_at, now);
  const contact = c.contacts?.[0];
  const isAccount = WON_STAGES.includes(c.stage);
  const quiet = daysSince(c.last_log?.called_at ?? c.updated_at, now);
  const stale = isAccount && quiet !== null && quiet > STALE_ACCOUNT_DAYS;

  return (
    <div
      className={`bg-white rounded-2xl border shadow-sm p-4 ${
        overdue ? "border-violet-400" : "border-gray-200"
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={onOpen}
              className="font-semibold text-gray-900 hover:text-violet-600 truncate"
            >
              {c.name}
            </button>
            <StageBadge s={c.stage} />
            <TempBadge t={c.temperature} />
            {c.needs_brochure && <BrochureBadge />}
            {c.owner && (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700 border border-sky-200">
                {c.owner}
              </span>
            )}
            {stale && (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 border border-rose-200">
                Quiet {quiet}d
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 mt-1">
            {contact?.name || "No contact"}
            {contact?.phone ? ` · ${contact.phone}` : ""}
            {isAccount && c.deal_value ? ` · ${formatValue(c.deal_value)}` : ""}
            {isAccount && c.next_purchase_due
              ? ` · next purchase ${formatDateTime(c.next_purchase_due)}`
              : ""}
          </p>

          {(c.last_log?.note || c.notes) && (
            <p className="text-sm text-gray-600 mt-2 line-clamp-2">{c.last_log?.note || c.notes}</p>
          )}

          {c.blocker_note && (
            <p className="text-xs text-amber-700 mt-1">Blocker: {c.blocker_note}</p>
          )}
          {c.lost_feedback && (
            <p className="text-xs text-rose-700 mt-1">Feedback: {c.lost_feedback}</p>
          )}

          <div className="mt-2 text-xs">
            {c.next_action_at ? (
              <span className={overdue ? "text-violet-700 font-medium" : "text-gray-500"}>
                {overdue ? "Due " : "Next "}
                {formatDateTime(c.next_action_at)}
                {c.next_action_reason ? ` — ${c.next_action_reason}` : ""}
              </span>
            ) : (
              <span className="text-rose-600 font-medium">
                No next action set{c.next_action_reason ? ` — note: ${c.next_action_reason}` : ""}
              </span>
            )}
          </div>
        </div>

        <button
          onClick={onCheckIn}
          className="shrink-0 px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-700"
        >
          Log call
        </button>
      </div>
    </div>
  );
}

function CheckInModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [pickedUp, setPickedUp] = useState<boolean | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [objection, setObjection] = useState<Objection | null>(null);
  const [temperature, setTemperature] = useState<Temperature | null>(company.temperature);
  const [note, setNote] = useState("");
  const [blockerType, setBlockerType] = useState<BlockerType | null>(company.blocker_type);
  const [blockerNote, setBlockerNote] = useState("");
  const [lostReason, setLostReason] = useState<LostReason | null>(null);
  const [lostFeedback, setLostFeedback] = useState("");
  const [competitorExpiry, setCompetitorExpiry] = useState("");
  const [dealValue, setDealValue] = useState(company.deal_value ?? "");
  const [nextPurchaseDue, setNextPurchaseDue] = useState("");
  const [nextAt, setNextAt] = useState("");
  const [nextReason, setNextReason] = useState("");
  const [saving, setSaving] = useState(false);

  // Re-suggest whenever the answers change. Always overridable.
  useEffect(() => {
    if (pickedUp === null) return;
    const s = suggestNextAction({
      pickedUp,
      outcome,
      temperature,
      lostReason,
      competitorExpiry: competitorExpiry ? new Date(competitorExpiry) : null,
      nextPurchaseDue: nextPurchaseDue ? new Date(nextPurchaseDue) : null,
      stage: company.stage,
    });
    setNextAt(toLocalInputValue(s.at));
    setNextReason(s.reason);
  }, [pickedUp, outcome, temperature, lostReason, competitorExpiry, nextPurchaseDue, company.stage]);

  const quick = (d: Date, reason: string) => {
    setNextAt(toLocalInputValue(d));
    setNextReason(reason);
  };

  const needsObjection = outcome ? objectionRequired(outcome) : false;
  const lostIncomplete = outcome === "closed_lost" && (!lostReason || !lostFeedback.trim());
  const canSave =
    pickedUp !== null &&
    !!nextAt &&
    (pickedUp === false ||
      (!!outcome && (!needsObjection || !!objection) && !lostIncomplete));

  const save = async () => {
    setSaving(true);
    try {
      const stage = outcome
        ? stageForOutcome(outcome, company.stage, blockerType)
        : null;
      await authedFetch("/api/b2b-gtm?action=log", {
        method: "POST",
        body: JSON.stringify({
          company_id: company.id,
          contact_id: company.contacts?.[0]?.id ?? null,
          picked_up: pickedUp,
          outcome,
          objection,
          temperature_at_time: temperature,
          note: note.trim() || null,
          next_action_at: new Date(nextAt).toISOString(),
          next_action_reason: nextReason,
          value_discussed: dealValue === "" ? null : Number(dealValue),
          stage,
          blocker_type: outcome === "blocked" ? blockerType : undefined,
          blocker_note: outcome === "blocked" ? blockerNote : undefined,
          lost_reason: outcome === "closed_lost" ? lostReason : undefined,
          lost_feedback: outcome === "closed_lost" ? lostFeedback : undefined,
          comeback_at:
            outcome === "closed_lost" ? new Date(nextAt).toISOString() : undefined,
          next_purchase_due:
            outcome === "closed_won" && nextPurchaseDue
              ? new Date(nextPurchaseDue).toISOString()
              : undefined,
        }),
      });
      toast.success("Logged");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={`Log call — ${company.name}`} onClose={onClose}>
      {(company.last_log?.note || company.notes) && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 mb-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Where we left things off
          </p>
          <p className="text-sm text-gray-700">{company.last_log?.note || company.notes}</p>
        </div>
      )}

      <Field label="Did they pick up?">
        <div className="flex gap-2">
          <Choice active={pickedUp === true} onClick={() => setPickedUp(true)}>
            Yes
          </Choice>
          <Choice active={pickedUp === false} onClick={() => setPickedUp(false)}>
            No
          </Choice>
        </div>
      </Field>

      {pickedUp === false && (
        <Field label="When should we try again?">
          <div className="flex flex-wrap gap-2">
            <Choice onClick={() => quick(addMinutes(new Date(), 30), "Retry — no answer")}>
              30 min
            </Choice>
            <Choice onClick={() => quick(addHours(new Date(), 1), "Retry — no answer")}>1 hr</Choice>
            <Choice onClick={() => quick(addHours(new Date(), 2), "Retry — no answer")}>2 hrs</Choice>
            <Choice onClick={() => quick(addDays(new Date(), 1), "Retry — no answer")}>
              Tomorrow
            </Choice>
          </div>
        </Field>
      )}

      {pickedUp === true && (
        <>
          <Field label="How did it go?">
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <Choice key={o} active={outcome === o} onClick={() => setOutcome(o)}>
                  {OUTCOME_LABELS[o]}
                </Choice>
              ))}
            </div>
          </Field>

          {needsObjection && (
            <Field label="What's the objection? (required)">
              <div className="grid grid-cols-2 gap-2">
                {OBJECTIONS.map((o) => (
                  <Choice key={o} active={objection === o} onClick={() => setObjection(o)}>
                    {OBJECTION_LABELS[o]}
                  </Choice>
                ))}
              </div>
            </Field>
          )}

          {outcome === "blocked" && (
            <>
              <Field label="What's blocking them?">
                <div className="flex flex-wrap gap-2">
                  {BLOCKER_TYPES.map((b) => (
                    <Choice key={b} active={blockerType === b} onClick={() => setBlockerType(b)}>
                      {b}
                    </Choice>
                  ))}
                </div>
              </Field>
              <Field label="Blocker detail">
                <input
                  value={blockerNote}
                  onChange={(e) => setBlockerNote(e.target.value)}
                  placeholder="e.g. waiting on their tech team to sign off"
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {outcome === "closed_won" && (
            <>
              <Field label="Deal value (₹) — this is the floor, not the finish line">
                <input
                  type="number"
                  value={dealValue}
                  onChange={(e) => setDealValue(e.target.value)}
                  className={inputCls}
                />
              </Field>
              <Field label="When should they buy again?">
                <input
                  type="datetime-local"
                  value={nextPurchaseDue}
                  onChange={(e) => setNextPurchaseDue(e.target.value)}
                  className={inputCls}
                />
              </Field>
            </>
          )}

          {outcome === "closed_lost" && (
            <>
              <Field label="Why? (required)">
                <div className="grid grid-cols-2 gap-2">
                  {LOST_REASONS.map((r) => (
                    <Choice key={r} active={lostReason === r} onClick={() => setLostReason(r)}>
                      {LOST_REASON_LABELS[r]}
                    </Choice>
                  ))}
                </div>
              </Field>
              {lostReason === "competitor_contract" && (
                <Field label="When does their contract expire? The window reopens then.">
                  <input
                    type="datetime-local"
                    value={competitorExpiry}
                    onChange={(e) => setCompetitorExpiry(e.target.value)}
                    className={inputCls}
                  />
                </Field>
              )}
              <Field label="Their feedback — what would have changed this? (required)">
                <textarea
                  value={lostFeedback}
                  onChange={(e) => setLostFeedback(e.target.value)}
                  rows={2}
                  className={inputCls}
                />
              </Field>
            </>
          )}

          <Field label="Temperature now">
            <div className="flex gap-2">
              {TEMPERATURES.map((t) => (
                <Choice key={t} active={temperature === t} onClick={() => setTemperature(t)}>
                  {t}
                </Choice>
              ))}
            </div>
          </Field>

          <Field label="Notes">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="What did they actually say?"
              className={inputCls}
            />
          </Field>
        </>
      )}

      {pickedUp !== null && (
        <Field label="Next action">
          <input
            type="datetime-local"
            value={nextAt}
            onChange={(e) => setNextAt(e.target.value)}
            className={inputCls}
          />
          <input
            value={nextReason}
            onChange={(e) => setNextReason(e.target.value)}
            placeholder="Why are we calling them then?"
            className={inputCls + " mt-2"}
          />
          <p className="text-xs text-gray-400 mt-1">Suggested by rule — change it freely.</p>
        </Field>
      )}

      {lostIncomplete && (
        <p className="text-xs text-rose-600 mb-3">
          A no needs a reason and feedback. That's the whole point of asking.
        </p>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900">
          Cancel
        </button>
        <button
          disabled={!canSave || saving}
          onClick={save}
          className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Shell>
  );
}

function DetailModal({
  company,
  me,
  onClose,
  onSaved,
}: {
  company: Company;
  me: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [stage, setStage] = useState<Stage>(company.stage);
  const [owner, setOwner] = useState(company.owner ?? "");
  const [needsBrochure, setNeedsBrochure] = useState(company.needs_brochure);
  const [whatsapp, setWhatsapp] = useState(company.whatsapp_group_made);
  const [dealValue, setDealValue] = useState(company.deal_value ?? "");
  const [nextPurchaseDue, setNextPurchaseDue] = useState(
    company.next_purchase_due ? toLocalInputValue(new Date(company.next_purchase_due)) : ""
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    authedFetch(`/api/b2b-gtm?company_id=${company.id}`)
      .then((d) => setLogs(d.logs || []))
      .catch(() => {});
  }, [company.id]);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=company", {
        method: "PATCH",
        body: JSON.stringify({
          id: company.id,
          fields: {
            stage,
            owner,
            needs_brochure: needsBrochure,
            whatsapp_group_made: whatsapp,
            deal_value: dealValue === "" ? null : Number(dealValue),
            next_purchase_due: nextPurchaseDue ? new Date(nextPurchaseDue).toISOString() : null,
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
    <Shell title={company.name} onClose={onClose} wide>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <Field label="Stage">
          <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className={inputCls}>
            {ALL_STAGES.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Owner (leave blank if it's yours)">
          <input
            value={owner}
            onChange={(e) => setOwner(e.target.value)}
            placeholder={me}
            className={inputCls}
          />
        </Field>
        <Field label="Deal value (₹)">
          <input
            type="number"
            value={dealValue}
            onChange={(e) => setDealValue(e.target.value)}
            className={inputCls}
          />
        </Field>
        <Field label="Next purchase due">
          <input
            type="datetime-local"
            value={nextPurchaseDue}
            onChange={(e) => setNextPurchaseDue(e.target.value)}
            className={inputCls}
          />
        </Field>
      </div>

      <div className="flex gap-4 mb-4">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={whatsapp}
            onChange={(e) => setWhatsapp(e.target.checked)}
            className="rounded"
          />
          WhatsApp group made
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input
            type="checkbox"
            checked={needsBrochure}
            onChange={(e) => setNeedsBrochure(e.target.checked)}
            className="rounded"
          />
          Needs a brochure
        </label>
      </div>

      <div className="flex justify-end gap-2 mb-6">
        <button
          disabled={saving}
          onClick={save}
          className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </div>

      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
        Timeline ({logs.length})
      </p>
      <div className="space-y-2 max-h-72 overflow-y-auto">
        {logs.length === 0 && <p className="text-sm text-gray-400">No calls logged yet.</p>}
        {logs.map((l) => (
          <div key={l.id} className="rounded-xl border border-gray-200 p-3 bg-gray-50">
            <div className="flex items-center gap-2 flex-wrap text-xs">
              <span className="text-gray-500">{formatDateTime(l.called_at)}</span>
              <span
                className={`px-2 py-0.5 rounded-full font-medium border ${
                  l.picked_up
                    ? "bg-green-100 text-green-700 border-green-200"
                    : "bg-gray-100 text-gray-500 border-gray-200"
                }`}
              >
                {l.picked_up ? "Picked up" : "No answer"}
              </span>
              {l.outcome && (
                <span className="px-2 py-0.5 rounded-full font-medium bg-violet-100 text-violet-700 border border-violet-200">
                  {OUTCOME_LABELS[l.outcome]}
                </span>
              )}
              {l.objection && (
                <span className="px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
                  {OBJECTION_LABELS[l.objection]}
                </span>
              )}
              {l.value_discussed && (
                <span className="px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 border border-green-200">
                  {formatValue(l.value_discussed)}
                </span>
              )}
              {l.logged_by && <span className="text-gray-400 ml-auto">{l.logged_by}</span>}
            </div>
            {l.note && <p className="text-sm text-gray-700 mt-1.5">{l.note}</p>}
          </div>
        ))}
      </div>
    </Shell>
  );
}

function AddModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [stage, setStage] = useState<Stage>("cold_call_done");
  const [temperature, setTemperature] = useState<Temperature | null>(null);
  const [whatsapp, setWhatsapp] = useState(false);
  const [notes, setNotes] = useState("");
  const [nextAt, setNextAt] = useState(toLocalInputValue(addDays(new Date(), 1)));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=company", {
        method: "POST",
        body: JSON.stringify({
          name,
          stage,
          temperature,
          whatsapp_group_made: whatsapp,
          notes: notes.trim() || null,
          next_action_at: nextAt ? new Date(nextAt).toISOString() : null,
          next_action_reason: "First follow-up",
          contact_name: contactName.trim() || null,
          contact_phone: contactPhone.trim() || null,
        }),
      });
      toast.success("Added");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title="Add company" onClose={onClose}>
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
      <Field label="Stage">
        <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className={inputCls}>
          {ALL_STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Temperature">
        <div className="flex gap-2">
          {TEMPERATURES.map((t) => (
            <Choice key={t} active={temperature === t} onClick={() => setTemperature(t)}>
              {t}
            </Choice>
          ))}
        </div>
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-4">
        <input
          type="checkbox"
          checked={whatsapp}
          onChange={(e) => setWhatsapp(e.target.checked)}
          className="rounded"
        />
        WhatsApp group made (moves them into GTM)
      </label>
      <Field label="Context">
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={inputCls} />
      </Field>
      <Field label="First follow-up">
        <input
          type="datetime-local"
          value={nextAt}
          onChange={(e) => setNextAt(e.target.value)}
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
          {saving ? "Saving…" : "Add"}
        </button>
      </div>
    </Shell>
  );
}

/* ---- small shared bits ---- */

const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400";

function Shell({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-2xl border-2 border-neutral-900 shadow-[6px_6px_0px_0px_rgba(25,26,35,1)] w-full ${
          wide ? "max-w-2xl" : "max-w-lg"
        } my-8`}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2 className="font-bold text-gray-900" style={{ fontFamily: "Clash Display, sans-serif" }}>
            {title}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-900 text-xl leading-none">
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function Choice({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-sm border capitalize transition-colors ${
        active
          ? "bg-neutral-900 text-white border-neutral-900 font-medium"
          : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
      }`}
    >
      {children}
    </button>
  );
}
