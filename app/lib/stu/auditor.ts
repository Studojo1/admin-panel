// Stu Auditor (owner, 4 Nov 2026: "whenever Stu is failing, for example Stu broke
// while making someone's resume, we should be able to diagnose it in our daily
// checks"): every failure the product's own tables record, one row each, with the
// person and a plain-words reason. This file is the pure part (the words, the
// groups, the counts), shared by the server (auditor.server.ts) and the page
// (routes/stu-auditor.tsx). Nothing here reads or writes the database. No
// imports, so the tests load it straight from the source (as model.ts).

/** IST calendar day of epoch ms (as model.ts istDay). */
const istDay = (ms: number): string => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);
/** day + n days (as model.ts addDays). */
const addDays = (day: string, n: number): string => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** sources: the reads in auditor.server.ts behind each group (a missing one shows the group as not checked). */
export const AUDIT_GROUPS = [
  { key: "call", label: "Calls that never started", sub: "career_journey_events call_failed (the browser's reason)", sources: ["Call failures"] },
  { key: "call_end", label: "Calls that ended unfinished", sub: "career_voice_calls with an error, or failed", sources: ["Calls and resume builds"] },
  { key: "resume", label: "Resume builds", sub: "build calls that failed or made no resume (career_resume_builds)", sources: ["Calls and resume builds"] },
  { key: "chat", label: "Stu chat and tools", sub: "career_runs errors, tool answers that start with Error:", sources: ["Stu replies", "Stu tools"] },
  { key: "email", label: "Emails and mailboxes", sub: "career_emails failed, bounces, mailboxes that stopped", sources: ["Email sends", "Bounces", "Mailboxes"] },
  { key: "pay", label: "Payments", sub: "career_credit_orders failed or never paid, autopay pending or halted", sources: ["Payments", "Autopay"] },
  { key: "ticket", label: "Bug tickets", sub: "tickets in the bug categories (bug, website_broken)", sources: ["Bug tickets"] },
  { key: "whatsapp", label: "WhatsApp", sub: "sends that failed or were held, turns Stu refused, link codes refused", sources: ["WhatsApp"] },
] as const;
export type AuditGroup = (typeof AUDIT_GROUPS)[number]["key"];

export interface AuditRow {
  /** kind:source id, unique */
  id: string;
  group: AuditGroup;
  /** what failed, as a short code (call_failed, run_error, tool_error, email_failed, bounce, ...) */
  kind: string;
  /** the raw reason code the counts group by (mic_denied, unfinished, wrong_password, 131047, ...) */
  code: string;
  /** epoch ms */
  at: number;
  /** public."user".id, or null when the row names nobody (a visitor, a number not linked) */
  user: string | null;
  email: string;
  name: string;
  /** why the person is internal (staff, studojo.com, test account, guest, test row), or null */
  internal: string | null;
  /** the plain-words line */
  reason: string;
  /** fail: something broke; warn: worth a look, may be the student's own doing */
  level: "fail" | "warn";
  /** the drill-down: label, value */
  detail: [string, string][];
  /** a page for this one row (a ticket) */
  href?: string;
}

export interface AuditReport {
  generatedAt: string;
  /** staging or production, from the database read */
  env: string;
  start: string;
  end: string;
  /** yesterday 00:00 IST, epoch ms: the top line counts from here */
  sinceFrom: number;
  rows: AuditRow[];
  /** sources this database lacks (shown as not checked) */
  missing: string[];
  /** sources that hit their row cap (the counts there are a floor) */
  capped: string[];
}

export const ROW_CAP = 2000;

// --------------------------------------------------------------------- words

const CALL_FAILED: Record<string, string> = {
  mic_denied: "Mic blocked: the browser or the student said no to the microphone",
  no_mic: "No microphone found on the device",
  no_network: "No network: the call could not connect",
  error: "The call hit an error before it started",
  dropped: "The connection dropped during the call",
  finish_failed: "The call ended, but saving it failed",
};
export const callFailedWords = (code: string): string => CALL_FAILED[code] ?? `Call failed (${code || "no reason sent"})`;

const CALL_END: Record<string, string> = {
  unfinished: "Ended before the call was finished: hung up, closed the tab or lost the line",
  no_resume: "Ended with no resume read",
  no_answers: "Ended with no answers from the student",
};
export function callEndWords(status: string, error: string | null): string {
  if (error && CALL_END[error]) return CALL_END[error];
  if (error) return `Ended with an error: ${error}`;
  if (status === "failed") return "The call failed to start";
  return `Ended as ${status}`;
}

