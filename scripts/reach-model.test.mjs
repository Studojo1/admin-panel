// node --test scripts/reach-model.test.mjs
// REACH-PAGE (15 Nov 2026): the /reach rules (app/lib/reach/model.ts): reached twice in 7 days, the headline splits
// (linked or not, onboarded or not), internal accounts left out unless asked, what is stopping a student, the 14 day
// trend by link time and lane, and Meta's days. Every person here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  FLOOR_START, PENDING_MS, REASONS, TIER_LIMIT, TREND_DAYS, addDays, buildReach, dayEnd, inboundText, istDay, istText, linkActiveAt,
  metaCode, ratio, reasonOf, summaryOf,
} from "../app/lib/reach/model.ts";

const at = (day, hhmm = "10:00") => Date.parse(`${day}T${hhmm}:00+05:30`);
const NOW = at("2026-11-16", "12:00");
const H = 3_600_000;
const D = 24 * H;

const student = (id, over = {}) => ({ id, name: `Person ${id}`, email: `${id}@example.test`, internal: null, onboarded: true, ...over });
const link = (user, over = {}) => ({ user, created: at("2026-11-04"), unlinked: null, active: true, digestOn: true, lastInbound: null, ...over });
const dl = (user, ms, lane = "other") => ({ user, at: ms, lane });
const input = (over = {}) => ({
  now: NOW, internal: false, students: [], links: [], deliveries: [], lastDelivered: {}, attempts: [], inbound: [], picks: [],
  meta: { students24h: 0, days: [] }, ...over,
});

test("helpers: IST days, the day's end, ratios, text", () => {
  assert.equal(istDay(at("2026-11-16", "00:10")), "2026-11-16");
  assert.equal(istDay(at("2026-11-15", "23:59")), "2026-11-15");
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
  assert.equal(dayEnd("2026-11-15"), at("2026-11-16", "00:00"));
  assert.deepEqual(ratio(1, 3), { n: 1, of: 3, pct: 33 });
  assert.deepEqual(ratio(0, 0), { n: 0, of: 0, pct: null }, "nobody: no %");
  assert.equal(istText(at("2026-11-15", "09:05")), "15 Nov 09:05");
  assert.equal(FLOOR_START, at("2026-11-15", "18:38"));
  assert.equal(TIER_LIMIT, 250);
});

test("Meta's codes: the code when given, else read from the error text", () => {
  assert.equal(metaCode("131049", null), "131049");
  assert.equal(metaCode("", "This message was not delivered to maintain healthy ecosystem engagement."), "131049");
  assert.equal(metaCode(null, "frequency_capped"), "131049");
  assert.equal(metaCode(null, "Spam Rate limit hit"), "131048");
  assert.equal(metaCode(null, "spam_limited"), "131048");
  assert.equal(metaCode(null, "provider_error"), null);
  assert.equal(metaCode("130472", "User's number is part of an experiment"), "130472");
});

test("reached twice: 2 or more delivered in the 7 days to now, for a linked student only", () => {
  const r = buildReach(input({
    students: [student("a"), student("b"), student("c"), student("d")],
    links: [link("a"), link("b"), link("c")],
    deliveries: [
      dl("a", NOW - 1 * D), dl("a", NOW - 6 * D), // 2 in 7 days
      dl("b", NOW - 2 * D), dl("b", NOW - 7 * D - H), // one is 7 days and an hour old: 1
      dl("d", NOW - 1 * D), dl("d", NOW - 2 * D), // d has no link: not reached, whatever the ledger says
    ],
  }));
  assert.equal(r.headline.all.n, 1);
  assert.equal(r.headline.all.of, 4);
  assert.equal(r.headline.all.pct, 25);
  assert.deepEqual(r.headline.linked, { n: 1, of: 3, pct: 33 });
  assert.deepEqual(r.headline.notLinked, { n: 0, of: 1, pct: 0 });
  assert.deepEqual(r.counts, { students: 4, linked: 3, zero: 1, one: 1, twoPlus: 1, notLinked: 1 });
  assert.deepEqual(r.lists.zero.map((p) => p.id), ["c"]);
  assert.deepEqual(r.lists.one.map((p) => p.id), ["b"]);
  assert.deepEqual(r.lists.notLinked.map((p) => p.id), ["d"]);
  assert.equal(r.lists.notLinked[0].reason, "not_linked");
});

