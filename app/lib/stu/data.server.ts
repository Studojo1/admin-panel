// Stu tracking: everything the Stu pages show, read from this environment's own
// database (owner decision, 1 Nov 2026: our own DB is the source). One read-only
// transaction of small, schema-qualified queries; no search_path. Pages compute
// their numbers from this in the browser (app/lib/stu/model.ts), so every number
// can list the people behind it.
//
// Product users: public."user" is shared with the B2B products (Sensei, Bob), so
// a person counts only with career_agent activity (a profile, a call, a phone
// step, a journey event or a source row). Internal accounts are marked here and
// hidden by the pages unless "include internal" is on.
import { sql } from "drizzle-orm";
import db from "~/lib/db.server";
import { CHANNELS, channelOf } from "~/lib/utm-dictionary";
import {
  ACTIVITY_EVENTS, ANON_STEPS, EXTRA_EVENTS, JOURNEY_NAME_TO_STEP, STEPS, USER_STEPS,
  type Act, type JourneyStepRow, type StuData, type Touch, type WireCall, type WireFail, type WireUser, type WireVisitor,
  countFrom, markSharedBrowsers, sinceReset,
} from "./model";

export { SHARED_BROWSER } from "./model";

const S = "career_agent";
const J = `${S}.career_journey_events`;

/**
 * OUTREACH_BUY_TEST_USERS, as career-agent reads it, plus the known list: team accounts that are not admin, ops or
 * @studojo.com (ADMIN-FIX 5 Nov 2026: the second account of a team member, role user, was counted as a student).
 */
const DEFAULT_TEST_USERS = ["jeremy.zac@gmail.com", "studojo@gmail.com", "vivaan.nagpal19@gmail.com", "ayushiladha721@gmail.com"];
export function testUsers(): string[] {
  const env = (process.env.OUTREACH_BUY_TEST_USERS || "").split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return [...new Set([...DEFAULT_TEST_USERS, ...env])];
}

export function internalReason(u: { id: string; email: string | null; role: string | null }, tests: string[]): string | null {
  const email = (u.email || "").toLowerCase();
  if (u.role === "admin" || u.role === "ops") return `staff (${u.role})`;
  if (email.endsWith("@studojo.com")) return "studojo.com";
  if (tests.includes(email)) return "test account";
  if (u.id.startsWith("guest_") || email.endsWith("@guest.studojo.pro")) return "guest";
  return null;
}

const TABLES = [
  "career_journey_events", "career_user_source", "career_profiles", "career_voice_calls", "career_phones",
  "career_job_views", "career_matches", "career_threads", "career_messages", "career_channel_links",
  "career_channel_messages", "career_planner_messages", "career_outreach", "career_campaigns", "career_mail_accounts",
  "career_emails", "career_sequences", "career_daily_sends", "career_plans", "career_credit_orders", "career_outreach_credits",
  "career_plan_grants", "career_subscriptions", "career_settlements",
];

/**
 * ADMIN-FIX (5 Nov 2026): the WhatsApp verification message ("LINK K7M2PQ", sent by one tap at sign-up) is not a chat
 * with Stu. Only the bare code form, so a real message that starts with "link" still counts.
 */
const LINK_CODE = `coalesce(body, '') ~* '^\\s*link\\s+[a-z0-9]{4,12}\\s*$'`;

/** epoch ms of a timestamptz, as a JS number */
const ms = (x: string) => `(extract(epoch from (${x})) * 1000)::float8`;
/** IST calendar day of a timestamptz */
const day = (x: string) => `to_char((${x}) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;
const lit = (xs: readonly string[]) => `ARRAY[${xs.map((x) => `'${x.replace(/'/g, "''")}'`).join(",")}]::text[]`;
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const timeline = (alias: string) => `CASE WHEN jsonb_typeof(${alias}.timeline) = 'array' THEN ${alias}.timeline ELSE '[]'::jsonb END`;
const offset = `CASE WHEN jsonb_typeof(e->0) = 'number' THEN (e->>0)::float8 END`;

type Q = (text: string) => Promise<any[]>;

const CHANNEL_KEYS = new Set<string>(CHANNELS.map((c) => c.key));

function str(o: any, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = o?.[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 200);
  }
  return null;
}

/** A source row (first_touch, or a journey event's source) to the fields the pages split by. */
export function touchOf(raw: any): Touch | null {
  if (!raw || typeof raw !== "object" || !Object.keys(raw).length) return null;
  return {
    source: str(raw, "utm_source", "source"),
    medium: str(raw, "utm_medium", "medium"),
    campaign: str(raw, "utm_campaign", "campaign"),
    referrer: str(raw, "referrer", "referer", "ref", "referrer_host"),
    device: str(raw, "device", "device_type", "ua_device"),
    city: str(raw, "city", "geo_city"),
  };
}

/** The dashboard channel (same groups as admin.studojo.com) for a source row. */
export function channelOfTouch(raw: any): string {
  if (!raw || typeof raw !== "object" || !Object.keys(raw).length) return "not_captured";
  const given = str(raw, "channel");
  if (given && CHANNEL_KEYS.has(given)) return given;
  const t = touchOf(raw)!;
  if (!t.source) {
    if (str(raw, "gclid", "gbraid", "wbraid")) return "google_paid";
    if (str(raw, "fbclid")) return "meta_organic";
    if (str(raw, "go", "golink", "go_link", "wa")) return "whatsapp";
  }
  let host: string | null = null;
  if (t.referrer) {
    try {
      host = new URL(t.referrer.includes("://") ? t.referrer : `https://${t.referrer}`).hostname;
    } catch {
      host = null;
    }
  }
  return channelOf(t.source, t.medium, host);
}

