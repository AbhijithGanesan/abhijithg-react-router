import { type RouteConfig, index, route } from "@react-router/dev/routes";

// Public pages here also belong in INDEXABLE_PATHS in app/canonical.ts.
export default [
	index("routes/home.tsx"),
	route("privacy", "routes/privacy.tsx"),
	route("terms", "routes/terms.tsx"),
	route("contact", "routes/contact.tsx"),
] satisfies RouteConfig;
