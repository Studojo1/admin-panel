// node --test scripts/email-funnel-model.test.mjs
// EMAIL-PAGE (17 Nov 2026): the /email-funnel rules (app/lib/email-funnel/model.ts): the funnel's maths, what "acted"
// and "paid" mean per kind, the health limits, the skips, the event log against the ledger (and the ledger alone while
// the new tables are not live), placement, email against WhatsApp, the recent list. Every person here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ACT_WINDOW_MS, GOAL_TEXT, INDUSTRY, KINDS, LIMITS, PAY_WINDOW_MS, RECENT_ROWS, SKIP_REASONS, SLACK_MS, STATUS_LABEL, TREND_DAYS,
  addDays, buildEmail, factsOf, istDay, kindOf, maskEmail, parseDays, rangeFrom, ratio, senderDomain, stateOf, statusOf,
} from "../app/lib/email-funnel/model.ts";

const at = (day, hhmm = "10:00") => Date.parse(`${day}T${hhmm}:00+05:30`);
const NOW = at("2026-11-17", "15:00");
const M = 60_000;
const H = 60 * M;
const D = 24 * H;

let nextId = 1;
/** An email the provider took, delivered a minute later; override anything. */
const row = (user, over = {}) => {
  const id = over.id ?? nextId++;
  const sentAt = over.sentAt ?? NOW - 5 * H;
  return {
    id, user, day: istDay(sentAt), kind: "picks", key: `picks:${id}`, sentAt, taken: true, deliveredAt: sentAt + M, readAt: null, tappedAt: null,
    opens: 0, failed: false, bounced: false, team: false, via: "acs", to: `${user[0]}•••@example.test`, ...over,
  };
};
const live = (o = {}) => ({ events: false, skips: false, placements: false, ...o });
const input = (over = {}) => ({
  now: NOW, days: 7, team: false, live: live(), eventsSince: null, internal: {},
  rows: [], events: [], skips: [], placements: [], goals: [], pays: [], replies: [], prefs: [], wa: [], inbound: [], ...over,
});
const ev = (row, event, detail = null, first = NOW - 4 * H, n = 1, sender = null) => ({ row, event, detail, n, first, last: first, sender });
const step = (r, key) => r.funnel.steps.find((s) => s.key === key);
const tile = (r, key) => r.health.find((t) => t.key === key);
const fact = (i, id) => factsOf(i).find((f) => f.id === id);

test("helpers: IST range, one-decimal ratios, masks, senders, kinds", () => {
  assert.equal(istDay(at("2026-11-17", "00:10")), "2026-11-17");
  assert.equal(rangeFrom(NOW, 1), at("2026-11-17", "00:00"), "today: from India's midnight");
  assert.equal(rangeFrom(NOW, 7), at("2026-11-11", "00:00"), "7 days: today and the 6 before");
  assert.equal(addDays("2026-11-01", -1), "2026-10-31");
  assert.deepEqual(ratio(1, 3), { n: 1, of: 3, pct: 33.3 });
  assert.deepEqual(ratio(97, 100), { n: 97, of: 100, pct: 97 });
  assert.deepEqual(ratio(0, 0), { n: 0, of: 0, pct: null });
  assert.equal(maskEmail("Kiran.Rao@Example.test"), "k•••@example.test");
  assert.equal(maskEmail("nobody"), "•••");
  assert.equal(maskEmail(null), "");
  assert.equal(senderDomain(null, "acs"), "hello.studojo.com");
  assert.equal(senderDomain(null, "google"), "studojo.com");
  assert.equal(senderDomain("Stu <stu@mail.example.test>", "acs"), "mail.example.test");
  assert.equal(kindOf("floor", "picks"), "floor");
  assert.equal(kindOf(null, "picks", true), "floor", "a picks row with meta.floor is the floor email");
  assert.equal(kindOf(null, "reply_alert"), "reply");
  assert.equal(kindOf("reply_alert"), "reply", "a skip may name the ledger's kind");
  assert.equal(kindOf(null, "recap"), "week");
  assert.equal(kindOf(null, "email_answer"), "answer");
  assert.equal(kindOf("something_new", "something_new"), "other");
  assert.equal(parseDays("30"), 30);
  assert.equal(parseDays("5"), 7, "anything else: 7");
  assert.equal(parseDays(null), 7);
});

