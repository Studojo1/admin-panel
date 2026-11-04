// Recordings (5 Nov 2026, the owner and Pranav: "see how people are using the platform ... user recordings like
// Mixpanel gives us ... can you have user recordings under our admin panel?"): session replays recorded by the website
// and the platform (Studojo1/career-agent app/lib/recordings/, rrweb) and played here. One row a visit in
// career_agent.career_recordings; the recording itself is gzip chunks of rrweb events in Azure Blob, under
// <container>/<start day>/<visit id>/<t base 36>-<page load>-<n>.json.gz. Kept 30 days.
//
// The rules shared by the server (recordings.server.ts) and the page (routes/recordings.tsx). No imports, so
// `node --test scripts/recordings-model.test.mjs` reads it as is.

export interface RecRow {
  id: string;
  /** epoch ms */
  started: number;
  last: number;
  visitorId: string | null;
  userId: string | null;
  email: string | null;
  device: string | null;
  inapp: string | null;
  entryPath: string | null;
  hosts: string[];
  pages: string[];
  chunks: number;
  bytes: number;
  internal: string | null;
  /** utm-dictionary CHANNELS key, from the visit's last touch (else its first) */
  channel: string;
  source: string | null;
  campaign: string | null;
  /** STEPS key of the furthest journey step the person reached in this visit, or null */
  furthest: string | null;
  /** The person had an account by the end of this visit (a user id on the visit, or signed_up in it). */
  signedUp: boolean;
  /** signed_up happened in this visit */
  signedUpHere: boolean;
}

export interface RecFilters {
  channel: string;
  device: string;
  inapp: string;
  signup: "any" | "yes" | "no" | "here";
  step: string;
  internal: boolean;
  /** a user id or visitor id: that person's visits only */
  person: string | null;
}

export const DEFAULT_FILTERS: RecFilters = { channel: "all", device: "all", inapp: "all", signup: "any", step: "any", internal: false, person: null };

/** Channel choices: the dashboard's channels, and two groups the owner asked for (Meta ads, Google). */
export const CHANNEL_GROUPS: { key: string; label: string; has: (ch: string) => boolean }[] = [
  { key: "all", label: "Any channel", has: () => true },
  { key: "meta_paid", label: "Meta ads (paid)", has: (c) => c === "meta_paid" },
  { key: "meta_any", label: "Any Meta (ads and free)", has: (c) => c === "meta_paid" || c === "meta_organic" },
  { key: "google_any", label: "Google (search and ads)", has: (c) => c === "search" || c === "google_paid" },
  { key: "direct", label: "Direct", has: (c) => c === "direct" },
  { key: "other", label: "Other", has: (c) => !["meta_paid", "meta_organic", "search", "google_paid", "direct"].includes(c) },
];

export const DEVICE_CHOICES = [
  { key: "all", label: "Any device" },
  { key: "mobile", label: "Phone" },
  { key: "tablet", label: "Tablet" },
  { key: "desktop", label: "Computer" },
];

export const INAPP_CHOICES = [
  { key: "all", label: "Any browser" },
  { key: "inapp", label: "In-app (any)" },
  { key: "instagram", label: "Instagram app" },
  { key: "facebook", label: "Facebook app" },
  { key: "none", label: "Real browser" },
];

export function matches(r: RecRow, f: RecFilters): boolean {
  if (!f.internal && r.internal) return false;
  if (f.person && r.userId !== f.person && r.visitorId !== f.person) return false;
  const g = CHANNEL_GROUPS.find((c) => c.key === f.channel);
  if (g && !g.has(r.channel)) return false;
  if (f.device !== "all" && r.device !== f.device) return false;
  if (f.inapp === "inapp" ? !r.inapp || r.inapp === "none" : f.inapp !== "all" && r.inapp !== f.inapp) return false;
  if (f.signup === "yes" && !r.signedUp) return false;
  if (f.signup === "no" && r.signedUp) return false;
  if (f.signup === "here" && !r.signedUpHere) return false;
  if (f.step !== "any" && r.furthest !== f.step) return false;
  return true;
}

export interface JourneyEv {
  at: number;
  step: string;
  userId: string | null;
  visitorId: string | null;
}

/**
 * The furthest step a person reached in a visit: their journey events from a minute before it began to a minute after
 * its last chunk, by the step order given (the dashboard's STEPS, journey names mapped to step keys). Pure.
 */
export function furthestStep(evs: JourneyEv[], from: number, to: number, nameToStep: Record<string, string>, order: string[]): string | null {
  let best = -1;
  for (const e of evs) {
    if (e.at < from - 60_000 || e.at > to + 60_000) continue;
    const i = order.indexOf(nameToStep[e.step] ?? "");
    if (i > best) best = i;
  }
  return best >= 0 ? order[best] : null;
}

/** Whose events these are: the visit's user, else its browser (visitor id). Pure. */
export function personEvents(evs: JourneyEv[], userId: string | null, visitorId: string | null): JourneyEv[] {
  return evs.filter((e) => (userId && e.userId === userId) || (visitorId && e.visitorId === visitorId));
}

export interface RecordingsEnvelope {
  env: "staging" | "production" | "unknown";
  /** the index table exists in this database */
  live: boolean;
  /** this admin can read the chunks (the storage account's key is set) */
  storage: boolean;
  rows: RecRow[];
  capped: boolean;
  steps: { key: string; label: string; n: string }[];
  ms: number;
}

