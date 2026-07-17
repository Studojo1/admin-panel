// Sensei tab in the Studojo admin panel (admin.studojo.com). Super-admins mint
// partner organizations; each org's admin then invites their own team inside
// Sensei. Data goes through /api/sensei (secret stays server-side).
import { useEffect, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import type { Route } from "./+types/sensei";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Sensei | Studojo Admin" }];
}

interface Org {
  id: number; name: string; email_domain: string | null;
  members: number; chats: number; created_at: string | null;
}

export default function Sensei() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [name, setName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [domain, setDomain] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = async () => {
    try {
      const r = await fetch("/api/sensei");
      const d = await r.json().catch(() => ({}));
      if (r.ok) setOrgs(d.orgs || []);
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

  const totalMembers = orgs.reduce((s, o) => s + o.members, 0);
  const totalChats = orgs.reduce((s, o) => s + o.chats, 0);
  const card = "bg-white border-2 border-neutral-900 rounded-2xl shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]";
  const input = "border-2 border-neutral-900 rounded-xl px-3 py-2 text-sm";

  return (
    <div className="min-h-screen bg-[#faf7f2] font-['Satoshi'] text-neutral-900">
      <AdminHeader />
      <div className="mx-auto max-w-[var(--section-max-width)] px-4 md:px-8 py-8">
        <h1 className="font-['Clash_Display'] text-3xl font-bold mb-1">Sensei</h1>
        <p className="text-neutral-500 mb-6">
          Placement-intelligence workspaces. Create partner organizations here; each org admin invites their own team inside Sensei.
        </p>

        <div className="grid sm:grid-cols-3 gap-4 mb-6">
          {([["Organizations", orgs.length], ["Members", totalMembers], ["Chats", totalChats]] as const).map(([l, v]) => (
            <div key={l} className={`${card} p-5`}>
              <div className="text-3xl font-black">{v.toLocaleString()}</div>
              <div className="text-sm text-neutral-400 mt-1">{l}</div>
            </div>
          ))}
        </div>

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

        <div className={`${card} overflow-hidden`}>
          <div className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-2 px-5 py-3 border-b-2 border-neutral-900 text-xs font-bold uppercase text-neutral-400">
            <div>Organization</div><div>Email domain</div><div>Members</div><div>Chats</div>
          </div>
          {orgs.map((o) => (
            <div key={o.id} className="grid grid-cols-[2fr_2fr_1fr_1fr] gap-2 px-5 py-3 border-b border-neutral-100 text-sm items-center">
              <div className="font-semibold truncate">{o.name}</div>
              <div className="text-neutral-500 truncate">{o.email_domain || "-"}</div>
              <div>{o.members}</div><div>{o.chats}</div>
            </div>
          ))}
          {orgs.length === 0 && <div className="px-5 py-8 text-center text-neutral-400 text-sm">No organizations yet.</div>}
        </div>
      </div>
    </div>
  );
}
