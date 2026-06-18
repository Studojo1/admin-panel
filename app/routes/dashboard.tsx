import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement,
  PointElement, Title, Tooltip, Legend, Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { AdminHeader, StatCard } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

type Triple = { inr: number; usd: number; b2b: number; revenue: number; orders: number };
type Period = { rev: Triple; signups: number; outreach: number };
type Overview = {
  fxRate: number;
  today: string;
  periods: Record<"today" | "yesterday" | "last7" | "last30" | "allTime", Period>;
  daily: { day: string; revenue: number; signups: number; orders: number }[];
};

const PERIODS: { key: keyof Overview["periods"]; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "last7", label: "7 days" },
  { key: "last30", label: "30 days" },
  { key: "allTime", label: "All time" },
];

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");
const usd = (n: number) => "$" + Math.round(n).toLocaleString("en-US");

export default function Dashboard() {
  const { isAuthorized } = useAdminGuard();
  const [data, setData] = useState<Overview | null>(null);
  const [err, setErr] = useState("");
  const [period, setPeriod] = useState<keyof Overview["periods"]>("yesterday");

  useEffect(() => {
    if (!isAuthorized) return;
    fetch("/api/overview")
      .then((r) => r.json())
      .then((d) => (d.error ? setErr(d.error) : setData(d)))
      .catch((e) => setErr(e.message));
  }, [isAuthorized]);

  const p = data?.periods[period];

  const trend = useMemo(() => {
    if (!data) return null;
    return {
      labels: data.daily.map((d) => d.day.slice(5)),
      datasets: [
        {
          label: "Revenue (₹)", data: data.daily.map((d) => d.revenue), yAxisID: "y",
          borderColor: "#7c3aed", backgroundColor: "rgba(124,58,237,0.12)", fill: true, tension: 0.35, pointRadius: 0,
        },
        {
          label: "Signups", data: data.daily.map((d) => d.signups), yAxisID: "y1",
          borderColor: "#10b981", backgroundColor: "transparent", borderDash: [5, 4], tension: 0.35, pointRadius: 0,
        },
      ],
    };
  }, [data]);

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <div className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">
              Overview
            </h1>
            <p className="mt-1 text-sm text-neutral-500">
              Revenue and signups, IST · matches the MSL dashboard{data ? ` · FX ₹${data.fxRate}/$` : ""}
            </p>
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
            {PERIODS.map((pp) => (
              <button
                key={pp.key}
                onClick={() => setPeriod(pp.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${
                  period === pp.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"
                }`}
              >
                {pp.label}
              </button>
            ))}
          </div>
        </div>

        {err && (
          <div className="mt-6 rounded-xl border-2 border-red-500 bg-red-50 p-4 text-sm text-red-700">{err}</div>
        )}
        {!data && !err && <div className="mt-10 text-center text-neutral-400">Loading…</div>}

        {p && (
          <>
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-2xl border-2 border-neutral-900 bg-purple-500 p-6 text-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                <div className="text-xs font-bold uppercase tracking-wide opacity-80">Revenue</div>
                <div className="mt-1 font-['Clash_Display'] text-3xl font-semibold md:text-4xl">{inr(p.rev.revenue)}</div>
                <div className="mt-2 space-y-0.5 text-[11px] leading-tight opacity-90">
                  <div>{inr(p.rev.inr)} INR · {usd(p.rev.usd)} USD</div>
                  {p.rev.b2b > 0 && <div>+ {inr(p.rev.b2b)} B2B</div>}
                </div>
              </div>
              <StatCard value={p.rev.orders} label="Paid Orders" color="orange" />
              <StatCard value={p.signups.toLocaleString("en-IN")} label="Signups" color="green" />
              <StatCard value={p.outreach} label="Outreach Orders" color="pink" />
            </div>

            <div className="mt-6 rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <h2 className="mb-4 font-['Clash_Display'] text-xl font-medium text-neutral-950">Last 30 days</h2>
              {trend && (
                <div className="h-72">
                  <Line
                    data={trend}
                    options={{
                      responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
                      plugins: { legend: { position: "top" } },
                      scales: {
                        y: { position: "left", title: { display: true, text: "Revenue (₹)" }, beginAtZero: true },
                        y1: { position: "right", title: { display: true, text: "Signups" }, beginAtZero: true, grid: { drawOnChartArea: false } },
                      },
                    }}
                  />
                </div>
              )}
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { to: "/funnel", label: "Funnel" },
                { to: "/analytics", label: "Analytics" },
                { to: "/outreach-orders", label: "Outreach Orders" },
                { to: "/paid-users", label: "Paid Users" },
              ].map((l) => (
                <Link
                  key={l.to}
                  to={l.to}
                  className="rounded-xl border-2 border-neutral-900 bg-white px-4 py-3 text-center text-sm font-semibold text-neutral-900 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:-translate-y-0.5"
                >
                  {l.label} →
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
