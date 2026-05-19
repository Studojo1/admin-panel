// Ops alerts — pod restart spike notifications from the in-cluster
// `pod-restart-alerter` CronJob (k8s/ops-alerts/restart-alert.yaml in
// the job-outreach-svc repo).
//
// POST  /api/ops-alerts          — ingest from CronJob (token auth)
// GET   /api/ops-alerts          — list recent alerts (admin auth)
//
// The PATCH /api/ops-alerts/:id route lives in api.ops-alerts.$id.tsx.
import type { Route } from "./+types/api.ops-alerts";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

const INGEST_TOKEN = process.env.OPS_ALERT_INGEST_TOKEN;

let tableReady = false;
async function ensureTable() {
  if (tableReady) return;
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS ops_alerts (
      id SERIAL PRIMARY KEY,
      namespace TEXT NOT NULL,
      pod TEXT NOT NULL,
      container TEXT NOT NULL,
      restart_count INTEGER NOT NULL,
      last_restart_at TIMESTAMPTZ,
      summary TEXT NOT NULL,
      acknowledged_at TIMESTAMPTZ,
      acknowledged_by TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ops_alerts_created_at
      ON ops_alerts (created_at DESC)
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS idx_ops_alerts_open
      ON ops_alerts (acknowledged_at) WHERE acknowledged_at IS NULL
  `);
  tableReady = true;
}

// ── POST: ingest from CronJob ───────────────────────────────────────────────
//
// Body shape sent by the CronJob:
//   { "alerts": [ { namespace, pod, container, restart_count, last_restart_at, summary } ] }
//   { "ok": true }                         (empty pulse — for healthcheck)
export async function action({ request }: Route.ActionArgs) {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  if (!INGEST_TOKEN) {
    return Response.json(
      { error: "Ingest token not configured" },
      { status: 503 },
    );
  }
  const provided = request.headers.get("x-alert-token") ?? "";
  if (provided !== INGEST_TOKEN) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: any;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const alerts: any[] = Array.isArray(body?.alerts) ? body.alerts : [];
  if (alerts.length === 0) {
    return Response.json({ ok: true, inserted: 0 });
  }

  await ensureTable();

  let inserted = 0;
  for (const a of alerts) {
    if (!a?.namespace || !a?.pod || !a?.container) continue;
    const restartCount = Number(a.restart_count) || 0;
    const lastRestartAt = a.last_restart_at || null;
    const summary = String(a.summary || `${a.namespace}/${a.pod} restarted ${restartCount} times`);
    // De-dupe: don't open a new alert if there's already an unacknowledged
    // one for the same pod+container in the last hour.
    const existing = await db.execute(sql`
      SELECT id FROM ops_alerts
      WHERE namespace = ${a.namespace}
        AND pod = ${a.pod}
        AND container = ${a.container}
        AND acknowledged_at IS NULL
        AND created_at > NOW() - INTERVAL '1 hour'
      LIMIT 1
    `);
    if (existing.rows.length > 0) continue;
    await db.execute(sql`
      INSERT INTO ops_alerts
        (namespace, pod, container, restart_count, last_restart_at, summary)
      VALUES
        (${a.namespace}, ${a.pod}, ${a.container}, ${restartCount},
         ${lastRestartAt}, ${summary})
    `);
    inserted++;
  }

  return Response.json({ ok: true, inserted });
}

// ── GET: list for admin UI ──────────────────────────────────────────────────
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const roleResult = await db.execute(
    sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`,
  );
  const role = roleResult.rows[0]?.role as string | null;
  if (role !== "admin" && role !== "ops") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  await ensureTable();

  const url = new URL(request.url);
  const statusFilter = url.searchParams.get("status") || "all"; // all | open | acked
  const limit = Math.min(parseInt(url.searchParams.get("limit") || "100"), 500);

  const whereClause =
    statusFilter === "open"
      ? sql`WHERE acknowledged_at IS NULL`
      : statusFilter === "acked"
        ? sql`WHERE acknowledged_at IS NOT NULL`
        : sql``;

  const [alertsResult, statsResult] = await Promise.all([
    db.execute(sql`
      SELECT id, namespace, pod, container, restart_count, last_restart_at,
             summary, acknowledged_at, acknowledged_by, created_at
      FROM ops_alerts
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `),
    db.execute(sql`
      SELECT
        COUNT(*) AS total,
        COUNT(*) FILTER (WHERE acknowledged_at IS NULL) AS open_count,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS last_24h,
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS last_7d
      FROM ops_alerts
      WHERE created_at > NOW() - INTERVAL '30 days'
    `),
  ]);

  return Response.json({
    alerts: alertsResult.rows,
    stats: statsResult.rows[0],
  });
}
