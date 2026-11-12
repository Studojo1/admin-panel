// node --test scripts/talent-families.test.mjs
// TALENT-NET (12 Nov 2026, the owner: "need our mapping to be more accurate and on the top show a bar with total number
// of students, the graph should be like a neural network, where if i click then go deeper to see each student"): the
// career families and canonical roles (app/lib/talent/families.ts), the network's counts and its layout
// (app/lib/talent/net-layout.ts). Every student here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  BROAD_COURSE_SKILLS, DUPES, FAMILY_ORDER, SKILLS_MIN, TAXONOMY, UNSAID, canonOf, countsOf, famLabel, familiesIn, netOf, placeOf, roleLabelOf, within,
} from "../app/lib/talent/families.ts";
import { netLayout } from "../app/lib/talent/net-layout.ts";
import { skillsOf } from "../app/lib/talent/model.ts";

const skill = (name) => ({ kind: "skill", text: `${name}: listed on the resume: ${name}`, org: null, when: null, qty: null, src: "resume" });
let n = 0;
const cand = (over = {}) => ({
  id: `f${++n}`, source: "call", optedIn: true, college: null, course: null, year: null, traits: null, quiz: null, said: null,
  name: "Test Person", email: "test@example.com", headline: null, summary: null, title: null, org: null, status: null,
  expMonths: null, cities: [], relocate: null, modes: [], types: [], payText: null, fixedMin: null, stipendMin: null, notice: null, from: null,
  intent: null, degreeStatus: null, degree: null, grad: null, rolesWanted: [], rolesAdjacent: [], sectors: [], values: [], derivedAt: 0, claims: [],
  ...over,
});
const refuses = (...xs) => ({ whyNow: null, wishes: [], refuses: xs });
const place = (over) => {
  const c = cand(over);
  return placeOf(c, skillsOf(c));
};
const at = (over) => {
  const p = place(over);
  return `${p.family} ${p.role}`;
};

test("taxonomy: no phrase in two roles, every label plain words with no dashes, keys unique", () => {
  assert.deepEqual(DUPES, []);
  const keys = new Set();
  for (const f of TAXONOMY) {
    assert.ok(f.label && f.short);
    for (const [slug, label] of f.roles) {
      const k = `${f.key}/${slug}`;
      assert.ok(!keys.has(k), k);
      keys.add(k);
      assert.equal(roleLabelOf(k), label);
      assert.doesNotMatch(label + f.label + f.short, /[–—]/);
    }
  }
  assert.deepEqual(FAMILY_ORDER.slice(-2), ["other", "none"]);
  assert.equal(famLabel("none"), "Not enough data");
  assert.equal(roleLabelOf("data/unsaid"), UNSAID);
});

test("synonyms fold into one canonical role; backend, frontend and full stack stay roles under Software engineering", () => {
  for (const r of ["SDE", "SDE 1", "Software Developer", "Software Engineer Intern", "Programmer", "Developer"]) assert.equal(at({ rolesWanted: [r] }), "software software/swe", r);
  assert.equal(at({ rolesWanted: ["Backend Developer"] }), "software software/backend");
  assert.equal(at({ rolesWanted: ["Back-end engineer"] }), "software software/backend");
  assert.equal(at({ rolesWanted: ["Node.js Developer"] }), "software software/backend");
  assert.equal(at({ rolesWanted: ["Front End Developer"] }), "software software/frontend");
  assert.equal(at({ rolesWanted: ["MERN Stack Developer"] }), "software software/fullstack");
  assert.equal(at({ rolesWanted: ["Full-Stack Developer Intern"] }), "software software/fullstack");
  assert.equal(at({ rolesWanted: ["Data Analyst"] }), "data data/analyst");
  assert.equal(at({ rolesWanted: ["Data Analysts"] }), "data data/analyst", "a plural is the same role");
  assert.equal(at({ rolesWanted: ["Business Analyst"] }), "data data/ba");
  assert.equal(at({ rolesWanted: ["Financial Analyst"] }), "finance finance/analyst");
  assert.equal(at({ rolesWanted: ["FP&A Analyst"] }), "finance finance/analyst");
  assert.equal(at({ rolesWanted: ["Founder's Office"] }), "consulting consulting/foa");
  assert.equal(at({ rolesWanted: ["Founders Office Associate"] }), "consulting consulting/foa");
  assert.equal(at({ rolesWanted: ["UI/UX Designer"] }), "design design/uiux");
  assert.equal(at({ rolesWanted: ["AI/ML Engineer"] }), "ai ai/ai");
  assert.equal(at({ rolesWanted: ["ML Engineer"] }), "ai ai/ml");
  assert.equal(at({ rolesWanted: ["HR Recruiter"] }), "hr hr/recruiter");
  assert.equal(at({ rolesWanted: ["Mechanical Design Engineer"] }), "core core/mech");
});

