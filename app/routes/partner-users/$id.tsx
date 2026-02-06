import { useEffect, useState } from "react";
import { useLoaderData, useNavigate } from "react-router";
import { useAdminGuard } from "~/lib/auth-guard";
import { toast } from "sonner";
import { AdminHeader } from "~/components/admin-header";
import { getUserFromRequest } from "~/lib/auth-helper.server";
import db from "~/lib/db.server";
import { sql } from "drizzle-orm";
import type { Route } from "./+types/$id";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Edit Partner User – Admin Panel" },
    {
      name: "description",
      content: "Edit partner panel user",
    },
  ];
}

export async function loader({ params, request }: Route.LoaderArgs) {
  const { id } = params;
  const user = await getUserFromRequest(request);

  if (!user) {
    throw new Response("Unauthorized", { status: 401 });
  }

  const roleResult = await db.execute(
    sql`SELECT role FROM "user" WHERE id = ${user.id} LIMIT 1`
  );

  if (roleResult.rows.length === 0) {
    throw new Response("User not found", { status: 404 });
  }

  const role = roleResult.rows[0].role as string | null;
  if (role !== "admin" && role !== "ops") {
    throw new Response("Forbidden - Admin or Ops access required", { status: 403 });
  }

  const result = await db.execute(
    sql`
      SELECT 
        cu.id,
        cu.company_id,
        cu.email,
        cu.name,
        cu.role,
        c.name as company_name
      FROM company_users cu
      JOIN companies c ON cu.company_id = c.id
      WHERE cu.id = ${id}
      LIMIT 1
    `
  );

  if (result.rows.length === 0) {
    throw new Response("Partner user not found", { status: 404 });
  }

  return { user: result.rows[0] };
}

interface Company {
  id: string;
  name: string;
}

export default function EditPartnerUser({ data }: Route.ComponentProps) {
  const loaderData = useLoaderData() as { user: any } | undefined;
  const user = (loaderData?.user || data?.user) as any | undefined;
  const navigate = useNavigate();
  const { isAuthorized, isPending } = useAdminGuard();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState(user?.company_id || "");
  const [email, setEmail] = useState(user?.email || "");
  const [password, setPassword] = useState("");
  const [name, setName] = useState(user?.name || "");
  const [role, setRole] = useState<"admin" | "viewer">(user?.role || "viewer");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthorized) {
      loadCompanies();
    }
  }, [isAuthorized]);

  useEffect(() => {
    if (user) {
      setCompanyId(user.company_id);
      setEmail(user.email);
      setName(user.name);
      setRole(user.role);
    }
  }, [user]);

  const loadCompanies = async () => {
    try {
      const response = await fetch("/api/companies", {
        credentials: "include",
      });

      if (!response.ok) {
        throw new Error("Failed to load companies");
      }

      const data = await response.json();
      setCompanies(data.companies || []);
    } catch (error) {
      console.error("Error loading companies:", error);
      toast.error("Failed to load companies");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!companyId || !email || !name || !user) {
      toast.error("Company, email, and name are required");
      return;
    }

    setLoading(true);
    try {
      const body: any = {
        company_id: companyId,
        email: email.trim(),
        name: name.trim(),
        role,
      };

      if (password) {
        if (password.length < 8) {
          toast.error("Password must be at least 8 characters");
          setLoading(false);
          return;
        }
        body.password = password;
      }

      const response = await fetch(`/api/partner-users/${user.id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to update partner user");
      }

      toast.success("Partner user updated successfully");
      navigate("/partner-users");
    } catch (error: any) {
      console.error("Error updating partner user:", error);
      toast.error(error.message || "Failed to update partner user");
    } finally {
      setLoading(false);
    }
  };

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"></div>
          <p className="font-['Satoshi'] text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized || !user) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-4xl px-4 py-8 md:px-8">
        <div className="mb-8">
          <h1 className="font-['Clash_Display'] text-4xl font-bold text-neutral-900">
            Edit Partner User
          </h1>
          <p className="mt-2 font-['Satoshi'] text-sm text-gray-600">
            {user.email}
          </p>
        </div>

        <div className="rounded-lg border-2 border-neutral-900 bg-white p-8">
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="mb-2 block font-['Satoshi'] font-medium text-neutral-900">
                Company *
              </label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                required
                className="w-full rounded-lg border-2 border-neutral-900 px-4 py-2 font-['Satoshi'] focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="">Select a company</option>
                {companies.map((company) => (
                  <option key={company.id} value={company.id}>
                    {company.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="mb-2 block font-['Satoshi'] font-medium text-neutral-900">
                Name *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border-2 border-neutral-900 px-4 py-2 font-['Satoshi'] focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="John Doe"
              />
            </div>

            <div>
              <label className="mb-2 block font-['Satoshi'] font-medium text-neutral-900">
                Email *
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full rounded-lg border-2 border-neutral-900 px-4 py-2 font-['Satoshi'] focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="user@company.com"
              />
            </div>

            <div>
              <label className="mb-2 block font-['Satoshi'] font-medium text-neutral-900">
                Password (leave blank to keep current)
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                className="w-full rounded-lg border-2 border-neutral-900 px-4 py-2 font-['Satoshi'] focus:outline-none focus:ring-2 focus:ring-violet-500"
                placeholder="••••••••"
              />
              <p className="mt-1 font-['Satoshi'] text-xs text-gray-500">
                Minimum 8 characters (only required if changing password)
              </p>
            </div>

            <div>
              <label className="mb-2 block font-['Satoshi'] font-medium text-neutral-900">
                Role *
              </label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "viewer")}
                required
                className="w-full rounded-lg border-2 border-neutral-900 px-4 py-2 font-['Satoshi'] focus:outline-none focus:ring-2 focus:ring-violet-500"
              >
                <option value="viewer">Viewer</option>
                <option value="admin">Admin</option>
              </select>
            </div>

            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => navigate("/partner-users")}
                className="flex-1 rounded-lg border-2 border-neutral-900 px-6 py-3 font-['Satoshi'] font-medium text-neutral-900 transition-colors hover:bg-neutral-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 rounded-lg border-2 border-neutral-900 bg-violet-600 px-6 py-3 font-['Satoshi'] font-bold text-white transition-colors hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Updating..." : "Update Partner User"}
              </button>
            </div>
          </form>
        </div>
      </main>
    </div>
  );
}

