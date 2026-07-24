import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  BLOCKER_LABELS,
  BLOCKER_TYPES,
  CONTACT_METHODS,
  FLAGS,
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
  temperatureForOutcome,
  toLocalInputValue,
  type BlockerType,
  type Company,
  type ContactMethod,
  type LostReason,
  type Objection,
  type Outcome,
  type Stage,
  type Temperature,
} from "~/lib/b2b-gtm";
import { Choice, ConfirmStage, Field, Shell, Stepper, authedFetch, inputCls } from "./shared";

export function CheckInModal({
  company,
  onClose,
  onSaved,
  variant = "modal",
}: {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
  /** "modal" = overlay + card (full page); "inline" = bare card (expanded row). */
  variant?: "modal" | "inline";
}) {
  const [step, setStep] = useState(0);
  const [method, setMethod] = useState<ContactMethod | null>(null);
  // Things they asked us for on this call. Seeded from the company's current
  // flags so the wizard shows what's already outstanding.
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
  // The stage that will actually be saved. Starts as the rule's suggestion when
  // an outcome is picked, but the user confirms/declines it — never silent.
  const [stageChoice, setStageChoice] = useState<Stage>(company.stage);
  const [saving, setSaving] = useState(false);

  const activeContact = (company.contacts || []).find((c) => !c.is_inactive) ?? company.contacts?.[0];

  const suggestedStage = outcome
    ? stageForOutcome(outcome, company.stage, blockerType, company.owner)
    : null;

  // When the outcome (or blocker) changes the suggestion, adopt it as the
  // default choice. The user can still flip back to "keep as" in ConfirmStage.
  useEffect(() => {
    setStageChoice(suggestedStage ?? company.stage);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome, blockerType]);

  // Pre-fill temperature from the outcome, but only until the user touches it.
  const [tempTouched, setTempTouched] = useState(false);
  useEffect(() => {
    if (tempTouched) return;
    const t = temperatureForOutcome(outcome);
    if (t) setTemperature(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outcome]);

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
  // A next action isn't always possible — sometimes the ball's genuinely in
  // their court (red tape, waiting on them). Then we log with no follow-up date.
  const [noDate, setNoDate] = useState(false);
  const nextOk = noDate || !!nextAt;
  const canSave =
    method !== null &&
    nextOk &&
    (!reached ||
      (!!outcome && (!needsObjection || !!objection) && !objectionNoteMissing && !lostIncomplete));

  /**
   * The wizard steps, one question at a time. Which steps exist depends on the
   * answers: a no-answer / no-show skips the outcome step, and the stage step
   * only appears when the rule actually suggests a move.
   *
   * Each step declares its key, title, and whether you can advance from it yet.
   */
  const stageStepNeeded = reached && !!suggestedStage && suggestedStage !== company.stage;
  const steps: {
    key: string;
    title: string;
    canNext: boolean;
  }[] = [
    { key: "method", title: "How did you reach them?", canNext: method !== null },
    ...(reached
      ? [
          {
            key: "outcome",
            title: "How did it go?",
            canNext:
              !!outcome && (!needsObjection || !!objection) && !objectionNoteMissing && !lostIncomplete,
          },
        ]
      : []),
    { key: "context", title: reached ? "Anything they said?" : "Note for next time?", canNext: true },
    ...(reached ? [{ key: "asks", title: "Did they ask for anything?", canNext: true }] : []),
    ...(stageStepNeeded ? [{ key: "stage", title: "Where are they now?", canNext: true }] : []),
    { key: "next", title: "When do you reach back?", canNext: nextOk },
  ];

  const clampedStep = Math.min(step, steps.length - 1);
  const current = steps[clampedStep];
  const isLast = clampedStep === steps.length - 1;
  const stepLabels = steps.map((s) => s.title);

  const save = async () => {
    setSaving(true);
    try {
      // Only send a stage if the confirmed choice actually differs — never
      // rewrite the stage to what it already is.
      const stage = stageChoice !== company.stage ? stageChoice : null;
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
          next_action_at: noDate ? null : new Date(nextAt).toISOString(),
          next_action_reason: noDate ? nextReason || "Waiting on them — no date set" : nextReason,
          value_discussed: dealValue === "" ? null : Number(dealValue),
          stage,
          blocker_type: outcome === "blocked" ? blockerType : undefined,
          blocker_note: outcome === "blocked" ? blockerNote : undefined,
          lost_reason: outcome === "closed_lost" ? lostReason : undefined,
          lost_feedback: outcome === "closed_lost" ? lostFeedback : undefined,
          comeback_at:
            outcome === "closed_lost" && !noDate ? new Date(nextAt).toISOString() : undefined,
          next_purchase_due:
            outcome === "closed_won" && nextPurchaseDue
              ? new Date(nextPurchaseDue).toISOString()
              : undefined,
          // What they asked us for — only sent when we actually reached them.
          needs_brochure: reached ? flags.needs_brochure : undefined,
          brochure_note: reached ? flagNotes.brochure_note.trim() || null : undefined,
          needs_leads: reached ? flags.needs_leads : undefined,
          leads_note: reached ? flagNotes.leads_note.trim() || null : undefined,
          leads_change: reached ? flags.leads_change : undefined,
          leads_change_note: reached ? flagNotes.leads_change_note.trim() || null : undefined,
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

  const body = (
    <>
      <Stepper labels={stepLabels} current={clampedStep} />

      {/* Where we left off — a quiet reminder while logging. */}
      {(company.last_log?.note || company.notes) && clampedStep === 0 && (
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-3 mb-4">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
            Where we left things off
          </p>
          <p className="text-sm text-gray-700 line-clamp-3">
            {company.last_log?.note || company.notes}
          </p>
        </div>
      )}

      <div className="min-h-[7rem]">
        {current.key === "method" && (
          <>
            <p className="text-base font-semibold text-gray-900 mb-3">How did you reach them?</p>
            <div className="grid grid-cols-2 gap-2">
              {CONTACT_METHODS.map((m) => (
                <Choice key={m.key} active={method === m.key} onClick={() => setMethod(m.key)}>
                  {m.label}
                </Choice>
              ))}
            </div>
            {method === "meet" && (
              <div className="mt-3">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Who joined from their side? (optional)
                </label>
                <input
                  value={attendees}
                  onChange={(e) => setAttendees(e.target.value)}
                  placeholder="e.g. Himanshu + 2 from their tech team"
                  className={inputCls}
                />
              </div>
            )}
          </>
        )}

        {current.key === "outcome" && (
          <>
            <p className="text-base font-semibold text-gray-900 mb-3">How did it go?</p>
            <div className="grid grid-cols-2 gap-2">
              {OUTCOMES.map((o) => (
                <Choice key={o} active={outcome === o} onClick={() => setOutcome(o)}>
                  {OUTCOME_LABELS[o]}
                </Choice>
              ))}
            </div>

            {needsObjection && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  What's the objection? (required)
                </label>
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
              </div>
            )}

            {outcome === "blocked" && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  What's blocking them?
                </label>
                <div className="flex flex-wrap gap-2">
                  {BLOCKER_TYPES.map((b) => (
                    <Choice key={b} active={blockerType === b} onClick={() => setBlockerType(b)}>
                      {BLOCKER_LABELS[b]}
                    </Choice>
                  ))}
                </div>
                <input
                  value={blockerNote}
                  onChange={(e) => setBlockerNote(e.target.value)}
                  placeholder="Detail — e.g. waiting on their tech team to sign off"
                  className={`${inputCls} mt-2`}
                />
              </div>
            )}

            {outcome === "closed_won" && (
              <div className="mt-4 grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    Deal value (₹) — the floor, not the finish
                  </label>
                  <input
                    type="number"
                    value={dealValue}
                    onChange={(e) => setDealValue(e.target.value)}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                    When should they buy again?
                  </label>
                  <input
                    type="datetime-local"
                    value={nextPurchaseDue}
                    onChange={(e) => setNextPurchaseDue(e.target.value)}
                    className={inputCls}
                  />
                </div>
              </div>
            )}

            {outcome === "closed_lost" && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Why? (required)
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {LOST_REASONS.map((r) => (
                    <Choice key={r} active={lostReason === r} onClick={() => setLostReason(r)}>
                      {LOST_REASON_LABELS[r]}
                    </Choice>
                  ))}
                </div>
                {lostReason === "competitor_contract" && (
                  <input
                    type="datetime-local"
                    value={competitorExpiry}
                    onChange={(e) => setCompetitorExpiry(e.target.value)}
                    className={`${inputCls} mt-2`}
                    placeholder="When does their contract expire?"
                  />
                )}
                <textarea
                  value={lostFeedback}
                  onChange={(e) => setLostFeedback(e.target.value)}
                  rows={2}
                  placeholder={
                    lostReasonNeedsNote(lostReason)
                      ? "Required — what was it, in their words?"
                      : "Their feedback — what would have changed this? (required)"
                  }
                  className={`${inputCls} mt-2`}
                />
              </div>
            )}
          </>
        )}

        {current.key === "context" && (
          <>
            <p className="text-base font-semibold text-gray-900 mb-3">
              {reached ? "What did they say? How did it feel?" : "Any note for next time? (optional)"}
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={reached ? 4 : 2}
              placeholder={
                reached
                  ? "Their tone, exactly what they asked for, anything worth remembering next time…"
                  : "e.g. rang out twice — try WhatsApp, or call after 6pm"
              }
              className={inputCls}
            />
            {reached && (
              <div className="mt-4">
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                  Temperature now
                </label>
                <div className="flex gap-2">
                  {TEMPERATURES.map((t) => (
                    <Choice
                      key={t}
                      active={temperature === t}
                      onClick={() => {
                        setTempTouched(true);
                        setTemperature(t);
                      }}
                    >
                      {t}
                    </Choice>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {current.key === "asks" && (
          <>
            <p className="text-base font-semibold text-gray-900 mb-3">
              Did they ask us for anything?
            </p>
            <p className="text-xs text-gray-500 mb-3">
              Tap what they want — it flags on the board so it doesn't slip.
            </p>
            <div className="space-y-2">
              {FLAGS.map((f) => (
                <div key={f.key} className="rounded-xl border border-gray-200 p-2.5">
                  <label className="flex items-center gap-2 text-sm text-gray-800">
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
                      className={`${inputCls} mt-2 text-xs`}
                    />
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {current.key === "stage" && (
          <>
            <p className="text-base font-semibold text-gray-900 mb-3">Where are they now?</p>
            <ConfirmStage
              current={company.stage}
              suggested={suggestedStage}
              value={stageChoice}
              onChange={setStageChoice}
            />
          </>
        )}

        {current.key === "next" && (
          <>
            <p className="text-base font-semibold text-gray-900 mb-3">When do you reach back?</p>

            {/* Sometimes there's genuinely no next step to schedule — the ball's
                in their court. Log it without a follow-up date. */}
            <label className="flex items-center gap-2 text-sm text-gray-700 mb-3">
              <input
                type="checkbox"
                checked={noDate}
                onChange={(e) => setNoDate(e.target.checked)}
                className="rounded"
              />
              No follow-up date — waiting on them
            </label>

            {!noDate && !reached && (
              <div className="flex flex-wrap gap-2 mb-3">
                {method === "no_answer" && (
                  <>
                    <Choice onClick={() => quick(addMinutes(new Date(), 30), "Retry — no answer")}>
                      30 min
                    </Choice>
                    <Choice onClick={() => quick(addHours(new Date(), 1), "Retry — no answer")}>
                      1 hr
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
            )}
            {noDate ? (
              <input
                value={nextReason}
                onChange={(e) => setNextReason(e.target.value)}
                placeholder="Why no date? e.g. their side is stuck in internal red tape"
                className={inputCls}
              />
            ) : (
              <>
                <input
                  type="datetime-local"
                  value={nextAt}
                  onChange={(e) => setNextAt(e.target.value)}
                  className={inputCls}
                />
                <input
                  value={nextReason}
                  onChange={(e) => setNextReason(e.target.value)}
                  placeholder="Why then? (suggested from the call — change freely)"
                  className={inputCls + " mt-2"}
                />
              </>
            )}
          </>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 pt-4 mt-2 border-t border-gray-100">
        <button
          onClick={clampedStep === 0 ? onClose : () => setStep(clampedStep - 1)}
          className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
        >
          {clampedStep === 0 ? "Cancel" : "← Back"}
        </button>
        {isLast ? (
          <button
            disabled={!canSave || saving}
            onClick={save}
            className="px-5 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        ) : (
          <button
            disabled={!current.canNext}
            onClick={() => setStep(clampedStep + 1)}
            className="px-5 py-2 rounded-xl bg-neutral-900 text-white text-sm font-medium disabled:opacity-40"
          >
            Next →
          </button>
        )}
      </div>
    </>
  );

  if (variant === "inline") {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">{body}</div>;
  }

  return (
    <Shell
      title={`${method === "meet" ? "Log meet" : method === "no_show" ? "Log no-show" : "Log call"} — ${
        company.name
      }`}
      onClose={onClose}
    >
      {body}
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
