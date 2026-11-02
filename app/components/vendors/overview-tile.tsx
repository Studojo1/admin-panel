// The Vendors and credits tile on the Overview: per vendor, credits left and
// days left at the current pace, plus the most urgent next thing; links to
// /vendors. Reads /api/vendors on its own (balances are cached 10 minutes on the
// server), so the Overview's sections and range do not change. Drawn with the
// Overview's theme variables (--s1 LeadsForge, --s2 Apollo, as on /vendors).
import { useEffect, useState } from "react";
import { Link } from "react-router";
import { getToken } from "~/lib/api";
import { type VendorStats, type VendorsReport, fmtDay, fmtNum } from "~/lib/vendors/model";

const SWATCH: Record<string, string> = { leadsforge: "var(--s1)", apollo: "var(--s2)" };
const LEVEL = {
  critical: { icon: "▲", word: "Urgent", color: "#d03b3b" },
  warning: { icon: "●", word: "Watch", color: "#ec835a" },
  info: { icon: "●", word: "Next", color: "var(--muted)" },
} as const;

function leftText(s: VendorStats): string {
  const b = s.balance;
  if (b.credits == null) return "balance unknown";
  if (b.credits <= 0) return "out of credits";
  if (s.daysLeft == null || !s.runOutDay) return `${fmtNum(b.credits)} left${s.burnPerDay === 0 ? ", no spend in 7 days" : ""}`;
  const n = Math.max(1, Math.round(s.daysLeft));
  return `${fmtNum(b.credits)} left, about ${n} day${n === 1 ? "" : "s"} (${fmtDay(s.runOutDay, s.today)})`;
}

export function VendorsTile() {
  const [data, setData] = useState<VendorsReport | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    (async () => {
      try {
        const token = await getToken();
        const res = await fetch("/api/vendors", { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
        if (live) setData(body as VendorsReport);
      } catch (e: any) {
        if (live) setError(e?.message || "Failed to load");
      }
    })();
    return () => {
      live = false;
    };
  }, []);

  const top = data?.next[0];
  const lvl = top ? LEVEL[top.level] : null;
  return (
    <section className="card mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 px-4 py-2 text-sm" aria-label="Vendors and credits">
      <Link to="/vendors" className="font-semibold underline" style={{ color: "var(--ink)" }}>Vendors and credits</Link>
      {error && <span style={{ color: "var(--down)" }}>Could not read: {error}</span>}
      {!data && !error && <span style={{ color: "var(--muted)" }}>Reading</span>}
      {data?.vendors.map((s) => (
        <span key={s.vendor} className="flex items-center gap-1.5">
          <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: SWATCH[s.vendor] ?? "var(--s1)" }} />
          <span className="font-semibold">{s.label}</span>
          <span style={{ color: "var(--ink2)" }}>{leftText(s)}</span>
        </span>
      ))}
      {top && lvl && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs" style={{ color: "var(--ink2)" }}>
          <span aria-hidden style={{ color: lvl.color }}>{lvl.icon}</span>
          <span className="font-semibold" style={{ color: "var(--ink)" }}>{lvl.word}</span>
          <span className="min-w-0">{top.text}</span>
        </span>
      )}
    </section>
  );
}
