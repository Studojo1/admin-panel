// Server side of the Stu Auditor (auditor.ts has the words and the counts). Reads
// what the product already records, nothing new: one short read-only
// transaction per source, so a source this database lacks (or one that errors)
// is reported as not checked and the rest still show. Every query is bounded by
// the IST window and ROW_CAP + 1 rows (one over the cap says "capped").
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { internalReason, testUsers } from "./data.server";
import {
  type AuditReport, type AuditRow, ROW_CAP, auditWindow, autopayWords, buildWords, callEndWords, callFailedWords, fmtSecs, inr,
  mailWords, maskNumber, orderWords, runWords, ticketWords, toolWords, waWords,
} from "./auditor";
import { todayIst } from "./model";

const S = "career_agent";
const TABLES = [
  "career_journey_events", "career_voice_calls", "career_resume_builds", "career_runs", "career_threads", "career_messages",
  "career_emails", "career_sequences", "career_mail_accounts", "career_credit_orders", "career_subscriptions",
  "career_channel_messages", "career_channel_links", "career_phones",
];
const LIMIT = ROW_CAP + 1;
const ms = (x: string) => sql.raw(`(extract(epoch from (${x})) * 1000)::float8`);

type Rows = any[];

async function read(text: SQL): Promise<Rows> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
      return (await tx.execute(text)).rows as Rows;
    },
    { accessMode: "read only" },
  );
}

/** A row before the person is known: the server fills email, name and internal from public."user". */
type Draft = Omit<AuditRow, "email" | "name" | "internal"> & { email?: string; name?: string; testRow?: boolean };

