/**
 * Preferred URLs are HTTPS on abhijithg.com.
 * The homepage keeps its trailing slash. Every other path drops it.
 * Canonical tags and sitemap.xml both use INDEXABLE_PATHS.
 */

export const CANONICAL_ORIGIN = "https://abhijithg.com";
export const CANONICAL_HOST = "abhijithg.com";

export const INDEXABLE_PATHS = ["/", "/contact", "/privacy", "/terms"] as const;

const WWW_HOST = `www.${CANONICAL_HOST}`;

export function preferredPathname(pathname: string): string {
	if (pathname === "" || pathname === "/") return "/";
	let path = pathname;
	while (path.length > 1 && path.endsWith("/")) {
		path = path.slice(0, -1);
	}
	return path || "/";
}

export function isIndexablePath(pathname: string): boolean {
	const path = preferredPathname(pathname);
	return (INDEXABLE_PATHS as readonly string[]).includes(path);
}

export function canonicalUrl(pathname: string): string {
	return `${CANONICAL_ORIGIN}${preferredPathname(pathname)}`;
}

function isLoopback(hostname: string): boolean {
	const host = hostname.toLowerCase();
	return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

/**
 * Absolute preferred URL for this request, or null when it is already preferred.
 * Loopback hosts keep their own host and scheme so local development still works.
 * abhijithg.com and www.abhijithg.com fold to https://abhijithg.com in one redirect.
 */
export function preferredRequestUrl(requestUrl: string): string | null {
	const url = new URL(requestUrl);
	const target = new URL(url.href);
	target.pathname = preferredPathname(url.pathname);
	target.hash = "";

	const hostname = url.hostname.toLowerCase();
	if (!isLoopback(hostname) && (hostname === CANONICAL_HOST || hostname === WWW_HOST)) {
		target.protocol = "https:";
		target.hostname = CANONICAL_HOST;
		target.port = "";
	}

	if (
		target.protocol === url.protocol &&
		target.hostname === url.hostname &&
		target.port === url.port &&
		target.pathname === url.pathname &&
		target.search === url.search
	) {
		return null;
	}

	return target.toString();
}

export function canonicalRedirect(request: Request): Response | null {
	const url = new URL(request.url);
	// Leave HTTP certificate checks on /.well-known/ alone. Cloudflare fetches
	// those over plain HTTP, and a redirect there can fail renewal.
	if (
		url.protocol === "http:" &&
		(url.pathname === "/.well-known" || url.pathname.startsWith("/.well-known/"))
	) {
		return null;
	}

	const location = preferredRequestUrl(request.url);
	if (!location) return null;
	const status = request.method === "GET" || request.method === "HEAD" ? 301 : 308;
	return new Response(null, {
		status,
		headers: { Location: location },
	});
}

function xmlEscape(value: string): string {
	return value
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;")
		.replaceAll('"', "&quot;")
		.replaceAll("'", "&apos;");
}

export function sitemapXml(): string {
	const urls = INDEXABLE_PATHS.map(
		(path) => `  <url>\n    <loc>${xmlEscape(`${CANONICAL_ORIGIN}${path}`)}</loc>\n  </url>`,
	).join("\n");
	return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`;
}

export function robotsTxt(): string {
	return `User-agent: *\nAllow: /\n\nSitemap: ${CANONICAL_ORIGIN}/sitemap.xml\n`;
}
