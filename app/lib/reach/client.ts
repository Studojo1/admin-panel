// Browser side of /reach and the Overview tile: one read of /api/reach. The admin authenticates by bearer token
// (getToken), as every admin API call does.
import { getToken } from "~/lib/api";
import type { ReachEnvelope, ReachSummary } from "./model";

async function get<T>(qs: URLSearchParams): Promise<T> {
  const token = await getToken();
  const res = await fetch(`/api/reach?${qs}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

export function fetchReach(o: { internal?: boolean; fresh?: boolean }): Promise<ReachEnvelope> {
  const qs = new URLSearchParams();
  if (o.internal) qs.set("internal", "1");
  if (o.fresh) qs.set("fresh", "1");
  return get<ReachEnvelope>(qs);
}

export function fetchReachSummary(o: { internal?: boolean }): Promise<{ summary: ReachSummary; generatedAt: string; env: string }> {
  const qs = new URLSearchParams({ view: "summary" });
  if (o.internal) qs.set("internal", "1");
  return get(qs);
}
