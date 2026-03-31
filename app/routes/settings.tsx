import { useEffect, useState } from "react";
import { AdminHeader } from "~/components";
import { useAdminGuard } from "~/lib/auth-guard";
import { getToken, getControlPlaneUrl } from "~/lib/api";
import { toast } from "sonner";
import type { Route } from "./+types/settings";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Settings – Admin Panel" },
    { name: "description", content: "Platform configuration and API keys" },
  ];
}

interface Setting {
  key: string;
  label: string;
  description: string;
  placeholder: string;
  group: string;
}

const SETTINGS: Setting[] = [
  {
    key: "n8n_blog_api_key",
    label: "n8n Blog API Key",
    description: "Secret key used by n8n to publish blog posts via POST /api/blog/n8n on Maverick. Send this as the X-API-Key header.",
    placeholder: "Enter a strong random secret...",
    group: "Integrations",
  },
];

const GROUPS = [...new Set(SETTINGS.map((s) => s.group))];

function KeyIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
  );
}

export default function Settings() {
  const { isAuthorized, isPending } = useAdminGuard();
  const [values, setValues] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (isAuthorized) loadSettings();
  }, [isAuthorized]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const token = await getToken();
      const keys = SETTINGS.map((s) => s.key).join(",");
      const res = await fetch(`/api/settings?keys=${keys}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        // data.settings is a map of key -> masked value or ""
        const initial: Record<string, string> = {};
        for (const s of SETTINGS) {
          // If the key exists (masked), show empty input (user must re-enter to change)
          // We store whether it's set separately
          initial[s.key] = "";
        }
        setSaved(
          Object.fromEntries(
            Object.entries(data.settings as Record<string, string>).map(([k, v]) => [k, !!v])
          )
        );
        setValues(initial);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async (key: string) => {
    const value = values[key]?.trim();
    if (!value) {
      toast.error("Enter a value before saving");
      return;
    }
    setSaving((p) => ({ ...p, [key]: true }));
    try {
      const token = await getToken();
      const res = await fetch("/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key, value }),
      });
      if (!res.ok) throw new Error("Failed to save");
      setSaved((p) => ({ ...p, [key]: true }));
      setValues((p) => ({ ...p, [key]: "" }));
      toast.success("Saved successfully");
    } catch {
      toast.error("Failed to save setting");
    } finally {
      setSaving((p) => ({ ...p, [key]: false }));
    }
  };

  const handleDelete = async (key: string) => {
    if (!confirm("Remove this key? Any integration using it will stop working.")) return;
    try {
      const token = await getToken();
      const res = await fetch("/api/settings", {
        method: "DELETE",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ key }),
      });
      if (!res.ok) throw new Error("Failed to delete");
      setSaved((p) => ({ ...p, [key]: false }));
      setValues((p) => ({ ...p, [key]: "" }));
      toast.success("Key removed");
    } catch {
      toast.error("Failed to remove key");
    }
  };

  if (isPending || isAuthorized === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="mb-4 inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"></div>
          <p className="font-['Satoshi'] text-sm text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }
  if (!isAuthorized) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <AdminHeader />
      <main className="mx-auto max-w-3xl px-4 py-10 md:px-8">
        <div className="mb-8">
          <h1 className="font-['Clash_Display'] text-3xl font-bold text-neutral-900">Settings</h1>
          <p className="mt-1 font-['Satoshi'] text-sm text-neutral-500">
            Platform configuration and integration keys.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="h-7 w-7 animate-spin rounded-full border-4 border-solid border-violet-500 border-r-transparent"></div>
          </div>
        ) : (
          <div className="space-y-8">
            {GROUPS.map((group) => (
              <div key={group}>
                <h2 className="mb-4 font-['Clash_Display'] text-lg font-bold text-neutral-900 border-b-2 border-neutral-900 pb-2">
                  {group}
                </h2>
                <div className="space-y-4">
                  {SETTINGS.filter((s) => s.group === group).map((setting) => (
                    <div
                      key={setting.key}
                      className="rounded-xl border-2 border-neutral-900 bg-white p-6 shadow-[3px_3px_0px_0px_rgba(25,26,35,1)]"
                    >
                      <div className="flex items-start justify-between gap-4 mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-['Satoshi'] text-sm font-semibold text-neutral-900">
                              {setting.label}
                            </span>
                            {saved[setting.key] && (
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                                <CheckIcon /> Set
                              </span>
                            )}
                          </div>
                          <p className="mt-1 font-['Satoshi'] text-xs text-neutral-500 max-w-md">
                            {setting.description}
                          </p>
                          <p className="mt-1 font-mono text-xs text-neutral-400">
                            key: {setting.key}
                          </p>
                        </div>
                        {saved[setting.key] && (
                          <button
                            onClick={() => handleDelete(setting.key)}
                            className="flex-shrink-0 flex items-center gap-1 rounded-lg border-2 border-neutral-200 bg-white px-3 py-1.5 text-xs font-['Satoshi'] font-medium text-red-500 hover:border-red-300 hover:bg-red-50 transition-colors"
                          >
                            <TrashIcon /> Remove
                          </button>
                        )}
                      </div>

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400">
                            <KeyIcon />
                          </div>
                          <input
                            type="password"
                            value={values[setting.key] || ""}
                            onChange={(e) =>
                              setValues((p) => ({ ...p, [setting.key]: e.target.value }))
                            }
                            onKeyDown={(e) => e.key === "Enter" && handleSave(setting.key)}
                            placeholder={saved[setting.key] ? "Enter new value to replace..." : setting.placeholder}
                            className="w-full h-10 pl-9 pr-4 rounded-lg border-2 border-neutral-900 font-mono text-sm text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-violet-500 focus:ring-offset-1"
                          />
                        </div>
                        <button
                          onClick={() => handleSave(setting.key)}
                          disabled={saving[setting.key] || !values[setting.key]?.trim()}
                          className="flex-shrink-0 h-10 px-5 rounded-lg bg-violet-600 text-white font-['Satoshi'] font-semibold text-sm border-2 border-neutral-900 shadow-[2px_2px_0px_0px_rgba(25,26,35,1)] transition-all hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none disabled:opacity-40 disabled:cursor-not-allowed disabled:translate-x-0 disabled:translate-y-0 disabled:shadow-[2px_2px_0px_0px_rgba(25,26,35,1)]"
                        >
                          {saving[setting.key] ? "Saving..." : saved[setting.key] ? "Update" : "Save"}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