test("the limits: delivered below 97 warns; bounce 2 and 5; unsubscribe 0.5 and 1; primary below 70; complaints 0.1 and 0.3", () => {
  assert.equal(stateOf("delivered", 97), "good");
  assert.equal(stateOf("delivered", 96.9), "warn");
  assert.equal(stateOf("bounce", 2), "good");
  assert.equal(stateOf("bounce", 2.1), "warn");
  assert.equal(stateOf("bounce", 5), "warn");
  assert.equal(stateOf("bounce", 5.1), "bad");
  assert.equal(stateOf("unsub", 0.5), "good");
  assert.equal(stateOf("unsub", 0.6), "warn");
  assert.equal(stateOf("unsub", 1.1), "bad");
  assert.equal(stateOf("primary", 70), "good");
  assert.equal(stateOf("primary", 69.9), "warn");
  assert.equal(stateOf("complaint", 0.2), "warn");
  assert.equal(stateOf("complaint", 0.4), "bad");
  assert.equal(stateOf("open", 12), "none", "no limit on the open rate, only the typical range");
  assert.equal(stateOf("bounce", null), "empty");
  assert.deepEqual([LIMITS.delivered.warnBelow, LIMITS.bounce.warnAbove, LIMITS.bounce.badAbove, LIMITS.unsub.warnAbove, LIMITS.unsub.badAbove, LIMITS.primary.warnBelow], [97, 2, 5, 0.5, 1, 70]);
  assert.deepEqual(INDUSTRY.open, [35, 55]);
  assert.deepEqual(INDUSTRY.click, [3, 10]);
});

test("the funnel: sent, delivered, opened (a click or reply implies it), clicked, acted, paid; shares and drops", () => {
  const a = row("a", { readAt: NOW - 4 * H });
  const b = row("b", { readAt: NOW - 4 * H, tappedAt: NOW - 4 * H + M });
  const c = row("c", { deliveredAt: null, tappedAt: NOW - 3 * H }); // a click with no report: delivered and opened
  const d = row("d"); // delivered, nothing else
  const e = row("e", { bounced: true, failed: true, deliveredAt: null });
  const f = row("f", { taken: false, failed: true, deliveredAt: null }); // the provider refused it
  const r = buildEmail(input({
    rows: [a, b, c, d, e, f],
    goals: [{ user: "b", step: "job_saved", at: NOW - 3 * H }],
    pays: [{ user: "b", at: NOW - 2 * H }],
  }));
  assert.equal(step(r, "due").n, null, "no skips table: Due is not known");
  assert.equal(step(r, "sent").n, 5);
  assert.equal(step(r, "sent").base, null);
  assert.deepEqual([step(r, "delivered").n, step(r, "delivered").ofBase, step(r, "delivered").drop], [4, 80, 1]);
  assert.deepEqual([step(r, "opened").n, step(r, "opened").ofBase], [3, 75]);
  assert.deepEqual([step(r, "clicked").n, step(r, "clicked").base, step(r, "clicked").ofBase], [2, "opened", 66.7]);
  assert.deepEqual([step(r, "acted").n, step(r, "acted").base, step(r, "acted").ofBase], [1, "opened", 33.3], "acting is a share of opened, not of clicked");
  assert.deepEqual([step(r, "paid").n, step(r, "paid").base, step(r, "paid").ofBase], [1, "acted", 100]);
  assert.equal(step(r, "opened").ofTop, 60, "the bar: a share of the first known step (sent)");
  assert.equal(r.funnel.refused, 1);
  assert.deepEqual(r.funnel.skips, [{ key: "refused", label: "Provider refused the send", n: 1 }]);
  assert.deepEqual([tile(r, "delivered").ratio, tile(r, "delivered").state], [{ n: 4, of: 5, pct: 80 }, "warn"]);
  assert.deepEqual([tile(r, "bounce").ratio.pct, tile(r, "bounce").state], [20, "bad"]);
  assert.deepEqual(tile(r, "open").ratio, { n: 3, of: 4, pct: 75 });
  assert.deepEqual(tile(r, "click").ratio, { n: 2, of: 4, pct: 50 });
  assert.deepEqual(tile(r, "cto").ratio, { n: 2, of: 3, pct: 66.7 });
  assert.equal(tile(r, "open").small, true, "under 20 emails: a small sample");
});

