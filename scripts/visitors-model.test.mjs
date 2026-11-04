// node --test scripts/visitors-model.test.mjs
// VISITORS (4 Nov 2026): real visitors (a page_view), likely bots (visited_home and no page_view), declared crawlers
// (site_bot_hits), the first-touch source, the funnel per source, and where those who did not sign up stopped
// (app/lib/visitors/model.ts).
import { test } from "node:test";
import assert from "node:assert/strict";
import { DROPS, buildReport, dropOf, landingGroup, referrerHost, sourceOf } from "../app/lib/visitors/model.ts";

const T = (hhmm, day = "2026-11-04") => Date.parse(`${day}T${hhmm}:00+05:30`);
let n = 0;
const row = (v, step, over = {}) => ({
  v, step, at: T("10:00") + n++, day: "2026-11-04", path: "/", device: "mobile", inapp: "none", engaged: null, scroll: null, cta: false, sections: null, ...over,
});
const input = (over = {}) => ({ start: "2026-11-04", end: "2026-11-04", device: "all", internal: false, rows: [], touch: {}, people: {}, bots: [], ...over });

test("referrers: none, null and our own sites are no referrer; hosts fold into their groups", () => {
  assert.equal(referrerHost(""), null);
  assert.equal(referrerHost("null/"), null, "the browser's 'null' referrer");
  assert.equal(referrerHost("https://studojo.com/blog"), null);
  assert.equal(referrerHost("https://accounts.google.com/"), null, "the Google sign-in is not a source");
  assert.equal(referrerHost("https://www.google.com/"), "google.com");
  assert.equal(sourceOf({ referrer: "https://www.google.com/" }).key, "ref:google");
  assert.equal(sourceOf({ referrer: "https://www.google.co.in/" }).key, "ref:google");
  assert.equal(sourceOf({ referrer: "android-app://com.google.android.googlequicksearchbox/" }).key, "ref:google");
  assert.equal(sourceOf({ referrer: "android-app://com.google.android.gm/" }).key, "ref:email", "the Gmail app is not search");
  assert.equal(sourceOf({ referrer: "https://www.bing.com/" }).key, "ref:bing");
  assert.equal(sourceOf({ referrer: "https://duckduckgo.com/" }).key, "ref:duckduckgo");
  assert.equal(sourceOf({ referrer: "https://www.yandex.com/" }).key, "ref:yandex");
  assert.equal(sourceOf({ referrer: "https://www.linkedin.com/" }).key, "ref:linkedin");
  assert.equal(sourceOf({ referrer: "https://lnkd.in/x" }).key, "ref:linkedin");
  assert.equal(sourceOf({ referrer: "https://l.instagram.com/" }).key, "ref:instagram");
  assert.equal(sourceOf({ referrer: "https://m.facebook.com/" }).key, "ref:facebook");
  assert.equal(sourceOf({ referrer: "https://chatgpt.com/" }).key, "ref:chatgpt");
  assert.equal(sourceOf({ referrer: "https://www.perplexity.ai/" }).key, "ref:perplexity");
  assert.equal(sourceOf({ referrer: "https://gemini.google.com/" }).key, "ref:ai_other", "Gemini is an assistant, not Google search");
  assert.equal(sourceOf({ referrer: "https://news.example.org/a" }).key, "ref:other");
});

test("first touch order: a utm tag, a click id, the referrer, the app's browser, then direct by landing", () => {
  const ig = { utm_source: "ig", utm_medium: "social", referrer: "https://l.instagram.com/", fbclid: "y", landing_path: "/" };
  assert.deepEqual(sourceOf(ig, "instagram", "/"), { key: "utm:ig", label: "utm_source ig" });
  assert.equal(sourceOf({ gclid: "y", referrer: "https://www.google.com/" }).key, "click:google");
  assert.equal(sourceOf({ referrer: "https://www.google.com/" }, "instagram").key, "ref:google", "a referrer beats the app");
  assert.equal(sourceOf({}, "instagram", "/").key, "inapp:instagram");
  assert.equal(sourceOf({ fbclid: "y" }, "none", "/").key, "click:meta");
  assert.equal(sourceOf({ landing_path: "/blog/x" }, "none", "/").key, "direct:blog", "the first touch's landing page wins");
  assert.equal(sourceOf(null, null, "/reports/x").key, "direct:report");
  assert.equal(sourceOf(undefined, "none", "/").key, "direct:home");
  assert.equal(sourceOf({}, "none", "/terms").label, "Direct, other page");
  assert.equal(landingGroup("/blog"), "blog");
  assert.equal(landingGroup("/?utm_source=x"), "home");
});

