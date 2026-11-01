// Suppression list and third-party removal requests, ported from
// job-outreach-svc api/routes_privacy_admin.py (GET routes only).
import { createHash } from "node:crypto";
import type { Query, Row } from "./db.server";
import { pyIso } from "./py";

/** services/email_campaign/suppression.email_hash */
function emailHash(address: string | null): string {
  const a = (address ?? "").trim().toLowerCase();
  return a ? createHash("sha256").update(a, "utf8").digest("hex") : "";
}

/** services/email_campaign/suppression.mask: "a•••@zomato.com" */
function mask(address: string | null): string | null {
  const a = (address ?? "").trim().toLowerCase();
  if (!a) return null;
  const at = a.indexOf("@");
  const local = at === -1 ? a : a.slice(0, at);
  const domain = at === -1 ? "" : a.slice(at + 1);
  const first = Array.from(local).slice(0, 1).join("");
  return domain ? `${first}•••@${domain}` : `${first}•••`;
}

/** Migration 055 check: false means the service would have answered 503. */
export async function privacySchemaReady(q: Query): Promise<boolean> {
  const [r] = await q(
    `SELECT to_regclass('public.removal_requests') IS NOT NULL AS rr,
       EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema = 'public' AND table_name = 'suppressed_emails' AND column_name = 'email_hash') AS eh`,
  );
  return !!(r?.rr && r?.eh);
}

function suppressionItem(row: Row) {
  return {
    id: row.id,
    email: row.source === "bounce" ? row.email : mask(row.email),
    source: row.source,
    suppressed_at: pyIso(row.suppressed_at),
    hash_only: row.email === null,
  };
}

export async function listSuppression(q: Query, p: { search: string; limit: number; offset: number }) {
  const s = p.search.trim().toLowerCase();
  const values: unknown[] = [];
  let where = "";
  if (s) {
    values.push(`%${s}%`);
    const conds = [`email ILIKE $1`];
    if (s.includes("@")) {
      values.push(emailHash(s));
      conds.push(`email_hash = $2`);
    }
    where = `WHERE ${conds.join(" OR ")}`;
  }
  const [{ n: total }] = await q(`SELECT count(*) AS n FROM suppressed_emails ${where}`, values);
  const rows = await q(
    `SELECT id, email, source, suppressed_at FROM suppressed_emails ${where}
     ORDER BY suppressed_at DESC, id DESC OFFSET $${values.length + 1} LIMIT $${values.length + 2}`,
    [...values, p.offset, p.limit],
  );
  return { total, items: rows.map(suppressionItem) };
}

export async function listRemovalRequests(q: Query, status: "open" | "done" | "all") {
  const where = status !== "all" ? `WHERE status = $1` : "";
  const order = status === "open" ? `ORDER BY deadline ASC, id ASC` : `ORDER BY received_at DESC, id DESC`;
  const rows = await q(
    `SELECT id, email, received_at, deadline, status, done_at FROM removal_requests ${where} ${order}`,
    status !== "all" ? [status] : [],
  );
  return {
    items: rows.map((r) => ({
      id: r.id,
      email: r.email,
      received_at: pyIso(r.received_at),
      deadline: pyIso(r.deadline),
      status: r.status,
      done_at: pyIso(r.done_at),
    })),
  };
}
