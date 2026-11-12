// TALENT (12 Nov 2026, the owner: "we do have studojo student data right after the call ... make a page which is like
// a graph to do a student search for like hiring managers to find the students"). The rules of the /talent page, pure:
// the words a search is read into, how a student matches each one, the ranking, the hard filters, the graph's hubs and
// its layout. The students are the ones whose page lets hiring managers on Studojo find them (talent.server.ts reads
// them from career_agent.career_cand_profile, the row the call derives for exactly this, and their live claims).
// No imports, so node --test runs it as is (scripts/talent-model.test.mjs).

// ---------------------------------------------------------------------- types

export interface Claim {
  kind: string; // role | outcome | project | responsibility | skill | tool | credential | domain
  text: string;
  org: string | null;
  when: string | null;
  qty: string | null;
  src: string; // call | resume | review | link
}

export interface Candidate {
  id: string;
  name: string;
  email: string;
  headline: string | null;
  summary: string | null;
  title: string | null;
  org: string | null;
  status: string | null;
  expMonths: number | null;
  cities: string[];
  relocate: string | null;
  modes: string[];
  types: string[];
  payText: string | null;
  fixedMin: number | null; // INR a year
  stipendMin: number | null; // INR a month
  notice: string | null;
  from: string | null;
  intent: string | null; // active | open | passive
  degreeStatus: string | null;
  degree: string | null;
  grad: number | null;
  rolesWanted: string[];
  rolesAdjacent: string[];
  sectors: string[];
  values: string[];
  derivedAt: number; // epoch ms
  claims: Claim[];
}

export type TypeFilter = "any" | "internship" | "full_time";
export type ExpFilter = "any" | "fresher" | "1-3" | "3+";
export interface Filters {
  q: string;
  city: string; // a city key or ""
  type: TypeFilter;
  exp: ExpFilter;
  grad: number | null;
  active: boolean;
  budget: string; // a BUDGETS key or ""
  relocate: boolean; // a city filter also takes students open to relocating
}
export const DEFAULT_FILTERS: Filters = { q: "", city: "", type: "any", exp: "any", grad: null, active: false, budget: "", relocate: true };

export type TermKind = "text" | "city" | "grad" | "type" | "mode" | "exp";
export interface Term { key: string; label: string; kind: TermKind }

export interface Hit { term: string; where: string; detail: string; w: number }

export interface Skill { key: string; label: string }

export interface Result {
  c: Candidate;
  skills: Skill[];
  hits: Hit[];
  matched: number; // terms matched
  score: number;
}

export interface Hub { key: string; label: string; kind: "term" | "skill" | "role"; n: number }

// ------------------------------------------------------------------- words

const squash = (s: string) => s.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();

