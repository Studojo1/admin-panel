// MCP server for /customers (CUSTOMERS AGENT, 15 Nov 2026): a teammate's Claude adds it with
//   claude mcp add --transport http stu-customers https://admin.studojo.com/mcp/customers --header "Authorization: Bearer <key>"
// Streamable HTTP, stateless: every POST carries one JSON-RPC message (or a batch) and gets JSON back; no sessions, no
// server-sent events (GET answers 405, which the spec allows). Same CUSTOMERS_AGENT_KEY as /api/customers-agent. Read only:
// two tools, list_customers and get_customer (app/lib/customers/agent.ts).
import type { Route } from "./+types/mcp.customers";
import { mcpHandle } from "~/lib/customers/agent";
import { agentDeps, agentDenied, customersKeyOk, logAgent } from "~/lib/customers/agent.server";

const rpc = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export async function loader({ request }: Route.LoaderArgs) {
  if (!customersKeyOk(request)) return agentDenied();
  return new Response(null, { status: 405, headers: { Allow: "POST" } });
}

export async function action({ request }: Route.ActionArgs) {
  if (!customersKeyOk(request)) return agentDenied();
  if (request.method === "DELETE") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  if (request.method !== "POST") return new Response(null, { status: 405, headers: { Allow: "POST" } });
  const body = await request.json().catch(() => undefined);
  if (body === undefined) return rpc({ jsonrpc: "2.0", id: null, error: { code: -32700, message: "Parse error" } }, 400);
  const msgs = Array.isArray(body) ? body : [body];
  for (const m of msgs) if (m && typeof m === "object" && typeof (m as any).method === "string") {
    const mm = m as any;
    logAgent("mcp", mm.method === "tools/call" ? `tools/call ${String(mm.params?.name)}` : mm.method);
  }
  const out = (await Promise.all(msgs.map((m) => mcpHandle(agentDeps, m as any)))).filter((r) => r !== null);
  if (!out.length) return new Response(null, { status: 202 });
  return rpc(Array.isArray(body) ? out : out[0]);
}