test("the longest phrase wins where it starts", () => {
  assert.equal(at({ rolesWanted: ["Product Marketing Manager"] }), "marketing marketing/pmm");
  assert.equal(at({ rolesWanted: ["AI Product Manager"] }), "product product/pm");
  assert.equal(at({ rolesWanted: ["Social Media Marketing Intern"] }), "marketing marketing/social");
  assert.equal(at({ rolesWanted: ["Accounts Executive"] }), "finance finance/accounts");
  assert.equal(at({ rolesWanted: ["Account Executive"] }), "sales sales/sales");
  assert.equal(at({ rolesWanted: ["Data Entry Operator"] }), "ops ops/admin", "data entry is not analytics");
  assert.deepEqual(familiesIn("B.Tech student who wants a fintech role"), [], "a degree and a sector name no family");
  assert.equal(at({ rolesWanted: ["Product Designer"], claims: [skill("Figma")] }), "design design/uiux", "with UI skills a product designer is UI/UX");
  assert.equal(at({ rolesWanted: ["Product Designer"], claims: [skill("SolidWorks")] }), "design design/industrial");
});

test("refusals: a family they rule out never places them; a specific role rules out only that role", () => {
  // Shaped like the owner's example (wants business analysis, works in client servicing and social media, a marketing
  // course, rules out marketing and tech), in made-up words.
  const p = place({
    rolesWanted: ["Business Analyst"], title: "Client Servicing and Social Media Executive", course: "BBA (Advertising and Marketing Research)",
    said: refuses("Marketing", "Tech"), claims: [skill("Power BI"), skill("SQL")],
  });
  assert.equal(`${p.family} ${p.role}`, "data data/ba");
  assert.match(p.why, /^Wanted role: Business Analyst\. Rules out: Marketing/);
  assert.ok(!p.also.some((a) => a.family === "marketing" || a.family === "software"), "a refused family is not even a second fit");
  assert.ok(p.also.some((a) => a.family === "sales" && a.role === "sales/account"), "client servicing is a second fit");

  const only = place({ rolesWanted: ["Marketing Intern"], course: "BBA Marketing", said: refuses("Marketing") });
  assert.equal(`${only.family} ${only.role}`, "none none/refused");
  assert.match(only.why, /Rules out: Marketing/);

  assert.equal(at({ rolesWanted: ["Brand Manager", "Social Media Manager"], said: refuses("Social media marketing") }), "marketing marketing/brand",
    "refusing social media still leaves brand in Marketing");
  assert.notEqual(place({ title: "Software Developer", course: "B.Tech Computer Science", rolesWanted: ["Sales"], said: refuses("Coding") }).family, "software");
  assert.equal(place({ title: "Software Developer", course: "B.Tech Computer Science", said: refuses("coding") }).family, "none");
});

