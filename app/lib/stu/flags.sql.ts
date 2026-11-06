// The reads behind the Auditor flags (flags.ts has the rules and the words). Plain SQL text, no
// imports: the server runs each one in its own short read-only transaction, and the tests and
// a local dry run load them straight from the source. Every read is bounded by the window
// (created_at, at, local_day or a primary key), never a scan of career_jobs, and ends in a
// LIMIT. Times are IST-agnostic timestamptz literals made by the server from epoch numbers.
// Each query returns user_id (or an address), at (epoch ms) and the numbers the words use.

const S = "career_agent";
const ms = (x: string) => `(extract(epoch from (${x})) * 1000)::float8`;
const LIMIT = 2001;
/** the verify message sent by one tap at sign-up ("LINK K7M2PQ") is not a chat with Stu */
const LINK_CODE = `coalesce(m.body, '') ~* '^\\s*link\\s+[a-z0-9]{4,12}\\s*$'`;

export interface FlagWindow {
  /** timestamptz literals, ISO */
  from: string;
  to: string;
  /** IST days, for career_today_picks.local_day */
  dayFrom: string;
  dayTo: string;
  /** the verdict read starts here: the last 72 hours of the window at most */
  floodFrom: string;
}

export interface FlagQuery {
  /** the flag type the rows are for */
  type: string;
  /** the tables the read needs (a database without one shows the check as not checked) */
  needs: string[];
  /** the name shown when it is not checked or capped */
  name: string;
  sql: string;
}

/** The WhatsApp person: the row's own user, or the active link on that number. */
const waUser = (m: string) => `coalesce(${m}.user_id, (SELECT l.user_id FROM ${S}.career_channel_links l WHERE l.channel = ${m}.channel AND l.address = ${m}.address AND l.status = 'active' LIMIT 1))`;

