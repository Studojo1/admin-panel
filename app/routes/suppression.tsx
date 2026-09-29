import { Fragment, useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";

// Outreach suppression list and data-removal requests. job-outreach-svc owns
// the rules (masking, 30-day deadline, what "delete data" removes); this page
// only lists, adds and triggers.

type Source = "bounce" | "removal_request" | "reply" | "manual";

interface Suppressed {
  id: number | string;
  email: string | null;
  source: Source;
  suppressed_at: string | null;
  hash_only: boolean;
}

interface RemovalRequest {
  id: number | string;
  email: string;
  received_at: string | null;
  deadline: string | null;
  status: "open" | "done";
  done_at: string | null;
}

const PAGE = 50;
const DAY_MS = 86_400_000;

const SOURCE: Record<Source, { label: string; cls: string }> = {
  bounce: { label: "Bounce", cls: "bg-amber-100 text-amber-800" },
  removal_request: { label: "Removal request", cls: "bg-red-100 text-red-700" },
  reply: { label: "Reply", cls: "bg-violet-100 text-violet-800" },
  manual: { label: "Manual", cls: "bg-neutral-100 text-neutral-700" },
};

function day(iso: string | null) {
  if (!iso) return "–";
  return new Date(iso.length === 10 ? iso + "T00:00:00" : iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function deadlineUrgent(r: RemovalRequest) {
  if (r.status !== "open" || !r.deadline) return false;
  const t = new Date(r.deadline.length === 10 ? r.deadline + "T23:59:59" : r.deadline).getTime();
  return t - Date.now() <= 7 * DAY_MS;
}

async function call(method: "GET" | "POST", query: string, body?: unknown) {
  const token = await getToken();
  if (!token) throw new Error("Please sign in again.");
  const res = await fetch(`/api/suppression${query}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any).detail || (data as any).error || `HTTP ${res.status}`);
  return data;
}

const inputCls = "h-10 rounded-xl border-2 border-neutral-900 bg-white px-3 font-['Satoshi'] text-sm";
const labelCls = "mb-1 block font-['Satoshi'] text-xs font-bold uppercase tracking-wide text-neutral-500";
const primaryBtn = "h-10 rounded-xl border-2 border-neutral-900 bg-violet-600 px-4 font-['Satoshi'] text-sm font-bold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-40";
const secondaryBtn = "h-10 rounded-xl border-2 border-neutral-900 bg-white px-4 font-['Satoshi'] text-sm font-bold text-neutral-900 disabled:opacity-40";

export default function SuppressionPage() {
  const { isAuthorized, isPending } = useAdminGuard();

  const [items, setItems] = useState<Suppressed[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [offset, setOffset] = useState(0);
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [listError, setListError] = useState<string | null>(null);
  const [listLoading, setListLoading] = useState(false);

  const [requests, setRequests] = useState<RemovalRequest[] | null>(null);
  const [showDone, setShowDone] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);

  const [addEmail, setAddEmail] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqDate, setReqDate] = useState(today);
  const [busy, setBusy] = useState<"suppress" | "request" | "delete" | null>(null);
  const [confirmId, setConfirmId] = useState<RemovalRequest["id"] | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const qs = new URLSearchParams({ view: "suppression", search, limit: String(PAGE), offset: String(offset) });
      const d = await call("GET", `?${qs}`);
      setItems(d.items ?? []);
      setTotal(d.total ?? 0);
    } catch (e) {
      setItems([]);
      setTotal(null);
      setListError((e as Error).message);
    } finally {
      setListLoading(false);
    }
  }, [search, offset]);

  const loadRequests = useCallback(async () => {
    setReqError(null);
    try {
      const d = await call("GET", "?view=requests&status=all");
      setRequests(d.items ?? []);
    } catch (e) {
      setRequests(null);
      setReqError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (isAuthorized) loadList();
  }, [isAuthorized, loadList]);

  useEffect(() => {
    if (isAuthorized) loadRequests();
  }, [isAuthorized, loadRequests]);

  const suppress = async () => {
    setBusy("suppress");
    try {
      const r = await call("POST", "", { op: "suppress", email: addEmail.trim() });
      toast.success(r.created ? `${addEmail.trim()} suppressed.` : `${addEmail.trim()} was already suppressed.`);
      setAddEmail("");
      await loadList();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const logRequest = async () => {
    setBusy("request");
    try {
      await call("POST", "", { op: "request", email: reqEmail.trim(), received_on: reqDate });
      toast.success(`Removal request logged. ${reqEmail.trim()} is suppressed from outreach now.`);
      setReqEmail("");
      setReqDate(today());
      await Promise.all([loadRequests(), loadList()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const deleteData = async (req: RemovalRequest) => {
    setBusy("delete");
    try {
      const r = await call("POST", "", { op: "delete-data", id: req.id });
      const counts = Object.entries((r.deleted ?? {}) as Record<string, number>)
        .map(([table, n]) => `${table}: ${n}`)
        .join(", ");
      toast.success(`Data deleted for ${req.email}. ${counts || "Nothing else was stored."}`, { duration: 10000 });
      setConfirmId(null);
      await Promise.all([loadRequests(), loadList()]);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent" />
      </div>
    );
  }
  if (!isAuthorized) return null;

  const openCount = requests?.filter((r) => r.status === "open").length ?? null;
  const shownRequests = (requests ?? []).filter((r) => showDone || r.status === "open");
  const pageEnd = total === null ? offset : Math.min(offset + PAGE, total);

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-[var(--section-max-width)] px-4 py-8 md:px-8 md:py-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-col gap-2">
            <h1 className="font-['Clash_Display'] text-3xl font-medium text-neutral-950">Suppression and removal</h1>
            <p className="max-w-3xl font-['Satoshi'] text-sm text-neutral-600">
              Addresses here never get outreach emails. Removal requests must have their data deleted within 30 days of receipt.
            </p>
          </div>
          <form
            className="flex items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (addEmail.trim()) suppress();
            }}
          >
            <div>
              <label htmlFor="add-email" className={labelCls}>Add an email to suppress</label>
              <input
                id="add-email"
                type="email"
                value={addEmail}
                onChange={(e) => setAddEmail(e.target.value)}
                placeholder="name@company.com"
                className={`${inputCls} w-64`}
              />
            </div>
            <button type="submit" disabled={!addEmail.trim() || busy !== null} className={primaryBtn}>
              {busy === "suppress" ? "Adding…" : "Add"}
            </button>
          </form>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          <span className="rounded-full border-[1.5px] border-neutral-900 bg-red-100 px-3 py-1 font-['Satoshi'] text-xs font-bold text-red-700">
            Removal requests: {openCount ?? "–"} open
          </span>
          <span className="rounded-full border-[1.5px] border-neutral-900 bg-neutral-100 px-3 py-1 font-['Satoshi'] text-xs font-bold text-neutral-700">
            Suppressed: {total ?? "–"}
          </span>
        </div>

        <section className="mb-8 grid gap-4">
          <h2 className="font-['Clash_Display'] text-2xl font-medium text-neutral-900">Removal requests</h2>
          <form
            className="flex flex-wrap items-end gap-3 rounded-2xl border-2 border-neutral-900 bg-white p-4 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
            onSubmit={(e) => {
              e.preventDefault();
              if (reqEmail.trim() && reqDate) logRequest();
            }}
          >
            <div>
              <label htmlFor="req-email" className={labelCls}>Email that asked to be removed</label>
              <input
                id="req-email"
                type="email"
                value={reqEmail}
                onChange={(e) => setReqEmail(e.target.value)}
                placeholder="name@company.com"
                className={`${inputCls} w-72`}
              />
            </div>
            <div>
              <label htmlFor="req-date" className={labelCls}>Date received</label>
              <input id="req-date" type="date" value={reqDate} max={today()} onChange={(e) => setReqDate(e.target.value)} className={inputCls} />
            </div>
            <button type="submit" disabled={!reqEmail.trim() || !reqDate || busy !== null} className={primaryBtn}>
              {busy === "request" ? "Logging…" : "Log removal request"}
            </button>
            <p className="basis-full font-['Satoshi'] text-xs text-neutral-500">
              For requests that arrived by email. The address is suppressed immediately; the deadline is 30 days after the date received.
            </p>
          </form>

          {reqError && <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 font-['Satoshi'] text-sm text-red-700" role="alert">{reqError}</div>}

          {requests && (
            <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white">
              <div className="flex justify-end border-b border-neutral-100 px-4 py-2">
                <label className="flex items-center gap-2 font-['Satoshi'] text-xs text-neutral-600">
                  <input type="checkbox" checked={showDone} onChange={(e) => setShowDone(e.target.checked)} />
                  Show completed requests
                </label>
              </div>
              <table className="w-full font-['Satoshi'] text-sm">
                <thead>
                  <tr className="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-600">
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">Received</th>
                    <th className="px-4 py-3">Deadline</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody>
                  {shownRequests.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-6 text-center text-neutral-500">
                        {showDone ? "No removal requests yet." : "No open removal requests."}
                      </td>
                    </tr>
                  )}
                  {shownRequests.map((r) => (
                    <Fragment key={r.id}>
                      <tr className="border-t border-neutral-100">
                        <td className="px-4 py-3">{r.email}</td>
                        <td className="px-4 py-3 tabular-nums">{day(r.received_at)}</td>
                        <td className={`px-4 py-3 tabular-nums ${deadlineUrgent(r) ? "font-bold text-red-600" : ""}`}>{day(r.deadline)}</td>
                        <td className="px-4 py-3">
                          {r.status === "open"
                            ? <span className="rounded-full border-[1.5px] border-neutral-900 bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">Open</span>
                            : <span className="rounded-full border-[1.5px] border-neutral-900 bg-emerald-100 px-2.5 py-0.5 text-xs font-bold text-emerald-800">Done {day(r.done_at)}</span>}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {r.status === "open" && (
                            <button
                              type="button"
                              onClick={() => setConfirmId(r.id)}
                              disabled={busy !== null}
                              className="h-9 rounded-xl border-2 border-neutral-900 bg-white px-3 text-sm font-bold text-red-700 disabled:opacity-40"
                            >
                              Delete data
                            </button>
                          )}
                        </td>
                      </tr>
                      {confirmId === r.id && (
                        <tr>
                          <td colSpan={5} className="px-4 pb-4">
                            <div className="rounded-2xl border-2 border-red-500 bg-red-50 p-4 shadow-[3px_3px_0px_0px_rgba(220,38,38,1)]">
                              <div className="mb-1 font-['Clash_Display'] text-lg font-medium text-red-700">Delete all data for {r.email}?</div>
                              <p className="mb-3 text-sm text-neutral-800">
                                This deletes the address from leads, enrichment caches and outreach history. Only a scrambled copy is kept so
                                it stays suppressed. This can't be undone.
                              </p>
                              <div className="flex gap-3">
                                <button
                                  type="button"
                                  onClick={() => deleteData(r)}
                                  disabled={busy !== null}
                                  className="h-10 rounded-xl border-2 border-neutral-900 bg-red-600 px-4 text-sm font-bold text-white disabled:opacity-40"
                                >
                                  {busy === "delete" ? "Deleting…" : "Delete data"}
                                </button>
                                <button type="button" onClick={() => setConfirmId(null)} className={secondaryBtn}>Cancel</button>
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <section className="grid gap-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <h2 className="font-['Clash_Display'] text-2xl font-medium text-neutral-900">Suppression list</h2>
            <form
              className="flex items-end gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                setOffset(0);
                setSearch(searchInput.trim());
              }}
            >
              <input
                aria-label="Search suppressed addresses"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search address"
                className={`${inputCls} w-56`}
              />
              <button type="submit" className={secondaryBtn}>Search</button>
            </form>
          </div>

          {listError && <div className="rounded-xl border-2 border-red-300 bg-red-50 p-4 font-['Satoshi'] text-sm text-red-700" role="alert">{listError}</div>}

          {!listError && (
            <div className="overflow-x-auto rounded-2xl border-2 border-neutral-900 bg-white">
              <table className="w-full font-['Satoshi'] text-sm">
                <thead>
                  <tr className="bg-neutral-100 text-left text-xs uppercase tracking-wide text-neutral-600">
                    <th className="px-4 py-3">Address</th>
                    <th className="px-4 py-3">Source</th>
                    <th className="px-4 py-3">Suppressed on</th>
                  </tr>
                </thead>
                <tbody>
                  {listLoading && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-neutral-500">Loading…</td></tr>
                  )}
                  {!listLoading && items.length === 0 && (
                    <tr><td colSpan={3} className="px-4 py-6 text-center text-neutral-500">{search ? "No matches." : "Nothing suppressed yet."}</td></tr>
                  )}
                  {!listLoading && items.map((s) => (
                    <tr key={s.id} className="border-t border-neutral-100">
                      <td className="px-4 py-3">
                        {s.email ?? <span className="text-neutral-500" title="Only a scrambled copy of this address is kept">Scrambled (data deleted)</span>}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full border-[1.5px] border-neutral-900 px-2.5 py-0.5 text-xs font-bold ${(SOURCE[s.source] ?? SOURCE.manual).cls}`}>
                          {(SOURCE[s.source] ?? { label: s.source }).label}
                        </span>
                      </td>
                      <td className="px-4 py-3 tabular-nums">{day(s.suppressed_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {total !== null && total > 0 && (
                <div className="flex items-center justify-between border-t border-neutral-100 px-4 py-3 font-['Satoshi'] text-sm text-neutral-600">
                  <span className="tabular-nums">{offset + 1}–{pageEnd} of {total}</span>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setOffset(Math.max(0, offset - PAGE))} disabled={offset === 0 || listLoading} className={secondaryBtn}>
                      Previous
                    </button>
                    <button type="button" onClick={() => setOffset(offset + PAGE)} disabled={pageEnd >= total || listLoading} className={secondaryBtn}>
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
