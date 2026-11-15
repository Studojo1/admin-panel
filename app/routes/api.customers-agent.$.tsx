// A teammate's Claude reading /customers (CUSTOMERS AGENT, 15 Nov 2026). Not an admin login: the CUSTOMERS_AGENT_KEY
// shared key (app/lib/customers/agent.server.ts). READ ONLY: GET only, nothing is written.
//
// GET /api/customers-agent                         what this is, the views, the rank, the endpoints
// GET /api/customers-agent/customers               ?view=all|starred|yes|paid|active|unhappy|picks &q= &sort=rank|recent|new
//                                                  &limit=1..500 (50) &offset= &include_internal=1
// GET /api/customers-agent/customers/<id>          one customer's whole page (&full_resume=1 for the whole resume text)
import type { Route } from "./+types/api.customers-agent.$";
import { ABOUT, agentDetail, agentList, cleanListArgs } from "~/lib/customers/agent";
import { agentDeps, agentDenied, agentJson, customersKeyOk, logAgent } from "~/lib/customers/agent.server";

export async function loader({ request, params }: Route.LoaderArgs) {
  if (!customersKeyOk(request)) return agentDenied();
  const [what, id] = String(params["*"] ?? "").split("/").filter(Boolean);
  const qs = Object.fromEntries(new URL(request.url).searchParams);
  try {
    if (!what) {
      logAgent("api", "about");
      return agentJson({ ...ABOUT, endpoints: {
        list: "GET /api/customers-agent/customers?view=&q=&sort=&limit=&offset=&include_internal=1",
        detail: "GET /api/customers-agent/customers/<id>?full_resume=1",
        mcp: "POST /mcp/customers (MCP, Streamable HTTP; same key)",
      } });
    }
    if (what === "customers" && !id) {
      const a = cleanListArgs(qs);
      logAgent("api", `list view=${a.view} sort=${a.sort} limit=${a.limit} offset=${a.offset}${a.q ? " q" : ""}`);
      return agentJson(await agentList(agentDeps, a));
    }
    if (what === "customers" && id) {
      logAgent("api", "detail");
      const d = await agentDetail(agentDeps, id, qs.full_resume === "1" || qs.full_resume === "true");
      return d ? agentJson(d) : agentJson({ error: "No customer with that id. GET /api/customers-agent/customers lists them." }, 404);
    }
    return agentJson({ error: "Not found. GET /api/customers-agent lists the endpoints." }, 404);
  } catch (err: any) {
    console.error("[api/customers-agent]", err?.message ?? err);
    return agentJson({ error: "Could not load the data. Try again in a minute." }, 500);
  }
}

export async function action({ request }: Route.ActionArgs) {
  if (!customersKeyOk(request)) return agentDenied();
  return agentJson({ error: "Read only: use GET." }, 405);
}
