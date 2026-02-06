import type { Route } from "./+types/api.partner-users";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { hashPassword } from "~/lib/auth.server";

// GET /api/partner-users - List partner users
export async function loader({ request }: Route.LoaderArgs) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roleResult = await db.execute(
    sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`
  );

  if (roleResult.rows.length === 0) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const role = roleResult.rows[0].role as string | null;
  if (role !== "admin" && role !== "ops") {
    return Response.json({ error: "Forbidden - Admin or Ops access required" }, { status: 403 });
  }

  const url = new URL(request.url);
  const search = url.searchParams.get("search") || "";

  let query = sql`
    SELECT 
      cu.id,
      cu.company_id,
      cu.email,
      cu.name,
      cu.role,
      cu.created_at,
      c.name as company_name
    FROM company_users cu
    JOIN companies c ON cu.company_id = c.id
  `;

  if (search) {
    query = sql`${query} WHERE cu.name ILIKE ${`%${search}%`} OR cu.email ILIKE ${`%${search}%`} OR c.name ILIKE ${`%${search}%`}`;
  }

  query = sql`${query} ORDER BY cu.created_at DESC LIMIT 100`;

  const users = await db.execute(query);

  return Response.json({
    users: users.rows.map((row: any) => ({
      id: row.id,
      companyId: row.company_id,
      companyName: row.company_name,
      email: row.email,
      name: row.name,
      role: row.role,
      createdAt: row.created_at,
    })),
  });
}

// POST /api/partner-users - Create partner user
export async function action({ request }: Route.ActionArgs) {
  const user = await getUserFromRequest(request);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roleResult = await db.execute(
    sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`
  );

  if (roleResult.rows.length === 0) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  const role = roleResult.rows[0].role as string | null;
  if (role !== "admin" && role !== "ops") {
    return Response.json({ error: "Forbidden - Admin or Ops access required" }, { status: 403 });
  }

  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const body = await request.json();
  const { company_id, email, password, name, role: userRole } = body;

  if (!company_id || !email || !password || !name) {
    return Response.json({ error: "Company, email, password, and name are required" }, { status: 400 });
  }

  if (password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Check if email already exists
  const existing = await db.execute(
    sql`SELECT id FROM company_users WHERE email = ${email.trim()} LIMIT 1`
  );

  if (existing.rows.length > 0) {
    return Response.json({ error: "Email already exists" }, { status: 400 });
  }

  // Hash password
  const passwordHash = await hashPassword(password);

  // Create user
  const result = await db.execute(
    sql`
      INSERT INTO company_users (company_id, email, password_hash, name, role)
      VALUES (${company_id}, ${email.trim()}, ${passwordHash}, ${name.trim()}, ${userRole || "viewer"})
      RETURNING id, company_id, email, name, role, created_at
    `
  );

  if (result.rows.length === 0) {
    return Response.json({ error: "Failed to create partner user" }, { status: 500 });
  }

  const newUser = result.rows[0] as any;

  return Response.json({
    user: {
      id: newUser.id,
      companyId: newUser.company_id,
      email: newUser.email,
      name: newUser.name,
      role: newUser.role,
      createdAt: newUser.created_at,
    },
  });
}

