import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import { getOutreachUserDetail, type OutreachUserDetail, type OutreachOrderDetail } from "~/lib/api";
import { toast } from "sonner";

ChartJS.register(ArcElement, Tooltip, Legend);

type Props = {
  userId: string | null;
  isOpen: boolean;
  onClose: () => void;
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  created:              { bg: "bg-gray-100",    text: "text-gray-700" },
  leads_generating:     { bg: "bg-blue-100",    text: "text-blue-700" },
  leads_ready:          { bg: "bg-cyan-100",    text: "text-cyan-700" },
  enriching:            { bg: "bg-indigo-100",  text: "text-indigo-700" },
  enrichment_complete:  { bg: "bg-violet-100",  text: "text-violet-700" },
  campaign_setup:       { bg: "bg-amber-100",   text: "text-amber-700" },
  email_connected:      { bg: "bg-amber-100",   text: "text-amber-700" },
  campaign_running:     { bg: "bg-green-100",   text: "text-green-700" },
  completed:            { bg: "bg-emerald-100", text: "text-emerald-700" },
  draft:                { bg: "bg-gray-100",    text: "text-gray-700" },
  running:              { bg: "bg-green-100",   text: "text-green-700" },
  paused:               { bg: "bg-amber-100",   text: "text-amber-700" },
  paid:                 { bg: "bg-green-100",   text: "text-green-700" },
  pending:              { bg: "bg-amber-100",   text: "text-amber-700" },
  failed:               { bg: "bg-red-100",     text: "text-red-700" },
};

function fmtStatus(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function fmtCurrency(cents: number): string {
  return `₹${(cents / 100).toLocaleString("en-IN")}`;
}

const STYLE_COLORS: Record<string, string> = {
  warm_intro: "#8b5cf6",
  value_prop: "#3b82f6",
  company_curiosity: "#06b6d4",
  peer_to_peer: "#10b981",
  direct_ask: "#f59e0b",
};

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_COLORS[status] ?? STATUS_COLORS.created;
  return (
    <span className={`inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${c.bg} ${c.text}`}>
      {fmtStatus(status)}
    </span>
  );
}

function EmailStatBar({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const pct = total > 0 ? (value / total) * 100 : 0;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 font-['Satoshi'] text-xs font-medium text-neutral-600">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-neutral-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(pct, 1)}%` }} />
      </div>
      <span className="w-8 text-right font-['Satoshi'] text-xs font-medium text-neutral-700">{value}</span>
    </div>
  );
}

