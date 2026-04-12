import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { motion } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getAdminCampaignEmails, type AdminCampaignDetail, type CampaignEmail } from "~/lib/api";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  queued:    { bg: "bg-neutral-100", text: "text-neutral-700" },
  scheduled: { bg: "bg-blue-100",    text: "text-blue-700" },
  sent:      { bg: "bg-green-100",   text: "text-green-700" },
  replied:   { bg: "bg-emerald-100", text: "text-emerald-700" },
  bounced:   { bg: "bg-red-100",     text: "text-red-700" },
  failed:    { bg: "bg-orange-100",  text: "text-orange-700" },
};

const CAMPAIGN_STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  running: { bg: "bg-green-100",  text: "text-green-700" },
  paused:  { bg: "bg-amber-100",  text: "text-amber-700" },
  draft:   { bg: "bg-gray-100",   text: "text-gray-700" },
  completed: { bg: "bg-emerald-100", text: "text-emerald-700" },
};

function fmtStatus(s: string) {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleString();
}

function MetricPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-xl border-2 border-neutral-900 ${color} p-4 text-center shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]`}>
      <div className="font-['Clash_Display'] text-2xl font-bold text-neutral-900">{value}</div>
      <div className="mt-1 font-['Satoshi'] text-xs font-medium text-neutral-700">{label}</div>
    </div>
  );
}

function EmailRow({ email }: { email: CampaignEmail }) {
  const [expanded, setExpanded] = useState(false);
  const sc = STATUS_COLORS[email.status] ?? STATUS_COLORS.queued;

  return (
    <>
      <tr
        className="cursor-pointer border-b border-neutral-100 hover:bg-neutral-50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <td className="px-4 py-3">
          <div className="font-['Satoshi'] text-sm font-medium text-neutral-900">{email.lead_name}</div>
          <div className="font-['Satoshi'] text-xs text-neutral-500">{email.lead_title || "—"}</div>
        </td>
        <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-700">{email.lead_company || "—"}</td>
        <td className="px-4 py-3">
          <span className={`inline-block rounded-lg px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${sc.bg} ${sc.text}`}>
            {fmtStatus(email.status)}
          </span>
        </td>
        <td className="px-4 py-3 font-['Satoshi'] text-xs text-neutral-600">{email.assigned_style ? fmtStatus(email.assigned_style) : "—"}</td>
        <td className="px-4 py-3 font-['Satoshi'] text-xs text-neutral-600">{fmtDate(email.sent_at)}</td>
        <td className="px-4 py-3">
          {email.reply_text ? (
            <span className="font-['Satoshi'] text-xs text-emerald-700 font-medium">
              {email.reply_text.slice(0, 60)}{email.reply_text.length > 60 ? "…" : ""}
            </span>
          ) : (
            <span className="font-['Satoshi'] text-xs text-neutral-400">—</span>
          )}
        </td>
        <td className="px-4 py-3 text-center">
          <span className="font-['Satoshi'] text-xs text-neutral-400">{expanded ? "▲" : "▼"}</span>
        </td>
      </tr>
      {expanded && (
        <tr className="border-b border-neutral-100 bg-neutral-50">
          <td colSpan={7} className="px-6 py-4">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              {email.subject && (
                <div>
                  <div className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">Subject</div>
                  <div className="font-['Satoshi'] text-sm text-neutral-800">{email.subject}</div>
                </div>
              )}
              {email.to_email && (
                <div>
                  <div className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">To</div>
                  <div className="font-['Satoshi'] text-sm text-neutral-800">{email.to_email}</div>
                </div>
              )}
              {email.body && (
                <div className="md:col-span-2">
                  <div className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">Email Body</div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-neutral-200 bg-white p-3 font-['Satoshi'] text-xs text-neutral-700 leading-relaxed max-h-48 overflow-y-auto">
                    {email.body}
                  </pre>
                </div>
              )}
              {email.reply_text && (
                <div className="md:col-span-2">
                  <div className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">
                    Reply {email.reply_sentiment ? `(${fmtStatus(email.reply_sentiment)})` : ""}
                  </div>
                  <pre className="whitespace-pre-wrap rounded-lg border border-emerald-200 bg-emerald-50 p-3 font-['Satoshi'] text-xs text-emerald-800 leading-relaxed max-h-48 overflow-y-auto">
                    {email.reply_text}
                  </pre>
                </div>
              )}
              {email.bounce_reason && (
                <div className="md:col-span-2">
                  <div className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">Bounce Reason</div>
                  <div className="font-['Satoshi'] text-sm text-red-700">{email.bounce_reason}</div>
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function OutreachCampaignPage() {
  const { isAuthorized, isPending } = useAdminGuard();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const campaignId = searchParams.get("campaign_id");

  const [data, setData] = useState<AdminCampaignDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthorized || !campaignId) return;
    setLoading(true);
    getAdminCampaignEmails(Number(campaignId))
      .then(setData)
      .catch((err: any) => toast.error(err.message || "Failed to load campaign"))
      .finally(() => setLoading(false));
  }, [isAuthorized, campaignId]);

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

  // Compute metrics from email list
  const emails = data?.emails ?? [];
  const metrics = emails.reduce(
    (acc, e) => {
      if (e.status === "sent" || e.status === "replied") acc.sent++;
      if (e.status === "replied") acc.replied++;
      if (e.status === "bounced") acc.bounced++;
      if (e.status === "queued") acc.queued++;
      if (e.status === "failed") acc.failed++;
      if (e.status === "scheduled") acc.scheduled++;
      return acc;
    },
    { sent: 0, replied: 0, bounced: 0, queued: 0, failed: 0, scheduled: 0 }
  );

  const campaignSc = data
    ? CAMPAIGN_STATUS_COLORS[data.campaign.status] ?? CAMPAIGN_STATUS_COLORS.draft
    : null;

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        {/* Back button */}
        <button
          onClick={() => navigate("/outreach-orders")}
          className="mb-6 inline-flex items-center gap-2 font-['Satoshi'] text-sm font-medium text-neutral-600 hover:text-neutral-900 transition-colors"
        >
          ← Back to Outreach Orders
        </button>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
              <p className="font-['Satoshi'] text-sm text-gray-600">Loading campaign...</p>
            </div>
          </div>
        ) : data ? (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="space-y-8"
          >
            {/* Header */}
            <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="font-['Clash_Display'] text-2xl font-medium text-neutral-950 md:text-3xl">
                      {data.campaign.name}
                    </h1>
                    {campaignSc && (
                      <span className={`inline-block rounded-lg px-3 py-1 font-['Satoshi'] text-xs font-medium ${campaignSc.bg} ${campaignSc.text}`}>
                        {fmtStatus(data.campaign.status)}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
                    Daily limit: {data.campaign.daily_limit} emails
                  </div>
                </div>
                <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                  <div className="font-['Satoshi'] text-sm font-medium text-neutral-900">{data.owner.name}</div>
                  <div className="font-['Satoshi'] text-xs text-neutral-500">{data.owner.email}</div>
                </div>
              </div>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-4 md:grid-cols-6">
              <MetricPill label="Sent" value={metrics.sent} color="bg-green-50" />
              <MetricPill label="Replied" value={metrics.replied} color="bg-emerald-50" />
              <MetricPill label="Bounced" value={metrics.bounced} color="bg-red-50" />
              <MetricPill label="Queued" value={metrics.queued} color="bg-neutral-50" />
              <MetricPill label="Scheduled" value={metrics.scheduled} color="bg-blue-50" />
              <MetricPill label="Failed" value={metrics.failed} color="bg-orange-50" />
            </div>

            {/* Email table */}
            <div>
              <h2 className="mb-4 font-['Clash_Display'] text-xl font-medium text-neutral-950">
                All Emails ({emails.length})
              </h2>
              {emails.length === 0 ? (
                <div className="rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center">
                  <p className="font-['Satoshi'] text-sm text-neutral-500">No emails yet for this campaign</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                        <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Lead</th>
                        <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Company</th>
                        <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Status</th>
                        <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Style</th>
                        <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Sent At</th>
                        <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">Reply</th>
                        <th className="px-4 py-3"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {emails.map((email) => (
                        <EmailRow key={email.id} email={email} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </motion.div>
        ) : (
          <div className="rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center">
            <p className="font-['Satoshi'] text-sm text-neutral-500">Campaign not found</p>
          </div>
        )}
      </main>
    </>
  );
}
