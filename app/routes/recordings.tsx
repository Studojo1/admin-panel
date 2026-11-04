// Recordings (the owner and Pranav, 5 Nov 2026: "see how people are using the platform ... user recordings like
// Mixpanel gives us ... can you have user recordings under our admin panel?"). Every visit's session replay, from the
// website's pages through the platform (one visit id across both), kept 30 days. Filters: the day range, channel,
// device and in-app browser, signed up or not, the furthest journey step in the visit. The player skips idle time and
// marks journey steps (purple) and page changes (blue) on its timeline. ?person=<user id or visitor id> lists one
// person's visits (the Journeys page links here); ?id=<visit> opens one. Read only (/api/recordings, app/lib/recordings).
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { AdminHeader } from "~/components";
import { ReplayPlayer, type PlayerApi } from "~/components/recordings/ReplayPlayer";
import { KIT_CSS, dayLabel } from "~/components/stu/overview-kit";
import { CARD, channelLabel } from "~/components/stu/ui";
import { useAdminGuard } from "~/lib/auth-guard";
import { fetchChunk, fetchRecording, fetchRecordings } from "~/lib/recordings/client";
import {
  CHANNEL_GROUPS, DEFAULT_FILTERS, DEVICE_CHOICES, DEVICE_LABEL, INAPP_CHOICES, INAPP_LABEL, type RecFilters, type RecRow, type RecordingDetail,
  type RecordingsEnvelope, durText, journeyMarkers, matches, mergeEvents, playable, sizeText,
} from "~/lib/recordings/model";
import { JOURNEY_NAME_TO_STEP, addDays, fmtIst, todayIst } from "~/lib/stu/model";

export function meta() {
  return [{ title: "Recordings · Stu · Studojo Admin" }];
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
type RangeKey = "today" | "yesterday" | "7d" | "30d" | "custom";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "today", label: "Today" }, { key: "yesterday", label: "Yesterday" }, { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "custom", label: "Custom" },
];
const SELECT = "rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5 text-sm";

function who(r: RecRow): string {
  if (r.email) return r.email;
  if (r.userId) return `user ${r.userId.slice(0, 10)}`;
  return r.visitorId ? `visitor ${r.visitorId.slice(0, 8)}` : "visitor";
}

function deviceText(r: RecRow): string {
  const d = DEVICE_LABEL[r.device ?? ""] ?? r.device ?? "";
  const a = INAPP_LABEL[r.inapp ?? ""] ?? r.inapp ?? "";
  return [d, a].filter(Boolean).join(" · ");
}

