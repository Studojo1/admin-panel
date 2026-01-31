export function getControlPlaneUrl(): string {
  const url = import.meta.env?.VITE_CONTROL_PLANE_URL;
  return (typeof url === "string" && url) ? url : "http://localhost:8080";
}

export async function getToken(): Promise<string | null> {
  // In a real implementation, this would get the token from Better Auth
  // For now, we'll assume the token is passed via headers from the frontend
  // or stored in a cookie that the admin panel can access
  return null;
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

export async function listUsers(limit = 50, offset = 0): Promise<ListResponse<AdminUser>> {
  return adminFetch<ListResponse<AdminUser>>(`/v1/admin/users?limit=${limit}&offset=${offset}`);
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

export async function listDissertations(limit = 50, offset = 0): Promise<ListResponse<DissertationSubmission>> {
  return adminFetch<ListResponse<DissertationSubmission>>(`/v1/admin/dissertations?limit=${limit}&offset=${offset}`);
}

export async function listCareers(limit = 50, offset = 0): Promise<ListResponse<CareerApplication>> {
  return adminFetch<ListResponse<CareerApplication>>(`/v1/admin/careers?limit=${limit}&offset=${offset}`);
}

