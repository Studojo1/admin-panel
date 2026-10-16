import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import {
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend,
} from "chart.js";
import { Bar } from "react-chartjs-2";
import type { Route } from "./+types/gtm.$slug";

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

export function meta({}: Route.MetaArgs) {
  return [{ title: "GTM Dashboard – Admin Panel" }];
}

// Shape written by the campaign tooling (build_dashboard.py). Read-only here.
type Kpis = Record<string, number>;
type Msg = { at: string; direction: "in" | "out"; from: string; to: string; cc: string; subject: string; body: string; attachments: number };
type Meeting = { school: string; person: string; title: string; when_utc: string | null; local_tz: string; status: string; owner: string; notes: string; when_ist?: string; when_local?: string };
type PipelineRow = { school: string; stage: string; next: string; contact: string; inbox: string; last_in: string | null; last_out: string | null; messages: number; people_emailed: number };
type OutreachRow = { school: string; name: string; email: string; inbox: string; first_sent: string; subject: string; followups: number; status: string };
type Inbound = { at: string; school: string; from: string; inbox: string; category: string; summary: string };
type Dashboard = {
  slug: string; title: string; subtitle: string; period: { start: string; end: string }; generated_at: string;
  kpis: Kpis;
  daily: { date: string; new: number; followups: number; replies: number; interested: number }[];
  inboxes: { inbox: string; email: string; new: number; followups: number; schools: number; replied: number; interested: number; meetings: number }[];
  funnel: { stage: string; count: number }[];
  meetings: Meeting[];
  pipeline: PipelineRow[];
  threads: Record<string, Msg[]>;
  outreach: OutreachRow[];
  inbound: Inbound[];
  notes: string[];
  replies_sent_by_us?: number;
};

