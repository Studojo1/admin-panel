import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { AdminHeader, StatCard } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getDashboardStats, getControlPlaneUrl, getToken, type DashboardStats } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/dashboard";

const floatY = [0, -24, -12, -30, 0];
const floatX = [0, 12, -18, 8, 0];
const floatRotate = [0, 6, -8, 4, 0];

const BACKGROUND_SHAPES = [
  { className: "right-0 top-20 h-32 w-32 rounded-full md:h-40 md:w-40 bg-yellow-500", shadow: "6px_6px" as const, duration: 18, delay: 0 },
  { className: "left-0 top-1/3 h-24 w-24 md:h-32 md:w-32 bg-emerald-300", shadow: "4px_4px" as const, rotate: 12, duration: 22, delay: 1 },
  { className: "bottom-20 right-1/4 h-20 w-20 md:h-24 md:w-24 bg-violet-500", shadow: "4px_4px" as const, duration: 20, delay: 2 },
  { className: "bottom-1/4 left-0 h-16 w-16 md:h-28 md:w-28 bg-pink-300", shadow: "4px_4px" as const, rotate: 45, duration: 24, delay: 0.5 },
  { className: "top-1/2 right-1/3 h-14 w-14 md:h-20 md:w-20 bg-amber-400", shadow: "3px_3px" as const, rotate: -12, duration: 19, delay: 1.5 },
  { className: "top-12 left-1/4 h-16 w-16 md:h-20 md:w-20 rounded-full bg-teal-300", shadow: "4px_4px" as const, duration: 21, delay: 0.8 },
  { className: "bottom-1/3 right-0 h-20 w-20 md:h-24 md:w-24 bg-rose-300", shadow: "4px_4px" as const, rotate: -20, duration: 23, delay: 1.2 },
  { className: "top-1/4 right-1/5 h-12 w-12 md:h-16 md:w-16 rounded-2xl bg-indigo-300", shadow: "3px_3px" as const, rotate: 15, duration: 17, delay: 2.5 },
  { className: "bottom-32 left-1/3 h-14 w-14 md:h-18 md:w-18 rounded-full bg-lime-300", shadow: "3px_3px" as const, duration: 25, delay: 0.3 },
  { className: "top-2/3 left-1/5 h-20 w-20 md:h-28 md:w-28 bg-orange-200", shadow: "4px_4px" as const, rotate: -15, duration: 20, delay: 1.8 },
  { className: "top-16 right-1/4 h-10 w-10 md:h-14 md:w-14 rounded-2xl bg-cyan-300", shadow: "3px_3px" as const, rotate: 25, duration: 26, delay: 0.6 },
  { className: "bottom-12 left-1/2 h-12 w-12 md:h-16 md:w-16 bg-fuchsia-200", shadow: "3px_3px" as const, rotate: -8, duration: 22, delay: 2.2 },
];

function FloatShape({
  className,
  shadow,
  rotate = 0,
  duration,
  delay,
}: {
  className: string;
  shadow: "6px_6px" | "4px_4px" | "3px_3px";
  rotate?: number;
  duration: number;
  delay: number;
}) {
  const shadowClass =
    shadow === "6px_6px"
      ? "shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]"
      : shadow === "4px_4px"
        ? "shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
        : "shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]";

  return (
    <motion.div
      className={`absolute rounded-2xl border-2 border-neutral-900 opacity-40 md:opacity-50 ${shadowClass} ${className}`}
      aria-hidden
      animate={{
        y: floatY,
        x: floatX,
        rotate: rotate ? floatRotate.map((r) => rotate + r) : floatRotate,
      }}
      transition={{
        repeat: Infinity,
        repeatType: "reverse",
        duration,
        delay,
      }}
    />
  );
}

