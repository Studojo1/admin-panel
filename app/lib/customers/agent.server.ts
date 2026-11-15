// CUSTOMERS AGENT (15 Nov 2026): the key check and the real data for /api/customers-agent and /mcp/customers (agent.ts
// has the logic). Not an admin login: a shared key in CUSTOMERS_AGENT_KEY (app-secrets/customers-agent-key), sent as
// "Authorization: Bearer <key>". Read only. Switch it off by removing the key from app-secrets (the routes then refuse
// everyone) or rotate it by putting a new one there and rolling the deployment.
import { timingSafeEqual } from "node:crypto";
import { customerDetail, customersList } from "./customers.server";
import { filterCustomers } from "./model";
import type { AgentDeps } from "./agent";

export function customersKeyOk(request: Request): boolean {
  const want = process.env.CUSTOMERS_AGENT_KEY || "";
  const got = (request.headers.get("authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (want.length < 32) return false;
  const a = Buffer.from(got), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const agentDeps: AgentDeps = {
  list: (internal) => customersList(internal, false),
  detail: customerDetail,
  filter: filterCustomers,
  now: () => Date.now(),
};

/** One line per request, never any customer data: when, which door, what was asked. */
export function logAgent(door: "api" | "mcp", what: string): void {
  console.log(JSON.stringify({ at: new Date().toISOString(), customersAgent: door, what: what.slice(0, 120) }));
}

export const agentJson = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body, null, 1), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export const agentDenied = () => agentJson({ error: "Missing or wrong key. Send it as the header Authorization: Bearer <key>." }, 401);
