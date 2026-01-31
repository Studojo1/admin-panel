import { useEffect, useState } from "react";
import { AdminHeader } from "~/components/admin-header";
import { listCareers, type CareerApplication } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/careers";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Careers – Admin Panel" },
    {
      name: "description",
      content: "Manage career applications",
    },
  ];
}

export default function Careers() {
  const [applications, setApplications] = useState<CareerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadApplications();
  }, [offset]);

  const loadApplications = async () => {
    try {
      setLoading(true);
      const response = await listCareers(limit, offset);
      setApplications(response.applications as CareerApplication[]);
    } catch (error: any) {
      toast.error(error.message || "Failed to load applications");
    } finally {
      setLoading(false);
    }
  };

  const formatAmount = (paise: number) => {
    return `₹${(paise / 100).toLocaleString("en-IN")}`;
  };

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
          Career Applications
        </h1>

        {loading ? (
          <p className="mt-4 font-['Satoshi'] text-base text-gray-600">Loading...</p>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-900">
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Institution
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Course
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Interests
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Payment
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody>
                {applications.map((app) => (
                  <tr key={app.id} className="border-b border-gray-200">
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {app.name}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {app.email}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {app.institution_name}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {app.course}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-xs text-neutral-950">
                      {Array.isArray(app.areas_of_interest)
                        ? app.areas_of_interest.join(", ")
                        : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-1 font-['Satoshi'] text-xs ${
                          app.payment_status === "completed"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {app.payment_status} ({formatAmount(app.amount)})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-1 font-['Satoshi'] text-xs text-gray-700">
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-gray-600">
                      {new Date(app.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-4 flex gap-4">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={applications.length < limit}
                className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

