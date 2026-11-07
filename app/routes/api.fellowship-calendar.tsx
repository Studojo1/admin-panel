import type { Route } from "./+types/api.fellowship-calendar";
import { requireAdmin } from "~/lib/auth-helper.server";
import {
  approveAll,
  approveDraft,
  approveVersion,
  blockPost,
  calendarView,
  fellowExtras,
  isRefused,
  keepOriginal,
  markNudged,
  recordPost,
  releasePost,
  removeDraft,
  removePhoto,
  saveDraft,
  sendBack,
  setNotes,
  setPhotoIdea,
  setPlaybook,
} from "~/lib/fellowship.server";

// The editorial calendar's data (/fellowship-program/calendar). GET is the whole desk,
// or one fellow's stories and earlier posts with ?fellow=<id>. POST is the
// review flow: approve, save, send back or remove Claude's drafts, approve all
// of a fellow's drafts, block an approved post (and release it), record a post the fellow
// reported directly, approve a fellow's own version of a post or keep the original,
// change what photo fits a post or remove one of its photos,
// and the notes and lessons Claude reads. Every POST answers
// with the fresh desk. Adding fellows and hand-written posts go through
// /api/ugc-creators.

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });
const idOf = (v: unknown) => { const n = Number(v); return Number.isInteger(n) && n > 0 && n <= 2147483647 ? n : null; };

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return unauthorized();
  const fellow = idOf(new URL(request.url).searchParams.get("fellow"));
  if (fellow) return Response.json(await fellowExtras(fellow));
  return Response.json(await calendarView());
}

export async function action({ request }: Route.ActionArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return unauthorized();
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return Response.json({ error: "Invalid JSON" }, { status: 400 });
  const by = admin.email;
  const id = idOf(body.id);
  let extra: Record<string, unknown> = {};
  try {
    switch (body.intent) {
      case "save": if (!id) break; await saveDraft(id, body, by); break;
      case "send-back": if (!id) break; await sendBack(id, body, by); break;
      case "approve": if (!id) break; await approveDraft(id, body, by); break;
      case "remove": if (!id) break; await removeDraft(id); break;
      case "approve-all": if (!id) break; extra = await approveAll(id, by); break;
      case "block": if (!id) break; await blockPost(id, body.reason, by); break;
      case "release": if (!id) break; await releasePost(id, by); break;
      case "record": if (!id) break; await recordPost(id, body); break;
      case "version-approve": if (!id) break; await approveVersion(id, body.text, by); break;
      case "version-keep": if (!id) break; await keepOriginal(id, body.reply, by); break;
      case "photo-idea": if (!id) break; await setPhotoIdea(id, body.photoIdea); break;
      case "photo-remove": if (!id) break; await removePhoto(id, body.ref); break;
      case "notes": if (!id) break; await setNotes(id, body); break;
      case "nudged": if (!id) break; await markNudged(id); break;
      case "playbook": await setPlaybook(body.text, by); break;
      default: return Response.json({ error: "Unknown intent" }, { status: 400 });
    }
    if (!id && body.intent !== "playbook") return Response.json({ error: "Invalid id" }, { status: 400 });
  } catch (e) {
    if (isRefused(e)) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return Response.json({ ...(await calendarView()), ...extra });
}
