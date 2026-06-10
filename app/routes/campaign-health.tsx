import { useEffect, useState, useCallback } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { motion, AnimatePresence } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { toast } from "sonner";
export function meta() {
  return [
    { title: "Campaign Health – Admin Panel" },
    { name: "description", content: "Funnel-by-funnel breakdown of every paid user's campaign status" },
  ];
}

// Force browser to never cache this page — ensures new JS bundle is always loaded
export function headers() {
  return {
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
    "Pragma": "no-cache",
  };
}

export async function loader({}: LoaderFunctionArgs) {
  return new Response(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Pragma": "no-cache",
    },
  });
}

// ── Types ────────────────────────────────────────────────────────────────────

interface StageTimes {
  resume_uploaded: string | null;
  quiz_completed: string | null;
  leads_generated: string | null;
  gmail_connected: string | null;
  email_style_selected: string | null;
  campaign_launched: string | null;
  campaign_paused: string | null;
  campaign_completed: string | null;
}

interface FailureBreakdown {
  enrichment: number;  // lead enrichment failed — no email found
  auth: number;        // Gmail OAuth token expired / invalid
  bad_email: number;   // recipient address doesn't exist
  other: number;       // everything else
}

interface CampaignStats {
  leads_contacted: number;
  replied: number;
  bounced: number;
  failed: number;
  queued: number;
  reply_rate: number;
  followups_sent: number;
  followups_replied: number;
  last_email_sent: string | null;
  failure_breakdown: FailureBreakdown | null;
  sample_errors: string[];
}

interface CampaignData {
  id: number;
  name: string;
  status: "running" | "paused" | "cancelled" | "completed" | "draft";
  daily_limit: number;
  started_at: string | null;
  gmail_account: string | null;
  token_expiry: string | null;
  stats: CampaignStats;
}

interface LeadQuality {
  total: number;
  with_email: number;
  email_verified: number;
  avg_score: number | null;
  email_rate: number;
  verified_rate: number;
  top_industries: { label: string; count: number }[];
  top_titles: { label: string; count: number }[];
}

interface Profile {
  target_roles: string[];
  target_industries: string[];
  dream_companies: string[];
  resume_profile: Record<string, any>;
  psychometric_profile: Record<string, any>;
  flex_notes: Record<string, any>;
}

