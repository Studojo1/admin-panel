// node --test scripts/vendors-model.test.mjs
// Vendors and credits (app/lib/vendors): balance answers from LeadsForge and
// Apollo (fakes only, never a live call), burn per IST day, days left, the
// run-out day in IST and the "next thing" line.
// Imports the TypeScript source directly: Node 22.18+ strips the types itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  istDay, addDays, fmtDay, niceTicks, vendorStats, nextThings, buildReport, logStartOf,
} from "../app/lib/vendors/model.ts";
import {
  parseLeadsforgeBalance, parseApolloBalance, readLeadsforgeBalance, readApolloBalance, cachedBalance, balanceOf,
  LEADSFORGE_BALANCE_URL, APOLLO_USAGE_URL, BALANCE_TTL_MS,
} from "../app/lib/vendors/balance.server.ts";

const ms = (iso) => Date.parse(iso);
// 2 Nov 2026, 15:00 IST
const NOW = ms("2026-11-02T09:30:00Z");
const TODAY = "2026-11-02";
const row = (vendor, kind, day, credits, over = {}) => ({ vendor, kind, day, calls: credits || 1, failed: 0, pending: 0, hits: credits > 0 ? credits : 0, credits, ...over });
const ok = (credits, over = {}) => balanceOf({ state: "ok", credits, checkedAt: NOW, ...over });
const allDays = (vendor, kind, perDay, n = 7) => Array.from({ length: n }, (_, i) => row(vendor, kind, addDays(TODAY, -(i + 1)), perDay));

// ---- IST days -------------------------------------------------------------

test("IST day boundaries: 18:29 UTC is still the same IST day, 18:30 UTC is the next", () => {
  assert.equal(istDay(ms("2026-11-01T18:29:59Z")), "2026-11-01");
  assert.equal(istDay(ms("2026-11-01T18:30:00Z")), "2026-11-02");
  assert.equal(addDays("2026-11-02", 7), "2026-11-09");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(fmtDay("2026-11-08", TODAY), "8 Nov");
  assert.equal(fmtDay("2027-01-03", TODAY), "3 Jan 2027");
});

// ---- balance answers --------------------------------------------------------

test("LeadsForge 200 reads availableCredits", () => {
  const b = parseLeadsforgeBalance(200, '{"availableCredits": 1234}', NOW);
  assert.equal(b.state, "ok");
  assert.equal(b.credits, 1234);
  assert.equal(b.checkedAt, NOW);
});

test("LeadsForge 402 means out of credits (0), 401 and 403 a bad key, other codes an error", () => {
  const out = parseLeadsforgeBalance(402, '{"message":"Payment Required"}', NOW);
  assert.equal(out.state, "out");
  assert.equal(out.credits, 0);
  assert.equal(parseLeadsforgeBalance(401, "", NOW).state, "bad_key");
  assert.equal(parseLeadsforgeBalance(403, "", NOW).state, "bad_key");
  const e = parseLeadsforgeBalance(500, "boom", NOW);
  assert.equal(e.state, "error");
  assert.equal(e.credits, null);
  assert.equal(parseLeadsforgeBalance(200, "not json", NOW).state, "error");
  assert.equal(parseLeadsforgeBalance(200, '{"availableCredits": 0}', NOW).state, "out");
});

const APOLLO_OK = JSON.stringify({
  credit_usage_stats: {
    lead_credit: { limit: 10000, consumed: 7500, left_over: 2500 },
    export_credit: { limit: 100, consumed: 0, left_over: 100 },
  },
  current_credit_cycle: { start_date: "2026-10-15", end_date: "2026-11-15" },
});

test("Apollo 200 reads lead_credit and the cycle end as the renewal day", () => {
  const b = parseApolloBalance(200, APOLLO_OK, NOW);
  assert.equal(b.state, "ok");
  assert.equal(b.credits, 2500);
  assert.equal(b.limit, 10000);
  assert.equal(b.consumed, 7500);
  assert.equal(b.cycleStart, "2026-10-15");
  assert.equal(b.renewsOn, "2026-11-15");
});

