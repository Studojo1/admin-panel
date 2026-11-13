// Browser side of /customers: reads and writes of /api/customers with the admin's bearer token (getToken), as every
// admin API call does; the studojo.com session cookie never reaches the admin host.
import { getToken } from "~/lib/api";
import type { CustomersEnvelope, WireDetail, WirePick } from "./model";

async function call<T>(qs: string, init?: { method: "POST"; body: unknown }): Promise<T> {
  const token = await getToken();
  const headers: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  if (init) headers["Content-Type"] = "application/json";
  const res = await fetch(`/api/customers${qs}`, {
    credentials: "include",
    headers,
    ...(init ? { method: init.method, body: JSON.stringify(init.body) } : {}),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

export function fetchCustomers(o: { internal?: boolean; fresh?: boolean } = {}): Promise<CustomersEnvelope> {
  const qs = new URLSearchParams();
  if (o.internal) qs.set("internal", "1");
  if (o.fresh) qs.set("fresh", "1");
  const s = qs.toString();
  return call<CustomersEnvelope>(s ? `?${s}` : "");
}

export async function fetchCustomer(id: string): Promise<WireDetail> {
  return (await call<{ detail: WireDetail }>(`?${new URLSearchParams({ id })}`)).detail;
}

export type DeskState = { star: boolean; note: string; picks: WirePick[] };

export function saveDesk(body: Record<string, unknown>): Promise<DeskState> {
  return call<DeskState>("", { method: "POST", body });
}
