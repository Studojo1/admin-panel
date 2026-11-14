// VISITORS (4 Nov 2026, the owner: "how many real users, how many crawlers and from what source etc, and how many
// real visitors to sign up if they didnt signup whats the most common drop off point across each"). The words, the
// rules and the counts behind the Visitors section on the Overview and the /visitors page. The server
// (visitors.server.ts) reads the rows; this builds the report from them. Pure and with no imports, so
// `node --test scripts/visitors-model.test.mjs` reads it as is.
//
// Who counts as what, in a range of IST days:
// - Real visitor: a visitor id with a page_view in the range (the site's script ran in a browser), the REAL-VISITORS
//   rule the Stu pages use. Most also have that day's visited_home; one without it reloaded a cached page or opened a
//   page that writes no visited_home, and is still a person (realNoServerRow says how many).
// - Likely bot: a visited_home in the range and no page_view in it. The server row passed isbot, the browser never
//   ran the page's script: a headless scraper with a browser's user agent. ADMIN-FIX (5 Nov 2026): not when the
//   visitor id began sign-up or became an account; that is a person whose page_view did not arrive (noPageView).
// - Declared crawler: a page render whose user agent names a bot (Googlebot, GPTBot, ...). Never in the journey log;
//   counted by the site in public.site_bot_hits by IST day, bot family and path group (hits, not people).
// Internal: a visitor whose id is linked to a staff, @studojo.com, test or guest account is left out, the rule of
// every Stu page, unless "include internal" is on. Anonymous team visits cannot be told apart.

export const SITE_STEPS = ["visited_home", "page_view", "page_engaged", "clicked_join", "signup_started", "saw_signup"] as const;
/** The Stu steps after sign-up shown per source; times come from the Stu dataset (truth tables first). */
export const PERSON_STEPS = ["reached_stu", "call_started", "call_completed", "saw_jobs", "paid"] as const;
export type PersonStep = (typeof PERSON_STEPS)[number];

/** Seconds a page must be in view to count as engaged (the page's first check is at 5 s). */
export const ENGAGED_S = 5;
/** Scroll depth that counts as scrolled. */
export const SCROLL_PCT = 50;
/** The homepage's data-section names, top to bottom (Studojo1/frontend app/components/home-v3/HomeV3.tsx). */
export const HOME_SECTIONS = ["hero", "how", "why", "proof", "faq", "footer"] as const;
export const SECTION_LABELS: Record<string, string> = {
  hero: "Hero (first screen)", how: "How it works", why: "Why email", proof: "Proof", faq: "FAQ", footer: "Footer", none: "No section recorded",
};

export type DeviceFilter = "all" | "mobile" | "desktop";
export const DEVICES: { key: DeviceFilter; label: string }[] = [
  { key: "all", label: "All devices" }, { key: "mobile", label: "Mobile" }, { key: "desktop", label: "Desktop" },
];

/** One journey row in the range, as the server reads it (only the props the page needs). */
export interface SiteRow {
  v: string;
  step: string;
  /** epoch ms */
  at: number;
  /** IST day */
  day: string;
  path: string | null;
  device: string | null;
  inapp: string | null;
  engaged: number | null;
  scroll: number | null;
  cta: boolean;
  sections: string[] | null;
}

/** The Stu person a visitor id became. joined null: an account with no Stu activity (not a Stu sign-up). */
export interface Person {
  /** the account's id: two browsers of one person count as one sign-up (ADMIN-AUDIT-STU, 14 Nov 2026) */
  id?: string;
  internal: boolean;
  joined: number | null;
  steps: Partial<Record<PersonStep, number>>;
}

export interface BotRow {
  day: string;
  bot: string;
  path_group: string;
  hits: number;
}

export interface VisitorsInput {
  start: string;
  end: string;
  device: DeviceFilter;
  internal: boolean;
  rows: SiteRow[];
  /** visitor id -> the earliest source row it carries (first touch) */
  touch: Record<string, unknown>;
  /** visitor id -> the person it is linked to */
  people: Record<string, Person>;
  /** site_bot_hits rows in the range; null when the table is not on this database */
  bots: BotRow[] | null;
  /**
   * The first page_view this database holds, epoch ms. Before it the site sent none (3 Nov 2026 21:58 IST on
   * production), so a visited_home then cannot be told real or bot: it counts as before tracking, not as a bot.
   * Null: no page_view at all here, so every visited_home without one is a likely bot.
   */
  pageViewStart?: number | null;
}