test("Apollo cycle dates given as timestamps become IST days", () => {
  const text = JSON.stringify({
    credit_usage_stats: { lead_credit: { limit: "100", consumed: "40", left_over: "60" } },
    current_credit_cycle: { start_date: "2026-10-14T18:30:00Z", end_date: "2026-11-14T18:30:00.000Z" },
  });
  const b = parseApolloBalance(200, text, NOW);
  assert.equal(b.credits, 60);
  assert.equal(b.cycleStart, "2026-10-15");
  assert.equal(b.renewsOn, "2026-11-15");
});

test("Apollo 403 API_INACCESSIBLE says the key needs master scope; 401 and other 403 are a bad key", () => {
  const b = parseApolloBalance(403, JSON.stringify({ error: "This endpoint requires a master API key", error_code: "API_INACCESSIBLE" }), NOW);
  assert.equal(b.state, "no_scope");
  assert.equal(b.credits, null);
  assert.match(b.note, /master API key/);
  assert.equal(parseApolloBalance(401, '{"error":"Invalid access credentials."}', NOW).state, "bad_key");
  assert.equal(parseApolloBalance(403, '{"error":"forbidden"}', NOW).state, "bad_key");
});

test("Apollo 422 naming credits means out; other 422 and 429 are errors", () => {
  const out = parseApolloBalance(422, '{"error":"You have insufficient credits"}', NOW);
  assert.equal(out.state, "out");
  assert.equal(out.credits, 0);
  assert.equal(parseApolloBalance(422, '{"error":"bad input"}', NOW).state, "error");
  assert.match(parseApolloBalance(429, "", NOW).note, /rate limited/);
  assert.equal(parseApolloBalance(200, '{"credit_usage_stats":{}}', NOW).state, "error");
});

// ---- reading with a fake fetch ---------------------------------------------

const fakeFetch = (status, text, seen) => async (url, init) => {
  seen.push({ url, init });
  return { status, text: async () => text };
};

test("LeadsForge read: GET, raw key in Authorization (no Bearer), trimmed", async () => {
  const seen = [];
  const b = await readLeadsforgeBalance("  lf-key\n", fakeFetch(200, '{"availableCredits": 50}', seen), () => NOW);
  assert.equal(b.credits, 50);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].url, LEADSFORGE_BALANCE_URL);
  assert.equal(seen[0].init.method, "GET");
  assert.equal(seen[0].init.headers.Authorization, "lf-key");
});

test("Apollo read: POST with x-api-key; a missing key never calls out", async () => {
  const seen = [];
  const b = await readApolloBalance("ap-key", fakeFetch(200, APOLLO_OK, seen), () => NOW);
  assert.equal(b.credits, 2500);
  assert.equal(seen[0].url, APOLLO_USAGE_URL);
  assert.equal(seen[0].init.method, "POST");
  assert.equal(seen[0].init.headers["x-api-key"], "ap-key");
  assert.equal(seen[0].init.headers.Authorization, undefined);
  const none = [];
  assert.equal((await readApolloBalance(undefined, fakeFetch(200, APOLLO_OK, none))).state, "no_key");
  assert.equal((await readLeadsforgeBalance("  ", fakeFetch(200, "{}", none))).state, "no_key");
  assert.equal(none.length, 0);
});

test("a network failure is an error answer that never carries the key or the error text", async () => {
  const b = await readLeadsforgeBalance("secret-key-123", async () => {
    throw new Error("connect ECONNREFUSED secret-key-123");
  });
  assert.equal(b.state, "error");
  assert.doesNotMatch(JSON.stringify(b), /secret-key-123/);
  const t = await readApolloBalance("k", async () => {
    const e = new Error("timed out");
    e.name = "TimeoutError";
    throw e;
  });
  assert.match(t.note, /no answer/);
});

test("balances are cached 10 minutes, a failed read 1 minute, shared while in flight", async () => {
  let now = NOW;
  let calls = 0;
  let answer = ok(10);
  const get = cachedBalance(async () => {
    calls++;
    return answer;
  }, () => now);
  await Promise.all([get(), get()]);
  assert.equal(calls, 1);
  now += BALANCE_TTL_MS - 1;
  await get();
  assert.equal(calls, 1);
  now += 1;
  answer = balanceOf({ state: "error", note: "HTTP 500" });
  await get();
  assert.equal(calls, 2);
  await new Promise((r) => setImmediate(r));
  now += 60_000;
  await get();
  assert.equal(calls, 3);
});

