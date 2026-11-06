// Auditor flags (owner, 7 Nov 2026: "build an auditor that flags bad matches or these type of
// flags on our dashboard"): the bad matches and the bad journeys, one flag per student and
// type, each with a severity, what is wrong and the numbers behind it. This file is the
// pure part (the flag types, the rules that need judgement, the words, the counts), shared
// by the server (flags.server.ts) and the page (components/stu/flags-panel.tsx). Nothing
// here reads the database. No imports, so the tests load it straight from the source.

export type FlagSeverity = "high" | "med" | "low";
export type FlagGroup = "matching" | "journey" | "email" | "whatsapp" | "payments";

export const FLAG_GROUPS: { key: FlagGroup; label: string }[] = [
  { key: "matching", label: "Matching" },
  { key: "journey", label: "Journey" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "payments", label: "Payments and tickets" },
];

export interface FlagType {
  key: string;
  group: FlagGroup;
  severity: FlagSeverity;
  label: string;
  /** the rule, in plain words (shown under the summary row) */
  rule: string;
}

export const FLAG_TYPES: FlagType[] = [
  { key: "LEVEL_MISMATCH", group: "matching", severity: "high", label: "Level mismatch", rule: "Onboarded as entry level or intern only, but the resume shows 24 months or more of full-time work (or every job is undated and they graduated 3 or more years ago)." },
  { key: "TOO_SENIOR_FLOOD", group: "matching", severity: "high", label: "Too senior flood", rule: "50 or more verdicts in the range and 40% or more say the job is far above them (verdicts read for the last 72 hours of the range at most)." },
  { key: "THIN_PICKS", group: "matching", severity: "med", label: "Thin picks", rule: "An onboarded student whose picks for a day have fewer than 5 jobs." },
  { key: "REPEATED_PICKS", group: "matching", severity: "med", label: "Repeated picks", rule: "A day's picks hold jobs that were already in an earlier day's picks for the same student." },
  { key: "WEAK_PICK", group: "matching", severity: "med", label: "Weak pick", rule: "A picked job whose verdict has fit under 70, or says far above or far below." },
  { key: "CALL_NOT_CONFIRMED", group: "journey", severity: "high", label: "Call not confirmed", rule: "A call has been ready for over 30 minutes: analysis done, the student never confirmed the review or saw jobs." },
  { key: "ONBOARDED_NO_DESK", group: "journey", severity: "high", label: "Onboarded, no desk", rule: "Onboarded, and no desk opened, jobs shown, opened or saved from 10 minutes before to 30 minutes after (a call shows the jobs just before the step is stamped)." },
  { key: "MIC_BLOCKED_LEFT", group: "journey", severity: "med", label: "Mic blocked, left", rule: "The mic was denied and there was no call started or onboarding within an hour after." },
  { key: "CALL_DROPPED", group: "journey", severity: "high", label: "Call dropped", rule: "A call failed (not a blocked mic) or ended as failed, and no completed call came after." },
  { key: "VERIFIED_NO_CALL", group: "journey", severity: "low", label: "Verified, no call", rule: "Phone verified and no call started within 24 hours." },
  { key: "EMAIL_CLIPPED", group: "email", severity: "high", label: "Email clipped", rule: "An email whose text ends a sentence on a cut word, or greets a lower-case name." },
  { key: "FIND_MISSES", group: "email", severity: "med", label: "Find misses", rule: "5 or more email finds in the range and 40% or more refunded as no verified email." },
  { key: "SEND_NO_INBOX", group: "whatsapp", severity: "high", label: "Send, no inbox", rule: "A WhatsApp Send button tap was answered with Connect your inbox." },
  { key: "WA_BLOCKED", group: "whatsapp", severity: "med", label: "WhatsApp blocked", rule: "Messages to the student failed to send (131049 is Meta's marketing cap)." },
  { key: "WA_UNANSWERED", group: "whatsapp", severity: "high", label: "WhatsApp unanswered", rule: "A text from the student (not a verify code) got no reply within 2 minutes." },
  { key: "CHECKOUT_ABANDONED", group: "payments", severity: "low", label: "Checkout abandoned", rule: "An order or autopay was created and not paid within an hour." },
  { key: "PAID_NOT_GRANTED", group: "payments", severity: "high", label: "Paid, not granted", rule: "A paid order with no credits purchase row and no plan grant." },
  { key: "OPEN_TICKET", group: "payments", severity: "med", label: "Open ticket", rule: "A support ticket still open (any age)." },
];
export const FLAG_BY_KEY = new Map(FLAG_TYPES.map((t) => [t.key, t]));
export const SEAT_CAP = 250;

