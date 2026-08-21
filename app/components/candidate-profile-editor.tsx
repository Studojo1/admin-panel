import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  getCandidateProfile,
  patchCandidateProfile,
  resetCandidateLeads,
  type CandidateEditableProfile,
  type CandidateProfileResponse,
} from "~/lib/api";

/** Company-size options mirror Apollo's valid ranges. */
const SIZE_OPTIONS = [
  { value: "1,50", label: "1-50" },
  { value: "51,200", label: "51-200" },
  { value: "50,500", label: "50-500" },
  { value: "201,1000", label: "201-1,000" },
  { value: "50,10000", label: "50-10,000 (incl. large firms)" },
  { value: "1,10000", label: "Any size" },
];

const WORK_MODES = ["Remote", "Hybrid", "Onsite", "Flexible"];

/** Editable list of short strings, rendered as removable chips. */
function ChipList({
  label, hint, values, onChange, accent = false,
}: {
  label: string;
  hint?: string;
  values: string[];
  onChange: (v: string[]) => void;
  accent?: boolean;
}) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const parts = draft.split(",").map((p) => p.trim()).filter(Boolean);
    if (!parts.length) return;
    const next = [...values];
    for (const p of parts) {
      if (!next.some((v) => v.toLowerCase() === p.toLowerCase())) next.push(p);
    }
    onChange(next);
    setDraft("");
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= values.length) return;
    const next = [...values];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium text-gray-800">{label}</label>
        <span className="text-xs text-gray-400">{values.length}</span>
      </div>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className={`group inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs ${
              accent && i < 3
                ? "border-violet-300 bg-violet-50 text-violet-800"
                : "border-gray-200 bg-gray-50 text-gray-700"
            }`}
          >
            <button
              type="button"
              onClick={() => move(i, -1)}
              className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
              aria-label={`Move ${v} earlier`}
            >
              &#8592;
            </button>
            {v}
            <button
              type="button"
              onClick={() => move(i, 1)}
              className="opacity-0 transition group-hover:opacity-60 hover:!opacity-100"
              aria-label={`Move ${v} later`}
            >
              &#8594;
            </button>
            <button
              type="button"
              onClick={() => onChange(values.filter((_, k) => k !== i))}
              className="ml-0.5 text-gray-400 hover:text-red-600"
              aria-label={`Remove ${v}`}
            >
              &times;
            </button>
          </span>
        ))}
        {!values.length && <span className="text-xs italic text-gray-400">None set</span>}
      </div>
      <div className="mt-2 flex gap-2">
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
          }}
          placeholder="Type and press Enter — commas add several"
          className="flex-1 rounded-md border border-gray-300 px-2.5 py-1.5 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        <button
          type="button"
          onClick={add}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
        >
          Add
        </button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-800">{label}</label>
      {hint && <p className="mt-0.5 text-xs text-gray-500">{hint}</p>}
      <div className="mt-1.5">{children}</div>
    </div>
  );
}