test("the order of evidence: wanted, then open to, then title and headline, then course, then skills; a later tier never outvotes", () => {
  const all = {
    rolesWanted: ["Financial Analyst"], rolesAdjacent: ["Data Analyst"], title: "Content Writer", course: "B.Tech Mechanical",
    claims: [skill("Figma"), skill("Adobe XD"), skill("Photoshop"), skill("Illustrator")],
  };
  assert.equal(place(all).family, "finance");
  assert.equal(place({ ...all, rolesWanted: [] }).family, "data", "open to beats title");
  assert.equal(place({ ...all, rolesWanted: [], rolesAdjacent: [] }).family, "content", "title beats course");
  assert.equal(place({ ...all, rolesWanted: [], rolesAdjacent: [], title: null }).family, "core", "course beats skills");
  assert.equal(place({ ...all, rolesWanted: [], rolesAdjacent: [], title: null, course: null }).family, "design", "skills last");
  assert.equal(at({ rolesWanted: ["Growth Marketer"], headline: "Engineer who codes in React and Node" }), "marketing marketing/growth", "a headline never beats a wanted role");
  assert.equal(place({ rolesWanted: ["Data Analyst", "Product Manager"] }).family, "data", "the first wanted role leads");
  assert.deepEqual(place({ rolesWanted: ["Data Analyst", "Product Manager"] }).also, [{ family: "product", role: "product/pm" }]);
  assert.equal(at({ rolesWanted: ["Data Analyst / Business Analyst"] }), "data data/analyst", "two roles in one text, one family counted once");
  assert.deepEqual(place({ rolesWanted: ["Data Analyst / Business Analyst"] }).also, [{ family: "data", role: "data/ba" }]);
  const old = place({ source: "old", headline: "Zero to One Growth Builder", rolesAdjacent: ["Operations Associate"] });
  assert.equal(`${old.family} ${old.role}`, "none none/little", "the old product's AI read alone never decides");
  assert.equal(old.why, "Too little to tell: only our AI's read of the resume, which guessed Operations Associate");
  assert.match(place({ rolesAdjacent: ["Operations Associate"] }).why, /^Open to: /, "on the call, open to is their own word");
});

test("course and skills place a family but name no role; a broad course or two skills is too little", () => {
  assert.equal(at({ course: "B.Tech Mechanical Engineering" }), "core core/mech", "a core branch is the role");
  assert.equal(at({ degree: "B.E. Computer Science" }), "software software/unsaid");
  const sk = place({ claims: ["Python", "SQL", "Power BI", "Tableau", "Excel", "Looker"].map(skill) });
  assert.equal(`${sk.family} ${sk.role}`, "data data/unsaid");
  assert.equal(sk.roleName, "Role not said");
  assert.equal(sk.why, "Skills: SQL, Power BI, Tableau, Looker");
  assert.equal(at({ claims: ["SQL", "Power BI", "Tableau", "Excel"].map(skill) }), "none none/little", `skills alone need ${SKILLS_MIN} of one family`);
  assert.equal(at({ course: "B.Com" }), "none none/little", "commerce alone only tips the balance");
  assert.equal(at({ course: "B.Com", claims: [skill("Tally"), skill("GST")] }), "finance finance/unsaid", `a broad course with ${BROAD_COURSE_SKILLS} of its skills`);
  assert.equal(at({ claims: [skill("SQL"), skill("Tableau")] }), "none none/little");
});

test("not enough data: nothing readable is never a guess", () => {
  for (const over of [{}, { rolesWanted: ["Intern"] }, { rolesWanted: ["Any role", "Not sure yet"] }, { course: "BBA" }, { course: "MBA" },
    { claims: [skill("Python"), skill("Excel"), skill("Communication"), skill("Canva")] }]) {
    const p = place(over);
    assert.equal(`${p.family} ${p.role}`, "none none/empty", JSON.stringify(over));
    assert.equal(p.why, "No wanted role, title, course or skill we recognise");
    assert.deepEqual(p.also, []);
  }
  assert.ok(SKILLS_MIN >= 4 && BROAD_COURSE_SKILLS >= 2);
});

