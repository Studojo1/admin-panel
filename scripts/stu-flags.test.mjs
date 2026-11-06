// node --test scripts/stu-flags.test.mjs
// The Auditor flags (app/lib/stu/flags.ts, flags.sql.ts): the window, the level-mismatch rule, the
// clipped-email rule, the words, the counts and the shape of the reads. Synthetic data only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FLAG_TYPES, buildFlag, bySeverity, clippedEnds, flagCounts, flagWindow, fullTimeMonths, levelMismatch, lowerGreeting, newestFirst, parseResumeDate,
} from "../app/lib/stu/flags.ts";
import { flagQueries } from "../app/lib/stu/flags.sql.ts";

const NOW = Date.parse("2026-11-07T10:00:00Z");

test("window: 48 hours by default, hours capped, IST days end at now when today", () => {
  const d = flagWindow({}, NOW);
  assert.equal(d.to - d.from, 48 * 3_600_000);
  assert.equal(flagWindow({ hours: "9999" }, NOW).to - flagWindow({ hours: "9999" }, NOW).from, 1440 * 3_600_000);
  const w = flagWindow({ start: "2026-11-05", end: "2026-11-07" }, NOW);
  assert.equal(w.from, Date.parse("2026-11-04T18:30:00Z"));
  assert.equal(w.to, NOW);
  const past = flagWindow({ start: "2026-11-01", end: "2026-11-02" }, NOW);
  assert.equal(past.to, Date.parse("2026-11-02T18:30:00Z"));
});

test("resume dates: years, month names, present, nothing", () => {
  assert.equal(parseResumeDate("Present", NOW), NOW);
  assert.equal(parseResumeDate("2025", NOW), Date.UTC(2025, 6, 1));
  assert.equal(parseResumeDate("July 2027", NOW), Date.UTC(2027, 6, 15));
  assert.equal(parseResumeDate("03/2024", NOW), Date.UTC(2024, 2, 15));
  assert.equal(parseResumeDate(null, NOW), null);
  assert.equal(parseResumeDate("n/a", NOW), null);
});

test("full-time months: overlaps once, interns and freelance left out, open end runs to now", () => {
  const exp = [
    { title: "Analyst", start: "Jan 2023", end: "Jan 2025" },
    { title: "Senior Analyst", start: "Jun 2024", end: "Jun 2025" },
    { title: "Marketing Intern", start: "2018", end: "2019" },
    { title: "Freelance writer", start: "2015", end: "2020" },
  ];
  assert.equal(fullTimeMonths(exp, NOW), 29);
  assert.equal(fullTimeMonths([{ title: "Lead", start: "2025", end: null }], NOW), Math.round((NOW - Date.UTC(2025, 6, 1)) / (30.4375 * 86_400_000)));
  assert.equal(fullTimeMonths("nothing", NOW), 0);
});

test("level mismatch: dated work, undated jobs, and the cases that are fine", () => {
  const long = [{ title: "Manager", start: "2020", end: "Present" }];
  assert.equal(levelMismatch({ experience: long, graduationYear: "2019", seniority: ["entry"], now: NOW }).basis, "dated");
  assert.equal(levelMismatch({ experience: long, graduationYear: "2019", seniority: ["entry", "mid"], now: NOW }), null);
  assert.equal(levelMismatch({ experience: long, graduationYear: "2019", seniority: ["senior"], now: NOW }), null);
  assert.equal(levelMismatch({ experience: [{ title: "Intern", start: "2019", end: "2023" }], graduationYear: "2026", seniority: ["intern"], now: NOW }), null);
  const undated = [{ title: "Counselor", start: null, end: null }];
  assert.equal(levelMismatch({ experience: undated, graduationYear: "2023", seniority: ["entry"], now: NOW }).basis, "undated");
  assert.equal(levelMismatch({ experience: undated, graduationYear: "2024", seniority: ["entry"], now: NOW }), null, "graduated under 3 years ago");
  assert.equal(levelMismatch({ experience: [...undated, { title: "Lead", start: "2025", end: "2026" }], graduationYear: "2020", seniority: ["entry"], now: NOW }), null, "one dated job and short");
  assert.equal(levelMismatch({ experience: [], graduationYear: "2020", seniority: ["entry"], now: NOW }), null);
  assert.equal(levelMismatch({ experience: undated, graduationYear: "", seniority: null, now: NOW }), null);
});

test("clipped emails: cut words are found, real endings and initials are not", () => {
  assert.equal(clippedEnds("We would love to hear from you. Thanks for your time.").length, 0);
  assert.equal(clippedEnds("Please reach out to us. Happy to chat with me.").length, 0);
  assert.equal(clippedEnds("I work in the UK. I also like AI. Ask Dr. Rao.").length, 0);
  assert.equal(clippedEnds("Reported to Anna B. Rao last year.").length, 0);
  const cut = clippedEnds("I would be glad to contribute to the Ex. Thanks");
  assert.equal(cut.length, 1);
  assert.match(cut[0], /Ex\.$/);
  assert.equal(clippedEnds("I would love to learn more about the role in a.").length, 1);
});

test("greeting: a lower-case name is caught, a normal greeting is not", () => {
  assert.equal(lowerGreeting("Hi omjee,\n\nI saw"), "Hi omjee");
  assert.equal(lowerGreeting("Hi Omjee,\n\nI saw"), null);
  assert.equal(lowerGreeting("Hi there,\n\nI saw"), null);
  assert.equal(lowerGreeting("Hello team,"), null);
});

