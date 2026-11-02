/** The one UTM naming scheme for every Studojo link (relaunch, 2 Nov 2026).
 *
 * Used by the builder (to offer only these values), by the API (to refuse
 * anything else), and by the reports (to fold old spellings into one channel).
 *
 * The convention:
 *   source    where the link is posted, from UTM_SOURCES
 *   medium    the format or placement, from UTM_MEDIUMS (paid for anything we pay for)
 *   campaign  lowercase words joined by hyphens, topic plus month: launch-nov26
 *   content   free: a post id, a creative, a person, a college (lowercase, no spaces)
 *
 * Every short link (studojo.com/go/<slug>) also carries utm_id=<slug>, so a
 * sign-up is tied to the exact link it came through.
 */

export const UTM_SOURCES = {
  linkedin: "LinkedIn posts, comments, DMs",
  instagram: "Instagram bio, stories, reels, DMs",
  whatsapp: "WhatsApp groups and chats",
  youtube: "YouTube videos and descriptions",
  x: "X (Twitter)",
  reddit: "Reddit posts and comments",
  email: "Emails we send, signatures, newsletters",
  google: "Google ads",
  meta: "Meta ads (Facebook and Instagram paid)",
  college: "Colleges, placement cells, campus ambassadors",
  referral: "A person sharing our link",
  partner: "Partner or affiliate sites",
  offline: "Posters, flyers, events (QR codes)",
} as const;

export const UTM_MEDIUMS = {
  organic: "Unpaid, no better fit below",
  paid: "Anything we pay for",
  post: "A feed post",
  dm: "One-to-one messages",
  bio: "Profile bio link",
  story: "A story",
  reel: "A reel or short video",
  group: "Groups and communities",
  ambassador: "Shared by a campus ambassador",
  poster: "A printed poster or flyer (QR)",
  newsletter: "A newsletter issue",
} as const;

export type UtmSource = keyof typeof UTM_SOURCES;
export type UtmMedium = keyof typeof UTM_MEDIUMS;

/** The usual mediums for each source, first one is the default. Any medium is allowed. */
export const SOURCE_MEDIUMS: Record<UtmSource, UtmMedium[]> = {
  linkedin: ["post", "dm", "organic", "paid"],
  instagram: ["bio", "story", "reel", "post", "dm", "paid"],
  whatsapp: ["group", "dm"],
  youtube: ["organic", "paid"],
  x: ["post", "dm"],
  reddit: ["post", "organic"],
  email: ["organic", "newsletter", "dm"],
  google: ["paid"],
  meta: ["paid"],
  college: ["ambassador", "poster", "organic"],
  referral: ["dm", "organic"],
  partner: ["organic", "paid"],
  offline: ["poster"],
};

/** Paste into Meta Ads Manager > ad > Tracking > URL parameters. Meta adds fbclid on its own. */
export const META_URL_TEMPLATE =
  "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}";

// lowercase words joined by hyphens, e.g. launch-nov26
export const CAMPAIGN_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
// free but tidy: a post id, a creative, a person, e.g. jeremy-post-1102, reel-3, iit-bombay
export const CONTENT_RE = /^[a-z0-9]+(?:[_.-][a-z0-9]+)*$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

/** Where a link may land: the site and the product (and their staging twins on studojo.pro, for testing). */
export const DESTINATION_HOSTS = ["studojo.com", "platform.studojo.com", "studojo.pro", "platform.studojo.pro"] as const;

/** The builder's ready-made destinations. The site has no "open Stu" intent on a link, so Start with Stu is the homepage, whose first button starts Stu. */
export const DESTINATIONS = [
  { key: "home", label: "Homepage", url: "https://studojo.com/" },
  { key: "start", label: "Start with Stu", url: "https://studojo.com/" },
  { key: "blog", label: "Blog index", url: "https://studojo.com/blog" },
  { key: "reports", label: "Reports index", url: "https://studojo.com/reports" },
] as const;