// ---- burn, days left, run-out ------------------------------------------------

test("burn averages the last 7 whole IST days; days left and run-out day follow", () => {
  const rows = [...allDays("leadsforge", "email", 100), row("leadsforge", "email", TODAY, 40), row("leadsforge", "search", TODAY, 0, { calls: 9 })];
  const s = vendorStats("leadsforge", rows, ok(600), NOW, true, logStartOf(rows));
  assert.equal(s.burnPerDay, 100);
  assert.equal(s.burnDays, 7);
  assert.equal(s.burnBasis, "last 7 days");
  assert.equal(s.usedToday, 40);
  assert.equal(s.callsToday, 49);
  assert.equal(s.daysLeft, 6);
  // 15:00 IST + 6 days
  assert.equal(s.runOutDay, "2026-11-08");
  assert.equal(s.series.length, 30);
  assert.equal(s.series[29].day, TODAY);
  assert.equal(s.series[0].day, addDays(TODAY, -29));
});

test("the run-out day is an IST day: 2.5 days from 15:00 IST on 2 Nov is 5 Nov 03:00 IST", () => {
  const rows = allDays("apollo", "match", 10);
  const s = vendorStats("apollo", rows, ok(25), NOW, true, logStartOf(rows));
  assert.equal(s.daysLeft, 2.5);
  assert.equal(s.runOutDay, "2026-11-05");
});

test("credits from every kind count toward spend; hit rate looks at the spend kind only", () => {
  const rows = [
    row("apollo", "match", addDays(TODAY, -1), 7, { calls: 10, hits: 7, failed: 1 }),
    row("apollo", "search", addDays(TODAY, -1), 0, { calls: 50 }),
    row("apollo", "match", addDays(TODAY, -2), 0, { calls: 4, pending: 4 }),
  ];
  const s = vendorStats("apollo", rows, ok(100), NOW, true, addDays(TODAY, -7));
  assert.equal(s.calls7, 14);
  assert.equal(s.hits7, 7);
  assert.equal(s.failed7, 1);
  assert.equal(s.hitRate7, 0.7); // 7 of 10 finished (4 still in flight)
  assert.deepEqual(s.kinds.map((k) => k.kind), ["match", "search"]);
});

test("a young log averages over the days since it started, today alone when it started today", () => {
  const rows = [row("leadsforge", "email", addDays(TODAY, -2), 30), row("leadsforge", "email", addDays(TODAY, -1), 10)];
  const s = vendorStats("leadsforge", rows, ok(200), NOW, true, logStartOf(rows));
  assert.equal(s.burnDays, 2);
  assert.equal(s.burnPerDay, 20);
  assert.match(s.burnBasis, /last 2 days \(the log started 31 Oct\)/);
  const t = vendorStats("leadsforge", [row("leadsforge", "email", TODAY, 5)], ok(50), NOW, true, TODAY);
  assert.equal(t.burnPerDay, 5);
  assert.match(t.burnBasis, /today so far/);
  assert.equal(t.daysLeft, 10);
});

test("no spend in 7 days: no days left, no run-out day, and the line says so", () => {
  const rows = [row("leadsforge", "email", addDays(TODAY, -20), 50)];
  const s = vendorStats("leadsforge", rows, ok(900), NOW, true, logStartOf(rows));
  assert.equal(s.burnPerDay, 0);
  assert.equal(s.daysLeft, null);
  assert.equal(s.runOutDay, null);
  const [n] = nextThings([s], true);
  assert.equal(n.level, "info");
  assert.match(n.text, /no spend in the last 7 days/);
  assert.doesNotMatch(n.text, /Infinity|NaN/);
});

test("no usage log: burn unknown, the balance still shows, and the line says the log is missing", () => {
  const s = vendorStats("leadsforge", [], ok(900), NOW, false, null);
  assert.equal(s.burnPerDay, null);
  assert.equal(s.daysLeft, null);
  const items = nextThings([s], false);
  assert.ok(items.some((n) => /No usage log yet/.test(n.text)));
});

test("out of credits: 0 days left, run-out today, an urgent line first", () => {
  const s = vendorStats("leadsforge", allDays("leadsforge", "email", 5), balanceOf({ state: "out", credits: 0 }), NOW, true, addDays(TODAY, -7));
  assert.equal(s.daysLeft, 0);
  assert.equal(s.runOutDay, TODAY);
  const [n] = nextThings([s], true);
  assert.equal(n.level, "critical");
  assert.equal(n.text, "LeadsForge is out of credits.");
});

