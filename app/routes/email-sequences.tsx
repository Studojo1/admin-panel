import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import {
  listScheduledEmails,
  cancelScheduledEmail,
  triggerEmail,
  bulkSendPreview,
  bulkSend,
  listUsers,
  type ScheduledEmail,
  type AdminUser,
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
  // System
  welcome: "Welcome",
  "forgot-password": "Forgot password",
  "resume-optimized": "Resume optimized",
  "internship-applied": "Internship applied",
  "password-changed": "Password changed",
  // Legacy nurture
  nurture_day3: "Day 3 — Applying the wrong way",
  nurture_day7: "Day 7 — Still looking?",
  nurture_day14: "Day 14 — Social proof",
  nurture_day30: "Day 30 — Personal check-in",
  // Funnel — Email 01 Welcome
  "event.funnel.welcome_new": "01A — Welcome (new user)",
  "event.funnel.welcome_existing": "01B — Welcome (existing user)",
  // Funnel — Email 02 Follow-up
  "event.funnel.followup_v1": "02 V1 — Follow-up (Personal Nudge)",
  "event.funnel.followup_v2": "02 V2 — Follow-up (Curiosity Hook)",
  "event.funnel.followup_v3": "02 V3 — Follow-up (Blunt One)",
  // Funnel — Email 03 Segmentation
  "event.funnel.segmentation_v1": "03 V1 — Segmentation (Clean Direct)",
  "event.funnel.segmentation_v2": "03 V2 — Segmentation (Story Led)",
  // Funnel — Email 04 Exploration
  "event.funnel.exploration_v1": "04 V1 — Exploration (The Guide)",
  "event.funnel.exploration_v2": "04 V2 — Exploration (The Challenge)",
  // Funnel — Email 05–06
  "event.funnel.congratulations": "05 — Congratulations",
  "event.funnel.comparison": "06 — Comparison",
  // Funnel — Email 07 Pitching
  "event.funnel.pitching_v1": "07 V1 — Pitching (Stat Led)",
  "event.funnel.pitching_v2": "07 V2 — Pitching (Problem First)",
  "event.funnel.pitching_v3": "07 V3 — Pitching (Soft Sell)",
  // Funnel — Email 08 Honest Question
  "event.funnel.honest_question_v1": "08 V1 — Honest Question (Direct Ask)",
  "event.funnel.honest_question_v2": "08 V2 — Honest Question (Empathy)",
  "event.funnel.honest_question_v3": "08 V3 — Honest Question (Exit Ramp)",
  // Funnel — Email 09–10
  "event.funnel.onboarding": "09 — Onboarding (Paywall)",
  "event.funnel.recognition_v1": "10 V1 — Recognition (Strong Progress)",
  "event.funnel.recognition_v2": "10 V2 — Recognition (Encouraging Start)",
  "event.funnel.recognition_v3": "10 V3 — Recognition (Slow Progress / Anti-Churn)",
  "event.funnel.recognition_v4": "10 V4 — Recognition (Milestone Unlocked)",
  // Funnel — Emails 11–16
  "event.funnel.testimonial": "11 — Testimonial (Social Proof)",
  "event.funnel.pricing": "12 — Pricing (Post-Upgrade)",
  "event.funnel.case_study": "13 — Case Study (Re-engaged)",
  "event.funnel.walkthrough": "14 — Walkthrough (No Reply)",
  "event.funnel.educational": "15 — Educational (Not Converting)",
  "event.funnel.winback": "16 — Win-back (Final)",
};

