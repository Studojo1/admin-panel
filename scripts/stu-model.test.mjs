// node --test scripts/stu-model.test.mjs
// The Stu tracking rules (app/lib/stu/model.ts): IST days, the sign-up cohort,
// truth over the journey log, nested gates, retention, the reset.
// Imports the TypeScript source directly: Node 22.18+ strips the types itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STEPS, USER_STEPS, DAILY_METRICS, istDay, stepAt, cohortOf, funnel, sinceReset, countFrom, dailyTable, retention, ratios, dropoffs, sources,
  activity, activeCell,
} from "../app/lib/stu/model.ts";

const ms = (iso) => Date.parse(iso);
const truthOn = Object.fromEntries(STEPS.map((s) => [s.key, s.key === "signed_up" || !!s.truth]));
const user = (over = {}) => ({
  id: "u", email: "a@x.com", name: "A", internal: null, created: ms("2026-11-01T05:00:00Z"), joined: ms("2026-11-01T05:00:00Z"),
  existing: false, ch: "direct", touch: null, t: {}, j: {}, via: null, testPaid: null, ...over,
});
const data = (users, over = {}) => ({
  generatedAt: "", missing: [], journeyLive: true, sourceLive: true, journeyStart: ms("2026-10-25T00:00:00Z"), truthOn,
  users, visitors: [], act: [], calls: [], fails: [], journeySteps: [], envs: [], testUsers: [], ...over,
});
const F = { start: "2026-11-01", end: "2026-11-01", internal: false, channel: "all" };

test("IST day boundaries: 18:29 UTC is still the same IST day, 18:30 UTC is the next", () => {
  assert.equal(istDay(ms("2026-11-01T18:29:59Z")), "2026-11-01");
  assert.equal(istDay(ms("2026-11-01T18:30:00Z")), "2026-11-02");
});

test("the step list is one constant in plan order, with 4b after 4", () => {
  const ns = STEPS.map((s) => s.n);
  assert.deepEqual(ns.slice(0, 5), ["1", "2", "3", "4", "4b"]);
  assert.equal(ns.at(-1), "23");
  assert.equal(new Set(STEPS.map((s) => s.key)).size, STEPS.length);
  assert.ok(STEPS.every((s) => /^[a-z_]+$/.test(s.key)));
});

test("a step with a table counts only who the table holds, at the earlier time", () => {
  const u = user({ t: { saw_jobs: ms("2026-11-01T10:00:00Z") }, j: { saw_jobs: ms("2026-11-01T09:00:00Z"), call_started: ms("2026-11-01T08:00:00Z") } });
  const d = data([u]);
  assert.equal(stepAt(d, u, "saw_jobs"), ms("2026-11-01T09:00:00Z"));
  assert.equal(stepAt(d, u, "call_started"), null, "the log cannot add someone the calls table lacks");
  assert.equal(stepAt(d, u, "opened_desk"), null);
  const u2 = user({ j: { opened_desk: ms("2026-11-01T11:00:00Z") } });
  assert.equal(stepAt(data([u2]), u2, "opened_desk"), ms("2026-11-01T11:00:00Z"), "journey-only steps come from the log");
});

test("cohort: joined in range by IST day; internal people only with the switch; channel filter", () => {
  const d = data([
    user({ id: "a", joined: ms("2026-11-01T18:29:00Z") }),
    user({ id: "b", joined: ms("2026-11-01T18:31:00Z") }),
    user({ id: "c", internal: "staff (admin)" }),
    user({ id: "e", ch: "linkedin" }),
  ]);
  assert.deepEqual(cohortOf(d, F).map((i) => d.users[i].id), ["a", "e"]);
  assert.deepEqual(cohortOf(d, { ...F, internal: true }).map((i) => d.users[i].id), ["a", "c", "e"]);
  assert.deepEqual(cohortOf(d, { ...F, channel: "linkedin" }).map((i) => d.users[i].id), ["e"]);
});

