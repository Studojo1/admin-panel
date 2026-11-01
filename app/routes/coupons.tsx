import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/coupons";
import { ARCHIVE_READ_ONLY } from "~/lib/archive";

export function meta(_: Route.MetaArgs) {
  return [{ title: "Coupons — Studojo Admin" }];
}

// ── Types ──────────────────────────────────────────────────────────────────

interface Coupon {
  id: number;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  max_uses: number | null;
  uses: number;
  valid_from: string;
  valid_until: string | null;
  distributor_name: string | null;
  is_active: boolean;
  created_at: string;
  // OP-N13 human review. null = code from before review existed.
  review_status: "pending" | "approved" | "rejected" | null;
  created_by: string | null;
  reviewed_by: string | null;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function couponStatus(c: Coupon): "pending" | "rejected" | "active" | "expired" | "exhausted" | "inactive" {
  if (c.review_status === "pending") return "pending";
  if (c.review_status === "rejected") return "rejected";
  if (!c.is_active) return "inactive";
  if (c.valid_until && new Date(c.valid_until) < new Date()) return "expired";
  if (c.max_uses != null && c.uses >= c.max_uses) return "exhausted";
  return "active";
}

async function authedFetch(url: string, opts: RequestInit = {}) {
  const token = await getToken();
  return fetch(url, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers ?? {}),
    },
    credentials: "include",
  });
}

// ── Component ──────────────────────────────────────────────────────────────

export default function Coupons() {
  const { isAuthorized } = useAdminGuard();

  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCoupons();
  }, []);

  async function loadCoupons() {
    setLoading(true);
    const res = await authedFetch("/old/api/coupons");
    if (res.ok) {
      const data = await res.json();
      setCoupons(data.coupons ?? []);
    }
    setLoading(false);
  }

  function copyCode(code: string) {
    navigator.clipboard.writeText(code).then(() => toast.success(`Copied ${code}`));
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="font-['Satoshi'] text-neutral-500">Checking access…</p>
      </div>
    );
  }

  const pending = coupons.filter((c) => couponStatus(c) === "pending");
  const active = coupons.filter((c) => couponStatus(c) === "active");
  const inactive = coupons.filter((c) => !["active", "pending"].includes(couponStatus(c)));


  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-['Clash_Display'] text-2xl font-semibold text-neutral-900">
            Coupon Codes
          </h1>
          <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
            Discount codes from the old product checkout
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── LEFT: was the generator; the archive is read only ──────────── */}
          <div className="h-fit rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <div className="border-b-2 border-neutral-900 px-6 py-4">
              <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                New Coupon
              </h2>
            </div>
            <p className="p-6 font-['Satoshi'] text-sm text-neutral-600">
              Coupons are not created, approved, switched off or deleted from here. {ARCHIVE_READ_ONLY}
            </p>
          </div>

          {/* ── RIGHT: List ───────────────────────────────────────────────── */}
          <div className="space-y-6">
          {pending.length > 0 && (
            <div className="rounded-xl border-2 border-amber-500 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <div className="border-b-2 border-amber-500 px-6 py-4">
                <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                  Pending review
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-amber-700">
                    {pending.length}
                  </span>
                </h2>
              </div>
              <div className="divide-y divide-neutral-100">
                {pending.map((c) => (
                  <CouponRow key={c.id} coupon={c} onCopy={copyCode} />
                ))}
              </div>
            </div>
          )}
          <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <div className="border-b-2 border-neutral-900 px-6 py-4 flex items-center justify-between">
              <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                Active Coupons
                {active.length > 0 && (
                  <span className="ml-2 rounded-full bg-emerald-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-emerald-700">
                    {active.length}
                  </span>
                )}
              </h2>
            </div>

            <div className="divide-y divide-neutral-100 max-h-[420px] overflow-y-auto">
              {loading && (
                <p className="px-6 py-10 text-center font-['Satoshi'] text-sm text-neutral-400">Loading…</p>
              )}
              {!loading && active.length === 0 && (
                <p className="px-6 py-10 text-center font-['Satoshi'] text-sm text-neutral-400">
                  No active coupons.
                </p>
              )}
              {active.map((c) => (
                <CouponRow key={c.id} coupon={c} onCopy={copyCode} />
              ))}
            </div>

            {inactive.length > 0 && (
              <>
                <div className="border-t-2 border-neutral-900 px-6 py-3 bg-neutral-50">
                  <p className="font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-400">
                    Expired / Used up
                  </p>
                </div>
                <div className="divide-y divide-neutral-100 max-h-48 overflow-y-auto opacity-60">
                  {inactive.map((c) => (
                    <CouponRow key={c.id} coupon={c} onCopy={copyCode} />
                  ))}
                </div>
              </>
            )}
          </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── CouponRow ──────────────────────────────────────────────────────────────

function CouponRow({ coupon: c, onCopy }: { coupon: Coupon; onCopy: (code: string) => void }) {
  const status = couponStatus(c);

  const statusBadge = {
    active: "bg-emerald-100 text-emerald-700",
    expired: "bg-neutral-100 text-neutral-500",
    exhausted: "bg-amber-100 text-amber-700",
    inactive: "bg-red-100 text-red-600",
    pending: "bg-amber-100 text-amber-700",
    rejected: "bg-red-100 text-red-600",
  }[status];

  const discountLabel =
    c.discount_type === "percent"
      ? `${c.discount_value}% off`
      : `₹${c.discount_value} off`;

  const expiryLabel = c.valid_until
    ? new Date(c.valid_until) < new Date()
      ? `Expired ${new Date(c.valid_until).toLocaleDateString()}`
      : `Expires ${new Date(c.valid_until).toLocaleDateString()}`
    : "Never expires";

  const usageLabel =
    c.max_uses != null ? `${c.uses} / ${c.max_uses}` : `${c.uses}`;

  const createdLabel = c.created_at
    ? new Date(c.created_at).toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
    : null;

  return (
    <div className="flex items-center gap-3 px-6 py-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-mono text-sm font-bold text-neutral-900 tracking-wider">
            {c.code}
          </span>
          <span className={`rounded-full px-2 py-0.5 font-['Satoshi'] text-xs font-semibold ${statusBadge}`}>
            {status}
          </span>
          <span className="rounded-full bg-violet-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-violet-700">
            {discountLabel}
          </span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 font-['Satoshi'] text-xs font-semibold text-neutral-600">
            {usageLabel} uses
          </span>
        </div>
        <p className="mt-0.5 font-['Satoshi'] text-xs text-neutral-400">
          {expiryLabel}
          {c.distributor_name && ` · ${c.distributor_name}`}
          {createdLabel && ` · Created ${createdLabel}`}
          {c.created_by && ` by ${c.created_by}`}
          {c.reviewed_by && status !== "pending" && ` · Reviewed by ${c.reviewed_by}`}
        </p>
      </div>
      <button
        onClick={() => onCopy(c.code)}
        className="shrink-0 rounded border border-neutral-300 px-2 py-1 font-['Satoshi'] text-xs text-neutral-500 hover:border-violet-400 hover:text-violet-600"
      >
        Copy
      </button>
    </div>
  );
}
