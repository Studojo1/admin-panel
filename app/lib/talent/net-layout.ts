// TALENT-NET (12 Nov 2026, the owner: "the graph should be like a neural network, where if i click then go deeper to see
// each student"). Where the Talent network's nodes and edges sit, pure: columns left to right (everyone, the families,
// the open family's roles, the open role's students), node size by count, edge thickness by count, the open path lit.
// On a narrow screen only the open node and its children show, so the names stay readable. Deterministic; no imports
// but types, so node --test runs it (scripts/talent-families.test.mjs).
import type { Net } from "./families";

export type NodeKind = "pool" | "fam" | "role" | "more" | "student" | "show";
export interface LNode {
  id: string; // fam:<key>, role:<key>, stu:<id>, pool, more, show
  kind: NodeKind;
  key: string; // the family or role key, the student id
  x: number;
  y: number;
  r: number;
  label: string;
  count: string; // "1,240" or ""
  /** Where the label ends, so an edge out of this node starts after it. */
  end: number;
  on: boolean; // on the open path, or nothing is open in its column
  open: boolean; // the open family or role
}
export interface LEdge { id: string; d: string; w: number; on: boolean; to: string }
export interface LCol { x: number; title: string; hint: string | null }
export interface NetLayout { w: number; h: number; nodes: LNode[]; edges: LEdge[]; cols: LCol[] }
export interface NetOpts {
  narrow: boolean;
  allRoles: boolean;
  /** Whether "show more" can add students (the page holds the best 60); by default, while fewer than total show. */
  more?: boolean;
}

const FONT_W = 7.6; // average width of a 14 px bold character
const COUNT_W = 7;
const fmt = (n: number) => n.toLocaleString("en-IN");
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);
export const labelWidth = (label: string, count: string) => label.length * FONT_W + (count ? 6 + count.length * COUNT_W : 0);

const WIDE = { w: 960, pool: 50, fam: 160, role: 440, stu: [748, 858], famChars: 18, roleChars: 26, nameChars: 10 };
const NARROW = { w: 440, parent: 34, child: 128, chars: 26, nameChars: 22 };
const TOP = 46;
const BOTTOM = 18;
const ROW = { fam: 30, role: 30, stu: 26 };
export const ROLES_SHOWN = 13;
const PAGE_STEP = 12;

const curve = (x1: number, y1: number, x2: number, y2: number) => {
  const m = (x1 + x2) / 2;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}C${m.toFixed(1)} ${y1.toFixed(1)} ${m.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
};

/**
 * The picture for a network, the open family and role, and the students to show (best first, as the list ranks
 * them; `total` is how many the open role has). Every column is centred in the height of the tallest one.
 */