// ------------------------------------------------------------------ funnel

export const FUNNEL = [
  { key: "real", label: "Real visitors", hint: "A page_view in the range: the page's script ran in a browser" },
  { key: "engaged", label: "Engaged", hint: `${ENGAGED_S} seconds or more on a page with the tab in view` },
  { key: "scrolled", label: `Scrolled ${SCROLL_PCT}%+`, hint: `Reached ${SCROLL_PCT}% of a page or more` },
  { key: "cta", label: "Saw Start", hint: "A Start button was at least half on screen for half a second" },
  { key: "clicked", label: "Clicked Start", hint: "Clicked a Start or join button (clicked_join)" },
  { key: "began", label: "Began sign-up (partly tracked)", hint: "Reached the sign-up step (signup_started). Partly tracked: recorded for about 1 sign-up in 10 (the Google sign-in path writes none), so it is never used as a drop-off" },
  { key: "signed_up", label: "Signed up", hint: "People (not browsers) who joined Stu in the range, from a visit that sent a page_view (sign-ups with no tracked visit are on the Overview's Sign-ups)" },
  { key: "reached_stu", label: "Reached Stu", hint: "Opened Stu after signing in, on or after the first day of the range" },
  { key: "call_started", label: "Call started", hint: "From the calls table" },
  { key: "call_completed", label: "Call completed", hint: "From the calls table" },
  { key: "saw_jobs", label: "Saw jobs", hint: "From the job views table" },
  { key: "paid", label: "Paid", hint: "A real payment (paid orders or plans, test payments left out)" },
] as const;
export type FunnelKey = (typeof FUNNEL)[number]["key"];

// --------------------------------------------------------------- drop-offs

/**
 * Where a real visitor who did not sign up stopped, furthest step first. ADMIN-AUDIT-STU (14 Nov 2026): "Began sign-up"
 * is recorded for only about 1 sign-up in 10, so it is not a stop of its own: a visitor who clicked Start (or began
 * sign-up) and did not sign up stopped at "Clicked Start, didn't sign up".
 */
export const DROPS = [
  { key: "clicked", label: "Clicked Start, didn't sign up" },
  { key: "cta", label: "Saw Start, didn't click" },
  { key: "scrolled", label: "Scrolled, never saw Start" },
  { key: "stayed", label: "Stayed, didn't scroll or see Start" },
  { key: "bounced", label: `Left within ${ENGAGED_S} seconds` },
] as const;
export type DropKey = (typeof DROPS)[number]["key"];
export const DROP_LABEL: Record<string, string> = Object.fromEntries(DROPS.map((d) => [d.key, d.label]));

// ----------------------------------------------------------------- sources

export interface Source {
  key: string;
  label: string;
}

const str = (o: any, k: string): string | null => {
  const v = o?.[k];
  return typeof v === "string" && v.trim() ? v.trim().slice(0, 200) : null;
};

/** The referrer's bare host (no www.), or null for none, "null" and our own sites (studojo, the Google sign-in). */
export function referrerHost(ref: string | null | undefined): string | null {
  const r = (ref ?? "").trim();
  if (!r || /^null\b/i.test(r)) return null;
  let host = "";
  try {
    host = new URL(r.includes("://") ? r : `https://${r}`).hostname.toLowerCase();
  } catch {
    return null;
  }
  host = host.replace(/^www\./, "").replace(/\.$/, "");
  if (!host || host === "null") return null;
  if (/(^|\.)studojo\.(com|pro)$/.test(host) || host === "accounts.google.com" || host === "accounts.youtube.com" || host === "localhost") return null;
  return host;
}

