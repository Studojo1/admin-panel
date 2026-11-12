// Browser side of Talent search: one read of /api/talent. The admin authenticates by bearer token (getToken), as every
// admin API call does; the studojo.com session cookie never reaches the admin host.
import { getToken } from "~/lib/api";
import type { Filters } from "./model";
import type { TalentEnvelope } from "./wire";

export async function fetchTalent(f: Filters, o: { internal?: boolean; fresh?: boolean } = {}): Promise<TalentEnvelope> {
  const token = await getToken();
  const qs = new URLSearchParams();
  if (f.q.trim()) qs.set("q", f.q.trim());
  if (f.city) qs.set("city", f.city);
  if (f.type !== "any") qs.set("type", f.type);
  if (f.exp !== "any") qs.set("exp", f.exp);
  if (f.grad != null) qs.set("grad", String(f.grad));
  if (f.active) qs.set("active", "1");
  if (f.budget) qs.set("budget", f.budget);
  if (!f.relocate) qs.set("relocate", "0");
  if (f.src !== "all") qs.set("src", f.src);
  if (f.optin) qs.set("optin", "1");
  if (f.traits.length) qs.set("traits", f.traits.join(","));
  if (f.fam) qs.set("fam", f.fam);
  if (f.fam && f.role) qs.set("role", f.role);
  if (o.internal) qs.set("internal", "1");
  if (o.fresh) qs.set("fresh", "1");
  const res = await fetch(`/api/talent?${qs}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as TalentEnvelope;
}
