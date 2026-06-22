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
  referral_source: string | null;
  webinar_id: number | null;
  webinar_title: string | null;
  created_at: string;
}

interface Stats {
  total: string;
  last_24_hours: string;
}

interface Webinar {
  id: number;
  title: string;
  status: string;
}

const NOT_SPECIFIED = "__none__";

export default function WebinarRegistrations() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [rows, setRows] = useState<Registration[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<string>("");
  const [webinars, setWebinars] = useState<Webinar[]>([]);
  // "" until the loader tells us the default (active) webinar; then a numeric id
  // string, or "all".
  const [webinarFilter, setWebinarFilter] = useState<string>("");
  const [initialised, setInitialised] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Create / activate webinar control state.
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState("");
  const [newTime, setNewTime] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (isPending || !isAuthorized) return;

    const fetchRows = async () => {
      setLoading(true);
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const qs = webinarFilter ? `?webinar=${encodeURIComponent(webinarFilter)}` : "";
        const res = await fetch(`/api/webinar-registrations${qs}`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        setRows(data.registrations || []);
        setStats(data.stats || null);
        setWebinars(data.webinars || []);
        // On first load, adopt the server's default selection (active webinar).
        if (!initialised) {
          setWebinarFilter(String(data.selectedWebinar));
          setInitialised(true);
        }
      } catch (e: any) {
        setError(e.message || "Failed to load");
      } finally {
        setLoading(false);
      }
    };

    fetchRows();
  }, [isPending, isAuthorized, webinarFilter, reloadKey]);

  async function postWebinarAction(payload: Record<string, unknown>): Promise<any> {
    const token = await getToken();
    if (!token) throw new Error("Not authenticated");
    const res = await fetch("/api/webinar-registrations", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) throw new Error(data.error || `HTTP ${res.status}`);
    return data;
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);
    if (!newTitle.trim()) { setNotice("Enter a webinar title."); return; }
    setBusy(true);
    try {
      const data = await postWebinarAction({
        intent: "create",
        title: newTitle.trim(),
        webinar_date: newDate || null,
        webinar_time: newTime || "",
      });
      setNotice(`Created "${data.webinar.title}". Click "Make active" when you're ready for the signup link to record it.`);
      setNewTitle(""); setNewDate(""); setNewTime("");
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      setNotice(err.message || "Failed to create webinar.");
    } finally {
      setBusy(false);
    }
  }

  async function handleActivate(w: Webinar) {
    if (!confirm(`Make "${w.title}" the ACTIVE webinar?\n\nNew signups from studojo.com/webinar will be recorded against it, and the currently active webinar will be marked conducted.`)) return;
    setNotice(null);
    setBusy(true);
    try {
      await postWebinarAction({ intent: "activate", id: w.id });
      setNotice(`"${w.title}" is now active. New signups will be tagged to it.`);
      setReloadKey((k) => k + 1);
    } catch (err: any) {
      setNotice(err.message || "Failed to activate webinar.");
    } finally {
      setBusy(false);
    }
  }

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

  // Count occurrences of a field across all rows, sorted by count desc.
  // Blank/null values are grouped under "Not specified".
  const countBy = (key: (r: Registration) => string | null) =>
    Object.entries(
      rows.reduce<Record<string, number>>((acc, r) => {
        const label = (key(r) || "").trim() || "Not specified";
        acc[label] = (acc[label] || 0) + 1;
        return acc;
      }, {})
    ).sort((a, b) => b[1] - a[1]);

  const stageBreakdown = useMemo(() => countBy((r) => r.life_stage), [rows]);
  const yearBreakdown = useMemo(() => countBy((r) => r.year_of_study), [rows]);
  const gradYearBreakdown = useMemo(() => countBy((r) => r.graduation_year), [rows]);
  const referralBreakdown = useMemo(() => countBy((r) => r.referral_source), [rows]);

  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });

  const dash = (v: string | null) => v ? v : <span className="text-gray-300">—</span>;

  if (isPending) return null;

  return (
    <div className="min-h-screen bg-[#F5F5F0]">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" style={{ fontFamily: "Clash Display, sans-serif" }}>
              Webinar Signups
            </h1>
            <p className="text-sm text-gray-500 mt-1">Registrations from studojo.com/webinar, grouped by webinar.</p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-600">Webinar:</label>
            <select
              value={webinarFilter}
              onChange={(e) => setWebinarFilter(e.target.value)}
              className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
            >
              {webinars.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.title}{w.status === "upcoming" ? " (active)" : ""}
                </option>
              ))}
              <option value="all">All webinars</option>
            </select>
          </div>
        </div>

        {/* Manage webinars: create (draft) + activate */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">Manage webinars</h2>
            <span className="text-xs text-gray-400">Same signup link, recorded against the active webinar.</span>
          </div>

          {/* Existing webinars + activate buttons */}
          <div className="space-y-2 mb-5">
            {webinars.length === 0 ? (
              <p className="text-sm text-gray-400">No webinars yet. Create one below.</p>
            ) : (
              webinars.map((w) => {
                const active = w.status === "upcoming";
                return (
                  <div key={w.id} className="flex items-center justify-between gap-3 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-gray-900 truncate">{w.title}</span>
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${
                          active
                            ? "bg-green-100 text-green-700 border-green-200"
                            : w.status === "draft"
                              ? "bg-amber-100 text-amber-700 border-amber-200"
                              : "bg-gray-200 text-gray-600 border-gray-300"
                        }`}
                      >
                        {active ? "Active" : w.status}
                      </span>
                    </div>
                    {active ? (
                      <span className="text-xs text-gray-400">currently recording signups</span>
                    ) : (
                      <button
                        onClick={() => handleActivate(w)}
                        disabled={busy}
                        className="shrink-0 rounded-lg border-2 border-neutral-900 bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
                      >
                        Make active
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Create new webinar (draft — not active until you click Make active) */}
          <form onSubmit={handleCreate} className="flex flex-wrap items-end gap-3 border-t border-gray-100 pt-4">
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 mb-1">New webinar title <span className="text-red-500">*</span></label>
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. Webinar 3"
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 mb-1">Date (optional)</label>
              <input
                type="date"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <div className="flex flex-col">
              <label className="text-xs font-medium text-gray-500 mb-1">Time (optional)</label>
              <input
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                placeholder="e.g. 6:00 PM IST"
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-1.5 text-sm font-semibold text-gray-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
            >
              {busy ? "Saving…" : "Create webinar"}
            </button>
          </form>

          {notice && <p className="mt-3 text-sm text-violet-700">{notice}</p>}
        </div>

        {stats && (
          <div className="grid grid-cols-2 gap-4 mb-6">
            {[
              { label: "Total students", value: stats.total },
              { label: "Past 24 hours", value: stats.last_24_hours },
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

        {/* Breakdowns */}
        {!loading && rows.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <BreakdownCard title="Stage in life" items={stageBreakdown} />
            <BreakdownCard title="Year of study" items={yearBreakdown} />
            <BreakdownCard title="Graduation year" items={gradYearBreakdown} />
            <BreakdownCard title="How they heard" items={referralBreakdown} />
          </div>
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
                  {["#", "Webinar", "Date", "Name", "Email", "WhatsApp", "College", "Course", "Specialisation", "Year", "Grad Year", "Stage", "Source"].map((h) => (
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
                    <td className="px-4 py-3 text-gray-700 text-xs">{r.webinar_title ?? dash(null)}</td>
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
                    <td className="px-4 py-3 text-gray-800">{dash(r.referral_source)}</td>
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
