// Stu Journeys: every person as a timeline: source, every step with its time,
// the furthest step, last active. Search by email, name or id; filter to the
// people stuck at a step. ?u=<id> opens one person; ?stuck=<step>&cohort=1 (the
// Overview's drop-off bar) opens the list filtered to that step.
import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CARD, PageTitle, SourceNote, channelLabel, useStu } from "~/components/stu/ui";
import { fetchUserLog } from "~/lib/stu/client";
import { USER_STEPS, callOutcome, cohortOf, fmtDur, fmtIst, furthestStep, lastActDay, lastActive, scopeUsers, stepAt } from "~/lib/stu/model";

export default function StuJourneys() {
  const { data, filters } = useStu();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [stuck, setStuck] = useState(() => (USER_STEPS.some((s) => s.key === params.get("stuck")) ? params.get("stuck")! : "any"));
  const [onlyCohort, setOnlyCohort] = useState(() => params.get("cohort") === "1");
  const open = params.get("u");
  const acts = useMemo(() => lastActDay(data), [data]);

  const list = useMemo(() => {
    const pool = onlyCohort ? cohortOf(data, filters) : scopeUsers(data, filters);
    const needle = q.trim().toLowerCase();
    return pool
      .map((i) => ({ i, u: data.users[i], far: furthestStep(data, data.users[i]), last: lastActive(data, i, acts) }))
      .filter((x) => !needle || x.u.email.toLowerCase().includes(needle) || x.u.name.toLowerCase().includes(needle) || x.u.id.toLowerCase().includes(needle))
      .filter((x) => stuck === "any" || USER_STEPS[x.far]?.key === stuck)
      .sort((a, b) => b.u.joined - a.u.joined);
  }, [data, filters, q, stuck, onlyCohort, acts]);

  // Search by an exact id or email finds internal people too.
  const openIdx = open ? data.users.findIndex((u) => u.id === open) : -1;
  const setOpen = (id: string | null) => {
    const next = new URLSearchParams(params);
    if (id) next.set("u", id);
    else next.delete("u");
    setParams(next, { replace: true });
  };

  return (
    <div>
      <PageTitle title="Journeys" sub="Every person as a timeline. Search, or filter to the people whose furthest step is X." />
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email, name or user id" className="w-72 rounded-lg border-2 border-neutral-900 px-3 py-1.5" />
        <select value={stuck} onChange={(e) => setStuck(e.target.value)} className="rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5">
          <option value="any">Stuck at: any step</option>
          {USER_STEPS.map((s) => <option key={s.key} value={s.key}>Stuck at {s.n}. {s.label}</option>)}
        </select>
        <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1.5">
          <input type="checkbox" checked={onlyCohort} onChange={(e) => setOnlyCohort(e.target.checked)} /> Only joined in range
        </label>
        <span className="text-neutral-500">{list.length} people</span>
      </div>
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
        <div className={`max-h-[75vh] overflow-y-auto ${CARD}`}>
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-neutral-50 text-left text-xs uppercase text-neutral-500">
              <tr><th className="px-3 py-2">Person</th><th className="px-3 py-2">Joined</th><th className="px-3 py-2">Furthest step</th><th className="px-3 py-2">Last active</th></tr>
            </thead>
            <tbody>
              {list.map(({ i, u, far, last }) => (
                <tr key={u.id} onClick={() => setOpen(u.id)} className={`cursor-pointer border-t border-neutral-100 hover:bg-violet-50 ${openIdx === i ? "bg-violet-100" : ""}`}>
                  <td className="px-3 py-2">
                    <div className="font-medium">{u.email || u.id}</div>
                    <div className="text-xs text-neutral-500">
                      {channelLabel(u.ch)}{u.internal ? ` · internal: ${u.internal}` : ""}
                      {" · "}
                      <Link to={`/recordings?person=${encodeURIComponent(u.id)}`} onClick={(e) => e.stopPropagation()} className="font-semibold text-purple-700 hover:underline">Recordings</Link>
                    </div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtIst(u.joined)}</td>
                  <td className="px-3 py-2 text-xs">{far >= 0 ? `${USER_STEPS[far].n}. ${USER_STEPS[far].label}` : ""}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-xs">{fmtIst(last)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>{openIdx >= 0 ? <Timeline i={openIdx} onClose={() => setOpen(null)} /> : <div className={`p-6 text-sm text-neutral-500 ${CARD}`}>Pick a person to see their timeline.</div>}</div>
      </div>
    </div>
  );
}

function Timeline({ i, onClose }: { i: number; onClose: () => void }) {
  const { data } = useStu();
  const u = data.users[i];
  const [log, setLog] = useState<{ events: any[]; source: any } | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => {
    setLog(null);
    setErr("");
    if (!data.journeyLive && !data.sourceLive) return;
    fetchUserLog(u.id).then(setLog).catch((e) => setErr(e?.message || "Failed"));
  }, [u.id, data.journeyLive, data.sourceLive]);
  const calls = data.calls.filter((c) => c[0] === i).sort((a, b) => a[4] - b[4]);
  const steps = USER_STEPS.map((s) => {
    const at = stepAt(data, u, s.key);
    const t = u.t[s.key] ?? null;
    const j = u.j[s.key] ?? null;
    const from = s.key === "signed_up" ? "accounts" : t != null && j != null ? (j < t ? "log (earlier), table" : "table, log") : t != null ? "table" : j != null ? "log" : "";
    return { s, at, from };
  });
  return (
    <div className={`p-5 ${CARD}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="font-['Clash_Display'] text-xl font-bold">{u.email || u.id}</div>
          <div className="text-xs text-neutral-500">{u.name} · id {u.id}{u.internal ? ` · internal: ${u.internal}` : ""}</div>
          <div className="mt-1 text-xs text-neutral-600">
            Account made {fmtIst(u.created)}{u.existing ? `; joined Stu ${fmtIst(u.joined)} (older account)` : ""}. Onboarded {u.via ? `by ${u.via === "call" ? "call" : "typed setup"}` : "not yet"}.
            {u.testPaid ? ` Test payment ${fmtIst(u.testPaid)}.` : ""}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* Recordings (5 Nov 2026): this person's session replays, site and platform, last 30 days. */}
          <Link to={`/recordings?person=${encodeURIComponent(u.id)}`} className="rounded-lg border-2 border-purple-600 px-2 py-0.5 text-sm font-semibold text-purple-700 hover:bg-purple-50">Recordings</Link>
          <button onClick={onClose} className="rounded-lg border-2 border-neutral-900 px-2 py-0.5 text-sm">Close</button>
        </div>
      </div>
      <div className="mt-3 rounded-lg bg-neutral-50 p-3 text-xs">
        <div className="font-bold text-neutral-700">Source: {channelLabel(u.ch)}</div>
        {u.touch ? (
          <div className="mt-1 text-neutral-600">
            {["source", "medium", "campaign", "referrer", "device", "city"].map((k) => (u.touch as any)[k] ? <span key={k} className="mr-3">{k}: {(u.touch as any)[k]}</span> : null)}
          </div>
        ) : <div className="mt-1 text-neutral-500">No source captured.</div>}
      </div>
      <table className="mt-3 w-full text-sm">
        <thead className="text-left text-xs uppercase text-neutral-500"><tr><th className="py-1">Step</th><th className="py-1">First time (IST)</th><th className="py-1">From</th></tr></thead>
        <tbody>
          {steps.map(({ s, at, from }) => (
            <tr key={s.key} className={`border-t border-neutral-100 ${at == null ? "text-neutral-400" : ""}`}>
              <td className="py-1">{s.n}. {s.label}</td>
              <td className="py-1 tabular-nums">{fmtIst(at)}</td>
              <td className="py-1 text-xs">{from}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-4 text-xs font-bold uppercase text-neutral-500">Calls ({calls.length})</div>
      <table className="w-full text-xs">
        <tbody>
          {calls.map((c, k) => (
            <tr key={k} className="border-t border-neutral-100">
              <td className="py-1">{fmtIst(c[5] ?? c[4])}</td>
              <td className="py-1">{c[1]}</td>
              <td className="py-1">{callOutcome(c).replace(/_/g, " ")}{c[3] ? ` (${c[3]})` : ""}</td>
              <td className="py-1 text-right">{c[7] != null ? fmtDur(c[7] * 1000) : ""}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SourceNote>career_voice_calls</SourceNote>
      <div className="mt-4 text-xs font-bold uppercase text-neutral-500">Journey log</div>
      {!data.journeyLive && <div className="text-xs text-neutral-500">Not live in this database yet.</div>}
      {err && <div className="text-xs text-red-600">{err}</div>}
      {log && (
        <div className="max-h-80 overflow-y-auto">
          <table className="w-full text-xs">
            <tbody>
              {log.events.map((e) => (
                <tr key={e.id} className="border-t border-neutral-100 align-top">
                  <td className="whitespace-nowrap py-1 pr-2">{fmtIst(Number(e.at))}</td>
                  <td className="py-1 pr-2 font-medium">{e.step}{e.props?.backfill ? <span className="ml-1 text-[10px] text-neutral-400">backfill</span> : null}</td>
                  <td className="py-1 font-mono text-[10px] text-neutral-500">{e.props && Object.keys(e.props).length ? JSON.stringify(e.props).slice(0, 160) : ""}</td>
                </tr>
              ))}
              {!log.events.length && <tr><td className="py-1 text-neutral-500">No events.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
