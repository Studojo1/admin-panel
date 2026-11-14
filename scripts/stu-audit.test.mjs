// node --test scripts/stu-audit.test.mjs
// ADMIN-AUDIT-STU (14 Nov 2026, the owner: "audit the admin dashboard and do this properly see whats breaking"):
// a range that ends today against the same time of day before (app/lib/stu/model.ts compareBasis), today's Daily
// column never coloured, the Active users chart stacked (app/lib/stu/actives-chart.ts), partly tracked steps, one
// definition of a failed call attempt, and "so far" on DAU and retention. Every person here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DAILY_METRICS, STEPS, activity, compareBasis, compareText, dailyColumns, dailyTone, dataNow, dayRange, funnelBasis, ratios, retention,
} from "../app/lib/stu/model.ts";
import { activesBody, addDays } from "../app/lib/stu/actives.ts";
import { ACTIVES_STACKING, DAU_STACK, MAU_STACK, WAU_STACK, activesDatasets } from "../app/lib/stu/actives-chart.ts";

const at = (day, hh = "10:00") => Date.parse(`${day}T${hh}:00+05:30`);
const truthOn = Object.fromEntries(STEPS.map((s) => [s.key, s.key === "signed_up" || !!s.truth]));
const person = (id, joined, over = {}) => ({
  id, email: `${id}@example.com`, name: id, internal: null, created: joined, joined, existing: false, ch: "direct",
  touch: null, t: {}, j: {}, via: null, testPaid: null, ...over,
});
const data = (users, over = {}) => ({
  generatedAt: "", missing: [], journeyLive: true, sourceLive: true, journeyStart: at("2026-11-02"), truthOn,
  users, visitors: [], act: [], calls: [], fails: [], journeySteps: [], envs: [], testUsers: [], ...over,
});
const metric = (key) => DAILY_METRICS.find((m) => m.key === key);
const F = (start, end) => ({ start, end, internal: false, channel: "all" });

test("compare basis: a range that ends today is set against the period before, cut at this time of day", () => {
  const now = at("2026-11-14", "14:27");
  const today = compareBasis(F("2026-11-14", "2026-11-14"), now);
  assert.deepEqual([today.pf.start, today.pf.end], ["2026-11-13", "2026-11-13"]);
  assert.equal(today.soFar, true);
  assert.equal(today.until, at("2026-11-13", "14:27"), "yesterday up to now's time");
  assert.equal(compareText(F("2026-11-14", "2026-11-14"), today), "vs yesterday at this time");

  const week = compareBasis(F("2026-11-08", "2026-11-14"), now);
  assert.deepEqual([week.pf.start, week.pf.end], ["2026-11-01", "2026-11-07"]);
  assert.equal(week.until, at("2026-11-07", "14:27"), "the 7 days before, up to this time on their last day");
  assert.equal(compareText(F("2026-11-08", "2026-11-14"), week), "vs the 7 days before at this time");

  const past = compareBasis(F("2026-11-13", "2026-11-13"), now);
  assert.equal(past.soFar, false);
  assert.equal(past.until, null, "a day that is over is set against the whole day before");
  assert.equal(compareText(F("2026-11-13", "2026-11-13"), past), "vs the day before");

  assert.equal(dataNow({ generatedAt: "2026-11-14T08:57:00.000Z" }), Date.parse("2026-11-14T08:57:00.000Z"), "now is when the data was read");
});

