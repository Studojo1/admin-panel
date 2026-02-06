import type { Route } from "./+types/api.partner-users.$id";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import { hashPassword } from "~/lib/auth.server";

// GET /api/partner-users/:id - Get partner user
export async function loader({ params, request }: Route.LoaderArgs) {
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

  const { id } = params;

  const result = await db.execute(
    sql`
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
      WHERE cu.id = ${id}
      LIMIT 1
    `
  );

  if (result.rows.length === 0) {
    return Response.json({ error: "Partner user not found" }, { status: 404 });
  }

  const partnerUser = result.rows[0] as any;

  return Response.json({
    user: {
      id: partnerUser.id,
      companyId: partnerUser.company_id,
      companyName: partnerUser.company_name,
      email: partnerUser.email,
      name: partnerUser.name,
      role: partnerUser.role,
      createdAt: partnerUser.created_at,
    },
  });
}

// PUT /api/partner-users/:id - Update partner user
export async function action({ params, request }: Route.ActionArgs) {
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

  if (request.method !== "PUT") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const { id } = params;
  const body = await request.json();
  const { company_id, email, password, name, role: userRole } = body;

  if (!company_id || !email || !name) {
    return Response.json({ error: "Company, email, and name are required" }, { status: 400 });
  }

  if (password && password.length < 8) {
    return Response.json({ error: "Password must be at least 8 characters" }, { status: 400 });
  }

  // Check if email is already taken by another user
  const emailCheck = await db.execute(
    sql`SELECT id FROM company_users WHERE email = ${email.trim()} AND id != ${id} LIMIT 1`
  );

  if (emailCheck.rows.length > 0) {
    return Response.json({ error: "Email already exists" }, { status: 400 });
  }

  // Update user
  if (password) {
    const passwordHash = await hashPassword(password);
    const result = await db.execute(
      sql`
        UPDATE company_users SET
          company_id = ${company_id},
          email = ${email.trim()},
          password_hash = ${passwordHash},
          name = ${name.trim()},
          role = ${userRole || "viewer"},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, company_id, email, name, role, created_at
      `
    );

    if (result.rows.length === 0) {
      return Response.json({ error: "Partner user not found" }, { status: 404 });
    }

    const updatedUser = result.rows[0] as any;

    return Response.json({
      user: {
        id: updatedUser.id,
        companyId: updatedUser.company_id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        createdAt: updatedUser.created_at,
      },
    });
  } else {
    const result = await db.execute(
      sql`
        UPDATE company_users SET
          company_id = ${company_id},
          email = ${email.trim()},
          name = ${name.trim()},
          role = ${userRole || "viewer"},
          updated_at = NOW()
        WHERE id = ${id}
        RETURNING id, company_id, email, name, role, created_at
      `
    );

    if (result.rows.length === 0) {
      return Response.json({ error: "Partner user not found" }, { status: 404 });
    }

    const updatedUser = result.rows[0] as any;

    return Response.json({
      user: {
        id: updatedUser.id,
        companyId: updatedUser.company_id,
        email: updatedUser.email,
        name: updatedUser.name,
        role: updatedUser.role,
        createdAt: updatedUser.created_at,
      },
    });
  }
}