/** The source group of a referrer host. */
export function referrerSource(host: string): Source {
  if (/chatgpt|openai/.test(host)) return { key: "ref:chatgpt", label: "ChatGPT" };
  if (/perplexity/.test(host)) return { key: "ref:perplexity", label: "Perplexity" };
  if (/gemini\.google|claude\.ai|copilot|deepseek|grok|you\.com|meta\.ai/.test(host)) return { key: "ref:ai_other", label: "Other AI assistants" };
  if (/mail\.google|com\.google\.android\.gm|outlook|mail\.yahoo|mail\./.test(host)) return { key: "ref:email", label: "Email" };
  if (/(^|\.)google\.[a-z.]+$|googlequicksearchbox/.test(host)) return { key: "ref:google", label: "Google search" };
  if (/(^|\.)bing\.com$/.test(host)) return { key: "ref:bing", label: "Bing" };
  if (/duckduckgo/.test(host)) return { key: "ref:duckduckgo", label: "DuckDuckGo" };
  if (/yandex/.test(host)) return { key: "ref:yandex", label: "Yandex" };
  if (/search\.yahoo|ecosia|search\.brave|qwant|baidu|startpage|naver|seznam/.test(host)) return { key: "ref:search_other", label: "Other search engines" };
  if (/linkedin|lnkd\.in/.test(host)) return { key: "ref:linkedin", label: "LinkedIn" };
  if (/instagram/.test(host)) return { key: "ref:instagram", label: "Instagram" };
  if (/facebook|(^|\.)fb\.(me|com)$|messenger\.com/.test(host)) return { key: "ref:facebook", label: "Facebook" };
  if (host === "t.co" || /twitter|(^|\.)x\.com$/.test(host)) return { key: "ref:x", label: "X" };
  if (/youtube|youtu\.be/.test(host)) return { key: "ref:youtube", label: "YouTube" };
  if (/reddit/.test(host)) return { key: "ref:reddit", label: "Reddit" };
  if (/whatsapp|(^|\.)wa\.me$/.test(host)) return { key: "ref:whatsapp", label: "WhatsApp" };
  return { key: "ref:other", label: "Other sites" };
}

/** home, blog, report or other, for a landing path. */
export function landingGroup(path: string | null | undefined): "home" | "blog" | "report" | "other" {
  const p = (path ?? "").split("?")[0];
  if (p === "/" || p === "") return "home";
  if (p === "/blog" || p.startsWith("/blog/")) return "blog";
  if (p === "/reports" || p.startsWith("/reports/")) return "report";
  return "other";
}
export const LANDING_LABEL: Record<string, string> = { home: "Homepage", blog: "Blog", report: "Reports", other: "Other pages" };

const INAPP_LABEL: Record<string, string> = {
  instagram: "Instagram app", facebook: "Facebook app", linkedin: "LinkedIn app", whatsapp: "WhatsApp", other: "Another app",
};

/**
 * A visitor's first touch, in this order: a utm_source tag; a Google or Meta click id with no tag; the referrer's
 * host group; an app's own browser with no referrer; else direct, split by the landing page.
 */
export function sourceOf(raw: unknown, inapp: string | null | undefined, landing: string | null | undefined): Source {
  const o = raw && typeof raw === "object" ? (raw as any) : {};
  const utm = str(o, "utm_source");
  if (utm) {
    const s = utm.toLowerCase().replace(/[^a-z0-9_.-]/g, "").slice(0, 30) || "other";
    return { key: `utm:${s}`, label: `utm_source ${s}` };
  }
  if (str(o, "gclid") || str(o, "gbraid") || str(o, "wbraid")) return { key: "click:google", label: "Google ads (gclid, no tag)" };
  const host = referrerHost(str(o, "referrer"));
  if (host) return referrerSource(host);
  const app = (inapp ?? "").toLowerCase();
  if (app && app !== "none" && INAPP_LABEL[app]) return { key: `inapp:${app}`, label: `${INAPP_LABEL[app]}, no referrer` };
  if (str(o, "fbclid")) return { key: "click:meta", label: "Meta link (fbclid, no tag)" };
  const g = landingGroup(str(o, "landing_path") ?? landing);
  return { key: `direct:${g}`, label: g === "home" ? "Direct, homepage" : g === "blog" ? "Direct, blog" : g === "report" ? "Direct, reports" : "Direct, other page" };
}

// -------------------------------------------------------------------- bots

