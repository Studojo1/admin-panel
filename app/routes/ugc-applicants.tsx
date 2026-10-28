import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/ugc-applicants";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Growth Fellowship - Admin Panel" }];
}

// Applications to the Growth Fellowship from studojo.com/fellowship-growth
// (also served at /creators and /ugc).
// The team follows the page's funnel and the applicants' share links, filters
// the applicants, reads every answer, sets a status, keeps notes and exports
// from here. Reads and saves go through /api/ugc-applicants.

// The share buttons on the form's success screen.
const CHANNELS = ["linkedin", "whatsapp", "copy"] as const;
type Channel = (typeof CHANNELS)[number];

interface ClickCounts {
  linkedin: number;
  whatsapp: number;
  copy: number;
  // Every click, including any from a button other than the three above.
  total: number;
}

// One applicant's share link, all time.
interface ShareStats {
  clicks: ClickCounts;
  visitors: number;
}

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
  // False when they said they have no LinkedIn: every LinkedIn answer is then null.
  has_linkedin: boolean;
  linkedin_url: string | null;
  connections: string | null;
  // Asked by the first version of the form, instead of connections.
  followers: string | null;
  post_frequency: string | null;
  last_posted: string | null;
  best_post_url: string | null;
  crossed_1k: string | null;
  // The Growth Fellowship questions; empty or null on earlier applications.
  fellowship_goals: string[];
  intern_interest: string | null;
  network_share: string | null;
  field: string;
  target_roles: string;
  dream_companies: string | null;
  looking_for: string;
  topics: string[];
  avoid_topics: string | null;
  // The stories and tone were asked by the first version of the form only.
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
  // Their own code, carried by their share links as ?ref=.
  share_code: string | null;
  // The code of the share link they applied through, if any.
  came_from_code: string | null;
  source_path: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  referrer: string | null;
  created_at: string;
  // Null when the numbers could not be counted.
  share: ShareStats | null;
}

interface Counts {
  total: number;
  last_24_hours: number;
  by_status: Record<string, number>;
}

const RANGES = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "All time" },
] as const;
type RangeKey = (typeof RANGES)[number]["key"];
const DEFAULT_RANGE: RangeKey = "30d";

