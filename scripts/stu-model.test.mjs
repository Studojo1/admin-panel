// node --test scripts/stu-model.test.mjs
// The Stu tracking rules (app/lib/stu/model.ts): IST days, the sign-up cohort,
// truth over the journey log, nested gates, retention, the reset.
// Imports the TypeScript source directly: Node 22.18+ strips the types itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  STEPS, USER_STEPS, DAILY_METRICS, istDay, stepAt, cohortOf, funnel, sinceReset, countFrom, dailyTable, retention, ratios, dropoffs, sources,
  activity, activeCell, splitKey, visitSource, oldVisitCount, furthestStep, visitorsTrackedFrom, funnelBasis, paidLive, liveDays,
  markSharedBrowsers, SHARED_BROWSER, signupSourceText, capPct,
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

test("STEP-ORDER: the steps are the product's real order, numbered 1 to 24 with no letters", () => {
  assert.deepEqual(STEPS.map((s) => s.n), STEPS.map((_, i) => String(i + 1)));
  assert.equal(new Set(STEPS.map((s) => s.key)).size, STEPS.length);
  assert.ok(STEPS.every((s) => /^[a-z_]+$/.test(s.key)));
  assert.deepEqual(USER_STEPS.map((s) => s.key), [
    "signed_up", "reached_stu", "verified_phone", "whatsapp_linked",
    "call_started", "resume_in_call", "first_question", "call_completed", "onboarded",
    "opened_desk", "saw_jobs", "opened_job", "saw_plans", "chatted", "saved_job", "apply_click",
    "outreach_started", "mailbox_connected", "first_email_sent", "first_reply", "paid",
  ]);
  // A phase is one run of steps, never split.
  const runs = STEPS.map((s) => s.phase).filter((p, i, a) => i === 0 || a[i - 1] !== p);
  assert.deepEqual(runs, ["Arrive", "Sign up", "Call", "Use", "Outreach", "Pay"]);
});

test("STEP-ORDER: someone who verified their phone on WhatsApp and never called stops before the call", () => {
  // Signed in, the screen before the call loaded, the WhatsApp code sent (verified and linked by one message), no call.
  const t0 = ms("2026-11-01T07:23:00Z");
  const u = user({ t: { verified_phone: t0 + 51e3, whatsapp_linked: t0 + 51e3 }, j: { reached_stu: t0 + 1e3 } });
  const d = data([u]);
  const far = USER_STEPS[furthestStep(d, u)];
  assert.equal(far.key, "whatsapp_linked");
  assert.ok(Number(far.n) < Number(USER_STEPS.find((s) => s.key === "call_started").n), "WhatsApp linked is before the call");
  const stuck = Object.fromEntries(dropoffs(d, F).stuck.map((s) => [s.key, s.cell.v]));
  assert.equal(stuck.whatsapp_linked, 1);
  assert.equal(stuck.onboarded, 0);
});

test("STEP-ORDER: a typical person's times read top to bottom", () => {
  // A made-up person with the gaps prod showed (2 to 4 Nov 2026), in seconds after sign-in. Written out by hand, not
  // from STEPS, so a wrong order in STEPS fails here.
  const secs = {
    reached_stu: 1, verified_phone: 50, whatsapp_linked: 50.2, call_started: 120, resume_in_call: 132, first_question: 135,
    call_completed: 720, onboarded: 790, opened_desk: 792, saw_jobs: 802, opened_job: 837, saw_plans: 873, chatted: 1230,
    saved_job: 1590, apply_click: 1620, outreach_started: 1600 + 60, mailbox_connected: 1800, first_email_sent: 2400,
    first_reply: 90000, paid: 95000,
  };
  const t0 = ms("2026-11-01T06:00:00Z");
  const at = Object.fromEntries(Object.entries(secs).map(([k, s]) => [k, t0 + s * 1000]));
  const u = user({ t: at, j: at });
  const d = data([u]);
  const times = USER_STEPS.map((s) => stepAt(d, u, s.key));
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  assert.equal(USER_STEPS[furthestStep(d, u)].key, "paid");
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
  assert.equal(r.users[0].joined, ms("2026-11-03T08:00:00Z"), "a comeback joins at their first exact time after the line, not 00:00 of a day row on that day");
  assert.deepEqual(Object.keys(r.users[0].t), ["saw_jobs"], "their earlier call is dropped");
  assert.deepEqual(r.act, [["desk", 0, "2026-11-03", 1, 0]], "activity days before the line go, the rest is renumbered");
  assert.deepEqual(r.calls.map((c) => c[0]), [1], "calls before the line go, the rest point at the new indexes");
  assert.equal(r.visitors.length, 0, "a visitor with nothing after the line goes");
  assert.equal(r.countFrom, line);
  assert.equal(countFrom(undefined), line, "the default line is 3 Nov 2026, 00:00 IST");
  assert.equal(countFrom("junk"), line);
  assert.equal(countFrom("2026-11-05T00:00:00Z"), ms("2026-11-05T00:00:00Z"));
});