test("a delivery exactly 7 days old is out; one a minute younger is in (the product's > now - 7 days)", () => {
  const r = buildReach(input({
    students: [student("a"), student("b")], links: [link("a"), link("b")],
    deliveries: [dl("a", NOW - 7 * D), dl("a", NOW - H), dl("b", NOW - 7 * D + 60_000), dl("b", NOW - H)],
  }));
  assert.equal(r.lists.one[0].id, "a");
  assert.equal(r.counts.twoPlus, 1);
});

test("an unlinked link does not count as linked now; the active one does", () => {
  const r = buildReach(input({
    students: [student("a"), student("b")],
    links: [link("a", { active: false, unlinked: NOW - D }), link("b", { active: false, unlinked: NOW - D }), link("b", { created: NOW - 2 * H })],
    deliveries: [dl("a", NOW - 2 * D), dl("a", NOW - 3 * D)],
  }));
  assert.equal(r.counts.linked, 1);
  assert.equal(r.lists.notLinked[0].id, "a", "unlinked a day ago: not linked now, deliveries before do not count");
  assert.equal(r.lists.zero[0].linked, NOW - 2 * H, "the active link's date");
});

test("onboarded split", () => {
  const r = buildReach(input({
    students: [student("a"), student("b", { onboarded: false }), student("c", { onboarded: false })],
    links: [link("a"), link("b")],
    deliveries: [dl("a", NOW - D), dl("a", NOW - 2 * D), dl("b", NOW - D), dl("b", NOW - 2 * D)],
  }));
  assert.deepEqual(r.headline.onboarded, { n: 1, of: 1, pct: 100 });
  assert.deepEqual(r.headline.notOnboarded, { n: 1, of: 2, pct: 50 });
});

test("internal accounts are out unless asked, from every count, list and day", () => {
  const base = {
    students: [student("a"), student("t", { internal: "studojo.com" })],
    links: [link("a"), link("t")],
    deliveries: [dl("t", NOW - D), dl("t", NOW - 2 * D), dl("a", NOW - D)],
  };
  const out = buildReach(input(base));
  assert.equal(out.counts.students, 1);
  assert.equal(out.counts.twoPlus, 0);
  assert.equal(out.trend.at(-1).linked, 1);
  assert.equal(out.trend.reduce((n, d) => n + d.other, 0), 1, "the internal account's deliveries are not in the bars");
  const inc = buildReach(input({ ...base, internal: true }));
  assert.equal(inc.counts.students, 2);
  assert.equal(inc.counts.twoPlus, 1);
  assert.equal(inc.trend.reduce((n, d) => n + d.other, 0), 3);
});

const A = (over = {}) => ({ user: "x", at: NOW - 5 * H, failed: false, delivered: false, code: null, error: null, what: "morning_picks_cards", tries: 1, failedTries: 0, ...over });
const S = (over = {}) => ({ linked: true, digestOn: true, attempt: null, picks: true, onboarded: true, ...over });

