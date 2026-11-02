// Vendors and credits (owner ask, 2 Nov 2026): every day, how many credits our
// two people-data vendors have left and what happens next. LeadsForge (email
// finding) and Apollo (email reveals). Balances come from each vendor's free
// balance endpoint (at most 10 minutes old); spend comes from our own log,
// career_agent.career_vendor_calls, per IST day. All reads happen on the server
// (/api/vendors): the keys never reach the browser.
import { useCallback, useEffect, useState } from "react";
import { AdminHeader } from "~/components";
import { UsageChart } from "~/components/vendors/usage-chart";
import { getToken } from "~/lib/api";
import { useAdminGuard } from "~/lib/auth-guard";
import { type Level, type NextThing, type VendorStats, type VendorsReport, fmtDay, fmtNum } from "~/lib/vendors/model";

export function meta() {
  return [{ title: "Vendors and credits · Studojo Admin" }];
}

const CARD = "rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]";

/** Categorical slots 1 and 2 (validated on white): color follows the vendor everywhere. */
const VENDOR_COLOR: Record<string, string> = { leadsforge: "#2a78d6", apollo: "#eb6834" };

/** Status colors carry state only, always with an icon and a word. */
const LEVEL: Record<Level, { word: string; icon: string; bg: string; fg: string }> = {
  critical: { word: "Urgent", icon: "!", bg: "#d03b3b", fg: "#ffffff" },
  warning: { word: "Watch", icon: "!", bg: "#fab219", fg: "#0b0b0b" },
  info: { word: "Info", icon: "i", bg: "#e1e0d9", fg: "#0b0b0b" },
};

