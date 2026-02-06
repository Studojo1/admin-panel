import { jwtVerify, importJWK } from "jose";
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

    // Parse stored JWK
    const jwk = JSON.parse(publicKey);

    // Determine algorithm based on key type/curve (Better Auth uses Ed25519 here)
    const alg =
      jwk.alg ||
      (jwk.kty === "OKP" && jwk.crv === "Ed25519" ? "EdDSA" : "RS256");

    // Import JWK with explicit algorithm
    const key = await importJWK(jwk, alg);

    // Verify the token using the imported JWK
    const { payload } = await jwtVerify(token, key);

    // Return user ID from token
    return (payload.sub || payload.userId || payload.id) as string | null;
  } catch (error) {
    console.error("Token verification failed:", error);
    return null;
  }
}