export function CandidateProfileEditor({
  candidateId, onClose,
}: {
  candidateId: number;
  onClose: () => void;
}) {
  const [data, setData] = useState<CandidateProfileResponse | null>(null);
  const [form, setForm] = useState<CandidateEditableProfile | null>(null);
  const [reason, setReason] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [lastSaveChanged, setLastSaveChanged] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    getCandidateProfile(candidateId)
      .then((d) => {
        if (!alive) return;
        setData(d);
        setForm({ ...d.profile });
        setError(null);
      })
      .catch((e) => alive && setError(e.message))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [candidateId]);

  const set = <K extends keyof CandidateEditableProfile>(k: K, v: CandidateEditableProfile[K]) =>
    setForm((f) => (f ? { ...f, [k]: v } : f));

  // Only send fields that actually differ, so an accidental open never rewrites data.
  const diff = (): Partial<CandidateEditableProfile> => {
    if (!data || !form) return {};
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(form) as (keyof CandidateEditableProfile)[]) {
      const a = form[k], b = data.profile[k];
      if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = a;
    }
    return out as Partial<CandidateEditableProfile>;
  };

  const changed = Object.keys(diff());

  // Fields that change WHO gets contacted. Editing any of these leaves the
  // previously collected leads stale — they were found under the old criteria.
  const TARGETING_FIELDS = [
    "target_role", "locations", "company_size", "company_stage",
    "industries", "niche_keywords", "extra_manager_titles", "dream_companies",
  ];
  const targetingStale = lastSaveChanged.some((f) => TARGETING_FIELDS.includes(f));

  const resetLeads = async () => {
    if (!confirm(
      "Clear this candidate's leads?\n\n" +
      "Leads already emailed are kept, so send and reply history survives. " +
      "Everything else is removed and the next discovery run starts clean.",
    )) return;
    setResetting(true);
    try {
      const res = await resetCandidateLeads(candidateId, {
        reason: reason || "Profile retargeted",
      });
      toast.success(
        `Removed ${res.deleted} lead(s)` +
        (res.kept_contacted ? ` — kept ${res.kept_contacted} already emailed` : ""),
      );
      setLastSaveChanged([]);
    } catch (e: any) {
      toast.error(e.message || "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const save = async () => {
    const patch = diff();
    if (!Object.keys(patch).length) { toast.info("Nothing changed"); return; }
    setSaving(true);
    try {
      const res = await patchCandidateProfile(candidateId, { ...patch, reason });
      toast.success(`Saved — ${Object.keys(res.changed).length} field(s) updated`);
      setLastSaveChanged(Object.keys(res.changed));
      const fresh = await getCandidateProfile(candidateId);
      setData(fresh);
      setForm({ ...fresh.profile });
      setReason("");
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 sm:p-8">
      <div className="w-full max-w-3xl rounded-xl bg-white shadow-xl">
        <div className="flex items-start justify-between border-b border-gray-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Edit candidate profile</h2>
            {data && (
              <p className="mt-0.5 text-sm text-gray-500">
                {data.user_name || "Unknown"} &middot; {data.user_email || "no email"} &middot;
                <span className="ml-1 font-mono text-xs">candidate #{data.candidate_id}</span>
              </p>
            )}
          </div>
          <button onClick={onClose} className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
            &times;
          </button>
        </div>

        {loading && <div className="px-6 py-16 text-center text-sm text-gray-500">Loading profile&hellip;</div>}
        {error && <div className="m-6 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        {form && data && (
          <>
            <div className="space-y-6 px-6 py-5">
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
                Changes here feed lead targeting and the wording of outreach emails sent in this
                person&rsquo;s name. Only record skills and experience they actually have.
              </div>

              {targetingStale && (
                <div className="rounded-lg border border-red-300 bg-red-50 px-4 py-3">
                  <p className="text-sm font-medium text-red-800">
                    Existing leads no longer match this profile
                  </p>
                  <p className="mt-1 text-xs text-red-700">
                    You changed targeting, but the leads already collected were found under the
                    old criteria and will keep showing. Clear them, then run lead discovery again.
                    Leads already emailed are kept.
                  </p>
                  <button
                    type="button"
                    onClick={resetLeads}
                    disabled={resetting}
                    className="mt-2.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 disabled:bg-gray-300"
                  >
                    {resetting ? "Clearing…" : "Clear stale leads"}
                  </button>
                </div>
              )}

              <Field
                label="Target role"
                hint={`Drives lead search and hiring-manager titles. Currently read from ${data.target_role_source}.`}
              >
                <input
                  value={form.target_role}
                  onChange={(e) => set("target_role", e.target.value)}
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                />
              </Field>

              <ChipList
                label="Skills"
                hint="Order matters — the first three appear in every email. Use the arrows to reorder."
                values={form.skills}
                onChange={(v) => set("skills", v)}
                accent
              />

              <ChipList
                label="Extra hiring-manager titles"
                hint="Merged into every search segment. Use to reach functions the resume alone would not imply, e.g. customer support leadership."
                values={form.extra_manager_titles}
                onChange={(v) => set("extra_manager_titles", v)}
              />

              <div className="grid gap-5 sm:grid-cols-2">
                <Field label="Company size">
                  <select
                    value={form.company_size}
                    onChange={(e) => set("company_size", e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    {!SIZE_OPTIONS.some((o) => o.value === form.company_size) && form.company_size && (
                      <option value={form.company_size}>{form.company_size} (current)</option>
                    )}
                    {SIZE_OPTIONS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </Field>

                <Field label="Work mode">
                  <select
                    value={form.work_mode}
                    onChange={(e) => set("work_mode", e.target.value)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                  >
                    <option value="">Not set</option>
                    {!WORK_MODES.includes(form.work_mode) && form.work_mode && (
                      <option value={form.work_mode}>{form.work_mode}</option>
                    )}
                    {WORK_MODES.map((w) => <option key={w} value={w}>{w}</option>)}
                  </select>
                </Field>
              </div>

              <ChipList label="Locations" values={form.locations} onChange={(v) => set("locations", v)} />
              <ChipList label="Industries" values={form.industries} onChange={(v) => set("industries", v)} />
              <ChipList
                label="Niche keywords"
                hint="A lead whose company matches none of these is penalised in scoring."
                values={form.niche_keywords}
                onChange={(v) => set("niche_keywords", v)}
              />
              <ChipList
                label="Dream companies"
                hint="Searched separately and exempt from scoring penalties. Max 10."
                values={form.dream_companies}
                onChange={(v) => set("dream_companies", v)}
              />

              <div className="border-t border-gray-200 pt-5">
                <p className="text-sm font-medium text-gray-800">Email personalisation</p>
                <p className="mt-0.5 text-xs text-gray-500">
                  These go into the body of every email. &ldquo;Best project&rdquo; overrides the resume
                  as the sender&rsquo;s headline achievement.
                </p>
                <div className="mt-3 space-y-4">
                  <Field label="Best project">
                    <textarea
                      value={form.best_project}
                      onChange={(e) => set("best_project", e.target.value)}
                      rows={2}
                      className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                    />
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Outcome">
                      <input
                        value={form.outcome}
                        onChange={(e) => set("outcome", e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </Field>
                    <Field label="Credential" hint="Appears in every email when set.">
                      <input
                        value={form.credential}
                        onChange={(e) => set("credential", e.target.value)}
                        className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
                      />
                    </Field>
                  </div>
                </div>
              </div>

              {data.edit_history.length > 0 && (
                <details className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium text-gray-700">
                    Edit history ({data.edit_history.length})
                  </summary>
                  <ul className="mt-3 space-y-2">
                    {[...data.edit_history].reverse().map((h, i) => (
                      <li key={i} className="border-l-2 border-gray-300 pl-3 text-xs text-gray-600">
                        <span className="font-mono">{new Date(h.at).toLocaleString()}</span>
                        {" — "}{h.admin_email}
                        {h.reason && <span className="italic"> &ldquo;{h.reason}&rdquo;</span>}
                        <div className="text-gray-500">changed: {Object.keys(h.changes).join(", ")}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>

            <div className="sticky bottom-0 flex items-center justify-between gap-4 rounded-b-xl border-t border-gray-200 bg-white px-6 py-4">
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason for this edit (recorded in history)"
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
              <span className="whitespace-nowrap text-xs text-gray-500">
                {changed.length ? `${changed.length} field(s) changed` : "No changes"}
              </span>
              <button
                onClick={save}
                disabled={saving || !changed.length}
                className="rounded-md bg-violet-600 px-4 py-2 text-sm font-medium text-white hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-gray-300"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
