import {
	isRouteErrorResponse,
	Link,
	Links,
	Meta,
	Outlet,
	Scripts,
	ScrollRestoration,
} from "react-router";

import type { Route } from "./+types/root";
import "./app.css";

export const links: Route.LinksFunction = () => [
	{ rel: "icon", href: "/logo.svg", type: "image/svg+xml" },
	{ rel: "icon", href: "/favicon.ico", sizes: "48x48" },
];

export function Layout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en">
			<head>
				<meta charSet="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<Meta />
				<Links />
			</head>
			<body>
				{children}
				<ScrollRestoration />
				<Scripts />
			</body>
		</html>
	);
}

export default function App() {
	return <Outlet />;
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
	let title = "Something went wrong";
	let details = "This page could not be shown.";
	let stack: string | undefined;

	if (isRouteErrorResponse(error)) {
		title = error.status === 404 ? "Page not found" : "Something went wrong";
		details =
			error.status === 404
				? "That page is not on this site."
				: error.statusText || details;
	} else if (import.meta.env.DEV && error && error instanceof Error) {
		details = error.message;
		stack = error.stack;
	}

	return (
		<div className="min-h-dvh bg-[#08080a] text-[#ffffff]">
			<main className="mx-auto max-w-2xl px-4 py-16 sm:px-6">
				<p className="font-mono text-xs text-[#adadad]">
					<Link to="/" className="hover:text-white">
						Abhijith Ganesan
					</Link>
				</p>
				<h1 className="mt-6 font-display text-4xl font-semibold tracking-tight">
					{title}
				</h1>
				<p className="mt-3 text-sm leading-6 text-[#d6d6d6]">{details}</p>
				{stack && (
					<pre className="mt-8 overflow-x-auto rounded-lg border border-[#2e2e2e] bg-[#141414] p-4 font-mono text-xs leading-5 text-[#adadad]">
						<code>{stack}</code>
					</pre>
				)}
			</main>
		</div>
	);
}
