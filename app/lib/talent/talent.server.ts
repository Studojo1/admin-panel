// Server side of Talent search (model.ts has the rules). Read only, short statement timeout. The pool is every student
// with a call-derived profile (career_agent.career_cand_profile) whose page lets hiring managers on Studojo find them
// (user_profile.talent.page.visibility: link and managers both on), plus their live claims. A few hundred rows, so it
// is read whole and kept a minute; each search runs over that copy. Internal accounts (staff, @studojo.com, the test
// list, guests) are left out unless asked for, with the same rule as the Stu pages.
import { sql, type SQL } from "drizzle-orm";
import db from "~/lib/db.server";
import { internalReason, testUsers } from "~/lib/stu/data.server";
import {
  type Candidate, type Claim, type Filters, type Result, cityKey, cityLabel, graphOf, parseTerms, search, vocabOf,
} from "./model";
import type { TalentEnvelope, WireResult } from "./wire";

const CAP = 60;
const TTL_MS = 60_000;

async function read<T>(fn: (q: (s: SQL) => Promise<any[]>) => Promise<T>): Promise<T> {
  return db.transaction(
    async (tx) => {
      await tx.execute(sql`SET LOCAL statement_timeout = '10s'`);
      return fn(async (s) => (await tx.execute(s)).rows as any[]);
    },
    { accessMode: "read only" },
  );
}

interface Pool { env: string; live: boolean; all: (Candidate & { internal: string | null })[] }
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

// Eligible: the page is public and hiring managers on Studojo may find it.
const ELIGIBLE = sql`
  SELECT c.user_id FROM career_agent.career_cand_profile c
   WHERE EXISTS (SELECT 1 FROM public.user_profile p
                  WHERE p.user_id = c.user_id
                    AND p.talent->'page'->'visibility'->>'link' = 'true'
                    AND p.talent->'page'->'visibility'->>'managers' = 'true')`;

async function loadPool(fresh: boolean): Promise<Pool> {
  if (!fresh && cache && Date.now() - cache.at < TTL_MS) return cache.pool;
  const pool = await read(async (q) => {
    const reg = (await q(sql`
      SELECT to_regclass('career_agent.career_cand_profile') IS NOT NULL AS p,
             to_regclass('career_agent.career_cand_claims') IS NOT NULL AS k,
             EXISTS (SELECT 1 FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = 'user_profile' AND column_name = 'talent') AS t,
             current_database() AS db`))[0] ?? {};
    const env = /staging/i.test(String(reg.db ?? "")) ? "staging" : "production";
    if (!reg.p || !reg.k || !reg.t) return { env, live: false, all: [] };
    const rows = await q(sql`
      SELECT c.user_id AS id, u.name, u.email, u.role, c.headline, c.summary, c.current_title, c.current_org_name, c.current_status,
             c.total_exp_months, c.cities, c.relocate, c.work_modes, c.job_types, c.current_pay_text,
             c.expected_fixed_min::float8 AS fixed_min, c.expected_stipend_min::float8 AS stipend_min, c.notice_text, c.available_from,
             c.intent, c.degree_status, c.highest_degree, c.grad_year, c.roles_wanted, c.roles_adjacent, c.sectors, c.work_values,
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
    const byUser = new Map<string, Claim[]>();
    for (const k of claims) {
      const list = byUser.get(k.id) ?? [];
      list.push({ kind: String(k.kind), text: String(k.text ?? ""), org: str(k.org), when: str(k.when), qty: str(k.qty), src: String(k.src ?? "") });
      byUser.set(k.id, list);
    }
    const tests = testUsers();
    const all = rows.map((r) => ({
      id: String(r.id), name: str(r.name) ?? "A Studojo student", email: str(r.email) ?? "",
      internal: internalReason({ id: String(r.id), email: r.email ?? null, role: r.role ?? null }, tests),
      headline: str(r.headline), summary: str(r.summary), title: str(r.current_title), org: str(r.current_org_name), status: str(r.current_status),
      expMonths: num(r.total_exp_months), cities: arr(r.cities), relocate: str(r.relocate), modes: arr(r.work_modes), types: arr(r.job_types),
      payText: str(r.current_pay_text), fixedMin: num(r.fixed_min), stipendMin: num(r.stipend_min), notice: str(r.notice_text),
      from: str(r.available_from), intent: str(r.intent), degreeStatus: str(r.degree_status), degree: str(r.highest_degree), grad: num(r.grad_year),
      rolesWanted: arr(r.roles_wanted), rolesAdjacent: arr(r.roles_adjacent), sectors: arr(r.sectors), values: arr(r.work_values),
      derivedAt: num(r.derived) ?? 0, claims: byUser.get(String(r.id)) ?? [],
    }));
    return { env, live: true, all };
  });
  cache = { at: Date.now(), pool };
  return pool;
}

/** One result as the page needs it: the profile, the claims grouped and trimmed, and why it matched. */
function wire(r: Result): WireResult {
  const c = r.c;
  const of = (kinds: string[], n: number) => c.claims.filter((k) => kinds.includes(k.kind)).slice(0, n);
  const said = c.claims.filter((k) => (k.kind === "skill" || k.kind === "tool") && k.src === "call").slice(0, 5).map((k) => k.text);
  const { claims: _claims, ...rest } = c;
  return {
    ...rest,
    skills: r.skills.slice(0, 40),
    roles: of(["role"], 6),
    outcomes: of(["outcome"], 5),
    projects: of(["project"], 4),
    credentials: of(["credential"], 4),
    said,
    hits: r.hits,
    matched: r.matched,
    score: r.score,
  };
}

export async function talentSearch(f: Filters, internal: boolean, fresh: boolean): Promise<TalentEnvelope> {
  const t0 = Date.now();
  const pool = await loadPool(fresh);
  const people = pool.all.filter((c) => internal || !c.internal);
  const cityN = new Map<string, number>();
  for (const c of people) for (const k of new Set(c.cities.map(cityKey))) cityN.set(k, (cityN.get(k) ?? 0) + 1);
  const terms = parseTerms(f.q, vocabOf(people), new Set(cityN.keys()));
  const results = search(people, terms, f);
  const graph = graphOf(results, terms, CAP);
  const grads = [...new Set(people.map((c) => c.grad).filter((g): g is number => g != null))].sort((a, b) => b - a);
  return {
    env: pool.env,
    live: pool.live,
    pool: people.length,
    hidden: pool.all.length - people.length,
    total: results.length,
    terms,
    results: results.slice(0, CAP).map(wire),
    graph,
    cities: [...cityN.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 30).map(([key, n]) => ({ key, label: cityLabel(key), n })),
    grads,
    ms: Date.now() - t0,
  };
}
