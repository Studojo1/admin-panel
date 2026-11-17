// REACH-PAGE (15 Nov 2026, the owner: "Add '% reached twice this week' to the admin panel, with the list of students who
// weren't"). The rules and the words behind /reach and the Overview's "Reached twice this week" tile. The server
// (reach.server.ts) reads the rows; this builds the report from them. Pure and with no imports, so
// `node --test scripts/reach-model.test.mjs` reads it as is.
//
// Reached: a delivered business message on WhatsApp or by email, the rule of the product's own floor lane (career-agent
// app/lib/channels/reach.server.ts BUSINESS_SQL, REACHED_SQL and EMAIL_ONLY_SQL): a career_daily_sends row with
// delivered_at set, kind not 'inbound', not a dry run, and an email only once the provider took it and never Stu's
// answer to a student's own email. REACH-EMAIL (17 Nov 2026): since EMAIL-CH (16 Nov 2026) the product counts delivered
// emails, "2 a week across both channels", so a student with no WhatsApp link is reached by email alone. Reached twice
// this week: 2 or more such deliveries in the 7 days to now.
// Students: the Stu pages' people (the Stu dataset), plus anyone with a WhatsApp link it lacks; internal accounts
// (staff, @studojo.com, the test accounts, guests, a shared browser) are left out unless "include internal" is on.

/** Reached this many times in REACH_DAYS: reached twice (career-agent reach.ts FLOOR_TARGET). */
export const REACH_TARGET = 2;
/** The days counted back (career-agent reach.ts FLOOR_DAYS). */
export const REACH_DAYS = 7;
/** The days the trend shows. */
export const TREND_DAYS = 14;
/** Meta's daily limit on students we start a conversation with in 24 hours (career-agent wa-limit.ts, TIER_250). */
export const TIER_LIMIT = 250;
/** The product's floor lane (career-agent REACH) went live at this time. */
export const FLOOR_START = Date.parse("2026-11-15T18:38:00+05:30");
/** A try this recent with no receipt yet is still on its way, not a failure. */
export const PENDING_MS = 30 * 60_000;

const DAY_MS = 86_400_000;
const IST_MS = 330 * 60_000;

export type ReasonKey = "cap" | "spam" | "undelivered" | "pending" | "no_picks" | "not_tried" | "stop" | "not_linked";

/** What is stopping a student, in the order the lists group them. Labels stay short. */
export const REASONS: { key: ReasonKey; label: string; note: string }[] = [
  { key: "cap", label: "Meta cap 131049", note: "Meta held our last try: its per-person marketing cap" },
  { key: "spam", label: "Spam limit 131048", note: "Meta's spam rate limit stopped our last try" },
  { key: "undelivered", label: "Not delivered", note: "our last try failed, or no delivery receipt came" },
  { key: "pending", label: "Sent, no receipt yet", note: "tried in the last 30 minutes" },
  { key: "no_picks", label: "No picks", note: "no jobs picked for them in 7 days, so nothing to send" },
  { key: "not_tried", label: "Not tried yet", note: "they have picks; nothing sent since their last delivery" },
  { key: "stop", label: "Messages off", note: "they turned the daily messages off (STOP)" },
  { key: "not_linked", label: "Not linked", note: "no WhatsApp link: email is their only channel" },
];
export const REASON_LABEL: Record<ReasonKey, string> = Object.fromEntries(REASONS.map((r) => [r.key, r.label])) as Record<ReasonKey, string>;

// ------------------------------------------------------------------ input

/** A student in the population. */
export interface StudentIn {
  id: string;
  name: string;
  email: string;
  /** why the account is internal (staff, studojo.com, test account, guest, shared browser), or null */
  internal: string | null;
  onboarded: boolean;
}

/** A WhatsApp link row (active or unlinked). Times are epoch ms. */
export interface LinkIn {
  user: string;
  created: number;
  unlinked: number | null;
  active: boolean;
  /** the daily messages are on (false: they sent STOP) */
  digestOn: boolean;
  lastInbound: number | null;
}

export type Lane = "floor" | "catchup" | "other" | "email";

/** A delivered business message: who, when (delivered_at, epoch ms), and the lane that sent it. */
export interface DeliveryIn {
  user: string;
  at: number;
  lane: Lane;
}

/** A student's latest business try on WhatsApp in the last 7 days (career_channel_messages), with the counts. */
export interface AttemptIn {
  user: string;
  at: number;
  failed: boolean;
  delivered: boolean;
  code: string | null;
  error: string | null;
  /** the template or the ledger kind */
  what: string | null;
  tries: number;
  failedTries: number;
}

