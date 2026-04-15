import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/coupons";

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
}

// ── Helpers ────────────────────────────────────────────────────────────────

function randomCode(prefix = "") {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = prefix ? prefix.toUpperCase() + "" : "";
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function couponStatus(c: Coupon): "active" | "expired" | "exhausted" | "inactive" {
  if (!c.is_active) return "inactive";
  if (c.valid_until && new Date(c.valid_until) < new Date()) return "expired";
  if (c.max_uses != null && c.uses >= c.max_uses) return "exhausted";
  return "active";
}

function expiresInHours(h: number): string {
  return new Date(Date.now() + h * 60 * 60 * 1000).toISOString();
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

  // Form state
  const [code, setCode] = useState(() => randomCode());
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [discountValue, setDiscountValue] = useState("10");
  const [expiryPreset, setExpiryPreset] = useState<"24h" | "7d" | "30d" | "never" | "custom">("24h");
  const [customExpiry, setCustomExpiry] = useState("");
  const [maxUses, setMaxUses] = useState("");
  const [distributorName, setDistributorName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    loadCoupons();
  }, []);

  async function loadCoupons() {
    setLoading(true);
    const res = await authedFetch("/api/coupons");
    if (res.ok) {
      const data = await res.json();
      setCoupons(data.coupons ?? []);
    }
    setLoading(false);
  }

  async function createCoupon() {
    if (!code.trim()) { toast.error("Enter a coupon code"); return; }
    const val = parseFloat(discountValue);
    if (isNaN(val) || val <= 0) { toast.error("Enter a valid discount value"); return; }
    if (discountType === "percent" && val > 100) { toast.error("Percentage can't exceed 100"); return; }

    let expires_at: string | null = null;
    if (expiryPreset === "24h") expires_at = expiresInHours(24);
    else if (expiryPreset === "7d") expires_at = expiresInHours(24 * 7);
    else if (expiryPreset === "30d") expires_at = expiresInHours(24 * 30);
    else if (expiryPreset === "custom" && customExpiry) expires_at = new Date(customExpiry).toISOString();

    setCreating(true);
    const res = await authedFetch("/api/coupons", {
      method: "POST",
      body: JSON.stringify({
        code: code.trim(),
        discount_type: discountType,
        discount_value: val,
        max_uses: maxUses ? parseInt(maxUses) : null,
        valid_until: expires_at,
        distributor_name: distributorName.trim() || null,
      }),
    });

    setCreating(false);

    if (!res.ok) {
      const err = await res.json();
      toast.error(err.error ?? "Failed to create coupon");
      return;
    }

    toast.success(`Coupon ${code.toUpperCase()} created`);
    setCode(randomCode());
    setDistributorName("");
    setMaxUses("");
    await loadCoupons();
  }

  async function deleteCoupon(id: string, code: string) {
    const res = await authedFetch("/api/coupons", {
      method: "DELETE",
      body: JSON.stringify({ id }),
    });
    if (!res.ok) { toast.error("Failed to delete coupon"); return; }
    toast.success(`Coupon ${code} deleted`);
    setCoupons((prev) => prev.filter((c) => c.id !== id));
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

  const active = coupons.filter((c) => couponStatus(c) === "active");
  const inactive = coupons.filter((c) => couponStatus(c) !== "active");


  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-['Clash_Display'] text-2xl font-semibold text-neutral-900">
            Coupon Codes
          </h1>
          <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
            Generate and manage discount codes for checkout
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── LEFT: Generator ───────────────────────────────────────────── */}
          <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <div className="border-b-2 border-neutral-900 px-6 py-4">
              <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                New Coupon
              </h2>
            </div>
            <div className="p-6 space-y-5">
              {/* Code */}
              <Field label="Code" required>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase())}
                    placeholder="WELCOME10"
                    className={`${inputCls} flex-1 font-mono tracking-widest`}
                  />
                  <button
                    onClick={() => setCode(randomCode())}
                    title="Generate random code"
                    className="shrink-0 rounded-lg border-2 border-neutral-900 bg-white px-3 py-2 font-['Satoshi'] text-sm shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
                  >
                    ↻
                  </button>
                </div>
              </Field>

              {/* Discount type + value */}
              <Field label="Discount" required>
                <div className="flex gap-2">
                  <div className="flex rounded-lg border-2 border-neutral-900 overflow-hidden">
                    {(["percent", "fixed"] as const).map((t) => (
                      <button
                        key={t}
                        onClick={() => setDiscountType(t)}
                        className={`px-4 py-2 font-['Satoshi'] text-sm font-semibold transition-colors ${
                          discountType === t
                            ? "bg-violet-500 text-white"
                            : "bg-white text-neutral-600 hover:bg-neutral-50"
                        }`}
                      >
                        {t === "percent" ? "%" : "₹ Fixed"}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(e.target.value)}
                    min="1"
                    max={discountType === "percent" ? "100" : undefined}
                    className={`${inputCls} w-28`}
                    placeholder={discountType === "percent" ? "10" : "500"}
                  />
                  <span className="flex items-center font-['Satoshi'] text-sm text-neutral-400">
                    {discountType === "percent" ? "%" : "₹"}
                  </span>
                </div>
              </Field>

              {/* Expiry */}
              <Field label="Expires">
                <div className="flex flex-wrap gap-2 mb-2">
                  {(["24h", "7d", "30d", "never", "custom"] as const).map((p) => (
                    <Pill
                      key={p}
                      label={p === "24h" ? "24 hours" : p === "7d" ? "7 days" : p === "30d" ? "30 days" : p === "never" ? "Never" : "Custom"}
                      active={expiryPreset === p}
                      onClick={() => setExpiryPreset(p)}
                    />
                  ))}
                </div>
                {expiryPreset === "custom" && (
                  <input
                    type="datetime-local"
                    value={customExpiry}
                    onChange={(e) => setCustomExpiry(e.target.value)}
                    className={inputCls}
                  />
                )}
              </Field>

              {/* Max uses */}
              <Field label="Max uses (leave blank for unlimited)">
                <input
                  type="number"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  min="1"
                  placeholder="Unlimited"
                  className={inputCls}
                />
              </Field>

              {/* Distributor / source */}
              <Field label="Source / distributor (internal)">
                <input
                  type="text"
                  value={distributorName}
                  onChange={(e) => setDistributorName(e.target.value)}
                  placeholder="e.g. leads-ready email, George, CU Chalants"
                  className={inputCls}
                />
              </Field>

              <button
                onClick={createCoupon}
                disabled={creating}
                className="w-full rounded-lg border-2 border-neutral-900 bg-violet-500 py-3 font-['Satoshi'] text-sm font-bold text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:opacity-50"
              >
                {creating ? "Creating…" : "Create Coupon"}
              </button>
            </div>
          </div>

          {/* ── RIGHT: List ───────────────────────────────────────────────── */}
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
                  No active coupons. Create one on the left.
                </p>
              )}
              {active.map((c) => (
                <CouponRow key={c.id} coupon={c} onCopy={copyCode} onDelete={deleteCoupon} />
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
                    <CouponRow key={c.id} coupon={c} onCopy={copyCode} onDelete={deleteCoupon} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── CouponRow ──────────────────────────────────────────────────────────────

function CouponRow({
  coupon: c,
  onCopy,
  onDelete,
}: {
  coupon: Coupon;
  onCopy: (code: string) => void;
  onDelete: (id: string, code: string) => void;
}) {
  const status = couponStatus(c);

  const statusBadge = {
    active: "bg-emerald-100 text-emerald-700",
    expired: "bg-neutral-100 text-neutral-500",
    exhausted: "bg-amber-100 text-amber-700",
    inactive: "bg-red-100 text-red-600",
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
    c.max_uses != null ? `${c.uses}/${c.max_uses} uses` : `${c.uses} uses`;

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
        </div>
        <p className="mt-0.5 font-['Satoshi'] text-xs text-neutral-400">
          {expiryLabel} &middot; {usageLabel}
          {c.distributor_name && ` · ${c.distributor_name}`}
        </p>
      </div>
      <button
        onClick={() => onCopy(c.code)}
        className="shrink-0 rounded border border-neutral-300 px-2 py-1 font-['Satoshi'] text-xs text-neutral-500 hover:border-violet-400 hover:text-violet-600"
      >
        Copy
      </button>
      <button
        onClick={() => onDelete(c.id, c.code)}
        className="shrink-0 text-neutral-300 hover:text-red-400 text-sm"
        title="Delete"
      >
        ✕
      </button>
    </div>
  );
}

// ── Micro components ───────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border-2 border-neutral-200 bg-white px-3 py-2 font-['Satoshi'] text-sm outline-none transition-colors focus:border-violet-500";

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block font-['Satoshi'] text-sm font-semibold text-neutral-700">
        {label}
        {required && <span className="ml-1 text-red-400">*</span>}
      </label>
      {children}
    </div>
  );
}

function Pill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border-2 border-neutral-900 px-3 py-1 font-['Satoshi'] text-xs font-medium shadow-[1px_1px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${
        active ? "bg-violet-500 text-white" : "bg-white text-neutral-600"
      }`}
    >
      {label}
    </button>
  );
}
