import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminHeader, SearchInput } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import {
  getDashboardStats,
  getControlPlaneUrl,
  getToken,
  type AssignmentOrder,
} from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/assignments";

function formatCurrency(paise: number): string {
  return `₹${(paise / 100).toLocaleString("en-IN")}`;
}

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Assignments – Admin Panel" },
    {
      name: "description",
      content: "View and manage assignment orders",
    },
  ];
}

export default function Assignments() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [assignments, setAssignments] = useState<AssignmentOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filteredAssignments, setFilteredAssignments] = useState<
    AssignmentOrder[]
  >([]);

  useEffect(() => {
    if (isAuthorized) {
      loadAssignments();
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (search.trim() === "") {
      setFilteredAssignments(assignments);
    } else {
      const searchLower = search.toLowerCase();
      setFilteredAssignments(
        assignments.filter(
          (a) =>
            a.user_name.toLowerCase().includes(searchLower) ||
            a.user_id.toLowerCase().includes(searchLower) ||
            a.job_id.toLowerCase().includes(searchLower) ||
            a.status.toLowerCase().includes(searchLower),
        ),
      );
    }
  }, [search, assignments]);

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

  const loadAssignments = async () => {
    try {
      setLoading(true);
      const data = await getDashboardStats();
      setAssignments(data.assignment_orders || []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load assignments");
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
        toast.success("Download started");
      } else {
        toast.error("No result available for this assignment");
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to download assignment");
    }
  };

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
            Assignment Orders
          </h1>
          <p className="mt-4 font-['Satoshi'] text-base font-normal leading-6 text-gray-600">
            View and manage all assignment orders
          </p>
        </motion.div>

        <div className="mt-8">
          <SearchInput
            onSearch={setSearch}
            placeholder="Search by user name, user ID, job ID, or status..."
            debounceMs={300}
          />
        </div>

        {loading ? (
          <div className="mt-12 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"></div>
              <p className="font-['Satoshi'] text-sm text-gray-600">
                Loading assignments...
              </p>
            </div>
          </div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-8 rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] overflow-hidden"
          >
            <div className="border-b-2 border-neutral-900 bg-neutral-50 px-6 py-4 md:px-8">
              <div className="flex items-center justify-between">
                <h2 className="font-['Clash_Display'] text-xl font-medium leading-tight tracking-tight text-neutral-950 md:text-2xl">
                  All Assignments
                </h2>
                <span className="font-['Satoshi'] text-sm text-neutral-600">
                  {filteredAssignments.length}{" "}
                  {filteredAssignments.length === 1 ? "order" : "orders"}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                    <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                      User
                    </th>
                    <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                      Job ID
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
                  {filteredAssignments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center">
                        <p className="font-['Satoshi'] text-sm text-neutral-500">
                          {search
                            ? "No assignments found matching your search."
                            : "No assignments found."}
                        </p>
                      </td>
                    </tr>
                  ) : (
                    filteredAssignments.map((order, index) => (
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
                        <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700 font-mono">
                          {order.job_id.slice(0, 8)}...
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
                          {order.status === "COMPLETED" && (
                            <button
                              onClick={() => handleDownload(order.job_id)}
                              className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                            >
                              Download
                            </button>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </main>
    </>
  );
}
