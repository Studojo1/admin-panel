import { Fragment, useEffect, useMemo, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/ugc-applicants";

export function meta({}: Route.MetaArgs) {
  return [{ title: "UGC applicants - Admin Panel" }];
}

// Applications to the Creator Program (LinkedIn UGC) from studojo.com/creators.
// The team filters them, reads every answer, sets a status, keeps notes and
// exports from here. Reads and saves go through /api/ugc-applicants.

interface Applicant {
  id: number;
  full_name: string;
  email: string;
  whatsapp: string;
  college: string;
  course: string;
  year_of_study: string;
  graduation_year: string | null;
  city: string | null;
  linkedin_url: string;
  followers: string;
  post_frequency: string;
  last_posted: string;
  best_post_url: string | null;
  crossed_1k: string | null;
  field: string;
  target_roles: string;
  dream_companies: string | null;
  looking_for: string;
  topics: string[];
  avoid_topics: string | null;
  story_work: string | null;
  story_setback: string | null;
  story_lesson: string | null;
  tone: string | null;
  can_commit: string;
  studojo_ok: string;
  why_join: string;
  referral_source: string | null;
  referred_by: string | null;
  consent_at: string;
  status: string;
  team_notes: string | null;
  source_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  created_at: string;
}

interface Counts {
  total: number;
  last_24_hours: number;
  by_status: Record<string, number>;
}

// The review states and the notes limit, as enforced by api.ugc-applicants.tsx.
const STATUSES = ["new", "shortlisted", "selected", "rejected"] as const;

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  selected: "Selected",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 border-blue-200",
  shortlisted: "bg-amber-100 text-amber-700 border-amber-200",
  selected: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-gray-200 text-gray-600 border-gray-300",
};

const NOTES_MAX = 2000;

// The answers the form offers (frontend app/lib/ugc-application.ts). The filters
// list them even before anyone has picked them; any other value found in the
// data is added after them, so nothing becomes unfilterable.
const FIELDS = [
  "Computer Science / IT",
  "Data / AI",
  "Product",
  "Finance",
  "Consulting",
  "Marketing",
  "Sales / Business development",
  "Design",
  "HR / People",
  "Operations",
  "Core engineering",
  "Law",
  "Media / Content",
  "Other",
] as const;
const CAN_COMMIT = ["Yes, 3 posts a week for 4 weeks", "I can do 1-2 posts a week", "Not right now"] as const;
const FOLLOWERS = ["Under 100", "100-300", "300-500", "500-1,000", "1,000-5,000", "5,000+"] as const;
const LAST_POSTED = ["In the last week", "In the last month", "1-6 months ago", "More than 6 months ago", "Never"] as const;

type FilterKey = "status" | "field" | "can_commit" | "followers" | "last_posted";

const FILTERS: { key: FilterKey; label: string; all: string; known: readonly string[] }[] = [
  { key: "status", label: "Status", all: "All statuses", known: STATUSES },
  { key: "field", label: "Field", all: "All fields", known: FIELDS },
  { key: "can_commit", label: "Can commit", all: "Any answer", known: CAN_COMMIT },
  { key: "followers", label: "Followers", all: "Any number", known: FOLLOWERS },
  { key: "last_posted", label: "Last posted", all: "Any time", known: LAST_POSTED },
];

const NO_FILTERS: Record<FilterKey, string> = {
  status: "",
  field: "",
  can_commit: "",
  followers: "",
  last_posted: "",
};

// The three story prompts on the form, in the form's order.
const STORIES: { key: "story_work" | "story_setback" | "story_lesson"; title: string }[] = [
  { key: "story_work", title: "An internship, job or project they've done" },
  { key: "story_setback", title: "A rejection, or a time something didn't go to plan" },
  { key: "story_lesson", title: "Something they learned the hard way" },
];