export function netLayout(
  net: Net, sel: { fam: string | null; role: string | null }, students: { id: string; name: string }[], total: number, o: NetOpts,
): NetLayout {
  const fam = net.families.find((f) => f.key === sel.fam) ?? null;
  const roles = fam ? fam.roles : [];
  const tooMany = roles.length + (fam?.moreRoles ? 1 : 0) > ROLES_SHOWN + 1;
  const shownRoles = fam && tooMany && !o.allRoles ? roles.slice(0, ROLES_SHOWN) : roles;
  const hidden = fam ? roles.length - shownRoles.length + fam.moreRoles : 0;
  const role = fam ? roles.find((r) => r.key === sel.role) ?? null : null;
  const stu = role ? students : [];
  const more = !!role && (o.more ?? total > stu.length);
  const maxFam = Math.max(1, ...net.families.map((f) => f.n));
  const maxRole = Math.max(1, ...roles.map((r) => r.n));
  const nodes: LNode[] = [];
  const edges: LEdge[] = [];
  const cols: LCol[] = [];

  const famNode = (f: Net["families"][number], x: number, y: number, chars: number): LNode => {
    const label = clip(f.short, chars);
    const count = fmt(f.n);
    const r = 4 + 9 * Math.sqrt(f.n / maxFam);
    return { id: `fam:${f.key}`, kind: "fam", key: f.key, x, y, r, label, count, end: x + r + 8 + labelWidth(label, count), on: !fam || fam.key === f.key, open: fam?.key === f.key };
  };
  const roleNode = (rl: { key: string; label: string; n: number }, x: number, y: number, chars: number): LNode => {
    const label = clip(rl.label, chars);
    const count = fmt(rl.n);
    const r = 4 + 8 * Math.sqrt(rl.n / maxRole);
    return { id: `role:${rl.key}`, kind: "role", key: rl.key, x, y, r, label, count, end: x + r + 8 + labelWidth(label, count), on: !role || role.key === rl.key, open: role?.key === rl.key };
  };
  const moreNode = (x: number, y: number): LNode => {
    const label = o.allRoles ? "Fewer roles" : `${fmt(hidden)} more role${hidden === 1 ? "" : "s"}`;
    return { id: "more", kind: "more", key: "more", x, y, r: 4, label, count: "", end: x + 12 + labelWidth(label, ""), on: true, open: false };
  };
  const stuNode = (s: { id: string; name: string }, x: number, y: number, chars: number): LNode => {
    const label = clip(s.name, chars);
    return { id: `stu:${s.id}`, kind: "student", key: s.id, x, y, r: 6.5, label, count: "", end: x + 14 + labelWidth(label, ""), on: true, open: false };
  };
  const showNode = (x: number, y: number): LNode => {
    const label = `Show ${PAGE_STEP} more`;
    return { id: "show", kind: "show", key: "show", x, y, r: 4, label, count: "", end: x + 12 + labelWidth(label, ""), on: true, open: false };
  };

  /** y of row i of n, the column centred in a canvas of height h. */
  const rowY = (i: number, n: number, row: number, h: number) => TOP + (h - TOP - BOTTOM - n * row) / 2 + row * (i + 0.5);

  if (!o.narrow) {
    const roleRows = shownRoles.length + (tooMany ? 1 : 0);
    const stuCols = stu.length > 12 ? 2 : 1;
    const stuRows = Math.ceil(stu.length / stuCols) + (more ? 1 : 0);
    const h = Math.max(380, TOP + BOTTOM + Math.max(net.families.length * ROW.fam, roleRows * ROW.role, stuRows * ROW.stu));
    const W = WIDE;
    const pool: LNode = { id: "pool", kind: "pool", key: "", x: W.pool, y: h / 2 + 6, r: 18, label: "Everyone", count: fmt(net.n), end: W.pool + 18, on: true, open: !fam };
    nodes.push(pool);
    cols.push({ x: W.pool, title: "Everyone", hint: null });
    cols.push({ x: W.fam, title: "Families", hint: net.families.length ? null : "No student matches" });
    net.families.forEach((f, i) => {
      const n = famNode(f, W.fam, rowY(i, net.families.length, ROW.fam, h), W.famChars);
      nodes.push(n);
      edges.push({ id: `e:pool:${f.key}`, d: curve(pool.x + pool.r, pool.y, n.x - n.r, n.y), w: 1 + 9 * (f.n / maxFam), on: n.on, to: n.id });
    });
    const fn = nodes.find((n) => n.open && n.kind === "fam");
    cols.push({ x: W.role, title: fam ? "Roles" : "", hint: fam ? (roles.length ? null : "No student here for this search") : net.families.length ? "Click a family to open its roles" : null });
    if (fam && fn) {
      shownRoles.forEach((rl, i) => {
        const n = roleNode(rl, W.role, rowY(i, roleRows, ROW.role, h), W.roleChars);
        nodes.push(n);
        edges.push({ id: `e:${fam.key}:${rl.key}`, d: curve(fn.end + 4, fn.y, n.x - n.r, n.y), w: 1 + 7 * (rl.n / maxRole), on: n.on, to: n.id });
      });
      if (tooMany) nodes.push(moreNode(W.role, rowY(shownRoles.length, roleRows, ROW.role, h)));
    }
    const rn = nodes.find((n) => n.open && n.kind === "role");
    cols.push({ x: W.stu[0], title: role ? `Best ${fmt(stu.length)} of ${fmt(total)}` : "", hint: fam && !role && roles.length ? "Click a role to see its students" : role && !stu.length ? "Loading..." : null });
    if (role && rn) {
      const per = Math.ceil(stu.length / stuCols);
      stu.forEach((s, i) => {
        const n = stuNode(s, W.stu[Math.floor(i / per)], rowY(i % per, stuRows, ROW.stu, h), W.nameChars);
        nodes.push(n);
        edges.push({ id: `e:${role.key}:${s.id}`, d: curve(rn.end + 4, rn.y, n.x - n.r, n.y), w: 1.25, on: true, to: n.id });
      });
      if (more) nodes.push(showNode(W.stu[0], rowY(stuRows - 1, stuRows, ROW.stu, h)));
    }
    return { w: W.w, h, nodes, edges, cols };
  }

  // Narrow: the open node on the left, its children on the right.
  const W = NARROW;
  const kids = role ? stu.length + (more ? 1 : 0) : fam ? shownRoles.length + (tooMany ? 1 : 0) : net.families.length;
  const h = Math.max(320, TOP + BOTTOM + kids * (role ? ROW.stu : ROW.fam));
  const py = h / 2 + 6;
  const parent: LNode = role
    ? { ...roleNode(role, W.parent, py, 0), r: 12, label: "", count: "", end: W.parent + 12 }
    : fam
      ? { ...famNode(fam, W.parent, py, 0), r: 14, label: "", count: "", end: W.parent + 14 }
      : { id: "pool", kind: "pool", key: "", x: W.parent, y: py, r: 16, label: "", count: "", end: W.parent + 16, on: true, open: true };
  parent.open = true;
  nodes.push(parent);
  cols.push({ x: W.parent, title: role ? "Role" : fam ? "Family" : "Everyone", hint: null });
  cols.push({ x: W.child, title: role ? `Best ${fmt(stu.length)} of ${fmt(total)}` : fam ? "Roles" : "Families", hint: kids ? null : role ? "Loading..." : "No student matches" });
  const push = (n: LNode, w: number) => {
    nodes.push(n);
    edges.push({ id: `e:${parent.id}:${n.id}`, d: curve(parent.x + parent.r, parent.y, n.x - n.r, n.y), w, on: true, to: n.id });
  };
  if (role) {
    stu.forEach((s, i) => push(stuNode(s, W.child, rowY(i, kids, ROW.stu, h), W.nameChars), 1.25));
    if (more) nodes.push(showNode(W.child, rowY(kids - 1, kids, ROW.stu, h)));
  } else if (fam) {
    shownRoles.forEach((rl, i) => push(roleNode(rl, W.child, rowY(i, kids, ROW.fam, h), W.chars), 1 + 6 * (rl.n / maxRole)));
    if (tooMany) nodes.push(moreNode(W.child, rowY(kids - 1, kids, ROW.fam, h)));
  } else {
    net.families.forEach((f, i) => push(famNode(f, W.child, rowY(i, kids, ROW.fam, h), W.chars), 1 + 7 * (f.n / maxFam)));
  }
  return { w: W.w, h, nodes, edges, cols };
}
