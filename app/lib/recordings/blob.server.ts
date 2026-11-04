// Recordings (5 Nov 2026): read only access to the session recordings' private blob container, the account career-agent
// writes them to (AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY from app-secrets, by reference, never
// logged). The Blob REST API signed with Shared Key, no SDK, no SAS links: the chunks reach a browser only through
// /api/recordings/:id/chunk, behind the admin login. List and get only; nothing here writes or deletes.
import { createHmac } from "node:crypto";

const VERSION = "2021-08-06";

function account(): { name: string; key: Buffer } | null {
  const name = process.env.AZURE_STORAGE_ACCOUNT_NAME?.trim();
  const key = process.env.AZURE_STORAGE_ACCOUNT_KEY?.trim();
  if (!name || !key || !/^[a-z0-9]{3,24}$/.test(name)) return null;
  try {
    return { name, key: Buffer.from(key, "base64") };
  } catch {
    return null;
  }
}

export function blobConfigured(): boolean {
  return account() !== null;
}

/** The Shared Key string to sign (Blob service, 2015-02-21 and later). Exported for its test. */
export function stringToSign(verb: string, accountName: string, path: string, query: URLSearchParams, headers: Record<string, string>): string {
  const h = Object.fromEntries(Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]));
  const len = h["content-length"] && h["content-length"] !== "0" ? h["content-length"] : "";
  const canonHeaders = Object.keys(h).filter((k) => k.startsWith("x-ms-")).sort().map((k) => `${k}:${h[k].trim()}\n`).join("");
  const params = [...query.keys()].map((k) => k.toLowerCase()).sort();
  const canonResource = `/${accountName}${path}` + params.map((k) => `\n${k}:${query.getAll(k).sort().join(",")}`).join("");
  return [verb, h["content-encoding"] ?? "", h["content-language"] ?? "", len, h["content-md5"] ?? "", h["content-type"] ?? "", "", h["if-modified-since"] ?? "", h["if-match"] ?? "", h["if-none-match"] ?? "", h["if-unmodified-since"] ?? "", h.range ?? ""].join("\n") + "\n" + canonHeaders + canonResource;
}

async function get(path: string, query: URLSearchParams): Promise<Response> {
  const a = account();
  if (!a) throw new Error("Recordings storage is not configured on this admin (AZURE_STORAGE_ACCOUNT_NAME, AZURE_STORAGE_ACCOUNT_KEY)");
  const headers: Record<string, string> = { "x-ms-date": new Date().toUTCString(), "x-ms-version": VERSION };
  const sig = createHmac("sha256", a.key).update(stringToSign("GET", a.name, path, query, headers), "utf8").digest("base64");
  const qs = query.toString();
  return fetch(`https://${a.name}.blob.core.windows.net${path}${qs ? `?${qs}` : ""}`, {
    headers: { ...headers, Authorization: `SharedKey ${a.name}:${sig}` },
    signal: AbortSignal.timeout(20_000),
  });
}

const CONTAINER_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;
const enc = (name: string) => name.split("/").map(encodeURIComponent).join("/");

/** Every blob name under a prefix (at most 5,000 pages of 5,000). */
export async function listNames(container: string, prefix: string): Promise<string[]> {
  if (!CONTAINER_RE.test(container)) throw new Error("bad container");
  const out: string[] = [];
  let marker = "";
  do {
    const q = new URLSearchParams({ restype: "container", comp: "list", prefix, maxresults: "5000" });
    if (marker) q.set("marker", marker);
    const r = await get(`/${container}`, q);
    if (r.status === 404) return out;
    if (!r.ok) throw new Error(`recordings list: HTTP ${r.status}`);
    const xml = await r.text();
    for (const m of xml.matchAll(/<Name>([^<]+)<\/Name>/g)) out.push(m[1].replace(/&amp;/g, "&"));
    marker = /<NextMarker>([^<]*)<\/NextMarker>/.exec(xml)?.[1] ?? "";
  } while (marker && out.length < 25_000);
  return out;
}

/** One blob's bytes, or null when it is gone. */
export async function getBytes(container: string, name: string): Promise<Buffer | null> {
  if (!CONTAINER_RE.test(container)) throw new Error("bad container");
  const r = await get(`/${container}/${enc(name)}`, new URLSearchParams());
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`recordings read: HTTP ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}
