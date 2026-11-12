// TALENT (12 Nov 2026, the owner: "we do have studojo student data right after the call ... make a page which is like
// a graph to do a student search for like hiring managers to find the students"). The rules of the /talent page, pure:
// the words a search is read into, how a student matches each one, the ranking, the hard filters, the graph's hubs and
// its layout. Students who took the Stu call come from career_agent.career_cand_profile (the row the call derives for
// exactly this) and their live claims. TALENT-ALL (12 Nov 2026, the owner: "i want all students data here including the
// old 8000 from the old product and then also add one thing about the personality based stuff and stuff we cant find on
// a normal ATS that we can uncover because of the call data we get and then the quiz data we used to collect"): the old
// product's students join them (public.candidates: the AI read of the resume, the onboarding quiz, their own answers;
// public.user_profile: college, course, year), marked as not opted in to hiring managers, and every student carries
// what an ATS cannot see: the call's why-now, values and wishes, the resume read's work style, and the quiz.
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

/**
 * The old product's AI read of the resume (job-outreach-svc resume_intelligence.py, "a structured intelligence brief
 * that a sharp recruiter or founder would write after a 30-minute coffee chat"). Read from the resume, not checked.
 */
export interface Traits {
  archetype: string | null;
  archetypeWhy: string | null;
  style: string | null; // builder-first | strategist-first | operator-first | hybrid
  ownership: string | null; // end-to-end | scoped | collaborative
  ambiguity: string | null; // high | medium | low
  shape: string | null; // generalist | specialist | t-shaped
  pace: string | null; // fast | normal | slow
  numbers: number | null; // % of resume bullets with a real number (achievement_density)
  portfolio: boolean | null;
  distributes: boolean | null; // builds AND distributes: growth, content, community, sales on top of the craft
  stages: string[];
  bestFit: string[];
  avoid: string[];
  hook: string | null;
  pitch: string | null;
  domain: string | null;
}

/** The old product's onboarding quiz and the questions it asked after it, in their words. */
export interface Quiz {
  stage: string | null; // career stage
  clarity: string | null; // high | medium | low: how sure they are of what they want
  risk: string | null; // high | medium | low
  size: string | null; // company size wanted
  companyStage: string | null;
  workMode: string | null;
  ctcMin: number | null; // INR a year
  ctcMax: number | null;
  bestProject: string | null;
  outcome: string | null;
  dream: string[];
  niche: string | null;
}

/** What the call surfaced beyond the resume. */
export interface Said {
  whyNow: string | null;
  wishes: { dim: string; text: string; avoid: boolean }[]; // culture, team, growth, manager style, values, in their words
  refuses: string[]; // roles and sectors they ruled out
}

export interface Candidate {
  id: string;
  source: "call" | "old"; // took the Stu call, or only the old product
  optedIn: boolean; // their page lets hiring managers on Studojo find them
  name: string;
  email: string;
  college: string | null;
  course: string | null;
  year: string | null; // year of study as they gave it
  traits: Traits | null;
  quiz: Quiz | null;
  said: Said | null;
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
  src: SourceFilter;
  optin: boolean; // only students who let hiring managers find them
  traits: string[]; // TRAITS keys, every one required
}
export type SourceFilter = "all" | "call" | "old";
export const DEFAULT_FILTERS: Filters = {
  q: "", city: "", type: "any", exp: "any", grad: null, active: false, budget: "", relocate: true, src: "all", optin: false, traits: [],
};

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

