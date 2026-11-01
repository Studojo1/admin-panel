// Small helpers that make the TypeScript port print exactly what
// job-outreach-svc (Python) printed: datetime.isoformat(), round() with ties to
// even, Python truthiness, and date arithmetic in a campaign's time zone.

const TS = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2})(?:\.(\d+))?([+-]\d{2}(?::?\d{2})?(?::?\d{2})?)?$/;

/** Postgres timestamp text as Python's isoformat(): "T", six-digit fraction or none, "+00:00". */
export function pyIso(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const m = TS.exec(raw);
  if (!m) return raw;
  const frac = m[3] ? "." + m[3].padEnd(6, "0").slice(0, 6) : "";
  let tz = m[4] ?? "";
  if (tz) {
    const sign = tz[0];
    const digits = tz.slice(1).replace(/:/g, "");
    const hh = digits.slice(0, 2);
    const mm = digits.slice(2, 4) || "00";
    const ss = digits.slice(4, 6);
    tz = `${sign}${hh}:${mm}${ss && ss !== "00" ? ":" + ss : ""}`;
  }
  return `${m[1]}T${m[2]}${frac}${tz}`;
}

/** Microseconds since the epoch for a naive (UTC) timestamp text. */
export function micros(raw: string): number {
  const m = TS.exec(raw);
  if (!m) return NaN;
  const [y, mo, d] = m[1].split("-").map(Number);
  const [h, mi, s] = m[2].split(":").map(Number);
  const us = m[3] ? Number(m[3].padEnd(6, "0").slice(0, 6)) : 0;
  return Date.UTC(y, mo - 1, d, h, mi, s) * 1000 + us;
}

/** Python truthiness. */
export function truthy(v: unknown): boolean {
  if (v === null || v === undefined || v === false || v === 0 || v === "") return false;
  if (Array.isArray(v)) return v.length > 0;
  if (typeof v === "object") return Object.keys(v as object).length > 0;
  return true;
}

/** Python `a or b`. */
export function pyOr<T, U>(a: T, b: U): T | U {
  return truthy(a) ? a : b;
}

/** Python round(x, n): the exact binary value rounded half to even. */
export function pyRound(x: number, n = 0): number {
  if (!Number.isFinite(x)) return x;
  const neg = x < 0;
  const s = Math.abs(x).toFixed(100);
  const [ip, fp] = s.split(".");
  const keep = fp.slice(0, n);
  const rest = fp.slice(n);
  let digits = ip + keep;
  let up = false;
  if (rest[0] > "5") up = true;
  else if (rest[0] === "5") {
    if (/[1-9]/.test(rest.slice(1))) up = true;
    else up = Number(digits[digits.length - 1]) % 2 === 1;
  }
  if (up) {
    const arr = digits.split("");
    let i = arr.length - 1;
    while (i >= 0) {
      if (arr[i] === "9") {
        arr[i] = "0";
        i--;
      } else {
        arr[i] = String(Number(arr[i]) + 1);
        break;
      }
    }
    digits = (i < 0 ? "1" : "") + arr.join("");
  }
  const intLen = digits.length - n;
  const out = n > 0 ? `${digits.slice(0, intLen)}.${digits.slice(intLen)}` : digits;
  const v = parseFloat(out);
  return neg && v !== 0 ? -v : v;
}

// ── Dates in a time zone ────────────────────────────────────────────────────

const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(tz: string): Intl.DateTimeFormat {
  let f = fmtCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    fmtCache.set(tz, f);
  }
  return f;
}

function wall(ms: number, tz: string) {
  const p: Record<string, string> = {};
  for (const part of fmt(tz).formatToParts(new Date(ms))) p[part.type] = part.value;
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second };
}

/** Local calendar date ("YYYY-MM-DD") in tz of a naive UTC timestamp. */
export function localDate(rawUtc: string | null | undefined, tz: string): string | null {
  if (rawUtc == null) return null;
  return localDateMs(Math.floor(micros(rawUtc) / 1000), tz);
}

export function localDateMs(ms: number, tz: string): string {
  const w = wall(ms, tz);
  return `${String(w.y).padStart(4, "0")}-${String(w.mo).padStart(2, "0")}-${String(w.d).padStart(2, "0")}`;
}

function offsetMs(ms: number, tz: string): number {
  const w = wall(ms, tz);
  return Date.UTC(w.y, w.mo - 1, w.d, w.h, w.mi, w.s) - Math.floor(ms / 1000) * 1000;
}

/** Local midnight of `day` in tz, as naive UTC text for SQL ("YYYY-MM-DD HH:MM:SS"). */
export function localMidnightUtc(day: string, tz: string): string {
  const [y, mo, d] = day.split("-").map(Number);
  const guess = Date.UTC(y, mo - 1, d);
  let t = guess - offsetMs(guess, tz);
  t = guess - offsetMs(t, tz);
  return new Date(t).toISOString().slice(0, 19).replace("T", " ");
}

export function addDays(day: string, n: number): string {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, mo - 1, d) + n * 86_400_000).toISOString().slice(0, 10);
}

/** (a - b).days for two "YYYY-MM-DD" dates. */
export function diffDays(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd)) / 86_400_000);
}

/** Python str.splitlines()[0] (or "" when there is no line). */
export function firstLine(s: string): string {
  return s.split(/\r\n|[\n\r\v\f\x1c\x1d\x1e\x85\u2028\u2029]/)[0] ?? "";
}

/** Python s[:n], by code point. */
export function head(s: string, n: number): string {
  return Array.from(s).slice(0, n).join("");
}
