// admin.studojo.com root (relaunch, 2 Nov 2026). The old product's dashboards
// moved to /old; the new product's dashboards come here after launch.
import { Link } from "react-router";

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
              Every dashboard and all data from the old Studojo product, read only.
            </div>
          </Link>
          <div className="rounded-2xl border-2 border-dashed border-neutral-400 bg-white p-6">
            <div className="font-['Clash_Display'] text-xl font-bold text-neutral-500">
              New product dashboards: coming after launch
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