/** A resume build call: what went wrong, or null when it made a resume or is still on. */
export function buildWords(c: { status: string; error: string | null; duration_s: number | null; produced: boolean; ageMs: number }): string | null {
  const live = c.status === "created" || c.status === "live";
  if (live && c.ageMs < 2 * 3_600_000) return null;
  const len = c.duration_s != null ? ` after ${fmtSecs(c.duration_s)}` : "";
  if (c.status === "failed") return `The resume build call failed to start${c.error ? ` (${c.error})` : ""}`;
  if (live) return "The resume build call never closed (still marked live hours later), no resume made";
  if (c.error === "unfinished") return `The resume build call ended unfinished${len}, no resume made`;
  if (c.error) return `The resume build call ended with an error: ${c.error}${len}`;
  if (!c.produced) return `The resume build call ended${len} but no resume was saved`;
  return null;
}

export function fmtSecs(s: number): string {
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m} min ${r} s` : `${m} min`;
}

/** A tool answer that starts with "Error:": our side broke (fail), or Stu called the tool wrong (warn). */
export function toolWords(tool: string, content: string): { reason: string; level: "fail" | "warn"; code: string } {
  const msg = content.replace(/^Error:\s*/, "").replace(/\s*(Fix the arguments and try again|Tell the student plainly and suggest trying again)\.?\s*$/i, "").replace(/[.\s]+$/, "");
  const name = tool || "a tool";
  if (/on our side|took too long|could not be read|went wrong|timed out|unavailable/i.test(msg)) {
    return { reason: `${name} failed on our side: ${msg}`, level: "fail", code: `${name}: ours` };
  }
  return { reason: `Stu used ${name} wrong: ${msg}`, level: "warn", code: `${name}: arguments` };
}

export function runWords(status: string, error: string | null): string {
  if (status === "running") return "Stu's reply never finished: still running minutes later";
  if (!error || /stopped without finishing/i.test(error)) return "Stu's reply stopped without finishing";
  return `Stu's reply failed: ${error}`;
}

/** career-agent app/lib/mail/smtp.server.ts MailErrorCode, in our words. */
const MAIL: Record<string, string> = {
  wrong_password: "The mailbox refused the app password",
  needs_app_password: "Gmail wants an app password, not the sign-in password",
  provider_blocked: "The provider does not allow app passwords for this account",
  unreachable: "Could not reach the mail server; nothing was sent",
  bad_recipient: "The provider refused the recipient's address",
  provider_limit: "The provider's sending limit; nothing was sent",
  rejected: "The provider refused the email (policy or spam filter)",
  unknown: "Not sure it went: the connection ended after the hand-over",
  send_failed: "The provider did not take the email; nothing was sent",
  not_live: "Held: real sends are not switched on for this person",
};
export const mailWords = (code: string | null): string => (code && MAIL[code]) || `The email did not send (${code || "no reason saved"})`;

/** "pack:100" -> "100 email pack" */
export function itemWords(item: string | null): string {
  const m = /^pack:(\d+)$/.exec(item || "");
  if (m) return `${m[1]} email pack`;
  if (!item) return "an order";
  return item.replace(/[:_]/g, " ");
}
export const inr = (paise: number | null): string => (paise == null ? "" : `₹${Math.round(paise / 100).toLocaleString("en-IN")}`);

export function orderWords(o: { status: string; item: string | null; amount_paise: number | null; failed_reason: string | null }): string {
  const what = `${itemWords(o.item)}${o.amount_paise ? ` (${inr(o.amount_paise)})` : ""}`;
  if (o.status === "failed") return `Payment failed for ${what}: ${o.failed_reason || "no reason given"}`;
  if (o.status === "mismatch") return `Paid for ${what}, but the amount did not match the order`;
  return `Opened checkout for ${what}, never paid`;
}

export function autopayWords(status: string, period: string | null): string {
  const what = period ? `the ${period}ly autopay` : "autopay";
  if (status === "pending") return `A renewal charge on ${what} failed; Razorpay is retrying`;
  if (status === "halted") return `${what[0].toUpperCase()}${what.slice(1)} halted: renewals stopped after failed charges`;
  return `Started ${what}, never authorised`;
}