function formatCurrency(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

function formatMonth(monthStr: string): string {
  const [year, month] = monthStr.split("-");
  const date = new Date(parseInt(year), parseInt(month) - 1);
  return date.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

function SimpleBarChart({ data, maxValue, color }: { data: number[]; maxValue: number; color: string }) {
  return (
    <div className="flex h-32 items-end justify-between gap-1">
      {data.map((value, i) => {
        const height = maxValue > 0 ? (value / maxValue) * 100 : 0;
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1">
            <div
              className={`w-full rounded-t-lg border-2 border-neutral-900 ${color} transition-all`}
              style={{ height: `${height}%` }}
            />
            <span className="font-['Satoshi'] text-[10px] text-neutral-600">{value}</span>
          </div>
        );
      })}
    </div>
  );
}

function PieChart({ data }: { data: { label: string; value: number; color: string }[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="font-['Satoshi'] text-sm text-neutral-500">No revenue data</p>
      </div>
    );
  }

  let currentAngle = 0;
  const radius = 80;
  const centerX = 100;
  const centerY = 100;

  return (
    <svg viewBox="0 0 200 200" className="h-64 w-full">
      {data.map((item, i) => {
        const percentage = (item.value / total) * 100;
        const angle = (item.value / total) * 360;
        const startAngle = currentAngle;
        const endAngle = currentAngle + angle;
        currentAngle = endAngle;

        const x1 = centerX + radius * Math.cos((startAngle * Math.PI) / 180);
        const y1 = centerY + radius * Math.sin((startAngle * Math.PI) / 180);
        const x2 = centerX + radius * Math.cos((endAngle * Math.PI) / 180);
        const y2 = centerY + radius * Math.sin((endAngle * Math.PI) / 180);
        const largeArc = angle > 180 ? 1 : 0;

        return (
          <g key={i}>
            <path
              d={`M ${centerX} ${centerY} L ${x1} ${y1} A ${radius} ${radius} 0 ${largeArc} 1 ${x2} ${y2} Z`}
              fill={item.color}
              stroke="#171717"
              strokeWidth="2"
              className="transition-opacity hover:opacity-80"
            />
          </g>
        );
      })}
      <circle cx={centerX} cy={centerY} r={40} fill="white" stroke="#171717" strokeWidth="2" />
      <text x={centerX} y={centerY} textAnchor="middle" dominantBaseline="middle" className="font-['Clash_Display'] text-sm font-bold fill-neutral-900">
        {formatCurrency(total)}
      </text>
    </svg>
  );
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin Dashboard – Studojo" },
    {
      name: "description",
      content: "Admin dashboard for managing Studojo",
    },
  ];
}