test("Due: sent + skipped + refused; a skip for an email that went after all is not a skip; reasons in words", () => {
  const sent = row("a", { kind: "picks" });
  const r = buildEmail(input({
    live: live({ skips: true }),
    rows: [sent, row("b", { kind: "reply", taken: false, failed: true, deliveredAt: null, key: "email:reply:9" })],
    skips: [
      { day: sent.day, kind: "picks", user: "a", reason: "cap", at: NOW - 6 * H }, // a went later that day: not a skip
      { day: istDay(NOW), kind: "picks", user: "c", reason: "whatsapp_reached", at: NOW - 6 * H },
      { day: istDay(NOW), kind: "floor", user: "d", reason: "quiet_hours", at: NOW - 3 * H },
      { day: istDay(NOW), kind: "floor", user: "e", reason: "quiet_hours", at: NOW - 3 * H },
      { day: istDay(NOW - 20 * D), kind: "picks", user: "f", reason: "cap", at: NOW - 20 * D }, // before the range
    ],
  }));
  assert.equal(step(r, "due").n, 1 + 3 + 1);
  assert.deepEqual([step(r, "sent").base, step(r, "sent").ofBase, step(r, "sent").drop], ["due", 20, 4]);
  assert.deepEqual(r.funnel.skips.map((s) => [s.key, s.n]), [["quiet_hours", 2], ["refused", 1], ["whatsapp_reached", 1]]);
  assert.equal(r.funnel.skips.find((s) => s.key === "quiet_hours").label, "Outside email hours");
  assert.equal(r.kinds.find((k) => k.key === "floor").skipped, 2, "a kind with skips and no sends still has its row");
});

test("a retried email: the refused try is not counted once a try of the same claim went; three refused tries count once", () => {
  const r = buildEmail(input({
    rows: [
      row("a", { taken: false, failed: true, deliveredAt: null, key: "k1", sentAt: NOW - 3 * H }),
      row("a", { key: "k1", sentAt: NOW - 2 * H }),
      row("b", { taken: false, failed: true, deliveredAt: null, key: "k2", sentAt: NOW - 3 * H }),
      row("b", { taken: false, failed: true, deliveredAt: null, key: "k2", sentAt: NOW - 2 * H }),
      row("b", { taken: false, failed: true, deliveredAt: null, key: "k2", sentAt: NOW - 1 * H }),
    ],
  }));
  assert.equal(r.funnel.refused, 1);
  assert.equal(step(r, "sent").n, 1);
  assert.equal(r.kinds[0].refused, 1);
});

test("acted, per kind: its goal within 48 h of the first open, click or reply", () => {
  const open = NOW - 50 * H;
  const mk = (user, kind, over = {}) => row(user, { kind, sentAt: open - H, readAt: open, ...over });
  const rows = [
    mk("p1", "picks"), mk("p2", "floor"), mk("p3", "picks"), mk("p4", "picks"),
    mk("s1", "start"), mk("s2", "call"),
    mk("r1", "reply"), mk("r2", "reply", { tappedAt: open + H }),
    mk("i1", "inbox"),
    mk("w1", "winback"), mk("w2", "week"), mk("w3", "week", { sentAt: NOW - 11 * H, readAt: NOW - 10 * H }),
  ];
  const goals = [
    { user: "p1", step: "job_saved", at: open + 47 * H },
    { user: "p2", step: "outreach_started", at: open + 2 * H },
    { user: "p3", step: "job_saved", at: open + 49 * H }, // after the 48 h
    { user: "p4", step: "job_saved", at: open - 3 * H }, // before the open
    { user: "p4", step: "desk_opened", at: open + H }, // not the picks' goal
    { user: "s1", step: "call_started", at: open + H },
    { user: "s2", step: "job_saved", at: open + H }, // not a call
    { user: "r1", step: "desk_opened", at: open + H }, // Stu from an email link
    { user: "i1", step: "mailbox_connected", at: open + 5 * H },
    { user: "w1", step: "desk_opened", at: open + SLACK_MS / 2 - M }, // a minute before the open: inside the slack
  ];
  const fs = factsOf(input({ rows, goals }));
  const acted = Object.fromEntries(fs.map((f) => [f.user, f.acted]));
  assert.deepEqual(acted, { p1: true, p2: true, p3: false, p4: false, s1: true, s2: false, r1: true, r2: true, i1: true, w1: true, w2: false, w3: false });
  assert.equal(ACT_WINDOW_MS, 48 * H);
  assert.equal(fs.find((f) => f.user === "w3").actOpen, true, "opened 10 h ago, nothing yet: still inside the 48 h");
  assert.equal(fs.find((f) => f.user === "w2").actOpen, false, "50 h ago: the window is over");
  assert.equal(GOAL_TEXT.save_or_outreach, "saved a job or started outreach");
  for (const k of KINDS) assert.ok(GOAL_TEXT[k.goal], `a goal for ${k.key}`);
});