const BULK_TYPE_LABELS: Record<string, string> = {
  // System
  welcome: "Welcome",
  // Legacy nurture
  nurture_day3: "Day 3 — Applying the wrong way",
  nurture_day7: "Day 7 — Still looking?",
  nurture_day14: "Day 14 — Social proof",
  nurture_day30: "Day 30 — Personal check-in",
  // Funnel
  "event.funnel.welcome_new": "01A — Welcome (new user)",
  "event.funnel.welcome_existing": "01B — Welcome (existing user)",
  "event.funnel.followup_v1": "02 V1 — Follow-up (Personal Nudge)",
  "event.funnel.followup_v2": "02 V2 — Follow-up (Curiosity Hook)",
  "event.funnel.followup_v3": "02 V3 — Follow-up (Blunt One)",
  "event.funnel.segmentation_v1": "03 V1 — Segmentation (Clean Direct)",
  "event.funnel.segmentation_v2": "03 V2 — Segmentation (Story Led)",
  "event.funnel.exploration_v1": "04 V1 — Exploration (The Guide)",
  "event.funnel.exploration_v2": "04 V2 — Exploration (The Challenge)",
  "event.funnel.congratulations": "05 — Congratulations",
  "event.funnel.comparison": "06 — Comparison",
  "event.funnel.pitching_v1": "07 V1 — Pitching (Stat Led)",
  "event.funnel.pitching_v2": "07 V2 — Pitching (Problem First)",
  "event.funnel.pitching_v3": "07 V3 — Pitching (Soft Sell)",
  "event.funnel.honest_question_v1": "08 V1 — Honest Question (Direct Ask)",
  "event.funnel.honest_question_v2": "08 V2 — Honest Question (Empathy)",
  "event.funnel.honest_question_v3": "08 V3 — Honest Question (Exit Ramp)",
  "event.funnel.onboarding": "09 — Onboarding (Paywall)",
  "event.funnel.recognition_v1": "10 V1 — Recognition (Strong Progress)",
  "event.funnel.recognition_v2": "10 V2 — Recognition (Encouraging Start)",
  "event.funnel.recognition_v3": "10 V3 — Recognition (Slow Progress / Anti-Churn)",
  "event.funnel.recognition_v4": "10 V4 — Recognition (Milestone Unlocked)",
  "event.funnel.testimonial": "11 — Testimonial (Social Proof)",
  "event.funnel.pricing": "12 — Pricing (Post-Upgrade)",
  "event.funnel.case_study": "13 — Case Study (Re-engaged)",
  "event.funnel.walkthrough": "14 — Walkthrough (No Reply)",
  "event.funnel.educational": "15 — Educational (Not Converting)",
  "event.funnel.winback": "16 — Win-back (Final)",
};

