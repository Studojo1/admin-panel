import { useEffect, useState } from "react";
import { AdminHeader } from "~/components/admin-header";
import { useAdminGuard } from "~/lib/auth-guard";
import { listUsers, updateUser, type AdminUser } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/users";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Users – Admin Panel" },
    {
      name: "description",
      content: "Manage users",
    },
  ];
}

export default function Users() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [offset, setOffset] = useState(0);
  const limit = 50;

  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
    }
  }, [offset, isAuthorized]);

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
    return null; // Redirect will happen in guard
  }

  const loadUsers = async () => {
    try {
      setLoading(true);
      const usersList = await listUsers(limit, offset);
      setUsers(Array.isArray(usersList) ? usersList : []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load users");
      setUsers([]); // Set empty array on error
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId: string, banned: boolean) => {
    try {
      await updateUser(userId, { banned });
      toast.success(banned ? "User banned" : "User unbanned");
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to update user");
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    try {
      await updateUser(userId, { role });
      toast.success("User role updated");
      loadUsers();
    } catch (error: any) {
      toast.error(error.message || "Failed to update user");
    }
  };

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
          Users
        </h1>

        {loading ? (
          <p className="mt-4 font-['Satoshi'] text-base text-gray-600">Loading...</p>
        ) : (
          <div className="mt-8 overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b-2 border-neutral-900">
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Email
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Phone
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Role
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left font-['Satoshi'] text-sm font-medium text-neutral-950">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {users && users.length > 0 ? (
                  users.map((user) => (
                  <tr key={user.id} className="border-b border-gray-200">
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {user.name || "—"}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {user.email || "—"}
                    </td>
                    <td className="px-4 py-3 font-['Satoshi'] text-sm text-neutral-950">
                      {user.phone_number || "—"}
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={user.role || ""}
                        onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                        className="rounded-lg border-2 border-neutral-900 bg-white px-2 py-1 font-['Satoshi'] text-sm"
                      >
                        <option value="">—</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {user.banned ? (
                        <span className="rounded bg-red-100 px-2 py-1 font-['Satoshi'] text-xs text-red-700">
                          Banned
                        </span>
                      ) : (
                        <span className="rounded bg-green-100 px-2 py-1 font-['Satoshi'] text-xs text-green-700">
                          Active
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleBanUser(user.id, !user.banned)}
                        className={`rounded-lg px-3 py-1 font-['Satoshi'] text-sm ${
                          user.banned
                            ? "bg-green-500 text-white"
                            : "bg-red-500 text-white"
                        }`}
                      >
                        {user.banned ? "Unban" : "Ban"}
                      </button>
                    </td>
                  </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center font-['Satoshi'] text-sm text-gray-500">
                      No users found
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <div className="mt-4 flex gap-4">
              <button
                onClick={() => setOffset(Math.max(0, offset - limit))}
                disabled={offset === 0}
                className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm disabled:opacity-50"
              >
                Previous
              </button>
              <button
                onClick={() => setOffset(offset + limit)}
                disabled={users.length < limit}
                className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </main>
    </>
  );
}