test("words: every type builds, and a row that is not a flag on second look gives null", () => {
  const rows = {
    LEVEL_MISMATCH: { exp: [{ title: "Lead", start: "2020", end: "Present" }], gy: "2019", sen: ["entry"] },
    TOO_SENIOR_FLOOD: { n: 120, a: 70 },
    THIN_PICKS: { day: "2026-11-07", n: 3 },
    REPEATED_PICKS: { day: "2026-11-07", n: 6, rep: 4 },
    WEAK_PICK: { day: "2026-11-07", judged: 6, weak: 2, sample: [{ job: 7, fit: 40, level: "far_above" }] },
    CALL_NOT_CONFIRMED: { id: "abcdefghijklmnop", mins: 95 },
    ONBOARDED_NO_DESK: { mins: 200 },
    MIC_BLOCKED_LEFT: { mins: 600 },
    CALL_DROPPED: { src: "event", reason: "dropped", mins: 70 },
    VERIFIED_NO_CALL: { mins: 3000 },
    EMAIL_CLIPPED: { id: "e1", subject: "Hello", body: "Hi omjee,\n\nI am keen." },
    FIND_MISSES: { finds: 10, refunds: 6 },
    SEND_NO_INBOX: { n: 2 },
    WA_BLOCKED: { n: 3, codes: [{ code: "131049", n: 3 }] },
    WA_UNANSWERED: { n: 1, mins: 30 },
    CHECKOUT_ABANDONED: { kind: "order", item: "pack:100", amount_paise: 119900, currency: "INR", later_paid: false },
    PAID_NOT_GRANTED: { id: "9", item: "pack:100", amount_paise: 100, currency: "INR", mins: 20 },
    OPEN_TICKET: { id: "5", category: "website_broken", priority: "high", mins: 5000 },
  };
  for (const t of FLAG_TYPES) {
    const b = buildFlag(t.key, rows[t.key], { now: NOW, jobs: new Map([["7", "Analyst at Acme"]]) });
    assert.ok(b && b.what && b.evidence.length, t.key);
    assert.doesNotMatch(JSON.stringify(b), /[–—]/, `${t.key}: no en or em dashes`);
  }
  assert.match(buildFlag("WEAK_PICK", rows.WEAK_PICK, { now: NOW, jobs: new Map([["7", "Analyst at Acme"]]) }).evidence.join("|"), /Analyst at Acme: fit 40, far above/);
  assert.match(buildFlag("WA_BLOCKED", rows.WA_BLOCKED, { now: NOW }).evidence.join("|"), /131049 \(Meta marketing cap\) x3/);
  assert.equal(buildFlag("LEVEL_MISMATCH", { exp: [], gy: "2020", sen: ["entry"] }, { now: NOW }), null);
  assert.equal(buildFlag("EMAIL_CLIPPED", { id: "e", subject: "Hi", body: "All good. Thanks for your time." }, { now: NOW }), null);
  assert.equal(buildFlag("NOT_A_FLAG", {}, { now: NOW }), null);
});

test("counts: every type listed with zero, newest first, severities", () => {
  const f = (id, type, at, user, severity) => ({ id, type, severity, user, email: "", name: "", internal: null, at, what: "", evidence: [] });
  const flags = [f("a", "THIN_PICKS", 1, "u1", "med"), f("b", "THIN_PICKS", 5, "u2", "med"), f("c", "SEND_NO_INBOX", 3, "u1", "high")];
  assert.deepEqual(newestFirst(flags).map((x) => x.id), ["b", "c", "a"]);
  const c = flagCounts(flags);
  assert.equal(c.length, FLAG_TYPES.length);
  assert.deepEqual(c.find((x) => x.type.key === "THIN_PICKS"), { type: FLAG_TYPES.find((t) => t.key === "THIN_PICKS"), n: 2, people: 2 });
  assert.equal(c.find((x) => x.type.key === "OPEN_TICKET").n, 0);
  assert.deepEqual(bySeverity(flags), { high: 1, med: 2, low: 0 });
});

test("reads: one per type, bounded by the window and a limit, read only text", () => {
  const qs = flagQueries({ from: "2026-11-05T10:00:00.000Z", to: "2026-11-07T10:00:00.000Z", dayFrom: "2026-11-05", dayTo: "2026-11-07", floodFrom: "2026-11-05T10:00:00.000Z" });
  assert.deepEqual(qs.map((q) => q.type), FLAG_TYPES.map((t) => t.key));
  for (const q of qs) {
    assert.match(q.sql, /^(SELECT)/, q.type);
    assert.match(q.sql, /LIMIT 2001$/, q.type);
    assert.doesNotMatch(q.sql, /;|\b(INSERT|UPDATE|DELETE|DROP|ALTER)\b|career_jobs/i, q.type);
    if (q.type !== "OPEN_TICKET") assert.match(q.sql, /2026-11-0[57]/, `${q.type} is bounded by the window`);
  }
});

test("no en or em dashes in the flags files", () => {
  for (const f of ["../app/lib/stu/flags.ts", "../app/lib/stu/flags.sql.ts", "../app/lib/stu/flags.server.ts", "../app/components/stu/flags-panel.tsx", "../app/routes/api.stu-flags.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), "utf8"), /[–—]/, `${f}: no en or em dashes`);
  }
});
