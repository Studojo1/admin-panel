// node --test scripts/sql-array-params.test.mjs
// ADMIN-AUDIT (14 Nov 2026): GET /api/settings?keys=n8n_blog_api_key answered 500 "malformed array literal". drizzle's
// sql`` turns a JS array into a list, "($1, $2)", so `= ANY(${keys})` became ANY(($1)). A list goes in with IN; an
// array literal goes in raw (sql.raw, lit(...), or a constant built with sql.raw). This checks the idiom and scans the
// app for a JS array handed to ANY or ALL.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";

const dialect = new PgDialect();

test("drizzle: a JS array is a list, so IN takes it and ANY does not", () => {
  const keys = ["n8n_blog_api_key", "other_key"];
  const inList = dialect.sqlToQuery(sql`SELECT key FROM platform_settings WHERE key IN ${keys}`);
  assert.equal(inList.sql, "SELECT key FROM platform_settings WHERE key IN ($1, $2)");
  assert.deepEqual(inList.params, keys);
  const any = dialect.sqlToQuery(sql`SELECT key FROM platform_settings WHERE key = ANY(${["one"]})`);
  assert.equal(any.sql, "SELECT key FROM platform_settings WHERE key = ANY(($1))", "the old form: a text, not an array");
});

// ANY(${...}) / ALL(${...}) is fine when what goes in is raw SQL: sql.raw(...), lit(...) (an ARRAY[...] literal), or an
// UPPER_CASE constant (a raw SQL fragment such as WISH_DIMS or PLAN_NOT_PAID).
const RAW_OK = /^(sql\.raw\(|lit\(|[A-Z][A-Z0-9_]*\})/;

function files(dir) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((f) => /\.(ts|tsx)$/.test(f) && !f.includes("+types"))
    .map((f) => join(dir, f));
}

test("no JS array is handed to ANY or ALL in a drizzle query", () => {
  const app = fileURLToPath(new URL("../app", import.meta.url));
  const bad = [];
  for (const f of files(app)) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/\b(?:ANY|ALL)\s*\(\s*\$\{\s*/gi)) {
      const rest = text.slice(m.index + m[0].length, m.index + m[0].length + 40);
      if (!RAW_OK.test(rest)) bad.push(`${f.slice(app.length + 1)}: ${text.slice(m.index, m.index + 50).split("\n")[0]}`);
    }
  }
  assert.deepEqual(bad, [], `a JS array in ANY/ALL becomes "($1)" (use IN \${list}, or an ARRAY literal via sql.raw):\n${bad.join("\n")}`);
});
