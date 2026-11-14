// node --test scripts/stu-actives.test.mjs
// ACTIVES (14 Nov 2026, the owner: "i want better dau, mau and wau reporting"): the activity definition (student-made
// only), the channel split, the periods before, cohort cells not reached yet and week over week
// (app/lib/stu/model.ts activity, app/lib/stu/actives.ts). Every person here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { CH_CALL, CH_MSG, CH_WEB, STEPS, activity, activeCell, dailyTable, retention } from "../app/lib/stu/model.ts";
import { BIT, COHORT_SPANS, activesBody, addDays } from "../app/lib/stu/actives.ts";

const at = (day, hh = "10:00") => Date.parse(`${day}T${hh}:00+05:30`);
const truthOn = Object.fromEntries(STEPS.map((s) => [s.key, s.key === "signed_up" || !!s.truth]));
const person = (id, joinedDay, over = {}) => ({
  id, email: `${id}@example.com`, name: id, internal: null, created: at(joinedDay), joined: at(joinedDay), existing: false, ch: "direct",
  touch: null, t: {}, j: {}, via: null, testPaid: null, ...over,
});
const data = (users, over = {}) => ({
  generatedAt: "", missing: [], journeyLive: true, sourceLive: true, journeyStart: at("2026-11-02"), truthOn,
  users, visitors: [], act: [], calls: [], fails: [], journeySteps: [], envs: [], testUsers: [], ...over,
});
/** A started call: [user, mode, status, error, created, started, ended, duration, dropped, resume, completed] */
const call = (u, day, mode = "desk") => [u, mode, "finished", null, at(day), at(day), at(day, "10:10"), 600, 0, 0, 1];
const input = (d, over = {}) => ({
  act: activity(d),
  scope: new Set(d.users.map((_, i) => i).filter((i) => !d.users[i].internal)),
  joined: (u) => d.users[u].joined,
  paidAt: (u) => d.users[u].t.paid ?? null,
  onboardedAt: (u) => d.users[u].t.onboarded ?? null,
  countFromDay: "2026-11-03",
  today: "2026-11-14",
  ...over,
});
const F = { start: "2026-11-14", end: "2026-11-14", internal: false, channel: "all" };

test("the channel bits are the model's", () => {
  assert.deepEqual(BIT, { web: CH_WEB, msg: CH_MSG, call: CH_CALL });
});

test("definition: rows our system makes are not activity; the student's own are", () => {
  const day = "2026-11-10";
  const d = data([person("sys", "2026-11-05"), person("me", "2026-11-05"), person("seen", "2026-11-05")], {
    act: [
      // Made by career-agent with no one there: auto-adds, sequence emails, an outreach beacon from the lanes, a
      // payment row, digests sent and read.
      ["outreach_row", 0, day, 3, 0], ["email", 0, day, 2, 0], ["email_test", 0, day, 1, 0], ["f:outreach", 0, day, 1, 0],
      ["pay", 0, day, 1, 29900], ["digest_sent", 0, day, 1, 0], ["digest_read", 0, day, 1, 0], ["reply", 0, day, 1, 0],
      // The old save row (career_matches.updated_at) is no longer read; if it were, it would not count either.
      ["save", 0, day, 1, 0],
      // The student's own.
      ["job_saved", 1, day, 1, 0], ["f:email_send", 1, "2026-11-11", 1, 0],
      // An open desk's poll records job views and a jobs beacon by itself: never a day on their own.
      ["job_view", 2, day, 40, 0], ["f:jobs", 2, day, 1, 0],
      ["job_view", 2, "2026-11-12", 5, 0], ["active_day:web", 2, "2026-11-12", 1, 0],
    ],
  });
  const a = activity(d);
  assert.equal(a.days.has(0), false, "system rows alone make nobody active");
  assert.deepEqual([...a.days.get(1).keys()].sort(), ["2026-11-10", "2026-11-11"]);
  assert.deepEqual([...a.days.get(1).get(day)], ["save"]);
  assert.deepEqual([...a.days.get(2).keys()], ["2026-11-12"], "job views count only on a day already active");
  assert.deepEqual([...a.days.get(2).get("2026-11-12")], ["jobs"]);
  // The Active students tile (the "active" daily metric) and retention read the same definition.
  const tb = dailyTable(d, { start: day, end: day, internal: false, channel: "all" }, 1);
  assert.equal(tb.rows.find((r) => r.def.key === "active").total.v, 1);
  assert.equal(activeCell(d, new Set([day]), new Set([0, 1, 2])).v, 1);
  const [row] = retention(d, { start: "2026-11-05", end: "2026-11-05", internal: false, channel: "all" }, true);
  assert.equal(row.d.d1.back.v, 2, "day 1 or later: the save and the active day, not the auto-adds");
});

