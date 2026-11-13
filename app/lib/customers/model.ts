// Customers (13 Nov 2026, the owner: "I want to give a team member access to see all our customer data so they can
// focus on finding companies for some super promising ones and get them hired ... Ensure that admin also has all scout
// access. Don't need to create a new scout role. Just make this entire page for admin. On dashboard."). The pure half of
// /customers: what each signal means, the rank (who is most likely doing well and happy), the words that mark thanks or a
// complaint in what a customer wrote to Stu, and the list's filters. Server side: customers.server.ts. Page:
// app/routes/customers.tsx. Tests: scripts/customers-model.test.mjs.

/** Where the team stands with a company it found for a customer. */
export const PICK_STATUSES = ["idea", "told", "applied", "interview", "offer", "hired", "dropped"] as const;
export type PickStatus = (typeof PICK_STATUSES)[number];
export const PICK_LABEL: Record<PickStatus, string> = {
  idea: "Idea",
  told: "Told them",
  applied: "Applied",
  interview: "Interviewing",
  offer: "Offer",
  hired: "Hired",
  dropped: "Dropped",
};
export const isPickStatus = (v: unknown): v is PickStatus => typeof v === "string" && (PICK_STATUSES as readonly string[]).includes(v);
/** A pick still being worked on. */
export const OPEN_PICK = new Set<PickStatus>(["idea", "told", "applied", "interview", "offer"]);

export interface Signals {
  /** Replies a hiring manager sent that Stu tagged positive (asked for the resume, a call, details). */
  posReplies: number;
  /** Any reply from a hiring manager. */
  replies: number;
  /** Outreach emails sent (first emails and follow-ups). */
  sent: number;
  /** Companies emailed (distinct domains). */
  companies: number;
  /** How they paid ("pack", "autopay", "order"; "+" when more than one), or null. */
  paid: string | null;
  /** Messages to Stu that thank or praise. */
  praise: number;
  /** Messages to Stu that complain. */
  gripes: number;
  /** Asked for a refund. */
  refund: boolean;
  /** Desk calls and resume build calls with Stu. */
  desk: number;
  build: number;
  /** Minutes on calls with Stu, all kinds. */
  callMin: number;
  /** IST days with any Stu activity in the last 21 days. */
  days21: number;
  /** Last activity, epoch ms. */
  lastSeen: number | null;
  /** Jobs Stu matched, and how many they saved or applied to. */
  matches: number;
  saved: number;
  applied: number;
}

export const NO_SIGNALS: Signals = {
  posReplies: 0, replies: 0, sent: 0, companies: 0, paid: null, praise: 0, gripes: 0, refund: false,
  desk: 0, build: 0, callMin: 0, days21: 0, lastSeen: null, matches: 0, saved: 0, applied: 0,
};

/**
 * The rank: how likely this customer is doing well with Stu and happy with it. A hiring manager saying yes counts most,
 * then any reply, paying, and thanking Stu; complaints and a refund ask pull it down; use (desk and build calls, emails
 * sent, active days, jobs saved or applied to) adds a little. One decimal.
 */
export function scoreOf(s: Signals): number {
  const v =
    s.posReplies * 10 +
    s.replies * 3 +
    (s.paid ? 6 : 0) +
    s.praise * 2.5 -
    s.gripes * 2 -
    (s.refund ? 8 : 0) +
    (s.desk + s.build) * 1.5 +
    Math.min(s.sent, 40) / 8 +
    s.days21 * 0.8 +
    Math.min(s.saved + s.applied, 10) * 0.3;
  return Math.round(v * 10) / 10;
}

// Thanks or praise, and complaints, in a customer's own short message. A long message is a pasted email or resume
// ("Thank you for your time" in a draft is not thanks to Stu), and the app's own wrapper for an email edit
// ("(About my email to ...") is not their words, so neither is read.
const PRAISE =
  /(\bthank|\blove\b|\bloved\b|\bamazing|\bawesome|\bgreat\b|\bhelpful|\bnice\b|\bcool\b|\bwow\b|\bsuperb|\bbrilliant|\bfantastic|\bperfect\b|\breally good|\bso good|\bexcellent|\bimpressive|\bgood job)/i;
const GRIPE =
  /(not working|\bbug(s|gy)?\b|\bbroken\b|\brefund|\bwaste\b|\bworst\b|\buseless|\bscam\b|\bfrustrat|\bannoy|\bhate\b|\bdisappoint|doesn['’]?t work|didn['’]?t work|nothing happen|\bstuck\b|not satisf)/i;
