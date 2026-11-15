// CUSTOMERS AGENT (15 Nov 2026, the owner: "give a api or mcp to this customers page that i can give to vivaan so he can
// give it to his claude and get all customer data directly from there"). READ-ONLY views of /customers for a teammate's
// Claude: the key-holder JSON API (/api/customers-agent/...) and the MCP endpoint (/mcp/customers). Pure: the data comes
// in through AgentDeps (agent.server.ts wires the real ones), so scripts/customers-agent.test.mjs can run it with made-up
// people. Nothing here writes anything.
import type { CustomersEnvelope, ListFilters, View, WireCustomer, WireDetail } from "./model";

export interface AgentDeps {
  list: (internal: boolean) => Promise<CustomersEnvelope>;
  detail: (id: string) => Promise<WireDetail | null>;
  filter: (all: readonly WireCustomer[], f: ListFilters, now: number) => WireCustomer[];
  now: () => number;
}

export const VIEW_KEYS: readonly View[] = ["all", "starred", "yes", "paid", "active", "unhappy", "picks"];
export const SORT_KEYS = ["rank", "recent", "new"] as const;
type SortKey = (typeof SORT_KEYS)[number];

export const ABOUT = {
  what: "Every Stu customer from the admin /customers page, ranked by how likely they are to be happy, with the team's stars, notes and picks. Read only.",
  rank: "Rank score: positive hiring-manager replies x10, any reply x3, paid +6, thank-you messages x2.5, complaints -2, refund asked -8, desk and resume-build calls x1.5, outreach emails sent /8 (capped at 40), active days in the last 21 x0.8. Starred customers list first.",
  views: {
    all: "Everyone (real customers; add include_internal for staff and test accounts)",
    starred: "Starred by the team",
    yes: "A hiring manager replied positively (asked for the resume, a call, details)",
    paid: "Paid (money in; not tests, free packs or staff grants)",
    active: "Did something themselves this week",
    unhappy: "Complained to Stu or asked for a refund",
    picks: "The team has saved picks (companies or jobs) for them",
  } as Record<View, string>,
  sort: { rank: "Starred first, then rank score (default)", recent: "Most recently active first", new: "Newest sign-ups first" } as Record<SortKey, string>,
};

const TIME_KEYS = new Set(["at", "signedUp", "lastSeen", "started", "replied", "createdAt", "updatedAt", "ends"]);
const iso = (ms: unknown): string | null => (typeof ms === "number" && ms > 0 ? new Date(ms).toISOString() : null);

/** Epoch-millisecond fields become ISO strings, everywhere in the object (readable for a model, no time-zone guessing). */
export function withIsoTimes<T>(v: T): T {
  if (Array.isArray(v)) return v.map(withIsoTimes) as unknown as T;
  if (v && typeof v === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v as Record<string, unknown>)) out[k] = TIME_KEYS.has(k) && typeof x === "number" ? iso(x) : withIsoTimes(x);
    return out as T;
  }
  return v;
}

/** One customer as a list row: who they are, what they want, the rank, the signals and the team's marks. */
export function listRow(c: WireCustomer) {
  return withIsoTimes({
    id: c.id, name: c.name, email: c.email, phone: c.phone, whatsapp: c.whatsapp, signedUp: c.signedUp, internal: c.internal,
    headline: c.headline, wantsRoles: c.roles, cities: c.cities, remote: c.remote, rankScore: c.score, starred: c.star,
    teamNote: c.note, picks: c.picks, picksOpen: c.picksOpen, hired: c.hired, signals: c.s,
  });
}

export interface ListArgs { view: View; q: string; sort: SortKey; limit: number; offset: number; internal: boolean }

/** Cleans list arguments from a query string or an MCP call. Unknown values fall back to the defaults; never throws. */
export function cleanListArgs(a: Record<string, unknown>): ListArgs {
  const view = VIEW_KEYS.includes(a.view as View) ? (a.view as View) : "all";
  const sort = (SORT_KEYS as readonly string[]).includes(String(a.sort)) ? (a.sort as SortKey) : "rank";
  const n = (v: unknown, d: number, lo: number, hi: number) => { const x = Math.floor(Number(v)); return Number.isFinite(x) ? Math.min(hi, Math.max(lo, x)) : d; };
  const yes = (v: unknown) => v === true || v === "1" || v === "true" || v === 1;
  return {
    view, sort, q: typeof a.query === "string" ? a.query.slice(0, 200) : typeof a.q === "string" ? a.q.slice(0, 200) : "",
    limit: n(a.limit, 50, 1, 500), offset: n(a.offset, 0, 0, 1_000_000), internal: yes(a.include_internal ?? a.internal),
  };
}

export async function agentList(deps: AgentDeps, a: ListArgs) {
  const env = await deps.list(a.internal);
  const rows = deps.filter(env.customers, { view: a.view, q: a.q, sort: a.sort }, deps.now());
  const page = rows.slice(a.offset, a.offset + a.limit);
  return {
    env: env.env, dataAsOf: iso(env.at), view: a.view, query: a.q, sort: a.sort, total: rows.length, offset: a.offset,
    returned: page.length, nextOffset: a.offset + page.length < rows.length ? a.offset + page.length : null,
    customers: page.map(listRow), ...(env.notes?.length ? { notes: env.notes } : {}),
  };
}

