import type { ReactNode } from "react";
import { Link, useLocation } from "react-router";

// The Growth Fellowship program has one entry in Navigate; this switches
// between its two pages. Styled by .fx .switch (fellowship-calendar.css).
const PAGES: { to: string; label: string; icon: ReactNode }[] = [
  { to: "/fellowship-program", label: "Dashboard", icon: <path d="M5 20v-6M12 20V5M19 20v-10" /> },
  { to: "/fellowship-program/calendar", label: "Calendar", icon: <><rect x="3.5" y="5" width="17" height="15.5" rx="2.2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></> },
];

export function FellowshipProgramSwitch() {
  const { pathname } = useLocation();
  return (
    <nav className="switch" aria-label="Fellowship program">
      {PAGES.map((p) => (
        <Link key={p.to} to={p.to} aria-current={pathname === p.to ? "page" : undefined}>
          <svg className="i" viewBox="0 0 24 24" aria-hidden="true">{p.icon}</svg>{p.label}
        </Link>
      ))}
    </nav>
  );
}
