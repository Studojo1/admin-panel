export function getControlPlaneUrl(): string {
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
    
    // Handle production subdomain: admin.studojo.pro -> studojo.pro
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
  // First, try to get token directly from Better Auth
  const { data, error } = await authClient.token();
  if (!error && data?.token) {
    return data.token;
  }

  // If that fails, try to get token from frontend via share-token endpoint
  // This allows the admin panel to get credentials from the frontend
  // Works like OAuth - if user is logged into frontend, we can share the token
  // Note: Cookies won't be shared across different ports (3000 vs 3001)
  // So we need to use a different approach - maybe store token in localStorage
  // or use a popup/redirect flow
  try {
    const frontendUrl = getFrontendUrl();
    
    // Try to fetch token from frontend
    // Since cookies don't work cross-origin, we might need to:
    // 1. Open frontend in iframe/popup to get token
    // 2. Or redirect user to frontend to authenticate, then redirect back with token
    // 3. Or use localStorage/sessionStorage if both apps are on same domain
    
    const response = await fetch(`${frontendUrl}/api/auth/share-token`, {
      method: "GET",
      credentials: "include", // Try to include cookies (won't work cross-origin)
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
      // If request failed, check if we have a stored token
      if (typeof window !== "undefined") {
        const storedToken = sessionStorage.getItem("admin_token");
        if (storedToken) {
          return storedToken;
        }
      }
    }
  } catch (error) {
    console.debug("Failed to get token from frontend:", error);
    // Fallback to stored token
    if (typeof window !== "undefined") {
      const storedToken = sessionStorage.getItem("admin_token");
      if (storedToken) {
        return storedToken;
      }
    }
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
  created_at: string;
  updated_at: string;
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
  
  const response = await fetch(`${base}${endpoint}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token && { Authorization: `Bearer ${token}` }),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: { message: "Unknown error" } }));
    throw new Error(error.error?.message || `HTTP ${response.status}`);
  }

  return response.json();
}

export async function listUsers(limit = 50, offset = 0): Promise<AdminUser[]> {
  const response = await adminFetch<{ users: AdminUser[] }>(`/v1/admin/users?limit=${limit}&offset=${offset}`);
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

export async function listDissertations(limit = 50, offset = 0): Promise<DissertationSubmission[]> {
  const response = await adminFetch<{ submissions: DissertationSubmission[] }>(`/v1/admin/dissertations?limit=${limit}&offset=${offset}`);
  return response.submissions || [];
}

export async function listCareers(limit = 50, offset = 0): Promise<CareerApplication[]> {
  const response = await adminFetch<{ applications: CareerApplication[] }>(`/v1/admin/careers?limit=${limit}&offset=${offset}`);
  return response.applications || [];
}

