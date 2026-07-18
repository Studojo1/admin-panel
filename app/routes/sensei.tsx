// Sensei tab in the Studojo admin panel (admin.studojo.com). Super-admins mint
// partner organizations; each org's admin then invites their own team inside
// Sensei. This tab is also the B2B usage dashboard: chats, credits consumed,
// phone reveals, low-credit customers to reach out to, and support tickets.
// Data goes through /api/sensei (bob super-admin secret stays server-side).
import { useEffect, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import type { Route } from "./+types/sensei";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Sensei | Studojo Admin" }];
}

interface Org {
  id: number; name: string; email_domain: string | null;
  members: number; chats: number; chats_7d: number;
  last_activity: string | null;
  enrichment_balance: number; ai_balance: number;
  phones_revealed: number; ai_used: number;
  low_credit: boolean; created_at: string | null;
}
interface UserRow {
  org_id: number; org_name: string; email: string;
  chats: number; phones_revealed: number; last_activity: string | null;
}
interface Ticket {
  id: number; user_email: string; user_name: string | null;
  category: string; priority: string; status: string;
  context: any; created_at: string; first_message: string;
}
interface Totals {
  orgs: number; members: number; chats: number;
  phones_revealed: number; low_credit_orgs: number;
}

function fmtDate(s: string | null): string {
  if (!s) return "-";
  try { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return "-"; }
}