test("what is stopping them, in order", () => {
  assert.equal(reasonOf(S({ linked: false }), NOW).reason, "not_linked");
  assert.equal(reasonOf(S({ digestOn: false, attempt: A({ failed: true, code: "131049" }) }), NOW).reason, "stop", "STOP first");
  assert.equal(reasonOf(S({ attempt: A({ failed: true, code: "131049", failedTries: 1 }) }), NOW).reason, "cap");
  assert.equal(reasonOf(S({ attempt: A({ failed: true, error: "This message was not delivered to maintain healthy ecosystem engagement." }) }), NOW).reason, "cap");
  assert.equal(reasonOf(S({ attempt: A({ failed: true, code: "131048" }) }), NOW).reason, "spam");
  assert.equal(reasonOf(S({ attempt: A({ code: "131048" }) }), NOW).reason, "spam", "a Meta code on the ledger alone is a failure");
  assert.equal(reasonOf(S({ attempt: A({ failed: true, error: "provider_error" }) }), NOW).reason, "undelivered");
  assert.equal(reasonOf(S({ attempt: A() }), NOW).reason, "undelivered", "5 hours and no receipt");
  assert.equal(reasonOf(S({ attempt: A({ at: NOW - PENDING_MS + 60_000 }) }), NOW).reason, "pending");
  assert.equal(reasonOf(S({ attempt: A({ delivered: true }), picks: false }), NOW).reason, "no_picks", "last try delivered: then the picks");
  assert.equal(reasonOf(S({ picks: false, onboarded: false }), NOW).detail, "Not onboarded, so no picks");
  assert.equal(reasonOf(S({ attempt: A({ delivered: true }) }), NOW).reason, "not_tried");
  assert.equal(reasonOf(S(), NOW).detail, "No try in 7 days");
  const d = reasonOf(S({ attempt: A({ failed: true, code: "131049", tries: 3, failedTries: 2, at: at("2026-11-15", "09:12") }) }), NOW).detail;
  assert.equal(d, "Last try 15 Nov 09:12 (morning_picks_cards) failed 131049. 3 tries in 7 days, 2 failed");
  for (const r of REASONS) assert.ok(r.label.length <= 22, `short label: ${r.label}`);
  for (const r of REASONS) assert.ok(!/[\u2013\u2014]/.test(r.label + r.note), "no en or em dashes");
});

test("the lists carry the row's facts and group by reason", () => {
  const r = buildReach(input({
    students: [student("a"), student("b"), student("c", { onboarded: false })],
    links: [link("a", { lastInbound: NOW - 2 * H }), link("b", { created: at("2026-11-10"), lastInbound: NOW - 30 * H }), link("c")],
    deliveries: [dl("b", NOW - D)],
    lastDelivered: { a: at("2026-11-01"), b: NOW - D },
    attempts: [A({ user: "a", failed: true, code: "131049" })],
    inbound: [{ user: "a", at: NOW - 2 * H, kind: "text", body: "  hi   there\nStu " }, { user: "b", at: NOW - 30 * H, kind: "media", body: null }],
    picks: ["a", "b"],
  }));
  const [a, c] = r.lists.zero;
  assert.equal(a.id, "a");
  assert.equal(a.reason, "cap");
  assert.equal(a.inWindow, true);
  assert.equal(a.lastIn.text, "hi there Stu");
  assert.equal(a.lastDelivered, at("2026-11-01"), "last delivered any time");
  assert.equal(c.id, "c");
  assert.equal(c.reason, "no_picks");
  const [b] = r.lists.one;
  assert.equal(b.inWindow, false, "30 hours ago: window closed");
  assert.equal(b.lastIn.text, "(a photo or file)");
  assert.equal(b.reason, "not_tried");
  assert.deepEqual(r.reasons.find((x) => x.key === "cap"), { key: "cap", label: "Meta cap 131049", zero: 1, one: 0, notLinked: 0 });
});

test("inbound text is one short line", () => {
  assert.equal(inboundText({ user: "x", at: 0, kind: "text", body: "a".repeat(100) }).length, 80);
  assert.equal(inboundText({ user: "x", at: 0, kind: "button", body: "" }), "(button)");
});

