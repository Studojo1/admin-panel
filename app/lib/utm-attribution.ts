// UTM link report (relaunch, 2 Nov 2026): which short link, and which campaign,
// each visitor and sign-up came through. Pure, no imports, so
// `node --test scripts/utm-attribution.test.mjs` reads it as is.
//
// A touch (a source JSON: career_user_source.first_touch / last_touch, or a
// journey event's source) is credited to ONE link:
//   1. utm_id = the link's slug (studojo.com/go/<slug> adds it; exact);
//   2. a touch with no utm_id: the link whose utm_source, utm_medium and
//      utm_campaign match (case-insensitive) and whose content and term, when
//      the link has them, match too. The most specific link wins, then the oldest.
// A touch whose utm_id names no link is credited to no link (it still counts
// under its own campaign).

export interface LinkKey {
  id: string;
  slug: string | null;
  source: string;
  medium: string;
  campaign: string;
  content: string | null;
  term: string | null;
}

export interface TouchKey {
  utm_id: string | null;
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
}

const low = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().toLowerCase().slice(0, 200) : null);

/** A source JSON's utm keys, lowercased, or null when it has none of them. */
export function touchKey(raw: unknown): TouchKey | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  const t: TouchKey = {
    utm_id: low(o.utm_id),
    source: low(o.utm_source),
    medium: low(o.utm_medium),
    campaign: low(o.utm_campaign),
    content: low(o.utm_content),
    term: low(o.utm_term),
  };
  return t.utm_id || t.source || t.campaign ? t : null;
}

/**
 * The product keeps only the utm keys it knows in career_user_source, so a
 * source row can lack utm_id while the website's journey events for the same
 * person carry it. `base` is the row's touch, `ev` the journey event's touch of
 * the same kind (first or last): ev's utm_id is used when the row has none and
 * the two agree on source, medium and campaign (or the row has no tags at all).
 */
export function withUtmId(base: TouchKey | null, ev: TouchKey | null): TouchKey | null {
  if (!base) return ev;
  if (base.utm_id || !ev?.utm_id) return base;
  if (!base.source && !base.campaign) return ev;
  if (base.source === ev.source && base.medium === ev.medium && base.campaign === ev.campaign) return { ...base, utm_id: ev.utm_id };
  return base;
}

export interface LinkIndex {
  bySlug: Map<string, LinkKey>;
  byTags: Map<string, LinkKey[]>;
}

const tagKey = (s: string | null, m: string | null, c: string | null) => `${s ?? ""}|${m ?? ""}|${c ?? ""}`;

/** `links` oldest first. */
export function indexLinks(links: LinkKey[]): LinkIndex {
  const bySlug = new Map<string, LinkKey>();
  const byTags = new Map<string, LinkKey[]>();
  for (const raw of links) {
    const l: LinkKey = {
      id: raw.id,
      slug: low(raw.slug),
      source: low(raw.source) ?? "",
      medium: low(raw.medium) ?? "",
      campaign: low(raw.campaign) ?? "",
      content: low(raw.content),
      term: low(raw.term),
    };
    if (l.slug && !bySlug.has(l.slug)) bySlug.set(l.slug, l);
    const k = tagKey(l.source, l.medium, l.campaign);
    byTags.set(k, [...(byTags.get(k) ?? []), l]);
  }
  return { bySlug, byTags };
}

/** The one link a touch is credited to, or null. */
export function linkFor(t: TouchKey | null, ix: LinkIndex): LinkKey | null {
  if (!t) return null;
  if (t.utm_id) return ix.bySlug.get(t.utm_id) ?? null;
  const cands = (ix.byTags.get(tagKey(t.source, t.medium, t.campaign)) ?? []).filter(
    (l) => (l.content == null || l.content === t.content) && (l.term == null || l.term === t.term),
  );
  if (!cands.length) return null;
  const spec = (l: LinkKey) => (l.content ? 2 : 0) + (l.term ? 1 : 0);
  return cands.reduce((best, l) => (spec(l) > spec(best) ? l : best));
}

// ------------------------------------------------------------------ the report

export interface ReportUser {
  /** IST day they joined Stu (the dashboards' sign-up cohort day) */
  day: string;
  internal: boolean;
  touch: TouchKey | null;
  onboarded: boolean;
  paid: boolean;
  /** real revenue in paise (test payments left out) */
  revenue: number;
}