const skillMemo = new WeakMap<Candidate, Skill[]>();
/** The student's resume skills, one per key, in the order they listed them (worked out once per pool copy). */
export function skillsOf(c: Candidate): Skill[] {
  const hit = skillMemo.get(c);
  if (hit) return hit;
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
  skillMemo.set(c, out);
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
const cleanRaw = (s: string) => squash(s).replace(/'/g, "").replace(/\.(?![a-z0-9])/g, " ").replace(/[^a-z0-9+#.\s]/g, " ").replace(/\s+/g, " ").trim();
// A search reads the same few thousand texts every time: clean each once (bounded, so a long-lived server stays small).
const memo = new Map<string, string>();
const clean = (s: string): string => {
  const hit = memo.get(s);
  if (hit !== undefined) return hit;
  if (memo.size > 400_000) memo.clear();
  const v = cleanRaw(s);
  memo.set(s, v);
  return v;
};
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
  if (t.kind === "mode") {
    if (c.modes.includes(t.key)) return { term: t.label, where: "Work mode", detail: "Remote", w: 2 };
    return c.modes.includes("flexible") ? { term: t.label, where: "Work mode", detail: "Flexible", w: 1.5 } : null;
  }
  if (t.kind === "exp") return c.expMonths != null && c.expMonths < 12 ? { term: t.label, where: "Experience", detail: expText(c.expMonths), w: 2 } : null;

  const needle = cleanRaw(t.key);
  const words = needle.split(" ").filter((w) => !STOP.has(w));
  const tries: [number, string, string | null | undefined][] = [];
  for (const r of c.rolesWanted) tries.push([3, "Wants to be", r]);
  tries.push([2.5, "Now", c.title], [2.5, "Headline", c.headline]);
  const exact = skills.find((s) => s.key === t.key);
  if (exact) return { term: t.label, where: "Skill", detail: exact.label, w: 2.5 };
  for (const s of skills) tries.push([2, "Skill", s.label]);
  for (const k of c.claims) if (k.kind === "role") tries.push([2, "Worked as", [k.text, k.org].filter(Boolean).join(", ")]);
  tries.push([2, "College", c.college], [2, "Course", c.course]);
  for (const r of c.rolesAdjacent) tries.push([1.5, c.source === "old" ? "Fits (resume read)" : "Open to", r]);
  for (const s of c.sectors) tries.push([1.5, "Sector", s]);
  if (c.traits) tries.push([1.5, "Archetype", c.traits.archetype], [1.25, "Domain", c.traits.domain?.replace(/_/g, " ")]);
  for (const k of c.claims) {
    if (k.kind === "role" || ((k.kind === "skill" || k.kind === "tool") && skillName(k.text))) continue;
    tries.push([1.5, k.kind === "outcome" ? "Result" : k.kind === "project" ? "Project" : k.kind === "credential" ? "Credential" : "Did", k.text]);
  }
  tries.push([1, c.source === "call" ? "From the call" : "Resume summary", c.summary]);
  if (c.said) {
    tries.push([1.25, "Why now", c.said.whyNow]);
    for (const x of c.said.wishes) tries.push([1.25, "On the call", x.text]);
  }
  for (const v of c.values) tries.push([1.25, "Values", v]);
  if (c.quiz) {
    tries.push([1.25, "Best project, in their words", c.quiz.bestProject], [1.25, "Proudest result, in their words", c.quiz.outcome]);
    for (const d of c.quiz.dream) tries.push([1, "Dream company", d]);
    tries.push([1, "Niche", c.quiz.niche]);
  }
  if (c.traits) tries.push([1, "Strongest hook", c.traits.hook], [1, "Pitch", c.traits.pitch], [0.75, "Archetype", c.traits.archetypeWhy]);

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

/** Results that carry a number, of the results the call heard (claims of kind outcome). */
export function numbered(c: Candidate): { n: number; of: number } {
  const outs = c.claims.filter((k) => k.kind === "outcome");
  return { n: outs.filter((k) => k.qty || /\d/.test(k.text)).length, of: outs.length };
}

/**
 * What an ATS cannot see, as filters. Each needs the signal present: a student we know nothing about is not shown when
 * a trait is asked for (unlike the hard filters above, a trait is a claim about the person).
 */
export const TRAITS: { key: string; label: string; hint: string; test: (c: Candidate) => boolean }[] = [
  { key: "builder", label: "Builder", hint: "Ships things and makes them work (resume read)", test: (c) => c.traits?.style === "builder-first" },
  { key: "operator", label: "Operator", hint: "Runs and scales what exists (resume read)", test: (c) => c.traits?.style === "operator-first" },
  { key: "strategist", label: "Strategist", hint: "Frames problems, designs systems (resume read)", test: (c) => c.traits?.style === "strategist-first" },
  { key: "owner", label: "Owns end to end", hint: "Owns outcomes from idea to delivery (resume read)", test: (c) => c.traits?.ownership === "end-to-end" },
  { key: "ambiguity", label: "Fine without direction", hint: "Thrives with little direction (resume read)", test: (c) => c.traits?.ambiguity === "high" },
  { key: "fast", label: "Grows fast", hint: "Promotions or fast scope growth (resume read)", test: (c) => c.traits?.pace === "fast" },
  { key: "sells", label: "Builds and sells", hint: "Growth, content, community or sales on top of the craft (resume read)", test: (c) => c.traits?.distributes === true },
  { key: "portfolio", label: "Shows their work", hint: "GitHub, a portfolio or project links (resume read)", test: (c) => c.traits?.portfolio === true },
  {
    key: "numbers", label: "Backs it with numbers", hint: "Half their resume bullets or call results carry a number",
    test: (c) => (c.traits?.numbers ?? 0) >= 50 || ((x) => x.of >= 2 && x.n * 2 >= x.of)(numbered(c)),
  },
  { key: "risk", label: "Takes risks", hint: "Said high risk appetite (quiz)", test: (c) => c.quiz?.risk === "high" },
  { key: "clear", label: "Knows what they want", hint: "Said they know exactly what they want (quiz)", test: (c) => c.quiz?.clarity === "high" },
  {
    key: "startup", label: "Wants early-stage", hint: "Asked for seed or small teams (call or quiz)",
    test: (c) => /seed|early|startup|1-50/i.test([c.quiz?.companyStage, c.quiz?.size, ...(c.said?.wishes.filter((w) => w.dim === "company_stage" && !w.avoid).map((w) => w.text) ?? [])].filter(Boolean).join(" ")),
  },
];

/** The hard filters: a student who fails one is not shown at all. A student who did not say is kept. */
export function passes(c: Candidate, f: Filters): boolean {
  if (f.src !== "all" && c.source !== f.src) return false;
  if (f.optin && !c.optedIn) return false;
  for (const k of f.traits) {
    const t = TRAITS.find((x) => x.key === k);
    if (t && !t.test(c)) return false;
  }
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
  [c.headline, c.summary, c.title || c.status, c.expMonths != null, c.cities.length, c.types.length, c.grad != null, c.rolesWanted.length, c.fixedMin != null || c.stipendMin != null,
    c.traits?.style, c.quiz, c.college]
    .filter(Boolean).length;

/**
 * Students that pass the filters, best first. With terms: those matching at least one, by how many terms they match,
 * then how strongly, then intent (actively looking first), then the fuller profile, then the newest call. When the
 * search has words (a role, a skill), a student must match one of them: a city, a year, a job type or "fresher" only
 * ranks ("social media manager mumbai" is social media managers, the Mumbai ones first, not everyone in Mumbai). With
 * no terms: everyone who passes, by intent, the fuller profile and the newest call. On a tie, students who took the
 * call and opted in come before the old product's.
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
    b.matched - a.matched || b.score - a.score || intentRank(a.c) - intentRank(b.c) || Number(b.c.optedIn) - Number(a.c.optedIn) ||
    completeness(b.c) - completeness(a.c) || b.c.derivedAt - a.c.derivedAt || a.c.id.localeCompare(b.c.id));
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

// ------------------------------------------------------------------- sources

const text = (v: unknown, max = 600): string | null => {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t && !/^(unknown|null|none|n\/a)$/i.test(t) ? t.slice(0, max) : null;
};
/**
 * Free text in their words with any email address or phone number taken out: 4 of the old product's "best project"
 * answers carried one, and the page promises neither (prod, 12 Nov 2026).
 */
export const scrubContacts = (s: string): string =>
  s.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, "(email hidden)")
    .replace(/(^|[^\d,.+])(?:\+\d{1,3}[\s-]?)?[6-9]\d{4}[\s-]?\d{5}(?![\d,])/g, "$1(phone hidden)"); // no lookbehind: old Safari
const prose = (v: unknown, max = 600): string | null => {
  const t = text(v, max);
  return t ? scrubContacts(t) : null;
};
const list = (v: unknown, max = 12): string[] => {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const x of Array.isArray(v) ? v : []) {
    const t = text(x, 120);
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase());
      out.push(t);
    }
  }
  return out.slice(0, max);
};
/** One of the allowed words, whatever the spelling ("T_shaped", "builder_first"), or null. */
const level = (v: unknown, allowed: string[]): string | null => {
  const t = text(v, 40)?.toLowerCase().replace(/_/g, "-") ?? null;
  return t && allowed.includes(t) ? t : null;
};
const bool = (v: unknown): boolean | null => (typeof v === "boolean" ? v : null);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** The old product's AI read of a resume (candidates.resume_profile), or null when it holds none of it. */
export function traitsFrom(rp: unknown): Traits | null {
  const r = obj(rp);
  const label = text(r.archetype_label, 200);
  const t: Traits = {
    // Some labels came back as a whole sentence: those are a reason, not a label.
    archetype: label && label.length <= 70 ? label : null,
    archetypeWhy: prose(r.archetype_reason) ?? (label && label.length > 70 ? label : null),
    style: level(r.execution_style, ["builder-first", "strategist-first", "operator-first", "hybrid"]),
    ownership: level(r.ownership_orientation, ["end-to-end", "scoped", "collaborative"]),
    ambiguity: level(r.ambiguity_tolerance, ["high", "medium", "low"]),
    shape: level(r.breadth_vs_depth, ["generalist", "specialist", "t-shaped"]),
    pace: level(r.trajectory_speed, ["fast", "normal", "slow"]),
    numbers: typeof r.achievement_density === "number" && Number.isFinite(r.achievement_density) ? Math.max(0, Math.min(100, Math.round(r.achievement_density))) : null,
    portfolio: bool(r.has_portfolio_signal),
    distributes: bool(r.distribution_signal),
    stages: list(r.company_stage_fit, 6),
    bestFit: list(r.company_type_best_fit, 6),
    avoid: list(r.company_type_avoid, 6),
    hook: prose(r.strongest_hook, 400),
    pitch: prose(r.candidate_pitch, 600),
    domain: text(r.subdomain, 60) ?? text(r.domain, 60),
  };
  return t.style || t.archetype || t.hook || t.ownership ? t : null;
}

