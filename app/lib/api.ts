export function getControlPlaneUrl(): string {
  // In browser, detect the API URL from the current page's protocol and host
  if (typeof window !== "undefined") {
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    
    // If we're on admin.studojo.com, use api.studojo.com
    if (hostname.startsWith("admin.")) {
      const baseHost = hostname.replace(/^admin\./, "");
      return `${protocol}//api.${baseHost}`;
    }
    
    // For local development, use the env var or default
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      const url = import.meta.env?.VITE_CONTROL_PLANE_URL;
      return (typeof url === "string" && url) ? url : "http://localhost:8080";
    }
    
    // Default: try to construct API URL from current host
    // e.g., admin.studojo.com -> api.studojo.com
    return `${protocol}//api.${hostname.replace(/^admin\./, "")}`;
  }
  
  // Server-side or fallback
  const url = import.meta.env?.VITE_CONTROL_PLANE_URL;
  return (typeof url === "string" && url) ? url : "http://localhost:8080";
}

import { authClient } from "./auth-client";

/**
 * Get the frontend URL for Better Auth
 */
function getFrontendUrl(): string {
  if (typeof window !== "undefined") {
    const host = window.location.hostname;
    const port = window.location.port;
    const protocol = window.location.protocol;
    
    // Handle local development
    if (port === "3001" || window.location.port === "3001") {
      return `http://${host}:3000`;
    }
    
    // Handle production subdomain: admin.studojo.com -> studojo.com
    if (host.startsWith("admin.")) {
      const baseHost = host.replace(/^admin\./, "");
      return `${protocol}//${baseHost}`;
    }
    
    // Fallback: try to replace port if present
    if (window.location.origin.includes(":3001")) {
      return window.location.origin.replace(":3001", ":3000");
    }
    
    // For same-domain deployments, use the same origin
    return window.location.origin;
  }
  return process.env.VITE_AUTH_URL || "http://localhost:3000";
}

/**
 * Get authentication token, trying multiple methods:
 * 1. Try to get token from Better Auth client (if cookies are shared)
 * 2. Try to fetch token from frontend's share-token endpoint (OAuth-like)
 */
export async function getToken(): Promise<string | null> {
  // First, check if we have a stored token
  if (typeof window !== "undefined") {
    const storedToken = sessionStorage.getItem("admin_token");
    if (storedToken) {
      // Verify token is still valid by checking expiration
      try {
        const payload = JSON.parse(atob(storedToken.split('.')[1]));
        const exp = payload.exp * 1000; // Convert to milliseconds
        if (exp > Date.now()) {
          return storedToken;
        } else {
          // Token expired, remove it
          sessionStorage.removeItem("admin_token");
        }
      } catch (e) {
        // Invalid token format, remove it
        sessionStorage.removeItem("admin_token");
      }
    }
  }

  // Try to get token directly from Better Auth
  try {
    const { data, error } = await authClient.token();
    if (!error && data?.token) {
      // Store token for future use
      if (typeof window !== "undefined") {
        sessionStorage.setItem("admin_token", data.token);
      }
      return data.token;
    }
  } catch (error) {
    console.debug("Failed to get token from Better Auth:", error);
  }

  // If that fails, try to get token from frontend via share-token endpoint
  // This allows the admin panel to get credentials from the frontend
  // Works like OAuth - if user is logged into frontend, we can share the token
  try {
    const frontendUrl = getFrontendUrl();
    
    const response = await fetch(`${frontendUrl}/api/auth/share-token`, {
      method: "GET",
      credentials: "include", // Include cookies for same-origin requests
      mode: "cors", // Enable CORS
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        // Store token in sessionStorage for future use
        if (typeof window !== "undefined") {
          sessionStorage.setItem("admin_token", data.token);
        }
        return data.token;
      }
    } else {
      console.debug("share-token endpoint returned:", response.status, await response.text().catch(() => ""));
    }
  } catch (error) {
    console.debug("Failed to get token from frontend:", error);
  }

  return null;
}

