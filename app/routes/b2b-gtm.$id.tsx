import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import type { Route } from "./+types/b2b-gtm.$id";
import { CheckInModal, ContactChangeModal } from "~/components/b2b/check-in-modal";
import {
  BrochureBadge,
  Field,
  StageBadge,
  TempBadge,
  authedFetch,
  inputCls,
} from "~/components/b2b/shared";
import {
  ALL_STAGES,
  OBJECTION_LABELS,
  OUTCOME_LABELS,
  STAGE_LABELS,
  STALE_ACCOUNT_DAYS,
  WON_STAGES,
  daysSince,
  formatDateTime,
  formatValue,
  isOverdue,
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
}: {
  company: Company;
  logs: CallLog[];
  me: string;
  onReload: () => void;
  onCheckIn: () => void;
  onContactChange: () => void;
}) {
  const now = new Date();
  const isAccount = WON_STAGES.includes(company.stage);
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
            {company.needs_brochure && <BrochureBadge />}
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
        <div className="flex gap-2">
          <button
            onClick={onContactChange}
            className="px-4 py-2 rounded-xl bg-white text-gray-700 text-sm font-medium border border-gray-300 hover:bg-gray-50"
          >
            Contact changed
          </button>
          <button
            onClick={onCheckIn}
            className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-medium hover:bg-neutral-700"
          >
            Log call
          </button>
        </div>
      </div>

      {/* Why am I calling them, right at the top. */}
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

      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <div className="lg:col-span-2 space-y-5">
          {/* Context first — this is what you read before dialling. */}
          <Panel title="Context">
            {company.notes ? (
              <p className="text-sm text-gray-700 whitespace-pre-wrap">{company.notes}</p>
            ) : (
              <p className="text-sm text-gray-400">No context yet.</p>
            )}
            {company.blocker_note && (
              <div className="mt-3 rounded-xl bg-amber-50 border border-amber-200 p-3">
                <p className="text-[11px] font-semibold text-amber-800 uppercase tracking-wide">
                  Blocker{company.blocker_type ? ` — ${company.blocker_type}` : ""}
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
            {logs.length === 0 && <p className="text-sm text-gray-400">Nothing logged yet.</p>}
            <div className="space-y-2">
              {logs.map((l) => (
                <div
                  key={l.id}
                  className={`rounded-xl border p-3 ${
                    l.kind === "contact_change"
                      ? "border-sky-200 bg-sky-50"
                      : "border-gray-200 bg-gray-50"
                  }`}
                >
                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    <span className="text-gray-500">{formatDateTime(l.called_at)}</span>
                    {l.kind === "contact_change" ? (
                      <span className="px-2 py-0.5 rounded-full font-medium bg-sky-100 text-sky-700 border border-sky-200">
                        Contact changed
                      </span>
                    ) : (
                      <span
                        className={`px-2 py-0.5 rounded-full font-medium border ${
                          l.picked_up
                            ? "bg-green-100 text-green-700 border-green-200"
                            : "bg-gray-100 text-gray-500 border-gray-200"
                        }`}
                      >
                        {l.picked_up ? "Picked up" : "No answer"}
                      </span>
                    )}
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
                    {l.contact_name && <span className="text-gray-400">· {l.contact_name}</span>}
                    {l.logged_by && <span className="text-gray-400 ml-auto">{l.logged_by}</span>}
                  </div>
                  {l.note && <p className="text-sm text-gray-700 mt-1.5">{l.note}</p>}
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
  const [needsBrochure, setNeedsBrochure] = useState(company.needs_brochure);
  const [brochureNote, setBrochureNote] = useState(company.brochure_note ?? "");
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
            needs_brochure: needsBrochure,
            brochure_note: brochureNote,
            whatsapp_group_made: whatsapp,
            deal_value: dealValue === "" ? null : Number(dealValue),
            next_purchase_due: nextPurchaseDue ? new Date(nextPurchaseDue).toISOString() : null,
            notes,
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
      <Field label="Owner (blank = yours)">
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
      <label className="flex items-center gap-2 text-sm text-gray-700 mb-2">
        <input
          type="checkbox"
          checked={needsBrochure}
          onChange={(e) => setNeedsBrochure(e.target.checked)}
          className="rounded"
        />
        Needs a brochure
      </label>
      {needsBrochure && (
        <input
          value={brochureNote}
          onChange={(e) => setBrochureNote(e.target.value)}
          placeholder="What should the brochure cover?"
          className={inputCls + " mb-2"}
        />
      )}
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