test("real visitors: one number, page_view only, tracked from the first page_view; days before it are not tracked", () => {
  // The loader (data.server.ts) folds page_view days into visited_home and, once the log has a page_view, reads no
  // visited_home (a server row crawlers write) at all. A range reaching the first page_view's day says from when.
  const start = ms("2026-11-03T21:58:00+05:30");
  const visitors = [
    { id: "real", u: -1, ch: "direct", device: "mobile", inapp: "instagram", city: null, days: { visited_home: ["2026-11-04"] }, first: { visited_home: ms("2026-11-04T00:04:00+05:30") } },
    { id: "late", u: -1, ch: "direct", device: null, city: null, days: { visited_home: ["2026-11-03"] }, first: { visited_home: ms("2026-11-03T22:10:00+05:30") } },
  ];
  const d = data([], { visitors, pageViewStart: start });
  const cell = (s, e) => dailyTable(d, { ...F, start: s, end: e }, 1).rows.find((r) => r.def.key === "visitors").total;
  assert.equal(cell("2026-11-04", "2026-11-04").v, 1);
  assert.equal(cell("2026-11-04", "2026-11-04").trackedFrom, undefined, "a day after the first page_view needs no note");
  assert.equal(cell("2026-11-03", "2026-11-03").v, 1, "the first page_view's day counts from then");
  assert.equal(cell("2026-11-03", "2026-11-03").trackedFrom, start);
  assert.equal(cell("2026-11-03", "2026-11-04").v, 2);
  assert.equal(cell("2026-11-03", "2026-11-04").trackedFrom, start, "a range reaching back says from when");
  assert.equal(cell("2026-11-03", "2026-11-04").old, undefined, "never the crawler count again");
  assert.equal(cell("2026-11-02", "2026-11-02").na, true, "a day before tracking began is not tracked, not zero");
  assert.equal(visitorsTrackedFrom(d, ["2026-11-05"]), null);
  assert.equal(oldVisitCount(data([], { pageViewStart: null })), true, "no page_view in the log: every count is the old one");
  assert.equal(oldVisitCount(d), false);
  assert.match(visitSource(d), /page_view/);
  assert.match(visitSource(d), /tracked from/);
  assert.match(visitSource(data([])), /old count/);
});

test("reset: a day row only gives the join time when nothing exact is known, or its day is earlier", () => {
  const line = ms("2026-11-03T00:00:00+05:30");
  const users = [
    // Active before the line; after it, a day row on 4 Nov and an exact step at 15:34 that day.
    user({ id: "same", joined: ms("2026-10-20T10:00:00Z"), t: { verified_phone: ms("2026-11-04T15:34:00+05:30") } }),
    // A day row on 3 Nov, the first exact time on 4 Nov: they were here on 3 Nov.
    user({ id: "earlier", joined: ms("2026-10-20T10:00:00Z"), t: { saw_jobs: ms("2026-11-04T09:00:00+05:30") } }),
    // Only a day row.
    user({ id: "day", joined: ms("2026-10-20T10:00:00Z") }),
  ];
  const d = data(users, { act: [["chat_wa", 0, "2026-11-04", 1, 0], ["email", 1, "2026-11-03", 1, 0], ["chat_desk", 2, "2026-11-04", 3, 0]] });
  const r = sinceReset(d, line);
  const joined = Object.fromEntries(r.users.map((u) => [u.id, u.joined]));
  assert.equal(joined.same, ms("2026-11-04T15:34:00+05:30"), "not 4 Nov 00:00");
  assert.equal(joined.earlier, ms("2026-11-03T00:00:00+05:30"), "the earlier day row keeps the right day");
  assert.equal(joined.day, ms("2026-11-04T00:00:00+05:30"), "only the date is known");
});