test("nested funnel gates on the spine; unnested counts everyone", () => {
  const t0 = ms("2026-11-01T06:00:00Z");
  const d = data([
    user({ id: "a", t: { call_started: t0, call_completed: t0 + 6e5, onboarded: t0 + 7e5, saw_jobs: t0 + 8e5 } }),
    user({ id: "b", t: { saw_jobs: t0 } }), // saw jobs without a call: not in the nested count
  ]);
  const nested = Object.fromEntries(funnel(d, F, true).rows.map((r) => [r.key, r.cell.v]));
  const flat = Object.fromEntries(funnel(d, F, false).rows.map((r) => [r.key, r.cell.v]));
  assert.equal(nested.signed_up, 2);
  assert.equal(nested.call_started, 1);
  assert.equal(nested.saw_jobs, 1);
  assert.equal(flat.saw_jobs, 2);
  const row = funnel(d, F, true).rows.find((r) => r.key === "call_completed");
  assert.equal(row.medianFromPrev, 6e5);
  assert.ok(funnel(d, F, true).rows.some((r) => r.key === "paid_test"), "test payments have their own row");
});

test("daily: a step counts once, on its first IST day; test rows exist", () => {
  const d = data([user({ t: { onboarded: ms("2026-11-01T19:00:00Z") } })], {
    act: [["pay_test", 0, "2026-11-02", 1, 29900], ["email", 0, "2026-11-02", 3, 0]],
  });
  const tb = dailyTable(d, { ...F, end: "2026-11-02" }, 1);
  const row = (k) => tb.rows.find((r) => r.def.key === k);
  assert.deepEqual(row("onboarded").cells.map((c) => c.v), [0, 1]);
  assert.deepEqual(row("emails").cells.map((c) => c.v), [0, 3]);
  assert.equal(row("test_payments").total.v, 1);
  assert.equal(row("revenue").total.v, 0, "test money is never revenue");
  assert.ok(DAILY_METRICS.some((m) => m.kind === "test"));
});

test("retention: back on day N after the IST join day, out of people whose day N has come", () => {
  const d = data([user({ id: "a" }), user({ id: "b" })], { act: [["desk", 0, "2026-11-02", 1, 0], ["desk", 1, "2026-11-04", 1, 0]] });
  const [row] = retention(d, F, false);
  assert.equal(row.size.v, 2);
  assert.equal(row.d.d1.back.v, 1);
  assert.equal(retention(d, F, true)[0].d.d1.back.v, 2);
});

test("every page computes on empty data without throwing", () => {
  const d = data([], { journeyLive: false });
  assert.doesNotThrow(() => { funnel(d, F, true); ratios(d, F); dropoffs(d, F); sources(d, F, "channel"); retention(d, F, false); sinceReset(d, Date.now()); dailyTable(d, F, 7); });
  assert.ok(dailyTable(d, F, 1).rows.find((r) => r.def.key === "visitors").total.na, "log-only rows say n/a when the log is not live");
});

test("no em or en dashes in any label or source note", () => {
  const d = data([]);
  const text = [
    ...STEPS.flatMap((s) => [s.label, s.truth ?? "", s.phase]),
    ...DAILY_METRICS.flatMap((m) => [m.label, m.source(d)]),
    ...USER_STEPS.map((s) => s.label),
  ].join("\n");
  assert.ok(!/[\u2013\u2014]/.test(text));
});