test("real visitors need a page_view; visited_home alone is a likely bot", () => {
  const r = buildReport(input({
    rows: [
      row("a", "visited_home"), row("a", "page_view"),
      row("b", "visited_home", { device: "desktop", path: "/blog/x" }),
      row("c", "page_view", { path: "/blog/y" }), // a cached page: no visited_home today, still a person
      row("d", "clicked_join"), // nothing else: neither
    ],
  }));
  assert.equal(r.summary.real, 2);
  assert.equal(r.summary.likelyBots, 1);
  assert.equal(r.summary.realNoServerRow, 1);
  assert.equal(r.bots.byLanding.find((x) => x.key === "blog").desktop, 1);
  assert.equal(r.bots.bySource[0].key, "direct:blog");
});

test("the funnel per source: engaged at 5 s, scrolled at 50%, Start seen, clicked, began, signed up and the Stu steps", () => {
  const people = {
    s: { internal: false, joined: T("10:30"), steps: { reached_stu: T("10:31"), call_started: T("10:35"), call_completed: T("10:50"), saw_jobs: T("10:52") } },
    old: { internal: false, joined: T("10:00", "2026-11-03"), steps: { reached_stu: T("11:00") } },
  };
  const r = buildReport(input({
    rows: [
      row("s", "visited_home"), row("s", "page_view"), row("s", "page_engaged", { engaged: 12, scroll: 75, cta: true }),
      row("s", "clicked_join", { cta: true }), row("s", "signup_started"),
      row("x", "visited_home"), row("x", "page_view"), row("x", "page_engaged", { engaged: 4, scroll: 25 }),
      row("old", "visited_home"), row("old", "page_view"), row("old", "page_engaged", { engaged: 30 }),
    ],
    touch: { s: { utm_source: "ig" }, x: { utm_source: "ig" }, old: { referrer: "https://www.google.com/" } },
    people,
  }));
  const ig = r.sources.find((s) => s.key === "utm:ig");
  assert.equal(ig.counts.real, 2);
  assert.equal(ig.counts.engaged, 1, "4 s is not engaged");
  assert.equal(ig.counts.scrolled, 1);
  assert.equal(ig.counts.cta, 1);
  assert.equal(ig.counts.clicked, 1);
  assert.equal(ig.counts.began, 1);
  assert.equal(ig.counts.signed_up, 1);
  assert.equal(ig.counts.call_completed, 1);
  assert.equal(ig.counts.saw_jobs, 1);
  assert.equal(ig.counts.paid, 0);
  assert.equal(ig.signupPct, 50);
  const g = r.sources.find((s) => s.key === "ref:google");
  assert.equal(g.returning, 1, "an account from before the range is returning");
  assert.equal(g.counts.signed_up, 0);
  assert.equal(g.counts.reached_stu, 1, "their Stu steps in the range still count");
  assert.equal(g.signupPct, null, "nobody there could sign up");
  assert.equal(r.summary.newVisitors, 2);
  assert.equal(r.summary.signupPct, 50);
  assert.equal(r.sources[0].key, "utm:ig", "most real visitors first");
});

test("drop-off: the furthest step of each real visitor who did not sign up, and the most common one", () => {
  assert.equal(dropOf(new Set(["real"])), "bounced");
  assert.equal(dropOf(new Set(["real", "engaged"])), "stayed");
  assert.equal(dropOf(new Set(["real", "engaged", "scrolled"])), "scrolled");
  assert.equal(dropOf(new Set(["real", "cta"])), "cta", "Start on the first screen counts even without a scroll");
  assert.equal(dropOf(new Set(["real", "cta", "clicked"])), "clicked");
  assert.equal(dropOf(new Set(["real", "clicked", "began"])), "began");
  assert.deepEqual(DROPS.map((d) => d.key), ["began", "clicked", "cta", "scrolled", "stayed", "bounced"]);
  const r = buildReport(input({
    rows: [
      row("a", "page_view"), row("a", "page_engaged", { engaged: 20, cta: true }),
      row("b", "page_view"), row("b", "page_engaged", { engaged: 20, cta: true }),
      row("c", "page_view"),
      row("d", "page_view"), row("d", "clicked_join"),
      row("s", "page_view"), row("s", "clicked_join"),
    ],
    people: { s: { internal: false, joined: T("11:00"), steps: {} } },
  }));
  assert.equal(r.dropTotal.total, 4, "the one who signed up is not a drop-off");
  assert.equal(r.dropTotal.by.cta, 2);
  assert.equal(r.dropTotal.by.bounced, 1);
  assert.equal(r.dropTotal.by.clicked, 1);
  assert.equal(r.dropTotal.top, "cta");
  assert.deepEqual(r.summary.biggestDrop, { key: "cta", label: "Saw Start, didn't click", n: 2, of: 4, pct: 50 });
});

