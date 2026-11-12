// node --test scripts/talent-model.test.mjs
// TALENT (12 Nov 2026): the /talent search (app/lib/talent/model.ts): the words a search is read into, where a student
// matches, the hard filters, the ranking, the graph and its layout, and the shortlist text. Every student here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FILTERS, askIn, briefOf, cityKey, expText, graphOf, layout, matchTerm, parseTerms, passes, roleKey, search, shortlistText,
  skillKey, skillName, skillsOf, vocabOf,
} from "../app/lib/talent/model.ts";

const skill = (name, src = "resume") => ({ kind: "skill", text: `${name}: listed on the resume: ${name}`, org: null, when: null, qty: null, src });
const claim = (kind, text, over = {}) => ({ kind, text, org: null, when: null, qty: null, src: "call", ...over });
let n = 0;
const cand = (over = {}) => ({
  id: `u${++n}`, name: "Test Person", email: "test@example.com", headline: null, summary: null, title: null, org: null, status: null,
  expMonths: null, cities: [], relocate: null, modes: [], types: [], payText: null, fixedMin: null, stipendMin: null, notice: null, from: null,
  intent: null, degreeStatus: null, degree: null, grad: null, rolesWanted: [], rolesAdjacent: [], sectors: [], values: [], derivedAt: 0, claims: [],
  ...over,
});
const F = (over = {}) => ({ ...DEFAULT_FILTERS, ...over });

test("skill names: the resume form gives the name, a call sentence gives none, spellings fold", () => {
  assert.equal(skillName("Power BI: listed on the resume: Power BI"), "Power BI");
  assert.equal(skillName("Ran the college fest's Instagram and grew it to 4,000 followers."), null);
  assert.equal(skillName("Figma"), "Figma", "a bare short name");
  assert.equal(skillKey("MS Excel"), "excel");
  assert.equal(skillKey("Advanced Excel"), "excel");
  assert.equal(skillKey("ReactJS"), "react");
  assert.equal(skillKey("Node.js"), "node.js");
  assert.equal(skillKey("PostgreSQL"), "postgresql");
  const c = cand({ claims: [skill("MS Excel"), skill("Excel"), skill("Python"), claim("skill", "Built dashboards for the sales team every week.")] });
  assert.deepEqual(skillsOf(c).map((s) => s.label), ["Excel", "Python"], "one per key, call sentences left out");
});

test("cities and roles: aliases fold, intern titles fold into the role", () => {
  assert.equal(cityKey("Bangalore"), "bengaluru");
  assert.equal(cityKey("Gurgaon"), "gurugram");
  assert.equal(cityKey("New Delhi"), "delhi ncr");
  assert.equal(roleKey("Full Stack Developer Intern"), "full stack developer");
  assert.equal(roleKey("Data Analyst (Internship)"), "data analyst");
  assert.equal(roleKey("Junior Data Analyst"), "data analyst");
  assert.equal(roleKey("Marketing Associate"), "marketing associate", "associate is a role, not a level");
});

test("the search box: known phrases first, cities, grad years, job type, remote, filler dropped", () => {
  const vocab = new Set(["data analyst", "python", "sql", "power bi", "social media manager"]);
  const cities = new Set(["bengaluru", "mumbai", "delhi ncr"]);
  const t = parseTerms("Data analyst who knows Python SQL in Bangalore 2026 intern remote", vocab, cities);
  assert.deepEqual(t.map((x) => `${x.kind}:${x.key}`), ["text:data analyst", "text:python", "text:sql", "city:bengaluru", "grad:2026", "type:internship", "mode:remote"]);
  assert.deepEqual(parseTerms("power bi", vocab, cities).map((x) => x.label), ["Power BI"]);
  assert.deepEqual(parseTerms("growth marketing, d2c", vocab, cities).map((x) => x.key), ["growth marketing", "d2c"], "commas keep unknown words together");
  assert.deepEqual(parseTerms("growth marketing python", vocab, cities).map((x) => x.key), ["growth marketing", "python"]);
  assert.deepEqual(parseTerms("full time gurgaon", vocab, cities).map((x) => `${x.kind}:${x.key}`), ["type:full_time", "city:gurugram"]);
  assert.deepEqual(parseTerms("growth marketing, d2c", new Set([...vocab, "marketing"]), cities).map((x) => x.key), ["growth marketing", "d2c"],
    "with commas a known word inside a phrase stays in it");
  assert.deepEqual(parseTerms("founder's office", vocab, cities).map((x) => x.label), ["founder's office"]);
  assert.deepEqual(parseTerms("fresher python", vocab, cities).map((x) => `${x.kind}:${x.key}`), ["exp:fresher", "text:python"]);
  assert.deepEqual(parseTerms("", vocab, cities), []);
  assert.deepEqual(parseTerms("someone good at", vocab, cities), [], "only filler");
});

