// The Flags tab of the Auditor (owner, 7 Nov 2026): bad matches and bad journeys per student,
// newest first, with a severity, what is wrong and the numbers. Its own window (default the
// last 48 hours) and a filter by flag type. Read only (/api/stu/flags); the rules are in
// lib/stu/flags.ts.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { CARD } from "~/components/stu/ui";
import { getToken } from "~/lib/api";
import { FLAG_BY_KEY, FLAG_GROUPS, FLAG_TYPES, type Flag, type FlagReport, type FlagSeverity, bySeverity, flagCounts, istDay } from "~/lib/stu/flags";
import { addDays, fmtIst, fmtN, todayIst } from "~/lib/stu/model";

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const SHOW = 300;
type Preset = "24h" | "48h" | "7d" | "30d" | "custom";
const PRESETS: { key: Preset; label: string }[] = [
  { key: "24h", label: "24 hours" }, { key: "48h", label: "48 hours" }, { key: "7d", label: "7 days" }, { key: "30d", label: "30 days" }, { key: "custom", label: "Custom" },
];

export function AuditorTabs({ tab, onTab }: { tab: "failures" | "flags"; onTab: (t: "failures" | "flags") => void }) {
  const base = "rounded-lg px-3 py-1.5 text-sm font-semibold";
  return (
    <div className="mb-4 inline-flex gap-0.5 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
      <button onClick={() => onTab("failures")} className={`${base} ${tab === "failures" ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>Failures</button>
      <button onClick={() => onTab("flags")} className={`${base} ${tab === "flags" ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>Flags</button>
    </div>
  );
}

const SEV_STYLE: Record<FlagSeverity, string> = {
  high: "border-red-300 bg-red-50 text-red-700",
  med: "border-amber-300 bg-amber-50 text-amber-800",
  low: "border-neutral-300 bg-neutral-50 text-neutral-600",
};
const SEV_LABEL: Record<FlagSeverity, string> = { high: "High", med: "Medium", low: "Low" };

function Sev({ s }: { s: FlagSeverity }) {
  return <span className={`inline-flex rounded-md border px-1.5 py-0.5 text-[11px] font-bold ${SEV_STYLE[s]}`}>{SEV_LABEL[s]}</span>;
}

export function FlagsPanel() {
  const [params, setParams] = useSearchParams();
  const today = todayIst();
  const preset = (PRESETS.some((p) => p.key === params.get("fr")) ? params.get("fr") : "48h") as Preset;
  const internal = params.get("internal") === "1";
  const type = FLAG_BY_KEY.has(params.get("type") || "") ? params.get("type")! : null;
  const fe = DAY_RE.test(params.get("fe") || "") ? params.get("fe")! : today;
  const fs = DAY_RE.test(params.get("fs") || "") ? params.get("fs")! : addDays(fe, -6);
  const start = fs <= fe ? fs : fe;

  const query = useMemo(() => {
    if (preset === "custom") return new URLSearchParams({ start, end: fe });
    return new URLSearchParams({ hours: String({ "24h": 24, "48h": 48, "7d": 168, "30d": 720 }[preset]) });
  }, [preset, start, fe]);

  const setParam = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v == null) next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  };

  const [report, setReport] = useState<FlagReport | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [more, setMore] = useState(false);

  const load = useCallback(async (fresh: boolean) => {
    setLoading(true);
    setError("");
    try {
      const token = await getToken();
      const qs = new URLSearchParams(query);
      if (internal) qs.set("internal", "1");
      if (fresh) qs.set("fresh", "1");
      const res = await fetch(`/api/stu/flags?${qs}`, { credentials: "include", headers: token ? { Authorization: `Bearer ${token}` } : {} });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || body?.error) throw new Error(body?.error || `HTTP ${res.status}`);
      setReport(body as FlagReport);
    } catch (e: any) {
      setError(e?.message || "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [query, internal]);
  useEffect(() => {
    load(false);
  }, [load]);

  const counts = useMemo(() => (report ? flagCounts(report.flags) : []), [report]);
  const sev = useMemo(() => bySeverity(report?.flags ?? []), [report]);
  const shown = useMemo(() => (report ? report.flags.filter((f) => !type || f.type === type) : []), [report, type]);
  const people = useMemo(() => new Set((report?.flags ?? []).map((f) => f.user ?? f.email)).size, [report]);

  const journey = (f: Flag) => `/journeys?start=${istDay(report!.from)}&end=${istDay(report!.to)}${internal ? "&internal=1" : ""}&u=${encodeURIComponent(f.user!)}`;
  const seatPct = report?.seats ? Math.round((100 * report.seats.active) / report.seats.cap) : 0;
  const seatStyle = seatPct >= 100 ? "border-red-300 bg-red-50 text-red-800" : seatPct >= 80 ? "border-amber-300 bg-amber-50 text-amber-900" : "border-emerald-300 bg-emerald-50 text-emerald-900";

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
        <p className="max-w-3xl text-sm text-neutral-600">
          Bad matches and bad journeys, one flag per student and type, newest first. Each says what is wrong and shows the numbers. The name opens that student's journey.
          {report ? ` ${report.env === "staging" ? "Staging" : report.env === "production" ? "Production" : "Unknown"} database.` : ""}
        </p>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <div className="inline-flex flex-wrap gap-0.5 rounded-xl border-2 border-neutral-900 bg-white p-0.5 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]">
            {PRESETS.map((p) => (
              <button key={p.key} onClick={() => setParam(p.key === "custom" ? { fr: p.key, fs: start, fe } : { fr: p.key === "48h" ? null : p.key, fs: null, fe: null })}
                className={`rounded-lg px-2.5 py-1 font-semibold ${preset === p.key ? "bg-purple-500 text-white" : "text-neutral-600 hover:bg-neutral-100"}`}>{p.label}</button>
            ))}
          </div>
          {preset === "custom" && (
            <>
              <input type="date" value={start} max={fe} onChange={(e) => e.target.value && setParam({ fs: e.target.value })} className="rounded-lg border-2 border-neutral-900 bg-white px-2 py-1" />
              <span className="text-neutral-500">to</span>
              <input type="date" value={fe} min={start} onChange={(e) => e.target.value && setParam({ fe: e.target.value })} className="rounded-lg border-2 border-neutral-900 bg-white px-2 py-1" />
            </>
          )}
          <label className="flex items-center gap-1.5 rounded-lg border-2 border-neutral-900 bg-white px-2 py-1">
            <input type="checkbox" checked={internal} onChange={(e) => setParam({ internal: e.target.checked ? "1" : null })} />
            Include internal
          </label>
          <button onClick={() => load(true)} disabled={loading} className="rounded-lg border-2 border-neutral-900 bg-purple-500 px-2.5 py-1 font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] disabled:opacity-50">{loading ? "Loading" : "Refresh"}</button>
        </div>
      </div>

      {error && <div className="mb-3 rounded-xl border-2 border-red-300 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
      {!report && !error && <div className="flex justify-center py-24"><div className="h-8 w-8 animate-spin rounded-full border-[3px] border-purple-500 border-t-transparent" /></div>}

      {report && (
        <>
          {report.seats && (
            <div className={`mb-4 rounded-2xl border-2 px-4 py-2.5 text-sm font-semibold ${seatStyle}`}>
              WhatsApp seats: {fmtN(report.seats.active)} of {fmtN(report.seats.cap)} used ({seatPct}%)
              {report.seats.active >= report.seats.cap ? ". Full: new students cannot link WhatsApp." : report.seats.cap - report.seats.active <= 20 ? `. ${report.seats.cap - report.seats.active} left.` : ""}
            </div>
          )}

          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-['Clash_Display'] text-lg font-semibold">
              {fmtN(report.flags.length)} flag{report.flags.length === 1 ? "" : "s"} for {fmtN(people)} {people === 1 ? "student" : "students"}
              <span className="ml-2 text-sm font-semibold text-neutral-600">{fmtN(sev.high)} high, {fmtN(sev.med)} medium, {fmtN(sev.low)} low</span>
            </h2>
            <span className="text-xs text-neutral-500">
              {fmtIst(report.from)} to {fmtIst(report.to)}. {internal ? "Internal accounts included" : "Hidden: staff, @studojo.com, the test accounts and guests"}. Read {fmtIst(Date.parse(report.generatedAt))}.
            </span>
          </div>

          <div className="mb-5 space-y-3">
            {FLAG_GROUPS.map((g) => (
              <div key={g.key}>
                <div className="mb-1 text-xs font-bold uppercase tracking-wide text-neutral-500">{g.label}</div>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3 xl:grid-cols-6">
                  {counts.filter((c) => c.type.group === g.key).map(({ type: t, n, people: p }) => {
                    const on = type === t.key;
                    return (
                      <button key={t.key} onClick={() => setParam({ type: on ? null : t.key })} title={t.rule}
                        className={`rounded-xl border-2 border-neutral-900 px-3 py-2 text-left shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-colors ${on ? "bg-purple-100" : "bg-white hover:bg-neutral-50"}`}>
                        <div className="flex items-center justify-between gap-2 text-xs font-bold text-neutral-600"><span>{t.label}</span><Sev s={t.severity} /></div>
                        <div className={`mt-0.5 font-['Clash_Display'] text-2xl font-bold ${n ? (t.severity === "high" ? "text-red-700" : t.severity === "med" ? "text-amber-700" : "text-neutral-800") : "text-neutral-300"}`}>{n ? fmtN(n) : "0"}</div>
                        <div className="text-[11px] text-neutral-500">{n ? `${fmtN(p)} ${p === 1 ? "student" : "students"}` : "none"}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <section className={`overflow-hidden ${CARD}`}>
            <div className="flex items-center justify-between border-b-2 border-neutral-900 bg-neutral-50 px-4 py-2.5">
              <div>
                <h3 className="font-['Clash_Display'] text-base font-semibold">{type ? FLAG_BY_KEY.get(type)!.label : "Every flag"}, newest first ({fmtN(shown.length)})</h3>
                <p className="text-xs text-neutral-500">Click a row for the rule behind it.</p>
              </div>
              {type && <button onClick={() => setParam({ type: null })} className="text-xs font-semibold text-violet-700 hover:underline">Show all types</button>}
            </div>
            {shown.length === 0 ? <p className="p-4 text-sm text-neutral-500">{type ? "Nothing flagged for this type in this window." : "Nothing flagged in this window."}</p> : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-white text-left text-xs uppercase text-neutral-500">
                    <tr><th className="px-4 py-2">When (IST)</th><th className="px-3 py-2">Severity</th><th className="px-3 py-2">Student</th><th className="px-3 py-2">Flag</th></tr>
                  </thead>
                  <tbody>
                    {(more ? shown : shown.slice(0, SHOW)).map((f) => (
                      <Fragment key={f.id}>
                        <tr onClick={() => setOpen(open === f.id ? null : f.id)} className={`cursor-pointer border-t border-neutral-100 align-top ${open === f.id ? "bg-purple-50" : "hover:bg-neutral-50"}`}>
                          <td className="whitespace-nowrap px-4 py-2 text-neutral-700">{fmtIst(f.at).replace(" IST", "")}</td>
                          <td className="px-3 py-2"><Sev s={f.severity} /></td>
                          <td className="max-w-[240px] px-3 py-2">
                            {f.user ? (
                              <Link to={journey(f)} onClick={(e) => e.stopPropagation()} className="block truncate font-medium text-violet-700 hover:underline" title="Open their journey">{f.name || f.email || f.user}</Link>
                            ) : <span className="block truncate text-neutral-700">{f.name || f.email || "nobody named"}</span>}
                            <div className="truncate text-xs text-neutral-500">{f.name ? f.email : ""}{f.internal ? ` internal: ${f.internal}` : ""}</div>
                          </td>
                          <td className="px-3 py-2">
                            <div className="text-neutral-900"><span className="mr-2 rounded bg-neutral-100 px-1.5 py-0.5 text-[11px] font-bold text-neutral-700">{FLAG_BY_KEY.get(f.type)?.label ?? f.type}</span>{f.what}</div>
                            <div className="mt-0.5 text-xs text-neutral-600">{f.evidence.join(" · ")}</div>
                          </td>
                        </tr>
                        {open === f.id && (
                          <tr className="bg-purple-50/50">
                            <td colSpan={4} className="px-4 pb-3 pt-1 text-xs">
                              <div className="text-neutral-700"><span className="font-semibold">Rule:</span> {FLAG_BY_KEY.get(f.type)?.rule}</div>
                              <div className="mt-2 flex gap-4 font-semibold">
                                {f.user && <Link to={journey(f)} className="text-violet-700 hover:underline">Their journey</Link>}
                                {f.href && <Link to={f.href} className="text-violet-700 hover:underline">Open the ticket</Link>}
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
                {!more && shown.length > SHOW && (
                  <button onClick={() => setMore(true)} className="w-full border-t border-neutral-200 py-2 text-sm font-semibold text-violet-700 hover:bg-neutral-50">Show all {fmtN(shown.length)}</button>
                )}
              </div>
            )}
          </section>

          <div className="mt-5 space-y-1 text-xs text-neutral-500">
            {FLAG_TYPES.map((t) => <div key={t.key}><span className="font-semibold text-neutral-600">{t.label} ({SEV_LABEL[t.severity].toLowerCase()}):</span> {t.rule}</div>)}
            {report.missing.length > 0 && <div className="text-amber-800">Not checked in this database: {report.missing.join("; ")}.</div>}
            {report.capped.length > 0 && <div className="text-amber-800">Over 2,000 rows, so these counts are a floor: {report.capped.join(", ")}. Pick a shorter window.</div>}
          </div>
        </>
      )}
    </>
  );
}
