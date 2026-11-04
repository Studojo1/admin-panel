// Browser side of the Visitors section: one read of /api/visitors. The admin authenticates by bearer token
// (getToken), as every admin API call does; the studojo.com session cookie never reaches the admin host.
import { getToken } from "~/lib/api";
import type { DeviceFilter, VisitorsEnvelope } from "./model";

export async function fetchVisitors(o: { start: string; end: string; device?: DeviceFilter; internal?: boolean; fresh?: boolean }): Promise<VisitorsEnvelope> {
  const token = await getToken();
  const qs = new URLSearchParams({ start: o.start, end: o.end });
  if (o.device && o.device !== "all") qs.set("device", o.device);
  if (o.internal) qs.set("internal", "1");
  if (o.fresh) qs.set("fresh", "1");
  const res = await fetch(`/api/visitors?${qs}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as VisitorsEnvelope;
}