test("same-time cut: yesterday's sign-ups after now's time are left out, so a half day is not -51%", () => {
  const now = at("2026-11-14", "12:00");
  // Today: 4 sign-ups by noon. Yesterday: 3 by noon and 5 after it (a whole day of 8).
  const users = [
    ...["08:00", "09:00", "10:00", "11:30"].map((h, i) => person(`t${i}`, at("2026-11-14", h))),
    ...["07:00", "09:30", "11:59"].map((h, i) => person(`m${i}`, at("2026-11-13", h))),
    ...["12:01", "15:00", "18:00", "21:00", "23:30"].map((h, i) => person(`e${i}`, at("2026-11-13", h))),
  ];
  const d = data(users, { generatedAt: new Date(now).toISOString() });
  const f = F("2026-11-14", "2026-11-14");
  const cmp = compareBasis(f, dataNow(d));
  const scope = new Set(users.map((_, i) => i));
  const su = metric("signups");
  assert.equal(su.timed, true, "sign-ups have a time each: they can be cut");
  assert.equal(su.cell(d, f, new Set(dayRange(f.start, f.end)), scope).v, 4);
  assert.equal(su.cell(d, cmp.pf, new Set(dayRange(cmp.pf.start, cmp.pf.end)), scope, cmp.until).v, 3, "yesterday by noon");
  assert.equal(su.cell(d, cmp.pf, new Set(dayRange(cmp.pf.start, cmp.pf.end)), scope).v, 8, "the whole day, as before the fix");
});

test("metrics counted per IST day only cannot be cut: the tiles show them as so far", () => {
  for (const key of ["visitors", "active", "job_opens", "apply_clicks", "paid_users", "revenue"]) {
    assert.equal(metric(key).timed, undefined, `${key} has no time of day`);
  }
  for (const key of ["signups", "onboarded", "outreach_people", "calls_started", "calls_failed"]) {
    assert.equal(metric(key).timed, true, `${key} has a time each`);
  }
});

test("Daily: the column that holds today is labelled so far and never coloured against a whole day", () => {
  const cols = dailyColumns(F("2026-11-12", "2026-11-14"), 1, "2026-11-14");
  assert.deepEqual(cols.map((c) => c.label), ["11-12", "11-13", "11-14 so far"]);
  assert.deepEqual(cols.map((c) => Boolean(c.soFar)), [false, false, true]);
  const def = { kind: undefined };
  const cell = (v) => ({ v, users: [] });
  assert.equal(dailyTone(def, cell(2), cell(9), cols[2]), "", "today half done: not red");
  assert.equal(dailyTone(def, cell(20), cell(9), cols[2]), "", "and not green either");
  assert.equal(dailyTone(def, cell(2), cell(9), cols[1]), "down", "a whole day against a whole day");
  assert.equal(dailyTone(def, cell(9), cell(2), cols[1]), "up");
  assert.equal(dailyTone({ kind: "test" }, cell(9), cell(2), cols[1]), "", "test rows never");
  const weekly = dailyColumns(F("2026-11-01", "2026-11-14"), 7, "2026-11-14");
  assert.equal(weekly[1].soFar, true, "a week that holds today is so far too");
  assert.match(weekly[1].label, /so far$/);
});

test("Active users: DAU, WAU and MAU that end today are so far, with no % against whole days", () => {
  const end = "2026-11-14";
  const d = data([person("a", at("2026-11-05")), person("b", at("2026-11-05"))], {
    act: [["active_day:web", 0, end, 1, 0], ["active_day:web", 1, addDays(end, -1), 1, 0], ["active_day:web", 0, addDays(end, -1), 1, 0]],
  });
  const input = (today) => ({
    act: activity(d), scope: new Set([0, 1]), joined: (u) => d.users[u].joined, paidAt: () => null, onboardedAt: () => null,
    countFromDay: "2026-11-03", today,
  });
  const live = activesBody({ end }, input(end));
  assert.equal(live.dau.soFar, true);
  assert.equal(live.dau.prev, null, "not -50% against a whole yesterday");
  assert.equal(live.wau.prev, null);
  assert.equal(live.mau.prev, null);
  assert.equal(live.stickiness.soFar, true);
  assert.equal(live.stickiness.prev, null);
  const over = activesBody({ end }, input(addDays(end, 1)));
  assert.equal(over.dau.soFar, undefined);
  assert.equal(over.dau.prev, 2, "a day that is over is compared");
});