export interface Flag {
  /** type:user-or-address[:extra], unique */
  id: string;
  type: string;
  severity: FlagSeverity;
  /** public."user".id, or null when the flag names nobody (a number not linked, a ticket by email) */
  user: string | null;
  email: string;
  name: string;
  /** why the person is internal (staff, studojo.com, test account, guest), or null */
  internal: string | null;
  /** epoch ms */
  at: number;
  /** what is wrong, in plain words */
  what: string;
  /** the numbers behind it */
  evidence: string[];
  /** a page for this one flag (a ticket) */
  href?: string;
}

export interface FlagReport {
  generatedAt: string;
  env: string;
  /** epoch ms, the window the checks read */
  from: number;
  to: number;
  flags: Flag[];
  /** active WhatsApp links against the seat cap, null when not readable here */
  seats: { active: number; cap: number } | null;
  /** checks this database lacks or that failed (shown as not checked) */
  missing: string[];
  /** checks that hit their row cap (the counts there are a floor) */
  capped: string[];
}

export const FLAG_CAP = 2000;

// --------------------------------------------------------------------- time

export const istDay = (ms: number): string => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/**
 * The window a request means: the last `hours` hours, or whole IST days start..end (to the end of
 * the end day, or now when that day is today). Default 48 hours.
 */
export function flagWindow(q: { hours?: string | null; start?: string | null; end?: string | null }, now: number): { from: number; to: number; key: string } {
  const day = /^\d{4}-\d{2}-\d{2}$/;
  if (q.start && q.end && day.test(q.start) && day.test(q.end)) {
    let end = q.end;
    let start = q.start > end ? end : q.start;
    if (start < addDays(end, -60)) start = addDays(end, -60);
    const from = Date.parse(`${start}T00:00:00+05:30`);
    const to = Math.min(Date.parse(`${addDays(end, 1)}T00:00:00+05:30`), now);
    return { from, to: Math.max(to, from + 60_000), key: `d${start}|${end}|${istDay(now)}` };
  }
  const h = Math.min(Math.max(Math.round(Number(q.hours)) || 48, 1), 24 * 60);
  return { from: now - h * 3_600_000, to: now, key: `h${h}` };
}

// ------------------------------------------------------------- level mismatch

const MONTH = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const NOW_WORDS = /^(present|current|currently|now|ongoing|till date|to date|today|till now|date)$/i;

/** A resume date ("2025", "July 2027", "03/2024", "Present") as epoch ms; a bare year is mid-year. null when there is none. */
export function parseResumeDate(v: unknown, now: number): number | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (NOW_WORDS.test(s)) return now;
  const year = s.match(/(?:^|\D)((?:19|20)\d{2})(?:\D|$)/);
  if (!year) return null;
  const y = Number(year[1]);
  const named = s.toLowerCase().match(/[a-z]{3}/g)?.map((w) => MONTH.indexOf(w)).find((i) => i >= 0);
  const numeric = s.match(/(?:^|\D)(\d{1,2})\s*[\/.-]\s*(?:19|20)\d{2}/);
  const m = named != null && named >= 0 ? named : numeric && Number(numeric[1]) >= 1 && Number(numeric[1]) <= 12 ? Number(numeric[1]) - 1 : null;
  return m == null ? Date.UTC(y, 6, 1) : Date.UTC(y, m, 15);
}

const NOT_FULL_TIME = /\b(intern|internship|trainee|apprentice|volunteer|freelanc\w*|part[- ]?time)\b/i;

