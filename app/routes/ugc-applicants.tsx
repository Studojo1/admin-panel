import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { meetingWhatsapp, meetingWhen } from "~/lib/fellowship-meeting";
import type { Route } from "./+types/ugc-applicants";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Growth Fellowship - Admin Panel" }];
}

// Applications to the Growth Fellowship from studojo.com/fellowship-growth
// (also served at /creators and /ugc), in the founder's chosen "Editorial
// calendar" design: the pipeline, then the funnel, the list and the selected
// applicant's profile side by side. The team filters and sorts applicants,
// reads every answer, sets a status, schedules the selection meeting (which
// emails the applicant), makes them a fellow, keeps notes and exports from
// here, and follows the page's sharing numbers below. Reads and saves go
// through /api/ugc-applicants (and /api/ugc-creators for Make fellow).

// Headings use a book serif, as in the design.
const SERIF = '"Iowan Old Style", Charter, "Bitstream Charter", Georgia, serif';

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
  // The selection meeting, set from this page.
  meeting_at: string | null;
  meeting_link: string | null;
  meeting_note: string | null;
  meeting_emailed_at: string | null;
  // Null when the numbers could not be counted.
  share: ShareStats | null;
}

// Applied to Referred, as api.ugc-applicants.tsx counts them.
interface Pipeline {
  applied: number;
  shortlisted: number;
  meeting: number;
  fellow: number;
  growthIntern: number;
  referred: number;
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
// 'selected' is a fellow: only Make fellow sets it, since that also creates
// their page.
const STATUSES = ["new", "shortlisted", "meeting", "selected", "rejected"] as const;
// The ones the team sets by hand. "Meeting scheduled" comes from Schedule
// meeting (which saves the time and emails them) and Fellow from Make fellow.
const SETTABLE = ["new", "shortlisted", "rejected"] as const;
// The profile's status row, in pipeline order.
const STATUS_BUTTONS = ["new", "shortlisted", "meeting", "rejected"] as const;
const WIDE = "(min-width: 1024px)";

const STATUS_LABELS: Record<string, string> = {
  new: "New",
  shortlisted: "Shortlisted",
  meeting: "Meeting scheduled",
  selected: "Fellow",
  rejected: "Rejected",
};

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-50 text-blue-700 border-blue-200",
  shortlisted: "bg-amber-50 text-amber-800 border-amber-200",
  meeting: "bg-violet-50 text-violet-700 border-violet-200",
  selected: "bg-emerald-50 text-emerald-700 border-emerald-200",
  rejected: "bg-gray-100 text-gray-600 border-gray-300",
};

// The five signals shown as quick filters before "More filters".
const PRIMARY_HIGHLIGHTS = ["conn500", "crossed1k", "weekly", "commit", "intern"] as const;

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

