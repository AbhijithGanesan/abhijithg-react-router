import type { ReactNode } from "react";
import { Link } from "react-router";

export function LegalDocument({
	title,
	children,
	dated = true,
	date = "1 October 2026",
}: {
	title: string;
	children: ReactNode;
	dated?: boolean;
	date?: string;
}) {
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
				{dated ? (
					<p className="mt-2 text-sm text-[#adadad]">{date}</p>
				) : null}
				<div className="mt-8 space-y-8 text-sm leading-6 text-[#d6d6d6]">
					{children}
				</div>
				<p className="mt-12 font-mono text-xs text-[#adadad]">
					<Link to="/privacy" className="hover:text-white">
						Privacy
					</Link>
					<span aria-hidden="true"> · </span>
					<Link to="/terms" className="hover:text-white">
						Terms
					</Link>
					<span aria-hidden="true"> · </span>
					<Link to="/contact" className="hover:text-white">
						Contact
					</Link>
				</p>
			</main>
		</div>
	);
}

export function LegalSection({
	heading,
	children,
}: {
	heading: string;
	children: ReactNode;
}) {
	return (
		<section className="space-y-2">
			<h2 className="font-display text-lg font-semibold text-[#ffffff]">
				{heading}
			</h2>
			{children}
		</section>
	);
}