test("where a student matches: the strongest place wins, words inside a longer text count, short words need a whole word", () => {
  const c = cand({
    rolesWanted: ["Data Analyst"], title: "Analytics Intern", claims: [skill("Python"), skill("JavaScript"), claim("outcome", "Cut the weekly report from 3 hours to 20 minutes with SQL.")],
    summary: "Wants a growth role at a fintech.",
  });
  const sk = skillsOf(c);
  assert.equal(matchTerm(c, sk, { key: "data analyst", label: "data analyst", kind: "text" }).where, "Wants to be");
  assert.equal(matchTerm(c, sk, { key: "python", label: "Python", kind: "text" }).where, "Skill");
  assert.equal(matchTerm(c, sk, { key: "sql", label: "SQL", kind: "text" }).where, "Result");
  assert.equal(matchTerm(c, sk, { key: "java", label: "Java", kind: "text" }), null, "java is not javascript");
  assert.equal(matchTerm(c, sk, { key: "fintech", label: "fintech", kind: "text" }).where, "From the call");
  const fo = cand({ rolesWanted: ["Founder's Office Associate"] });
  assert.equal(matchTerm(fo, [], { key: "founder's office", label: "founder's office", kind: "text" }).where, "Wants to be", "apostrophes match");
  assert.equal(matchTerm(fo, [], { key: "founders office", label: "founders office", kind: "text" }).where, "Wants to be", "with or without");
  assert.equal(matchTerm(cand({ expMonths: 4 }), [], { key: "fresher", label: "Fresher", kind: "exp" }).detail, "4 months");
  assert.equal(matchTerm(cand({ expMonths: 30 }), [], { key: "fresher", label: "Fresher", kind: "exp" }), null);
  const part = matchTerm(c, sk, { key: "weekly sql", label: "weekly sql", kind: "text" });
  assert.ok(part && part.w < 1.5, "every word present but not as a phrase counts for less");
});

test("city terms: Delhi NCR is one market, relocating counts for less", () => {
  const ncr = cand({ cities: ["Noida"] });
  const mover = cand({ cities: ["Pune"], relocate: "yes" });
  const t = { key: "gurugram", label: "Gurugram", kind: "city" };
  assert.equal(matchTerm(ncr, [], t).w, 3);
  assert.equal(matchTerm(mover, [], t).detail, "Open to relocating");
  assert.ok(matchTerm(mover, [], t).w < 3);
  assert.equal(matchTerm(cand({ cities: ["Pune"] }), [], t), null);
});

test("hard filters: a student who did not say is kept; one who said otherwise is not", () => {
  const silent = cand();
  assert.ok(passes(silent, F({ type: "internship", exp: "fresher", budget: "y4" })));
  assert.ok(!passes(cand({ types: ["full_time"] }), F({ type: "internship" })));
  assert.ok(passes(cand({ types: ["full_time", "internship"] }), F({ type: "internship" })));
  assert.ok(passes(cand({ expMonths: 6 }), F({ exp: "fresher" })));
  assert.ok(!passes(cand({ expMonths: 18 }), F({ exp: "fresher" })));
  assert.ok(passes(cand({ expMonths: 18 }), F({ exp: "1-3" })));
  assert.ok(!passes(cand({ expMonths: 40 }), F({ exp: "1-3" })));
  assert.ok(passes(cand({ expMonths: 40 }), F({ exp: "3+" })));
  assert.ok(!passes(cand({ grad: 2025 }), F({ grad: 2026 })));
  assert.ok(!passes(silent, F({ grad: 2026 })), "a grad-year filter needs a grad year");
  assert.ok(!passes(cand({ intent: "open" }), F({ active: true })));
  assert.ok(passes(cand({ cities: ["Gurgaon"] }), F({ city: "delhi ncr" })));
  assert.ok(passes(cand({ cities: ["Pune"], relocate: "yes" }), F({ city: "mumbai" })));
  assert.ok(!passes(cand({ cities: ["Pune"], relocate: "yes" }), F({ city: "mumbai", relocate: false })));
});