async function load(start: string, end: string, internal: boolean): Promise<AuditReport> {
  const today = todayIst();
  const w = auditWindow(start, end, today);
  const from = w.from;
  const to = w.to;
  const now = Date.now();
  const missing: string[] = [];
  const capped: string[] = [];
  const drafts: Draft[] = [];

  const cols = await read(sql`
    SELECT c.relname AS t, a.attname AS c
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
     WHERE ((n.nspname = ${S} AND c.relname = ANY(string_to_array(${TABLES.join(",")}, ',')))
            OR (n.nspname = 'public' AND c.relname IN ('tickets', 'ticket_messages', 'user')))
       AND c.relkind IN ('r', 'p', 'v') AND has_table_privilege(c.oid, 'SELECT')`);
  const have = new Set(cols.map((r) => r.t as string));
  const col = new Set(cols.map((r) => `${r.t}.${r.c}`));
  const has = (t: string) => have.has(t);
  const hasCol = (t: string, c: string) => col.has(`${t}.${c}`);
  const T = (t: string) => sql.raw(`${S}.${t}`);
  const inWindow = (c: string) => sql.raw(`${c} >= '${from}'::timestamptz AND ${c} < '${to}'::timestamptz`);

  /** Runs one source; a missing table or an error leaves a note instead of a page that fails. */
  const source = async (name: string, need: string[], fn: () => Promise<number>) => {
    const lacks = need.filter((t) => !has(t));
    if (lacks.length) {
      missing.push(`${name} (no ${lacks.join(", ")} here)`);
      return;
    }
    try {
      const n = await fn();
      if (n > ROW_CAP) capped.push(name);
    } catch (err: any) {
      console.error("[auditor]", name, err);
      missing.push(`${name} (read failed: ${String(err?.message || err).slice(0, 120)})`);
    }
  };

  // ------------------------------------------------ calls that never started
  await source("Call failures", ["career_journey_events"], async () => {
    const rows = await read(sql`
      SELECT id::text AS id, ${ms("at")} AS at, user_id, visitor_id, props
        FROM ${T("career_journey_events")}
       WHERE step = 'call_failed' AND ${inWindow("at")}
       ORDER BY at DESC LIMIT ${LIMIT}`);
    // A failure before sign-in names a visitor: the account it became, when there is one.
    const vids = [...new Set(rows.filter((r) => !r.user_id && r.visitor_id).map((r) => String(r.visitor_id)))];
    const vlink = new Map<string, string>();
    if (vids.length) {
      for (const r of await read(sql`
        SELECT DISTINCT ON (visitor_id) visitor_id, user_id FROM ${T("career_journey_events")}
         WHERE user_id IS NOT NULL AND visitor_id IN (SELECT jsonb_array_elements_text(${JSON.stringify(vids)}::jsonb))
         ORDER BY visitor_id, at`)) vlink.set(String(r.visitor_id), String(r.user_id));
    }
    for (const r of rows.slice(0, ROW_CAP)) {
      const p = r.props && typeof r.props === "object" ? r.props : {};
      const code = String(p.reason || p.error || "").slice(0, 40);
      const user = r.user_id ?? (r.visitor_id ? vlink.get(String(r.visitor_id)) ?? null : null);
      drafts.push({
        id: `call_failed:${r.id}`, group: "call", kind: "call_failed", code: code || "unknown", at: Number(r.at), user,
        reason: callFailedWords(code), level: code === "mic_denied" || code === "no_mic" ? "warn" : "fail",
        detail: [
          ["Reason sent", code || "none"],
          ["Device", [p.device, p.inapp && p.inapp !== "none" ? `in ${p.inapp}` : null].filter(Boolean).join(", ") || "not sent with this failure"],
          ...(p.path ? [["Page", String(p.path).slice(0, 80)] as [string, string]] : []),
          ...(r.visitor_id ? [["Visitor", `${String(r.visitor_id).slice(0, 12)}${user && !r.user_id ? " (signed in later)" : ""}`] as [string, string]] : []),
        ],
        email: user ? undefined : `visitor ${String(r.visitor_id ?? "").slice(0, 8)}`,
      });
    }
    return rows.length;
  });

  // ------------------------------------- calls ended unfinished, resume builds
  await source("Calls and resume builds", ["career_voice_calls"], async () => {
    const mode = hasCol("career_voice_calls", "mode") ? "coalesce(c.mode, 'onboarding')" : "'onboarding'";
    const built = has("career_resume_builds") ? `EXISTS (SELECT 1 FROM ${S}.career_resume_builds b WHERE b.call_id = c.id)` : "false";
    const carried = hasCol("career_voice_calls", "context") ? "CASE WHEN jsonb_typeof(c.context) = 'object' THEN c.context->>'carried_to' END" : "NULL::text";
    const rows = await read(sql`
      SELECT c.id::text AS id, c.user_id, ${sql.raw(mode)} AS mode, c.status, c.error, ${ms("c.created_at")} AS at,
             (c.started_at IS NOT NULL) AS started, c.duration_s, (c.resume IS NOT NULL) AS resume, ${sql.raw(built)} AS built,
             CASE WHEN jsonb_typeof(c.timeline) = 'array' THEN jsonb_array_length(c.timeline) END AS events,
             CASE WHEN jsonb_typeof(c.timeline) = 'array' AND jsonb_array_length(c.timeline) > 0 THEN left((c.timeline -> -1)::text, 120) END AS last_event,
             CASE WHEN jsonb_typeof(c.turns) = 'array' THEN jsonb_array_length(c.turns) END AS turns,
             ${sql.raw(carried)} AS carried_to
        FROM ${T("career_voice_calls")} c
       WHERE ${inWindow("c.created_at")}
         AND (c.error IS NOT NULL OR c.status = 'failed' OR ${sql.raw(mode)} = 'build')
       ORDER BY c.created_at DESC LIMIT ${LIMIT}`);
    for (const r of rows.slice(0, ROW_CAP)) {
      const dur = r.duration_s == null ? null : Number(r.duration_s);
      const detail: [string, string][] = [
        ["Call", String(r.id)],
        ["Mode", String(r.mode)],
        ["Status", `${r.status}${r.error ? `, error ${r.error}` : ""}`],
        ["Connected", r.started ? "yes" : "no"],
        ["Length", dur == null ? "not saved" : fmtSecs(dur)],
        ["Turns", r.turns == null ? "none saved" : String(r.turns)],
        ["Last timeline event", r.last_event ? `${r.last_event} (of ${r.events})` : "none"],
      ];
      if (r.carried_to) detail.push(["Carried to", `call ${String(r.carried_to).slice(0, 12)}: they started again`]);
      if (r.mode === "build") {
        const words = buildWords({ status: String(r.status), error: r.error ?? null, duration_s: dur, produced: Boolean(r.built || r.resume), ageMs: now - Number(r.at) });
        if (!words) continue;
        detail.push(["Resume made", r.built ? "yes" : "no (no career_resume_builds row)"]);
        drafts.push({
          id: `build:${r.id}`, group: "resume", kind: "build_failed", code: String(r.error || r.status), at: Number(r.at), user: r.user_id ?? null,
          reason: words, level: r.carried_to ? "warn" : "fail", detail,
        });
        continue;
      }
      drafts.push({
        id: `call:${r.id}`, group: "call_end", kind: "call_unfinished", code: String(r.error || r.status), at: Number(r.at), user: r.user_id ?? null,
        reason: `${callEndWords(String(r.status), r.error ?? null)}${r.mode !== "onboarding" ? ` (${r.mode} call)` : ""}`,
        level: r.carried_to ? "warn" : "fail", detail,
      });
    }
    return rows.length;
  });

  // ------------------------------------------------------------ Stu chat
  await source("Stu replies", ["career_runs"], async () => {
    const thread = has("career_threads") ? sql`LEFT JOIN ${T("career_threads")} t ON t.id = r.thread_id` : sql``;
    const scope = has("career_threads") ? sql.raw("t.scope") : sql.raw("NULL::text");
    const asked = has("career_messages")
      ? sql`(SELECT left(m.content, 200) FROM ${T("career_messages")} m WHERE m.thread_id = r.thread_id AND m.role = 'user' AND m.created_at <= r.started_at + interval '5 seconds' ORDER BY m.created_at DESC LIMIT 1)`
      : sql.raw("NULL::text");
    const rows = await read(sql`
      SELECT r.id::text AS id, r.user_id, r.thread_id, r.status, r.error, ${ms("r.started_at")} AS at, ${ms("r.finished_at")} AS fin, ${scope} AS scope, ${asked} AS asked
        FROM ${T("career_runs")} r ${thread}
       WHERE ${inWindow("r.started_at")}
         AND (r.status = 'error' OR (r.status = 'running' AND r.started_at < now() - interval '15 minutes'))
       ORDER BY r.started_at DESC LIMIT ${LIMIT}`);
    for (const r of rows.slice(0, ROW_CAP)) {
      drafts.push({
        id: `run:${r.id}`, group: "chat", kind: "run_error", code: String(r.error || r.status).slice(0, 60), at: Number(r.at), user: r.user_id ?? null,
        reason: runWords(String(r.status), r.error ?? null), level: "fail",
        detail: [
          ["Run", `${r.id} in thread ${r.thread_id}${r.scope ? ` (${r.scope})` : ""}`],
          ["Error", String(r.error || r.status)],
          ["Took", r.fin == null ? "never finished" : fmtSecs(Math.round((Number(r.fin) - Number(r.at)) / 1000))],
          ["They had said", r.asked ? String(r.asked) : "(not found)"],
        ],
      });
    }
    return rows.length;
  });

  await source("Stu tools", ["career_messages", "career_threads"], async () => {
    const rows = await read(sql`
      SELECT m.id::text AS id, t.user_id, m.thread_id, t.scope, m.tool_name, left(m.content, 400) AS content, ${ms("m.created_at")} AS at,
             (SELECT left(u.content, 200) FROM ${T("career_messages")} u WHERE u.thread_id = m.thread_id AND u.role = 'user' AND u.id < m.id ORDER BY u.id DESC LIMIT 1) AS asked
        FROM ${T("career_messages")} m JOIN ${T("career_threads")} t ON t.id = m.thread_id
       WHERE m.role = 'tool' AND m.content LIKE 'Error:%' AND ${inWindow("m.created_at")}
       ORDER BY m.created_at DESC LIMIT ${LIMIT}`);
    for (const r of rows.slice(0, ROW_CAP)) {
      const t = toolWords(String(r.tool_name || ""), String(r.content || ""));
      drafts.push({
        id: `tool:${r.id}`, group: "chat", kind: "tool_error", code: t.code, at: Number(r.at), user: r.user_id ?? null, reason: t.reason, level: t.level,
        detail: [
          ["Tool", String(r.tool_name || "unknown")],
          ["Answer", String(r.content)],
          ["Thread", `${r.thread_id}${r.scope ? ` (${r.scope})` : ""}`],
          ["They had said", r.asked ? String(r.asked) : "(not found)"],
        ],
      });
    }
    return rows.length;
  });

  // ------------------------------------------------------------- emails
  await source("Email sends", ["career_emails"], async () => {
    const test = hasCol("career_emails", "is_test") ? "coalesce(e.is_test, false)" : "false";
    const rows = await read(sql`
      SELECT e.id::text AS id, e.user_id, e.kind, e.to_email, left(e.subject, 120) AS subject, e.error, e.from_email, ${sql.raw(test)} AS test, ${ms("e.created_at")} AS at
        FROM ${T("career_emails")} e
       WHERE e.status = 'failed' AND ${inWindow("e.created_at")}
       ORDER BY e.created_at DESC LIMIT ${LIMIT}`);
    for (const r of rows.slice(0, ROW_CAP)) {
      drafts.push({
        id: `email:${r.id}`, group: "email", kind: "email_failed", code: String(r.error || "unknown"), at: Number(r.at), user: r.user_id ?? null,
        reason: mailWords(r.error ?? null), level: r.error === "not_live" ? "warn" : "fail", testRow: Boolean(r.test),
        detail: [["To", String(r.to_email || "")], ["Subject", String(r.subject || "")], ["From", String(r.from_email || "")], ["Kind", String(r.kind || "")], ["Error code", String(r.error || "none")]],
      });
    }
    return rows.length;
  });

  await source("Bounces", ["career_sequences"], async () => {
    const dry = hasCol("career_sequences", "dry_run") ? "coalesce(s.dry_run, false)" : "false";
    const test = hasCol("career_sequences", "is_test") ? "coalesce(s.is_test, false)" : "false";
    const rows = await read(sql`
      SELECT s.id::text AS id, s.user_id, s.to_email, s.to_name, s.status, ${sql.raw(dry)} AS dry, ${sql.raw(test)} AS test, ${ms("s.replied_at")} AS at
        FROM ${T("career_sequences")} s
       WHERE s.reply_how = 'bounce' AND ${inWindow("s.replied_at")}
       ORDER BY s.replied_at DESC LIMIT ${LIMIT}`);
    for (const r of rows.slice(0, ROW_CAP)) {
      drafts.push({
        id: `bounce:${r.id}`, group: "email", kind: "bounce", code: "bounce", at: Number(r.at), user: r.user_id ?? null,
        reason: `Bounced: ${r.to_email || "the address"} did not get the email`, level: "fail", testRow: Boolean(r.dry || r.test),
        detail: [["To", `${r.to_name ? `${r.to_name} ` : ""}${r.to_email || ""}`], ["Sequence", `${r.id}, now ${r.status}`], ["Dry run", r.dry ? "yes" : "no"]],
      });
    }
    return rows.length;
  });

  await source("Mailboxes", ["career_mail_accounts"], async () => {
    const c = (name: string, expr: string, none: string) => sql.raw(hasCol("career_mail_accounts", name) ? expr : none);
    const readChecked = hasCol("career_mail_accounts", "read_error") && hasCol("career_mail_accounts", "read_checked_at");
    const replies = hasCol("career_mail_accounts", "replies_error") && hasCol("career_mail_accounts", "replies_checked_at");
    const rows = await read(sql`
      SELECT id::text AS id, user_id, email, provider, left(last_error, 200) AS last_error, ${ms("failed_at")} AS failed,
             ${c("read_error", "left(read_error, 200)", "NULL::text")} AS read_error, ${readChecked ? ms("read_checked_at") : sql.raw("NULL::float8")} AS read_at,
             ${c("replies_error", "left(replies_error, 200)", "NULL::text")} AS replies_error, ${replies ? ms("replies_checked_at") : sql.raw("NULL::float8")} AS replies_at,
             ${c("test", "coalesce(test, false)", "false")} AS test
        FROM ${T("career_mail_accounts")}
       WHERE (${inWindow("failed_at")})
          ${readChecked ? sql`OR (read_error IS NOT NULL AND ${inWindow("read_checked_at")})` : sql``}
          ${replies ? sql`OR (replies_error IS NOT NULL AND ${inWindow("replies_checked_at")})` : sql``}
       LIMIT ${LIMIT}`);
    const fromMs = Date.parse(from);
    const toMs = Date.parse(to);
    const within = (x: unknown) => x != null && Number(x) >= fromMs && Number(x) < toMs;
    for (const r of rows.slice(0, ROW_CAP)) {
      const box = `${r.email} (${r.provider})`;
      const add = (key: string, at: number, reason: string, err: string) =>
        drafts.push({
          id: `mailbox:${key}:${r.id}`, group: "email", kind: "mailbox", code: `mailbox ${key}`, at, user: r.user_id ?? null, reason, level: "fail", testRow: Boolean(r.test),
          detail: [["Mailbox", box], ["Error", err || "none saved"]],
        });
      if (within(r.failed)) add("send", Number(r.failed), `Mailbox stopped sending: ${r.last_error || "no error saved"}`, String(r.last_error || ""));
      if (r.read_error && within(r.read_at)) add("read", Number(r.read_at), `Could not read the mailbox for replies: ${r.read_error}`, String(r.read_error));
      if (r.replies_error && within(r.replies_at)) add("replies", Number(r.replies_at), `Reply check failed: ${r.replies_error}`, String(r.replies_error));
    }
    return rows.length;
  });

  // ------------------------------------------------------------- payments
  await source("Payments", ["career_credit_orders"], async () => {
    const reason = hasCol("career_credit_orders", "failed_reason") ? "o.failed_reason" : "NULL::text";
    const item = hasCol("career_credit_orders", "item") ? "o.item" : "NULL::text";
    const provider = hasCol("career_credit_orders", "provider") ? "o.provider" : "'razorpay'";
    const rows = await read(sql`
      SELECT o.id::text AS id, o.user_id, o.status, ${sql.raw(item)} AS item, o.amount_paise, o.currency, ${sql.raw(reason)} AS failed_reason,
             ${sql.raw(provider)} AS provider, o.test, ${ms("o.created_at")} AS at,
             (SELECT min(p.id)::text FROM ${T("career_credit_orders")} p WHERE p.user_id = o.user_id AND p.status IN ('paid', 'refunded') AND p.created_at > o.created_at) AS paid_later
        FROM ${T("career_credit_orders")} o
       WHERE ${inWindow("o.created_at")}
         AND (o.status IN ('failed', 'mismatch') OR (o.status = 'created' AND o.created_at < now() - interval '30 minutes'))
       ORDER BY o.created_at DESC LIMIT ${LIMIT}`);
    for (const r of rows.slice(0, ROW_CAP)) {
      const usd = r.currency && String(r.currency).toUpperCase() !== "INR";
      const o = { status: String(r.status), item: r.item ?? null, amount_paise: usd ? null : r.amount_paise == null ? null : Number(r.amount_paise), failed_reason: r.failed_reason ?? null };
      const abandoned = o.status === "created";
      drafts.push({
        id: `order:${r.id}`, group: "pay", kind: abandoned ? "order_abandoned" : "order_failed", code: abandoned ? "never paid" : `${o.status}${o.failed_reason ? `: ${o.failed_reason}` : ""}`.slice(0, 60),
        at: Number(r.at), user: r.user_id ?? null, reason: orderWords(o), level: abandoned ? "warn" : "fail", testRow: Boolean(r.test),
        detail: [
          ["Order", `${r.id} (${r.provider})`],
          ["Amount", usd ? `${(Number(r.amount_paise) / 100).toFixed(2)} ${r.currency}` : inr(Number(r.amount_paise))],
          ["Status", String(r.status)],
          ...(abandoned ? [["Paid another order later", r.paid_later ? `yes (order ${r.paid_later})` : "no"] as [string, string]] : []),
        ],
      });
    }
    return rows.length;
  });

  await source("Autopay", ["career_subscriptions"], async () => {
    const rows = await read(sql`
      SELECT id::text AS id, user_id, status, period, amount_paise, test, razorpay_subscription_id AS rzp,
             CASE WHEN status = 'created' THEN ${ms("created_at")} ELSE ${ms("updated_at")} END AS at
        FROM ${T("career_subscriptions")}
       WHERE (status IN ('pending', 'halted') AND ${inWindow("updated_at")})
          OR (status = 'created' AND ${inWindow("created_at")} AND created_at < now() - interval '30 minutes')
       ORDER BY at DESC LIMIT ${LIMIT}`);
    for (const r of rows.slice(0, ROW_CAP)) {
      drafts.push({
        id: `autopay:${r.id}`, group: "pay", kind: "autopay", code: `autopay ${r.status}`, at: Number(r.at), user: r.user_id ?? null,
        reason: autopayWords(String(r.status), r.period ?? null), level: r.status === "created" ? "warn" : "fail", testRow: Boolean(r.test),
        detail: [["Subscription", `${r.id} (${r.rzp || "no Razorpay id"})`], ["Plan", `${r.period || "?"}, ${inr(Number(r.amount_paise))}`], ["Status", String(r.status)]],
      });
    }
    return rows.length;
  });

  // ------------------------------------------------------------- tickets
  if (!has("tickets")) missing.push("Bug tickets (no public.tickets here)");
  else
    await source("Bug tickets", [], async () => {
      const first = has("ticket_messages")
        ? sql`(SELECT left(m.body, 200) FROM public.ticket_messages m WHERE m.ticket_id = t.id ORDER BY m.created_at ASC LIMIT 1)`
        : sql.raw("NULL::text");
      const rows = await read(sql`
        SELECT t.id::text AS id, t.user_id, t.user_email, t.user_name, t.category, t.status, t.priority, t.source,
               CASE WHEN jsonb_typeof(t.context) = 'object' THEN t.context->>'summary' END AS summary, ${first} AS first, ${ms("t.created_at")} AS at
          FROM public.tickets t
         WHERE t.category IN ('bug', 'website_broken') AND ${inWindow("t.created_at")}
         ORDER BY t.created_at DESC LIMIT ${LIMIT}`);
      for (const r of rows.slice(0, ROW_CAP)) {
        drafts.push({
          id: `ticket:${r.id}`, group: "ticket", kind: "ticket", code: String(r.category), at: Number(r.at), user: r.user_id ?? null,
          email: r.user_id ? undefined : String(r.user_email || ""), name: r.user_id ? undefined : String(r.user_name || ""),
          reason: ticketWords(String(r.category), r.summary ?? null, r.first ?? null), level: "fail", href: `/tickets/${r.id}`,
          detail: [["Ticket", `${r.id}, ${r.status}, ${r.priority} priority`], ["From", `${r.source || "?"}`], ["First message", r.first ? String(r.first) : "(none)"]],
        });
      }
      return rows.length;
    });

  // ------------------------------------------------------------- WhatsApp
  await source("WhatsApp", ["career_channel_messages"], async () => {
    const byLink = has("career_channel_links")
      ? sql`(SELECT l.user_id FROM ${T("career_channel_links")} l WHERE l.channel = m.channel AND l.address = m.address ORDER BY l.created_at DESC LIMIT 1)`
      : sql.raw("NULL::text");
    const byPhone = has("career_phones")
      ? sql`(SELECT p.user_id FROM ${T("career_phones")} p WHERE regexp_replace(p.phone, '[^0-9]', '', 'g') = regexp_replace(m.address, '[^0-9]', '', 'g') LIMIT 1)`
      : sql.raw("NULL::text");
    const rows = await read(sql`
      SELECT m.id::text AS id, m.channel, m.direction, m.status, m.kind, m.address, coalesce(m.user_id, ${byLink}, ${byPhone}) AS user_id, ${ms("m.created_at")} AS at,
             m.meta->>'error_code' AS error_code, left(m.meta->>'error', 120) AS error, left(m.meta->>'refused', 60) AS refused, m.meta->>'link' AS link,
             m.meta->>'event' AS event, CASE WHEN m.direction = 'out' THEN left(m.body, 160) END AS body
        FROM ${T("career_channel_messages")} m
       WHERE ${inWindow("m.created_at")}
         AND ((m.direction = 'out' AND (m.status IN ('failed', 'held') OR m.meta ? 'refused'))
              OR (m.direction = 'in' AND m.meta->>'link' IS NOT NULL AND m.meta->>'link' <> 'linked'))
       ORDER BY m.created_at DESC LIMIT ${LIMIT}`);
    for (const r of rows.slice(0, ROW_CAP)) {
      const x = waWords({ direction: String(r.direction), status: String(r.status), error_code: r.error_code ?? null, error: r.error ?? null, refused: r.refused ?? null, link: r.link ?? null });
      drafts.push({
        id: `wa:${r.id}`, group: "whatsapp", kind: x.kind, code: x.code, at: Number(r.at), user: r.user_id ?? null, reason: x.reason, level: x.level,
        email: r.user_id ? undefined : `number ${maskNumber(r.address)}`,
        detail: [
          ["Number", maskNumber(r.address)],
          ["Message", `${r.direction === "out" ? "ours" : "theirs"}, ${r.kind}${r.event ? `, ${r.event}` : ""}, status ${r.status}`],
          ...(r.error_code || r.error ? [["Meta said", `${r.error_code ?? ""} ${r.error ?? ""}`.trim()] as [string, string]] : []),
          ...(r.body ? [["Text", String(r.body)] as [string, string]] : []),
        ],
      });
    }
    return rows.length;
  });

  // --------------------------------------------------------------- people
  const ids = [...new Set(drafts.map((d) => d.user).filter((x): x is string => !!x))];
  const people = new Map<string, { email: string; name: string; role: string | null }>();
  if (ids.length) {
    for (const r of await read(sql`SELECT id, email, name, role FROM public."user" WHERE id IN (SELECT jsonb_array_elements_text(${JSON.stringify(ids)}::jsonb))`)) {
      people.set(String(r.id), { email: r.email ?? "", name: r.name ?? "", role: r.role ?? null });
    }
  }
  const tests = testUsers();
  const rows: AuditRow[] = [];
  for (const d of drafts) {
    const p = d.user ? people.get(d.user) : undefined;
    const email = p?.email ?? d.email ?? "";
    const name = p?.name ?? d.name ?? "";
    const why = d.user || email.includes("@") ? internalReason({ id: d.user ?? "", email, role: p?.role ?? null }, tests) : null;
    const internalWhy = why ?? (d.testRow ? "test row" : null);
    if (internalWhy && !internal) continue;
    const { testRow: _t, ...rest } = d;
    rows.push({ ...rest, email, name, internal: internalWhy });
  }
  rows.sort((a, b) => b.at - a.at);

  const env = await read(sql`SELECT current_database() AS db`).then((r) => (/staging/i.test(String(r[0]?.db ?? "")) ? "staging" : "production")).catch(() => "unknown");
  return { generatedAt: new Date().toISOString(), env, start, end, sinceFrom: w.sinceFrom, rows, missing, capped };
}

const cache = new Map<string, { at: number; data: Promise<AuditReport> }>();
const TTL_MS = 60_000;

/** The audit for an IST range (and yesterday and today, for the top line), at most a minute old (fresh: read now). */
export function audit(start: string, end: string, internal: boolean, fresh = false): Promise<AuditReport> {
  const key = `${start}|${end}|${internal ? 1 : 0}|${todayIst()}`;
  const hit = cache.get(key);
  if (!fresh && hit && Date.now() - hit.at < TTL_MS) return hit.data;
  const data = load(start, end, internal);
  if (cache.size > 30) cache.clear();
  cache.set(key, { at: Date.now(), data });
  data.catch(() => {
    if (cache.get(key)?.data === data) cache.delete(key);
  });
  return data;
}

/** For a local dry run against a read-only connection. */
export const _load = load;
