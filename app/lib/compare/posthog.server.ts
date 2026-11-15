// OLD-VS-NEW (15 Nov 2026): PostHog reads for /compare, server side with the admin's personal key (never sent to the
// browser, as api.posthog.tsx). Visitors are people (person_id, so an anonymous visit and the signed-in one merge) with a
// $pageview on the studojo.com student hosts (not admin., app., dashboard. or an IP), counted per IST day. PostHog runs
// on studojo.com before and after the relaunch, so the same count stands on both sides. The old /old/daily counted
// distinct_id on every host by UTC day; this corrects both.
import type { Win } from "./model";

const API_KEY = process.env.POSTHOG_PERSONAL_API_KEY ?? "";
const PROJECT_ID = process.env.POSTHOG_PROJECT_ID ?? "150589";
const BASE = `https://eu.posthog.com/api/projects/${PROJECT_ID}`;

export const STUDENT_HOSTS = ["studojo.com", "www.studojo.com", "platform.studojo.com"] as const;
const HOSTS = `properties.$host IN (${STUDENT_HOSTS.map((h) => `'${h}'`).join(", ")})`;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
/** PostHog started on studojo.com on 31 Mar 2026; nothing before it is read. */
export const POSTHOG_FROM = "2026-03-01";

export const posthogConfigured = (): boolean => Boolean(API_KEY);

/** The UTC instant an IST day starts, as PostHog's toDateTime reads it (the project's time zone is UTC). */
export function istStartUtc(day: string): string {
  if (!DAY_RE.test(day)) throw new Error(`bad day ${day}`);
  return new Date(Date.parse(`${day}T00:00:00+05:30`)).toISOString().slice(0, 19).replace("T", " ");
}
const nextDay = (day: string) => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
};

export async function hogql(query: string, timeoutMs = 60_000): Promise<any[][]> {
  if (!API_KEY) throw new Error("PostHog API key not configured");
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/query/`, {
      method: "POST",
      headers: { Authorization: `Bearer ${API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
      signal: ctl.signal,
    });
    const body: any = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`PostHog ${res.status}: ${String(body?.detail || body?.error || "").slice(0, 160)}`);
    return Array.isArray(body?.results) ? body.results : [];
  } finally {
    clearTimeout(timer);
  }
}

/** Visitors (people with a $pageview on the student hosts) per IST day, from `start` to `end`. */
export async function visitorsPerDay(start: string, end: string): Promise<Record<string, number>> {
  const rows = await hogql(`
    SELECT toString(toDate(toTimeZone(timestamp, 'Asia/Kolkata'))) AS d, count(DISTINCT person_id) AS v
      FROM events
     WHERE event = '$pageview' AND ${HOSTS}
       AND timestamp >= toDateTime('${istStartUtc(start)}') AND timestamp < toDateTime('${istStartUtc(nextDay(end))}')
     GROUP BY d ORDER BY d LIMIT 2000`);
  const out: Record<string, number> = {};
  for (const [d, v] of rows) if (DAY_RE.test(String(d))) out[String(d)] = Number(v) || 0;
  return out;
}

/** Distinct visitors in each window, in one query: winKey -> people. */
export async function visitorsPerWindow(wins: Win[]): Promise<Record<string, number>> {
  const list = wins.filter((w) => DAY_RE.test(w.start) && DAY_RE.test(w.end) && w.start <= w.end).slice(0, 40);
  if (!list.length) return {};
  const first = list.reduce((a, w) => (w.start < a ? w.start : a), list[0].start);
  const last = list.reduce((a, w) => (w.end > a ? w.end : a), list[0].end);
  const cols = list.map((w, i) => `uniqExactIf(person_id, timestamp >= toDateTime('${istStartUtc(w.start)}') AND timestamp < toDateTime('${istStartUtc(nextDay(w.end))}')) AS w${i}`);
  const rows = await hogql(`
    SELECT ${cols.join(", ")}
      FROM events
     WHERE event = '$pageview' AND ${HOSTS}
       AND timestamp >= toDateTime('${istStartUtc(first)}') AND timestamp < toDateTime('${istStartUtc(nextDay(last))}')`);
  const out: Record<string, number> = {};
  list.forEach((w, i) => {
    out[`${w.start}|${w.end}`] = Number(rows[0]?.[i]) || 0;
  });
  return out;
}

/**
 * The IST days each signed-in person browsed the student site before `beforeDay`: [user id, day]. After sign-in,
 * posthog-js sends the account id (32 characters, the BetterAuth user id) as distinct_id; an anonymous id is a UUID.
 * Read a month at a time (a personal key may not page with OFFSET; a month is well under the 10,000 row cap: May 2026, the biggest, had 4,115).
 */
export async function signedInDays(beforeDay: string): Promise<[string, string][]> {
  const months: [string, string][] = [];
  for (let m = POSTHOG_FROM.slice(0, 7); `${m}-01` < beforeDay; ) {
    const [y, mo] = m.split("-").map(Number);
    const next = new Date(Date.UTC(y, mo, 1)).toISOString().slice(0, 7);
    months.push([`${m}-01`, `${next}-01` < beforeDay ? `${next}-01` : beforeDay]);
    m = next;
  }
  const parts = await Promise.all(months.map(async ([a, b]) => {
    const rows = await hogql(`
      SELECT distinct_id, toString(toDate(toTimeZone(timestamp, 'Asia/Kolkata'))) AS d
        FROM events
       WHERE length(distinct_id) = 32 AND ${HOSTS}
         AND timestamp >= toDateTime('${istStartUtc(a)}') AND timestamp < toDateTime('${istStartUtc(b)}')
       GROUP BY distinct_id, d LIMIT 10000`, 90_000);
    if (rows.length >= 10_000) throw new Error(`PostHog: 10,000 or more signed-in days in ${a.slice(0, 7)}`);
    return rows.filter(([id, d]) => typeof id === "string" && DAY_RE.test(String(d))).map(([id, d]) => [String(id), String(d)] as [string, string]);
  }));
  return parts.flat();
}