test("channels: from every signal of the day, not active_day's via alone", () => {
  const day = "2026-11-14";
  const d = data([
    person("wa_then_web", "2026-11-01"), // first request on WhatsApp, then the desk
    person("web", "2026-11-01"),
    person("wa", "2026-11-01"),
    person("wa_turns", "2026-11-01"), // WhatsApp turns land in the desk chat table too
    person("both_chats", "2026-11-01"),
    person("caller", "2026-11-01"),
    person("chat_beacon", "2026-11-01"),
  ], {
    act: [
      ["active_day:whatsapp", 0, day, 1, 0], ["f:desk", 0, day, 1, 0],
      ["active_day:web", 1, day, 1, 0],
      ["chat_wa", 2, day, 3, 0],
      ["chat_desk", 3, day, 2, 0], ["chat_wa", 3, day, 2, 0],
      ["chat_desk", 4, day, 3, 0], ["chat_wa", 4, day, 1, 0],
      ["f:chat", 6, day, 1, 0],
    ],
    calls: [call(5, day)],
  });
  const a = activity(d);
  const bits = (u) => a.ch.get(u).get(day);
  assert.equal(bits(0), CH_WEB | CH_MSG);
  assert.equal(bits(1), CH_WEB);
  assert.equal(bits(2), CH_MSG);
  assert.equal(bits(3), CH_MSG, "desk chat rows WhatsApp explains add no web");
  assert.equal(bits(4), CH_WEB | CH_MSG, "more desk chat rows than WhatsApp messages: some were on the web");
  assert.equal(bits(5), CH_CALL);
  assert.equal(bits(6), 0, "a chat beacon is the desk or WhatsApp: active, channel not known");

  const b = activesBody({ end: day }, input(d));
  const row = (k) => b.split.rows.find((r) => r.key === k).cells[0].v;
  assert.equal(b.dau.cell.v, 7);
  assert.equal(row("web_only"), 1);
  assert.equal(row("msg_only"), 2);
  assert.equal(row("web_msg"), 2);
  assert.equal(row("call_only"), 1);
  assert.equal(row("unknown"), 1);
  assert.equal(row("call"), 1);
  assert.equal(row("web_only") + row("msg_only") + row("web_msg") + row("call_only") + row("unknown"), b.dau.cell.v, "the channel rows add up to DAU");
  assert.equal(row("free"), 7);
  assert.equal(row("not_onboarded"), 7);
});

test("channels over a week: web one day and WhatsApp another is web and messaging for WAU, one of them for DAU", () => {
  const d = data([person("a", "2026-11-01")], { act: [["active_day:web", 0, "2026-11-10", 1, 0], ["active_day:whatsapp", 0, "2026-11-14", 1, 0]] });
  const b = activesBody({ end: "2026-11-14" }, input(d));
  const row = (k) => b.split.rows.find((r) => r.key === k).cells.map((c) => c.v);
  assert.deepEqual(row("msg_only"), [1, 0, 0]);
  assert.deepEqual(row("web_msg"), [0, 1, 1]);
});

