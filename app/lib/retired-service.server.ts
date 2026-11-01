import { retiredNote } from "./retired-service";

// A service listed here is treated as retired without calling it, so a page
// never waits on a host that is gone (comma separated, e.g. "job-outreach-svc").
const SWITCHED_OFF = new Set(
  (process.env.RETIRED_SERVICES ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
);

// Long enough for the slowest old admin call (paid funnel), short enough that a
// dropped connection does not hang the page.
const TIMEOUT_MS = 60_000;

/** The 503 every proxy returns once its service is gone. Pages read `error` or `detail`. */
export function retiredResponse(service: string): Response {
  const message = retiredNote(service);
  return Response.json(
    { retired: true, service, error: message, detail: message },
    { status: 503, headers: { "Cache-Control": "no-store" } },
  );
}

/**
 * fetch() to a service of the retired product. Returns the service's own
 * response while it runs, and retiredResponse() when it is switched off or
 * cannot be reached (DNS gone, connection refused, timeout).
 */
export async function fetchRetiring(service: string, url: string, init: RequestInit = {}): Promise<Response> {
  if (SWITCHED_OFF.has(service)) return retiredResponse(service);
  try {
    return await fetch(url, { ...init, signal: init.signal ?? AbortSignal.timeout(TIMEOUT_MS) });
  } catch (e) {
    console.warn(`[retired-service] ${service} unreachable: ${(e as Error).message}`);
    return retiredResponse(service);
  }
}
