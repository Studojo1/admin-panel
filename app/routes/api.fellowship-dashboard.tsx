import type { Route } from "./+types/api.fellowship-dashboard";
import { requireAdmin } from "~/lib/auth-helper.server";
import { programmeDashboard } from "~/lib/fellowship.server";

// The programme dashboard's data (/fellowship-program). Read only: the work
// itself happens on the calendar (/fellowship-program/calendar).

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json(await programmeDashboard());
}
