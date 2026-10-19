// Fails when a file in app/routes/ is not listed in app/routes.ts.
//
// This app routes from an explicit list, not from file names. A route file
// missing from that list is never served: every request to it gets a 404.
// /api/journeys shipped like that on 19 Jun 2026. The journeys page caught the
// error silently, so for four months it drew its funnel without the server
// stages it said it used. Nothing noticed. This does.
//
// Run: node scripts/check-routes-registered.mjs   (CI: .github/workflows/tests.yml)

import { readdirSync, readFileSync } from "node:fs";
import { join, sep } from "node:path";
import { fileURLToPath } from "node:url";

// Files known to be unrouted, with what to do about them. Remove an entry when
// the file is routed or deleted; never add one to silence a new file.
export const KNOWN_UNROUTED = {
  "api.companies.tsx": "never routed (found 19 Oct 2026): route it or delete it",
  "api.partner-users.tsx": "never routed (found 19 Oct 2026): route it or delete it",
  "api.partner-users.$id.tsx": "never routed (found 19 Oct 2026): route it or delete it",
  "partner-users.tsx": "never routed (found 19 Oct 2026): route it or delete it",
  "partner-users/$id.tsx": "never routed (found 19 Oct 2026): route it or delete it",
  "partner-users/new.tsx": "never routed (found 19 Oct 2026): route it or delete it",
};

// `files` are paths under app/routes/ with forward slashes ("api.journeys.tsx", "partner-users/new.tsx").
export function unrouted(routesTs, files) {
  const listed = new Set([...routesTs.matchAll(/["']routes\/([^"']+\.tsx)["']/g)].map((m) => m[1]));
  return files.filter((f) => f.endsWith(".tsx") && !listed.has(f) && !(f in KNOWN_UNROUTED));
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const app = join(fileURLToPath(new URL("..", import.meta.url)), "app");
  const routesTs = readFileSync(join(app, "routes.ts"), "utf8");
  const files = readdirSync(join(app, "routes"), { recursive: true }).map((f) => String(f).split(sep).join("/"));
  const missing = unrouted(routesTs, files);
  const stale = Object.keys(KNOWN_UNROUTED).filter((f) => !files.includes(f) || routesTs.includes(`routes/${f}`));
  if (missing.length) {
    console.error("✗ route files not listed in app/routes.ts (every request to them is a 404):");
    for (const f of missing) console.error(`  app/routes/${f}`);
    process.exit(1);
  }
  if (stale.length) {
    console.error("✗ KNOWN_UNROUTED lists files that are now routed or gone; remove them from the list:");
    for (const f of stale) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("✓ every app/routes/*.tsx file is listed in app/routes.ts (or known and listed above)");
}
