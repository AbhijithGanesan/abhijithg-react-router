import { useEffect, useRef, useState, type FormEvent } from "react";
import { LegalDocument } from "../components/LegalDocument";

const TURNSTILE_SITE_KEY = "0x4AAAAAAFfvHfserBAqxjYM";
const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";

type TurnstileApi = {
	ready: (callback: () => void) => void;
	render: (
		container: HTMLElement,
		options: {
			sitekey: string;
			action: string;
			theme: "dark";
			callback: (token: string) => void;
			"expired-callback": () => void;
			"error-callback": () => void;
		},
	) => string;
	reset: (widgetId: string) => void;
	remove: (widgetId: string) => void;
	getResponse: (widgetId: string) => string | undefined;
};

declare global {
	interface Window {
		turnstile?: TurnstileApi;
	}
}

function loadTurnstile(): Promise<TurnstileApi> {
	if (window.turnstile) {
		return Promise.resolve(window.turnstile);
	}
	return new Promise((resolve, reject) => {
		const previous = document.getElementById(TURNSTILE_SCRIPT_ID);
		const script =
			previous instanceof HTMLScriptElement
				? previous
				: document.createElement("script");
		const finish = () => {
			const turnstile = window.turnstile;
			if (!turnstile) {
				reject(new Error("Turnstile did not load."));
				return;
			}
			resolve(turnstile);
		};
		// Turnstile throws if this script is async or defer and ready() is used.
		script.addEventListener("load", () => {
			script.dataset.loaded = "true";
			finish();
		});
		script.addEventListener("error", () => {
			reject(new Error("Turnstile did not load."));
		});
		if (!previous) {
			script.id = TURNSTILE_SCRIPT_ID;
			script.src =
				"https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
			document.head.appendChild(script);
		} else if (script.dataset.loaded === "true" || window.turnstile) {
			finish();
		}
	});
}

export function meta() {
	return [
		{ title: "Contact · Abhijith Ganesan" },
		{
			name: "description",
			content: "Send a message to Abhijith Ganesan.",
		},
	];
}

const fieldClassName =
	"mt-1 w-full rounded-md border border-[#2e2e2e] bg-[#141414] px-3 py-2 text-sm text-[#ffffff] outline-none focus:border-[#479ef5]";

export default function Contact() {
	const [name, setName] = useState("");
	const [email, setEmail] = useState("");
	const [message, setMessage] = useState("");
	const [company, setCompany] = useState("");
	const [status, setStatus] = useState<"idle" | "sending" | "sent" | "error">(
		"idle",
	);
	const [error, setError] = useState("");
	const widgetContainerRef = useRef<HTMLDivElement>(null);
	const widgetIdRef = useRef<string | null>(null);
	const tokenRef = useRef("");

	useEffect(() => {
		let removed = false;
		let widgetId: string | null = null;
		const container = widgetContainerRef.current;
		loadTurnstile()
			.then((turnstile) => {
				if (removed || !container) return;
				widgetId = turnstile.render(container, {
					sitekey: TURNSTILE_SITE_KEY,
					action: "contact",
					theme: "dark",
					callback: (token) => {
						tokenRef.current = token;
					},
					"expired-callback": () => {
						tokenRef.current = "";
					},
					"error-callback": () => {
						tokenRef.current = "";
					},
				});
				widgetIdRef.current = widgetId;
			})
			.catch(() => {
				if (!removed) {
					setError("The verification check could not be loaded.");
				}
			});
		return () => {
			removed = true;
			if (widgetId && window.turnstile) {
				window.turnstile.remove(widgetId);
			}
			widgetIdRef.current = null;
			tokenRef.current = "";
		};
	}, []);

	function resetTurnstile() {
		tokenRef.current = "";
		const widgetId = widgetIdRef.current;
		if (widgetId && window.turnstile) {
			window.turnstile.reset(widgetId);
		}
	}

	async function handleSubmit(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		setStatus("sending");
		setError("");
		const turnstileToken =
			tokenRef.current ||
			(widgetIdRef.current
				? window.turnstile?.getResponse(widgetIdRef.current) ?? ""
				: "");

		try {
			if (!turnstileToken) {
				setStatus("error");
				setError("Complete the verification check and try again.");
				return;
			}
			const response = await fetch("/api/contact", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name,
					email,
					message,
					company,
					"cf-turnstile-response": turnstileToken,
				}),
			});
			const body = (await response.json()) as { ok?: boolean; error?: string };
			if (!response.ok || !body.ok) {
				setStatus("error");
				setError(body.error || "The message could not be sent.");
				return;
			}
			setStatus("sent");
			setName("");
			setEmail("");
			setMessage("");
		} catch {
			setStatus("error");
			setError("The message could not be sent. Please try again later.");
		} finally {
			resetTurnstile();
		}
	}

	return (
		<LegalDocument title="Contact" dated={false}>
			<p>
				Send a message and it will be delivered by email. The address it goes
				to is not shown on this site.
			</p>
			{status === "sent" ? (
				<p className="text-[#ffffff]">Your message has been sent.</p>
			) : (
				<form className="relative space-y-4" onSubmit={handleSubmit} noValidate>
					<div className="absolute left-[-9999px] h-0 w-0 overflow-hidden" aria-hidden="true">
						<label htmlFor="company">Company</label>
						<input
							id="company"
							name="company"
							type="text"
							tabIndex={-1}
							autoComplete="off"
							value={company}
							onChange={(event) => setCompany(event.target.value)}
						/>
					</div>
					<div>
						<label htmlFor="name" className="text-xs text-[#adadad]">
							Name
						</label>
						<input
							id="name"
							name="name"
							type="text"
							required
							maxLength={100}
							autoComplete="name"
							value={name}
							onChange={(event) => setName(event.target.value)}
							className={fieldClassName}
						/>
					</div>
					<div>
						<label htmlFor="email" className="text-xs text-[#adadad]">
							Email
						</label>
						<input
							id="email"
							name="email"
							type="email"
							required
							maxLength={200}
							autoComplete="email"
							value={email}
							onChange={(event) => setEmail(event.target.value)}
							className={fieldClassName}
						/>
					</div>
					<div>
						<label htmlFor="message" className="text-xs text-[#adadad]">
							Message
						</label>
						<textarea
							id="message"
							name="message"
							required
							maxLength={4000}
							rows={7}
							value={message}
							onChange={(event) => setMessage(event.target.value)}
							className={fieldClassName}
						/>
					</div>
					<div ref={widgetContainerRef} />
					{status === "error" ? (
						<p className="text-sm text-[#f1707b]" role="alert">
							{error}
						</p>
					) : null}
					<button
						type="submit"
						disabled={status === "sending"}
						className="rounded-md bg-[#479ef5] px-4 py-2 text-sm font-semibold text-[#081018] hover:bg-[#62abf5] disabled:opacity-60"
					>
						{status === "sending" ? "Sending…" : "Send message"}
					</button>
				</form>
			)}
		</LegalDocument>
	);
}