test("acted for C1 with the event log: only a tap on the replies link (r), or Stu from the email", () => {
  const a = row("a", { kind: "reply" });
  const b = row("b", { kind: "reply" });
  const fs = factsOf(input({
    live: live({ events: true }), eventsSince: NOW - 10 * D,
    rows: [a, b],
    events: [ev(a.id, "opened", "client"), ev(a.id, "tapped", "r", NOW - 4 * H + M), ev(b.id, "opened", "gmail_proxy"), ev(b.id, "tapped", "s", NOW - 4 * H + M)],
  }));
  assert.equal(fs.find((f) => f.user === "a").acted, true);
  assert.equal(fs.find((f) => f.user === "b").acted, false, "a tap on the settings link is not opening the replies");
  assert.deepEqual(fs.find((f) => f.user === "a").codes, ["r"]);
});

test("paid: acted, then real money within 7 days of the open; paid after opening without acting is counted apart", () => {
  const open = NOW - 8 * D;
  const rows = [
    row("a", { sentAt: open - H, readAt: open }), row("b", { sentAt: open - H, readAt: open }), row("c", { sentAt: open - H, readAt: open }),
    row("d", { sentAt: NOW - 2 * D, readAt: NOW - 2 * D + H }),
  ];
  const r = buildEmail(input({
    days: 30, rows,
    goals: [{ user: "a", step: "job_saved", at: open + H }, { user: "b", step: "job_saved", at: open + H }, { user: "d", step: "job_saved", at: NOW - D }],
    pays: [
      { user: "a", at: open + 6 * D }, // inside the 7 days
      { user: "b", at: open + PAY_WINDOW_MS + H }, // after
      { user: "c", at: open + D }, // paid, never acted
    ],
  }));
  assert.equal(step(r, "acted").n, 3);
  assert.equal(step(r, "paid").n, 1);
  assert.equal(r.funnel.paidAny, 2, "a, and c who paid without the goal step");
  assert.equal(r.funnel.payOpen, 1, "d acted 2 days ago: still inside the 7 days");
});

test("ledger only: a reply's touch on tapped_at is not a click; the reply goes on the latest email in 3 days; unsubscribes from the settings", () => {
  const a1 = row("a", { kind: "picks", sentAt: NOW - 30 * H, readAt: NOW - 29 * H });
  const a2 = row("a", { kind: "rollup", sentAt: NOW - 6 * H, tappedAt: NOW - 2 * H }); // tapped_at stamped by the reply
  const b = row("b", { sentAt: NOW - 5 * D, tappedAt: NOW - 5 * D + H }); // a real click
  const c = row("c", { sentAt: NOW - 6 * D });
  const i = input({
    rows: [a1, a2, b, c],
    replies: [{ user: "a", at: NOW - 2 * H }, { user: "c", at: NOW - 2 * H }], // c's is 6 days after: no email
    prefs: [{ user: "b", unsubAt: NOW - 4 * D, complainedAt: null }],
  });
  const f2 = fact(i, a2.id);
  assert.equal(f2.clicked, false, "the touch of a reply");
  assert.equal(f2.replied, true, "the reply answers the latest email before it");
  assert.equal(f2.opened, true, "a reply implies an open");
  assert.equal(fact(i, a1.id).replied, false);
  assert.equal(fact(i, b.id).clicked, true);
  assert.equal(fact(i, b.id).unsub, true, "unsubscribed a day after it");
  assert.equal(fact(i, c.id).replied, false, "a reply more than 3 days later answers nothing here");
  const r = buildEmail(i);
  assert.equal(tile(r, "reply").ratio.n, 1);
  assert.equal(tile(r, "unsub").ratio.n, 1);
  assert.equal(tile(r, "primary").empty, "no seed inboxes yet");
  assert.equal(tile(r, "primary").state, "empty");
  assert.equal(tile(r, "complaint").empty, "only in Google Postmaster");
  assert.equal(r.live.events, false);
  assert.equal(r.opens.by[0].key, "ledger", "opens from the ledger: source unknown");
});

