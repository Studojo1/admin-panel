import { useEffect, useMemo, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { toast } from "sonner";
import {
  UTM_SOURCES,
  UTM_MEDIUMS,
  SOURCE_MEDIUMS,
  META_URL_TEMPLATE,
  validateLink,
  toSlugPart,
  normalizeTags,
  type UtmSource,
  type UtmMedium,
} from "~/lib/utm-dictionary";
import type { Route } from "./+types/utm-builder";
import { posthogFetch } from "~/lib/posthog-client";

export function meta(_: Route.MetaArgs) {
  return [{ title: "UTM Links | Studojo Admin" }];
}

// ── Types ──────────────────────────────────────────────────────────────────

interface SavedLink {
  id: string;
  name: string;
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content: string | null;
  utm_term: string | null;
  slug: string | null;
  created_by: string | null;
  created_at: string;
}

interface LinkStats {
  clicks: number;
  botClicks: number;
  signups: number;
  payers: number;
  inr: number;
  usd: number;
}

interface SourceRow {
  source: string;
  medium: string;
  campaign: string;
  tagged: boolean;
  signups: number;
  payers: number;
  inr: number;
  usd: number;
}

interface SourcesReport {
  days: number;
  total: number;
  taggedSignups: number;
  notCaptured: number;
  rows: SourceRow[];
}

interface Problem {
  where: "signups" | "visits";
  source: string | null;
  medium: string | null;
  campaign: string | null;
  count: number;
  reasons: string[];
}

// ── Helpers ────────────────────────────────────────────────────────────────

const SHORT_HOST = "studojo.com/go/";

const DESTINATIONS = [
  { label: "Outreach", url: "https://studojo.com/outreach" },
  { label: "Upload resume", url: "https://studojo.com/outreach/onboarding/upload" },
  { label: "Internships", url: "https://studojo.com/dojos/internships" },
  { label: "Insider", url: "https://studojo.com/insider" },
  { label: "Home", url: "https://studojo.com/" },
];

async function authed(path: string, init: RequestInit = {}) {
  const token = await getToken();
  return fetch(path, {
    ...init,
    credentials: "include",
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers || {}),
    },
  });
}

async function phQuery(query: string) {
  const res = await posthogFetch("/api/posthog?type=query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  return res.json();
}

function fullUrl(l: {
  base_url: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
  utm_content?: string | null;
  utm_term?: string | null;
}) {
  try {
    const u = new URL(l.base_url);
    u.searchParams.set("utm_source", l.utm_source);
    u.searchParams.set("utm_medium", l.utm_medium);
    u.searchParams.set("utm_campaign", l.utm_campaign);
    if (l.utm_content) u.searchParams.set("utm_content", l.utm_content);
    if (l.utm_term) u.searchParams.set("utm_term", l.utm_term);
    return u.toString();
  } catch {
    return "";
  }
}

// Keep typed values inside the dictionary's character set as the user types.
const cleanCampaign = (v: string) => v.toLowerCase().replace(/[\s-]+/g, "_").replace(/[^a-z0-9_]/g, "");
const cleanContent = (v: string) => v.toLowerCase().replace(/\s+/g, "_").replace(/[^a-z0-9_-]/g, "");
const cleanSlug = (v: string) => v.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_-]/g, "");

function todayMMDD() {
  const d = new Date();
  return String(d.getMonth() + 1).padStart(2, "0") + String(d.getDate()).padStart(2, "0");
}

function money(inr: number, usd: number) {
  const parts: string[] = [];
  if (inr) parts.push("₹" + Math.round(inr).toLocaleString("en-IN"));
  if (usd) parts.push("$" + usd.toLocaleString("en-US", { maximumFractionDigits: 0 }));
  return parts.join(" + ") || "0";
}

