// Browser side of /email-funnel: one read of /api/email-funnel. The admin authenticates by bearer token (getToken), as
// every admin API call does.
import { getToken } from "~/lib/api";
import type { EmailEnvelope, RangeDays } from "./model";

export async function fetchEmailFunnel(o: { days: RangeDays; team?: boolean; fresh?: boolean }): Promise<EmailEnvelope> {
  const qs = new URLSearchParams({ days: String(o.days) });
  if (o.team) qs.set("team", "1");
  if (o.fresh) qs.set("fresh", "1");
  const token = await getToken();
  const res = await fetch(`/api/email-funnel?${qs}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as EmailEnvelope;
}
