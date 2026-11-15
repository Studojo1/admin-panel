// node --test scripts/customers-agent.test.mjs
// CUSTOMERS AGENT (15 Nov 2026): the read-only views of /customers for a teammate's Claude (app/lib/customers/agent.ts):
// list arguments, paging, ISO times, the resume cap, and the MCP protocol (initialize, tools/list, tools/call,
// notifications, errors). Every person here is made up.
import { test } from "node:test";
import assert from "node:assert/strict";
import { agentDetail, agentList, cleanListArgs, mcpHandle, MCP_TOOLS, withIsoTimes } from "../app/lib/customers/agent.ts";
import { filterCustomers, NO_SIGNALS } from "../app/lib/customers/model.ts";

const NOW = Date.parse("2026-11-15T10:00:00Z");
const person = (id, over = {}) => ({
  id, name: `Person ${id}`, email: `p${id}@example.com`, phone: null, whatsapp: false, signedUp: NOW - 5 * 86_400_000, internal: null,
  headline: "Aspiring analyst", roles: ["Data Analyst"], cities: ["Pune"], remote: false, s: { ...NO_SIGNALS }, score: 0, star: false,
  note: "", picks: 0, picksOpen: 0, hired: false, ...over,
});
const PEOPLE = [
  person("a", { score: 30, s: { ...NO_SIGNALS, posReplies: 2 } }),
  person("b", { score: 10, star: true }),
  person("c", { score: 50, s: { ...NO_SIGNALS, paid: "pack" } }),
  person("d", { score: 5, internal: "staff" }),
];
const DETAIL = {
  c: PEOPLE[0], wants: { roles: ["Data Analyst"] }, profile: { skills: ["SQL"] }, resume: { file: "cv.pdf", text: "x".repeat(9000) },
  call: { at: NOW - 3_600_000, minutes: 12, summary: "Wants analyst roles in Pune" }, calls: [], plan: { plan: null, grants: [], orders: [] },
  matches: { counts: {}, top: [] }, outreach: [{ company: "Acme", title: "Analyst", to: "hm@acme.example", status: "replied", started: NOW - 86_400_000, replied: NOW, tag: "positive", reply: "Send your CV", sent: 1 }],
  said: [], picks: [{ id: 1, company: "Acme", role: "Analyst", link: "", contact: "", note: "", status: "idea", createdAt: NOW, updatedAt: NOW, by: "team" }],
};
const deps = {
  list: async (internal) => ({ env: "test", at: NOW, ms: 1, customers: internal ? PEOPLE : PEOPLE.filter((p) => !p.internal) }),
  detail: async (id) => (id === "a" ? DETAIL : null),
  filter: filterCustomers,
  now: () => NOW,
};

test("list arguments: defaults, clamps and unknown values never throw", () => {
  assert.deepEqual(cleanListArgs({}), { view: "all", sort: "rank", q: "", limit: 50, offset: 0, internal: false });
  const a = cleanListArgs({ view: "paid", sort: "new", limit: "9999", offset: "-3", query: "pune", include_internal: true });
  assert.deepEqual(a, { view: "paid", sort: "new", q: "pune", limit: 500, offset: 0, internal: true });
  assert.equal(cleanListArgs({ view: "everyone!", sort: 7 }).view, "all");
  assert.equal(cleanListArgs({ q: "x".repeat(500) }).q.length, 200);
});

test("list: rank order (starred first), internal hidden unless asked, paging with nextOffset", async () => {
  const all = await agentList(deps, cleanListArgs({}));
  assert.deepEqual(all.customers.map((c) => c.id), ["b", "c", "a"]);
  assert.equal(all.total, 3);
  assert.equal((await agentList(deps, cleanListArgs({ include_internal: "1" }))).total, 4);
  const p1 = await agentList(deps, cleanListArgs({ limit: 2 }));
  assert.equal(p1.returned, 2); assert.equal(p1.nextOffset, 2);
  const p2 = await agentList(deps, cleanListArgs({ limit: 2, offset: 2 }));
  assert.equal(p2.returned, 1); assert.equal(p2.nextOffset, null);
  assert.deepEqual((await agentList(deps, cleanListArgs({ view: "yes" }))).customers.map((c) => c.id), ["a"]);
  assert.equal(all.customers[0].signedUp, new Date(NOW - 5 * 86_400_000).toISOString());
});

