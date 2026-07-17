import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useModal } from "~/components/common/modal-context";
import { useAdminGuard } from "~/lib/auth-guard";
import type { Route } from "./+types/b2b-gtm";
import { CheckInModal, ContactChangeModal } from "~/components/b2b/check-in-modal";
import {
  BrochureBadge,
  Choice,
  Field,
  Shell,
  StageBadge,
  TempBadge,
  authedFetch,
  inputCls,
} from "~/components/b2b/shared";
import {
  ALL_STAGES,
  BLOCKED_STAGES,
  OBJECTION_LABELS,
  STAGE_LABELS,
  STALE_ACCOUNT_DAYS,
  TEMPERATURES,
  VIEWS,
  WON_STAGES,
  addDays,
  companyMatchesView,
  daysSince,
  formatDateTime,
  formatValue,
  isLaterToday,
  isOverdue,
  isUpcoming,
  toLocalInputValue,
  type Company,
  type Objection,
  type Stage,
  type Temperature,
  type ViewKey,
} from "~/lib/b2b-gtm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "B2B GTM Motion – Admin Panel" }];
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

/** Stat cards double as filters — clicking one narrows the list to exactly those. */
type CardKey = "due_now" | "hot" | "blocked" | "accounts" | "renewals_due" | "brochures" | "committed";

function matchesCard(c: Company, card: CardKey, now: Date): boolean {
  switch (card) {
    case "due_now":
      return isOverdue(c.next_action_at, now) || isLaterToday(c.next_action_at, now);
    case "hot":
      return c.temperature === "hot";
    case "blocked":
      return BLOCKED_STAGES.includes(c.stage);
    case "accounts":
    case "committed":
      return WON_STAGES.includes(c.stage);
    case "renewals_due": {
      if (!c.next_purchase_due) return false;
      const due = new Date(c.next_purchase_due).getTime();
      return due <= now.getTime() + 7 * 86400000;
    }
    case "brochures":
      return c.needs_brochure;
    default:
      return true;
  }
}

