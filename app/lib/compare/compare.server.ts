// OLD-VS-NEW (15 Nov 2026): builds the /compare report. The old side (old.server.ts, kept 12 hours) and Stu (the Stu
// dataset every Stu page reads, data.server.ts stuData, with the Stu model's own functions) are put in one shape and
// compared by app/lib/compare/model.ts. Distinct visitors per window come from PostHog for the old side (and for the
// same-method row on the new side); a PostHog failure leaves visitors as not available, the rest still shows.
import * as stu from "~/lib/stu/model";
import { stuData } from "~/lib/stu/data.server";
import { Refs } from "~/lib/stu/overview";
import {
  type ActiveRow, type BaseSpec, type CompareEnvelope, type PCell, type Params, type SideData, type Win,
  OLD_STEPS, OLD_VISITORS_FROM, RELAUNCH_DAY, newSide, report, windowsNeeded, winKey,
} from "./model";
import { oldDb, oldPosthog } from "./old.server";
import { newDbExtras, newPosthog } from "./new.server";
import { posthogConfigured, visitorsPerWindow } from "./posthog.server";


/** Distinct PostHog visitors per window, kept per window: old windows never change (12 h), new ones 10 minutes. */
const winMemo = new Map<string, { v: number; at: number }>();
const OLD_TTL = 12 * 3_600_000;
const NEW_TTL = 10 * 60_000;

async function distinctFor(wins: Win[], ttlMs: number, fresh: boolean): Promise<Record<string, number>> {
  const now = Date.now();
  const out: Record<string, number> = {};
  const todo: Win[] = [];
  for (const w of wins) {
    const hit = winMemo.get(winKey(w));
    if (!fresh && hit && now - hit.at < ttlMs) out[winKey(w)] = hit.v;
    else todo.push(w);
  }
  if (todo.length) {
    const got = await visitorsPerWindow(todo);
    for (const [k, v] of Object.entries(got)) {
      out[k] = v;
      winMemo.delete(k);
      winMemo.set(k, { v, at: now });
    }
    while (winMemo.size > 500) winMemo.delete(winMemo.keys().next().value as string);
  }
  return out;
}

const isCell = (x: any): x is PCell => x && typeof x === "object" && typeof x.v === "number" && Array.isArray(x.users);
/** Every people cell in a value, depth first. */
function walk(x: any, fn: (c: PCell) => void, depth = 0) {
  if (!x || typeof x !== "object" || depth > 8) return;
  if (isCell(x)) {
    fn(x);
    return;
  }
  for (const v of Array.isArray(x) ? x : Object.values(x)) walk(v, fn, depth + 1);
}

export interface CompareQuery {
  newWin: Win;
  base: BaseSpec;
  horizon: number | null;
  fresh: boolean;
}

export async function compareReport(qy: CompareQuery): Promise<CompareEnvelope> {
  const t0 = Date.now();
  const nowMs = Date.now();
  const today = stu.todayIst();
  const [od, d] = await Promise.all([oldDb(qy.fresh), stuData(qy.fresh)]);
  let phError: string | null = posthogConfigured() ? null : "PostHog key not configured";
  const [oph, nph, extras] = await Promise.all([
    phError ? Promise.resolve(null) : oldPosthog(qy.fresh).catch((e) => ((phError = String(e?.message || e)), null)),
    phError ? Promise.resolve(null) : newPosthog(RELAUNCH_DAY, today, qy.fresh).catch((e) => ((phError = String(e?.message || e)), null)),
    newDbExtras(d),
  ]);

  // ---------------------------------------------------------------- the old side
  const oldDistinct: Record<string, number> = {};
  const active: ActiveRow[] = [...od.active];
  if (oph) {
    const seen = new Set(active.map(([p, day]) => `${p}|${day}`));
    for (const [id, day] of oph.signedIn) {
      const p = od.ids[id];
      if (p == null || day >= RELAUNCH_DAY || seen.has(`${p}|${day}`)) continue;
      seen.add(`${p}|${day}`);
      active.push([p, day]);
    }
  }
  // PostHog's first day on studojo.com (31 Mar 2026) was a part day: old visitors count from its first whole day.
  const oldVisitors = oph ? Object.fromEntries(Object.entries(oph.visitors).filter(([day]) => day >= OLD_VISITORS_FROM && day < RELAUNCH_DAY)) : {};
  const old: SideData = {
    side: "old", from: od.from, to: od.to, people: od.people, steps: OLD_STEPS, act: { start: "resume", value: "leads" },
    pays: od.pays, refunds: [], refundsKept: false, mail: od.mail, reach: od.reach, replies: od.replies, active,
    visitors: oldVisitors, visitorsFromMs: null,
    distinct: (w) => oldDistinct[winKey(w)] ?? null,
    ph: oph ? oldVisitors : null,
    phDistinct: (w) => oldDistinct[winKey(w)] ?? null,
  };

  // ---------------------------------------------------------------- the new side
  const newPh: Record<string, number> = {};
  const neu = newSide(d, stu, {
    reach: extras.reach, positive: extras.positive, bounces: extras.bounces, refunds: extras.refunds,
    ph: nph, phDistinct: (w) => newPh[winKey(w)] ?? null,
  }, today);

  const params: Params = { newWin: qy.newWin, base: qy.base, horizon: qy.horizon, nowMs };
  const need = windowsNeeded(old, neu, params);
  // Each side's windows are read when its daily PostHog read worked, whatever happened to the other.
  const [a, b] = await Promise.all([
    oph ? distinctFor(need.old, OLD_TTL, qy.fresh).catch((e) => ((phError = String(e?.message || e)), {})) : Promise.resolve({}),
    nph ? distinctFor(need.neuPh, NEW_TTL, qy.fresh).catch((e) => ((phError = String(e?.message || e)), {})) : Promise.resolve({}),
  ]);
  Object.assign(oldDistinct, a);
  Object.assign(newPh, b);

  const r = report(old, neu, params);

  // Old cells: counts only (their indexes mean nothing outside the server). New cells: the people behind them.
  const strip = (c: PCell) => {
    c.users = [];
  };
  walk(r.old, strip);
  walk(r.funnels.old, strip);
  for (const m of r.months) if (m.side === "old") walk(m.m, strip);
  for (const row of r.rows) if (row.old.cell) strip(row.old.cell);
  const refs = new Refs(d);
  const keep = (c: PCell) => {
    refs.cell({ v: c.v, users: c.users });
  };
  walk(r.funnels.neu, keep);
  walk(r.rows.map((x) => x.neu), keep);
  walk(r.channels.rows.map((x) => x.neu), keep);
  // The page opens people from the scoreboard, the funnel and the channels only: the window and month totals go as
  // counts (copies, as the scoreboard's cells are the same objects).
  const countsOnly = <T,>(x: T): T => JSON.parse(JSON.stringify(x), (_k, v) => (isCell(v) ? { v: v.v, users: [] } : v));
  r.neu = countsOnly(r.neu);
  r.months = r.months.map((m) => (m.side === "new" ? { ...m, m: countsOnly(m.m) } : m));

  return {
    generatedAt: new Date().toISOString(), oldReadAt: od.generatedAt, newReadAt: d.generatedAt, env: od.env, present: od.present,
    report: r, people: refs.people,
    visitors: { old: oph != null, posthogNew: nph != null, error: phError },
    excluded: od.excluded, accounts: od.accounts, kept: od.people.length, money: od.money, other: od.other,
    activeFromPosthog: oph != null, newMissing: extras.missing, ms: Date.now() - t0,
  };
}