async function postAction(body: Record<string, unknown>, url = "/api/ugc-applicants") {
  const token = await getToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(url, {
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

// A fellow's record, for an applicant taken on.
interface Fellow {
  id: number;
  link: string | null;
  intern_at: string | null;
  referred_at: string | null;
}

// What a fellow went on to; these fill the pipeline's last two stages.
const OUTCOMES = [
  { key: "intern", field: "intern_at", label: "Growth intern" },
  { key: "referred", field: "referred_at", label: "Referred to someone hiring" },
] as const;
type Outcome = (typeof OUTCOMES)[number]["key"];

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
  // The applicant whose profile is open (on phones, as a full-screen sheet).
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [moreFilters, setMoreFilters] = useState(false);
  const [scheduling, setScheduling] = useState<Set<number>>(new Set());
  // The email pause (29 Oct 2026): while it's on, the meeting form says so
  // instead of offering to email.
  const [emailsPaused, setEmailsPaused] = useState(false);
  // The calendar tab shows once the creators admin is live at /fellowship/calendar.
  const [calendarLive, setCalendarLive] = useState(false);
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
  // Applicants already taken on as fellows: application id to their record.
  const [fellowByApp, setFellowByApp] = useState<Record<number, Fellow>>({});
  const [makingFellow, setMakingFellow] = useState<Set<number>>(new Set());
  const [savingOutcome, setSavingOutcome] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (isPending || !isAuthorized) return;
    getJson("/api/ugc-creators")
      .then((d) => {
        const map: Record<number, Fellow> = {};
        for (const c of (d.creators || []) as (Fellow & { application_id: number | null; status: string })[]) {
          if (c.application_id && c.status !== "removed") {
            map[c.application_id] = { id: c.id, link: c.link, intern_at: c.intern_at ?? null, referred_at: c.referred_at ?? null };
          }
        }
        setFellowByApp(map);
      })
      .catch(() => {
        // Without it, rows just offer "Make fellow", which is safe to press twice.
      });
  }, [isPending, isAuthorized]);

  // Fresh counts and pipeline after a change made through the fellows' API.
  function refreshCounts() {
    getJson("/api/ugc-applicants?only=counts")
      .then((d) => {
        if (d.counts) setCounts(d.counts);
        if (d.pipeline) setPipeline(d.pipeline);
      })
      .catch(() => {
        // The counts catch up on the next load.
      });
  }

  async function makeFellow(a: Applicant) {
    setMakingFellow((s) => withId(s, a.id, true));
    try {
      const data = await postAction({ intent: "create-from-application", applicationId: a.id }, "/api/ugc-creators");
      setFellowByApp((m) => ({
        ...m,
        [a.id]: {
          id: data.creator.id,
          link: data.creator.link ?? null,
          intern_at: data.creator.intern_at ?? null,
          referred_at: data.creator.referred_at ?? null,
        },
      }));
      setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, status: "selected" } : r)));
      moveCount(a.status, "selected");
      toast.success(`${a.full_name} is now a fellow.`);
      refreshCounts();
    } catch (e: any) {
      toast.error(e.message || "Could not make them a fellow");
    } finally {
      setMakingFellow((s) => withId(s, a.id, false));
    }
  }

  // Marks (or unmarks) what a fellow went on to.
  async function setOutcome(a: Applicant, outcome: Outcome, on: boolean) {
    const fellow = fellowByApp[a.id];
    if (!fellow) return;
    setSavingOutcome((s) => withId(s, a.id, true));
    try {
      const data = await postAction({ intent: "set-outcome", id: fellow.id, outcome, on }, "/api/ugc-creators");
      setFellowByApp((m) => ({
        ...m,
        [a.id]: { ...m[a.id], intern_at: data.creator.intern_at ?? null, referred_at: data.creator.referred_at ?? null },
      }));
      refreshCounts();
    } catch (e: any) {
      toast.error(`Could not update ${a.full_name}: ${e.message || "unknown error"}`);
    } finally {
      setSavingOutcome((s) => withId(s, a.id, false));
    }
  }
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
        setPipeline(data.pipeline || null);
        setEmailsPaused(Boolean(data.emailsPaused));
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
    row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    row.querySelector<HTMLButtonElement>("button[data-open]")?.focus({ preventScroll: true });
    setScrollTo(null);
  }, [scrollTo, filtered]);

  // On a wide screen the profile column is never empty: show the first applicant.
  useEffect(() => {
    if (selectedId !== null || filtered.length === 0) return;
    if (window.matchMedia(WIDE).matches) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  // The phone sheet has its own history entry, so the phone's Back closes it
  // instead of leaving the page (and any unsaved notes).
  const sheetInHistory = useRef(false);
  function openSheet() {
    setSheetOpen(true);
    if (!sheetInHistory.current) {
      window.history.pushState({ ...(window.history.state ?? {}), ugcSheet: true }, "");
      sheetInHistory.current = true;
    }
  }
  function closeSheet() {
    if (sheetInHistory.current) {
      sheetInHistory.current = false;
      window.history.back(); // popstate closes it
    } else {
      setSheetOpen(false);
    }
  }
  useEffect(() => {
    const onPop = () => {
      sheetInHistory.current = false;
      setSheetOpen(false);
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  // A sheet left open when the screen widens (a tablet turned) closes.
  useEffect(() => {
    const mq = window.matchMedia(WIDE);
    const onChange = () => mq.matches && closeSheet();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  // Focus returns to the row when the sheet closes.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (wasOpen.current && !sheetOpen && selectedId !== null) {
      document.querySelector<HTMLButtonElement>(`#ugc-applicant-${selectedId} button[data-open]`)?.focus({ preventScroll: true });
    }
    wasOpen.current = sheetOpen;
  }, [sheetOpen, selectedId]);
  // A keyboard user opening an applicant on a wide screen lands on their profile.
  const [focusProfile, setFocusProfile] = useState(false);
  useEffect(() => {
    if (!focusProfile) return;
    document.getElementById("ugc-profile-title")?.focus();
    setFocusProfile(false);
  }, [focusProfile, selectedId]);

  useEffect(() => {
    let cancelled = false;
    fetch("/fellowship/calendar", { method: "GET", credentials: "include" })
      .then((res) => !cancelled && setCalendarLive(res.ok))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // The phone sheet locks the page behind it and closes with Escape.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeSheet();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [sheetOpen]);

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

  // Shows an applicant's profile: beside the list on a wide screen, as a sheet on a phone.
  function select(id: number) {
    setSelectedId(id);
    if (!window.matchMedia(WIDE).matches) openSheet();
  }

  // Opens an applicant named elsewhere on the page (a sharer, or someone who
  // came through a link) and scrolls to them, clearing filters that hide them.
  function openApplicant(id: number) {
    if (!rows.some((r) => r.id === id)) return;
    if (!filtered.some((r) => r.id === id)) clearFilters();
    select(id);
    if (!sheetOpen) setScrollTo(id);
  }

  // Keeps the status counts right after a change made here.
  function moveCount(from: string, to: string) {
    if (from === to) return;
    setCounts((c) =>
      c ? { ...c, by_status: { ...c.by_status, [from]: Math.max(0, (c.by_status[from] ?? 0) - 1), [to]: (c.by_status[to] ?? 0) + 1 } } : c
    );
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
  function onRowClick(e: MouseEvent<HTMLLIElement>, id: number) {
    if ((e.target as HTMLElement).closest("a, button, select, input, textarea, label")) return;
    if (window.getSelection()?.toString()) return;
    select(id);
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
      if (data.pipeline) setPipeline(data.pipeline);
    } catch (e: any) {
      setRows((rs) => rs.map((r) => (r.id === applicant.id ? { ...r, status: previous } : r)));
      toast.error(`Could not update ${applicant.full_name}: ${e.message || "unknown error"}`);
    } finally {
      setSavingStatus((s) => withId(s, applicant.id, false));
    }
  }

  // Sets the selection meeting and (unless told not to) emails them the time.
  async function scheduleMeeting(a: Applicant, m: { at: string; link: string; note: string; notify: boolean }) {
    setScheduling((s) => withId(s, a.id, true));
    try {
      const data = await postAction({ intent: "schedule-meeting", id: a.id, ...m });
      setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, ...data.applicant } : r)));
      if (data.counts) setCounts(data.counts);
      if (data.pipeline) setPipeline(data.pipeline);
      if (typeof data.emailsPaused === "boolean") setEmailsPaused(data.emailsPaused);
      const first = a.full_name.trim().split(/\s+/)[0];
      const tell = whatsappHref(a.whatsapp) ? `send ${first} the time on WhatsApp` : `tell ${first} the time yourself`;
      if (data.alreadyEmailed) toast.success(`Meeting saved. ${first} already has the email with this time.`);
      else if (data.emailed) toast.success(`Meeting set. ${first} has been emailed at ${a.email}.`);
      else if (data.emailsPaused) toast.success(`Meeting saved. Emails are paused, so ${tell}.`);
      else if (m.notify) toast.warning(`Meeting saved, but the email didn't go, so ${tell}.`);
      else toast.success("Meeting saved. No email was sent.");
      return true;
    } catch (e: any) {
      toast.error(e.message || "Could not set the meeting");
      return false;
    } finally {
      setScheduling((s) => withId(s, a.id, false));
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
      <div className="flex min-h-screen items-center justify-center bg-[#F2F1F6]">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
      </div>
    );
  }
  if (!isAuthorized) return null;

  const selected = rows.find((r) => r.id === selectedId) ?? null;
  const newCount = counts?.by_status.new ?? 0;
  const today = new Date().toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
  const stageFilter = filters.status;
  const statusTabs: { key: string; label: string; n: number }[] = [
    { key: "", label: "All", n: rows.length },
    ...STATUSES.map((st) => ({ key: st, label: STATUS_LABELS[st], n: counts?.by_status[st] ?? 0 })),
  ];

  const profileFor = (a: Applicant, inSheet: boolean) => {
    const so = standOut(a, links);
    const draft = noteDrafts[a.id];
    const savedNotes = a.team_notes ?? "";
    return (
      <ApplicantProfile
        key={a.id}
        applicant={a}
        inSheet={inSheet}
        onClose={closeSheet}
        via={links.cameVia(a)}
        broughtIn={links.broughtIn(a)}
        links={links}
        score={so.score}
        onOpenApplicant={openApplicant}
        savingStatus={savingStatus.has(a.id)}
        onStatus={(st) => changeStatus(a, st)}
        notes={draft ?? savedNotes}
        notesDirty={draft !== undefined && cleanNotes(draft) !== savedNotes}
        savingNotes={savingNotes.has(a.id)}
        onNotesChange={(value) => setNoteDrafts((d) => ({ ...d, [a.id]: value }))}
        onNotesSave={() => saveNotes(a)}
        fellow={fellowByApp[a.id] ?? null}
        makingFellow={makingFellow.has(a.id)}
        onMakeFellow={() => makeFellow(a)}
        savingOutcome={savingOutcome.has(a.id)}
        onOutcome={(o, on) => setOutcome(a, o, on)}
        scheduling={scheduling.has(a.id)}
        onScheduleMeeting={(m) => scheduleMeeting(a, m)}
        emailsPaused={emailsPaused}
      />
    );
  };

  return (
    <div className="min-h-screen bg-[#F2F1F6] text-[#1A1625]">
      <div inert={sheetOpen || undefined}>
      <AdminHeader />

      {/* The fellowship's own two tabs, as in the design. */}
      <nav aria-label="Growth Fellowship" className="border-b border-[#E5E2EC] bg-white">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 sm:px-6">
          <div className="flex items-center gap-1">
            <span className="mr-3 py-3 text-sm font-semibold text-[#686377]">Growth Fellowship</span>
            {calendarLive && (
              <Link
                to="/fellowship/calendar"
                className="border-b-2 border-transparent px-3 py-3 text-sm font-semibold text-[#4B4659] hover:text-[#1A1625]"
              >
                Calendar
              </Link>
            )}
            <span aria-current="page" className="inline-flex items-center gap-2 border-b-2 border-[#6C3AE8] px-3 py-3 text-sm font-semibold text-[#1A1625]">
              Applicants
              {newCount > 0 && (
                <span className="rounded-full bg-[#AE2539] px-1.5 text-[11px] font-bold leading-[18px] text-white" title={`${newCount} new`}>
                  {newCount}
                </span>
              )}
            </span>
          </div>
          <p className="py-2 text-sm font-semibold text-[#4B4659]">{today}</p>
        </div>
      </nav>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.01em]" style={{ fontFamily: SERIF }}>
              Applicants
            </h1>
            <p className="mt-1 text-sm text-[#686377]">
              Growth Fellowship applications from studojo.com/fellowship-growth. Scores are out of {MAX_SCORE}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {counts && <span className="text-sm text-[#686377]">{counts.last_24_hours} in the past 24 hours</span>}
            <a href="#funnel-and-sharing" className="text-sm font-semibold text-[#5428C8] underline underline-offset-2 hover:text-[#1A1625]">
              Sharing and sources
            </a>
            <button
              type="button"
              onClick={() => downloadCsv(filtered, links)}
              disabled={filtered.length === 0}
              title="Downloads the applicants shown, with every answer and their share link numbers"
              className="rounded-lg border border-[#CDC8D9] bg-white px-4 py-2 text-sm font-semibold hover:border-[#6C3AE8] disabled:opacity-50"
            >
              Download CSV
            </button>
          </div>
        </div>

        {loadError && (
          <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
            Could not load applications: {loadError}
          </div>
        )}

        {pipeline && (
          <PipelineCard
            pipeline={pipeline}
            active={stageFilter}
            onPick={(st) => setFilters((f) => ({ ...f, status: f.status === st ? "" : st }))}
          />
        )}

        {loading ? (
          <div className="py-16 text-center text-sm text-[#686377]">Loading...</div>
        ) : loadError ? null : rows.length === 0 ? (
          <div className="mt-5 grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_290px]">
            <div className="rounded-xl border border-[#E5E2EC] bg-white p-12 text-center">
              <p className="text-sm font-medium">No applications yet.</p>
              <p className="mt-1 text-sm text-[#686377]">Applications from studojo.com/fellowship-growth will show up here as they come in.</p>
            </div>
            <FunnelSide analytics={analytics} error={analyticsError} loading={analyticsLoading} range={range} onRangeChange={changeRange} />
          </div>
        ) : (
          <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_400px] xl:grid-cols-[290px_minmax(0,1fr)_420px]">
            {/* Middle: the list. */}
            <section aria-labelledby="ugc-list-title" className="min-w-0 rounded-xl border border-[#E5E2EC] bg-white">
              <div className="px-4 pt-5 sm:px-5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="ugc-list-title" className="text-xl font-semibold" style={{ fontFamily: SERIF }}>
                    {rows.length} applications
                  </h2>
                  <label className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-[#686377]">
                    Sort
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as "newest" | "standout")}
                      className="rounded-lg border border-[#CDC8D9] bg-white px-2 py-1.5 text-sm font-normal normal-case tracking-normal text-[#1A1625]"
                    >
                      <option value="newest">Newest first</option>
                      <option value="standout">Stand-out score</option>
                    </select>
                  </label>
                </div>

                <div role="group" aria-label="Status filter" className="mt-3 flex flex-wrap gap-x-1 border-b border-[#E5E2EC]">
                  {statusTabs.map((t) => {
                    const on = (filters.status || "") === t.key;
                    return (
                      <button
                        key={t.key || "all"}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setFilters((f) => ({ ...f, status: t.key }))}
                        className={`-mb-px whitespace-nowrap border-b-2 px-2 pb-2 pt-1 text-sm font-semibold ${
                          on ? "border-[#6C3AE8] text-[#1A1625]" : "border-transparent text-[#686377] hover:text-[#1A1625]"
                        }`}
                      >
                        {t.label} <span className="font-normal text-[#686377]">{t.n}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label htmlFor="ugc-search" className="sr-only">
                    Search
                  </label>
                  <input
                    id="ugc-search"
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search name, email or college"
                    className="min-w-0 flex-1 rounded-lg border border-[#CDC8D9] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
                  />
                </div>

                <section aria-label="Who stands out" className="mt-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold text-[#686377]">Quick filters</span>
                    {HIGHLIGHTS.filter((h) => moreFilters || (PRIMARY_HIGHLIGHTS as readonly string[]).includes(h.key) || quick.has(h.key)).map((h) => {
                      const on = quick.has(h.key);
                      const n = rows.filter((r) => h.test(r, links)).length;
                      return (
                        <button
                          key={h.key}
                          type="button"
                          aria-pressed={on}
                          onClick={() => toggleQuick(h.key)}
                          className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                            on ? "border-[#6C3AE8] bg-[#6C3AE8] text-white" : "border-[#CDC8D9] bg-white text-[#1A1625] hover:border-[#6C3AE8]"
                          }`}
                        >
                          {h.label}
                          <span className="sr-only">, </span>
                          <span className={`ml-1.5 tabular-nums ${on ? "text-violet-100" : "text-[#686377]"}`}>{n}</span>
                          <span className="sr-only"> applicants</span>
                        </button>
                      );
                    })}
                    <button
                      type="button"
                      aria-expanded={moreFilters}
                      onClick={() => setMoreFilters((v) => !v)}
                      className="text-[13px] font-semibold text-[#5428C8] underline underline-offset-2"
                    >
                      {moreFilters ? "Fewer filters" : "More filters"}
                    </button>
                  </div>
                  {!moreFilters && FILTERS.some((f) => f.key !== "status" && filters[f.key]) && (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {FILTERS.filter((f) => f.key !== "status" && filters[f.key]).map((f) => (
                        <button
                          key={f.key}
                          type="button"
                          onClick={() => setFilters((prev) => ({ ...prev, [f.key]: "" }))}
                          aria-label={`Remove filter ${f.label}: ${f.optionLabel ? f.optionLabel(filters[f.key]) : filters[f.key]}`}
                          className="rounded-full border border-[#6C3AE8] bg-[#F2EDFF] px-3 py-1 text-[13px] font-medium text-[#5428C8]"
                        >
                          {f.label}: {f.optionLabel ? f.optionLabel(filters[f.key]) : filters[f.key]} <span aria-hidden="true">×</span>
                        </button>
                      ))}
                    </div>
                  )}
                  {moreFilters && (
                    <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {FILTERS.filter((f) => f.key !== "status").map((f) => (
                        <div key={f.key}>
                          <label htmlFor={`ugc-filter-${f.key}`} className="mb-1 block text-xs font-semibold uppercase tracking-wide text-[#686377]">
                            {f.label}
                          </label>
                          <select
                            id={`ugc-filter-${f.key}`}
                            value={filters[f.key]}
                            onChange={(e) => setFilters((prev) => ({ ...prev, [f.key]: e.target.value }))}
                            className="w-full rounded-lg border border-[#CDC8D9] bg-white px-3 py-2 text-sm"
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
                  )}
                </section>

                <div className="mt-3 flex items-center gap-3 pb-3 text-sm">
                  <span className="text-[#686377]">
                    {filtered.length} of {rows.length} shown
                  </span>
                  {filtersActive && (
                    <button type="button" onClick={clearFilters} className="text-xs font-semibold text-[#5428C8] underline underline-offset-2">
                      Clear filters
                    </button>
                  )}
                </div>
              </div>

              {filtered.length === 0 ? (
                <div className="border-t border-[#E5E2EC] p-10 text-center">
                  <p className="text-sm text-[#686377]">No applications match these filters.</p>
                  <button type="button" onClick={clearFilters} className="mt-3 text-sm font-semibold text-[#5428C8] underline underline-offset-2">
                    Clear filters
                  </button>
                </div>
              ) : (
                <ol aria-label="Applicants">
                  {filtered.map((r, i) => {
                    const so = standOut(r, links);
                    const via = links.cameVia(r);
                    const isSel = r.id === selectedId;
                    return (
                      <li
                        key={r.id}
                        id={`ugc-applicant-${r.id}`}
                        onClick={(e) => onRowClick(e, r.id)}
                        className={`scroll-mt-4 cursor-pointer border-t border-[#E5E2EC] px-4 py-4 sm:px-5 ${
                          isSel ? "bg-[#F2EDFF] shadow-[inset_3px_0_0_#6C3AE8]" : "hover:bg-[#F8F7FB]"
                        }`}
                      >
                        <div className="grid grid-cols-[22px_40px_minmax(0,1fr)] gap-x-3 sm:grid-cols-[22px_40px_minmax(0,1fr)_150px]">
                          <span className="pt-2.5 text-right text-xs tabular-nums text-[#686377]">{i + 1}</span>
                          <Avatar name={r.full_name} />
                          <div className="min-w-0">
                            <button
                              type="button"
                              data-open
                              onClick={(e) => {
                                select(r.id);
                                if (e.detail === 0 && window.matchMedia(WIDE).matches) setFocusProfile(true);
                              }}
                              aria-label={`Open ${r.full_name}'s answers`}
                              aria-current={isSel ? "true" : undefined}
                              className="text-left text-[15px] font-semibold hover:underline"
                            >
                              {r.full_name}
                            </button>
                            <p className="text-[13px] text-[#686377]">
                              {r.year_of_study} · {r.college}
                              {r.city ? ` · ${r.city}` : ""} · applied {appliedAgo(r.created_at)}
                            </p>
                            {via && (
                              <p className="mt-0.5 text-xs text-[#686377]">
                                Came via <CameViaName via={via} onOpen={openApplicant} />
                              </p>
                            )}
                            {r.status === "meeting" && r.meeting_at && (
                              <p className="mt-1 text-xs font-medium text-violet-700">Meeting: {meetingWhen(new Date(r.meeting_at))}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1">
                              {!r.has_linkedin && <NoLinkedinPill />}
                              {so.reasons.slice(0, 3).map((reason) => (
                                <span key={reason} className="whitespace-nowrap rounded-md border border-[#E5E2EC] bg-[#F8F7FB] px-2 py-0.5 text-[11.5px] font-medium text-[#4B4659]">
                                  {reason}
                                </span>
                              ))}
                              {so.reasons.length > 3 && <span className="text-[11.5px] text-[#686377]">+{so.reasons.length - 3} more</span>}
                            </div>
                          </div>
                          <div className="col-span-3 mt-3 flex items-center justify-between gap-3 sm:col-span-1 sm:mt-0 sm:block sm:text-right">
                            <div>
                              <p className="text-lg font-semibold tabular-nums" style={{ fontFamily: SERIF }}>
                                {so.score}
                                <span className="text-xs font-normal text-[#686377]"> / {MAX_SCORE}</span>
                              </p>
                              <ScoreBlocks score={so.score} />
                            </div>
                            <select
                              aria-label={`Status for ${r.full_name}`}
                              value={r.status}
                              // A fellow stays one: their page is live.
                              disabled={savingStatus.has(r.id) || Boolean(fellowByApp[r.id])}
                              onChange={(e) => changeStatus(r, e.target.value)}
                              className={`mt-0 rounded-lg border px-2 py-1.5 text-[13px] font-semibold sm:mt-2 sm:w-full ${STATUS_STYLES[r.status] ?? STATUS_STYLES.new}`}
                            >
                              {!(SETTABLE as readonly string[]).includes(r.status) && (
                                <option value={r.status} disabled={r.status === "selected"}>
                                  {STATUS_LABELS[r.status] ?? r.status}
                                </option>
                              )}
                              {SETTABLE.map((st) => (
                                <option key={st} value={st}>
                                  {STATUS_LABELS[st]}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>

            {/* Right: the selected applicant (a sheet on phones). It stays in view while the list scrolls. */}
            <aside aria-label="Applicant" className="hidden min-w-0 lg:sticky lg:top-[96px] lg:block lg:self-start">
              {selected ? (
                profileFor(selected, false)
              ) : (
                <div className="rounded-xl border border-dashed border-[#CDC8D9] bg-white p-10 text-center text-sm text-[#686377]">
                  Pick an applicant to read their answers.
                </div>
              )}
            </aside>

            {/* The application funnel: under the list, or on the left of a wide screen. */}
            <div className="lg:col-span-2 xl:order-first xl:col-span-1">
              <FunnelSide
                analytics={analytics}
                error={analyticsError}
                loading={analyticsLoading}
                range={range}
                onRangeChange={changeRange}
              />
            </div>
          </div>
        )}

        {!loading && !loadError && (
          <SharingSection
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

      {sheetOpen && selected && (
        <div
          key={selected.id}
          role="dialog"
          aria-modal="true"
          aria-label={selected.full_name}
          className="fixed left-0 top-0 z-[60] h-dvh w-screen overflow-y-auto bg-[#F2F1F6] lg:hidden"
        >
          {profileFor(selected, true)}
        </div>
      )}
    </div>
  );
}

// "10 min ago", "3 hr ago", "yesterday", "2 days ago", then the date.
function appliedAgo(iso: string | null): string {
  const t = iso ? Date.parse(iso) : NaN;
  if (Number.isNaN(t)) return "";
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  return `on ${formatDay(iso)}`;
}

const AVATAR_TINTS = ["bg-[#E8E3FB] text-[#4B2BB8]", "bg-[#FCE8EB] text-[#AE2539]", "bg-[#E2F3E9] text-[#11724A]", "bg-[#FFF2D9] text-[#8A5300]", "bg-[#E3EEFB] text-[#1D4F91]"];

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  const parts = name.trim().split(/\s+/);
  const initials = ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
  const tint = AVATAR_TINTS[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TINTS.length];
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center rounded-full font-semibold ${tint} ${size === "lg" ? "h-16 w-16 text-xl" : "h-10 w-10 text-sm"}`}
    >
      {initials}
    </span>
  );
}

// The score as 13 small blocks, filled up to it.
function ScoreBlocks({ score, large = false }: { score: number; large?: boolean }) {
  return (
    <span className={`mt-1 inline-flex ${large ? "gap-1" : "gap-[2px]"}`} aria-hidden="true">
      {Array.from({ length: MAX_SCORE }, (_, i) => (
        <i key={i} className={`${large ? "h-3.5 w-4 rounded-[3px]" : "h-2 w-[7px] rounded-[2px]"} ${i < score ? "bg-[#6C3AE8]" : "bg-[#E3DEF0]"}`} />
      ))}
    </span>
  );
}

// Applied to Referred. Clicking a stage shows those applicants.
function PipelineCard({ pipeline, active, onPick }: { pipeline: Pipeline; active: string; onPick: (status: string) => void }) {
  const stages: { label: string; n: number; status: string | null; note?: string }[] = [
    { label: "Applied", n: pipeline.applied, status: "" },
    { label: "Shortlisted", n: pipeline.shortlisted, status: "shortlisted" },
    { label: "Meeting scheduled", n: pipeline.meeting, status: "meeting" },
    { label: "Fellow", n: pipeline.fellow, status: "selected" },
    { label: "Growth intern", n: pipeline.growthIntern, status: null },
    { label: "Referred", n: pipeline.referred, status: null },
  ];
  return (
    <section aria-labelledby="ugc-pipeline-title" className="rounded-xl border border-[#E5E2EC] bg-white px-5 pb-4 pt-4">
      <h2 id="ugc-pipeline-title" className="text-xl font-semibold" style={{ fontFamily: SERIF }}>
        Pipeline
      </h2>
      <ol className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {stages.map((st, i) => {
          const on = st.status !== null && st.status !== "" && active === st.status;
          const body = (
            <>
              <span className="block text-[28px] font-semibold leading-none tabular-nums" style={{ fontFamily: SERIF }}>
                {fmt(st.n)}
              </span>
              <span className="mt-1 block text-sm font-medium text-[#4B4659]">{st.label}</span>
            </>
          );
          return (
            <li key={st.label} className="relative">
              {st.status === null ? (
                <div className="rounded-lg px-3 py-2">
                  {body}
                </div>
              ) : (
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(st.status as string)}
                  className={`w-full rounded-lg px-3 py-2 text-left transition-colors ${on ? "bg-[#F2EDFF] ring-1 ring-[#D9CCFF]" : "hover:bg-[#F8F7FB]"}`}
                >
                  {body}
                </button>
              )}
              {i < stages.length - 1 && (
                <span aria-hidden="true" className="absolute right-[-6px] top-1/2 hidden -translate-y-1/2 text-[#CDC8D9] xl:block">
                  ›
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="mt-2 px-3 text-xs text-[#686377]">Mark Growth intern and Referred on a fellow's profile, under What they went on to.</p>
    </section>
  );
}

function RangePicker({ range, onRangeChange, label }: { range: RangeKey; onRangeChange: (r: RangeKey) => void; label: string }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-lg border border-[#CDC8D9] bg-white p-0.5">
      {RANGES.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={range === r.key}
          onClick={() => onRangeChange(r.key)}
          className={`rounded-md px-2.5 py-1 text-xs font-semibold transition-colors ${
            range === r.key ? "bg-[#6C3AE8] text-white" : "text-[#4B4659] hover:bg-[#F2F1F6]"
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );
}

// The application funnel, narrow, beside the list.
function FunnelSide({
  analytics,
  error,
  loading,
  range,
  onRangeChange,
}: {
  analytics: Analytics | null;
  error: string | null;
  loading: boolean;
  range: RangeKey;
  onRangeChange: (range: RangeKey) => void;
}) {
  const funnel = analytics?.funnel;
  let drop: { from: string; to: string; lost: number } | null = null;
  if (funnel) {
    for (let i = 1; i < FUNNEL_STAGES.length; i++) {
      const st = FUNNEL_STAGES[i];
      const before = funnel[FUNNEL_STAGES[i - 1].key];
      if (st.key === "applications" || before <= 0) continue;
      const lost = 1 - funnel[st.key] / before;
      if (lost > 0 && (!drop || lost > drop.lost)) drop = { from: FUNNEL_STAGES[i - 1].label, to: st.label, lost };
    }
  }
  const max = funnel ? Math.max(0, ...FUNNEL_STAGES.map((st) => funnel[st.key])) : 0;
  return (
    <section aria-labelledby="ugc-funnel-title" className="rounded-xl border border-[#E5E2EC] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 id="ugc-funnel-title" className="text-xl font-semibold" style={{ fontFamily: SERIF }}>
          Application funnel
        </h2>
        <RangePicker range={range} onRangeChange={onRangeChange} label="Range for the funnel" />
      </div>
      {!funnel ? (
        <p className="mt-3 text-sm text-red-700" role="alert">
          Could not load the funnel: {error || "unknown error"}{" "}
          <button type="button" onClick={() => onRangeChange(range)} className="font-semibold underline">
            {loading ? "Trying again..." : "Try again"}
          </button>
        </p>
      ) : (
        <div aria-busy={loading} className={`transition-opacity ${loading ? "opacity-50" : ""}`}>
          {funnel.view > 0 ? (
            <p className="mt-3 flex items-baseline gap-2">
              <span className="text-[34px] font-semibold leading-none" style={{ fontFamily: SERIF }}>
                {pct(funnel.applications, funnel.view)}
              </span>
              <span className="text-sm text-[#4B4659]">
                of visitors applied ({fmt(funnel.applications)} of {fmt(funnel.view)})
              </span>
            </p>
          ) : (
            <p className="mt-3 text-sm text-[#4B4659]">Nobody has opened the page in this range yet.</p>
          )}
          <ol className="mt-4 space-y-3">
            {FUNNEL_STAGES.map((st, i) => {
              const value = funnel[st.key];
              const before = i > 0 ? funnel[FUNNEL_STAGES[i - 1].key] : null;
              return (
                <li key={st.key}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-semibold">
                      {st.label}
                      {st.note && <span className="block text-[11px] font-normal text-[#686377]">{st.note}</span>}
                    </span>
                    <span className="whitespace-nowrap text-[12px] text-[#686377]">
                      {before === null ? "All visitors" : st.key === "applications" ? "All in this range" : before > 0 ? `${pct(value, before)} carried on` : ""}
                    </span>
                  </div>
                  <div className="mt-1 flex items-center gap-2">
                    <div className="h-2.5 flex-1 rounded-sm bg-[#F2F1F6]" aria-hidden="true">
                      <div className="h-full rounded-r-[3px] bg-[#6C3AE8]" style={{ width: value > 0 && max > 0 ? `max(${(value / max) * 100}%, 3px)` : 0 }} />
                    </div>
                    <span className="w-12 text-right text-sm font-semibold tabular-nums">{fmt(value)}</span>
                  </div>
                </li>
              );
            })}
          </ol>
          {drop && (
            <p className="mt-4 border-t border-[#E5E2EC] pt-3 text-[13px] text-[#4B4659]">
              The biggest drop is from <b>{drop.from.toLowerCase()}</b> to <b>{drop.to.toLowerCase()}</b>:{" "}
              {Math.round(drop.lost * 100)}% leave there.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

// Share links, the no-LinkedIn warning, sources and top sharers, full width under the desk.
function SharingSection({
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
    <section id="funnel-and-sharing" aria-labelledby="ugc-sharing-title" className="mt-8 scroll-mt-28">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="ugc-sharing-title" className="text-xl font-semibold" style={{ fontFamily: SERIF }}>
            Sharing and sources
          </h2>
          <p className="mt-0.5 text-sm text-[#686377]">From the public page. People are counted once per browser.</p>
        </div>
        <RangePicker range={range} onRangeChange={onRangeChange} label="Range for the funnel and sharing numbers" />
      </div>
      {!analytics ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">
          Could not load the sharing numbers: {error || "unknown error"}{" "}
          <button type="button" onClick={() => onRangeChange(range)} className="font-medium underline underline-offset-2">
            {loading ? "Trying again..." : "Try again"}
          </button>
        </div>
      ) : (
        <div aria-busy={loading} className={`space-y-4 transition-opacity ${loading ? "opacity-50" : ""}`}>
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
    <section className={`min-w-0 rounded-xl border border-[#E5E2EC] bg-white p-5 ${className}`}>
      <h3 className="text-base font-semibold" style={{ fontFamily: SERIF }}>{title}</h3>
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
    <section className="border-t border-[#E5E2EC] px-5 py-4">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[0.08em] text-[#686377]">{title}</h3>
      {children}
    </section>
  );
}

function Answer({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold text-[#686377]">{label}</dt>
      <dd className="mt-0.5 text-sm text-[#1A1625] [overflow-wrap:anywhere]">{children}</dd>
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
      <div className="grid gap-4">
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

// Dates and times typed into the meeting form are India time.
const IST_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" });
const IST_TIME = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hour12: false });

function meetingDefaults(a: Applicant) {
  const at = a.meeting_at ? new Date(a.meeting_at) : (() => {
    // Tomorrow, 11 am India time.
    const d = new Date(Date.now() + 86400000);
    return new Date(`${IST_DAY.format(d)}T11:00:00+05:30`);
  })();
  return { date: IST_DAY.format(at), time: IST_TIME.format(at), link: a.meeting_link ?? "", note: a.meeting_note ?? "", notify: true };
}

function MeetingPanel({
  applicant: a,
  editing,
  onEditing,
  canChange,
  emailsPaused,
  busy,
  onSave,
}: {
  applicant: Applicant;
  editing: boolean;
  onEditing: (v: boolean) => void;
  canChange: boolean;
  emailsPaused: boolean;
  busy: boolean;
  onSave: (m: { at: string; link: string; note: string; notify: boolean }) => Promise<boolean>;
}) {
  const [form, setForm] = useState(() => meetingDefaults(a));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setForm(meetingDefaults(a));
    setError(null);
  }, [a.id, a.meeting_at, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const at = a.meeting_at ? new Date(a.meeting_at) : null;
  const first = a.full_name.trim().split(/\s+/)[0];
  const whatsapp = at ? meetingWhatsapp({ fullName: a.full_name, at, link: a.meeting_link, note: a.meeting_note }, a.whatsapp) : null;

  if (!editing) {
    if (!at) return null;
    return (
      <section aria-label="Meeting" className="mx-5 mb-4 rounded-lg border border-[#D9CCFF] bg-[#F7F4FF] px-4 py-3">
        <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5428C8]">Meeting</p>
        <p className="mt-1 text-[15px] font-semibold">{meetingWhen(at)}</p>
        {a.meeting_link && (
          <p className="mt-0.5 text-sm [overflow-wrap:anywhere]">
            <ExternalLink href={a.meeting_link}>{a.meeting_link}</ExternalLink>
          </p>
        )}
        {a.meeting_note && <p className="mt-1 whitespace-pre-wrap text-sm text-[#4B4659]">{a.meeting_note}</p>}
        <p className="mt-1 text-xs text-[#686377]">
          {a.meeting_emailed_at ? `Emailed to ${a.email} ${appliedAgo(a.meeting_emailed_at)}.` : "Not emailed."}
        </p>
        {canChange && (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" onClick={() => onEditing(true)} className="rounded-lg border border-[#CDC8D9] bg-white px-3 py-1.5 text-sm font-semibold hover:border-[#6C3AE8]">
            Change
          </button>
          {whatsapp && (
            <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-[#CDC8D9] bg-white px-3 py-1.5 text-sm font-semibold hover:border-[#6C3AE8]">
              Send on WhatsApp
            </a>
          )}
        </div>
        )}
      </section>
    );
  }

  const id = `meet-${a.id}`;
  return (
    <form
      aria-label={`Schedule a meeting with ${a.full_name}`}
      className="mx-5 mb-4 rounded-lg border border-[#D9CCFF] bg-[#F7F4FF] px-4 py-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!form.date || !form.time) return setError("Pick a date and a time.");
        const iso = new Date(`${form.date}T${form.time}:00+05:30`);
        if (Number.isNaN(iso.getTime())) return setError("That date or time doesn't look right.");
        setError(null);
        const ok = await onSave({ at: iso.toISOString(), link: form.link.trim(), note: form.note.trim(), notify: form.notify && !emailsPaused });
        if (ok) onEditing(false);
      }}
    >
      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-[#5428C8]">{at ? "Change the meeting" : "Schedule a meeting"}</p>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="text-xs font-semibold text-[#4B4659]" htmlFor={`${id}-date`}>
          Date
          <input id={`${id}-date`} type="date" value={form.date} onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#CDC8D9] bg-white px-2 py-1.5 text-sm font-normal" />
        </label>
        <label className="text-xs font-semibold text-[#4B4659]" htmlFor={`${id}-time`}>
          Time (India)
          <input id={`${id}-time`} type="time" value={form.time} onChange={(e) => setForm((f) => ({ ...f, time: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#CDC8D9] bg-white px-2 py-1.5 text-sm font-normal" />
        </label>
      </div>
      <label className="mt-2 block text-xs font-semibold text-[#4B4659]" htmlFor={`${id}-link`}>
        Meeting link (optional)
        <input id={`${id}-link`} type="url" inputMode="url" maxLength={1000} placeholder="https://meet.google.com/..." value={form.link} onChange={(e) => setForm((f) => ({ ...f, link: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#CDC8D9] bg-white px-2 py-1.5 text-sm font-normal" />
      </label>
      <label className="mt-2 block text-xs font-semibold text-[#4B4659]" htmlFor={`${id}-note`}>
        Note for them (optional)
        <textarea id={`${id}-note`} rows={2} maxLength={500} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} className="mt-1 w-full rounded-lg border border-[#CDC8D9] bg-white px-2 py-1.5 text-sm font-normal" />
      </label>
      {emailsPaused ? (
        <p className="mt-2 rounded-lg bg-white px-3 py-2 text-sm text-[#4B4659]">
          Emails are paused, so {first} won't be emailed. After saving, {whatsappHref(a.whatsapp) ? "send the time on WhatsApp" : "tell them the time yourself"}.
        </p>
      ) : (
        <label className="mt-2 flex items-start gap-2 text-sm">
          <input type="checkbox" checked={form.notify} onChange={(e) => setForm((f) => ({ ...f, notify: e.target.checked }))} className="mt-0.5 h-4 w-4 accent-[#6C3AE8]" />
          <span>
            Email {first} the time at <span className="font-semibold [overflow-wrap:anywhere]">{a.email}</span>
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm font-semibold text-[#AE2539]">
          {error}
        </p>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-[#6C3AE8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5428C8] disabled:opacity-60">
          {busy ? "Saving..." : form.notify && !emailsPaused ? "Save and email" : "Save"}
        </button>
        <button type="button" onClick={() => onEditing(false)} className="rounded-lg border border-[#CDC8D9] bg-white px-4 py-2 text-sm font-semibold">
          Cancel
        </button>
      </div>
    </form>
  );
}

// Every signal behind the score, with its points.
function ScoreBreakdown({ applicant: a, links, score }: { applicant: Applicant; links: ShareLinks; score: number }) {
  return (
    <section aria-label="Stand-out score" className="mx-5 mb-4 rounded-lg border border-[#E5E2EC] px-4 py-3">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Stand-out score</h3>
        <p className="text-[28px] font-semibold leading-none tabular-nums" style={{ fontFamily: SERIF }}>
          {score}
          <span className="text-sm font-normal text-[#686377]"> / {MAX_SCORE}</span>
        </p>
      </div>
      <ScoreBlocks score={score} large />
      <ul className="mt-3 space-y-1.5">
        {HIGHLIGHTS.map((h) => {
          const hit = h.test(a, links);
          return (
            <li key={h.key} className={`flex items-center justify-between gap-3 text-[13px] ${hit ? "" : "text-[#686377]"}`}>
              <span className="flex items-center gap-2">
                <svg viewBox="0 0 16 16" className={`h-3.5 w-3.5 shrink-0 ${hit ? "text-[#11724A]" : "text-[#CDC8D9]"}`} aria-hidden="true">
                  {hit ? (
                    <path d="M3 8.5l3 3 7-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  ) : (
                    <path d="M4 8h8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  )}
                </svg>
                {h.label}
                <span className="sr-only">{hit ? "(yes)" : "(no)"}</span>
              </span>
              <span className={`tabular-nums ${hit && h.points ? "font-semibold" : ""}`}>{hit && h.points ? `+${h.points}` : "0"}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ApplicantProfile({
  applicant: a,
  inSheet,
  onClose,
  via,
  broughtIn,
  links,
  score,
  onOpenApplicant,
  savingStatus,
  onStatus,
  notes,
  notesDirty,
  savingNotes,
  onNotesChange,
  onNotesSave,
  fellow,
  makingFellow,
  onMakeFellow,
  savingOutcome,
  onOutcome,
  scheduling,
  onScheduleMeeting,
  emailsPaused,
}: {
  applicant: Applicant;
  inSheet: boolean;
  onClose: () => void;
  via: CameVia | null;
  broughtIn: Applicant[];
  links: ShareLinks;
  score: number;
  onOpenApplicant: (id: number) => void;
  savingStatus: boolean;
  onStatus: (status: string) => void;
  notes: string;
  notesDirty: boolean;
  savingNotes: boolean;
  onNotesChange: (value: string) => void;
  onNotesSave: () => void;
  fellow: Fellow | null;
  makingFellow: boolean;
  onMakeFellow: () => void;
  savingOutcome: boolean;
  onOutcome: (outcome: Outcome, on: boolean) => void;
  scheduling: boolean;
  onScheduleMeeting: (m: { at: string; link: string; note: string; notify: boolean }) => Promise<boolean>;
  emailsPaused: boolean;
}) {
  const [editingMeeting, setEditingMeeting] = useState(false);
  const [confirmFellow, setConfirmFellow] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  // The sheet takes focus when it opens.
  useEffect(() => {
    if (inSheet) backRef.current?.focus();
  }, [inSheet]);
  const first = a.full_name.trim().split(/\s+/)[0];
  // The selection meeting is for people still in review: not a fellow, and not
  // someone rejected (move them back first).
  const canMeet = !fellow && a.status !== "selected" && a.status !== "rejected";
  const linkedin = httpsUrl(a.linkedin_url);
  const bestPost = httpsUrl(a.best_post_url);
  const whatsapp = whatsappHref(a.whatsapp);
  const tooLong = notes.length > NOTES_MAX;
  const utmParts = [a.utm_source, a.utm_medium, a.utm_campaign];
  const utm = utmParts.some(Boolean) ? utmParts.map((v) => v || "none").join(" / ") : null;
  const stories = STORIES.filter((s) => a[s.key]);

  return (
    <div
      className={
        inSheet
          ? "min-h-full bg-white pb-10"
          : "max-h-[calc(100vh-112px)] overflow-y-auto rounded-xl border border-[#E5E2EC] bg-white"
      }
    >
      {inSheet && (
        <div className="sticky top-0 z-10 flex items-center border-b border-[#E5E2EC] bg-white px-4 py-2">
          <button ref={backRef} type="button" onClick={onClose} className="min-h-11 rounded-lg px-2 text-sm font-semibold text-[#5428C8]">
            Back to the list
          </button>
        </div>
      )}

      <header className="flex gap-4 px-5 pb-4 pt-5">
        <Avatar name={a.full_name} size="lg" />
        <div className="min-w-0">
          <h2 id="ugc-profile-title" tabIndex={-1} className="text-[26px] font-semibold leading-tight outline-none [overflow-wrap:anywhere]" style={{ fontFamily: SERIF }}>
            {a.full_name}
          </h2>
          <p className="text-sm text-[#4B4659]">
            {a.year_of_study} · {a.college}
            {a.city ? ` · ${a.city}` : ""}
          </p>
          <p className="text-sm text-[#686377]">Applied {appliedAgo(a.created_at)}</p>
          {via && (
            <p className="mt-0.5 text-xs text-[#686377]">
              Came via <CameViaName via={via} onOpen={onOpenApplicant} />
            </p>
          )}
        </div>
      </header>

      {fellow ? (
        <p className="px-5 pb-3">
          <span className="inline-block rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[13px] font-semibold text-emerald-800">Fellow</span>
        </p>
      ) : (
      <div role="group" aria-label="Status" className="flex flex-wrap gap-2 px-5 pb-3">
        {STATUS_BUTTONS.map((st) => {
          const on = a.status === st;
          return (
            <button
              key={st}
              type="button"
              aria-pressed={on}
              disabled={savingStatus || (st === "meeting" && !canMeet)}
              // "Meeting scheduled" means a meeting is set, so it opens the meeting form.
              onClick={() => (st === "meeting" ? !on && setEditingMeeting(true) : onStatus(st))}
              className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                on ? "border-[#1A1625] bg-[#1A1625] text-white" : "border-[#CDC8D9] bg-white hover:border-[#6C3AE8]"
              }`}
            >
              {STATUS_LABELS[st]}
            </button>
          );
        })}
        {a.status === "selected" && (
          <span className="rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[13px] font-semibold text-emerald-800">Fellow</span>
        )}
      </div>
      )}

      <div className="flex flex-wrap gap-2 px-5 pb-4">
        {/* Once a meeting is set, its box below has the Change button. */}
        {!editingMeeting && !a.meeting_at && canMeet && (
          <button
            type="button"
            onClick={() => setEditingMeeting(true)}
            className="rounded-lg bg-[#6C3AE8] px-4 py-2 text-sm font-semibold text-white hover:bg-[#5428C8]"
          >
            Schedule meeting
          </button>
        )}
        {!fellow && !confirmFellow && (
          <button
            type="button"
            onClick={() => setConfirmFellow(true)}
            disabled={makingFellow}
            className="rounded-lg border border-[#1A1625] bg-white px-4 py-2 text-sm font-semibold hover:bg-[#F2F1F6] disabled:opacity-60"
          >
            {makingFellow ? "Setting up..." : "Make fellow"}
          </button>
        )}
      </div>

      {!fellow && confirmFellow && (
        <div role="alertdialog" aria-label={`Make ${first} a fellow?`} className="mx-5 mb-4 rounded-lg border border-[#1A1625] bg-white px-4 py-3">
          <p className="text-sm font-semibold">Make {first} a fellow?</p>
          <p className="mt-0.5 text-sm text-[#4B4659]">This creates their page and marks them as a fellow.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={makingFellow}
              onClick={() => {
                setConfirmFellow(false);
                onMakeFellow();
              }}
              className="rounded-lg bg-[#1A1625] px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              Yes, make fellow
            </button>
            <button type="button" onClick={() => setConfirmFellow(false)} className="rounded-lg border border-[#CDC8D9] bg-white px-4 py-2 text-sm font-semibold">
              Cancel
            </button>
          </div>
        </div>
      )}

      <MeetingPanel
        applicant={a}
        editing={editingMeeting && canMeet}
        onEditing={setEditingMeeting}
        canChange={canMeet}
        emailsPaused={emailsPaused}
        busy={scheduling}
        onSave={onScheduleMeeting}
      />

      {fellow && (
        <section aria-label="Fellowship" className="mx-5 mb-4 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-800">Fellow</p>
          <p className="mt-1 text-sm [overflow-wrap:anywhere]">
            {a.full_name} is a fellow. Their page: <span className="font-mono text-xs">{fellow.link ?? "being set up"}</span>
          </p>
          <p className="text-xs text-[#686377]">Send it once the fellows' pages are live on studojo.com.</p>
          {fellow.link && (
            <button
              type="button"
              onClick={() =>
                navigator.clipboard
                  .writeText(fellow.link!)
                  .then(() => toast.success("Link copied"))
                  .catch(() => toast.error("Could not copy. Select the link instead."))
              }
              className="mt-2 rounded-lg border border-[#CDC8D9] bg-white px-3 py-1.5 text-sm font-semibold hover:border-[#6C3AE8]"
            >
              Copy link
            </button>
          )}
          <h3 className="mt-3 text-sm font-semibold">What they went on to</h3>
          <div role="group" aria-label="What they went on to" className="mt-1.5 flex flex-wrap gap-2">
            {OUTCOMES.map((o) => {
              const on = Boolean(fellow[o.field]);
              return (
                <button
                  key={o.key}
                  type="button"
                  aria-pressed={on}
                  disabled={savingOutcome}
                  onClick={() => onOutcome(o.key, !on)}
                  className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-colors disabled:opacity-60 ${
                    on ? "border-emerald-700 bg-emerald-700 text-white" : "border-[#CDC8D9] bg-white hover:border-emerald-700"
                  }`}
                >
                  {on && <span aria-hidden="true">✓ </span>}
                  {o.label}
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-[#686377]">These count in the pipeline's Growth intern and Referred.</p>
        </section>
      )}

      <ScoreBreakdown applicant={a} links={links} score={score} />

      <section aria-label="Why they want to join" className="px-5 pb-4">
        <h3 className="mb-2 text-sm font-semibold">Why they want to join</h3>
        <blockquote className="whitespace-pre-wrap rounded-lg bg-[#F8F7FB] px-4 py-3 text-[17px] leading-relaxed [overflow-wrap:anywhere]" style={{ fontFamily: SERIF }}>
          {a.why_join}
        </blockquote>
      </section>

      <Panel title="Contact">
        <dl className="space-y-3">
          <Answer label="Email">
            <a href={mailtoHref(a.email)} className="text-violet-700 underline underline-offset-2 hover:text-violet-900">
              {a.email}
            </a>
          </Answer>
          <Answer label="WhatsApp">{whatsapp ? <ExternalLink href={whatsapp}>{a.whatsapp}</ExternalLink> : a.whatsapp}</Answer>
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
            <Answer label="Profile">{linkedin ? <ExternalLink href={linkedin}>{linkedin}</ExternalLink> : orBlank(a.linkedin_url)}</Answer>
            <Answer label="A post they're proud of">{bestPost ? <ExternalLink href={bestPost}>Open the post</ExternalLink> : orBlank(a.best_post_url)}</Answer>
            {(a.connections || !a.followers) && <Answer label="Connections">{orBlank(a.connections)}</Answer>}
            {a.followers && <Answer label="Followers (old form)">{a.followers}</Answer>}
            <Answer label="How often they post">{orBlank(a.post_frequency)}</Answer>
            <Answer label="Last posted">{orBlank(a.last_posted)}</Answer>
            <Answer label="A post crossed 1,000 impressions">{orBlank(a.crossed_1k)}</Answer>
          </dl>
        ) : (
          <div>
            <NoLinkedinPill />
            <p className="mt-2 text-sm">They said they don't have a LinkedIn profile, so the LinkedIn questions were skipped.</p>
          </div>
        )}
      </Panel>

      <Panel title="Growth Fellowship">
        <dl className="space-y-3">
          <Answer label="Wants from the fellowship">
            {a.fellowship_goals.length ? a.fellowship_goals.join(", ") : <span className="text-gray-400">Not asked (earlier form)</span>}
          </Answer>
          <Answer label="Growth internship at Studojo">{orBlank(a.intern_interest, "Not asked (earlier form)")}</Answer>
          <Answer label="Share profile with people hiring">{orBlank(a.network_share, "Not asked (earlier form)")}</Answer>
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

      <Panel title="What they'd post">
        <dl className="space-y-3">
          <Answer label="Topics">
            {a.topics.length ? (
              <span className="mt-1 flex flex-wrap gap-1.5">
                {a.topics.map((t) => (
                  <span key={t} className="rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 text-xs font-medium text-violet-700">
                    {t}
                  </span>
                ))}
              </span>
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
      {stories.map((st) => (
        <Panel key={st.key} title={`${st.title} (old form)`}>
          <p className="whitespace-pre-wrap text-sm leading-relaxed [overflow-wrap:anywhere]">{a[st.key]}</p>
        </Panel>
      ))}

      <SharePanel applicant={a} broughtIn={broughtIn} onOpenApplicant={onOpenApplicant} />

      <Panel title="How they heard">
        <dl className="space-y-3">
          <Answer label="Came via a share link">{via ? <CameViaName via={via} onOpen={onOpenApplicant} /> : <span className="text-gray-400">No</span>}</Answer>
          <Answer label="Source">{orBlank(a.referral_source)}</Answer>
          <Answer label="Referred by">{orBlank(a.referred_by)}</Answer>
        </dl>
      </Panel>

      <Panel title="Dates and attribution">
        <dl className="space-y-3">
          <Answer label="Applied">{formatDateTime(a.created_at)}</Answer>
          <Answer label="Consent given">{formatDateTime(a.consent_at)}</Answer>
          <Answer label="Page">{orBlank(a.source_path, "Not recorded")}</Answer>
          <Answer label="UTM source / medium / campaign">{orBlank(utm, "None")}</Answer>
          <Answer label="Referrer">{orBlank(a.referrer, "None")}</Answer>
        </dl>
      </Panel>

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
          className="w-full rounded-lg border border-[#CDC8D9] bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
        />
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <span className={`text-xs ${tooLong ? "font-medium text-red-600" : "text-[#686377]"}`}>
            {notes.length.toLocaleString("en-US")} / {NOTES_MAX.toLocaleString("en-US")}
          </span>
          <div className="flex items-center gap-3">
            {notesDirty && !savingNotes && <span className="text-xs text-amber-700">Not saved yet</span>}
            <button
              type="button"
              onClick={onNotesSave}
              disabled={!notesDirty || savingNotes || tooLong}
              className="rounded-lg border border-[#1A1625] bg-white px-4 py-1.5 text-sm font-semibold disabled:opacity-50"
            >
              {savingNotes ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
