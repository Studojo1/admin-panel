// node --test scripts/stu-auditor.test.mjs
// The Stu Auditor's rules (app/lib/stu/auditor.ts): the plain words for each
// failure, which ones are ours (Broke) and which may be the student's (Check),
// the IST window the server reads, and the counts on the page.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AUDIT_GROUPS, auditWindow, autopayWords, buildWords, byReason, callEndWords, callFailedWords, inRange, itemWords, mailWords, maskNumber,
  orderWords, runWords, sinceYesterday, tally, ticketWords, toolWords, waWords,
} from "../app/lib/stu/auditor.ts";

const ms = (iso) => Date.parse(iso);
const row = (over = {}) => ({
  id: "x:1", group: "call", kind: "call_failed", code: "mic_denied", at: ms("2026-11-04T10:00:00+05:30"), user: "u1",
  email: "a@x.com", name: "A", internal: null, reason: "r", level: "fail", detail: [], ...over,
});

test("the window covers the range and yesterday and today, in IST", () => {
  const w = auditWindow("2026-11-04", "2026-11-04", "2026-11-04");
  assert.equal(w.from, "2026-11-03T00:00:00+05:30", "reaches back to yesterday for the top line");
  assert.equal(w.to, "2026-11-05T00:00:00+05:30");
  assert.equal(w.sinceFrom, ms("2026-11-03T00:00:00+05:30"));
  const old = auditWindow("2026-10-01", "2026-10-07", "2026-11-04");
  assert.equal(old.from, "2026-10-01T00:00:00+05:30");
  assert.equal(old.to, "2026-11-05T00:00:00+05:30", "an old range still reads up to today for the top line");
});

test("a row is in the range by its IST day: 23:59 IST belongs to that day, 00:00 to the next", () => {
  assert.ok(inRange(row({ at: ms("2026-11-04T23:59:00+05:30") }), "2026-11-04", "2026-11-04"));
  assert.ok(!inRange(row({ at: ms("2026-11-05T00:00:00+05:30") }), "2026-11-04", "2026-11-04"));
});

test("call failures in plain words, and an unknown reason still says what came", () => {
  assert.match(callFailedWords("mic_denied"), /Mic blocked/);
  assert.match(callFailedWords("no_network"), /network/);
  assert.equal(callFailedWords("weird"), "Call failed (weird)");
  assert.equal(callFailedWords(""), "Call failed (no reason sent)");
  assert.match(callEndWords("ended", "unfinished"), /before the call was finished/);
  assert.match(callEndWords("ended", "something_new"), /something_new/);
  assert.equal(callEndWords("failed", null), "The call failed to start");
  // ADMIN-FIX (5 Nov 2026): a dropped line is named as the Overview's Calls card names it, with what it cost.
  assert.equal(callEndWords("ended", "no_resume", true), "The connection dropped during the call, so no resume was read");
  assert.match(callEndWords("ended", null, true), /^The connection dropped during the call$/);
});

test("a resume build call counts when it made no resume, never while it is still on", () => {
  const b = (o) => buildWords({ status: "ended", error: null, duration_s: 77, produced: false, ageMs: 10 * 3_600_000, ...o });
  assert.match(b({ error: "unfinished" }), /ended unfinished after 1 min 17 s, no resume made/);
  assert.match(b({}), /no resume was saved/);
  assert.equal(b({ status: "finished", produced: true }), null, "it made one: not a failure");
  assert.equal(b({ status: "live", ageMs: 5 * 60_000 }), null, "on right now");
  assert.match(b({ status: "live" }), /never closed/);
  assert.match(b({ status: "failed", error: "token" }), /failed to start \(token\)/);
});

test("tool errors: our side breaks, wrong arguments are Stu's mistake", () => {
  const ours = toolWords("edit_email", "Error: the tool failed on our side. Tell the student plainly and suggest trying again.");
  assert.equal(ours.level, "fail");
  assert.equal(ours.reason, "edit_email failed on our side: the tool failed on our side");
  const args = toolWords("remember", "Error: text must be at most 300 characters. Fix the arguments and try again.");
  assert.equal(args.level, "warn");
  assert.equal(args.reason, "Stu used remember wrong: text must be at most 300 characters");
  assert.equal(args.code, "remember: arguments");
  assert.equal(toolWords("update_preferences", "Error: that took too long, so I stopped waiting for it.").level, "fail");
});

