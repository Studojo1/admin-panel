// node --test scripts/
import { test } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { checkRoutes, checkSource } from "./check-api-auth.mjs";

const IMPORT = 'import { requireAdmin, adminOnly } from "~/lib/auth-helper.server";\n';

test("every real app/routes/api.*.tsx export is gated (AS-N01)", () => {
  const { files, problems } = checkRoutes(fileURLToPath(new URL("../app/routes", import.meta.url)));
  assert.ok(files.length > 20, "expected to find the API routes");
  assert.deepEqual(problems, []);
});

test("an ungated loader fails (the /api/posthog bug)", () => {
  const src = `export async function loader({ request }: { request: Request }) {
    const type = new URL(request.url).searchParams.get("type");
    return Response.json({ type });
  }`;
  const p = checkSource("api.posthog.tsx", src, {});
  assert.equal(p.length, 1);
  assert.match(p[0], /loader does not call requireAdmin/);
});

test("signed-in is not enough: getUserFromRequest alone fails (the /api/settings bug)", () => {
  const src = `import { getUserFromRequest } from "~/lib/auth-helper.server";
  export async function action({ request }) {
    const user = await getUserFromRequest(request);
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ ok: true });
  }`;
  assert.match(checkSource("api.settings.tsx", src, {})[0], /action does not call requireAdmin/);
});

test("gated loader and action pass; a gated local helper counts", () => {
  const src = IMPORT + `
  async function staffAuth(request: Request) {
    const user = await requireAdmin(request);
    return user ? { user } : { error: Response.json({}, { status: 401 }) };
  }
  export async function loader({ request }: Route.LoaderArgs) {
    const admin = await requireAdmin(request);
    if (!admin) return Response.json({ error: "Unauthorized" }, { status: 401 });
    return Response.json({ a: \`x \${"}"} y\` });
  }
  export async function action({ request }: Route.ActionArgs) {
    const auth = await staffAuth(request);
    if ("error" in auth) return auth.error;
    return Response.json({});
  }`;
  assert.deepEqual(checkSource("api.x.tsx", src, {}), []);
});

test("a gate call only in a comment or string does not count", () => {
  const src = IMPORT + `export async function loader({ request }) {
    // await requireAdmin(request);
    const s = "requireAdmin(request)";
    return Response.json({ s });
  }`;
  assert.equal(checkSource("api.x.tsx", src, {}).length, 1);
});

test("a local function named requireAdmin is rejected", () => {
  const src = `async function requireAdmin(request) { return true; }
  export async function loader({ request }) { if (!(await requireAdmin(request))) return new Response(null, { status: 401 }); return Response.json({}); }`;
  const p = checkSource("api.x.tsx", src, {});
  assert.ok(p.some((x) => /defines its own requireAdmin/.test(x)));
});

test("allowlist entries must keep their alternative check and must not go stale", () => {
  const allow = { "api.hook.tsx": { action: { reason: "shared secret", mustContain: 'get("x-alert-token")' } } };
  const ok = `export async function action({ request }) { if (request.headers.get("x-alert-token") !== T) return new Response(null, { status: 401 }); return Response.json({}); }`;
  assert.deepEqual(checkSource("api.hook.tsx", ok, allow), []);
  const lost = `export async function action({ request }) { return Response.json({}); }`;
  assert.match(checkSource("api.hook.tsx", lost, allow)[0], /no longer contains/);
  const gone = `export async function loader({ request }) { await requireAdmin(request); }` ;
  assert.ok(checkSource("api.hook.tsx", IMPORT + gone, allow).some((x) => /no longer exports/.test(x)));
});
