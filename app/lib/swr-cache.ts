// ADMIN-AUDIT-STU (14 Nov 2026): serve what was built and rebuild it in the background (stale-while-revalidate), so a
// page never waits for a rebuild after the first load. The audit timed /api/stu/overview?section=kpis at 4.3 to 6.8 s,
// /api/visitors at 3.9 to 6.6 s and /api/stu at 5.7 to 8.8 s: the Overview re-reads every 60 s and the old one-minute
// cache was gone by then, so most reloads rebuilt it while the page waited.
//
// Per key: younger than `freshMs` (or, with `bucketMs`, built in the current clock bucket) is served as is; older but
// younger than `maxStaleMs` is served at once and one rebuild starts in the background; older than that, or never
// built, waits for a build. A failed background rebuild keeps the old copy. `force` (the pages' Refresh) waits for a
// new build, sharing one started in the last `joinMs`. At most `max` keys; the least recently used goes first.
// No imports, so `node --test scripts/swr-cache.test.mjs` reads it as is.

export interface SwrOptions {
  /** served without a rebuild while younger than this, ms */
  freshMs: number;
  /** served stale (with a background rebuild) while younger than this, ms; older waits for a rebuild */
  maxStaleMs: number;
  /** the most keys kept; the least recently used is dropped first */
  max: number;
  /** fresh while built in the same clock bucket of this many ms (so two servers turn over together), instead of by age */
  bucketMs?: number;
  /** a forced read shares a build started within this many ms (default 5000) */
  joinMs?: number;
  /** the clock, for tests */
  now?: () => number;
  /** told about a failed background rebuild (the old copy stays) */
  onError?: (key: string, err: unknown) => void;
}

interface Entry<T> {
  /** when the kept value was built (its build started), epoch ms */
  at: number;
  value?: T;
  has: boolean;
  /** a build in flight and when it started */
  building?: Promise<T>;
  buildStarted?: number;
}

export interface SwrCache<T> {
  get(key: string, build: () => Promise<T>, force?: boolean): Promise<T>;
  /** keys held now, oldest use first */
  keys(): string[];
  clear(): void;
}

export function swrCache<T>(o: SwrOptions): SwrCache<T> {
  const now = o.now ?? Date.now;
  const joinMs = o.joinMs ?? 5000;
  const map = new Map<string, Entry<T>>();

  const touch = (key: string, e: Entry<T>) => {
    map.delete(key);
    map.set(key, e);
    while (map.size > o.max) {
      const oldest = map.keys().next().value as string;
      map.delete(oldest);
    }
  };
  const isFresh = (e: Entry<T>, t: number) =>
    o.bucketMs ? Math.floor(e.at / o.bucketMs) === Math.floor(t / o.bucketMs) && t - e.at < o.bucketMs : t - e.at < o.freshMs;

  const start = (key: string, e: Entry<T>, build: () => Promise<T>): Promise<T> => {
    const startedAt = now();
    let p: Promise<T>;
    try {
      p = Promise.resolve(build());
    } catch (err) {
      p = Promise.reject(err);
    }
    e.building = p;
    e.buildStarted = startedAt;
    p.then(
      (v) => {
        if (e.building === p) e.building = undefined;
        // A slower, older build never replaces a newer value.
        if (!e.has || startedAt >= e.at) {
          e.value = v;
          e.has = true;
          e.at = startedAt;
        }
      },
      () => {
        if (e.building === p) e.building = undefined;
      },
    );
    return p;
  };

  return {
    get(key, build, force = false) {
      const t = now();
      let e = map.get(key);
      if (!e) e = { at: 0, has: false };
      touch(key, e);
      if (force) {
        if (e.building && e.buildStarted != null && t - e.buildStarted < joinMs) return e.building;
        return start(key, e, build);
      }
      if (!e.has) return e.building ?? start(key, e, build);
      if (isFresh(e, t)) return Promise.resolve(e.value as T);
      if (t - e.at < o.maxStaleMs) {
        if (!e.building) {
          start(key, e, build).catch((err) => o.onError?.(key, err));
        }
        return Promise.resolve(e.value as T);
      }
      return e.building ?? start(key, e, build);
    },
    keys: () => [...map.keys()],
    clear: () => map.clear(),
  };
}
