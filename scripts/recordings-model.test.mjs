// node --test scripts/recordings-model.test.mjs
// RECORDINGS (5 Nov 2026): the rules of /recordings (app/lib/recordings/model.ts): the filters (channel groups, device,
// in-app, signed up, furthest step, internal, one person), the furthest step a person reached in a visit, the chunk
// names and the visit's prefix (career-agent's contract), the tracks a visit plays as (a second tab apart), the journey
// markers and the merged, sorted events, and the wiring (routes, admin gate, the Journeys link, the storage refs).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CHANNEL_GROUPS, DEFAULT_FILTERS, durText, furthestStep, journeyMarkers, matches, mergeEvents, parseChunkName, personEvents, playable, sizeText,
  tracksOf, visitPrefix,
} from "../app/lib/recordings/model.ts";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const T0 = Date.parse("2026-11-05T05:00:00Z");
const ID = `${T0.toString(36)}-abcdefghij`;

const row = (over = {}) => ({
  id: ID, started: T0, last: T0 + 120_000, visitorId: "v-1", userId: null, email: null, device: "mobile", inapp: "instagram", entryPath: "/",
  hosts: ["site"], pages: ["/"], chunks: 3, bytes: 50_000, internal: null, channel: "meta_paid", source: "ig", campaign: "launch",
  furthest: "clicked_join", signedUp: false, signedUpHere: false, ...over,
});

test("filters: channel groups, device, in-app, signed up, furthest step, internal and one person", () => {
  const f = (o) => ({ ...DEFAULT_FILTERS, ...o });
  assert.ok(matches(row(), f({})));
  assert.ok(matches(row(), f({ channel: "meta_paid" })) && matches(row(), f({ channel: "meta_any" })));
  assert.ok(!matches(row(), f({ channel: "google_any" })));
  assert.ok(matches(row({ channel: "search" }), f({ channel: "google_any" })) && matches(row({ channel: "google_paid" }), f({ channel: "google_any" })));
  assert.ok(matches(row({ channel: "linkedin" }), f({ channel: "other" })) && !matches(row({ channel: "direct" }), f({ channel: "other" })));
  assert.ok(matches(row(), f({ device: "mobile" })) && !matches(row(), f({ device: "desktop" })));
  assert.ok(matches(row(), f({ inapp: "inapp" })) && !matches(row({ inapp: "none" }), f({ inapp: "inapp" })) && matches(row({ inapp: "none" }), f({ inapp: "none" })));
  assert.ok(matches(row(), f({ signup: "no" })) && !matches(row(), f({ signup: "yes" })));
  assert.ok(matches(row({ userId: "u1", signedUp: true, signedUpHere: true }), f({ signup: "here" })));
  assert.ok(!matches(row({ userId: "u1", signedUp: true }), f({ signup: "here" })));
  assert.ok(matches(row(), f({ step: "clicked_join" })) && !matches(row(), f({ step: "signed_up" })));
  assert.ok(!matches(row({ internal: "audit" }), f({})) && matches(row({ internal: "audit" }), f({ internal: true })));
  assert.ok(matches(row({ userId: "u1" }), f({ person: "u1" })) && matches(row(), f({ person: "v-1" })) && !matches(row(), f({ person: "u2" })));
  assert.deepEqual(CHANNEL_GROUPS.map((c) => c.key), ["all", "meta_paid", "meta_any", "google_any", "direct", "other"]);
});

test("the furthest step in a visit: the person's events from a minute before to a minute after, by the dashboard's order", () => {
  const order = ["visited_home", "clicked_join", "signed_up", "call_started"];
  const names = { visited_home: "visited_home", clicked_join: "clicked_join", signed_up: "signed_up", call_started: "call_started" };
  const evs = [
    { at: T0 + 1_000, step: "visited_home", userId: null, visitorId: "v-1" },
    { at: T0 + 50_000, step: "clicked_join", userId: null, visitorId: "v-1" },
    { at: T0 + 90_000, step: "signed_up", userId: "u1", visitorId: "v-1" },
    { at: T0 + 5 * 60_000, step: "call_started", userId: "u1", visitorId: "v-1" },
    { at: T0 + 60_000, step: "call_started", userId: "u2", visitorId: "v-2" },
  ];
  const mine = personEvents(evs, "u1", "v-1");
  assert.equal(mine.length, 4);
  assert.equal(furthestStep(mine, T0, T0 + 120_000, names, order), "signed_up", "the call came after the visit");
  assert.equal(furthestStep(mine, T0, T0 + 4 * 60_000 + 30_000, names, order), "call_started", "within a minute of the end");
  assert.equal(furthestStep([], T0, T0 + 1, names, order), null);
});

