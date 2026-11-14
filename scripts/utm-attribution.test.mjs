// node --test scripts/utm-attribution.test.mjs
// UTM links for the relaunched product (2 Nov 2026): the naming scheme
// (app/lib/utm-dictionary.ts) and the link report's crediting rules
// (app/lib/utm-attribution.ts): utm_id = slug first, utm_* matching as the
// fallback, IST day ranges, internal accounts left out, bots apart.
// Imports the TypeScript source directly: Node 22.18+ strips the types itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { autoSlug, fullUrl, validateLink, CAMPAIGN_RE, DESTINATIONS } from "../app/lib/utm-dictionary.ts";
import { buildReport, indexLinks, linkFor, rate, touchKey, withUtmId } from "../app/lib/utm-attribution.ts";

const link = (id, slug, source, medium, campaign, content = null, term = null) => ({ id, slug, source, medium, campaign, content, term });
const LINKS = [
  link("1", "linkedin-post-launch-nov26", "linkedin", "post", "launch-nov26"),
  link("2", "instagram-bio-launch-nov26", "instagram", "bio", "launch-nov26"),
  link("3", "college-ambassador-iitb-launch-nov26", "college", "ambassador", "launch-nov26", "iitb"),
  link("4", "college-ambassador-launch-nov26", "college", "ambassador", "launch-nov26"),
];

test("the naming scheme: lowercase-hyphen campaigns, dictionary source and medium, our hosts only", () => {
  const ok = { base_url: "https://studojo.com/", utm_source: "linkedin", utm_medium: "post", utm_campaign: "launch-nov26", slug: "linkedin-post-launch-nov26" };
  assert.deepEqual(validateLink(ok), []);
  assert.deepEqual(validateLink({ ...ok, base_url: "https://platform.studojo.com/join" }), []);
  assert.equal(validateLink({ ...ok, utm_campaign: "launch_nov26" }).length, 1, "underscores are the old scheme");
  assert.equal(validateLink({ ...ok, utm_campaign: "Launch Nov26" }).length, 1);
  assert.equal(validateLink({ ...ok, utm_source: "facebook" }).length, 1);
  assert.equal(validateLink({ ...ok, utm_medium: "social" }).length, 1);
  assert.equal(validateLink({ ...ok, base_url: "https://evil.example/" }).length, 1);
  assert.equal(validateLink({ ...ok, base_url: "http://studojo.com/" }).length, 1, "https only");
  assert.equal(validateLink({ ...ok, slug: "" }).length, 1, "a link needs a slug (its utm_id)");
  for (const s of ["offline", "reddit", "referral"]) assert.deepEqual(validateLink({ ...ok, utm_source: s }), [], s);
  for (const m of ["bio", "story", "reel", "group", "ambassador", "poster", "newsletter"]) assert.deepEqual(validateLink({ ...ok, utm_medium: m }), [], m);
  assert.ok(CAMPAIGN_RE.test("launch-nov26"));
  assert.deepEqual(DESTINATIONS.map((d) => d.url), ["https://studojo.com/", "https://studojo.com/", "https://studojo.com/blog", "https://studojo.com/reports"]);
});

test("auto slug and full URL: the full URL carries utm_id = slug", () => {
  assert.equal(autoSlug({ utm_source: "linkedin", utm_medium: "post", utm_campaign: "launch-nov26" }), "linkedin-post-launch-nov26");
  assert.equal(autoSlug({ utm_source: "college", utm_medium: "ambassador", utm_campaign: "launch-nov26", utm_content: "iit-bombay" }), "college-ambassador-iit-bombay-launch-nov26");
  const u = new URL(fullUrl({ base_url: "https://studojo.com/", utm_source: "x", utm_medium: "post", utm_campaign: "launch-nov26", slug: "x-post-launch-nov26" }));
  assert.equal(u.searchParams.get("utm_id"), "x-post-launch-nov26");
  assert.equal(u.searchParams.get("utm_source"), "x");
});

test("a touch is credited on utm_id first, then on matching tags, the most specific link winning", () => {
  const ix = indexLinks(LINKS);
  assert.equal(linkFor(touchKey({ utm_id: "Instagram-Bio-Launch-Nov26", utm_source: "linkedin" }), ix)?.id, "2", "utm_id wins, case-insensitive");
  assert.equal(linkFor(touchKey({ utm_id: "gone-link", utm_source: "linkedin", utm_medium: "post", utm_campaign: "launch-nov26" }), ix), null, "an unknown utm_id is no link");
  assert.equal(linkFor(touchKey({ utm_source: "LinkedIn", utm_medium: "post", utm_campaign: "launch-nov26" }), ix)?.id, "1", "fallback on tags");
  assert.equal(linkFor(touchKey({ utm_source: "college", utm_medium: "ambassador", utm_campaign: "launch-nov26", utm_content: "iitb" }), ix)?.id, "3");
  assert.equal(linkFor(touchKey({ utm_source: "college", utm_medium: "ambassador", utm_campaign: "launch-nov26", utm_content: "nitk" }), ix)?.id, "4");
  assert.equal(linkFor(touchKey({ utm_source: "linkedin", utm_medium: "dm", utm_campaign: "launch-nov26" }), ix), null);
  assert.equal(touchKey({ landing_path: "/", referrer: "https://google.com/" }), null, "no tags, no touch");
});