export default function Sensei() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/sensei");
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setOrgs(d.orgs || []);
        setUsers(d.users || []);
        setTickets(d.tickets || []);
        setTotals(d.totals || null);
      }
    } catch { /* */ }
  };
  useEffect(() => { if (isAuthorized) load(); }, [isAuthorized]);

  const create = async () => {
    if (!name.trim() || !adminEmail.trim() || busy) return;
    setBusy(true); setMsg("");
    try {
      const r = await fetch("/api/sensei", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ org_name: name, admin_email: adminEmail, email_domain: domain }),
      });
      const d = await r.json().catch(() => ({}));
      if (r.ok) { setName(""); setAdminEmail(""); setDomain(""); setMsg("Organization created."); load(); }
      else setMsg(d.detail || "Could not create organization");
    } catch { setMsg("Could not create organization"); }
    finally { setBusy(false); }
  };

  if (isPending || !isAuthorized) return <div className="min-h-screen bg-[#faf7f2]" />;

  const card = "bg-white border-2 border-neutral-900 rounded-2xl shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]";
  const input = "border-2 border-neutral-900 rounded-xl px-3 py-2 text-sm";
  const lowCredit = orgs.filter((o) => o.low_credit);
  const openTickets = tickets.filter((t) => t.status === "open" || t.status === "in_progress");

  return (
    <div className="min-h-screen bg-[#faf7f2] font-['Satoshi'] text-neutral-900">
      <AdminHeader />
      <div className="mx-auto max-w-[var(--section-max-width)] px-4 md:px-8 py-8">
        <h1 className="font-['Clash_Display'] text-3xl font-bold mb-1">Sensei</h1>
        <p className="text-neutral-500 mb-6">
          Placement-intelligence workspaces. Create partner organizations, watch usage, and clear support tickets.
        </p>

        {/* Top-line stats */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mb-6">
          {([
            ["Organizations", totals?.orgs ?? orgs.length],
            ["Members", totals?.members ?? 0],
            ["Chats", totals?.chats ?? 0],
            ["Phones revealed", totals?.phones_revealed ?? 0],
            ["Open tickets", openTickets.length],
          ] as const).map(([l, v]) => (
            <div key={l} className={`${card} p-5`}>
              <div className="text-3xl font-black">{Number(v).toLocaleString()}</div>
              <div className="text-sm text-neutral-400 mt-1">{l}</div>
            </div>
          ))}
        </div>

        {/* Low-credit customers to reach out to */}
        {lowCredit.length > 0 && (
          <div className={`${card} p-5 mb-6 !border-amber-500 shadow-[2px_2px_0px_0px_rgba(245,158,11,1)]`}>
            <h3 className="font-bold mb-1 flex items-center gap-2">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              Running low on credits — reach out
            </h3>
            <p className="text-sm text-neutral-500 mb-3">
              These workspaces have {`≤`} 5 enrichment credits left. Good time to check in on a top-up.
            </p>
            <div className="flex flex-wrap gap-2">
              {lowCredit.map((o) => (
                <span key={o.id} className="inline-flex items-center gap-2 rounded-xl border-2 border-amber-500 bg-amber-50 px-3 py-1.5 text-sm">
                  <span className="font-semibold">{o.name}</span>
                  <span className="text-amber-700 font-bold">{o.enrichment_balance} left</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Create partner account */}
        <div className={`${card} p-5 mb-6`}>
          <h3 className="font-bold mb-1">New partner account</h3>
          <p className="text-sm text-neutral-500 mb-4">Create the org and its first admin. The admin invites their own team by email.</p>
          <div className="grid sm:grid-cols-3 gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Company name" className={input} />
            <input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} placeholder="Admin email" type="email" className={input} />
            <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Email domain (optional)" className={input} />
          </div>
          <div className="flex items-center gap-3 mt-3">
            <button onClick={create} disabled={busy}
              className="bg-violet-600 text-white font-bold px-4 py-2 rounded-xl border-2 border-neutral-900 text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-60">
              {busy ? "Creating..." : "Create organization"}
            </button>
            {msg && <span className="text-sm text-neutral-500">{msg}</span>}
          </div>
        </div>

        {/* Organizations usage table */}
        <h2 className="font-['Clash_Display'] text-xl font-bold mb-3">Organizations</h2>
        <div className={`${card} overflow-x-auto mb-8`}>
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[2fr_1.4fr_0.8fr_0.8fr_1fr_1fr_1fr] gap-2 px-5 py-3 border-b-2 border-neutral-900 text-xs font-bold uppercase text-neutral-400">
              <div>Organization</div><div>Domain</div><div>Members</div><div>Chats</div>
              <div>Reveals</div><div>Credits left</div><div>Last active</div>
            </div>
            {orgs.map((o) => (
              <div key={o.id} className="grid grid-cols-[2fr_1.4fr_0.8fr_0.8fr_1fr_1fr_1fr] gap-2 px-5 py-3 border-b border-neutral-100 text-sm items-center">
                <div className="font-semibold truncate flex items-center gap-2">
                  {o.name}
                  {o.low_credit && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">LOW</span>}
                </div>
                <div className="text-neutral-500 truncate">{o.email_domain || "-"}</div>
                <div>{o.members}</div>
                <div>{o.chats}<span className="text-neutral-400 text-xs"> ({o.chats_7d}/7d)</span></div>
                <div>{o.phones_revealed}</div>
                <div className={o.low_credit ? "text-amber-700 font-bold" : ""}>{o.enrichment_balance}</div>
                <div className="text-neutral-500">{fmtDate(o.last_activity)}</div>
              </div>
            ))}
            {orgs.length === 0 && <div className="px-5 py-8 text-center text-neutral-400 text-sm">No organizations yet.</div>}
          </div>
        </div>

        {/* Per-user leaderboard */}
        <h2 className="font-['Clash_Display'] text-xl font-bold mb-3">Most active users</h2>
        <div className={`${card} overflow-x-auto mb-8`}>
          <div className="min-w-[720px]">
            <div className="grid grid-cols-[2fr_1.6fr_0.8fr_1fr_1fr] gap-2 px-5 py-3 border-b-2 border-neutral-900 text-xs font-bold uppercase text-neutral-400">
              <div>User</div><div>Organization</div><div>Chats</div><div>Reveals</div><div>Last active</div>
            </div>
            {users.map((u) => (
              <div key={`${u.org_id}-${u.email}`} className="grid grid-cols-[2fr_1.6fr_0.8fr_1fr_1fr] gap-2 px-5 py-3 border-b border-neutral-100 text-sm items-center">
                <div className="font-semibold truncate">{u.email}</div>
                <div className="text-neutral-500 truncate">{u.org_name}</div>
                <div>{u.chats}</div>
                <div>{u.phones_revealed}</div>
                <div className="text-neutral-500">{fmtDate(u.last_activity)}</div>
              </div>
            ))}
            {users.length === 0 && <div className="px-5 py-8 text-center text-neutral-400 text-sm">No user activity yet.</div>}
          </div>
        </div>

        {/* Support tickets */}
        <h2 className="font-['Clash_Display'] text-xl font-bold mb-3">
          Support tickets
          <a href="/tickets" className="ml-3 text-sm font-medium text-violet-600 hover:underline">Open full ticket view →</a>
        </h2>
        <div className={`${card} overflow-hidden`}>
          {tickets.map((t) => (
            <div key={t.id} className="flex items-start gap-3 px-5 py-3 border-b border-neutral-100 text-sm">
              <span className={`shrink-0 mt-0.5 text-[10px] font-bold rounded px-1.5 py-0.5 ${
                t.priority === "high" ? "bg-red-100 text-red-700"
                : t.priority === "low" ? "bg-neutral-100 text-neutral-500"
                : "bg-violet-100 text-violet-700"}`}>
                {t.priority.toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{t.context?.workspace || t.user_name || t.user_email}</span>
                  <span className="text-neutral-400 text-xs truncate">{t.user_email}</span>
                </div>
                <div className="text-neutral-600 truncate">{t.first_message || "(no message)"}</div>
              </div>
              <div className="shrink-0 text-right">
                <span className={`text-[10px] font-bold rounded px-1.5 py-0.5 ${
                  t.status === "open" ? "bg-emerald-100 text-emerald-700"
                  : t.status === "in_progress" ? "bg-amber-100 text-amber-700"
                  : "bg-neutral-100 text-neutral-500"}`}>
                  {t.status}
                </span>
                <div className="text-neutral-400 text-xs mt-1">{fmtDate(t.created_at)}</div>
              </div>
            </div>
          ))}
          {tickets.length === 0 && <div className="px-5 py-8 text-center text-neutral-400 text-sm">No Sensei tickets yet.</div>}
        </div>
      </div>
    </div>
  );
}