async function fetchVendors(): Promise<VendorsReport> {
  const token = await getToken();
  const res = await fetch("/api/vendors", {
    credentials: "include",
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
  return body as VendorsReport;
}

function LevelBadge({ level }: { level: Level }) {
  const l = LEVEL[level];
  return (
    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-neutral-700">
      <span aria-hidden className="inline-flex h-4 w-4 items-center justify-center rounded-full text-[10px] font-black" style={{ background: l.bg, color: l.fg }}>
        {l.icon}
      </span>
      {l.word}
    </span>
  );
}

function NextCard({ items }: { items: NextThing[] }) {
  if (!items.length) return null;
  const [first, ...rest] = items;
  return (
    <section className={`mb-5 p-5 ${CARD}`} aria-label="Next thing">
      <div className="mb-2 text-xs font-bold uppercase tracking-wide text-neutral-500">Next thing</div>
      <div className="flex items-start gap-3">
        <LevelBadge level={first.level} />
        <p className="text-lg font-semibold leading-snug text-neutral-900">{first.text}</p>
      </div>
      {rest.length > 0 && (
        <ul className="mt-3 space-y-1.5 border-t border-neutral-200 pt-3">
          {rest.map((n, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-neutral-700">
              <LevelBadge level={n.level} />
              <span>{n.text}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string | null }) {
  return (
    <div className="rounded-xl border border-black/10 bg-white px-3 py-2.5">
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      <div className="mt-0.5 text-2xl font-semibold text-neutral-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs leading-snug text-neutral-500">{sub}</div>}
    </div>
  );
}

function balanceTile(s: VendorStats): { value: string; sub: string | null } {
  const b = s.balance;
  if (b.credits == null) return { value: "Unknown", sub: b.note };
  const parts: string[] = [];
  if (b.state === "out") parts.push("out of credits");
  if (b.limit != null) parts.push(`of ${fmtNum(b.limit)} this cycle`);
  if (b.renewsOn) parts.push(`renews ${fmtDay(b.renewsOn, s.today)}`);
  return { value: fmtNum(b.credits), sub: parts.join(", ") || null };
}

function daysLeftTile(s: VendorStats): { value: string; sub: string | null } {
  const b = s.balance;
  if (b.credits != null && b.credits <= 0) return { value: "0", sub: "out of credits" };
  if (s.burnPerDay === 0) return { value: "No spend", sub: `no spend in the last ${s.burnDays || 7} days` };
  if (s.burnPerDay == null) return { value: "n/a", sub: "no usage log yet" };
  if (s.daysLeft == null) return { value: "Unknown", sub: "balance unknown" };
  return { value: s.daysLeft < 1 ? "< 1" : `about ${Math.round(s.daysLeft)}`, sub: "at the current pace" };
}

function runOutTile(s: VendorStats): { value: string; sub: string | null } {
  if (!s.runOutDay) return { value: "n/a", sub: null };
  if (s.daysLeft === 0) return { value: "Now", sub: "out of credits" };
  const renewFirst = s.balance.renewsOn && s.balance.renewsOn <= s.runOutDay;
  return {
    value: fmtDay(s.runOutDay, s.today),
    sub: renewFirst ? `IST, but credits renew ${fmtDay(s.balance.renewsOn!, s.today)} first` : "IST, at the current pace",
  };
}

function VendorCard({ s, logLive }: { s: VendorStats; logLive: boolean }) {
  const bal = balanceTile(s);
  const left = daysLeftTile(s);
  const out = runOutTile(s);
  const color = VENDOR_COLOR[s.vendor] ?? "#2a78d6";
  return (
    <section className={`p-5 ${CARD}`} aria-label={s.label}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-2 font-['Clash_Display'] text-xl font-bold text-neutral-900">
          <span aria-hidden className="inline-block h-3 w-3 rounded-sm" style={{ background: color }} />
          {s.label}
        </h2>
        <span className="text-xs text-neutral-500">
          {s.balance.checkedAt ? `Balance read ${new Date(s.balance.checkedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST` : "Balance not read"}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Tile label="Balance" value={bal.value} sub={bal.sub} />
        <Tile label="Used today" value={logLive ? fmtNum(s.usedToday) : "n/a"} sub={logLive ? `${fmtNum(s.callsToday)} calls so far` : "no usage log yet"} />
        <Tile label="Burn per day" value={s.burnPerDay == null ? "n/a" : fmtNum(s.burnPerDay)} sub={s.burnBasis} />
        <Tile label="Days left" value={left.value} sub={left.sub} />
        <Tile label="Runs out on" value={out.value} sub={out.sub} />
      </div>
      {!logLive && <p className="mt-3 text-sm text-neutral-600">No usage log yet: the spend chart appears once career-agent logs its {s.label} calls.</p>}
      {logLive && <p className="mt-2 text-xs text-neutral-600">
        Last 7 days, {s.spendKind} calls: {fmtNum(s.calls7)}
        {s.hitRate7 != null ? `, hit rate ${Math.round(s.hitRate7 * 100)}% (spent credits)` : ""}
        {s.failed7 ? `, ${fmtNum(s.failed7)} failed` : ""}.
      </p>}
      {logLive && (
        <div className="mt-4">
          <UsageChart title={`${s.label}, credits spent per IST day`} color={color} series={s.series} today={s.today} />
        </div>
      )}
      {s.kinds.length > 0 && (
        <table className="mt-3 w-full border-collapse text-xs" style={{ fontVariantNumeric: "tabular-nums" }}>
          <thead>
            <tr className="text-left text-neutral-500">
              <th className="py-1 pr-3 font-medium">Kind (30 days)</th>
              <th className="py-1 pr-3 text-right font-medium">Calls</th>
              <th className="py-1 pr-3 text-right font-medium">Hits</th>
              <th className="py-1 pr-3 text-right font-medium">Failed</th>
              <th className="py-1 text-right font-medium">Credits</th>
            </tr>
          </thead>
          <tbody>
            {s.kinds.map((k) => (
              <tr key={k.kind} className="border-t border-neutral-200 text-neutral-800">
                <td className="py-1 pr-3">{k.kind}</td>
                <td className="py-1 pr-3 text-right">{fmtNum(k.calls)}</td>
                <td className="py-1 pr-3 text-right">{fmtNum(k.hits)}</td>
                <td className="py-1 pr-3 text-right">{fmtNum(k.failed)}</td>
                <td className="py-1 text-right">{fmtNum(k.credits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

export default function Vendors() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [data, setData] = useState<VendorsReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchVendors());
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized, load]);

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[100rem] px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-['Clash_Display'] text-2xl font-bold text-neutral-900">Vendors and credits</h1>
            <p className="mt-1 text-sm text-neutral-600">
              LeadsForge and Apollo: credits left, spend per IST day and when each runs out. Balances are at most 10 minutes old.
            </p>
          </div>
          <button
            onClick={load}
            disabled={loading}
            className="rounded-lg border-2 border-neutral-900 bg-violet-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {loading ? "Loading" : "Refresh"}
          </button>
        </div>

        {error && <div className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {!data && !error && (
          <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-violet-500 border-t-transparent" /></div>
        )}
        {data && (
          <div className={loading ? "opacity-60 transition-opacity" : "transition-opacity"}>
            {!data.logLive && (
              <div className="mb-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-2 text-sm text-amber-900">
                No usage log yet: career_agent.career_vendor_calls is not in this database. Balances show; spend, burn and run-out dates show once career-agent starts logging calls.
              </div>
            )}
            <NextCard items={data.next} />
            <div className="grid grid-cols-1 gap-5 2xl:grid-cols-2">
              {data.vendors.map((s) => <VendorCard key={s.vendor} s={s} logLive={data.logLive} />)}
            </div>
            <p className="mt-4 text-xs text-neutral-500">
              Spend: career_agent.career_vendor_calls, credits_spent summed per IST day{data.logStart ? `, logged since ${fmtDay(data.logStart, data.today)}` : ""}.
              Burn per day averages the last 7 whole days (fewer when the log is younger). A hit is a call that spent credits.
              Balances: LeadsForge /public/v1/balance and Apollo credit usage stats (lead credits), both free. Read {fmtDay(data.today)}, {new Date(data.generatedAt).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit" })} IST.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