export interface MismatchInput {
  experience: unknown;
  graduationYear: unknown;
  seniority: unknown;
  now: number;
}
export interface Mismatch {
  basis: "dated" | "undated";
  months: number;
  jobs: number;
  gradYear: number | null;
}

/** Months of full-time work in the dated, non-intern entries (overlaps counted once). */
export function fullTimeMonths(experience: unknown, now: number): number {
  const spans: [number, number][] = [];
  for (const e of Array.isArray(experience) ? experience : []) {
    if (!e || typeof e !== "object" || NOT_FULL_TIME.test(String((e as any).title || ""))) continue;
    const a = parseResumeDate((e as any).start, now);
    const b = parseResumeDate((e as any).end, now) ?? (a != null && (e as any).end == null ? now : null);
    if (a != null && b != null && b > a) spans.push([a, b]);
  }
  spans.sort((x, y) => x[0] - y[0]);
  let total = 0;
  let cur: [number, number] | null = null;
  for (const s of spans) {
    if (cur && s[0] <= cur[1]) cur[1] = Math.max(cur[1], s[1]);
    else {
      if (cur) total += cur[1] - cur[0];
      cur = [s[0], s[1]];
    }
  }
  if (cur) total += cur[1] - cur[0];
  return Math.round(total / (30.4375 * 86_400_000));
}

/** The level-mismatch rule: asked for no mid or senior roles, yet 24+ months of full-time work, or all jobs undated and graduated 3+ years ago. */
export function levelMismatch(i: MismatchInput): Mismatch | null {
  const sen = Array.isArray(i.seniority) ? i.seniority.map((x) => String(x).toLowerCase()) : [];
  if (sen.includes("mid") || sen.includes("senior")) return null;
  const jobs = (Array.isArray(i.experience) ? i.experience : []).filter((e) => e && typeof e === "object");
  const fullTime = jobs.filter((e: any) => !NOT_FULL_TIME.test(String(e.title || "")));
  const gy = Number(String(i.graduationYear ?? "").match(/(?:19|20)\d{2}/)?.[0]) || null;
  const months = fullTimeMonths(jobs, i.now);
  if (months >= 24) return { basis: "dated", months, jobs: fullTime.length, gradYear: gy };
  const thisYear = new Date(i.now).getUTCFullYear();
  const allUndated = jobs.length > 0 && jobs.every((e: any) => !String(e.start ?? "").trim() && !String(e.end ?? "").trim());
  if (allUndated && fullTime.length > 0 && gy != null && gy <= thisYear - 3) return { basis: "undated", months: 0, jobs: fullTime.length, gradYear: gy };
  return null;
}

// -------------------------------------------------------------- clipped email

/** Short words that really do end a sentence, and abbreviations: a full stop after these is not a cut. */
const ENDS_OK = new Set(["me", "us", "it", "up", "on", "so", "no", "be", "we", "do", "go", "he", "ok", "hi", "id", "pm", "ai", "mr", "ms", "dr", "st", "vs", "jr", "sr", "co", "mt", "ph"]);
const GREETING_OK = new Set(["there", "all", "team", "everyone", "folks", "again", "and", "sir", "madam", "friends", "hiring"]);

/** Where a sentence ends on a one or two letter word that is not a real ending (a cut word): a short context for each. */
export function clippedEnds(text: string): string[] {
  const out: string[] = [];
  const re = / ([A-Za-z]{1,2})\.(?=\s|$)/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const w = m[1];
    if (ENDS_OK.has(w.toLowerCase())) continue;
    if (w.length === 2 && w === w.toUpperCase()) continue; // an acronym: UK, HR, IT
    if (w.length === 1 && w === w.toUpperCase() && /^\s+[A-Z]/.test(text.slice(m.index + m[0].length))) continue; // an initial: "Anna B. Rao"
    out.push(`${text.slice(Math.max(0, m.index - 28), m.index).replace(/\s+/g, " ").trimStart()} ${w}.`.trim());
  }
  return out;
}