const IST = "Asia/Kolkata";
const fmtIST = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleString("en-US", { timeZone: IST, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) + " IST" : "–";
const niceDay = (d: string) => new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const pct = (a: number, b: number) => (b ? `${((a / b) * 100).toFixed(1)}%` : "–");

const STAGE_STYLES: Record<string, string> = {
  "Meeting held": "bg-emerald-600 text-white border-emerald-600",
  "Meeting booked": "bg-emerald-100 text-emerald-800 border-emerald-200",
  "Meeting agreed": "bg-teal-100 text-teal-800 border-teal-200",
  "Contacts sent": "bg-violet-100 text-violet-800 border-violet-200",
  "Asked who we are": "bg-amber-100 text-amber-800 border-amber-200",
  "Asked what we do": "bg-amber-100 text-amber-800 border-amber-200",
  "Auto-reply only": "bg-sky-50 text-sky-700 border-sky-200",
  Declined: "bg-red-50 text-red-700 border-red-200",
  Bounced: "bg-red-50 text-red-700 border-red-200",
  "No reply": "bg-neutral-100 text-neutral-500 border-neutral-200",
  held: "bg-emerald-600 text-white border-emerald-600",
  booked: "bg-emerald-100 text-emerald-800 border-emerald-200",
  pending: "bg-amber-100 text-amber-800 border-amber-200",
  positive: "bg-emerald-100 text-emerald-800 border-emerald-200",
  question: "bg-amber-100 text-amber-800 border-amber-200",
  calendar: "bg-teal-100 text-teal-800 border-teal-200",
  not_interested: "bg-red-50 text-red-700 border-red-200",
  bounce: "bg-red-50 text-red-700 border-red-200",
  out_of_office: "bg-sky-50 text-sky-700 border-sky-200",
  other: "bg-neutral-100 text-neutral-600 border-neutral-200",
};

function Badge({ label }: { label: string }) {
  return (
    <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${STAGE_STYLES[label] || STAGE_STYLES.other}`}>
      {label.replace(/_/g, " ")}
    </span>
  );
}

function Section({ title, hint, children, right }: { title: string; hint?: string; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-neutral-900">{title}</h2>
          {hint && <p className="text-xs text-neutral-500">{hint}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-neutral-500">{label}</div>
      <div className="mt-1 text-3xl font-bold text-neutral-900">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-neutral-500">{sub}</div>}
    </div>
  );
}

export default function GtmDashboard() {
  const { slug } = useParams();
  const { isAuthorized, isPending } = useAdminGuard();
  const [data, setData] = useState<Dashboard | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError(null);
      const token = await getToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(`/api/gtm-dashboards?slug=${encodeURIComponent(slug || "")}`, {
        headers: { Authorization: `Bearer ${token}` },
        credentials: "include",
      });
      if (!res.ok) throw new Error(res.status === 404 ? "No dashboard with this name" : `HTTP ${res.status}`);
      const row = await res.json();
      setData(row.data as Dashboard);
      setUpdatedAt(row.updated_at);
    } catch (e: any) {
      setError(e.message || "Failed to load");
    }
  }, [slug]);

  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized, load]);

  if (isPending) {
    return <div className="min-h-screen bg-neutral-50 flex items-center justify-center text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-[1280px] px-4 sm:px-6 py-8">
        <Link to="/gtm" className="text-xs text-violet-600 hover:underline">All GTM dashboards</Link>
        {error && <p className="mt-6 text-sm text-red-600">{error}</p>}
        {!data && !error && <p className="mt-6 text-sm text-neutral-500">Loading dashboard...</p>}
        {data && <DashboardBody d={data} updatedAt={updatedAt} onReload={load} />}
      </main>
    </div>
  );
}

function DashboardBody({ d, updatedAt, onReload }: { d: Dashboard; updatedAt: string | null; onReload: () => void }) {
  const k = d.kpis;
  return (
    <>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-neutral-900">{d.title}</h1>
          <p className="mt-1 max-w-3xl text-sm text-neutral-600">{d.subtitle}</p>
          <p className="mt-1 text-xs text-neutral-500">
            {niceDay(d.period.start)} to {niceDay(d.period.end)} · data as of {fmtIST(d.generated_at)}
            {updatedAt && <> · uploaded {fmtIST(updatedAt)}</>}
          </p>
        </div>
        <button onClick={onReload} className="rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm text-neutral-700 hover:bg-neutral-100">
          Reload
        </button>
      </div>

      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Emails sent" value={k.total_sends} sub={`${k.new_emails} new · ${k.followups} follow-ups`} />
        <Kpi label="Schools emailed" value={k.schools_contacted} sub={`${k.people_contacted} people`} />
        <Kpi label="Schools replied" value={k.schools_replied} sub={`${k.reply_rate}% of schools · humans only`} />
        <Kpi label="Interested" value={k.schools_interested} sub={`${k.interest_rate}% of schools`} />
        <Kpi label="Meetings booked" value={k.meetings_booked} sub={`${k.meetings_held} held · ${k.meetings_pending} more agreed`} />
        <Kpi label="Bounces" value={k.bounces} sub={`${k.auto_reply_only} auto-reply only · ${k.schools_declined} declined`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-neutral-800">Emails sent per day (US Eastern)</div>
          <div className="h-60">
            <Bar
              data={{
                labels: d.daily.map((x) => niceDay(x.date)),
                datasets: [
                  { label: "New", data: d.daily.map((x) => x.new), backgroundColor: "#8b5cf6", stack: "s" },
                  { label: "Follow-ups", data: d.daily.map((x) => x.followups), backgroundColor: "#c4b5fd", stack: "s" },
                ],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } } }}
            />
          </div>
        </div>
        <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-neutral-800">Schools replying per day (first human reply)</div>
          <div className="h-60">
            <Bar
              data={{
                labels: d.daily.map((x) => niceDay(x.date)),
                datasets: [
                  { label: "Replied", data: d.daily.map((x) => x.replies), backgroundColor: "#fbbf24" },
                  { label: "Interested", data: d.daily.map((x) => x.interested), backgroundColor: "#10b981" },
                ],
              }}
              options={{ responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom" } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } }}
            />
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-semibold text-neutral-800">Funnel (schools)</div>
          <Funnel rows={d.funnel} />
        </div>
        <div className="min-w-0 rounded-xl border border-neutral-200 bg-white p-4 shadow-sm overflow-x-auto">
          <div className="mb-3 text-sm font-semibold text-neutral-800">By sender inbox</div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="py-1 pr-3">Inbox</th><th className="py-1 pr-3 text-right">New</th><th className="py-1 pr-3 text-right">Follow-ups</th>
                <th className="py-1 pr-3 text-right">Schools</th><th className="py-1 pr-3 text-right">Replied</th><th className="py-1 pr-3 text-right">Interested</th><th className="py-1 text-right">Meetings</th>
              </tr>
            </thead>
            <tbody>
              {d.inboxes.map((r) => (
                <tr key={r.inbox} className="border-t border-neutral-100">
                  <td className="py-2 pr-3"><div className="font-medium text-neutral-900">{r.inbox}</div><div className="text-[11px] text-neutral-500">{r.email}</div></td>
                  <td className="py-2 pr-3 text-right">{r.new}</td>
                  <td className="py-2 pr-3 text-right">{r.followups}</td>
                  <td className="py-2 pr-3 text-right">{r.schools}</td>
                  <td className="py-2 pr-3 text-right">{r.replied} <span className="text-[11px] text-neutral-400">{pct(r.replied, r.schools)}</span></td>
                  <td className="py-2 pr-3 text-right">{r.interested} <span className="text-[11px] text-neutral-400">{pct(r.interested, r.schools)}</span></td>
                  <td className="py-2 text-right">{r.meetings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <Section title="Meetings" hint="Times in IST and the prospect's local time.">
        <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-neutral-50">
              <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
                <th className="px-3 py-2">School</th><th className="px-3 py-2">Person</th><th className="px-3 py-2">When (IST)</th>
                <th className="px-3 py-2">Their time</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Owner</th><th className="px-3 py-2">Notes</th>
              </tr>
            </thead>
            <tbody>
              {d.meetings.map((m) => (
                <tr key={m.school} className="border-t border-neutral-100 align-top">
                  <td className="px-3 py-2 font-medium text-neutral-900">{m.school}</td>
                  <td className="px-3 py-2"><div>{m.person}</div><div className="text-[11px] text-neutral-500">{m.title}</div></td>
                  <td className="px-3 py-2 whitespace-nowrap">{m.when_ist || "Time not set"}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-neutral-600">{m.when_local || "–"}</td>
                  <td className="px-3 py-2"><Badge label={m.status} /></td>
                  <td className="px-3 py-2">{m.owner}</td>
                  <td className="px-3 py-2 text-neutral-600 min-w-[240px]">{m.notes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Pipeline rows={d.pipeline} threads={d.threads} />
      <OutreachTable rows={d.outreach} />
      <InboundLog rows={d.inbound} />

      {d.notes?.length > 0 && (
        <Section title="Notes">
          <ul className="list-disc space-y-1 pl-5 text-sm text-neutral-700">
            {d.notes.map((n, i) => <li key={i}>{n}</li>)}
          </ul>
        </Section>
      )}
    </>
  );
}

function Funnel({ rows }: { rows: { stage: string; count: number }[] }) {
  const top = rows[0]?.count || 1;
  return (
    <div className="space-y-2">
      {rows.map((r, i) => (
        <div key={r.stage}>
          <div className="flex justify-between text-xs text-neutral-600">
            <span>{r.stage}</span>
            <span className="font-medium text-neutral-900">
              {r.count} {i > 0 && <span className="text-neutral-400">({pct(r.count, top)})</span>}
            </span>
          </div>
          <div className="mt-1 h-3 rounded-full bg-neutral-100">
            <div className="h-3 rounded-full bg-violet-500" style={{ width: `${Math.max(2, (r.count / top) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function Pipeline({ rows, threads }: { rows: PipelineRow[]; threads: Record<string, Msg[]> }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <Section title="Replies pipeline" hint="Every school that replied. Click a row to read the full email thread.">
      <div className="overflow-x-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-neutral-50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2">School</th><th className="px-3 py-2">Stage</th><th className="px-3 py-2">Contact</th><th className="px-3 py-2">Inbox</th>
              <th className="px-3 py-2">Last from them</th><th className="px-3 py-2">Last from us</th><th className="px-3 py-2 text-right">Msgs</th><th className="px-3 py-2">Next step</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isOpen = open === r.school;
              return (
                <Fragment key={r.school}>
                  <tr
                    onClick={() => setOpen(isOpen ? null : r.school)}
                    className={`cursor-pointer border-t border-neutral-100 align-top hover:bg-violet-50/50 ${isOpen ? "bg-violet-50/60" : ""}`}
                  >
                    <td className="px-3 py-2 font-medium text-neutral-900 min-w-[160px]">
                      <span className="mr-1 inline-block w-3 text-neutral-400">{isOpen ? "▾" : "▸"}</span>{r.school}
                    </td>
                    <td className="px-3 py-2"><Badge label={r.stage} /></td>
                    <td className="px-3 py-2 min-w-[220px]"><Contact value={r.contact} /></td>
                    <td className="px-3 py-2">{r.inbox}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-neutral-600">{fmtIST(r.last_in)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-neutral-600">{fmtIST(r.last_out)}</td>
                    <td className="px-3 py-2 text-right">{r.messages}</td>
                    <td className="px-3 py-2 text-neutral-600 min-w-[220px]">{r.next}</td>
                  </tr>
                  {isOpen && (
                    <tr className="border-t border-neutral-100 bg-neutral-50">
                      <td colSpan={8} className="px-3 py-4">
                        <Thread msgs={threads[r.school] || []} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function Contact({ value }: { value: string }) {
  const m = value.match(/^\s*(.*?)\s*<([^>]+)>\s*$/);
  if (!m) return <span className="text-neutral-700">{value}</span>;
  return (
    <>
      <div className="text-neutral-800">{m[1] || m[2]}</div>
      {m[1] && <div className="text-[11px] text-neutral-500 [overflow-wrap:anywhere]">{m[2]}</div>}
    </>
  );
}

function Thread({ msgs }: { msgs: Msg[] }) {
  if (!msgs.length) return <p className="text-sm text-neutral-500">No messages captured for this school.</p>;
  return (
    <div className="mx-auto max-w-3xl space-y-3">
      {msgs.map((m, i) => {
        const out = m.direction === "out";
        return (
          <div key={i} className={`rounded-xl border p-4 ${out ? "ml-8 border-violet-200 bg-white" : "mr-8 border-emerald-200 bg-emerald-50/40"}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div className="text-xs">
                <span className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase ${out ? "bg-violet-100 text-violet-700" : "bg-emerald-100 text-emerald-700"}`}>
                  {out ? "Us" : "Them"}
                </span>
                <span className="font-medium text-neutral-800">{m.from}</span>
              </div>
              <div className="text-[11px] text-neutral-500">{fmtIST(m.at)}</div>
            </div>
            <div className="mt-1 text-[11px] text-neutral-500">
              To: {m.to}{m.cc && <> · Cc: {m.cc}</>}
            </div>
            <div className="mt-1 text-xs font-medium text-neutral-700">{m.subject}</div>
            <div className="mt-2 whitespace-pre-wrap break-words text-sm leading-relaxed text-neutral-800">{m.body}</div>
            {m.attachments > 0 && <div className="mt-2 text-[11px] text-neutral-500">{m.attachments} attachment{m.attachments > 1 ? "s" : ""} (not shown)</div>}
          </div>
        );
      })}
    </div>
  );
}

function OutreachTable({ rows }: { rows: OutreachRow[] }) {
  const [q, setQ] = useState("");
  const [inbox, setInbox] = useState("all");
  const [status, setStatus] = useState("all");
  const inboxes = useMemo(() => Array.from(new Set(rows.map((r) => r.inbox))).sort(), [rows]);
  const statuses = useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((r) => (c[r.status] = (c[r.status] || 0) + 1));
    return Object.entries(c).sort((a, b) => b[1] - a[1]);
  }, [rows]);
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    return rows
      .filter((r) => inbox === "all" || r.inbox === inbox)
      .filter((r) => status === "all" || r.status === status)
      .filter((r) => !s || [r.school, r.name, r.email, r.subject].some((v) => (v || "").toLowerCase().includes(s)))
      .sort((a, b) => b.first_sent.localeCompare(a.first_sent));
  }, [rows, q, inbox, status]);

  return (
    <Section
      title="Everyone we emailed"
      hint={`${shown.length} of ${rows.length} people`}
      right={
        <div className="flex flex-wrap gap-2">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search school, name, email, subject"
            className="w-full sm:w-64 rounded-lg border border-neutral-300 bg-white px-3 py-1.5 text-sm focus:border-violet-400 focus:outline-none"
          />
          <select value={inbox} onChange={(e) => setInbox(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm">
            <option value="all">All inboxes</option>
            {inboxes.map((i) => <option key={i} value={i}>{i}</option>)}
          </select>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-lg border border-neutral-300 bg-white px-2 py-1.5 text-sm">
            <option value="all">All statuses</option>
            {statuses.map(([s, n]) => <option key={s} value={s}>{s} ({n})</option>)}
          </select>
        </div>
      }
    >
      <div className="max-h-[560px] overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2">School</th><th className="px-3 py-2">Person</th><th className="px-3 py-2">Inbox</th><th className="px-3 py-2">First email</th>
              <th className="px-3 py-2">Subject</th><th className="px-3 py-2 text-right">Follow-ups</th><th className="px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.email + r.first_sent} className="border-t border-neutral-100 align-top">
                <td className="px-3 py-2 font-medium text-neutral-900">{r.school}</td>
                <td className="px-3 py-2"><div>{r.name}</div><div className="text-[11px] text-neutral-500">{r.email}</div></td>
                <td className="px-3 py-2">{r.inbox}</td>
                <td className="px-3 py-2 whitespace-nowrap text-neutral-600">{fmtIST(r.first_sent)}</td>
                <td className="px-3 py-2 text-neutral-700">{r.subject}</td>
                <td className="px-3 py-2 text-right">{r.followups}</td>
                <td className="px-3 py-2"><Badge label={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

function InboundLog({ rows }: { rows: Inbound[] }) {
  const sorted = useMemo(() => [...rows].sort((a, b) => b.at.localeCompare(a.at)), [rows]);
  return (
    <Section title="Inbound log" hint="Every email that came back, including auto-replies and bounces, with the classifier's one-line summary.">
      <div className="max-h-[480px] overflow-auto rounded-xl border border-neutral-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-neutral-50">
            <tr className="text-left text-[11px] uppercase tracking-wide text-neutral-500">
              <th className="px-3 py-2">When</th><th className="px-3 py-2">School</th><th className="px-3 py-2">From</th><th className="px-3 py-2">Inbox</th>
              <th className="px-3 py-2">Type</th><th className="px-3 py-2">Summary</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((r, i) => (
              <tr key={i} className="border-t border-neutral-100 align-top">
                <td className="px-3 py-2 whitespace-nowrap text-neutral-600">{fmtIST(r.at)}</td>
                <td className="px-3 py-2 font-medium text-neutral-900">{r.school}</td>
                <td className="px-3 py-2 text-neutral-600">{r.from}</td>
                <td className="px-3 py-2">{r.inbox}</td>
                <td className="px-3 py-2"><Badge label={r.category} /></td>
                <td className="px-3 py-2 text-neutral-700 min-w-[260px]">{r.summary}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