// ---- the next-thing line ----------------------------------------------------

test("next thing: run-out in words, most urgent first, renewal and unknown balances listed", () => {
  const lfRows = allDays("leadsforge", "email", 100);
  const lf = vendorStats("leadsforge", lfRows, ok(600), NOW, true, addDays(TODAY, -7));
  const ap = vendorStats("apollo", [], balanceOf({ state: "no_scope", note: "Apollo balance needs a master API key; showing our own logged usage only" }), NOW, true, addDays(TODAY, -7));
  const items = nextThings([ap, lf], true);
  assert.equal(items[0].text, "LeadsForge runs out in about 6 days (8 Nov) at the current pace (600 left, about 100 a day).");
  assert.equal(items[0].level, "warning");
  assert.equal(items[1].text, "Apollo balance unknown: key cannot read it (needs a master API key).");
});

test("next thing: Apollo renewing before it runs out says the renewal; after, the run-out", () => {
  const rows = allDays("apollo", "match", 100);
  const renewFirst = vendorStats("apollo", rows, ok(2500, { renewsOn: "2026-11-15" }), NOW, true, addDays(TODAY, -7));
  const [a] = nextThings([renewFirst], true);
  assert.equal(a.text, "Apollo credits renew on 15 Nov, before they run out at the current pace (2,500 left).");
  const runFirst = vendorStats("apollo", rows, ok(300, { renewsOn: "2026-11-15" }), NOW, true, addDays(TODAY, -7));
  const items = nextThings([runFirst], true);
  assert.equal(items[0].level, "critical");
  assert.equal(items[0].text, "Apollo runs out in about 3 days (5 Nov) at the current pace (300 left, about 100 a day). Credits renew on 15 Nov.");
  assert.equal(items.length, 1);
});

test("next thing: a renewal is still listed when the balance is unknown or nothing is spent", () => {
  const idle = vendorStats("apollo", [], ok(2500, { renewsOn: "2026-11-15" }), NOW, true, addDays(TODAY, -7));
  const items = nextThings([idle], true);
  assert.ok(items.some((n) => n.text === "Apollo credits renew on 15 Nov."));
  assert.ok(items.some((n) => /no spend in the last 7 days/.test(n.text)));
  // the renewal (13 days away) sorts before "no spend" (no date)
  assert.match(items[0].text, /renew/);
});

test("next thing: a key that is not set or rejected says so in plain words", () => {
  const noKey = vendorStats("leadsforge", [], balanceOf({ state: "no_key", note: "LEADSFORGE_API_KEY is not set here" }), NOW, true, null);
  const bad = vendorStats("apollo", [], balanceOf({ state: "bad_key", note: "key rejected (HTTP 401)" }), NOW, true, null);
  const items = nextThings([noKey, bad], true);
  assert.equal(items[0].level, "critical");
  assert.equal(items[0].text, "Apollo balance unknown: the key was rejected. Check APOLLO_API_KEY.");
  assert.equal(items[1].text, "LeadsForge balance unknown: LEADSFORGE_API_KEY is not set here.");
});

test("no em or en dashes in any line the page can show", () => {
  const rows = allDays("leadsforge", "email", 100);
  const report = buildReport(rows, { leadsforge: ok(600), apollo: ok(10, { renewsOn: "2026-11-15" }) }, NOW, true);
  const text = JSON.stringify(report.next) + JSON.stringify(report.vendors.map((v) => v.burnBasis));
  assert.doesNotMatch(text, /[\u2013\u2014]/);
  assert.equal(report.today, TODAY);
  assert.equal(report.vendors.length, 2);
});

test("y ticks are whole, round and reach the max", () => {
  assert.deepEqual(niceTicks(0), [0, 1]);
  assert.deepEqual(niceTicks(3), [0, 1, 2, 3]);
  assert.deepEqual(niceTicks(87), [0, 50, 100]);
  const t = niceTicks(1234);
  assert.ok(t[t.length - 1] >= 1234);
  assert.ok(t.every((v) => Number.isInteger(v)));
});