test("the event log: Apple's machine opens are left out, Gmail's proxy counts; per email the log wins and the ledger stands in", () => {
  const since = NOW - 10 * H;
  const a = row("a", { readAt: NOW - 4 * H, opens: 3 }); // only Apple opened it
  const b = row("b", { readAt: NOW - 4 * H });
  const c = row("c", { readAt: NOW - 4 * H, opens: 2 }); // no open rows in the log: the ledger's stamp stands in
  const d = row("d", { sentAt: NOW - 3 * D, readAt: NOW - 3 * D + H }); // before the log: ledger
  const i = input({
    live: live({ events: true }), eventsSince: since, rows: [a, b, c, d],
    events: [ev(a.id, "opened", "apple_mpp", NOW - 5 * H + M, 3), ev(b.id, "opened", "gmail_proxy"), ev(b.id, "opened", "apple_mpp", NOW - 5 * H, 1), ev(a.id, "sent", null, NOW - 5 * H, 1, "stu@hello.studojo.com")],
  });
  assert.equal(fact(i, a.id).opened, false);
  assert.equal(fact(i, a.id).machineOnly, true);
  assert.equal(fact(i, b.id).opened, true, "a person opened it too");
  assert.equal(fact(i, b.id).engagedAt, NOW - 4 * H, "the window starts at the person's open, not Apple's");
  assert.equal(fact(i, c.id).opened, true);
  assert.equal(fact(i, d.id).opened, true);
  assert.equal(fact(i, a.id).sender, "hello.studojo.com");
  const r = buildEmail(i);
  assert.equal(r.funnel.machineOnly, 1);
  assert.deepEqual(tile(r, "open").ratio, { n: 3, of: 4, pct: 75 });
  assert.deepEqual(r.opens.by.map((o) => [o.key, o.n]), [["gmail_proxy", 1], ["apple_mpp", 4], ["ledger", 3]]);
});

test("the event log: replies and unsubscribes by the log after it went live, never counted twice by the ledger's guess", () => {
  const since = NOW - 2 * D;
  const old = row("a", { sentAt: NOW - 3 * D, readAt: NOW - 3 * D + H });
  const tagged = row("a", { sentAt: NOW - 30 * H });
  const latest = row("a", { sentAt: NOW - 10 * H });
  const i = input({
    live: live({ events: true }), eventsSince: since, rows: [old, tagged, latest],
    events: [ev(tagged.id, "replied", null, NOW - 5 * H), ev(tagged.id, "unsubscribed", "updates", NOW - 5 * H)],
    replies: [{ user: "a", at: NOW - 5 * H }],
    prefs: [{ user: "a", unsubAt: NOW - 5 * H, complainedAt: null }],
  });
  assert.deepEqual([fact(i, old.id).replied, fact(i, tagged.id).replied, fact(i, latest.id).replied], [false, true, false]);
  assert.deepEqual([fact(i, old.id).unsub, fact(i, tagged.id).unsub, fact(i, latest.id).unsub], [false, true, false]);
});

test("bounces and drops: the ledger's mark or the log's row; a dropped email is not delivered and not a bounce", () => {
  const a = row("a");
  const b = row("b", { failed: true, deliveredAt: null }); // Azure's spam filter
  const c = row("c", { via: "google", deliveredAt: NOW - 5 * H, failed: true, bounced: true }); // Google's 250, then a bounce notice
  const i = input({ live: live({ events: true }), eventsSince: NOW - D, rows: [a, b, c], events: [ev(a.id, "bounced", null)] });
  assert.deepEqual([fact(i, a.id).bounced, fact(i, a.id).delivered], [true, false]);
  assert.deepEqual([fact(i, b.id).dropped, fact(i, b.id).bounced, fact(i, b.id).delivered], [true, false, false]);
  assert.deepEqual([fact(i, c.id).bounced, fact(i, c.id).delivered], [true, false]);
  assert.deepEqual(["bounced", "dropped", "bounced"], [a, b, c].map((x) => statusOf(fact(i, x.id))));
});