/** Two spellings of one skill share a key; the label is how the page writes it. */
const SKILL_ALIASES: Record<string, string> = {
  "ms excel": "excel", "microsoft excel": "excel", "advanced excel": "excel", "ms-excel": "excel", "excel (advanced)": "excel",
  powerbi: "power bi", "microsoft power bi": "power bi",
  js: "javascript", "javascript (es6+)": "javascript", es6: "javascript",
  ts: "typescript",
  node: "node.js", nodejs: "node.js", "node js": "node.js",
  "react.js": "react", reactjs: "react", "react js": "react",
  nextjs: "next.js", "next js": "next.js",
  express: "express.js", expressjs: "express.js", "express js": "express.js",
  postgres: "postgresql",
  html5: "html", css3: "css",
  ml: "machine learning",
  "artificial intelligence": "ai",
  genai: "generative ai", "gen ai": "generative ai",
  "natural language processing": "nlp",
  "ms powerpoint": "powerpoint", "microsoft powerpoint": "powerpoint",
  "ms word": "word", "microsoft word": "word",
  "microsoft office": "ms office", "ms office suite": "ms office", "microsoft office suite": "ms office",
  "rest api": "rest apis", "restful apis": "rest apis", "restful api": "rest apis",
  "scikit learn": "scikit-learn", sklearn: "scikit-learn",
  "search engine optimization": "seo", "search engine optimisation": "seo",
  smm: "social media marketing",
  "amazon web services": "aws",
  "google cloud": "gcp", "google cloud platform": "gcp",
  k8s: "kubernetes",
  golang: "go",
  "data analytics": "data analysis",
  "communication skills": "communication",
  "problem-solving": "problem solving",
};
const SKILL_LABELS: Record<string, string> = {
  excel: "Excel", "power bi": "Power BI", javascript: "JavaScript", typescript: "TypeScript", "node.js": "Node.js", react: "React",
  "next.js": "Next.js", "express.js": "Express.js", postgresql: "PostgreSQL", mysql: "MySQL", mongodb: "MongoDB", sql: "SQL", html: "HTML",
  css: "CSS", "machine learning": "Machine learning", ai: "AI", "generative ai": "Generative AI", nlp: "NLP", powerpoint: "PowerPoint",
  word: "Word", "ms office": "MS Office", "rest apis": "REST APIs", "scikit-learn": "scikit-learn", seo: "SEO",
  "social media marketing": "Social media marketing", aws: "AWS", gcp: "GCP", kubernetes: "Kubernetes", go: "Go", git: "Git",
  github: "GitHub", python: "Python", java: "Java", "c++": "C++", docker: "Docker", figma: "Figma", canva: "Canva", tableau: "Tableau",
  "data analysis": "Data analysis", communication: "Communication", "problem solving": "Problem solving",
};

export const skillKey = (name: string): string => {
  const k = squash(name).replace(/[.;,]+$/, "");
  return SKILL_ALIASES[k] ?? k;
};

/**
 * A resume skill claim reads "Python: listed on the resume: Python"; the name is the part before. A skill said on the
 * call is a sentence ("Ran the college fest's Instagram ..."), not a name: null, and the search reads it as text.
 */
export function skillName(text: string): string | null {
  const m = /^(.{1,60}?):\s*listed on the resume\b/i.exec(text.trim());
  if (m) return m[1].trim();
  const t = text.trim();
  return t.length <= 32 && !/[.!?]/.test(t) && t.split(/\s+/).length <= 4 ? t : null;
}

/** The student's resume skills, one per key, in the order they listed them. */
export function skillsOf(c: Candidate): Skill[] {
  const out: Skill[] = [];
  const seen = new Set<string>();
  for (const k of c.claims) {
    if (k.kind !== "skill" && k.kind !== "tool") continue;
    const name = skillName(k.text);
    if (!name) continue;
    const key = skillKey(name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ key, label: SKILL_LABELS[key] ?? name });
  }
  return out;
}

const CITY_ALIASES: Record<string, string> = {
  bangalore: "bengaluru", blr: "bengaluru", "bengaluru urban": "bengaluru",
  gurgaon: "gurugram",
  delhi: "delhi ncr", "new delhi": "delhi ncr", ncr: "delhi ncr", "delhi-ncr": "delhi ncr", "delhi/ncr": "delhi ncr",
  bombay: "mumbai", madras: "chennai", calcutta: "kolkata", "navi mumbai": "mumbai",
};
/** Delhi NCR is one market: a Gurugram search takes Noida and Delhi students too. */
const NCR = new Set(["delhi ncr", "gurugram", "noida", "ghaziabad", "faridabad", "greater noida"]);

export const cityKey = (name: string): string => {
  const k = squash(name);
  return CITY_ALIASES[k] ?? k;
};
const cityGroup = (key: string) => (NCR.has(key) ? "delhi ncr" : key);
const titleCase = (s: string) => s.replace(/\b([a-z])/g, (_, a: string) => a.toUpperCase()).replace(/\bNcr\b/, "NCR");
export const cityLabel = (key: string) => titleCase(key);

