// Sensei tab in the Studojo admin panel (admin.studojo.com). Super-admins mint
// partner organizations; each org's admin then invites their own team inside
// Sensei. This tab is also the B2B usage + COST dashboard: every org, user and
// chat, phone reveals, credits pledged vs used, real sign-ins, and the actual
// ₹ cost to serve each customer (AI tokens + context.dev search + enrichment).
// Data goes through /api/sensei (bob super-admin secret stays server-side).
import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import type { Route } from "./+types/sensei";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Sensei | Studojo Admin" }];
}

interface Org {
  id: number; name: string; email_domain: string | null;
  max_members: number | null; members: number; chats: number; chats_7d: number;
  last_activity: string | null; last_login: string | null; signed_in: boolean;
  enrichment_balance: number; ai_balance: number | null; ai_unlimited: boolean;
  phones_revealed: number; ai_used: number; runs: number;
  enrichment_pledged: number; ai_pledged: number | null; context_credits: number;
  cost_ai_inr: number; cost_search_inr: number; cost_enrichment_inr: number;
  cost_total_inr: number; value_pledged_inr: number;
  low_credit: boolean; created_at: string | null;
}
interface UserRow {
  org_id: number; org_name: string; email: string; role: string;
  chats: number; phones_revealed: number;
  last_activity: string | null; last_login: string | null;
}
interface Chat {
  id: number; org_id: number; org_name: string; owner_email: string | null;
  title: string; assigned_to: string | null;
  created_at: string | null; updated_at: string | null;
  messages: number; runs: number; phones_revealed: number; cost_inr: number;
}
interface Ticket {
  id: number; user_email: string; user_name: string | null;
  category: string; priority: string; status: string;
  context: any; created_at: string; first_message: string;
}
interface Totals {
  orgs: number; orgs_signed_in: number; members: number; chats: number;
  phones_revealed: number; runs: number; low_credit_orgs: number;
  cost_ai_inr: number; cost_search_inr: number; cost_enrichment_inr: number;
  cost_total_inr: number; value_pledged_inr: number; context_credits: number;
}
interface Rates {
  inr_per_context_credit: number; inr_per_reveal_cost: number;
  sell_inr_per_enrichment: number; sell_inr_per_ai_credit: number;
}

