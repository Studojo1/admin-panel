import { getToken } from "~/lib/api";

/**
 * fetch() for the admin-only /api/posthog proxy.
 *
 * The proxy requires an admin session (it holds the server-side PostHog
 * personal key, so an open proxy leaked every person and replay). Admin API
 * calls authenticate with the bearer token from getToken(), not the cookie:
 * the studojo.com session cookie does not reach admin.studojo.com. Every
 * caller of /api/posthog goes through here so none can forget the header.
 */
export async function posthogFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = await getToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(input, { credentials: "include", ...init, headers });
}