/** "Full Stack Developer Intern" and "full stack developer" are one role on the graph. */
export function roleKey(role: string): string {
  return squash(role)
    .replace(/\s*\((?:intern|internship|trainee)\)$/, "")
    .replace(/\s+(?:intern|internship|trainee)$/, "")
    .replace(/^(?:junior|jr\.?)\s+/, "")
    .trim();
}
export const roleLabel = (key: string) => key.charAt(0).toUpperCase() + key.slice(1);

const STOP = new Set([
  "a", "an", "the", "and", "or", "for", "in", "with", "who", "can", "knows", "know", "someone", "somebody", "people", "person",
  "student", "students", "candidate", "candidates", "looking", "need", "needs", "want", "wants", "good", "at", "of", "to", "from",
  "on", "is", "are", "be", "has", "have", "any", "some", "role", "roles", "position", "experience", "exp", "skills", "skill", "based",
  "near", "around", "me", "us", "we", "our", "i",
]);

/**
 * The search box read into terms. Known phrases are taken longest first ("data analyst", "power bi", "delhi ncr"),
 * city names become city terms, a year from 2015 to 2032 a grad year, "intern"/"internship" and "full time" the job
 * type, "remote" the work mode, "fresher" the experience. Filler words drop out. Without commas a known single word
 * stands alone ("python sql" is two skills); with commas the words between them stay one phrase ("growth marketing").
 */
