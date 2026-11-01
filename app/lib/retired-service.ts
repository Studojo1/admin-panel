/**
 * Old services the /old archive still calls (relaunch, 2 Nov 2026).
 *
 * Most archive dashboards read the database directly and keep working. A few
 * proxy to a service of the retired product. When that service stops, the
 * server answers 503 with { retired: true, service, error } (see
 * retired-service.server.ts), the page shows its usual empty state, and the
 * archive layout shows this note instead of a bare "HTTP 500".
 */

export const RETIRED_EVENT = "admin:service-retired";

export type RetiredService = { service: string; message: string };

const HAS_DB_COPY = new Set(["job-outreach-svc"]);

export function retiredNote(service: string): string {
  const where = HAS_DB_COPY.has(service)
    ? " Its records are still in the database."
    : "";
  return `Service retired: ${service} no longer answers, so this panel has no live data.${where}`;
}

/** Tell the archive layout a retired service was hit. Safe to call with any error body. */
export function reportRetired(body: unknown): void {
  if (typeof window === "undefined" || !body || typeof body !== "object") return;
  const b = body as { retired?: unknown; service?: unknown };
  if (b.retired !== true || typeof b.service !== "string") return;
  const detail: RetiredService = { service: b.service, message: retiredNote(b.service) };
  window.dispatchEvent(new CustomEvent<RetiredService>(RETIRED_EVENT, { detail }));
}

/** Same as reportRetired, for a service the browser calls directly (no server proxy). */
export function reportRetiredService(service: string): void {
  reportRetired({ retired: true, service });
}