test("paid and onboarded are as of the period's last day", () => {
  const d = data([
    person("paid_before", "2026-11-04", { t: { paid: at("2026-11-05"), onboarded: at("2026-11-04") } }),
    person("paid_after", "2026-11-04", { t: { paid: at("2026-11-15"), onboarded: at("2026-11-15") } }),
  ], { act: [["active_day:web", 0, "2026-11-14", 1, 0], ["active_day:web", 1, "2026-11-14", 1, 0]] });
  const b = activesBody({ end: "2026-11-14" }, input(d, { today: "2026-11-16" }));
  const row = (k) => b.split.rows.find((r) => r.key === k).cells[0].users;
  assert.deepEqual(row("paid"), [0]);
  assert.deepEqual(row("free"), [1]);
  assert.deepEqual(row("onboarded"), [0]);
  assert.deepEqual(row("not_onboarded"), [1]);
});

test("periods: DAU, WAU and MAU against the period before, none against days before counting started", () => {
  // Five people active on set days around an end day long after the count-from line.
  const end = "2027-01-31";
  const act = [
    ["active_day:web", 0, end, 1, 0], // today
    ["active_day:web", 1, addDays(end, -1), 1, 0], // the day before
    ["active_day:web", 2, addDays(end, -10), 1, 0], // the 7 days before (days 8 to 14 back)
    ["active_day:web", 3, addDays(end, -40), 1, 0], // the 30 days before
    ["active_day:web", 4, addDays(end, -3), 1, 0], ["active_day:web", 4, addDays(end, -35), 1, 0],
  ];
  const d = data([0, 1, 2, 3, 4].map((i) => person(`p${i}`, "2026-11-05")), { act });
  const b = activesBody({ end }, input(d, { today: end }));
  assert.equal(b.dau.cell.v, 1);
  assert.equal(b.dau.prev, 1);
  assert.equal(b.wau.cell.v, 3, "today, the day before, three days back");
  assert.equal(b.wau.prev, 1);
  assert.equal(b.mau.cell.v, 4);
  assert.equal(b.mau.prev, 2, "40 and 35 days back");
  assert.equal(b.dau.partial || b.wau.partial || b.mau.partial, false);
  assert.equal(b.returning.v, 1);
  assert.equal(b.fresh.v, 0);
  assert.equal(b.wauMau.value, 75);

  // Counting starts 20 days before the end: the 30 days before (and the MAU's own start) reach before it.
  const late = activesBody({ end }, input(d, { today: end, countFromDay: addDays(end, -20) }));
  assert.equal(late.mau.prev, null, "never compared with days that were not counted");
  assert.equal(late.mau.partial, true);
  assert.equal(late.wau.prev, 1, "the 7 days before were counted");
  assert.equal(late.stickiness.prev, null);
  assert.equal(late.chart[0].day, addDays(end, -20), "the chart starts where counting starts");
  assert.equal(late.chart.length, 21);
});

test("chart: 60 days, DAU split new and returning, WAU and MAU each day", () => {
  const end = "2027-02-01";
  const d = data([person("old", "2026-12-01"), person("new", end)], { act: [["active_day:web", 0, end, 1, 0], ["active_day:web", 1, end, 1, 0]] });
  const b = activesBody({ end }, input(d, { today: end }));
  assert.equal(b.chart.length, 60);
  const last = b.chart[b.chart.length - 1];
  assert.deepEqual([last.new.users, last.returning.users], [[1], [0]]);
  assert.equal(last.wau, 2);
  assert.equal(last.mau, 2);
  assert.equal(b.chart[0].wauPartial, false);
});