export function flagQueries(w: FlagWindow): FlagQuery[] {
  const F = `'${w.from}'::timestamptz`;
  const T = `'${w.to}'::timestamptz`;
  const FF = `'${w.floodFrom}'::timestamptz`;
  const D0 = `'${w.dayFrom}'::date`;
  const D1 = `'${w.dayTo}'::date`;
  const J = `${S}.career_journey_events`;
  const picks = `${S}.career_today_picks p JOIN ${S}.career_profiles pr ON pr.user_id = p.user_id AND pr.onboarded_at IS NOT NULL`;
  const q = (type: string, name: string, needs: string[], sql: string): FlagQuery => ({ type, name, needs, sql: sql.replace(/\s+/g, " ").trim() });

  return [
    // ------------------------------------------------------------ matching
    q("LEVEL_MISMATCH", "Level mismatch", ["career_profiles"], `
      SELECT p.user_id, ${ms("p.onboarded_at")} AS at, p.profile -> 'experience' AS exp, p.profile ->> 'graduation_year' AS gy, p.preferences -> 'seniority' AS sen
        FROM ${S}.career_profiles p
       WHERE p.onboarded_at >= ${F} AND p.onboarded_at < ${T}
         AND NOT coalesce(p.preferences -> 'seniority' ?| array['mid', 'senior'], false)
       ORDER BY p.onboarded_at DESC LIMIT ${LIMIT}`),

    q("TOO_SENIOR_FLOOD", "Too senior flood", ["career_llm_fit"], `
      SELECT user_id, count(*) AS n, count(*) FILTER (WHERE level = 'far_above') AS a, ${ms("max(created_at)")} AS at
        FROM ${S}.career_llm_fit
       WHERE created_at >= ${FF} AND created_at < ${T} AND user_id IS NOT NULL
       GROUP BY user_id
      HAVING count(*) >= 50 AND count(*) FILTER (WHERE level = 'far_above') >= 0.4 * count(*)
       ORDER BY max(created_at) DESC LIMIT ${LIMIT}`),

    q("THIN_PICKS", "Thin picks", ["career_today_picks", "career_profiles"], `
      SELECT p.user_id, ${ms("p.created_at")} AS at, p.local_day::text AS day, coalesce(array_length(p.job_ids, 1), 0) AS n
        FROM ${picks}
       WHERE p.local_day BETWEEN ${D0} AND ${D1} AND coalesce(array_length(p.job_ids, 1), 0) < 5
       ORDER BY p.created_at DESC LIMIT ${LIMIT}`),

    q("REPEATED_PICKS", "Repeated picks", ["career_today_picks", "career_profiles"], `
      SELECT * FROM (
        SELECT p.user_id, ${ms("p.created_at")} AS at, p.local_day::text AS day, coalesce(array_length(p.job_ids, 1), 0) AS n,
               (SELECT count(*) FROM unnest(p.job_ids) AS j(id)
                 WHERE EXISTS (SELECT 1 FROM ${S}.career_today_picks q WHERE q.user_id = p.user_id AND q.local_day < p.local_day AND j.id = ANY (q.job_ids))) AS rep
          FROM ${picks}
         WHERE p.local_day BETWEEN ${D0} AND ${D1}) x
       WHERE rep > 0 ORDER BY at DESC LIMIT ${LIMIT}`),

    q("WEAK_PICK", "Weak pick", ["career_today_picks", "career_profiles", "career_llm_fit"], `
      SELECT p.user_id, ${ms("p.created_at")} AS at, p.local_day::text AS day, count(*) AS judged,
             count(*) FILTER (WHERE v.fit < 70 OR v.level IN ('far_above', 'far_below')) AS weak,
             jsonb_agg(jsonb_build_object('job', j.id, 'fit', v.fit, 'level', v.level) ORDER BY v.fit NULLS LAST)
               FILTER (WHERE v.fit < 70 OR v.level IN ('far_above', 'far_below')) AS sample
        FROM ${picks}
        CROSS JOIN LATERAL unnest(p.job_ids) AS j(id)
        CROSS JOIN LATERAL (SELECT f.fit, f.level FROM ${S}.career_llm_fit f WHERE f.job_id = j.id AND f.user_id = p.user_id ORDER BY f.created_at DESC LIMIT 1) v
       WHERE p.local_day BETWEEN ${D0} AND ${D1}
       GROUP BY p.user_id, p.created_at, p.local_day
      HAVING count(*) FILTER (WHERE v.fit < 70 OR v.level IN ('far_above', 'far_below')) > 0
       ORDER BY p.created_at DESC LIMIT ${LIMIT}`),

    // ------------------------------------------------------------- journey
    q("CALL_NOT_CONFIRMED", "Call not confirmed", ["career_voice_calls"], `
      SELECT user_id, id, ${ms("coalesce(updated_at, finished_at, ended_at, created_at)")} AS at,
             extract(epoch FROM (now() - coalesce(updated_at, finished_at, ended_at, created_at))) / 60 AS mins
        FROM ${S}.career_voice_calls
       WHERE status = 'ready' AND created_at >= ${F} AND created_at < ${T} AND user_id IS NOT NULL
         AND coalesce(updated_at, finished_at, ended_at, created_at) < now() - interval '30 minutes'
       ORDER BY created_at DESC LIMIT ${LIMIT}`),

    // The 'onboarded' step is stamped after the jobs were first shown (in prod 66 of 96 saw_jobs came in the 30 minutes before it), so a
    // desk_opened strictly after it alone would flag 87 of 96. Reaching the desk is desk_opened, saw_jobs, job_opened or job_saved from 10 minutes before it (on 7 Nov, after it only
    // flagged 31 of 96, 29 of them had seen their jobs just before) to 30 minutes after.
    q("ONBOARDED_NO_DESK", "Onboarded, no desk", ["career_journey_events"], `
      SELECT DISTINCT ON (e.user_id) e.user_id, ${ms("e.at")} AS at, extract(epoch FROM (now() - e.at)) / 60 AS mins
        FROM ${J} e
       WHERE e.step = 'onboarded' AND e.at >= ${F} AND e.at < ${T} AND e.at < now() - interval '30 minutes' AND e.user_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${J} d WHERE d.user_id = e.user_id AND d.step IN ('desk_opened', 'saw_jobs', 'job_opened', 'job_saved') AND d.at >= e.at - interval '10 minutes' AND d.at <= e.at + interval '30 minutes')
       ORDER BY e.user_id, e.at DESC LIMIT ${LIMIT}`),

    q("MIC_BLOCKED_LEFT", "Mic blocked, left", ["career_journey_events"], `
      SELECT DISTINCT ON (e.user_id) e.user_id, ${ms("e.at")} AS at, extract(epoch FROM (now() - e.at)) / 60 AS mins
        FROM ${J} e
       WHERE e.step = 'call_failed' AND e.props ->> 'reason' = 'mic_denied' AND e.at >= ${F} AND e.at < ${T} AND e.at < now() - interval '1 hour' AND e.user_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${J} d WHERE d.user_id = e.user_id AND d.step IN ('call_started', 'onboarded') AND d.at > e.at AND d.at <= e.at + interval '1 hour')
       ORDER BY e.user_id, e.at DESC LIMIT ${LIMIT}`),

    q("CALL_DROPPED", "Call dropped", ["career_journey_events", "career_voice_calls"], `
      SELECT DISTINCT ON (x.user_id) x.user_id, x.at, x.reason, x.src, extract(epoch FROM (now() - to_timestamp(x.at / 1000))) / 60 AS mins
        FROM (
          SELECT e.user_id, ${ms("e.at")} AS at, coalesce(e.props ->> 'reason', e.props ->> 'error') AS reason, 'event' AS src, e.at AS ts
            FROM ${J} e
           WHERE e.step = 'call_failed' AND coalesce(e.props ->> 'reason', '') <> 'mic_denied' AND e.at >= ${F} AND e.at < ${T} AND e.user_id IS NOT NULL
          UNION ALL
          SELECT c.user_id, ${ms("c.created_at")}, c.error, 'call', c.created_at
            FROM ${S}.career_voice_calls c
           WHERE c.status = 'failed' AND c.created_at >= ${F} AND c.created_at < ${T} AND c.user_id IS NOT NULL) x
       WHERE NOT EXISTS (SELECT 1 FROM ${J} d WHERE d.user_id = x.user_id AND d.step = 'call_completed' AND d.at > x.ts)
         AND NOT EXISTS (SELECT 1 FROM ${S}.career_voice_calls c2 WHERE c2.user_id = x.user_id AND c2.status IN ('finished', 'ready') AND c2.created_at > x.ts)
       ORDER BY x.user_id, x.at DESC LIMIT ${LIMIT}`),

    q("VERIFIED_NO_CALL", "Verified, no call", ["career_journey_events"], `
      SELECT DISTINCT ON (e.user_id) e.user_id, ${ms("e.at")} AS at, extract(epoch FROM (now() - e.at)) / 60 AS mins
        FROM ${J} e
       WHERE e.step = 'phone_verified' AND e.at >= ${F} AND e.at < ${T} AND e.at < now() - interval '24 hours' AND e.user_id IS NOT NULL
         AND NOT EXISTS (SELECT 1 FROM ${J} d WHERE d.user_id = e.user_id AND d.step = 'call_started' AND d.at >= e.at)
       ORDER BY e.user_id, e.at DESC LIMIT ${LIMIT}`),

    // --------------------------------------------------------------- email
    // The cut-word and greeting rules are finished in flags.ts; the read only keeps the emails that could match.
    q("EMAIL_CLIPPED", "Email clipped", ["career_emails"], `
      SELECT e.id, e.user_id, ${ms("e.created_at")} AS at, left(e.subject, 300) AS subject, left(e.body, 8000) AS body
        FROM ${S}.career_emails e
       WHERE e.created_at >= ${F} AND e.created_at < ${T} AND NOT coalesce(e.is_test, false)
         AND (e.body ~ ' [A-Za-z]{1,2}\\.(\\s|$)' OR e.subject ~ ' [A-Za-z]{1,2}\\.(\\s|$)' OR e.body ~ '^\\s*(Hi|Hello|Hey|Dear)\\s+[a-z]')
       ORDER BY e.created_at DESC LIMIT ${LIMIT}`),

    q("FIND_MISSES", "Find misses", ["career_outreach_credits"], `
      SELECT user_id, count(*) FILTER (WHERE reason = 'find') AS finds,
             count(*) FILTER (WHERE reason = 'refund' AND label LIKE 'No verified email%') AS refunds, ${ms("max(created_at)")} AS at
        FROM ${S}.career_outreach_credits
       WHERE created_at >= ${F} AND created_at < ${T} AND reason IN ('find', 'refund')
       GROUP BY user_id
      HAVING count(*) FILTER (WHERE reason = 'find') >= 5
         AND count(*) FILTER (WHERE reason = 'refund' AND label LIKE 'No verified email%') >= 0.4 * count(*) FILTER (WHERE reason = 'find')
       ORDER BY max(created_at) DESC LIMIT ${LIMIT}`),

    // ------------------------------------------------------------ WhatsApp
    q("SEND_NO_INBOX", "Send, no inbox", ["career_channel_messages"], `
      SELECT ${waUser("m")} AS user_id, m.address, count(*) AS n, ${ms("max(m.created_at)")} AS at
        FROM ${S}.career_channel_messages m
       WHERE m.direction = 'in' AND m.kind = 'button' AND lower(m.body) LIKE 'send%' AND m.created_at >= ${F} AND m.created_at < ${T}
         AND EXISTS (SELECT 1 FROM ${S}.career_channel_messages o WHERE o.channel = m.channel AND o.address = m.address AND o.direction = 'out'
                       AND o.created_at >= m.created_at AND o.created_at <= m.created_at + interval '1 minute' AND o.body ILIKE '%connect your inbox%')
       GROUP BY 1, m.address ORDER BY max(m.created_at) DESC LIMIT ${LIMIT}`),

    q("WA_BLOCKED", "WhatsApp blocked", ["career_channel_messages"], `
      SELECT user_id, address, sum(n)::int AS n, max(at) AS at, jsonb_agg(jsonb_build_object('code', code, 'n', n) ORDER BY n DESC) AS codes
        FROM (SELECT ${waUser("m")} AS user_id, m.address, coalesce(m.meta ->> 'error_code', m.meta -> 'error' ->> 'code') AS code, count(*) AS n, ${ms("max(m.created_at)")} AS at
                FROM ${S}.career_channel_messages m
               WHERE m.direction = 'out' AND m.status = 'failed' AND m.created_at >= ${F} AND m.created_at < ${T}
               GROUP BY 1, 2, 3) g
       GROUP BY user_id, address ORDER BY max(at) DESC LIMIT ${LIMIT}`),

    q("WA_UNANSWERED", "WhatsApp unanswered", ["career_channel_messages"], `
      SELECT ${waUser("m")} AS user_id, m.address, count(*) AS n, ${ms("max(m.created_at)")} AS at, extract(epoch FROM (now() - max(m.created_at))) / 60 AS mins
        FROM ${S}.career_channel_messages m
       WHERE m.direction = 'in' AND m.kind = 'text' AND NOT (${LINK_CODE}) AND m.created_at >= ${F} AND m.created_at < ${T} AND m.created_at < now() - interval '2 minutes'
         AND NOT EXISTS (SELECT 1 FROM ${S}.career_channel_messages o WHERE o.channel = m.channel AND o.address = m.address AND o.direction = 'out'
                           AND o.created_at >= m.created_at AND o.created_at <= m.created_at + interval '2 minutes')
       GROUP BY 1, m.address ORDER BY max(m.created_at) DESC LIMIT ${LIMIT}`),

    // ---------------------------------------------------- payments, tickets
    q("CHECKOUT_ABANDONED", "Checkout abandoned", ["career_credit_orders", "career_subscriptions"], `
      SELECT user_id, at, kind, item, amount_paise, currency, later_paid FROM (
        SELECT DISTINCT ON (user_id) * FROM (
          SELECT o.user_id, ${ms("o.created_at")} AS at, 'order' AS kind, o.item, o.amount_paise, o.currency,
                 EXISTS (SELECT 1 FROM ${S}.career_credit_orders p WHERE p.user_id = o.user_id AND p.status IN ('paid', 'refunded') AND p.created_at > o.created_at) AS later_paid
            FROM ${S}.career_credit_orders o
           WHERE o.status = 'created' AND NOT coalesce(o.test, false) AND o.created_at >= ${F} AND o.created_at < ${T} AND o.created_at < now() - interval '1 hour'
          UNION ALL
          SELECT s.user_id, ${ms("s.created_at")}, 'autopay', s.period, s.amount_paise, s.currency,
                 EXISTS (SELECT 1 FROM ${S}.career_plan_grants g WHERE g.user_id = s.user_id AND g.created_at > s.created_at)
            FROM ${S}.career_subscriptions s
           WHERE s.status = 'created' AND NOT coalesce(s.test, false) AND s.created_at >= ${F} AND s.created_at < ${T} AND s.created_at < now() - interval '1 hour') u
         ORDER BY user_id, at DESC) d
       ORDER BY at DESC LIMIT ${LIMIT}`),

    q("PAID_NOT_GRANTED", "Paid, not granted", ["career_credit_orders", "career_outreach_credits", "career_plan_grants"], `
      SELECT o.user_id, o.id::text AS id, o.item, o.amount_paise, o.currency, ${ms("coalesce(o.paid_at, o.created_at)")} AS at,
             extract(epoch FROM (now() - coalesce(o.paid_at, o.created_at))) / 60 AS mins
        FROM ${S}.career_credit_orders o
       WHERE o.status = 'paid' AND NOT coalesce(o.test, false) AND coalesce(o.paid_at, o.created_at) >= ${F} AND coalesce(o.paid_at, o.created_at) < ${T}
         AND NOT EXISTS (SELECT 1 FROM ${S}.career_outreach_credits c
                          WHERE c.user_id = o.user_id AND (c.ref IN ('order:' || o.razorpay_order_id, 'order:' || o.dodo_session_id, 'order:' || o.id::text)
                                OR c.key IN ('purchase:' || o.razorpay_payment_id, 'purchase:' || o.dodo_payment_id)))
         AND NOT EXISTS (SELECT 1 FROM ${S}.career_plan_grants g
                          WHERE g.user_id = o.user_id AND (g.ref IN ('pack:' || o.razorpay_order_id, 'pack:' || o.dodo_session_id, 'pack:' || o.id::text)
                                OR g.payment_id IN (o.razorpay_payment_id, o.dodo_payment_id)))
       ORDER BY coalesce(o.paid_at, o.created_at) DESC LIMIT ${LIMIT}`),

    q("OPEN_TICKET", "Open tickets", ["tickets"], `
      SELECT t.user_id, t.user_email, t.user_name, t.id::text AS id, t.category, t.priority, ${ms("t.created_at")} AS at,
             extract(epoch FROM (now() - t.created_at)) / 60 AS mins
        FROM public.tickets t WHERE t.status = 'open' ORDER BY t.created_at DESC LIMIT ${LIMIT}`),
  ];
}

/** Active WhatsApp links, for the seats banner. */
export const SEATS_SQL = `SELECT count(*)::int AS active FROM ${S}.career_channel_links WHERE channel = 'whatsapp' AND status = 'active'`;

/** Titles for the weak picks: primary key lookups only. */
export const jobTitlesSql = (ids: string[]): string =>
  `SELECT id::text AS id, title, company FROM ${S}.career_jobs WHERE id = ANY (ARRAY[${ids.map((x) => String(Number(x)) ).join(",")}]::bigint[])`;