function copy(text: string, msg = "Copied") {
  navigator.clipboard.writeText(text).then(() => toast.success(msg));
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function UTMLinks() {
  const { isAuthorized } = useAdminGuard();

  // Builder
  const [baseUrl, setBaseUrl] = useState(DESTINATIONS[0].url);
  const [source, setSource] = useState<UtmSource>("linkedin");
  const [medium, setMedium] = useState<UtmMedium>("organic");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<string | null>(null);

  // Data
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [stats, setStats] = useState<Record<string, LinkStats>>({});
  const [days, setDays] = useState(30);
  const [sources, setSources] = useState<SourcesReport | null>(null);
  const [problems, setProblems] = useState<Problem[] | null>(null);

  const autoSlug = toSlugPart([campaign, content].filter(Boolean).join("-"));
  const effectiveSlug = slugEdited ? slug : autoSlug;

  const draft = {
    base_url: baseUrl,
    utm_source: source,
    utm_medium: medium,
    utm_campaign: campaign,
    utm_content: content || null,
    utm_term: term || null,
    slug: effectiveSlug,
  };
  const errors = campaign ? validateLink(draft) : [];
  const preview = fullUrl(draft);
  const knownCampaigns = useMemo(
    () => [...new Set(links.map((l) => l.utm_campaign))].sort(),
    [links],
  );

  async function loadLinks() {
    setLinksLoading(true);
    const [lr, sr] = await Promise.all([
      authed("/api/utm-campaigns"),
      authed("/api/utm-report?view=links"),
    ]);
    if (lr.ok) setLinks((await lr.json()).campaigns ?? []);
    else toast.error("Could not load links");
    if (sr.ok) setStats((await sr.json()).stats ?? {});
    setLinksLoading(false);
  }

  async function loadSources(d: number) {
    setSources(null);
    const r = await authed(`/api/utm-report?view=sources&days=${d}`);
    if (r.ok) setSources(await r.json());
    else toast.error("Could not load sources");
  }

  async function loadProblems() {
    const found: Problem[] = [];
    const r = await authed("/api/utm-report?view=hygiene&days=90");
    if (r.ok) {
      for (const p of (await r.json()).problems ?? [])
        found.push({ where: "signups", source: p.source, medium: p.medium, campaign: p.campaign, count: p.signups, reasons: p.reasons });
    }
    // Visit-level tags from PostHog, so a bad link is caught before it
    // produces (or fails to produce) any signups.
    try {
      const res = await phQuery(
        `SELECT properties.utm_source, properties.utm_medium, properties.utm_campaign, count(DISTINCT person_id)
         FROM events WHERE event = '$pageview' AND properties.utm_source IS NOT NULL
         AND timestamp > now() - INTERVAL 30 DAY GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 200`,
      );
      for (const [s, m, c, n] of res?.results ?? []) {
        const norm = normalizeTags(s, m);
        if (!norm.tagged) continue; // a tag another site added, e.g. chatgpt.com
        const reasons: string[] = [];
        if (!norm.known) reasons.push("source or medium not in the dictionary");
        if (c && /^\d+$/.test(String(c))) reasons.push("campaign is a bare number (Meta id)");
        if (!c) reasons.push("no campaign");
        if (norm.known && (s !== norm.source || (m ?? "") !== norm.medium))
          reasons.push(`old spelling, reported as ${norm.source} / ${norm.medium}`);
        if (reasons.length) found.push({ where: "visits", source: s, medium: m, campaign: c, count: Number(n), reasons });
      }
    } catch {
      // PostHog is optional here; the signup-level check above still stands.
    }
    setProblems(found);
  }

  useEffect(() => {
    if (!isAuthorized) return;
    loadLinks();
    loadProblems();
  }, [isAuthorized]);

  useEffect(() => {
    if (isAuthorized) loadSources(days);
  }, [isAuthorized, days]);

  function pickSource(s: UtmSource) {
    setSource(s);
    setMedium(SOURCE_MEDIUMS[s][0]);
  }

  async function save() {
    const errs = validateLink(draft);
    if (errs.length) {
      toast.error(errs[0]);
      return;
    }
    setSaving(true);
    const res = await authed("/api/utm-campaigns", {
      method: "POST",
      body: JSON.stringify({ ...draft, name: effectiveSlug }),
    });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toast.error(data.error || "Could not save the link");
      return;
    }
    const short = `https://${SHORT_HOST}${data.slug}`;
    setJustSaved(short);
    copy(short, "Saved. Short link copied.");
    setContent("");
    setTerm("");
    setSlug("");
    setSlugEdited(false);
    loadLinks();
  }

  async function remove(id: string) {
    const res = await authed("/api/utm-campaigns", { method: "DELETE", body: JSON.stringify({ id }) });
    if (!res.ok) {
      toast.error("Could not delete");
      return;
    }
    setLinks((prev) => prev.filter((l) => l.id !== id));
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="font-['Satoshi'] text-neutral-500">Checking access…</p>
      </div>
    );
  }

  const taggedPct = sources && sources.total ? Math.round((sources.taggedSignups / sources.total) * 100) : 0;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="font-['Clash_Display'] text-2xl font-semibold text-neutral-900">UTM Links</h1>
          <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
            Every link we share, built from one naming scheme, with the signups and payments it brought in.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── Builder ─────────────────────────────────────────────────── */}
          <Card title="Build a link">
            <div className="space-y-5 p-6">
              <Field label="Where should it land?">
                <div className="mb-2 flex flex-wrap gap-2">
                  {DESTINATIONS.map((d) => (
                    <Pill key={d.url} label={d.label} active={baseUrl === d.url} onClick={() => setBaseUrl(d.url)} />
                  ))}
                </div>
                <input type="url" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value.trim())} className={inputCls} />
              </Field>

              <Field label="Source: where the link is posted">
                <div className="flex flex-wrap gap-2">
                  {(Object.keys(UTM_SOURCES) as UtmSource[]).map((s) => (
                    <Pill key={s} label={s} active={source === s} onClick={() => pickSource(s)} />
                  ))}
                </div>
                <p className={hintCls}>{UTM_SOURCES[source]}</p>
              </Field>

              <Field label="Medium: how it reaches people">
                <div className="flex flex-wrap gap-2">
                  {SOURCE_MEDIUMS[source].map((m) => (
                    <Pill key={m} label={m} active={medium === m} onClick={() => setMedium(m)} />
                  ))}
                </div>
                <p className={hintCls}>{UTM_MEDIUMS[medium]}</p>
              </Field>

              {source === "meta" && (
                <p className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 font-['Satoshi'] text-xs text-amber-900">
                  For Meta ads you do not need a link per ad. Paste the URL template on the right into each ad
                  once and every ad is tagged with its own campaign, ad set and ad names.
                </p>
              )}

              <Field label="Campaign: what we are pushing">
                <input
                  list="utm-known-campaigns"
                  value={campaign}
                  onChange={(e) => setCampaign(cleanCampaign(e.target.value))}
                  placeholder="jobreel_sep26"
                  className={inputCls}
                />
                <datalist id="utm-known-campaigns">
                  {knownCampaigns.map((c) => (
                    <option key={c} value={c} />
                  ))}
                </datalist>
                <p className={hintCls}>Topic plus month, lowercase with underscores. Reuse an existing one where it fits.</p>
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Content: which post, ad or person">
                  <div className="flex gap-2">
                    <input
                      value={content}
                      onChange={(e) => setContent(cleanContent(e.target.value))}
                      placeholder="jeremy_post"
                      className={`${inputCls} flex-1`}
                    />
                    <button
                      type="button"
                      onClick={() => setContent((c) => (c ? `${c}_${todayMMDD()}` : todayMMDD()))}
                      className="shrink-0 rounded-lg border-2 border-neutral-900 bg-white px-2 font-['Satoshi'] text-xs font-semibold"
                      title="Append today's date"
                    >
                      +date
                    </button>
                  </div>
                </Field>
                <Field label="Term: audience (optional)">
                  <input
                    value={term}
                    onChange={(e) => setTerm(cleanContent(e.target.value))}
                    placeholder="finance_students"
                    className={inputCls}
                  />
                </Field>
              </div>

              <Field label="Short link">
                <div className="flex items-center rounded-lg border-2 border-neutral-200 bg-white focus-within:border-violet-500">
                  <span className="pl-3 font-mono text-xs text-neutral-400">{SHORT_HOST}</span>
                  <input
                    value={effectiveSlug}
                    onChange={(e) => {
                      setSlugEdited(true);
                      setSlug(cleanSlug(e.target.value));
                    }}
                    placeholder="jobreel-sep26-jeremy-post"
                    className="w-full bg-transparent px-1 py-2 font-mono text-xs outline-none"
                  />
                </div>
              </Field>

              {errors.length > 0 && (
                <ul className="space-y-1 rounded-lg border-2 border-red-200 bg-red-50 p-3 font-['Satoshi'] text-xs text-red-700">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              {campaign && preview && (
                <div className="rounded-lg border-2 border-violet-200 bg-violet-50 p-4">
                  <p className="mb-1 font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-violet-600">
                    Full URL
                  </p>
                  <p className="break-all font-mono text-xs text-violet-900">{preview}</p>
                </div>
              )}

              <button
                onClick={save}
                disabled={saving || !campaign || errors.length > 0}
                className="w-full rounded-lg border-2 border-neutral-900 bg-emerald-400 px-4 py-2.5 font-['Satoshi'] text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save and copy short link"}
              </button>

              {justSaved && (
                <div className="flex items-center justify-between gap-3 rounded-lg border-2 border-emerald-300 bg-emerald-50 p-3">
                  <span className="break-all font-mono text-xs text-emerald-900">{justSaved}</span>
                  <button onClick={() => copy(justSaved)} className={smallBtn}>
                    Copy
                  </button>
                </div>
              )}
            </div>
          </Card>

          {/* ── Meta template + dictionary ─────────────────────────────── */}
          <div className="space-y-6">
            <Card title="Meta ads: URL parameters" subtitle="Ads Manager > each ad > Tracking > URL parameters">
              <div className="space-y-3 p-6">
                <p className="break-all rounded-lg bg-neutral-900 p-3 font-mono text-xs text-emerald-300">{META_URL_TEMPLATE}</p>
                <button onClick={() => copy(META_URL_TEMPLATE, "Template copied")} className={smallBtn}>
                  Copy template
                </button>
                <p className={hintCls}>
                  Name Meta campaigns, ad sets and ads in lowercase with underscores (jobreel_sep26), because Meta
                  pastes the names in as they are. Without this template Meta tags ads as ig/paid with numeric ids.
                </p>
              </div>
            </Card>

            <Card title="The dictionary" subtitle="The builder only allows these values">
              <div className="grid gap-6 p-6 sm:grid-cols-2">
                <DictList title="Sources" items={UTM_SOURCES} />
                <DictList title="Mediums" items={UTM_MEDIUMS} />
              </div>
              <p className="px-6 pb-6 font-['Satoshi'] text-xs text-neutral-500">
                People go in <b>content</b>, never in source or medium: ambassador / referral / amb_vanshika.
                Emails are tagged automatically as email / lifecycle / &lt;template&gt;.
              </p>
            </Card>
          </div>
        </div>

        {/* ── Saved links ────────────────────────────────────────────────── */}
        <Card title="Saved links" subtitle="Clicks count visits through the short link, bots excluded. Signups and payers are first touch.">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left font-['Satoshi'] text-sm">
              <thead className="border-b-2 border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
                <tr>
                  <th className="px-6 py-3">Link</th>
                  <th className="px-3 py-3">Tags</th>
                  <th className="px-3 py-3 text-right">Clicks</th>
                  <th className="px-3 py-3 text-right">Signups</th>
                  <th className="px-3 py-3 text-right">Payers</th>
                  <th className="px-3 py-3 text-right">Revenue</th>
                  <th className="px-6 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {linksLoading && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-neutral-400">Loading…</td>
                  </tr>
                )}
                {!linksLoading && links.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-6 py-8 text-center text-neutral-400">No links yet. Build one above.</td>
                  </tr>
                )}
                {links.map((l) => {
                  const s = stats[l.id];
                  const short = l.slug ? `https://${SHORT_HOST}${l.slug}` : null;
                  return (
                    <tr key={l.id} className="align-top">
                      <td className="px-6 py-3">
                        <p className="font-semibold text-neutral-900">{l.slug ? `/go/${l.slug}` : l.name}</p>
                        <p className="max-w-[260px] truncate text-xs text-neutral-400" title={l.base_url}>
                          {l.base_url.replace(/^https:\/\//, "")}
                        </p>
                        <p className="text-xs text-neutral-400">
                          {new Date(l.created_at).toLocaleDateString()}
                          {l.created_by ? ` · ${l.created_by}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-3 font-mono text-xs text-neutral-600">
                        {l.utm_source} / {l.utm_medium}
                        <br />
                        {l.utm_campaign}
                        {l.utm_content ? ` · ${l.utm_content}` : ""}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">
                        {short ? (s?.clicks ?? 0) : <span className="text-neutral-300">n/a</span>}
                      </td>
                      <td className="px-3 py-3 text-right tabular-nums">{s?.signups ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{s?.payers ?? 0}</td>
                      <td className="px-3 py-3 text-right tabular-nums">{s ? money(s.inr, s.usd) : "0"}</td>
                      <td className="whitespace-nowrap px-6 py-3 text-right">
                        {short && (
                          <button onClick={() => copy(short)} className={`${smallBtn} mr-2`}>
                            Copy short
                          </button>
                        )}
                        <button onClick={() => copy(fullUrl(l))} className={`${smallBtn} mr-2`}>
                          Copy full
                        </button>
                        <button onClick={() => remove(l.id)} className="text-neutral-300 hover:text-red-500" title="Delete">
                          ✕
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        {/* ── Where signups came from ────────────────────────────────────── */}
        <Card
          title="Where signups came from"
          subtitle="Every signup in the window, grouped by channel. Old spellings are folded in (ig/paid counts as meta/paid). Untagged visits are grouped by the site that sent them."
          right={
            <div className="flex gap-2">
              {[7, 30, 90].map((d) => (
                <Pill key={d} label={`${d}d`} active={days === d} onClick={() => setDays(d)} />
              ))}
            </div>
          }
        >
          {!sources ? (
            <p className="px-6 py-8 text-center font-['Satoshi'] text-sm text-neutral-400">Loading…</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 px-6 pt-6 sm:grid-cols-4">
                <MiniStat label="Signups" value={sources.total} />
                <MiniStat label="Arrived tagged" value={`${taggedPct}%`} />
                <MiniStat label="Tagged signups" value={sources.taggedSignups} />
                <MiniStat label="Before capture existed" value={sources.notCaptured} />
              </div>
              <div className="overflow-x-auto p-6">
                <table className="w-full min-w-[640px] text-left font-['Satoshi'] text-sm">
                  <thead className="border-b-2 border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
                    <tr>
                      <th className="py-2">Source</th>
                      <th className="py-2">Medium</th>
                      <th className="py-2">Campaign</th>
                      <th className="py-2 text-right">Signups</th>
                      <th className="py-2 text-right">Payers</th>
                      <th className="py-2 text-right">Revenue</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-100">
                    {sources.rows.map((r) => (
                      <tr key={`${r.source}|${r.medium}|${r.campaign}|${r.tagged}`}>
                        <td className="py-2 font-medium text-neutral-900">
                          {r.source}
                          {!r.tagged && r.source !== "(not captured)" && (
                            <span className="ml-2 rounded-full bg-neutral-100 px-2 py-0.5 text-[10px] uppercase tracking-wide text-neutral-500">
                              untagged
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-neutral-600">{r.medium}</td>
                        <td className="py-2 font-mono text-xs text-neutral-600">{r.campaign || "–"}</td>
                        <td className="py-2 text-right tabular-nums">{r.signups}</td>
                        <td className="py-2 text-right tabular-nums">{r.payers}</td>
                        <td className="py-2 text-right tabular-nums">{money(r.inr, r.usd)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>

        {/* ── Tags breaking the rules ────────────────────────────────────── */}
        <Card
          title="Tags breaking the rules"
          subtitle="Tags seen on visits (last 30 days) or stored on signups (last 90 days) that do not match the dictionary. Fix the link that produced them."
        >
          {!problems ? (
            <p className="px-6 py-8 text-center font-['Satoshi'] text-sm text-neutral-400">Checking…</p>
          ) : problems.length === 0 ? (
            <p className="px-6 py-8 text-center font-['Satoshi'] text-sm text-emerald-700">Every tag matches the dictionary.</p>
          ) : (
            <div className="overflow-x-auto p-6">
              <table className="w-full min-w-[640px] text-left font-['Satoshi'] text-sm">
                <thead className="border-b-2 border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="py-2">Seen on</th>
                    <th className="py-2">source / medium / campaign</th>
                    <th className="py-2 text-right">Count</th>
                    <th className="py-2 pl-4">Problem</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {problems.map((p, i) => (
                    <tr key={i} className="align-top">
                      <td className="py-2 text-xs text-neutral-500">{p.where}</td>
                      <td className="py-2 font-mono text-xs text-neutral-800">
                        {p.source ?? "–"} / {p.medium ?? "–"} / {p.campaign ?? "–"}
                      </td>
                      <td className="py-2 text-right tabular-nums">{p.count}</td>
                      <td className="py-2 pl-4 text-xs text-red-700">{p.reasons.join("; ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

// ── UI bits ────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border-2 border-neutral-200 bg-white px-3 py-2 font-['Satoshi'] text-sm outline-none transition-colors focus:border-violet-500";
const hintCls = "mt-1.5 font-['Satoshi'] text-xs text-neutral-400";
const smallBtn =
  "rounded border border-neutral-300 px-2 py-1 font-['Satoshi'] text-xs text-neutral-600 hover:border-violet-400 hover:text-violet-600";

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-neutral-900 px-6 py-4">
        <div>
          <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">{title}</h2>
          {subtitle && <p className="mt-0.5 max-w-3xl font-['Satoshi'] text-xs text-neutral-400">{subtitle}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block font-['Satoshi'] text-sm font-semibold text-neutral-700">{label}</label>
      {children}
    </div>
  );
}

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border-2 border-neutral-900 px-3 py-1 font-['Satoshi'] text-xs font-medium shadow-[1px_1px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${
        active ? "bg-violet-500 text-white" : "bg-white text-neutral-600"
      }`}
    >
      {label}
    </button>
  );
}

function DictList({ title, items }: { title: string; items: Record<string, string> }) {
  return (
    <div>
      <p className="mb-2 font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-neutral-500">{title}</p>
      <dl className="space-y-1.5">
        {Object.entries(items).map(([k, v]) => (
          <div key={k} className="font-['Satoshi'] text-xs">
            <dt className="inline font-mono font-semibold text-neutral-900">{k}</dt>
            <dd className="inline text-neutral-500"> {v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 text-center">
      <p className="font-['Clash_Display'] text-2xl font-bold text-violet-700">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="font-['Satoshi'] text-xs text-neutral-400">{label}</p>
    </div>
  );
}
