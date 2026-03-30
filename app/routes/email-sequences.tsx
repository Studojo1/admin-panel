import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import {
  listScheduledEmails,
  cancelScheduledEmail,
  type ScheduledEmail,
} from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/email-sequences";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Email Sequences – Admin Panel" },
    { name: "description", content: "Manage nurture email sequences" },
  ];
}

const EMAIL_TYPE_LABELS: Record<string, string> = {
  nurture_day3: "Day 3 — Applying the wrong way",
  nurture_day7: "Day 7 — Still looking?",
  nurture_day14: "Day 14 — Social proof",
  nurture_day30: "Day 30 — Personal check-in",
  welcome: "Welcome",
  "forgot-password": "Forgot password",
  "resume-optimized": "Resume optimized",
  "internship-applied": "Internship applied",
  "password-changed": "Password changed",
};

const STATUS_FILTERS = [
  { label: "Pending", value: "pending" },
  { label: "Due now", value: "due" },
  { label: "Sent", value: "sent" },
  { label: "All", value: "" },
] as const;

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeTo(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const abs = Math.abs(ms);
  const mins = Math.floor(abs / 60000);
  const hours = Math.floor(abs / 3600000);
  const days = Math.floor(abs / 86400000);

  const label =
    days >= 1
      ? `${days}d`
      : hours >= 1
      ? `${hours}h`
      : mins >= 1
      ? `${mins}m`
      : "now";

  return ms < 0 ? `${label} ago` : `in ${label}`;
}

export default function EmailSequences() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [emails, setEmails] = useState<ScheduledEmail[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<"pending" | "sent" | "due" | "">(
    "pending"
  );
  const [search, setSearch] = useState("");
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [offset, setOffset] = useState(0);
  const limit = 100;

  const load = useCallback(async () => {
    if (!isAuthorized) return;
    try {
      setLoading(true);
      const data = await listScheduledEmails(status, limit, offset);
      setEmails(data.emails ?? []);
      setTotal(data.total ?? 0);
    } catch (err: any) {
      toast.error(err.message || "Failed to load emails");
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, status, offset]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCancel = async (id: string, userEmail: string) => {
    if (!confirm(`Cancel scheduled email for ${userEmail}?`)) return;
    try {
      setCancelling(id);
      await cancelScheduledEmail(id);
      toast.success("Email cancelled");
      setEmails((prev) => prev.filter((e) => e.id !== id));
      setTotal((t) => t - 1);
    } catch (err: any) {
      toast.error(err.message || "Failed to cancel email");
    } finally {
      setCancelling(null);
    }
  };

  const filtered = search.trim()
    ? emails.filter(
        (e) =>
          e.user_email.toLowerCase().includes(search.toLowerCase()) ||
          e.user_name.toLowerCase().includes(search.toLowerCase()) ||
          e.email_type.toLowerCase().includes(search.toLowerCase())
      )
    : emails;

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
          <p className="font-['Satoshi'] text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        {/* Header row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="font-['Satoshi'] text-3xl font-black text-neutral-900">
              Email Sequences
            </h1>
            <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
              {total} email{total !== 1 ? "s" : ""} — {status || "all"} view
            </p>
          </div>

          {/* Status tabs */}
          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setStatus(f.value as typeof status);
                  setOffset(0);
                }}
                className={`rounded-lg border-2 border-neutral-900 px-4 py-1.5 font-['Satoshi'] text-sm font-medium transition-all ${
                  status === f.value
                    ? "bg-violet-500 text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                    : "bg-white text-neutral-700 hover:bg-neutral-50 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Search */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="mb-6"
        >
          <input
            type="text"
            placeholder="Search by user email, name, or email type…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-md rounded-lg border-2 border-neutral-900 bg-white px-4 py-2.5 font-['Satoshi'] text-sm text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-400"
          />
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="overflow-hidden rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center font-['Satoshi'] text-neutral-500">
              No emails found.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                    {["User", "Email Type", "Scheduled", "Status", ""].map(
                      (h) => (
                        <th
                          key={h}
                          className="px-4 py-3 text-left font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-600"
                        >
                          {h}
                        </th>
                      )
                    )}
                  </tr>
                </thead>
                <tbody>
                  <AnimatePresence>
                    {filtered.map((email, i) => {
                      const isPending = !email.sent_at;
                      const isDue =
                        isPending &&
                        new Date(email.scheduled_at) <= new Date();
                      return (
                        <motion.tr
                          key={email.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          exit={{ opacity: 0, height: 0 }}
                          transition={{ duration: 0.2, delay: i * 0.02 }}
                          className="border-b border-neutral-100 last:border-0 hover:bg-neutral-50"
                        >
                          {/* User */}
                          <td className="px-4 py-3">
                            <div className="font-['Satoshi'] text-sm font-medium text-neutral-900">
                              {email.user_name || "—"}
                            </div>
                            <div className="font-['Satoshi'] text-xs text-neutral-500">
                              {email.user_email}
                            </div>
                          </td>

                          {/* Email type */}
                          <td className="px-4 py-3">
                            <span className="inline-block rounded-md border border-violet-200 bg-violet-50 px-2 py-0.5 font-['Satoshi'] text-xs font-medium text-violet-700">
                              {EMAIL_TYPE_LABELS[email.email_type] ??
                                email.email_type}
                            </span>
                          </td>

                          {/* Scheduled at */}
                          <td className="px-4 py-3">
                            <div className="font-['Satoshi'] text-sm text-neutral-700">
                              {formatDate(email.scheduled_at)}
                            </div>
                            <div
                              className={`font-['Satoshi'] text-xs ${
                                isDue
                                  ? "text-amber-600 font-medium"
                                  : "text-neutral-400"
                              }`}
                            >
                              {relativeTo(email.scheduled_at)}
                            </div>
                          </td>

                          {/* Status */}
                          <td className="px-4 py-3">
                            {email.sent_at ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 font-['Satoshi'] text-xs font-medium text-green-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
                                Sent {formatDate(email.sent_at)}
                              </span>
                            ) : isDue ? (
                              <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 font-['Satoshi'] text-xs font-medium text-amber-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                                Due
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 font-['Satoshi'] text-xs font-medium text-blue-700">
                                <span className="h-1.5 w-1.5 rounded-full bg-blue-400" />
                                Scheduled
                              </span>
                            )}
                          </td>

                          {/* Actions */}
                          <td className="px-4 py-3 text-right">
                            {isPending && (
                              <button
                                onClick={() =>
                                  handleCancel(email.id, email.user_email)
                                }
                                disabled={cancelling === email.id}
                                className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1 font-['Satoshi'] text-xs font-medium text-red-600 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-red-50 hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
                              >
                                {cancelling === email.id
                                  ? "Cancelling…"
                                  : "Cancel"}
                              </button>
                            )}
                          </td>
                        </motion.tr>
                      );
                    })}
                  </AnimatePresence>
                </tbody>
              </table>
            </div>
          )}
        </motion.div>

        {/* Pagination */}
        {total > limit && (
          <div className="mt-4 flex items-center justify-between font-['Satoshi'] text-sm text-neutral-600">
            <span>
              Showing {offset + 1}–{Math.min(offset + limit, total)} of {total}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={offset + limit >= total}
                className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