function fmtDate(s: string | null): string {
  if (!s) return "-";
  try { return new Date(s).toLocaleDateString(undefined, { month: "short", day: "numeric" }); }
  catch { return "-"; }
}
function fmtDateTime(s: string | null): string {
  if (!s) return "never";
  try { return new Date(s).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); }
  catch { return "-"; }
}
function inr(n: number | null | undefined): string {
  const v = Number(n || 0);
  return "₹" + v.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export default function Sensei() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [chats, setChats] = useState<Chat[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [rates, setRates] = useState<Rates | null>(null);
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [chatFilter, setChatFilter] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/sensei");
      const d = await r.json().catch(() => ({}));
      if (r.ok) {
        setOrgs(d.orgs || []);
        setUsers(d.users || []);
        setChats(d.chats || []);
        setTickets(d.tickets || []);
        setTotals(d.totals || null);
        setRates(d.rates || null);
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

  const filteredChats = useMemo(() => {
    const q = chatFilter.trim().toLowerCase();
    if (!q) return chats;
    return chats.filter((c) =>
      (c.org_name || "").toLowerCase().includes(q) ||
      (c.owner_email || "").toLowerCase().includes(q) ||
      (c.title || "").toLowerCase().includes(q));
  }, [chats, chatFilter]);

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
          Placement-intelligence workspaces. Every org, user and chat, what they cost us to serve, and support tickets.
        </p>

        {/* Usage stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4 mb-4">
          {([
            ["Organizations", totals?.orgs ?? orgs.length],
            ["Signed in", totals?.orgs_signed_in ?? 0],
            ["Members", totals?.members ?? 0],
            ["Chats", totals?.chats ?? 0],
            ["Phones revealed", totals?.phones_revealed ?? 0],
            ["Open tickets", openTickets.length],
          ] as const).map(([l, v]) => (
            <div key={l} className={`${card} p-4`}>
              <div className="text-2xl font-black">{Number(v).toLocaleString()}</div>
              <div className="text-xs text-neutral-400 mt-1">{l}</div>
            </div>
          ))}
        </div>

        {/* Cost to serve — the real ₹ we spend on these customers */}
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-2">
          <div className={`${card} p-4 !border-violet-600 shadow-[2px_2px_0px_0px_rgba(124,58,237,1)]`}>
            <div className="text-2xl font-black text-violet-700">{inr(totals?.cost_total_inr)}</div>
            <div className="text-xs text-neutral-500 mt-1 font-semibold">Total cost to serve</div>
          </div>
          {([
            ["AI (Azure tokens)", totals?.cost_ai_inr, "exact per-token ₹"],
            ["Search (context.dev)", totals?.cost_search_inr, `${totals?.context_credits ?? 0} credits`],
            ["Enrichment (reveals)", totals?.cost_enrichment_inr, `${totals?.phones_revealed ?? 0} phones`],
            ["Credits pledged (value)", totals?.value_pledged_inr, "at sell rates"],
          ] as const).map(([l, v, sub]) => (
            <div key={l} className={`${card} p-4`}>
              <div className="text-2xl font-black">{inr(v as number)}</div>
              <div className="text-xs text-neutral-500 mt-1 font-semibold">{l}</div>
              <div className="text-[11px] text-neutral-400">{sub}</div>
            </div>
          ))}
        </div>
        {rates && (
          <p className="text-[11px] text-neutral-400 mb-6">
            Costing at: AI = exact Azure OpenAI token ₹ per run · search = {inr(rates.inr_per_context_credit)}/context.dev credit ·
            enrichment = {inr(rates.inr_per_reveal_cost)}/reveal (estimate) · pledged value at {inr(rates.sell_inr_per_enrichment)}/reveal + {inr(rates.sell_inr_per_ai_credit)}/AI credit.
          </p>
        )}

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

        {/* Organizations — usage, credits pledged, and cost */}
        <h2 className="font-['Clash_Display'] text-xl font-bold mb-3">Organizations</h2>
        <div className={`${card} overflow-x-auto mb-8`}>
          <div className="min-w-[1080px]">
            <div className="grid grid-cols-[1.7fr_0.9fr_0.9fr_0.7fr_1.3fr_1.6fr_0.9fr] gap-2 px-5 py-3 border-b-2 border-neutral-900 text-xs font-bold uppercase text-neutral-400">
              <div>Organization</div><div>Last sign-in</div><div>Members</div><div>Chats</div>
              <div>Credits (left / pledged)</div><div>Cost to serve</div><div>Total</div>
            </div>
            {orgs.map((o) => (
              <div key={o.id} className="grid grid-cols-[1.7fr_0.9fr_0.9fr_0.7fr_1.3fr_1.6fr_0.9fr] gap-2 px-5 py-3 border-b border-neutral-100 text-sm items-center">
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    {o.name}
                    {o.low_credit && <span className="text-[10px] font-bold text-amber-700 bg-amber-100 rounded px-1.5 py-0.5">LOW</span>}
                    {!o.signed_in && <span className="text-[10px] font-bold text-neutral-500 bg-neutral-100 rounded px-1.5 py-0.5">NEVER IN</span>}
                  </div>
                  <div className="text-neutral-400 text-xs truncate">{o.email_domain || "no domain"}</div>
                </div>
                <div className="text-neutral-500 text-xs">{o.last_login ? fmtDate(o.last_login) : <span className="text-neutral-300">never</span>}</div>
                <div>{o.members}<span className="text-neutral-400 text-xs">{o.max_members ? ` / ${o.max_members}` : ""}</span></div>
                <div>{o.chats}<span className="text-neutral-400 text-xs"> ({o.runs}r)</span></div>
                <div className="text-xs">
                  <div><span className={o.low_credit ? "text-amber-700 font-bold" : "font-semibold"}>{o.enrichment_balance}</span> / {o.enrichment_pledged} reveals</div>
                  <div className="text-neutral-500">{o.ai_unlimited ? "∞" : `${o.ai_balance} / ${o.ai_pledged}`} AI</div>
                </div>
                <div className="text-xs text-neutral-500">
                  <span title="AI (Azure tokens)">AI {inr(o.cost_ai_inr)}</span>
                  <span className="text-neutral-300"> · </span>
                  <span title="context.dev search">🔍 {inr(o.cost_search_inr)}</span>
                  <span className="text-neutral-300"> · </span>
                  <span title="phone reveals">☎ {inr(o.cost_enrichment_inr)}</span>
                </div>
                <div className="font-bold">{inr(o.cost_total_inr)}</div>
              </div>
            ))}
            {orgs.length === 0 && <div className="px-5 py-8 text-center text-neutral-400 text-sm">No organizations yet.</div>}
          </div>
        </div>

        {/* Every chat */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-['Clash_Display'] text-xl font-bold">All chats <span className="text-neutral-400 text-base font-normal">({chats.length})</span></h2>
          <input value={chatFilter} onChange={(e) => setChatFilter(e.target.value)} placeholder="Filter by org, user, or title" className={`${input} w-64`} />
        </div>
        <div className={`${card} overflow-x-auto mb-8`}>
          <div className="min-w-[960px]">
            <div className="grid grid-cols-[0.5fr_2fr_1.3fr_1.4fr_0.7fr_0.7fr_0.8fr_0.9fr] gap-2 px-5 py-3 border-b-2 border-neutral-900 text-xs font-bold uppercase text-neutral-400">
              <div>#</div><div>Chat</div><div>Organization</div><div>Owner</div>
              <div>Msgs</div><div>Runs</div><div>Reveals</div><div>Cost</div>
            </div>
            {filteredChats.map((c) => (
              <div key={c.id} className="grid grid-cols-[0.5fr_2fr_1.3fr_1.4fr_0.7fr_0.7fr_0.8fr_0.9fr] gap-2 px-5 py-3 border-b border-neutral-100 text-sm items-center">
                <div className="text-neutral-400 text-xs">{c.id}</div>
                <div className="min-w-0">
                  <div className="font-semibold truncate">{c.title}</div>
                  <div className="text-neutral-400 text-xs">{fmtDateTime(c.updated_at)}</div>
                </div>
                <div className="text-neutral-600 truncate">{c.org_name}</div>
                <div className="text-neutral-500 truncate text-xs">{c.owner_email || "-"}</div>
                <div>{c.messages}</div>
                <div>{c.runs}</div>
                <div>{c.phones_revealed}</div>
                <div className="font-semibold">{inr(c.cost_inr)}</div>
              </div>
            ))}
            {filteredChats.length === 0 && <div className="px-5 py-8 text-center text-neutral-400 text-sm">{chats.length ? "No chats match that filter." : "No chats yet."}</div>}
          </div>
        </div>

        {/* Per-user activity */}
        <h2 className="font-['Clash_Display'] text-xl font-bold mb-3">Users</h2>
        <div className={`${card} overflow-x-auto mb-8`}>
          <div className="min-w-[820px]">
            <div className="grid grid-cols-[2fr_1.5fr_0.7fr_0.7fr_0.8fr_1.1fr] gap-2 px-5 py-3 border-b-2 border-neutral-900 text-xs font-bold uppercase text-neutral-400">
              <div>User</div><div>Organization</div><div>Role</div><div>Chats</div><div>Reveals</div><div>Last sign-in</div>
            </div>
            {users.map((u) => (
              <div key={`${u.org_id}-${u.email}`} className="grid grid-cols-[2fr_1.5fr_0.7fr_0.7fr_0.8fr_1.1fr] gap-2 px-5 py-3 border-b border-neutral-100 text-sm items-center">
                <div className="font-semibold truncate">{u.email}</div>
                <div className="text-neutral-500 truncate">{u.org_name}</div>
                <div className="text-xs">
                  <span className={`rounded px-1.5 py-0.5 font-bold ${u.role === "admin" ? "bg-violet-100 text-violet-700" : "bg-neutral-100 text-neutral-500"}`}>{u.role}</span>
                </div>
                <div>{u.chats}</div>
                <div>{u.phones_revealed}</div>
                <div className="text-neutral-500 text-xs">{fmtDateTime(u.last_login)}</div>
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