export function isSource(v: string): v is UtmSource {
  return Object.prototype.hasOwnProperty.call(UTM_SOURCES, v);
}
export function isMedium(v: string): v is UtmMedium {
  return Object.prototype.hasOwnProperty.call(UTM_MEDIUMS, v);
}

export function toSlugPart(v: string, max = 40): string {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, max)
    .replace(/-+$/g, "");
}

/** The default short link: source-medium[-content]-campaign, e.g. linkedin-post-launch-nov26. */
export function autoSlug(l: { utm_source?: string; utm_medium?: string; utm_campaign?: string; utm_content?: string | null }): string {
  return toSlugPart([l.utm_source, l.utm_medium, l.utm_content, l.utm_campaign].filter(Boolean).join("-"), 80);
}

/** Typed text kept inside the convention as it is typed. */
export const cleanCampaign = (v: string) => v.toLowerCase().replace(/[\s_]+/g, "-").replace(/[^a-z0-9-]/g, "").replace(/-{2,}/g, "-");
export const cleanContent = (v: string) => v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_.-]/g, "");
export const cleanSlug = (v: string) => v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");

export function isStudojoUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return u.protocol === "https:" && (DESTINATION_HOSTS as readonly string[]).includes(u.hostname);
  } catch {
    return false;
  }
}

/** The full tagged URL a link stands for. With a slug it carries utm_id=<slug>, as the short link's redirect does. */
export function fullUrl(l: {
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content?: string | null;
  utm_term?: string | null;
  slug?: string | null;
}): string {
  try {
    const u = new URL(l.base_url);
    u.searchParams.set("utm_source", l.utm_source);
    u.searchParams.set("utm_medium", l.utm_medium);
    u.searchParams.set("utm_campaign", l.utm_campaign);
    if (l.utm_content) u.searchParams.set("utm_content", l.utm_content);
    if (l.utm_term) u.searchParams.set("utm_term", l.utm_term);
    if (l.slug) u.searchParams.set("utm_id", l.slug);
    return u.toString();
  } catch {
    return "";
  }
}

/** Returns a list of problems, empty when the link is valid. */
export function validateLink(l: {
  base_url?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_content?: string | null;
  utm_term?: string | null;
  slug?: string | null;
}): string[] {
  const errs: string[] = [];
  if (!l.base_url || !isStudojoUrl(l.base_url)) errs.push("Destination must be an https page on studojo.com or platform.studojo.com.");
  if (!l.utm_source || !isSource(l.utm_source)) errs.push("Source must be one from the list.");
  if (!l.utm_medium || !isMedium(l.utm_medium)) errs.push("Medium must be one from the list.");
  if (!l.utm_campaign || !CAMPAIGN_RE.test(l.utm_campaign) || l.utm_campaign.length > 60)
    errs.push("Campaign must be lowercase words joined by hyphens, e.g. launch-nov26.");
  else if (/^\d+$/.test(l.utm_campaign)) errs.push("Campaign cannot be a bare number. Name it, e.g. launch-nov26.");
  if (l.utm_content && (!CONTENT_RE.test(l.utm_content) || l.utm_content.length > 80))
    errs.push("Content must be lowercase with no spaces, e.g. jeremy-post-1102.");
  if (l.utm_term && (!CONTENT_RE.test(l.utm_term) || l.utm_term.length > 80))
    errs.push("Term must be lowercase with no spaces, e.g. final-year.");
  if (!l.slug || !SLUG_RE.test(l.slug)) errs.push("Short link may only use a-z, 0-9, - and _ (80 at most).");
  return errs;
}

// ── Normalising what actually arrives ─────────────────────────────────────