test("TALENT-NET-2: the first own wanted role decides family and role; later roles, headline, course and skills are second fits", () => {
  const fo = place({
    rolesWanted: ["Founder\u2019s Office Analyst (Edtech)", "Programme Coordinator", "Operations Associate", "Office Admin"],
    course: "BA Psychology", headline: "Runs student events and ops for a campus club",
  });
  assert.equal(`${fo.family} ${fo.role}`, "consulting consulting/foa");
  assert.equal(fo.why, "Wanted role: Founder\u2019s Office Analyst (Edtech)");
  assert.ok(fo.also.some((x) => x.family === "ops"));
  const da = place({ rolesWanted: ["Data Analyst Trainee", "Reporting Analyst", "Equity Research Analyst", "Credit Analyst"], course: "BA Economics",
    claims: ["Valuation", "DCF", "Financial Modelling", "Bloomberg"].map(skill) });
  assert.equal(`${da.family} ${da.role}`, "data data/analyst");
  assert.deepEqual(da.also.slice(0, 2), [{ family: "finance", role: "finance/research" }], "same family roles first, then other families, once each");
  assert.equal(at({ rolesWanted: ["Performance Marketing Specialist", "Content Writer", "Copywriter", "Content Strategist"] }), "marketing marketing/digital");
  assert.equal(at({ rolesWanted: ["Strategy Consultant (Associate)", "Product Manager", "APM", "Product Owner"] }), "consulting consulting/consultant");
  assert.equal(at({ rolesWanted: ["Student Programs and Operations Intern", "Research Assistant", "Research Intern"] }), "ops ops/ops");
});

test("TALENT-NET-2: the canonical role inside the family comes from the first wanted role too", () => {
  assert.equal(at({ rolesWanted: ["Software Engineer"], rolesAdjacent: ["DevOps Engineer", "Cloud Engineer", "SRE"] }), "software software/swe");
  assert.equal(at({ source: "old", rolesWanted: ["Software Engineer"], rolesAdjacent: ["DevOps Engineer", "Cloud Engineer"] }), "software software/swe");
  assert.equal(at({ rolesWanted: ["Full\u2011Stack Engineer (Fresher)", "Backend Developer", "Cloud Engineer"] }), "software software/fullstack");
  assert.equal(at({ rolesWanted: ["Back End Engineer", "Web Developer Trainee", "Full Stack Developer"] }), "software software/backend");
  const sde = place({ rolesWanted: ["SDE Intern", "ML Intern"] });
  assert.equal(`${sde.family} ${sde.role}`, "software software/swe");
  assert.deepEqual(sde.also, [{ family: "ai", role: "ai/ml" }]);
  assert.equal(at({ rolesWanted: ["Intern", "Any role", "Data Analyst"] }), "data data/analyst", "words that say nothing are skipped");
  assert.equal(at({ rolesWanted: ["Marketing"], said: refuses("Marketing"), rolesAdjacent: ["Sales"] }), "sales sales/sales", "a refused first role is skipped");
});

test("TALENT-NET-2: text is normalised before matching (hyphens, dashes, curly apostrophes, &, brackets, full-width letters)", () => {
  for (const r of ["Full-Stack Developer", "Full\u2011Stack Developer", "Full\u2013Stack Developer", "Full\u2014Stack Developer", "[Remote] Full Stack Developer (Entry)", "FULL STACK DEVELOPER"]) {
    assert.equal(at({ rolesWanted: [r] }), "software software/fullstack", r);
  }
  assert.equal(at({ rolesWanted: ["Founder\u2019s Office"] }), "consulting consulting/foa");
  assert.equal(at({ rolesWanted: ["Founder`s Office (Healthtech)"] }), "consulting consulting/foa");
  assert.equal(at({ rolesWanted: ["Sales & Marketing Executive"] }), "sales sales/sales", "& reads as and, the first named wins");
  assert.equal(at({ rolesWanted: ["R&D Engineer"] }), "core core/mech");
  assert.equal(at({ rolesWanted: ["\uff33\uff24\uff25"] }), "software software/swe", "full-width letters fold");
});