test("budget: compared in the student's own unit", () => {
  const stipend = cand({ stipendMin: 20_000 });
  const salary = cand({ fixedMin: 700_000 });
  assert.equal(askIn(stipend, "year"), 240_000);
  assert.equal(askIn(salary, "month"), 58_333);
  assert.ok(passes(stipend, F({ budget: "m30" })));
  assert.ok(!passes(stipend, F({ budget: "m15" })));
  assert.ok(passes(salary, F({ budget: "y10" })));
  assert.ok(!passes(salary, F({ budget: "y6" })));
});

test("ranking: more terms matched first, then strength, then actively looking, then the fuller profile", () => {
  const all = cand({ id: "all", rolesWanted: ["Data Analyst"], claims: [skill("Python")] });
  const one = cand({ id: "one", rolesWanted: ["Data Analyst"], intent: "active" });
  const weak = cand({ id: "weak", summary: "Likes data analyst work.", intent: "active" });
  const strongOpen = cand({ id: "strong-open", rolesWanted: ["Data Analyst"], intent: "open" });
  const none = cand({ id: "none", rolesWanted: ["Designer"] });
  const terms = [{ key: "data analyst", label: "data analyst", kind: "text" }, { key: "python", label: "Python", kind: "text" }];
  const ids = search([weak, none, strongOpen, one, all], terms, F()).map((r) => r.c.id);
  assert.deepEqual(ids, ["all", "one", "strong-open", "weak"]);
  const smm = cand({ id: "smm", rolesWanted: ["Social Media Manager"] });
  const smmMumbai = cand({ id: "smm-mumbai", rolesWanted: ["Social Media Manager"], cities: ["Mumbai"] });
  const mumbaiOnly = cand({ id: "mumbai-only", rolesWanted: ["Chef"], cities: ["Mumbai"] });
  const t2 = [{ key: "social media manager", label: "social media manager", kind: "text" }, { key: "mumbai", label: "Mumbai", kind: "city" }];
  assert.deepEqual(search([mumbaiOnly, smm, smmMumbai], t2, F()).map((r) => r.c.id), ["smm-mumbai", "smm"], "a city alone ranks, it does not let a student in");
  assert.deepEqual(search([mumbaiOnly, smm], [t2[1]], F()).map((r) => r.c.id), ["mumbai-only"], "a search of only a city lists that city");
  const browse = search([cand({ id: "b1" }), cand({ id: "b2", intent: "active" }), cand({ id: "b3", headline: "x", summary: "y" })], [], F()).map((r) => r.c.id);
  assert.deepEqual(browse, ["b2", "b3", "b1"], "no search: actively looking, then the fuller profile");
});

test("graph with a search: a hub per matched term, each student linked to what it matched", () => {
  const a = cand({ id: "a", rolesWanted: ["Data Analyst"], claims: [skill("Python")] });
  const b = cand({ id: "b", claims: [skill("Python")] });
  const terms = [{ key: "data analyst", label: "data analyst", kind: "text" }, { key: "python", label: "Python", kind: "text" }, { key: "rust", label: "rust", kind: "text" }];
  const g = graphOf(search([a, b], terms, F()), terms, 60);
  assert.deepEqual(g.hubs.map((h) => [h.label, h.n]), [["data analyst", 1], ["Python", 2]], "a term nobody matched has no hub");
  assert.deepEqual(g.links.find((l) => l.id === "a").hubs, ["t:text:data analyst", "t:text:python"]);
});

test("graph with no search: top roles and skills as hubs, students with none stay off", () => {
  const pool = [
    cand({ id: "p1", rolesWanted: ["Data Analyst Intern"], claims: [skill("SQL"), skill("Python")] }),
    cand({ id: "p2", rolesWanted: ["Data Analyst"], claims: [skill("SQL")] }),
    cand({ id: "p3", rolesWanted: ["Chef"], claims: [skill("Knife work")] }),
  ];
  const g = graphOf(search(pool, [], F()), [], 60);
  assert.deepEqual(g.hubs.map((h) => h.key), ["r:data analyst", "s:sql"], "only what two or more share");
  assert.deepEqual(g.links.map((l) => l.id).sort(), ["p1", "p2"]);
  assert.ok(g.links.every((l) => l.hubs.length <= 3));
});