export default function B2BGtm() {
  const { isAuthorized, isPending } = useAdminGuard();
  const { showConfirm } = useModal();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [objectionStats, setObjectionStats] = useState<{ objection: string; n: number }[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("overview");
  const [card, setCard] = useState<CardKey | null>(null);
  const [search, setSearch] = useState("");
  const [checkIn, setCheckIn] = useState<Company | null>(null);
  const [contactChange, setContactChange] = useState<Company | null>(null);
  const [adding, setAdding] = useState(false);
  const notifiedRef = useRef<Set<number>>(new Set());

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

  // Notify only when a call actually falls due, not when it's merely today.
  useEffect(() => {
    if (isPending || !isAuthorized) return;
    const tick = () => {
      const now = new Date();
      for (const c of companies) {
        if (!isOverdue(c.next_action_at, now)) continue;
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

  const now = new Date();

  const overdue = useMemo(
    () =>
      companies
        .filter((c) => isOverdue(c.next_action_at, now))
        .sort((a, b) => +new Date(a.next_action_at!) - +new Date(b.next_action_at!)),
    [companies]
  );
  const laterToday = useMemo(
    () =>
      companies
        .filter((c) => isLaterToday(c.next_action_at, now))
        .sort((a, b) => +new Date(a.next_action_at!) - +new Date(b.next_action_at!)),
    [companies]
  );
  const upcoming = useMemo(
    () =>
      companies
        .filter((c) => isUpcoming(c.next_action_at, now))
        .sort((a, b) => +new Date(a.next_action_at!) - +new Date(b.next_action_at!)),
    [companies]
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return companies.filter((c) => {
      if (card && !matchesCard(c, card, now)) return false;
      if (!card && !companyMatchesView(c, view, now)) return false;
      if (!q) return true;
      const hay = [c.name, c.notes, ...(c.contacts || []).map((x) => x.name)]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [companies, view, card, search]);

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

  const cards: { key: CardKey; label: string; value: string | number; alert?: boolean }[] = stats
    ? [
        { key: "due_now", label: "Today", value: overdue.length + laterToday.length, alert: overdue.length > 0 },
        { key: "hot", label: "Hot", value: stats.hot },
        { key: "blocked", label: "Blocked", value: stats.blocked },
        { key: "accounts", label: "Accounts", value: stats.accounts },
        { key: "renewals_due", label: "Renewals ≤7d", value: stats.renewals_due, alert: stats.renewals_due > 0 },
        { key: "brochures", label: "Brochures", value: stats.brochures, alert: stats.brochures > 0 },
        { key: "committed", label: "Committed", value: formatValue(stats.committed_value) },
      ]
    : [];

  const showToday = !card && view === "today";

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

        {overdue.length > 0 && (
          <div className="mb-6 rounded-2xl border-2 border-neutral-900 bg-violet-500 text-white px-5 py-4 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <p className="font-bold" style={{ fontFamily: "Clash Display, sans-serif" }}>
              {overdue.length} {overdue.length === 1 ? "call is" : "calls are"} overdue
            </p>
            <p className="text-sm text-violet-50 mt-0.5">
              {overdue.slice(0, 4).map((c) => c.name).join(", ")}
              {overdue.length > 4 ? ` and ${overdue.length - 4} more` : ""}
            </p>
            <button
              onClick={() => {
                setCard(null);
                setView("today");
              }}
              className="mt-2 text-sm font-medium underline underline-offset-2"
            >
              Open today's list
            </button>
          </div>
        )}

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 mb-6">
            {cards.map((s) => {
              const active = card === s.key;
              return (
                <button
                  key={s.key}
                  onClick={() => setCard(active ? null : s.key)}
                  className={`text-left bg-white rounded-2xl border p-4 shadow-sm transition-all hover:border-violet-400 ${
                    active
                      ? "border-neutral-900 border-2 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
                      : s.alert
                      ? "border-violet-400"
                      : "border-gray-200"
                  }`}
                >
                  <p className="text-[11px] font-medium text-gray-500 uppercase tracking-wide">
                    {s.label}
                  </p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{s.value}</p>
                </button>
              );
            })}
          </div>
        )}

        <div className="flex gap-6">
          <nav className="w-48 shrink-0">
            <ul className="space-y-1">
              {VIEWS.map((v) => {
                const count = companies.filter((c) => companyMatchesView(c, v.key, now)).length;
                const activeView = !card && view === v.key;
                return (
                  <li key={v.key}>
                    <button
                      onClick={() => {
                        setCard(null);
                        setView(v.key);
                      }}
                      className={`w-full text-left px-3 py-2 rounded-xl text-sm flex justify-between items-center ${
                        activeView
                          ? "bg-neutral-900 text-white font-medium"
                          : "text-gray-600 hover:bg-white"
                      }`}
                    >
                      <span>{v.label}</span>
                      <span className={activeView ? "text-gray-300" : "text-gray-400"}>{count}</span>
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
            <div className="flex items-center gap-3 mb-4">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search company, contact or notes…"
                className="flex-1 px-4 py-2 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400"
              />
              {card && (
                <button
                  onClick={() => setCard(null)}
                  className="px-3 py-2 rounded-xl bg-neutral-900 text-white text-xs font-medium whitespace-nowrap"
                >
                  {cards.find((c) => c.key === card)?.label} ×
                </button>
              )}
            </div>

            {error && (
              <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {loading ? (
              <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
            ) : showToday ? (
              <TodayView
                overdue={overdue}
                laterToday={laterToday}
                upcoming={upcoming}
                now={now}
                onCheckIn={setCheckIn}
                onContactChange={setContactChange}
              />
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
                    onContactChange={() => setContactChange(c)}
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
    </div>
  );
}

function TodayView({
  overdue,
  laterToday,
  upcoming,
  now,
  onCheckIn,
  onContactChange,
}: {
  overdue: Company[];
  laterToday: Company[];
  upcoming: Company[];
  now: Date;
  onCheckIn: (c: Company) => void;
  onContactChange: (c: Company) => void;
}) {
  if (overdue.length === 0 && laterToday.length === 0 && upcoming.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
        Nothing scheduled today or in the next week.
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <Section title="Overdue" count={overdue.length} tone="alert">
        {overdue.map((c) => (
          <LeadCard
            key={c.id}
            c={c}
            now={now}
            onCheckIn={() => onCheckIn(c)}
            onContactChange={() => onContactChange(c)}
          />
        ))}
      </Section>
      <Section title="Later today" count={laterToday.length}>
        {laterToday.map((c) => (
          <LeadCard
            key={c.id}
            c={c}
            now={now}
            onCheckIn={() => onCheckIn(c)}
            onContactChange={() => onContactChange(c)}
          />
        ))}
      </Section>
      <Section title="Next 7 days" count={upcoming.length} muted>
        {upcoming.map((c) => (
          <LeadCard
            key={c.id}
            c={c}
            now={now}
            onCheckIn={() => onCheckIn(c)}
            onContactChange={() => onContactChange(c)}
          />
        ))}
      </Section>
    </div>
  );
}

function Section({
  title,
  count,
  tone,
  muted,
  children,
}: {
  title: string;
  count: number;
  tone?: "alert";
  muted?: boolean;
  children: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div>
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide mb-2 ${
          tone === "alert" ? "text-violet-700" : muted ? "text-gray-400" : "text-gray-500"
        }`}
      >
        {title} ({count})
      </p>
      <div className="space-y-3">{children}</div>
    </div>
  );
}

function LeadCard({
  c,
  now,
  onCheckIn,
  onContactChange,
}: {
  c: Company;
  now: Date;
  onCheckIn: () => void;
  onContactChange: () => void;
}) {
  const overdue = isOverdue(c.next_action_at, now);
  const contact = (c.contacts || []).find((x) => !x.is_inactive) ?? c.contacts?.[0];
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
            <Link
              to={`/b2b-gtm/${c.id}`}
              className="font-semibold text-gray-900 hover:text-violet-600 truncate"
            >
              {c.name}
            </Link>
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

          {c.blocker_note && <p className="text-xs text-amber-700 mt-1">Blocker: {c.blocker_note}</p>}
          {c.lost_feedback && <p className="text-xs text-rose-700 mt-1">Feedback: {c.lost_feedback}</p>}

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

        <div className="shrink-0 flex flex-col gap-1.5">
          <button
            onClick={onCheckIn}
            className="px-3 py-1.5 rounded-xl bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-700"
          >
            Log call
          </button>
          <button
            onClick={onContactChange}
            className="px-3 py-1.5 rounded-xl bg-white text-sky-700 text-xs font-medium border border-sky-300 hover:bg-sky-50 whitespace-nowrap"
          >
            Contact changed
          </button>
          <Link
            to={`/b2b-gtm/${c.id}`}
            className="px-3 py-1.5 rounded-xl bg-white text-gray-600 text-xs font-medium border border-gray-300 hover:bg-gray-50 text-center"
          >
            Open
          </Link>
        </div>
      </div>
    </div>
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
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          className={inputCls}
        />
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