test("TALENT-NET-2: AI and ML needs AI evidence of their own; the old product's AI guess is only a second fit", () => {
  const cs = place({ source: "old", course: "B.Tech Computer Science", rolesAdjacent: ["AI Engineer", "ML Engineer"], headline: "Full-Stack AI Builder" });
  assert.equal(`${cs.family} ${cs.role}`, "software software/unsaid");
  assert.equal(cs.why, "Course: B.Tech Computer Science");
  assert.ok(cs.also.some((x) => x.family === "ai"), "the AI guess is a second fit");
  assert.equal(at({ source: "old", course: "B.E. Computer Engineering", rolesAdjacent: ["AI Engineer"] }), "software software/unsaid");
  assert.equal(at({ source: "old", rolesAdjacent: ["AI Engineer"] }), "none none/little");
  assert.equal(at({ source: "old", rolesWanted: ["AI Engineer"], course: "B.Tech Computer Science" }), "ai ai/ai", "their own wanted role");
  assert.equal(at({ title: "ML Engineer Intern", course: "B.Tech Computer Science" }), "ai ai/ml", "their own title");
  assert.equal(at({ claims: ["PyTorch", "TensorFlow", "NLP", "LLM"].map(skill) }), "ai ai/unsaid", "their own AI skills");
  assert.equal(at({ claims: ["AI", "ChatGPT", "Python", "SQL"].map(skill) }), "none none/little", "a bare 'AI' skill is not AI evidence");
});

test("TALENT-NET-2: a strategy or consulting course is Consulting; a plain business course and skills alone are too little", () => {
  assert.equal(at({ course: "BBA in Strategy and Business Analytics" }), "consulting consulting/unsaid", "the first specific word in the course");
  assert.equal(at({ course: "BMS (Consulting)" }), "consulting consulting/unsaid");
  for (const course of ["BBA", "Bachelor of Business Administration", "BBA (Hons)", "Business Management", "MBA"]) assert.equal(place({ course }).family, "none", course);
  assert.equal(at({ course: "high_school", claims: ["Tally", "GST", "Accounting"].map(skill) }), "none none/little");
  const fin = place({ source: "old", course: "high_school", rolesAdjacent: ["Accountant"], claims: ["Tally", "GST", "Accounting", "Bookkeeping"].map(skill) });
  assert.equal(`${fin.family} ${fin.role}`, "finance finance/unsaid", "skills alone name no role, and the AI guess does not either");
  assert.deepEqual(fin.also, [{ family: "finance", role: "finance/accounts" }]);
});

test("other roles: words no family fits keep their own words, and are never a second fit", () => {
  const chef = place({ rolesWanted: ["Pastry Chef Trainee"] });
  assert.equal(`${chef.family} ${chef.role}`, "other other/pastry chef");
  assert.equal(chef.roleName, "Pastry chef");
  assert.equal(chef.why, "Wanted role: Pastry Chef Trainee");
  assert.equal(at({ rolesWanted: ["Civil Services"] }), "other other/civil services", "civil services is not civil engineering");
  assert.equal(place({ rolesWanted: ["Data Analyst"], rolesAdjacent: ["Pilot"] }).also.length, 0);
  assert.deepEqual(canonOf(chef), []);
});

test("the network: every student once, families add up, biggest first, other and not enough data last", () => {
  const ps = [
    ...Array.from({ length: 5 }, () => ({ family: "data", role: "data/analyst" })),
    { family: "data", role: "data/unsaid" }, { family: "data", role: "data/ba" }, { family: "data", role: "data/ba" },
    { family: "none", role: "none/empty" },
    ...Array.from({ length: 3 }, () => ({ family: "software", role: "software/swe" })),
    ...Array.from({ length: 12 }, () => ({ family: "other", role: "other/pilot" })),
  ];
  const net = netOf(ps);
  assert.equal(net.n, ps.length);
  assert.deepEqual(net.families.map((f) => [f.key, f.n]), [["data", 8], ["software", 3], ["other", 12], ["none", 1]]);
  assert.deepEqual(net.families[0].roles.map((r) => [r.label, r.n]), [["Data analyst", 5], ["Business analyst", 2], ["Role not said", 1]], "role not said last");
  assert.equal(net.families.reduce((s, f) => s + f.n, 0), ps.length);
  for (const f of net.families) assert.equal(f.roles.reduce((s, r) => s + r.n, 0), f.n);
  const many = netOf(Array.from({ length: 50 }, (_, i) => ({ family: "other", role: `other/role ${i}` })));
  assert.equal(many.families[0].roles.length, 40);
  assert.equal(many.families[0].moreRoles, 10);
  assert.ok(within({ family: "data", role: "data/ba" }, "data", ""));
  assert.ok(within({ family: "data", role: "data/ba" }, "", ""));
  assert.ok(!within({ family: "data", role: "data/ba" }, "data", "data/analyst"));
});

