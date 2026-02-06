import type { Route } from "./+types/api.companies";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

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

  const companies = await db.execute(
    sql`SELECT id, name, email, phone, website FROM companies ORDER BY name ASC`
  );

  return Response.json({
    companies: companies.rows.map((row: any) => ({
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      website: row.website,
    })),
  });
}

