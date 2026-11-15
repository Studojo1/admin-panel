// OLD-VS-NEW (15 Nov 2026): the old student product (studojo.com, retired 2 Nov 2026 03:55 IST) in the shape
// /compare compares (app/lib/compare/model.ts SideData). Read only, from this environment's Postgres, and PostHog for
// visitors. The old data no longer changes, so a read is kept for 12 hours (the page's Refresh reads again).
//
// Who counts: every public."user" account made before 3 Nov 2026 00:00 IST (the Stu count start), less
// - the team: role admin or ops, @studojo.com, the test accounts (OUTREACH_BUY_TEST_USERS and the known list), guests,
//   @example.com and studojo.test addresses (internalReason, the rule of every Stu page, plus the old /sources rule);
// - B2B accounts: the same email in bob_users (Sensei, Bob), b2b_partner_accounts, phone_partner_accounts,
//   company_users or mcp_key_org, or an api_keys or bob_credits row.
// Money: payment_orders paid, completed, refunding or refunded, above zero, less refunds, not at the test-mode prices
// (₹90 and $1, job-outreach-svc core/pricing.py TEST_PLANS), as /old/journeys counts it; plus the Assignment dojo's
// cp.payments (completed, paise). payment_made_at is never money (it is set for coupon and credit orders too).
import { sql } from "drizzle-orm";
import db from "~/lib/db.server";
import { swrCache } from "~/lib/swr-cache";
import { channelOfTouch, internalReason, testUsers } from "~/lib/stu/data.server";
import { type ActiveRow, type MailRow, type OldMoney, type OldOther, type PayRow, type ReachRow, type ReplyRow, type SidePerson, OLD_OFF_DAY, RELAUNCH_DAY, USD_INR } from "./model";
import { POSTHOG_FROM, signedInDays, visitorsPerDay } from "./posthog.server";

