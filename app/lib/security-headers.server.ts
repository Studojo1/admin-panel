/**
 * Add security headers to HTTP responses
 */
export function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);

  // Prevent clickjacking
  headers.set("X-Frame-Options", "DENY");
  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff");
  // XSS protection (legacy but still useful)
  headers.set("X-XSS-Protection", "1; mode=block");
  // HSTS - only set if using HTTPS (check via protocol or env var)
  if (process.env.NODE_ENV === "production" || process.env.FORCE_HTTPS === "true") {
    headers.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }
  // Basic CSP - can be customized per application
  headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://api.fontshare.com; style-src 'self' 'unsafe-inline' https://api.fontshare.com; font-src 'self' https://api.fontshare.com; img-src 'self' data: https:"
  );

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

