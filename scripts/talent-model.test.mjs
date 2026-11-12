// node --test scripts/talent-model.test.mjs
// TALENT (12 Nov 2026): the /talent search (app/lib/talent/model.ts): the words a search is read into, where a student
// matches, the hard filters, the ranking, the graph and its layout, and the shortlist text. Every student here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  DEFAULT_FILTERS, TRAITS, askIn, scrubContacts, briefOf, cityKey, expText, fromOld, matchTerm, parseTerms, passes, quizFrom, roleKey, saidFrom,
  search, shortlistText, skillKey, skillName, skillsOf, traitsFrom, vocabOf,
} from "../app/lib/talent/model.ts";

const skill = (name, src = "resume") => ({ kind: "skill", text: `${name}: listed on the resume: ${name}`, org: null, when: null, qty: null, src });
const claim = (kind, text, over = {}) => ({ kind, text, org: null, when: null, qty: null, src: "call", ...over });
let n = 0;
const cand = (over = {}) => ({
  id: `u${++n}`, source: "call", optedIn: true, college: null, course: null, year: null, traits: null, quiz: null, said: null,
  name: "Test Person", email: "test@example.com", headline: null, summary: null, title: null, org: null, status: null,
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

test("TALENT-NET: the canonical role and family are a place to match, below what they said", () => {
  const sde = cand({ rolesWanted: ["SDE"], canon: ["Software engineering", "Software engineer"] });
  const h = matchTerm(sde, [], { key: "software engineer", label: "software engineer", kind: "text" });
  assert.equal(h.where, "Placed in");
  assert.ok(h.w < 3, "weaker than a wanted role");
  assert.ok(vocabOf([sde]).has("software engineer"), "the search box reads the canonical role as one term");
  assert.equal(matchTerm(cand({ rolesWanted: ["SDE"] }), [], { key: "software engineer", label: "software engineer", kind: "text" }), null);
});

test("words: experience and the shortlist text carry no email or phone", () => {
  assert.equal(expText(null), "Not said");
  assert.equal(expText(0), "Fresher");
  assert.equal(expText(8), "8 months");
  assert.equal(expText(18), "1.5 years");
  const c = cand({ name: "Asha Example", headline: "Analyst", email: "asha@example.com", cities: ["Pune"], rolesWanted: ["Data Analyst"], types: ["internship"], grad: 2026, expMonths: 6 });
  const brief = briefOf({ ...c, skills: [{ key: "sql", label: "SQL" }], traits: traitsFrom({ execution_style: "builder-first", strongest_hook: "Shipped a made-up app to 500 users." }) });
  assert.equal("email" in brief, false, "the shortlist keeps no email");
  const text = shortlistText([brief]);
  assert.match(text, /^1\. Asha Example: Analyst/);
  assert.match(text, /Wants: Data Analyst \(Internship\)/);
  assert.match(text, /Skills: SQL/);
  assert.match(text, /Work style: Builder/);
  assert.match(text, /Why them: Shipped a made-up app/);
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

test("TALENT-ALL resume read: spellings fold, a sentence-long archetype is a reason, nothing read is null", () => {
  const t = traitsFrom({ execution_style: "builder_first", breadth_vs_depth: "T_shaped", ownership_orientation: "end-to-end", ambiguity_tolerance: "High",
    trajectory_speed: "unknown", achievement_density: 140, has_portfolio_signal: true, distribution_signal: false, company_stage_fit: ["seed", "seed", "series-a"],
    archetype_label: "Finance professional experienced in portfolio operations and investment-analysis workflows within institutional environments." });
  assert.equal(t.style, "builder-first");
  assert.equal(t.shape, "t-shaped");
  assert.equal(t.ambiguity, "high");
  assert.equal(t.pace, null, "unknown is not a pace");
  assert.equal(t.numbers, 100, "clamped to 0..100");
  assert.equal(t.archetype, null);
  assert.match(t.archetypeWhy, /^Finance professional/);
  assert.deepEqual(t.stages, ["seed", "series-a"]);
  assert.equal(traitsFrom({ top_skills: ["Python"], domain: "data" }), null, "skills alone are not a read");
  assert.equal(traitsFrom(null), null);
});

test("TALENT-ALL quiz: clarity from either quiz, salary in lakh or rupees, dream companies split, nothing answered is null", () => {
  const q = quizFrom({ risk_tolerance: "high", clarity: "low", salary_expectations: { currency: "INR", min_annual_ctc: 6, max_annual_ctc: 900000 } },
    { clarity: "I know exactly, give me precise controls", career_stage: "Recent graduate (0-2 years exp.)", dream_companies: "Acme, Sample Corp" },
    { best_project: "Made-up: a bot that books lab slots.", outcome: "" }, ["Demo Ventures"]);
  assert.equal(q.clarity, "high", "the later quiz wins");
  assert.equal(q.risk, "high");
  assert.equal(q.ctcMin, 600000, "6 means 6 lakh");
  assert.equal(q.ctcMax, 900000);
  assert.deepEqual(q.dream, ["Demo Ventures", "Acme", "Sample Corp"]);
  assert.equal(q.outcome, null);
  assert.equal(quizFrom({}, null, {}, null), null);
  assert.equal(quizFrom({ salary_expectations: { currency: "USD", min_annual_ctc: 50000 } }, null, null, null), null, "not rupees: not shown");
});

test("TALENT-ALL call: wishes in a fixed order, repeats once, values stay out (they are chips)", () => {
  const s = saidFrom(" To work somewhere I own things ", [
    { dim: "value", avoid: false, text: "learning" },
    { dim: "other", avoid: false, text: "Wants a mentor" },
    { dim: "culture", avoid: true, text: "No 12-hour days" },
    { dim: "team", avoid: false, text: "Small team" },
    { dim: "team", avoid: false, text: "small team" },
  ], ["Sales", "Sales"]);
  assert.equal(s.whyNow, "To work somewhere I own things");
  assert.deepEqual(s.wishes.map((w) => w.dim), ["culture", "team", "other"]);
  assert.equal(s.wishes[0].avoid, true);
  assert.deepEqual(s.refuses, ["Sales"]);
  assert.equal(saidFrom(null, [], []), null);
});

test("TALENT-ALL old product: a Candidate from the resume read, quiz and profile", () => {
  const c = fromOld({
    id: "o1", name: null, email: "x@example.com", created: 5, optedIn: false, summary: null, flex: { why_now: "Made-up reason." },
    rp: { archetype_label: "Zero-to-One Builder", execution_style: "builder-first", experience_years: 1.5, top_skills: ["Python", "SQL"],
      most_recent_stack: ["Python"], likely_roles: ["Data Analyst"], geography: { city: "Bangalore" }, candidate_pitch: "Made-up pitch." },
    targetRoles: ["Growth Intern"], industries: ["fintech"], dream: null, answers: { job_type: "Internship", location: "Remote" },
    prefs: { locations: ["Pune", "Remote"], work_mode: "flexible", industry_interests: ["fintech", "ai"] }, skills: ["Excel"],
    college: "Sample College", course: "BBA", year: "Class of 2026",
  });
  assert.equal(c.source, "old");
  assert.equal(c.optedIn, false);
  assert.equal(c.name, "A Studojo student");
  assert.equal(c.headline, "Zero-to-One Builder");
  assert.equal(c.summary, "Made-up pitch.", "the pitch when there is no profile summary");
  assert.equal(c.expMonths, 18);
  assert.deepEqual(c.cities, ["Pune", "Bangalore"], "wanted first, remote is not a city");
  assert.deepEqual(c.modes, ["flexible"]);
  assert.deepEqual(c.types, ["internship"]);
  assert.equal(c.grad, 2026);
  assert.deepEqual(c.rolesWanted, ["Growth Intern"]);
  assert.deepEqual(c.rolesAdjacent, ["Data Analyst"]);
  assert.deepEqual(c.sectors, ["fintech", "ai"]);
  assert.deepEqual(skillsOf(c).map((s) => s.label), ["Python", "SQL", "Excel"]);
  assert.equal(c.said.whyNow, "Made-up reason.");
  assert.equal(matchTerm(c, skillsOf(c), { key: "remote", label: "Remote", kind: "mode" }).detail, "Flexible");
  assert.equal(matchTerm(c, skillsOf(c), { key: "sample college", label: "sample college", kind: "text" }).where, "College");
  const bare = fromOld({ id: "o2", name: "Made Up", email: null, created: null, optedIn: false, summary: null, flex: null, rp: null, targetRoles: null,
    industries: null, dream: null, answers: null, prefs: null, skills: null, college: "Sample College", course: null, year: "Second year" });
  assert.equal(bare.traits, null);
  assert.equal(bare.quiz, null);
  assert.equal(bare.grad, null);
});

test("TALENT-ALL filters: source, opted in, and traits that need the signal present", () => {
  const builder = cand({ traits: traitsFrom({ execution_style: "builder-first", ownership_orientation: "end-to-end", achievement_density: 60 }) });
  const old = cand({ source: "old", optedIn: false, quiz: quizFrom({ risk_tolerance: "high", company_size: "1-50" }, null, null, null) });
  const counted = cand({ claims: [claim("outcome", "Grew a made-up page to 4,000 followers"), claim("outcome", "Ran the fest", { qty: "3 days" }), claim("outcome", "Helped out")] });
  const none = cand();
  const keys = (f) => [builder, old, counted, none].filter((c) => passes(c, F(f))).map((c) => c.id);
  assert.deepEqual(keys({ src: "old" }), [old.id]);
  assert.deepEqual(keys({ optin: true }), [builder.id, counted.id, none.id]);
  assert.deepEqual(keys({ traits: ["builder", "owner"] }), [builder.id], "every trait required");
  assert.deepEqual(keys({ traits: ["numbers"] }), [builder.id, counted.id], "60% of bullets, or 2 of 3 call results with a number");
  assert.deepEqual(keys({ traits: ["risk", "startup"] }), [old.id]);
  assert.deepEqual(keys({ traits: ["clear"] }), [], "a student we know nothing about is not shown for a trait");
  assert.ok(TRAITS.every((t) => t.label && t.hint && !/[\u2013\u2014]/.test(t.label + t.hint)));
});

test("TALENT-ALL ranking: on a tie, opted-in students first", () => {
  const a = cand({ id: "old-a", source: "old", optedIn: false, rolesWanted: ["Data Analyst"] });
  const b = cand({ id: "call-b", rolesWanted: ["Data Analyst"] });
  const t = [{ key: "data analyst", label: "data analyst", kind: "text" }];
  assert.deepEqual(search([a, b], t, F()).map((r) => r.c.id), ["call-b", "old-a"]);
});

test("TALENT-ALL wiring: explicit opt-outs left out, no resume text or contact read from the old product", () => {
  const server = readFileSync(new URL("../app/lib/talent/talent.server.ts", import.meta.url), "utf8");
  assert.match(server, /if \(p\?\.has_page && !p\.opted\) continue/);
  assert.doesNotMatch(server, /resume_text|personal_info'->'(email|phone)|personal_info->>'(email|phone)'/);
  assert.match(server, /resume_profile - 'name' - 'location'/);
});

test("TALENT-ALL contacts: emails and Indian mobile numbers hidden in their words, counts and years kept", () => {
  assert.equal(scrubContacts("Mail me at made.up@example.com or call 98765 43210."), "Mail me at (email hidden) or call (phone hidden).");
  assert.equal(scrubContacts("+91-9876543210"), "(phone hidden)");
  assert.equal(scrubContacts("Grew it from 2,000 to 40,000 followers in 2024 with 6000000 views"), "Grew it from 2,000 to 40,000 followers in 2024 with 6000000 views");
  const q = quizFrom({}, null, { best_project: "Built a bot, demo at made.up@example.com" }, null);
  assert.equal(q.bestProject, "Built a bot, demo at (email hidden)");
});
