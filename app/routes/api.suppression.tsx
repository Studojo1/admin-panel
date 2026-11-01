/**
 * Suppression list and data-removal requests for the /old archive.
 *
 * GET /old/api/suppression?view=suppression&search=&limit=50&offset=0
 * GET /old/api/suppression?view=requests&status=open|done|all
 *
 * job-outreach-svc served these until the old product was retired
 * (2 Nov 2026); they are now read from its tables directly, read only, with
 * the same masking (~/lib/outreach-archive/privacy.server.ts). Adding to the
 * list, logging a request or deleting data is not possible from the archive.
 */
import type { Route } from "./+types/api.suppression";
import { requireAdmin } from "~/lib/auth-helper.server";
import { archiveReadOnly } from "~/lib/archive.server";
import { readFailed, readOnly } from "~/lib/outreach-archive/db.server";
import { listRemovalRequests, listSuppression, privacySchemaReady } from "~/lib/outreach-archive/privacy.server";

const noCache = { "Cache-Control": "no-store" };
const bad = (detail: string) => Response.json({ detail }, { status: 400 });
const notMigrated = () =>
  Response.json({ detail: "Migration 055 is not applied on this database yet." }, { status: 503, headers: noCache });

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const view = url.searchParams.get("view") ?? "suppression";
  try {
    if (view === "suppression") {
      const limit = url.searchParams.get("limit") ?? "50";
      const offset = url.searchParams.get("offset") ?? "0";
      if (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 200) return bad("limit must be 1 to 200");
      if (!/^\d+$/.test(offset)) return bad("offset must be a whole number");
      const search = (url.searchParams.get("search") ?? "").slice(0, 200);
      const body = await readOnly(async (q) =>
        (await privacySchemaReady(q)) ? listSuppression(q, { search, limit: Number(limit), offset: Number(offset) }) : null,
      );
      return body ? Response.json(body, { headers: noCache }) : notMigrated();
    }
    if (view === "requests") {
      const status = url.searchParams.get("status") ?? "all";
      if (status !== "open" && status !== "done" && status !== "all") return bad("status must be open, done or all");
      const body = await readOnly(async (q) => ((await privacySchemaReady(q)) ? listRemovalRequests(q, status) : null));
      return body ? Response.json(body, { headers: noCache }) : notMigrated();
    }
    return bad("view must be suppression or requests");
  } catch (e) {
    return readFailed(`suppression ${view}`, e);
  }
}

// The archive is read only: no new suppressions, requests or deletions.
export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return archiveReadOnly();
}