test("Active users chart: new and returning bars stack into DAU; WAU and MAU are never added to them", () => {
  const day = (v) => ({ day: v.day, new: { v: v.n, users: [] }, returning: { v: v.r, users: [] }, wau: v.w, mau: v.m, wauPartial: false, mauPartial: false });
  const days = [day({ day: "2026-11-13", n: 160, r: 45, w: 400, m: 480 })];
  const ds = activesDatasets(days, { returning: "#1", fresh: "#2", wau: "#3", mau: "#4" });
  assert.equal(ACTIVES_STACKING.y.stacked, true, "the y axis stacks (it was false: the bars overlapped)");
  assert.equal(ACTIVES_STACKING.x.stacked, true);
  const bars = ds.filter((x) => x.type === "bar");
  assert.deepEqual(bars.map((x) => x.stack), [DAU_STACK, DAU_STACK]);
  assert.equal(bars.reduce((a, x) => a + x.data[0], 0), 205, "13 Nov is 160 new + 45 returning");
  const lines = ds.filter((x) => x.type === "line");
  assert.deepEqual(lines.map((x) => x.stack), [WAU_STACK, MAU_STACK]);
  assert.equal(new Set(ds.map((x) => x.stack)).size, 3, "each line on a stack of its own");
});

test("partly tracked: Saw sign-up is never a base for a % and never the biggest drop", () => {
  assert.equal(STEPS.find((s) => s.key === "saw_signup").partial, true);
  assert.match(metric("saw_signup").label, /partly tracked/);
  const bar = (key, v, over = {}) => ({ key, anon: false, gate: false, cell: { v, users: [] }, untracked: false, fromKey: null, pctPrev: null, ...over });
  const bars = [
    bar("visited_home", 1000, { anon: true }),
    bar("clicked_join", 300, { anon: true }),
    bar("saw_signup", 8, { anon: true, partial: true }),
    bar("signed_up", 78, { gate: true }),
    bar("call_started", 60, { gate: true }),
  ];
  const drop = funnelBasis(bars, false);
  const saw = bars.find((b) => b.key === "saw_signup");
  assert.equal(saw.pctPrev, null);
  assert.equal(bars.find((b) => b.key === "signed_up").fromKey, "clicked_join", "Signed up is % of Opened Stu, as if Saw sign-up were not there");
  assert.notEqual(drop, "saw_signup");
  assert.equal(drop, "signed_up", "78 of 300 is the real drop");
});

test("failed calls: one definition (failed calls plus mic denied and other call_failed) for calls and people", () => {
  const j = at("2026-11-14");
  const users = ["a", "b", "c"].map((id) => person(id, j));
  /** [user, mode, status, error, created, started, ended, duration, dropped, resume, completed] */
  const call = (u, status = "finished", completed = 1) => [u, "onboarding", status, null, j, j, j + 600_000, 600, 0, 1, completed];
  const d = data(users, { calls: [call(0), call(1), call(2, "failed", 0)], fails: [[0, j - 60_000, "mic_denied"]] });
  const f = F("2026-11-14", "2026-11-14");
  const r = Object.fromEntries(ratios(d, f).map((x) => [x.key, x]));
  assert.equal(r.call_fail_calls.num.v, 2, "the failed call and the mic denied attempt");
  assert.equal(r.call_fail_calls.den.v, 4, "3 calls made plus the attempt that never became a call");
  assert.equal(r.call_fail.num.v, 2, "2 people had a failed attempt");
  assert.equal(r.call_fail.den.v, 3);
  const days = new Set(["2026-11-14"]);
  assert.equal(metric("calls_failed").cell(d, f, days, new Set([0, 1, 2])).v, 2, "Daily counts the same attempts");
});

test("retention: a day N that is today is marked so far", () => {
  const users = [person("a", at("2026-11-13")), person("b", at("2026-11-12"))];
  const d = data(users, { act: [["active_day:web", 0, "2026-11-14", 1, 0], ["active_day:web", 1, "2026-11-13", 1, 0]] });
  const [row] = retention(d, F("2026-11-12", "2026-11-13"), false, "week", [1], "2026-11-14");
  assert.equal(row.d.d1.soFar, true, "a joined 13 Nov: D1 is today");
  assert.equal(row.d.d1.back.v, 2);
  const [done] = retention(d, F("2026-11-12", "2026-11-13"), false, "week", [1], "2026-11-15");
  assert.equal(done.d.d1.soFar, undefined, "once today is over it is not");
});