test("funnel: a step's % is of the last gate step above it, never over 100", () => {
  const t0 = ms("2026-11-01T05:00:00Z");
  // Five sign-ups, four called, two completed and onboarded, both saw jobs; one of them started outreach, none clicked apply.
  const people = [0, 1, 2, 3, 4].map((k) => user({
    id: `p${k}`,
    t: {
      ...(k < 4 ? { call_started: t0 + 60e3 } : {}),
      ...(k < 2 ? { call_completed: t0 + 600e3, onboarded: t0 + 660e3, saw_jobs: t0 + 700e3 } : {}),
      ...(k === 0 ? { outreach_started: t0 + 900e3 } : {}),
    },
  }));
  const rows = Object.fromEntries(funnel(data(people), F, true).rows.map((r) => [r.key, r]));
  assert.equal(rows.call_started.pctPrev, 80);
  assert.equal(rows.call_started.fromKey, "signed_up");
  assert.equal(rows.call_completed.pctPrev, 50);
  assert.equal(rows.outreach_started.pctPrev, 50, "outreach is of Saw jobs (the last gate), not of Apply click (0)");
  assert.equal(rows.outreach_started.fromKey, "saw_jobs");
  assert.ok(Object.values(rows).every((r) => r.pctPrev == null || r.pctPrev <= 100));
  assert.equal(capPct(600), 100);
  assert.equal(capPct(null), null);
});

test("funnel basis: visitor steps chain, sign-ups are of the last of them, a beacon gap is no base and no drop", () => {
  const bar = (key, v, over = {}) => ({ key, anon: false, gate: false, untracked: false, cell: { v, users: [] }, fromKey: null, pctPrev: null, ...over });
  const bars = [
    bar("visited_home", 268, { anon: true }), bar("clicked_join", 73, { anon: true }), bar("saw_signup", 7, { anon: true }),
    bar("signed_up", 40, { gate: true }), bar("call_started", 19, { gate: true }), bar("onboarded", 13, { gate: true }),
    bar("saw_jobs", 10, { gate: true }), bar("apply_click", 2), bar("outreach_started", 8), bar("paid", 0),
  ];
  const drop = funnelBasis(bars, false);
  const by = Object.fromEntries(bars.map((b) => [b.key, b]));
  assert.equal(by.saw_signup.gap, true, "7 saw sign-up but 40 signed up: the beacon misses people");
  assert.equal(by.signed_up.fromKey, "clicked_join", "sign-ups are of Opened Stu, not of the gap");
  assert.equal(by.signed_up.pctPrev, 54.8);
  assert.equal(by.outreach_started.fromKey, "saw_jobs");
  assert.equal(by.outreach_started.pctPrev, 80, "not 400% of Apply click");
  assert.equal(by.paid.fromKey, "saw_jobs");
  assert.equal(drop, "clicked_join", "Visited to Opened Stu, 27.2%, with Paid left out before the first real payment");
  by.paid.cell.v = 0;
  assert.equal(funnelBasis(bars, true), "paid", "once someone has paid, Paid at 0% is the drop");
  // Never over 100%: more sign-ups than tracked visitors.
  const few = [bar("visited_home", 3, { anon: true }), bar("signed_up", 5, { gate: true })];
  funnelBasis(few, false);
  assert.equal(few[0].gap, true);
  assert.equal(few[1].pctPrev, null, "no tracked visitor base at all");
  const ok = [bar("visited_home", 10, { anon: true }), bar("signed_up", 12, { gate: true })];
  ok[0].cell.v = 12;
  funnelBasis(ok, false);
  assert.equal(ok[1].pctPrev, 100);
});

