// Small helpers that reproduce Python's behaviour, so the archive's Career
// Coach numbers match what cc-backend (Python) returned to the old dashboard.

/** Python truthiness: None, False, 0, "", [] and {} are false. */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** Python `a or b`. */
export function or<T, U>(a: T, b: U): T | U {
  return truthy(a) ? a : b;
}

// Exact decimal digits of a number or a Postgres numeric string.
function decimalString(x: number | string): string {
  if (typeof x === "string") return x.trim();
  if (Number.isInteger(x)) return String(x);
  // toFixed takes up to 100 digits since ES2018; all of them are needed here.
  // oxlint-disable-next-line number-arg-out-of-range
  return x.toFixed(100);
}

/**
 * Python round(x, n) for a float (or round(Decimal, n) for a numeric string):
 * round half to even on the exact decimal value.
 */
export function pyRound(x: number | string, n: number): number {
  const s = decimalString(x);
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s;
  const [intPart, fracPart = ""] = body.split(".");
  const frac = fracPart.padEnd(n + 1, "0");
  const keep = intPart + frac.slice(0, n);
  const next = frac.charCodeAt(n) - 48;
  const rest = frac.slice(n + 1);
  let digits = BigInt(keep || "0");
  const restNonZero = /[1-9]/.test(rest);
  if (next > 5 || (next === 5 && (restNonZero || digits % 2n === 1n))) digits += 1n;
  const str = digits.toString().padStart(n + 1, "0");
  const out = n > 0 ? `${str.slice(0, str.length - n)}.${str.slice(str.length - n)}` : str;
  const val = Number(out);
  return neg && val !== 0 ? -val : val;
}

const pad = (v: number, w = 2) => String(v).padStart(w, "0");

/**
 * Python datetime.isoformat() for an instant given as microseconds since the
 * epoch. offsetMinutes null formats a naive datetime (no offset).
 */
export function isoformat(us: number | null | undefined, offsetMinutes: number | null = 0): string | null {
  if (us === null || us === undefined) return null;
  const shift = (offsetMinutes ?? 0) * 60_000_000;
  const local = us + shift;
  const micro = ((local % 1_000_000) + 1_000_000) % 1_000_000;
  const d = new Date((local - micro) / 1000);
  let s = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
  if (micro) s += `.${pad(micro, 6)}`;
  if (offsetMinutes === null) return s;
  const sign = offsetMinutes < 0 ? "-" : "+";
  const abs = Math.abs(offsetMinutes);
  return `${s}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** Microseconds since the epoch from a pg bigint string (or null). */
export function us(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  return Number(v);
}

/** Collections.Counter: insertion ordered counts with most_common(). */
export class Counter<K> {
  private m = new Map<K, number>();
  add(k: K, by = 1) {
    this.m.set(k, (this.m.get(k) ?? 0) + by);
  }
  get(k: K): number {
    return this.m.get(k) ?? 0;
  }
  get size() {
    return this.m.size;
  }
  entries(): [K, number][] {
    return [...this.m.entries()];
  }
  mostCommon(n?: number): [K, number][] {
    const sorted = this.entries().sort((a, b) => b[1] - a[1]);
    return n === undefined ? sorted : sorted.slice(0, n);
  }
  toObject(): Record<string, number> {
    const o: Record<string, number> = {};
    for (const [k, v] of this.m) o[String(k)] = v;
    return o;
  }
}

/** Python max(items, key=f): the first item with the largest key. */
export function maxBy<T>(items: T[], key: (t: T) => number): T | undefined {
  let best: T | undefined;
  let bestKey = -Infinity;
  for (const it of items) {
    const k = key(it);
    if (best === undefined || k > bestKey) {
      best = it;
      bestKey = k;
    }
  }
  return best;
}

/** Python str[:n] (code points, not UTF-16 units). */
export function pySlice(s: string, n: number): string {
  const cps = Array.from(s);
  return cps.length <= n ? s : cps.slice(0, n).join("");
}

/** Python str.strip() for the whitespace that occurs in chat text. */
export function pyStrip(s: string): string {
  // Python's str.strip() whitespace includes these control characters.
  // oxlint-disable-next-line no-control-regex
  return s.replace(/^[\s\x1c-\x1f\x85]+|[\s\x1c-\x1f\x85]+$/g, "");
}

/** A json column may hold a JSON string (double encoded); Python json.loads it. */
export function maybeParse(v: unknown): unknown {
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

/** Python int() on a JSON value; undefined where Python raises ValueError. */
export function pyInt(v: unknown): number | undefined {
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? Math.trunc(v) : undefined;
  if (typeof v === "string" && /^\s*[+-]?\d+(_\d+)*\s*$/.test(v)) return Number(v.replace(/_/g, ""));
  return undefined;
}