test("cohorts: cells not reached yet are not 0%, a running span says so far", () => {
  const today = "2026-11-14";
  const d = data([
    person("y1", "2026-11-13"), person("y2", "2026-11-13"), // joined yesterday
    person("old", "2026-11-03"), // joined 11 days ago
  ], {
    act: [
      ["active_day:web", 0, "2026-11-14", 1, 0], // back on day 1 (today, so far)
      ["active_day:web", 2, "2026-11-04", 1, 0], // day 1
      ["active_day:web", 2, "2026-11-09", 1, 0], // day 6: in D7 (days 4 to 7)
      ["active_day:web", 2, "2026-11-12", 1, 0], // day 9: in D14 (days 8 to 14)
    ],
  });
  const b = activesBody({ end: today }, input(d, { today }));
  const row = (k) => b.cohorts.day.find((r) => r.key === k);
  const cell = (r, n) => r.cells.find((c) => c.n === n);
  const y = row("2026-11-13");
  assert.equal(y.size.v, 2);
  assert.deepEqual([cell(y, 1).value, cell(y, 1).state, cell(y, 1).back.v], [50, "so_far", 1]);
  for (const n of [3, 7, 14, 30]) {
    assert.equal(cell(y, n).state, "not_yet");
    assert.equal(cell(y, n).value, null, `D${n} is not reached: no number, never 0%`);
  }
  const o = row("2026-11-03");
  assert.deepEqual([cell(o, 1).value, cell(o, 1).state], [100, "done"]);
  assert.deepEqual([cell(o, 3).value, cell(o, 3).state], [0, "done"], "a span that is over with nobody back is a real 0%");
  assert.deepEqual([cell(o, 7).value, cell(o, 7).state], [100, "done"]);
  assert.deepEqual([cell(o, 14).value, cell(o, 14).state], [100, "so_far"], "days 8 to 14: day 14 is 17 Nov");
  assert.equal(cell(o, 30).state, "not_yet");
  assert.equal(b.cohorts.day.length, 12, "21 days to the end, from the count-from line");
  assert.ok(!b.cohorts.day.some((r) => r.key < "2026-11-03"));
  assert.deepEqual(COHORT_SPANS.map((x) => x.n), [1, 3, 7, 14, 30]);

  // By week (Monday weeks): the week of 9 Nov has the two from 13 Nov; the week of 2 Nov starts before counting.
  const w = b.cohorts.week;
  assert.deepEqual(w.map((r) => [r.key, r.size.v, !!r.partial]), [["2026-11-09", 2, false], ["2026-11-02", 1, true]]);
  // Onboarded only: nobody here onboarded.
  assert.ok(b.cohorts.dayOnboarded.every((r) => r.size.v === 0));
});

test("week over week: WAU is kept plus joined plus back, kept as a % of the week before", () => {
  const end = "2026-11-28";
  const d = data([person("kept", "2026-11-05"), person("joined", "2026-11-24"), person("back", "2026-11-05"), person("gone", "2026-11-05")], {
    act: [
      ["active_day:web", 0, "2026-11-20", 1, 0], ["active_day:web", 0, "2026-11-27", 1, 0],
      ["active_day:web", 1, "2026-11-24", 1, 0],
      ["active_day:web", 2, "2026-11-08", 1, 0], ["active_day:web", 2, "2026-11-26", 1, 0],
      ["active_day:web", 3, "2026-11-21", 1, 0],
    ],
  });
  const b = activesBody({ end }, input(d, { today: end }));
  const [w0, w1] = b.weeks;
  assert.deepEqual([w0.from, w0.to], ["2026-11-22", "2026-11-28"]);
  assert.deepEqual([w0.wau.v, w0.kept.v, w0.joined.v, w0.back.v], [3, 1, 1, 1]);
  assert.equal(w0.prevWau, 2);
  assert.equal(w0.keptPct, 50);
  assert.equal(w1.wau.v, 2);
  // The weeks stop where counting started (3 Nov), the first one flagged as partly before it.
  const lastWeek = b.weeks[b.weeks.length - 1];
  assert.ok(lastWeek.to >= "2026-11-03" && lastWeek.from < "2026-11-03" && lastWeek.partial);
  assert.equal(lastWeek.prevWau, null);
});

test("no em or en dashes in the panel's words", async () => {
  const { COHORT_RULE } = await import("../app/lib/stu/actives.ts");
  const { activitySource } = await import("../app/lib/stu/model.ts");
  const text = [COHORT_RULE, activitySource(data([])), activitySource(data([], { act: [["active_day:web", 0, "2026-11-14", 1, 0]] }))].join("\n");
  assert.ok(!/[\u2013\u2014]/.test(text));
});