test("chunk names and the visit's prefix follow career-agent's contract", () => {
  const name = `2026-11-05/${ID}/${(T0 + 5_000).toString(36)}-a1b2c3d4-00002.json.gz`;
  assert.deepEqual(parseChunkName(name), { name, t: T0 + 5_000, pageLoad: "a1b2c3d4", n: 2 });
  assert.equal(parseChunkName("2026-11-05/x/readme.txt"), null);
  assert.equal(visitPrefix(ID), `2026-11-05/${ID}/`);
  assert.equal(visitPrefix("../etc"), null);
});

test("tracks: page loads play one after another; a tab open at the same time is a track of its own", () => {
  const c = (load, n, t) => ({ name: `${load}-${n}`, t, pageLoad: load, n });
  const tracks = tracksOf([c("aaaaaaaa", 1, T0 + 10_000), c("aaaaaaaa", 0, T0), c("bbbbbbbb", 0, T0 + 20_000), c("cccccccc", 0, T0 + 5_000), c("cccccccc", 1, T0 + 30_000)]);
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks[0].loads.map((l) => l.id), ["aaaaaaaa", "bbbbbbbb"]);
  assert.deepEqual(tracks[0].loads[0].chunks.map((x) => x.n), [0, 1], "chunks by number");
  assert.deepEqual(tracks[1].loads.map((l) => l.id), ["cccccccc"]);
});

test("events merge in time order with the journey markers, and play only from a snapshot", () => {
  const a = [{ type: 4, timestamp: T0, data: {} }, { type: 2, timestamp: T0, data: {} }, { type: 3, timestamp: T0 + 3_000, data: {} }];
  const b = [{ type: 3, timestamp: T0 + 1_000, data: {} }];
  const marks = journeyMarkers([{ at: T0 - 30_000, step: "visited_home", userId: null, visitorId: "v" }, { at: T0 + 2_000, step: "clicked_join", userId: null, visitorId: "v" }, { at: T0 + 10 * 60_000, step: "paid", userId: null, visitorId: "v" }], T0, T0 + 3_000);
  assert.equal(marks.length, 2, "only near the replay");
  assert.equal(marks[0].timestamp, T0, "a step just before the start sits at the start");
  assert.equal(marks[0].data.tag, "journey");
  const all = mergeEvents([a, b], marks);
  assert.deepEqual(all.map((e) => [e.type, e.timestamp - T0]), [[4, 0], [2, 0], [5, 0], [3, 1000], [5, 2000], [3, 3000]]);
  assert.ok(playable(all));
  assert.ok(!playable([{ type: 3, timestamp: 1 }]));
  assert.deepEqual(mergeEvents([[]], marks), []);
});

test("words", () => {
  assert.equal(durText(12_000), "12s");
  assert.equal(durText(245_000), "4m 05s");
  assert.equal(durText(3_720_000), "1h 02m");
  assert.equal(sizeText(340_000), "340 KB");
  assert.equal(sizeText(1_200_000), "1.2 MB");
});

test("wiring: routed, every API behind the admin gate, linked from Journeys and the menu, storage by reference", () => {
  const routes = read("app/routes.ts");
  for (const r of ['"recordings", "routes/recordings.tsx"', '"api/recordings", "routes/api.recordings.tsx"', '"api/recordings/:id", "routes/api.recordings.$id.tsx"', '"api/recordings/:id/chunk", "routes/api.recordings.$id.chunk.tsx"']) {
    assert.ok(routes.includes(r), r);
  }
  for (const f of ["api.recordings.tsx", "api.recordings.$id.tsx", "api.recordings.$id.chunk.tsx"]) assert.match(read(`app/routes/${f}`), /await requireAdmin\(request\)/, f);
  assert.match(read("app/routes/stu-journeys.tsx"), /to=\{`\/recordings\?person=\$\{encodeURIComponent\(u\.id\)\}`\}/);
  assert.match(read("app/components/admin-header.tsx"), /\{ to: "\/recordings", label: "Stu: Recordings", stu: true \}/);
  for (const wf of [".github/workflows/deploy-staging.yml", ".github/workflows/deploy.yml"]) {
    const s = read(wf);
    assert.match(s, /secret_ref(?:_optional)? AZURE_STORAGE_ACCOUNT_NAME azure-storage-account-name/, wf);
    assert.match(s, /secret_ref(?:_optional)? AZURE_STORAGE_ACCOUNT_KEY azure-storage-account-key/, wf);
  }
  const blob = read("app/lib/recordings/blob.server.ts");
  assert.doesNotMatch(blob, /"(PUT|DELETE)"/, "the admin only reads the recordings");
  assert.match(read("app/components/recordings/ReplayPlayer.tsx"), /import\("rrweb-player"\)/, "the player loads only when a recording opens");
});