async function load(q: Q, from: number = countFrom(process.env.STU_COUNT_FROM)): Promise<StuData> {
  // ADMIN-FIX (5 Nov 2026): the journey reads start at the count-from line (sinceReset drops what came before anyway),
  // so the minute's read stays small as the log grows. The account links and first sources stay whole: a first touch
  // and a shared browser can be older than the line.
  const since = `at >= to_timestamp(${from / 1000})`;
  // Which tables and columns this environment has (and this login may read):
  // the career_agent schema can run ahead on one environment, and the journey
  // log is new. A table missing here shows its metrics as not available.
  const cols = await q(`
    SELECT c.relname AS t, a.attname AS c
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE n.nspname = '${S}' AND c.relkind IN ('r', 'p', 'v') AND c.relname = ANY(${lit(TABLES)})
       AND has_schema_privilege(n.oid, 'USAGE') AND has_table_privilege(c.oid, 'SELECT')`);
  const have = new Set(cols.map((r) => r.t as string));
  const col = new Set(cols.map((r) => `${r.t}.${r.c}`));
  const has = (t: string) => have.has(t);
  const hasCol = (t: string, c: string) => col.has(`${t}.${c}`);
  const missing = TABLES.filter((t) => !has(t));
  const journey = has("career_journey_events");
  const src = has("career_user_source");
  const T = (t: string) => `${S}.${t}`;

  // Calls that are the onboarding path (not a desk chat call or a practice interview).
  const callMode = hasCol("career_voice_calls", "mode") ? "coalesce(c.mode, 'onboarding')" : "'onboarding'";
  const nonDesk = `${callMode} NOT IN ('desk', 'interview')`;

  // ---------------------------------------------------------------- people
  const pu: string[] = [];
  if (has("career_profiles")) pu.push(`SELECT user_id, created_at AS at FROM ${T("career_profiles")}`);
  if (has("career_voice_calls")) pu.push(`SELECT user_id, min(created_at) FROM ${T("career_voice_calls")} GROUP BY 1`);
  if (has("career_phones")) pu.push(`SELECT user_id, coalesce(verified_at, updated_at) FROM ${T("career_phones")}`);
  // signed_up is left out: its time is the account's created_at, which for an older account is not its first Stu step.
  // So is career_user_source.signed_up_at, the same account date (the owner, 2 Nov 2026: an old studojo.com account's
  // first time on the platform is a new sign-up that day, on every counter). The row still lists the person.
  if (journey) pu.push(`SELECT user_id, min(at) FROM ${J} WHERE user_id IS NOT NULL AND ${since} AND step <> ALL(${lit([...ANON_STEPS.flatMap((s) => s.journey), "signed_up"])}) GROUP BY 1`);
  if (journey) pu.push(`SELECT user_id, NULL::timestamptz FROM ${J} WHERE user_id IS NOT NULL AND step = 'signed_up' GROUP BY 1`);
  if (src) pu.push(`SELECT user_id, NULL::timestamptz FROM ${T("career_user_source")} WHERE user_id IS NOT NULL`);
  const userRows = pu.length
    ? await q(`
      WITH act AS (${pu.join(" UNION ALL ")}),
           first_act AS (SELECT user_id, min(at) AS at FROM act GROUP BY 1)
      SELECT u.id, u.email, u.name, u.role,
             ${ms(`u.created_at AT TIME ZONE 'UTC'`)} AS created,
             ${ms("f.at")} AS first_act
        FROM first_act f
        JOIN public."user" u ON u.id = f.user_id
       ORDER BY u.created_at DESC
       LIMIT 50000`)
    : [];
  const tests = testUsers();
  const users: WireUser[] = [];
  const idx = new Map<string, number>();
  for (const r of userRows) {
    const created = Number(r.created);
    const first = r.first_act == null ? created : Number(r.first_act);
    // A new account is made moments before its first Stu step; an older
    // studojo.com account joins Stu at its first Stu activity.
    const existing = first - created > 86_400_000;
    idx.set(r.id, users.length);
    users.push({
      id: r.id, email: r.email ?? "", name: r.name ?? "",
      internal: internalReason({ id: r.id, email: r.email, role: r.role }, tests),
      created, joined: existing ? first : created, existing,
      ch: "not_captured", touch: null, t: {}, j: {}, via: null, testPaid: null, device: null, inapp: null,
    });
  }
  const U = (id: unknown) => (typeof id === "string" ? idx.get(id) ?? -1 : -1);

  // ------------------------------------------------- truth: first time a step
  const truth: Partial<Record<string, string>> = {};
  if (has("career_phones")) truth.verified_phone = `SELECT user_id, ${ms("verified_at")} AS at FROM ${T("career_phones")} WHERE verified_at IS NOT NULL`;
  if (has("career_voice_calls")) {
    truth.call_started = `SELECT c.user_id, ${ms("min(c.started_at)")} AS at FROM ${T("career_voice_calls")} c WHERE c.started_at IS NOT NULL AND ${nonDesk} GROUP BY 1`;
    truth.first_question = `
      SELECT c.user_id, ${ms(`min(c.started_at + make_interval(secs => coalesce(${offset}, 0)))`)} AS at
        FROM ${T("career_voice_calls")} c CROSS JOIN LATERAL jsonb_array_elements(${timeline("c")}) e
       WHERE c.started_at IS NOT NULL AND ${nonDesk} AND jsonb_typeof(e) = 'array' AND e->>1 = 'mic_open'
       GROUP BY 1`;
    truth.resume_in_call = `
      SELECT c.user_id, ${ms("min(c.started_at + make_interval(secs => coalesce(r.off, 0)))")} AS at
        FROM ${T("career_voice_calls")} c
        LEFT JOIN LATERAL (
          SELECT min(${offset}) AS off FROM jsonb_array_elements(${timeline("c")}) e
           WHERE jsonb_typeof(e) = 'array' AND e->>1 = 'phase' AND e->>2 = 'reading') r ON true
       WHERE c.started_at IS NOT NULL AND c.resume IS NOT NULL AND ${callMode} = 'onboarding'
       GROUP BY 1`;
    truth.call_completed = `SELECT c.user_id, ${ms("min(coalesce(c.ended_at, c.finished_at, c.updated_at))")} AS at FROM ${T("career_voice_calls")} c WHERE c.status IN ('ready', 'finished') AND ${nonDesk} GROUP BY 1`;
  }
  if (has("career_profiles")) truth.onboarded = `SELECT user_id, ${ms("onboarded_at")} AS at, (preferences ? 'voice_call') AS via_call FROM ${T("career_profiles")} WHERE onboarded_at IS NOT NULL`;
  if (has("career_job_views")) truth.saw_jobs = `SELECT user_id, ${ms("min(viewed_at)")} AS at FROM ${T("career_job_views")} GROUP BY 1`;
  if (has("career_matches")) truth.saved_job = `SELECT user_id, ${ms("min(updated_at)")} AS at FROM ${T("career_matches")} WHERE state IN ('saved', 'applied') GROUP BY 1`;
  {
    const parts: string[] = [];
    if (has("career_messages") && has("career_threads")) parts.push(`SELECT t.user_id, m.created_at AS at FROM ${T("career_messages")} m JOIN ${T("career_threads")} t ON t.id = m.thread_id WHERE m.role = 'user'`);
    if (has("career_channel_messages")) parts.push(`SELECT user_id, created_at FROM ${T("career_channel_messages")} WHERE direction = 'in' AND user_id IS NOT NULL AND NOT ${LINK_CODE}`);
    if (has("career_planner_messages")) parts.push(`SELECT user_id, created_at FROM ${T("career_planner_messages")} WHERE role = 'user'`);
    if (has("career_voice_calls") && hasCol("career_voice_calls", "mode")) parts.push(`SELECT user_id, started_at FROM ${T("career_voice_calls")} WHERE started_at IS NOT NULL AND mode IN ('desk', 'interview', 'returning')`);
    if (parts.length && has("career_profiles"))
      truth.chatted = `
        SELECT x.user_id, ${ms("min(x.at)")} AS at FROM (${parts.join(" UNION ALL ")}) x
          LEFT JOIN ${T("career_profiles")} p ON p.user_id = x.user_id
         WHERE x.at >= coalesce(p.onboarded_at, '-infinity'::timestamptz) GROUP BY 1`;
  }
  if (has("career_channel_links")) truth.whatsapp_linked = `SELECT user_id, ${ms("min(created_at)")} AS at FROM ${T("career_channel_links")} WHERE channel IN ('whatsapp', 'imessage') GROUP BY 1`;
  {
    // Step 18 as career-agent defines it (docs/tracking-steps.md, 2 Nov 2026): a
    // find-the-hiring-manager run, or a campaign past draft. A job only added to
    // the outreach list is not outreach started (it counts in "Jobs added to outreach").
    const parts: string[] = [];
    if (has("career_outreach"))
      parts.push(hasCol("career_outreach", "find_at")
        ? `SELECT user_id, find_at AS at FROM ${T("career_outreach")} WHERE find_at IS NOT NULL`
        : `SELECT user_id, created_at AS at FROM ${T("career_outreach")}`);
    if (has("career_campaigns")) {
      const at = hasCol("career_campaigns", "started_at") ? "coalesce(started_at, created_at)" : "created_at";
      parts.push(`SELECT user_id, ${at} FROM ${T("career_campaigns")}${hasCol("career_campaigns", "status") ? " WHERE status <> 'draft'" : ""}`);
    }
    if (parts.length) truth.outreach_started = `SELECT user_id, ${ms("min(at)")} AS at FROM (${parts.join(" UNION ALL ")}) x GROUP BY 1`;
  }
  const testBox = hasCol("career_mail_accounts", "test");
  if (has("career_mail_accounts")) truth.mailbox_connected = `SELECT user_id, ${ms("min(verified_at)")} AS at FROM ${T("career_mail_accounts")} ${testBox ? "WHERE NOT test" : ""} GROUP BY 1`;
  // A real email: sent, and not a dry run (SEQUENCES_LIVE off, a test inbox or MAIL_DRY_RUN, all recorded as sent).
  const seqJoin = hasCol("career_emails", "sequence_id") && hasCol("career_sequences", "dry_run");
  const boxJoin = hasCol("career_emails", "mailbox_id") && testBox;
  const emailDry = [
    `coalesce(e.message_id, '') LIKE '<dry-run%'`,
    seqJoin ? "coalesce(s.dry_run, false)" : null,
    boxJoin ? "coalesce(mb.test, false)" : null,
  ].filter(Boolean).join(" OR ");
  const emailFrom = `${T("career_emails")} e
    ${seqJoin ? `LEFT JOIN ${T("career_sequences")} s ON s.id = e.sequence_id` : ""}
    ${boxJoin ? `LEFT JOIN ${T("career_mail_accounts")} mb ON mb.id = e.mailbox_id` : ""}`;
  if (has("career_emails")) truth.first_email_sent = `SELECT e.user_id, ${ms("min(coalesce(e.sent_at, e.created_at))")} AS at FROM ${emailFrom} WHERE e.status = 'sent' AND NOT (${emailDry}) GROUP BY 1`;
  const seqDry = hasCol("career_sequences", "dry_run") ? "coalesce(dry_run, false)" : "false";
  if (has("career_sequences")) truth.first_reply = `SELECT user_id, ${ms("min(replied_at)")} AS at FROM ${T("career_sequences")} WHERE replied_at IS NOT NULL AND reply_how IS DISTINCT FROM 'bounce' AND NOT ${seqDry} GROUP BY 1`;
  // ADMIN-FIX (5 Nov 2026): paid means money came in. An order counts with amount less refunds above zero (a free
  // coupon order is not a payment); a plan row only when it is not a test or a staff grant; and each autopay charge
  // (career-agent writes one career_plan_grants row per charge, source autopay, revoked when refunded), at the
  // subscription's amount, unless a credit order already holds that payment id.
  // SETTLE-REVENUE (14 Nov 2026, the owner: "dont count the autopay cash until it hits bank account"): an autopay charge
  // still makes the person Paid on the day charged, but its money counts in revenue only on the IST day Razorpay paid it
  // out to the bank (career_settlements.settled_at; career-agent writes the row once the payment is settled). Until then
  // it is "not in the bank yet". Pack orders keep counting on payment. With no career_settlements here, autopay money
  // counts on the day charged, as before.
  const refunded = hasCol("career_credit_orders", "refunded_paise") ? "coalesce(refunded_paise, 0)" : "0";
  const money = `(amount_paise - ${refunded}) > 0`;
  const PLAN_NOT_PAID = lit(["test", "grant"]);
  const autopayOn = hasCol("career_plan_grants", "subscription_id") && hasCol("career_subscriptions", "razorpay_subscription_id") && hasCol("career_subscriptions", "test");
  const notAnOrder = hasCol("career_credit_orders", "razorpay_payment_id")
    ? ` AND NOT EXISTS (SELECT 1 FROM ${T("career_credit_orders")} o WHERE o.razorpay_payment_id = g.payment_id)`
    : "";
  const charges = (test: boolean, join = "") => `${T("career_plan_grants")} g JOIN ${T("career_subscriptions")} s ON s.razorpay_subscription_id = g.subscription_id${join}
       WHERE g.source = 'autopay' AND g.payment_id IS NOT NULL AND g.revoked_at IS NULL AND ${test ? "" : "NOT "}s.test${notAnOrder}`;
  const settleOn = autopayOn && hasCol("career_settlements", "payment_id") && hasCol("career_settlements", "settled_at");
  const settled = ` JOIN ${T("career_settlements")} x ON x.payment_id = g.payment_id AND x.settled_at IS NOT NULL`;
  const unsettled = ` AND NOT EXISTS (SELECT 1 FROM ${T("career_settlements")} x WHERE x.payment_id = g.payment_id AND x.settled_at IS NOT NULL)`;
  {
    const parts: string[] = [];
    if (has("career_credit_orders")) parts.push(`SELECT user_id, coalesce(paid_at, created_at) AS at FROM ${T("career_credit_orders")} WHERE status IN ('paid', 'refunded') AND NOT test AND ${money}`);
    if (has("career_plans")) parts.push(`SELECT user_id, updated_at FROM ${T("career_plans")} WHERE plan <> 'free' AND source <> ALL(${PLAN_NOT_PAID})`);
    if (autopayOn) parts.push(`SELECT g.user_id, g.created_at FROM ${charges(false)}`);
    if (parts.length) truth.paid = `SELECT user_id, ${ms("min(at)")} AS at FROM (${parts.join(" UNION ALL ")}) x GROUP BY 1`;
  }
  const truthOn: Record<string, boolean> = {};
  for (const s of STEPS) truthOn[s.key] = s.key === "signed_up" || !!truth[s.key];
  for (const [key, text] of Object.entries(truth)) {
    for (const r of await q(text!)) {
      const i = U(r.user_id);
      if (i < 0 || r.at == null) continue;
      const at = Number(r.at);
      const u = users[i];
      if (u.t[key] == null || at < u.t[key]!) u.t[key] = at;
      if (key === "onboarded") u.via = r.via_call ? "call" : "typed";
    }
  }
  {
    const parts: string[] = [];
    if (has("career_credit_orders")) parts.push(`SELECT user_id, coalesce(paid_at, created_at) AS at FROM ${T("career_credit_orders")} WHERE status IN ('paid', 'refunded') AND test`);
    if (has("career_plans")) parts.push(`SELECT user_id, updated_at FROM ${T("career_plans")} WHERE plan <> 'free' AND source = 'test'`);
    if (has("career_outreach_credits")) parts.push(`SELECT user_id, created_at FROM ${T("career_outreach_credits")} WHERE reason = 'test_purchase'`);
    if (autopayOn) parts.push(`SELECT g.user_id, g.created_at FROM ${charges(true)}`);
    if (parts.length)
      for (const r of await q(`SELECT user_id, ${ms("min(at)")} AS at FROM (${parts.join(" UNION ALL ")}) x GROUP BY 1`)) {
        const i = U(r.user_id);
        if (i >= 0) users[i].testPaid = Number(r.at);
      }
  }

  // ------------------------------------------------------ the journey log
  // A step's first time leaves out rows marked test or dry run (a test payment,
  // a test inbox, a dry-run reply): those count in the test rows instead.
  const act: Act[] = [];
  const fails: WireFail[] = [];
  const visitors: WireVisitor[] = [];
  const journeySteps: JourneyStepRow[] = [];
  const envs: { env: string; n: number }[] = [];
  let journeyStart: number | null = null;
  let journeyLiveStart: number | null = null;
  let pageViewStart: number | null = null;
  const userNames = USER_STEPS.flatMap((s) => s.journey);
  const actKinds: Record<string, string> = {};
  for (const n of STEPS.find((s) => s.key === "opened_desk")!.journey) actKinds[n] = "desk";
  for (const n of STEPS.find((s) => s.key === "opened_job")!.journey) actKinds[n] = "job_open";
  for (const n of STEPS.find((s) => s.key === "apply_click")!.journey) actKinds[n] = "apply";
  for (const n of STEPS.find((s) => s.key === "saw_plans")!.journey) actKinds[n] = "plan_view";
  if (journey) {
    for (const r of await q(`
      SELECT user_id, step, ${ms("min(at)")} AS at FROM ${J}
       WHERE user_id IS NOT NULL AND step = ANY(${lit(userNames)}) AND ${since}
         AND coalesce(props->>'test', '') NOT IN ('true', '1') AND coalesce(props->>'dry_run', '') NOT IN ('true', '1')
       GROUP BY 1, 2`)) {
      const i = U(r.user_id);
      const key = JOURNEY_NAME_TO_STEP[r.step];
      if (i < 0 || !key) continue;
      const at = Number(r.at);
      const u = users[i];
      if (u.j[key] == null || at < u.j[key]!) u.j[key] = at;
    }
    for (const r of await q(`
      SELECT step, user_id, ${day("at")} AS day, count(*)::int AS n FROM ${J}
       WHERE user_id IS NOT NULL AND step = ANY(${lit(Object.keys(actKinds))}) AND ${since}
       GROUP BY 1, 2, 3 LIMIT 500000`)) {
      const i = U(r.user_id);
      if (i >= 0) act.push([actKinds[r.step], i, r.day, Number(r.n), 0]);
    }
    // Activity beacons (career-agent, 2 Nov 2026): active_day once a person a day,
    // feature_used once a person, feature and day (props.feature). Read whenever
    // the log has them; the activity model (model.ts activity) adds them to what
    // the product tables show.
    for (const r of await q(`
      SELECT user_id, step, ${day("at")} AS day, left(coalesce(props->>'feature', ''), 30) AS feature, count(*)::int AS n FROM ${J}
       WHERE user_id IS NOT NULL AND step = ANY(${lit(ACTIVITY_EVENTS)}) AND ${since}
       GROUP BY 1, 2, 3, 4 LIMIT 500000`)) {
      const i = U(r.user_id);
      if (i >= 0) act.push([r.step === "active_day" ? "active_day" : `f:${r.feature || "other"}`, i, r.day, Number(r.n), 0]);
    }
    for (const r of await q(`
      SELECT user_id, ${ms("at")} AS at, coalesce(props->>'reason', props->>'error', '') AS reason FROM ${J}
       WHERE user_id IS NOT NULL AND step = ANY(${lit(EXTRA_EVENTS.call_failed)}) AND ${since}
       ORDER BY at DESC LIMIT 50000`)) {
      const i = U(r.user_id);
      if (i >= 0) fails.push([i, Number(r.at), String(r.reason || "unknown").slice(0, 60)]);
    }
    // Visitors before sign-in: one row a visitor, step and IST day.
    // REAL-VISITORS (owner, 4 Nov 2026: "the crawlers should not be in our visitors"): a visit is a page_view
    // (SITE-TRACK, the browser's own beacon); visited_home is a server row any crawler makes. ADMIN-FIX (5 Nov 2026):
    // once the log has a page_view, visited_home never counts, before it either (one visitor number everywhere,
    // tracked from the first page_view). Only a log with no page_view at all falls back to it (the old count).
    const pv = (await q(`SELECT ${ms("min(at)")} AS at FROM ${J} WHERE step = 'page_view'`))[0]?.at;
    pageViewStart = pv == null ? null : Number(pv);
    const serverHitsAfter = pageViewStart == null ? "" : ` AND step <> 'visited_home'`;
    const anonNames = ANON_STEPS.flatMap((s) => s.journey);
    const vmap = new Map<string, WireVisitor>();
    for (const r of await q(`
      SELECT visitor_id, step, ${day("at")} AS day, ${ms("min(at)")} AS at FROM ${J}
       WHERE visitor_id IS NOT NULL AND step = ANY(${lit([...anonNames, "page_view"])}) AND ${since}${serverHitsAfter}
       GROUP BY 1, 2, 3 LIMIT 300000`)) {
      const key = r.step === "page_view" ? "visited_home" : JOURNEY_NAME_TO_STEP[r.step];
      if (!key) continue;
      let v = vmap.get(r.visitor_id);
      if (!v) vmap.set(r.visitor_id, (v = { id: r.visitor_id, u: -1, ch: "not_captured", device: null, city: null, days: {}, first: {} }));
      (v.days[key] ??= []).includes(r.day) || v.days[key]!.push(r.day);
      const at = Number(r.at);
      if (v.first[key] == null || at < v.first[key]!) v.first[key] = at;
    }
    // A visitor's first source, and the account it became.
    for (const r of await q(`
      SELECT DISTINCT ON (visitor_id) visitor_id, source FROM ${J}
       WHERE visitor_id IS NOT NULL AND source IS NOT NULL AND source <> '{}'::jsonb
       ORDER BY visitor_id, at LIMIT 300000`)) {
      const v = vmap.get(r.visitor_id);
      if (!v) continue;
      v.ch = channelOfTouch(r.source);
      const t = touchOf(r.source);
      v.device = t?.device ?? null;
      v.city = t?.city ?? null;
    }
    // SITE-TRACK: device and in-app browser ride in props on every row the site writes (the source has no device).
    const deviceOf = new Map<string, { device: string | null; inapp: string | null }>();
    for (const r of await q(`
      SELECT DISTINCT ON (visitor_id) visitor_id, left(props->>'device', 20) AS device, left(props->>'inapp', 20) AS inapp FROM ${J}
       WHERE visitor_id IS NOT NULL AND props ? 'device' AND ${since}
       ORDER BY visitor_id, at LIMIT 300000`)) {
      deviceOf.set(r.visitor_id, { device: r.device || null, inapp: r.inapp || null });
      const v = vmap.get(r.visitor_id);
      if (!v) continue;
      v.device = r.device || v.device;
      v.inapp = r.inapp || null;
    }
    const links = [`SELECT DISTINCT visitor_id, user_id FROM ${J} WHERE visitor_id IS NOT NULL AND user_id IS NOT NULL`];
    if (src && hasCol("career_user_source", "visitor_id")) links.push(`SELECT visitor_id, user_id FROM ${T("career_user_source")} WHERE visitor_id IS NOT NULL AND user_id IS NOT NULL`);
    const browsers = new Map<string, number[]>();
    for (const r of await q(`${links.join(" UNION ")} LIMIT 300000`)) {
      const v = vmap.get(r.visitor_id);
      const i = U(r.user_id);
      if (v && i >= 0) v.u = i;
      if (i >= 0) (browsers.get(r.visitor_id) ?? browsers.set(r.visitor_id, []).get(r.visitor_id)!).push(i);
      // A person's device: their visitor's, unless their own rows carry one (read below).
      const dv = deviceOf.get(r.visitor_id);
      if (i >= 0 && dv && !users[i].device) Object.assign(users[i], dv);
    }
    markSharedBrowsers(users, browsers.values());
    for (const r of await q(`
      SELECT DISTINCT ON (user_id) user_id, left(props->>'device', 20) AS device, left(props->>'inapp', 20) AS inapp FROM ${J}
       WHERE user_id IS NOT NULL AND props ? 'device' AND ${since}
       ORDER BY user_id, at LIMIT 100000`)) {
      const i = U(r.user_id);
      if (i < 0 || !r.device) continue;
      users[i].device = r.device;
      users[i].inapp = r.inapp || users[i].inapp || null;
    }
    visitors.push(...vmap.values());

    for (const r of await q(`
      SELECT coalesce(env, '(none)') AS env, step, count(*)::int AS events, count(DISTINCT user_id)::int AS users,
             count(DISTINCT visitor_id)::int AS visitors, ${ms("min(at)")} AS first, ${ms("max(at)")} AS last,
             ${ms("min(at) FILTER (WHERE coalesce(props->>'backfill', '') NOT IN ('true', '1'))")} AS first_live
        FROM ${J} WHERE ${since} GROUP BY 1, 2`)) {
      const row = journeySteps.find((x) => x.step === r.step);
      if (row) {
        row.events += r.events;
        row.users += r.users;
        row.visitors += r.visitors;
        row.first = Math.min(row.first ?? Infinity, Number(r.first));
        row.last = Math.max(row.last ?? 0, Number(r.last));
      } else {
        const as = JOURNEY_NAME_TO_STEP[r.step] ?? ((EXTRA_EVENTS.call_failed as readonly string[]).includes(r.step) ? "call_failed" : null);
        journeySteps.push({ step: r.step, as, events: r.events, users: r.users, visitors: r.visitors, first: Number(r.first), last: Number(r.last) });
      }
      const e = envs.find((x) => x.env === r.env);
      if (e) e.n += r.events;
      else envs.push({ env: r.env, n: r.events });
      // signed_up rows carry the account's created_at, so they do not say when the log began.
      const f = Number(r.first);
      if (r.step !== "signed_up" && (journeyStart == null || f < journeyStart)) journeyStart = f;
      const fl = r.first_live == null ? null : Number(r.first_live);
      if (fl != null && r.step !== "signed_up" && (journeyLiveStart == null || fl < journeyLiveStart)) journeyLiveStart = fl;
    }
  }

  // ------------------------------------------------------- where they came from
  const touchByUser = new Map<number, any>();
  if (src) {
    const firstCol = hasCol("career_user_source", "first_touch") ? "first_touch" : "NULL::jsonb";
    for (const r of await q(`SELECT user_id, ${firstCol} AS first_touch FROM ${T("career_user_source")} WHERE user_id IS NOT NULL`)) {
      const i = U(r.user_id);
      if (i >= 0 && r.first_touch) touchByUser.set(i, r.first_touch);
    }
  }
  if (journey) {
    // No source row: the earliest journey event that carries one.
    for (const r of await q(`
      SELECT DISTINCT ON (user_id) user_id, source FROM ${J}
       WHERE user_id IS NOT NULL AND source IS NOT NULL AND source <> '{}'::jsonb
       ORDER BY user_id, at LIMIT 100000`)) {
      const i = U(r.user_id);
      if (i >= 0 && !touchByUser.has(i)) touchByUser.set(i, r.source);
    }
  }
  for (const [i, raw] of touchByUser) {
    users[i].touch = touchOf(raw);
    users[i].ch = channelOfTouch(raw);
  }
  // A visitor who became an account, with no source of their own: the visitor's.
  for (const v of visitors) {
    if (v.u >= 0 && users[v.u].ch === "not_captured" && v.ch !== "not_captured") users[v.u].ch = v.ch;
  }

  // ------------------------------------------------------------ calls
  const calls: WireCall[] = [];
  if (has("career_voice_calls")) {
    for (const r of await q(`
      SELECT c.user_id, ${callMode} AS mode, c.status, c.error, ${ms("c.created_at")} AS created, ${ms("c.started_at")} AS started,
             ${ms("coalesce(c.ended_at, c.finished_at)")} AS ended, c.duration_s,
             (jsonb_typeof(c.timeline) = 'array' AND c.timeline @> '[["dropped"]]'::jsonb) AS dropped,
             (c.resume IS NOT NULL) AS resume
        FROM ${T("career_voice_calls")} c ORDER BY c.created_at DESC LIMIT 100000`)) {
      const i = U(r.user_id);
      if (i < 0) continue;
      calls.push([
        i, String(r.mode), String(r.status), r.error == null ? null : String(r.error).slice(0, 80), Number(r.created),
        r.started == null ? null : Number(r.started), r.ended == null ? null : Number(r.ended),
        r.duration_s == null ? null : Number(r.duration_s), r.dropped ? 1 : 0, r.resume ? 1 : 0,
        r.status === "ready" || r.status === "finished" ? 1 : 0,
      ]);
    }
  }

  // ------------------------------------------------- repeat activity a day
  const perDay: [string, string][] = [];
  if (has("career_messages") && has("career_threads"))
    perDay.push(["chat_desk", `SELECT t.user_id, ${day("m.created_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_messages")} m JOIN ${T("career_threads")} t ON t.id = m.thread_id WHERE m.role = 'user' GROUP BY 1, 2`]);
  if (has("career_planner_messages"))
    perDay.push(["chat_desk", `SELECT user_id, ${day("created_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_planner_messages")} WHERE role = 'user' GROUP BY 1, 2`]);
  if (has("career_channel_messages")) {
    perDay.push(["chat_wa", `SELECT user_id, ${day("created_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_channel_messages")} WHERE direction = 'in' AND user_id IS NOT NULL AND NOT ${LINK_CODE} GROUP BY 1, 2`]);
    // The verification code: activity on WhatsApp that day, not a chat.
    perDay.push(["wa_link", `SELECT user_id, ${day("created_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_channel_messages")} WHERE direction = 'in' AND user_id IS NOT NULL AND ${LINK_CODE} GROUP BY 1, 2`]);
  }
  if (has("career_voice_calls") && hasCol("career_voice_calls", "mode"))
    perDay.push(["chat_call", `SELECT user_id, ${day("started_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_voice_calls")} WHERE started_at IS NOT NULL AND mode IN ('desk', 'interview', 'returning') GROUP BY 1, 2`]);
  if (has("career_job_views"))
    perDay.push(["job_view", `SELECT user_id, ${day("viewed_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_job_views")} GROUP BY 1, 2`]);
  if (has("career_matches"))
    perDay.push(["save", `SELECT user_id, ${day("updated_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_matches")} WHERE state IN ('saved', 'applied') GROUP BY 1, 2`]);
  if (has("career_outreach"))
    perDay.push(["outreach_row", `SELECT user_id, ${day("created_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_outreach")} GROUP BY 1, 2`]);
  if (has("career_emails")) {
    perDay.push(["email", `SELECT e.user_id, ${day("coalesce(e.sent_at, e.created_at)")} AS day, count(*)::int AS n, 0 AS amt FROM ${emailFrom} WHERE e.status = 'sent' AND NOT (${emailDry}) GROUP BY 1, 2`]);
    perDay.push(["email_test", `SELECT e.user_id, ${day("coalesce(e.sent_at, e.created_at)")} AS day, count(*)::int AS n, 0 AS amt FROM ${emailFrom} WHERE e.status = 'sent' AND (${emailDry}) GROUP BY 1, 2`]);
  }
  if (has("career_sequences")) {
    perDay.push(["reply", `SELECT user_id, ${day("replied_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_sequences")} WHERE replied_at IS NOT NULL AND reply_how IS DISTINCT FROM 'bounce' AND NOT ${seqDry} GROUP BY 1, 2`]);
    perDay.push(["reply_test", `SELECT user_id, ${day("replied_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_sequences")} WHERE replied_at IS NOT NULL AND reply_how IS DISTINCT FROM 'bounce' AND ${seqDry} GROUP BY 1, 2`]);
  }
  if (has("career_daily_sends")) {
    for (const [kind, c] of [["digest_sent", "sent_at"], ["digest_read", "read_at"], ["digest_tapped", "tapped_at"]] as const)
      perDay.push([kind, `SELECT user_id, ${day(c)} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_daily_sends")} WHERE channel = 'whatsapp' AND kind = 'picks' AND ${c} IS NOT NULL GROUP BY 1, 2`]);
  }
  if (has("career_credit_orders")) {
    perDay.push(["pay", `SELECT user_id, ${day("coalesce(paid_at, created_at)")} AS day, count(*)::int AS n, sum(amount_paise - ${refunded})::float8 AS amt FROM ${T("career_credit_orders")} WHERE status IN ('paid', 'refunded') AND NOT test AND ${money} GROUP BY 1, 2`]);
    perDay.push(["pay_test", `SELECT user_id, ${day("coalesce(paid_at, created_at)")} AS day, count(*)::int AS n, sum(amount_paise)::float8 AS amt FROM ${T("career_credit_orders")} WHERE status IN ('paid', 'refunded') AND test GROUP BY 1, 2`]);
  }
  if (has("career_plans")) {
    perDay.push(["pay", `SELECT user_id, ${day("updated_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_plans")} WHERE plan <> 'free' AND source <> ALL(${PLAN_NOT_PAID}) GROUP BY 1, 2`]);
    perDay.push(["pay_test", `SELECT user_id, ${day("updated_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_plans")} WHERE plan <> 'free' AND source = 'test' GROUP BY 1, 2`]);
  }
  if (autopayOn) {
    // SETTLE-REVENUE: with settlements here the charge day carries no money (Paid counts as before); the money is a
    // pay_cash row on the IST day it was settled, and a charge not settled yet is a pay_wait row on the day charged.
    perDay.push(["pay", `SELECT g.user_id, ${day("g.created_at")} AS day, count(*)::int AS n, ${settleOn ? "0" : "sum(s.amount_paise)::float8"} AS amt FROM ${charges(false)} GROUP BY 1, 2`]);
    if (settleOn) {
      perDay.push(["pay_cash", `SELECT g.user_id, ${day("x.settled_at")} AS day, count(*)::int AS n, sum(s.amount_paise)::float8 AS amt FROM ${charges(false, settled)} GROUP BY 1, 2`]);
      perDay.push(["pay_wait", `SELECT g.user_id, ${day("g.created_at")} AS day, count(*)::int AS n, sum(s.amount_paise)::float8 AS amt FROM ${charges(false)}${unsettled} GROUP BY 1, 2`]);
    }
    perDay.push(["pay_test", `SELECT g.user_id, ${day("g.created_at")} AS day, count(*)::int AS n, sum(s.amount_paise)::float8 AS amt FROM ${charges(true)} GROUP BY 1, 2`]);
  }
  if (has("career_outreach_credits"))
    perDay.push(["pay_test", `SELECT user_id, ${day("created_at")} AS day, count(*)::int AS n, 0 AS amt FROM ${T("career_outreach_credits")} WHERE reason = 'test_purchase' GROUP BY 1, 2`]);
  for (const [kind, text] of perDay) {
    for (const r of await q(text)) {
      const i = U(r.user_id);
      if (i >= 0 && r.day) act.push([kind, i, String(r.day), Number(r.n) || 0, Number(r.amt) || 0]);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    missing,
    journeyLive: journey,
    sourceLive: src,
    settleLive: settleOn,
    journeyStart,
    journeyLiveStart,
    pageViewStart,
    truthOn,
    users,
    visitors,
    act,
    calls,
    fails,
    journeySteps: journeySteps.sort((a, b) => b.events - a.events),
    envs,
    testUsers: tests,
  };
}

/** Every query runs in one read-only transaction with a short statement timeout. */
async function readOnly<T>(fn: (q: Q) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
      const q: Q = async (text) => (await tx.execute(sql.raw(text))).rows as any[];
      return fn(q);
    },
    { accessMode: "read only" },
  );
}

