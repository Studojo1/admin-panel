import { Link, useLocation } from "react-router";

const NAV_LINKS = [
  { to: "/", label: "Dashboard" },
  { to: "/users", label: "Users" },
  { to: "/dissertations", label: "Dissertations" },
  { to: "/careers", label: "Careers" },
] as const;

export function AdminHeader() {
  const location = useLocation();

  return (
    <header className="sticky top-0 z-50 w-full border-b border-neutral-900 bg-white">
      <div className="mx-auto flex h-16 max-w-[var(--section-max-width)] items-center justify-between px-4 md:h-20 md:px-8">
        <Link
          to="/"
          className="font-['Satoshi'] text-2xl font-black leading-9 text-neutral-900 md:text-4xl md:leading-7"
        >
          Studojo Admin
        </Link>

        <nav className="flex items-center gap-6" aria-label="Admin Navigation">
          {NAV_LINKS.map((link) => {
            const isActive = location.pathname === link.to;
            return (
              <Link
                key={link.label}
                to={link.to}
                className={`font-['Satoshi'] text-base leading-6 transition ${
                  isActive
                    ? "font-black text-neutral-900"
                    : "font-normal text-neutral-700 hover:text-neutral-900"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

