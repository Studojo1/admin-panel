// node --test scripts/compare-model.test.mjs
// OLD-VS-NEW (15 Nov 2026): the /compare rules (app/lib/compare/model.ts): the old baselines (best stretch, last days,
// lifetime, best month, custom), one window's numbers on either side (cohorts, the 7-day horizon, payers and revenue,
// refunds, opens, replies, return, actives), the change words, the best days, both funnels, channels, the weekly
// timeline split at the relaunch, and Stu's side built from the Stu model so its numbers are the Stu pages' own.
// Every person here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import * as stu from "../app/lib/stu/model.ts";
import {
  OLD_LAST_FULL_DAY, OLD_STEPS, RELAUNCH_DAY, addDays, baseline, bestMonth, bestWindow, calDays, change, channels, dayRange, effDays, faceOff,
  funnelSteps, istDay, newSide, oldMonths, report, scoreboard, series, stepTime, timeline, trackedWin, weekOf, winKey, winMetrics, windowsNeeded,
} from "../app/lib/compare/model.ts";

const at = (day, hh = "10:00") => Date.parse(`${day}T${hh}:00+05:30`);
const H = 3_600_000;
const NOW = at("2026-11-15", "12:00"); // half of 15 Nov gone

/** A side with no rows; `over` fills what a test needs. */
function side(over = {}) {
  const s = {
    side: "old", from: "2026-04-01", to: "2026-11-02", people: [], steps: OLD_STEPS, act: { start: "resume", value: "leads" },
    pays: [], refunds: [], refundsKept: false, mail: [], reach: [], replies: [], active: [], visitors: {}, visitorsFromMs: null,
    distinct: () => null, ph: null, phDistinct: () => null, ...over,
  };
  return s;
}
const person = (day, t = {}, ch = "direct") => ({ su: at(day), ch, t });
const O = { nowMs: NOW, horizon: null };

test("days: IST boundaries, calendar days, Monday weeks", () => {
  assert.equal(istDay(Date.parse("2026-11-02T18:29:59Z")), "2026-11-02");
  assert.equal(istDay(Date.parse("2026-11-02T18:30:00Z")), RELAUNCH_DAY);
  assert.equal(calDays("2026-11-03", "2026-11-15"), 13);
  assert.equal(weekOf("2026-11-02"), "2026-11-02", "2 Nov 2026 is a Monday");
  assert.equal(weekOf("2026-11-08"), "2026-11-02");
  assert.equal(weekOf("2026-11-09"), "2026-11-09");
});

test("today counts as the part of it gone by; old days and Stu's earlier days count whole", () => {
  assert.equal(effDays("new", { start: "2026-11-14", end: "2026-11-15" }, NOW), 1.5);
  assert.equal(effDays("old", { start: "2026-05-01", end: "2026-05-31" }, NOW), 31);
});

test("best stretch: ties go to the earlier window, revenue picks the money, a long n takes the whole life", () => {
  const people = [...Array.from({ length: 8 }, () => person("2026-05-10")), ...Array.from({ length: 8 }, () => person("2026-06-01"))];
  const old = side({ people, pays: [[0, "2026-07-01", 1, 99900, 0], [1, "2026-07-03", 1, 50000, 0]] });
  assert.deepEqual(bestWindow(old, 1, "signups"), { start: "2026-05-10", end: "2026-05-10" });
  assert.deepEqual(bestWindow(old, 3, "revenue"), { start: "2026-07-01", end: "2026-07-03" });
  assert.deepEqual(bestWindow(old, 9999, "signups"), { start: "2026-04-01", end: OLD_LAST_FULL_DAY });
});

