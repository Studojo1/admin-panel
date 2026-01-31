import { motion } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

const NAV_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/users", label: "Users" },
  { to: "/assignments", label: "Assignments" },
  { to: "/dissertations", label: "Dissertations" },
  { to: "/careers", label: "Careers" },
] as const;

export function AdminHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();

  const handleSignOut = () => {
    authClient.signOut({
      fetchOptions: {
        onSuccess: () => navigate("/login"),
      },
    });
  };

  return (
    <motion.header
      initial={{ y: -100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="sticky top-0 z-50 w-full border-b-2 border-neutral-900 bg-white shadow-[0_4px_0px_0px_rgba(25,26,35,1)]"
    >
      <div className="mx-auto flex h-16 max-w-[var(--section-max-width)] items-center justify-between px-4 md:h-20 md:px-8">
        <motion.div
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <Link
            to="/"
            className="font-['Satoshi'] text-2xl font-black leading-9 text-neutral-900 md:text-4xl md:leading-7"
          >
            Studojo Admin
          </Link>
        </motion.div>

        <nav className="flex items-center gap-6" aria-label="Admin Navigation">
          {NAV_LINKS.map((link, index) => {
            const isActive = location.pathname === link.to;
            return (
              <motion.div
                key={link.label}
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: index * 0.1 }}
              >
                <Link
                  to={link.to}
                  className={`relative font-['Satoshi'] text-base leading-6 transition-colors ${
                    isActive
                      ? "font-black text-neutral-900"
                      : "font-normal text-neutral-700 hover:text-neutral-900"
                  }`}
                >
                  {link.label}
                  {isActive && (
                    <motion.div
                      layoutId="activeIndicator"
                      className="absolute -bottom-1 left-0 right-0 h-0.5 bg-purple-500"
                      initial={false}
                      transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    />
                  )}
                </Link>
              </motion.div>
            );
          })}
          {session && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, delay: 0.4 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSignOut}
              className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium leading-5 text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-shadow hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            >
              Sign Out
            </motion.button>
          )}
        </nav>
      </div>
    </motion.header>
  );
}

