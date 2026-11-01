// One entry point per cc-backend admin route the Career Coach page used.
// Each returns the JSON cc-backend returned (see the files it imports).
import { retiredNote } from "~/lib/retired-service";
import {
  buildCareerPathAnalytics,
  buildDropoffReport,
  buildDropoutReport,
  buildFunnelReport,
  buildOverviewStats,
  buildQuestionAnalytics,
  buildScoreMovementReport,
} from "./analytics.server";
import { CC_DB_NOT_CONFIGURED, careerCoachConfigured } from "./db.server";
import { CC_SERVICE, resumeFile, resumeFileOnDisk } from "./service.server";
import {
  BadRequest,
  NotFound,
  buildActiveStudents,
  buildCareerPathStudents,
  buildDashboard,
  buildLocations,
  buildResumeView,
  buildStudentActivity,
  buildStudents,
  buildTranscripts,
} from "./students.server";

const noStore = { "Cache-Control": "no-store" };
const json = (body: unknown, status = 200) => Response.json(body, { status, headers: noStore });

const ID_RE = /^[A-Za-z0-9_-]{1,128}$/;

export async function careerCoachView(url: URL): Promise<Response> {
  const view = url.searchParams.get("view") ?? "";
  const p = (k: string) => url.searchParams.get(k);
  const id = p("id") ?? "";
  const needsId = ["transcripts", "dashboard", "activity", "resume-view", "resume-file"].includes(view);
  if (needsId && !ID_RE.test(id)) return json({ detail: "id is required" }, 400);

  // The original download only needed the file, not the database.
  if (view === "resume-file") return resumeFile(id);

  if (!careerCoachConfigured()) {
    return json({ not_configured: true, error: CC_DB_NOT_CONFIGURED, detail: CC_DB_NOT_CONFIGURED }, 503);
  }
  try {
    switch (view) {
      case "overview":
        return json(await buildOverviewStats());
      case "funnel":
        return json(await buildFunnelReport());
      case "dropoffs":
        return json(await buildDropoffReport());
      case "dropouts":
        return json(await buildDropoutReport());
      case "questions":
        return json(await buildQuestionAnalytics());
      case "career-paths":
        return json(await buildCareerPathAnalytics());
      case "career-paths-students":
        return json(await buildCareerPathStudents(p("role"), p("industry")));
      case "scores":
        return json(await buildScoreMovementReport());
      case "students":
        return json(await buildStudents());
      case "locations":
        return json(await buildLocations());
      case "active-students":
        return json(await buildActiveStudents(p("bucket") ?? "", p("granularity") ?? "hour"));
      case "anonymous-sessions":
        // The deployed cc-backend never had this route (it answered 404); kept so the panel behaves the same.
        return json({ detail: "Not Found" }, 404);
      case "transcripts":
        return json(await buildTranscripts(id));
      case "dashboard":
        return json(await buildDashboard(id));
      case "activity":
        return json(await buildStudentActivity(id));
      case "resume-view": {
        const onDisk = await resumeFileOnDisk(id);
        const body: Record<string, unknown> = await buildResumeView(id, onDisk === true);
        if (onDisk === null) Object.assign(body, { retired: true, service: CC_SERVICE, error: retiredNote(CC_SERVICE) });
        return json(body);
      }
      default:
        return json({ detail: "Unknown view" }, 400);
    }
  } catch (e) {
    if (e instanceof NotFound) return json({ detail: e.message }, 404);
    if (e instanceof BadRequest) return json({ detail: e.message }, 400);
    console.error(`[careercoach] ${view} failed: ${(e as Error).message}`);
    return json({ error: "Could not read the Career Coach archive.", detail: (e as Error).message }, 500);
  }
}
