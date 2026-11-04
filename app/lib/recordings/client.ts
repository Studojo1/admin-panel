// Browser side of /recordings. The admin authenticates by bearer token (getToken), as every admin API call does. A
// chunk comes as the gzip bytes stored; the browser unzips it (DecompressionStream) and parses its rrweb events.
import { getToken } from "~/lib/api";
import type { RecordingDetail, RecordingsEnvelope } from "./model";

async function authed(path: string): Promise<Response> {
  const token = await getToken();
  return fetch(path, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
}

async function json<T>(path: string): Promise<T> {
  const res = await authed(path);
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as T;
}

export function fetchRecordings(o: { start: string; end: string; person?: string | null }): Promise<RecordingsEnvelope> {
  const qs = new URLSearchParams({ start: o.start, end: o.end });
  if (o.person) qs.set("person", o.person);
  return json(`/api/recordings?${qs}`);
}

export function fetchRecording(id: string): Promise<RecordingDetail> {
  return json(`/api/recordings/${encodeURIComponent(id)}`);
}

export async function fetchChunk(id: string, name: string): Promise<any[]> {
  const res = await authed(`/api/recordings/${encodeURIComponent(id)}/chunk?name=${encodeURIComponent(name)}`);
  if (!res.ok || !res.body) throw new Error(`chunk: HTTP ${res.status}`);
  const text = await new Response(res.body.pipeThrough(new DecompressionStream("gzip"))).text();
  const evs = JSON.parse(text);
  return Array.isArray(evs) ? evs : [];
}