// Every column, stories included, in the order the form asks for them.
const CSV_COLUMNS: (keyof Applicant)[] = [
  "id", "created_at", "status",
  "full_name", "email", "whatsapp", "college", "course", "year_of_study", "graduation_year", "city",
  "linkedin_url", "followers", "post_frequency", "last_posted", "best_post_url", "crossed_1k",
  "field", "target_roles", "dream_companies", "looking_for", "topics", "avoid_topics",
  "story_work", "story_setback", "story_lesson", "tone",
  "can_commit", "studojo_ok", "why_join", "referral_source", "referred_by", "consent_at",
  "team_notes", "source_path", "utm_source", "utm_medium", "utm_campaign", "referrer",
];

function toDate(value: string | null): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatDay(value: string | null): string {
  const date = toDate(value);
  return date ? date.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";
}

function formatClock(value: string | null): string {
  const date = toDate(value);
  return date ? date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "";
}

function formatDateTime(value: string | null): string {
  return toDate(value) ? `${formatDay(value)}, ${formatClock(value)}` : value || "Not recorded";
}

// Applicant answers only become links when they are https. The form stores
// LinkedIn links as https://www.linkedin.com/..., so anything else is shown as
// plain text instead.
function httpsUrl(value: string | null): string | null {
  return value && value.startsWith("https://") ? value : null;
}

// Built here from the stored email. Everything but the @ is encoded, so a stray
// ? or & in the address cannot add mail headers.
function mailtoHref(email: string): string {
  return `mailto:${encodeURIComponent(email).replace(/%40/g, "@")}`;
}

// Built here from the stored number: wa.me takes the full international number
// as digits only, with no + or spaces.
function whatsappHref(number: string): string | null {
  const digits = number.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? `https://wa.me/${digits}` : null;
}