test("paid: someone outside the team paid for real", () => {
  const t = ms("2026-11-04T15:56:00Z");
  assert.equal(paidLive(data([user({ t: { paid: t } })])), true);
  assert.equal(paidLive(data([user({ internal: "staff (admin)", t: { paid: t } })])), false, "a team payment is not the first real one");
  assert.equal(paidLive(data([user({})])), false);
});

test("shared browser: an account on the same visitor id as a team account is internal, along the chain", () => {
  const us = [{ internal: "staff (admin)" }, { internal: null }, { internal: null }, { internal: null }];
  // visitor A: 0 and 1; visitor B: 1 and 2; visitor C: 3 alone.
  assert.equal(markSharedBrowsers(us, [[0, 1], [1, 2], [3]]), 2);
  assert.deepEqual(us.map((u) => u.internal), ["staff (admin)", SHARED_BROWSER, SHARED_BROWSER, null]);
  const alone = [{ internal: null }, { internal: null }];
  assert.equal(markSharedBrowsers(alone, [[0, 1]]), 0, "two students on one browser stay students");
});

test("activity: the WhatsApp LINK code is activity on WhatsApp, not a chat with Stu", () => {
  const d = data([user({ id: "a" })], { act: [["wa_link", 0, "2026-11-01", 1, 0]] });
  const row = (key) => dailyTable(d, F, 1).rows.find((r) => r.def.key === key).total.v;
  assert.equal(row("chats"), 0);
  assert.equal(row("chatters"), 0);
  assert.equal(row("active"), 1);
  assert.deepEqual([...activity(d).days.get(0).get("2026-11-01")], ["whatsapp"]);
});

test("retention: coming back is any activity, as Active students counts it", () => {
  const d = data([user({ id: "a" })], { act: [["email", 0, "2026-11-02", 1, 0]] });
  const [row] = retention(d, F, false);
  assert.equal(row.d.d1.back.v, 1, "an email on day 1 without opening the desk is coming back");
});

test("stickiness and days: only days on or after the count-from line", () => {
  const rows = ["2026-10-30", "2026-11-02", "2026-11-03", "2026-11-04"].map((day) => ({ day }));
  assert.deepEqual(liveDays(rows, ms("2026-11-03T00:00:00+05:30")).map((x) => x.day), ["2026-11-03", "2026-11-04"]);
  assert.equal(liveDays(rows, undefined).length, 4);
});

test("sign-up sources: by channel, mostly only above half, the campaign from the same channel", () => {
  const mk = (id, ch, campaign) => user({ id, ch, touch: campaign ? { source: "ig", medium: "paid", campaign } : null });
  const many = data([mk("a", "meta_paid", "c1"), mk("b", "meta_paid", "c1"), mk("c", "meta_paid", "c1"), mk("d", "search", null)]);
  assert.equal(signupSourceText(many, F, 4, (k) => k.toUpperCase()), ", mostly from META_PAID (3 of 4, all on campaign c1)");
  const split = data([mk("a", "meta_paid", "c1"), mk("b", "search", null), mk("c", "direct", null), mk("d", "not_captured", null)]);
  assert.match(signupSourceText(split, F, 4), /^; the top source is (meta_paid|search|direct) \(1 of 4(, all on campaign c1)?\)$/, "no mostly at one in four");
  assert.equal(signupSourceText(data([mk("a", "not_captured", null)]), F, 1), "", "no source known");
});

test("device and in-app split: the person's own device first, then the source row's", () => {
  assert.equal(splitKey(user({ device: "mobile", touch: { device: "desktop" } }), "device"), "mobile");
  assert.equal(splitKey(user({ device: null, touch: { device: "tablet" } }), "device"), "tablet");
  assert.equal(splitKey(user({}), "device"), "unknown");
  assert.equal(splitKey(user({ inapp: "instagram" }), "inapp"), "instagram");
  assert.equal(splitKey(user({}), "inapp"), "unknown");
});