test("students only unless the team is asked for: meta.team and internal accounts out of every count", () => {
  const base = {
    rows: [row("s1"), row("t1", { team: true }), row("x1"), row("s2", { readAt: NOW - 4 * H })],
    internal: { x1: "studojo.com" },
    wa: [{ user: "s1", sent: 4, delivered: 4, read: 2, tapped: 1 }, { user: "x1", sent: 10, delivered: 10, read: 10, tapped: 10 }],
  };
  const out = buildEmail(input(base));
  assert.equal(step(out, "sent").n, 2);
  assert.equal(out.leftOut, 2);
  assert.equal(out.recent.length, 2);
  const inc = buildEmail(input({ ...base, team: true }));
  assert.equal(step(inc, "sent").n, 4);
  assert.equal(inc.leftOut, 0);
  assert.equal(inc.recent.find((x) => x.to.startsWith("x")).internal, "studojo.com");
  assert.equal(inc.recent.find((x) => x.to.startsWith("t")).team, true);
  assert.equal(inc.vsWhatsapp.whatsapp.sent, 4, "email against WhatsApp is students only, whatever the toggle");
  assert.equal(inc.vsWhatsapp.email.sent, 2);
});

test("email against WhatsApp: delivered of sent, read or opened and tapped of delivered", () => {
  const r = buildEmail(input({
    rows: [row("a", { readAt: NOW - 4 * H, tappedAt: NOW - 4 * H }), row("b"), row("c", { deliveredAt: null, bounced: true, failed: true })],
    wa: [{ user: "a", sent: 10, delivered: 8, read: 6, tapped: 2 }, { user: "b", sent: 0, delivered: 0, read: 0, tapped: 0 }],
  }));
  const v = r.vsWhatsapp;
  assert.deepEqual([v.email.sent, v.email.delivered.pct, v.email.read.pct, v.email.tapped.pct], [3, 66.7, 50, 50]);
  assert.deepEqual([v.whatsapp.sent, v.whatsapp.delivered.pct, v.whatsapp.read.pct, v.whatsapp.tapped.pct], [10, 80, 75, 25]);
  assert.deepEqual(v.students, { email: 3, whatsapp: 1 });
});

test("by kind and by route: rates of delivered, delivered and bounce of sent; Azure and Google apart", () => {
  const r = buildEmail(input({
    rows: [
      row("a", { kind: "picks", readAt: NOW - 4 * H }), row("b", { kind: "picks" }), row("c", { kind: "reply", via: "google", readAt: NOW - 4 * H, tappedAt: NOW - 4 * H }),
    ],
  }));
  const picks = r.kinds.find((k) => k.key === "picks");
  assert.deepEqual([picks.label, picks.sent, picks.open.pct, picks.click.pct, picks.bounce.pct], ["Morning matches", 2, 50, 0, 0]);
  assert.equal(r.kinds[0].key, "picks", "most sent first");
  assert.deepEqual(r.routes.map((x) => [x.label, x.sub, x.sent]), [["Azure", "hello.studojo.com", 2], ["Google Workspace", "studojo.com", 1]]);
});

test("the trend: 14 IST days by send time, whatever the range", () => {
  const r = buildEmail(input({
    days: 1,
    rows: [row("a", { sentAt: at("2026-11-04", "09:00") }), row("b", { sentAt: at("2026-11-16", "23:50"), readAt: at("2026-11-17", "08:00") }), row("c", { sentAt: at("2026-11-17", "00:05"), tappedAt: at("2026-11-17", "09:00") }), row("d", { sentAt: at("2026-11-03", "23:00") })],
  }));
  assert.equal(r.trend.length, TREND_DAYS);
  assert.equal(r.trend[0].day, "2026-11-04");
  assert.equal(r.trend.at(-1).soFar, true);
  const day = (k) => r.trend.find((d) => d.day === k);
  assert.deepEqual([day("2026-11-04").sent, day("2026-11-16").opened, day("2026-11-17").clicked, day("2026-11-17").opened], [1, 1, 1, 1]);
  assert.equal(r.trend.reduce((a, d) => a + d.sent, 0), 3, "3 Nov is before the 14 days");
  assert.equal(step(r, "sent").n, 1, "the range (today) holds only c");
});