/** 3 Nov 2026 00:00 IST as the old tables store time (UTC, no time zone). */
const BEFORE = "2026-11-02 18:30:00";
const BEFORE_TZ = "2026-11-02T18:30:00Z";
/** epoch ms of a UTC timestamp without time zone */
const ms = (x: string) => `(extract(epoch from ((${x}) AT TIME ZONE 'UTC')) * 1000)::float8`;
/** IST day of a UTC timestamp without time zone */
const day = (x: string) => `to_char(((${x}) AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
/** IST day of a timestamptz */
const dayTz = (x: string) => `to_char((${x}) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;

/** Test-mode prices: no money moved. */
const TEST_PRICES = new Set(["INR:9000", "USD:100"]);

export interface OldDb {
  generatedAt: string;
  env: string;
  /** false: this database has no old product tables */
  present: boolean;
  from: string;
  to: string;
  people: SidePerson[];
  /** user id -> person index, for PostHog's signed-in days */
  ids: Record<string, number>;
  pays: PayRow[];
  mail: MailRow[];
  reach: ReachRow[];
  replies: ReplyRow[];
  active: ActiveRow[];
  excluded: Record<string, number>;
  accounts: number;
  money: OldMoney;
  other: OldOther;
}

export interface OldPosthog {
  generatedAt: string;
  /** visitors per IST day, PostHog from 31 Mar 2026 */
  visitors: Record<string, number>;
  /** [user id, IST day] signed-in browsing */
  signedIn: [string, string][];
}

type Q = (text: string) => Promise<any[]>;

async function readOnly<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '40s'`);
      return fn(async (text) => (await tx.execute(sql.raw(text))).rows as any[]);
    },
    { accessMode: "read only" },
  );
}

const B2B_BY_EMAIL = ["bob_users", "b2b_partner_accounts", "phone_partner_accounts", "company_users", "mcp_key_org"];
const B2B_BY_ID = ["api_keys", "bob_credits"];
const OTHER_TABLES = ["outreach_orders", "candidates", "payment_orders", "emails_sent", "campaigns", "session", "user_attribution", "rsb_sessions", "tool_used",
  "internship_applications", "resumes", "dissertation_submissions", ...B2B_BY_EMAIL, ...B2B_BY_ID];

async function load(q: Q): Promise<OldDb> {
  const reg = await q(`SELECT c.relname AS t FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
                        WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p', 'v') AND c.relname = ANY(ARRAY[${OTHER_TABLES.map((t) => `'${t}'`).join(",")}]::text[])
                          AND has_table_privilege(c.oid, 'SELECT')`);
  const has = new Set(reg.map((r) => String(r.t)));
  const cp = (await q(`SELECT to_regclass('cp.payments') IS NOT NULL AS p, current_database() AS db`))[0] ?? {};
  const env = /staging/i.test(String(cp.db ?? "")) ? "staging" : "production";

  // ---------------------------------------------------------------- people
  const b2b = [
    ...B2B_BY_EMAIL.filter((t) => has.has(t)).map((t) => `EXISTS (SELECT 1 FROM public.${t} b WHERE lower(b.email) = lower(u.email))`),
    ...B2B_BY_ID.filter((t) => has.has(t)).map((t) => `EXISTS (SELECT 1 FROM public.${t} b WHERE b.user_id = u.id)`),
  ];
  const users = await q(`
    SELECT u.id, lower(coalesce(u.email, '')) AS email, u.role, ${ms("u.created_at")} AS su, ${b2b.length ? b2b.join(" OR ") : "false"} AS b2b
      FROM public."user" u WHERE u.created_at < '${BEFORE}' ORDER BY u.created_at`);
  const tests = testUsers();
  const excluded: Record<string, number> = {};
  const people: SidePerson[] = [];
  const ids: Record<string, number> = {};
  for (const r of users) {
    const email = String(r.email || "");
    const why = internalReason({ id: String(r.id), email, role: r.role ?? null }, tests)
      ?? (email.endsWith("@example.com") || email.includes("studojo.test") ? "test address" : r.b2b ? "B2B account" : null);
    if (why) {
      const k = why.startsWith("staff") ? "staff" : why;
      excluded[k] = (excluded[k] ?? 0) + 1;
      continue;
    }
    ids[String(r.id)] = people.length;
    people.push({ su: Number(r.su), ch: "not_captured", t: {} });
  }
  const P = (id: unknown) => (typeof id === "string" ? ids[id] ?? -1 : -1);
  const step = (i: number, key: string, at: unknown) => {
    if (i < 0 || at == null) return;
    const t = Number(at);
    if (!Number.isFinite(t)) return;
    const p = people[i];
    if (p.t[key] == null || t < p.t[key]) p.t[key] = t;
  };

  // ---------------------------------------------------------------- steps
  if (has.has("outreach_orders")) {
    const cols: [string, string][] = [["resume", "resume_uploaded_at"], ["quiz_started", "quiz_started_at"], ["quiz_done", "quiz_completed_at"], ["leads", "leads_generated_at"],
      ["leads_viewed", "leads_viewed_at"], ["pricing", "payment_page_reached_at"], ["gmail", "gmail_connected_at"], ["launched", "campaign_launched_at"]];
    const rows = await q(`
      SELECT user_id, ${cols.map(([k, c]) => `${ms(`min(${c}) FILTER (WHERE ${c} < '${BEFORE}')`)} AS ${k}`).join(", ")}
        FROM public.outreach_orders WHERE user_id IS NOT NULL GROUP BY 1`);
    for (const r of rows) for (const [k] of cols) step(P(r.user_id), k, r[k]);
  }
  if (has.has("candidates")) {
    for (const r of await q(`SELECT user_id, ${ms("min(created_at)")} AS at FROM public.candidates WHERE user_id IS NOT NULL AND created_at < '${BEFORE}' GROUP BY 1`)) step(P(r.user_id), "resume", r.at);
  }

  // ---------------------------------------------------------------- money
  const pays: PayRow[] = [];
  const money: OldMoney = { testPrice: 0, team: 0, zero: 0 };
  if (has.has("payment_orders")) {
    for (const r of await q(`
      SELECT user_id, ${ms("created_at")} AS at, ${day("created_at")} AS d, upper(coalesce(currency, 'INR')) AS cur, amount_cents AS amt,
             CASE WHEN status IN ('refunding', 'refunded') THEN amount_cents ELSE coalesce(refunded_cents, 0) END AS refunded
        FROM public.payment_orders
       WHERE status IN ('paid', 'completed', 'refunding', 'refunded') AND amount_cents > 0 AND created_at < '${BEFORE}'`)) {
      const amt = Number(r.amt) || 0;
      if (TEST_PRICES.has(`${r.cur}:${amt}`)) {
        money.testPrice++;
        continue;
      }
      const i = P(r.user_id);
      if (i < 0) {
        money.team++;
        continue;
      }
      const kept = amt - (Number(r.refunded) || 0);
      if (kept <= 0) {
        money.zero++;
        continue;
      }
      const usd = r.cur === "USD" ? kept : 0;
      pays.push([i, String(r.d), 1, r.cur === "USD" ? kept * USD_INR : kept, usd]);
      step(i, "paid", r.at);
    }
  }
  let assignment: OldOther["assignment"] = null;
  if (cp.p) {
    assignment = { payments: 0, team: 0, paise: 0 };
    for (const r of await q(`
      SELECT user_id, (extract(epoch from created_at) * 1000)::float8 AS at, ${dayTz("created_at")} AS d, amount, upper(coalesce(currency, 'INR')) AS cur
        FROM cp.payments WHERE status = 'completed' AND amount > 0 AND created_at < '${BEFORE_TZ}'`)) {
      const i = P(r.user_id);
      if (i < 0 || r.cur !== "INR") {
        assignment.team++;
        continue;
      }
      assignment.payments++;
      assignment.paise += Number(r.amount) || 0;
      pays.push([i, String(r.d), 1, Number(r.amount) || 0, 0]);
      step(i, "paid", r.at);
    }
  }

  // ---------------------------------------------------------------- emails
  const mail: MailRow[] = [];
  const reachMap = new Map<string, number>();
  const replyMap = new Map<string, [number, number]>();
  if (has.has("emails_sent") && has.has("campaigns") && has.has("candidates")) {
    const from = `public.emails_sent e JOIN public.campaigns k ON k.id = e.campaign_id JOIN public.candidates c ON c.id = k.candidate_id
                  WHERE e.sent_at IS NOT NULL AND e.is_test = false AND e.sent_at < '${BEFORE}'`;
    // Opens were tracked (a pixel per email, tracking_token) only from 7 Jul 2026: earlier days show as not tracked.
    const openFrom = String((await q(`SELECT ${day("min(sent_at)")} AS d FROM public.emails_sent WHERE tracking_token IS NOT NULL`))[0]?.d ?? "9999-12-31");
    for (const r of await q(`
      SELECT c.user_id, ${day("e.sent_at")} AS d, count(*)::int AS n, count(*) FILTER (WHERE e.first_opened_at IS NOT NULL)::int AS opened,
             count(*) FILTER (WHERE e.status = 'bounced')::int AS bounced
        FROM ${from} GROUP BY 1, 2`)) {
      const i = P(r.user_id);
      if (i >= 0) mail.push([i, String(r.d), Number(r.n), String(r.d) >= openFrom ? Number(r.opened) : -1, Number(r.bounced)]);
    }
    // One row a lead: the day of its first (not follow-up) email, its first reply (before the switch-off) and whether
    // that reply was positive. A row with no lead stands alone.
    for (const r of await q(`
      SELECT c.user_id,
             ${day("min(e.sent_at) FILTER (WHERE coalesce(e.followup_number, 0) = 0)")} AS reach_d,
             ${day(`min(e.reply_received_at) FILTER (WHERE e.reply_received_at < '${BEFORE}')`)} AS reply_d,
             ${ms(`min(e.reply_received_at) FILTER (WHERE e.reply_received_at < '${BEFORE}')`)} AS reply_at,
             (array_agg(e.reply_sentiment ORDER BY e.reply_received_at) FILTER (WHERE e.reply_received_at < '${BEFORE}'))[1] AS sentiment,
             ${ms("min(e.sent_at)")} AS first_at
        FROM ${from} GROUP BY 1, coalesce(e.lead_id::text, 'e' || e.id::text)`)) {
      const i = P(r.user_id);
      if (i < 0) continue;
      step(i, "first_email", r.first_at);
      step(i, "first_reply", r.reply_at);
      if (r.reach_d) reachMap.set(`${i}|${r.reach_d}`, (reachMap.get(`${i}|${r.reach_d}`) ?? 0) + 1);
      if (r.reply_d) {
        const k = `${i}|${r.reply_d}`;
        const cur = replyMap.get(k) ?? [0, 0];
        replyMap.set(k, [cur[0] + 1, cur[1] + (r.sentiment === "positive" ? 1 : 0)]);
      }
    }
  }
  const split = (k: string): [number, string] => [Number(k.slice(0, k.indexOf("|"))), k.slice(k.indexOf("|") + 1)];
  const reach: ReachRow[] = [...reachMap].map(([k, n]) => [...split(k), n]);
  const replies: ReplyRow[] = [...replyMap].map(([k, [n, p]]) => [...split(k), n, p]);

  // ---------------------------------------------------------------- active days
  // A day the person did something: signed in, a step of their own, a payment tap, a tool used. PostHog's signed-in
  // browsing is added by the caller. leads_generated_at is left out: the server wrote it, not the person.
  const parts: string[] = [];
  if (has.has("session")) parts.push(`SELECT user_id, ${day("created_at")} AS d FROM public.session WHERE created_at < '${BEFORE}'`);
  if (has.has("outreach_orders"))
    parts.push(`SELECT o.user_id, ${day("v.x")} FROM public.outreach_orders o
                  CROSS JOIN LATERAL (VALUES (o.created_at), (o.resume_uploaded_at), (o.quiz_started_at), (o.quiz_completed_at), (o.leads_viewed_at),
                                             (o.payment_page_reached_at), (o.gmail_connected_at), (o.email_style_selected_at), (o.campaign_setup_at), (o.campaign_launched_at)) v(x)
                 WHERE v.x IS NOT NULL AND v.x < '${BEFORE}'`);
  if (has.has("candidates")) parts.push(`SELECT user_id, ${day("created_at")} FROM public.candidates WHERE created_at < '${BEFORE}'`);
  if (has.has("payment_orders")) parts.push(`SELECT user_id, ${day("created_at")} FROM public.payment_orders WHERE created_at < '${BEFORE}'`);
  if (has.has("rsb_sessions")) parts.push(`SELECT user_id, ${dayTz("created_at")} FROM public.rsb_sessions WHERE created_at < '${BEFORE_TZ}'`);
  if (has.has("tool_used")) parts.push(`SELECT user_id, ${dayTz("used_at")} FROM public.tool_used WHERE used_at < '${BEFORE_TZ}'`);
  if (has.has("internship_applications")) parts.push(`SELECT user_id, ${day("created_at")} FROM public.internship_applications WHERE created_at < '${BEFORE}'`);
  const active: ActiveRow[] = [];
  if (parts.length) {
    for (const r of await q(`SELECT DISTINCT user_id, d FROM (${parts.join(" UNION ALL ")}) x WHERE user_id IS NOT NULL AND d IS NOT NULL LIMIT 400000`)) {
      const i = P(r.user_id);
      if (i >= 0) active.push([i, String(r.d)]);
    }
  }

  // ---------------------------------------------------------------- first touch
  // As /old/sources: a user_attribution row written within an hour of the account (a later row is a return visit).
  // Kept from 19 Sep 2026 only. Folded the way Stu folds its own (channelOfTouch).
  if (has.has("user_attribution")) {
    for (const r of await q(`
      SELECT DISTINCT ON (u.id) u.id, a.utm_source, a.utm_medium, a.referrer, a.gclid, a.fbclid
        FROM public."user" u JOIN public.user_attribution a ON a.user_id = u.id AND a.created_at <= (u.created_at AT TIME ZONE 'UTC') + interval '1 hour'
       WHERE u.created_at < '${BEFORE}'
       ORDER BY u.id, a.created_at`)) {
      const i = P(r.id);
      if (i < 0) continue;
      const raw: Record<string, string> = {};
      for (const k of ["utm_source", "utm_medium", "referrer", "gclid", "fbclid"]) if (r[k]) raw[k] = String(r[k]);
      people[i].ch = Object.keys(raw).length ? channelOfTouch(raw) : "direct";
    }
  }

  // ---------------------------------------------------------------- the other old tools
  const count = async (t: string, at: string, tz: boolean, who = "user_id") =>
    has.has(t) ? (await q(`SELECT count(*)::int AS n, count(DISTINCT ${who})::int AS people FROM public.${t} WHERE ${at} < '${tz ? BEFORE_TZ : BEFORE}'`))[0] : null;
  const rsb = await count("rsb_sessions", "created_at", true);
  const apps = await count("internship_applications", "created_at", false);
  const res = await count("resumes", "created_at", false);
  let dissertations: OldOther["dissertations"] = null;
  if (has.has("dissertation_submissions")) {
    const r = (await q(`SELECT count(*)::int AS n, coalesce(sum(amount), 0)::float8 AS paise, ${day("min(created_at)")} AS f, ${day("max(created_at)")} AS t
                          FROM public.dissertation_submissions WHERE payment_status = 'completed'`))[0];
    dissertations = { n: Number(r?.n) || 0, paise: Number(r?.paise) || 0, from: r?.f ?? null, to: r?.t ?? null };
  }

  const firstDay = people.length ? new Date(Math.min(...people.map((p) => p.su)) + 330 * 60_000).toISOString().slice(0, 10) : RELAUNCH_DAY;
  return {
    generatedAt: new Date().toISOString(), env, present: has.has("payment_orders") && people.length > 0,
    from: firstDay < OLD_OFF_DAY ? firstDay : OLD_OFF_DAY, to: OLD_OFF_DAY,
    people, ids, pays, mail, reach, replies, active, excluded, accounts: users.length, money,
    other: {
      resumeBuilder: rsb ? { sessions: Number(rsb.n), people: Number(rsb.people) } : null,
      internshipApps: apps ? { n: Number(apps.n), people: Number(apps.people) } : null,
      resumes: res ? { n: Number(res.n), people: Number(res.people) } : null,
      dissertations, assignment,
    },
  };
}

/** 12 hours: the old product is switched off, so its numbers no longer change. Refresh reads again. */
const HALF_DAY = 12 * 3_600_000;
const dbCache = swrCache<OldDb>({ freshMs: HALF_DAY, maxStaleMs: 2 * HALF_DAY, max: 1, onError: (_k, err) => console.error("[compare] old rebuild failed", err) });
const phCache = swrCache<OldPosthog>({ freshMs: HALF_DAY, maxStaleMs: 2 * HALF_DAY, max: 1, onError: (_k, err) => console.error("[compare] old PostHog rebuild failed", err) });

export const oldDb = (fresh = false): Promise<OldDb> => dbCache.get("old", () => readOnly(load), fresh);

/** PostHog's part of the old side; a failure is not kept, so the next read tries again. */
export const oldPosthog = (fresh = false): Promise<OldPosthog> =>
  phCache.get("old", async () => {
    const lastOld = OLD_OFF_DAY;
    const [visitors, signedIn] = await Promise.all([visitorsPerDay(POSTHOG_FROM, lastOld), signedInDays(RELAUNCH_DAY)]);
    return { generatedAt: new Date().toISOString(), visitors, signedIn };
  }, fresh);

/** For a local dry run of the queries against a read-only connection. */
export const _load = (q: Q) => load(q);
