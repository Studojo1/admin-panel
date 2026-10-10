// node --test scripts/health-watch.test.mjs
// Imports the TypeScript source directly: Node 22.18+ strips the types itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { discoveryState, nothingSentReason } from "../app/lib/health-watch.ts";

const OCT_3 = "2026-10-03T18:20:00Z";
const OCT_4 = "2026-10-04T05:10:00Z";
const OCT_9 = "2026-10-09T11:45:00Z";

// A paying customer with nothing at all: no campaign, no mailbox.
const facts = (over = {}) => ({
  running: false, pausedGmailInvalid: false, paused: false, pauseReason: null,
  draft: false, campaigns: 0, mailbox: false, ...over,
});

test("nothing stuck is ok, whatever the last success says", () => {
  assert.equal(discoveryState(0, null, OCT_9), "ok");
  assert.equal(discoveryState(0, null, null), "ok");
});

test("the October outage reads as failing: 18 stuck since 4 Oct, last success 3 Oct", () => {
  assert.equal(discoveryState(18, OCT_4, OCT_3), "failing");
});

test("three or more stuck is failing even when runs have succeeded since", () => {
  assert.equal(discoveryState(3, OCT_4, OCT_9), "failing");
  assert.equal(discoveryState(2, OCT_4, OCT_9), "watch");
});

test("one or two stuck is watch only when a run has succeeded since the oldest began", () => {
  assert.equal(discoveryState(1, OCT_4, OCT_9), "watch");
  assert.equal(discoveryState(1, OCT_4, OCT_3), "failing");
  assert.equal(discoveryState(2, OCT_4, OCT_4), "failing", "a success at the same moment is not since");
});

test("stuck with no success on record, or no start time to compare, is failing", () => {
  assert.equal(discoveryState(1, OCT_4, null), "failing");
  assert.equal(discoveryState(1, null, OCT_9), "failing");
  assert.equal(discoveryState(1, "not a date", OCT_9), "failing");
});

test("no campaign: the reason says whether Gmail was ever connected", () => {
  assert.equal(nothingSentReason(facts()), "Never connected Gmail");
  assert.equal(nothingSentReason(facts({ mailbox: true })), "Gmail connected, never launched");
});

test("a running campaign wins over everything else", () => {
  const all = facts({ running: true, pausedGmailInvalid: true, paused: true, pauseReason: "user", draft: true, campaigns: 4, mailbox: true });
  assert.equal(nothingSentReason(all), "Campaign running, nothing sent yet");
});

test("a paused campaign on a mailbox that lost Gmail says to reconnect, before any stored reason", () => {
  const f = facts({ pausedGmailInvalid: true, paused: true, pauseReason: "user", draft: true, campaigns: 2, mailbox: true });
  assert.equal(nothingSentReason(f), "Campaign paused: Gmail needs reconnecting");
});

test("a paused campaign shows its reason in brackets only when there is one", () => {
  const paused = (pauseReason) => nothingSentReason(facts({ paused: true, pauseReason, campaigns: 1, mailbox: true }));
  assert.equal(paused(null), "Campaign paused");
  assert.equal(paused("  "), "Campaign paused");
  assert.equal(paused("gmail_auth"), "Campaign paused (Gmail access was lost)");
  assert.equal(paused("gmail_disconnected"), "Campaign paused (Gmail was disconnected)");
  assert.equal(paused("user"), "Campaign paused (by the student)");
  assert.equal(paused("admin"), "Campaign paused (by the team)");
  assert.equal(paused("daily_limit_reached"), "Campaign paused (daily limit reached)", "an unknown code is shown as stored");
  assert.equal(paused("constructor"), "Campaign paused (constructor)", "not looked up on Object.prototype");
});

test("paused beats draft, draft beats the no-campaign reasons", () => {
  assert.equal(nothingSentReason(facts({ paused: true, draft: true, campaigns: 2 })), "Campaign paused");
  assert.equal(nothingSentReason(facts({ draft: true, campaigns: 1 })), "Campaign created, never launched");
  assert.equal(nothingSentReason(facts({ draft: true, campaigns: 1, mailbox: true })), "Campaign created, never launched");
});

test("only finished or cancelled campaigns falls through to No campaign", () => {
  assert.equal(nothingSentReason(facts({ campaigns: 2, mailbox: true })), "No campaign");
  assert.equal(nothingSentReason(facts({ campaigns: 1 })), "No campaign");
});

test("every reason is plain words: no dashes, no underscores", () => {
  const cases = [
    facts(), facts({ mailbox: true }), facts({ running: true, campaigns: 1 }),
    facts({ pausedGmailInvalid: true, paused: true, campaigns: 1 }), facts({ draft: true, campaigns: 1 }), facts({ campaigns: 1 }),
    ...[null, "gmail_auth", "gmail_disconnected", "user", "admin"].map((pauseReason) => facts({ paused: true, pauseReason, campaigns: 1 })),
  ];
  // En dash, em dash, underscore. Built from code points so this file holds no dash itself.
  const banned = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}_]`);
  for (const f of cases) assert.doesNotMatch(nothingSentReason(f), banned);
});
