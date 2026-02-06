import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useAdminGuard } from "~/lib/auth-guard";
import { toast } from "sonner";
import { AdminHeader } from "~/components/admin-header";
import { FiPlus } from "react-icons/fi";
import type { Route } from "./+types/partner-users";
import { getToken } from "~/lib/api";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Partner Users – Admin Panel" },
    {
      name: "description",
      content: "Manage partner panel users",
    },
  ];
}

interface PartnerUser {
  id: string;
  companyId: string;
  companyName: string;
  email: string;
  name: string;
  role: "admin" | "viewer";
  createdAt: string;
}

export default function PartnerUsers() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [users, setUsers] = useState<PartnerUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
    }
  }, [isAuthorized, search]);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const token = await getToken();
      if (!token) {
        throw new Error("Not authenticated");
      }

      const response = await fetch(
        `/api/partner-users${search ? `?search=${encodeURIComponent(search)}` : ""}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
          credentials: "include",
        }
      );

      if (!response.ok) {
        throw new Error("Failed to load partner users");
      }

      const data = await response.json();
      setUsers(data.users || []);
    } catch (error: any) {
      console.error("Error loading partner users:", error);
      toast.error(error.message || "Failed to load partner users");
      setUsers([]);
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

  if (!isAuthorized) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 md:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="font-['Clash_Display'] text-4xl font-bold text-neutral-900">
              Partner Users
            </h1>
            <p className="mt-2 font-['Satoshi'] text-sm text-gray-600">
              Manage partner panel user accounts
            </p>
          </div>
          <Link
            to="/partner-users/new"
            className="flex items-center gap-2 rounded-lg border-2 border-neutral-900 bg-violet-600 px-4 py-2 font-['Satoshi'] font-bold text-white transition-colors hover:bg-violet-700"
          >
            <FiPlus className="h-5 w-5" />
            New Partner User
          </Link>
        </div>

        <div className="mb-6">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search partner users..."
            className="w-full max-w-md rounded-lg border-2 border-neutral-900 px-4 py-2 font-['Satoshi'] focus:outline-none focus:ring-2 focus:ring-violet-500"
          />
        </div>

        {loading ? (
          <p className="font-['Satoshi'] text-gray-600">Loading partner users...</p>
        ) : users.length === 0 ? (
          <p className="font-['Satoshi'] text-gray-600">No partner users found.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-2 border-neutral-900">
              <thead>
                <tr className="bg-neutral-100">
                  <th className="border-2 border-neutral-900 px-4 py-2 text-left font-['Satoshi'] font-bold">
                    Name
                  </th>
                  <th className="border-2 border-neutral-900 px-4 py-2 text-left font-['Satoshi'] font-bold">
                    Email
                  </th>
                  <th className="border-2 border-neutral-900 px-4 py-2 text-left font-['Satoshi'] font-bold">
                    Company
                  </th>
                  <th className="border-2 border-neutral-900 px-4 py-2 text-left font-['Satoshi'] font-bold">
                    Role
                  </th>
                  <th className="border-2 border-neutral-900 px-4 py-2 text-left font-['Satoshi'] font-bold">
                    Created
                  </th>
                  <th className="border-2 border-neutral-900 px-4 py-2 text-left font-['Satoshi'] font-bold">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td className="border-2 border-neutral-900 px-4 py-2 font-['Satoshi']">
                      {user.name}
                    </td>
                    <td className="border-2 border-neutral-900 px-4 py-2 font-['Satoshi']">
                      {user.email}
                    </td>
                    <td className="border-2 border-neutral-900 px-4 py-2 font-['Satoshi']">
                      {user.companyName}
                    </td>
                    <td className="border-2 border-neutral-900 px-4 py-2 font-['Satoshi']">
                      <span
                        className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
                          user.role === "admin"
                            ? "bg-violet-100 text-violet-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className="border-2 border-neutral-900 px-4 py-2 font-['Satoshi']">
                      {new Date(user.createdAt).toLocaleDateString()}
                    </td>
                    <td className="border-2 border-neutral-900 px-4 py-2 font-['Satoshi']">
                      <Link
                        to={`/partner-users/${user.id}`}
                        className="text-violet-600 hover:underline"
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