export interface ReportVisitor {
  id: string;
  /** IST day of the event that carried the touch */
  day: string;
  internal: boolean;
  touch: TouchKey | null;
}

export interface ReportClick {
  linkId: string;
  day: string;
  bot: boolean;
  n: number;
}

export interface Stats {
  clicks: number;
  botClicks: number;
  visitors: number;
  signups: number;
  onboarded: number;
  paid: number;
  /** paise */
  revenue: number;
}

export const emptyStats = (): Stats => ({ clicks: 0, botClicks: 0, visitors: 0, signups: 0, onboarded: 0, paid: 0, revenue: 0 });

export interface Report {
  links: Record<string, Stats>;
  campaigns: (Stats & { campaign: string; links: number })[];
  totals: { signups: number; viaLink: number; tagged: number; visitors: number };
}

/** Per link and per campaign, for IST days start..end (inclusive). Internal people are left out unless `internal`. */
export function buildReport(args: {
  links: LinkKey[];
  clicks: ReportClick[];
  users: ReportUser[];
  visitors: ReportVisitor[];
  start: string;
  end: string;
  internal: boolean;
}): Report {
  const { links, clicks, users, visitors, start, end, internal } = args;
  const ix = indexLinks(links);
  const inRange = (day: string) => day >= start && day <= end;
  const byLink: Record<string, Stats> = {};
  const byCampaign = new Map<string, Stats & { campaign: string; links: number }>();
  const linkStats = (id: string) => (byLink[id] ??= emptyStats());
  const campaignStats = (c: string) => {
    let s = byCampaign.get(c);
    if (!s) byCampaign.set(c, (s = { ...emptyStats(), campaign: c, links: 0 }));
    return s;
  };
  const linkById = new Map<string, LinkKey>();
  for (const l of ix.bySlug.values()) linkById.set(l.id, l);
  for (const ls of ix.byTags.values()) for (const l of ls) linkById.set(l.id, l);
  for (const l of linkById.values()) {
    linkStats(l.id);
    if (l.campaign) campaignStats(l.campaign).links++;
  }
  const campaignOf = (t: TouchKey | null, l: LinkKey | null) => l?.campaign || t?.campaign || null;

  for (const c of clicks) {
    if (!inRange(c.day)) continue;
    const l = linkById.get(c.linkId);
    if (!l) continue;
    const k = c.bot ? "botClicks" : "clicks";
    linkStats(l.id)[k] += c.n;
    if (l.campaign) campaignStats(l.campaign)[k] += c.n;
  }

  // A visitor counts once per link and once per campaign.
  const seenLink = new Set<string>();
  const seenCampaign = new Set<string>();
  const allVisitors = new Set<string>();
  for (const v of visitors) {
    if (!inRange(v.day) || (v.internal && !internal) || !v.touch) continue;
    allVisitors.add(v.id);
    const l = linkFor(v.touch, ix);
    if (l && !seenLink.has(`${l.id}|${v.id}`)) {
      seenLink.add(`${l.id}|${v.id}`);
      linkStats(l.id).visitors++;
    }
    const c = campaignOf(v.touch, l);
    if (c && !seenCampaign.has(`${c}|${v.id}`)) {
      seenCampaign.add(`${c}|${v.id}`);
      campaignStats(c).visitors++;
    }
  }

  let signups = 0;
  let viaLink = 0;
  let tagged = 0;
  for (const u of users) {
    if (!inRange(u.day) || (u.internal && !internal)) continue;
    signups++;
    if (u.touch?.source || u.touch?.utm_id) tagged++;
    const l = linkFor(u.touch, ix);
    const c = campaignOf(u.touch, l);
    const add = (s: Stats) => {
      s.signups++;
      if (u.onboarded) s.onboarded++;
      if (u.paid) s.paid++;
      s.revenue += u.revenue;
    };
    if (l) {
      viaLink++;
      add(linkStats(l.id));
    }
    if (c) add(campaignStats(c));
  }

  const campaigns = [...byCampaign.values()].sort((a, b) => b.signups - a.signups || b.clicks - a.clicks || a.campaign.localeCompare(b.campaign));
  return { links: byLink, campaigns, totals: { signups, viaLink, tagged, visitors: allVisitors.size } };
}

/** n of d as a percentage with one decimal, or null when d is 0. */
export const rate = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);
