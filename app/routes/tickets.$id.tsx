import { useEffect, useState, useCallback, useRef } from "react";
import { motion } from "framer-motion";
import { Link } from "react-router";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import type { Route } from "./+types/tickets.$id";

export function meta({ params }: Route.MetaArgs) {
  return [{ title: `Ticket #${params.id} – Admin Panel` }];
}

interface TicketMessage {
  id: number;
  ticket_id: number;
  author_type: "user" | "admin" | "system";
  author_email: string;
  body: string;
  created_at: string;
}

interface TicketAttachment {
  url: string;
  content_type?: string;
  filename?: string;
}

interface TicketDetail {
  id: number;
  user_id: string;
  user_email: string;
  user_name: string | null;
  category: string;
  priority: "high" | "normal" | "low";
  status: "open" | "in_progress" | "resolved" | "wont_fix";
  source: string;
  context: Record<string, any> | null;
  assignee_email: string | null;
  attachments: TicketAttachment[] | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  messages: TicketMessage[];
}

const STATUS_BADGE: Record<string, string> = {
  open: "bg-amber-100 text-amber-800 border-amber-300",
  in_progress: "bg-violet-100 text-violet-800 border-violet-300",
  resolved: "bg-emerald-100 text-emerald-800 border-emerald-300",
  wont_fix: "bg-neutral-100 text-neutral-700 border-neutral-300",
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-100 text-red-800 border-red-300",
  normal: "bg-amber-100 text-amber-800 border-amber-300",
  low: "bg-neutral-100 text-neutral-700 border-neutral-300",
};

const CATEGORY_LABELS: Record<string, string> = {
  campaign_broken: "Campaign broken",
  campaign_changes: "Campaign changes",
  website_broken: "Site broken",
  info_request: "Info request",
  other: "Other",
};

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In progress" },
  { value: "resolved", label: "Resolved" },
  { value: "wont_fix", label: "Won't fix" },
];

