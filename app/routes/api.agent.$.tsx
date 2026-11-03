import { timingSafeEqual } from "node:crypto";
import type { Route } from "./+types/api.agent.$";
import {
  addDrafts,
  addEarlierPosts,
  agentFeedback,
  agentFellow,
  agentDraft,
  agentResults,
  agentRoster,
  agentStories,
  appendTeamNotes,
  isRefused,
  programmeRules,
  reviseDraft,
  setInsight,
  setLearnings,
  setPlaybook,
} from "~/lib/fellowship.server";
import { ensureCreatorTables, istDate } from "~/lib/ugc-creators.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

// Vanshika's Claude Code (/api/agent/...). Not an admin login: a shared key in
// FELLOWSHIP_AGENT_KEY, sent as "Authorization: Bearer <key>". It reads what it
// needs to write one fellow's posts, saves drafts for the team to review,
// revises drafts the team sent back, and records what it learned from results.
// Nothing here approves a draft or puts anything on a fellow's page.

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body, null, 2), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

function keyOk(request: Request): boolean {
  const want = process.env.FELLOWSHIP_AGENT_KEY || "";
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (want.length < 32) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}
const denied = () => json({ error: "Missing or wrong key. Send it as the header Authorization: Bearer <key>." }, 401);
const idOf = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null; };
const parts = (params: Route.LoaderArgs["params"]) => String(params["*"] ?? "").split("/").filter(Boolean);

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!keyOk(request)) return denied();
  const [what, a, b, c] = parts(params);
  if (!what) {
    await ensureCreatorTables();
    const n = (await db.execute(sql`SELECT COUNT(*)::int AS n FROM ugc_creators WHERE status <> 'removed'`)).rows[0] as { n: number };
    return json({ ok: true, today: istDate(), fellows: Number(n.n) });
  }
  if (what === "fellows" && !a) return json(await agentRoster());
  // One page of a fellow's stories in full: their context lists which page each older story is on.
  if (what === "fellows" && a && b === "stories") {
    const id = idOf(a), page = c ? idOf(c) : 1;
    if (!page) return json({ error: "Pages are numbered from 1: /api/agent/fellows/<id>/stories/<page>." }, 400);
    const data = id ? await agentStories(id, page) : null;
    return data ? json(data) : json({ error: "No fellow with that id. GET /api/agent/fellows lists them." }, 404);
  }
  if (what === "fellows" && a && !b) {
    const id = idOf(a);
    const data = id ? await agentFellow(id) : null;
    return data ? json(data) : json({ error: "No fellow with that id. GET /api/agent/fellows lists them." }, 404);
  }
  if (what === "feedback") return json(await agentFeedback());
  if (what === "results") return json(await agentResults(new URL(request.url).searchParams.get("pending") === "1"));
  if (what === "playbook") {
    const r = (await db.execute(sql`SELECT text, updated_at, updated_by FROM ugc_playbook WHERE id = 1`)).rows[0] ?? {};
    return json(r);
  }
  if (what === "programme") return json(await programmeRules());
  return json({ error: "Not found" }, 404);
}

export async function action({ request, params }: Route.ActionArgs) {
  if (!keyOk(request)) return denied();
  if (request.method !== "POST") return json({ error: "Use GET or POST." }, 405);
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return json({ error: "Send a JSON body." }, 400);
  const [what, a, b] = parts(params);
  const id = idOf(a);
  try {
    if (what === "fellows" && id && b === "drafts") {
      const ids = await addDrafts(id, body.posts, body.batch);
      return json({ saved: ids.length, draftIds: ids, next: "They wait on the team's calendar until someone approves them. Nothing reaches the fellow before that." });
    }
    if (what === "fellows" && id && b === "learnings") { await setLearnings(id, body.text); return json({ ok: true }); }
    if (what === "fellows" && id && b === "notes") return json({ ok: true, teamNotes: await appendTeamNotes(id, body.text) });
    if (what === "fellows" && id && b === "earlier-posts") return json(await addEarlierPosts(id, body.posts));
    if (what === "drafts" && id && !b) return json({ ok: true, draft: agentDraft(await reviseDraft(id, body)) });
    if (what === "posts" && id && b === "insight") { await setInsight(id, body.note); return json({ ok: true }); }
    if (what === "playbook" && !a) { await setPlaybook(body.text, "claude"); return json({ ok: true }); }
  } catch (e) {
    if (isRefused(e)) return json({ error: e.message, saved: 0 }, e.status);
    throw e;
  }
  return json({ error: "Not found" }, 404);
}