export async function checkAdminAccess(): Promise<boolean> {
  const { data: session } = authClient.useSession();
  if (!session?.user) return false;
  
  // Check if user has admin role by calling the admin API
  // If the call succeeds, user is admin
  try {
    const token = await getToken();
    if (!token) return false;
    
    const base = getControlPlaneUrl();
    const response = await fetch(`${base}/v1/admin/users?limit=1`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    
    return response.ok;
  } catch {
    return false;
  }
}

export interface AdminUser {
  id: string;
  name: string;
  email: string;
  email_verified: boolean;
  phone_number?: string;
  phone_number_verified: boolean;
  role?: string;
  banned?: boolean;
  ban_reason?: string;
  ban_expires?: string;
  full_name?: string;
  college?: string;
  year_of_study?: string;
  course?: string;
  created_at: string;
  updated_at: string;
}

// ─��� Outreach Types ──────────────────────────────────────────────────────────

export interface OutreachMonthlyMetric {
  month: string;
  orders_created: number;
  revenue_cents: number;
  emails_sent: number;
  emails_replied: number;
}

export interface OutreachOverview {
  total_orders: number;
  paid_orders: number;
  active_orders: number;
  completed_orders: number;
  stuck_orders: number;
  total_revenue_cents: number;
  total_emails_sent: number;
  total_emails_replied: number;
  total_emails_bounced: number;
  reply_rate_pct: number;
  orders_by_status: Record<string, number>;
  monthly_metrics: OutreachMonthlyMetric[];
}

export interface OutreachUserRow {
  user_id: string;
  user_name: string;
  user_email: string;
  total_orders: number;
  active_order_status: string | null;
  active_order_id: number | null;
  active_campaign_id: number | null;
  active_order_updated_at: string | null;
  is_stuck: boolean;
  total_paid_cents: number;
  total_credits: number;
  used_credits: number;
  total_emails_sent: number;
  total_emails_replied: number;
  total_emails_bounced: number;
  total_leads: number;
  created_at: string | null;
}

export interface CampaignEmail {
  id: number;
  lead_name: string;
  lead_company: string;
  lead_title: string;
  to_email: string | null;
  subject: string | null;
  body: string | null;
  status: string;
  assigned_style: string | null;
  sent_at: string | null;
  reply_text: string | null;
  reply_sentiment: string | null;
  reply_received_at: string | null;
  bounce_reason: string | null;
  error_message: string | null;
}

export interface AdminCampaignDetail {
  campaign: {
    id: number;
    name: string;
    status: string;
    daily_limit: number;
  };
  owner: {
    id: string | null;
    name: string;
    email: string;
  };
  emails: CampaignEmail[];
}

export interface OutreachOrderDetail {
  id: number;
  status: string;
  leads_collected: number | null;
  leads_target: number | null;
  is_stuck: boolean;
  action_log: Array<{ ts: string; msg: string }>;
  created_at: string | null;
  updated_at: string | null;
  campaign: {
    id: number;
    name: string;
    status: string;
    daily_limit: number;
    created_at: string | null;
    email_stats: {
      queued: number;
      scheduled: number;
      sent: number;
      replied: number;
      bounced: number;
      failed: number;
    };
    style_breakdown: Record<string, number>;
  } | null;
}

export interface OutreachUserDetail {
  user: {
    id: string;
    name: string;
    email: string;
    created_at: string | null;
  };
  credits: {
    total: number;
    used: number;
    available: number;
  };
  payments: Array<{
    id: number;
    amount_cents: number;
    currency: string;
    tier: string;
    status: string;
    credits_granted: number;
    created_at: string | null;
  }>;
  orders: OutreachOrderDetail[];
  lead_summary: {
    total: number;
    with_email: number;
    email_verified: number;
    avg_score: number;
  };
}

export interface CareerApplication {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  city: string;
  institution_name: string;
  current_year: string;
  course: string;
  areas_of_interest: string[];
  form_data?: Record<string, any>;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  payment_status: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface ListResponse<T> {
  [key: string]: T[] | number;
  limit: number;
  offset: number;
}

async function adminFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getToken();
  const base = getControlPlaneUrl();
  
  if (!token) {
    throw new Error("No authentication token available. Please sign in.");
  }
  
  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
    credentials: "include",
  });

  if (!response.ok) {
    if (response.status === 401) {
      // Clear stored token if unauthorized
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("admin_token");
      }
      throw new Error("Authentication failed. Please sign in again.");
    }
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function listUsers(limit = 50, offset = 0, search?: string): Promise<AdminUser[]> {
  const params = new URLSearchParams({
    limit: limit.toString(),
    offset: offset.toString(),
  });
  if (search) {
    params.append("search", search);
  }
  const response = await adminFetch<{ users: AdminUser[] }>(`/v1/admin/users?${params.toString()}`);
  return response.users || [];
}

