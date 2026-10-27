const COOLDOWN_SECONDS = 10 * 60;
const MAX_NAME = 100;
const MAX_EMAIL = 200;
const MAX_MESSAGE = 4000;
const CONTACT_ACTION = "contact";

function json(body: unknown, status = 200): Response {
	return Response.json(body, {
		status,
		headers: { "Cache-Control": "no-store" },
	});
}

function clean(value: unknown, max: number, keepNewlines = false): string {
	if (typeof value !== "string") {
		return "";
	}
	const stripped = keepNewlines
		? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
		: value.replace(/[\u0000-\u001F\u007F]/g, "");
	return stripped.trim().slice(0, max);
}

function isEmail(value: string): boolean {
	return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function turnstileHostnames(env: Env): Set<string> {
	return new Set(
		(env.TURNSTILE_HOSTNAMES ?? "")
			.split(",")
			.map((hostname) => hostname.trim())
			.filter(Boolean),
	);
}

function turnstileRejected(): Response {
	return json(
		{ error: "Complete the verification check and try again." },
		403,
	);
}

async function verifyTurnstile(
	request: Request,
	token: unknown,
	env: Env,
): Promise<Response | null> {
	const expectedHostnames = turnstileHostnames(env);
	if (
		typeof token !== "string" ||
		token.length === 0 ||
		token.length > 2048 ||
		expectedHostnames.size === 0 ||
		!env.TURNSTILE_SECRET
	) {
		return turnstileRejected();
	}

	const clientIp = request.headers.get("CF-Connecting-IP") ?? "";
	let result: { success?: boolean; action?: string; hostname?: string };
	try {
		const response = await fetch(
			"https://challenges.cloudflare.com/turnstile/v0/siteverify",
			{
				method: "POST",
				headers: { "Content-Type": "application/x-www-form-urlencoded" },
				signal: AbortSignal.timeout(10_000),
				body: new URLSearchParams({
					secret: env.TURNSTILE_SECRET,
					response: token,
					remoteip: clientIp,
				}),
			},
		);
		if (!response.ok) {
			return turnstileRejected();
		}
		result = (await response.json()) as {
			success?: boolean;
			action?: string;
			hostname?: string;
		};
	} catch {
		return turnstileRejected();
	}

	if (
		result.success !== true ||
		result.action !== CONTACT_ACTION ||
		typeof result.hostname !== "string" ||
		!expectedHostnames.has(result.hostname)
	) {
		return turnstileRejected();
	}
	return null;
}

async function sha256(value: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(value),
	);
	return [...new Uint8Array(digest)]
		.map((byte) => byte.toString(16).padStart(2, "0"))
		.join("");
}

export async function handleContactRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	if (request.method !== "POST") {
		return json({ error: "Method not allowed." }, 405);
	}

	if (!env.CONTACT_TO || !env.CONTACT_FROM) {
		return json({ error: "The contact form is not available yet." }, 503);
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		return json({ error: "The message could not be read." }, 400);
	}
	if (typeof body !== "object" || body === null) {
		return json({ error: "The message could not be read." }, 400);
	}

	const record = body as Record<string, unknown>;
	const denied = await verifyTurnstile(
		request,
		record["cf-turnstile-response"],
		env,
	);
	if (denied) {
		return denied;
	}
	if (typeof record.company === "string" && record.company.trim() !== "") {
		return json({ ok: true });
	}

	const name = clean(record.name, MAX_NAME);
	const email = clean(record.email, MAX_EMAIL);
	const message = clean(record.message, MAX_MESSAGE, true);
	if (!name || !email || !message) {
		return json({ error: "Name, email, and a message are required." }, 400);
	}
	if (!isEmail(email)) {
		return json({ error: "Enter a valid email address." }, 400);
	}

	const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
	const rateKey = `contact_rate_${await sha256(ip)}`;
	const recent = await env.FITBIT_KV.get(rateKey);
	if (recent) {
		return json(
			{ error: "Please wait a few minutes before sending another message." },
			429,
		);
	}

	try {
		await env.FITBIT_KV.put(rateKey, "1", { expirationTtl: COOLDOWN_SECONDS });
	} catch (error) {
		console.error("Contact rate limit was not saved", error);
		return json(
			{ error: "The message could not be sent. Please try again later." },
			503,
		);
	}

	try {
		await env.EMAIL.send({
			to: env.CONTACT_TO,
			from: env.CONTACT_FROM,
			replyTo: email,
			subject: `Website message from ${name}`,
			text: `Name: ${name}\nEmail: ${email}\n\n${message}`,
		});
	} catch (error) {
		console.error("Contact form send failed", error);
		try {
			await env.FITBIT_KV.delete(rateKey);
		} catch (deleteError) {
			console.error("Contact rate limit was not cleared", deleteError);
		}
		return json(
			{ error: "The message could not be sent. Please try again later." },
			502,
		);
	}

	return json({ ok: true });
}
