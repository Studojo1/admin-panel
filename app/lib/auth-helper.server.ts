import db from "./db.server";
import { sql } from "drizzle-orm";
import { verifyToken } from "./jwks.server";

export interface UserInfo {
  id: string;
  name: string;
  email: string;
}

/**
 * Verify JWT token and get user ID
 */
export async function getUserIdFromToken(token: string): Promise<string | null> {
  return verifyToken(token);
}

/**
 * Get user info from database by user ID
 */
export async function getUserInfo(userId: string): Promise<UserInfo | null> {
  try {
    const result = await db.execute(
      sql`SELECT id, name, email FROM "user" WHERE id = ${userId} LIMIT 1`
    );

    if (result.rows.length === 0) {
      return null;
    }

    const row = result.rows[0];
    return {
      id: row.id as string,
      name: row.name as string,
      email: row.email as string,
    };
  } catch (error) {
    console.error("Error getting user info:", error);
    return null;
  }
}

/**
 * Get user info from Authorization header with verified JWT token
 */
export async function getUserFromRequest(request: Request): Promise<UserInfo | null> {
  const authHeader = request.headers.get("Authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7);
    const userId = await getUserIdFromToken(token);
    if (userId) {
      return getUserInfo(userId);
    }
  }

  // Try cookies via frontend share-token endpoint
  const frontendUrl = process.env.VITE_AUTH_URL || "http://localhost:3000";
  const cookies = request.headers.get("Cookie");

  if (cookies) {
    try {
      const origin = request.headers.get("Origin") || `https://${new URL(frontendUrl).hostname}`;
      const response = await fetch(`${frontendUrl}/api/auth/share-token`, {
        method: "GET",
        headers: {
          "Cookie": cookies,
          "Content-Type": "application/json",
          "User-Agent": request.headers.get("User-Agent") || "Admin-Panel/1.0",
          "Origin": origin,
          "Referer": request.headers.get("Referer") || `${origin}/`,
        },
        redirect: "manual",
      });

      if (response.ok) {
        const data = await response.json();
        if (data.token) {
          const userId = await getUserIdFromToken(data.token);
          if (userId) {
            return getUserInfo(userId);
          }
        }
      }
    } catch (error) {
      console.debug(`[auth-helper] Failed to get token from frontend:`, error);
    }
  }

  return null;
}