test("baselines: last n days end on 1 Nov, lifetime is every whole day, the best month, a picked month, a custom range kept to the old days", () => {
  const people = [...Array.from({ length: 9 }, () => person("2026-05-20")), ...Array.from({ length: 4 }, () => person("2026-06-20"))];
  const old = side({ people, pays: [[0, "2026-06-05", 1, 500000, 0]] });
  const last = baseline(old, { kind: "last", by: "signups" }, 13);
  assert.deepEqual([last.start, last.end], ["2026-10-20", "2026-11-01"]);
  const life = baseline(old, { kind: "lifetime", by: "signups" }, 13);
  assert.deepEqual([life.start, life.end], ["2026-04-01", "2026-11-01"]);
  assert.deepEqual(bestMonth(old, "signups"), { start: "2026-05-01", end: "2026-05-31" });
  assert.deepEqual(bestMonth(old, "revenue"), { start: "2026-06-01", end: "2026-06-30" });
  const picked = baseline(old, { kind: "month", by: "signups", month: "2026-08" }, 13);
  assert.deepEqual([picked.start, picked.end, picked.why], ["2026-08-01", "2026-08-31", "the month picked"]);
  const custom = baseline(old, { kind: "custom", by: "signups", start: "2026-03-01", end: "2026-12-01" }, 13);
  assert.deepEqual([custom.start, custom.end], ["2026-04-01", "2026-11-02"], "kept to the old product's days");
  assert.deepEqual(oldMonths(old).map((w) => w.start.slice(0, 7)), ["2026-04", "2026-05", "2026-06", "2026-07", "2026-08", "2026-09", "2026-10"], "November (two days) is not a month");
});

test("a window: the cohort, steps any time or within 7 days, payers once, revenue, repeat payers", () => {
  const d0 = "2026-05-01";
  const people = [
    person(d0, { resume: at(d0, "10:05"), leads: at(d0, "10:10"), paid: at(d0, "12:00") }),
    person(d0, { resume: at(d0, "11:00"), leads: at("2026-05-20"), paid: at("2026-05-20") }), // leads and paid after 19 days
    person("2026-05-02"),
    person("2026-04-20", { paid: at("2026-05-02") }), // signed up before, paid in the window
  ];
  const old = side({ people, pays: [[0, d0, 1, 49900, 0], [3, "2026-05-02", 1, 176000, 2000], [0, "2026-06-01", 1, 49900, 0], [1, "2026-05-20", 1, 49900, 0]] });
  const w = { start: "2026-05-01", end: "2026-05-02" };
  const any = winMetrics(old, w, O);
  assert.equal(any.signups.v, 3);
  assert.equal(any.actStart.v, 2);
  assert.equal(any.actValue.v, 2);
  assert.equal(any.cohortPaid.v, 2);
  assert.deepEqual([any.payers.v, any.payments, any.revenue, any.usdCents], [2, 2, 225900, 2000]);
  assert.equal(any.repeatPayers.v, 1, "person 0 paid again in June");
  assert.equal(any.medianToPay, (2 * H + (at("2026-05-20") - at(d0))) / 2);
  const seven = winMetrics(old, w, { ...O, horizon: 7 });
  assert.equal(seven.actValue.v, 1, "leads after 19 days do not count within 7");
  assert.equal(seven.cohortPaid.v, 1);
  assert.equal(stepTime(people[1], "leads", 7), null);
  assert.equal(stepTime(people[1], "signed_up", 7), people[1].su);
});

