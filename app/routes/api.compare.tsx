/**
 * Old vs new (15 Nov 2026): the retired student product against Stu, for /compare. Read only, admin only.
 *
 * GET /api/compare?ns=YYYY-MM-DD&ne=YYYY-MM-DD           the new window (kept to 3 Nov to today)
 *                 &base=best|last|lifetime|month|custom  the old baseline (default best: the old window of the same length)
 *                 &by=signups|revenue                    what "best" means (default sign-ups)
 *                 [&month=YYYY-MM] [&bs=YYYY-MM-DD&be=YYYY-MM-DD]
 *                 [&h=7]                                 count a step only within 7 days of sign-up (default: any time)
 *                 [&fresh=1]                             read again (the old side is otherwise kept 12 hours)
 */
import type { Route } from "./+types/api.compare";
import { requireAdmin } from "~/lib/auth-helper.server";
import { addDays, todayIst } from "~/lib/stu/model";
import { type BaseKind, type BestBy, HORIZON_DAYS, RELAUNCH_DAY } from "~/lib/compare/model";
import { compareReport } from "~/lib/compare/compare.server";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const BASES: BaseKind[] = ["best", "last", "lifetime", "month", "custom"];

export async function loader({ request }: Route.LoaderArgs) {
  const admin = await requireAdmin(request);
  if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(request.url);
  const p = (k: string) => url.searchParams.get(k) || "";
  const today = todayIst();
  const ne = DAY_RE.test(p("ne")) ? p("ne") : today;
  let ns = DAY_RE.test(p("ns")) ? p("ns") : RELAUNCH_DAY;
  if (ns > ne) ns = ne;
  if (ns < addDays(ne, -400)) ns = addDays(ne, -400);
  const kind = (BASES.includes(p("base") as BaseKind) ? p("base") : "best") as BaseKind;
  const by: BestBy = p("by") === "revenue" ? "revenue" : "signups";
  try {
    const out = await compareReport({
      newWin: { start: ns, end: ne },
      base: { kind, by, month: /^\d{4}-\d{2}$/.test(p("month")) ? p("month") : null, start: DAY_RE.test(p("bs")) ? p("bs") : null, end: DAY_RE.test(p("be")) ? p("be") : null },
      horizon: p("h") === String(HORIZON_DAYS) ? HORIZON_DAYS : null,
      fresh: p("fresh") === "1",
    });
    return Response.json(out, { headers: { "Cache-Control": "no-store", "Server-Timing": `compare;dur=${out.ms}` } });
  } catch (err: any) {
    console.error("[api/compare]", err);
    return Response.json({ error: err?.message || "Failed to load" }, { status: 500 });
  }
}