test("detail: ISO times, resume cut at 8000 unless full_resume, unknown id is null", async () => {
  const d = await agentDetail(deps, "a");
  assert.equal(d.firstCall.at, new Date(NOW - 3_600_000).toISOString());
  assert.equal(d.outreach[0].replied, new Date(NOW).toISOString());
  assert.ok(d.resume.text.length < 8100 && d.resume.text.includes("[cut"));
  assert.equal((await agentDetail(deps, "a", true)).resume.text.length, 9000);
  assert.equal(await agentDetail(deps, "nobody"), null);
  assert.deepEqual(withIsoTimes({ at: 0, x: { updatedAt: NOW } }), { at: null, x: { updatedAt: new Date(NOW).toISOString() } });
});

test("MCP: initialize echoes a supported protocol, tools/list has the two read-only tools", async () => {
  const init = await mcpHandle(deps, { jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-03-26" } });
  assert.equal(init.result.protocolVersion, "2025-03-26");
  assert.equal(init.result.serverInfo.name, "stu-customers");
  assert.ok(init.result.capabilities.tools);
  const odd = await mcpHandle(deps, { jsonrpc: "2.0", id: 2, method: "initialize", params: { protocolVersion: "1999-01-01" } });
  assert.equal(odd.result.protocolVersion, "2025-06-18");
  const list = await mcpHandle(deps, { jsonrpc: "2.0", id: 3, method: "tools/list" });
  assert.deepEqual(list.result.tools.map((t) => t.name), ["list_customers", "get_customer"]);
  assert.ok(MCP_TOOLS.every((t) => t.annotations.readOnlyHint === true));
});

test("MCP: tools/call returns text content; bad ids and unknown tools are clear errors", async () => {
  const r = await mcpHandle(deps, { jsonrpc: "2.0", id: 4, method: "tools/call", params: { name: "list_customers", arguments: { view: "paid" } } });
  const body = JSON.parse(r.result.content[0].text);
  assert.deepEqual(body.customers.map((c) => c.id), ["c"]);
  const d = await mcpHandle(deps, { jsonrpc: "2.0", id: 5, method: "tools/call", params: { name: "get_customer", arguments: { id: "a" } } });
  assert.equal(JSON.parse(d.result.content[0].text).customer.id, "a");
  const miss = await mcpHandle(deps, { jsonrpc: "2.0", id: 6, method: "tools/call", params: { name: "get_customer", arguments: { id: "zzz" } } });
  assert.equal(miss.result.isError, true);
  const none = await mcpHandle(deps, { jsonrpc: "2.0", id: 7, method: "tools/call", params: { name: "get_customer", arguments: {} } });
  assert.equal(none.result.isError, true);
  const unk = await mcpHandle(deps, { jsonrpc: "2.0", id: 8, method: "tools/call", params: { name: "delete_everyone" } });
  assert.equal(unk.error.code, -32602);
});

test("MCP: notifications get no response, unknown methods -32601, data errors become tool errors", async () => {
  assert.equal(await mcpHandle(deps, { jsonrpc: "2.0", method: "notifications/initialized" }), null);
  assert.equal((await mcpHandle(deps, { jsonrpc: "2.0", id: 9, method: "resources/list" })).error.code, -32601);
  assert.equal((await mcpHandle(deps, { nope: true })).error.code, -32600);
  const broken = { ...deps, list: async () => { throw new Error("database down"); } };
  const r = await mcpHandle(broken, { jsonrpc: "2.0", id: 10, method: "tools/call", params: { name: "list_customers", arguments: {} } });
  assert.equal(r.result.isError, true);
  assert.match(r.result.content[0].text, /database down/);
  assert.deepEqual((await mcpHandle(deps, { jsonrpc: "2.0", id: 11, method: "ping" })).result, {});
});