test("a window: refunds over payments (refunded in full included), opens only on tracked days, replies and reach", () => {
  const people = [person("2026-07-01"), person("2026-07-01")];
  const neu = side({ side: "new", from: RELAUNCH_DAY, to: "2026-11-15", people: [person("2026-11-05"), person("2026-11-05")], refundsKept: true,
    pays: [[0, "2026-11-05", 3, 89700, 0]], refunds: [[1, "2026-11-05", 1, 29900, 1]] });
  const n = winMetrics(neu, { start: "2026-11-05", end: "2026-11-05" }, O);
  const rows = Object.fromEntries(scoreboard(winMetrics(side(), { start: "2026-07-01", end: "2026-07-01" }, O), n).map((r) => [r.key, r]));
  assert.equal(rows.refund_rate.neu.v, 25, "1 refunded of 3 kept + 1 refunded in full");
  assert.equal(rows.refund_rate.old.v, null, "the old product recorded no refunds: unknown, not zero");
  assert.equal(rows.refund_rate.old.note, "not recorded");

  const old = side({ people,
    mail: [[0, "2026-07-06", 10, -1, 1], [0, "2026-07-07", 10, 4, 0], [1, "2026-07-07", 5, 1, 0]],
    reach: [[0, "2026-07-06", 4], [1, "2026-07-07", 5]], replies: [[0, "2026-07-07", 2, 1], [1, "2026-07-08", 1, 0]] });
  const m = winMetrics(old, { start: "2026-07-06", end: "2026-07-07" }, O);
  assert.deepEqual([m.emails, m.opened, m.openBase, m.bounced, m.senders.v], [25, 5, 15, 1, 2]);
  assert.deepEqual([m.reached, m.replies, m.positive], [9, 2, 1]);
  const r2 = Object.fromEntries(scoreboard(m, n).map((r) => [r.key, r]));
  assert.equal(r2.open_rate.old.v, 33.3, "5 opened of the 15 sent on tracked days");
  assert.equal(r2.open_rate.neu.v, null);
  assert.equal(r2.reply_lead.old.v, 22.2);
  assert.equal(r2.reply_email.old.v, 8);
});

test("return on day N: active exactly that IST day, of those whose day N has come on that side", () => {
  const people = [person("2026-10-20"), person("2026-10-20"), person("2026-10-30")];
  const old = side({ people, active: [[0, "2026-10-21"], [1, "2026-10-22"], [0, "2026-10-27"], [2, "2026-10-31"]] });
  const m = winMetrics(old, { start: "2026-10-20", end: "2026-10-30" }, O);
  assert.deepEqual([m.ret.d1.back.v, m.ret.d1.eligible.v], [2, 3]);
  assert.deepEqual([m.ret.d7.back.v, m.ret.d7.eligible.v], [1, 2], "30 Oct + 7 is after the switch-off (2 Nov)");
  assert.equal(m.ret.d30.eligible.v, 0);
  assert.equal(m.dauSum, 3, "31 Oct is outside the window");
  assert.equal(m.returning.v, 2);
});

test("weekly actives need 7 days behind a day on that side; Stu's first week has none", () => {
  const neu = side({ side: "new", from: RELAUNCH_DAY, to: "2026-11-15", people: [person("2026-11-03"), person("2026-11-04")],
    active: [[0, "2026-11-03"], [1, "2026-11-08"], [0, "2026-11-09"]] });
  assert.equal(winMetrics(neu, { start: "2026-11-03", end: "2026-11-08" }, O).wau, null);
  const m = winMetrics(neu, { start: "2026-11-09", end: "2026-11-09" }, O);
  assert.equal(m.wau, 2, "3 to 9 Nov: both people");
});

