import { useState } from "react";
import { toast } from "sonner";
import { getToken } from "~/lib/api";
import {
  BLOCKED_STAGES,
  EXIT_REASONS,
  EXIT_REASON_LABELS,
  STAGE_LABELS,
  WON_STAGES,
  addDays,
  exitReasonNeedsNote,
  toLocalInputValue,
  type Company,
  type ExitReason,
  type Stage,
  type Temperature,
} from "~/lib/b2b-gtm";

/** Shared by the list and the company page. Mirrors the coupons.tsx helper. */
export async function authedFetch(url: string, opts: RequestInit = {}) {
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

const TEMP_STYLES: Record<Temperature, string> = {
  hot: "bg-red-100 text-red-700 border-red-200",
  warm: "bg-orange-100 text-orange-700 border-orange-200",
  neutral: "bg-gray-100 text-gray-600 border-gray-200",
  cold: "bg-blue-100 text-blue-700 border-blue-200",
};

export function TempBadge({ t }: { t: Temperature | null }) {
  if (!t) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${TEMP_STYLES[t]}`}
    >
      {t}
    </span>
  );
}

export function StageBadge({ s }: { s: Stage }) {
  const won = WON_STAGES.includes(s);
  const blocked = BLOCKED_STAGES.includes(s);
  const lost = s === "closed_lost" || s === "feedback_pending" || s === "comeback_scheduled";
  const exited = s === "exited";
  const cls = won
    ? "bg-green-100 text-green-700 border-green-200"
    : blocked
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : lost
    ? "bg-rose-100 text-rose-700 border-rose-200"
    : exited
    ? "bg-gray-200 text-gray-500 border-gray-300"
    : "bg-violet-100 text-violet-700 border-violet-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {STAGE_LABELS[s] ?? s}
    </span>
  );
}

export const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400";

export function Shell({
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
          <h2
            className="font-bold text-gray-900"
            style={{ fontFamily: "Clash Display, sans-serif" }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function Choice({
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

/**
 * A slim progress row for the guided log wizard: filled pills for done/current
 * steps, hollow for the ones ahead, and a "Step N of M — label" line. Purely
 * visual; the parent owns which step is active.
 */
export function Stepper({
  labels,
  current,
}: {
  labels: string[];
  current: number;
}) {
  return (
    <div className="mb-4">
      <div className="flex items-center gap-1.5 mb-1.5">
        {labels.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full flex-1 transition-colors ${
              i <= current ? "bg-violet-500" : "bg-gray-200"
            }`}
          />
        ))}
      </div>
      <p className="text-[11px] font-semibold text-gray-400 uppercase tracking-wide">
        Step {current + 1} of {labels.length} — {labels[current]}
      </p>
    </div>
  );
}

/**
 * The suggest-and-confirm stage control. A rule proposes a stage; this shows it
 * as a one-tap confirm ("Move to X") sitting next to "Keep as Y". Nothing moves
 * until the user picks. `value` is what will be saved: `suggested` while the
 * move is accepted, `current` while it's declined. Always overridable via the
 * full dropdown the caller renders separately.
 *
 * Deterministic, no model — the suggestion comes from stageForOutcome().
 */
export function ConfirmStage({
  current,
  suggested,
  value,
  onChange,
}: {
  current: Stage;
  suggested: Stage | null;
  value: Stage;
  onChange: (s: Stage) => void;
}) {
  if (!suggested || suggested === current) return null;
  const accepted = value === suggested;
  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-3 mb-4">
      <p className="text-xs font-semibold text-violet-800 mb-2">
        This looks like a move to <span className="underline">{STAGE_LABELS[suggested]}</span>.
      </p>
      <div className="flex flex-wrap gap-2">
        <Choice active={accepted} onClick={() => onChange(suggested)}>
          {`Move to ${STAGE_LABELS[suggested]}`}
        </Choice>
        <Choice active={!accepted} onClick={() => onChange(current)}>
          {`Keep as ${STAGE_LABELS[current]}`}
        </Choice>
      </div>
      <p className="text-[11px] text-violet-500 mt-1.5">Suggested by rule — you decide.</p>
    </div>
  );
}

/**
 * Park a company out of the pipeline. Asks why (required) — the same discipline
 * as a lost deal, so the Exit tab is never a pile of unexplained rows.
 */
export function ExitModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [reason, setReason] = useState<ExitReason | null>(null);
  const [feedback, setFeedback] = useState("");
  const [saving, setSaving] = useState(false);

  const noteMissing = exitReasonNeedsNote(reason) && !feedback.trim();
  const canSave = !!reason && !noteMissing;

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=exit", {
        method: "POST",
        body: JSON.stringify({
          company_id: company.id,
          exit_reason: reason,
          exit_feedback: feedback.trim() || null,
        }),
      });
      toast.success("Removed from the pipeline — you can bring them back any time");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={`Remove from pipeline — ${company.name}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        This parks them out of the way — they leave every working tab and sit on the Exit tab. Not
        gone: you can bring them back whenever things change.
      </p>
      <Field label="Why are we removing them? (required)">
        <div className="grid grid-cols-2 gap-2">
          {EXIT_REASONS.map((r) => (
            <Choice key={r} active={reason === r} onClick={() => setReason(r)}>
              {EXIT_REASON_LABELS[r]}
            </Choice>
          ))}
        </div>
      </Field>
      <Field
        label={
          exitReasonNeedsNote(reason) ? "What was it, in a line? (required)" : "Any detail (optional)"
        }
      >
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          rows={2}
          placeholder="So future-you knows why this was parked."
          className={`${inputCls} ${noteMissing ? "border-rose-400 ring-1 ring-rose-300" : ""}`}
        />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">
          Cancel
        </button>
        <button
          disabled={!canSave || saving}
          onClick={save}
          className="px-4 py-2 rounded-xl bg-neutral-900 text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Remove from pipeline"}
        </button>
      </div>
    </Shell>
  );
}

/**
 * Bring a parked company back. Lands at GTM active, unowned (mine again), and
 * asks for a next action so it never re-enters as a dead row.
 */
export function ReactivateModal({
  company,
  onClose,
  onSaved,
}: {
  company: Company;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [nextAt, setNextAt] = useState(toLocalInputValue(addDays(new Date(), 1)));
  const [reason, setReason] = useState("Picking this back up");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await authedFetch("/api/b2b-gtm?action=reactivate", {
        method: "POST",
        body: JSON.stringify({
          company_id: company.id,
          next_action_at: nextAt ? new Date(nextAt).toISOString() : null,
          next_action_reason: reason.trim() || "Brought back into the pipeline",
        }),
      });
      toast.success("Back in the pipeline");
      onSaved();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Shell title={`Bring back — ${company.name}`} onClose={onClose}>
      <p className="text-sm text-gray-500 mb-4">
        They'll return to GTM active, unowned (Pranav's again). Set the first thing to do so they don't
        stall.
      </p>
      <Field label="When do we pick this up?">
        <input
          type="datetime-local"
          value={nextAt}
          onChange={(e) => setNextAt(e.target.value)}
          className={inputCls}
        />
      </Field>
      <Field label="Why then?">
        <input value={reason} onChange={(e) => setReason(e.target.value)} className={inputCls} />
      </Field>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600">
          Cancel
        </button>
        <button
          disabled={saving}
          onClick={save}
          className="px-4 py-2 rounded-xl bg-violet-500 text-white text-sm font-medium disabled:opacity-40"
        >
          {saving ? "Saving…" : "Bring back to pipeline"}
        </button>
      </div>
    </Shell>
  );
}