const REFUND = /\brefund/i;
export const TONE_MAX_CHARS = 280;

export type Tone = "praise" | "gripe" | null;

/** A complaint wins over thanks in the same message ("Not working. Thanks"). */
export function toneOf(text: string | null | undefined): Tone {
  const t = (text ?? "").trim();
  if (!t || t.length > TONE_MAX_CHARS || t.startsWith("(About my email") || /^subject\s*:/i.test(t)) return null;
  if (GRIPE.test(t)) return "gripe";
  if (PRAISE.test(t)) return "praise";
  return null;
}
export const asksRefund = (text: string | null | undefined): boolean => {
  const t = (text ?? "").trim();
  return t.length <= TONE_MAX_CHARS && REFUND.test(t);
};

/**
 * A customer's messages to Stu: WhatsApp messages are mirrored into the chat thread, so the same words on the same IST
 * day count once. Returns the tone counts and whether they asked for a refund.
 */
export function toneCounts(msgs: readonly { text: string | null; at: number }[]): { praise: number; gripes: number; refund: boolean } {
  const seen = new Set<string>();
  let praise = 0;
  let gripes = 0;
  let refund = false;
  for (const m of msgs) {
    const key = `${istDay(m.at)}|${(m.text ?? "").trim().toLowerCase().replace(/\s+/g, " ")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const tone = toneOf(m.text);
    if (tone === "praise") praise++;
    if (tone === "gripe") gripes++;
    if (asksRefund(m.text)) refund = true;
  }
  return { praise, gripes, refund };
}

export const istDay = (ms: number): string => new Date(ms + 5.5 * 3_600_000).toISOString().slice(0, 10);

export type Tag = "yes" | "replied" | "paid" | "thanked" | "unhappy" | "refund" | "active" | "quiet" | "new";
export const TAG_LABEL: Record<Tag, string> = {
  yes: "Hiring manager said yes",
  replied: "Got a reply",
  paid: "Paid",
  thanked: "Thanked Stu",
  unhappy: "May be unhappy",
  refund: "Asked for a refund",
  active: "Active this week",
  quiet: "Quiet 7+ days",
  new: "New (3 days)",
};
const DAY = 86_400_000;

export function tagsOf(s: Signals, signedUp: number, now: number): Tag[] {
  const t: Tag[] = [];
  if (s.posReplies > 0) t.push("yes");
  else if (s.replies > 0) t.push("replied");
  if (s.paid) t.push("paid");
  if (s.refund) t.push("refund");
  else if (s.gripes > 0) t.push("unhappy");
  if (s.praise > 0 && s.gripes === 0 && !s.refund) t.push("thanked");
  if (now - signedUp < 3 * DAY) t.push("new");
  if (s.lastSeen != null && now - s.lastSeen < 7 * DAY) t.push("active");
  else t.push("quiet");
  return t;
}

export interface WireCustomer {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  whatsapp: boolean;
  signedUp: number;
  /** Why this is not a real customer (staff, test account, studojo.com, guest), or null. */
  internal: string | null;
  headline: string | null;
  roles: string[];
  cities: string[];
  remote: boolean;
  s: Signals;
  score: number;
  star: boolean;
  note: string;
  picks: number;
  picksOpen: number;
  hired: boolean;
}

export interface CustomersEnvelope {
  env: string;
  at: number;
  ms: number;
  customers: WireCustomer[];
}

export type View = "all" | "starred" | "yes" | "paid" | "active" | "unhappy" | "picks";
export const VIEWS: readonly { key: View; label: string }[] = [
  { key: "all", label: "Everyone" },
  { key: "starred", label: "Starred" },
  { key: "yes", label: "Hiring manager said yes" },
  { key: "paid", label: "Paid" },
  { key: "active", label: "Active this week" },
  { key: "picks", label: "Team is working on" },
  { key: "unhappy", label: "May be unhappy" },
];
export type Sort = "rank" | "recent" | "new";

export interface ListFilters {
  view: View;
  q: string;
  sort: Sort;
}

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Every word of the search must appear in the name, email, phone, headline, a wanted role or a city. */
export function matchesText(c: WireCustomer, q: string): boolean {
  const words = norm(q).split(" ").filter(Boolean);
  if (!words.length) return true;
  const hay = norm([c.name, c.email, c.phone ?? "", c.headline ?? "", ...c.roles, ...c.cities, c.note].join(" "));
  return words.every((w) => hay.includes(w));
}

export function inView(c: WireCustomer, view: View, now: number): boolean {
  switch (view) {
    case "all":
      return true;
    case "starred":
      return c.star;
    case "yes":
      return c.s.posReplies > 0;
    case "paid":
      return !!c.s.paid;
    case "active":
      return c.s.lastSeen != null && now - c.s.lastSeen < 7 * DAY;
    case "picks":
      return c.picks > 0;
    case "unhappy":
      return c.s.gripes > 0 || c.s.refund;
  }
}

/** The list as the page shows it: the view, the search, then the order (rank: starred first, then the rank). */
export function filterCustomers(all: readonly WireCustomer[], f: ListFilters, now: number): WireCustomer[] {
  const out = all.filter((c) => inView(c, f.view, now) && matchesText(c, f.q));
  const by: Record<Sort, (a: WireCustomer, b: WireCustomer) => number> = {
    rank: (a, b) => Number(b.star) - Number(a.star) || b.score - a.score || (b.s.lastSeen ?? 0) - (a.s.lastSeen ?? 0),
    recent: (a, b) => (b.s.lastSeen ?? 0) - (a.s.lastSeen ?? 0),
    new: (a, b) => b.signedUp - a.signedUp,
  };
  return out.sort(by[f.sort]);
}

/** A pasted link is kept only when it is a web address. */
export function cleanLink(v: unknown): string {
  const s = typeof v === "string" ? v.trim().slice(0, 500) : "";
  if (!s) return "";
  const withScheme = /^https?:\/\//i.test(s) ? s : `https://${s}`;
  try {
    const u = new URL(withScheme);
    return /^https?:$/.test(u.protocol) && u.hostname.includes(".") ? u.toString() : "";
  } catch {
    return "";
  }
}

/** A phone number as a wa.me link (digits only), or null. */
export function waLink(phone: string | null): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  return d.length >= 10 ? `https://wa.me/${d}` : null;
}

