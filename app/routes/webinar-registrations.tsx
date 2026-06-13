import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/webinar-registrations";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Webinar Signups – Admin Panel" }];
}

interface Registration {
  id: number;
  full_name: string;
  whatsapp: string;
  email: string;
  college: string;
  course: string;
  specialisation: string | null;
  year_of_study: string;
  graduation_year: string | null;
  life_stage: string | null;
  created_at: string;
}

interface Stats {
  total: string;
  last_2_days: string;
  last_4_days: string;
  last_7_days: string;
  last_30_days: string;
}

const NOT_SPECIFIED = "__none__";

export default function WebinarRegistrations() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [rows, setRows] = useState<Registration[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("");

  useEffect(() => {
    if (isPending || !isAuthorized) return;

    const fetchRows = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/webinar-registrations", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(data.registrations || []);
        setStats(data.stats || null);
      } catch (e: any) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [isPending, isAuthorized]);

  const stages = useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => { if (r.life_stage) set.add(r.life_stage); });
    return Array.from(set).sort();
  }, [rows]);

  const filtered = useMemo(() => {
    if (!stageFilter) return rows;
    if (stageFilter === NOT_SPECIFIED) return rows.filter((r) => !r.life_stage);
    return rows.filter((r) => r.life_stage === stageFilter);
  }, [rows, stageFilter]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const dash = (v: string | null) => v ? v : <span className="text-gray-300">—</span>;

  if (isPending) return null;

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Clash Display, sans-serif" }}>
            Webinar Signups
          </h1>
          <p className="text-sm text-gray-500 mt-1">Everyone who registered for the webinar at studojo.com/webinar.</p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: "Total", value: stats.total },
              { label: "Last 2 days", value: stats.last_2_days },
              { label: "Last 4 days", value: stats.last_4_days },
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

        {/* Stage filter */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-600">Stage:</label>
          <select
            value={stageFilter}
            onChange={(e) => setStageFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <option value="">All stages</option>
            {stages.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value={NOT_SPECIFIED}>Not specified</option>
          </select>
          <span className="text-sm text-gray-400">{filtered.length} shown</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            No registrations{stageFilter ? " for this stage" : ""} yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["#", "Date", "Name", "Email", "WhatsApp", "College", "Course", "Specialisation", "Year", "Grad Year", "Stage"].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-400 font-mono text-xs">{r.id}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{fmt(r.created_at)}</td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-gray-800">{r.email}</td>
                    <td className="px-4 py-3 text-gray-800">{r.whatsapp}</td>
                    <td className="px-4 py-3 text-gray-800">{r.college}</td>
                    <td className="px-4 py-3 text-gray-800">{r.course}</td>
                    <td className="px-4 py-3 text-gray-800">{dash(r.specialisation)}</td>
                    <td className="px-4 py-3 text-gray-800">{r.year_of_study}</td>
                    <td className="px-4 py-3 text-gray-800">{dash(r.graduation_year)}</td>
                    <td className="px-4 py-3">
                      {r.life_stage ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-700 border border-violet-200">
                          {r.life_stage}
                        </span>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
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
