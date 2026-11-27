// Numbers for the fellows' posts from their LinkedIn files (ugc_creator_analytics: each upload keeps every post the
// file lists, with its link, the day it went up and its impressions). Pure functions, tested in
// scripts/fellowship-files.test.mjs.
//
// Until 21 Nov 2026 no upload was ever matched to a post: the page matched on "activity:<id>" in the link, and the
// file lists every post as linkedin.com/posts/<name>_<opening-words>-share-<id> (or -ugcPost-<id>). So the admin
// counted only numbers fellows typed in, and the goal looked stuck. Here a file's post is matched to one of ours by
// its LinkedIn id, or else by its opening words, which LinkedIn puts in the link.

export interface FilePost { url: string | null; publishedOn: string | null; impressions: number | null }
export interface FileWeek { uploadedAt: string; periodStart: string | null; periodEnd: string | null; posts: FilePost[] }
export interface OurPost { id: number; body: string; url: string | null; postedAt: string | null; status: string }
export interface FileNumbers { impressions: number; uploadedAt: string; periodEnd: string | null; url: string | null }

const LINKEDIN_ID = /(?:activity|share|ugcPost)[:-](\d{15,22})/i;
/** The post's LinkedIn id from its link (activity, share or ugcPost), or null. */
export function linkedInId(url: string | null | undefined): bigint | null {
  const m = LINKEDIN_ID.exec(url ?? "");
  return m ? BigInt(m[1]) : null;
}

/**
 * LinkedIn ids carry the moment they were made in their top bits (milliseconds). One post has an activity id and a
 * share (or ugcPost) id made within moments of each other, so a link of either kind finds the same post.
 * Usually under a second apart, but Varad's "A search bar assumes..." (11 Nov 2026) had its two ids 12 seconds apart,
 * so the window is a minute (27 Nov 2026). Nobody puts up two different posts within the same minute.
 */
export const SAME_POST_MS = 60_000n;
export function sameLinkedInPost(a: bigint | null, b: bigint | null): boolean {
  if (a == null || b == null) return false;
  if (a === b) return true;
  const gap = (a >> 22n) - (b >> 22n);
  return (gap < 0n ? -gap : gap) <= SAME_POST_MS;
}

/** Words as LinkedIn writes them into a post's link: lower case, apostrophes dropped, anything else splits. */
export const wordsOf = (text: string) => text.toLowerCase().replace(/['’]/g, "").split(/[^a-z0-9]+/).filter(Boolean);
/** The opening words LinkedIn puts in a /posts/ link (name_opening-words-share-id), or null for any other link. */
export function linkWords(url: string | null | undefined): string[] | null {
  const m = /\/posts\/[^_/?#]+_(.+?)-(?:share|ugcPost|activity)-\d{15,22}/i.exec(url ?? "");
  return m ? m[1].split("-").filter(Boolean) : null;
}
/** At least this many opening words must agree (as many as both have, LinkedIn cuts long openings short). */
export const MIN_WORDS = 5;
export function sameOpening(body: string, url: string | null | undefined): boolean {
  const lw = linkWords(url);
  if (!lw) return false;
  const bw = wordsOf(body);
  const k = Math.min(lw.length, bw.length);
  return k >= MIN_WORDS && lw.slice(0, k).every((w, i) => w === bw[i]);
}

const day = (iso: string | null) => (iso ? new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso)) : null);

/**
 * One fellow's posted posts and their LinkedIn files: the impressions each post has in them. A file counts a post in
 * full only when the post went up inside the file's period (for an older post it has only that period's share), and
 * the highest count across the files wins (each is a count so far). A file's post that could be more than one of
 * ours is left out, never guessed.
 */
export function numbersFromFiles(posts: OurPost[], weeks: FileWeek[]): Map<number, FileNumbers> {
  const posted = posts.filter((p) => p.status === "posted");
  const ids = new Map(posted.map((p) => [p.id, linkedInId(p.url)] as const));
  const out = new Map<number, FileNumbers>();
  for (const w of weeks) {
    if (!w.periodStart) continue;
    for (const x of w.posts) {
      if (x.impressions == null || !Number.isFinite(x.impressions)) continue;
      const xid = linkedInId(x.url);
      // The same id first, then an id made moments apart (activity and share), then the opening words.
      let match = xid == null ? [] : posted.filter((p) => ids.get(p.id) === xid);
      if (!match.length) match = posted.filter((p) => sameLinkedInPost(ids.get(p.id) ?? null, xid));
      if (!match.length) match = posted.filter((p) => sameOpening(p.body, x.url));
      if (match.length !== 1) continue;
      const p = match[0];
      const published = x.publishedOn ?? day(p.postedAt);
      if (!published || published < w.periodStart) continue;
      const had = out.get(p.id);
      if (!had || x.impressions > had.impressions) out.set(p.id, { impressions: x.impressions, uploadedAt: w.uploadedAt, periodEnd: w.periodEnd, url: x.url });
    }
  }
  return out;
}