export const BOT_LABELS: Record<string, string> = {
  googlebot: "Googlebot", bingbot: "Bingbot", gptbot: "GPTBot (OpenAI training)", chatgpt: "ChatGPT search and browsing",
  claudebot: "ClaudeBot (Anthropic)", perplexitybot: "PerplexityBot", meta_externalagent: "Meta AI crawler",
  facebook_preview: "Facebook link preview", applebot: "Applebot", yandexbot: "YandexBot", duckduckbot: "DuckDuckBot",
  baiduspider: "Baidu", bytespider: "Bytespider (ByteDance)", amazonbot: "Amazonbot", ccbot: "Common Crawl",
  ahrefsbot: "AhrefsBot", semrushbot: "SemrushBot", seo_other: "Other SEO crawlers", linkedinbot: "LinkedIn link preview",
  twitterbot: "X link preview", whatsapp_preview: "WhatsApp link preview", preview_other: "Other link previews",
  monitor: "Health checks and uptime monitors", headless: "Headless browsers", script_client: "Scripts (curl, Python and the like)",
  no_user_agent: "No user agent", other_bot: "Other bots", scripted: "Scripted browser (no bot name)", studojo_audit: "Our audit bot",
};
export const BOT_GROUPS = ["home", "blog", "report", "legal", "other"] as const;
export const BOT_GROUP_LABEL: Record<string, string> = { home: "Home", blog: "Blog", report: "Reports", legal: "Legal", other: "Other" };
/** Our own audit runs and the health checks (kube-probe, uptime monitors hit the homepage every few seconds), shown only with "include internal". */
export const INTERNAL_BOTS = new Set(["studojo_audit", "monitor"]);

// ------------------------------------------------------------------ report

export type Counts = Record<FunnelKey, number>;
const zero = (): Counts => Object.fromEntries(FUNNEL.map((f) => [f.key, 0])) as Counts;

export interface SourceRow {
  key: string;
  label: string;
  counts: Counts;
  /** real visitors who already had a Stu account before the range (they cannot sign up again) */
  returning: number;
  /** new sign-ups of the real visitors without an account, % */
  signupPct: number | null;
  /** most common referrer hosts or utm tags behind the row, for the hover */
  detail: string;
}

export interface DropRow {
  key: string;
  label: string;
  /** real visitors who did not sign up and had no account */
  total: number;
  by: Record<DropKey, number>;
  /** the most common last step */
  top: DropKey | null;
}

export interface VisitorsReport {
  start: string;
  end: string;
  device: DeviceFilter;
  internal: boolean;
  summary: {
    real: number;
    /** crawler page hits in the range; null: not recorded on this database */
    crawlers: number | null;
    likelyBots: number;
    signedUp: number;
    /** real visitors without an account before the range */
    newVisitors: number;
    signupPct: number | null;
    /** real visitors with no visited_home that day (a cached page or a page that writes none) */
    realNoServerRow: number;
    /** visitors left out as internal */
    excluded: number;
    /** visitors seen only before the site sent page_view (pageViewStart): neither real nor bot */
    beforeTracking: number;
    /** visitors with no page_view who began sign-up or became an account: people, so not likely bots (and not real visitors, which need a page_view) */
    noPageView: number;
    pageViewStart: number | null;
    top: { key: string; label: string; real: number; signedUp: number; pct: number | null }[];
    biggestDrop: { key: DropKey; label: string; n: number; of: number; pct: number | null } | null;
  };
  total: SourceRow;
  sources: SourceRow[];
  dropTotal: DropRow;
  drops: DropRow[];
  /** home page views of real visitors who didn't click Start: the last section each one saw */
  sections: { key: string; label: string; n: number }[];
  sectionBase: number;
  bots: {
    total: number;
    byLanding: { key: string; label: string; mobile: number; desktop: number; other: number; total: number }[];
    bySource: { key: string; label: string; n: number }[];
  };
  crawlers: {
    recorded: boolean;
    total: number;
    groups: Record<string, number>;
    rows: { bot: string; label: string; total: number; groups: Record<string, number> }[];
  };
  byDay: { day: string; real: number; likelyBots: number; crawlers: number | null; signedUp: number }[];
}

/** What /api/visitors answers: the report, plus where and when it was read. */
export interface VisitorsEnvelope extends VisitorsReport {
  generatedAt: string;
  env: string;
  ms: number;
  journeyLive: boolean;
  capped: boolean;
}

export const pct = (n: number, d: number): number | null => (d > 0 ? Math.round((n / d) * 1000) / 10 : null);

const IST_MS = 330 * 60_000;
export const istDay = (ms: number): string => new Date(ms + IST_MS).toISOString().slice(0, 10);
export const dayStart = (day: string): number => Date.parse(`${day}T00:00:00+05:30`);
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** mobile (phones and tablets), desktop or unknown. */
export function deviceGroup(device: string | null | undefined): "mobile" | "desktop" | "unknown" {
  const d = (device ?? "").toLowerCase();
  if (d === "mobile" || d === "tablet") return "mobile";
  if (d === "desktop") return "desktop";
  return "unknown";
}