test("visitors: per day over the days tracked, the tracked-from part of the first day, distinct over the tracked window", () => {
  const asked = [];
  const neu = side({ side: "new", from: RELAUNCH_DAY, to: "2026-11-15", people: [person("2026-11-03"), person("2026-11-04")],
    visitors: { "2026-11-03": 10, "2026-11-04": 100 }, visitorsFromMs: at("2026-11-03", "18:00"),
    distinct: (w) => (asked.push(winKey(w)), 105) });
  const m = winMetrics(neu, { start: "2026-11-03", end: "2026-11-04" }, O);
  assert.equal(m.visitorsSum, 110);
  assert.equal(m.visitorDays, 1.25, "3 Nov tracked from 18:00: a quarter day");
  assert.equal(m.visitors, 105);
  assert.deepEqual(asked, ["2026-11-03|2026-11-04"]);
  // Old: a window starting before PostHog counts visitors and the ratio's sign-ups from its first tracked day.
  const old = side({ from: "2026-02-01", people: [person("2026-03-10"), person("2026-04-02")], visitors: { "2026-04-01": 20, "2026-04-02": 30 }, distinct: () => 40 });
  const om = winMetrics(old, { start: "2026-03-01", end: "2026-04-02" }, O);
  assert.deepEqual([om.visitorsFrom, om.signupsTracked, om.signups.v, om.visitors], ["2026-04-01", 1, 2, 40]);
  assert.deepEqual(trackedWin(old, { start: "2026-03-01", end: "2026-04-02" }, old.visitors), { start: "2026-04-01", end: "2026-04-02" });
  const rows = Object.fromEntries(scoreboard(om, m).map((r) => [r.key, r]));
  assert.equal(rows.visit_signup.old.v, 2.5, "1 sign-up on tracked days over 40 visitors");
  assert.equal(rows.visitors_day.neu.v, 88);
  assert.match(rows.visitors_day.neu.note, /105 different people/);
});

test("windowsNeeded asks PostHog for exactly the windows winMetrics reads", () => {
  const asked = new Set();
  const old = side({ from: "2026-02-01", people: [person("2026-05-01")], visitors: Object.fromEntries(dayRange("2026-04-01", "2026-11-02").map((d) => [d, 5])),
    distinct: (w) => (asked.add(winKey(w)), 1) });
  old.ph = old.visitors;
  old.phDistinct = old.distinct;
  const neu = side({ side: "new", from: RELAUNCH_DAY, to: "2026-11-15", visitors: {}, ph: { "2026-11-03": 3, "2026-11-04": 4 }, phDistinct: () => 1 });
  const p = { newWin: { start: RELAUNCH_DAY, end: "2026-11-15" }, base: { kind: "best", by: "signups" }, horizon: null, nowMs: NOW };
  const need = windowsNeeded(old, neu, p);
  report(old, neu, p);
  for (const k of asked) assert.ok(need.old.some((w) => winKey(w) === k), `${k} was fetched`);
  assert.ok(need.old.some((w) => w.start === "2026-04-01" && w.end === "2026-04-30"), "April as a month");
  assert.ok(!need.old.some((w) => w.start < "2026-04-01"), "nothing before PostHog");
  assert.deepEqual(need.neuPh.map(winKey), ["2026-11-03|2026-11-15"]);
});

test("the change words: points for a share, times for the rest, faster for a time, nothing better for a neutral row", () => {
  assert.deepEqual(change({ kind: "pct", better: "up" }, 23.4, 14.1), { text: "-9.3 pts", tone: "bad" });
  assert.deepEqual(change({ kind: "pct", better: "down" }, 3.8, 0), { text: "-3.8 pts", tone: "good" });
  assert.deepEqual(change({ kind: "num", better: "up" }, 106.3, 71.8), { text: "0.68x", tone: "bad" });
  assert.deepEqual(change({ kind: "num", better: "up" }, 2, 30), { text: "15x", tone: "good" });
  assert.deepEqual(change({ kind: "count", better: "up" }, 0, 3), { text: "new", tone: "good" });
  assert.deepEqual(change({ kind: "count", better: "up" }, 0, 0), { text: "same", tone: "" });
  assert.deepEqual(change({ kind: "ms", better: "down" }, 9.8 * H, 0.5 * H), { text: "20x faster", tone: "good" });
  assert.deepEqual(change({ kind: "inr", better: null }, 1782, 878).tone, "");
  assert.deepEqual(change({ kind: "pct", better: "up" }, null, 3), { text: "", tone: "" });
});

