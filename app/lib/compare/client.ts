// Browser side of /compare: one read of /api/compare. The admin authenticates by bearer token (getToken), as every
// admin API call does.
import { getToken } from "~/lib/api";
import type { CompareEnvelope } from "./model";

export type { CompareEnvelope };

export async function fetchCompare(qs: URLSearchParams, fresh: boolean): Promise<CompareEnvelope> {
  const token = await getToken();
  const q = new URLSearchParams(qs);
  if (fresh) q.set("fresh", "1");
  const res = await fetch(`/api/compare?${q}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as CompareEnvelope;
}