interface Visit {
  id: string;
  real: boolean;
  days: Set<string>;
  realDays: Set<string>;
  device: "mobile" | "desktop" | "unknown";
  landing: string;
  source: Source;
  detail: string;
  flags: Set<FunnelKey>;
  returning: boolean;
  noServerRow: boolean;
  /** the last homepage section seen (non-clickers only), or "none" */
  lastSection: string | null;
  signedDay: string | null;
  /** the person it became (account id, else the visitor id), for counting people not browsers */
  pid: string;
  /** first row in the range, epoch ms */
  firstAt: number;
  /** another browser of the same person is counted for their sign-up and later steps */
  dupPerson?: boolean;
}

/** The furthest step a real visitor who didn't sign up reached. */
export function dropOf(flags: Set<string>): DropKey {
  if (flags.has("began") || flags.has("clicked")) return "clicked";
  if (flags.has("cta")) return "cta";
  if (flags.has("scrolled")) return "scrolled";
  if (flags.has("engaged")) return "stayed";
  return "bounced";
}

function visitsOf(input: VisitorsInput): { visits: Visit[]; excluded: number; beforeTracking: number; noPageView: number } {
  const startMs = dayStart(input.start);
  const endMs = dayStart(addDays(input.end, 1));
  const byV = new Map<string, SiteRow[]>();
  for (const r of input.rows) {
    if (!r.v || r.day < input.start || r.day > input.end) continue;
    let list = byV.get(r.v);
    if (!list) byV.set(r.v, (list = []));
    list.push(r);
  }
  const visits: Visit[] = [];
  let excluded = 0;
  let beforeTracking = 0;
  let noPageView = 0;
  const pvStart = input.pageViewStart ?? null;
  for (const [id, list] of byV) {
    list.sort((a, b) => a.at - b.at);
    const pvs = list.filter((r) => r.step === "page_view");
    const vhs = list.filter((r) => r.step === "visited_home");
    if (!pvs.length && !vhs.length) continue;
    const person = input.people[id] ?? null;
    if (person?.internal && !input.internal) {
      excluded++;
      continue;
    }
    const real = pvs.length > 0;
    if (!real && pvStart != null && !vhs.some((r) => r.at >= pvStart)) {
      beforeTracking++;
      continue;
    }
    if (!real && (person || list.some((r) => r.step === "signup_started" || r.step === "saw_signup"))) {
      noPageView++;
      continue;
    }
    const first = real ? pvs[0] : vhs[0];
    const device = deviceGroup(first.device ?? list.find((r) => r.device)?.device);
    if (input.device !== "all" && device !== input.device) continue;
    const inapp = first.inapp ?? list.find((r) => r.inapp)?.inapp ?? null;
    const raw = input.touch[id];
    const source = sourceOf(raw, inapp, first.path);
    const o = raw && typeof raw === "object" ? (raw as any) : {};
    const detail = source.key.startsWith("utm:")
      ? [str(o, "utm_medium"), str(o, "utm_campaign"), str(o, "utm_content")].filter(Boolean).join(" / ")
      : source.key === "ref:other" ? referrerHost(str(o, "referrer")) ?? "" : "";
    const flags = new Set<FunnelKey>();
    const realDays = new Set(pvs.map((r) => r.day));
    if (real) {
      flags.add("real");
      const eng = list.filter((r) => r.step === "page_engaged");
      const joins = list.filter((r) => r.step === "clicked_join");
      if (eng.some((r) => (r.engaged ?? 0) >= ENGAGED_S)) flags.add("engaged");
      if (eng.some((r) => (r.scroll ?? 0) >= SCROLL_PCT)) flags.add("scrolled");
      if (eng.some((r) => r.cta) || joins.some((r) => r.cta)) flags.add("cta");
      if (joins.length) flags.add("clicked");
      if (list.some((r) => r.step === "signup_started" || r.step === "saw_signup")) flags.add("began");
    }
    let returning = false;
    let signedDay: string | null = null;
    // ADMIN-AUDIT-STU (14 Nov 2026): a sign-up in the range, not after it (a visit this week by someone who joined
    // later is not this range's sign-up), and later steps in the range too.
    if (real && person && person.joined != null && person.joined < endMs) {
      if (person.joined < startMs) returning = true;
      else {
        flags.add("signed_up");
        signedDay = istDay(person.joined);
      }
      for (const k of PERSON_STEPS) {
        const t = person.steps[k];
        if (t != null && t >= startMs && t < endMs) flags.add(k);
      }
    }
    // The homepage section a non-clicker saw last: on their home page view that saw the most sections, the last new one.
    let lastSection: string | null = null;
    if (real && !returning && !flags.has("signed_up") && !flags.has("clicked") && !flags.has("began")) {
      const home = list.filter((r) => r.step === "page_engaged" && landingGroup(r.path) === "home");
      if (home.length) {
        const best = home.reduce((m, r) => ((r.sections?.length ?? 0) >= (m.sections?.length ?? 0) ? r : m), home[0]);
        const s = best.sections ?? [];
        lastSection = s.length ? s[s.length - 1] : "none";
      }
    }
    const serverDays = new Set(vhs.map((r) => r.day));
    visits.push({
      id, real, days: new Set(list.map((r) => r.day)), realDays, device, landing: landingGroup(first.path), source, detail, flags, returning,
      noServerRow: real && ![...realDays].some((d) => serverDays.has(d)), lastSection, signedDay,
      pid: person?.id ? `u:${person.id}` : `v:${id}`, firstAt: list[0].at,
    });
  }
  // ADMIN-AUDIT-STU (14 Nov 2026): people, not browsers. One person on two browsers (phone and laptop) is one sign-up:
  // their first real visit in the range carries the sign-up and the later steps; the others still did not drop off.
  const seen = new Set<string>();
  for (const v of [...visits].sort((a, b) => Number(b.real) - Number(a.real) || a.firstAt - b.firstAt)) {
    if (!v.pid.startsWith("u:") || !v.flags.has("signed_up")) continue;
    if (seen.has(v.pid)) v.dupPerson = true;
    else seen.add(v.pid);
  }
  return { visits, excluded, beforeTracking, noPageView };
}