test("the trend: 14 IST days, linked at each day's end, 2 in the 7 days to it, deliveries by lane", () => {
  const r = buildReach(input({
    students: [student("a"), student("b"), student("c")],
    links: [
      link("a", { created: at("2026-11-03") }),
      link("b", { created: at("2026-11-12") }),
      link("c", { created: at("2026-11-05"), active: false, unlinked: at("2026-11-10") }),
    ],
    deliveries: [
      dl("a", at("2026-11-08")), dl("a", at("2026-11-09")), // a: 2 from 9 Nov to 14 Nov (the 8th leaves on the 15th)
      dl("c", at("2026-11-06")), dl("c", at("2026-11-07")), // c: 2 while linked, then unlinked on the 10th
      dl("b", at("2026-11-15", "19:00"), "floor"), dl("b", at("2026-11-16", "09:00"), "catchup"),
    ],
  }));
  assert.equal(r.trend.length, TREND_DAYS);
  assert.equal(r.trend[0].day, "2026-11-03");
  const day = (k) => r.trend.find((d) => d.day === k);
  assert.equal(r.trend.at(-1).day, "2026-11-16");
  assert.equal(r.trend.at(-1).soFar, true);
  assert.deepEqual([day("2026-11-03").linked, day("2026-11-03").reached], [1, 0]);
  assert.deepEqual([day("2026-11-07").linked, day("2026-11-07").reached], [2, 1], "c reached on the 7th");
  assert.deepEqual([day("2026-11-09").linked, day("2026-11-09").reached, day("2026-11-09").pct], [2, 2, 100]);
  assert.deepEqual([day("2026-11-10").linked, day("2026-11-10").reached], [1, 1], "c unlinked on the 10th");
  assert.deepEqual([day("2026-11-14").reached, day("2026-11-15").reached], [1, 0], "a's 8 Nov delivery leaves at the end of the 15th");
  assert.deepEqual([day("2026-11-16").linked, day("2026-11-16").reached], [2, 1], "b: floor + catch-up by noon on the 16th");
  assert.deepEqual([day("2026-11-15").floor, day("2026-11-16").catchup, day("2026-11-08").other], [1, 1, 1]);
});

test("today's point counts to now, not the day's end", () => {
  const r = buildReach(input({ students: [student("a")], links: [link("a")], deliveries: [dl("a", NOW - H), dl("a", NOW + H)] }));
  assert.equal(r.trend.at(-1).reached, 0, "a delivery after now is not counted");
  assert.equal(r.trend.at(-1).other, 1);
});

test("linkActiveAt", () => {
  const l = link("a", { created: 100, active: false, unlinked: 200 });
  assert.equal(linkActiveAt(l, 50), false);
  assert.equal(linkActiveAt(l, 150), true);
  assert.equal(linkActiveAt(l, 250), false);
  assert.equal(linkActiveAt({ ...l, unlinked: null }, 150), false, "unlinked with no time: not active");
  assert.equal(linkActiveAt({ ...l, active: true }, 250), true);
});

test("Meta's days: 14, missing days zero, the 24 hour count as given; and the Overview summary", () => {
  const r = buildReach(input({
    students: [student("a")], links: [link("a")],
    meta: { students24h: 212, days: [{ day: "2026-11-15", students: 199, spam: 12, cap: 7 }, { day: "2026-10-01", students: 5, spam: 0, cap: 0 }] },
  }));
  assert.equal(r.meta.days.length, TREND_DAYS);
  assert.equal(r.meta.days[0].day, "2026-11-03");
  assert.deepEqual(r.meta.days.find((d) => d.day === "2026-11-15"), { day: "2026-11-15", students: 199, spam: 12, cap: 7 });
  assert.deepEqual(r.meta.days.find((d) => d.day === "2026-11-04"), { day: "2026-11-04", students: 0, spam: 0, cap: 0 });
  assert.equal(r.meta.students24h, 212);
  assert.equal(r.meta.limit, 250);
  assert.deepEqual(summaryOf(r), { all: r.headline.all, linked: r.headline.linked, zero: 1, one: 0, notLinked: 0 });
});