export const fmtRupees = (n: number | null | undefined): string =>
  n == null ? "" : n >= 100_000 ? `₹${(n / 100_000).toFixed(n % 100_000 ? 1 : 0)}L` : `₹${n.toLocaleString("en-IN")}`;

export function ago(ms: number | null, now: number): string {
  if (ms == null) return "never";
  const d = now - ms;
  if (d < 3_600_000) return `${Math.max(1, Math.round(d / 60_000))} min ago`;
  if (d < DAY) return `${Math.round(d / 3_600_000)} h ago`;
  const days = Math.round(d / DAY);
  return days === 1 ? "yesterday" : `${days} days ago`;
}

export interface WirePick {
  id: number;
  company: string;
  role: string;
  link: string;
  contact: string;
  note: string;
  status: PickStatus;
  createdAt: number;
  updatedAt: number;
  by: string | null;
}

/** One customer's whole page: what they want, their profile and resume, the call, Stu's matches, their outreach and replies, what they said, and the team's notes and picks. */
export interface WireDetail {
  c: WireCustomer;
  wants: {
    roles: string[];
    adjacent: string[];
    refused: string[];
    cities: string[];
    relocate: string | null;
    modes: string[];
    types: string[];
    payYear: number | null;
    stipendMonth: number | null;
    payNow: string | null;
    notice: string | null;
    from: string | null;
    intent: string | null;
    whyNow: string | null;
    stages: string[];
    sectors: string[];
    sectorsRefused: string[];
    values: string[];
    avoid: string[];
  };
  profile: {
    summary: string | null;
    title: string | null;
    org: string | null;
    expMonths: number | null;
    degree: string | null;
    grad: number | null;
    skills: string[];
    links: string[];
    experience: { title: string; company: string; when: string }[];
    education: { school: string; degree: string; when: string }[];
    projects: { name: string; tech: string }[];
  };
  resume: { file: string | null; text: string | null };
  call: { at: number; minutes: number; summary: string | null } | null;
  calls: { mode: string; at: number; minutes: number }[];
  plan: { plan: string | null; grants: { source: string; ends: number | null }[]; orders: { item: string; rupees: number; at: number }[] };
  matches: { counts: Record<string, number>; top: { title: string; company: string; where: string; link: string; score: number; state: string; at: number }[] };
  outreach: { company: string; title: string; to: string; status: string; started: number | null; replied: number | null; tag: string | null; reply: string | null; sent: number }[];
  said: { at: number; via: "whatsapp" | "chat"; text: string; tone: Tone }[];
  picks: WirePick[];
}