const CLARITY: [RegExp, string][] = [[/^high$|know exactly/i, "high"], [/^medium$|general direction/i, "medium"], [/^low$|still figuring/i, "low"]];
const rupees = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.replace(/[, ]/g, "")) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return n < 200 ? Math.round(n * 100_000) : Math.round(n); // "6" means 6 lakh
};

/**
 * The old product's quiz and follow-up answers: parsed_json.preferences (what the onboarding quiz stored),
 * quiz_answers (the later quiz) and flex_notes (their best project and the result they are proudest of, in their words).
 */
export function quizFrom(prefsIn: unknown, answersIn: unknown, flexIn: unknown, dreamIn: unknown): Quiz | null {
  const p = obj(prefsIn);
  const a = obj(answersIn);
  const f = obj(flexIn);
  const clarityText = text(a.clarity, 120) ?? text(p.clarity, 40);
  const sal = obj(p.salary_expectations);
  const inr = !text(sal.currency, 8) || /inr|₹|rs/i.test(String(sal.currency));
  const dream = [...list(dreamIn, 8), ...(text(a.dream_companies, 300)?.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean) ?? [])];
  const q: Quiz = {
    stage: text(a.career_stage, 80) ?? text(p.career_stage, 80),
    clarity: clarityText ? CLARITY.find(([re]) => re.test(clarityText))?.[1] ?? null : null,
    risk: level(p.risk_tolerance, ["high", "medium", "low"]),
    size: text(p.company_size, 40),
    companyStage: text(a.company_stage, 200) ?? text(p.company_stage, 200),
    workMode: text(a.work_mode, 40) ?? text(p.work_mode, 40),
    ctcMin: inr ? rupees(sal.min_annual_ctc) : null,
    ctcMax: inr ? rupees(sal.max_annual_ctc) : null,
    bestProject: prose(f.best_project, 600),
    outcome: prose(f.outcome, 400),
    dream: [...new Set(dream)].slice(0, 8),
    niche: text(a.niche_keywords, 200) ?? (Array.isArray(p.niche_keywords) ? list(p.niche_keywords, 8).join(", ") || null : text(p.niche_keywords, 200)),
  };
  return Object.values(q).some((v) => (Array.isArray(v) ? v.length : v != null)) ? q : null;
}

