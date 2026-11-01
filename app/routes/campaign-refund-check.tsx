import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { reportRetired } from "~/lib/retired-service";
import { ARCHIVE_READ_ONLY } from "~/lib/archive";

// Refund Policy v3.0 §3.3: did an outreach campaign fail completely?
// Computed as job-outreach-svc (services/refund_check.py) did, now straight
// from the database (app/lib/outreach-archive). Read only: no restarts or refunds.

type Result = "yes" | "no" | "check" | "open";

interface RefundCheck {
  campaign: {
    id: number; name: string; status: string; pause_reason: string | null; timezone: string;
    created_at: string | null; started_at: string | null; user_id: string | null; user_email: string | null;
    credits_reserved: number; first_touch_sent: number;
  };
  daily: { date: string; sent: number }[];
  streak: { days: number; start: string | null; end: string | null };
  conditions: { n: number; label: string; result: Result; note: string }[];
  verdict: "met" | "not_met" | "open";
  refund: null | {
    payment_id: number; provider: string; currency: string; paid_cents: number; already_refunded_cents: number;
    credits_bought: number; per_credit_cents: number; unsent_credits: number; amount_cents: number;
    provider_payment_id: string | null;
  };
}

const RESULT_PILL: Record<Result, { label: string; cls: string }> = {
  yes: { label: "Yes", cls: "bg-emerald-100 text-emerald-800" },
  no: { label: "No", cls: "bg-red-100 text-red-700" },
  check: { label: "Check", cls: "bg-amber-100 text-amber-800" },
  open: { label: "Open", cls: "bg-amber-100 text-amber-800" },
};

const VERDICT: Record<RefundCheck["verdict"], { label: string; cls: string }> = {
  met: { label: "Refund §3.3 met", cls: "bg-red-100 text-red-700" },
  not_met: { label: "§3.3 not met", cls: "bg-neutral-100 text-neutral-700" },
  open: { label: "§3.3 still open", cls: "bg-amber-100 text-amber-800" },
};

function money(cents: number, currency: string) {
  const symbol = currency === "INR" ? "₹" : currency === "USD" ? "$" : `${currency} `;
  const v = cents / 100;
  return symbol + v.toLocaleString("en-IN", { maximumFractionDigits: v % 1 ? 2 : 0 });
}