/** The latest message a student sent us. */
export interface InboundIn {
  user: string;
  at: number;
  kind: string;
  body: string | null;
}

/** One IST day of Meta's limits: students we started a conversation with, and the sends Meta refused. */
export interface MetaDayIn {
  day: string;
  students: number;
  spam: number;
  cap: number;
}

export interface ReachInput {
  /** the database's now, epoch ms */
  now: number;
  /** include internal accounts */
  internal: boolean;
  students: StudentIn[];
  links: LinkIn[];
  /** business deliveries over at least the last TREND_DAYS + REACH_DAYS days */
  deliveries: DeliveryIn[];
  /** each student's last delivered business message, any time */
  lastDelivered: Record<string, number>;
  attempts: AttemptIn[];
  inbound: InboundIn[];
  /** students with picks (at least one job) in the last 7 days */
  picks: string[];
  meta: { students24h: number; days: MetaDayIn[] };
}

// ----------------------------------------------------------------- output

export interface Ratio {
  n: number;
  of: number;
  pct: number | null;
}

export interface ReachPerson {
  id: string;
  name: string;
  email: string;
  internal: string | null;
  /** when the active link was made, epoch ms; null: not linked */
  linked: number | null;
  /** WhatsApp's 24 hour window is open now (they wrote to us in the last 24 hours) */
  inWindow: boolean;
  lastDelivered: number | null;
  lastIn: { at: number; text: string } | null;
  onboarded: boolean;
  /** delivered business messages (WhatsApp or email) in the last 7 days */
  d7: number;
  reason: ReasonKey;
  detail: string;
}

export interface TrendDay {
  day: string;
  /** today: the 7 days to now */
  soFar: boolean;
  /** students with an active WhatsApp link at the day's end */
  linked: number;
  /** of them, 2 or more deliveries (WhatsApp or email) in the 7 days to the day's end */
  reached: number;
  pct: number | null;
  /** deliveries that day, by lane (WhatsApp's floor, catch-up and other; every email apart) */
  floor: number;
  catchup: number;
  other: number;
  email: number;
}

export interface ReachReport {
  now: number;
  internal: boolean;
  headline: { all: Ratio; linked: Ratio; notLinked: Ratio; onboarded: Ratio; notOnboarded: Ratio };
  counts: { students: number; linked: number; zero: number; one: number; twoPlus: number; notLinked: number };
  reasons: { key: ReasonKey; label: string; zero: number; one: number; notLinked: number }[];
  trend: TrendDay[];
  floorStart: number;
  lists: { zero: ReachPerson[]; one: ReachPerson[]; notLinked: ReachPerson[] };
  meta: { students24h: number; limit: number; days: MetaDayIn[] };
}

/** What the Overview tile shows. */
export interface ReachSummary {
  all: Ratio;
  linked: Ratio;
  zero: number;
  one: number;
  notLinked: number;
}

export interface ReachEnvelope {
  report: ReachReport;
  generatedAt: string;
  env: string;
  ms: number;
  /** the tables are missing here (a database without the WhatsApp channel) */
  missing: boolean;
}

// ------------------------------------------------------------------ helpers

