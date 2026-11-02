import { Fragment, useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken } from "~/lib/api";
import { toast } from "sonner";
import {
  DESTINATIONS,
  META_URL_TEMPLATE,
  SOURCE_MEDIUMS,
  UTM_MEDIUMS,
  UTM_SOURCES,
  autoSlug,
  cleanCampaign,
  cleanContent,
  cleanSlug,
  fullUrl,
  validateLink,
  type UtmMedium,
  type UtmSource,
} from "~/lib/utm-dictionary";
import { rate, type Stats } from "~/lib/utm-attribution";
import type { Route } from "./+types/utm-builder";

export function meta(_: Route.MetaArgs) {
  return [{ title: "UTM Links | Studojo Admin" }];
}

// UTM links for the relaunched product (2 Nov 2026). Build a link from the one
// naming scheme (app/lib/utm-dictionary.ts), share it as studojo.com/go/<slug>
// (which adds utm_id=<slug>), and see what each link and campaign brought into
// Stu: clicks, visitors, sign-ups, onboarded, paid and revenue, IST days, the
// dashboards' exclusions (app/routes/api.utm-report.tsx).

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

interface CampaignRow extends Stats {
  campaign: string;
  links: number;
}

interface Report {
  start: string;
  end: string;
  touch: "first" | "last";
  live: { links: boolean; clicks: boolean; journey: boolean; source: boolean };
  links: Record<string, Stats>;
  campaigns: CampaignRow[];
  totals: { signups: number; viaLink: number; tagged: number; visitors: number };
}

const RANGES = [
  { key: "today", label: "Today", days: 1 },
  { key: "7", label: "7 days", days: 7 },
  { key: "30", label: "30 days", days: 30 },
  { key: "all", label: "All time", days: 0 },
] as const;

/** IST day, n days back from today (0 = today). */
function istDayAgo(n: number): string {
  return new Date(Date.now() + 330 * 60_000 - n * 86_400_000).toISOString().slice(0, 10);
}

/** The short link host for this admin: studojo.pro on the staging admin, else studojo.com. */
function shortHost(): string {
  if (typeof window !== "undefined" && window.location.hostname.endsWith("studojo.pro")) return "studojo.pro";
  return "studojo.com";
}
const shortUrl = (slug: string) => `https://${shortHost()}/go/${slug}`;

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

function copy(text: string, msg = "Copied") {
  navigator.clipboard.writeText(text).then(
    () => toast.success(msg),
    () => toast.error("Could not copy"),
  );
}

const inr = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
const pctText = (n: number, d: number) => {
  const r = rate(n, d);
  return r == null ? "n/a" : `${r}%`;
};
const CUSTOM = "custom";

// ── Page ───────────────────────────────────────────────────────────────────

