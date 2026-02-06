import { jwtVerify } from "jose";
import db from "./db.server";
import { sql } from "drizzle-orm";

/**
 * Verify JWT token using JWKS from database
 */
export async function verifyToken(token: string): Promise<string | null> {
  try {
    // Get the latest JWKS from database
    const jwksResult = await db.execute(
      sql`SELECT public_key, private_key FROM jwks WHERE expires_at IS NULL OR expires_at > NOW() ORDER BY created_at DESC LIMIT 1`
    );

    if (jwksResult.rows.length === 0) {
      return null;
    }

    const jwks = jwksResult.rows[0] as any;
    const publicKey = jwks.public_key;

    // Import the public key
    const key = await crypto.subtle.importKey(
      "jwk",
      JSON.parse(publicKey),
      {
        name: "RS256",
        hash: "SHA-256",
      },
      false,
      ["verify"]
    );

    // Verify the token
    const { payload } = await jwtVerify(token, key);

    // Return user ID from token
    return (payload.sub || payload.userId || payload.id) as string | null;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}

