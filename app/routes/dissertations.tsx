import { useEffect, useState } from "react";
import { AdminHeader } from "~/components/admin-header";
import { listDissertations, type DissertationSubmission } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/dissertations";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Dissertations – Admin Panel" },
    {
      name: "description",
      content: "Manage dissertation submissions",
    },
  ];
}

export default function Dissertations() {
  const [submissions, setSubmissions] = useState<DissertationSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    loadSubmissions();
  }, [offset]);

  const loadSubmissions = async () => {
    try {
      setLoading(true);
      const response = await listDissertations(limit, offset);
      setSubmissions(response.submissions as DissertationSubmission[]);
    } catch (error: any) {
      toast.error(error.message || "Failed to load submissions");
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
          Dissertation Submissions
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
                    Title
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Data Type
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
                {submissions.map((sub) => (
                  <tr key={sub.id} className="border-b border-gray-200">
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {sub.name}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {sub.email}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {sub.dissertation_title}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {sub.data_type}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-1 font-['Satoshi'] text-xs ${
                          sub.payment_status === "completed"
                            ? "bg-green-100 text-green-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {sub.payment_status} ({formatAmount(sub.amount)})
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-gray-100 px-2 py-1 font-['Satoshi'] text-xs text-gray-700">
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-gray-600">
                      {new Date(sub.created_at).toLocaleDateString()}
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
                disabled={submissions.length < limit}
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

