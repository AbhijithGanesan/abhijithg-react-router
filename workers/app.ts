import { createRequestHandler } from "react-router";
import { canonicalRedirect, robotsTxt, sitemapXml } from "../app/canonical";
import { handleContactRequest } from "./contact";
import { handleFitbitRequest } from "./fitbit";

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env) {
		// Host, scheme, and trailing slash for requests that reach the Worker.
		// http://www is redirected by the Cloudflare Single Redirect before this.
		const redirect = canonicalRedirect(request);
		if (redirect) return redirect;

		const url = new URL(request.url);
		if (url.pathname === "/sitemap.xml") {
			return new Response(sitemapXml(), {
				headers: {
					"Content-Type": "application/xml; charset=utf-8",
					"Cache-Control": "public, max-age=3600",
				},
			});
		}
		if (url.pathname === "/robots.txt") {
			return new Response(robotsTxt(), {
				headers: {
					"Content-Type": "text/plain; charset=utf-8",
					"Cache-Control": "public, max-age=3600",
				},
			});
		}
		if (
			url.pathname === "/api/fitbit" ||
			url.pathname.startsWith("/api/fitbit/")
		) {
			return handleFitbitRequest(request, env);
		}
		if (url.pathname === "/api/contact") {
			return handleContactRequest(request, env);
		}

		return requestHandler(request);
	},
} satisfies ExportedHandler<Env>;


