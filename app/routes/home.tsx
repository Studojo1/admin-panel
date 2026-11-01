// admin.studojo.com root (relaunch, 2 Nov 2026). The retired student product's
// dashboards moved to /old; live tools keep their paths; the new product's
// dashboards come here after launch.
import { Link } from "react-router";

// Same live tools as the header menu, in the same order.
const LIVE_TOOLS = [
  { to: "/users", label: "Users" },
  { to: "/tickets", label: "Tickets" },
  { to: "/chat-logs", label: "Chat Logs" },
  { to: "/ops-alerts", label: "Ops Alerts" },
  { to: "/webinar-registrations", label: "Webinar Signups" },
  { to: "/campus-ambassadors", label: "Studojo Insiders" },
  { to: "/sensei", label: "Sensei" },
  { to: "/utm-builder", label: "UTM Links" },
  { to: "/b2b-gtm", label: "B2B GTM" },
  { to: "/gtm", label: "GTM Dashboards" },
  { to: "/settings", label: "Settings" },
];

export function meta() {
  return [{ title: "Studojo Admin" }];
}

export default function Home() {
  return (
    <main className="min-h-screen bg-neutral-50 px-4 py-12 md:px-8">
      <div className="mx-auto max-w-2xl">
        <h1 className="mb-8 font-['Clash_Display'] text-3xl font-black text-neutral-900 md:text-4xl">
          Studojo Admin
        </h1>
        <div className="grid gap-4">
          <Link
            to="/old"
            className="block rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[4px_4px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[2px] hover:translate-y-[2px]"
          >
            <div className="font-['Clash_Display'] text-xl font-bold text-neutral-900">Old product (archive)</div>
            <div className="mt-1 font-['Satoshi'] text-sm text-neutral-600">
              Every dashboard and all data from the old Studojo student product, read only.
            </div>
          </Link>
          <div className="rounded-2xl border-2 border-dashed border-neutral-400 bg-white p-6">
            <div className="font-['Clash_Display'] text-xl font-bold text-neutral-500">
              New product dashboards: coming after launch
            </div>
          </div>
          <div className="rounded-2xl border-2 border-neutral-900 bg-white p-6">
            <div className="mb-3 font-['Clash_Display'] text-xl font-bold text-neutral-900">Live tools</div>
            <div className="flex flex-wrap gap-2">
              {LIVE_TOOLS.map((t) => (
                <Link
                  key={t.to}
                  to={t.to}
                  className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium text-neutral-900 hover:bg-neutral-50"
                >
                  {t.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