export default function UTMLinks() {
  const { isAuthorized } = useAdminGuard();

  // Builder
  const [dest, setDest] = useState<string>(DESTINATIONS[0].key);
  const [customUrl, setCustomUrl] = useState("");
  const [source, setSource] = useState<UtmSource>("linkedin");
  const [medium, setMedium] = useState<UtmMedium>("post");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [slug, setSlug] = useState("");
  const [slugEdited, setSlugEdited] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState<SavedLink | null>(null);

  // Data
  const [links, setLinks] = useState<SavedLink[]>([]);
  const [linksLoading, setLinksLoading] = useState(true);
  const [report, setReport] = useState<Report | null>(null);
  const [reportError, setReportError] = useState<string | null>(null);
  const [range, setRange] = useState<string>("all");
  const [touch, setTouch] = useState<"first" | "last">("first");
  const [internal, setInternal] = useState(false);
  const [view, setView] = useState<"links" | "campaigns">("links");
  const [campaignFilter, setCampaignFilter] = useState("");
  const [qrFor, setQrFor] = useState<string | null>(null);

  const baseUrl = dest === CUSTOM ? customUrl : DESTINATIONS.find((d) => d.key === dest)?.url ?? DESTINATIONS[0].url;
  const tags = { utm_source: source, utm_medium: medium, utm_campaign: campaign, utm_content: content || null };
  const effectiveSlug = slugEdited ? slug : autoSlug(tags);
  const draft = { base_url: baseUrl, ...tags, utm_term: null, slug: effectiveSlug };
  const errors = campaign ? validateLink(draft) : [];
  const preview = campaign ? fullUrl(draft) : "";
  const knownCampaigns = useMemo(() => [...new Set(links.map((l) => l.utm_campaign))].sort(), [links]);
  const suggested = SOURCE_MEDIUMS[source];
  const otherMediums = (Object.keys(UTM_MEDIUMS) as UtmMedium[]).filter((m) => !suggested.includes(m));

  async function loadLinks() {
    setLinksLoading(true);
    const r = await authed("/api/utm-campaigns");
    if (r.ok) setLinks((await r.json()).campaigns ?? []);
    else toast.error("Could not load links");
    setLinksLoading(false);
  }

  async function loadReport() {
    setReportError(null);
    const r = RANGES.find((x) => x.key === range) ?? RANGES[3];
    const qs = new URLSearchParams({ touch, end: istDayAgo(0) });
    if (r.days) qs.set("start", istDayAgo(r.days - 1));
    if (internal) qs.set("internal", "1");
    const res = await authed(`/api/utm-report?${qs}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok || body?.error) {
      setReportError(body?.error || `HTTP ${res.status}`);
      return;
    }
    setReport(body as Report);
  }

  useEffect(() => {
    if (isAuthorized) loadLinks();
  }, [isAuthorized]);

  useEffect(() => {
    if (isAuthorized) loadReport();
  }, [isAuthorized, range, touch, internal]);

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
    const res = await authed("/api/utm-campaigns", { method: "POST", body: JSON.stringify({ ...draft, name: effectiveSlug }) });
    const data = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) {
      toast.error(data.error || "Could not save the link");
      return;
    }
    const saved: SavedLink = {
      id: data.id, name: effectiveSlug, base_url: baseUrl, utm_source: source, utm_medium: medium, utm_campaign: campaign,
      utm_content: content || null, utm_term: null, slug: data.slug, created_by: null, created_at: new Date().toISOString(),
    };
    setJustSaved(saved);
    copy(shortUrl(data.slug), "Saved. Short link copied.");
    setContent("");
    setSlug("");
    setSlugEdited(false);
    loadLinks();
    loadReport();
  }

  async function remove(l: SavedLink) {
    if (!window.confirm(`Delete ${l.slug ? `/go/${l.slug}` : l.name}? The short link stops working.`)) return;
    const res = await authed("/api/utm-campaigns", { method: "DELETE", body: JSON.stringify({ id: l.id }) });
    if (!res.ok) {
      toast.error("Could not delete");
      return;
    }
    setLinks((prev) => prev.filter((x) => x.id !== l.id));
  }

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="font-['Satoshi'] text-neutral-500">Checking access…</p>
      </div>
    );
  }

  const shownLinks = campaignFilter ? links.filter((l) => l.utm_campaign === campaignFilter) : links;

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl space-y-6 px-4 py-8 sm:px-6 lg:px-8">
        <div>
          <h1 className="font-['Clash_Display'] text-2xl font-semibold text-neutral-900">UTM Links</h1>
          <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
            Every link we share for Stu, built from one naming scheme, with the clicks, sign-ups, onboarding and payments it brought in.
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
          {/* ── Builder ─────────────────────────────────────────────────── */}
          <Card title="Build a link">
            <div className="space-y-5 p-6">
              <Field label="Where should it land?">
                <div className="flex flex-wrap gap-2">
                  {DESTINATIONS.map((d) => (
                    <Pill key={d.key} label={d.label} active={dest === d.key} onClick={() => setDest(d.key)} />
                  ))}
                  <Pill label="Custom URL" active={dest === CUSTOM} onClick={() => setDest(CUSTOM)} />
                </div>
                {dest === CUSTOM ? (
                  <input
                    type="url"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value.trim())}
                    placeholder="https://studojo.com/reports/... or https://platform.studojo.com/..."
                    className={`${inputCls} mt-2`}
                  />
                ) : (
                  <p className={hintCls}>
                    {baseUrl}
                    {dest === "start" && " (the site has no link that opens Stu by itself yet, so this is the homepage, where Start is the first button)"}
                  </p>
                )}
              </Field>

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Source: where it is posted">
                  <select value={source} onChange={(e) => pickSource(e.target.value as UtmSource)} className={inputCls}>
                    {(Object.keys(UTM_SOURCES) as UtmSource[]).map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <p className={hintCls}>{UTM_SOURCES[source]}</p>
                </Field>
                <Field label="Medium: the format">
                  <select value={medium} onChange={(e) => setMedium(e.target.value as UtmMedium)} className={inputCls}>
                    <optgroup label={`Usual for ${source}`}>
                      {suggested.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                    <optgroup label="Other">
                      {otherMediums.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </optgroup>
                  </select>
                  <p className={hintCls}>{UTM_MEDIUMS[medium]}</p>
                </Field>
              </div>

              {(source === "meta" || source === "google") && (
                <p className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 font-['Satoshi'] text-xs text-amber-900">
                  {source === "meta"
                    ? "Meta adds fbclid to the link on its own, and the short link passes it on. For one link per ad, paste the URL parameters template (right) into each ad instead."
                    : "Google adds gclid on its own when auto-tagging is on, and the short link passes it on."}
                </p>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Campaign: what we are pushing">
                  <input
                    list="utm-known-campaigns"
                    value={campaign}
                    onChange={(e) => setCampaign(cleanCampaign(e.target.value))}
                    placeholder="launch-nov26"
                    className={inputCls}
                  />
                  <datalist id="utm-known-campaigns">
                    {knownCampaigns.map((c) => (
                      <option key={c} value={c} />
                    ))}
                  </datalist>
                  <p className={hintCls}>Lowercase words joined by hyphens, topic plus month. Reuse one where it fits.</p>
                </Field>
                <Field label="Content: post, creative or person (optional)">
                  <input
                    value={content}
                    onChange={(e) => setContent(cleanContent(e.target.value))}
                    placeholder="jeremy-post-1102"
                    className={inputCls}
                  />
                  <p className={hintCls}>Free: a post id, a creative, a person, a college. No spaces.</p>
                </Field>
              </div>

              <Field label="Short link">
                <div className="flex items-center gap-2">
                  <div className="flex flex-1 items-center rounded-lg border-2 border-neutral-200 bg-white focus-within:border-violet-500">
                    <span className="pl-3 font-mono text-xs text-neutral-400">{shortHost()}/go/</span>
                    <input
                      value={effectiveSlug}
                      onChange={(e) => {
                        setSlugEdited(true);
                        setSlug(cleanSlug(e.target.value));
                      }}
                      placeholder="linkedin-post-launch-nov26"
                      className="w-full bg-transparent px-1 py-2 font-mono text-xs outline-none"
                    />
                  </div>
                  {slugEdited && (
                    <button type="button" className={smallBtn} onClick={() => setSlugEdited(false)}>
                      Auto
                    </button>
                  )}
                </div>
                <p className={hintCls}>Made from source, medium, content and campaign; edit it if you like. It is also the link's utm_id.</p>
              </Field>

              {errors.length > 0 && (
                <ul className="space-y-1 rounded-lg border-2 border-red-200 bg-red-50 p-3 font-['Satoshi'] text-xs text-red-700">
                  {errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              )}

              {preview && errors.length === 0 && (
                <div className="space-y-2 rounded-lg border-2 border-violet-200 bg-violet-50 p-4">
                  <UrlLine label="Short link (after saving)" value={shortUrl(effectiveSlug)} />
                  <UrlLine label="Full URL" value={preview} />
                </div>
              )}

              <button
                onClick={save}
                disabled={saving || !campaign || errors.length > 0}
                className="w-full rounded-lg border-2 border-neutral-900 bg-emerald-400 px-4 py-2.5 font-['Satoshi'] text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none disabled:cursor-not-allowed disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save and copy short link"}
              </button>
            </div>
          </Card>

          <div className="space-y-6">
            {justSaved?.slug && (
              <Card title="Saved" subtitle={`/go/${justSaved.slug}`}>
                <div className="space-y-3 p-6">
                  <UrlLine label="Short link" value={shortUrl(justSaved.slug)} />
                  <UrlLine label="Full URL" value={fullUrl(justSaved)} />
                  <Qr text={shortUrl(justSaved.slug)} name={justSaved.slug} />
                </div>
              </Card>
            )}

            <Card title="Meta ads: URL parameters" subtitle="Ads Manager > each ad > Tracking > URL parameters">
              <div className="space-y-3 p-6">
                <p className="break-all rounded-lg bg-neutral-900 p-3 font-mono text-xs text-emerald-300">{META_URL_TEMPLATE}</p>
                <button onClick={() => copy(META_URL_TEMPLATE, "Template copied")} className={smallBtn}>
                  Copy template
                </button>
                <p className={hintCls}>
                  Name Meta campaigns in lowercase with hyphens (launch-nov26): Meta pastes the names in as they are. Meta adds fbclid itself.
                </p>
              </div>
            </Card>

            <Card title="The naming scheme" subtitle="The builder only allows these sources and mediums">
              <div className="grid gap-6 p-6 sm:grid-cols-2">
                <DictList title="Sources" items={UTM_SOURCES} />
                <DictList title="Mediums" items={UTM_MEDIUMS} />
              </div>
              <p className="px-6 pb-6 font-['Satoshi'] text-xs text-neutral-500">
                Campaign: lowercase-hyphen (launch-nov26). People, posts and colleges go in <b>content</b>, never in source or medium.
              </p>
            </Card>
          </div>
        </div>

        {/* ── Report ────────────────────────────────────────────────────── */}
        <Card
          title={view === "links" ? "Links" : "Campaigns"}
          subtitle={`Clicks through the short link (bots apart), website visitors who arrived with the link, and people who joined Stu in the range, credited by their ${touch} touch (utm_id = the short link, else matching tags). Onboarded, paid and revenue follow the Stu dashboards: real payments only, internal accounts ${internal ? "included" : "left out"}. Days are IST.`}
          right={
            <div className="flex flex-wrap items-center gap-2">
              <Pill label="Links" active={view === "links"} onClick={() => setView("links")} />
              <Pill label="Campaigns" active={view === "campaigns"} onClick={() => setView("campaigns")} />
              <span className="mx-1 h-5 w-px bg-neutral-200" />
              {RANGES.map((r) => (
                <Pill key={r.key} label={r.label} active={range === r.key} onClick={() => setRange(r.key)} />
              ))}
              <span className="mx-1 h-5 w-px bg-neutral-200" />
              <Pill label="First touch" active={touch === "first"} onClick={() => setTouch("first")} />
              <Pill label="Last touch" active={touch === "last"} onClick={() => setTouch("last")} />
              <label className="ml-1 flex items-center gap-1 font-['Satoshi'] text-xs text-neutral-600">
                <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} /> include internal
              </label>
            </div>
          }
        >
          {reportError && <p className="px-6 pt-4 font-['Satoshi'] text-sm text-red-600">Report failed: {reportError}</p>}
          {report && (
            <div className="grid grid-cols-2 gap-3 px-6 pt-6 sm:grid-cols-4">
              <MiniStat label="Joined Stu in range" value={report.totals.signups} />
              <MiniStat label="Came through a link" value={report.totals.viaLink} />
              <MiniStat label="Arrived tagged" value={pctText(report.totals.tagged, report.totals.signups)} />
              <MiniStat label="Tagged visitors" value={report.totals.visitors} />
            </div>
          )}
          {report && !report.live.clicks && (
            <p className="px-6 pt-3 font-['Satoshi'] text-xs text-neutral-400">No short link has been clicked here yet (utm_link_clicks is created on the first click).</p>
          )}

          {view === "links" ? (
            <div className="overflow-x-auto p-6">
              <div className="mb-3 flex items-center gap-2 font-['Satoshi'] text-xs text-neutral-500">
                Campaign
                <select value={campaignFilter} onChange={(e) => setCampaignFilter(e.target.value)} className="rounded border border-neutral-300 px-2 py-1">
                  <option value="">all</option>
                  {knownCampaigns.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <table className="w-full min-w-[1100px] text-left font-['Satoshi'] text-sm">
                <thead className="border-b-2 border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="py-3 pr-3">Link</th>
                    <th className="px-2 py-3">Tags</th>
                    <StatHeads />
                    <th className="py-3 pl-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {linksLoading && (
                    <tr>
                      <td colSpan={14} className="py-8 text-center text-neutral-400">Loading…</td>
                    </tr>
                  )}
                  {!linksLoading && shownLinks.length === 0 && (
                    <tr>
                      <td colSpan={14} className="py-8 text-center text-neutral-400">No links yet. Build one above.</td>
                    </tr>
                  )}
                  {shownLinks.map((l) => {
                    const s = report?.links[l.id];
                    const short = l.slug ? shortUrl(l.slug) : null;
                    return (
                      <Fragment key={l.id}>
                        <tr className="align-top">
                          <td className="py-3 pr-3">
                            <p className="font-semibold text-neutral-900">{l.slug ? `/go/${l.slug}` : l.name}</p>
                            <p className="max-w-[240px] truncate text-xs text-neutral-400" title={l.base_url}>
                              {l.base_url.replace(/^https:\/\//, "")}
                            </p>
                            <p className="text-xs text-neutral-400">
                              {new Date(l.created_at).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}
                              {l.created_by ? `, ${l.created_by}` : ""}
                            </p>
                          </td>
                          <td className="px-2 py-3 font-mono text-xs text-neutral-600">
                            {l.utm_source} / {l.utm_medium}
                            <br />
                            {l.utm_campaign}
                            {l.utm_content ? ` / ${l.utm_content}` : ""}
                          </td>
                          <StatCells s={s} hasShort={!!short} />
                          <td className="whitespace-nowrap py-3 pl-3 text-right">
                            {short && (
                              <button onClick={() => copy(short)} className={`${smallBtn} mr-1`}>
                                Short
                              </button>
                            )}
                            <button onClick={() => copy(fullUrl(l))} className={`${smallBtn} mr-1`}>
                              Full
                            </button>
                            {short && (
                              <button onClick={() => setQrFor(qrFor === l.id ? null : l.id)} className={`${smallBtn} mr-1`}>
                                QR
                              </button>
                            )}
                            <button onClick={() => remove(l)} className="px-1 text-neutral-300 hover:text-red-500" title="Delete">
                              ✕
                            </button>
                          </td>
                        </tr>
                        {qrFor === l.id && short && (
                          <tr>
                            <td colSpan={14} className="bg-neutral-50 py-4">
                              <Qr text={short} name={l.slug!} />
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="overflow-x-auto p-6">
              <table className="w-full min-w-[960px] text-left font-['Satoshi'] text-sm">
                <thead className="border-b-2 border-neutral-100 text-xs uppercase tracking-wide text-neutral-400">
                  <tr>
                    <th className="py-3 pr-3">Campaign</th>
                    <th className="px-2 py-3 text-right">Links</th>
                    <StatHeads />
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {!report && (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-neutral-400">Loading…</td>
                    </tr>
                  )}
                  {report?.campaigns.length === 0 && (
                    <tr>
                      <td colSpan={13} className="py-8 text-center text-neutral-400">No campaigns yet.</td>
                    </tr>
                  )}
                  {report?.campaigns.map((c) => (
                    <tr key={c.campaign}>
                      <td className="py-3 pr-3 font-mono text-xs text-neutral-900">{c.campaign}</td>
                      <td className="px-2 py-3 text-right tabular-nums">{c.links}</td>
                      <StatCells s={c} hasShort={c.links > 0} />
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="mt-3 font-['Satoshi'] text-xs text-neutral-400">
                A campaign counts everyone who arrived with its utm_campaign, through a short link or not (Meta ads tagged by the template too).
              </p>
            </div>
          )}
        </Card>
      </main>
    </div>
  );
}

// ── Report cells ───────────────────────────────────────────────────────────

function StatHeads() {
  const th = "px-2 py-3 text-right";
  return (
    <>
      <th className={th}>Clicks</th>
      <th className={th}>Visitors</th>
      <th className={th}>Sign-ups</th>
      <th className={th}>Onboarded</th>
      <th className={th}>Paid</th>
      <th className={th}>Revenue</th>
      <th className={th} title="Sign-ups per click">Click to sign-up</th>
      <th className={th}>Sign-up to onboarded</th>
      <th className={th}>Sign-up to paid</th>
    </>
  );
}

function StatCells({ s, hasShort }: { s?: Stats; hasShort: boolean }) {
  const td = "px-2 py-3 text-right tabular-nums";
  if (!s) {
    return (
      <>
        {Array.from({ length: 9 }, (_, i) => (
          <td key={i} className={`${td} text-neutral-300`}>
            {i === 0 && !hasShort ? "n/a" : "0"}
          </td>
        ))}
      </>
    );
  }
  return (
    <>
      <td className={td} title={s.botClicks ? `${s.botClicks} bot or link-preview hits not counted` : undefined}>
        {hasShort ? s.clicks : <span className="text-neutral-300">n/a</span>}
      </td>
      <td className={td}>{s.visitors}</td>
      <td className={`${td} font-semibold`}>{s.signups}</td>
      <td className={td}>{s.onboarded}</td>
      <td className={td}>{s.paid}</td>
      <td className={td}>{inr(s.revenue)}</td>
      <td className={`${td} text-neutral-500`}>{hasShort ? pctText(s.signups, s.clicks) : "n/a"}</td>
      <td className={`${td} text-neutral-500`}>{pctText(s.onboarded, s.signups)}</td>
      <td className={`${td} text-neutral-500`}>{pctText(s.paid, s.signups)}</td>
    </>
  );
}

// ── UI bits ────────────────────────────────────────────────────────────────

const inputCls =
  "w-full rounded-lg border-2 border-neutral-200 bg-white px-3 py-2 font-['Satoshi'] text-sm outline-none transition-colors focus:border-violet-500";
const hintCls = "mt-1.5 font-['Satoshi'] text-xs text-neutral-400";
const smallBtn =
  "rounded border border-neutral-300 px-2 py-1 font-['Satoshi'] text-xs text-neutral-600 hover:border-violet-400 hover:text-violet-600";

function UrlLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-violet-600">{label}</p>
        <p className="break-all font-mono text-xs text-violet-900">{value}</p>
      </div>
      <button type="button" onClick={() => copy(value)} className={`${smallBtn} shrink-0 bg-white`}>
        Copy
      </button>
    </div>
  );
}

/** A QR code of a short link, drawn in the browser, with a PNG download. */
function Qr({ text, name }: { text: string; name: string }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toDataURL(text, { margin: 2, width: 480, errorCorrectionLevel: "M" }).then(
      (url) => live && setSrc(url),
      () => live && setSrc(null),
    );
    return () => {
      live = false;
    };
  }, [text]);
  if (!src) return <p className={hintCls}>Drawing QR code…</p>;
  return (
    <div className="flex items-center gap-4">
      <img src={src} alt={`QR code for ${text}`} width={140} height={140} className="rounded border border-neutral-200 bg-white" />
      <div className="space-y-2">
        <p className="break-all font-mono text-xs text-neutral-600">{text}</p>
        <a href={src} download={`qr-${name}.png`} className={`${smallBtn} inline-block`}>
          Download PNG
        </a>
      </div>
    </div>
  );
}

function Card({ title, subtitle, right, children }: { title: string; subtitle?: string; right?: React.ReactNode; children: React.ReactNode }) {
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
      <p className="font-['Clash_Display'] text-2xl font-bold text-violet-700">{typeof value === "number" ? value.toLocaleString("en-IN") : value}</p>
      <p className="font-['Satoshi'] text-xs text-neutral-400">{label}</p>
    </div>
  );
}