const DAYS_OPTIONS = [
  { label: "All users", value: 0 },
  { label: "Last 24 hours", value: 1 },
  { label: "Last 3 days", value: 3 },
  { label: "Last 7 days", value: 7 },
  { label: "Last 14 days", value: 14 },
  { label: "Last 30 days", value: 30 },
  { label: "Last 60 days", value: 60 },
  { label: "Last 90 days", value: 90 },
] as const;

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

  // Trigger form state
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [triggerRouting, setTriggerRouting] = useState("event.user.signup");
  const [triggerUserID, setTriggerUserID] = useState("");
  const [triggerEmail2, setTriggerEmail2] = useState("");
  const [triggerName, setTriggerName] = useState("");
  const [triggering, setTriggering] = useState(false);

  // User search state
  const [userQuery, setUserQuery] = useState("");
  const [userResults, setUserResults] = useState<AdminUser[]>([]);
  const [userSearching, setUserSearching] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const userSearchRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

  const handleUserSearch = (q: string) => {
    setUserQuery(q);
    setShowUserDropdown(true);
    if (userSearchRef.current) clearTimeout(userSearchRef.current);
    if (!q.trim()) { setUserResults([]); return; }
    userSearchRef.current = setTimeout(async () => {
      try {
        setUserSearching(true);
        const res = await listUsers(8, 0, q.trim());
        setUserResults(res.users);
      } catch { setUserResults([]); } finally { setUserSearching(false); }
    }, 300);
  };

  const selectUser = (u: AdminUser) => {
    setTriggerUserID(u.id);
    setTriggerEmail2(u.email);
    setTriggerName(u.name || u.full_name || "");
    setUserQuery(`${u.name || u.email} (${u.email})`);
    setShowUserDropdown(false);
    setUserResults([]);
  };

  const handleTrigger = async () => {
    if (!triggerUserID.trim()) {
      toast.error("User ID is required");
      return;
    }
    try {
      setTriggering(true);
      let event: Record<string, unknown> = { user_id: triggerUserID.trim() };
      if (triggerRouting === "event.user.signup") {
        if (!triggerEmail2.trim()) { toast.error("Email is required for signup event"); return; }
        event = { user_id: triggerUserID.trim(), email: triggerEmail2.trim(), name: triggerName.trim() || "User" };
      }
      await triggerEmail(triggerRouting, event);
      toast.success("Email triggered successfully");
      setTriggerOpen(false);
      setTriggerUserID(""); setTriggerEmail2(""); setTriggerName(""); setUserQuery("");
      setTimeout(load, 1500); // reload after short delay so new scheduled rows appear
    } catch (err: any) {
      toast.error(err.message || "Failed to trigger email");
    } finally {
      setTriggering(false);
    }
  };

  // Bulk send state
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkType, setBulkType] = useState("welcome");
  const [bulkDays, setBulkDays] = useState(0); // 0 = all
  const [bulkPreviewCount, setBulkPreviewCount] = useState<number | null>(null);
  const [bulkPreviewing, setBulkPreviewing] = useState(false);
  const [bulkSending, setBulkSending] = useState(false);

  const handleBulkPreview = async () => {
    try {
      setBulkPreviewing(true);
      const res = await bulkSendPreview(bulkDays);
      setBulkPreviewCount(res.count);
    } catch (err: any) {
      toast.error(err.message || "Failed to preview");
    } finally {
      setBulkPreviewing(false);
    }
  };

  const handleBulkSend = async () => {
    if (bulkPreviewCount === null || bulkPreviewCount === 0) {
      toast.error("No users to send to");
      return;
    }
    if (!confirm(`Send "${BULK_TYPE_LABELS[bulkType] || bulkType}" to ${bulkPreviewCount} user${bulkPreviewCount !== 1 ? "s" : ""}?`)) return;
    try {
      setBulkSending(true);
      const res = await bulkSend(bulkType, bulkDays);
      toast.success(res.message || `Sending to ${res.total} users`);
      setBulkOpen(false);
      setBulkPreviewCount(null);
      setTimeout(load, 2000);
    } catch (err: any) {
      toast.error(err.message || "Failed to send");
    } finally {
      setBulkSending(false);
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

          <div className="flex gap-2">
            <button
              onClick={() => { setTriggerOpen((v) => !v); setBulkOpen(false); }}
              className="rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            >
              + Trigger Email
            </button>
            <button
              onClick={() => { setBulkOpen((v) => !v); setTriggerOpen(false); setBulkPreviewCount(null); }}
              className="rounded-lg border-2 border-neutral-900 bg-amber-500 px-4 py-2 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            >
              Bulk Send
            </button>
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

        {/* Trigger email panel */}
        <AnimatePresence>
          {triggerOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mb-6 rounded-xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            >
              <h2 className="mb-4 font-['Satoshi'] text-lg font-bold text-neutral-900">
                Trigger Email
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                {/* Routing key */}
                <div>
                  <label className="mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600">
                    Email type
                  </label>
                  <select
                    value={triggerRouting}
                    onChange={(e) => setTriggerRouting(e.target.value)}
                    className="w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    <optgroup label="System">
                      <option value="event.user.signup">Welcome (signup)</option>
                      <option value="event.resume.optimized">Resume optimized</option>
                      <option value="event.internship.applied">Internship applied</option>
                    </optgroup>
                    <optgroup label="01 — Welcome">
                      <option value="event.funnel.welcome_new">01A — Welcome (new user)</option>
                      <option value="event.funnel.welcome_existing">01B — Welcome (existing user)</option>
                    </optgroup>
                    <optgroup label="02 — Follow-up">
                      <option value="event.funnel.followup_v1">02 V1 — Personal Nudge</option>
                      <option value="event.funnel.followup_v2">02 V2 — Curiosity Hook</option>
                      <option value="event.funnel.followup_v3">02 V3 — Blunt One</option>
                    </optgroup>
                    <optgroup label="03 — Segmentation">
                      <option value="event.funnel.segmentation_v1">03 V1 — Clean Direct</option>
                      <option value="event.funnel.segmentation_v2">03 V2 — Story Led</option>
                    </optgroup>
                    <optgroup label="04 — Exploration">
                      <option value="event.funnel.exploration_v1">04 V1 — The Guide</option>
                      <option value="event.funnel.exploration_v2">04 V2 — The Challenge</option>
                    </optgroup>
                    <optgroup label="05–06">
                      <option value="event.funnel.congratulations">05 — Congratulations</option>
                      <option value="event.funnel.comparison">06 — Comparison</option>
                    </optgroup>
                    <optgroup label="07 — Pitching">
                      <option value="event.funnel.pitching_v1">07 V1 — Stat Led</option>
                      <option value="event.funnel.pitching_v2">07 V2 — Problem First</option>
                      <option value="event.funnel.pitching_v3">07 V3 — Soft Sell</option>
                    </optgroup>
                    <optgroup label="08 — Honest Question">
                      <option value="event.funnel.honest_question_v1">08 V1 — Direct Ask</option>
                      <option value="event.funnel.honest_question_v2">08 V2 — Empathy</option>
                      <option value="event.funnel.honest_question_v3">08 V3 — Exit Ramp</option>
                    </optgroup>
                    <optgroup label="09–10">
                      <option value="event.funnel.onboarding">09 — Onboarding (Paywall)</option>
                      <option value="event.funnel.recognition_v1">10 V1 — Recognition (Strong Progress)</option>
                      <option value="event.funnel.recognition_v2">10 V2 — Recognition (Encouraging Start)</option>
                      <option value="event.funnel.recognition_v3">10 V3 — Recognition (Slow Progress)</option>
                      <option value="event.funnel.recognition_v4">10 V4 — Recognition (Milestone Unlocked)</option>
                    </optgroup>
                    <optgroup label="11–16 — New">
                      <option value="event.funnel.testimonial">11 — Testimonial (Social Proof)</option>
                      <option value="event.funnel.pricing">12 — Pricing (Post-Upgrade)</option>
                      <option value="event.funnel.case_study">13 — Case Study (Re-engaged)</option>
                      <option value="event.funnel.walkthrough">14 — Walkthrough (No Reply)</option>
                      <option value="event.funnel.educational">15 — Educational (Not Converting)</option>
                      <option value="event.funnel.winback">16 — Win-back (Final)</option>
                    </optgroup>
                  </select>
                </div>

                {/* User search */}
                <div className="relative sm:col-span-2" ref={dropdownRef}>
                  <label className="mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600">
                    Search user
                  </label>
                  <input
                    type="text"
                    placeholder="Type name or email…"
                    value={userQuery}
                    onChange={(e) => handleUserSearch(e.target.value)}
                    onFocus={() => userQuery && setShowUserDropdown(true)}
                    className="w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm placeholder:text-neutral-400 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
                  />
                  {/* Selected user pill */}
                  {triggerUserID && (
                    <div className="mt-1.5 flex items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-violet-200 bg-violet-50 px-2.5 py-0.5 font-['Satoshi'] text-xs text-violet-700">
                        <span className="h-1.5 w-1.5 rounded-full bg-violet-500" />
                        {triggerEmail2} · ID: {triggerUserID.slice(0, 8)}…
                      </span>
                      <button
                        onClick={() => { setTriggerUserID(""); setTriggerEmail2(""); setTriggerName(""); setUserQuery(""); }}
                        className="font-['Satoshi'] text-xs text-neutral-400 hover:text-red-500"
                      >
                        ✕
                      </button>
                    </div>
                  )}
                  {/* Dropdown */}
                  <AnimatePresence>
                    {showUserDropdown && (userResults.length > 0 || userSearching) && (
                      <motion.div
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.15 }}
                        className="absolute z-50 mt-1 w-full rounded-lg border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
                      >
                        {userSearching ? (
                          <div className="px-4 py-3 font-['Satoshi'] text-xs text-neutral-400">Searching…</div>
                        ) : (
                          userResults.map((u) => (
                            <button
                              key={u.id}
                              onMouseDown={() => selectUser(u)}
                              className="flex w-full items-center gap-3 px-4 py-2.5 text-left hover:bg-violet-50 first:rounded-t-lg last:rounded-b-lg"
                            >
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-100 font-['Satoshi'] text-xs font-bold text-violet-700">
                                {(u.name || u.email || "?")[0].toUpperCase()}
                              </div>
                              <div>
                                <div className="font-['Satoshi'] text-sm font-medium text-neutral-900">{u.name || u.full_name || "—"}</div>
                                <div className="font-['Satoshi'] text-xs text-neutral-400">{u.email}</div>
                              </div>
                            </button>
                          ))
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Email (only for signup) */}
                {triggerRouting === "event.user.signup" && (
                  <>
                    <div>
                      <label className="mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600">
                        Email address
                      </label>
                      <input
                        type="email"
                        placeholder="user@example.com"
                        value={triggerEmail2}
                        onChange={(e) => setTriggerEmail2(e.target.value)}
                        className="w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm placeholder:text-neutral-400 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600">
                        Name
                      </label>
                      <input
                        type="text"
                        placeholder="Jeremy"
                        value={triggerName}
                        onChange={(e) => setTriggerName(e.target.value)}
                        className="w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm placeholder:text-neutral-400 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
                      />
                    </div>
                  </>
                )}
              </div>

              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleTrigger}
                  disabled={triggering}
                  className="rounded-lg border-2 border-neutral-900 bg-violet-500 px-5 py-2 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
                >
                  {triggering ? "Sending…" : "Send now"}
                </button>
                <button
                  onClick={() => setTriggerOpen(false)}
                  className="rounded-lg border-2 border-neutral-900 bg-white px-5 py-2 font-['Satoshi'] text-sm font-medium text-neutral-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Bulk send panel */}
        <AnimatePresence>
          {bulkOpen && (
            <motion.div
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="mb-6 rounded-xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            >
              <h2 className="mb-4 font-['Satoshi'] text-lg font-bold text-neutral-900">
                Bulk Send Email
              </h2>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600">
                    Email type
                  </label>
                  <select
                    value={bulkType}
                    onChange={(e) => { setBulkType(e.target.value); setBulkPreviewCount(null); }}
                    className="w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    {Object.entries(BULK_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block font-['Satoshi'] text-xs font-semibold text-neutral-600">
                    Users signed up
                  </label>
                  <select
                    value={bulkDays}
                    onChange={(e) => { setBulkDays(Number(e.target.value)); setBulkPreviewCount(null); }}
                    className="w-full rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] focus:outline-none focus:ring-2 focus:ring-violet-400"
                  >
                    {DAYS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Preview count */}
              {bulkPreviewCount !== null && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="mt-4 rounded-lg border-2 border-amber-300 bg-amber-50 px-4 py-3"
                >
                  <p className="font-['Satoshi'] text-sm text-amber-900">
                    <span className="font-bold">{bulkPreviewCount}</span> user{bulkPreviewCount !== 1 ? "s" : ""} will receive{" "}
                    <span className="font-bold">{BULK_TYPE_LABELS[bulkType] || bulkType}</span>
                  </p>
                </motion.div>
              )}

              <div className="mt-4 flex gap-3">
                <button
                  onClick={handleBulkPreview}
                  disabled={bulkPreviewing}
                  className="rounded-lg border-2 border-neutral-900 bg-white px-5 py-2 font-['Satoshi'] text-sm font-medium text-neutral-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50 disabled:opacity-50"
                >
                  {bulkPreviewing ? "Counting..." : "Preview count"}
                </button>
                <button
                  onClick={handleBulkSend}
                  disabled={bulkSending || bulkPreviewCount === null || bulkPreviewCount === 0}
                  className="rounded-lg border-2 border-neutral-900 bg-amber-500 px-5 py-2 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50"
                >
                  {bulkSending ? "Sending..." : "Send to all"}
                </button>
                <button
                  onClick={() => { setBulkOpen(false); setBulkPreviewCount(null); }}
                  className="rounded-lg border-2 border-neutral-900 bg-white px-5 py-2 font-['Satoshi'] text-sm font-medium text-neutral-700 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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