test("activity: product rows and calls count before the beacons; beacons add features, never replace", () => {
  const call = [0, "onboarding", "ready", null, ms("2026-11-01T05:10:00Z"), ms("2026-11-01T05:10:00Z"), ms("2026-11-01T05:20:00Z"), 600, 0, 1, 1];
  const d = data([user({ id: "a" }), user({ id: "b" })], {
    calls: [call],
    act: [["chat_desk", 0, "2026-11-02", 4, 0], ["job_view", 1, "2026-11-01", 2, 0], ["pay", 1, "2026-11-03", 1, 100], ["f:resume", 0, "2026-11-02", 1, 0], ["active_day", 1, "2026-11-04", 1, 0]],
  });
  const a = activity(d);
  assert.equal(a.beacons, true);
  assert.deepEqual([...a.days.get(0).keys()].sort(), ["2026-11-01", "2026-11-02"]);
  assert.deepEqual([...a.days.get(0).get("2026-11-02")].sort(), ["chat", "resume"]);
  assert.deepEqual([...a.days.get(1).keys()].sort(), ["2026-11-01", "2026-11-04"], "a payment alone is not activity; active_day is");
  const scope = new Set([0, 1]);
  assert.equal(activeCell(d, new Set(["2026-11-01"]), scope, "new").v, 2);
  assert.equal(activeCell(d, new Set(["2026-11-02", "2026-11-04"]), scope, "returning").v, 2);
  assert.equal(activity(data([user()])).beacons, false);
});

test("retention by sign-up day: one row per IST join day, any day offsets", () => {
  // Relative to today: retention only counts people whose day N has come.
  const day = (n) => istDay(Date.now() + n * 86_400_000);
  const at = (d) => Date.parse(`${d}T06:00:00+05:30`);
  const d = data([user({ id: "a", joined: at(day(-5)) }), user({ id: "b", joined: at(day(-6)) })], { act: [["desk", 0, day(-3), 1, 0]] });
  const rows = retention(d, { ...F, start: day(-6), end: day(0) }, false, "day", [1, 2]);
  assert.deepEqual(rows.map((r) => r.week), [day(-5), day(-6)]);
  assert.equal(rows[0].d.d2.back.v, 1);
  assert.equal(rows[0].d.d1.back.v, 0);
});

test("reset: nothing before the line counts; an earlier person who comes back joins after it", () => {
  const line = ms("2026-11-03T00:00:00+05:30");
  const users = [
    user({ id: "gone", joined: ms("2026-11-02T10:00:00Z"), t: { onboarded: ms("2026-11-02T11:00:00Z") }, j: { onboarded: ms("2026-11-02T11:00:00Z") } }),
    user({ id: "back", joined: ms("2026-11-02T10:00:00Z"), t: { call_started: ms("2026-11-02T12:00:00Z"), saw_jobs: ms("2026-11-03T08:00:00Z") }, j: {} }),
    user({ id: "new", joined: ms("2026-11-03T09:00:00Z"), t: {}, j: {} }),
  ];
  const d = data(users, {
    act: [["desk", 0, "2026-11-02", 2, 0], ["desk", 1, "2026-11-03", 1, 0]],
    calls: [[0, "onboarding", "finished", null, ms("2026-11-02T11:00:00Z"), null, null, 60, 0, 0, 1], [2, "onboarding", "ready", null, ms("2026-11-03T09:05:00Z"), null, null, 30, 0, 0, 1]],
    visitors: [{ id: "v1", u: 0, ch: "direct", device: null, city: null, days: { visited_home: ["2026-11-02"] }, first: { visited_home: ms("2026-11-02T09:00:00Z") } }],
  });
  const r = sinceReset(d, line);
  assert.deepEqual(r.users.map((u) => u.id), ["back", "new"], "the person with nothing after the line is gone");
  assert.equal(r.users[0].joined, ms("2026-11-03T00:00:00+05:30"), "a comeback joins at their first time after the line (the desk day's start here)");
  assert.deepEqual(Object.keys(r.users[0].t), ["saw_jobs"], "their earlier call is dropped");
  assert.deepEqual(r.act, [["desk", 0, "2026-11-03", 1, 0]], "activity days before the line go, the rest is renumbered");
  assert.deepEqual(r.calls.map((c) => c[0]), [1], "calls before the line go, the rest point at the new indexes");
  assert.equal(r.visitors.length, 0, "a visitor with nothing after the line goes");
  assert.equal(r.countFrom, line);
  assert.equal(countFrom(undefined), line, "the default line is 3 Nov 2026, 00:00 IST");
  assert.equal(countFrom("junk"), line);
  assert.equal(countFrom("2026-11-05T00:00:00Z"), ms("2026-11-05T00:00:00Z"));
});
