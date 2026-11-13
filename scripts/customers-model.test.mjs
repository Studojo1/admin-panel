// node --test scripts/customers-model.test.mjs
// CUSTOMERS (13 Nov 2026): the /customers page's rules (app/lib/customers/model.ts): the rank, thanks and complaints
// in a customer's own messages, the tags, the views, the search and order, and pasted links. Every person here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NO_SIGNALS, cleanLink, filterCustomers, inView, matchesText, scoreOf, tagsOf, toneCounts, toneOf, waLink,
} from "../app/lib/customers/model.ts";

const NOW = Date.parse("2026-11-13T12:00:00Z");
const DAY = 86_400_000;
let n = 0;
const cust = (over = {}, s = {}) => {
  const sig = { ...NO_SIGNALS, lastSeen: NOW - DAY, ...s };
  return {
    id: `u${++n}`, name: "Test Person", email: "test@example.com", phone: "+919900000000", whatsapp: true, signedUp: NOW - 10 * DAY,
    internal: null, headline: null, roles: [], cities: [], remote: false, star: false, note: "", picks: 0, picksOpen: 0, hired: false,
    ...over, s: sig, score: scoreOf(sig),
  };
};

test("a hiring manager saying yes outranks paying, which outranks plain use", () => {
  const yes = scoreOf({ ...NO_SIGNALS, posReplies: 1, replies: 1 });
  const paid = scoreOf({ ...NO_SIGNALS, paid: "pack", sent: 20 });
  const busy = scoreOf({ ...NO_SIGNALS, sent: 40, days21: 3 });
  assert.ok(yes > paid && paid > busy, `${yes} > ${paid} > ${busy}`);
});

test("complaints and a refund ask pull the rank down", () => {
  const base = { ...NO_SIGNALS, paid: "autopay", days21: 3 };
  assert.ok(scoreOf({ ...base, gripes: 1 }) < scoreOf(base));
  assert.ok(scoreOf({ ...base, refund: true }) < scoreOf({ ...base, gripes: 1 }));
});

test("thanks and complaints in short messages; a complaint wins; pasted drafts and the app's wrapper are not read", () => {
  assert.equal(toneOf("Thank you"), "praise");
  assert.equal(toneOf("this is amazing, love it"), "praise");
  assert.equal(toneOf("Not working. Thanks"), "gripe");
  assert.equal(toneOf("I am not satisified with this all - please process with refund"), "gripe");
  assert.equal(toneOf("Can you find more roles in Pune?"), null);
  assert.equal(toneOf("Subject: Analyst at Acme\nHi Sam, thank you for your time"), null);
  assert.equal(toneOf("(About my email to Sam at Acme ...) thanks"), null);
  assert.equal(toneOf(`Hi Sam, ${"I built a dashboard. ".repeat(20)} Thank you`), null);
  assert.equal(toneOf("great"), "praise");
  assert.equal(toneOf("ingratiate"), null, "a word inside another word does not count");
});

test("a WhatsApp message mirrored into chat on the same day counts once; a refund ask is caught", () => {
  const t = NOW;
  const c = toneCounts([
    { text: "Thanks", at: t }, { text: "thanks ", at: t + 1000 },
    { text: "Thanks", at: t + 2 * DAY },
    { text: "please refund me", at: t },
  ]);
  assert.deepEqual(c, { praise: 2, gripes: 1, refund: true });
});

test("tags", () => {
  const s = { ...NO_SIGNALS, posReplies: 1, replies: 2, paid: "pack", praise: 1, lastSeen: NOW - DAY };
  assert.deepEqual(tagsOf(s, NOW - 10 * DAY, NOW), ["yes", "paid", "thanked", "active"]);
  assert.deepEqual(tagsOf({ ...NO_SIGNALS, replies: 1, gripes: 1, praise: 2, lastSeen: NOW - 9 * DAY }, NOW - DAY, NOW), ["replied", "unhappy", "new", "quiet"]);
  assert.deepEqual(tagsOf({ ...NO_SIGNALS, refund: true, gripes: 1 }, NOW - 10 * DAY, NOW), ["refund", "quiet"]);
});

test("views", () => {
  assert.ok(inView(cust({ star: true }), "starred", NOW));
  assert.ok(!inView(cust(), "starred", NOW));
  assert.ok(inView(cust({}, { posReplies: 1 }), "yes", NOW));
  assert.ok(inView(cust({}, { paid: "order" }), "paid", NOW));
  assert.ok(!inView(cust({}, { lastSeen: NOW - 8 * DAY }), "active", NOW));
  assert.ok(inView(cust({ picks: 2 }), "picks", NOW));
  assert.ok(inView(cust({}, { refund: true }), "unhappy", NOW));
});

test("search: every word, across name, email, phone, headline, roles, cities and the note", () => {
  const c = cust({ name: "Asha Rao", roles: ["Data Analyst"], cities: ["Bengaluru"], note: "strong SQL" });
  assert.ok(matchesText(c, "data bengaluru"));
  assert.ok(matchesText(c, "ASHA sql"));
  assert.ok(matchesText(c, "9900000000"));
  assert.ok(!matchesText(c, "data pune"));
  assert.ok(matchesText(c, "  "));
});

test("order: starred first, then the rank; or last active; or newest", () => {
  const a = cust({ name: "A" }, { posReplies: 1 });
  const b = cust({ name: "B", star: true });
  const c2 = cust({ name: "C", signedUp: NOW - DAY }, { lastSeen: NOW - 60_000 });
  const all = [a, b, c2];
  assert.deepEqual(filterCustomers(all, { view: "all", q: "", sort: "rank" }, NOW).map((x) => x.name), ["B", "A", "C"]);
  assert.deepEqual(filterCustomers(all, { view: "all", q: "", sort: "recent" }, NOW).map((x) => x.name)[0], "C");
  assert.deepEqual(filterCustomers(all, { view: "all", q: "", sort: "new" }, NOW).map((x) => x.name)[0], "C");
  assert.deepEqual(filterCustomers(all, { view: "yes", q: "", sort: "rank" }, NOW).map((x) => x.name), ["A"]);
});

test("pasted links: web addresses only", () => {
  assert.equal(cleanLink("acme.com/jobs/1"), "https://acme.com/jobs/1");
  assert.equal(cleanLink("https://www.linkedin.com/jobs/view/1"), "https://www.linkedin.com/jobs/view/1");
  assert.equal(cleanLink("javascript:alert(1)"), "");
  assert.equal(cleanLink("not a link"), "");
  assert.equal(cleanLink(""), "");
  assert.equal(waLink("+91 99000 00000"), "https://wa.me/919900000000");
  assert.equal(waLink("123"), null);
});
