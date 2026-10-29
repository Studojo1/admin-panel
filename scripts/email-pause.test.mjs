// node --test scripts/email-pause.test.mjs
// EMAIL-PAUSE (29 Oct 2026): the owner ordered every email this app sends by
// itself switched off. The helper must hold by default, and sendDirectGmail
// (ticket replies to users) must ask it before sending.
// Imports the TypeScript source directly: Node 22.18+ strips the types itself.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { emailsPaused } from "../app/lib/email-pause.server.ts";

function withEnv(value, fn) {
  const saved = process.env.EMAILS_PAUSED;
  try {
    if (value === undefined) delete process.env.EMAILS_PAUSED;
    else process.env.EMAILS_PAUSED = value;
    return fn();
  } finally {
    if (saved === undefined) delete process.env.EMAILS_PAUSED;
    else process.env.EMAILS_PAUSED = saved;
  }
}

test("paused by default: unset or anything but 0 holds", () => {
  assert.equal(withEnv(undefined, emailsPaused), true);
  for (const v of ["", "1", "true", "false", "no", "00"]) {
    assert.equal(withEnv(v, emailsPaused), true, `EMAILS_PAUSED=${JSON.stringify(v)}`);
  }
});

test("only EMAILS_PAUSED=0 lifts the pause", () => {
  assert.equal(withEnv("0", emailsPaused), false);
});

test("sendDirectGmail checks the pause before it sends", () => {
  const src = readFileSync(new URL("../app/lib/gmail-direct.server.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export async function sendDirectGmail("));
  const gate = fn.indexOf("if (emailsPaused())");
  assert.ok(gate > 0, "sendDirectGmail must check emailsPaused()");
  assert.ok(gate < fn.indexOf("sendMail("), "the pause check must come before sendMail");
});
