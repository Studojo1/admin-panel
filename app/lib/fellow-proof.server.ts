import { createHmac, randomBytes } from "node:crypto";

// The pictures fellows add on their page on studojo.com: analytics screenshots
// and, since 3 Nov 2026, the photo that goes with each post. Both live in the
// private "fellow-proof" container of the shared storage account. Admin reads
// them, and stores a post's photo when a fellow has none of their own. Plain
// REST with Shared Key auth, so no storage SDK. The blob names are the frontend's:
// fellow-proof/<creatorId>/<postId>/<uploadMs>-<12 hex>.jpg        (screenshot)
// fellow-proof/<creatorId>/<postId>/photo/<uploadMs>-<12 hex>.jpg  (post photo)
const PROOF = /^fellow-proof\/\d{1,10}\/\d{1,10}\/(photo\/)?\d{13}-[0-9a-f]{12}\.jpg$/;
const PHOTO = /^fellow-proof\/\d{1,10}\/\d{1,10}\/photo\/\d{13}-[0-9a-f]{12}\.jpg$/;
const VERSION = "2021-08-06";
export const PHOTOS_PER_POST = 4;
export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;

export const isProofRef = (v: unknown): v is string => typeof v === "string" && PROOF.test(v);
export const isPhotoRef = (v: unknown): v is string => typeof v === "string" && PHOTO.test(v);

/** The stored list (screenshot_url, photo_url): a JSON array of refs, or one old http(s) link. */
export function proofRefs(v: string | null): string[] {
  if (!v) return [];
  if (/^https?:\/\//i.test(v)) return [v];
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

/** A new photo ref for one post. */
export const newPhotoRef = (creatorId: number, postId: number, now = Date.now()) =>
  `fellow-proof/${creatorId}/${postId}/photo/${now}-${randomBytes(6).toString("hex")}.jpg`;

/**
 * One signed storage request, or null when storage isn't configured. The string
 * to sign is the verb, eleven standard headers (only Content-Length,
 * Content-Type and If-None-Match are ever set here), the x-ms headers in order,
 * then the resource and its query.
 */
function storageRequest(
  verb: "GET" | "PUT" | "DELETE",
  path: string,
  o: { body?: Uint8Array; query?: [string, string]; ms?: [string, string][]; ifNoneMatch?: string } = {},
): Promise<Response> | null {
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const key = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (!account || !key) return null;
  const ms: [string, string][] = [...(o.ms ?? []), ["x-ms-date", new Date().toUTCString()], ["x-ms-version", VERSION]];
  ms.sort(([a], [b]) => a.localeCompare(b));
  const type = o.body ? "image/jpeg" : "";
  const toSign = [
    verb, "", "", o.body ? String(o.body.length) : "", "", type, "", "", "", o.ifNoneMatch ?? "", "", "",
    `${ms.map(([k, v]) => `${k}:${v}`).join("\n")}\n/${account}/${path}${o.query ? `\n${o.query[0]}:${o.query[1]}` : ""}`,
  ].join("\n");
  const signature = createHmac("sha256", Buffer.from(key, "base64")).update(toSign, "utf8").digest("base64");
  return fetch(`https://${account}.blob.core.windows.net/${path}${o.query ? `?${o.query[0]}=${o.query[1]}` : ""}`, {
    method: verb,
    headers: {
      ...Object.fromEntries(ms), ...(type ? { "Content-Type": type } : {}), ...(o.ifNoneMatch ? { "If-None-Match": o.ifNoneMatch } : {}),
      Authorization: `SharedKey ${account}:${signature}`,
    },
    body: o.body ? new Uint8Array(o.body) : undefined, // a copy typed as fetch wants it
  });
}

/** Fetches one picture from storage, or null when storage isn't configured or the ref isn't one of ours. */
export async function fetchProof(ref: string): Promise<Response | null> {
  return isProofRef(ref) ? storageRequest("GET", ref) : null;
}

/**
 * Stores a post photo; names are unique, so an existing blob is never
 * overwritten. The fellow's page creates the container on its first upload;
 * if the team's photo comes first, it's created here the same way: private,
 * with no public access.
 */
export async function putPhoto(ref: string, jpeg: Uint8Array): Promise<void> {
  if (!isPhotoRef(ref)) throw new Error("not a photo ref");
  const put = () => storageRequest("PUT", ref, { body: jpeg, ms: [["x-ms-blob-type", "BlockBlob"]], ifNoneMatch: "*" });
  let r = await put();
  if (!r) throw new Error("storage is not configured");
  if (r.status === 404 && (await r.text()).includes("ContainerNotFound")) {
    const made = await storageRequest("PUT", ref.split("/")[0], { query: ["restype", "container"] });
    if (made && !made.ok && made.status !== 409) throw new Error(`storage refused to create the container (${made.status})`);
    r = (await put())!;
  }
  if (!r.ok) throw new Error(`storage refused the photo (${r.status})`);
}

/** Deletes a post photo; a blob that's already gone is fine. */
export async function deletePhoto(ref: string): Promise<void> {
  if (!isPhotoRef(ref)) return;
  const r = await storageRequest("DELETE", ref);
  if (r && !r.ok && r.status !== 404) throw new Error(`storage refused the delete (${r.status})`);
}
