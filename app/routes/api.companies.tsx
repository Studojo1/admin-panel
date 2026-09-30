import type { Route } from "./+types/api.companies";
import { requireAdmin } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";

export async function loader({ request }: Route.LoaderArgs) {
  const user = await requireAdmin(request);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

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