test("inbox placement: the latest check per kind and seed, and the shares in range", () => {
  const p = (id, kind, seed, placement, t) => ({ id, day: istDay(t), kind, via: "acs", sender: null, seed, status: "done", placement, sentAt: t - 5 * M, placedAt: t });
  const r = buildEmail(input({
    live: live({ placements: true }),
    placements: [
      p(1, "picks", "s•••@example.test", "promotions", NOW - 9 * D), // before the range, but an older result of the same pair
      p(2, "picks", "s•••@example.test", "primary", NOW - D),
      p(3, "picks", "o•••@example.test", "spam", NOW - 2 * D),
      p(4, "reply", "s•••@example.test", "primary", NOW - 3 * D),
      p(5, "reply", "o•••@example.test", "primary", NOW - 3 * D),
    ],
  }));
  assert.deepEqual(r.placement.latest.map((x) => [x.kind, x.seed, x.placement]), [
    ["picks", "o•••@example.test", "spam"], ["picks", "s•••@example.test", "primary"], ["reply", "o•••@example.test", "primary"], ["reply", "s•••@example.test", "primary"],
  ]);
  assert.equal(r.placement.checks, 4);
  assert.deepEqual(r.placement.shares.find((s) => s.key === "primary").ratio, { n: 3, of: 4, pct: 75 });
  assert.deepEqual(r.placement.shares.find((s) => s.key === "spam").ratio.pct, 25);
  assert.deepEqual([tile(r, "primary").ratio.pct, tile(r, "primary").state, tile(r, "primary").empty], [75, "good", null]);
});

test("spam complaints: a rate once one is known, else only in Google Postmaster", () => {
  const a = row("a");
  const r = buildEmail(input({ rows: [a, row("b")], prefs: [{ user: "a", unsubAt: null, complainedAt: NOW - H }] }));
  assert.deepEqual([tile(r, "complaint").ratio.n, tile(r, "complaint").empty, tile(r, "complaint").state], [1, null, "bad"]);
});

test("the recent list: newest first, 50 at most, masked, with its status", () => {
  const rows = Array.from({ length: 60 }, (_, k) => row(`p${k}`, { sentAt: NOW - (k + 1) * M, deliveredAt: null }));
  const r = buildEmail(input({ rows }));
  assert.equal(r.recent.length, RECENT_ROWS);
  assert.equal(r.recent[0].sentAt, NOW - M);
  assert.equal(r.recent[0].status, "pending", "a minute old with no report: on its way");
  assert.equal(r.recent.at(-1).status, "no_report", "50 minutes and no report");
  assert.ok(r.recent.every((x) => x.to.includes("•••")), "never a whole address");
});

test("degraded: with none of the new tables the report still builds, and says what waits", () => {
  const r = buildEmail(input({ rows: [row("a", { readAt: NOW - 4 * H })] }));
  assert.deepEqual(r.live, { events: false, skips: false, placements: false });
  assert.equal(step(r, "due").n, null);
  assert.equal(step(r, "due").note, "waits for the skips table");
  assert.equal(step(r, "sent").ofTop, 100, "the bars measure from Sent");
  assert.equal(r.funnel.machineOnly, 0);
  assert.equal(r.placement.any, false);
  const empty = buildEmail(input());
  assert.equal(step(empty, "sent").n, 0);
  assert.equal(tile(empty, "open").ratio.pct, null);
  assert.equal(tile(empty, "open").state, "empty");
});

test("words: no en or em dashes anywhere the page shows", () => {
  const words = [
    ...KINDS.map((k) => k.label), ...Object.values(GOAL_TEXT), ...SKIP_REASONS.map((s) => s.label), ...Object.values(STATUS_LABEL),
    ...buildEmail(input({ rows: [row("a")] })).health.flatMap((t) => [t.label, t.rule, t.empty ?? ""]),
    ...buildEmail(input({ rows: [row("a")] })).funnel.steps.flatMap((s) => [s.label, s.note]),
  ];
  for (const w of words) assert.ok(!/[\u2013\u2014]/.test(w), `no dash in: ${w}`);
});