export async function getUser(id: string): Promise<AdminUser> {
  return adminFetch<AdminUser>(`/v1/admin/users/${id}`);
}

export async function updateUser(
  id: string,
  updates: {
    role?: string;
    banned?: boolean;
    ban_reason?: string;
    ban_expires?: string;
  }
): Promise<{ status: string }> {
  return adminFetch<{ status: string }>(`/v1/admin/users/${id}`, {
    method: "PATCH",
    body: JSON.stringify(updates),
  });
}

// ── Outreach API Functions ───────────────────────────────────────────────────

// Proxy helper — routes through server-side /api/outreach to avoid CORS on /v1/outreach/* paths
async function outreachProxyFetch<T>(type: string, params: Record<string, string> = {}): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("No authentication token available. Please sign in.");
  const qs = new URLSearchParams({ type, ...params, _t: Date.now().toString() }).toString();
  const fullUrl = `/api/outreach?${qs}`;
  const response = await fetch(fullUrl, {
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    credentials: "include",
    cache: "no-store",
  });
  if (!response.ok) {
    if (response.status === 401) {
      if (typeof window !== "undefined") sessionStorage.removeItem("admin_token");
      throw new Error("Authentication failed. Please sign in again.");
    }
    const err = await response.json().catch(() => ({}));
    throw new Error((err as any).error || `HTTP ${response.status}`);
  }
  return response.json() as T;
}

export async function getOutreachOverview(): Promise<OutreachOverview> {
  return outreachProxyFetch<OutreachOverview>("overview");
}

export async function listOutreachUsers(
  limit = 50,
  offset = 0,
  search?: string,
  statusFilter?: string,
): Promise<{ users: OutreachUserRow[]; total: number }> {
  const params: Record<string, string> = { limit: limit.toString(), offset: offset.toString() };
  if (search) params.search = search;
  if (statusFilter) params.status_filter = statusFilter;
  return outreachProxyFetch<{ users: OutreachUserRow[]; total: number }>("users", params);
}

export async function getOutreachUserDetail(userId: string): Promise<OutreachUserDetail> {
  return outreachProxyFetch<OutreachUserDetail>("user_detail", { user_id: userId });
}

export async function getAdminCampaignEmails(campaignId: number): Promise<AdminCampaignDetail> {
  return outreachProxyFetch<AdminCampaignDetail>("campaign_emails", { campaign_id: campaignId.toString() });
}

export async function listCareers(limit = 50, offset = 0): Promise<CareerApplication[]> {
  const response = await adminFetch<{ applications: CareerApplication[] }>(`/v1/admin/careers?limit=${limit}&offset=${offset}`);
  return response.applications || [];
}

export interface MonthMetric {
  month: string;
  users_count: number;
  orders_count: number;
  dissertations_count: number;
  revenue: number;
}