test("layout: deterministic, in bounds, no two students overlap, a full match sits nearer the middle", () => {
  const g = {
    hubs: [{ key: "h1", label: "A", kind: "term", n: 3 }, { key: "h2", label: "B", kind: "term", n: 3 }, { key: "h3", label: "C", kind: "term", n: 3 }],
    links: [
      ...Array.from({ length: 25 }, (_, i) => ({ id: `full${i}`, hubs: ["h1", "h2", "h3"] })),
      { id: "only1", hubs: ["h1"] },
    ],
  };
  const rank = {};
  g.links.forEach((l, i) => (rank[l.id] = i));
  const r = () => 8;
  const one = layout(g, rank, 1000, 620, r);
  assert.deepEqual(layout(g, rank, 1000, 620, r), one, "same input, same picture");
  const pts = Object.values(one.students);
  for (const p of pts) assert.ok(p.x >= 8 && p.x <= 992 && p.y >= 8 && p.y <= 612);
  let minGap = Infinity;
  for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) minGap = Math.min(minGap, Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y));
  assert.ok(minGap >= 15, `students overlap (closest ${minGap.toFixed(1)})`);
  const d = (p) => Math.hypot(p.x - 500, p.y - 310);
  assert.ok(d(one.students.full0) < d(one.students.only1), "matching all three sits nearer the centre than matching one");
  const wideChips = layout(g, rank, 460, 600, r, () => 100);
  for (const k of ["h1", "h2", "h3"]) assert.ok(wideChips.hubs[k].x >= 104 && wideChips.hubs[k].x <= 356, "a chip stays inside a narrow canvas");
  const h1 = one.hubs.h1;
  assert.ok(Math.hypot(one.students.only1.x - h1.x, one.students.only1.y - h1.y) < 200, "a single match sits near its hub");
});

test("words: experience and the shortlist text carry no email or phone", () => {
  assert.equal(expText(null), "Not said");
  assert.equal(expText(0), "Fresher");
  assert.equal(expText(8), "8 months");
  assert.equal(expText(18), "1.5 years");
  const c = cand({ name: "Asha Example", headline: "Analyst", email: "asha@example.com", cities: ["Pune"], rolesWanted: ["Data Analyst"], types: ["internship"], grad: 2026, expMonths: 6 });
  const brief = briefOf({ ...c, skills: [{ key: "sql", label: "SQL" }] });
  assert.equal("email" in brief, false, "the shortlist keeps no email");
  const text = shortlistText([brief]);
  assert.match(text, /^1\. Asha Example: Analyst/);
  assert.match(text, /Wants: Data Analyst \(Internship\)/);
  assert.match(text, /Skills: SQL/);
  assert.doesNotMatch(text, /@|\+91|\d{10}/);
});

test("vocab: the pool's skills and wanted roles", () => {
  const v = vocabOf([cand({ rolesWanted: ["Social Media Manager Intern"], claims: [skill("Canva")] })]);
  assert.ok(v.has("social media manager") && v.has("canva"));
});

test("wiring: the API is admin only, the page is routed and in the menu, the shortlist copy has no email", () => {
  const api = readFileSync(new URL("../app/routes/api.talent.tsx", import.meta.url), "utf8");
  assert.match(api, /await requireAdmin\(request\)/);
  const routes = readFileSync(new URL("../app/routes.ts", import.meta.url), "utf8");
  assert.match(routes, /route\("talent", "routes\/talent\.tsx"\)/);
  assert.match(routes, /route\("api\/talent", "routes\/api\.talent\.tsx"\)/);
  const nav = readFileSync(new URL("../app/components/admin-header.tsx", import.meta.url), "utf8");
  assert.match(nav, /to: "\/talent"/);
  const server = readFileSync(new URL("../app/lib/talent/talent.server.ts", import.meta.url), "utf8");
  assert.match(server, /'link' = 'true'/, "only public pages");
  assert.match(server, /'managers' = 'true'/, "only students who let hiring managers find them");
  assert.match(server, /accessMode: "read only"/);
});
