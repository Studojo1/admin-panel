import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { toast } from "sonner";
import type { Route } from "./+types/utm-builder";

export function meta(_: Route.MetaArgs) {
  return [{ title: "UTM Builder — Studojo Admin" }];
}

// ── Types ──────────────────────────────────────────────────────────────────

interface SavedUTM {
  id: string;
  name: string;
  url: string;
  created: string;
}

interface UTMStats {
  visitors: number;
  payments: number;
  conversion: string;
}

// ── PostHog query helper ───────────────────────────────────────────────────

async function phQuery(query: object) {
  const res = await fetch("/api/posthog?type=query", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ query }),
  });
  if (!res.ok) throw new Error(`PostHog query failed: ${res.status}`);
  return res.json();
}

// ── Constants ──────────────────────────────────────────────────────────────

const SOURCE_OPTIONS = ["email", "linkedin", "twitter", "whatsapp", "instagram", "youtube"];
const MEDIUM_OPTIONS = ["nurture", "cpc", "social", "organic", "direct", "referral"];

const LS_KEY = "studojo_utm_campaigns";

function loadSaved(): SavedUTM[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function persistSaved(list: SavedUTM[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(list));
}

// ── Component ──────────────────────────────────────────────────────────────

export default function UTMBuilder() {
  const { isAuthorized } = useAdminGuard();

  // Builder state
  const [baseUrl, setBaseUrl] = useState("https://studojo.com/outreach");
  const [source, setSource] = useState("email");
  const [customSource, setCustomSource] = useState("");
  const [medium, setMedium] = useState("nurture");
  const [customMedium, setCustomMedium] = useState("");
  const [campaign, setCampaign] = useState("");
  const [content, setContent] = useState("");
  const [term, setTerm] = useState("");
  const [saveName, setSaveName] = useState("");

  // Saved campaigns
  const [saved, setSaved] = useState<SavedUTM[]>([]);

  // Per-campaign stats
  const [stats, setStats] = useState<Record<string, UTMStats | null>>({});
  const [statsLoading, setStatsLoading] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    setSaved(loadSaved());
  }, []);

  // ── Generated URL ────────────────────────────────────────────────────────

  const effectiveSource = source === "__custom__" ? customSource : source;
  const effectiveMedium = medium === "__custom__" ? customMedium : medium;

  const generatedUrl = (() => {
    if (!baseUrl) return "";
    try {
      const u = new URL(baseUrl);
      if (effectiveSource) u.searchParams.set("utm_source", effectiveSource);
      if (effectiveMedium) u.searchParams.set("utm_medium", effectiveMedium);
      if (campaign) u.searchParams.set("utm_campaign", campaign);
      if (content) u.searchParams.set("utm_content", content);
      if (term) u.searchParams.set("utm_term", term);
      return u.toString();
    } catch {
      return "";
    }
  })();

  function copyGenerated() {
    if (!generatedUrl) return;
    navigator.clipboard.writeText(generatedUrl).then(() => toast.success("URL copied!"));
  }

  function saveCampaign() {
    if (!generatedUrl) { toast.error("Enter a base URL first"); return; }
    if (!campaign) { toast.error("Enter a campaign name to save"); return; }
    const name = saveName || campaign;
    const entry: SavedUTM = {
      id: Date.now().toString(),
      name,
      url: generatedUrl,
      created: new Date().toISOString(),
    };
    const updated = [entry, ...saved];
    setSaved(updated);
    persistSaved(updated);
    setSaveName("");
    toast.success(`Campaign "${name}" saved!`);
  }

  function removeSaved(id: string) {
    const updated = saved.filter((s) => s.id !== id);
    setSaved(updated);
    persistSaved(updated);
    if (expanded === id) setExpanded(null);
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url).then(() => toast.success("Copied!"));
  }

  // ── Load stats for a campaign ─────────────────────────────────────────────

  async function toggleStats(item: SavedUTM) {
    if (expanded === item.id) {
      setExpanded(null);
      return;
    }
    setExpanded(item.id);
    if (stats[item.id] !== undefined) return;

    // Extract utm_campaign value from the saved URL
    let utmCampaign = "";
    try {
      utmCampaign = new URL(item.url).searchParams.get("utm_campaign") ?? "";
    } catch {
      utmCampaign = "";
    }
    if (!utmCampaign) {
      setStats((prev) => ({ ...prev, [item.id]: { visitors: 0, payments: 0, conversion: "0%" } }));
      return;
    }

    setStatsLoading((prev) => ({ ...prev, [item.id]: true }));
    try {
      const res = await phQuery({
        kind: "HogQLQuery",
        query: `SELECT
          uniqIf(person_id, event = '$pageview') as visitors,
          countIf(event = 'payment_confirmed') as payments
        FROM events
        WHERE properties.utm_campaign = '${utmCampaign}'
          AND timestamp > now() - INTERVAL 90 DAY`,
      });
      const row = res?.results?.[0] ?? [0, 0];
      const v = row[0] ?? 0;
      const p = row[1] ?? 0;
      const conv = v > 0 ? ((p / v) * 100).toFixed(1) + "%" : "0%";
      setStats((prev) => ({ ...prev, [item.id]: { visitors: v, payments: p, conversion: conv } }));
    } catch (e: any) {
      toast.error("Failed to load stats: " + e.message);
      setStats((prev) => ({ ...prev, [item.id]: null }));
    } finally {
      setStatsLoading((prev) => ({ ...prev, [item.id]: false }));
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-neutral-50">
        <p className="font-['Satoshi'] text-neutral-500">Checking access…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50">
      <AdminHeader />
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6">
          <h1 className="font-['Clash_Display'] text-2xl font-semibold text-neutral-900">
            UTM Builder
          </h1>
          <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
            Build campaign links and track their performance via PostHog
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* ── LEFT: Builder ─────────────────────────────────────────────── */}
          <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <div className="border-b-2 border-neutral-900 px-6 py-4">
              <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                Build a Link
              </h2>
            </div>
            <div className="p-6 space-y-4">
              {/* Base URL */}
              <Field label="Base URL" required>
                <input
                  type="url"
                  value={baseUrl}
                  onChange={(e) => setBaseUrl(e.target.value)}
                  placeholder="https://studojo.com/outreach"
                  className={inputCls}
                />
              </Field>

              {/* Source */}
              <Field label="Source (utm_source)" required>
                <div className="flex flex-wrap gap-2 mb-2">
                  {SOURCE_OPTIONS.map((s) => (
                    <Pill
                      key={s}
                      label={s}
                      active={source === s}
                      onClick={() => setSource(s)}
                    />
                  ))}
                  <Pill
                    label="custom"
                    active={source === "__custom__"}
                    onClick={() => setSource("__custom__")}
                  />
                </div>
                {source === "__custom__" && (
                  <input
                    type="text"
                    value={customSource}
                    onChange={(e) => setCustomSource(e.target.value)}
                    placeholder="e.g. newsletter"
                    className={inputCls}
                  />
                )}
              </Field>

              {/* Medium */}
              <Field label="Medium (utm_medium)" required>
                <div className="flex flex-wrap gap-2 mb-2">
                  {MEDIUM_OPTIONS.map((m) => (
                    <Pill
                      key={m}
                      label={m}
                      active={medium === m}
                      onClick={() => setMedium(m)}
                    />
                  ))}
                  <Pill
                    label="custom"
                    active={medium === "__custom__"}
                    onClick={() => setMedium("__custom__")}
                  />
                </div>
                {medium === "__custom__" && (
                  <input
                    type="text"
                    value={customMedium}
                    onChange={(e) => setCustomMedium(e.target.value)}
                    placeholder="e.g. podcast"
                    className={inputCls}
                  />
                )}
              </Field>

              {/* Campaign */}
              <Field label="Campaign name (utm_campaign)" required>
                <input
                  type="text"
                  value={campaign}
                  onChange={(e) => setCampaign(e.target.value.toLowerCase().replace(/\s+/g, "_"))}
                  placeholder="e.g. day3_followup"
                  className={inputCls}
                />
                <p className="mt-1 font-['Satoshi'] text-xs text-neutral-400">
                  Spaces auto-replaced with underscores
                </p>
              </Field>

              {/* Content (optional) */}
              <Field label="Content (utm_content) — optional">
                <input
                  type="text"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="e.g. cta_button"
                  className={inputCls}
                />
              </Field>

              {/* Generated URL */}
              {generatedUrl && (
                <div className="rounded-lg border-2 border-violet-200 bg-violet-50 p-4">
                  <p className="mb-1 font-['Satoshi'] text-xs font-semibold uppercase tracking-wide text-violet-600">
                    Generated URL
                  </p>
                  <p className="break-all font-mono text-xs text-violet-900 mb-3">
                    {generatedUrl}
                  </p>
                  <button
                    onClick={copyGenerated}
                    className="rounded-lg border-2 border-neutral-900 bg-violet-500 px-4 py-1.5 font-['Satoshi'] text-sm font-semibold text-white shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
                  >
                    Copy URL
                  </button>
                </div>
              )}

              {/* Save */}
              <div className="border-t-2 border-neutral-100 pt-4">
                <Field label="Save this campaign as">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      placeholder={campaign || "Campaign name"}
                      className={`${inputCls} flex-1`}
                    />
                    <button
                      onClick={saveCampaign}
                      className="shrink-0 rounded-lg border-2 border-neutral-900 bg-emerald-400 px-4 py-2 font-['Satoshi'] text-sm font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none"
                    >
                      Save & Track
                    </button>
                  </div>
                </Field>
              </div>
            </div>
          </div>

          {/* ── RIGHT: Saved campaigns ─────────────────────────────────────── */}
          <div className="rounded-xl border-2 border-neutral-900 bg-white shadow-[4px_4px_0px_0px_rgba(25,26,35,1)]">
            <div className="border-b-2 border-neutral-900 px-6 py-4">
              <h2 className="font-['Clash_Display'] text-base font-semibold text-neutral-900">
                Saved Campaigns
              </h2>
              <p className="mt-0.5 font-['Satoshi'] text-xs text-neutral-400">
                Expand to see live PostHog stats (last 90 days)
              </p>
            </div>

            <div className="divide-y divide-neutral-100">
              {saved.length === 0 && (
                <p className="px-6 py-10 text-center font-['Satoshi'] text-sm text-neutral-400">
                  No campaigns saved yet. Build and save one on the left.
                </p>
              )}

              {saved.map((item) => {
                const isExpanded = expanded === item.id;
                const s = stats[item.id];
                const loading = statsLoading[item.id];

                return (
                  <div key={item.id}>
                    <div className="flex items-center gap-3 px-6 py-4">
                      <div className="flex-1 min-w-0">
                        <p className="font-['Satoshi'] text-sm font-semibold text-neutral-900 truncate">
                          {item.name}
                        </p>
                        <p className="font-['Satoshi'] text-xs text-neutral-400">
                          {new Date(item.created).toLocaleDateString()}
                        </p>
                      </div>
                      <button
                        onClick={() => copyUrl(item.url)}
                        className="shrink-0 rounded border border-neutral-300 px-2 py-1 font-['Satoshi'] text-xs text-neutral-500 hover:border-violet-400 hover:text-violet-600"
                      >
                        Copy
                      </button>
                      <button
                        onClick={() => toggleStats(item)}
                        className={`shrink-0 rounded-lg border-2 border-neutral-900 px-3 py-1 font-['Satoshi'] text-xs font-semibold shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-px hover:translate-y-px hover:shadow-none ${
                          isExpanded ? "bg-violet-500 text-white" : "bg-white text-neutral-700"
                        }`}
                      >
                        {isExpanded ? "Hide" : "Stats"}
                      </button>
                      <button
                        onClick={() => removeSaved(item.id)}
                        className="shrink-0 text-neutral-300 hover:text-red-400 text-sm"
                        title="Remove"
                      >
                        ✕
                      </button>
                    </div>

                    {isExpanded && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        className="border-t border-neutral-100 bg-neutral-50 px-6 py-4"
                      >
                        <p className="mb-1 font-['Satoshi'] text-xs text-neutral-400 font-mono break-all">
                          {item.url}
                        </p>

                        {loading ? (
                          <p className="font-['Satoshi'] text-xs text-neutral-400 mt-3">Loading stats…</p>
                        ) : s === null ? (
                          <p className="font-['Satoshi'] text-xs text-red-400 mt-3">Failed to load stats</p>
                        ) : s ? (
                          <div className="mt-3 grid grid-cols-3 gap-3">
                            <MiniStat label="Visitors" value={s.visitors} color="violet" />
                            <MiniStat label="Payments" value={s.payments} color="emerald" />
                            <MiniStat label="Conversion" value={s.conversion} color="amber" />
                          </div>
                        ) : null}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

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

function MiniStat({
  label,
  value,
  color,
}: {
  label: string;
  value: number | string;
  color: "violet" | "emerald" | "amber";
}) {
  const text = {
    violet: "text-violet-700",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
  }[color];

  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3 text-center">
      <p className={`font-['Clash_Display'] text-2xl font-bold ${text}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      <p className="font-['Satoshi'] text-xs text-neutral-400">{label}</p>
    </div>
  );
}
