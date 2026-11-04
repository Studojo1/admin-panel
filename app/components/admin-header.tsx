import { Fragment, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link, useLocation, useNavigate } from "react-router";
import { authClient } from "~/lib/auth-client";

// The new product (Stu) first, at the root; then live tools at their original
// paths. The retired student product's dashboards follow under /old (read-only
// archive, relaunch 2 Nov 2026).
const NAV_LINKS: readonly { to: string; label: string; archive?: true; stu?: true }[] = [
  { to: "/", label: "Stu: Overview", stu: true },
  { to: "/daily", label: "Stu: Daily", stu: true },
  { to: "/funnel", label: "Stu: Funnel", stu: true },
  { to: "/ratios", label: "Stu: Ratios", stu: true },
  { to: "/drop-offs", label: "Stu: Drop-offs", stu: true },
  { to: "/sources", label: "Stu: Sources", stu: true },
  { to: "/journeys", label: "Stu: Journeys", stu: true },
  { to: "/retention", label: "Stu: Retention", stu: true },
  { to: "/usage", label: "Stu: Usage", stu: true },
  { to: "/auditor", label: "Stu: Auditor", stu: true },
  { to: "/visitors", label: "Stu: Visitors", stu: true },
  { to: "/recordings", label: "Stu: Recordings", stu: true },
  { to: "/vendors", label: "Vendors and credits" },
  { to: "/users", label: "Users" },
  { to: "/ops-alerts", label: "Ops Alerts" },
  { to: "/tickets", label: "Tickets" },
  { to: "/webinar-registrations", label: "Webinar Signups" },
  { to: "/campus-ambassadors", label: "Studojo Insiders" },
  { to: "/sensei", label: "Sensei" },
  { to: "/utm-builder", label: "UTM Links" },
  { to: "/b2b-gtm", label: "B2B GTM" },
  { to: "/gtm", label: "GTM Dashboards" },
  { to: "/settings", label: "Settings" },
  { to: "/old", label: "Dashboard", archive: true },
  { to: "/old/daily", label: "Daily Dashboard", archive: true },
  { to: "/old/funnel", label: "Funnel", archive: true },
  { to: "/old/journeys", label: "User Journeys", archive: true },
  { to: "/old/chat-logs", label: "Chat Logs", archive: true },
  { to: "/old/outreach-orders", label: "Outreach Orders", archive: true },
  { to: "/old/campaign-health", label: "Campaign Health", archive: true },
  { to: "/old/campaign-refund-check", label: "Refund Check", archive: true },
  { to: "/old/suppression", label: "Opt-outs", archive: true },
  { to: "/old/paid-users", label: "Paid Users", archive: true },
  { to: "/old/outreach", label: "Outreach Stats", archive: true },
  { to: "/old/email-sequences", label: "Emails", archive: true },
  { to: "/old/analytics", label: "Analytics", archive: true },
  { to: "/old/coupons", label: "Coupons", archive: true },
  { to: "/old/career-coach", label: "Career Coach", archive: true },
];

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
      <div className="mx-auto flex min-h-16 max-w-[var(--section-max-width)] flex-wrap items-center justify-between gap-2 px-4 py-2 md:h-20 md:flex-nowrap md:px-8 md:py-0">
        {/* Logo */}
        <motion.div
          whileHover={{ scale: 1.05 }}
          transition={{ type: "spring", stiffness: 400, damping: 17 }}
        >
          <Link
            to="/"
            className="whitespace-nowrap font-['Satoshi'] text-xl font-black leading-9 text-neutral-900 sm:text-2xl md:text-4xl md:leading-7"
          >
            Studojo Admin
          </Link>
        </motion.div>

        <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
          {/* Page dropdown */}
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((prev) => !prev)}
              className="flex items-center gap-2 whitespace-nowrap rounded-xl border-2 border-neutral-900 bg-white px-2.5 py-2 font-['Satoshi'] text-sm font-semibold sm:px-4 text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:bg-neutral-50 hover:shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]"
            >
              <span className="max-w-[7.5rem] truncate sm:max-w-none">{currentLink.label}</span>
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
                  className="absolute right-0 top-full mt-2 w-52 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] max-h-[calc(100vh-6rem)]"
                >
                  {NAV_LINKS.map((link, i) => {
                    const isActive = location.pathname === link.to;
                    const archiveStart = link.archive && !NAV_LINKS[i - 1]?.archive;
                    const stuStart = link.stu && !NAV_LINKS[i - 1]?.stu;
                    const toolsStart = !link.stu && !link.archive && NAV_LINKS[i - 1]?.stu;
                    return (
                      <Fragment key={link.to}>
                      {stuStart && (
                        <div className="bg-violet-50 px-4 py-2 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-violet-700">
                          Stu (new product)
                        </div>
                      )}
                      {toolsStart && (
                        <div className="border-t-2 border-neutral-900 bg-neutral-50 px-4 py-2 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">
                          Live tools
                        </div>
                      )}
                      {archiveStart && (
                        <div className="border-t-2 border-neutral-900 bg-amber-50 px-4 py-2 font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">
                          Old product (archive)
                        </div>
                      )}
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
                      </Fragment>
                    );
                  })}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Sensei workspace admin */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <Link
              to="/sensei"
              title="Sensei"
              className="whitespace-nowrap rounded-lg border-2 border-neutral-900 bg-neutral-900 px-2.5 py-2 font-['Satoshi'] text-sm font-medium leading-5 text-white sm:px-4 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-shadow hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            >
              ◈<span className="hidden sm:inline"> Sensei</span>
            </Link>
          </motion.div>

          {/* ADMIN-FIX (5 Nov 2026): the Email button went to the old product's email dashboard, which is shut down. */}

          {/* Sign out */}
          {session && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3 }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleSignOut}
              className="whitespace-nowrap rounded-lg border-2 border-neutral-900 bg-white px-2.5 py-2 font-['Satoshi'] text-sm font-medium leading-5 text-neutral-900 sm:px-4 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-shadow hover:shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]"
            >
              Sign Out
            </motion.button>
          )}
        </div>
      </div>
    </motion.header>
  );
}
