import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Bar, Line, Doughnut } from "react-chartjs-2";
import { AdminHeader, StatCard } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import {
  getDashboardStats,
  getControlPlaneUrl,
  getToken,
  type DashboardStats,
} from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/dashboard";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  LineElement,
  PointElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler,
);

const floatY = [0, -24, -12, -30, 0];
const floatX = [0, 12, -18, 8, 0];
const floatRotate = [0, 6, -8, 4, 0];

const BACKGROUND_SHAPES = [
  {
    className:
      "right-0 top-20 h-32 w-32 rounded-full md:h-40 md:w-40 bg-yellow-500",
    shadow: "6px_6px" as const,
    duration: 18,
    delay: 0,
  },
  {
    className: "left-0 top-1/3 h-24 w-24 md:h-32 md:w-32 bg-emerald-300",
    shadow: "4px_4px" as const,
    rotate: 12,
    duration: 22,
    delay: 1,
  },
  {
    className: "bottom-20 right-1/4 h-20 w-20 md:h-24 md:w-24 bg-violet-500",
    shadow: "4px_4px" as const,
    duration: 20,
    delay: 2,
  },
  {
    className: "bottom-1/4 left-0 h-16 w-16 md:h-28 md:w-28 bg-pink-300",
    shadow: "4px_4px" as const,
    rotate: 45,
    duration: 24,
    delay: 0.5,
  },
  {
    className: "top-1/2 right-1/3 h-14 w-14 md:h-20 md:w-20 bg-amber-400",
    shadow: "3px_3px" as const,
    rotate: -12,
    duration: 19,
    delay: 1.5,
  },
  {
    className:
      "top-12 left-1/4 h-16 w-16 md:h-20 md:w-20 rounded-full bg-teal-300",
    shadow: "4px_4px" as const,
    duration: 21,
    delay: 0.8,
  },
  {
    className: "bottom-1/3 right-0 h-20 w-20 md:h-24 md:w-24 bg-rose-300",
    shadow: "4px_4px" as const,
    rotate: -20,
    duration: 23,
    delay: 1.2,
  },
  {
    className:
      "top-1/4 right-1/5 h-12 w-12 md:h-16 md:w-16 rounded-2xl bg-indigo-300",
    shadow: "3px_3px" as const,
    rotate: 15,
    duration: 17,
    delay: 2.5,
  },
  {
    className:
      "bottom-32 left-1/3 h-14 w-14 md:h-18 md:w-18 rounded-full bg-lime-300",
    shadow: "3px_3px" as const,
    duration: 25,
    delay: 0.3,
  },
  {
    className: "top-2/3 left-1/5 h-20 w-20 md:h-28 md:w-28 bg-orange-200",
    shadow: "4px_4px" as const,
    rotate: -15,
    duration: 20,
    delay: 1.8,
  },
  {
    className:
      "top-16 right-1/4 h-10 w-10 md:h-14 md:w-14 rounded-2xl bg-cyan-300",
    shadow: "3px_3px" as const,
    rotate: 25,
    duration: 26,
    delay: 0.6,
  },
  {
    className: "bottom-12 left-1/2 h-12 w-12 md:h-16 md:w-16 bg-fuchsia-200",
    shadow: "3px_3px" as const,
    rotate: -8,
    duration: 22,
    delay: 2.2,
  },
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

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: false,
    },
    tooltip: {
      backgroundColor: "rgba(0, 0, 0, 0.8)",
      padding: 12,
      titleFont: {
        family: "'Satoshi', sans-serif",
        size: 14,
        weight: "bold" as const,
      },
      bodyFont: {
        family: "'Satoshi', sans-serif",
        size: 13,
      },
      borderColor: "#171717",
      borderWidth: 2,
      cornerRadius: 8,
      displayColors: true,
    },
  },
  scales: {
    x: {
      grid: {
        display: false,
      },
      ticks: {
        font: {
          family: "'Satoshi', sans-serif",
          size: 11,
        },
        color: "#6b7280",
      },
      border: {
        color: "#e5e7eb",
        width: 1,
      },
    },
    y: {
      grid: {
        color: "#e5e7eb",
        lineWidth: 1,
      },
      ticks: {
        font: {
          family: "'Satoshi', sans-serif",
          size: 11,
        },
        color: "#6b7280",
      },
      border: {
        color: "#e5e7eb",
        width: 1,
      },
    },
  },
};

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
      const token = await getToken();
      // Use admin-specific endpoint to bypass ownership check
      const response = await fetch(`${baseUrl}/v1/admin/jobs/${jobId}`, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!response.ok) throw new Error("Failed to fetch job");
      const job = await response.json();
      if (job.result) {
        if (job.result.download_url) {
          const a = document.createElement("a");
          a.href = job.result.download_url;
          a.download = `assignment-${jobId}.docx`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          toast.success("Download started");
        } else {
          const blob = new Blob([JSON.stringify(job.result, null, 2)], {
            type: "application/json",
          });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `assignment-${jobId}.json`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          toast.success("Download started (JSON debug)");
        }
      } else {
        toast.error("No result available for this assignment");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to download assignment");
    }
  };

  if (!stats) {
    return null;
  }

  const monthlyLabels = stats.monthly_metrics.map((m) => formatMonth(m.month));
  const usersData = stats.monthly_metrics.map((m) => m.users_count);
  const ordersData = stats.monthly_metrics.map((m) => m.orders_count);
  const revenueData = stats.monthly_metrics.map((m) =>
    Math.round(m.revenue / 100),
  );

  const revenueBreakdownData = {
    labels: ["Assignments", "Careers", "Outreach"],
    datasets: [
      {
        data: [
          Math.round(stats.revenue_breakdown.assignments / 100),
          Math.round(stats.revenue_breakdown.careers / 100),
          Math.round((stats.revenue_breakdown as any).outreach / 100 || 0),
        ],
        backgroundColor: ["#8b5cf6", "#f59e0b", "#10b981"],
        borderColor: "#171717",
        borderWidth: 2,
      },
    ],
  };

  const revenueTrendData = {
    labels: monthlyLabels,
    datasets: [
      {
        label: "Revenue (₹)",
        data: revenueData,
        borderColor: "#8b5cf6",
        backgroundColor: "rgba(139, 92, 246, 0.1)",
        borderWidth: 3,
        fill: true,
        tension: 0.4,
        pointRadius: 4,
        pointHoverRadius: 6,
        pointBackgroundColor: "#8b5cf6",
        pointBorderColor: "#171717",
        pointBorderWidth: 2,
      },
    ],
  };

  return (
    <>
      <AdminHeader />
      <main className="relative min-h-screen overflow-hidden bg-purple-50">
        {/* Background Animation */}
        <div
          className="absolute inset-0 overflow-hidden pointer-events-none"
          aria-hidden="true"
        >
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
                <p className="font-['Satoshi'] text-sm text-gray-600">
                  Loading stats...
                </p>
              </div>
            </div>
          ) : (
            <div className="relative z-10 space-y-12">
              {/* Main Stats Grid */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className="mt-12 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
              >
                <StatCard
                  value={stats.total_users}
                  label="Total Users"
                  color="purple"
                  delay={0}
                />
                <StatCard
                  value={stats.completed_payments}
                  label="Paid Orders"
                  color="green"
                  delay={0.1}
                />
                <StatCard
                  value={stats.total_careers}
                  label="Career Applications"
                  color="orange"
                  delay={0.2}
                />
                <StatCard
                  value={formatCurrency(stats.revenue_breakdown.total)}
                  label="Total Revenue"
                  color="pink"
                  delay={0.3}
                />
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
                  <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <div className="mb-4 font-['Satoshi'] text-sm font-medium text-neutral-600">
                        New Users
                      </div>
                      <div className="h-32">
                        <Bar
                          data={{
                            labels: monthlyLabels,
                            datasets: [
                              {
                                label: "Users",
                                data: usersData,
                                backgroundColor: "#8b5cf6",
                                borderColor: "#171717",
                                borderWidth: 2,
                              },
                            ],
                          }}
                          options={{
                            ...chartOptions,
                            plugins: {
                              ...chartOptions.plugins,
                              tooltip: {
                                ...chartOptions.plugins.tooltip,
                                callbacks: {
                                  label: (context) =>
                                    `${context.parsed.y} users`,
                                },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-4 font-['Satoshi'] text-sm font-medium text-neutral-600">
                        Assignment Orders
                      </div>
                      <div className="h-32">
                        <Bar
                          data={{
                            labels: monthlyLabels,
                            datasets: [
                              {
                                label: "Orders",
                                data: ordersData,
                                backgroundColor: "#10b981",
                                borderColor: "#171717",
                                borderWidth: 2,
                              },
                            ],
                          }}
                          options={{
                            ...chartOptions,
                            plugins: {
                              ...chartOptions.plugins,
                              tooltip: {
                                ...chartOptions.plugins.tooltip,
                                callbacks: {
                                  label: (context) =>
                                    `${context.parsed.y} orders`,
                                },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-4 font-['Satoshi'] text-sm font-medium text-neutral-600">
                        Outreach Orders
                      </div>
                      <div className="h-32">
                        <Bar
                          data={{
                            labels: monthlyLabels,
                            datasets: [
                              {
                                label: "Outreach",
                                data: ordersData,
                                backgroundColor: "#06b6d4",
                                borderColor: "#171717",
                                borderWidth: 2,
                              },
                            ],
                          }}
                          options={{
                            ...chartOptions,
                            plugins: {
                              ...chartOptions.plugins,
                              tooltip: {
                                ...chartOptions.plugins.tooltip,
                                callbacks: {
                                  label: (context) =>
                                    `${context.parsed.y} orders`,
                                },
                              },
                            },
                          }}
                        />
                      </div>
                    </div>
                    <div>
                      <div className="mb-4 font-['Satoshi'] text-sm font-medium text-neutral-600">
                        Revenue (₹)
                      </div>
                      <div className="h-32">
                        <Bar
                          data={{
                            labels: monthlyLabels,
                            datasets: [
                              {
                                label: "Revenue",
                                data: revenueData,
                                backgroundColor: "#f59e0b",
                                borderColor: "#171717",
                                borderWidth: 2,
                              },
                            ],
                          }}
                          options={{
                            ...chartOptions,
                            plugins: {
                              ...chartOptions.plugins,
                              tooltip: {
                                ...chartOptions.plugins.tooltip,
                                callbacks: {
                                  label: (context) => `₹${context.parsed.y}`,
                                },
                              },
                            },
                          }}
                        />
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
                  <div className="h-64">
                    <Doughnut
                      data={revenueBreakdownData}
                      options={{
                        ...chartOptions,
                        plugins: {
                          ...chartOptions.plugins,
                          legend: {
                            display: true,
                            position: "bottom" as const,
                            labels: {
                              font: {
                                family: "'Satoshi', sans-serif",
                                size: 12,
                              },
                              padding: 15,
                              usePointStyle: true,
                            },
                          },
                          tooltip: {
                            ...chartOptions.plugins.tooltip,
                            callbacks: {
                              label: (context) => {
                                const label = context.label || "";
                                const value = context.parsed || 0;
                                return `${label}: ₹${value}`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                  <div className="mt-6 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-purple-500"></div>
                        <span className="font-['Satoshi'] text-sm text-neutral-700">
                          Assignments
                        </span>
                      </div>
                      <span className="font-['Satoshi'] text-sm font-medium text-neutral-900">
                        {formatCurrency(stats.revenue_breakdown.assignments)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-emerald-500"></div>
                        <span className="font-['Satoshi'] text-sm text-neutral-700">
                          Outreach
                        </span>
                      </div>
                      <span className="font-['Satoshi'] text-sm font-medium text-neutral-900">
                        {formatCurrency((stats.revenue_breakdown as any).outreach || 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className="h-4 w-4 rounded bg-amber-500"></div>
                        <span className="font-['Satoshi'] text-sm text-neutral-700">
                          Careers
                        </span>
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
                    <Line
                      data={revenueTrendData}
                      options={{
                        ...chartOptions,
                        plugins: {
                          ...chartOptions.plugins,
                          tooltip: {
                            ...chartOptions.plugins.tooltip,
                            callbacks: {
                              label: (context) => `₹${context.parsed.y}`,
                            },
                          },
                        },
                      }}
                    />
                  </div>
                  <div className="mt-4 text-center font-['Satoshi'] text-sm text-neutral-600">
                    Monthly revenue over last 12 months
                  </div>
                </div>
              </motion.div>

              {/* Assignment Orders */}
              {stats.assignment_orders &&
                stats.assignment_orders.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: 0.4 }}
                    className="rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] overflow-hidden"
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
                            <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                              User
                            </th>
                            <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                              Date
                            </th>
                            <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                              Status
                            </th>
                            <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                              Amount
                            </th>
                            <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {stats.assignment_orders.map((order, index) => (
                            <motion.tr
                              key={order.job_id}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{
                                duration: 0.2,
                                delay: index * 0.02,
                              }}
                              className="border-b border-neutral-200 transition-colors hover:bg-neutral-50"
                            >
                              <td className="px-4 py-3 font-['Satoshi'] text-sm font-medium text-neutral-900">
                                {order.user_name}
                              </td>
                              <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">
                                {new Date(
                                  order.created_at,
                                ).toLocaleDateString()}
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
                                {order.status === "COMPLETED" &&
                                  order.download_url && (
                                    <button
                                      onClick={() =>
                                        handleDownload(order.job_id)
                                      }
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
                    <div className="font-['Clash_Display'] text-xl font-medium text-neutral-900">
                      Manage Users
                    </div>
                    <div className="mt-2 font-['Satoshi'] text-sm text-neutral-600">
                      View and manage user accounts
                    </div>
                  </Link>
                  <Link
                    to="/outreach-orders"
                    className="group rounded-2xl border-2 border-neutral-900 bg-emerald-50 p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                  >
                    <div className="font-['Clash_Display'] text-xl font-medium text-neutral-900">
                      Outreach Orders
                    </div>
                    <div className="mt-2 font-['Satoshi'] text-sm text-neutral-600">
                      Monitor paid outreach campaigns
                    </div>
                  </Link>
                  <Link
                    to="/careers"
                    className="group rounded-2xl border-2 border-neutral-900 bg-amber-50 p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px] hover:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                  >
                    <div className="font-['Clash_Display'] text-xl font-medium text-neutral-900">
                      Career Applications
                    </div>
                    <div className="mt-2 font-['Satoshi'] text-sm text-neutral-600">
                      Manage career applications
                    </div>
                  </Link>
                </div>
              </motion.div>
            </div>
          )}
        </div>
      </main>
    </>
  );
}