// The funnel and sharing numbers for one range, as api.ugc-applicants.tsx
// counts them. Visitors are unique browsers.
interface Analytics {
  range: RangeKey;
  funnel: Record<"view" | "start" | "step2" | "step3" | "step4" | "submit" | "applications", number>;
  no_linkedin: { shown: number; continued: number; created: number; applications: number };
  sources: {
    // Traffic not from share links, by utm_source (null: none).
    rows: { source: string | null; visitors: number; applications: number }[];
    share_links: { visitors: number; applications: number };
  };
  sharing: {
    channels: { channel: Channel | "other"; clicks: number; sharers: number; visitors: number; applications: number }[];
    clicks: number;
    sharers: number;
    visitors: number;
    applications: number;
  };
  top_sharers: { id: number; full_name: string; share_code: string; clicks: ClickCounts; visitors: number; applications: number }[];
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
const CONNECTIONS = ["Under 100", "100-300", "300-500", "500-1,000", "1,000+"] as const;
const LAST_POSTED = ["In the last week", "In the last month", "1-6 months ago", "More than 6 months ago", "Never"] as const;
const CROSSED_1K = ["Yes", "No"] as const;
// Answers only the first version of the form offered. Listed in the filters
// only when someone gave them.
const OLD_FOLLOWERS = ["Under 100", "100-300", "300-500", "500-1,000", "1,000-5,000", "5,000+"] as const;
const OLD_CROSSED_1K = ["Not sure"] as const;

// Old follower counts sit in the connections filter under values of their own,
// so "Under 100" followers never matches "Under 100" connections.
const FOLLOWERS_VALUE = "followers:";

function connectionsValue(r: Applicant): string | null {
  if (!r.has_linkedin) return null;
  if (r.connections) return r.connections;
  return r.followers ? FOLLOWERS_VALUE + r.followers : null;
}

type FilterKey = "status" | "field" | "can_commit" | "linkedin" | "connections" | "crossed_1k" | "last_posted" | "came_via";

interface FilterDef {
  key: FilterKey;
  label: string;
  all: string;
  known: readonly string[];
  legacy?: readonly string[];
  value: (r: Applicant) => string | null;
  optionLabel?: (value: string) => string;
}

const FILTERS: FilterDef[] = [
  { key: "status", label: "Status", all: "All statuses", known: STATUSES, value: (r) => r.status, optionLabel: (v) => STATUS_LABELS[v] ?? v },
  { key: "field", label: "Field", all: "All fields", known: FIELDS, value: (r) => r.field },
  { key: "can_commit", label: "Can commit", all: "Any answer", known: CAN_COMMIT, value: (r) => r.can_commit },
  {
    key: "linkedin",
    label: "LinkedIn",
    all: "Everyone",
    known: ["yes", "no"],
    value: (r) => (r.has_linkedin ? "yes" : "no"),
    optionLabel: (v) => (v === "no" ? "No LinkedIn" : "Has LinkedIn"),
  },
  {
    key: "connections",
    label: "Connections",
    all: "Any number",
    known: CONNECTIONS,
    legacy: OLD_FOLLOWERS.map((f) => FOLLOWERS_VALUE + f),
    value: connectionsValue,
    optionLabel: (v) => (v.startsWith(FOLLOWERS_VALUE) ? `${v.slice(FOLLOWERS_VALUE.length)} followers (old form)` : v),
  },
  { key: "crossed_1k", label: "Post over 1k", all: "Any answer", known: CROSSED_1K, legacy: OLD_CROSSED_1K, value: (r) => r.crossed_1k },
  { key: "last_posted", label: "Last posted", all: "Any time", known: LAST_POSTED, value: (r) => r.last_posted },
  {
    key: "came_via",
    label: "Share link",
    all: "Any way in",
    known: ["yes", "no"],
    value: (r) => (r.came_from_code ? "yes" : "no"),
    optionLabel: (v) => (v === "yes" ? "Came via a share link" : "Did not"),
  },
];

const NO_FILTERS = Object.fromEntries(FILTERS.map((f) => [f.key, ""])) as Record<FilterKey, string>;

// Who stands out, for picking fellows quickly. Every signal is a quick filter;
// the score adds up the ones that say most about reach and commitment.
type HighlightKey =
  | "conn500" | "conn1000" | "crossed1k" | "weekly" | "recent" | "bestPost"
  | "commit" | "intern" | "brought" | "shareOk" | "referred";

const BIG_OLD_FOLLOWERS = ["500-1,000", "1,000-5,000", "5,000+"];
const has500 = (r: Applicant) =>
  r.connections === "500-1,000" || r.connections === "1,000+" || BIG_OLD_FOLLOWERS.includes(r.followers ?? "");
const has1000 = (r: Applicant) => r.connections === "1,000+" || r.followers === "1,000-5,000" || r.followers === "5,000+";

const HIGHLIGHTS: { key: HighlightKey; label: string; points: number; test: (r: Applicant, links: ShareLinks) => boolean }[] = [
  { key: "conn500", label: "500+ connections", points: 2, test: has500 },
  { key: "conn1000", label: "1,000+ connections", points: 1, test: has1000 },
  { key: "crossed1k", label: "A post crossed 1K impressions", points: 3, test: (r) => r.crossed_1k === "Yes" },
  { key: "weekly", label: "Posts every week", points: 2, test: (r) => r.post_frequency === "Every week or more" },
  {
    key: "recent",
    label: "Posted in the last month",
    points: 1,
    test: (r) => r.last_posted === "In the last week" || r.last_posted === "In the last month",
  },
  { key: "bestPost", label: "Shared a post they're proud of", points: 1, test: (r) => Boolean(r.best_post_url) },
  { key: "commit", label: "Can post 3 a week", points: 2, test: (r) => r.can_commit === "Yes, 3 posts a week for 4 weeks" },
  { key: "intern", label: "Wants the growth internship", points: 1, test: (r) => r.intern_interest === "Yes, I'd love that" },
  // A filter and a tag, but not scored (owner's call, 28 Oct 2026).
  { key: "brought", label: "Brought others in", points: 0, test: (r, links) => links.broughtIn(r).length > 0 },
  { key: "shareOk", label: "OK to share their profile", points: 0, test: (r) => r.network_share === "Yes, share my profile" },
  { key: "referred", label: "Came via a referral", points: 0, test: (r) => Boolean(r.came_from_code) },
];

const MAX_SCORE = HIGHLIGHTS.reduce((s, h) => s + h.points, 0);

/** The stand-out score and the signals behind it ("1,000+" replaces "500+"). */
function standOut(r: Applicant, links: ShareLinks) {
  const hits = HIGHLIGHTS.filter((h) => h.test(r, links));
  const has1k = hits.some((h) => h.key === "conn1000");
  return {
    score: hits.reduce((s, h) => s + h.points, 0),
    reasons: hits.filter((h) => !(h.key === "conn500" && has1k)).map((h) => h.label),
  };
}

// The three story prompts on the first version of the form, in its order.
const STORIES: { key: "story_work" | "story_setback" | "story_lesson"; title: string }[] = [
  { key: "story_work", title: "An internship, job or project they've done" },
  { key: "story_setback", title: "A rejection, or a time something didn't go to plan" },
  { key: "story_lesson", title: "Something they learned the hard way" },
];

const CHANNEL_LABELS: Record<Channel | "other", string> = {
  linkedin: "LinkedIn",
  whatsapp: "WhatsApp",
  copy: "Copy link",
  other: "Other or untagged",
};

// The steps of the public form, top to bottom.
const FUNNEL_STAGES: { key: keyof Analytics["funnel"]; label: string; note?: string }[] = [
  { key: "view", label: "Opened the page", note: "/fellowship-growth (or /creators, /ugc)" },
  { key: "start", label: "Started the form" },
  { key: "step2", label: "Reached step 2", note: "Your LinkedIn today" },
  { key: "step3", label: "Reached step 3", note: "What you want from the fellowship" },
  { key: "step4", label: "Reached step 4", note: "Last bit" },
  { key: "submit", label: "Submitted" },
  { key: "applications", label: "Applications saved", note: "Counted from the applications" },
];

// The link the success screen's "Copy link" button hands out (frontend
// app/routes/creators.tsx). Visits and applications through it are credited
// to the applicant whose code it carries.
function shareLink(code: string): string {
  return `https://studojo.com/fellowship-growth?ref=${encodeURIComponent(code)}&utm_source=copy&utm_medium=share&utm_campaign=growth_fellowship`;
}

// Who brought whom, from the share codes.
type CameVia = { sharer: Applicant } | { code: string };

interface ShareLinks {
  cameVia: (a: Applicant) => CameVia | null;
  broughtIn: (a: Applicant) => Applicant[];
}

function shareLinks(rows: Applicant[]): ShareLinks {
  const byCode = new Map<string, Applicant>();
  const brought = new Map<string, Applicant[]>();
  for (const r of rows) {
    if (r.share_code) byCode.set(r.share_code, r);
    if (r.came_from_code) brought.set(r.came_from_code, [...(brought.get(r.came_from_code) ?? []), r]);
  }
  return {
    cameVia: (a) => {
      if (!a.came_from_code) return null;
      const sharer = byCode.get(a.came_from_code);
      return sharer && sharer.id !== a.id ? { sharer } : { code: a.came_from_code };
    },
    broughtIn: (a) => (a.share_code ? (brought.get(a.share_code) ?? []).filter((r) => r.id !== a.id) : []),
  };
}

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

const fmt = (n: number) => n.toLocaleString("en-US");

// part as a share of whole: one decimal under 10%, whole numbers above.
function pct(part: number, whole: number): string {
  if (!whole) return "n/a";
  const p = (part / whole) * 100;
  return `${p > 0 && p < 9.95 ? p.toFixed(1) : Math.round(p)}%`;
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
// answers stay inside their cell. Spreadsheet apps run a cell that starts with
// = + - or @ as a formula, and these cells hold whatever applicants typed, so
// such cells get a leading apostrophe and open as plain text.
function csvCell(value: unknown): string {
  let text = value == null ? "" : Array.isArray(value) ? value.join("; ") : String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

// Every answer in the order the forms ask for them (old form answers
// included), then the share link numbers and the attribution.
type CsvColumn = [header: string, value: (r: Applicant, links: ShareLinks) => unknown];
const answer = (key: keyof Applicant): CsvColumn => [key, (r) => r[key]];

const CSV_COLUMNS: CsvColumn[] = [
  answer("id"), answer("created_at"), answer("status"),
  answer("full_name"), answer("email"), answer("whatsapp"), answer("college"), answer("course"),
  answer("year_of_study"), answer("graduation_year"), answer("city"),
  ["has_linkedin", (r) => (r.has_linkedin ? "Yes" : "No")],
  answer("linkedin_url"), answer("connections"), answer("followers"), answer("post_frequency"),
  answer("last_posted"), answer("best_post_url"), answer("crossed_1k"),
  answer("fellowship_goals"), answer("intern_interest"), answer("network_share"),
  ["stand_out_score", (r, links) => standOut(r, links).score],
  ["stand_out_reasons", (r, links) => standOut(r, links).reasons],
  answer("field"), answer("target_roles"), answer("dream_companies"), answer("looking_for"),
  answer("topics"), answer("avoid_topics"),
  answer("story_work"), answer("story_setback"), answer("story_lesson"), answer("tone"),
  answer("can_commit"), answer("studojo_ok"), answer("why_join"), answer("referral_source"),
  answer("referred_by"), answer("consent_at"),
  answer("came_from_code"),
  ["came_via_name", (r, links) => {
    const via = links.cameVia(r);
    return via && "sharer" in via ? via.sharer.full_name : "";
  }],
  answer("share_code"),
  ["share_link", (r) => (r.share_code ? shareLink(r.share_code) : "")],
  ["share_clicks_linkedin", (r) => r.share?.clicks.linkedin],
  ["share_clicks_whatsapp", (r) => r.share?.clicks.whatsapp],
  ["share_clicks_copy", (r) => r.share?.clicks.copy],
  ["share_clicks_total", (r) => r.share?.clicks.total],
  ["visitors_via_their_link", (r) => r.share?.visitors],
  ["applied_via_their_link", (r, links) => (r.share_code ? links.broughtIn(r).length : "")],
  answer("team_notes"), answer("source_path"), answer("utm_source"), answer("utm_medium"),
  answer("utm_campaign"), answer("referrer"),
];

function downloadCsv(rows: Applicant[], links: ShareLinks) {
  const lines = [
    CSV_COLUMNS.map(([header]) => csvCell(header)).join(","),
    ...rows.map((row) => CSV_COLUMNS.map(([, value]) => csvCell(value(row, links))).join(",")),
  ];
  // The byte order mark makes Excel read the file as UTF-8.
  const blob = new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `studojo-growth-fellowship-applicants-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

async function getJson(url: string) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (res.status === 401) throw new Error("this needs an admin or ops login");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success("Share link copied");
  } catch {
    toast.error("Could not copy. Select the link and copy it instead.");
  }
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
  // The funnel and sharing numbers, for the range picked above them.
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsError, setAnalyticsError] = useState<string | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // Only the latest request for the numbers may set them.
  const analyticsRequest = useRef(0);
  // An applicant opened from elsewhere on the page, scrolled to once shown.
  const [scrollTo, setScrollTo] = useState<number | null>(null);
  // Stand-out quick filters (all must match) and the sort order.
  const [quick, setQuick] = useState<Set<HighlightKey>>(new Set());
  const [sortBy, setSortBy] = useState<"newest" | "standout">("newest");

  useEffect(() => {
    if (isPending || !isAuthorized) return;
    let cancelled = false;
    const request = ++analyticsRequest.current;

    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await getJson(`/api/ugc-applicants?range=${DEFAULT_RANGE}`);
        if (cancelled) return;
        setRows(data.applicants || []);
        setCounts(data.counts || null);
        if (request === analyticsRequest.current) {
          setAnalytics(data.analytics ?? null);
          setAnalyticsError(data.analytics ? null : data.analytics_error || "unknown error");
        }
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

  const links = useMemo(() => shareLinks(rows), [rows]);

  // Each filter's choices, with how many applicants gave that answer.
  const filterOptions = useMemo(() => {
    const out = {} as Record<FilterKey, { value: string; count: number }[]>;
    for (const f of FILTERS) {
      const tally = new Map<string, number>();
      for (const r of rows) {
        const v = f.value(r);
        if (v) tally.set(v, (tally.get(v) ?? 0) + 1);
      }
      const legacy = (f.legacy ?? []).filter((v) => tally.has(v) && !f.known.includes(v));
      const listed = new Set([...f.known, ...legacy]);
      const extra = [...tally.keys()].filter((v) => !listed.has(v)).sort();
      out[f.key] = [...f.known, ...legacy, ...extra].map((value) => ({ value, count: tally.get(value) ?? 0 }));
    }
    return out;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const picked = HIGHLIGHTS.filter((h) => quick.has(h.key));
    const list = rows.filter(
      (r) =>
        FILTERS.every((f) => !filters[f.key] || f.value(r) === filters[f.key]) &&
        picked.every((h) => h.test(r, links)) &&
        (!q || [r.full_name, r.email, r.college].some((v) => (v || "").toLowerCase().includes(q)))
    );
    if (sortBy !== "standout") return list;
    const score = new Map(list.map((r) => [r.id, standOut(r, links).score]));
    return [...list].sort((a, b) => score.get(b.id)! - score.get(a.id)! || (a.created_at < b.created_at ? 1 : -1));
  }, [rows, filters, search, quick, sortBy, links]);

  const filtersActive = search.trim() !== "" || quick.size > 0 || FILTERS.some((f) => filters[f.key] !== "");

  useEffect(() => {
    if (scrollTo === null) return;
    const row = document.getElementById(`ugc-applicant-${scrollTo}`);
    if (!row) return;
    row.scrollIntoView({ behavior: "smooth", block: "start" });
    row.querySelector<HTMLButtonElement>("button[aria-expanded]")?.focus({ preventScroll: true });
    setScrollTo(null);
  }, [scrollTo, filtered]);

  function clearFilters() {
    setFilters(NO_FILTERS);
    setSearch("");
    setQuick(new Set());
  }

  function toggleQuick(key: HighlightKey) {
    setQuick((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggle(id: number) {
    setExpanded((prev) => withId(prev, id, !prev.has(id)));
  }

  // Opens an applicant named elsewhere on the page (a sharer, or someone who
  // came through a link) and scrolls to them, clearing filters that hide them.
  function openApplicant(id: number) {
    if (!rows.some((r) => r.id === id)) return;
    if (!filtered.some((r) => r.id === id)) clearFilters();
    setExpanded((prev) => withId(prev, id, true));
    setScrollTo(id);
  }

  async function changeRange(next: RangeKey) {
    if (next === range && analytics) return;
    const shown = analytics?.range ?? range;
    setRange(next);
    const request = ++analyticsRequest.current;
    setAnalyticsLoading(true);
    try {
      const data = await getJson(`/api/ugc-applicants?range=${next}&only=analytics`);
      if (request !== analyticsRequest.current) return;
      if (!data.analytics) throw new Error(data.analytics_error || "unknown error");
      setAnalytics(data.analytics);
      setAnalyticsError(null);
    } catch (e: any) {
      if (request !== analyticsRequest.current) return;
      if (analytics) {
        // Keep the numbers on screen and the range they belong to.
        setRange(shown);
        toast.error(`Could not load the numbers for that range: ${e.message || "unknown error"}`);
      } else {
        setAnalyticsError(e.message || "unknown error");
      }
    } finally {
      if (request === analyticsRequest.current) setAnalyticsLoading(false);
    }
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

  const columns: { label: string; title?: string }[] = [
    { label: "" },
    { label: "Applied" },
    { label: "Applicant" },
    { label: "Score", title: `Stand-out score out of ${MAX_SCORE}, from the reach and commitment signals they show (the tags under their name)` },
    { label: "Field" },
    { label: "LinkedIn" },
    { label: "Connections" },
    { label: "Posting" },
    { label: "Post over 1k", title: "Has any of their posts crossed 1,000 impressions?" },
    { label: "Can commit" },
    { label: "Studojo posts" },
    { label: "Status" },
  ];

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Clash Display, sans-serif" }}>
              Growth Fellowship applicants
            </h1>
            <p className="mt-1 text-sm text-gray-500">
              Applications to the Studojo Growth Fellowship from studojo.com/fellowship-growth. Click a row to read every answer.
            </p>
          </div>
          <div className="flex items-center gap-4">
            <a href="#funnel-and-sharing" className="text-sm font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900">
              Funnel and sharing
            </a>
            <button
              type="button"
              onClick={() => downloadCsv(filtered, links)}
              disabled={filtered.length === 0}
              title="Downloads the applicants shown below, with every answer and their share link numbers"
              className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>
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
          <section className="mb-4 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm" aria-label="Who stands out">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold text-gray-900">Who stands out</h2>
                <p className="text-xs text-gray-500">Click to filter. Pick several to see people who match all of them.</p>
              </div>
              <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Sort
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as "newest" | "standout")}
                  className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-gray-900"
                >
                  <option value="newest">Newest first</option>
                  <option value="standout">Stand-out score</option>
                </select>
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {HIGHLIGHTS.map((h) => {
                const on = quick.has(h.key);
                const n = rows.filter((r) => h.test(r, links)).length;
                return (
                  <button
                    key={h.key}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleQuick(h.key)}
                    className={`rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${
                      on ? "border-violet-600 bg-violet-600 text-white" : "border-gray-300 bg-white text-gray-800 hover:border-violet-400"
                    }`}
                  >
                    {h.label}
                    <span className={`ml-2 tabular-nums ${on ? "text-violet-100" : "text-gray-400"}`}>{n}</span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!loading && rows.length > 0 && (
          <div className="mb-4">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-5">
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
                        {f.optionLabel ? f.optionLabel(o.value) : o.value} ({o.count})
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
              Applications from studojo.com/fellowship-growth will show up here as they come in.
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
                  {columns.map((c, i) => (
                    <th
                      key={c.label || i}
                      title={c.title}
                      className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500"
                    >
                      {c.label}
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
                  const via = links.cameVia(r);
                  const so = standOut(r, links);
                  return (
                    <Fragment key={r.id}>
                      <tr
                        id={`ugc-applicant-${r.id}`}
                        onClick={(e) => onRowClick(e, r.id)}
                        className={`scroll-mt-8 cursor-pointer align-top ${open ? "bg-violet-50/60" : "hover:bg-gray-50"}`}
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
                          {via && (
                            <div className="mt-1 text-xs text-gray-500">
                              Came via <CameViaName via={via} onOpen={openApplicant} />
                            </div>
                          )}
                          {so.reasons.length > 0 && (
                            <div className="mt-1.5 flex flex-wrap items-center gap-1">
                              {so.reasons.slice(0, 3).map((reason) => (
                                <span key={reason} className="whitespace-nowrap rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-medium text-violet-800">
                                  {reason}
                                </span>
                              ))}
                              {so.reasons.length > 3 && <span className="text-[11px] text-gray-400">+{so.reasons.length - 3} more</span>}
                            </div>
                          )}
                        </td>
                        <td className="whitespace-nowrap px-3 py-3">
                          <span className="text-sm font-bold tabular-nums text-gray-900">{so.score}</span>
                          <span className="text-xs text-gray-400"> / {MAX_SCORE}</span>
                        </td>
                        <td className="px-3 py-3 text-gray-800">{r.field}</td>
                        {r.has_linkedin ? (
                          <>
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
                                <span className="text-xs text-gray-400" title={r.linkedin_url ?? undefined}>
                                  {r.linkedin_url ? "Not a link" : "Not answered"}
                                </span>
                              )}
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-gray-800">
                              {r.connections ? (
                                r.connections
                              ) : r.followers ? (
                                <>
                                  <div>{r.followers}</div>
                                  <div className="text-xs text-gray-400">followers, old form</div>
                                </>
                              ) : (
                                <span className="text-xs text-gray-400">Not answered</span>
                              )}
                            </td>
                            <td className="px-3 py-3 text-gray-800">
                              <div>{orBlank(r.post_frequency)}</div>
                              <div className="text-xs text-gray-500">Last posted: {r.last_posted ?? "not answered"}</div>
                            </td>
                            <td className="whitespace-nowrap px-3 py-3 text-gray-800">{orBlank(r.crossed_1k)}</td>
                          </>
                        ) : (
                          <td colSpan={4} className="px-3 py-3">
                            <NoLinkedinPill />
                            <span className="ml-2 text-xs text-gray-400">LinkedIn questions skipped</span>
                          </td>
                        )}
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
                                via={via}
                                broughtIn={links.broughtIn(r)}
                                standOutReasons={so.reasons}
                                onOpenApplicant={openApplicant}
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

        {!loading && !loadError && (
          <FunnelAndSharing
            analytics={analytics}
            error={analyticsError}
            loading={analyticsLoading}
            range={range}
            onRangeChange={changeRange}
            onOpenApplicant={openApplicant}
          />
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

// ---------------------------------------------------------------------------
// Funnel and sharing
// ---------------------------------------------------------------------------

function FunnelAndSharing({
  analytics,
  error,
  loading,
  range,
  onRangeChange,
  onOpenApplicant,
}: {
  analytics: Analytics | null;
  error: string | null;
  loading: boolean;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
  onOpenApplicant: (id: number) => void;
}) {
  return (
    <section id="funnel-and-sharing" aria-labelledby="ugc-funnel-title" className="mt-8 scroll-mt-28">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ugc-funnel-title" className="text-lg font-bold text-gray-900" style={{ fontFamily: "Clash Display, sans-serif" }}>
            Funnel and sharing
          </h2>
          <p className="mt-0.5 text-sm text-gray-500">
            From the public page. People are counted once per browser.
          </p>
        </div>
        <div role="group" aria-label="Range for the funnel and sharing numbers" className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5 shadow-sm">
          {RANGES.map((r) => (
            <button
              key={r.key}
              type="button"
              aria-pressed={range === r.key}
              onClick={() => onRangeChange(r.key)}
              className={`rounded-md px-3 py-1 text-sm font-medium transition-colors ${
                range === r.key ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {!analytics ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          Could not load the funnel and sharing numbers: {error || "unknown error"}{" "}
          <button
            type="button"
            onClick={() => onRangeChange(range)}
            className="font-medium underline underline-offset-2"
          >
            {loading ? "Trying again..." : "Try again"}
          </button>
        </div>
      ) : (
        // While another range loads, the current numbers stay, dimmed.
        <div aria-busy={loading} className={`space-y-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
          <FunnelCard funnel={analytics.funnel} />
          <div className="grid gap-4 lg:grid-cols-3">
            <SharingCard sharing={analytics.sharing} className="lg:col-span-2" />
            <NoLinkedinCard data={analytics.no_linkedin} />
          </div>
          <div className="grid gap-4 lg:grid-cols-3">
            <SourcesCard sources={analytics.sources} />
            <TopSharersCard sharers={analytics.top_sharers} onOpenApplicant={onOpenApplicant} className="lg:col-span-2" />
          </div>
        </div>
      )}
    </section>
  );
}

function Card({ title, note, className = "", children }: { title: string; note?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <section className={`min-w-0 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm ${className}`}>
      <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
      {note && <p className="mt-0.5 text-xs text-gray-500">{note}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

// A bar from a left baseline: length is value against max, rounded at its end.
function Bar({ value, max, thin = false }: { value: number; max: number; thin?: boolean }) {
  const width = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={`${thin ? "h-1.5" : "h-4"} rounded-sm bg-gray-100`} aria-hidden="true">
      <div
        className={`h-full ${thin ? "rounded-r-[3px]" : "rounded-r-[4px]"} bg-violet-500`}
        style={{ width: value > 0 ? `max(${width}%, 3px)` : 0 }}
      />
    </div>
  );
}

function FunnelCard({ funnel }: { funnel: Analytics["funnel"] }) {
  const max = Math.max(0, ...FUNNEL_STAGES.map((s) => funnel[s.key]));
  // The step of the form that loses the biggest share of the people who
  // reached the one before it.
  let biggestDrop = -1;
  let lowestKept = 1;
  FUNNEL_STAGES.forEach((s, i) => {
    if (i === 0 || s.key === "applications") return;
    const before = funnel[FUNNEL_STAGES[i - 1].key];
    if (before > 0 && funnel[s.key] / before < lowestKept) {
      lowestKept = funnel[s.key] / before;
      biggestDrop = i;
    }
  });

  return (
    <Card
      title="Funnel"
      note={
        funnel.view > 0
          ? `${pct(funnel.applications, funnel.view)} of the people who opened the page applied.`
          : "Nobody has opened the page in this range yet."
      }
    >
      <ol className="space-y-3">
        {FUNNEL_STAGES.map((s, i) => {
          const value = funnel[s.key];
          const before = i > 0 ? funnel[FUNNEL_STAGES[i - 1].key] : null;
          return (
            <li
              key={s.key}
              title={
                before === null
                  ? `${fmt(value)} ${value === 1 ? "person" : "people"}`
                  : s.key === "applications"
                    ? `${fmt(value)} ${value === 1 ? "application" : "applications"} saved in this range`
                    : `${fmt(value)} of ${fmt(before)} (${pct(value, before)}) went on from "${FUNNEL_STAGES[i - 1].label}"`
              }
              className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-4 gap-y-1.5 sm:grid-cols-[13rem_minmax(0,1fr)_4rem_8.5rem]"
            >
              <div className="min-w-0 text-sm font-medium text-gray-800">
                {s.label}
                {i === biggestDrop && (
                  <span className="ml-2 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[10px] font-semibold text-amber-800">
                    Biggest drop
                  </span>
                )}
                {s.note && <span className="block text-xs font-normal text-gray-400">{s.note}</span>}
              </div>
              <div className="order-last col-span-3 sm:order-none sm:col-span-1">
                <Bar value={value} max={max} />
              </div>
              <div className="text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(value)}</div>
              <div className="text-right text-xs tabular-nums text-gray-500">
                {before === null ? (
                  "Starting point"
                ) : s.key === "applications" ? (
                  // Saved applications are counted from the table, not from page
                  // events, so they can outnumber tracked submits (blocked storage,
                  // older applications). A percentage of the step before would mislead.
                  "All in this range"
                ) : (
                  <>
                    <span className="font-semibold text-gray-800">{pct(value, before)}</span> of the step before
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </Card>
  );
}

function Figure({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl bg-gray-50 px-3 py-2.5">
      <p className="text-2xl font-bold text-gray-900">{fmt(value)}</p>
      <p className="text-xs text-gray-500">{label}</p>
    </div>
  );
}

function SharingCard({ sharing, className }: { sharing: Analytics["sharing"]; className?: string }) {
  const channels = sharing.channels.filter(
    (c) => c.channel !== "other" || c.clicks || c.visitors || c.applications
  );
  return (
    <Card
      title="Share links"
      note={'The "Know someone with great stories?" buttons applicants see once they have applied. Each link carries the applicant\'s code.'}
      className={className}
    >
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Share button clicks" value={sharing.clicks} />
        <Figure label="Applicants who shared" value={sharing.sharers} />
        <Figure label="Visitors from share links" value={sharing.visitors} />
        <Figure label="Applied from a share link" value={sharing.applications} />
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[30rem] text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
              <th className="py-2 pr-3 text-left font-semibold">Channel</th>
              <th className="px-2 py-2 text-right font-semibold" title="Clicks on this share button">Clicks</th>
              <th className="px-2 py-2 text-right font-semibold" title="Applicants who clicked this button at least once">Sharers</th>
              <th className="px-2 py-2 text-right font-semibold" title="Unique visitors who opened a link shared this way">Visitors</th>
              <th className="py-2 pl-2 text-right font-semibold" title="Applications from people who arrived through a link shared this way">Applied</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {channels.map((c) => (
              <tr key={c.channel}>
                <td className="py-2 pr-3 font-medium text-gray-800">{CHANNEL_LABELS[c.channel]}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-800">{fmt(c.clicks)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-800">{fmt(c.sharers)}</td>
                <td className="px-2 py-2 text-right tabular-nums text-gray-800">{fmt(c.visitors)}</td>
                <td className="py-2 pl-2 text-right font-semibold tabular-nums text-gray-900">{fmt(c.applications)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function NoLinkedinCard({ data }: { data: Analytics["no_linkedin"] }) {
  const ofWarned = (n: number) => (data.shown > 0 ? `${pct(n, data.shown)} of those warned` : null);
  const lines: { label: string; value: number; note?: string | null }[] = [
    { label: "Saw the warning", value: data.shown },
    { label: "Went to create a LinkedIn profile", value: data.created, note: ofWarned(data.created) },
    { label: "Carried on without LinkedIn", value: data.continued, note: ofWarned(data.continued) },
    { label: "Applied without LinkedIn", value: data.applications, note: "Counted from the applications" },
  ];
  return (
    <Card title="No LinkedIn" note="The popup saying the chance of being selected drastically decreases without LinkedIn.">
      <dl className="space-y-3">
        {lines.map((l) => (
          <div key={l.label} className="flex items-baseline justify-between gap-3">
            <dt className="text-sm text-gray-700">
              {l.label}
              {l.note && <span className="block text-xs text-gray-400">{l.note}</span>}
            </dt>
            <dd className="text-lg font-bold tabular-nums text-gray-900">{fmt(l.value)}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

const SOURCES_SHOWN = 8;

function SourcesCard({ sources }: { sources: Analytics["sources"] }) {
  const all = [
    ...sources.rows.map((r) => ({
      key: `utm:${r.source ?? ""}`,
      label: r.source ?? "No UTM tag",
      hint: r.source ? `utm_source=${r.source}` : "Direct visits, search, and links without a utm_source",
      visitors: r.visitors,
      applications: r.applications,
    })),
    ...(sources.share_links.visitors || sources.share_links.applications
      ? [
          {
            key: "share",
            label: "Applicant share links",
            hint: "Links applicants shared from the success screen. The Share links card splits them by channel.",
            ...sources.share_links,
          },
        ]
      : []),
  ].sort((a, b) => b.visitors - a.visitors || b.applications - a.applications);
  // Past a handful of sources, the rest fold into one line.
  const list = all.length > SOURCES_SHOWN ? all.slice(0, SOURCES_SHOWN - 1) : all;
  const rest = all.slice(list.length);
  if (rest.length) {
    list.push({
      key: "rest",
      label: `${rest.length} more sources`,
      hint: rest.map((r) => r.label).join(", "),
      visitors: rest.reduce((n, r) => n + r.visitors, 0),
      applications: rest.reduce((n, r) => n + r.applications, 0),
    });
  }
  const max = Math.max(0, ...list.map((r) => r.visitors));

  return (
    <Card title="Where they came from" note="By utm_source on the link they opened. Share links are counted on their own.">
      {list.length === 0 ? (
        <p className="text-sm text-gray-400">No visits or applications in this range yet.</p>
      ) : (
        <div>
          <div className="grid grid-cols-[minmax(0,1fr)_3.75rem_3.5rem_3.5rem] gap-x-2 border-b border-gray-200 pb-2 text-[11px] font-semibold uppercase tracking-wide text-gray-500">
            <span>Source</span>
            <span className="text-right">Visitors</span>
            <span className="text-right">Applied</span>
            <span className="text-right" title="Applied as a share of visitors">Rate</span>
          </div>
          <ul className="divide-y divide-gray-100">
            {list.map((r) => (
              <li key={r.key} className="grid grid-cols-[minmax(0,1fr)_3.75rem_3.5rem_3.5rem] items-center gap-x-2 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm text-gray-800" title={r.hint}>
                    {r.label}
                  </div>
                  <div className="mt-1">
                    <Bar value={r.visitors} max={max} thin />
                  </div>
                </div>
                <span className="text-right text-sm tabular-nums text-gray-800">{fmt(r.visitors)}</span>
                <span className="text-right text-sm font-semibold tabular-nums text-gray-900">{fmt(r.applications)}</span>
                <span className="text-right text-xs tabular-nums text-gray-500">{pct(r.applications, r.visitors)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}

function TopSharersCard({
  sharers,
  onOpenApplicant,
  className,
}: {
  sharers: Analytics["top_sharers"];
  onOpenApplicant: (id: number) => void;
  className?: string;
}) {
  return (
    <Card
      title="Top sharers"
      note="Applicants whose links did the most in this range: applications first, then visitors, then clicks. Click a name to open them."
      className={className}
    >
      {sharers.length === 0 ? (
        <p className="text-sm text-gray-400">Nobody has shared their link in this range yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-[11px] uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 text-left font-semibold">Applicant</th>
                <th className="px-2 py-2 text-right font-semibold" title="Share on LinkedIn clicks">LinkedIn</th>
                <th className="px-2 py-2 text-right font-semibold" title="Share on WhatsApp clicks">WhatsApp</th>
                <th className="px-2 py-2 text-right font-semibold" title="Copy link clicks">Copy link</th>
                <th className="px-2 py-2 text-right font-semibold" title="Unique visitors who opened their link">Visitors</th>
                <th className="py-2 pl-2 text-right font-semibold" title="People who applied through their link">Applied</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sharers.map((s) => (
                <tr key={s.id}>
                  <td className="py-2 pr-3">
                    <button
                      type="button"
                      onClick={() => onOpenApplicant(s.id)}
                      title={`Open applicant #${s.id}`}
                      className="text-left font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
                    >
                      {s.full_name}
                    </button>
                    <span className="ml-2 font-mono text-xs text-gray-400">{s.share_code}</span>
                  </td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-800">{fmt(s.clicks.linkedin)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-800">{fmt(s.clicks.whatsapp)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-800">{fmt(s.clicks.copy)}</td>
                  <td className="px-2 py-2 text-right tabular-nums text-gray-800">{fmt(s.visitors)}</td>
                  <td className="py-2 pl-2 text-right font-semibold tabular-nums text-gray-900">{fmt(s.applications)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// One applicant
// ---------------------------------------------------------------------------

function NoLinkedinPill() {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
      No LinkedIn
    </span>
  );
}

// The sharer whose link brought someone in, as a button that opens them; or
// the code itself when no applicant has it.
function CameViaName({ via, onOpen }: { via: CameVia; onOpen: (id: number) => void }) {
  if ("sharer" in via) {
    return (
      <button
        type="button"
        onClick={() => onOpen(via.sharer.id)}
        className="font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
      >
        {via.sharer.full_name}
      </button>
    );
  }
  return (
    <span>
      code <span className="font-mono">{via.code}</span> <span className="text-gray-400">(no applicant has this code)</span>
    </span>
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

function SharePanel({
  applicant: a,
  broughtIn,
  onOpenApplicant,
}: {
  applicant: Applicant;
  broughtIn: Applicant[];
  onOpenApplicant: (id: number) => void;
}) {
  if (!a.share_code) {
    return (
      <Panel title="Their share link">
        <p className="text-sm text-gray-400">No share code. They applied before share links were added.</p>
      </Panel>
    );
  }
  const link = shareLink(a.share_code);
  const clicks = a.share?.clicks;
  const otherClicks = clicks ? clicks.total - clicks.linkedin - clicks.whatsapp - clicks.copy : 0;
  const unavailable = <span className="text-gray-400">Not available right now</span>;

  return (
    <Panel title="Their share link">
      <div className="grid gap-5 md:grid-cols-3">
        <dl className="space-y-3">
          <Answer label="Share code">
            <span className="font-mono">{a.share_code}</span>
          </Answer>
          <Answer label="Link">
            <span className="block font-mono text-xs text-gray-700">{link}</span>
            <button
              type="button"
              onClick={() => copyText(link)}
              aria-label={`Copy ${a.full_name}'s share link`}
              className="mt-2 rounded-lg border border-gray-300 bg-white px-3 py-1 text-xs font-semibold text-gray-800 hover:bg-gray-50"
            >
              Copy link
            </button>
            <span className="mt-1 block text-xs text-gray-400">Opening it counts as a visit through their link.</span>
          </Answer>
        </dl>
        <dl className="space-y-3">
          <Answer label="Share button clicks, all time">
            {clicks ? (
              <span className="mt-1 grid grid-cols-3 gap-2">
                {CHANNELS.map((c) => (
                  <span key={c} className="rounded-lg bg-gray-50 px-2 py-1.5">
                    <span className="block text-lg font-bold tabular-nums text-gray-900">{fmt(clicks[c])}</span>
                    <span className="block text-[11px] text-gray-500">{CHANNEL_LABELS[c]}</span>
                  </span>
                ))}
              </span>
            ) : (
              unavailable
            )}
            {otherClicks > 0 && <span className="mt-1 block text-xs text-gray-400">And {fmt(otherClicks)} from other buttons</span>}
          </Answer>
          <Answer label="Visitors through their link, all time">
            {a.share ? <span className="text-lg font-bold tabular-nums text-gray-900">{fmt(a.share.visitors)}</span> : unavailable}
          </Answer>
        </dl>
        <dl>
          <Answer label={`Applied through their link (${broughtIn.length})`}>
            {broughtIn.length ? (
              <ul className="mt-1 space-y-1">
                {broughtIn.map((b) => (
                  <li key={b.id}>
                    <button
                      type="button"
                      onClick={() => onOpenApplicant(b.id)}
                      className="font-medium text-violet-700 underline underline-offset-2 hover:text-violet-900"
                    >
                      {b.full_name}
                    </button>
                    <span className="ml-2 text-xs text-gray-400">{formatDay(b.created_at)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <span className="text-gray-400">No one yet</span>
            )}
          </Answer>
        </dl>
      </div>
    </Panel>
  );
}

function ApplicantDetail({
  applicant: a,
  via,
  broughtIn,
  standOutReasons,
  onOpenApplicant,
  notes,
  notesDirty,
  savingNotes,
  onNotesChange,
  onNotesSave,
}: {
  applicant: Applicant;
  via: CameVia | null;
  broughtIn: Applicant[];
  standOutReasons: string[];
  onOpenApplicant: (id: number) => void;
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
  const stories = STORIES.filter((s) => a[s.key]);

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
          {a.has_linkedin ? (
            <dl className="space-y-3">
              <Answer label="Profile">
                {linkedin ? <ExternalLink href={linkedin}>{linkedin}</ExternalLink> : orBlank(a.linkedin_url)}
              </Answer>
              <Answer label="A post they're proud of">
                {bestPost ? <ExternalLink href={bestPost}>Open the post</ExternalLink> : orBlank(a.best_post_url)}
              </Answer>
              {(a.connections || !a.followers) && <Answer label="Connections">{orBlank(a.connections)}</Answer>}
              {a.followers && <Answer label="Followers (old form)">{a.followers}</Answer>}
              <Answer label="How often they post">{orBlank(a.post_frequency)}</Answer>
              <Answer label="Last posted">{orBlank(a.last_posted)}</Answer>
              <Answer label="A post crossed 1,000 impressions">{orBlank(a.crossed_1k)}</Answer>
            </dl>
          ) : (
            <div>
              <NoLinkedinPill />
              <p className="mt-2 text-sm text-gray-700">
                They said they don't have a LinkedIn profile, so the LinkedIn questions were skipped.
              </p>
            </div>
          )}
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

      <Panel title="Growth Fellowship">
        <dl className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Answer label="Why they stand out">
            {standOutReasons.length ? (
              <span className="mt-1 flex flex-wrap gap-1">
                {standOutReasons.map((reason) => (
                  <span key={reason} className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-800">
                    {reason}
                  </span>
                ))}
              </span>
            ) : (
              <span className="text-gray-400">Nothing yet</span>
            )}
          </Answer>
          <Answer label="Wants from the fellowship">
            {a.fellowship_goals.length ? a.fellowship_goals.join(", ") : <span className="text-gray-400">Not asked (earlier form)</span>}
          </Answer>
          <Answer label="Growth internship at Studojo">{orBlank(a.intern_interest, "Not asked (earlier form)")}</Answer>
          <Answer label="Share profile with people hiring">{orBlank(a.network_share, "Not asked (earlier form)")}</Answer>
        </dl>
      </Panel>

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
          {a.tone && <Answer label="Tone (old form)">{a.tone}</Answer>}
          <Answer label="Can post 3 times a week for 4 weeks">{a.can_commit}</Answer>
          <Answer label="1 in 3 posts about Studojo">{a.studojo_ok}</Answer>
        </dl>
      </Panel>

      {/* Stories are asked for after shortlisting now; applications from the
          first version of the form still have them. */}
      {stories.length > 0 && (
        <div className="grid gap-4 lg:grid-cols-3">
          {stories.map((s) => (
            <Panel key={s.key} title={`${s.title} (old form)`}>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">{a[s.key]}</p>
            </Panel>
          ))}
        </div>
      )}

      <Panel title="Why they want to join">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800 [overflow-wrap:anywhere]">{a.why_join}</p>
      </Panel>

      <SharePanel applicant={a} broughtIn={broughtIn} onOpenApplicant={onOpenApplicant} />

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel title="How they heard">
          <dl className="space-y-3">
            <Answer label="Came via a share link">
              {via ? <CameViaName via={via} onOpen={onOpenApplicant} /> : <span className="text-gray-400">No</span>}
            </Answer>
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
