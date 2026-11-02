// Browser side of the Stu pages: one fetch of /api/stu, shared by every page.
import { getToken } from "~/lib/api";
import type { StuData } from "./model";

let last: { at: number; data: StuData } | null = null;

export async function fetchStu(fresh = false): Promise<StuData> {
  if (!fresh && last && Date.now() - last.at < 60_000) return last.data;
  const token = await getToken();
  const res = await fetch(`/api/stu${fresh ? "?fresh=1" : ""}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  last = { at: Date.now(), data: body as StuData };
  return last.data;
}

export async function fetchUserLog(id: string): Promise<{ events: any[]; source: any }> {
  const token = await getToken();
  const res = await fetch(`/api/stu?view=user&id=${encodeURIComponent(id)}`, {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body;
}