// The same clean-up the API applies before saving notes.
function cleanNotes(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

// Quoted on every cell, with quotes doubled, so commas and line breaks in the
// stories stay inside their cell. Spreadsheet apps run a cell that starts with
// = + - or @ as a formula, and these cells hold whatever applicants typed, so
// such cells get a leading apostrophe and open as plain text.
function csvCell(value: unknown): string {
  let text = value == null ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(rows: Applicant[]) {
  const lines = [
    CSV_COLUMNS.map(csvCell).join(","),
    ...rows.map((row) => CSV_COLUMNS.map((key) => csvCell(row[key])).join(",")),
  ];
  // The byte order mark makes Excel read the file as UTF-8.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `studojo-ugc-applicants-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function postAction(body: Record<string, unknown>) {
  const token = await getToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch("/api/ugc-applicants", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function withId(set: Set<number>, id: number, present: boolean): Set<number> {
  const next = new Set(set);
  if (present) next.add(id);
  else next.delete(id);
  return next;
}

export default function UgcApplicants() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [rows, setRows] = useState<Applicant[]>([]);
  const [counts, setCounts] = useState<Counts | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [filters, setFilters] = useState<Record<FilterKey, string>>(NO_FILTERS);
  const [search, setSearch] = useState("");
  // Rows opened to show every answer.
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [savingStatus, setSavingStatus] = useState<Set<number>>(new Set());
  // Notes being edited, by applicant id. Kept while a row is closed, so
  // nothing typed is lost by collapsing it.
  const [noteDrafts, setNoteDrafts] = useState<Record<number, string>>({});
  const [savingNotes, setSavingNotes] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isPending || !isAuthorized) return;
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/ugc-applicants", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (res.status === 401) throw new Error("this needs an admin or ops login");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (cancelled) return;
        setRows(data.applicants || []);
        setCounts(data.counts || null);
      } catch (e: any) {
        if (!cancelled) setLoadError(e.message || "Failed to load");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [isPending, isAuthorized]);

  // Each filter's choices, with how many applicants gave that answer.
  const filterOptions = useMemo(() => {
    const out = {} as Record<FilterKey, { value: string; count: number }[]>;
    for (const f of FILTERS) {
      const tally = new Map<string, number>();
      for (const r of rows) tally.set(r[f.key], (tally.get(r[f.key]) ?? 0) + 1);
      const extra = [...tally.keys()].filter((v) => !f.known.includes(v)).sort();
      out[f.key] = [...f.known, ...extra].map((value) => ({ value, count: tally.get(value) ?? 0 }));
    }
    return out;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter(
      (r) =>
        FILTERS.every((f) => !filters[f.key] || r[f.key] === filters[f.key]) &&
        (!q || [r.full_name, r.email, r.college].some((v) => (v || "").toLowerCase().includes(q)))
    );
  }, [rows, filters, search]);

  const filtersActive = search.trim() !== "" || FILTERS.some((f) => filters[f.key] !== "");

  function clearFilters() {
    setFilters(NO_FILTERS);
    setSearch("");
  }

  function toggle(id: number) {
    setExpanded((prev) => withId(prev, id, !prev.has(id)));
  }

  // A click anywhere on a row opens it, except on its links and controls, or
  // when the click ends a text selection (copying an email, say).
  function onRowClick(e: MouseEvent<HTMLTableRowElement>, id: number) {
    if ((e.target as HTMLElement).closest("a, button, select, input, textarea, label")) return;
    if (window.getSelection()?.toString()) return;
    toggle(id);
  }

  async function changeStatus(applicant: Applicant, status: string) {
    const previous = applicant.status;
    if (status === previous) return;
    setSavingStatus((s) => withId(s, applicant.id, true));
    // Optimistic: show the new status now, put the old one back if the save fails.
    setRows((rs) => rs.map((r) => (r.id === applicant.id ? { ...r, status } : r)));
    try {
      const data = await postAction({ intent: "set-status", id: applicant.id, status });
      if (data.counts) setCounts(data.counts);
    } catch (e: any) {
      setRows((rs) => rs.map((r) => (r.id === applicant.id ? { ...r, status: previous } : r)));
      toast.error(`Could not update ${applicant.full_name}: ${e.message || "unknown error"}`);
    } finally {
      setSavingStatus((s) => withId(s, applicant.id, false));
    }
  }

  async function saveNotes(applicant: Applicant) {
    const draft = noteDrafts[applicant.id];
    if (draft === undefined) return;
    setSavingNotes((s) => withId(s, applicant.id, true));
    try {
      const data = await postAction({ intent: "set-notes", id: applicant.id, notes: draft });
      const saved: string | null = data.applicant?.team_notes ?? null;
      setRows((rs) => rs.map((r) => (r.id === applicant.id ? { ...r, team_notes: saved } : r)));
      // Drop the draft only if nothing more was typed while saving.
      setNoteDrafts((d) => {
        if (d[applicant.id] !== draft) return d;
        const next = { ...d };
        delete next[applicant.id];
        return next;
      });
      toast.success(`Notes saved for ${applicant.full_name}`);
    } catch (e: any) {
      toast.error(`Could not save notes: ${e.message || "unknown error"}`);
    } finally {
      setSavingNotes((s) => withId(s, applicant.id, false));
    }
  }

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F5F5F0]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
      </div>
    );
  }
  if (!isAuthorized) return null;

  const columns = ["", "Applied", "Applicant", "Field", "LinkedIn", "Followers", "Posting", "Can commit", "Studojo posts", "Status"];

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Clash Display, sans-serif" }}>
              UGC applicants
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Applications to the Creator Program from studojo.com/creators. Click a row to read every answer.
            </p>
          </div>
          <button
            type="button"
            onClick={() => downloadCsv(filtered)}
            disabled={filtered.length === 0}
            title="Downloads the applicants shown below, with every answer"
            className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
          >
            Download CSV
          </button>
        </div>

        {counts && (
          <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-5">
            <CountTile
              label="Total applicants"
              value={counts.total}
              note={`${counts.last_24_hours} in the past 24 hours`}
            />
            {STATUSES.map((s) => (
              <CountTile key={s} label={STATUS_LABELS[s]} value={counts.by_status[s] ?? 0} />
            ))}
          </div>
        )}

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            Could not load applications: {loadError}
          </div>
        )}

        {!loading && rows.length > 0 && (
          <div className="mb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
              <div>
                <label htmlFor="ugc-search" className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Search
                </label>
                <input
                  id="ugc-search"
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Name, email or college"
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
                />
              </div>
              {FILTERS.map((f) => (
                <div key={f.key}>
                  <label
                    htmlFor={`ugc-filter-${f.key}`}
                    className="mb-1 block text-xs font-semibold uppercase tracking-wide text-gray-500"
                  >
                    {f.label}
                  </label>
                  <select
                    id={`ugc-filter-${f.key}`}
                    value={filters[f.key]}
                    onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
                    className="w-full rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
                  >
                    <option value="">{f.all}</option>
                    {filterOptions[f.key].map((o) => (
                      <option key={o.value} value={o.value}>
                        {(f.key === "status" ? STATUS_LABELS[o.value] : undefined) ?? o.value} ({o.count})
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-3 text-sm">
              <span className="text-gray-400">
                {filtered.length} of {rows.length} shown
              </span>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs font-medium text-violet-700 underline underline-offset-2"
                >
                  Clear filters
                </button>
              )}
            </div>
          </div>
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-gray-400">Loading...</div>
        ) : loadError ? null : rows.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <p className="text-sm font-medium text-gray-700">No applications yet.</p>
            <p className="mt-1 text-sm text-gray-400">
              Applications from studojo.com/creators will show up here as they come in.
            </p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-gray-200 bg-white p-12 text-center shadow-sm">
            <p className="text-sm text-gray-500">No applications match these filters.</p>
            <button
              type="button"
              onClick={clearFilters}
              className="mt-3 text-sm font-medium text-violet-700 underline underline-offset-2"
            >
              Clear filters
            </button>
          </div>
        ) : (
          // @container lets an open row's answers size to the visible width
          // (100cqw) when the table is wider than the screen and scrolls.
          <div className="@container overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="border-b border-gray-200 bg-gray-50">
                <tr>
                  {columns.map((h, i) => (
                    <th
                      key={h || i}
                      className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => {
                  const open = expanded.has(r.id);
                  const linkedin = httpsUrl(r.linkedin_url);
                  const savedNotes = r.team_notes ?? "";
                  const draft = noteDrafts[r.id];
                  return (
                    <Fragment key={r.id}>
                      <tr
                        onClick={(e) => onRowClick(e, r.id)}
                        className={`cursor-pointer align-top ${open ? "bg-violet-50/60" : "hover:bg-gray-50"}`}
                      >
                        <td className="py-3 pl-3 pr-0">
                          <button
                            type="button"
                            onClick={() => toggle(r.id)}
                            aria-expanded={open}
                            aria-label={`${open ? "Hide" : "Show"} every answer from ${r.full_name}`}
                            className="flex h-6 w-6 items-center justify-center rounded text-gray-500 hover:bg-gray-200 hover:text-gray-900"
                          >
                            <svg
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              aria-hidden="true"
                              className={`transition-transform ${open ? "rotate-90" : ""}`}
                            >
                              <polyline points="9 6 15 12 9 18" />
                            </svg>
                          </button>
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-xs text-gray-500">
                          <div>{formatDay(r.created_at)}</div>
                          <div className="text-gray-400">{formatClock(r.created_at)}</div>
                        </td>
                        <td className="min-w-[200px] px-3 py-3">
                          <div className="font-medium text-gray-900">{r.full_name}</div>
                          <div className="text-xs text-gray-600">{r.college}</div>
                          <div className="text-xs text-gray-400">
                            {r.course}, {r.year_of_study}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-gray-800">{r.field}</td>
                        <td className="whitespace-nowrap px-3 py-3">
                          {linkedin ? (
                            <a
                              href={linkedin}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
                            >
                              Profile
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400" title={r.linkedin_url}>
                              Not a link
                            </span>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3 text-gray-800">{r.followers}</td>
                        <td className="px-3 py-3 text-gray-800">
                          <div>{r.post_frequency}</div>
                          <div className="text-xs text-gray-500">Last posted: {r.last_posted}</div>
                        </td>
                        <td className="px-3 py-3 text-gray-800">{r.can_commit}</td>
                        <td className="px-3 py-3 text-gray-800">{r.studojo_ok}</td>
                        <td className="px-3 py-3">
                          <select
                            aria-label={`Status for ${r.full_name}`}
                            value={r.status}
                            disabled={savingStatus.has(r.id)}
                            onChange={(e) => changeStatus(r, e.target.value)}
                            className={`rounded-full border px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50 ${
                              STATUS_STYLES[r.status] ?? STATUS_STYLES.new
                            }`}
                          >
                            {/* A status set outside this panel still shows. */}
                            {!(STATUSES as readonly string[]).includes(r.status) && (
                              <option value={r.status}>{r.status}</option>
                            )}
                            {STATUSES.map((s) => (
                              <option key={s} value={s}>
                                {STATUS_LABELS[s]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                      {open && (
                        <tr className="bg-gray-50">
                          <td colSpan={columns.length} className="p-0">
                            {/* Pinned to the visible width, so the answers stay readable without scrolling sideways. */}
                            <div className="sticky left-0 w-[100cqw] px-4 py-5">
                              <ApplicantDetail
                                applicant={r}
                                notes={draft ?? savedNotes}
                                notesDirty={draft !== undefined && cleanNotes(draft) !== savedNotes}
                                savingNotes={savingNotes.has(r.id)}
                                onNotesChange={(value) => setNoteDrafts((d) => ({ ...d, [r.id]: value }))}
                                onNotesSave={() => saveNotes(r)}
                              />
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

function CountTile({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{label}</p>
      <p className="mt-1 text-3xl font-bold text-gray-900">{value}</p>
      {note && <p className="mt-1 text-xs text-gray-400">{note}</p>}
    </div>
  );
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h3 className="mb-3 text-sm font-semibold text-gray-900">{title}</h3>
      {children}
    </section>
  );
}

function Answer({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-sm text-gray-800 [overflow-wrap:anywhere]">{children}</dd>
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-violet-700 underline underline-offset-2 hover:text-violet-900"
    >
      {children}
    </a>
  );
}

// Optional answers left empty.
function orBlank(value: string | null, blank = "Not answered"): ReactNode {
  return value && value.trim() ? value : <span className="text-gray-400">{blank}</span>;
}

function ApplicantDetail({
  applicant: a,
  notes,
  notesDirty,
  savingNotes,
  onNotesChange,
  onNotesSave,
}: {
  applicant: Applicant;
  notes: string;
  notesDirty: boolean;
  savingNotes: boolean;
  onNotesChange: (value: string) => void;
  onNotesSave: () => void;
}) {
  const linkedin = httpsUrl(a.linkedin_url);
  const bestPost = httpsUrl(a.best_post_url);
  const whatsapp = whatsappHref(a.whatsapp);
  const tooLong = notes.length > NOTES_MAX;
  const utmParts = [a.utm_source, a.utm_medium, a.utm_campaign];
  const utm = utmParts.some(Boolean) ? utmParts.map((v) => v || "none").join(" / ") : null;

  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="Contact">
          <dl className="space-y-3">
            <Answer label="Email">
              <a href={mailtoHref(a.email)} className="text-violet-700 underline underline-offset-2 hover:text-violet-900">
                {a.email}
              </a>
            </Answer>
            <Answer label="WhatsApp">
              {whatsapp ? <ExternalLink href={whatsapp}>{a.whatsapp}</ExternalLink> : a.whatsapp}
            </Answer>
            <Answer label="College">{a.college}</Answer>
            <Answer label="Course">{a.course}</Answer>
            <Answer label="Year of study">
              {a.year_of_study}
              {a.graduation_year ? `, graduating ${a.graduation_year}` : ""}
            </Answer>
            <Answer label="City">{orBlank(a.city)}</Answer>
          </dl>
        </Panel>

        <Panel title="LinkedIn">
          <dl className="space-y-3">
            <Answer label="Profile">
              {linkedin ? <ExternalLink href={linkedin}>{linkedin}</ExternalLink> : orBlank(a.linkedin_url)}
            </Answer>
            <Answer label="A post they're proud of">
              {bestPost ? <ExternalLink href={bestPost}>Open the post</ExternalLink> : orBlank(a.best_post_url)}
            </Answer>
            <Answer label="Followers">{a.followers}</Answer>
            <Answer label="How often they post">{a.post_frequency}</Answer>
            <Answer label="Last posted">{a.last_posted}</Answer>
            <Answer label="A post crossed 1,000 impressions">{orBlank(a.crossed_1k)}</Answer>
          </dl>
        </Panel>

        <Panel title="Where they're headed">
          <dl className="space-y-3">
            <Answer label="Field">{a.field}</Answer>
            <Answer label="Roles they're aiming for">{a.target_roles}</Answer>
            <Answer label="Companies they'd love to work at">{orBlank(a.dream_companies)}</Answer>
            <Answer label="Looking for">{a.looking_for}</Answer>
          </dl>
        </Panel>
      </div>

      <Panel title="What they'd post">
        <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Answer label="Topics">
            {a.topics.length ? (
              <div className="mt-1 flex flex-wrap gap-1.5">
                {a.topics.map((t) => (
                  <span
                    key={t}
                    className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700"
                  >
                    {t}
                  </span>
                ))}
              </div>
            ) : (
              orBlank(null)
            )}
          </Answer>
          <Answer label="Would rather not post about">{orBlank(a.avoid_topics)}</Answer>
          <Answer label="Tone">{orBlank(a.tone)}</Answer>
          <Answer label="Can post 3 times a week for 4 weeks">{a.can_commit}</Answer>
          <Answer label="1 in 3 posts about Studojo">{a.studojo_ok}</Answer>
        </dl>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        {STORIES.map((s) => (
          <Panel key={s.key} title={s.title}>
            {a[s.key] ? (
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">{a[s.key]}</p>
            ) : (
              <p className="text-sm text-gray-400">Not answered</p>
            )}
          </Panel>
        ))}
      </div>

      <Panel title="Why they want to join">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">{a.why_join}</p>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="How they heard">
          <dl className="space-y-3">
            <Answer label="Source">{orBlank(a.referral_source)}</Answer>
            <Answer label="Referred by">{orBlank(a.referred_by)}</Answer>
          </dl>
        </Panel>
        <Panel title="Dates">
          <dl className="space-y-3">
            <Answer label="Applied">{formatDateTime(a.created_at)}</Answer>
            <Answer label="Consent given">{formatDateTime(a.consent_at)}</Answer>
          </dl>
        </Panel>
        <Panel title="Attribution">
          <dl className="space-y-3">
            <Answer label="Page">{orBlank(a.source_path, "Not recorded")}</Answer>
            <Answer label="UTM source / medium / campaign">{orBlank(utm, "None")}</Answer>
            <Answer label="Referrer">{orBlank(a.referrer, "None")}</Answer>
          </dl>
        </Panel>
      </div>

      <Panel title="Team notes">
        <label htmlFor={`ugc-notes-${a.id}`} className="sr-only">
          Team notes on {a.full_name}
        </label>
        <textarea
          id={`ugc-notes-${a.id}`}
          value={notes}
          onChange={(e) => onNotesChange(e.target.value)}
          maxLength={NOTES_MAX}
          rows={4}
          placeholder="Only the team sees these."
          className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-xs ${tooLong ? "font-medium text-red-600" : "text-gray-400"}`}>
            {notes.length.toLocaleString("en-US")} / {NOTES_MAX.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-3">
            {notesDirty && !savingNotes && <span className="text-xs text-amber-700">Not saved yet</span>}
            <button
              type="button"
              onClick={onNotesSave}
              disabled={!notesDirty || savingNotes || tooLong}
              className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
            >
              {savingNotes ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