function OrderCard({ order }: { order: OutreachOrderDetail }) {
  const [showLog, setShowLog] = useState(false);
  const campaign = order.campaign;
  const emailTotal = campaign
    ? campaign.email_stats.sent + campaign.email_stats.queued + campaign.email_stats.scheduled + campaign.email_stats.bounced + campaign.email_stats.failed
    : 0;

  const styleEntries = campaign ? Object.entries(campaign.style_breakdown) : [];

  return (
    <div className="rounded-xl border-2 border-neutral-900 bg-white p-5 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <StatusBadge status={order.status} />
          <span className="font-['Satoshi'] text-xs text-neutral-500">Order #{order.id}</span>
        </div>
        <span className="font-['Satoshi'] text-xs text-neutral-500">{fmtDate(order.created_at)}</span>
      </div>

      {order.is_stuck && (
        <div className="mt-3 rounded-lg border border-red-300 bg-red-50 px-4 py-2 font-['Satoshi'] text-xs font-medium text-red-700">
          Stuck — no progress in 6+ hours (last update: {fmtDate(order.updated_at)})
        </div>
      )}

      {/* Leads progress */}
      {order.leads_target && order.leads_target > 0 && (
        <div className="mt-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-['Satoshi'] text-xs font-medium text-neutral-600">Leads</span>
            <span className="font-['Satoshi'] text-xs text-neutral-500">
              {order.leads_collected ?? 0} / {order.leads_target}
            </span>
          </div>
          <div className="h-2 rounded-full bg-neutral-100 overflow-hidden">
            <div
              className="h-full rounded-full bg-purple-500"
              style={{ width: `${Math.min(((order.leads_collected ?? 0) / order.leads_target) * 100, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Campaign details */}
      {campaign && (
        <div className="mt-4 rounded-lg border border-neutral-200 bg-neutral-50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-['Satoshi'] text-sm font-medium text-neutral-900">{campaign.name}</span>
            <StatusBadge status={campaign.status} />
          </div>
          <div className="font-['Satoshi'] text-xs text-neutral-500">
            Daily limit: {campaign.daily_limit} emails
          </div>

          <div className="space-y-1.5">
            <EmailStatBar label="Sent" value={campaign.email_stats.sent} total={emailTotal} color="bg-green-500" />
            <EmailStatBar label="Replied" value={campaign.email_stats.replied} total={emailTotal} color="bg-blue-500" />
            <EmailStatBar label="Bounced" value={campaign.email_stats.bounced} total={emailTotal} color="bg-red-400" />
            <EmailStatBar label="Queued" value={campaign.email_stats.queued} total={emailTotal} color="bg-neutral-400" />
            <EmailStatBar label="Failed" value={campaign.email_stats.failed} total={emailTotal} color="bg-orange-400" />
          </div>

          {/* Style breakdown doughnut */}
          {styleEntries.length > 0 && (
            <div className="mt-3">
              <span className="font-['Satoshi'] text-xs font-medium text-neutral-600">Email Style Breakdown</span>
              <div className="mt-2 h-36">
                <Doughnut
                  data={{
                    labels: styleEntries.map(([k]) => fmtStatus(k)),
                    datasets: [{
                      data: styleEntries.map(([, v]) => v),
                      backgroundColor: styleEntries.map(([k]) => STYLE_COLORS[k] ?? "#9ca3af"),
                      borderColor: "#171717",
                      borderWidth: 1.5,
                    }],
                  }}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: true,
                        position: "right" as const,
                        labels: {
                          font: { family: "'Satoshi', sans-serif", size: 10 },
                          padding: 8,
                          usePointStyle: true,
                          boxWidth: 8,
                        },
                      },
                    },
                  }}
                />
              </div>
            </div>
          )}

          {/* Open dashboard link */}
          {(campaign.status === "running" || campaign.status === "paused") && (
            <a
              href="https://studojo.com/outreach/campaign/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 bg-violet-50 border border-violet-200 rounded-lg px-3 py-1.5 hover:bg-violet-100 transition-colors w-fit"
            >
              Open Campaign Dashboard ↗
            </a>
          )}
        </div>
      )}

      {/* Action log */}
      {order.action_log && order.action_log.length > 0 && (
        <div className="mt-3">
          <button
            onClick={() => {
              console.log("[ActionLog] raw entries:", JSON.stringify(order.action_log));
              setShowLog(!showLog);
            }}
            className="font-['Satoshi'] text-xs font-medium text-purple-600 hover:text-purple-800"
          >
            {showLog ? "Hide" : "Show"} Action Log ({order.action_log.length})
          </button>
          {showLog && (
            <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50 p-3 space-y-1">
              {order.action_log.map((entry, i) => {
                const ts = (entry as any).ts ?? (entry as any).timestamp ?? "";
                const msg = (entry as any).msg ?? (entry as any).action ?? (entry as any).message ?? JSON.stringify(entry);
                return (
                  <div key={i} className="font-['Satoshi'] text-xs text-neutral-600">
                    <span className="font-medium text-neutral-800">
                      {ts ? new Date(ts).toLocaleString() : ""}
                    </span>{" "}
                    {msg}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function OutreachUserDetailModal({ userId, isOpen, onClose }: Props) {
  const [detail, setDetail] = useState<OutreachUserDetail | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!userId || !isOpen) return;
    setLoading(true);
    getOutreachUserDetail(userId)
      .then(setDetail)
      .catch((err) => toast.error(err.message || "Failed to load user detail"))
      .finally(() => setLoading(false));
  }, [userId, isOpen]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[8px_8px_0px_0px_rgba(25,26,35,1)] md:p-8"
          >
            {/* Header */}
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-900 md:text-3xl">
                User Detail
              </h2>
              <button
                onClick={onClose}
                className="rounded-lg border-2 border-neutral-900 bg-white p-2 transition-transform hover:scale-110 hover:bg-neutral-50"
                aria-label="Close"
              >
                <svg className="h-5 w-5 text-neutral-900" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <div className="text-center">
                  <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
                  <p className="font-['Satoshi'] text-sm text-gray-600">Loading...</p>
                </div>
              </div>
            ) : detail ? (
              <div className="space-y-6">
                {/* User Info + Credits */}
                <section>
                  <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                    User Info
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">Name</label>
                      <p className="font-['Satoshi'] text-base font-normal text-neutral-900">{detail.user.name || "—"}</p>
                    </div>
                    <div>
                      <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">Email</label>
                      <p className="font-['Satoshi'] text-base font-normal text-neutral-900">{detail.user.email}</p>
                    </div>
                    <div>
                      <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">User ID</label>
                      <p className="font-mono font-['Satoshi'] text-xs text-neutral-600">{detail.user.id}</p>
                    </div>
                    <div>
                      <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">Credits</label>
                      <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                        {detail.credits.used} / {detail.credits.total} used
                        <span className="ml-2 text-sm text-neutral-500">({detail.credits.available} available)</span>
                      </p>
                    </div>
                  </div>
                </section>

                {/* Lead Summary */}
                <section>
                  <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                    Lead Summary
                  </h3>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
                    {[
                      { label: "Total Leads", value: detail.lead_summary.total },
                      { label: "With Email", value: detail.lead_summary.with_email },
                      { label: "Verified", value: detail.lead_summary.email_verified },
                      { label: "Avg Score", value: detail.lead_summary.avg_score },
                    ].map((item) => (
                      <div key={item.label} className="rounded-lg border border-neutral-200 bg-neutral-50 p-3 text-center">
                        <div className="font-['Clash_Display'] text-xl font-bold text-neutral-900">{item.value}</div>
                        <div className="font-['Satoshi'] text-xs text-neutral-500">{item.label}</div>
                      </div>
                    ))}
                  </div>
                </section>

                {/* Payment History */}
                {detail.payments.length > 0 && (
                  <section>
                    <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                      Payment History
                    </h3>
                    <div className="overflow-x-auto rounded-lg border border-neutral-200">
                      <table className="w-full border-collapse">
                        <thead>
                          <tr className="border-b border-neutral-200 bg-neutral-50">
                            <th className="px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700">Date</th>
                            <th className="px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700">Tier</th>
                            <th className="px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700">Amount</th>
                            <th className="px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700">Credits</th>
                            <th className="px-3 py-2 text-left font-['Satoshi'] text-xs font-bold text-neutral-700">Status</th>
                          </tr>
                        </thead>
                        <tbody>
                          {detail.payments.map((p) => (
                            <tr key={p.id} className="border-b border-neutral-100">
                              <td className="px-3 py-2 font-['Satoshi'] text-xs text-neutral-700">{fmtDate(p.created_at)}</td>
                              <td className="px-3 py-2 font-['Satoshi'] text-xs font-medium text-neutral-900">{p.tier || "—"}</td>
                              <td className="px-3 py-2 font-['Satoshi'] text-xs font-medium text-neutral-900">{fmtCurrency(p.amount_cents)}</td>
                              <td className="px-3 py-2 font-['Satoshi'] text-xs text-neutral-700">{p.credits_granted}</td>
                              <td className="px-3 py-2"><StatusBadge status={p.status} /></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                )}

                {/* Orders */}
                <section>
                  <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                    Orders ({detail.orders.length})
                  </h3>
                  <div className="space-y-4">
                    {detail.orders.map((order) => (
                      <OrderCard key={order.id} order={order} />
                    ))}
                  </div>
                </section>
              </div>
            ) : (
              <div className="py-16 text-center">
                <p className="font-['Satoshi'] text-sm text-neutral-500">No data available</p>
              </div>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}