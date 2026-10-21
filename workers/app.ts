import { createRequestHandler } from "react-router";
import { handleContactRequest } from "./contact";
import { handleFitbitRequest } from "./fitbit";

const requestHandler = createRequestHandler(
	() => import("virtual:react-router/server-build"),
	import.meta.env.MODE,
);

export default {
	async fetch(request, env) {
		const url = new URL(request.url);
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


