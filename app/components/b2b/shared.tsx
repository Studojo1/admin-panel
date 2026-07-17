import { getToken } from "~/lib/api";
import {
  BLOCKED_STAGES,
  STAGE_LABELS,
  WON_STAGES,
  type Stage,
  type Temperature,
} from "~/lib/b2b-gtm";

/** Shared by the list and the company page. Mirrors the coupons.tsx helper. */
export async function authedFetch(url: string, opts: RequestInit = {}) {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(url, {
    ...opts,
    headers: {
      ...(opts.headers || {}),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    credentials: "include",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

const TEMP_STYLES: Record<Temperature, string> = {
  hot: "bg-red-100 text-red-700 border-red-200",
  warm: "bg-orange-100 text-orange-700 border-orange-200",
  neutral: "bg-gray-100 text-gray-600 border-gray-200",
  cold: "bg-blue-100 text-blue-700 border-blue-200",
};

export function TempBadge({ t }: { t: Temperature | null }) {
  if (!t) return <span className="text-gray-300 text-xs">—</span>;
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border capitalize ${TEMP_STYLES[t]}`}
    >
      {t}
    </span>
  );
}

export function StageBadge({ s }: { s: Stage }) {
  const won = WON_STAGES.includes(s);
  const blocked = BLOCKED_STAGES.includes(s);
  const lost = s === "closed_lost" || s === "feedback_pending" || s === "comeback_scheduled";
  const cls = won
    ? "bg-green-100 text-green-700 border-green-200"
    : blocked
    ? "bg-amber-100 text-amber-700 border-amber-200"
    : lost
    ? "bg-rose-100 text-rose-700 border-rose-200"
    : "bg-violet-100 text-violet-700 border-violet-200";
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium border ${cls}`}>
      {STAGE_LABELS[s] ?? s}
    </span>
  );
}

export function BrochureBadge() {
  return (
    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 border border-yellow-300">
      Brochure needed
    </span>
  );
}

export const inputCls =
  "w-full px-3 py-2 rounded-xl border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-violet-400";

export function Shell({
  title,
  onClose,
  wide,
  children,
}: {
  title: string;
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
      <div
        className={`bg-white rounded-2xl border-2 border-neutral-900 shadow-[6px_6px_0px_0px_rgba(25,26,35,1)] w-full ${
          wide ? "max-w-2xl" : "max-w-lg"
        } my-8`}
      >
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
          <h2
            className="font-bold text-gray-900"
            style={{ fontFamily: "Clash Display, sans-serif" }}
          >
            {title}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-900 text-xl leading-none"
          >
            ×
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">{label}</label>
      {children}
    </div>
  );
}

export function Choice({
  active,
  onClick,
  children,
}: {
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-xl text-sm border capitalize transition-colors ${
        active
          ? "bg-neutral-900 text-white border-neutral-900 font-medium"
          : "bg-white text-gray-700 border-gray-300 hover:border-gray-400"
      }`}
    >
      {children}
    </button>
  );
}