test("canonical words for search, and the top bar's counts", () => {
  assert.deepEqual(canonOf(place({ rolesWanted: ["SDE"] })), ["Software engineering", "Software engineer"]);
  assert.deepEqual(canonOf(place({ course: "B.Tech CSE" })), ["Software engineering"], "no 'Role not said' in search");
  assert.deepEqual(canonOf(place({})), []);
  const c = countsOf([
    { source: "call", optedIn: true, intent: "active" }, { source: "call", optedIn: true, intent: "open" },
    { source: "old", optedIn: false, intent: null }, { source: "old", optedIn: true, intent: null },
  ]);
  assert.deepEqual(c, { n: 4, call: 2, old: 2, optedIn: 3, active: 1 });
});

const NET = netOf([
  ...Array.from({ length: 900 }, (_, i) => ({ family: "software", role: ["software/swe", "software/backend", "software/frontend", "software/fullstack"][i % 4] })),
  ...Array.from({ length: 400 }, (_, i) => ({ family: "data", role: i % 3 ? "data/analyst" : "data/ba" })),
  ...Array.from({ length: 60 }, (_, i) => ({ family: "other", role: `other/made up role ${i % 20}` })),
  ...Array.from({ length: 30 }, () => ({ family: "none", role: "none/empty" })),
  ...["product", "design", "marketing", "content", "sales", "finance", "consulting", "ops", "hr", "core", "science", "legal", "education", "ai"]
    .flatMap((f, j) => Array.from({ length: 20 + j * 7 }, () => ({ family: f, role: `${f}/unsaid` }))),
]);
const STUDENTS = Array.from({ length: 24 }, (_, i) => ({ id: `s${i}`, name: `Made${i}` }));

function noOverlap(nodes) {
  const cols = new Map();
  for (const nd of nodes) cols.set(nd.x, [...(cols.get(nd.x) ?? []), nd]);
  for (const list of cols.values()) {
    const ys = list.map((x) => x.y).sort((a, b) => a - b);
    for (let i = 1; i < ys.length; i++) assert.ok(ys[i] - ys[i - 1] >= 24, `rows ${ys[i - 1]} and ${ys[i]} overlap`);
  }
}

test("the network layout: deterministic, in bounds, no two rows overlap, deeper columns only when open", () => {
  const o = { narrow: false, allRoles: false };
  const top = netLayout(NET, { fam: null, role: null }, [], 0, o);
  assert.deepEqual(netLayout(NET, { fam: null, role: null }, [], 0, o), top, "same input, same picture");
  assert.equal(top.nodes.filter((x) => x.kind === "fam").length, NET.families.length);
  assert.equal(top.nodes.filter((x) => x.kind === "role" || x.kind === "student").length, 0);
  assert.equal(top.edges.length, NET.families.length, "one edge from everyone to each family");
  const fat = top.edges.find((e) => e.to === "fam:software");
  const thin = top.edges.find((e) => e.to === "fam:none");
  assert.ok(fat.w > thin.w, "thicker edge, more students");
  assert.ok(top.nodes.find((x) => x.id === "fam:software").r > top.nodes.find((x) => x.id === "fam:none").r, "bigger node, more students");

  const fam = netLayout(NET, { fam: "software", role: null }, [], 0, o);
  assert.deepEqual(fam.nodes.filter((x) => x.kind === "role").map((x) => x.key).sort(), ["software/backend", "software/frontend", "software/fullstack", "software/swe"]);
  assert.ok(fam.nodes.filter((x) => x.kind === "fam" && x.key !== "software").every((x) => !x.on), "the other families dim");
  assert.ok(fam.nodes.find((x) => x.id === "fam:software").open);

  const deep = netLayout(NET, { fam: "software", role: "software/swe" }, STUDENTS, 225, o);
  assert.equal(deep.nodes.filter((x) => x.kind === "student").length, 24);
  assert.ok(deep.nodes.some((x) => x.kind === "show"), "show more while fewer than the role's students show");
  assert.ok(!netLayout(NET, { fam: "software", role: "software/swe" }, STUDENTS, 225, { ...o, more: false }).nodes.some((x) => x.kind === "show"));
  for (const L of [top, fam, deep]) {
    for (const nd of L.nodes) {
      assert.ok(nd.x - nd.r >= 0 && nd.y - nd.r >= 0 && nd.y + nd.r <= L.h, `${nd.id} inside`);
      assert.ok(nd.end <= L.w, `${nd.id} label inside (${nd.end} > ${L.w})`);
    }
    noOverlap(L.nodes);
  }
  const other = netLayout(NET, { fam: "other", role: null }, [], 0, o);
  assert.equal(other.nodes.filter((x) => x.kind === "role").length, 13, "13 roles, then a node for the rest");
  assert.equal(other.nodes.find((x) => x.kind === "more").label, "7 more roles");
  assert.equal(netLayout(NET, { fam: "other", role: null }, [], 0, { ...o, allRoles: true }).nodes.filter((x) => x.kind === "role").length, 20);
});

