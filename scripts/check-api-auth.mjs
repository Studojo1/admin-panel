// Fails when an admin-panel API route can be called without an admin login.
//
// Every exported `loader` and `action` in app/routes/api.*.tsx must call the
// shared gate from ~/lib/auth-helper.server (requireAdmin or adminOnly),
// directly or through a local helper that does. Anything else has to be listed
// in ALLOWLIST with the reason it is safe.
//
// Why: /api/posthog shipped with no check at all and exposed every user's
// analytics and session replays to the internet (audit AS-N01), and
// /api/settings let any signed-in student overwrite platform API keys. Both
// looked like every other route; nothing caught them. This does.
//
// Run: node scripts/check-api-auth.mjs   (CI: .github/workflows/tests.yml)

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const GATES = ["requireAdmin", "adminOnly"];
const GATE_MODULE = "~/lib/auth-helper.server";

// file -> export -> { reason, mustContain }. mustContain proves the route still
// does the alternative check the reason describes.
export const ALLOWLIST = {
  "api.ops-alerts.tsx": {
    action: {
      reason: "in-cluster CronJob ingest; authenticated by the ALERT_INGEST_TOKEN shared secret, not a user login",
      mustContain: 'request.headers.get("x-alert-token")',
    },
  },
};

// Blank out comments and string/template contents (keeping ${...} code) so
// brace matching and call detection only see code.
export function stripNonCode(src) {
  let out = "";
  let i = 0;
  const stack = []; // "`" for template literal, "{" for code braces inside ${}
  const inTemplate = () => stack[stack.length - 1] === "`";
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (inTemplate()) {
      if (c === "\\") { out += "  "; i += 2; continue; }
      if (c === "`") { stack.pop(); out += c; i++; continue; }
      if (c === "$" && n === "{") { stack.push("{"); out += "${"; i += 2; continue; }
      out += c === "\n" ? "\n" : " ";
      i++;
      continue;
    }
    if (c === "/" && n === "/") {
      while (i < src.length && src[i] !== "\n") { out += " "; i++; }
      continue;
    }
    if (c === "/" && n === "*") {
      const end = src.indexOf("*/", i + 2);
      const stop = end === -1 ? src.length : end + 2;
      out += src.slice(i, stop).replace(/[^\n]/g, " ");
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < src.length && src[j] !== c && src[j] !== "\n") j += src[j] === "\\" ? 2 : 1;
      out += c + " ".repeat(Math.max(0, j - i - 1)) + c;
      i = j + 1;
      continue;
    }
    if (c === "`") { stack.push("`"); out += c; i++; continue; }
    if (c === "{" && stack.length) { stack.push("{"); out += c; i++; continue; }
    if (c === "}" && stack.length && stack[stack.length - 1] === "{") {
      stack.pop(); out += c; i++; continue;
    }
    out += c;
    i++;
  }
  return out;
}

// From the index of a function's "(" parameter list, return its body text.
function bodyAfterParams(code, openParen) {
  let depth = 0;
  let i = openParen;
  for (; i < code.length; i++) {
    if (code[i] === "(") depth++;
    else if (code[i] === ")" && --depth === 0) break;
  }
  const open = code.indexOf("{", i);
  if (open === -1) return null;
  // Between ")" and "{" only a simple return type and/or "=>" may appear;
  // anything else (e.g. an arrow with an expression body) is unsupported.
  if (!/^\)\s*(:[^{};=]*)?\s*(=>)?\s*$/.test(code.slice(i, open))) return null;
  depth = 0;
  for (let j = open; j < code.length; j++) {
    if (code[j] === "{") depth++;
    else if (code[j] === "}" && --depth === 0) return code.slice(open, j + 1);
  }
  return null;
}

// name -> body for every function declared in the file (declarations and
// `const x = async (...) => {...}`).
function functionBodies(code) {
  const out = {};
  const decl = /(?:^|[^\w$.])(?:async\s+)?function\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]*>)?\s*\(/g;
  for (let m; (m = decl.exec(code)); ) {
    const body = bodyAfterParams(code, m.index + m[0].length - 1);
    if (body) out[m[1]] = body;
  }
  const arrow = /(?:const|let)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s*)?\(/g;
  for (let m; (m = arrow.exec(code)); ) {
    const body = bodyAfterParams(code, m.index + m[0].length - 1);
    if (body) out[m[1]] = body;
  }
  return out;
}

