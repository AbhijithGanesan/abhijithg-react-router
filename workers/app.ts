import { createRequestHandler } from "react-router";
import { canonicalRedirect, robotsTxt, sitemapXml } from "../app/canonical";
import { handleContactRequest } from "./contact";
import { handleFitbitRequest } from "./fitbit";
import { applySecurityHeaders } from "./security-headers";

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env) {
		// Host, scheme, and trailing slash for requests that reach the Worker.
		// http://www is redirected by the Cloudflare Single Redirect before this.
		const redirect = canonicalRedirect(request);
		if (redirect) return applySecurityHeaders(redirect);

		const url = new URL(request.url);
		if (url.pathname === "/sitemap.xml") {
			return applySecurityHeaders(
				new Response(sitemapXml(), {
					headers: {
						"Content-Type": "application/xml; charset=utf-8",
						"Cache-Control": "public, max-age=3600",
					},
				}),
			);
		}
		if (url.pathname === "/robots.txt") {
			return applySecurityHeaders(
				new Response(robotsTxt(), {
					headers: {
						"Content-Type": "text/plain; charset=utf-8",
						"Cache-Control": "public, max-age=3600",
					},
				}),
			);
		}
		if (
			url.pathname === "/api/fitbit" ||
			url.pathname.startsWith("/api/fitbit/")
		) {
			return applySecurityHeaders(await handleFitbitRequest(request, env));
		}
		if (url.pathname === "/api/contact") {
			return applySecurityHeaders(await handleContactRequest(request, env));
		}

		return applySecurityHeaders(await requestHandler(request));
	},
} satisfies ExportedHandler<Env>;