/** Meta's WhatsApp error codes we have seen or expect, in our words. */
const META: Record<string, string> = {
  "131047": "More than 24 hours since they last wrote (needs a template)",
  "470": "More than 24 hours since they last wrote (needs a template)",
  "131048": "Meta's spam limit on our number",
  "131049": "Meta held it back: this person's marketing message limit",
  "131026": "Could not be delivered: not on WhatsApp, or an old app",
  "131050": "They stopped marketing messages from us",
  "130472": "Meta's experiment group held it back",
  "131051": "Message type not supported",
  "131053": "The media could not be uploaded",
  "131000": "Something went wrong at Meta",
  "131031": "Our business account is locked",
  "368": "Our account is blocked for a policy breach (temporary)",
};
export function waWords(r: { direction: string; status: string; error_code: string | null; error: string | null; refused: string | null; link: string | null }): { reason: string; level: "fail" | "warn"; code: string; kind: string } {
  if (r.direction === "in") {
    const link = r.link || "unknown";
    const words: Record<string, string> = {
      limit: "Link code refused: too many wrong codes from this number today",
      expired: "Link code refused: it had expired",
      used: "Link code refused: it was already used",
      wrong_address: "Link code refused: sent from a different number",
      invalid: "Link code refused: not a right code",
      taken: "Link refused: this number is linked to another account",
      verified: "Phone verified, but WhatsApp not linked (updates off for them, or no seat)",
    };
    return { reason: words[link] ?? `Link refused (${link})`, level: link === "verified" ? "warn" : "fail", code: `link: ${link}`, kind: "wa_link" };
  }
  if (r.refused) return { reason: `Stu could not answer on WhatsApp (${r.refused})`, level: "fail", code: `refused: ${r.refused}`, kind: "wa_refused" };
  if (r.status === "held") return { reason: "Held: WhatsApp's 24-hour window was closed; it goes when they next write", level: "warn", code: "held", kind: "wa_held" };
  if (r.error === "paused") return { reason: "Not sent: our hour-long pause after a spam flag", level: "fail", code: "paused", kind: "wa_failed" };
  const code = r.error_code || r.error || "unknown";
  const words = (r.error_code && META[r.error_code]) || r.error || "no reason given";
  return { reason: `WhatsApp did not deliver: ${words}`, level: "fail", code, kind: "wa_failed" };
}

/** …1234: the last four digits of a number, never the whole of it. */
export const maskNumber = (address: string | null): string => (address ? `…${address.replace(/\D/g, "").slice(-4)}` : "");

export function ticketWords(category: string, summary: string | null, first: string | null): string {
  const what = (summary || first || "").replace(/\s+/g, " ").trim().slice(0, 140);
  const cat = category === "website_broken" ? "Website broken" : "Something is broken";
  return what ? `${cat}: ${what}` : cat;
}

// -------------------------------------------------------------------- counts

/** The IST window the server reads: the range, and yesterday and today for the top line. */
export function auditWindow(start: string, end: string, today: string): { from: string; to: string; sinceFrom: number } {
  const yesterday = addDays(today, -1);
  const fromDay = start < yesterday ? start : yesterday;
  const toDay = addDays(end > today ? end : today, 1);
  return { from: `${fromDay}T00:00:00+05:30`, to: `${toDay}T00:00:00+05:30`, sinceFrom: Date.parse(`${yesterday}T00:00:00+05:30`) };
}

export const inRange = (r: AuditRow, start: string, end: string): boolean => {
  const d = istDay(r.at);
  return d >= start && d <= end;
};

export interface Tally {
  n: number;
  people: number;
  fail: number;
}
export function tally(rows: AuditRow[]): Tally {
  const people = new Set(rows.map((r) => r.user ?? `row:${r.id}`));
  return { n: rows.length, people: people.size, fail: rows.filter((r) => r.level === "fail").length };
}

export function byGroup(rows: AuditRow[]): Record<AuditGroup, AuditRow[]> {
  const out = Object.fromEntries(AUDIT_GROUPS.map((g) => [g.key, [] as AuditRow[]])) as unknown as Record<AuditGroup, AuditRow[]>;
  for (const r of rows) out[r.group].push(r);
  return out;
}

/** Counts by reason within a group (or all): the reason line, how many, how many people. Biggest first. */
export function byReason(rows: AuditRow[]): { group: AuditGroup; code: string; reason: string; level: "fail" | "warn"; rows: AuditRow[]; people: number }[] {
  const m = new Map<string, AuditRow[]>();
  for (const r of rows) {
    const k = `${r.group}|${r.code}`;
    m.set(k, [...(m.get(k) ?? []), r]);
  }
  return [...m.values()]
    .map((rs) => ({ group: rs[0].group, code: rs[0].code, reason: rs[0].reason, level: rs.some((r) => r.level === "fail") ? ("fail" as const) : ("warn" as const), rows: rs, people: tally(rs).people }))
    .sort((a, b) => b.rows.length - a.rows.length || a.reason.localeCompare(b.reason));
}

/** The top line: since yesterday 00:00 IST, today and yesterday apart. */
export function sinceYesterday(rows: AuditRow[], sinceFrom: number) {
  const since = rows.filter((r) => r.at >= sinceFrom);
  const todayFrom = sinceFrom + 86_400_000;
  return {
    all: tally(since),
    today: tally(since.filter((r) => r.at >= todayFrom)),
    yesterday: tally(since.filter((r) => r.at < todayFrom)),
    groups: AUDIT_GROUPS.map((g) => ({ key: g.key, label: g.label, ...tally(since.filter((r) => r.group === g.key)) })).filter((g) => g.n > 0),
  };
}
