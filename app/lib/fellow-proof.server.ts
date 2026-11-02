import { createHmac } from "node:crypto";

// The analytics screenshots fellows upload from their page on studojo.com. The
// frontend stores them in the private "fellow-proof" container of the shared
// storage account; admin only reads them. Plain REST with Shared Key auth, so
// no storage SDK. The pattern is the frontend's blob name:
// fellow-proof/<creatorId>/<postId>/<uploadMs>-<12 hex>.jpg
const PROOF = /^fellow-proof\/\d{1,10}\/\d{1,10}\/\d{13}-[0-9a-f]{12}\.jpg$/;
const VERSION = "2021-08-06";

export const isProofRef = (v: unknown): v is string => typeof v === "string" && PROOF.test(v);

/** The stored list (screenshot_url): a JSON array of refs, or one old http(s) link. */
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

/** Fetches one screenshot from storage, or null when storage isn't configured or the ref isn't a proof blob. */
export async function fetchProof(ref: string): Promise<Response | null> {
  const account = process.env.AZURE_STORAGE_ACCOUNT_NAME;
  const key = process.env.AZURE_STORAGE_ACCOUNT_KEY;
  if (!account || !key || !isProofRef(ref)) return null;
  const date = new Date().toUTCString();
  // Get Blob string-to-sign: the verb, eleven empty standard headers, then the x-ms headers and the resource.
  const toSign = ["GET", "", "", "", "", "", "", "", "", "", "", "", `x-ms-date:${date}\nx-ms-version:${VERSION}\n/${account}/${ref}`].join("\n");
  const signature = createHmac("sha256", Buffer.from(key, "base64")).update(toSign, "utf8").digest("base64");
  return fetch(`https://${account}.blob.core.windows.net/${ref}`, {
    headers: { "x-ms-date": date, "x-ms-version": VERSION, Authorization: `SharedKey ${account}:${signature}` },
  });
}