// ---------------------------------------------------------------- playing a visit

export interface ChunkRef {
  name: string;
  t: number;
  pageLoad: string;
  n: number;
}

/** A blob name back to its parts, or null when it is not a chunk's (career-agent rec.ts parseChunkName). Pure. */
export function parseChunkName(name: string): ChunkRef | null {
  const m = /\/([0-9a-z]{1,10})-([0-9a-z]{8})-(\d{5})\.json\.gz$/.exec(name);
  if (!m) return null;
  return { name, t: parseInt(m[1], 36), pageLoad: m[2], n: Number(m[3]) };
}

/** Where a visit's chunks are: the UTC day of the visit id's start, then the id. Null for an id that is not one. Pure. */
export function visitPrefix(id: string): string | null {
  const m = /^([0-9a-z]{8,9})-[0-9a-z]{10}$/.exec(id);
  if (!m) return null;
  const start = parseInt(m[1], 36);
  if (!Number.isFinite(start)) return null;
  return `${new Date(start).toISOString().slice(0, 10)}/${id}/`;
}

export interface PageLoad {
  id: string;
  start: number;
  /** first event of its last chunk (the chunk's own end is in its events) */
  lastChunkAt: number;
  chunks: ChunkRef[];
}

export interface Track {
  loads: PageLoad[];
  start: number;
}

/**
 * A visit's page loads, played one after another. Two tabs open at once would mix two pages in one replay, so a page
 * load that begins before the one before it ended goes on a track of its own (greedy, first track that is free).
 * Chunks in each page load by number. Pure.
 */
export function tracksOf(chunks: ChunkRef[]): Track[] {
  const byLoad = new Map<string, ChunkRef[]>();
  for (const c of chunks) {
    const list = byLoad.get(c.pageLoad) ?? [];
    list.push(c);
    byLoad.set(c.pageLoad, list);
  }
  const loads: PageLoad[] = [...byLoad.entries()].map(([id, cs]) => {
    cs.sort((a, b) => a.n - b.n);
    return { id, start: Math.min(...cs.map((c) => c.t)), lastChunkAt: Math.max(...cs.map((c) => c.t)), chunks: cs };
  });
  loads.sort((a, b) => a.start - b.start);
  const tracks: (Track & { busyUntil: number })[] = [];
  for (const l of loads) {
    const free = tracks.find((t) => t.busyUntil <= l.start);
    if (free) {
      free.loads.push(l);
      free.busyUntil = l.lastChunkAt;
    } else tracks.push({ loads: [l], start: l.start, busyUntil: l.lastChunkAt });
  }
  return tracks.map(({ loads: ls, start }) => ({ loads: ls, start }));
}

export interface RecordingDetail {
  row: RecRow;
  tracks: Track[];
  /** every journey event of the person in the visit (page views left out), for the timeline */
  journey: JourneyEv[];
  storage: boolean;
}

/** rrweb's custom event (type 5): a marker on the player's timeline. */
export interface MarkerEvent {
  type: 5;
  timestamp: number;
  data: { tag: string; payload: Record<string, unknown> };
}

/**
 * Journey steps as markers on the replay's timeline, inside the replay's span (a step a little before the first event
 * is put at its start). Tagged "journey"; payload: the step and its time. Pure.
 */
export function journeyMarkers(evs: JourneyEv[], first: number, last: number): MarkerEvent[] {
  return evs
    .filter((e) => e.at >= first - 60_000 && e.at <= last + 60_000)
    .map((e) => ({ type: 5 as const, timestamp: Math.min(last, Math.max(first, e.at)), data: { tag: "journey", payload: { step: e.step, at: e.at } } }));
}

type Ev = { type: number; timestamp: number };

/** A track's events in time order, with the markers in among them. rrweb needs them sorted. Pure. */
export function mergeEvents<T extends Ev>(perChunk: T[][], markers: MarkerEvent[] = []): (T | MarkerEvent)[] {
  const all: (T | MarkerEvent)[] = [];
  for (const c of perChunk) for (const e of c) if (e && typeof e.timestamp === "number") all.push(e);
  if (!all.length) return [];
  all.push(...markers);
  // Stable: events of one timestamp keep their order (a meta event before its full snapshot).
  return all.map((e, i) => [e, i] as const).sort((a, b) => a[0].timestamp - b[0].timestamp || a[1] - b[1]).map(([e]) => e);
}

/** Whether the events can play: rrweb needs a meta event (4) and a full snapshot (2) before anything else. Pure. */
export function playable(evs: Ev[]): boolean {
  const meta = evs.findIndex((e) => e.type === 4);
  const full = evs.findIndex((e) => e.type === 2);
  return meta >= 0 && full >= 0;
}

/** "4m 05s", "1h 02m", "12s". Pure. */
export function durText(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, "0")}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, "0")}m`;
}

/** "1.2 MB", "340 KB". Pure. */
export function sizeText(bytes: number): string {
  if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1000))} KB`;
}

export const DEVICE_LABEL: Record<string, string> = { mobile: "Phone", tablet: "Tablet", desktop: "Computer" };
export const INAPP_LABEL: Record<string, string> = { instagram: "Instagram app", facebook: "Facebook app", linkedin: "LinkedIn app", whatsapp: "WhatsApp", other: "Other app", none: "" };