interface PaidUser {
  user_id: string;
  name: string;
  email: string;
  paid_at: string;
  total_paid_cents: number;
  currency: string;
  gmail_connected: boolean;   // authoritative: email_accounts row exists
  funnel_status: string;
  stage_timestamps: StageTimes;
  campaign: CampaignData | null;
  profile: Profile | null;
  lead_quality: LeadQuality | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

function ago(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function fmtMoney(cents: number, currency: string): string {
  if (currency === "INR") return `₹${(cents / 100).toLocaleString("en-IN")}`;
  return `$${(cents / 100).toFixed(0)}`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

// Campaign status → colour
const CAMPAIGN_BADGE: Record<string, string> = {
  running:   "bg-green-100 text-green-800 border-green-300",
  paused:    "bg-amber-100 text-amber-800 border-amber-300",
  cancelled: "bg-red-100 text-red-800 border-red-300",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
  draft:     "bg-neutral-100 text-neutral-600 border-neutral-300",
};

// Health signal for running campaigns
function healthSignal(u: PaidUser): { icon: string; label: string; color: string } {
  const c = u.campaign;
  if (!c || c.status !== "running") return { icon: "–", label: "N/A", color: "text-neutral-400" };
  const s = c.stats;
  const contacted = s.leads_contacted;
  if (s.failed > 50 || (contacted > 20 && s.failed / (contacted + s.failed) > 0.3))
    return { icon: "🔴", label: "High failures", color: "text-red-600" };
  if (contacted > 50 && s.replied === 0)
    return { icon: "🔴", label: "0 replies", color: "text-red-600" };
  if (contacted === 0 && s.queued === 0)
    return { icon: "🔴", label: "Queue stuck", color: "text-red-600" };
  if (s.bounced / Math.max(contacted, 1) > 0.04)
    return { icon: "🟠", label: "High bounce", color: "text-orange-600" };
  if (s.last_email_sent && daysSince(s.last_email_sent) >= 2 && s.queued === 0)
    return { icon: "🟡", label: "Silent 2d+", color: "text-yellow-600" };
  return { icon: "✅", label: "Healthy", color: "text-green-700" };
}

// ── Section header ────────────────────────────────────────────────────────────

function SectionHeader({ title, count, color }: { title: string; count: number; color: string }) {
  return (
    <div className={`flex items-center gap-3 rounded-xl border-2 border-neutral-900 px-4 py-3 ${color} shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]`}>
      <span className="font-['Clash_Display'] text-lg font-medium text-neutral-950">{title}</span>
      <span className="ml-auto rounded-full border border-neutral-900 bg-white px-2.5 py-0.5 font-['Satoshi'] text-sm font-bold text-neutral-900">
        {count}
      </span>
    </div>
  );
}

// ── Funnel dot strip ──────────────────────────────────────────────────────────

const STAGE_DOTS: { key: keyof StageTimes; short: string }[] = [
  { key: "resume_uploaded",      short: "Resume" },
  { key: "quiz_completed",       short: "Quiz" },
  { key: "leads_generated",      short: "Leads" },
  { key: "gmail_connected",      short: "Gmail" },
  { key: "email_style_selected", short: "Style" },
  { key: "campaign_launched",    short: "Launch" },
  { key: "campaign_paused",      short: "Pause" },
  { key: "campaign_completed",   short: "Done" },
];

function FunnelDots({ ts, gmailConnected, funnelStatus }: {
  ts: StageTimes;
  gmailConnected: boolean;
  funnelStatus: string;
}) {
  const campaignCompleted  = !!ts.campaign_completed;
  // Pause dot only fills amber when campaign is CURRENTLY paused or cancelled.
  // If it was paused historically but resumed (funnel_status=running), show hollow —
  // the amber would wrongly imply the campaign is still paused.
  const currentlyPaused = funnelStatus === "paused" || funnelStatus === "cancelled";
  return (
    <div className="flex items-center gap-2">
      {STAGE_DOTS.map(({ key, short }) => {
        const reached =
          key === "gmail_connected"
            ? (gmailConnected === true || !!ts[key])
            : key === "campaign_paused"
            ? !!ts[key] && !campaignCompleted && currentlyPaused
            : !!ts[key];
        const isPause = key === "campaign_paused";
        const isDone  = key === "campaign_completed";
        const dotFill = reached
          ? isDone  ? "bg-emerald-500 border-emerald-700"
          : isPause ? "bg-amber-500 border-amber-700"
          : "bg-violet-500 border-violet-700"
          : "bg-white border-neutral-300";
        const dateLabel = ts[key] ? fmt(ts[key]) : reached ? "connected" : "—";
        return (
          <div key={key} className="flex flex-col items-center gap-0.5" title={`${short}: ${dateLabel}`}>
            <span className={`inline-block h-2.5 w-2.5 rounded-full border ${dotFill}`} />
            <span className={`font-['Satoshi'] text-[9px] leading-none ${reached ? "text-neutral-500" : "text-neutral-300"}`}>
              {short}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Email stat pill ───────────────────────────────────────────────────────────

function StatPill({ value, label, color }: { value: number | string; label: string; color: string }) {
  return (
    <div className={`flex flex-col items-center rounded-lg border border-neutral-200 px-3 py-1.5 ${color}`}>
      <span className="font-['Clash_Display'] text-base font-bold text-neutral-900">{value}</span>
      <span className="font-['Satoshi'] text-[10px] uppercase tracking-wide text-neutral-500">{label}</span>
    </div>
  );
}

// ── User row (shared across tables) ──────────────────────────────────────────

function UserRow({
  u,
  showCampaign = false,
  showHealth   = false,
  showDays     = false,
  onSelect,
}: {
  u: PaidUser;
  showCampaign?: boolean;
  showHealth?: boolean;
  showDays?: boolean;
  onSelect: (u: PaidUser) => void;
}) {
  const signal = healthSignal(u);
  const c = u.campaign;

  return (
    <motion.tr
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={() => onSelect(u)}
      className="cursor-pointer border-b border-neutral-100 transition-colors hover:bg-violet-50"
    >
      {/* User */}
      <td className="px-4 py-3">
        <div className="font-['Satoshi'] text-sm font-semibold text-neutral-900">{u.name || "—"}</div>
        <div className="font-['Satoshi'] text-xs text-neutral-500">{u.email}</div>
      </td>

      {/* Amount */}
      <td className="px-4 py-3 font-['Satoshi'] text-sm font-semibold text-neutral-900">
        {fmtMoney(u.total_paid_cents, u.currency)}
      </td>

      {/* Funnel dots */}
      <td className="px-4 py-3">
        <FunnelDots ts={u.stage_timestamps} gmailConnected={u.gmail_connected} funnelStatus={u.funnel_status} />
      </td>

      {/* Paid on */}
      <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-600">
        {fmt(u.paid_at)}
      </td>

      {/* Days since paid (dropout tables) */}
      {showDays && (
        <td className="px-4 py-3 font-['Satoshi'] text-sm text-red-600 font-semibold">
          {daysSince(u.paid_at)}d
        </td>
      )}

      {/* Campaign status */}
      {showCampaign && (
        <td className="px-4 py-3">
          {c ? (
            <span className={`inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium capitalize ${CAMPAIGN_BADGE[c.status] ?? CAMPAIGN_BADGE.draft}`}>
              {c.status}
            </span>
          ) : <span className="font-['Satoshi'] text-xs text-neutral-400">—</span>}
        </td>
      )}

      {/* Email stats */}
      {showCampaign && c && (
        <td className="px-4 py-3">
          <div className="flex items-center gap-1.5">
            <StatPill value={c.stats.leads_contacted} label="Reached" color="bg-green-50" />
            <StatPill value={c.stats.leads_contacted + (c.stats.followups_sent || 0)} label="Sent" color="bg-blue-50" />
            <StatPill value={c.stats.replied}         label="Reply"  color="bg-emerald-50" />
            <StatPill value={c.stats.failed}          label="Failed" color="bg-red-50" />
            <StatPill value={`${c.stats.reply_rate}%`} label="Rate"  color="bg-violet-50" />
          </div>
        </td>
      )}
      {showCampaign && !c && (
        <td className="px-4 py-3 font-['Satoshi'] text-xs text-neutral-400">—</td>
      )}

      {/* Health */}
      {showHealth && (
        <td className={`px-4 py-3 font-['Satoshi'] text-sm font-medium ${signal.color}`}>
          {signal.icon} {signal.label}
        </td>
      )}

      {/* Last email */}
      {showCampaign && c && (
        <td className="px-4 py-3 font-['Satoshi'] text-xs text-neutral-500">
          {ago(c.stats.last_email_sent)}
        </td>
      )}
      {showCampaign && !c && <td className="px-4 py-3" />}
    </motion.tr>
  );
}

// ── Table wrapper ─────────────────────────────────────────────────────────────

function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b-2 border-neutral-900 bg-neutral-50">
            {headers.map((h) => (
              <th key={h} className="px-4 py-3 text-left font-['Satoshi'] text-xs font-bold uppercase tracking-wider text-neutral-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

// ── Detail Modal ──────────────────────────────────────────────────────────────

function DetailModal({ user, onClose }: { user: PaidUser | null; onClose: () => void }) {
  if (!user) return null;
  const c  = user.campaign;
  const p  = user.profile;
  const lq = user.lead_quality;

  return (
    <AnimatePresence>
      {user && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[6px_6px_0px_0px_rgba(25,26,35,1)]"
          >
            {/* Header */}
            <div className="mb-5 flex items-start justify-between">
              <div>
                <h2 className="font-['Clash_Display'] text-2xl font-medium text-neutral-950">
                  {user.name || user.email}
                </h2>
                <p className="mt-0.5 font-['Satoshi'] text-sm text-neutral-500">{user.email}</p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="font-['Satoshi'] text-sm font-semibold text-violet-600">
                    {fmtMoney(user.total_paid_cents, user.currency)}
                  </span>
                  <span className="font-['Satoshi'] text-sm text-neutral-400">·</span>
                  <span className="font-['Satoshi'] text-sm text-neutral-500">Paid {fmt(user.paid_at)}</span>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-5">

              {/* Funnel journey */}
              <ModalSection title="Funnel Journey">
                <div className="flex flex-wrap gap-2">
                  {STAGE_DOTS.map(({ key, short }) => {
                    const modalCompleted   = !!user.stage_timestamps.campaign_completed;
                    const modalCurPaused   = user.funnel_status === "paused" || user.funnel_status === "cancelled";
                    const reached = key === "gmail_connected"
                      ? (user.gmail_connected === true || !!user.stage_timestamps[key])
                      : key === "campaign_paused"
                      ? !!user.stage_timestamps[key] && !modalCompleted && modalCurPaused
                      : !!user.stage_timestamps[key];
                    const ts = user.stage_timestamps[key];
                    const isPause = key === "campaign_paused";
                    const isDone  = key === "campaign_completed";
                    const dotColor = reached
                      ? isDone  ? "bg-emerald-500"
                      : isPause ? "bg-amber-500"
                      : "bg-violet-500"
                      : "bg-neutral-300";
                    const borderColor = reached
                      ? isDone  ? "border-emerald-300 bg-emerald-50"
                      : isPause ? "border-amber-300 bg-amber-50"
                      : "border-violet-300 bg-violet-50"
                      : "border-neutral-200 bg-neutral-50 opacity-40";
                    return (
                      <div key={key} className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 ${borderColor}`}>
                        <span className={`h-2 w-2 rounded-full ${dotColor}`} />
                        <span className="font-['Satoshi'] text-xs font-medium text-neutral-700">{short}</span>
                        {ts && <span className="font-['Satoshi'] text-[10px] text-neutral-400">{fmt(ts)}</span>}
                        {!ts && reached && <span className="font-['Satoshi'] text-[10px] text-neutral-400">connected</span>}
                      </div>
                    );
                  })}
                </div>
              </ModalSection>

              {/* Campaign */}
              {c && (
                <ModalSection title={`Campaign — ${c.name}`}>
                  <div className="mb-3 flex items-center gap-2">
                    <span className={`rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium capitalize ${CAMPAIGN_BADGE[c.status] ?? CAMPAIGN_BADGE.draft}`}>
                      {c.status}
                    </span>
                    <span className="font-['Satoshi'] text-xs text-neutral-500">Daily limit: {c.daily_limit}</span>
                    {c.started_at && <span className="font-['Satoshi'] text-xs text-neutral-500">Started {fmt(c.started_at)}</span>}
                  </div>
                  <div className="grid grid-cols-7 gap-2">
                    <StatPill value={c.stats.leads_contacted} label="Reached" color="bg-green-50" />
                    <StatPill value={c.stats.leads_contacted + (c.stats.followups_sent || 0)} label="Sent" color="bg-blue-50" />
                    <StatPill value={c.stats.replied}         label="Replied" color="bg-emerald-50" />
                    <StatPill value={c.stats.bounced}         label="Bounced" color="bg-red-50" />
                    <StatPill value={c.stats.failed}          label="Failed"  color="bg-orange-50" />
                    <StatPill value={c.stats.queued}          label="Queued"  color="bg-neutral-50" />
                    <StatPill value={`${c.stats.reply_rate}%`} label="Rate"   color="bg-violet-50" />
                  </div>
                  <p className="mt-2 font-['Satoshi'] text-xs text-neutral-500">
                    <strong>Reached</strong> = unique people we sent an initial email to. <strong>Sent</strong> = total emails (incl. follow-ups). The campaign detail view shows individual email rows, so its count will match <strong>Sent</strong> plus anything still queued/cancelled.
                  </p>
                  {(c.stats.followups_sent > 0) && (
                    <p className="mt-1 font-['Satoshi'] text-xs text-neutral-500">
                      Follow-ups: <strong>{c.stats.followups_sent}</strong> sent
                      {c.stats.followups_replied > 0 && <>, <strong>{c.stats.followups_replied}</strong> replied</>}
                    </p>
                  )}
                  {c.stats.last_email_sent && (
                    <p className="mt-1 font-['Satoshi'] text-xs text-neutral-500">
                      Last email: {ago(c.stats.last_email_sent)} ({fmt(c.stats.last_email_sent)})
                    </p>
                  )}
                  {c.status === "running" && (() => {
                    const sig = healthSignal(user);
                    return sig.label !== "Healthy" ? (
                      <p className={`mt-2 font-['Satoshi'] text-sm font-semibold ${sig.color}`}>
                        {sig.icon} {sig.label}
                      </p>
                    ) : null;
                  })()}
                  <a
                    href={`/outreach-campaign?campaign_id=${c.id}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-3 inline-block rounded-lg border-2 border-violet-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    View All Emails →
                  </a>
                </ModalSection>
              )}

              {/* Student profile */}
              {p && (
                <ModalSection title="Student Profile">
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {p.target_roles.length > 0 && (
                      <div>
                        <p className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Target Roles</p>
                        <div className="flex flex-wrap gap-1">
                          {p.target_roles.map((r) => (
                            <span key={r} className="rounded-full border border-violet-300 bg-violet-50 px-2 py-0.5 font-['Satoshi'] text-xs text-violet-800">{r}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.target_industries.length > 0 && (
                      <div>
                        <p className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Target Industries</p>
                        <div className="flex flex-wrap gap-1">
                          {p.target_industries.map((i) => (
                            <span key={i} className="rounded-full border border-blue-300 bg-blue-50 px-2 py-0.5 font-['Satoshi'] text-xs text-blue-800">{i}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.dream_companies.length > 0 && (
                      <div className="md:col-span-2">
                        <p className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Dream Companies</p>
                        <div className="flex flex-wrap gap-1">
                          {p.dream_companies.slice(0, 10).map((co) => (
                            <span key={co} className="rounded-full border border-emerald-300 bg-emerald-50 px-2 py-0.5 font-['Satoshi'] text-xs text-emerald-800">{co}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.resume_profile?.top_skills?.length > 0 && (
                      <div className="md:col-span-2">
                        <p className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Top Skills (from Resume)</p>
                        <div className="flex flex-wrap gap-1">
                          {p.resume_profile.top_skills.map((s: string) => (
                            <span key={s} className="rounded-full border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-['Satoshi'] text-xs text-neutral-700">{s}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.resume_profile?.education_level && (
                      <KV label="Education" value={p.resume_profile.education_level} />
                    )}
                    {p.resume_profile?.experience_years != null && (
                      <KV label="Experience" value={`${p.resume_profile.experience_years} yrs`} />
                    )}
                    {p.resume_profile?.geography?.city && (
                      <KV label="Location" value={`${p.resume_profile.geography.city}, ${p.resume_profile.geography.country}`} />
                    )}
                    {p.psychometric_profile?.traits?.length > 0 && (
                      <div className="md:col-span-2">
                        <p className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Psychometric Traits</p>
                        <div className="flex flex-wrap gap-1">
                          {p.psychometric_profile.traits.map((t: string) => (
                            <span key={t} className="rounded-full border border-fuchsia-300 bg-fuchsia-50 px-2 py-0.5 font-['Satoshi'] text-xs text-fuchsia-800">{t}</span>
                          ))}
                        </div>
                      </div>
                    )}
                    {p.flex_notes?.best_project && (
                      <div className="md:col-span-2">
                        <p className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Best Project</p>
                        <p className="font-['Satoshi'] text-sm text-neutral-700">{p.flex_notes.best_project}</p>
                      </div>
                    )}
                    {p.flex_notes?.outcome && (
                      <div className="md:col-span-2">
                        <p className="mb-1 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Desired Outcome</p>
                        <p className="font-['Satoshi'] text-sm text-neutral-700">{p.flex_notes.outcome}</p>
                      </div>
                    )}
                  </div>
                </ModalSection>
              )}

              {/* Lead quality */}
              {lq && lq.total > 0 && (
                <ModalSection title="Lead Quality">
                  <div className="mb-3 grid grid-cols-4 gap-2">
                    <StatPill value={lq.total}           label="Total Leads"  color="bg-neutral-50" />
                    <StatPill value={lq.with_email}      label="Has Email"    color="bg-blue-50" />
                    <StatPill value={lq.email_verified}  label="Verified"     color="bg-green-50" />
                    <StatPill value={lq.avg_score != null ? lq.avg_score : "—"} label="Avg Score" color="bg-violet-50" />
                  </div>
                  <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                    {lq.top_industries.length > 0 && (
                      <div>
                        <p className="mb-2 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Top Industries</p>
                        {lq.top_industries.map((row) => (
                          <div key={row.label} className="mb-1 flex items-center justify-between">
                            <span className="font-['Satoshi'] text-xs text-neutral-700 truncate max-w-[160px]">{row.label}</span>
                            <span className="font-['Satoshi'] text-xs font-semibold text-neutral-900">{row.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {lq.top_titles.length > 0 && (
                      <div>
                        <p className="mb-2 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-400">Top Titles Targeted</p>
                        {lq.top_titles.map((row) => (
                          <div key={row.label} className="mb-1 flex items-center justify-between">
                            <span className="font-['Satoshi'] text-xs text-neutral-700 truncate max-w-[160px]">{row.label}</span>
                            <span className="font-['Satoshi'] text-xs font-semibold text-neutral-900">{row.count}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="mt-2 flex gap-4">
                    <span className="font-['Satoshi'] text-xs text-neutral-500">Email rate: <strong>{lq.email_rate}%</strong></span>
                    <span className="font-['Satoshi'] text-xs text-neutral-500">Verified rate: <strong>{lq.verified_rate}%</strong></span>
                  </div>
                </ModalSection>
              )}

            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ModalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-neutral-200 p-4">
      <p className="mb-3 font-['Clash_Display'] text-sm font-medium uppercase tracking-widest text-neutral-400">{title}</p>
      {children}
    </div>
  );
}

function KV({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-['Satoshi'] text-xs text-neutral-400">{label}</p>
      <p className="font-['Satoshi'] text-sm font-medium text-neutral-800">{value}</p>
    </div>
  );
}

// ── Breaking campaign detail row ─────────────────────────────────────────────

function BreakingDetail({ u, onSelect }: { u: PaidUser; onSelect: (u: PaidUser) => void }) {
  const c  = u.campaign!;
  const s  = c.stats;
  const fb = s.failure_breakdown;
  const sig = healthSignal(u);

  // Derive specific issues to highlight
  const issues: { color: string; label: string; detail: string }[] = [];

  if (fb?.auth > 0) {
    issues.push({
      color: "bg-red-100 border-red-400 text-red-800",
      label: "🔑 Gmail Auth Expired",
      detail: `${fb.auth} emails failed — OAuth token invalid. User must reconnect Gmail.`,
    });
  }
  if (fb?.enrichment > 0) {
    issues.push({
      color: "bg-orange-100 border-orange-400 text-orange-800",
      label: "📧 Enrichment Failures",
      detail: `${fb.enrichment} leads had no email found after 3 attempts. Lead quality issue.`,
    });
  }
  if (fb?.bad_email > 0) {
    issues.push({
      color: "bg-yellow-100 border-yellow-400 text-yellow-800",
      label: "❌ Bad Email Addresses",
      detail: `${fb.bad_email} bounced as non-existent / inactive. Verify lead targeting.`,
    });
  }
  if (s.bounced > 0 && s.leads_contacted > 0 && s.bounced / s.leads_contacted > 0.04) {
    issues.push({
      color: "bg-orange-100 border-orange-400 text-orange-800",
      label: "📉 High Bounce Rate",
      detail: `${s.bounced} bounces on ${s.leads_contacted} sent = ${Math.round(s.bounced/s.leads_contacted*100)}%. Risk of domain reputation damage.`,
    });
  }
  if (s.leads_contacted > 50 && s.replied === 0) {
    issues.push({
      color: "bg-red-100 border-red-400 text-red-800",
      label: "🔇 Zero Replies",
      detail: `${s.leads_contacted} leads contacted, 0 responses. Emails may be going to spam or targeting is off.`,
    });
  }
  if (s.leads_contacted === 0 && s.queued === 0) {
    issues.push({
      color: "bg-red-100 border-red-400 text-red-800",
      label: "🛑 Worker Stuck",
      detail: "Nothing sent and nothing queued. Campaign is running but the worker isn't processing it.",
    });
  }
  if (s.last_email_sent && daysSince(s.last_email_sent) >= 2 && s.queued === 0) {
    issues.push({
      color: "bg-yellow-100 border-yellow-400 text-yellow-800",
      label: "⏸ Gone Silent",
      detail: `Last email ${daysSince(s.last_email_sent)}d ago, nothing queued. May have exhausted leads or daily limit hit.`,
    });
  }
  if (fb?.other > 20) {
    issues.push({
      color: "bg-neutral-100 border-neutral-400 text-neutral-700",
      label: "⚠️ Other Failures",
      detail: `${fb.other} unclassified failures. Check campaign email logs for details.`,
    });
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl border-2 border-red-200 bg-white shadow-[3px_3px_0px_0px_rgba(239,68,68,0.3)] overflow-hidden"
    >
      {/* Header row */}
      <div
        className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer hover:bg-red-50 transition-colors"
        onClick={() => onSelect(u)}
      >
        <div className="flex items-center gap-4 flex-wrap">
          <div>
            <p className="font-['Satoshi'] text-sm font-bold text-neutral-900">{u.name}</p>
            <p className="font-['Satoshi'] text-xs text-neutral-500">{u.email}</p>
          </div>
          <FunnelDots ts={u.stage_timestamps} gmailConnected={u.gmail_connected} funnelStatus={u.funnel_status} />
        </div>
        <div className="flex items-center gap-3 shrink-0 flex-wrap">
          {/* Quick stats */}
          <StatPill value={s.leads_contacted} label="Leads"  color="bg-green-50" />
          <StatPill value={s.replied}         label="Reply"  color="bg-emerald-50" />
          <StatPill value={s.failed}          label="Failed" color="bg-red-50" />
          <StatPill value={s.bounced}         label="Bounce" color="bg-orange-50" />
          <StatPill value={`${s.reply_rate}%`} label="Rate"  color="bg-violet-50" />
          <span className={`font-['Satoshi'] text-xs font-semibold ${sig.color}`}>{sig.icon} {sig.label}</span>
        </div>
      </div>

      {/* Issue cards */}
      <div className="border-t border-red-100 px-5 py-4 bg-red-50">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {issues.map((issue) => (
            <div key={issue.label} className={`rounded-xl border-2 px-4 py-3 ${issue.color}`}>
              <p className="font-['Satoshi'] text-sm font-bold">{issue.label}</p>
              <p className="mt-0.5 font-['Satoshi'] text-xs leading-relaxed opacity-80">{issue.detail}</p>
            </div>
          ))}
        </div>
        {/* Gmail account + token expiry */}
        {c.gmail_account && (
          <div className="mt-3 flex flex-wrap items-center gap-4 font-['Satoshi'] text-xs text-neutral-500">
            <span>Gmail: <strong className="text-neutral-800">{c.gmail_account}</strong></span>
            {c.token_expiry && (
              <span>Token expires: <strong className={
                new Date(c.token_expiry) < new Date() ? "text-red-600" : "text-neutral-800"
              }>{fmt(c.token_expiry)}</strong></span>
            )}
            {s.last_email_sent && (
              <span>Last email: <strong className="text-neutral-800">{ago(s.last_email_sent)}</strong></span>
            )}
          </div>
        )}
        {/* Sample errors */}
        {s.sample_errors && s.sample_errors.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer font-['Satoshi'] text-xs font-semibold text-neutral-500 hover:text-neutral-800">
              View error samples ({s.sample_errors.length})
            </summary>
            <div className="mt-2 space-y-1">
              {s.sample_errors.map((err, i) => (
                <p key={i} className="font-mono text-[10px] text-neutral-600 bg-white rounded border border-neutral-200 px-2 py-1 break-all">
                  {err.slice(0, 200)}{err.length > 200 ? "…" : ""}
                </p>
              ))}
            </div>
          </details>
        )}
        <a
          href={`/outreach-campaign?campaign_id=${c.id}`}
          target="_blank"
          rel="noreferrer"
          onClick={e => e.stopPropagation()}
          className="mt-3 inline-block rounded-lg border-2 border-red-700 bg-red-600 px-4 py-2 font-['Satoshi'] text-xs font-semibold text-white shadow-[2px_2px_0px_0px_rgba(153,27,27,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
        >
          View All Emails →
        </a>
      </div>
    </motion.div>
  );
}

// ── Funnel progress bar ───────────────────────────────────────────────────────
// All counts use funnel_status (derived from campaign rows) or gmail_connected
// (derived from email_accounts), both back-filled from system records so they
// are accurate regardless of which outreach_orders columns were missing.

function FunnelBar({ users }: { users: PaidUser[] }) {
  const total = users.length;
  if (total === 0) return null;

  const stages = [
    {
      label: "Paid",
      count: total,
      color: "bg-neutral-500",
      note: "every real paid user",
    },
    {
      label: "Started onboarding",
      count: users.filter(u => !!u.stage_timestamps.resume_uploaded).length,
      color: "bg-blue-400",
      note: "uploaded resume and entered the funnel",
    },
    {
      label: "Gmail connected",
      // OR both sources: the bool field AND the back-filled timestamp
      count: users.filter(u => u.gmail_connected === true || !!u.stage_timestamps.gmail_connected).length,
      color: "bg-violet-500",
      note: "connected Gmail",
    },
    {
      label: "Campaign launched",
      count: users.filter(u => !!u.stage_timestamps.campaign_launched).length,
      color: "bg-amber-400",
      note: "launched at least one campaign",
    },
    {
      label: "Running now",
      count: users.filter(u => u.funnel_status === "running").length,
      color: "bg-green-500",
      note: "campaign actively running",
    },
    {
      label: "Completed",
      count: users.filter(u => u.funnel_status === "completed").length,
      color: "bg-emerald-600",
      note: "campaign finished",
    },
  ];

  return (
    <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
      <p className="mb-5 font-['Clash_Display'] text-xl font-medium text-neutral-950">
        Funnel — {total} paid users
      </p>
      <div className="space-y-3">
        {stages.map((s) => (
          <div key={s.label} className="flex items-center gap-4" title={s.note}>
            <span className="w-36 shrink-0 font-['Satoshi'] text-xs text-neutral-500">{s.label}</span>
            <div className="flex-1 overflow-hidden rounded-full bg-neutral-100 h-4">
              <div
                className={`h-4 rounded-full ${s.color} transition-all duration-500`}
                style={{ width: `${(s.count / total) * 100}%` }}
              />
            </div>
            <span className="w-8 shrink-0 text-right font-['Satoshi'] text-sm font-bold text-neutral-900">
              {s.count}
            </span>
            <span className="w-10 shrink-0 text-right font-['Satoshi'] text-xs text-neutral-400">
              {Math.round((s.count / total) * 100)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAID_FUNNEL_VERSION = "v4"; // bump to bust browser cache

async function fetchPaidFunnel(): Promise<PaidUser[]> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`/api/outreach?type=paid_funnel&_v=${PAID_FUNNEL_VERSION}&_t=${Date.now()}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.users ?? [];
}

const AUTO_REFRESH_MS = 60_000; // refresh every 60 seconds

export default function CampaignHealth() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [users, setUsers]           = useState<PaidUser[]>([]);
  const [loading, setLoading]       = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selected, setSelected]     = useState<PaidUser | null>(null);

  const load = useCallback(async (silent = false) => {
    try {
      if (silent) setRefreshing(true);
      else setLoading(true);
      const fresh = await fetchPaidFunnel();
      // Verify data integrity — log first user's stage_timestamps for debugging
      if (fresh.length > 0) {
        const sample = fresh.find(u => u.email === "stayal@usc.edu") ?? fresh[0];
        console.log("[CampaignHealth] sample user:", sample.email,
          "| gmail_connected:", sample.gmail_connected,
          "| resume_ts:", sample.stage_timestamps.resume_uploaded,
          "| total users:", fresh.length);
      }
      setUsers(fresh);
      setLastUpdated(new Date());
    } catch (err: any) {
      toast.error(err.message || "Failed to load campaign health data");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Initial load
  useEffect(() => { if (isAuthorized) load(); }, [isAuthorized, load]);

  // Auto-refresh every 60s — silently updates data without showing spinner
  useEffect(() => {
    if (!isAuthorized) return;
    const interval = setInterval(() => load(true), AUTO_REFRESH_MS);
    return () => clearInterval(interval);
  }, [isAuthorized, load]);

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
      </div>
    );
  }
  if (!isAuthorized) return null;

  // ── Segment users into mutually exclusive funnel buckets ──────────────────
  const allRunning = users.filter(u => u.funnel_status === "running");
  const breaking   = allRunning.filter(u => {
    const sig = healthSignal(u);
    return sig.label !== "Healthy" && sig.label !== "N/A";
  });
  // Healthy running = running but NOT in breaking (no overlap)
  const breakingIds = new Set(breaking.map(u => u.user_id));
  const running   = allRunning.filter(u => !breakingIds.has(u.user_id));
  const paused    = users.filter(u => u.funnel_status === "paused" || u.funnel_status === "cancelled");
  const completed = users.filter(u => u.funnel_status === "completed");
  const isGmailConnected = (u: PaidUser) => u.gmail_connected === true || !!u.stage_timestamps.gmail_connected;
  const noGmail   = users.filter(u => !isGmailConnected(u));
  const noLaunch  = users.filter(u => isGmailConnected(u) && !u.stage_timestamps.campaign_launched && u.funnel_status === "gmail_connected");

  const RUNNING_HEADERS   = ["User", "Paid", "Journey", "Since", "Campaign", "Email Stats", "Health", "Last Email"];
  const PAUSED_HEADERS    = ["User", "Paid", "Journey", "Since", "Campaign", "Email Stats", "Last Email"];
  const COMPLETED_HEADERS = ["User", "Paid", "Journey", "Since", "Campaign", "Email Stats", "Last Email"];
  const DROPOUT_HEADERS   = ["User", "Paid", "Journey", "Paid On", "Days"];
  const BREAKING_HEADERS  = ["User", "Paid", "Journey", "Since", "Campaign", "Email Stats", "Health", "Last Email"];

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">

        {/* Page title */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
                Campaign Health
              </h1>
              <p className="mt-2 font-['Satoshi'] text-base text-gray-600">
                End-to-end funnel for every real paid user — click any row for full profile + lead quality drill-down.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {lastUpdated && (
                <span className="font-['Satoshi'] text-xs text-neutral-400">
                  Updated {ago(lastUpdated.toISOString())}
                  {refreshing && <span className="ml-1 text-violet-500">↻</span>}
                </span>
              )}
              <button
                onClick={() => load(false)}
                disabled={loading}
                className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-40"
              >
                Refresh
              </button>
            </div>
          </div>

          {/* Dot colour key — minimal, one line */}
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1 font-['Satoshi'] text-xs text-neutral-400">
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-violet-500 border border-violet-700" /> Reached</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-amber-500 border border-amber-700" /> Paused</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-emerald-500 border border-emerald-700" /> Completed</span>
            <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-2 rounded-full bg-white border border-neutral-300" /> Not reached</span>
          </div>
        </motion.div>

        {loading ? (
          <div className="flex items-center justify-center py-32">
            <div className="h-10 w-10 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
          </div>
        ) : (
          <div className="mt-10 space-y-10">

            {/* Funnel bar */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.05 }}>
              <FunnelBar users={users} />
            </motion.div>

            {/* ── Section 1: Breaking campaigns — detailed view ── */}
            {breaking.length > 0 && (
              <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.1 }} className="space-y-3">
                <SectionHeader title="🔴 Breaking Campaigns — Needs Action" count={breaking.length} color="bg-red-50" />
                <div className="space-y-4">
                  {breaking.map(u => (
                    <BreakingDetail key={u.user_id} u={u} onSelect={setSelected} />
                  ))}
                </div>
              </motion.div>
            )}

            {/* ── Section 2: Healthy running campaigns (Breaking excluded) ── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.15 }} className="space-y-3">
              <SectionHeader title="✅ Running — Healthy" count={running.length} color="bg-green-50" />
              {running.length === 0 ? (
                <p className="font-['Satoshi'] text-sm text-neutral-400">No running campaigns.</p>
              ) : (
                <Table headers={RUNNING_HEADERS}>
                  {running.map(u => (
                    <UserRow key={u.user_id} u={u} showCampaign showHealth onSelect={setSelected} />
                  ))}
                </Table>
              )}
            </motion.div>

            {/* ── Section 3: Paused / cancelled ── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.2 }} className="space-y-3">
              <SectionHeader title="⏸ Paused / Cancelled" count={paused.length} color="bg-amber-50" />
              {paused.length === 0 ? (
                <p className="font-['Satoshi'] text-sm text-neutral-400">None.</p>
              ) : (
                <Table headers={PAUSED_HEADERS}>
                  {paused.map(u => (
                    <UserRow key={u.user_id} u={u} showCampaign onSelect={setSelected} />
                  ))}
                </Table>
              )}
            </motion.div>

            {/* ── Section 4: Completed ── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.25 }} className="space-y-3">
              <SectionHeader title="🏁 Completed Campaigns" count={completed.length} color="bg-emerald-50" />
              {completed.length === 0 ? (
                <p className="font-['Satoshi'] text-sm text-neutral-400">None yet.</p>
              ) : (
                <Table headers={COMPLETED_HEADERS}>
                  {completed.map(u => (
                    <UserRow key={u.user_id} u={u} showCampaign onSelect={setSelected} />
                  ))}
                </Table>
              )}
            </motion.div>

            {/* ── Section 5: Gmail connected but never launched ── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.3 }} className="space-y-3">
              <SectionHeader title="📧 Connected Gmail — Never Launched" count={noLaunch.length} color="bg-blue-50" />
              {noLaunch.length === 0 ? (
                <p className="font-['Satoshi'] text-sm text-neutral-400">None — great!</p>
              ) : (
                <Table headers={DROPOUT_HEADERS}>
                  {noLaunch.map(u => (
                    <UserRow key={u.user_id} u={u} showDays onSelect={setSelected} />
                  ))}
                </Table>
              )}
            </motion.div>

            {/* ── Section 6: Never connected Gmail ── */}
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, delay: 0.35 }} className="space-y-3">
              <SectionHeader title="🚫 Never Connected Gmail" count={noGmail.length} color="bg-red-50" />
              {noGmail.length === 0 ? (
                <p className="font-['Satoshi'] text-sm text-neutral-400">None — great!</p>
              ) : (
                <Table headers={DROPOUT_HEADERS}>
                  {noGmail.map(u => (
                    <UserRow key={u.user_id} u={u} showDays onSelect={setSelected} />
                  ))}
                </Table>
              )}
            </motion.div>

          </div>
        )}
      </main>

      <DetailModal user={selected} onClose={() => setSelected(null)} />
    </>
  );
}