const SOURCE_ALIASES: Record<string, string> = {
  ig: "instagram", instagram: "instagram", "l.instagram.com": "instagram",
  fb: "meta", facebook: "meta", meta: "meta", "m.facebook.com": "meta", "l.facebook.com": "meta",
  an: "meta", msg: "meta", th: "meta", threads: "meta",
  li: "linkedin", linkedin: "linkedin", "lnkd.in": "linkedin",
  wa: "whatsapp", whatsapp: "whatsapp",
  yt: "youtube", youtube: "youtube",
  twitter: "x", x: "x", "t.co": "x",
  mail: "email", email: "email", newsletter: "email",
  google: "google", ambassador: "ambassador", college: "college", partner: "partner",
  reddit: "reddit", referral: "referral", offline: "offline",
};

const MEDIUM_ALIASES: Record<string, string> = {
  paid: "paid", cpc: "paid", ppc: "paid", paid_social: "paid", paidsocial: "paid",
  "paid-social": "paid", ads: "paid", ad: "paid", cpm: "paid", sponsored: "paid", display: "paid",
  organic: "organic", social: "organic", bio: "organic", link_in_bio: "organic",
  nurture: "lifecycle", lifecycle: "lifecycle", drip: "lifecycle", newsletter: "lifecycle",
  dm: "dm", direct: "dm", community: "community", group: "community",
  referral: "referral", ref: "referral", event: "event", webinar: "event",
};

/** Channel for a visit that carried no tags, from its referrer host. */
export function channelFromReferrer(referrer: string | null | undefined): { source: string; medium: string } {
  let host = "";
  try {
    host = referrer ? new URL(referrer).hostname.toLowerCase() : "";
  } catch {
    host = "";
  }
  if (!host) return { source: "direct", medium: "none" };
  // Our own pages and the Google sign-in return are not where anyone came from.
  if (host.endsWith("studojo.com") || host.endsWith("studojo.pro") || host === "accounts.google.com" || host === "accounts.youtube.com")
    return { source: "direct", medium: "none" };
  if (host.includes("linkedin")) return { source: "linkedin", medium: "organic" };
  if (host.includes("instagram")) return { source: "instagram", medium: "organic" };
  // messenger.com only: Telegram's Android app id is org.telegram.messenger.
  if (host.includes("facebook") || host === "fb.me" || /(^|\.)messenger\.com$/.test(host)) return { source: "meta", medium: "organic" };
  if (host.includes("whatsapp") || host === "wa.me" || host === "l.wl.co") return { source: "whatsapp", medium: "dm" };
  if (host.includes("youtube")) return { source: "youtube", medium: "organic" };
  if (host === "t.co" || host.includes("twitter") || host === "x.com") return { source: "x", medium: "organic" };
  if (/chatgpt|openai|perplexity|gemini|claude\.ai|copilot|deepseek|grok|notebooklm/.test(host))
    return { source: "ai_assistant", medium: "referral" };
  // Search hosts only: docs.google.com, classroom.google.com and Google Play Services are not search.
  if (/^(www\.|m\.)?google\.[a-z.]+$|googlequicksearchbox|bing\.com|duckduckgo|search\.brave|search\.yahoo\.|ecosia|qwant|yandex|baidu|startpage/.test(host))
    return { source: "search", medium: "organic" };
  return { source: host.replace(/^www\./, ""), medium: "referral" };
}

/**
 * Fold a raw (source, medium) pair into the dictionary. `known` is false when
 * the pair could not be mapped, which is what the hygiene check reports.
 */