export default function Recordings() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [params, setParams] = useSearchParams();
  const today = todayIst();
  const person = params.get("person");
  const open = params.get("id");

  const given = params.get("range");
  const range = (RANGES.some((r) => r.key === given) ? given : DAY_RE.test(params.get("start") || "") ? "custom" : person ? "30d" : "today") as RangeKey;
  const { start, end } = useMemo(() => {
    if (range === "yesterday") return { start: addDays(today, -1), end: addDays(today, -1) };
    if (range === "7d") return { start: addDays(today, -6), end: today };
    if (range === "30d") return { start: addDays(today, -29), end: today };
    if (range === "custom") {
      const e = DAY_RE.test(params.get("end") || "") ? params.get("end")! : today;
      const s = DAY_RE.test(params.get("start") || "") ? params.get("start")! : addDays(e, -6);
      return { start: s <= e ? s : e, end: e };
    }
    return { start: today, end: today };
  }, [range, params, today]);

  const filters: RecFilters = {
    ...DEFAULT_FILTERS,
    channel: params.get("channel") || "all",
    device: params.get("device") || "all",
    inapp: params.get("inapp") || "all",
    signup: (["yes", "no", "here"].includes(params.get("signup") || "") ? params.get("signup") : "any") as RecFilters["signup"],
    step: params.get("step") || "any",
    internal: params.get("internal") === "1",
    person,
  };

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null || v === "" || v === "all" || v === "any") next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };
  const setRange = (key: RangeKey) => setParam(key === "custom" ? { range: key, start, end } : { range: key === "today" ? null : key, start: null, end: null });

  const [data, setData] = useState<RecordingsEnvelope | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      setData(await fetchRecordings({ start, end, person }));
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [start, end, person]);
  useEffect(() => {
    if (isAuthorized) load();
  }, [isAuthorized, load]);

  const rows = useMemo(() => (data?.rows ?? []).filter((r) => matches(r, filters)), [data, filters.channel, filters.device, filters.inapp, filters.signup, filters.step, filters.internal, filters.person]); // eslint-disable-line react-hooks/exhaustive-deps
  const hidden = (data?.rows.length ?? 0) - rows.length;

  if (isPending || isAuthorized === null) {
    return <div className="flex min-h-screen items-center justify-center bg-neutral-50 text-neutral-500">Loading...</div>;
  }
  if (!isAuthorized) return null;

  const rangeText = start === end ? dayLabel(start) : `${dayLabel(start)} to ${dayLabel(end)}`;
  const envName = data ? (data.env === "staging" ? "Staging" : data.env === "production" ? "Production" : "Unknown") : "";
  const steps = data?.steps ?? [];

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <style>{KIT_CSS}</style>
      <div className="ov mx-auto max-w-[1500px] px-4 py-6 md:px-8 md:py-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="text-xs font-bold uppercase tracking-wide text-purple-700">Stu · <Link to="/journeys" className="hover:underline">Journeys</Link></div>
            <h1 className="font-['Clash_Display'] text-3xl font-medium tracking-tight text-neutral-950 md:text-4xl">Recordings</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-neutral-500">
              <span>Visits that began {rangeText}, IST. Kept 30 days. Typed text, emails, phone numbers, resumes and payment are masked; no audio.</span>
              {envName && (
                <span className={`rounded-full border-2 px-2 py-0.5 text-[11px] font-bold ${data?.env === "production" ? "border-emerald-600 text-emerald-700" : "border-amber-500 text-amber-700"}`}>{envName}</span>
              )}
            </p>
          </div>
          <div className="inline-flex flex-wrap gap-1 rounded-xl border-2 border-neutral-900 bg-white p-1 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]" role="group" aria-label="Date range">
            {RANGES.map((r) => (
              <button key={r.key} type="button" aria-pressed={range === r.key} onClick={() => setRange(r.key)}
                className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition-colors ${range === r.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>
                {r.label}
              </button>
            ))}
          </div>
        </div>
        {range === "custom" && (
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
            <input type="date" value={start} max={end} onChange={(e) => setParam({ range: "custom", start: e.target.value })} className={SELECT} />
            <span>to</span>
            <input type="date" value={end} min={start} max={today} onChange={(e) => setParam({ range: "custom", end: e.target.value })} className={SELECT} />
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
          <select aria-label="Channel" value={filters.channel} onChange={(e) => setParam({ channel: e.target.value })} className={SELECT}>
            {CHANNEL_GROUPS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select aria-label="Device" value={filters.device} onChange={(e) => setParam({ device: e.target.value })} className={SELECT}>
            {DEVICE_CHOICES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select aria-label="Browser" value={filters.inapp} onChange={(e) => setParam({ inapp: e.target.value })} className={SELECT}>
            {INAPP_CHOICES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
          <select aria-label="Signed up" value={filters.signup} onChange={(e) => setParam({ signup: e.target.value })} className={SELECT}>
            <option value="any">Signed up or not</option>
            <option value="yes">Has an account</option>
            <option value="here">Signed up in this visit</option>
            <option value="no">Never signed up</option>
          </select>
          <select aria-label="Furthest step" value={filters.step} onChange={(e) => setParam({ step: e.target.value })} className={SELECT}>
            <option value="any">Furthest step: any</option>
            {steps.map((s) => <option key={s.key} value={s.key}>Furthest: {s.n}. {s.label}</option>)}
          </select>
          <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5">
            <input type="checkbox" checked={filters.internal} onChange={(e) => setParam({ internal: e.target.checked ? "1" : null })} /> Include internal
          </label>
          {person && (
            <span className="flex items-center gap-1.5 rounded-lg border-2 border-purple-600 bg-purple-50 px-2 py-1.5 text-purple-800">
              One person: {person.slice(0, 24)}
              <button type="button" onClick={() => setParam({ person: null })} className="font-bold" aria-label="Show everyone">×</button>
            </span>
          )}
          <span className="text-neutral-500">
            {loading ? "Loading..." : `${rows.length} visit${rows.length === 1 ? "" : "s"}`}
            {hidden > 0 && !loading ? ` (${hidden} hidden by the filters)` : ""}
            {data?.capped ? " · the newest 1,000 only" : ""}
          </span>
        </div>

        {error && <div className={`mt-4 p-4 text-sm text-red-700 ${CARD}`}>{error}</div>}
        {data && !data.live && <div className={`mt-4 p-4 text-sm text-neutral-600 ${CARD}`}>Recordings are not live in this database yet (career_agent.career_recordings is missing).</div>}
        {data && data.live && !data.storage && <div className={`mt-4 p-4 text-sm text-amber-800 ${CARD}`}>This admin cannot read the recordings' storage yet (AZURE_STORAGE_ACCOUNT_NAME and AZURE_STORAGE_ACCOUNT_KEY). The list shows; the player cannot.</div>}

        <div className="mt-4 grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
          <div className={`max-h-[78vh] overflow-y-auto ${CARD}`}>
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
                <tr><th className="px-3 py-2">Began (IST)</th><th className="px-3 py-2">Person</th><th className="px-3 py-2">Visit</th><th className="px-3 py-2">Furthest</th></tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const far = steps.find((s) => s.key === r.furthest);
                  return (
                    <tr key={r.id} onClick={() => setParam({ id: r.id })} className={`cursor-pointer border-t border-neutral-100 align-top hover:bg-violet-50 ${open === r.id ? "bg-violet-100" : ""}`}>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">
                        <div className="font-medium tabular-nums">{fmtIst(r.started)}</div>
                        <div className="text-neutral-500">{durText(r.last - r.started)} · {r.pages.length} page{r.pages.length === 1 ? "" : "s"}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div className="max-w-[14rem] truncate font-medium">{who(r)}</div>
                        <div className="text-neutral-500">
                          {r.signedUpHere ? <span className="font-semibold text-emerald-700">signed up here · </span> : r.signedUp ? "has an account · " : ""}
                          {channelLabel(r.channel)}{r.internal ? ` · internal: ${r.internal}` : ""}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-xs">
                        <div>{deviceText(r) || "Unknown device"}</div>
                        <div className="max-w-[12rem] truncate text-neutral-500" title={r.pages.join("  ")}>{r.entryPath ?? ""}{r.hosts.includes("platform") ? " → platform" : ""}</div>
                      </td>
                      <td className="px-3 py-2 text-xs">{far ? `${far.n}. ${far.label}` : ""}</td>
                    </tr>
                  );
                })}
                {!rows.length && !loading && data?.live && (
                  <tr><td colSpan={4} className="px-3 py-6 text-center text-neutral-500">No recordings{hidden ? " match these filters" : " in this range"}.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="xl:sticky xl:top-24 xl:self-start">
            {open ? <Viewer id={open} steps={steps} onClose={() => setParam({ id: null })} onPerson={(p) => setParam({ person: p, id: null })} />
              : <div className={`p-6 text-sm text-neutral-500 ${CARD}`}>Pick a visit to play it.</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Viewer({ id, steps, onClose, onPerson }: { id: string; steps: { key: string; label: string; n: string }[]; onClose: () => void; onPerson: (p: string) => void }) {
  const [detail, setDetail] = useState<RecordingDetail | null>(null);
  const [track, setTrack] = useState(0);
  const [events, setEvents] = useState<any[] | null>(null);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const player = useRef<PlayerApi | null>(null);

  useEffect(() => {
    setDetail(null);
    setEvents(null);
    setError("");
    setTrack(0);
    fetchRecording(id).then(setDetail).catch((e) => setError(e?.message || "Failed to load"));
  }, [id]);

  useEffect(() => {
    if (!detail) return;
    const t = detail.tracks[track];
    setEvents(null);
    if (!t) return;
    let gone = false;
    (async () => {
      const chunks = t.loads.flatMap((l) => l.chunks);
      const got: any[][] = [];
      for (let i = 0; i < chunks.length; i += 6) {
        if (gone) return;
        setProgress(`Loading ${Math.min(i + 6, chunks.length)} of ${chunks.length} chunks`);
        got.push(...(await Promise.all(chunks.slice(i, i + 6).map((c) => fetchChunk(id, c.name).catch(() => [])))));
      }
      const flat = got.flat();
      if (!flat.length) throw new Error("This recording has no events left (chunks are kept 30 days).");
      const first = Math.min(...flat.map((e) => e.timestamp));
      const last = Math.max(...flat.map((e) => e.timestamp));
      const merged = mergeEvents(got, journeyMarkers(detail.journey, first, last));
      if (!playable(merged)) throw new Error("This recording has no starting snapshot, so it cannot play (its first chunk was lost).");
      if (!gone) setEvents(merged);
    })()
      .catch((e) => !gone && setError(e?.message || "Failed to load the recording"))
      .finally(() => !gone && setProgress(""));
    return () => {
      gone = true;
    };
  }, [detail, track, id]);

  const r = detail?.row;
  const first = events?.length ? events[0].timestamp : null;
  const stepName = (k: string) => {
    const s = steps.find((x) => x.key === k);
    return s ? `${s.n}. ${s.label}` : k.replace(/_/g, " ");
  };

  return (
    <div className={`p-4 ${CARD}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-['Clash_Display'] text-xl font-bold">{r ? who(r) : "Recording"}</div>
          {r && (
            <div className="mt-0.5 text-xs text-neutral-600">
              {fmtIst(r.started)} · {durText(r.last - r.started)} · {deviceText(r) || "Unknown device"} · {channelLabel(r.channel)}
              {r.source ? ` (${r.source}${r.campaign ? `, ${r.campaign}` : ""})` : ""} · {sizeText(r.bytes)}
            </div>
          )}
          {r && (
            <div className="mt-1 flex flex-wrap gap-2 text-xs">
              {r.userId && <Link to={`/journeys?u=${encodeURIComponent(r.userId)}`} className="font-semibold text-purple-700 hover:underline">Their journey</Link>}
              {(r.userId || r.visitorId) && <button type="button" onClick={() => onPerson((r.userId || r.visitorId)!)} className="font-semibold text-purple-700 hover:underline">All their visits</button>}
            </div>
          )}
        </div>
        <button onClick={onClose} className="rounded-lg border-2 border-neutral-900 px-2 py-0.5 text-sm">Close</button>
      </div>
      {detail && detail.tracks.length > 1 && (
        <div className="mt-3 flex flex-wrap items-center gap-1 text-xs">
          <span className="text-neutral-500">Tabs open at the same time:</span>
          {detail.tracks.map((t, i) => (
            <button key={i} type="button" onClick={() => setTrack(i)} className={`rounded-lg border-2 px-2 py-0.5 ${i === track ? "border-purple-600 bg-purple-50 font-semibold" : "border-neutral-300"}`}>
              Tab {i + 1} ({t.loads.length} page load{t.loads.length === 1 ? "" : "s"})
            </button>
          ))}
        </div>
      )}
      <div className="mt-3">
        {error ? <div className="text-sm text-red-700">{error}</div>
          : events ? <ReplayPlayer events={events} onReady={(p) => (player.current = p)} />
          : <div className="flex h-64 items-center justify-center rounded-xl border-2 border-dashed border-neutral-300 text-sm text-neutral-500">{progress || "Loading..."}</div>}
      </div>
      {detail && (
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-bold uppercase text-neutral-500">Journey in this visit</div>
            <table className="mt-1 w-full text-xs">
              <tbody>
                {detail.journey.map((e, k) => (
                  <tr key={k} className="border-t border-neutral-100">
                    <td className="whitespace-nowrap py-1 pr-2 tabular-nums">{fmtIst(e.at)}</td>
                    <td className="py-1 pr-2">{stepName(JOURNEY_NAME_TO_STEP[e.step] ?? e.step)}</td>
                    <td className="py-1 text-right">
                      {first != null && (
                        <button type="button" className="font-semibold text-purple-700 hover:underline" onClick={() => player.current?.goto(Math.max(0, e.at - first), true)}>Play from here</button>
                      )}
                    </td>
                  </tr>
                ))}
                {!detail.journey.length && <tr><td className="py-1 text-neutral-500">No journey steps in this visit.</td></tr>}
              </tbody>
            </table>
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-neutral-500">Pages, in order</div>
            <ol className="mt-1 list-decimal pl-5 text-xs text-neutral-700">
              {r?.pages.map((p) => <li key={p} className="break-all">{p}</li>)}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