test("homepage sections: the last new section on the home view that saw the most, non-clickers only", () => {
  const r = buildReport(input({
    rows: [
      row("a", "page_view"), row("a", "page_engaged", { sections: ["hero"] }), row("a", "page_engaged", { sections: ["hero", "how", "why"] }),
      row("b", "page_view"), row("b", "page_engaged", { sections: ["hero"] }),
      row("c", "page_view"), row("c", "page_engaged", { sections: [] }),
      row("d", "page_view"), row("d", "page_engaged", { sections: ["hero", "how"] }), row("d", "clicked_join"),
      row("e", "page_view", { path: "/blog/x" }), row("e", "page_engaged", { path: "/blog/x", sections: ["hero"] }),
    ],
  }));
  const by = Object.fromEntries(r.sections.map((s) => [s.key, s.n]));
  assert.equal(r.sectionBase, 3, "the clicker and the blog reader are not in it");
  assert.equal(by.why, 1);
  assert.equal(by.hero, 1);
  assert.equal(by.none, 1);
  assert.equal(by.how, 0);
  assert.deepEqual(r.sections.slice(0, 6).map((s) => s.key), ["hero", "how", "why", "proof", "faq", "footer"], "top to bottom");
});

test("internal visitors are left out unless asked; the device filter; days outside the range", () => {
  const rows = [
    row("team", "page_view"), row("m", "page_view"), row("dsk", "page_view", { device: "desktop" }), row("t", "page_view", { device: "tablet" }),
    row("late", "page_view", { day: "2026-11-05", at: T("01:00", "2026-11-05") }),
  ];
  const people = { team: { internal: true, joined: T("09:00"), steps: {} } };
  const r = buildReport(input({ rows, people }));
  assert.equal(r.summary.real, 3);
  assert.equal(r.summary.excluded, 1);
  assert.equal(buildReport(input({ rows, people, internal: true })).summary.real, 4);
  assert.equal(buildReport(input({ rows, people, device: "mobile" })).summary.real, 2, "tablets count as mobile");
  assert.equal(buildReport(input({ rows, people, device: "desktop" })).summary.real, 1);
});

test("crawlers: hits by bot family and path group; our audit bot only with internal; not recorded is not zero", () => {
  const bots = [
    { day: "2026-11-04", bot: "googlebot", path_group: "blog", hits: 40 },
    { day: "2026-11-04", bot: "googlebot", path_group: "home", hits: 2 },
    { day: "2026-11-04", bot: "gptbot", path_group: "report", hits: 7 },
    { day: "2026-11-04", bot: "studojo_audit", path_group: "home", hits: 3 },
    { day: "2026-11-04", bot: "monitor", path_group: "home", hits: 400 },
    { day: "2026-11-03", bot: "bingbot", path_group: "blog", hits: 9 },
  ];
  const r = buildReport(input({ bots }));
  assert.equal(r.summary.crawlers, 49);
  assert.equal(r.crawlers.rows[0].bot, "googlebot");
  assert.equal(r.crawlers.rows[0].groups.blog, 40);
  assert.equal(r.crawlers.groups.report, 7);
  assert.ok(!r.crawlers.rows.some((x) => x.bot === "studojo_audit"));
  assert.equal(buildReport(input({ bots, internal: true })).summary.crawlers, 452, "our audit bot and the health checks with internal");
  assert.ok(!r.crawlers.rows.some((x) => x.bot === "monitor"), "health checks are not crawlers");
  const none = buildReport(input({ bots: null }));
  assert.equal(none.summary.crawlers, null);
  assert.equal(none.crawlers.recorded, false);
});

test("before the site sent page_view, a visited_home is neither real nor a bot", () => {
  const rows = [row("old", "visited_home", { at: T("09:00") }), row("new", "visited_home", { at: T("11:00") }), row("p", "page_view", { at: T("11:05") })];
  const r = buildReport(input({ rows, pageViewStart: T("10:00") }));
  assert.equal(r.summary.likelyBots, 1);
  assert.equal(r.summary.beforeTracking, 1);
  assert.equal(r.summary.real, 1);
  assert.equal(buildReport(input({ rows, pageViewStart: null })).summary.likelyBots, 2, "no page_view on this database at all: every server-only visit is a likely bot");
});

test("by day over a range", () => {
  const r = buildReport(input({
    start: "2026-11-03", end: "2026-11-04",
    rows: [row("a", "page_view", { day: "2026-11-03" }), row("a", "page_view"), row("b", "visited_home", { day: "2026-11-03" })],
    bots: [{ day: "2026-11-04", bot: "gptbot", path_group: "home", hits: 5 }],
  }));
  assert.deepEqual(r.byDay, [
    { day: "2026-11-03", real: 1, likelyBots: 1, crawlers: 0, signedUp: 0 },
    { day: "2026-11-04", real: 1, likelyBots: 0, crawlers: 5, signedUp: 0 },
  ]);
  assert.equal(r.summary.real, 1, "one visitor over two days");
});