export const istDay = (ms: number): string => new Date(ms + IST_MS).toISOString().slice(0, 10);
export const addDays = (day: string, n: number): string => {
  const d = new Date(day + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
/** The instant an IST day ends (its next midnight), epoch ms. */
export const dayEnd = (day: string): number => Date.parse(`${addDays(day, 1)}T00:00:00+05:30`);
/** "15 Nov 09:12", IST. */
export function istText(ms: number): string {
  const d = new Date(ms + IST_MS);
  const mon = d.toLocaleString("en-GB", { month: "short", timeZone: "UTC" });
  return `${d.getUTCDate()} ${mon} ${d.toISOString().slice(11, 16)}`;
}

export function ratio(n: number, of: number): Ratio {
  return { n, of, pct: of > 0 ? Math.round((n / of) * 100) : null };
}

/** Whether a link is active at time `t`: made by then, and still active or unlinked after it. */
export function linkActiveAt(l: LinkIn, t: number): boolean {
  if (l.created > t) return false;
  if (l.active) return true;
  return l.unlinked != null && l.unlinked > t;
}

const CAP_RE = /healthy ecosystem|frequency_capped/i;
const SPAM_RE = /spam rate limit|spam_limited/i;

/** Meta's code for a refused send: 131049 (per-person cap), 131048 (spam limit), else the code given or null. */
export function metaCode(code: string | null | undefined, error: string | null | undefined): string | null {
  const c = (code ?? "").trim();
  if (c) return c;
  if (CAP_RE.test(error ?? "")) return "131049";
  if (SPAM_RE.test(error ?? "")) return "131048";
  return null;
}

/**
 * What is stopping a student who was not reached twice. In order: not linked; messages off (STOP); their latest try in
 * 7 days did not deliver (Meta's 131049 cap, its 131048 spam limit, not delivered, or still on its way); no picks in 7
 * days; else nothing tried since their last delivery. Pure.
 */
export function reasonOf(
  s: { linked: boolean; digestOn: boolean; attempt: AttemptIn | null; picks: boolean; onboarded: boolean; d7?: number },
  now: number,
): { reason: ReasonKey; detail: string } {
  if (!s.linked) {
    const by = s.d7 ? `, ${s.d7} delivered in 7 days` : "";
    return { reason: "not_linked", detail: (s.onboarded ? "Onboarded, no WhatsApp link" : "No WhatsApp link, not onboarded") + by };
  }
  if (!s.digestOn) return { reason: "stop", detail: "They turned the daily messages off" };
  const a = s.attempt;
  const tries = a ? `${a.tries} ${a.tries === 1 ? "try" : "tries"} in 7 days, ${a.failedTries} failed` : "";
  if (a && !a.delivered) {
    const what = a.what ? ` (${a.what})` : "";
    const code = metaCode(a.code, a.error);
    if (a.failed || code) {
      const reason: ReasonKey = code === "131049" ? "cap" : code === "131048" ? "spam" : "undelivered";
      const why = code ? `failed ${code}` : a.error ? `failed: ${a.error.slice(0, 60)}` : "failed";
      return { reason, detail: `Last try ${istText(a.at)}${what} ${why}. ${tries}` };
    }
    if (now - a.at < PENDING_MS) return { reason: "pending", detail: `Sent ${istText(a.at)}${what}, no receipt yet. ${tries}` };
    return { reason: "undelivered", detail: `Last try ${istText(a.at)}${what}: no delivery receipt. ${tries}` };
  }
  if (!s.picks) return { reason: "no_picks", detail: s.onboarded ? "No jobs picked for them in 7 days" : "Not onboarded, so no picks" };
  return { reason: "not_tried", detail: a ? `Last try ${istText(a.at)} delivered. ${tries}` : "No try in 7 days" };
}

/** The latest message from them as one short line. */
export function inboundText(m: InboundIn): string {
  const body = (m.body ?? "").replace(/\s+/g, " ").trim();
  if (body) return body.length > 80 ? `${body.slice(0, 79)}…` : body;
  return m.kind === "media" ? "(a photo or file)" : `(${m.kind || "message"})`;
}

// ------------------------------------------------------------------ report

/** Deliveries in (t - REACH_DAYS days, t], from a sorted list of times. */
function inWindow(times: number[], t: number): number {
  const from = t - REACH_DAYS * DAY_MS;
  let n = 0;
  for (const x of times) if (x > from && x <= t) n++;
  return n;
}

export function buildReach(i: ReachInput): ReachReport {
  const now = i.now;
  const students = i.students.filter((s) => i.internal || !s.internal);
  const inScope = new Set(students.map((s) => s.id));

  // Links by student: the active one now (one per student and channel), and every row for the trend.
  const linksOf = new Map<string, LinkIn[]>();
  for (const l of i.links) {
    if (!inScope.has(l.user)) continue;
    const xs = linksOf.get(l.user) ?? [];
    xs.push(l);
    linksOf.set(l.user, xs);
  }
  const activeLink = (id: string) => (linksOf.get(id) ?? []).filter((l) => l.active).sort((a, b) => b.created - a.created)[0] ?? null;

  const times = new Map<string, number[]>();
  for (const d of i.deliveries) {
    if (!inScope.has(d.user)) continue;
    const xs = times.get(d.user) ?? [];
    xs.push(d.at);
    times.set(d.user, xs);
  }
  const attempt = new Map(i.attempts.map((a) => [a.user, a]));
  const inbound = new Map(i.inbound.map((m) => [m.user, m]));
  const picks = new Set(i.picks);

  const people: ReachPerson[] = [];
  for (const s of students) {
    const link = activeLink(s.id);
    const d7 = inWindow(times.get(s.id) ?? [], now);
    const m = link ? inbound.get(s.id) : undefined;
    const r = d7 >= REACH_TARGET
      ? { reason: "not_tried" as ReasonKey, detail: "" }
      : reasonOf({ linked: Boolean(link), digestOn: link?.digestOn ?? false, attempt: link ? attempt.get(s.id) ?? null : null, picks: picks.has(s.id), onboarded: s.onboarded, d7 }, now);
    people.push({
      id: s.id, name: s.name, email: s.email, internal: s.internal,
      linked: link ? link.created : null,
      inWindow: Boolean(link?.lastInbound != null && now - link.lastInbound < DAY_MS),
      lastDelivered: i.lastDelivered[s.id] ?? null,
      lastIn: m ? { at: m.at, text: inboundText(m) } : null,
      onboarded: s.onboarded, d7, reason: r.reason, detail: r.detail,
    });
  }

  const linked = people.filter((p) => p.linked != null);
  const reached = (xs: ReachPerson[]) => xs.filter((p) => p.d7 >= REACH_TARGET).length;
  const onb = people.filter((p) => p.onboarded);
  const notOnb = people.filter((p) => !p.onboarded);
  const order = new Map(REASONS.map((r, k) => [r.key, k]));
  const byReason = (a: ReachPerson, b: ReachPerson) =>
    (order.get(a.reason) ?? 99) - (order.get(b.reason) ?? 99) || (b.linked ?? 0) - (a.linked ?? 0) || a.email.localeCompare(b.email);
  const zero = linked.filter((p) => p.d7 === 0).sort(byReason);
  const one = linked.filter((p) => p.d7 === 1).sort(byReason);
  // Not linked and not reached twice (by email); a student with no link reached twice by email counts in 2 or more.
  const unlinked = people.filter((p) => p.linked == null);
  const notLinked = unlinked.filter((p) => p.d7 < REACH_TARGET).sort((a, b) => Number(b.onboarded) - Number(a.onboarded) || a.email.localeCompare(b.email));

  // The trend: for each of the last TREND_DAYS IST days, the linked students at its end (now, for today) and how many
  // had 2 or more deliveries in the 7 days to then; and the deliveries that day by lane.
  const today = istDay(now);
  const trend: TrendDay[] = [];
  const lanes = new Map<string, { floor: number; catchup: number; other: number; email: number }>();
  for (const d of i.deliveries) {
    if (!inScope.has(d.user) || d.at > now) continue;
    const k = istDay(d.at);
    const c = lanes.get(k) ?? { floor: 0, catchup: 0, other: 0, email: 0 };
    c[d.lane]++;
    lanes.set(k, c);
  }
  for (let k = TREND_DAYS - 1; k >= 0; k--) {
    const day = addDays(today, -k);
    const t = k === 0 ? now : Math.min(dayEnd(day), now);
    let on = 0;
    let hit = 0;
    for (const [id, ls] of linksOf) {
      if (!ls.some((l) => linkActiveAt(l, t))) continue;
      on++;
      if (inWindow(times.get(id) ?? [], t) >= REACH_TARGET) hit++;
    }
    const c = lanes.get(day) ?? { floor: 0, catchup: 0, other: 0, email: 0 };
    trend.push({ day, soFar: k === 0, linked: on, reached: hit, pct: ratio(hit, on).pct, ...c });
  }

  const metaDays = new Map(i.meta.days.map((d) => [d.day, d]));
  const days: MetaDayIn[] = [];
  for (let k = TREND_DAYS - 1; k >= 0; k--) {
    const day = addDays(today, -k);
    days.push(metaDays.get(day) ?? { day, students: 0, spam: 0, cap: 0 });
  }

  const reasons = REASONS.map((r) => ({
    key: r.key, label: r.label,
    zero: zero.filter((p) => p.reason === r.key).length,
    one: one.filter((p) => p.reason === r.key).length,
    notLinked: notLinked.filter((p) => p.reason === r.key).length,
  }));

  return {
    now, internal: i.internal,
    headline: {
      all: ratio(reached(people), people.length),
      linked: ratio(reached(linked), linked.length),
      notLinked: ratio(reached(unlinked), unlinked.length),
      onboarded: ratio(reached(onb), onb.length),
      notOnboarded: ratio(reached(notOnb), notOnb.length),
    },
    counts: { students: people.length, linked: linked.length, zero: zero.length, one: one.length, twoPlus: reached(people), notLinked: notLinked.length },
    reasons, trend, floorStart: FLOOR_START,
    lists: { zero, one, notLinked },
    meta: { students24h: i.meta.students24h, limit: TIER_LIMIT, days },
  };
}

export function summaryOf(r: ReachReport): ReachSummary {
  return { all: r.headline.all, linked: r.headline.linked, zero: r.counts.zero, one: r.counts.one, notLinked: r.counts.notLinked };
}
