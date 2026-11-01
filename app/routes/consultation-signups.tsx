import { useEffect, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/consultation-signups";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Free Call Signups – Admin Panel" }];
}

interface Signup {
  id: number;
  user_id: string | null;
  email: string | null;
  target_role: string;
  biggest_challenge: string;
  timeline: string;
  created_at: string;
}

interface Stats {
  total: string;
  last_7_days: string;
  last_30_days: string;
}

export default function ConsultationSignups() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [signups, setSignups] = useState<Signup[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !isAuthorized) return;

    const fetchSignups = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/consultation-signups", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setSignups(data.signups || []);
        setStats(data.stats || null);
      } catch (e: any) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchSignups();
  }, [isPending, isAuthorized]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  if (isPending) return null;

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Clash Display, sans-serif" }}>
            Free Call Signups
          </h1>
          <p className="text-sm text-gray-500 mt-1">Students who requested a free 1:1 internship strategy call.</p>
        </div>

        {stats && (
          <div className="grid grid-cols-3 gap-4 mb-6">
            {[
              { label: "Total", value: stats.total },
              { label: "Last 7 days", value: stats.last_7_days },
              { label: "Last 30 days", value: stats.last_30_days },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : signups.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            No signups yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["#", "Date", "Email", "Target Role", "Biggest Challenge", "Timeline"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {signups.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{s.id}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap text-xs">{fmt(s.created_at)}</td>
                    <td className="px-4 py-3 text-gray-800">{s.email ?? <span className="text-gray-400 italic">not signed in</span>}</td>
                    <td className="px-4 py-3 text-gray-800">{s.target_role}</td>
                    <td className="px-4 py-3 text-gray-800">{s.biggest_challenge}</td>
                    <td className="px-4 py-3">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
                        {s.timeline}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