test("the network layout on a phone: only the open node and its children", () => {
  const o = { narrow: true, allRoles: false };
  const top = netLayout(NET, { fam: null, role: null }, [], 0, o);
  assert.equal(top.w, 440);
  assert.equal(top.nodes.filter((x) => x.kind === "fam").length, NET.families.length);
  const deep = netLayout(NET, { fam: "data", role: "data/ba" }, STUDENTS.slice(0, 12), 134, o);
  assert.deepEqual([...new Set(deep.nodes.map((x) => x.kind))].sort(), ["role", "show", "student"]);
  for (const nd of deep.nodes) assert.ok(nd.end <= deep.w);
  noOverlap(deep.nodes);
});

test("speed: placing 7,500 made-up students stays well under a second of CPU", () => {
  const roles = ["SDE", "Data Analyst", "Business Analyst", "Marketing Intern", "Financial Analyst", "UI/UX Designer", "HR Recruiter", "Chef", "Intern", ""];
  const pool = Array.from({ length: 7500 }, (_, i) => cand({
    rolesWanted: roles[i % roles.length] ? [`${roles[i % roles.length]} ${i % 7}`] : [], rolesAdjacent: [roles[(i + 3) % roles.length]].filter(Boolean),
    headline: `Made-up student ${i} who likes ${roles[(i + 5) % roles.length] || "things"}`, course: ["B.Tech CSE", "BBA", "B.Com", "BA English"][i % 4],
    claims: [skill("Python"), skill("SQL"), skill(`Tool ${i % 50}`)],
  }));
  const t0 = process.cpuUsage();
  const net = netOf(pool.map((c) => placeOf(c, skillsOf(c))));
  const used = process.cpuUsage(t0);
  const ms = (used.user + used.system) / 1000;
  assert.equal(net.n, 7500);
  assert.ok(ms < 1500, `took ${ms.toFixed(0)} ms of CPU`);
});

test("wiring: the API reads fam and role, the server narrows only the list, the dry run never prints a name, email or phone", () => {
  const api = readFileSync(new URL("../app/routes/api.talent.tsx", import.meta.url), "utf8");
  assert.match(api, /FAMILY_ORDER\.includes/);
  assert.match(api, /role\.startsWith\(`\$\{fam\}\/`\)/);
  const server = readFileSync(new URL("../app/lib/talent/talent.server.ts", import.meta.url), "utf8");
  assert.match(server, /const net = netOf\(results\.map/, "the network is the whole search, not the open family");
  const dry = readFileSync(new URL("./talent-families-dry.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(dry, /\.(name|email|phone)\b/);
  assert.match(dry, /id\.slice\(0, 8\)/);
});
