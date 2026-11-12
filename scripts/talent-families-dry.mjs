// DATABASE_URL=... node scripts/talent-families-dry.mjs [--internal] [--seed N] [--sample 40]
// TALENT-NET (12 Nov 2026, the owner: "need our mapping to be more accurate and on the top show a bar with total number
// of students, the graph should be like a neural network, where if i click then go deeper to see each student"): a dry
// run of the career families against a real database, read only. It loads the pool with the page's own loader
// (app/lib/talent/talent.server.ts: one read-only transaction, 15 s statement timeout) and prints the family and role
// counts, the share in "Not enough data", the words that landed in "Other roles" (what the taxonomy does not know yet)
// and a random sample of students as an 8-character id prefix, the wanted roles, the course, then family and role. It
// never prints a name, an email address or a phone number, and writes nothing.
// Needs Node 22.15 or later (it runs the TypeScript as is, with a resolver for the app's "~/" paths).
import { existsSync, statSync } from "node:fs";
import { registerHooks } from "node:module";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const file = (base) => ["", ".ts", ".tsx", "/index.ts"].map((x) => base + x).find((p) => existsSync(p) && statSync(p).isFile());
registerHooks({
  resolve(spec, ctx, next) {
    const from = ctx.parentURL?.startsWith("file:") ? fileURLToPath(ctx.parentURL) : null;
    const f = spec.startsWith("~/") ? file(resolve(root, "app", spec.slice(2)))
      : /^\.\.?\//.test(spec) && from && /\.tsx?$/.test(from) ? file(resolve(dirname(from), spec)) : null;
    return f ? { url: pathToFileURL(f).href, shortCircuit: true } : next(spec, ctx);
  },
});

const arg = (k, d) => {
  const i = process.argv.indexOf(k);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : d;
};
if (!process.env.DATABASE_URL) {
  console.error("Set DATABASE_URL first (a read-only user is best). Nothing was read.");
  process.exit(1);
}

const { talentPool } = await import("../app/lib/talent/talent.server.ts");
const { famLabel, netOf, placeOf } = await import("../app/lib/talent/families.ts");
const { scrubContacts, skillsOf } = await import("../app/lib/talent/model.ts");

const t0 = Date.now();
const pool = await talentPool(process.argv.includes("--internal"), true);
const placed = pool.map((c) => ({ c, p: placeOf(c, skillsOf(c)) }));
const net = netOf(placed.map((x) => x.p));
const fmt = (n) => n.toLocaleString("en-IN");
const pc = (n, of) => `${of ? ((n / of) * 100).toFixed(1) : "0.0"}%`;
const pad = (s, n) => (s.length >= n ? `${s.slice(0, n - 1)}… ` : s.padEnd(n));
const clean = (s) => scrubContacts(String(s ?? "")).replace(/\s+/g, " ").trim();

const call = pool.filter((c) => c.source === "call").length;
console.log(`Talent families dry run, read only. ${fmt(pool.length)} students (${fmt(call)} took the call, ${fmt(pool.length - call)} old product), loaded and placed in ${((Date.now() - t0) / 1000).toFixed(1)} s.`);
const none = net.families.find((f) => f.key === "none");
console.log(`Not enough data: ${fmt(none?.n ?? 0)} (${pc(none?.n ?? 0, net.n)})${none ? `: ${none.roles.map((r) => `${r.label} ${fmt(r.n)}`).join(", ")}` : ""}`);
const unsaid = placed.filter((x) => x.p.role.endsWith("/unsaid")).length;
console.log(`Placed by course or skills only (role not said): ${fmt(unsaid)} (${pc(unsaid, net.n)})`);
const withAlso = placed.filter((x) => x.p.also.length).length;
console.log(`With a second fit: ${fmt(withAlso)} (${pc(withAlso, net.n)})\n`);

console.log("Families and roles");
for (const f of net.families) {
  const old = placed.filter((x) => x.p.family === f.key && x.c.source === "old").length;
  console.log(`  ${pad(f.label, 32)}${fmt(f.n).padStart(7)}  ${pc(f.n, net.n).padStart(6)}   (${fmt(f.n - old)} call, ${fmt(old)} old)`);
  const roles = f.key === "other" ? f.roles.slice(0, 30) : f.roles;
  for (const r of roles) console.log(`      ${pad(r.label, 34)}${fmt(r.n).padStart(6)}`);
  if (f.key === "other" && f.roles.length > 30) console.log(`      ...and ${fmt(f.roles.length - 30 + f.moreRoles)} more Other roles`);
  if (f.key !== "other" && f.moreRoles) console.log(`      ...and ${fmt(f.moreRoles)} more roles`);
}

// A seeded shuffle, so a run can be repeated with --seed.
let seed = Number(arg("--seed", String(Date.now() % 2147483647))) || 1;
const rnd = () => ((seed = (seed * 48271) % 2147483647) / 2147483647);
const sample = [...placed];
for (let i = sample.length - 1; i > 0; i--) {
  const j = Math.floor(rnd() * (i + 1));
  [sample[i], sample[j]] = [sample[j], sample[i]];
}
const k = Math.min(sample.length, Number(arg("--sample", "40")) || 40);
console.log(`\n${k} random students (seed ${arg("--seed", "random")}): id | wanted roles | course | family / role`);
for (const { c, p } of sample.slice(0, k)) {
  const wanted = clean(c.rolesWanted.join(", ")) || "(none)";
  const course = clean([c.course, c.degree].filter(Boolean).filter((x, i, a) => a.indexOf(x) === i).join("; ")) || "(none)";
  console.log(`  ${c.id.slice(0, 8)} | ${pad(wanted, 44)}| ${pad(course, 30)}| ${famLabel(p.family)} / ${p.roleName}`);
}
process.exit(0);
