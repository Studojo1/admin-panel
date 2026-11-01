// The one thing the archive still needs cc-backend for: uploaded resume files,
// which live on its volume (cc-backend-data), not in the database. While the
// service runs, the download and the "file on disk" flag come from it. Once it
// is gone (or listed in RETIRED_SERVICES) they degrade to the "Service retired"
// note through fetchRetiring.
import { fetchRetiring, retiredResponse } from "~/lib/retired-service.server";

export const CC_SERVICE = "cc-backend";

// Same backend the old page called from the browser. The admin key now stays
// on the server (it is inlined into the server build only).
const BASE = (process.env.CC_BACKEND_URL || "https://studojo.com/api/v1/cc").replace(/\/$/, "");
const KEY = import.meta.env.VITE_CC_ADMIN_KEY || "";

function call(path: string, timeoutMs: number): Promise<Response> {
  return fetchRetiring(CC_SERVICE, `${BASE}${path}`, {
    headers: KEY ? { "x-admin-key": KEY } : {},
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function isRetired(res: Response): Promise<boolean> {
  if (res.status !== 503) return false;
  const body = await res.clone().json().catch(() => null);
  return Boolean(body && body.retired === true);
}

/** Whether the original upload is still on the service's disk; null when the service is gone. */
export async function resumeFileOnDisk(studentId: string): Promise<boolean | null> {
  const res = await call(`/admin/student/${encodeURIComponent(studentId)}/resume-view`, 8_000);
  if (await isRetired(res)) return null;
  if (!res.ok) return null;
  const body = await res.json().catch(() => null);
  return body ? Boolean(body.file_on_disk) : null;
}

/** The original resume file, streamed from the service, or the retired note. */
export async function resumeFile(studentId: string): Promise<Response> {
  const res = await call(`/admin/student/${encodeURIComponent(studentId)}/resume`, 30_000);
  if (await isRetired(res)) return res;
  if (res.ok) {
    const headers = new Headers({ "Cache-Control": "no-store" });
    for (const h of ["content-type", "content-disposition", "content-length"]) {
      const v = res.headers.get(h);
      if (v) headers.set(h, v);
    }
    return new Response(res.body, { status: 200, headers });
  }
  if (res.status === 404) {
    const body = await res.json().catch(() => null);
    if (typeof body?.detail === "string" && body.detail.startsWith("No resume on file")) {
      return Response.json({ detail: body.detail }, { status: 404 });
    }
  }
  // A gateway error or an unknown path: the service is not there any more.
  return retiredResponse(CC_SERVICE);
}
