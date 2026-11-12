// Server side of Talent search (model.ts has the rules). Read only, short statement timeout. Two kinds of student:
// - took the Stu call: a call-derived profile (career_agent.career_cand_profile) whose page lets hiring managers on
//   Studojo find them (user_profile.talent.page.visibility: link and managers both on), their live claims and what
//   they said beyond the resume (career_cand_prefs: culture, team, manager, growth, company, trade-offs);
// - the old product (TALENT-ALL, 12 Nov 2026): public.candidates (the AI read of the resume, the quiz, their own
//   answers) and public.user_profile (college, course, year). They never chose to be found by hiring managers, so they
//   are marked not opted in. A student who has a page and switched hiring managers off is left out entirely.
// Both meet in one pool, read whole and kept ten minutes (the old product's rows hardly change, and the production
// database is IOPS-bound); each search runs over that copy. Never read: resume text, email or phone inside the parsed
// resume. Internal accounts (staff, @studojo.com, the test list, guests) are left out unless asked for, as on the Stu
// pages. TALENT-NET (12 Nov 2026, the owner: "need our mapping to be more accurate and on the top show a bar with total
// number of students, the graph should be like a neural network, where if i click then go deeper to see each student"):
// each student is placed once per pool read (families.ts), the network and the top bar's counts come from every
// student a search finds, and an open family or role narrows the list only.
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { internalReason, testUsers } from "~/lib/stu/data.server";
import { canonOf, countsOf, famLabel, netOf, placeOf, roleLabelOf, within } from "./families";
import {
  type Candidate, type Claim, type Filters, type Result, cityKey, cityLabel, fromOld, parseTerms, saidFrom, search, skillsOf, vocabOf,
} from "./model";
import type { TalentEnvelope, WirePlace, WireResult } from "./wire";

const CAP = 60;
const TTL_MS = 10 * 60_000;

