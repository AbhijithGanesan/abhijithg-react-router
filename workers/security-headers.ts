// Matches the abhijithg.com response-header rule. Inline scripts and styles
// stay allowed for the React Router document. Turnstile and Open-Meteo are
// the only outside origins the pages use.
const CONTENT_SECURITY_POLICY = [
	"default-src 'self'",
	"script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
	"style-src 'self' 'unsafe-inline'",
	"img-src 'self' data:",
	"font-src 'self'",
	"connect-src 'self' https://api.open-meteo.com https://air-quality-api.open-meteo.com https://challenges.cloudflare.com",
	"frame-src https://challenges.cloudflare.com",
	"object-src 'none'",
	"base-uri 'self'",
	"form-action 'self'",
	"frame-ancestors 'none'",
].join("; ");

export function applySecurityHeaders(response: Response): Response {
	response.headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
	response.headers.set("X-Content-Type-Options", "nosniff");
	response.headers.set(
		"Referrer-Policy",
		"strict-origin-when-cross-origin",
	);
	return response;
}