function fmt(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TicketDetailPage({ params }: Route.ComponentProps) {
  const { isAuthorized, isPending } = useAdminGuard();
  const [detail, setDetail] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [assignee, setAssignee] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const id = Number(params.id);

  const fetchDetail = useCallback(async () => {
    setError(null);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/tickets/${id}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as TicketDetail;
      setDetail(data);
      setAssignee(data.assignee_email || "");
    } catch (e: any) {
      setError(e.message || "Failed to load ticket");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (isAuthorized) fetchDetail();
  }, [isAuthorized, fetchDetail]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail?.messages.length]);

  const sendReply = async (alsoResolve = false) => {
    const text = reply.trim();
    if (!text || sending) return;
    setSending(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/tickets/${id}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify({ body: text }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || `HTTP ${res.status}`);
        return;
      }
      setReply("");
      if (alsoResolve) await updateTicket({ status: "resolved" });
      else await fetchDetail();
    } finally {
      setSending(false);
    }
  };

  const updateTicket = async (patch: { status?: string; assignee_email?: string }) => {
    setSavingStatus(true);
    try {
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/tickets/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
        body: JSON.stringify(patch),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        setError(j?.error || `HTTP ${res.status}`);
        return;
      }
      await fetchDetail();
    } finally {
      setSavingStatus(false);
    }
  };

  if (isPending || loading) {
    return (
      <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-500">
        Loading...
      </div>
    );
  }
  if (!isAuthorized) return null;
  if (error || !detail) {
    return (
      <div className="min-h-screen bg-neutral-50">
        <AdminHeader />
        <main className="mx-auto max-w-[1100px] px-6 py-8">
          <Link to="/tickets" className="text-sm font-semibold text-violet-700">
            ← Back to tickets
          </Link>
          <p className="mt-4 text-red-700">{error || "Not found"}</p>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[1100px] px-6 py-8">
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
          <Link
            to="/tickets"
            className="inline-block mb-4 text-sm font-semibold text-violet-700 hover:underline"
          >
            ← Back to tickets
          </Link>

          {/* Header */}
          <div className="rounded-2xl border-2 border-neutral-900 bg-white p-5 mb-5 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${
                      PRIORITY_BADGE[detail.priority] || PRIORITY_BADGE.normal
                    }`}
                  >
                    {detail.priority} priority
                  </span>
                  <span
                    className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-bold ${
                      STATUS_BADGE[detail.status] || STATUS_BADGE.open
                    }`}
                  >
                    {detail.status.replace("_", " ")}
                  </span>
                  <span className="text-xs text-neutral-500">
                    #{detail.id} · via {detail.source.replace("_", " ")}
                  </span>
                </div>
                <h1 className="text-2xl font-bold text-neutral-900">
                  {CATEGORY_LABELS[detail.category] || detail.category}
                </h1>
                <p className="mt-1 text-sm text-neutral-600">
                  Raised by{" "}
                  <span className="font-semibold">
                    {detail.user_name || detail.user_email}
                  </span>{" "}
                  · {fmt(detail.created_at)}
                </p>
                {detail.context && Object.keys(detail.context).length > 0 && (
                  <div className="mt-3 rounded-lg bg-neutral-50 px-3 py-2 text-xs text-neutral-700">
                    {Object.entries(detail.context).map(([k, v]) =>
                      v == null ? null : (
                        <div key={k}>
                          <strong>{k}:</strong> {String(v)}
                        </div>
                      ),
                    )}
                  </div>
                )}
                {detail.attachments && detail.attachments.length > 0 && (
                  <div className="mt-3">
                    <div className="text-xs font-bold uppercase tracking-wider text-neutral-500 mb-1.5">
                      Screenshots ({detail.attachments.length})
                    </div>
                    <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                      {detail.attachments.map((a, i) => (
                        <a
                          key={i}
                          href={a.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="block overflow-hidden rounded-lg border-2 border-neutral-300 bg-neutral-100 hover:border-neutral-900 transition-colors"
                          title={a.filename || `Screenshot ${i + 1}`}
                        >
                          <img
                            src={a.url}
                            alt={a.filename || `Screenshot ${i + 1}`}
                            className="block h-24 w-full object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 min-w-[200px]">
                <label className="text-xs font-bold text-neutral-700">Status</label>
                <select
                  value={detail.status}
                  onChange={(e) => updateTicket({ status: e.target.value })}
                  disabled={savingStatus}
                  className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm font-semibold"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <label className="text-xs font-bold text-neutral-700 mt-2">Assignee email</label>
                <input
                  type="email"
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  onBlur={() => {
                    if (assignee !== (detail.assignee_email || "")) {
                      updateTicket({ assignee_email: assignee });
                    }
                  }}
                  placeholder="unassigned"
                  className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm"
                />
              </div>
            </div>
          </div>

          {/* Thread */}
          <div className="space-y-3 mb-5">
            {detail.messages.map((m) => {
              const isUser = m.author_type === "user";
              return (
                <div
                  key={m.id}
                  className={`flex ${isUser ? "justify-start" : "justify-end"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-2xl border-2 border-neutral-900 px-4 py-3 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] ${
                      isUser
                        ? "bg-white text-neutral-900"
                        : m.author_type === "admin"
                          ? "bg-violet-500 text-white"
                          : "bg-neutral-100 text-neutral-700"
                    }`}
                  >
                    <div
                      className={`text-[11px] font-bold mb-1 ${
                        isUser
                          ? "text-neutral-500"
                          : m.author_type === "admin"
                            ? "text-white/80"
                            : "text-neutral-500"
                      }`}
                    >
                      {m.author_type === "user"
                        ? m.author_email
                        : m.author_type === "admin"
                          ? `${m.author_email} (studojo team)`
                          : "system"}{" "}
                      · {fmt(m.created_at)}
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{m.body}</p>
                  </div>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>

          {/* Reply box */}
          {detail.status === "resolved" || detail.status === "wont_fix" ? (
            <div className="rounded-xl border-2 border-neutral-300 bg-neutral-100 px-4 py-4 text-center text-sm text-neutral-600">
              This ticket is closed. Re-open from the status dropdown to reply.
            </div>
          ) : (
            <div className="rounded-xl border-2 border-neutral-900 bg-white p-3 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                placeholder="Reply to the user. They'll get this as an email and see it in their support chat."
                className="w-full rounded-lg border-2 border-neutral-300 px-3 py-2 text-sm focus:outline-none focus:border-neutral-900 resize-none"
              />
              <div className="flex justify-between mt-2">
                <span className="text-[11px] text-neutral-400">
                  {reply.length} / 5000
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => sendReply(true)}
                    disabled={sending || !reply.trim()}
                    className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 text-sm font-bold text-neutral-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40"
                  >
                    Send + resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => sendReply(false)}
                    disabled={sending || !reply.trim()}
                    className="rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-1.5 text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
                  >
                    {sending ? "Sending..." : "Send reply"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </motion.div>
      </main>
    </div>
  );
}