async function read<T>(fn: (q: (s: SQL) => Promise<any[]>) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '15s'`);
      return fn(async (s) => (await tx.execute(s)).rows as any[]);
    },
    { accessMode: "read only" },
  );
}

type Person = Candidate & { internal: string | null };
interface Pool { env: string; live: boolean; all: Person[]; derived: Map<boolean, { vocab: Set<string>; cityN: Map<string, number>; grads: number[] }> }
let cache: { at: number; pool: Pool } | null = null;

/** A text[] column, blanks dropped and repeats (any case) kept once. */
const arr = (v: unknown): string[] => {
  if (!Array.isArray(v)) return [];
  const seen = new Set<string>();
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim())
    .filter((x) => (seen.has(x.toLowerCase()) ? false : (seen.add(x.toLowerCase()), true)));
};
const num = (v: unknown): number | null => (v == null || v === "" || !Number.isFinite(Number(v)) ? null : Number(v));
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

// Took the call: the page is public and hiring managers on Studojo may find it.
const ELIGIBLE = sql`
  SELECT c.user_id FROM career_agent.career_cand_profile c
   WHERE EXISTS (SELECT 1 FROM public.user_profile p
                  WHERE p.user_id = c.user_id
                    AND p.talent->'page'->'visibility'->>'link' = 'true'
                    AND p.talent->'page'->'visibility'->>'managers' = 'true')`;
const WISH_DIMS = sql.raw(`ARRAY['culture','team','manager_style','growth','company_stage','trade_off','other']::text[]`);

async function loadPool(fresh: boolean): Promise<Pool> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.pool;
  const pool = await read(async (q): Promise<Pool> => {
    const reg = (await q(sql`
      SELECT to_regclass('career_agent.career_cand_profile') IS NOT NULL AS p,
             to_regclass('career_agent.career_cand_claims') IS NOT NULL AS k,
             to_regclass('career_agent.career_cand_prefs') IS NOT NULL AS f,
             to_regclass('public.candidates') IS NOT NULL AS o,
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'talent') AS t,
             current_database() AS db`))[0] ?? {};
    const env = /staging/i.test(String(reg.db ?? "")) ? "staging" : "production";
    const derived = new Map();
    if (!reg.t) return { env, live: false, all: [], derived };
    const tests = testUsers();
    const byId = new Map<string, Person>();

    // The old product first, so a student who later took the call keeps its resume read and quiz under the call's profile.
    const profiles = await q(sql`
      SELECT DISTINCT ON (p.user_id) p.user_id AS id, left(p.college, 160) AS college, left(p.course, 120) AS course,
             left(p.year_of_study, 40) AS year, coalesce(p.talent ? 'page', false) AS has_page,
             coalesce(p.talent->'page'->'visibility'->>'link', '') = 'true'
               AND coalesce(p.talent->'page'->'visibility'->>'managers', '') = 'true' AS opted
        FROM public.user_profile p
       ORDER BY p.user_id, p.updated_at DESC NULLS LAST
       LIMIT 50000`);
    const prof = new Map(profiles.map((r) => [String(r.id), r]));
    const old = reg.o
      ? await q(sql`
          SELECT DISTINCT ON (c.user_id) c.user_id AS id,
                 c.resume_profile - 'name' - 'location' AS rp, c.target_roles AS tr, c.target_industries AS ti, c.dream_companies AS dream,
                 c.quiz_answers AS qa, c.parsed_json->'preferences' AS prefs, left(c.parsed_json->>'profile_summary', 900) AS summary,
                 c.parsed_json->'personal_info'->'skills_detected' AS skills,
                 jsonb_build_object('best_project', left(c.flex_notes->>'best_project', 600), 'outcome', left(c.flex_notes->>'outcome', 400),
                                    'why_now', left(c.flex_notes->>'why_now', 400)) AS flex,
                 (extract(epoch from c.created_at) * 1000)::float8 AS created
            FROM public.candidates c
           WHERE c.user_id IS NOT NULL
           ORDER BY c.user_id, coalesce(c.resume_profile ? 'execution_style', false) DESC, c.created_at DESC
           LIMIT 50000`)
      : [];
    const oldById = new Map(old.map((r) => [String(r.id), r]));
    const ids = [...new Set([...oldById.keys(), ...prof.keys()])];
    const users = ids.length
      ? await q(sql`SELECT id, name, email, role FROM public."user" WHERE id = ANY(string_to_array(${ids.join(",")}, ','))`)
      : [];
    for (const u of users) {
      const id = String(u.id);
      const p = prof.get(id);
      if (p?.has_page && !p.opted) continue; // switched hiring managers off on their page
      const o = oldById.get(id);
      if (!o && !str(p?.college) && !str(p?.course)) continue; // nothing to search
      const c = fromOld({
        id, name: str(u.name), email: str(u.email), created: num(o?.created), rp: o?.rp, targetRoles: o?.tr, industries: o?.ti,
        dream: o?.dream, answers: o?.qa, prefs: o?.prefs, summary: str(o?.summary), skills: o?.skills, flex: o?.flex,
        college: str(p?.college), course: str(p?.course), year: str(p?.year), optedIn: !!p?.opted,
      });
      byId.set(id, { ...c, internal: internalReason({ id, email: u.email ?? null, role: u.role ?? null }, tests) });
    }

    if (reg.p && reg.k) {
      const rows = await q(sql`
        SELECT c.user_id AS id, u.name, u.email, u.role, c.headline, c.summary, c.current_title, c.current_org_name, c.current_status,
               c.total_exp_months, c.cities, c.relocate, c.work_modes, c.job_types, c.current_pay_text,
               c.expected_fixed_min::float8 AS fixed_min, c.expected_stipend_min::float8 AS stipend_min, c.notice_text, c.available_from,
               c.intent, c.degree_status, c.highest_degree, c.grad_year, c.roles_wanted, c.roles_adjacent, c.sectors, c.work_values,
               left(c.why_now, 400) AS why_now, c.roles_refused, c.sectors_refused,
               (extract(epoch from c.derived_at) * 1000)::float8 AS derived
          FROM career_agent.career_cand_profile c
          JOIN public."user" u ON u.id = c.user_id
         WHERE c.user_id IN (${ELIGIBLE})
         LIMIT 20000`);
      const claims = await q(sql`
        SELECT k.user_id AS id, k.kind, left(k.text, 400) AS text, left(k.org_name, 120) AS org, left(k.when_text, 60) AS "when",
               left(k.qty_text, 80) AS qty, k.evidence_source AS src
          FROM career_agent.career_cand_claims k
         WHERE k.superseded_at IS NULL AND NOT k.negated AND k.user_id IN (${ELIGIBLE})
         ORDER BY k.user_id, k.valid_from DESC NULLS LAST, k.id
         LIMIT 200000`);
      const prefs = reg.f
        ? await q(sql`
            SELECT f.user_id AS id, f.dimension AS dim, f.polarity = 'avoid' AS avoid, left(coalesce(f.statement, f.value_text), 300) AS text
              FROM career_agent.career_cand_prefs f
             WHERE f.superseded_at IS NULL AND f.dimension = ANY(${WISH_DIMS}) AND f.user_id IN (${ELIGIBLE})
             ORDER BY f.user_id, f.stated_at DESC
             LIMIT 50000`)
        : [];
      const claimsOf = new Map<string, Claim[]>();
      for (const k of claims) {
        const list = claimsOf.get(k.id) ?? [];
        list.push({ kind: String(k.kind), text: String(k.text ?? ""), org: str(k.org), when: str(k.when), qty: str(k.qty), src: String(k.src ?? "") });
        claimsOf.set(k.id, list);
      }
      const prefsOf = new Map<string, { dim: string; avoid: boolean; text: string | null }[]>();
      for (const f of prefs) {
        const list = prefsOf.get(f.id) ?? [];
        list.push({ dim: String(f.dim), avoid: !!f.avoid, text: str(f.text) });
        prefsOf.set(f.id, list);
      }
      for (const r of rows) {
        const id = String(r.id);
        const before = byId.get(id);
        const p = prof.get(id);
        byId.set(id, {
          id, source: "call", optedIn: true, name: str(r.name) ?? "A Studojo student", email: str(r.email) ?? "",
          internal: internalReason({ id, email: r.email ?? null, role: r.role ?? null }, tests),
          college: str(p?.college), course: str(p?.course), year: str(p?.year),
          traits: before?.traits ?? null, quiz: before?.quiz ?? null,
          said: saidFrom(str(r.why_now), prefsOf.get(id) ?? [], [...arr(r.roles_refused), ...arr(r.sectors_refused)]),
          headline: str(r.headline), summary: str(r.summary), title: str(r.current_title), org: str(r.current_org_name), status: str(r.current_status),
          expMonths: num(r.total_exp_months), cities: arr(r.cities), relocate: str(r.relocate), modes: arr(r.work_modes), types: arr(r.job_types),
          payText: str(r.current_pay_text), fixedMin: num(r.fixed_min), stipendMin: num(r.stipend_min), notice: str(r.notice_text),
          from: str(r.available_from), intent: str(r.intent), degreeStatus: str(r.degree_status), degree: str(r.highest_degree), grad: num(r.grad_year),
          rolesWanted: arr(r.roles_wanted), rolesAdjacent: arr(r.roles_adjacent), sectors: arr(r.sectors), values: arr(r.work_values),
          derivedAt: num(r.derived) ?? 0, claims: claimsOf.get(id) ?? [],
        });
      }
    }
    return { env, live: true, all: [...byId.values()], derived };
  });
  // TALENT-NET: place everyone once per read (after the transaction); search then also matches the family and role.
  for (const c of pool.all) c.canon = canonOf(placeOf(c, skillsOf(c)));
  cache = { at: Date.now(), pool };
  return pool;
}

/** The pool's words, cities and grad years, worked out once per pool (with or without internal accounts). */
function derivedOf(pool: Pool, people: Person[], internal: boolean) {
  const hit = pool.derived.get(internal);
  if (hit) return hit;
  const cityN = new Map<string, number>();
  for (const c of people) for (const k of new Set(c.cities.map(cityKey))) cityN.set(k, (cityN.get(k) ?? 0) + 1);
  const grads = [...new Set(people.map((c) => c.grad).filter((g): g is number => g != null))].sort((a, b) => b - a);
  const out = { vocab: vocabOf(people), cityN, grads };
  pool.derived.set(internal, out);
  return out;
}

/** Where a student sits, with labels, for the page. */
function placeWire(r: Result): WirePlace {
  const p = placeOf(r.c, r.skills);
  return {
    family: p.family, familyLabel: famLabel(p.family), role: p.role, roleLabel: p.roleName, why: p.why,
    also: p.also.map((a) => ({ family: a.family, familyLabel: famLabel(a.family), role: a.role, roleLabel: roleLabelOf(a.role) })),
  };
}

/** One result as the page needs it: the profile, the claims grouped and trimmed, why it matched and where it sits. */
function wire(r: Result): WireResult {
  const c = r.c;
  const of = (kinds: string[], n: number) => c.claims.filter((k) => kinds.includes(k.kind)).slice(0, n);
  const saidSkills = c.claims.filter((k) => (k.kind === "skill" || k.kind === "tool") && k.src === "call").slice(0, 5).map((k) => k.text);
  const outs = c.claims.filter((k) => k.kind === "outcome");
  const { claims: _claims, internal: _internal, canon: _canon, ...rest } = c as Person;
  return {
    ...rest,
    skills: r.skills.slice(0, 40),
    roles: of(["role"], 6),
    outcomes: of(["outcome"], 5),
    projects: of(["project"], 4),
    credentials: of(["credential"], 4),
    saidSkills,
    numbered: { n: outs.filter((k) => k.qty || /\d/.test(k.text)).length, of: outs.length },
    hits: r.hits,
    matched: r.matched,
    score: r.score,
    place: placeWire(r),
  };
}

/** Everyone Talent search reads (internal accounts left out unless asked), for scripts/talent-families-dry.mjs. */
export async function talentPool(internal = false, fresh = false): Promise<Candidate[]> {
  const pool = await loadPool(fresh);
  return pool.all.filter((c) => internal || !c.internal);
}

export async function talentSearch(f: Filters, internal: boolean, fresh: boolean): Promise<TalentEnvelope> {
  const t0 = Date.now();
  const pool = await loadPool(fresh);
  const people = pool.all.filter((c) => internal || !c.internal);
  const { vocab, cityN, grads } = derivedOf(pool, people, internal);
  const terms = parseTerms(f.q, vocab, new Set(cityN.keys()));
  const results = search(people, terms, f);
  // The network is everyone the search found; the open family or role narrows only the list and the "showing" counts.
  const net = netOf(results.map((r) => placeOf(r.c, r.skills)));
  const shown = f.fam ? results.filter((r) => within(placeOf(r.c, r.skills), f.fam, f.role)) : results;
  return {
    env: pool.env,
    live: pool.live,
    pool: people.length,
    hidden: pool.all.length - people.length,
    counts: { all: countsOf(people), shown: countsOf(shown.map((r) => r.c)) },
    total: results.length,
    terms,
    results: shown.slice(0, CAP).map(wire),
    net,
    fam: f.fam,
    role: f.fam ? f.role : "",
    cities: [...cityN.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([key, n]) => ({ key, label: cityLabel(key), n })),
    grads,
    ms: Date.now() - t0,
  };
}
