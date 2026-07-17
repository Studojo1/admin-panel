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
  Field,
  Shell,
  StageBadge,
  TempBadge,
  authedFetch,
  inputCls,
} from "~/components/b2b/shared";
import {
  ALL_STAGES,
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
  const [view, setView] = useState<ViewKey>("overview");
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [checkIn, setCheckIn] = useState<Company | null>(null);
  const [contactChange, setContactChange] = useState<Company | null>(null);
  const [adding, setAdding] = useState(false);
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
      if (!companyMatchesView(c, view, now)) return false;
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
  }, [companies, view, search, now]);

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
                </>
              ) : (
                "Every lead always has a next action."
              )}
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
                Import sheet
              </button>
            )}
          </div>
        </div>

        {/* Tabs run horizontally: the table needs the width. */}
        <div className="flex items-center gap-1 mb-4 border-b border-gray-200 overflow-x-auto">
          {VIEWS.map((v) => {
            const count = companies.filter((c) => companyMatchesView(c, v.key, now)).length;
            const active = view === v.key;
            return (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
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
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-200">
                  <tr>
                    {["", "Company", "Contact", "Phone", "Stage", "Temp", "Next action", "Context", ""].map(
                      (h, i) => (
                        <th
                          key={i}
                          className="px-3 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                        >
                          {h}
                        </th>
                      )
                    )}
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
  onSaved,
}: {
  c: Company;
  now: Date;
  expanded: boolean;
  onToggle: () => void;
  onCheckIn: () => void;
  onContactChange: () => void;
  onSaved: () => void;
}) {
  const overdue = isOverdue(c.next_action_at, now);
  const today = isLaterToday(c.next_action_at, now);
  const contact = (c.contacts || []).find((x) => !x.is_inactive) ?? c.contacts?.[0];
  const isAccount = WON_STAGES.includes(c.stage);
  const quiet = daysSince(c.last_log?.called_at ?? c.updated_at, now);
  const stale = isAccount && quiet !== null && quiet > STALE_ACCOUNT_DAYS;
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
            {c.needs_brochure && (
              <span
                className="w-1.5 h-1.5 rounded-full bg-yellow-500 shrink-0"
                title="Brochure needed"
              />
            )}
            {stale && (
              <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0" title={`Quiet ${quiet}d`} />
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
        <td className="px-3 py-2.5 whitespace-nowrap text-xs">
          {c.next_action_at ? (
            <span
              className={
                overdue ? "text-violet-700 font-semibold" : today ? "text-gray-900" : "text-gray-500"
              }
            >
              {formatDateTime(c.next_action_at)}
            </span>
          ) : (
            <span className="text-rose-600 font-medium">Not set</span>
          )}
        </td>
        <td className="px-3 py-2.5 text-gray-600 text-xs max-w-md">
          <span className="line-clamp-1">{context || "—"}</span>
        </td>
        <td className="px-3 py-2.5 whitespace-nowrap">
          <button
            onClick={(e) => {
              e.stopPropagation();
              onCheckIn();
            }}
            className="px-2.5 py-1 rounded-lg bg-neutral-900 text-white text-xs font-medium hover:bg-neutral-700"
          >
            Log call
          </button>
        </td>
      </tr>

      {expanded && (
        <tr className="bg-gray-50">
          <td colSpan={9} className="px-3 pb-4 pt-1">
            <ExpandedPanel
              c={c}
              now={now}
              onContactChange={onContactChange}
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
  onSaved,
}: {
  c: Company;
  now: Date;
  onContactChange: () => void;
  onSaved: () => void;
}) {
  const [stage, setStage] = useState<Stage>(c.stage);
  const [temperature, setTemperature] = useState<Temperature | null>(c.temperature);
  const [owner, setOwner] = useState(c.owner ?? "");
  const [needsBrochure, setNeedsBrochure] = useState(c.needs_brochure);
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
            stage,
            temperature,
            owner,
            needs_brochure: needsBrochure,
            notes,
            next_action_at: nextAt ? new Date(nextAt).toISOString() : null,
            next_action_reason: nextReason,
            deal_value: dealValue === "" ? null : Number(dealValue),
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
      <div className="grid lg:grid-cols-3 gap-5">
        {/* Context — what you read before dialling. */}
        <div className="lg:col-span-2 space-y-3">
          <div>
            <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
              Context
            </p>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              placeholder="What's the story with this company?"
              className={inputCls}
            />
          </div>

          {c.last_log?.note && c.last_log.note !== notes && (
            <div className="rounded-lg bg-gray-50 border border-gray-200 p-2.5">
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide">
                Last call — {formatDateTime(c.last_log.called_at)}
              </p>
              <p className="text-sm text-gray-700 mt-0.5">{c.last_log.note}</p>
            </div>
          )}

          {c.blocker_note && (
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-2.5">
              <p className="text-[10px] font-semibold text-amber-800 uppercase tracking-wide">
                Blocker{c.blocker_type ? ` — ${c.blocker_type}` : ""}
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
        </div>

        {/* Editable fields + contacts. */}
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
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
                Owner
              </p>
              <input
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                placeholder="blank = you"
                className={inputCls}
              />
            </div>
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
            <button
              onClick={onContactChange}
              className="mt-1.5 text-xs text-sky-700 hover:underline font-medium"
            >
              Contact changed?
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={needsBrochure}
              onChange={(e) => setNeedsBrochure(e.target.checked)}
              className="rounded"
            />
            Needs a brochure
          </label>

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