test("best days: each side's best IST day, Stu's best can be today (so far), the best 7 whole days", () => {
  const old = side({ from: "2026-04-01", people: [person("2026-04-28"), person("2026-04-28"), person("2026-05-01")] });
  const neu = side({ side: "new", from: RELAUNCH_DAY, to: "2026-11-15",
    people: [...Array.from({ length: 3 }, () => person("2026-11-15")), person("2026-11-14"), ...Array.from({ length: 7 }, (_, i) => person(addDays("2026-11-05", i)))] });
  const f = Object.fromEntries(faceOff(old, neu, NOW).map((x) => [x.key, x]));
  assert.deepEqual(f.signups.oldBest, { day: "2026-04-28", v: 2 });
  assert.deepEqual(f.signups.newBest, { day: "2026-11-15", v: 3, soFar: true });
  assert.equal(f.signups.today, 3);
  assert.equal(f.signups.yesterday, 1);
  assert.equal(f.signups.newWeek.start, "2026-11-05", "today is never in the best 7 whole days");
  assert.equal(f.signups.newAvg, 11 / 12.5);
  assert.deepEqual(f.signups.bestVsBest, { text: "1.5x", tone: "good" });
  assert.equal(f.visitors.oldBest, null, "no visitor data: no best day");
});

test("both funnels: each step of the cohort, of the step before, a part-tracked step is never the base", () => {
  const d = "2026-05-01";
  const people = [
    person(d, { resume: at(d, "10:01"), quiz_done: at(d, "10:05"), leads: at(d, "10:10") }),
    person(d, { resume: at(d, "10:02"), quiz_started: at(d, "10:03"), quiz_done: at(d, "10:06") }),
    person(d),
  ];
  const steps = Object.fromEntries(funnelSteps(side({ people }), { start: d, end: d }, null).map((s) => [s.key, s]));
  assert.equal(steps.signed_up.people.v, 3);
  assert.equal(steps.resume.ofSignups, 66.7);
  assert.equal(steps.quiz_started.partial, true, "the quiz start was tracked from 21 May");
  assert.equal(steps.quiz_done.ofPrev, 100, "measured from the resume step, not the part-tracked quiz start");
  assert.equal(steps.leads.ofPrev, 50);
  assert.equal(steps.leads.fromPrev, 5 * 60_000);
});

test("channels: sign-ups by first touch, the share, who paid and what they paid", () => {
  const old = side({ people: [person("2026-10-01", { paid: at("2026-10-02") }, "search"), person("2026-10-01", {}, "search"), person("2026-08-01", {}, "meta_paid")],
    pays: [[0, "2026-10-02", 1, 176000, 0]] });
  const neu = side({ side: "new", from: RELAUNCH_DAY, to: "2026-11-15", people: [person("2026-11-04", {}, "meta_paid"), { ...person("2026-11-04", {}, "search"), x: 1 }] });
  const c = channels(old, { start: "2026-09-19", end: "2026-11-02" }, neu, { start: RELAUNCH_DAY, end: "2026-11-15" });
  const by = Object.fromEntries(c.rows.map((r) => [r.key, r]));
  assert.deepEqual([c.oldTotal, c.newTotal], [2, 1], "the August sign-up is before the first touch was kept; the internal one is left out");
  assert.deepEqual(by.search.old, { signups: 2, share: 100, paid: 1, revenue: 176000 });
  assert.equal(by.meta_paid.neu.signups, 1);
  assert.equal(by.search.neu.signups, 0);
});

test("the timeline: weeks split at the relaunch, payers once a week, visitors as a day's average", () => {
  const old = side({ from: "2026-10-26", to: "2026-11-02", people: [person("2026-10-27")], pays: [[0, "2026-10-27", 1, 100, 0], [0, "2026-10-28", 1, 100, 0]],
    visitors: { "2026-10-26": 10, "2026-10-27": 20 } });
  const neu = side({ side: "new", from: RELAUNCH_DAY, to: "2026-11-04", people: [person("2026-11-03")] });
  const wk = timeline(old, neu, "week");
  assert.deepEqual(wk.map((p) => [p.at, p.side, !!p.part]), [["2026-10-26", "old", false], ["2026-11-02", "old", true], ["2026-11-02", "new", true]]);
  assert.equal(wk[0].v.payers, 1);
  assert.equal(wk[0].v.revenue, 200);
  assert.equal(wk[0].v.visitors, 15);
  assert.equal(timeline(old, neu, "day").length, 8 + 2);
  assert.equal(series(old, "payers").get("2026-10-27"), 1);
});