export interface DashboardStats {
  total_users: number;
  total_dissertations: number;
  total_careers: number;
  users_last_7_days: number;
  users_last_30_days: number;
  dissertations_last_7_days: number;
  dissertations_last_30_days: number;
  careers_last_7_days: number;
  careers_last_30_days: number;
  banned_users: number;
  active_users: number;
  completed_payments: number;
  pending_payments: number;
  monthly_metrics: MonthMetric[];
  assignment_orders: Array<{
    job_id: string;
    user_id: string;
    user_name: string;
    created_at: string;
    status: string;
    amount: number;
    download_url?: string;
  }>;
  revenue_breakdown: {
    total: number;
    assignments: number;
    dissertations: number;
    careers: number;
  };
}

export async function getDashboardStats(): Promise<DashboardStats> {
  return adminFetch<DashboardStats>(`/v1/admin/stats`);
}

export interface SignupsData {
  count: number;
  daily: { day: string; signups: number }[];
}

export async function getSignups(start: string, end: string): Promise<SignupsData> {
  return adminFetch<SignupsData>(`/v1/outreach/admin/outreach/signups?start=${start}&end=${end}`);
}

export interface DissertationSubmission {
  id: string;
  name: string;
  email: string;
  phone_number: string;
  dissertation_title: string;
  data_type: string;
  current_stage: string;
  additional_notes?: string;
  form_data?: Record<string, any>;
  razorpay_order_id?: string;
  razorpay_payment_id?: string;
  payment_status: string;
  amount: number;
  status: string;
  created_at: string;
  updated_at: string;
}

export async function listDissertations(limit = 50, offset = 0): Promise<DissertationSubmission[]> {
  const response = await adminFetch<{ submissions: DissertationSubmission[] }>(`/v1/admin/dissertations?limit=${limit}&offset=${offset}`);
  return response.submissions || [];
}

export interface ScheduledEmail {
  id: string;
  user_id: string;
  user_email: string;
  user_name: string;
  email_type: string;
  scheduled_at: string;
  sent_at: string | null;
  created_at: string;
}

export interface ScheduledEmailsResponse {
  emails: ScheduledEmail[];
  total: number;
  limit: number;
  offset: number;
}

export async function listScheduledEmails(
  status?: "pending" | "sent" | "due" | "",
  limit = 100,
  offset = 0,
  userID?: string
): Promise<ScheduledEmailsResponse> {
  const params = new URLSearchParams({ limit: limit.toString(), offset: offset.toString() });
  if (status) params.append("status", status);
  if (userID) params.append("user_id", userID);
  return adminFetch<ScheduledEmailsResponse>(`/v1/admin/emails/scheduled?${params.toString()}`);
}

export async function cancelScheduledEmail(id: string): Promise<{ status: string }> {
  return adminFetch<{ status: string }>(`/v1/admin/emails/scheduled/${id}`, {
    method: "DELETE",
  });
}

export async function triggerEmail(
  routingKey: string,
  event: Record<string, unknown>
): Promise<{ message: string }> {
  return adminFetch<{ message: string }>(`/v1/admin/emails/trigger`, {
    method: "POST",
    body: JSON.stringify({ routing_key: routingKey, event }),
  });
}

export async function bulkSendPreview(
  withinDays: number
): Promise<{ count: number; within_days: number }> {
  const params = new URLSearchParams();
  if (withinDays > 0) params.append("within_days", withinDays.toString());
  return adminFetch<{ count: number; within_days: number }>(
    `/v1/admin/emails/bulk-send/preview?${params.toString()}`
  );
}

export async function bulkSend(
  emailType: string,
  withinDays: number
): Promise<{ message: string; total: number }> {
  return adminFetch<{ message: string; total: number }>(
    `/v1/admin/emails/bulk-send`,
    {
      method: "POST",
      body: JSON.stringify({ email_type: emailType, within_days: withinDays }),
    }
  );
}

