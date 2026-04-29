import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { AdminHeader, StatCard, SearchInput } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { listPayments, type PaidPayment, type PaymentsStats } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/paid-users";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Paid Users – Admin Panel" },
    { name: "description", content: "All payment orders across Razorpay and Dodo" },
  ];
}

function countryFlag(code: string | null): string {
  if (!code || code.length !== 2) return "🌐";
  return code
    .toUpperCase()
    .replace(/./g, (c) => String.fromCodePoint(127397 + c.charCodeAt(0)));
}

function formatAmount(cents: number, currency: string): string {
  if (currency === "INR") {
    return `₹${(cents / 100).toLocaleString("en-IN")}`;
  }
  return `$${(cents / 100).toFixed(2)}`;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const PROVIDER_STYLES: Record<string, { label: string; className: string }> = {
  razorpay: {
    label: "Razorpay",
    className: "bg-blue-100 text-blue-800 border-blue-300",
  },
  dodo: {
    label: "Dodo",
    className: "bg-green-100 text-green-800 border-green-300",
  },
  coupon: {
    label: "Coupon",
    className: "bg-yellow-100 text-yellow-800 border-yellow-300",
  },
};

const STATUS_STYLES: Record<string, string> = {
  paid: "bg-emerald-100 text-emerald-800 border-emerald-300",
  created: "bg-neutral-100 text-neutral-600 border-neutral-300",
};

const ORDER_STATUS_STYLES: Record<string, string> = {
  leads_ready: "bg-violet-100 text-violet-800 border-violet-300",
  campaign_running: "bg-green-100 text-green-800 border-green-300",
  campaign_setup: "bg-blue-100 text-blue-800 border-blue-300",
  enrichment_complete: "bg-orange-100 text-orange-800 border-orange-300",
  email_connected: "bg-teal-100 text-teal-800 border-teal-300",
  completed: "bg-emerald-100 text-emerald-800 border-emerald-300",
};

const STATUS_FILTERS = [
  { value: "paid", label: "Paid" },
  { value: "abandoned", label: "Abandoned" },
  { value: "all", label: "All" },
] as const;

interface DetailModalProps {
  payment: PaidPayment | null;
  onClose: () => void;
}

function DetailModal({ payment, onClose }: DetailModalProps) {
  if (!payment) return null;

  const providerStyle = PROVIDER_STYLES[payment.provider] ?? PROVIDER_STYLES.coupon;

  return (
    <AnimatePresence>
      {payment && (
        <>
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 z-50 bg-black/50"
          />
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border-2 border-neutral-900 bg-white p-6 shadow-[6px_6px_0px_0px_rgba(25,26,35,1)] md:p-8"
          >
            <div className="mb-6 flex items-start justify-between">
              <div>
                <h2 className="font-['Clash_Display'] text-2xl font-medium text-neutral-950">
                  Payment #{payment.id}
                </h2>
                <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
                  {formatDate(payment.created_at)}
                </p>
              </div>
              <button
                onClick={onClose}
                className="rounded-lg border-2 border-neutral-900 bg-white px-3 py-1.5 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                ✕ Close
              </button>
            </div>

            <div className="space-y-5">
              {/* User */}
              <Section title="User">
                <Row label="Name" value={payment.user_name} />
                <Row label="Email" value={payment.user_email} mono />
                <Row label="User ID" value={payment.user_id} mono small />
              </Section>

              {/* Payment */}
              <Section title="Payment">
                <Row
                  label="Amount"
                  value={formatAmount(payment.amount_cents, payment.currency)}
                />
                <Row
                  label="Provider"
                  value={
                    <span
                      className={`inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${providerStyle.className}`}
                    >
                      {providerStyle.label}
                    </span>
                  }
                />
                <Row label="Plan tier" value={payment.tier === 350 ? "Pro (350)" : "Standard (200)"} />
                <Row label="Credits granted" value={String(payment.credits_granted)} />
                <Row
                  label="Status"
                  value={
                    <span
                      className={`inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium capitalize ${STATUS_STYLES[payment.status] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`}
                    >
                      {payment.status}
                    </span>
                  }
                />
                <Row
                  label="Country"
                  value={
                    payment.geo_country
                      ? `${countryFlag(payment.geo_country)} ${payment.geo_country}`
                      : "—"
                  }
                />
                {payment.coupon_code && (
                  <Row label="Coupon" value={payment.coupon_code} mono />
                )}
              </Section>

              {/* Payment IDs */}
              <Section title="Payment IDs">
                {payment.razorpay_order_id && (
                  <Row label="Razorpay Order" value={payment.razorpay_order_id} mono small />
                )}
                {payment.razorpay_payment_id && (
                  <Row label="Razorpay Payment" value={payment.razorpay_payment_id} mono small />
                )}
                {payment.dodo_checkout_id && (
                  <Row label="Dodo Checkout" value={payment.dodo_checkout_id} mono small />
                )}
                {payment.dodo_payment_id && (
                  <Row label="Dodo Payment" value={payment.dodo_payment_id} mono small />
                )}
                {!payment.razorpay_order_id &&
                  !payment.razorpay_payment_id &&
                  !payment.dodo_checkout_id &&
                  !payment.dodo_payment_id && (
                    <p className="font-['Satoshi'] text-sm text-neutral-400">No payment IDs (coupon-only)</p>
                  )}
              </Section>

              {/* Outreach */}
              <Section title="Outreach">
                <Row
                  label="Order status"
                  value={
                    payment.outreach_order_status ? (
                      <span
                        className={`inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${ORDER_STATUS_STYLES[payment.outreach_order_status] ?? "bg-neutral-100 text-neutral-600 border-neutral-300"}`}
                      >
                        {payment.outreach_order_status.replace(/_/g, " ")}
                      </span>
                    ) : (
                      "—"
                    )
                  }
                />
              </Section>

              <a
                href={`/outreach-orders?search=${encodeURIComponent(payment.user_email)}`}
                className="mt-2 inline-block rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-2 font-['Satoshi'] text-sm font-medium text-white shadow-[3px_3px_0px_0px_rgba(25,26,35,1)] transition-transform hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
              >
                View in Outreach Orders →
              </a>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border-2 border-neutral-200 p-4">
      <p className="mb-3 font-['Clash_Display'] text-sm font-medium uppercase tracking-widest text-neutral-400">
        {title}
      </p>
      <div className="space-y-2">{children}</div>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  small,
}: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  small?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4">
      <span className="shrink-0 font-['Satoshi'] text-sm text-neutral-500">{label}</span>
      <span
        className={`text-right font-['Satoshi'] text-neutral-900 ${mono ? "font-mono" : ""} ${small ? "text-xs" : "text-sm"} break-all`}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

export default function PaidUsers() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [payments, setPayments] = useState<PaidPayment[]>([]);
  const [stats, setStats] = useState<PaymentsStats | null>(null);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"paid" | "abandoned" | "all">("paid");
  const [offset, setOffset] = useState(0);
  const [selectedPayment, setSelectedPayment] = useState<PaidPayment | null>(null);
  const limit = 50;

  const loadPayments = useCallback(async () => {
    try {
      setLoading(true);
      const data = await listPayments(limit, offset, search, statusFilter);
      setPayments(data.payments ?? []);
      setTotal(data.total ?? 0);
      setStats(data.stats ?? null);
    } catch (err: any) {
      toast.error(err.message || "Failed to load payments");
      setPayments([]);
    } finally {
      setLoading(false);
    }
  }, [offset, search, statusFilter]);

  useEffect(() => {
    if (isAuthorized) {
      loadPayments();
    }
  }, [isAuthorized, loadPayments]);

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
          <p className="font-['Satoshi'] text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthorized) return null;

  const inrRevenue = stats
    ? `₹${(stats.total_inr_paise / 100).toLocaleString("en-IN")}`
    : "—";
  const usdRevenue = stats ? `$${(stats.total_usd_cents / 100).toFixed(2)}` : "—";

  return (
    <>
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="font-['Clash_Display'] text-3xl font-medium leading-tight tracking-tight text-neutral-950 md:text-4xl">
            Paid Users
          </h1>
          <p className="mt-2 font-['Satoshi'] text-base font-normal leading-6 text-gray-600">
            All payment orders across Razorpay and Dodo
          </p>
        </motion.div>

        {/* Stat Cards */}
        {stats && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4"
          >
            <StatCard value={stats.total_paid} label="Paid Orders" color="purple" delay={0} />
            <StatCard value={inrRevenue} label="INR Revenue" color="green" delay={0.1} />
            <StatCard value={usdRevenue} label="USD Revenue" color="orange" delay={0.2} />
            <StatCard value={stats.total_abandoned} label="Abandoned Checkouts" color="pink" delay={0.3} />
          </motion.div>
        )}

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-8 flex flex-col gap-4 md:flex-row md:items-center"
        >
          <div className="flex-1">
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setOffset(0);
              }}
              placeholder="Search by name or email..."
            />
          </div>
          <div className="flex gap-2">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setStatusFilter(f.value);
                  setOffset(0);
                }}
                className={`rounded-lg border-2 border-neutral-900 px-4 py-2 font-['Satoshi'] text-sm font-medium transition-transform hover:translate-x-[1px] hover:translate-y-[1px] ${
                  statusFilter === f.value
                    ? "bg-neutral-900 text-white shadow-none"
                    : "bg-white text-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] hover:shadow-none"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </motion.div>

        {/* Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-6"
        >
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-center">
                <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
                <p className="font-['Satoshi'] text-sm text-gray-600">Loading payments...</p>
              </div>
            </div>
          ) : payments.length === 0 ? (
            <div className="rounded-2xl border-2 border-neutral-900 bg-white p-12 text-center shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
              <p className="font-['Satoshi'] text-lg font-medium text-neutral-500">No payments found</p>
              {search && (
                <p className="mt-2 font-['Satoshi'] text-sm text-neutral-400">
                  Try clearing the search filter
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="border-b-2 border-neutral-900 bg-neutral-50">
                      {["User", "Amount", "Provider", "Plan", "Country", "Coupon", "Order Status", "Date"].map(
                        (col) => (
                          <th
                            key={col}
                            className="px-4 py-4 text-left font-['Satoshi'] text-xs font-bold uppercase tracking-wider text-neutral-500"
                          >
                            {col}
                          </th>
                        )
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {payments.map((p, i) => {
                        const providerStyle =
                          PROVIDER_STYLES[p.provider] ?? PROVIDER_STYLES.coupon;
                        const orderStatusClass =
                          ORDER_STATUS_STYLES[p.outreach_order_status ?? ""] ??
                          "bg-neutral-100 text-neutral-600 border-neutral-300";

                        return (
                          <motion.tr
                            key={p.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2, delay: i * 0.02 }}
                            onClick={() => setSelectedPayment(p)}
                            className="cursor-pointer border-b border-neutral-200 transition-colors last:border-b-0 hover:bg-violet-50"
                          >
                            {/* User */}
                            <td className="px-4 py-4">
                              <p className="font-['Satoshi'] text-sm font-semibold text-neutral-900">
                                {p.user_name}
                              </p>
                              <p className="font-['Satoshi'] text-xs text-neutral-500">
                                {p.user_email}
                              </p>
                            </td>

                            {/* Amount */}
                            <td className="px-4 py-4 font-['Satoshi'] text-sm font-semibold text-neutral-900">
                              {formatAmount(p.amount_cents, p.currency)}
                            </td>

                            {/* Provider */}
                            <td className="px-4 py-4">
                              <span
                                className={`inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${providerStyle.className}`}
                              >
                                {providerStyle.label}
                              </span>
                            </td>

                            {/* Plan */}
                            <td className="px-4 py-4">
                              <span className="inline-block rounded border border-neutral-300 bg-neutral-100 px-2 py-0.5 font-['Satoshi'] text-xs font-medium text-neutral-700">
                                {p.tier === 350 ? "Pro" : "Standard"}
                              </span>
                            </td>

                            {/* Country */}
                            <td className="px-4 py-4 font-['Satoshi'] text-sm text-neutral-700">
                              {p.geo_country
                                ? `${countryFlag(p.geo_country)} ${p.geo_country}`
                                : "—"}
                            </td>

                            {/* Coupon */}
                            <td className="px-4 py-4 font-mono text-xs text-neutral-600">
                              {p.coupon_code ?? "—"}
                            </td>

                            {/* Order Status */}
                            <td className="px-4 py-4">
                              {p.outreach_order_status ? (
                                <span
                                  className={`inline-block rounded border px-2 py-0.5 font-['Satoshi'] text-xs font-medium ${orderStatusClass}`}
                                >
                                  {p.outreach_order_status.replace(/_/g, " ")}
                                </span>
                              ) : (
                                <span className="font-['Satoshi'] text-xs text-neutral-400">—</span>
                              )}
                            </td>

                            {/* Date */}
                            <td className="px-4 py-4" title={formatDate(p.created_at)}>
                              <span className="font-['Satoshi'] text-sm text-neutral-600">
                                {timeAgo(p.created_at)}
                              </span>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="mt-6 flex items-center justify-between">
                <p className="font-['Satoshi'] text-sm text-neutral-600">
                  Showing {offset + 1}–{Math.min(offset + payments.length, total)} of {total}
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => setOffset(Math.max(0, offset - limit))}
                    disabled={offset === 0}
                    className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:opacity-40 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    ← Previous
                  </button>
                  <button
                    onClick={() => setOffset(offset + limit)}
                    disabled={offset + payments.length >= total}
                    className="rounded-lg border-2 border-neutral-900 bg-white px-4 py-2 font-['Satoshi'] text-sm font-medium shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-transform disabled:opacity-40 hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </>
          )}
        </motion.div>
      </main>

      <DetailModal payment={selectedPayment} onClose={() => setSelectedPayment(null)} />
    </>
  );
}
