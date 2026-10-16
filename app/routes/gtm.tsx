import { useEffect, useState } from "react";
import { Link } from "react-router";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/gtm";

export function meta({}: Route.MetaArgs) {
  return [{ title: "GTM Dashboards – Admin Panel" }];
}

type Card = {
  slug: string;
  title: string;
  updated_at: string;
  subtitle?: string;
  period?: { start: string; end: string };
  kpis?: Record<string, number>;
};

export default function GtmDashboards() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [cards, setCards] = useState<Card[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthorized) return;
    (async () => {
      try {
        const token = await getToken();
        if (!token) throw new Error("Not authenticated");
        const res = await fetch("/api/gtm-dashboards", {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        setCards((await res.json()).dashboards || []);
      } catch (e: any) {
        setError(e.message || "Failed to load");
      }
    })();
  }, [isAuthorized]);

  if (isPending) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-500">Loading...</div>
    );
  }
  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[1280px] px-6 py-8">
        <h1 className="text-3xl font-bold text-neutral-900">GTM Dashboards</h1>
        <p className="text-sm text-neutral-500 mt-1">One dashboard per outbound campaign: sends, replies, meetings and the full threads.</p>
        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
        {!cards && !error && <p className="mt-6 text-sm text-neutral-500">Loading dashboards...</p>}
        {cards && cards.length === 0 && <p className="mt-6 text-sm text-neutral-500">No dashboards yet.</p>}
        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards?.map((c) => (
            <Link
              key={c.slug}
              to={`/gtm/${c.slug}`}
              className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm hover:border-violet-400 hover:shadow transition"
            >
              <div className="text-lg font-semibold text-neutral-900">{c.title}</div>
              {c.period && (
                <div className="text-xs text-neutral-500 mt-0.5">
                  {c.period.start} to {c.period.end}
                </div>
              )}
              {c.subtitle && <p className="text-sm text-neutral-600 mt-2 line-clamp-2">{c.subtitle}</p>}
              {c.kpis && (
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <Mini label="Emails" value={c.kpis.total_sends} />
                  <Mini label="Interested" value={c.kpis.schools_interested} />
                  <Mini label="Meetings" value={c.kpis.meetings_booked} />
                </div>
              )}
              <div className="mt-3 text-[11px] text-neutral-400">Updated {new Date(c.updated_at).toLocaleString()}</div>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}

function Mini({ label, value }: { label: string; value?: number }) {
  return (
    <div className="rounded-lg bg-neutral-50 py-2">
      <div className="text-xl font-bold text-neutral-900">{value ?? "–"}</div>
      <div className="text-[11px] uppercase tracking-wide text-neutral-500">{label}</div>
    </div>
  );
}