export function normalizeTags(
  rawSource: string | null | undefined,
  rawMedium: string | null | undefined,
  referrer?: string | null,
): { source: string; medium: string; tagged: boolean; known: boolean } {
  const s0 = (rawSource || "").toLowerCase().trim();
  const m0 = (rawMedium || "").toLowerCase().trim();
  if (!s0) {
    const c = channelFromReferrer(referrer);
    return { ...c, tagged: false, known: true };
  }
  // ChatGPT, Perplexity and similar add utm_source=<their domain> to links they
  // cite. That is their tag, not ours, so it is a referral rather than a
  // dictionary violation.
  if (/chatgpt|openai|perplexity|gemini|copilot|claude\.ai/.test(s0)) {
    return { source: "ai_assistant", medium: "referral", tagged: false, known: true };
  }
  let source = SOURCE_ALIASES[s0] ?? s0;
  let medium = MEDIUM_ALIASES[m0] ?? (m0 || "none");
  // Meta places paid ads on Instagram and tags them ig/paid on its own.
  if (source === "instagram" && medium === "paid") source = "meta";
  if (source === "email" && medium === "none") medium = "lifecycle";
  return { source, medium, tagged: true, known: isSource(source) && isMedium(medium) };
}

// ── Dashboard channels ─────────────────────────────────────────────────────
// The handful of buckets the daily dashboard reports in. Campaign and content
// detail stays on the UTM Links page; this answers "where did they come from".

export const CHANNELS = [
  { key: "meta_paid", label: "Meta ads (paid)" },
  { key: "meta_organic", label: "Instagram / Facebook (free)" },
  { key: "search", label: "Google and other search" },
  { key: "google_paid", label: "Google ads (paid)" },
  { key: "linkedin", label: "LinkedIn" },
  { key: "direct", label: "Direct" },
  { key: "email", label: "Email" },
  { key: "whatsapp", label: "WhatsApp" },
  { key: "ai_assistant", label: "AI assistants (ChatGPT etc.)" },
  { key: "other", label: "Other" },
  { key: "unknown_signin", label: "Unknown (lost at Google sign-in)" },
  { key: "not_captured", label: "Not captured" },
] as const;

export type ChannelKey = (typeof CHANNELS)[number]["key"];

/** Host from a referrer that may be a full URL, an android-app:// URI or a bare host. */
function refHost(referrer: string | null | undefined): string {
  const r = (referrer || "").trim().toLowerCase();
  if (!r || r === "$direct") return "";
  try {
    return new URL(r).hostname;
  } catch {
    return /^[a-z0-9.-]+$/.test(r) ? r : "";
  }
}

/**
 * The dashboard channel for one visit or signup. Tags win over the referrer;
 * an untagged visit is placed by where it came from.
 */
export function channelOf(
  rawSource: string | null | undefined,
  rawMedium: string | null | undefined,
  referrer?: string | null,
): ChannelKey {
  const host = refHost(referrer);
  const tagged = Boolean((rawSource || "").trim());
  if (!tagged) {
    // Until 29 Sep 2026 the Google sign-in round trip overwrote the referrer,
    // so the real source of these signups is gone. Counting them as Direct
    // would hide that.
    if (host.startsWith("accounts.google.") || host === "accounts.youtube.com") return "unknown_signin";
    // Mail apps arrive untagged, and the search rule would otherwise claim
    // anything under google.* (the Gmail app is com.google.android.gm).
    if (/(^|\.)mail\.|\.android\.gm$|outlook\.|\.outlook$|\.mail$|protonmail/.test(host)) return "email";
    if (/(^|\.)threads\.(com|net)$/.test(host)) return "meta_organic";
    // LinkedIn's link shortener carries no "linkedin" in its name.
    if (host === "lnkd.in") return "linkedin";
  }
  const n = normalizeTags(rawSource, rawMedium, host ? `https://${host}` : null);
  if (n.source === "meta") return n.medium === "paid" ? "meta_paid" : "meta_organic";
  if (n.source === "instagram") return "meta_organic";
  if (n.source === "google") return n.medium === "paid" ? "google_paid" : "search";
  if (n.source === "search") return "search";
  if (n.source === "linkedin") return "linkedin";
  if (n.source === "direct") return "direct";
  if (n.source === "email") return "email";
  if (n.source === "whatsapp") return "whatsapp";
  if (n.source === "ai_assistant") return "ai_assistant";
  return "other";
}