export default function Dashboard() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isAuthorized) {
      loadStats();
    }
  }, [isAuthorized]);

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"></div>
          <p className="font-['Satoshi'] text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) {
    return null;
  }

  const loadStats = async () => {
    try {
      setLoading(true);
      const data = await getDashboardStats();
      setStats(data);
    } catch (error: any) {
      toast.error(error.message || "Failed to load dashboard stats");
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (jobId: string) => {
    try {
      const baseUrl = getControlPlaneUrl();
      const token = await import("~/lib/api").then((m) => m.getToken());
      const response = await fetch(`${baseUrl}/v1/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch job");
      const job = await response.json();
      if (job.result) {
        const blob = new Blob([JSON.stringify(job.result, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `assignment-${jobId}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast.success("Download started");
      } else {
        toast.error("No result available for this assignment");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to download assignment");
    }
  };

  const maxUsers = stats?.monthly_metrics.length ? Math.max(...stats.monthly_metrics.map((m) => m.users_count)) : 1;
  const maxOrders = stats?.monthly_metrics.length ? Math.max(...stats.monthly_metrics.map((m) => m.orders_count)) : 1;
  const maxRevenue = stats?.monthly_metrics.length ? Math.max(...stats.monthly_metrics.map((m) => m.revenue)) : 1;

  return (
    <>
      <AdminHeader />
      <main className="relative min-h-screen overflow-hidden bg-purple-50">
        {/* Background Animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
          {BACKGROUND_SHAPES.map((shape, i) => (
            <FloatShape key={i} {...shape} />
          ))}
        </div>

        <div className="relative mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="relative z-10"
          >
            <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
              Admin Dashboard
            </h1>
            <p className="mt-4 font-['Satoshi'] text-base font-normal leading-6 text-gray-600">
              Comprehensive analytics and management for Studojo
            </p>
          </motion.div>

          {loading ? (
            <div className="relative z-10 mt-12 flex items-center justify-center py-20">
              <div className="text-center">
                <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"></div>
                <p className="font-['Satoshi'] text-sm text-gray-600">Loading stats...</p>
              </div>
            </div>
          ) : stats ? (
            <div className="relative z-10 space-y-12">
              {/* Main Stats Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
              >
                <StatCard value={stats.total_users} label="Total Users" color="purple" delay={0} />
                <StatCard value={stats.total_dissertations} label="Dissertations" color="green" delay={0.1} />
                <StatCard value={stats.total_careers} label="Career Applications" color="orange" delay={0.2} />
                <StatCard value={formatCurrency(stats.revenue_breakdown.total)} label="Total Revenue" color="pink" delay={0.3} />
              </motion.div>

              {/* Month-by-Month Metrics */}
              {stats.monthly_metrics && stats.monthly_metrics.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] md:p-8"
                >
                  <h2 className="mb-6 font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-950 md:text-3xl">
                    Monthly Metrics (Last 12 Months)
                  </h2>
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-3">
                    <div>
                      <div className="mb-4 font-['Satoshi'] text-sm font-medium text-neutral-600">New Users</div>
                      <SimpleBarChart
                        data={stats.monthly_metrics.map((m) => m.users_count)}
                        maxValue={maxUsers}
                        color="bg-purple-500"
                      />
                      <div className="mt-2 flex justify-between font-['Satoshi'] text-xs text-neutral-500">
                        <span>{formatMonth(stats.monthly_metrics[0]?.month || "")}</span>
                        <span>{formatMonth(stats.monthly_metrics[stats.monthly_metrics.length - 1]?.month || "")}</span>
                      </div>
                    </div>
                    <div>
                      <div className="mb-4 font-['Satoshi'] text-sm font-medium text-neutral-600">Assignment Orders</div>
                      <SimpleBarChart
                        data={stats.monthly_metrics.map((m) => m.orders_count)}
                        maxValue={maxOrders}
                        color="bg-emerald-500"
                      />
                      <div className="mt-2 flex justify-between font-['Satoshi'] text-xs text-neutral-500">
                        <span>{formatMonth(stats.monthly_metrics[0]?.month || "")}</span>
                        <span>{formatMonth(stats.monthly_metrics[stats.monthly_metrics.length - 1]?.month || "")}</span>
                      </div>
                    </div>
                    <div>
                      <div className="mb-4 font-['Satoshi'] text-sm font-medium text-neutral-600">Revenue (₹)</div>
                      <SimpleBarChart
                        data={stats.monthly_metrics.map((m) => m.revenue / 100)}
                        maxValue={maxRevenue / 100}
                        color="bg-amber-500"
                      />
                      <div className="mt-2 flex justify-between font-['Satoshi'] text-xs text-neutral-500">
                        <span>{formatMonth(stats.monthly_metrics[0]?.month || "")}</span>
                        <span>{formatMonth(stats.monthly_metrics[stats.monthly_metrics.length - 1]?.month || "")}</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {/* Revenue Breakdown */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.3 }}
                className="grid grid-cols-1 gap-6 md:grid-cols-2"
              >
                <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] md:p-8">
                  <h2 className="mb-6 font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-950 md:text-3xl">
                    Revenue Breakdown
                  </h2>
                  <PieChart
                    data={[
                      {
                        label: "Assignments",
                        value: stats.revenue_breakdown.assignments,
                        color: "#8b5cf6",
                      },
                      {
                        label: "Dissertations",
                        value: stats.revenue_breakdown.dissertations,
                        color: "#10b981",
                      },
                      {
                        label: "Careers",
                        value: stats.revenue_breakdown.careers,
                        color: "#f59e0b",
                      },
                    ]}
                  />
                  <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-purple-500"></div>
                        <span className="font-['Satoshi'] text-sm text-neutral-700">Assignments</span>
                      </div>
                      <span className="font-['Satoshi'] text-sm font-medium text-neutral-900">
                        {formatCurrency(stats.revenue_breakdown.assignments)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-emerald-500"></div>
                        <span className="font-['Satoshi'] text-sm text-neutral-700">Dissertations</span>
                      </div>
                      <span className="font-['Satoshi'] text-sm font-medium text-neutral-900">
                        {formatCurrency(stats.revenue_breakdown.dissertations)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-amber-500"></div>
                        <span className="font-['Satoshi'] text-sm text-neutral-700">Careers</span>
                      </div>
                      <span className="font-['Satoshi'] text-sm font-medium text-neutral-900">
                        {formatCurrency(stats.revenue_breakdown.careers)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] md:p-8">
                  <h2 className="mb-6 font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-950 md:text-3xl">
                    Revenue Trend
                  </h2>
                  <div className="h-64">
                    <SimpleBarChart
                      data={stats.monthly_metrics.map((m) => m.revenue / 100)}
                      maxValue={maxRevenue / 100}
                      color="bg-purple-500"
                    />
                  </div>
                  <div className="mt-4 text-center font-['Satoshi'] text-sm text-neutral-600">
                    Monthly revenue over last 12 months
                  </div>
                </div>
              </motion.div>

              {/* Assignment Orders */}
              {stats.assignment_orders && stats.assignment_orders.length > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
                >
                  <div className="border-b-2 border-neutral-900 bg-neutral-50 px-6 py-4 md:px-8">
                    <h2 className="font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-950 md:text-3xl">
                      Recent Assignment Orders
                    </h2>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                          <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">User</th>
                          <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Date</th>
                          <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Status</th>
                          <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Amount</th>
                          <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {stats.assignment_orders.map((order, index) => (
                          <motion.tr
                            key={order.job_id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.2, delay: index * 0.02 }}
                            className="border-b border-neutral-200 transition-colors hover:bg-neutral-50"
                          >
                            <td className="px-4 py-3 font-['Satoshi'] text-sm font-medium text-neutral-900">
                              {order.user_name}
                            </td>
                            <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">
                              {new Date(order.created_at).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${
                                  order.status === "COMPLETED"
                                    ? "bg-green-100 text-green-700"
                                    : order.status === "FAILED"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-amber-100 text-amber-700"
                                }`}
                              >
                                {order.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-['Satoshi'] text-sm font-medium text-neutral-900">
                              {formatCurrency(order.amount)}
                            </td>
                            <td className="px-4 py-3">
                              {order.status === "COMPLETED" && order.download_url && (
                                <button
                                  onClick={() => handleDownload(order.job_id)}
                                  className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                                >
                                  Download
                                </button>
                              )}
                            </td>
                          </motion.tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}

              {/* Quick Actions */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.5 }}
              >
                <h2 className="mb-6 font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-950 md:text-3xl">
                  Quick Actions
                </h2>
                <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                  <Link
                    to="/users"
                    className="group rounded-2xl border-2 border-neutral-900 bg-purple-50 p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                  >
                    <div className="font-['Clash_Display'] text-xl font-medium text-neutral-900">Manage Users</div>
                    <div className="mt-2 font-['Satoshi'] text-sm text-neutral-600">View and manage user accounts</div>
                  </Link>
                  <Link
                    to="/dissertations"
                    className="group rounded-2xl border-2 border-neutral-900 bg-emerald-50 p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                  >
                    <div className="font-['Clash_Display'] text-xl font-medium text-neutral-900">Dissertations</div>
                    <div className="mt-2 font-['Satoshi'] text-sm text-neutral-600">Review dissertation submissions</div>
                  </Link>
                  <Link
                    to="/careers"
                    className="group rounded-2xl border-2 border-neutral-900 bg-amber-50 p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                  >
                    <div className="font-['Clash_Display'] text-xl font-medium text-neutral-900">Career Applications</div>
                    <div className="mt-2 font-['Satoshi'] text-sm text-neutral-600">Manage career applications</div>
                  </Link>
                </div>
              </motion.div>
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
