// Vendor balances for /vendors, server only: the API keys are read from the
// environment here and never leave the server. Both balance endpoints are free
// (0 credits). Every answer is kept 10 minutes in memory (a failed read 1
// minute), so the page never polls a vendor.
//
// Only type imports (erased), so `node --test scripts/vendors-model.test.mjs`
// reads this file as is with a fake fetch. Never log a key or a request header.
import type { Balance, BalanceState } from "./model";

export const LEADSFORGE_BALANCE_URL = "https://api.leadsforge.ai/public/v1/balance";
export const APOLLO_USAGE_URL = "https://api.apollo.io/api/v1/usage_stats/credit_usage_stats";
export const BALANCE_TTL_MS = 10 * 60_000;
export const BALANCE_ERROR_TTL_MS = 60_000;
const TIMEOUT_MS = 10_000;

const istDay = (ms: number): string => new Date(ms + 330 * 60_000).toISOString().slice(0, 10);

export const balanceOf = (b: Partial<Balance> & { state: BalanceState }): Balance => ({
  credits: null, limit: null, consumed: null, cycleStart: null, renewsOn: null, note: null, checkedAt: null, ...b,
});

function json(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** A vendor date ("2026-11-15" or an ISO timestamp) as an IST day. */
export function vendorDay(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const s = v.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const t = Date.parse(s);
  return Number.isFinite(t) ? istDay(t) : null;
}

/**
 * LeadsForge GET /public/v1/balance. 200 {"availableCredits": N}; 402 means out
 * of credits; 401/403 mean the key is wrong.
 */
export function parseLeadsforgeBalance(status: number, text: string, at: number): Balance {
  if (status === 402) return balanceOf({ state: "out", credits: 0, note: "out of credits", checkedAt: at });
  if (status === 401 || status === 403) return balanceOf({ state: "bad_key", note: `key rejected (HTTP ${status})`, checkedAt: at });
  if (status < 200 || status >= 300) return balanceOf({ state: "error", note: status === 429 ? "rate limited, try again later" : `HTTP ${status}`, checkedAt: at });
  const credits = num(json(text)?.availableCredits);
  if (credits == null) return balanceOf({ state: "error", note: "unexpected answer (no availableCredits)", checkedAt: at });
  return balanceOf({ state: credits <= 0 ? "out" : "ok", credits: Math.max(0, credits), note: credits <= 0 ? "out of credits" : null, checkedAt: at });
}

/**
 * Apollo POST /api/v1/usage_stats/credit_usage_stats (free). lead_credit funds the
 * email reveals we buy. 403 API_INACCESSIBLE: the key is not a master key (or
 * not scoped to this endpoint); 401: wrong key; 422 naming credits: out.
 */
export function parseApolloBalance(status: number, text: string, at: number): Balance {
  const body = json(text);
  if (status === 403 && (body?.error_code === "API_INACCESSIBLE" || /API_INACCESSIBLE/.test(text))) {
    return balanceOf({ state: "no_scope", note: "Apollo balance needs a master API key; showing our own logged usage only", checkedAt: at });
  }
  if (status === 401 || status === 403) return balanceOf({ state: "bad_key", note: `key rejected (HTTP ${status})`, checkedAt: at });
  if (status === 422 && /credit/i.test(text)) return balanceOf({ state: "out", credits: 0, note: "out of credits", checkedAt: at });
  if (status < 200 || status >= 300) return balanceOf({ state: "error", note: status === 429 ? "rate limited, try again later" : `HTTP ${status}`, checkedAt: at });
  const lead = body?.credit_usage_stats?.lead_credit;
  const cycle = body?.current_credit_cycle ?? {};
  const limit = num(lead?.limit);
  const consumed = num(lead?.consumed);
  let left = num(lead?.left_over);
  if (left == null && limit != null && consumed != null) left = limit - consumed;
  if (left == null) return balanceOf({ state: "error", note: "unexpected answer (no lead_credit)", checkedAt: at });
  const out = left <= 0;
  return balanceOf({
    state: out ? "out" : "ok",
    credits: Math.max(0, left),
    limit,
    consumed,
    cycleStart: vendorDay(cycle.start_date),
    renewsOn: vendorDay(cycle.end_date),
    note: out ? "out of credits" : null,
    checkedAt: at,
  });
}

/** The slice of fetch this file uses, so tests can pass a fake. */
export type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ status: number; text(): Promise<string> }>;

/** Plain words for a failed request. Never the error text: it is not ours to show. */
function networkNote(e: unknown): string {
  const name = (e as { name?: string } | null)?.name;
  return name === "TimeoutError" || name === "AbortError" ? `no answer in ${TIMEOUT_MS / 1000} s` : "could not reach the vendor";
}

const clean = (key: string | undefined): string => (key ?? "").trim();

/** LeadsForge: GET, the raw key in Authorization (no "Bearer"). */
export async function readLeadsforgeBalance(key: string | undefined, fetchImpl: FetchLike, now: () => number = Date.now): Promise<Balance> {
  const k = clean(key);
  if (!k) return balanceOf({ state: "no_key", note: "LEADSFORGE_API_KEY is not set here" });
  try {
    const res = await fetchImpl(LEADSFORGE_BALANCE_URL, {
      method: "GET",
      headers: { Authorization: k, Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return parseLeadsforgeBalance(res.status, await res.text(), now());
  } catch (e) {
    return balanceOf({ state: "error", note: networkNote(e) });
  }
}

/** Apollo: POST, the key in x-api-key. */
export async function readApolloBalance(key: string | undefined, fetchImpl: FetchLike, now: () => number = Date.now): Promise<Balance> {
  const k = clean(key);
  if (!k) return balanceOf({ state: "no_key", note: "APOLLO_API_KEY is not set here" });
  try {
    const res = await fetchImpl(APOLLO_USAGE_URL, {
      method: "POST",
      headers: { "x-api-key": k, "Content-Type": "application/json", "Cache-Control": "no-cache", Accept: "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    return parseApolloBalance(res.status, await res.text(), now());
  } catch (e) {
    return balanceOf({ state: "error", note: networkNote(e) });
  }
}

/**
 * One answer kept for BALANCE_TTL_MS (an "error" answer for BALANCE_ERROR_TTL_MS),
 * shared by concurrent callers while the request is in flight.
 */
export function cachedBalance(load: () => Promise<Balance>, now: () => number = Date.now): () => Promise<Balance> {
  let entry: { at: number; ttl: number; value: Promise<Balance> } | null = null;
  return () => {
    const t = now();
    if (entry && t - entry.at < entry.ttl) return entry.value;
    const value = load();
    const e = { at: t, ttl: BALANCE_TTL_MS, value };
    entry = e;
    value.then(
      (b) => {
        if (b.state === "error") e.ttl = BALANCE_ERROR_TTL_MS;
      },
      () => {
        if (entry === e) entry = null;
      },
    );
    return value;
  };
}

const leadsforge = cachedBalance(() => readLeadsforgeBalance(process.env.LEADSFORGE_API_KEY, fetch));
const apollo = cachedBalance(() => readApolloBalance(process.env.APOLLO_API_KEY, fetch));

/** Both balances, at most 10 minutes old. */
export async function balances(): Promise<{ leadsforge: Balance; apollo: Balance }> {
  const [lf, ap] = await Promise.all([leadsforge(), apollo()]);
  return { leadsforge: lf, apollo: ap };
}
