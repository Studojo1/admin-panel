import { AdminHeader } from "~/components/admin-header";
import type { Route } from "./+types/dashboard";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Admin Dashboard – Studojo" },
    {
      name: "description",
      content: "Admin dashboard for managing Studojo",
    },
  ];
}

export default function Dashboard() {
  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
          Admin Dashboard
        </h1>
        <p className="mt-4 font-['Satoshi'] text-base font-normal leading-6 text-gray-600">
          Welcome to the Studojo admin panel. Use the navigation above to manage users, dissertations, and career applications.
        </p>
      </main>
    </>
  );
}

