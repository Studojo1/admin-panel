import type { Route } from "./+types/api.fellowship-proof";
import { requireAdmin } from "~/lib/auth-helper.server";
import { fetchProof, isAnalyticsRef, isProofRef, MAX_PHOTO_BYTES } from "~/lib/fellow-proof.server";
import { addTeamPhoto, calendarView, isRefused } from "~/lib/fellowship.server";

// The pictures fellows add on their page, for the editorial calendar. GET
// streams one (?ref=fellow-proof/…: an analytics screenshot, a post photo, or
// a LinkedIn analytics export, sent as a download) from private storage, never cached. POST ?post=<id> with a JPEG body adds a
// photo to a post that isn't up yet, for a fellow who has none of their own,
// and answers with the fresh desk.

const unauthorized = () => Response.json({ error: "Unauthorized" }, { status: 401 });

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return unauthorized();
  const ref = new URL(request.url).searchParams.get("ref");
  if (!isProofRef(ref)) return Response.json({ error: "Not a fellow's picture" }, { status: 400 });
  const res = await fetchProof(ref);
  if (!res) return Response.json({ error: "Picture storage isn't set up on admin" }, { status: 503 });
  if (!res.ok) return Response.json({ error: res.status === 404 ? "Picture not found" : "Couldn't load the picture" }, { status: res.status === 404 ? 404 : 502 });
  const xlsx = isAnalyticsRef(ref);
  return new Response(res.body, {
    headers: {
      "Content-Type": xlsx ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "image/jpeg",
      ...(xlsx ? { "Content-Disposition": `attachment; filename="linkedin-analytics-${ref.split("/")[2]}.xlsx"` } : {}),
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function action({ request }: Route.ActionArgs) {
  if (!(await requireAdmin(request))) return unauthorized();
  if (request.method !== "POST") return Response.json({ error: "Method not allowed" }, { status: 405 });
  const n = Number(new URL(request.url).searchParams.get("post"));
  if (!Number.isInteger(n) || n <= 0 || n > 2147483647) return Response.json({ error: "Invalid post" }, { status: 400 });
  if ((request.headers.get("content-type") ?? "").toLowerCase() !== "image/jpeg") return Response.json({ error: "Send the photo as a JPEG" }, { status: 415 });
  if (Number(request.headers.get("content-length") ?? 0) > MAX_PHOTO_BYTES) return Response.json({ error: "That photo is too big (5 MB at most)" }, { status: 413 });
  const jpeg = new Uint8Array(await request.arrayBuffer());
  if (jpeg.length > MAX_PHOTO_BYTES) return Response.json({ error: "That photo is too big (5 MB at most)" }, { status: 413 });
  try {
    await addTeamPhoto(n, jpeg);
  } catch (e) {
    if (isRefused(e)) return Response.json({ error: e.message }, { status: e.status });
    throw e;
  }
  return Response.json(await calendarView());
}
