/** The one UTM naming scheme for every Studojo link.
 *
 * Used by the builder (to offer only these values), by the API (to refuse
 * anything else), and by the reports (to fold old spellings into one channel).
 *
 * Tags were being typed freehand, so the same Meta ads arrived as both
 * "meta" and "ig/paid", a person's name ended up in utm_medium, and campaign
 * names were sometimes bare numeric ids. Keeping the vocabulary in one file is
 * what stops that recurring.
 */

export const UTM_SOURCES = {
  meta: "Meta ads (Facebook + Instagram paid)",
  instagram: "Instagram organic: bio, stories, posts, DMs",
  linkedin: "LinkedIn posts, comments, DMs, ads",
  whatsapp: "WhatsApp groups and chats",
  email: "Our own emails (tagged automatically)",
  ambassador: "Campus ambassadors",
  college: "College partnerships, placement cells",
  youtube: "YouTube",
  x: "X / Twitter",
  google: "Google ads",
  partner: "Partner or affiliate sites",
} as const;

export const UTM_MEDIUMS = {
  paid: "Anything we pay for",
  organic: "Our own unpaid posts",
  dm: "One-to-one messages",
  community: "Groups and communities",
  lifecycle: "Lifecycle and nurture email",
  referral: "Someone else sharing our link",
  event: "Webinars, talks, campus events",
} as const;

export type UtmSource = keyof typeof UTM_SOURCES;
export type UtmMedium = keyof typeof UTM_MEDIUMS;

/** Which mediums make sense for each source, first one is the default. */
export const SOURCE_MEDIUMS: Record<UtmSource, UtmMedium[]> = {
  meta: ["paid"],
  instagram: ["organic", "dm"],
  linkedin: ["organic", "dm", "paid"],
  whatsapp: ["community", "dm"],
  email: ["lifecycle"],
  ambassador: ["referral"],
  college: ["event", "referral"],
  youtube: ["organic", "paid"],
  x: ["organic"],
  google: ["paid"],
  partner: ["referral"],
};

/** Paste into Meta Ads Manager > ad > Tracking > URL parameters. */
export const META_URL_TEMPLATE =
  "utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_content={{ad.name}}&utm_term={{adset.name}}";

// lowercase words joined by underscores, e.g. jobreel_sep26
export const CAMPAIGN_RE = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
// who/what + when, e.g. jeremy_post_0927, amb_vanshika
export const CONTENT_RE = /^[a-z0-9]+(?:[_-][a-z0-9]+)*$/;
export const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,79}$/;

export function isSource(v: string): v is UtmSource {
  return Object.prototype.hasOwnProperty.call(UTM_SOURCES, v);
}
export function isMedium(v: string): v is UtmMedium {
  return Object.prototype.hasOwnProperty.call(UTM_MEDIUMS, v);
}

export function toSlugPart(v: string): string {
  return v
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

export function isStudojoUrl(v: string): boolean {
  try {
    const u = new URL(v);
    const h = u.hostname;
    return (
      u.protocol === "https:" &&
      (h === "studojo.com" || h.endsWith(".studojo.com") || h === "studojo.pro" || h.endsWith(".studojo.pro"))
    );
  } catch {
    return false;
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
  if (!l.base_url || !isStudojoUrl(l.base_url)) errs.push("Destination must be an https studojo.com page.");
  if (!l.utm_source || !isSource(l.utm_source)) errs.push("Source must be one from the dictionary.");
  if (!l.utm_medium || !isMedium(l.utm_medium)) errs.push("Medium must be one from the dictionary.");
  if (!l.utm_campaign || !CAMPAIGN_RE.test(l.utm_campaign) || l.utm_campaign.length > 60)
    errs.push("Campaign must be lowercase words joined by underscores, e.g. jobreel_sep26.");
  else if (/^\d+$/.test(l.utm_campaign)) errs.push("Campaign cannot be a bare number. Name it, e.g. jobreel_sep26.");
  if (l.utm_content && (!CONTENT_RE.test(l.utm_content) || l.utm_content.length > 60))
    errs.push("Content must be lowercase, e.g. jeremy_post_0927.");
  if (l.utm_term && (!CONTENT_RE.test(l.utm_term) || l.utm_term.length > 60))
    errs.push("Term must be lowercase, e.g. finance_students.");
  if (l.slug && !SLUG_RE.test(l.slug)) errs.push("Short link may only use a-z, 0-9, - and _.");
  return errs;
}

// ── Normalising what actually arrives ─────────────────────────────────────

const SOURCE_ALIASES: Record<string, string> = {
  ig: "instagram", instagram: "instagram", "l.instagram.com": "instagram",
  fb: "meta", facebook: "meta", meta: "meta", "m.facebook.com": "meta", "l.facebook.com": "meta",
  li: "linkedin", linkedin: "linkedin", "lnkd.in": "linkedin",
  wa: "whatsapp", whatsapp: "whatsapp",
  yt: "youtube", youtube: "youtube",
  twitter: "x", x: "x", "t.co": "x",
  mail: "email", email: "email", newsletter: "email",
  google: "google", ambassador: "ambassador", college: "college", partner: "partner",
};

const MEDIUM_ALIASES: Record<string, string> = {
  paid: "paid", cpc: "paid", ppc: "paid", paid_social: "paid", paidsocial: "paid",
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
  if (host.endsWith("studojo.com") || host.endsWith("studojo.pro") || host === "accounts.google.com")
    return { source: "direct", medium: "none" };
  if (host.includes("linkedin")) return { source: "linkedin", medium: "organic" };
  if (host.includes("instagram")) return { source: "instagram", medium: "organic" };
  if (host.includes("facebook")) return { source: "meta", medium: "organic" };
  if (host.includes("whatsapp")) return { source: "whatsapp", medium: "dm" };
  if (host.includes("youtube")) return { source: "youtube", medium: "organic" };
  if (host === "t.co" || host.includes("twitter") || host === "x.com") return { source: "x", medium: "organic" };
  if (host.includes("chatgpt") || host.includes("openai") || host.includes("perplexity") || host.includes("gemini"))
    return { source: "ai_assistant", medium: "referral" };
  if (/(^|\.)google\.|googlequicksearchbox|bing\.com|duckduckgo|search\.brave|yahoo\.|ecosia/.test(host))
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