// SETTLE-REVENUE (14 Nov 2026, the owner: "dont count the autopay cash until it hits bank account"). Prod's 14 Nov in
// fixture form: a pack paid 01:43 IST, autopay charged 10:36 (₹299) and 11:03 (₹699), neither settled yet. The loader
// writes an autopay charge as "pay" with no money once settlements are read, "pay_wait" until Razorpay settles it, and
// "pay_cash" on the IST day it was settled.
const settleDay = () => {
  const users = [
    user({ id: "pack", t: { paid: ms("2026-11-13T20:13:00Z") } }),
    user({ id: "auto299", t: { paid: ms("2026-11-14T05:06:00Z") } }),
    user({ id: "auto699", t: { paid: ms("2026-11-14T05:33:00Z") } }),
  ];
  const act = [
    ["pay", 0, "2026-11-14", 1, 119900],
    ["pay", 1, "2026-11-14", 1, 0], ["pay_wait", 1, "2026-11-14", 1, 29900],
    ["pay", 2, "2026-11-14", 1, 0], ["pay_wait", 2, "2026-11-14", 1, 69900],
  ];
  return { users, act };
};
const D14 = { ...F, start: "2026-11-14", end: "2026-11-14" };

test("SETTLE-REVENUE: autopay is paid on the day charged, revenue only once in the bank", () => {
  const { users, act } = settleDay();
  const d = data(users, { act, settleLive: true });
  const row = (key) => dailyTable(d, D14, 1).rows.find((r) => r.def.key === key).total;
  assert.equal(row("paid_users").v, 3, "Paid counts the autopay people on the day charged");
  assert.equal(row("revenue").v, 119900, "only the pack is revenue: ₹1,199");
  assert.deepEqual(row("revenue").users, [0], "the people behind revenue are the ones whose money it holds");
  assert.equal(row("autopay_waiting").v, 99800, "₹998 autopay not in the bank yet");
  assert.deepEqual(row("autopay_waiting").users, [1, 2]);
  assert.equal(row("autopay_waiting").na, false);
  assert.equal(funnel(d, { ...D14, start: "2026-11-01" }, false).rows.find((r) => r.key === "paid").cell.v, 3, "the Paid step is unchanged");
  assert.match(DAILY_METRICS.find((m) => m.key === "revenue").source(d), /career_settlements\.settled_at/);
});

test("SETTLE-REVENUE: a settled charge counts on the IST day it reached the bank, and no other", () => {
  const { users, act } = settleDay();
  // ₹299 settled 16 Nov 00:10 IST (15 Nov 18:40 UTC): it leaves "not in the bank yet" and lands on 16 Nov.
  const later = act.filter((a) => !(a[0] === "pay_wait" && a[1] === 1)).concat([["pay_cash", 1, "2026-11-16", 1, 29900]]);
  const d = data(users, { act: later, settleLive: true });
  const tb = dailyTable(d, { ...F, start: "2026-11-14", end: "2026-11-16" }, 1);
  const cells = (key) => tb.rows.find((r) => r.def.key === key).cells.map((c) => c.v);
  assert.deepEqual(cells("revenue"), [119900, 0, 29900]);
  assert.deepEqual(cells("paid_users"), [3, 0, 0], "the bank day is not a second payment");
  assert.deepEqual(cells("autopay_waiting"), [69900, 0, 0]);
  assert.equal(activity(d).days.has(1), false, "money reaching the bank is not activity");
  // Sources (and the Overview's top sources) add the same money: the pack and the settled ₹299.
  const s = sources(d, { ...F, start: "2026-11-01", end: "2026-11-16" }, "channel");
  assert.equal(s.rows[0].revenue.v, 149800);
  assert.deepEqual(s.rows[0].revenue.users, [0, 1]);
});

test("SETTLE-REVENUE: with no career_settlements here, autopay counts on the day charged, as before", () => {
  const { users } = settleDay();
  const act = [["pay", 0, "2026-11-14", 1, 119900], ["pay", 1, "2026-11-14", 1, 29900], ["pay", 2, "2026-11-14", 1, 69900]];
  const d = data(users, { act });
  const row = (key) => dailyTable(d, D14, 1).rows.find((r) => r.def.key === key).total;
  assert.equal(row("revenue").v, 219700);
  assert.equal(row("paid_users").v, 3);
  assert.equal(row("autopay_waiting").na, true, "not read here, not zero");
  assert.doesNotMatch(DAILY_METRICS.find((m) => m.key === "revenue").source(d), /settled_at/);
});
