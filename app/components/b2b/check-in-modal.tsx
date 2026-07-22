import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BLOCKER_LABELS,
  BLOCKER_TYPES,
  CONTACT_METHODS,
  LOST_REASONS,
  LOST_REASON_LABELS,
  OBJECTIONS,
  OBJECTION_LABELS,
  OUTCOMES,
  OUTCOME_LABELS,
  TEMPERATURES,
  addDays,
  addHours,
  addMinutes,
  methodReachedThem,
  methodToKind,
  objectionNeedsNote,
  objectionRequired,
  lostReasonNeedsNote,
  stageForOutcome,
  suggestNextAction,
  toLocalInputValue,
  type BlockerType,
  type Company,
  type ContactMethod,
  type LostReason,
  type Objection,
  type Outcome,
  type Temperature,
} from "~/lib/b2b-gtm";
import { Choice, Field, Shell, authedFetch, inputCls } from "./shared";

export function CheckInModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [method, setMethod] = useState<ContactMethod | null>(null);
  const [attendees, setAttendees] = useState("");
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [objection, setObjection] = useState<Objection | null>(null);
  const [objectionNote, setObjectionNote] = useState("");
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

  const activeContact = (company.contacts || []).find((c) => !c.is_inactive) ?? company.contacts?.[0];

  useEffect(() => {
    if (method === null) return;
    const s = suggestNextAction({
      pickedUp: methodReachedThem(method),
      method,
      outcome,
      blockerType,
      temperature,
      lostReason,
      competitorExpiry: competitorExpiry ? new Date(competitorExpiry) : null,
      nextPurchaseDue: nextPurchaseDue ? new Date(nextPurchaseDue) : null,
      stage: company.stage,
    });
    setNextAt(toLocalInputValue(s.at));
    setNextReason(s.reason);
  }, [
    method,
    outcome,
    blockerType,
    temperature,
    lostReason,
    competitorExpiry,
    nextPurchaseDue,
    company.stage,
  ]);

  const quick = (d: Date, reason: string) => {
    setNextAt(toLocalInputValue(d));
    setNextReason(reason);
  };

  const reached = method ? methodReachedThem(method) : false;
  const needsObjection = outcome ? objectionRequired(outcome) : false;
  const objectionNoteMissing = objectionNeedsNote(objection) && !objectionNote.trim();
  const lostIncomplete = outcome === "closed_lost" && (!lostReason || !lostFeedback.trim());
  const canSave =
    method !== null &&
    !!nextAt &&
    (!reached ||
      (!!outcome && (!needsObjection || !!objection) && !objectionNoteMissing && !lostIncomplete));

  const save = async () => {
    setSaving(true);
    try {
      const stage = outcome ? stageForOutcome(outcome, company.stage, blockerType) : null;
      await authedFetch("/api/b2b-gtm?action=log", {
        method: "POST",
        body: JSON.stringify({
          company_id: company.id,
          contact_id: activeContact?.id ?? null,
          kind: methodToKind(method!),
          picked_up: reached,
          attendees: method === "meet" ? attendees.trim() || null : null,
          outcome,
          objection,
          objection_note: objectionNote.trim() || null,
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
          comeback_at: outcome === "closed_lost" ? new Date(nextAt).toISOString() : undefined,
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
    <Shell
      title={`${method === "meet" ? "Log meet" : method === "no_show" ? "Log no-show" : "Log call"} — ${
        company.name
      }`}
      onClose={onClose}
    >
      {(company.last_log?.note || company.notes) && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 mb-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Where we left things off
          </p>
          <p className="text-sm text-gray-700">{company.last_log?.note || company.notes}</p>
        </div>
      )}

      <Field label="How did we reach them?">
        <div className="flex flex-wrap gap-2">
          {CONTACT_METHODS.map((m) => (
            <Choice key={m.key} active={method === m.key} onClick={() => setMethod(m.key)}>
              {m.label}
            </Choice>
          ))}
        </div>
      </Field>

      {method === "meet" && (
        <Field label="Who joined from their side? (optional)">
          <input
            value={attendees}
            onChange={(e) => setAttendees(e.target.value)}
            placeholder="e.g. Himanshu + 2 from their tech team"
            className={inputCls}
          />
        </Field>
      )}

      {(method === "no_answer" || method === "no_show") && (
        <Field label="When should we try again?">
          <div className="flex flex-wrap gap-2">
            {method === "no_answer" && (
              <>
                <Choice onClick={() => quick(addMinutes(new Date(), 30), "Retry — no answer")}>
                  30 min
                </Choice>
                <Choice onClick={() => quick(addHours(new Date(), 1), "Retry — no answer")}>
                  1 hr
                </Choice>
                <Choice onClick={() => quick(addHours(new Date(), 2), "Retry — no answer")}>
                  2 hrs
                </Choice>
              </>
            )}
            <Choice
              onClick={() =>
                quick(
                  addDays(new Date(), 1),
                  method === "no_show" ? "No-showed the meet — reschedule" : "Retry — no answer"
                )
              }
            >
              Tomorrow
            </Choice>
            <Choice
              onClick={() =>
                quick(
                  addDays(new Date(), 3),
                  method === "no_show" ? "No-showed the meet — reschedule" : "Retry — no answer"
                )
              }
            >
              In 3 days
            </Choice>
          </div>
        </Field>
      )}

      {reached && (
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
              {objection && (
                <input
                  value={objectionNote}
                  onChange={(e) => setObjectionNote(e.target.value)}
                  placeholder={
                    objectionNeedsNote(objection)
                      ? "Required — what was it, in their words?"
                      : "Detail (optional) — what exactly did they say?"
                  }
                  className={`${inputCls} mt-2 ${
                    objectionNoteMissing ? "border-rose-400 ring-1 ring-rose-300" : ""
                  }`}
                />
              )}
              {objectionNoteMissing && (
                <p className="text-xs text-rose-600 mt-1">
                  "Other" on its own tells you nothing later. Say what it was.
                </p>
              )}
            </Field>
          )}

          {outcome === "blocked" && (
            <>
              <Field label="What's blocking them?">
                <div className="flex flex-wrap gap-2">
                  {BLOCKER_TYPES.map((b) => (
                    <Choice key={b} active={blockerType === b} onClick={() => setBlockerType(b)}>
                      {BLOCKER_LABELS[b]}
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
              <Field
                label={
                  lostReasonNeedsNote(lostReason)
                    ? lostReason === "tool_gap"
                      ? "What was missing from the tool? (required)"
                      : "What was the reason, in their words? (required)"
                    : "Their feedback — what would have changed this? (required)"
                }
              >
                <textarea
                  value={lostFeedback}
                  onChange={(e) => setLostFeedback(e.target.value)}
                  rows={2}
                  placeholder="This is the only thing that tells you how to win the next one."
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

      {method !== null && (
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

/**
 * The contact left / handed us on. Deliberately separate from the call
 * outcomes: someone leaving says nothing about whether the company wants BOB,
 * so this never touches interest, temperature or stage.
 */
export function ContactChangeModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
}) {
  const active = (company.contacts || []).filter((c) => !c.is_inactive);
  const [oldContactId, setOldContactId] = useState<number | null>(active[0]?.id ?? null);
  const [leftNote, setLeftNote] = useState("");
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("");
  const [note, setNote] = useState("");
  const [nextAt, setNextAt] = useState(toLocalInputValue(addDays(new Date(), 1)));
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=contact_change", {
        method: "POST",
        body: JSON.stringify({
          company_id: company.id,
          old_contact_id: oldContactId,
          left_note: leftNote.trim() || null,
          new_name: newName.trim() || null,
          new_phone: newPhone.trim() || null,
          new_role: newRole.trim() || null,
          note: note.trim() || null,
          next_action_at: nextAt ? new Date(nextAt).toISOString() : null,
          next_action_reason: "Introduce ourselves to the new contact",
        }),
      });
      toast.success("Contact updated — history kept");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={`Contact changed — ${company.name}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        The person moved on and handed us to someone else. The company keeps its stage, temperature
        and full history — only who we call changes.
      </p>

      {active.length > 0 && (
        <Field label="Who left?">
          <div className="flex flex-wrap gap-2">
            {active.map((c) => (
              <Choice
                key={c.id}
                active={oldContactId === c.id}
                onClick={() => setOldContactId(c.id)}
              >
                {c.name || c.phone || `#${c.id}`}
              </Choice>
            ))}
          </div>
        </Field>
      )}

      <Field label="What happened to them? (optional)">
        <input
          value={leftNote}
          onChange={(e) => setLeftNote(e.target.value)}
          placeholder="e.g. no longer at the company, moved to a different team"
          className={inputCls}
        />
      </Field>

      <div className="rounded-xl border border-gray-200 p-3 mb-4 bg-gray-50">
        <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">
          Who do we speak to now?
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Name</label>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Phone</label>
            <input
              value={newPhone}
              onChange={(e) => setNewPhone(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">Role (optional)</label>
          <input value={newRole} onChange={(e) => setNewRole(e.target.value)} className={inputCls} />
        </div>
      </div>

      <Field label="Context">
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={2}
          placeholder="What did they say about the handover?"
          className={inputCls}
        />
      </Field>

      <Field label="When do we reach the new contact?">
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
          disabled={saving || (!newName.trim() && !newPhone.trim())}
          onClick={save}
          className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Shell>
  );
}
