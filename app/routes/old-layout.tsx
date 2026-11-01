// Wraps every /old page: the archive banner, plus a note for each retired
// service a page tried to reach (see ~/lib/retired-service.ts).
import { useEffect, useState } from "react";
import { Outlet, useLocation } from "react-router";
import { RETIRED_EVENT, type RetiredService } from "~/lib/retired-service";

export default function OldArchiveLayout() {
  const { pathname } = useLocation();
  const [retired, setRetired] = useState<RetiredService[]>([]);

  useEffect(() => {
    const onRetired = (e: Event) => {
      const hit = (e as CustomEvent<RetiredService>).detail;
      setRetired((prev) => (prev.some((r) => r.service === hit.service) ? prev : [...prev, hit]));
    };
    window.addEventListener(RETIRED_EVENT, onRetired);
    return () => window.removeEventListener(RETIRED_EVENT, onRetired);
  }, []);

  // Notes belong to the page that hit the service.
  useEffect(() => setRetired([]), [pathname]);

  return (
    <>
      <div
        role="note"
        className="w-full border-b-2 border-neutral-900 bg-amber-100 px-4 py-2 text-center font-['Satoshi'] text-sm font-semibold text-neutral-900"
      >
        Archive of the old Studojo product (retired 2 Nov 2026). Read only.
      </div>
      {retired.map((r) => (
        <div
          key={r.service}
          role="status"
          className="w-full border-b-2 border-neutral-900 bg-neutral-100 px-4 py-2 text-center font-['Satoshi'] text-sm text-neutral-700"
        >
          {r.message}
        </div>
      ))}
      <Outlet />
    </>
  );
}