const calls = (body, names) => names.some((n) => new RegExp(`(?<![\\w$.])${n}\\s*\\(`).test(body));

/** Problems for one route file; [] means every export is gated. */
export function checkSource(file, src, allowlist = ALLOWLIST) {
  const problems = [];
  const code = stripNonCode(src);
  const allowed = allowlist[file] ?? {};

  const exported = new Set();
  for (const m of code.matchAll(/export\s+(?:async\s+)?function\s+(loader|action)\b/g)) exported.add(m[1]);
  for (const m of code.matchAll(/export\s+(?:const|let)\s+(loader|action)\b/g)) exported.add(m[1]);
  if (/export\s*\{[^}]*\b(loader|action)\b[^}]*\}/.test(code)) {
    problems.push(`${file}: re-exports loader/action; declare it in the file so it can be checked`);
  }

  // The gate must be the shared one, not a same-named local copy.
  const importRe = new RegExp(`import\\s*\\{([^}]*)\\}\\s*from\\s*["']${GATE_MODULE.replace(/[.~/]/g, "\\$&")}["']`);
  const importLine = src.match(importRe);
  const imported = importLine ? GATES.filter((g) => new RegExp(`\\b${g}\\b`).test(importLine[1])) : [];
  const bodies = functionBodies(code);
  for (const g of GATES) {
    if (bodies[g]) problems.push(`${file}: defines its own ${g}(); import the shared one from ${GATE_MODULE}`);
  }

  // Local helpers that call the gate count as the gate (to a fixed point).
  const gates = [...imported];
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, body] of Object.entries(bodies)) {
      if (name === "loader" || name === "action" || gates.includes(name)) continue;
      if (calls(body, gates)) { gates.push(name); changed = true; }
    }
  }

  for (const name of exported) {
    const body = bodies[name];
    const allow = allowed[name];
    if (allow) {
      if (!body || !body.length || !src.includes(allow.mustContain)) {
        problems.push(`${file}: ${name} is allowlisted (${allow.reason}) but no longer contains ${allow.mustContain}`);
      } else if (gates.length && body && calls(body, gates)) {
        problems.push(`${file}: ${name} now calls the admin gate; remove it from ALLOWLIST`);
      }
      continue;
    }
    if (!body) {
      problems.push(`${file}: could not read the body of ${name}; declare it as \`export async function ${name}(...) {...}\``);
      continue;
    }
    if (!gates.length || !calls(body, gates)) {
      problems.push(`${file}: ${name} does not call requireAdmin/adminOnly from ${GATE_MODULE}. It must not be callable without an admin login. Add the gate, or add it to ALLOWLIST in scripts/check-api-auth.mjs with the reason it is safe.`);
    }
  }
  for (const name of Object.keys(allowed)) {
    if (!exported.has(name)) problems.push(`${file}: ALLOWLIST names ${name}, which the file no longer exports; remove the entry`);
  }
  return problems;
}

/** Problems across app/routes/api.*.tsx. */
export function checkRoutes(routesDir, allowlist = ALLOWLIST) {
  const files = readdirSync(routesDir).filter((f) => /^api\..*\.tsx?$/.test(f)).sort();
  const problems = [];
  for (const f of files) problems.push(...checkSource(f, readFileSync(join(routesDir, f), "utf8"), allowlist));
  for (const f of Object.keys(allowlist)) {
    if (!files.includes(f)) problems.push(`ALLOWLIST names ${f}, which does not exist; remove the entry`);
  }
  return { files, problems };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const routesDir = fileURLToPath(new URL("../app/routes", import.meta.url));
  const { files, problems } = checkRoutes(routesDir);
  if (problems.length) {
    console.error(problems.map((p) => `✗ ${p}`).join("\n"));
    console.error(`\n${problems.length} unauthenticated API export(s) in ${files.length} route files.`);
    process.exit(1);
  }
  console.log(`✓ all ${files.length} app/routes/api.*.tsx loaders/actions require an admin login (or are allowlisted with a reason)`);
}
