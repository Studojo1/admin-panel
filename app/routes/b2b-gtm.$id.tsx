import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import type { Route } from "./+types/b2b-gtm.$id";
import { CheckInModal, ContactChangeModal } from "~/components/b2b/check-in-modal";
import {
  Choice,
  ExitModal,
  Field,
  ReactivateModal,
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
  WON_STAGES,
  activeFlags,
  daysSince,
  formatDateTime,
  formatValue,
  isOverdue,
  logSentence,
  toLocalInputValue,
  type CallLog,
  type Company,
  type Stage,
} from "~/lib/b2b-gtm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Company – B2B GTM" }];
}

export default function B2BCompany() {
  const { isAuthorized, isPending } = useAdminGuard();
  const params = useParams();
  const id = params.id;
  const [company, setCompany] = useState<Company | null>(null);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [me, setMe] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState(false);
  const [contactChange, setContactChange] = useState(false);
  const [exiting, setExiting] = useState(false);
  const [reactivating, setReactivating] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await authedFetch(`/api/b2b-gtm?company_id=${id}`);
      setCompany(d.company);
      setLogs(d.logs || []);
      setMe(d.me || "");
      setError(null);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isPending || !isAuthorized) return;
    load();
  }, [isPending, isAuthorized, load]);

  if (isPending) return null;

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <AdminHeader />
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
        <Link to="/b2b-gtm" className="text-sm text-gray-500 hover:text-gray-900">
          ← Back to B2B GTM
        </Link>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : !company ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm mt-4">
            Company not found.
          </div>
        ) : (
          <CompanyBody
            company={company}
            logs={logs}
            me={me}
            onReload={load}
            onCheckIn={() => setCheckIn(true)}
            onContactChange={() => setContactChange(true)}
            onExit={() => setExiting(true)}
            onReactivate={() => setReactivating(true)}
          />
        )}
      </main>

      {checkIn && company && (
        <CheckInModal
          company={company}
          onClose={() => setCheckIn(false)}
          onSaved={() => {
            setCheckIn(false);
            load();
          }}
        />
      )}
      {contactChange && company && (
        <ContactChangeModal
          company={company}
          onClose={() => setContactChange(false)}
          onSaved={() => {
            setContactChange(false);
            load();
          }}
        />
      )}
      {exiting && company && (
        <ExitModal
          company={company}
          onClose={() => setExiting(false)}
          onSaved={() => {
            setExiting(false);
            load();
          }}
        />
      )}
      {reactivating && company && (
        <ReactivateModal
          company={company}
          onClose={() => setReactivating(false)}
          onSaved={() => {
            setReactivating(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function CompanyBody({
  company,
  logs,
  me,
  onReload,
  onCheckIn,
  onContactChange,
  onExit,
  onReactivate,
}: {
  company: Company;
  logs: CallLog[];
  me: string;
  onReload: () => void;
  onCheckIn: () => void;
  onContactChange: () => void;
  onExit: () => void;
  onReactivate: () => void;
}) {
  const now = new Date();
  const isAccount = WON_STAGES.includes(company.stage);
  const exited = EXITED_STAGES.includes(company.stage);
  const quiet = daysSince(logs[0]?.called_at ?? company.updated_at, now);
  const stale = isAccount && quiet !== null && quiet > STALE_ACCOUNT_DAYS;
  const overdue = isOverdue(company.next_action_at, now);
  const activeContacts = (company.contacts || []).filter((c) => !c.is_inactive);
  const pastContacts = (company.contacts || []).filter((c) => c.is_inactive);

  // The value story: every log row where a number was discussed.
  const valueHistory = logs.filter((l) => l.value_discussed).reverse();

  return (
    <>
      <div className="mt-4 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl font-bold text-gray-900"
            style={{ fontFamily: "Clash Display, sans-serif" }}
          >
            {company.name}
          </h1>
          <div className="flex items-center gap-2 flex-wrap mt-2">
            <StageBadge s={company.stage} />
            <TempBadge t={company.temperature} />
            {activeFlags(company).map((f) => (
              <span
                key={f.key}
                className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${f.badge}`}
                title={company[f.noteKey] || undefined}
              >
                {f.label}
              </span>
            ))}
            {company.owner && (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-sky-100 text-sky-700 border border-sky-200">
                {company.owner}
              </span>
            )}
            {stale && (
              <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-rose-100 text-rose-700 border border-rose-200">
                Quiet {quiet}d
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {exited ? (
            <button
              onClick={onReactivate}
              className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium hover:bg-violet-600"
            >
              Bring back to pipeline
            </button>
          ) : (
            <>
              <button
                onClick={onContactChange}
                className="px-4 py-2 rounded-xl bg-white text-gray-700 text-sm font-medium border border-gray-300 hover:bg-gray-50"
              >
                Contact changed
              </button>
              <button
                onClick={onExit}
                className="px-4 py-2 rounded-xl bg-white text-rose-600 text-sm font-medium border border-rose-200 hover:border-rose-300"
              >
                Remove from pipeline
              </button>
              <button
                onClick={onCheckIn}
                className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700"
              >
                Log call
              </button>
            </>
          )}
        </div>
      </div>

      {exited ? (
        <div className="mt-5 rounded-2xl border-2 border-gray-300 bg-gray-100 px-5 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            Parked — out of the active pipeline
          </p>
          <p className="text-lg font-bold mt-0.5 text-gray-700">
            Exited
            {company.lost_reason ? ` — ${company.lost_reason.replace(/_/g, " ")}` : ""}
          </p>
          {company.lost_feedback && (
            <p className="text-sm mt-0.5 text-gray-600">{company.lost_feedback}</p>
          )}
          <p className="text-xs text-gray-500 mt-1">
            Bring them back any time — they'll return to GTM active as yours.
          </p>
        </div>
      ) : (
      /* Why am I calling them, right at the top. */
      <div
        className={`mt-5 rounded-2xl border-2 px-5 py-4 ${
          overdue
            ? "border-neutral-900 bg-violet-500 text-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            : "border-gray-200 bg-white"
        }`}
      >
        <p
          className={`text-[11px] font-semibold uppercase tracking-wide ${
            overdue ? "text-violet-100" : "text-gray-500"
          }`}
        >
          Next action
        </p>
        {company.next_action_at ? (
          <>
            <p className={`text-lg font-bold mt-0.5 ${overdue ? "" : "text-gray-900"}`}>
              {formatDateTime(company.next_action_at)}
              {overdue && " — overdue"}
            </p>
            {company.next_action_reason && (
              <p className={`text-sm mt-0.5 ${overdue ? "text-violet-50" : "text-gray-600"}`}>
                {company.next_action_reason}
              </p>
            )}
          </>
        ) : (
          <p className="text-lg font-bold mt-0.5 text-rose-600">
            No next action set
            {company.next_action_reason ? ` — note: ${company.next_action_reason}` : ""}
          </p>
        )}
      </div>
      )}

      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Context first — this is what you read before dialling. */}
          <Panel title="About this company">
            {company.notes ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{company.notes}</p>
            ) : (
              <p className="text-sm text-gray-400">No context yet.</p>
            )}
            {company.blocker_note && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
                  Blocker
                  {company.blocker_type
                    ? ` — ${BLOCKER_LABELS[company.blocker_type] ?? company.blocker_type}`
                    : ""}
                </p>
                <p className="text-sm text-amber-900 mt-0.5">{company.blocker_note}</p>
              </div>
            )}
            {company.lost_feedback && (
              <div className="mt-3 rounded-xl bg-rose-50 border border-rose-200 p-3">
                <p className="text-[11px] font-semibold text-rose-800 uppercase tracking-wide">
                  Why we lost
                  {company.lost_reason ? ` — ${company.lost_reason.replace(/_/g, " ")}` : ""}
                </p>
                <p className="text-sm text-rose-900 mt-0.5">{company.lost_feedback}</p>
                {company.comeback_at && (
                  <p className="text-xs text-rose-700 mt-1">
                    Comeback scheduled {formatDateTime(company.comeback_at)}
                  </p>
                )}
              </div>
            )}
            {company.they_reachout_on && (
              <p className="text-xs text-gray-500 mt-3">
                They said they'd reach out: {company.they_reachout_on}
              </p>
            )}
          </Panel>

          <Panel title={`Timeline (${logs.length})`}>
            <NoteComposer companyId={company.id} onSaved={onReload} />
            {logs.length === 0 && (
              <p className="text-sm text-gray-400">
                Nothing logged yet — add the first note above with what they said and their tone.
              </p>
            )}
            <div className="space-y-2">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className={`rounded-xl border p-3 ${
                    l.kind === "contact_change"
                      ? "border-sky-200 bg-sky-50"
                      : l.kind === "handoff"
                      ? "border-emerald-200 bg-emerald-50"
                      : l.kind === "note"
                      ? "border-violet-200 bg-violet-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  {/* The event as a plain sentence, then what they actually said. */}
                  <p className="text-sm text-gray-800">{logSentence(l)}</p>
                  {l.note && <p className="text-sm text-gray-600 mt-0.5 italic">“{l.note}”</p>}
                  <div className="flex items-center gap-2 flex-wrap text-xs mt-1">
                    {l.attendees && <span className="text-gray-500">with {l.attendees}</span>}
                    {l.objection && (
                      <span className="px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 border border-amber-200">
                        {l.objection === "other" && l.objection_note
                          ? l.objection_note
                          : OBJECTION_LABELS[l.objection]}
                        {l.objection !== "other" && l.objection_note ? `: ${l.objection_note}` : ""}
                      </span>
                    )}
                    {l.value_discussed && (
                      <span className="px-2 py-0.5 rounded-full font-medium bg-green-100 text-green-700 border border-green-200">
                        {formatValue(l.value_discussed)}
                      </span>
                    )}
                    {l.logged_by && <span className="text-gray-400 ml-auto">{l.logged_by}</span>}
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>

        <div className="space-y-5">
          <Panel title="Contacts">
            {activeContacts.length === 0 && (
              <p className="text-sm text-gray-400">No active contact.</p>
            )}
            {activeContacts.map((c) => (
              <div key={c.id} className="mb-2 last:mb-0">
                <p className="text-sm font-medium text-gray-900">
                  {c.name || "Unnamed"}
                  {c.is_primary && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide text-violet-600">
                      primary
                    </span>
                  )}
                </p>
                {c.role && <p className="text-xs text-gray-500">{c.role}</p>}
                {c.phone && (
                  <a href={`tel:${c.phone}`} className="text-xs text-violet-600 hover:underline">
                    {c.phone}
                  </a>
                )}
              </div>
            ))}
            {pastContacts.length > 0 && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide mb-1">
                  Past contacts
                </p>
                {pastContacts.map((c) => (
                  <div key={c.id} className="mb-1.5">
                    <p className="text-sm text-gray-400 line-through">{c.name || c.phone}</p>
                    {c.left_note && <p className="text-xs text-gray-400">{c.left_note}</p>}
                  </div>
                ))}
              </div>
            )}
          </Panel>

          {isAccount && (
            <Panel title="Account">
              <div className="space-y-2 text-sm">
                <Row label="Committed" value={formatValue(company.deal_value)} />
                <Row
                  label="Next purchase"
                  value={
                    company.next_purchase_due ? formatDateTime(company.next_purchase_due) : "Not set"
                  }
                />
                <Row label="Stage" value={STAGE_LABELS[company.stage]} />
                <Row label="Quiet for" value={quiet !== null ? `${quiet} days` : "—"} />
              </div>
              {valueHistory.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200">
                  <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">
                    Value over time
                  </p>
                  {valueHistory.map((l) => (
                    <div key={l.id} className="flex justify-between text-xs py-0.5">
                      <span className="text-gray-500">
                        {new Date(l.called_at).toLocaleDateString("en-GB", {
                          day: "2-digit",
                          month: "short",
                        })}
                      </span>
                      <span className="font-semibold text-gray-900">
                        {formatValue(l.value_discussed)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              {!company.next_purchase_due && (
                <p className="text-xs text-rose-600 mt-3">
                  No next purchase date. A win without one goes quiet.
                </p>
              )}
            </Panel>
          )}

          <EditPanel company={company} me={me} onSaved={onReload} />
        </div>
      </div>
    </>
  );
}

/**
 * Always-available note box on the full page. A plain note never moves the
 * stage — it's the running record of what they said, their tone, the context.
 */
function NoteComposer({ companyId, onSaved }: { companyId: number; onSaved: () => void }) {
  const [text, setText] = useState("");
  const [saving, setSaving] = useState(false);

  const add = async () => {
    if (!text.trim()) return;
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=note", {
        method: "POST",
        body: JSON.stringify({ company_id: companyId, note: text.trim() }),
      });
      setText("");
      toast.success("Note added");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 mb-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={2}
        placeholder="What did they say? Their tone, any context — add as much as you like."
        className={inputCls}
      />
      <div className="flex justify-end mt-2">
        <button
          disabled={!text.trim() || saving}
          onClick={add}
          className="px-3 py-1.5 rounded-lg bg-neutral-900 text-white text-xs font-medium disabled:opacity-40"
        >
          {saving ? "Adding…" : "Add note"}
        </button>
      </div>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
      <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-3">
        {title}
      </p>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-500">{label}</span>
      <span className="font-medium text-gray-900">{value}</span>
    </div>
  );
}

function EditPanel({
  company,
  me,
  onSaved,
}: {
  company: Company;
  me: string;
  onSaved: () => void;
}) {
  const [stage, setStage] = useState<Stage>(company.stage);
  const [owner, setOwner] = useState(company.owner ?? "");
  const [flags, setFlags] = useState<Record<string, boolean>>({
    needs_brochure: company.needs_brochure,
    needs_leads: company.needs_leads,
    leads_change: company.leads_change,
  });
  const [flagNotes, setFlagNotes] = useState<Record<string, string>>({
    brochure_note: company.brochure_note ?? "",
    leads_note: company.leads_note ?? "",
    leads_change_note: company.leads_change_note ?? "",
  });
  const [whatsapp, setWhatsapp] = useState(company.whatsapp_group_made);
  const [dealValue, setDealValue] = useState(company.deal_value ?? "");
  const [nextPurchaseDue, setNextPurchaseDue] = useState(
    company.next_purchase_due ? toLocalInputValue(new Date(company.next_purchase_due)) : ""
  );
  const [notes, setNotes] = useState(company.notes ?? "");
  const [saving, setSaving] = useState(false);

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
            whatsapp_group_made: whatsapp,
            deal_value: dealValue === "" ? null : Number(dealValue),
            next_purchase_due: nextPurchaseDue ? new Date(nextPurchaseDue).toISOString() : null,
            notes,
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
    <Panel title="Edit">
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
      <Field label="Who's handling it">
        <div className="flex flex-wrap gap-1.5">
          <Choice active={!owner} onClick={() => setOwner("")}>
            Me
          </Choice>
          {TEAM.map((t) => (
            <Choice key={t} active={owner === t} onClick={() => setOwner(t)}>
              {t}
            </Choice>
          ))}
        </div>
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
      <Field label="Context">
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className={inputCls}
        />
      </Field>
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
        <input
          type="checkbox"
          checked={whatsapp}
          onChange={(e) => setWhatsapp(e.target.checked)}
          className="rounded"
        />
        WhatsApp group made
      </label>
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
      <button
        disabled={saving}
        onClick={save}
        className="w-full mt-2 px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
      >
        {saving ? "Saving…" : "Save changes"}
      </button>
    </Panel>
  );
}
