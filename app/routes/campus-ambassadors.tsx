import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/campus-ambassadors";

export function meta({}: Route.MetaArgs) {
  return [{ title: "Campus Ambassadors – Admin Panel" }];
}

interface Applicant {
  id: number;
  full_name: string;
  whatsapp: string;
  email: string;
  college: string;
  course: string | null;
  year_of_study: string;
  graduation_year: string | null;
  social_handle: string | null;
  why_you: string;
  referral_source: string | null;
  status: string;
  created_at: string;
}

interface Stats {
  total: string;
  last_24_hours: string;
  new_count: string;
  shortlisted_count: string;
  selected_count: string;
}

const STATUSES = ["new", "shortlisted", "selected", "rejected"] as const;

const STATUS_STYLES: Record<string, string> = {
  new: "bg-blue-100 text-blue-700 border-blue-200",
  shortlisted: "bg-amber-100 text-amber-700 border-amber-200",
  selected: "bg-green-100 text-green-700 border-green-200",
  rejected: "bg-gray-200 text-gray-600 border-gray-300",
};

export default function CampusAmbassadors() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [rows, setRows] = useState<Applicant[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>("");
  const [reloadKey, setReloadKey] = useState(0);
  const [busyId, setBusyId] = useState<number | null>(null);
  // The applicant whose "why you" answer is expanded in the modal.
  const [expanded, setExpanded] = useState<Applicant | null>(null);

  useEffect(() => {
    if (isPending || !isAuthorized) return;

    const fetchRows = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/campus-ambassadors", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(data.applicants || []);
        setStats(data.stats || null);
      } catch (e: any) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [isPending, isAuthorized, reloadKey]);

  async function setStatus(applicant: Applicant, status: string) {
    setBusyId(applicant.id);
    // Optimistic: reflect the new status immediately, roll back if the save fails.
    const previous = applicant.status;
    setRows((rs) => rs.map((r) => (r.id === applicant.id ? { ...r, status } : r)));
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch("/api/campus-ambassadors", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ intent: "set-status", id: applicant.id, status }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
      // Refresh so the stat tiles reflect the new counts.
      setReloadKey((k) => k + 1);
    } catch (e: any) {
      setRows((rs) => rs.map((r) => (r.id === applicant.id ? { ...r, status: previous } : r)));
      setError(e.message || "Failed to update status");
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(() => {
    if (!statusFilter) return rows;
    return rows.filter((r) => r.status === statusFilter);
  }, [rows, statusFilter]);

  // Count occurrences of a field across all rows, sorted by count desc.
  // Blank/null values are grouped under "Not specified".
  const countBy = (key: (r: Applicant) => string | null) =>
    Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        const label = (key(r) || "").trim() || "Not specified";
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]);

  const collegeBreakdown = useMemo(() => countBy((r) => r.college), [rows]);
  const yearBreakdown = useMemo(() => countBy((r) => r.year_of_study), [rows]);
  const gradYearBreakdown = useMemo(() => countBy((r) => r.graduation_year), [rows]);
  const referralBreakdown = useMemo(() => countBy((r) => r.referral_source), [rows]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", {
      day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
    });

  const dash = (v: string | null) => (v ? v : <span className="text-gray-300">—</span>);

  function exportCsv() {
    const headers = [
      "id", "created_at", "status", "full_name", "email", "whatsapp", "college",
      "course", "year_of_study", "graduation_year", "social_handle",
      "referral_source", "why_you",
    ];
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [
      headers.join(","),
      ...filtered.map((r) =>
        [
          r.id, r.created_at, r.status, r.full_name, r.email, r.whatsapp, r.college,
          r.course, r.year_of_study, r.graduation_year, r.social_handle,
          r.referral_source, r.why_you,
        ].map(escape).join(",")
      ),
    ].join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `campus-ambassadors-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isPending) return null;

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Clash Display, sans-serif" }}>
              Campus Ambassadors
            </h1>
            <p className="text-sm text-gray-500 mt-1">
              Applications from studojo.com/campus-ambassador.
            </p>
          </div>
          <button
            onClick={exportCsv}
            disabled={filtered.length === 0}
            className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
          >
            Export CSV
          </button>
        </div>

        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
            {[
              { label: "Total applicants", value: stats.total },
              { label: "Past 24 hours", value: stats.last_24_hours },
              { label: "New", value: stats.new_count },
              { label: "Shortlisted", value: stats.shortlisted_count },
              { label: "Selected", value: stats.selected_count },
            ].map((s) => (
              <div key={s.label} className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
                <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">{s.label}</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{s.value}</p>
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="mb-4 rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Breakdowns */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <BreakdownCard title="College" items={collegeBreakdown} />
            <BreakdownCard title="Year of study" items={yearBreakdown} />
            <BreakdownCard title="Graduation year" items={gradYearBreakdown} />
            <BreakdownCard title="How they heard" items={referralBreakdown} />
          </div>
        )}

        {/* Status filter */}
        <div className="flex items-center gap-3 mb-4">
          <label className="text-sm font-medium text-gray-600">Status:</label>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
          >
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </option>
            ))}
          </select>
          <span className="text-sm text-gray-400">{filtered.length} shown</span>
        </div>

        {loading ? (
          <div className="text-center py-16 text-gray-400 text-sm">Loading…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center text-gray-400 text-sm">
            No applications{statusFilter ? " with this status" : ""} yet.
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 border-b border-gray-200">
                <tr>
                  {["#", "Date", "Status", "Name", "Email", "WhatsApp", "College", "Course",
                    "Year", "Grad Year", "Social", "Why them", "Source"].map((h) => (
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
                    <td className="px-4 py-3">
                      <select
                        value={r.status}
                        disabled={busyId === r.id}
                        onChange={(e) => setStatus(r, e.target.value)}
                        className={`rounded-full border px-2 py-0.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-violet-300 disabled:opacity-50 ${
                          STATUS_STYLES[r.status] ?? STATUS_STYLES.new
                        }`}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-900 font-medium">{r.full_name}</td>
                    <td className="px-4 py-3 text-gray-800">{r.email}</td>
                    <td className="px-4 py-3 text-gray-800">{r.whatsapp}</td>
                    <td className="px-4 py-3 text-gray-800">{r.college}</td>
                    <td className="px-4 py-3 text-gray-800">{dash(r.course)}</td>
                    <td className="px-4 py-3 text-gray-800">{r.year_of_study}</td>
                    <td className="px-4 py-3 text-gray-800">{dash(r.graduation_year)}</td>
                    <td className="px-4 py-3 text-gray-800">{dash(r.social_handle)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setExpanded(r)}
                        className="text-violet-700 underline underline-offset-2 text-xs font-medium"
                      >
                        Read
                      </button>
                    </td>
                    <td className="px-4 py-3 text-gray-800">{dash(r.referral_source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* "Why would you be a good CA" is free text and too long for a table cell,
          so the table links out to this modal. */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setExpanded(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3">
              <h3 className="text-lg font-bold text-gray-900">{expanded.full_name}</h3>
              <p className="text-sm text-gray-500">
                {expanded.college} · {expanded.year_of_study}
              </p>
            </div>
            <p className="whitespace-pre-wrap text-sm text-gray-800">{expanded.why_you}</p>
            <button
              onClick={() => setExpanded(null)}
              className="mt-5 rounded-lg border-2 border-neutral-900 bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function BreakdownCard({ title, items }: { title: string; items: [string, number][] }) {
  const max = items.reduce((m, [, n]) => Math.max(m, n), 0) || 1;
  return (
    <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">{title}</p>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No data.</p>
      ) : (
        <div className="space-y-2.5">
          {items.map(([label, count]) => (
            <div key={label}>
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-700">{label}</span>
                <span className="font-semibold text-gray-900">{count}</span>
              </div>
              <div className="mt-1 h-1.5 w-full rounded-full bg-gray-100 overflow-hidden">
                <div className="h-full rounded-full bg-violet-500" style={{ width: `${(count / max) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