const RESUME_CAP = 8000;
/** One customer's whole page. The resume text is capped unless fullResume (it can be long). */
export async function agentDetail(deps: AgentDeps, id: string, fullResume = false) {
  const d = await deps.detail(String(id || "").slice(0, 80));
  if (!d) return null;
  const text = d.resume?.text ?? null;
  const resume = { ...d.resume, text: text && !fullResume && text.length > RESUME_CAP ? text.slice(0, RESUME_CAP) + " [cut; ask with full_resume for all of it]" : text };
  return withIsoTimes({ customer: listRow(d.c), wants: d.wants, profile: d.profile, resume, firstCall: d.call, calls: d.calls, plan: d.plan,
    matches: d.matches, outreach: d.outreach, saidToStu: d.said, teamPicks: d.picks });
}

// ---------------------------------------------------------------- MCP (Streamable HTTP, stateless, JSON responses)

export const MCP_PROTOCOLS = ["2025-06-18", "2025-03-26", "2024-11-05"];
export const MCP_SERVER = { name: "stu-customers", version: "1.0.0" };
export const MCP_INSTRUCTIONS =
  "Read-only access to Studojo's Stu customers (the admin /customers page). Use list_customers to find people (by view, " +
  "search words, sort) and get_customer for one person's whole page: what they want, profile, resume, calls, matches, " +
  "outreach and replies, what they said to Stu, and the team's picks. " + ABOUT.rank +
  " This is customer personal data: use it only for Studojo work, and never post it publicly or paste it into other tools.";

export const MCP_TOOLS = [
  {
    name: "list_customers",
    description: "List Stu customers, ranked (starred first, then rank score) by default. " + ABOUT.rank + " Filter with a view and search words; page with limit/offset.",
    inputSchema: {
      type: "object",
      properties: {
        view: { type: "string", enum: [...VIEW_KEYS], description: Object.entries(ABOUT.views).map(([k, v]) => `${k}: ${v}`).join("; ") },
        query: { type: "string", description: "Every word must appear in the name, email, phone, headline, a wanted role, a city or the team note" },
        sort: { type: "string", enum: [...SORT_KEYS], description: Object.entries(ABOUT.sort).map(([k, v]) => `${k}: ${v}`).join("; ") },
        limit: { type: "integer", minimum: 1, maximum: 500, default: 50 },
        offset: { type: "integer", minimum: 0, default: 0 },
        include_internal: { type: "boolean", default: false, description: "Also staff, test and guest accounts (each says why in `internal`)" },
      },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  {
    name: "get_customer",
    description: "One customer's whole page by id (from list_customers): what they want (roles, cities, pay, notice), profile and resume, the call summary, calls, plan and orders, Stu's matches, their outreach and hiring-manager replies, what they said to Stu, and the team's picks.",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "The customer's id from list_customers" },
        full_resume: { type: "boolean", default: false, description: `The resume text is cut at ${RESUME_CAP} characters unless this is true` },
      },
      required: ["id"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
];

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: any };
const ok = (id: Rpc["id"], result: unknown) => ({ jsonrpc: "2.0", id: id ?? null, result });
const fail = (id: Rpc["id"], code: number, message: string) => ({ jsonrpc: "2.0", id: id ?? null, error: { code, message } });
const text = (v: unknown, isError = false) => ({ content: [{ type: "text", text: typeof v === "string" ? v : JSON.stringify(v, null, 1) }], ...(isError ? { isError: true } : {}) });

/** One JSON-RPC message in, its response out (null for a notification, which gets no response). Never throws. */
export async function mcpHandle(deps: AgentDeps, m: Rpc): Promise<object | null> {
  if (!m || typeof m !== "object" || typeof m.method !== "string") return fail(m?.id, -32600, "Invalid request");
  const isNote = m.id === undefined || m.id === null;
  try {
    switch (m.method) {
      case "initialize": {
        const want = String(m.params?.protocolVersion || "");
        return ok(m.id, { protocolVersion: MCP_PROTOCOLS.includes(want) ? want : MCP_PROTOCOLS[0], capabilities: { tools: { listChanged: false } },
          serverInfo: MCP_SERVER, instructions: MCP_INSTRUCTIONS });
      }
      case "ping":
        return ok(m.id, {});
      case "tools/list":
        return ok(m.id, { tools: MCP_TOOLS });
      case "tools/call": {
        const name = m.params?.name, args = (m.params?.arguments ?? {}) as Record<string, unknown>;
        if (name === "list_customers") return ok(m.id, text(await agentList(deps, cleanListArgs(args))));
        if (name === "get_customer") {
          if (!args.id) return ok(m.id, text("Give the customer's id (from list_customers).", true));
          const d = await agentDetail(deps, String(args.id), args.full_resume === true);
          return ok(m.id, d ? text(d) : text("No customer with that id. list_customers gives the ids.", true));
        }
        return fail(m.id, -32602, `Unknown tool: ${String(name)}`);
      }
      default:
        if (isNote || m.method.startsWith("notifications/")) return null;
        return fail(m.id, -32601, `Method not found: ${m.method}`);
    }
  } catch (e: any) {
    return m.method === "tools/call" ? ok(m.id, text(`Could not load the data: ${String(e?.message ?? e).slice(0, 200)}`, true)) : fail(m.id, -32603, "Internal error");
  }
}