test("the product's source row lacks utm_id: the journey event of the same touch supplies it", () => {
  const row = touchKey({ utm_source: "linkedin", utm_medium: "post", utm_campaign: "launch-nov26" });
  const ev = touchKey({ utm_source: "linkedin", utm_medium: "post", utm_campaign: "launch-nov26", utm_id: "linkedin-post-launch-nov26" });
  assert.equal(withUtmId(row, ev).utm_id, "linkedin-post-launch-nov26");
  assert.equal(withUtmId(row, touchKey({ utm_source: "x", utm_campaign: "launch-nov26", utm_id: "x-post" })).utm_id, null, "a different touch is not borrowed");
  assert.equal(withUtmId(null, ev).utm_id, "linkedin-post-launch-nov26");
  assert.equal(withUtmId(row, null), row);
});

test("the report: IST range, bots apart, visitors once, internal left out, campaigns beyond links", () => {
  const t = (o) => touchKey(o);
  const LI = { utm_source: "linkedin", utm_medium: "post", utm_campaign: "launch-nov26", utm_id: "linkedin-post-launch-nov26" };
  const r = buildReport({
    links: LINKS,
    start: "2026-11-02",
    end: "2026-11-02",
    internal: false,
    clicks: [
      { linkId: "1", day: "2026-11-02", bot: false, n: 10 },
      { linkId: "1", day: "2026-11-02", bot: true, n: 4 },
      { linkId: "1", day: "2026-11-01", bot: false, n: 99 },
    ],
    visitors: [
      { id: "v1", day: "2026-11-02", internal: false, touch: t(LI) },
      { id: "v1", day: "2026-11-02", internal: false, touch: t({ ...LI, utm_content: "again" }) },
      { id: "v2", day: "2026-11-02", internal: false, touch: t(LI) },
      { id: "v3", day: "2026-11-02", internal: true, touch: t(LI) },
      { id: "v4", day: "2026-11-01", internal: false, touch: t(LI) },
    ],
    users: [
      { day: "2026-11-02", internal: false, touch: t(LI), onboarded: true, paid: true, revenue: 49900 },
      { day: "2026-11-02", internal: false, touch: t(LI), onboarded: true, paid: false, revenue: 0 },
      { day: "2026-11-02", internal: true, touch: t(LI), onboarded: true, paid: true, revenue: 99900 },
      { day: "2026-11-01", internal: false, touch: t(LI), onboarded: true, paid: true, revenue: 99900 },
      { day: "2026-11-02", internal: false, touch: t({ utm_source: "meta", utm_medium: "paid", utm_campaign: "launch-nov26", utm_content: "reel-a" }), onboarded: false, paid: false, revenue: 0 },
      { day: "2026-11-02", internal: false, touch: null, onboarded: true, paid: false, revenue: 0 },
    ],
  });
  assert.deepEqual(r.links["1"], { clicks: 10, botClicks: 4, visitors: 2, signups: 2, onboarded: 2, paid: 1, revenue: 49900 });
  assert.deepEqual(r.links["2"], { clicks: 0, botClicks: 0, visitors: 0, signups: 0, onboarded: 0, paid: 0, revenue: 0 });
  const c = r.campaigns.find((x) => x.campaign === "launch-nov26");
  assert.equal(c.links, 4);
  assert.equal(c.signups, 3, "the Meta ad sign-up counts for the campaign, with no link");
  assert.equal(c.clicks, 10);
  assert.deepEqual(r.totals, { signups: 4, viaLink: 2, tagged: 3, visitors: 2 });
  const withInternal = buildReport({ links: LINKS, start: "2026-11-02", end: "2026-11-02", internal: true, clicks: [], visitors: [], users: [{ day: "2026-11-02", internal: true, touch: t(LI), onboarded: false, paid: false, revenue: 0 }] });
  assert.equal(withInternal.links["1"].signups, 1);
  assert.equal(rate(1, 3), 33.3);
  assert.equal(rate(1, 0), null);
});

test("wiring: /go adds utm_id on the website; the report is admin only and reads the dashboards' rules", () => {
  const api = readFileSync(new URL("../app/routes/api.utm-report.tsx", import.meta.url), "utf8");
  assert.match(api, /requireAdmin\(request\)/);
  assert.match(api, /stepAt\(d, u, "onboarded"\)/);
  assert.match(api, /stepAt\(d, u, "paid"\)/);
  assert.match(api, /REVENUE_KINDS\.includes\(kind\)/, "revenue from real payments, autopay once in the bank, as the dashboards");
  assert.match(api, /Asia\/Kolkata/);
  assert.match(api, /accessMode: "read only"/);
  const page = readFileSync(new URL("../app/routes/utm-builder.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(page, /outreach\/onboarding\/upload|label: "Outreach"/, "the old destinations are gone");
  assert.match(page, /QRCode\.toDataURL/);
  for (const f of ["../app/routes/utm-builder.tsx", "../app/lib/utm-dictionary.ts", "../app/lib/utm-attribution.ts", "../app/routes/api.utm-report.tsx"]) {
    assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), "utf8"), /[–—]/, `${f}: no en or em dashes`);
  }
});