export function parseTerms(q: string, vocab: ReadonlySet<string>, cities: ReadonlySet<string>): Term[] {
  const out: Term[] = [];
  const seen = new Set<string>();
  const add = (t: Term) => {
    const id = `${t.kind}:${t.key}`;
    if (!t.key || seen.has(id)) return;
    seen.add(id);
    out.push(t);
  };
  const commas = /[,;|\n+]/.test(q);
  const chunks = q.split(/[,;|\n+]+/).map((s) => squash(s).replace(/["()]/g, " ").replace(/\s+/g, " ").trim()).filter(Boolean);
  for (const chunk of chunks) {
    const words = chunk.split(" ").filter(Boolean);
    let loose: string[] = [];
    const flush = () => {
      const kept = loose.filter((w) => !STOP.has(w));
      if (kept.length) add({ key: kept.join(" "), label: kept.join(" "), kind: "text" });
      loose = [];
    };
    for (let i = 0; i < words.length; ) {
      let took = 0;
      for (let n = Math.min(4, words.length - i); n >= 1; n--) {
        const phrase = words.slice(i, i + n).join(" ");
        const city = cityKey(phrase);
        if (cities.has(city) || CITY_ALIASES[phrase] || NCR.has(phrase)) {
          flush();
          add({ key: city, label: cityLabel(city), kind: "city" });
          took = n;
          break;
        }
        if (n === 1 && /^(?:20(?:1[5-9]|2\d|3[0-2]))$/.test(phrase)) {
          flush();
          add({ key: phrase, label: `Class of ${phrase}`, kind: "grad" });
          took = 1;
          break;
        }
        if (/^(?:intern|interns|internship|internships)$/.test(phrase)) {
          flush();
          add({ key: "internship", label: "Internship", kind: "type" });
          took = n;
          break;
        }
        if (/^(?:full time|full-time|fulltime)$/.test(phrase)) {
          flush();
          add({ key: "full_time", label: "Full-time", kind: "type" });
          took = n;
          break;
        }
        if (/^(?:remote|wfh|work from home)$/.test(phrase)) {
          flush();
          add({ key: "remote", label: "Remote", kind: "mode" });
          took = n;
          break;
        }
        if (/^(?:fresher|freshers|fresh graduate|fresh graduates|entry level|entry-level)$/.test(phrase)) {
          flush();
          add({ key: "fresher", label: "Fresher", kind: "exp" });
          took = n;
          break;
        }
        if (n > 1 && vocab.has(SKILL_ALIASES[phrase] ?? phrase)) {
          flush();
          const key = SKILL_ALIASES[phrase] ?? phrase;
          add({ key, label: SKILL_LABELS[key] ?? phrase, kind: "text" });
          took = n;
          break;
        }
      }
      if (took) {
        i += took;
        continue;
      }
      // A single known word stands alone ("python sql" is two skills); an unknown run stays one phrase.
      const w = words[i];
      const key = SKILL_ALIASES[w] ?? w;
      if (!commas && vocab.has(key)) {
        flush();
        if (!STOP.has(w)) add({ key, label: SKILL_LABELS[key] ?? w, kind: "text" });
      } else loose.push(w);
      i++;
    }
    flush();
  }
  return out;
}

// --------------------------------------------------------------------- match

/** Lower case, apostrophes out ("founder's" is "founders"), other punctuation to spaces, keeping what skill names use (c++, c#, node.js). */
const clean = (s: string) => squash(s).replace(/'/g, "").replace(/\.(?![a-z0-9])/g, " ").replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
const has = (hay: string | null | undefined, needle: string): boolean => {
  if (!hay || !needle) return false;
  const h = ` ${clean(hay)} `;
  return h.includes(` ${needle} `) || (needle.length >= 5 && h.includes(needle));
};
const hasAllWords = (hay: string | null | undefined, words: string[]) => !!hay && words.length > 1 && words.every((w) => has(hay, w));
const clip = (s: string, n = 110) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/** How well one student matches one term: the strongest place it shows up, or null. */
export function matchTerm(c: Candidate, skills: Skill[], t: Term): Hit | null {
  if (t.kind === "city") {
    const mine = c.cities.map(cityKey);
    const hit = mine.find((k) => k === t.key) ?? mine.find((k) => cityGroup(k) === cityGroup(t.key));
    if (hit) return { term: t.label, where: "City", detail: cityLabel(hit), w: 3 };
    if (c.relocate === "yes") return { term: t.label, where: "City", detail: "Open to relocating", w: 1.5 };
    return null;
  }
  if (t.kind === "grad") return c.grad === Number(t.key) ? { term: t.label, where: "Graduates", detail: String(c.grad), w: 3 } : null;
  if (t.kind === "type") return c.types.includes(t.key) ? { term: t.label, where: "Wants", detail: t.label, w: 2 } : null;
  if (t.kind === "mode") return c.modes.includes(t.key) ? { term: t.label, where: "Work mode", detail: "Remote", w: 2 } : null;
  if (t.kind === "exp") return c.expMonths != null && c.expMonths < 12 ? { term: t.label, where: "Experience", detail: expText(c.expMonths), w: 2 } : null;

  const needle = clean(t.key);
  const words = needle.split(" ").filter((w) => !STOP.has(w));
  const tries: [number, string, string | null | undefined][] = [];
  for (const r of c.rolesWanted) tries.push([3, "Wants to be", r]);
  tries.push([2.5, "Now", c.title], [2.5, "Headline", c.headline]);
  const exact = skills.find((s) => s.key === t.key);
  if (exact) return { term: t.label, where: "Skill", detail: exact.label, w: 2.5 };
  for (const s of skills) tries.push([2, "Skill", s.label]);
  for (const k of c.claims) if (k.kind === "role") tries.push([2, "Worked as", [k.text, k.org].filter(Boolean).join(", ")]);
  for (const r of c.rolesAdjacent) tries.push([1.5, "Open to", r]);
  for (const s of c.sectors) tries.push([1.5, "Sector", s]);
  for (const k of c.claims) {
    if (k.kind === "role" || ((k.kind === "skill" || k.kind === "tool") && skillName(k.text))) continue;
    tries.push([1.5, k.kind === "outcome" ? "Result" : k.kind === "project" ? "Project" : k.kind === "credential" ? "Credential" : "Did", k.text]);
  }
  tries.push([1, "From the call", c.summary]);

  let best: Hit | null = null;
  for (const [w, where, text] of tries) {
    if (!text) continue;
    const full = has(text, needle);
    const part = !full && hasAllWords(text, words);
    if (!full && !part) continue;
    const weight = full ? w : w * 0.6;
    if (!best || weight > best.w) best = { term: t.label, where, detail: clip(text), w: weight };
    if (full && w >= 3) break;
  }
  return best;
}

// ------------------------------------------------------------------- filters

export const BUDGETS: { key: string; label: string; unit: "month" | "year"; max: number }[] = [
  { key: "m15", label: "Up to ₹15k a month", unit: "month", max: 15_000 },
  { key: "m30", label: "Up to ₹30k a month", unit: "month", max: 30_000 },
  { key: "y4", label: "Up to 4 LPA", unit: "year", max: 400_000 },
  { key: "y6", label: "Up to 6 LPA", unit: "year", max: 600_000 },
  { key: "y10", label: "Up to 10 LPA", unit: "year", max: 1_000_000 },
  { key: "y15", label: "Up to 15 LPA", unit: "year", max: 1_500_000 },
];

/** What the student asks for in the budget's unit; null when they did not say. */
export function askIn(c: Candidate, unit: "month" | "year"): number | null {
  if (unit === "month") return c.stipendMin ?? (c.fixedMin != null ? Math.round(c.fixedMin / 12) : null);
  return c.fixedMin ?? (c.stipendMin != null ? c.stipendMin * 12 : null);
}

/** The hard filters: a student who fails one is not shown at all. A student who did not say is kept. */
export function passes(c: Candidate, f: Filters): boolean {
  if (f.city) {
    const mine = c.cities.map(cityKey);
    const ok = mine.some((k) => k === f.city || cityGroup(k) === cityGroup(f.city)) || (f.relocate && c.relocate === "yes");
    if (!ok) return false;
  }
  if (f.type !== "any" && c.types.length && !c.types.includes(f.type)) return false;
  if (f.exp !== "any" && c.expMonths != null) {
    const m = c.expMonths;
    if (f.exp === "fresher" && m >= 12) return false;
    if (f.exp === "1-3" && (m < 12 || m >= 36)) return false;
    if (f.exp === "3+" && m < 36) return false;
  }
  if (f.grad != null && c.grad !== f.grad) return false;
  if (f.active && c.intent !== "active") return false;
  const b = BUDGETS.find((x) => x.key === f.budget);
  if (b) {
    const ask = askIn(c, b.unit);
    if (ask != null && ask > b.max) return false;
  }
  return true;
}

// ------------------------------------------------------------------- ranking

const INTENT_RANK: Record<string, number> = { active: 0, open: 1, passive: 2 };
const intentRank = (c: Candidate) => INTENT_RANK[c.intent ?? ""] ?? 3;
/** How much of the profile the call filled: breaks ties toward the students a hiring manager can judge. */
export const completeness = (c: Candidate): number =>
  [c.headline, c.summary, c.title || c.status, c.expMonths != null, c.cities.length, c.types.length, c.grad != null, c.rolesWanted.length, c.fixedMin != null || c.stipendMin != null]
    .filter(Boolean).length;

/**
 * Students that pass the filters, best first. With terms: those matching at least one, by how many terms they match,
 * then how strongly, then intent (actively looking first), then the fuller profile, then the newest call. When the
 * search has words (a role, a skill), a student must match one of them: a city, a year, a job type or "fresher" only
 * ranks ("social media manager mumbai" is social media managers, the Mumbai ones first, not everyone in Mumbai). With
 * no terms: everyone who passes, by intent, the fuller profile and the newest call.
 */
export function search(pool: Candidate[], terms: Term[], f: Filters): Result[] {
  const out: Result[] = [];
  const needsWord = terms.some((t) => t.kind === "text");
  for (const c of pool) {
    if (!passes(c, f)) continue;
    const skills = skillsOf(c);
    const hits: Hit[] = [];
    let word = false;
    for (const t of terms) {
      const h = matchTerm(c, skills, t);
      if (h) {
        hits.push(h);
        if (t.kind === "text") word = true;
      }
    }
    if (terms.length && !hits.length) continue;
    if (needsWord && !word) continue;
    out.push({ c, skills, hits, matched: hits.length, score: Math.round(hits.reduce((s, h) => s + h.w, 0) * 100) / 100 });
  }
  return out.sort((a, b) =>
    b.matched - a.matched || b.score - a.score || intentRank(a.c) - intentRank(b.c) || completeness(b.c) - completeness(a.c) ||
    b.c.derivedAt - a.c.derivedAt || a.c.id.localeCompare(b.c.id));
}

/** Every skill and role key the pool knows, for reading the search box. */
export function vocabOf(pool: Candidate[]): Set<string> {
  const v = new Set<string>();
  for (const c of pool) {
    for (const s of skillsOf(c)) v.add(s.key);
    for (const r of c.rolesWanted) v.add(roleKey(r));
  }
  return v;
}

// --------------------------------------------------------------------- graph

export interface GraphIn {
  hubs: Hub[];
  /** Hub keys per student id, in result order. */
  links: { id: string; hubs: string[] }[];
}

/** The hub a term's hits link to. */
export const termHub = (t: Term) => `t:${t.kind}:${t.key}`;

/**
 * The graph for a result list. With terms: one hub per term (how many students match it), each student linked to the
 * terms it matches. With none: the pool's most common skills and wanted roles as hubs, each student linked to up to
 * three of them, so the picture is the pool's shape. Students linked to no hub stay off the graph (still in the list).
 */
export function graphOf(results: Result[], terms: Term[], cap: number): GraphIn {
  const top = results.slice(0, cap);
  if (terms.length) {
    const hubs: Hub[] = terms.map((t) => ({
      key: termHub(t), label: t.label, kind: "term",
      n: top.filter((r) => r.hits.some((h) => h.term === t.label)).length,
    }));
    const links = top.map((r) => ({ id: r.c.id, hubs: terms.filter((t) => r.hits.some((h) => h.term === t.label)).map(termHub) }));
    return { hubs: hubs.filter((h) => h.n > 0), links: links.filter((l) => l.hubs.length) };
  }
  const skillN = new Map<string, { label: string; n: number }>();
  const roleN = new Map<string, number>();
  for (const r of top) {
    for (const s of r.skills) skillN.set(s.key, { label: s.label, n: (skillN.get(s.key)?.n ?? 0) + 1 });
    for (const k of new Set(r.c.rolesWanted.map(roleKey))) roleN.set(k, (roleN.get(k) ?? 0) + 1);
  }
  const byN = <T,>(m: Map<string, T>, n: (v: T) => number) => [...m.entries()].sort((a, b) => n(b[1]) - n(a[1]) || a[0].localeCompare(b[0]));
  const roles: Hub[] = byN(roleN, (n) => n).filter(([, n]) => n >= 2).slice(0, 6).map(([k, n]) => ({ key: `r:${k}`, label: roleLabel(k), kind: "role", n }));
  const skills: Hub[] = byN(skillN, (v) => v.n).filter(([, v]) => v.n >= 2).slice(0, 12 - roles.length)
    .map(([k, v]) => ({ key: `s:${k}`, label: v.label, kind: "skill", n: v.n }));
  const hubs = [...roles, ...skills];
  const links = top.map((r) => {
    const mine = new Set([...r.c.rolesWanted.map((x) => `r:${roleKey(x)}`), ...r.skills.map((s) => `s:${s.key}`)]);
    return { id: r.c.id, hubs: hubs.filter((h) => mine.has(h.key)).slice(0, 3).map((h) => h.key) };
  });
  return { hubs, links: links.filter((l) => l.hubs.length) };
}

export interface Pt { x: number; y: number }
export interface Layout { center: Pt; hubs: Record<string, Pt>; students: Record<string, Pt> }

/** A stable number in [0, 1) for a string: the same student lands in the same place every time. */
export function hash01(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 100000) / 100000;
}

/**
 * Where everything sits on a w by h canvas. Hubs are pinned on an ellipse round the centre (a lone hub sits in the
 * centre). A student is pulled to the mean of the hubs it links to, so one that matches every term lands in the
 * middle and one that matches a single term next to that term; with a lone hub, better matches sit closer to it.
 * Then a fixed number of steps push overlapping students apart and keep them clear of the hubs (chips hubHalf wide
 * each side of their point, 16 above and below, kept inside the canvas). Deterministic.
 */
export function layout(
  g: GraphIn, rank: Record<string, number>, w: number, h: number, r: (id: string) => number, hubHalf: (key: string) => number = () => 64,
): Layout {
  const center = { x: w / 2, y: h / 2 };
  const rx = w * 0.38;
  const ry = h * 0.36;
  const hubs: Record<string, Pt> = {};
  const nh = g.hubs.length;
  g.hubs.forEach((hub, i) => {
    if (nh === 1) hubs[hub.key] = { ...center };
    else {
      const a = -Math.PI / 2 + (i * 2 * Math.PI) / nh;
      const half = Math.min(hubHalf(hub.key), w / 2 - 4);
      hubs[hub.key] = {
        x: Math.min(w - half - 4, Math.max(half + 4, center.x + rx * Math.cos(a))),
        y: Math.min(h - 22, Math.max(18, center.y + ry * Math.sin(a))),
      };
    }
  });
  const n = g.links.length;
  const target: Record<string, Pt> = {};
  const pos: Record<string, Pt> = {};
  g.links.forEach((l, i) => {
    let tx = 0;
    let ty = 0;
    for (const k of l.hubs) {
      tx += hubs[k].x;
      ty += hubs[k].y;
    }
    tx /= l.hubs.length;
    ty /= l.hubs.length;
    const a = hash01(l.id) * 2 * Math.PI;
    if (nh === 1) {
      const q = n > 1 ? (rank[l.id] ?? i) / (n - 1) : 0;
      const d = 0.12 + 0.82 * q;
      tx = center.x + rx * d * Math.cos(a);
      ty = center.y + ry * d * Math.sin(a);
    } else if (l.hubs.length === 1) {
      // Next to its one hub, on the side facing the centre, so the ring's outer edge stays clear.
      const hx = hubs[l.hubs[0]];
      tx = hx.x + (center.x - hx.x) * 0.3;
      ty = hx.y + (center.y - hx.y) * 0.3;
    }
    target[l.id] = { x: tx, y: ty };
    const j = 14 + 30 * hash01(`${l.id}:j`);
    pos[l.id] = { x: tx + j * Math.cos(a), y: ty + j * Math.sin(a) };
  });
  const ids = g.links.map((l) => l.id);
  const hubPts = g.hubs.map((hub) => ({ ...hubs[hub.key], half: hubHalf(hub.key) }));
  const pad = 4;
  for (let step = 0; step < 220; step++) {
    const pull = step < 160 ? 0.04 : 0.015;
    for (const id of ids) {
      pos[id].x += (target[id].x - pos[id].x) * pull;
      pos[id].y += (target[id].y - pos[id].y) * pull;
    }
    for (let a = 0; a < ids.length; a++) {
      const pa = pos[ids[a]];
      const ra = r(ids[a]);
      for (let b = a + 1; b < ids.length; b++) {
        const pb = pos[ids[b]];
        const min = ra + r(ids[b]) + pad;
        let dx = pb.x - pa.x;
        let dy = pb.y - pa.y;
        let d = Math.hypot(dx, dy);
        if (d >= min) continue;
        if (d < 0.01) {
          const t = hash01(`${ids[a]}|${ids[b]}`) * 2 * Math.PI;
          dx = Math.cos(t);
          dy = Math.sin(t);
          d = 1;
        }
        const push = (min - d) / 2;
        pa.x -= (dx / d) * push;
        pa.y -= (dy / d) * push;
        pb.x += (dx / d) * push;
        pb.y += (dy / d) * push;
      }
      // Hubs are chips: keep students off them.
      for (const hp of hubPts) {
        const dx = pa.x - hp.x;
        const dy = pa.y - hp.y;
        const ox = hp.half + 2 + ra - Math.abs(dx);
        const oy = 20 + ra - Math.abs(dy);
        if (ox > 0 && oy > 0) {
          if (ox < oy) pa.x += dx >= 0 ? ox : -ox;
          else pa.y += dy >= 0 ? oy : -oy;
        }
      }
      pa.x = Math.min(w - ra - 2, Math.max(ra + 2, pa.x));
      pa.y = Math.min(h - ra - 2, Math.max(ra + 2, pa.y));
    }
  }
  return { center, hubs, students: pos };
}

// ---------------------------------------------------------------------- words

export const INTENT_LABEL: Record<string, string> = { active: "Actively looking", open: "Open to offers", passive: "Not looking now" };
export const intentLabel = (i: string | null) => INTENT_LABEL[i ?? ""] ?? "Did not say";

export function expText(m: number | null): string {
  if (m == null) return "Not said";
  if (m <= 0) return "Fresher";
  if (m < 12) return `${m} month${m === 1 ? "" : "s"}`;
  const y = Math.round((m / 12) * 2) / 2;
  return `${y} year${y === 1 ? "" : "s"}`;
}

const lakh = (n: number) => {
  const v = Math.round((n / 100_000) * 10) / 10;
  return `${Number.isInteger(v) ? v.toFixed(0) : v} LPA`;
};
const thousand = (n: number) => (n >= 1000 ? `₹${Math.round(n / 1000)}k a month` : `₹${n} a month`);

/** What they want to be paid, in their unit: "6 LPA", "₹20k a month", or both. */
export function askText(c: Pick<Candidate, "fixedMin" | "stipendMin">): string | null {
  const parts = [c.fixedMin != null ? `${lakh(c.fixedMin)}+` : null, c.stipendMin != null ? `${thousand(c.stipendMin)}+` : null].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}

export const TYPE_LABEL: Record<string, string> = { internship: "Internship", full_time: "Full-time" };
export const MODE_LABEL: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote" };

export const firstName = (name: string) => (name.trim().split(/\s+/)[0] || "Student").slice(0, 16);

/** What the shortlist keeps of a student: no email address, no phone number. */
export interface Brief {
  id: string;
  name: string;
  headline: string | null;
  title: string | null;
  org: string | null;
  status: string | null;
  expMonths: number | null;
  grad: number | null;
  cities: string[];
  rolesWanted: string[];
  types: string[];
  skills: Skill[];
}

export const briefOf = (c: Brief): Brief => ({
  id: c.id, name: c.name, headline: c.headline, title: c.title, org: c.org, status: c.status, expMonths: c.expMonths, grad: c.grad,
  cities: c.cities.slice(0, 3), rolesWanted: c.rolesWanted.slice(0, 3), types: c.types, skills: c.skills.slice(0, 8),
});

/**
 * The shortlist as plain text to paste to a hiring manager: who they are and what they want, never an email address or
 * a phone number (the student's page promises neither appears on it).
 */
export function shortlistText(list: Brief[]): string {
  return list
    .map((c, i) => {
      const now = [c.title, c.org].filter(Boolean).join(", ") || c.status || "";
      const lines = [
        `${i + 1}. ${c.name}${c.headline ? `: ${c.headline}` : ""}`,
        now ? `   Now: ${now}` : null,
        `   Experience: ${expText(c.expMonths)}${c.grad ? ` · Graduates ${c.grad}` : ""}${c.cities.length ? ` · ${c.cities.slice(0, 3).join(", ")}` : ""}`,
        c.rolesWanted.length ? `   Wants: ${c.rolesWanted.slice(0, 3).join(", ")}${c.types.length ? ` (${c.types.map((t) => TYPE_LABEL[t] ?? t).join(", ")})` : ""}` : null,
        c.skills.length ? `   Skills: ${c.skills.slice(0, 8).map((s) => s.label).join(", ")}` : null,
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n");
}
