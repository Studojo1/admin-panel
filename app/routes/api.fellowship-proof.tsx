import type { Route } from "./+types/api.fellowship-proof";
import { requireAdmin } from "~/lib/auth-helper.server";
import { fetchProof, isProofRef } from "~/lib/fellow-proof.server";

// One analytics screenshot a fellow uploaded (?ref=fellow-proof/…), streamed
// from private storage for the editorial calendar. Never cached.

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const ref = new URL(request.url).searchParams.get("ref");
  if (!isProofRef(ref)) return Response.json({ error: "Not a screenshot" }, { status: 400 });
  const res = await fetchProof(ref);
  if (!res) return Response.json({ error: "Screenshot storage isn't set up on admin" }, { status: 503 });
  if (!res.ok) return Response.json({ error: res.status === 404 ? "Screenshot not found" : "Couldn't load the screenshot" }, { status: res.status === 404 ? 404 : 502 });
  return new Response(res.body, {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" },
  });
}
