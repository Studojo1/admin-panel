// node --test scripts/swr-cache.test.mjs
// ADMIN-AUDIT-STU (14 Nov 2026): stale-while-revalidate (app/lib/swr-cache.ts), so the Stu pages, /api/visitors and
// /api/utm-report never wait for a rebuild after the first load: fresh is served as is, stale is served at once with
// one background rebuild, too old waits, per key, with a bound on the keys kept.
import { test } from "node:test";
import assert from "node:assert/strict";
import { swrCache } from "../app/lib/swr-cache.ts";

const tick = () => new Promise((r) => setImmediate(r));

function rig(over = {}) {
  let t = 1_000_000;
  const clock = { now: () => t, set: (x) => (t = x), add: (x) => (t += x) };
  let builds = 0;
  const pending = [];
  /** a build that waits until released, so a test can see what is served meanwhile */
  const build = (v) => () => {
    builds++;
    return new Promise((resolve, reject) => pending.push({ resolve: () => resolve(v), reject }));
  };
  const cache = swrCache({ freshMs: 60_000, maxStaleMs: 300_000, max: 3, now: clock.now, ...over });
  return { cache, clock, build, builds: () => builds, release: () => pending.shift().resolve(), fail: () => pending.shift().reject(new Error("db down")) };
}

test("the first read waits for the build; reads while it runs share it", async () => {
  const r = rig();
  const a = r.cache.get("k", r.build("v1"));
  const b = r.cache.get("k", r.build("other"));
  assert.equal(r.builds(), 1, "one build for both");
  r.release();
  assert.equal(await a, "v1");
  assert.equal(await b, "v1");
});

test("fresh is served as is; stale is served at once while one background rebuild runs", async () => {
  const r = rig();
  const p = r.cache.get("k", r.build("v1"));
  r.release();
  await p;
  r.clock.add(30_000);
  assert.equal(await r.cache.get("k", r.build("x")), "v1", "under a minute: no rebuild");
  assert.equal(r.builds(), 1);

  r.clock.add(60_000);
  assert.equal(await r.cache.get("k", r.build("v2")), "v1", "stale: served at once, the page does not wait");
  assert.equal(r.builds(), 2, "one rebuild in the background");
  assert.equal(await r.cache.get("k", r.build("v3")), "v1", "still the old copy while it runs");
  assert.equal(r.builds(), 2, "never two rebuilds at once");
  r.release();
  await tick();
  assert.equal(await r.cache.get("k", r.build("x")), "v2", "the rebuilt copy from then on");
  assert.equal(r.builds(), 2);
});

test("too old (past the stale limit) waits for a rebuild", async () => {
  const r = rig();
  const p = r.cache.get("k", r.build("v1"));
  r.release();
  await p;
  r.clock.add(301_000);
  let done = false;
  const q = r.cache.get("k", r.build("v2")).then((v) => ((done = true), v));
  await tick();
  assert.equal(done, false, "waits");
  r.release();
  assert.equal(await q, "v2");
});

test("a failed background rebuild keeps the old copy and the next stale read tries again", async () => {
  const errors = [];
  const r = rig({ onError: (k, e) => errors.push([k, e.message]) });
  const p = r.cache.get("k", r.build("v1"));
  r.release();
  await p;
  r.clock.add(90_000);
  assert.equal(await r.cache.get("k", r.build("v2")), "v1");
  r.fail();
  await tick();
  assert.deepEqual(errors, [["k", "db down"]]);
  assert.equal(await r.cache.get("k", r.build("v3")), "v1", "still served");
  assert.equal(r.builds(), 3, "and rebuilt again");
});

test("force (Refresh) waits for a new build, and parallel forced reads share one", async () => {
  const r = rig();
  const p = r.cache.get("k", r.build("v1"));
  r.release();
  await p;
  const a = r.cache.get("k", r.build("v2"), true);
  const b = r.cache.get("k", r.build("other"), true);
  assert.equal(r.builds(), 2, "the second forced read joins the first");
  r.release();
  assert.equal(await a, "v2");
  assert.equal(await b, "v2");
  assert.equal(await r.cache.get("k", r.build("x")), "v2");
});

test("per key, and at most max keys: the least recently used goes first", async () => {
  const r = rig();
  for (const k of ["a", "b", "c"]) {
    const p = r.cache.get(k, r.build(k));
    r.release();
    await p;
  }
  await r.cache.get("a", r.build("x"));
  const p = r.cache.get("d", r.build("d"));
  r.release();
  await p;
  assert.deepEqual(r.cache.keys(), ["c", "a", "d"], "b was used least recently");
  assert.equal(await r.cache.get("a", r.build("x")), "a", "each key keeps its own value");
});

test("bucketMs: fresh only within the same clock minute, so two servers turn over together", async () => {
  const r = rig({ bucketMs: 60_000 });
  r.clock.set(120_000 + 50_000);
  const p = r.cache.get("k", r.build("v1"));
  r.release();
  await p;
  r.clock.set(120_000 + 59_000);
  await r.cache.get("k", r.build("x"));
  assert.equal(r.builds(), 1, "same minute");
  r.clock.set(180_000 + 1_000);
  assert.equal(await r.cache.get("k", r.build("v2")), "v1", "next minute: stale, served at once");
  assert.equal(r.builds(), 2);
});
