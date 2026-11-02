import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (p) => readFileSync(new URL(`../app/${p}`, import.meta.url), "utf8");

test("ticket reply email goes only to sensei tickets", () => {
  const src = read("routes/api.tickets.$id.messages.tsx");
  const calls = src.match(/await notifyUserOfReply\(/g) || [];
  assert.equal(calls.length, 1);
  const guard = src.indexOf('ticket.source === "sensei"');
  assert.ok(guard > 0, "sensei guard missing");
  assert.ok(guard < src.indexOf("await notifyUserOfReply("), "email call must follow the guard");
  assert.match(src, /let emailed = false/);
  assert.match(src, /SELECT id, user_email, user_name, source FROM tickets/);
  assert.match(src, /requireAdmin\(request\)/);
});

test("chat-logs lives under /old only", () => {
  const src = read("routes.ts");
  const oldStart = src.indexOf('...prefix("old"');
  assert.ok(oldStart > 0);
  const root = src.slice(0, oldStart);
  const old = src.slice(oldStart);
  assert.ok(!root.includes('"chat-logs"') && !root.includes('"api/chat-logs"'));
  assert.ok(old.includes('route("chat-logs", "routes/chat-logs.tsx")'));
  assert.ok(old.includes('route("api/chat-logs", "routes/api.chat-logs.tsx")'));
  assert.match(read("routes/chat-logs.tsx"), /\/old\/api\/chat-logs/);
});

test("api.chat-logs still requires admin", () => {
  assert.match(read("routes/api.chat-logs.tsx"), /requireAdmin/);
});