// ------------------------------------------------------------------ Stu's side

const truthOn = Object.fromEntries(stu.STEPS.map((s) => [s.key, s.key === "signed_up" || !!s.truth]));
const user = (id, day, over = {}) => ({
  id, email: `${id}@example.org`, name: id, internal: null, created: at(day), joined: at(day), existing: false, ch: "direct",
  touch: null, t: {}, j: {}, via: null, testPaid: null, ...over,
});
function stuFixture() {
  const users = [
    user("a", "2026-11-03", { t: { call_started: at("2026-11-03", "10:05"), onboarded: at("2026-11-03", "10:20"), paid: at("2026-11-04") }, ch: "meta_paid" }),
    user("b", "2026-11-04", { t: { call_started: at("2026-11-04", "10:05") } }),
    user("c", "2026-11-05", { internal: "studojo.com", t: { call_started: at("2026-11-05", "10:05"), onboarded: at("2026-11-05", "10:30"), paid: at("2026-11-05") } }),
    user("d", "2026-11-05", { t: { onboarded: at("2026-11-05", "11:00") } }),
  ];
  const act = [
    ["pay", 0, "2026-11-04", 1, 29900], ["pay", 2, "2026-11-05", 1, 29900], ["pay", 0, "2026-11-06", 1, 29900],
    ["email", 0, "2026-11-05", 6, 0], ["email", 1, "2026-11-05", 2, 0], ["reply", 0, "2026-11-06", 2, 0],
    ["desk", 0, "2026-11-03", 1, 0], ["desk", 0, "2026-11-04", 1, 0], ["desk", 1, "2026-11-05", 1, 0], ["desk", 2, "2026-11-05", 1, 0],
  ];
  const visitors = [
    { id: "v1", u: 0, ch: "direct", device: null, city: null, days: { visited_home: ["2026-11-03", "2026-11-04"] }, first: { visited_home: at("2026-11-03", "09:00") } },
    { id: "v2", u: -1, ch: "direct", device: null, city: null, days: { visited_home: ["2026-11-04"] }, first: { visited_home: at("2026-11-04", "09:00") } },
    { id: "v3", u: 2, ch: "direct", device: null, city: null, days: { visited_home: ["2026-11-04"] }, first: { visited_home: at("2026-11-04", "09:00") } },
  ];
  return {
    generatedAt: new Date(NOW).toISOString(), missing: [], journeyLive: true, sourceLive: true, journeyStart: at("2026-11-03", "00:00"), countFrom: at("2026-11-03", "00:00"),
    pageViewStart: at("2026-11-03", "08:00"), truthOn, users, visitors, act, calls: [], fails: [], journeySteps: [], envs: [], testUsers: [],
  };
}
const extras = { reach: [[0, "2026-11-05", 3]], positive: [[0, "2026-11-06", 1]], bounces: [[1, "2026-11-05", 1]], refunds: [], ph: null, phDistinct: () => null };

