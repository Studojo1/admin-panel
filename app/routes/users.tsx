import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminHeader, SearchInput, UserDetailModal } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { listUsers, updateUser, getUser, type AdminUser } from "~/lib/api";
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
  const [search, setSearch] = useState("");
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const limit = 50;

  useEffect(() => {
    if (isAuthorized) {
      loadUsers();
    }
  }, [offset, isAuthorized, search]);

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
      const usersList = await listUsers(limit, offset, search || undefined);
      setUsers(Array.isArray(usersList) ? usersList : []);
    } catch (error: any) {
      toast.error(error.message || "Failed to load users");
      setUsers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = async (userId: string) => {
    try {
      const user = await getUser(userId);
      setSelectedUser(user);
      setIsModalOpen(true);
    } catch (error: any) {
      toast.error(error.message || "Failed to load user details");
    }
  };

  const handleBanUser = async (userId: string, banned: boolean) => {
    try {
      await updateUser(userId, { banned });
      toast.success(banned ? "User banned" : "User unbanned");
      loadUsers();
      if (selectedUser?.id === userId) {
        const updatedUser = await getUser(userId);
        setSelectedUser(updatedUser);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update user");
    }
  };

  const handleUpdateRole = async (userId: string, role: string) => {
    try {
      await updateUser(userId, { role: role || null });
      toast.success("User role updated");
      loadUsers();
      if (selectedUser?.id === userId) {
        const updatedUser = await getUser(userId);
        setSelectedUser(updatedUser);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to update user");
    }
  };

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
            Users
          </h1>
          <p className="mt-2 font-['Satoshi'] text-base font-normal leading-6 text-gray-600">
            Search and manage user accounts
          </p>
        </motion.div>

        {/* Search Bar */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
          className="mt-8"
        >
          <SearchInput
            value={search}
            onChange={(value) => {
              setSearch(value);
              setOffset(0); // Reset to first page when searching
            }}
            placeholder="Search by name, email, phone, college, or course..."
          />
        </motion.div>

        {loading ? (
          <div className="mt-8 flex items-center justify-center py-20">
            <div className="text-center">
              <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"></div>
              <p className="font-['Satoshi'] text-sm text-gray-600">Loading users...</p>
            </div>
          </div>
        ) : (
          <div className="mt-8">
            {users && users.length > 0 ? (
              <>
                <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                          Name
                        </th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                          Email
                        </th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                          Phone
                        </th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                          College
                        </th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                          Role
                        </th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                          Status
                        </th>
                        <th className="px-4 py-4 text-left font-['Satoshi'] text-sm font-bold text-neutral-950">
                          Actions
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      <AnimatePresence mode="popLayout">
                        {users.map((user, index) => (
                          <motion.tr
                            key={user.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, delay: index * 0.02 }}
                            className="border-b border-neutral-200 transition-colors hover:bg-neutral-50"
                          >
                            <td className="px-4 py-4 font-['Satoshi'] text-sm font-medium text-neutral-950">
                              {user.name || "—"}
                            </td>
                            <td className="px-4 py-4 font-['Satoshi'] text-sm text-neutral-700">
                              {user.email || "—"}
                            </td>
                            <td className="px-4 py-4 font-['Satoshi'] text-sm text-neutral-700">
                              {user.phone_number || "—"}
                            </td>
                            <td className="px-4 py-4 font-['Satoshi'] text-sm text-neutral-700">
                              {user.college || "—"}
                            </td>
                            <td className="px-4 py-4">
                              <select
                                value={user.role || ""}
                                onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                                className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium transition-colors hover:bg-neutral-50 focus:outline-none"
                              >
                                <option value="">User</option>
                                <option value="ops">Ops</option>
                                <option value="admin">Admin</option>
                              </select>
                            </td>
                            <td className="px-4 py-4">
                              {user.banned ? (
                                <span className="inline-block rounded-lg bg-red-100 px-3 py-1 font-['Satoshi'] text-xs font-medium text-red-700">
                                  Banned
                                </span>
                              ) : (
                                <span className="inline-block rounded-lg bg-green-100 px-3 py-1 font-['Satoshi'] text-xs font-medium text-green-700">
                                  Active
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-4">
                              <div className="flex gap-2">
                                <button
                                  onClick={() => handleViewDetails(user.id)}
                                  className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleBanUser(user.id, !user.banned)}
                                  className={`rounded-lg border-2 border-neutral-900 px-3 py-1.5 font-['Satoshi'] text-xs font-medium text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none ${
                                    user.banned
                                      ? "bg-green-500"
                                      : "bg-red-500"
                                  }`}
                                >
                                  {user.banned ? "Unban" : "Ban"}
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        ))}
                      </AnimatePresence>
                    </tbody>
                  </table>
                </div>
                <div className="mt-6 flex items-center justify-between">
                  <p className="font-['Satoshi'] text-sm text-neutral-600">
                    Showing {users.length} {users.length === 1 ? "user" : "users"}
                    {search && ` matching "${search}"`}
                  </p>
                  <div className="flex gap-4">
                    <button
                      onClick={() => setOffset(Math.max(0, offset - limit))}
                      disabled={offset === 0}
                      className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => setOffset(offset + limit)}
                      disabled={users.length < limit}
                      className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:opacity-50 disabled:cursor-not-allowed hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:hover:translate-x-0 disabled:hover:translate-y-0"
                    >
                      Next
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="mt-8 rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
              >
                <p className="font-['Satoshi'] text-base text-neutral-600">
                  {search ? `No users found matching "${search}"` : "No users found"}
                </p>
              </motion.div>
            )}
          </div>
        )}

        <UserDetailModal
          user={selectedUser}
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedUser(null);
          }}
          onUpdate={loadUsers}
        />
      </main>
    </>
  );
}