function day(iso: string | null) {
  if (!iso) return "–";
  return new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

async function call(method: "GET" | "POST", query: string, body?: unknown) {
  const token = await getToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`/old/api/refund-check${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  reportRetired(data);
  if (!res.ok) throw new Error((data as any).detail || (data as any).error || `HTTP ${res.status}`);
  return data;
}

function Bars({ daily }: { daily: RefundCheck["daily"] }) {
  const max = Math.max(4, ...daily.map((d) => d.sent));
  return (
    <div>
      <div className="flex h-36 items-end gap-1 border-b-2 border-neutral-900 px-1 pt-2">
        {daily.map((d) => (
          <div
            key={d.date}
            title={`${day(d.date)}: ${d.sent} sent`}
            className={
              d.sent === 0
                ? "h-1 flex-1 rounded-t border border-b-0 border-red-500 bg-red-100"
                : "flex-1 rounded-t border-[1.5px] border-b-0 border-neutral-900 bg-violet-500"
            }
            style={d.sent ? { height: `${(d.sent / max) * 100}%` } : undefined}
          />
        ))}
      </div>
      <div className="flex gap-1 px-1 pt-1">
        {daily.map((d, i) => (
          <span key={d.date} className="flex-1 text-center font-['Satoshi'] text-[10px] text-neutral-500 tabular-nums">
            {daily.length <= 31 || i % Math.ceil(daily.length / 31) === 0 ? Number(d.date.slice(8)) : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "red" }) {
  return (
    <div className="rounded-2xl border-2 border-neutral-900 bg-white p-4 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
      <div className="font-['Satoshi'] text-sm text-neutral-600">{label}</div>
      <div className={`font-['Clash_Display'] text-3xl font-semibold tabular-nums ${tone === "red" ? "text-red-600" : "text-neutral-900"}`}>{value}</div>
      {sub && <div className="font-['Satoshi'] text-sm text-neutral-600">{sub}</div>}
    </div>
  );
}

export default function CampaignRefundCheck() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const campaignId = params.get("campaign_id") ?? "";
  const reportedOn = params.get("reported_on") ?? "";
  const [idInput, setIdInput] = useState(campaignId);
  const [data, setData] = useState<RefundCheck | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    if (!campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams({ campaign_id: campaignId, ...(reportedOn ? { reported_on: reportedOn } : {}) });
      setData(await call("GET", `?${qs}`));
    } catch (e) {
      setData(null);
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [campaignId, reportedOn]);

  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized, load]);

  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
      </div>
    );
  }
  if (!isAuthorized) return null;

  const c = data?.campaign;
  const r = data?.refund;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        <div className="mb-6 flex flex-col gap-2">
          <h1 className="font-['Clash_Display'] text-3xl font-medium text-neutral-950">Campaign refund check</h1>
          <p className="max-w-3xl font-['Satoshi'] text-sm text-neutral-600">
            Refund Policy §3.3: a campaign is refunded only if it was active with Gmail connected, sent nothing for 7 days in a row
            because of our systems, the user reported it within 15 days of the last send, and we didn't get it sending within 7 days.
          </p>
        </div>

        <form
          className="mb-6 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setParam("campaign_id", idInput.trim());
          }}
        >
          <div>
            <label htmlFor="campaign-id" className="mb-1 block font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">Campaign ID</label>
            <input
              id="campaign-id"
              inputMode="numeric"
              value={idInput}
              onChange={(e) => setIdInput(e.target.value.replace(/\D/g, ""))}
              placeholder="e.g. 1842"
              className="h-10 w-40 rounded-xl border-2 border-neutral-900 bg-white px-3 font-['Satoshi'] text-sm"
            />
          </div>
          <div>
            <label htmlFor="reported-on" className="mb-1 block font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500">User reported it on</label>
            <input
              id="reported-on"
              type="date"
              value={reportedOn}
              onChange={(e) => setParam("reported_on", e.target.value)}
              className="h-10 rounded-xl border-2 border-neutral-900 bg-white px-3 font-['Satoshi'] text-sm"
            />
          </div>
          <button type="submit" className="h-10 rounded-xl border-2 border-neutral-900 bg-violet-600 px-4 font-['Satoshi'] text-sm font-bold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
            Check
          </button>
        </form>

        {!campaignId && (
          <div className="rounded-2xl border-2 border-dashed border-neutral-300 bg-white p-8 text-center font-['Satoshi'] text-sm text-neutral-600">
            Enter a campaign ID, and the date the user first reported the problem (from their ticket or email).
          </div>
        )}
        {loading && <div className="py-10 text-center font-['Satoshi'] text-sm text-neutral-500">Loading…</div>}
        {error && <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 font-['Satoshi'] text-sm text-red-700" role="alert">{error}</div>}

        {data && c && !loading && (
          <div className="grid gap-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="font-['Clash_Display'] text-2xl font-medium text-neutral-900">{c.name}</div>
                <div className="font-['Satoshi'] text-sm text-neutral-600">
                  {c.user_email ?? "unknown user"} · {c.credits_reserved} credits reserved · created {day(c.created_at)}
                  {r && <> · paid {money(r.paid_cents, r.currency)} · {r.provider} {r.provider_payment_id ?? `#${r.payment_id}`}</>}
                  {" · "}
                  <Link to={`/old/outreach-campaign?campaign_id=${c.id}`} className="text-violet-700 underline">emails</Link>
                </div>
                <div className="mt-1 font-['Satoshi'] text-xs text-neutral-500">
                  Status: {c.status}{c.pause_reason ? ` (${c.pause_reason})` : ""} · days in {c.timezone}
                </div>
              </div>
              <span className={`rounded-full border-[1.5px] border-neutral-900 px-3 py-1 font-['Satoshi'] text-xs font-bold ${VERDICT[data.verdict].cls}`}>
                {VERDICT[data.verdict].label}
              </span>
            </div>

            <div className="rounded-2xl border-2 border-neutral-900 bg-white p-4 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
              <div className="mb-1 flex justify-between gap-2 font-['Satoshi'] text-sm">
                <b>Emails sent per day</b>
                <span className="text-neutral-500">red = no sends that day</span>
              </div>
              <Bars daily={data.daily} />
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <Tile label="Sent / reserved" value={`${c.first_touch_sent} / ${c.credits_reserved}`} />
              <Tile
                label="Longest zero-send streak"
                value={`${data.streak.days} day${data.streak.days === 1 ? "" : "s"}`}
                sub={data.streak.start ? `${day(data.streak.start)} to ${day(data.streak.end)}` : "none"}
                tone={data.streak.days >= 7 ? "red" : undefined}
              />
              <Tile
                label="Gmail in streak"
                value={data.conditions.find((x) => x.n === 2)?.result === "yes" ? "Connected" : "Problem"}
                sub={data.conditions.find((x) => x.n === 2)?.note}
              />
            </div>

            <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white">
              <table className="w-full font-['Satoshi'] text-sm">
                <thead>
                  <tr className="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-600">
                    <th className="px-4 py-3">Condition (§3.3)</th>
                    <th className="px-4 py-3">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {data.conditions.map((x) => (
                    <tr key={x.n} className="border-t border-neutral-100">
                      <td className="px-4 py-3">{x.n}. {x.label}</td>
                      <td className="px-4 py-3">
                        <span className={`mr-2 inline-block rounded-full border-[1.5px] border-neutral-900 px-2.5 py-0.5 text-xs font-bold ${RESULT_PILL[x.result].cls}`}>
                          {RESULT_PILL[x.result].label}
                        </span>
                        <span className="text-neutral-700">{x.note}</span>
                      </td>
                    </tr>
                  ))}
                  <tr className="border-t-2 border-neutral-200">
                    <td className="px-4 py-3 font-bold">Refund if condition 4 is confirmed</td>
                    <td className="px-4 py-3 tabular-nums">
                      {r
                        ? <>{r.unsent_credits} unsent × {money(r.per_credit_cents, r.currency)} = <b>{money(r.amount_cents, r.currency)}</b>{r.already_refunded_cents > 0 && <span className="text-neutral-500"> ({money(r.already_refunded_cents, r.currency)} already refunded)</span>}</>
                        : <span className="text-neutral-500">No paid payment linked to this campaign</span>}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <p className="font-['Satoshi'] text-sm text-neutral-600">
              Restarts and refunds are not made from here. {ARCHIVE_READ_ONLY}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