function topDetail(xs: string[]): string {
  const m = new Map<string, number>();
  for (const x of xs) if (x) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} (${n})`).join(", ");
}

/** The flags a person carries once, whatever the number of browsers. */
const PERSON_FLAGS = new Set<string>(["signed_up", ...PERSON_STEPS]);

function sourceRow(key: string, label: string, vs: Visit[]): SourceRow {
  const counts = zero();
  let returning = 0;
  for (const v of vs) {
    for (const f of v.flags) if (!(v.dupPerson && PERSON_FLAGS.has(f))) counts[f]++;
    if (v.returning) returning++;
  }
  return { key, label, counts, returning, signupPct: pct(counts.signed_up, counts.real - returning), detail: topDetail(vs.map((v) => v.detail)) };
}

function dropRow(key: string, label: string, vs: Visit[]): DropRow {
  const by = Object.fromEntries(DROPS.map((d) => [d.key, 0])) as Record<DropKey, number>;
  let total = 0;
  for (const v of vs) {
    if (!v.real || v.returning || v.flags.has("signed_up")) continue;
    by[dropOf(v.flags)]++;
    total++;
  }
  let top: DropKey | null = null;
  for (const d of DROPS) if (by[d.key] > 0 && (top == null || by[d.key] > by[top])) top = d.key;
  return { key, label, total, by, top };
}

export function buildReport(input: VisitorsInput): VisitorsReport {
  const { visits, excluded, beforeTracking, noPageView } = visitsOf(input);
  const real = visits.filter((v) => v.real);
  const bots = visits.filter((v) => !v.real);

  // Sources, most real visitors first.
  const groups = new Map<string, { label: string; vs: Visit[] }>();
  for (const v of real) {
    let g = groups.get(v.source.key);
    if (!g) groups.set(v.source.key, (g = { label: v.source.label, vs: [] }));
    g.vs.push(v);
  }
  const order = [...groups.entries()].sort((a, b) => b[1].vs.length - a[1].vs.length || a[1].label.localeCompare(b[1].label));
  const total = sourceRow("all", "All real visitors", real);
  const sources = order.map(([k, g]) => sourceRow(k, g.label, g.vs));
  const dropTotal = dropRow("all", "All real visitors", real);
  const drops = order.map(([k, g]) => dropRow(k, g.label, g.vs)).filter((d) => d.total > 0);

  // Homepage sections, top to bottom, then anything else, then none.
  const sec = new Map<string, number>();
  let sectionBase = 0;
  for (const v of real) {
    if (v.lastSection == null) continue;
    sectionBase++;
    sec.set(v.lastSection, (sec.get(v.lastSection) ?? 0) + 1);
  }
  const known = HOME_SECTIONS as readonly string[];
  const secKeys = [...known, ...[...sec.keys()].filter((k) => !known.includes(k) && k !== "none").sort(), "none"];
  const sections = secKeys.filter((k) => sec.has(k) || known.includes(k)).map((k) => ({ key: k, label: SECTION_LABELS[k] ?? k, n: sec.get(k) ?? 0 }));

  // Likely bots: landing group by device, and their source.
  const landingKeys = ["home", "blog", "report", "other"];
  const byLanding = landingKeys.map((k) => {
    const vs = bots.filter((v) => v.landing === k);
    const mobile = vs.filter((v) => v.device === "mobile").length;
    const desktop = vs.filter((v) => v.device === "desktop").length;
    return { key: k, label: LANDING_LABEL[k], mobile, desktop, other: vs.length - mobile - desktop, total: vs.length };
  });
  const bsrc = new Map<string, { label: string; n: number }>();
  for (const v of bots) {
    const g = bsrc.get(v.source.key) ?? { label: v.source.label, n: 0 };
    g.n++;
    bsrc.set(v.source.key, g);
  }
  const bySource = [...bsrc.entries()].map(([key, g]) => ({ key, ...g })).sort((a, b) => b.n - a.n);

  // Declared crawlers from site_bot_hits.
  const recorded = input.bots != null;
  const cgroups: Record<string, number> = Object.fromEntries(BOT_GROUPS.map((g) => [g, 0]));
  const cmap = new Map<string, { total: number; groups: Record<string, number> }>();
  const crawlDay = new Map<string, number>();
  let ctotal = 0;
  for (const b of input.bots ?? []) {
    if (b.day < input.start || b.day > input.end) continue;
    if (INTERNAL_BOTS.has(b.bot) && !input.internal) continue;
    const n = Number(b.hits) || 0;
    const g = (BOT_GROUPS as readonly string[]).includes(b.path_group) ? b.path_group : "other";
    let row = cmap.get(b.bot);
    if (!row) cmap.set(b.bot, (row = { total: 0, groups: Object.fromEntries(BOT_GROUPS.map((x) => [x, 0])) }));
    row.total += n;
    row.groups[g] += n;
    cgroups[g] += n;
    ctotal += n;
    crawlDay.set(b.day, (crawlDay.get(b.day) ?? 0) + n);
  }
  const crawlRows = [...cmap.entries()]
    .map(([bot, r]) => ({ bot, label: BOT_LABELS[bot] ?? bot, ...r }))
    .sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));

  // By day: a visitor counts on each day they were real (or, for a bot, seen).
  const byDay: VisitorsReport["byDay"] = [];
  for (let d = input.start; d <= input.end && byDay.length < 400; d = addDays(d, 1)) {
    byDay.push({
      day: d,
      real: real.filter((v) => v.realDays.has(d)).length,
      likelyBots: bots.filter((v) => v.days.has(d)).length,
      crawlers: recorded ? crawlDay.get(d) ?? 0 : null,
      signedUp: real.filter((v) => v.signedDay === d && !v.dupPerson).length,
    });
  }

  const newVisitors = total.counts.real - total.returning;
  const top = sources.slice(0, 4).map((s) => ({ key: s.key, label: s.label, real: s.counts.real, signedUp: s.counts.signed_up, pct: s.signupPct }));
  const bd = dropTotal.top;
  return {
    start: input.start,
    end: input.end,
    device: input.device,
    internal: input.internal,
    summary: {
      real: real.length,
      crawlers: recorded ? ctotal : null,
      likelyBots: bots.length,
      signedUp: total.counts.signed_up,
      newVisitors,
      signupPct: pct(total.counts.signed_up, newVisitors),
      realNoServerRow: real.filter((v) => v.noServerRow).length,
      excluded,
      beforeTracking,
      noPageView,
      pageViewStart: input.pageViewStart ?? null,
      top,
      biggestDrop: bd ? { key: bd, label: DROP_LABEL[bd], n: dropTotal.by[bd], of: dropTotal.total, pct: pct(dropTotal.by[bd], dropTotal.total) } : null,
    },
    total,
    sources,
    dropTotal,
    drops,
    sections,
    sectionBase,
    bots: { total: bots.length, byLanding, bySource },
    crawlers: { recorded, total: ctotal, groups: cgroups, rows: crawlRows },
    byDay,
  };
}
