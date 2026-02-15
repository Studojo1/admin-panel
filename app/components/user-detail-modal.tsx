import { motion, AnimatePresence } from "framer-motion";
import { AdminUser } from "~/lib/api";

type UserDetailModalProps = {
  user: AdminUser | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
};

export function UserDetailModal({
  user,
  isOpen,
  onClose,
  onUpdate,
}: UserDetailModalProps) {
  if (!user) return null;

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[8px_8px_0px_0px_rgba(25,26,35,1)] md:p-8"
          >
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-['Clash_Display'] text-2xl font-medium leading-tight tracking-tight text-neutral-900 md:text-3xl">
                User Details
              </h2>
              <button
                onClick={onClose}
                className="rounded-lg border-2 border-neutral-900 bg-white p-2 transition-transform hover:scale-110 hover:bg-neutral-50"
                aria-label="Close"
              >
                <svg
                  className="h-5 w-5 text-neutral-900"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            <div className="space-y-6">
              {/* Basic Information */}
              <section>
                <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                  Basic Information
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Name
                    </label>
                    <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                      {user.name || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Email
                    </label>
                    <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                      {user.email}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Phone Number
                    </label>
                    <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                      {user.phone_number || "—"}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      User ID
                    </label>
                    <p className="font-['Satoshi'] text-xs font-mono text-neutral-600">
                      {user.id}
                    </p>
                  </div>
                </div>
              </section>

              {/* Profile Information */}
              {(user.full_name ||
                user.college ||
                user.year_of_study ||
                user.course) && (
                <section>
                  <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                    Profile Information
                  </h3>
                  <div className="grid gap-4 md:grid-cols-2">
                    {user.full_name && (
                      <div>
                        <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                          Full Name
                        </label>
                        <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                          {user.full_name}
                        </p>
                      </div>
                    )}
                    {user.college && (
                      <div>
                        <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                          College
                        </label>
                        <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                          {user.college}
                        </p>
                      </div>
                    )}
                    {user.year_of_study && (
                      <div>
                        <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                          Year of Study
                        </label>
                        <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                          {user.year_of_study}
                        </p>
                      </div>
                    )}
                    {user.course && (
                      <div>
                        <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                          Course
                        </label>
                        <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                          {user.course}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Account Status */}
              <section>
                <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                  Account Status
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Role
                    </label>
                    <select
                      value={user.role || ""}
                      onChange={async (e) => {
                        try {
                          await updateUser(user.id, {
                            role: e.target.value || null,
                          });
                          toast.success("Role updated");
                          onUpdate();
                        } catch (error: any) {
                          toast.error(error.message || "Failed to update role");
                        }
                      }}
                      className="mt-1 rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium transition-colors hover:bg-neutral-50 focus:outline-none"
                    >
                      <option value="">User</option>
                      <option value="ops">Ops</option>
                      <option value="admin">Admin</option>
                      <option value="dev">Dev</option>
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Status
                    </label>
                    {user.banned ? (
                      <span className="inline-block rounded-lg bg-red-100 px-3 py-1 font-['Satoshi'] text-sm font-medium text-red-700">
                        Banned
                      </span>
                    ) : (
                      <span className="inline-block rounded-lg bg-green-100 px-3 py-1 font-['Satoshi'] text-sm font-medium text-green-700">
                        Active
                      </span>
                    )}
                  </div>
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Email Verified
                    </label>
                    <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                      {user.email_verified ? "Yes" : "No"}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Phone Verified
                    </label>
                    <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                      {user.phone_number_verified ? "Yes" : "No"}
                    </p>
                  </div>
                </div>
              </section>

              {/* Ban Information */}
              {user.banned && (
                <section>
                  <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                    Ban Information
                  </h3>
                  <div className="space-y-4">
                    {user.ban_reason && (
                      <div>
                        <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                          Ban Reason
                        </label>
                        <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                          {user.ban_reason}
                        </p>
                      </div>
                    )}
                    {user.ban_expires && (
                      <div>
                        <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                          Ban Expires
                        </label>
                        <p className="font-['Satoshi'] text-base font-normal text-neutral-900">
                          {formatDate(user.ban_expires)}
                        </p>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {/* Timestamps */}
              <section>
                <h3 className="mb-4 font-['Satoshi'] text-sm font-bold uppercase tracking-wide text-neutral-500">
                  Timestamps
                </h3>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Created At
                    </label>
                    <p className="font-['Satoshi'] text-sm font-normal text-neutral-600">
                      {formatDate(user.created_at)}
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block font-['Satoshi'] text-xs font-medium text-neutral-600">
                      Last Updated
                    </label>
                    <p className="font-['Satoshi'] text-sm font-normal text-neutral-600">
                      {formatDate(user.updated_at)}
                    </p>
                  </div>
                </div>
              </section>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