test("Stu's side is the Stu pages' own numbers: Daily's cells, the unnested funnel, Retention", () => {
  const d = stuFixture();
  const neu = newSide(d, stu, extras, "2026-11-15");
  assert.equal(neu.people[2].x, 1, "the internal account is marked and left out");
  const f = { start: RELAUNCH_DAY, end: "2026-11-15", internal: false, channel: "all" };
  const days = new Set(stu.dayRange(f.start, f.end));
  const scope = new Set(stu.scopeUsers(d, f));
  const cell = (key) => stu.DAILY_METRICS.find((m) => m.key === key).cell(d, f, days, scope);
  const m = winMetrics(neu, { start: f.start, end: f.end }, O);
  assert.equal(m.signups.v, cell("signups").v);
  assert.equal(m.activatedEvents.v, cell("onboarded").v);
  assert.equal(m.payers.v, cell("paid_users").v);
  assert.equal(m.revenue, cell("revenue").v);
  assert.equal(m.emails, cell("emails").v);
  assert.equal(m.replies, cell("replies").v);
  assert.equal(m.actives.v, cell("active").v);
  assert.equal(m.visitors, cell("visitors").v, "distinct visitors, the internal one's left out");
  assert.deepEqual([m.reached, m.positive, m.bounced], [3, 1, 1]);
  assert.deepEqual(m.payers.users, [0]);
  const fun = stu.funnel(d, f, false);
  const mine = Object.fromEntries(funnelSteps(neu, { start: f.start, end: f.end }, null).map((s) => [s.key, s.people.v]));
  for (const r of fun.rows) if (!r.test) assert.equal(mine[r.key], r.cell.v, r.key);
  const ret = stu.retention(d, f, false, "week", [1, 7, 30], "2026-11-15");
  const back = ret.reduce((a, w) => a + w.d.d1.back.v, 0);
  const elig = ret.reduce((a, w) => a + w.d.d1.eligible.v, 0);
  assert.deepEqual([m.ret.d1.back.v, m.ret.d1.eligible.v], [back, elig]);
  const rows = Object.fromEntries(scoreboard(winMetrics(side(), { start: "2026-05-01", end: "2026-05-13" }, O), m).map((r) => [r.key, r]));
  assert.equal(rows.signup_paid.neu.v, stu.ratios(d, f).find((r) => r.key === "signup_paid").value);
  assert.equal(rows.visit_signup.neu.v, stu.ratios(d, f).find((r) => r.key === "visit_signup").value);
  assert.equal(rows.act_start.neu.v, stu.ratios(d, f).find((r) => r.key === "signup_call").value);
});

test("Stu's visitors per day start at the first page_view, a day's share from it", () => {
  const d = stuFixture();
  const neu = newSide(d, stu, extras, "2026-11-15");
  assert.deepEqual(neu.visitors["2026-11-03"], 1);
  assert.deepEqual(neu.visitors["2026-11-04"], 2, "v3 belongs to an internal account");
  const m = winMetrics(neu, { start: "2026-11-03", end: "2026-11-04" }, O);
  assert.equal(m.visitorDays, 1 + 16 / 24, "3 Nov tracked from 08:00");
});

test("the report: the new window kept to Stu's days, the baseline of the same length, months to Stu", () => {
  const d = stuFixture();
  const neu = newSide(d, stu, extras, "2026-11-15");
  const old = side({ from: "2026-04-01", people: [person("2026-04-28"), person("2026-04-29")] });
  const r = report(old, neu, { newWin: { start: "2026-10-01", end: "2026-11-15" }, base: { kind: "best", by: "signups" }, horizon: null, nowMs: NOW });
  assert.deepEqual(r.newWin, { start: RELAUNCH_DAY, end: "2026-11-15" });
  assert.equal(calDays(r.base.start, r.base.end), 13);
  assert.equal(r.base.start <= "2026-04-28" && r.base.end >= "2026-04-29", true);
  assert.equal(r.months.at(-1).side, "new");
  assert.equal(r.months.at(-2).label, "1 Nov to 2 Nov (old, off 2 Nov 03:55)");
  assert.ok(r.rows.every((x) => typeof x.label === "string" && !/[\u2013\u2014]/.test(x.label + (x.def ?? "") + (x.oldDef ?? "") + (x.newDef ?? ""))), "no en or em dashes in the words");
});