let cache: { minute: number; data: Promise<StuData> } | null = null;
const TTL_MS = 60_000;

/**
 * The Stu dataset from the reset on (model.ts sinceReset), read at most once per clock minute (fresh: read now).
 * ADMIN-FIX (5 Nov 2026): the copy turns over on the minute, not a minute after this pod's last read, so the two pods'
 * copies are from the same minute and two refreshes agree.
 */
export function stuData(fresh = false): Promise<StuData> {
  const minute = Math.floor(Date.now() / TTL_MS);
  if (!fresh && cache && cache.minute === minute) return cache.data;
  const from = countFrom(process.env.STU_COUNT_FROM);
  const data = readOnly((q) => load(q, from)).then((d) => sinceReset(d, from));
  cache = { minute, data };
  data.catch(() => {
    if (cache?.data === data) cache = null;
  });
  return data;
}

/** One person's raw journey log (their visitor ids included), oldest first, and their source row, for the Journeys timeline. */
export async function userTimeline(userId: string) {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '20s'`);
      const rows = async (s: ReturnType<typeof sql>) => (await tx.execute(s)).rows as any[];
      const reg = await rows(sql`SELECT to_regclass('career_agent.career_journey_events') IS NOT NULL AS j,
                                        to_regclass('career_agent.career_user_source') IS NOT NULL AS s`);
      const out: { events: any[]; source: any } = { events: [], source: null };
      if (reg[0]?.s) {
        out.source = (await rows(sql`SELECT * FROM career_agent.career_user_source WHERE user_id = ${userId} LIMIT 1`))[0] ?? null;
      }
      if (reg[0]?.j) {
        const fromSource = reg[0]?.s
          ? sql`UNION SELECT visitor_id FROM career_agent.career_user_source WHERE user_id = ${userId} AND visitor_id IS NOT NULL`
          : sql``;
        out.events = await rows(sql`
          WITH v AS (
            SELECT DISTINCT visitor_id FROM career_agent.career_journey_events WHERE user_id = ${userId} AND visitor_id IS NOT NULL
            ${fromSource}
          )
          SELECT id, (extract(epoch from at) * 1000)::float8 AS at, env, step, visitor_id, session_id, props, source
            FROM career_agent.career_journey_events
           WHERE user_id = ${userId} OR (user_id IS NULL AND visitor_id IN (SELECT visitor_id FROM v))
           ORDER BY at LIMIT 2000`);
      }
      return out;
    },
    { accessMode: "read only" },
  );
}

/** For a local dry run of the queries against a read-only connection. */
export const _load = load;
