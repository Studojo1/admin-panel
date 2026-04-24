import { useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

const NAV_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/users", label: "Users" },
  { to: "/partner-users", label: "Partner Users" },
  { to: "/assignments", label: "Assignments" },
  { to: "/dissertations", label: "Dissertations" },
  { to: "/outreach-orders", label: "Outreach Orders" },
  { to: "/outreach", label: "Outreach Stats" },
  { to: "/careers", label: "Careers" },
  { to: "/chat-logs", label: "Chat Logs" },
  { to: "/consultation-signups", label: "Free Call Signups" },
  { to: "/email-sequences", label: "Emails" },
  { to: "/analytics", label: "Analytics" },
  { to: "/utm-builder", label: "UTM Builder" },
  { to: "/coupons", label: "Coupons" },
  { to: "/settings", label: "Settings" },
] as const;

export function AdminHeader() {
  const location = useLocation();
  const navigate = useNavigate();
  const { data: session } = authClient.useSession();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const currentLink = NAV_LINKS.find((l) => l.to === location.pathname) ?? { label: "Navigate" };

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

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
        {/* Logo */}
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

        <div className="flex items-center gap-3">
          {/* Page dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 rounded-xl border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-semibold text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50 hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]"
            >
              <span>{currentLink.label}</span>
              <motion.svg
                animate={{ rotate: menuOpen ? 180 : 0 }}
                transition={{ duration: 0.2 }}
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="6 9 12 15 18 9" />
              </motion.svg>
            </button>

            <AnimatePresence>
              {menuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -8, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -8, scale: 0.97 }}
                  transition={{ duration: 0.15 }}
                  className="absolute right-0 top-full mt-2 w-52 overflow-hidden rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
                >
                  {NAV_LINKS.map((link) => {
                    const isActive = location.pathname === link.to;
                    return (
                      <Link
                        key={link.to}
                        to={link.to}
                        className={`block px-4 py-2.5 font-['Satoshi'] text-sm transition-colors ${
                          isActive
                            ? "bg-violet-500 font-semibold text-white"
                            : "font-medium text-neutral-700 hover:bg-neutral-50 hover:text-neutral-900"
                        }`}
                      >
                        {link.label}
                      </Link>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Email dashboard */}
          <motion.a
            href="https://studojo.com/api/admin/email-dashboard-sso"
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="rounded-lg border-2 border-violet-600 bg-violet-600 px-4 py-2 font-['Satoshi'] text-sm font-medium leading-5 text-white shadow-[2px_2px_0px_0px_rgba(109,40,217,1)] transition-shadow hover:shadow-[4px_4px_0px_0px_rgba(109,40,217,1)]"
          >
            ✉ Email
          </motion.a>

          {/* Sign out */}
          {session && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSignOut}
              className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium leading-5 text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-shadow hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            >
              Sign Out
            </motion.button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
