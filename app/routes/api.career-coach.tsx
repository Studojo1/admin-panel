/**
 * Career Coach archive (read only), for /old/career-coach.
 *
 * GET /old/api/career-coach?view=overview|funnel|dropoffs|dropouts|questions|
 *     career-paths|career-paths-students&role=&industry=|scores|students|
 *     locations|active-students&bucket=&granularity=|anonymous-sessions|
 *     transcripts&id=|dashboard&id=|activity&id=|resume-view&id=|resume-file&id=
 *
 * Reads the careercoach database (CAREERCOACH_DATABASE_URL) instead of
 * calling cc-backend, which is retired with the old product. Only the resume
 * file itself still comes from the service while it runs.
 */
import type { Route } from "./+types/api.career-coach";
import { requireAdmin } from "~/lib/auth-helper.server";
import { careerCoachView } from "~/lib/careercoach/views.server";

export async function loader({ request }: Route.LoaderArgs) {
  if (!(await requireAdmin(request))) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return careerCoachView(new URL(request.url));
}
