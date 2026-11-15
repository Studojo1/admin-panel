// OLD-VS-NEW (15 Nov 2026): what /compare needs about Stu beyond the Stu dataset (data.server.ts stuData), read with
// the same rules the dataset uses, so they sit next to its numbers: contacts first emailed (a sequence's first real
// email: sent, not a dry run, not a test inbox), positive replies and bounces (career_sequences, not a dry run), and
// refunds (credit orders less refunds, autopay charges revoked). Rows are per Stu person (the dataset's index) and IST
// day, from the count start (3 Nov 2026) on. Read only; kept per copy of the dataset.
import { sql } from "drizzle-orm";
import db from "~/lib/db.server";
import { swrCache } from "~/lib/swr-cache";
import type { StuData } from "~/lib/stu/model";
import type { RefundRow } from "./model";
import { visitorsPerDay } from "./posthog.server";

export interface NewDbExtras {
  reach: [number, string, number][];
  positive: [number, string, number][];
  bounces: [number, string, number][];
  refunds: RefundRow[];
  /** what could not be read here (a table or column this environment lacks) */
  missing: string[];
}

const S = "career_agent";
const dayTz = (x: string) => `to_char((${x}) AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD')`;

async function load(d: StuData): Promise<NewDbExtras> {
  const from = new Date(d.countFrom ?? Date.parse("2026-11-03T00:00:00+05:30")).toISOString();
  const idx = new Map(d.users.map((u, i) => [u.id, i]));
  const out: NewDbExtras = { reach: [], positive: [], bounces: [], refunds: [], missing: [] };
  await db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      const q = async (text: string) => (await tx.execute(sql.raw(text))).rows as any[];
      const cols = await q(`SELECT table_name AS t, column_name AS c FROM information_schema.columns
                             WHERE table_schema = '${S}' AND table_name IN ('career_emails', 'career_sequences', 'career_mail_accounts', 'career_credit_orders', 'career_plan_grants', 'career_subscriptions')`);
      const col = new Set(cols.map((r) => `${r.t}.${r.c}`));
      const has = (t: string) => cols.some((r) => r.t === t);
      const rows = (r: any[], push: (i: number, x: any) => void) => {
        for (const x of r) {
          const i = idx.get(String(x.user_id));
          if (i != null && x.d) push(i, x);
        }
      };
      // Contacts first emailed: as data.server.ts's real email (sent, not a dry run, not a test inbox).
      if (has("career_emails")) {
        const seqJoin = col.has("career_emails.sequence_id") && col.has("career_sequences.dry_run");
        const boxJoin = col.has("career_emails.mailbox_id") && col.has("career_mail_accounts.test");
        const dry = [`coalesce(e.message_id, '') LIKE '<dry-run%'`, seqJoin ? "coalesce(s.dry_run, false)" : null, boxJoin ? "coalesce(mb.test, false)" : null].filter(Boolean).join(" OR ");
        const contact = col.has("career_emails.sequence_id") ? `coalesce(e.sequence_id::text, lower(e.to_email))` : "lower(e.to_email)";
        rows(await q(`
          SELECT user_id, d, count(*)::int AS n FROM (
            SELECT e.user_id, ${contact} AS contact, min(coalesce(e.sent_at, e.created_at)) AS first
              FROM ${S}.career_emails e
              ${seqJoin ? `LEFT JOIN ${S}.career_sequences s ON s.id = e.sequence_id` : ""}
              ${boxJoin ? `LEFT JOIN ${S}.career_mail_accounts mb ON mb.id = e.mailbox_id` : ""}
             WHERE e.status = 'sent' AND NOT (${dry})
             GROUP BY 1, 2) x
           CROSS JOIN LATERAL (SELECT ${dayTz("x.first")} AS d) dd
           WHERE x.first >= '${from}'
           GROUP BY 1, 2`), (i, x) => out.reach.push([i, String(x.d), Number(x.n)]));
      } else out.missing.push("career_emails");
      if (has("career_sequences")) {
        const seqDry = col.has("career_sequences.dry_run") ? "coalesce(dry_run, false)" : "false";
        if (col.has("career_sequences.reply_tag")) {
          rows(await q(`SELECT user_id, ${dayTz("replied_at")} AS d, count(*)::int AS n FROM ${S}.career_sequences
                         WHERE replied_at IS NOT NULL AND replied_at >= '${from}' AND reply_how IS DISTINCT FROM 'bounce' AND NOT ${seqDry} AND reply_tag = 'positive'
                         GROUP BY 1, 2`), (i, x) => out.positive.push([i, String(x.d), Number(x.n)]));
        } else out.missing.push("career_sequences.reply_tag");
        rows(await q(`SELECT user_id, ${dayTz("replied_at")} AS d, count(*)::int AS n FROM ${S}.career_sequences
                       WHERE replied_at IS NOT NULL AND replied_at >= '${from}' AND reply_how = 'bounce' AND NOT ${seqDry}
                       GROUP BY 1, 2`), (i, x) => out.bounces.push([i, String(x.d), Number(x.n)]));
      } else out.missing.push("career_sequences");
      // Refunds, on the day of the payment: [person, day, refunded payments, refunded paise, of them kept nothing].
      if (col.has("career_credit_orders.refunded_paise")) {
        rows(await q(`SELECT user_id, ${dayTz("coalesce(paid_at, created_at)")} AS d, count(*)::int AS n, sum(refunded_paise)::float8 AS paise,
                             count(*) FILTER (WHERE amount_paise - refunded_paise <= 0)::int AS full_n
                        FROM ${S}.career_credit_orders
                       WHERE status IN ('paid', 'refunded') AND NOT test AND coalesce(refunded_paise, 0) > 0 AND coalesce(paid_at, created_at) >= '${from}'
                       GROUP BY 1, 2`), (i, x) => out.refunds.push([i, String(x.d), Number(x.n), Number(x.paise) || 0, Number(x.full_n) || 0]));
      }
      if (col.has("career_plan_grants.subscription_id") && col.has("career_subscriptions.test")) {
        rows(await q(`SELECT g.user_id, ${dayTz("g.created_at")} AS d, count(*)::int AS n, sum(s.amount_paise)::float8 AS paise
                        FROM ${S}.career_plan_grants g JOIN ${S}.career_subscriptions s ON s.razorpay_subscription_id = g.subscription_id
                       WHERE g.source = 'autopay' AND g.payment_id IS NOT NULL AND g.revoked_at IS NOT NULL AND NOT s.test AND g.created_at >= '${from}'
                       GROUP BY 1, 2`), (i, x) => out.refunds.push([i, String(x.d), Number(x.n), Number(x.paise) || 0, Number(x.n) || 0]));
      }
    },
    { accessMode: "read only" },
  );
  return out;
}

/** One read per copy of the Stu dataset (it turns over each minute). */
const extras = new WeakMap<StuData, Promise<NewDbExtras>>();
export function newDbExtras(d: StuData): Promise<NewDbExtras> {
  let p = extras.get(d);
  if (!p) {
    p = load(d);
    extras.set(d, p);
    p.catch(() => extras.delete(d));
  }
  return p;
}

/** PostHog visitors per IST day since the relaunch (the old method, for the same-method row): kept 10 minutes. */
const phNew = swrCache<Record<string, number>>({ freshMs: 10 * 60_000, maxStaleMs: 60 * 60_000, max: 4, onError: (_k, err) => console.error("[compare] new PostHog rebuild failed", err) });
export const newPosthog = (from: string, to: string, fresh = false) => phNew.get(`${from}|${to}`, () => visitorsPerDay(from, to), fresh);