const WISH_ORDER = ["culture", "team", "manager_style", "growth", "company_stage", "trade_off", "other"];
/** The call beyond the resume: why now, and what they want from a team in their words (career_cand_prefs). */
export function saidFrom(whyNow: string | null, prefs: { dim: string; avoid: boolean; text: string | null }[], refuses: string[]): Said | null {
  const seen = new Set<string>();
  const wishes = prefs
    .filter((x) => WISH_ORDER.includes(x.dim) && x.text)
    .sort((a, b) => WISH_ORDER.indexOf(a.dim) - WISH_ORDER.indexOf(b.dim))
    .map((x) => ({ dim: x.dim, avoid: x.avoid, text: scrubContacts((x.text as string).trim().slice(0, 240)) }))
    .filter((x) => (seen.has(x.text.toLowerCase()) ? false : (seen.add(x.text.toLowerCase()), true)))
    .slice(0, 8);
  const s: Said = { whyNow: prose(whyNow, 400), wishes, refuses: list(refuses, 8) };
  return s.whyNow || s.wishes.length || s.refuses.length ? s : null;
}

const JOB_TYPE: [RegExp, string][] = [[/intern/i, "internship"], [/full/i, "full_time"]];

/** A student from the old product only: what its resume read, quiz and profile hold, as a Candidate. */
export function fromOld(r: {
  id: string; name: string | null; email: string | null; created: number | null; rp: unknown; targetRoles: unknown; industries: unknown;
  dream: unknown; answers: unknown; prefs: unknown; summary: string | null; skills: unknown; flex: unknown;
  college: string | null; course: string | null; year: string | null; optedIn: boolean;
}): Candidate {
  const rp = obj(r.rp);
  const p = obj(r.prefs);
  const a = obj(r.answers);
  const traits = traitsFrom(rp);
  const quiz = quizFrom(r.prefs, r.answers, r.flex, r.dream);
  const geo = obj(rp.geography);
  const wanted = list(p.locations, 6).concat(text(a.location, 80) ? [String(a.location)] : []);
  const cities = [...new Set([...wanted, ...(text(geo.city, 60) ? [String(geo.city)] : [])].map((c) => c.trim()))]
    .filter((c) => !/^(remote|anywhere|any|india|flexible)$/i.test(c)).slice(0, 6);
  const mode = (quiz?.workMode ?? "").toLowerCase();
  const modes = /flex/.test(mode) ? ["flexible"] : ["onsite", "hybrid", "remote"].filter((m) => mode.includes(m === "onsite" ? "on" : m));
  const jt = text(a.job_type, 60) ?? "";
  const yrs = typeof rp.experience_years === "number" && Number.isFinite(rp.experience_years) ? rp.experience_years : null;
  const gy = /\b(20[1-3]\d)\b/.exec(r.year ?? "");
  const skills = [...list(rp.top_skills, 12), ...list(rp.most_recent_stack, 8), ...list(r.skills, 30)];
  const flex = obj(r.flex);
  return {
    id: r.id, source: "old", optedIn: r.optedIn, name: text(r.name, 120) ?? "A Studojo student", email: r.email ?? "",
    college: text(r.college, 160), course: text(r.course, 120), year: text(r.year, 40),
    traits, quiz, said: saidFrom(text(flex.why_now, 400), [], []),
    headline: traits?.archetype ?? null,
    summary: prose(r.summary, 900) ?? traits?.pitch ?? null,
    title: null, org: null, status: text(r.year, 40),
    expMonths: yrs != null ? Math.round(yrs * 12) : null,
    cities, relocate: null, modes, types: JOB_TYPE.filter(([re]) => re.test(jt)).map(([, k]) => k),
    payText: null, fixedMin: quiz?.ctcMin ?? null, stipendMin: null, notice: null, from: null, intent: null,
    degreeStatus: null, degree: text(r.course, 120) ?? text(rp.education_level, 40), grad: gy ? Number(gy[1]) : null,
    rolesWanted: [...new Set([...list(r.targetRoles, 6), ...(text(a.target_role, 120) ? [String(a.target_role).trim()] : [])])].slice(0, 6),
    rolesAdjacent: list(rp.likely_roles, 6),
    sectors: [...new Set([...list(r.industries, 6), ...list(p.industry_interests, 6)])].slice(0, 8),
    values: [],
    derivedAt: r.created ?? 0,
    claims: [...new Set(skills)].map((x) => ({ kind: "skill", text: `${x}: listed on the resume: ${x}`, org: null, when: null, qty: null, src: "resume" })),
  };
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
export const MODE_LABEL: Record<string, string> = { onsite: "On-site", hybrid: "Hybrid", remote: "Remote", flexible: "Flexible" };

/** What an ATS cannot see, in plain words. */
export const STYLE_LABEL: Record<string, string> = { "builder-first": "Builder", "operator-first": "Operator", "strategist-first": "Strategist", hybrid: "Hybrid" };
export const OWNERSHIP_LABEL: Record<string, string> = { "end-to-end": "Owns end to end", scoped: "Best with a clear scope", collaborative: "Strongest in a team" };
export const AMBIGUITY_LABEL: Record<string, string> = { high: "Fine without direction", medium: "Some direction helps", low: "Wants clear specs" };
export const SHAPE_LABEL: Record<string, string> = { "t-shaped": "T-shaped", generalist: "Generalist", specialist: "Specialist" };
export const PACE_LABEL: Record<string, string> = { fast: "Grows fast", normal: "Steady growth", slow: "Long in one role" };
export const RISK_LABEL: Record<string, string> = { high: "Takes risks", medium: "Some risk", low: "Plays it safe" };
export const CLARITY_LABEL: Record<string, string> = { high: "Knows exactly what they want", medium: "Has a direction", low: "Still figuring it out" };
export const WISH_LABEL: Record<string, string> = {
  culture: "Culture", team: "Team", manager_style: "Manager", growth: "Growth", company_stage: "Company", trade_off: "Trade-off", other: "Also said",
};

export const firstName = (name: string) => (name.trim().split(/\s+/)[0] || "Student").slice(0, 16);

/** What the shortlist keeps of a student: no email address, no phone number. */
export interface Brief {
  id: string;
  optedIn: boolean;
  style: string | null;
  hook: string | null;
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

export const briefOf = (c: Omit<Brief, "style" | "hook"> & { traits: Traits | null }): Brief => ({
  id: c.id, optedIn: c.optedIn, style: c.traits?.style ?? null, hook: c.traits?.hook ?? null, name: c.name, headline: c.headline, title: c.title, org: c.org, status: c.status, expMonths: c.expMonths, grad: c.grad,
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
        c.style ? `   Work style: ${STYLE_LABEL[c.style] ?? c.style}` : null,
        c.hook ? `   Why them: ${c.hook}` : null,
      ];
      return lines.filter(Boolean).join("\n");
    })
    .join("\n\n");
}