/** "Hi omjee,": a greeting followed by a lower-case name. Returns the greeting words, or null. */
export function lowerGreeting(body: string): string | null {
  const m = body.match(/^\s*(Hi|Hello|Hey|Dear)\s+([a-z][A-Za-z'-]*)/);
  return m && !GREETING_OK.has(m[2].toLowerCase()) ? `${m[1]} ${m[2]}` : null;
}

// --------------------------------------------------------------------- words

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const pct = (a: number, b: number) => (b ? `${Math.round((100 * a) / b)}%` : "0%");
const LEVEL_WORDS: Record<string, string> = { far_above: "far above", far_below: "far below", stretch: "a stretch", fits: "fits", unknown: "unknown" };

const WA_CODES: Record<string, string> = { "131049": "Meta marketing cap", "131047": "outside the 24 hour window", "131026": "number not on WhatsApp" };

export interface Built {
  what: string;
  evidence: string[];
}

export interface BuildCtx {
  now: number;
  /** job id to "Title at Company", for the weak picks */
  jobs?: Map<string, string>;
}

const num = (x: unknown): number => Number(x) || 0;

/** The plain words and the numbers for one row of a check. null: the row on second look is not a flag. */
export function buildFlag(type: string, r: any, ctx: BuildCtx): Built | null {
  switch (type) {
    case "LEVEL_MISMATCH": {
      const m = levelMismatch({ experience: r.exp, graduationYear: r.gy, seniority: r.sen, now: ctx.now });
      if (!m) return null;
      const sen = Array.isArray(r.sen) && r.sen.length ? r.sen.join(", ") : "none picked";
      return m.basis === "dated"
        ? { what: "Onboarded as entry level only, but has years of full-time work", evidence: [`${m.months} months of full-time work`, `${plural(m.jobs, "job")} on the resume`, `seniority asked: ${sen}`] }
        : { what: "Onboarded as entry level only, but every job on the resume is undated and they graduated years ago", evidence: [`${plural(m.jobs, "undated job")}`, `graduated ${m.gradYear}`, `seniority asked: ${sen}`] };
    }
    case "TOO_SENIOR_FLOOD":
      return { what: "Most of the jobs judged for them are far above their level", evidence: [`${num(r.a)} of ${num(r.n)} verdicts far above (${pct(num(r.a), num(r.n))})`] };
    case "THIN_PICKS":
      return { what: `Picks for ${r.day} are thin`, evidence: [`${plural(num(r.n), "job")} (needs 5)`] };
    case "REPEATED_PICKS":
      return { what: `Picks for ${r.day} repeat jobs from an earlier day`, evidence: [`${num(r.rep)} of ${plural(num(r.n), "job")} seen before`] };
    case "WEAK_PICK": {
      const sample = (Array.isArray(r.sample) ? r.sample : []).slice(0, 3).map((s: any) => {
        const name = ctx.jobs?.get(String(s.job)) || `job ${s.job}`;
        return `${name}: fit ${s.fit ?? "?"}, ${LEVEL_WORDS[String(s.level)] ?? s.level}`;
      });
      return { what: `Picks for ${r.day} include jobs that fit poorly`, evidence: [`${num(r.weak)} of ${num(r.judged)} judged picks are weak`, ...sample] };
    }
    case "CALL_NOT_CONFIRMED":
      return { what: "The call was analysed but they never confirmed the review", evidence: [`ready for ${fmtMins(num(r.mins))}`, `call ${String(r.id).slice(0, 12)}`] };
    case "ONBOARDED_NO_DESK":
      return { what: "Onboarded but never opened the desk", evidence: [`onboarded ${fmtMins(num(r.mins))} ago`, "no desk or job activity within 30 minutes"] };
    case "MIC_BLOCKED_LEFT":
      return { what: "Blocked the mic and left", evidence: [`mic denied ${fmtMins(num(r.mins))} ago`, "no call started or onboarding within an hour"] };
    case "CALL_DROPPED":
      return { what: "A call failed and they never completed another", evidence: [`${r.src === "call" ? "call status failed" : `call_failed: ${r.reason || "no reason sent"}`}`, `${fmtMins(num(r.mins))} ago`] };
    case "VERIFIED_NO_CALL":
      return { what: "Verified their phone and never started a call", evidence: [`verified ${fmtMins(num(r.mins))} ago`] };
    case "EMAIL_CLIPPED": {
      const ends = [...clippedEnds(String(r.body || "")), ...clippedEnds(String(r.subject || ""))];
      const greet = lowerGreeting(String(r.body || ""));
      if (!ends.length && !greet) return null;
      return {
        what: ends.length ? "An email goes out ending on a cut word" : "An email greets a lower-case name",
        evidence: [...(ends.length ? [`ends: "${ends[0]}"`] : []), ...(greet ? [`greeting: "${greet}"`] : []), `email ${String(r.id).slice(0, 12)}`],
      };
    }
    case "FIND_MISSES":
      return { what: "Most of their email finds found no verified email", evidence: [`${num(r.refunds)} of ${plural(num(r.finds), "find")} refunded (${pct(num(r.refunds), num(r.finds))})`] };
    case "SEND_NO_INBOX":
      return { what: "Tapped Send and was told to connect an inbox", evidence: [`${plural(num(r.n), "time")} in the range`] };
    case "WA_BLOCKED": {
      const codes = (Array.isArray(r.codes) ? r.codes : []).map((c: any) => `${c.code || "no code"}${WA_CODES[String(c.code)] ? ` (${WA_CODES[String(c.code)]})` : ""} x${c.n}`);
      return { what: "WhatsApp messages to them failed to send", evidence: [`${plural(num(r.n), "message")} failed`, ...codes] };
    }
    case "WA_UNANSWERED":
      return { what: "Wrote on WhatsApp and got no reply", evidence: [`${plural(num(r.n), "message")} unanswered after 2 minutes`, `latest ${fmtMins(num(r.mins))} ago`] };
    case "CHECKOUT_ABANDONED":
      return { what: r.kind === "autopay" ? "Started autopay and never finished" : "Started a checkout and never paid", evidence: [`${r.item || "order"}`, `${money(r.amount_paise, r.currency)}`, r.later_paid ? "paid another order later" : "no later payment"] };
    case "PAID_NOT_GRANTED":
      return { what: "Paid, but no credits or plan were granted", evidence: [`order ${r.id}`, `${r.item || "order"}`, `${money(r.amount_paise, r.currency)}`, `paid ${fmtMins(num(r.mins))} ago`] };
    case "OPEN_TICKET":
      return { what: `Support ticket still open${r.category ? `: ${String(r.category).replace(/_/g, " ")}` : ""}`, evidence: [`ticket ${r.id}`, `${r.priority || "normal"} priority`, `opened ${fmtMins(num(r.mins))} ago`] };
    default:
      return null;
  }
}

export function fmtMins(m: number): string {
  if (m < 90) return `${Math.max(1, Math.round(m))} min`;
  if (m < 48 * 60) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} days`;
}

function money(paise: unknown, currency: unknown): string {
  const v = Number(paise);
  if (!Number.isFinite(v)) return "amount not saved";
  const cur = String(currency || "INR").toUpperCase();
  return cur === "INR" ? `Rs ${(v / 100).toLocaleString("en-IN", { maximumFractionDigits: 0 })}` : `${(v / 100).toFixed(2)} ${cur}`;
}

// -------------------------------------------------------------------- counts

const SEV_RANK: Record<FlagSeverity, number> = { high: 0, med: 1, low: 2 };

/** Flags in the order the page shows them: newest first. */
export const newestFirst = (flags: Flag[]): Flag[] => [...flags].sort((a, b) => b.at - a.at || SEV_RANK[a.severity] - SEV_RANK[b.severity]);

/** The summary row: every type with its count and number of students (zero when none), in the order of FLAG_TYPES. */
export function flagCounts(flags: Flag[]): { type: FlagType; n: number; people: number }[] {
  return FLAG_TYPES.map((type) => {
    const mine = flags.filter((f) => f.type === type.key);
    return { type, n: mine.length, people: new Set(mine.map((f) => f.user ?? f.email)).size };
  });
}

export const bySeverity = (flags: Flag[]): Record<FlagSeverity, number> => ({
  high: flags.filter((f) => f.severity === "high").length,
  med: flags.filter((f) => f.severity === "med").length,
  low: flags.filter((f) => f.severity === "low").length,
});
