/**
 * Talent search (12 Nov 2026): students hiring managers on Studojo may find, searched by role, skills, city, job type,
 * experience, grad year, budget and intent, with the graph of who matches what. Read only, admin only.
 *
 * GET /api/talent?q=<words>[&city=<key>][&type=internship|full_time][&exp=fresher|1-3|3+][&grad=YYYY][&active=1]
 *     [&budget=<key>][&relocate=0][&src=call|old][&optin=1][&traits=<key>,<key>][&fam=<family>][&role=<family>/<role>]
 *     [&internal=1][&fresh=1]
 * TALENT-NET (12 Nov 2026): fam and role open a family and a role of the network; they narrow the list, not the network.
 */
import type { Route } from "./+types/api.talent";
import { requireAdmin } from "~/lib/auth-helper.server";
import { FAMILY_ORDER } from "~/lib/talent/families";
import { BUDGETS, DEFAULT_FILTERS, type ExpFilter, type Filters, type SourceFilter, TRAITS, type TypeFilter, cityKey } from "~/lib/talent/model";
import { talentSearch } from "~/lib/talent/talent.server";

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const p = new URL(request.url).searchParams;
  const type = p.get("type") || "any";
  const exp = p.get("exp") || "any";
  const grad = Number(p.get("grad"));
  const budget = p.get("budget") || "";
  const fam = FAMILY_ORDER.includes(p.get("fam") as never) ? (p.get("fam") as string) : "";
  const role = (p.get("role") || "").slice(0, 80);
  const f: Filters = {
    ...DEFAULT_FILTERS,
    q: (p.get("q") || "").slice(0, 200),
    city: cityKey((p.get("city") || "").slice(0, 60)),
    type: (["internship", "full_time"].includes(type) ? type : "any") as TypeFilter,
    exp: (["fresher", "1-3", "3+"].includes(exp) ? exp : "any") as ExpFilter,
    grad: Number.isInteger(grad) && grad >= 1990 && grad <= 2040 ? grad : null,
    active: p.get("active") === "1",
    budget: BUDGETS.some((b) => b.key === budget) ? budget : "",
    relocate: p.get("relocate") !== "0",
    src: (["call", "old"].includes(p.get("src") || "") ? p.get("src") : "all") as SourceFilter,
    optin: p.get("optin") === "1",
    traits: (p.get("traits") || "").split(",").filter((k) => TRAITS.some((t) => t.key === k)),
    fam,
    role: fam && role.startsWith(`${fam}/`) ? role : "",
  };
  try {
    const out = await talentSearch(f, p.get("internal") === "1", p.get("fresh") === "1");
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `talent;dur=${out.ms}` } });
  } catch (err: any) {
    console.error("[api/talent]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