test("Stu's reply errors", () => {
  assert.equal(runWords("error", "stopped without finishing"), "Stu's reply stopped without finishing");
  assert.match(runWords("running", null), /never finished/);
  assert.equal(runWords("error", "boom"), "Stu's reply failed: boom");
});

test("emails, orders and autopay in plain words", () => {
  assert.match(mailWords("wrong_password"), /app password/);
  assert.equal(mailWords("odd"), "The email did not send (odd)");
  assert.equal(mailWords(null), "The email did not send (no reason saved)");
  assert.equal(itemWords("pack:100"), "100 email pack");
  assert.equal(orderWords({ status: "created", item: "pack:100", amount_paise: 119900, failed_reason: null }), "Opened checkout for 100 email pack (₹1,199), never paid");
  assert.equal(orderWords({ status: "failed", item: "pack:250", amount_paise: 249900, failed_reason: "card declined" }), "Payment failed for 250 email pack (₹2,499): card declined");
  assert.match(autopayWords("halted", "month"), /^The monthly autopay halted/);
  assert.match(autopayWords("pending", "month"), /retrying/);
  assert.match(autopayWords("created", null), /never authorised/);
});

test("WhatsApp: Meta's codes, held, refused turns and link codes", () => {
  const w = (o) => waWords({ direction: "out", status: "failed", error_code: null, error: null, refused: null, link: null, ...o });
  assert.match(w({ error_code: "131047" }).reason, /24 hours/);
  assert.equal(w({ error_code: "131047" }).kind, "wa_failed");
  assert.match(w({ error: "paused" }).reason, /pause/);
  assert.equal(w({ status: "held" }).level, "warn");
  assert.equal(w({ status: "ok", refused: "restarting" }).kind, "wa_refused");
  const link = waWords({ direction: "in", status: "done", error_code: null, error: null, refused: null, link: "expired" });
  assert.equal(link.kind, "wa_link");
  assert.match(link.reason, /expired/);
  assert.equal(waWords({ direction: "in", status: "done", error_code: null, error: null, refused: null, link: "verified" }).level, "warn");
  assert.equal(maskNumber("+91 98765 43210"), "…3210", "never the whole number");
});

test("tickets read as what the student said", () => {
  assert.equal(ticketWords("bug", "Resume page blank", null), "Something is broken: Resume page blank");
  assert.equal(ticketWords("website_broken", null, "the  button\n does nothing"), "Website broken: the button does nothing", "spaces and new lines fold");
  assert.equal(ticketWords("bug", null, null), "Something is broken");
});

test("counts: people are distinct, a row with nobody counts once, reasons biggest first", () => {
  const rows = [
    row({ id: "a", user: "u1" }), row({ id: "b", user: "u1" }), row({ id: "c", user: "u2", level: "warn" }), row({ id: "d", user: null }),
    row({ id: "e", group: "chat", code: "edit_email: ours", reason: "edit" }),
  ];
  assert.deepEqual(tally(rows), { n: 5, people: 3, fail: 4 }, "u1 twice and again in chat, u2, and the row with nobody");
  const r = byReason(rows);
  assert.equal(r[0].code, "mic_denied");
  assert.equal(r[0].rows.length, 4);
  assert.equal(r[0].people, 3);
  assert.equal(r[1].group, "chat");
});

test("since yesterday: today and yesterday apart, older rows left out", () => {
  const from = ms("2026-11-03T00:00:00+05:30");
  const rows = [
    row({ id: "t", at: ms("2026-11-04T01:00:00+05:30") }),
    row({ id: "y", at: ms("2026-11-03T23:00:00+05:30"), group: "pay" }),
    row({ id: "o", at: ms("2026-11-02T23:00:00+05:30") }),
  ];
  const s = sinceYesterday(rows, from);
  assert.equal(s.all.n, 2);
  assert.equal(s.today.n, 1);
  assert.equal(s.yesterday.n, 1);
  assert.deepEqual(s.groups.map((g) => g.key), ["call", "pay"]);
});

test("every group says where it reads from, and no words carry an em or en dash", () => {
  for (const g of AUDIT_GROUPS) {
    assert.ok(g.sub && g.sources.length, g.key);
  }
  const words = [
    ...AUDIT_GROUPS.flatMap((g) => [g.label, g.sub]), callFailedWords("mic_denied"), callEndWords("ended", "unfinished"), mailWords("rejected"),
    autopayWords("halted", "month"), waWords({ direction: "in", status: "done", error_code: null, error: null, refused: null, link: "verified" }).reason,
  ];
  for (const w of words) assert.ok(!/[\u2013\u2014]/.test(w), w);
});
