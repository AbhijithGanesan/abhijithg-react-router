/**
 * Cloudflare Worker — Google Health API v4 (`health.googleapis.com/v4`) OAuth 2.0
 * & Live Fitbit Air Telemetry
 *
 * Uses the Google Health API with the official `googlehealth.*` OAuth 2.0 scopes:
 * - https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly
 * - https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly
 * - https://www.googleapis.com/auth/googlehealth.sleep.readonly
 */

export interface FitbitLiveStats {
	steps: number | null;
	stepsGoal: number | null;
	restingHeartRate: number | null;
	/** London civil date (YYYY-MM-DD) of restingHeartRate, when that value exists. */
	restingHeartRateDate: string | null;
	/** True when today's resting heart rate is missing and an earlier day is shown. */
	restingHeartRateFromPreviousDay: boolean;
	latestHeartRateBpm?: number | null;
	latestHeartRateTime?: string | null;
	sleepScore: number | null;
	/** True when sleepScore was calculated here because Google did not send one. */
	sleepScoreEstimated: boolean;
	sleepDurationMinutes: number | null;
	sleepEfficiency?: number | null;
	sleepDeepMinutes?: number | null;
	sleepRemMinutes?: number | null;
	sleepLightMinutes?: number | null;
	sleepAwakeMinutes?: number | null;
	sleepInBedMinutes?: number | null;
	sleepRestlessnessPercent?: number | null;
	sleepShortAwakeningsCount?: number | null;
	sleepStartTime?: string | null;
	sleepEndTime?: string | null;
	breathingRate: number | null;
	breathingRateDeep?: number | null;
	breathingRateLight?: number | null;
	breathingRateRem?: number | null;
	breathingRateFull?: number | null;
	bloodOxygen: number | null;
	bloodOxygenMin?: number | null;
	bloodOxygenMax?: number | null;
	hrvRmssd: number | null;
	hrvDeepRmssd?: number | null;
	skinTempDeltaCelsius: number | null;
	skinTempNightlyCelsius?: number | null;
	skinTempBaselineCelsius?: number | null;
	totalCalories: number | null;
	activeCalories: number | null;
	lastSync: string;
	deviceLabel: string;
	apiSource: "google-health-api";
}

export interface FitbitLiveHeartRateResponse {
	ok: boolean;
	bpm: number | null;
	sampleTime: string | null;
	recentMinBpm: number | null;
	recentMaxBpm: number | null;
	fetchedAt: string;
	error?: string;
}

export interface FitbitApiResponse {
	authorized: boolean;
	configured: boolean;
	authUrl: string;
	apiNotice: string;
	stats: FitbitLiveStats | null;
	error?: string;
}

interface StoredOAuthTokens {
	access_token: string;
	refresh_token?: string;
	expires_at: number;
	scope: string;
	token_type: string;
	updated_at: string;
}

const KV_TOKEN_KEY = "google_health_oauth_tokens_v2";
// v4 has no step-goal field. The card uses the device default so the
// progress line can show a day that goes past 10,000. v9 replaces v8,
// which stored stepsGoal as null.
const DAILY_STEPS_GOAL = 10_000;
const KV_STATS_CACHE_KEY = "google_health_stats_cache_v9";
const PUBLIC_HEALTH_ERROR = "Google Health could not be read.";
const PUBLIC_LIVE_HEART_RATE_ERROR = "Live heart rate could not be read.";
const STATS_CACHE_TTL_SECONDS = 120; // Cache live telemetry for 2 minutes
const KV_LIVE_HR_CACHE_KEY = "google_health_live_hr_cache_v1";
const LIVE_HR_CACHE_FRESH_MS = 30_000; // Serve cached live heart rate for 30 seconds
// Heart rate is stored at 1-second resolution. A 15-minute window is at most
// 900 samples, under HEART_RATE_PAGE_SIZE, so one page contains the newest
// sample whether Google returns oldest-first or newest-first.
const HEART_RATE_LOOKBACK_MS = 15 * 60 * 1000;
const HEART_RATE_PAGE_SIZE = 1200;
const KV_MIN_EXPIRATION_TTL_SECONDS = 60; // Cloudflare KV rejects expirationTtl < 60
const OAUTH_STATE_COOKIE = "fitbit_oauth_state";

const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const GOOGLE_HEALTH_API_BASE =
	"https://health.googleapis.com/v4/users/me/dataTypes";

export const DEFAULT_SCOPES = [
	"https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
	"https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly",
	"https://www.googleapis.com/auth/googlehealth.sleep.readonly",
].join(" ");

// In-memory fallback store for local development if KV is not bound
const memoryStore = new Map<string, string>();

async function kvGet(env: Env, key: string): Promise<string | null> {
	if (env.FITBIT_KV) {
		return env.FITBIT_KV.get(key);
	}
	return memoryStore.get(key) ?? null;
}

async function kvPut(
	env: Env,
	key: string,
	value: string,
	expirationTtl?: number,
): Promise<void> {
	if (env.FITBIT_KV) {
		await env.FITBIT_KV.put(
			key,
			value,
			expirationTtl ? { expirationTtl } : undefined,
		);
		return;
	}
	memoryStore.set(key, value);
}

function statsSyncMs(raw: string | null): number {
	if (!raw) return 0;
	try {
		const parsed = Date.parse(JSON.parse(raw).lastSync);
		return Number.isFinite(parsed) ? parsed : 0;
	} catch {
		return 0;
	}
}

async function kvDelete(env: Env, key: string): Promise<void> {
	if (env.FITBIT_KV) {
		await env.FITBIT_KV.delete(key);
		return;
	}
	memoryStore.delete(key);
}

function getRedirectUri(request: Request, env: Env): string {
	if (env.OAUTH_REDIRECT_URI) {
		return env.OAUTH_REDIRECT_URI;
	}
	const url = new URL(request.url);
	return `${url.origin}/api/fitbit/callback`;
}

function isOAuthConfigured(env: Env): boolean {
	return Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
}

/**
 * Constant-time string comparison. Both inputs are SHA-256 hashed first so the
 * compared buffers are always 32 bytes, which avoids leaking the secret's
 * length, and the XOR-accumulate loop never exits early on a mismatch.
 */
async function timingSafeStringEqual(a: string, b: string): Promise<boolean> {
	const encoder = new TextEncoder();
	const [hashA, hashB] = await Promise.all([
		crypto.subtle.digest("SHA-256", encoder.encode(a)),
		crypto.subtle.digest("SHA-256", encoder.encode(b)),
	]);
	const bytesA = new Uint8Array(hashA);
	const bytesB = new Uint8Array(hashB);
	let diff = 0;
	for (let i = 0; i < bytesA.length; i++) {
		diff |= bytesA[i] ^ bytesB[i];
	}
	return diff === 0;
}

/**
 * Owner-only gate for the controls that change which account is connected
 * (connect, disconnect) or that bypass caching (force refresh).
 *
 * Accepts the `ADMIN_TOKEN` Worker secret via either an
 * `Authorization: Bearer <token>` header or a `?key=<token>` query parameter.
 * Fails closed: if `ADMIN_TOKEN` is not configured, nobody is treated as owner.
 */
async function isOwnerRequest(
	request: Request,
	url: URL,
	env: Env,
): Promise<boolean> {
	const expected = env.ADMIN_TOKEN;
	if (!expected) {
		console.warn(
			"ADMIN_TOKEN is not configured; owner-only Fitbit routes are disabled.",
		);
		return false;
	}

	const authHeader = request.headers.get("Authorization") ?? "";
	const bearerToken = authHeader.startsWith("Bearer ")
		? authHeader.slice("Bearer ".length).trim()
		: "";
	const provided = bearerToken || url.searchParams.get("key") || "";
	if (!provided) {
		return false;
	}
	return timingSafeStringEqual(provided, expected);
}

function forbiddenResponse(): Response {
	return Response.json(
		{
			error: "Forbidden",
			message: "This action is restricted to the site owner.",
		},
		{ status: 403, headers: { "Cache-Control": "no-store" } },
	);
}

function readCookie(request: Request, name: string): string | undefined {
	const cookieHeader = request.headers.get("Cookie") ?? "";
	for (const part of cookieHeader.split(";")) {
		const [rawKey, ...rawValue] = part.trim().split("=");
		if (rawKey === name) {
			return rawValue.join("=");
		}
	}
	return undefined;
}

interface CachedLiveHeartRate {
	payload: FitbitLiveHeartRateResponse;
	cachedAt: number;
}

// Per-isolate first-level cache so repeated polls served by the same isolate
// never touch KV or Google at all.
let liveHeartRateMemoryCache: CachedLiveHeartRate | null = null;

async function readLiveHeartRateCache(
	env: Env,
): Promise<FitbitLiveHeartRateResponse | null> {
	const now = Date.now();
	if (
		liveHeartRateMemoryCache &&
		now - liveHeartRateMemoryCache.cachedAt < LIVE_HR_CACHE_FRESH_MS
	) {
		return liveHeartRateMemoryCache.payload;
	}

	const raw = await kvGet(env, KV_LIVE_HR_CACHE_KEY).catch(() => null);
	if (!raw) {
		return null;
	}
	try {
		const cached = JSON.parse(raw) as CachedLiveHeartRate;
		if (now - cached.cachedAt < LIVE_HR_CACHE_FRESH_MS) {
			liveHeartRateMemoryCache = cached;
			return cached.payload;
		}
	} catch {
		// Ignore malformed cache entry
	}
	return null;
}

async function writeLiveHeartRateCache(
	env: Env,
	payload: FitbitLiveHeartRateResponse,
): Promise<void> {
	const entry: CachedLiveHeartRate = { payload, cachedAt: Date.now() };
	liveHeartRateMemoryCache = entry;
	try {
		await kvPut(
			env,
			KV_LIVE_HR_CACHE_KEY,
			JSON.stringify(entry),
			KV_MIN_EXPIRATION_TTL_SECONDS,
		);
	} catch (error) {
		// A failed cache write must never break the live response.
		console.warn("Failed to write live heart rate cache:", error);
	}
}

async function clearCachedTelemetry(env: Env): Promise<void> {
	liveHeartRateMemoryCache = null;
	await Promise.all([
		kvDelete(env, KV_STATS_CACHE_KEY),
		kvDelete(env, KV_LIVE_HR_CACHE_KEY),
	]);
}

/**
 * Refreshes an expired Google OAuth 2.0 access token using the stored refresh_token.
 */
async function refreshAccessToken(
	stored: StoredOAuthTokens,
	env: Env,
): Promise<StoredOAuthTokens> {
	if (!stored.refresh_token) {
		throw new Error(
			"Access token expired and no refresh_token is available. Please re-authorize.",
		);
	}
	if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
		throw new Error(
			"Missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET environment bindings.",
		);
	}

	const body = new URLSearchParams({
		client_id: env.GOOGLE_CLIENT_ID,
		client_secret: env.GOOGLE_CLIENT_SECRET,
		refresh_token: stored.refresh_token,
		grant_type: "refresh_token",
	});

	const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
		method: "POST",
		headers: {
			"Content-Type": "application/x-www-form-urlencoded",
			Accept: "application/json",
		},
		body: body.toString(),
	});

	if (!response.ok) {
		const errText = await response.text();
		console.error(
			`Google OAuth token refresh failed (${response.status})`,
			errText,
		);
		throw new Error(PUBLIC_HEALTH_ERROR);
	}

	const data = (await response.json()) as {
		access_token: string;
		expires_in?: number;
		scope?: string;
		token_type?: string;
		refresh_token?: string;
	};

	const updated: StoredOAuthTokens = {
		access_token: data.access_token,
		refresh_token: data.refresh_token ?? stored.refresh_token,
		expires_at: Date.now() + (data.expires_in ?? 3600) * 1000,
		scope: data.scope ?? stored.scope,
		token_type: data.token_type ?? stored.token_type,
		updated_at: new Date().toISOString(),
	};

	await kvPut(env, KV_TOKEN_KEY, JSON.stringify(updated));
	return updated;
}

/**
 * Computes the start of the current day in Europe/London in epoch milliseconds
 * and returns civil date components for Google Health API v4 filters & rollups.
 */
export function getLondonTimeWindows(now = new Date()) {
	const extractParts = (d: Date) => {
		const parts = new Intl.DateTimeFormat("en-GB", {
			timeZone: "Europe/London",
			year: "numeric",
			month: "2-digit",
			day: "2-digit",
			hour: "2-digit",
			minute: "2-digit",
			second: "2-digit",
			// h23 keeps midnight at 00:00 on the new civil date. hour12:false can
			// format that instant as 24:00 on the previous date.
			hourCycle: "h23",
		}).formatToParts(d);
		const getPart = (type: string) =>
			parts.find((p) => p.type === type)?.value ?? "00";
		const parsed = {
			year: Number(getPart("year")),
			month: Number(getPart("month")),
			day: Number(getPart("day")),
			hours: Number(getPart("hour")),
			minutes: Number(getPart("minute")),
			seconds: Number(getPart("second")),
		};
		if (parsed.hours === 24) {
			parsed.hours = 0;
			const rolled = new Date(
				Date.UTC(parsed.year, parsed.month - 1, parsed.day),
			);
			rolled.setUTCDate(rolled.getUTCDate() + 1);
			parsed.year = rolled.getUTCFullYear();
			parsed.month = rolled.getUTCMonth() + 1;
			parsed.day = rolled.getUTCDate();
		}
		return parsed;
	};

	const today = extractParts(now);

	// Include milliseconds so startOfTodayIso is exact to .000Z (includes 00:00:00 bucket)
	const elapsedTodayMs =
		((today.hours * 60 + today.minutes) * 60 + today.seconds) * 1000 +
		now.getMilliseconds();
	const startOfTodayMs = now.getTime() - elapsedTodayMs;
	const startOfTodayIso = new Date(startOfTodayMs).toISOString();

	const yesterdayDate = extractParts(
		new Date(startOfTodayMs - 12 * 60 * 60 * 1000),
	);
	const tomorrowDate = extractParts(
		new Date(startOfTodayMs + 36 * 60 * 60 * 1000),
	);

	// 72-hour lookback ISO timestamp for sleep sessions
	const sleepLookbackIso = new Date(
		now.getTime() - 72 * 60 * 60 * 1000,
	).toISOString();
	const heartRateLookbackIso = new Date(
		now.getTime() - HEART_RATE_LOOKBACK_MS,
	).toISOString();
	// Eight days before local midnight, used as an inclusive daily-metric filter start.
	const lookbackDate = extractParts(
		new Date(startOfTodayMs - 8 * 24 * 60 * 60 * 1000),
	);

	return {
		startOfTodayIso,
		londonHour: today.hours,
		todayCivilDate: {
			year: today.year,
			month: today.month,
			day: today.day,
		},
		yesterdayCivilDate: {
			year: yesterdayDate.year,
			month: yesterdayDate.month,
			day: yesterdayDate.day,
		},
		tomorrowCivilDate: {
			year: tomorrowDate.year,
			month: tomorrowDate.month,
			day: tomorrowDate.day,
		},
		lookbackCivilDate: {
			year: lookbackDate.year,
			month: lookbackDate.month,
			day: lookbackDate.day,
		},
		sleepLookbackIso,
		heartRateLookbackIso,
	};
}

interface CivilDate {
	year?: number;
	month?: number;
	day?: number;
}

interface GoogleHealthInterval {
	startTime?: string;
	endTime?: string;
	civilStartTime?: {
		date?: CivilDate;
	};
	civilEndTime?: {
		date?: CivilDate;
	};
}

interface GoogleHealthDataPoint {
	interval?: GoogleHealthInterval;
	steps?: {
		count?: number | string;
		countSum?: number | string;
		interval?: GoogleHealthInterval;
	};
	activeZoneMinutes?: {
		count?: number | string;
		countSum?: number | string;
		totalMinutes?: number | string;
		activeZoneMinutes?: number | string;
		interval?: GoogleHealthInterval;
	};
	dailyRestingHeartRate?: {
		restingHeartRateBpm?: number | string;
		beatsPerMinute?: number | string;
		date?: CivilDate | string;
	};
	dailyHeartRateVariability?: {
		date?: CivilDate;
		averageHeartRateVariabilityMilliseconds?: number | string;
		deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds?: number | string;
		nonRemHeartRateBeatsPerMinute?: number | string;
		entropy?: number | string;
	};
	dailyRespiratoryRate?: {
		date?: CivilDate;
		breathsPerMinute?: number | string;
	};
	respiratoryRateSleepSummary?: {
		sampleTime?: {
			physicalTime?: string;
		};
		deepSleepStats?: {
			breathsPerMinute?: number | string;
		};
		lightSleepStats?: {
			breathsPerMinute?: number | string;
		};
		remSleepStats?: {
			breathsPerMinute?: number | string;
		};
		fullSleepStats?: {
			breathsPerMinute?: number | string;
		};
	};
	dailyOxygenSaturation?: {
		date?: CivilDate;
		averagePercentage?: number | string;
		lowerBoundPercentage?: number | string;
		upperBoundPercentage?: number | string;
		standardDeviationPercentage?: number | string;
	};
	dailySleepTemperatureDerivations?: {
		date?: CivilDate;
		nightlyTemperatureCelsius?: number | string;
		baselineTemperatureCelsius?: number | string;
		relativeNightlyStddev30dCelsius?: number | string;
	};
	heartRate?: {
		beatsPerMinute?: number | string;
		sampleTime?: {
			physicalTime?: string;
		};
	};
	sleep?: {
		interval?: GoogleHealthInterval;
		sleepScore?: number | string;
		metadata?: {
			mainSleep?: boolean;
			nap?: boolean;
			processed?: boolean;
		};
		summary?: {
			minutesInSleepPeriod?: number | string;
			minutesAsleep?: number | string;
			minutesAwake?: number | string;
			stagesSummary?: Array<{
				type?: string;
				minutes?: number | string;
				count?: number | string;
			}>;
		};
		stages?: Array<{
			startTime?: string;
			endTime?: string;
			type?: string;
		}>;
		shortAwakenings?: Array<{
			startTime?: string;
			endTime?: string;
			type?: string;
		}>;
	};
}

interface GoogleHealthListResponse {
	reconciledDataPoints?: GoogleHealthDataPoint[];
	dataPoints?: GoogleHealthDataPoint[];
	nextPageToken?: string;
}

interface GoogleHealthRollUpPoint {
	civilStartTime?: {
		date?: CivilDate;
	};
	civilEndTime?: {
		date?: CivilDate;
	};
	steps?: {
		countSum?: number | string;
	};
	totalCalories?: {
		kcalSum?: number | string;
	};
	activeEnergyBurned?: {
		kcalSum?: number | string;
	};
}

interface GoogleHealthRollUpResponse {
	rollupDataPoints?: GoogleHealthRollUpPoint[];
}

function parseCivilDate(
	value: CivilDate | string | undefined,
): { year: number; month: number; day: number } | null {
	if (!value) return null;
	if (typeof value === "string") {
		const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
		if (!match) return null;
		return {
			year: Number(match[1]),
			month: Number(match[2]),
			day: Number(match[3]),
		};
	}
	const year = Number(value.year);
	const month = Number(value.month);
	const day = Number(value.day);
	if (
		!Number.isInteger(year) ||
		!Number.isInteger(month) ||
		!Number.isInteger(day) ||
		year < 1970 ||
		month < 1 ||
		month > 12 ||
		day < 1 ||
		day > 31
	) {
		return null;
	}
	return { year, month, day };
}

export function matchesCivilDate(
	pointDate: CivilDate | string | undefined,
	target: { year: number; month: number; day: number },
): boolean {
	// A missing date used to match every target, so the first rollup row
	// (often yesterday) was shown as today.
	const parsed = parseCivilDate(pointDate);
	if (!parsed) return false;
	return (
		parsed.year === target.year &&
		parsed.month === target.month &&
		parsed.day === target.day
	);
}

function formatCivilDate(date: {
	year: number;
	month: number;
	day: number;
}): string {
	return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function dailyDateFilter(
	field: string,
	start: { year: number; month: number; day: number },
	endExclusive: { year: number; month: number; day: number },
): string {
	return `${field} >= "${formatCivilDate(start)}" AND ${field} < "${formatCivilDate(endExclusive)}"`;
}

function timestampMs(value: string | undefined): number | null {
	if (!value) return null;
	const ms = Date.parse(value);
	return Number.isFinite(ms) ? ms : null;
}

function pointRecencyMs(point: GoogleHealthDataPoint): number | null {
	const sampleMs =
		timestampMs(point.heartRate?.sampleTime?.physicalTime) ??
		timestampMs(point.respiratoryRateSleepSummary?.sampleTime?.physicalTime);
	if (sampleMs !== null) return sampleMs;

	if (point.sleep) {
		const sleepMs =
			timestampMs(point.sleep.interval?.endTime) ??
			timestampMs(point.sleep.interval?.startTime) ??
			timestampMs(point.interval?.endTime) ??
			timestampMs(point.interval?.startTime);
		if (sleepMs !== null) return sleepMs;
	}

	const civil = parseCivilDate(
		point.dailyRestingHeartRate?.date ??
			point.dailyHeartRateVariability?.date ??
			point.dailyRespiratoryRate?.date ??
			point.dailyOxygenSaturation?.date ??
			point.dailySleepTemperatureDerivations?.date,
	);
	if (civil) return Date.UTC(civil.year, civil.month - 1, civil.day);

	const intervalMs =
		timestampMs(point.interval?.endTime) ??
		timestampMs(point.interval?.startTime);
	if (intervalMs !== null) return intervalMs;

	const intervalDate = parseCivilDate(point.interval?.civilStartTime?.date);
	return intervalDate
		? Date.UTC(intervalDate.year, intervalDate.month - 1, intervalDate.day)
		: null;
}

/** Dated points only, newest first. Undated rows are dropped so array order cannot win. */
export function pointsNewestFirst(
	points: GoogleHealthDataPoint[],
): GoogleHealthDataPoint[] {
	return points
		.map((point) => ({ point, ms: pointRecencyMs(point) }))
		.filter((entry): entry is { point: GoogleHealthDataPoint; ms: number } =>
			entry.ms !== null,
		)
		.sort((a, b) => b.ms - a.ms)
		.map((entry) => entry.point);
}

function pickDailyRestingHeartRate(
	points: GoogleHealthDataPoint[],
	today: { year: number; month: number; day: number },
): {
	bpm: number | null;
	date: string | null;
	fromPreviousDay: boolean;
} {
	const todayKey = formatCivilDate(today);
	let previous: { bpm: number; date: string } | null = null;

	for (const point of pointsNewestFirst(points)) {
		const bpm = Number(
			point.dailyRestingHeartRate?.beatsPerMinute ??
				point.dailyRestingHeartRate?.restingHeartRateBpm ??
				NaN,
		);
		if (!Number.isFinite(bpm) || bpm <= 30 || bpm >= 220) continue;
		const civil = parseCivilDate(point.dailyRestingHeartRate?.date);
		if (!civil) continue;
		const date = formatCivilDate(civil);
		const rounded = Math.round(bpm);
		if (date === todayKey) {
			return { bpm: rounded, date, fromPreviousDay: false };
		}
		if (!previous && date < todayKey) {
			previous = { bpm: rounded, date };
		}
	}

	if (previous) {
		return { bpm: previous.bpm, date: previous.date, fromPreviousDay: true };
	}
	return { bpm: null, date: null, fromPreviousDay: false };
}

export function summarizeHeartRateSamples(points: GoogleHealthDataPoint[]): {
	latestBpm: number | null;
	latestTime: string | null;
	minBpm: number | null;
	maxBpm: number | null;
} {
	let latestBpm: number | null = null;
	let latestTime: string | null = null;
	let latestMs = -Infinity;
	let minBpm: number | null = null;
	let maxBpm: number | null = null;

	for (const point of points) {
		const sampleTime = point.heartRate?.sampleTime?.physicalTime;
		const ms = timestampMs(sampleTime);
		if (ms === null) continue;
		const bpm = Number(point.heartRate?.beatsPerMinute ?? NaN);
		if (!Number.isFinite(bpm) || bpm <= 30 || bpm >= 240) continue;
		const rounded = Math.round(bpm);
		minBpm = minBpm === null ? rounded : Math.min(minBpm, rounded);
		maxBpm = maxBpm === null ? rounded : Math.max(maxBpm, rounded);
		if (ms < latestMs) continue;
		latestMs = ms;
		latestBpm = rounded;
		latestTime = sampleTime ?? null;
	}

	return { latestBpm, latestTime, minBpm, maxBpm };
}

/**
 * Calls `POST /v4/users/me/dataTypes/{dataType}/dataPoints:dailyRollUp` to get
 * server-aggregated daily totals (such as `total-calories`, `active-energy-burned`,
 * and `steps`) over civil calendar days.
 */
interface SeriesResult<T> {
	points: T[];
	ok: boolean;
	status: number;
	errorText?: string;
}

function seriesSucceeded(status: number): boolean {
	return status >= 200 && status < 300;
}

async function queryGoogleHealthDailyRollUp(
	accessToken: string,
	dataType: string,
	startDate: { year: number; month: number; day: number },
	endDate: { year: number; month: number; day: number },
): Promise<SeriesResult<GoogleHealthRollUpPoint>> {
	try {
		const res = await fetch(
			`${GOOGLE_HEALTH_API_BASE}/${dataType}/dataPoints:dailyRollUp`,
			{
				method: "POST",
				headers: {
					Authorization: `Bearer ${accessToken}`,
					"Content-Type": "application/json",
					Accept: "application/json",
				},
				body: JSON.stringify({
					range: {
						start: {
							date: startDate,
							time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
						},
						end: {
							date: endDate,
							time: { hours: 0, minutes: 0, seconds: 0, nanos: 0 },
						},
					},
					windowSizeDays: 1,
				}),
			},
		);

		if (!res.ok) {
			const errorText = await res.text().catch(() => "");
			return { points: [], ok: false, status: res.status, errorText };
		}

		const data = (await res.json()) as GoogleHealthRollUpResponse;
		return {
			points: data.rollupDataPoints ?? [],
			ok: true,
			status: res.status,
		};
	} catch (error) {
		console.error(`Google Health daily rollup ${dataType} request failed`, error);
		return { points: [], ok: false, status: 0 };
	}
}

interface GoogleHealthQueryOptions {
	filter?: string;
	pageSize?: number;
	/** Extra pages after the first. Filtered windows fit in one page, so this stays 1. */
	maxPages?: number;
}

/**
 * Queries a Google Health API v4 dataType (`:reconcile`, then `/dataPoints`
 * if reconcile is unsupported). Callers pass a date filter and a page size
 * that holds that window, so a refresh does not walk nextPageToken.
 */
async function queryGoogleHealthDataType(
	accessToken: string,
	dataType: string,
	options?: GoogleHealthQueryOptions,
): Promise<{
	points: GoogleHealthDataPoint[];
	status: number;
	errorText?: string;
}> {
	const headers = {
		Authorization: `Bearer ${accessToken}`,
		Accept: "application/json",
	};
	const maxPages = options?.maxPages ?? 1;

	const fetchPage = async (endpointSuffix: string) => {
		const collected: GoogleHealthDataPoint[] = [];
		let pageToken = "";
		let lastStatus = 200;
		let lastErrorText: string | undefined;

		for (let page = 0; page < maxPages; page++) {
			const params = new URLSearchParams();
			if (options?.pageSize) {
				params.set("pageSize", String(options.pageSize));
			}
			if (options?.filter) {
				params.set("filter", options.filter);
			}
			if (pageToken) {
				params.set("pageToken", pageToken);
			}

			const queryString = params.toString();
			const url = `${GOOGLE_HEALTH_API_BASE}/${dataType}/${endpointSuffix}${queryString ? `?${queryString}` : ""}`;
			const res = await fetch(url, { headers });
			lastStatus = res.status;

			if (!res.ok) {
				lastErrorText = await res.text().catch(() => "");
				break;
			}

			const data = (await res.json()) as GoogleHealthListResponse;
			const pagePoints = data.dataPoints ?? data.reconciledDataPoints ?? [];
			collected.push(...pagePoints);

			if (!data.nextPageToken || pagePoints.length === 0) {
				break;
			}
			pageToken = data.nextPageToken;
		}

		return { points: collected, status: lastStatus, errorText: lastErrorText };
	};

	const reconcileResult = await fetchPage("dataPoints:reconcile");
	if (reconcileResult.status >= 200 && reconcileResult.status < 300) {
		return reconcileResult;
	}

	return fetchPage("dataPoints");
}

/**
 * Fetches today's steps, total & active calories, resting heart rate, sleep
 * (with stage breakdown & efficiency), breathing rate (with stage breakdown),
 * blood oxygen (SpO2), heart rate variability (HRV), and nightly skin
 * temperature variation from the Google Health API v4 (`https://health.googleapis.com/v4`).
 */
export async function fetchGoogleHealthTelemetry(
	accessToken: string,
	now = new Date(),
): Promise<{ stats: FitbitLiveStats; cacheable: boolean }> {
	const {
		londonHour,
		todayCivilDate,
		yesterdayCivilDate,
		tomorrowCivilDate,
		lookbackCivilDate,
		sleepLookbackIso,
		heartRateLookbackIso,
	} = getLondonTimeWindows(now);
	const dailyFilter = (field: string) =>
		dailyDateFilter(field, lookbackCivilDate, tomorrowCivilDate);
	const heartRateFilter = `heart_rate.sample_time.physical_time >= "${heartRateLookbackIso}"`;

	const [
		stepsRollup,
		totalCaloriesRollup,
		activeCaloriesRollup,
		rhrResult,
		hrSamplesResult,
		sleepResult,
		hrvResult,
		respResult,
		respSummaryResult,
		spo2Result,
		skinTempResult,
	] = await Promise.all([
		// 1. Daily Steps RollUp (googlehealth.activity_and_fitness.readonly)
		queryGoogleHealthDailyRollUp(
			accessToken,
			"steps",
			yesterdayCivilDate,
			tomorrowCivilDate,
		),
		// 2. Daily Total Calories RollUp (BMR + activity, googlehealth.activity_and_fitness.readonly)
		queryGoogleHealthDailyRollUp(
			accessToken,
			"total-calories",
			yesterdayCivilDate,
			tomorrowCivilDate,
		),
		// 3. Daily Active Energy Burned RollUp (googlehealth.activity_and_fitness.readonly)
		queryGoogleHealthDailyRollUp(
			accessToken,
			"active-energy-burned",
			yesterdayCivilDate,
			tomorrowCivilDate,
		),
		// 4. Daily Resting Heart Rate (googlehealth.health_metrics_and_measurements.readonly)
		queryGoogleHealthDataType(accessToken, "daily-resting-heart-rate", {
			filter: dailyFilter("daily_resting_heart_rate.date"),
			pageSize: 14,
		}),
		// 5. Recent heart-rate samples. One page covers the whole lookback window.
		queryGoogleHealthDataType(accessToken, "heart-rate", {
			filter: heartRateFilter,
			pageSize: HEART_RATE_PAGE_SIZE,
		}),
		// 6. Sleep Sessions (googlehealth.sleep.readonly). Page size is capped at 25.
		queryGoogleHealthDataType(accessToken, "sleep", {
			filter: `sleep.interval.end_time >= "${sleepLookbackIso}"`,
			pageSize: 25,
		}),
		// 7. Daily Heart Rate Variability (googlehealth.health_metrics_and_measurements.readonly)
		queryGoogleHealthDataType(accessToken, "daily-heart-rate-variability", {
			filter: dailyFilter("daily_heart_rate_variability.date"),
			pageSize: 14,
		}),
		// 8. Daily Respiratory / Breathing Rate (googlehealth.health_metrics_and_measurements.readonly)
		queryGoogleHealthDataType(accessToken, "daily-respiratory-rate", {
			filter: dailyFilter("daily_respiratory_rate.date"),
			pageSize: 14,
		}),
		// 9. Stage-specific Respiratory Rate Sleep Summary (sample, not daily)
		queryGoogleHealthDataType(accessToken, "respiratory-rate-sleep-summary", {
			filter: `respiratory_rate_sleep_summary.sample_time.physical_time >= "${sleepLookbackIso}"`,
			pageSize: 20,
		}),
		// 10. Daily Oxygen Saturation / SpO2 (googlehealth.health_metrics_and_measurements.readonly)
		queryGoogleHealthDataType(accessToken, "daily-oxygen-saturation", {
			filter: dailyFilter("daily_oxygen_saturation.date"),
			pageSize: 14,
		}),
		// 11. Daily Sleep Skin Temperature Derivations (googlehealth.health_metrics_and_measurements.readonly)
		queryGoogleHealthDataType(
			accessToken,
			"daily-sleep-temperature-derivations",
			{
				filter: dailyFilter("daily_sleep_temperature_derivations.date"),
				pageSize: 14,
			},
		),
	]);

	const series = [
		["steps", stepsRollup],
		["total calories", totalCaloriesRollup],
		["active calories", activeCaloriesRollup],
		["resting heart rate", rhrResult],
		["heart rate", hrSamplesResult],
		["sleep", sleepResult],
		["heart rate variability", hrvResult],
		["breathing rate", respResult],
		["breathing rate stages", respSummaryResult],
		["blood oxygen", spo2Result],
		["skin temperature", skinTempResult],
	] as const;
	for (const [name, result] of series) {
		if (seriesSucceeded(result.status)) continue;
		console.error(
			`Google Health ${name} failed (${result.status})`,
			result.errorText ?? "",
		);
	}

	// A rejected token should not be cached as an empty day.
	if (rhrResult.status === 401 || rhrResult.status === 403) {
		throw new Error(PUBLIC_HEALTH_ERROR);
	}

	// Determine the active civil date for daily activity counters (steps, totalCalories, activeCalories).
	// Between 00:00 and 03:59 London time, if no steps have been synced for the new calendar day yet,
	// keep displaying the completed day's totals so late-night checks don't reset to BMR-only at midnight.
	const todayStepsEntry = stepsRollup.ok
		? stepsRollup.points.find((p) =>
				matchesCivilDate(p.civilStartTime?.date, todayCivilDate),
			)
		: undefined;
	const todayStepsCount = Number(todayStepsEntry?.steps?.countSum ?? 0);
	const activeActivityDate =
		!stepsRollup.ok || todayStepsCount > 0 || londonHour >= 4
			? todayCivilDate
			: yesterdayCivilDate;

	// 1. Extract Steps for the active day. A failed rollup stays missing rather than zero.
	let steps: number | null = null;
	if (stepsRollup.ok) {
		const matchedStepsRollup = stepsRollup.points.find((p) =>
			matchesCivilDate(p.civilStartTime?.date, activeActivityDate),
		);
		const count = Number(matchedStepsRollup?.steps?.countSum ?? 0);
		steps = Number.isFinite(count) && count >= 0 ? Math.round(count) : null;
	}

	// 2. Extract Total Calories & Active Energy Burned for the active day
	let totalCalories: number | null = null;
	if (totalCaloriesRollup.ok) {
		const matchedTotalCalories = totalCaloriesRollup.points.find((p) =>
			matchesCivilDate(p.civilStartTime?.date, activeActivityDate),
		);
		const rawTotalKcal = Number(
			matchedTotalCalories?.totalCalories?.kcalSum ?? 0,
		);
		if (Number.isFinite(rawTotalKcal) && rawTotalKcal > 0) {
			totalCalories = Math.round(rawTotalKcal);
		}
	}

	let activeCalories: number | null = null;
	if (activeCaloriesRollup.ok) {
		const matchedActiveCalories = activeCaloriesRollup.points.find((p) =>
			matchesCivilDate(p.civilStartTime?.date, activeActivityDate),
		);
		const rawActiveKcal = Number(
			matchedActiveCalories?.activeEnergyBurned?.kcalSum ?? 0,
		);
		if (Number.isFinite(rawActiveKcal) && rawActiveKcal >= 0) {
			activeCalories = Math.round(rawActiveKcal);
		}
	}

	// 3. Today's resting heart rate, or the newest earlier civil day.
	const restingHeartRatePick = seriesSucceeded(rhrResult.status)
		? pickDailyRestingHeartRate(rhrResult.points, todayCivilDate)
		: { bpm: null, date: null, fromPreviousDay: false };
	const restingHeartRate = restingHeartRatePick.bpm;

	const heartRateSummary = seriesSucceeded(hrSamplesResult.status)
		? summarizeHeartRateSamples(hrSamplesResult.points)
		: {
				latestBpm: null,
				latestTime: null,
				minBpm: null,
				maxBpm: null,
			};
	const latestHeartRateBpm = heartRateSummary.latestBpm;
	const latestHeartRateTime = heartRateSummary.latestTime;

	// 4. Extract latest Daily Heart Rate Variability (RMSSD ms & non-REM sleeping HR)
	let hrvRmssd: number | null = null;
	let hrvDeepRmssd: number | null = null;
	let nonRemHeartRate: number | null = null;

	for (const point of pointsNewestFirst(hrvResult.points)) {
		const hrv = point.dailyHeartRateVariability;
		if (!hrv) continue;
		const avgRmssd = Number(hrv.averageHeartRateVariabilityMilliseconds ?? 0);
		if (Number.isFinite(avgRmssd) && avgRmssd > 0) {
			hrvRmssd = Math.round(avgRmssd * 10) / 10;
			const deepRmssd = Number(
				hrv.deepSleepRootMeanSquareOfSuccessiveDifferencesMilliseconds ?? 0,
			);
			if (Number.isFinite(deepRmssd) && deepRmssd > 0) {
				hrvDeepRmssd = Math.round(deepRmssd * 10) / 10;
			}
			const nonRemBpm = Number(hrv.nonRemHeartRateBeatsPerMinute ?? 0);
			if (Number.isFinite(nonRemBpm) && nonRemBpm > 30 && nonRemBpm < 220) {
				nonRemHeartRate = nonRemBpm;
			}
			break;
		}
	}

	// 5. Extract latest Daily Respiratory / Breathing Rate & Stage-Specific Breakdown
	let breathingRate: number | null = null;
	for (const point of pointsNewestFirst(respResult.points)) {
		const brpm = Number(point.dailyRespiratoryRate?.breathsPerMinute ?? 0);
		if (Number.isFinite(brpm) && brpm > 5 && brpm < 60) {
			breathingRate = Math.round(brpm * 10) / 10;
			break;
		}
	}

	let breathingRateDeep: number | null = null;
	let breathingRateLight: number | null = null;
	let breathingRateRem: number | null = null;
	let breathingRateFull: number | null = null;

	for (const point of pointsNewestFirst(respSummaryResult.points)) {
		const summary = point.respiratoryRateSleepSummary;
		if (!summary) continue;
		const deep = Number(summary.deepSleepStats?.breathsPerMinute ?? 0);
		const light = Number(summary.lightSleepStats?.breathsPerMinute ?? 0);
		const rem = Number(summary.remSleepStats?.breathsPerMinute ?? 0);
		const full = Number(summary.fullSleepStats?.breathsPerMinute ?? 0);

		if (deep > 5 || light > 5 || rem > 5 || full > 5) {
			if (deep > 5) breathingRateDeep = Math.round(deep * 10) / 10;
			if (light > 5) breathingRateLight = Math.round(light * 10) / 10;
			if (rem > 5) breathingRateRem = Math.round(rem * 10) / 10;
			if (full > 5) breathingRateFull = Math.round(full * 10) / 10;
			if (breathingRate === null && breathingRateFull !== null) {
				breathingRate = breathingRateFull;
			}
			break;
		}
	}

	// 6. Extract latest Daily Blood Oxygen Saturation (SpO2 %)
	let bloodOxygen: number | null = null;
	let bloodOxygenMin: number | null = null;
	let bloodOxygenMax: number | null = null;
	for (const point of pointsNewestFirst(spo2Result.points)) {
		const spo2 = point.dailyOxygenSaturation;
		if (!spo2) continue;
		const avg = Number(spo2.averagePercentage ?? 0);
		if (Number.isFinite(avg) && avg > 50 && avg <= 100) {
			bloodOxygen = Math.round(avg * 10) / 10;
			const lower = Number(spo2.lowerBoundPercentage ?? 0);
			const upper = Number(spo2.upperBoundPercentage ?? 0);
			if (Number.isFinite(lower) && lower > 50) {
				bloodOxygenMin = Math.round(lower * 10) / 10;
			}
			if (Number.isFinite(upper) && upper > 50) {
				bloodOxygenMax = Math.round(upper * 10) / 10;
			}
			break;
		}
	}

	// 7. Extract latest Nightly Skin Temperature Variation (°C delta from personal baseline)
	let skinTempDeltaCelsius: number | null = null;
	let skinTempNightlyCelsius: number | null = null;
	let skinTempBaselineCelsius: number | null = null;
	for (const point of pointsNewestFirst(skinTempResult.points)) {
		const temp = point.dailySleepTemperatureDerivations;
		if (!temp) continue;
		const nightly = Number(temp.nightlyTemperatureCelsius ?? 0);
		const baseline = Number(temp.baselineTemperatureCelsius ?? 0);
		if (
			Number.isFinite(nightly) &&
			nightly > 20 &&
			Number.isFinite(baseline) &&
			baseline > 20
		) {
			skinTempNightlyCelsius = Math.round(nightly * 10) / 10;
			skinTempBaselineCelsius = Math.round(baseline * 10) / 10;
			skinTempDeltaCelsius = Math.round((nightly - baseline) * 100) / 100;
			break;
		}
	}

	// 8. Parse latest Sleep session duration, stage breakdown, efficiency & 3-part Fitbit Sleep Score
	let sleepDurationMinutes: number | null = null;
	let sleepEfficiency: number | null = null;
	let sleepDeepMinutes: number | null = null;
	let sleepRemMinutes: number | null = null;
	let sleepLightMinutes: number | null = null;
	let sleepAwakeMinutes: number | null = null;
	let sleepInBedMinutes: number | null = null;
	let sleepRestlessnessPercent: number | null = null;
	let sleepShortAwakeningsCount: number | null = null;
	let sleepStartTime: string | null = null;
	let sleepEndTime: string | null = null;
	let sleepScore: number | null = null;
	let sleepScoreEstimated = false;

	const sleepPoints = pointsNewestFirst(sleepResult.points);
	if (sleepPoints.length > 0) {
		const latestPoint =
			sleepPoints.find((p) => p.sleep?.metadata?.mainSleep === true) ??
			sleepPoints[0];
		const sleepObj = latestPoint.sleep;

		const summaryAsleep = Number(sleepObj?.summary?.minutesAsleep ?? 0);
		const summaryInBed = Number(sleepObj?.summary?.minutesInSleepPeriod ?? 0);
		const summaryAwake = Number(sleepObj?.summary?.minutesAwake ?? 0);
		const shortAwakeningsCount = sleepObj?.shortAwakenings?.length ?? 0;

		let deepMins = 0;
		let remMins = 0;
		let lightMins = 0;
		let awakeStageMins = 0;
		for (const st of sleepObj?.summary?.stagesSummary ?? []) {
			const type = (st.type ?? "").toUpperCase();
			const mins = Number(st.minutes ?? 0);
			if (!Number.isFinite(mins) || mins <= 0) continue;
			if (type === "DEEP") deepMins += mins;
			if (type === "REM") remMins += mins;
			if (type === "LIGHT") lightMins += mins;
			if (type === "AWAKE") awakeStageMins += mins;
		}

		const stages = sleepObj?.stages ?? [];
		let stageAsleepMs = 0;
		let restorativeMs = 0;

		for (const stage of stages) {
			if (!stage.startTime || !stage.endTime) continue;
			const dur =
				new Date(stage.endTime).getTime() -
				new Date(stage.startTime).getTime();
			if (dur <= 0) continue;

			const stageType = (stage.type ?? "").toUpperCase();
			if (stageType !== "AWAKE" && stageType !== "OUT_OF_BED") {
				stageAsleepMs += dur;
			}
			if (stageType === "DEEP" || stageType === "REM") {
				restorativeMs += dur;
			}
		}

		const interval = sleepObj?.interval ?? latestPoint.interval;
		if (interval?.startTime) sleepStartTime = interval.startTime;
		if (interval?.endTime) sleepEndTime = interval.endTime;

		if (summaryAsleep > 0) {
			sleepDurationMinutes = Math.round(summaryAsleep);
		} else if (stageAsleepMs > 0) {
			sleepDurationMinutes = Math.round(stageAsleepMs / 60_000);
		} else if (interval?.startTime && interval?.endTime) {
			const diffMs =
				new Date(interval.endTime).getTime() -
				new Date(interval.startTime).getTime();
			if (diffMs > 0) {
				sleepDurationMinutes = Math.round(diffMs / 60_000);
			}
		}

		if (deepMins > 0 || remMins > 0) {
			sleepDeepMinutes = Math.round(deepMins);
			sleepRemMinutes = Math.round(remMins);
		}
		if (lightMins > 0) {
			sleepLightMinutes = Math.round(lightMins);
		}
		const resolvedAwakeMins = summaryAwake > 0 ? summaryAwake : awakeStageMins;
		if (resolvedAwakeMins > 0) {
			sleepAwakeMinutes = Math.round(resolvedAwakeMins);
		}
		if (summaryInBed > 0) {
			sleepInBedMinutes = Math.round(summaryInBed);
		}
		if (shortAwakeningsCount > 0) {
			sleepShortAwakeningsCount = shortAwakeningsCount;
		}

		if (
			sleepDurationMinutes !== null &&
			sleepDurationMinutes > 0 &&
			summaryInBed > 0
		) {
			sleepEfficiency = Math.min(
				100,
				Math.round((sleepDurationMinutes / summaryInBed) * 100),
			);
			sleepRestlessnessPercent =
				Math.round(
					((resolvedAwakeMins + shortAwakeningsCount) / summaryInBed) * 1000,
				) / 10;
		}

		const explicitScore = Number(sleepObj?.sleepScore ?? 0);
		if (Number.isFinite(explicitScore) && explicitScore > 0) {
			sleepScore = Math.round(explicitScore);
		} else if (sleepDurationMinutes !== null && sleepDurationMinutes > 0) {
			// Fitbit 3-component Sleep Score (100 pts total):
			// 1. Time Asleep (out of 50): duration vs 8h goal weighted by sleep efficiency & brief awakenings
			const durationRatio = Math.min(1, sleepDurationMinutes / 480);
			const effRatio =
				summaryInBed > 0 ? sleepDurationMinutes / summaryInBed : 0.92;
			const timeAsleepPts = Math.max(
				0,
				Math.min(
					50,
					durationRatio * 46 * effRatio - shortAwakeningsCount * 0.1,
				),
			);

			// 2. Deep & REM Stages (out of 25): restorative sleep proportion of sleep period
			const restorativeMins =
				deepMins + remMins > 0
					? deepMins + remMins
					: restorativeMs / 60_000;
			const stageDenominator =
				summaryInBed > 0 ? summaryInBed : sleepDurationMinutes;
			const deepRemRatio = restorativeMins / stageDenominator;
			const stagePts = Math.min(25, (deepRemRatio / 0.43) * 22);

			// 3. Restoration (out of 25): Sleeping HR below daytime RHR (12.5) + Restlessness (12.5)
			const hrDrop =
				restingHeartRate !== null && nonRemHeartRate !== null
					? restingHeartRate - nonRemHeartRate
					: null;
			const hrPts =
				hrDrop !== null
					? hrDrop > 0
						? Math.min(12.5, 8.5 + hrDrop * 0.4)
						: 6.0
					: 10.5;
			const restlessRatio =
				summaryInBed > 0
					? (resolvedAwakeMins + shortAwakeningsCount) / summaryInBed
					: 0.08;
			const restlessPts = Math.max(
				0,
				Math.min(12.5, 12.5 * (1 - restlessRatio * 2.5)),
			);
			const restorationPts = hrPts + restlessPts;

			sleepScore = Math.min(
				100,
				Math.round(timeAsleepPts + stagePts + restorationPts),
			);
			sleepScoreEstimated = true;
		}
	}

	const cacheable = series.every(([, result]) => seriesSucceeded(result.status));

	return {
		cacheable,
		stats: {
			steps,
			stepsGoal: DAILY_STEPS_GOAL,
			restingHeartRate,
			restingHeartRateDate: restingHeartRatePick.date,
			restingHeartRateFromPreviousDay: restingHeartRatePick.fromPreviousDay,
			latestHeartRateBpm,
			latestHeartRateTime,
			sleepScore,
			sleepScoreEstimated,
			sleepDurationMinutes,
			sleepEfficiency,
			sleepDeepMinutes,
			sleepRemMinutes,
			sleepLightMinutes,
			sleepAwakeMinutes,
			sleepInBedMinutes,
			sleepRestlessnessPercent,
			sleepShortAwakeningsCount,
			sleepStartTime,
			sleepEndTime,
			breathingRate,
			breathingRateDeep,
			breathingRateLight,
			breathingRateRem,
			breathingRateFull,
			bloodOxygen,
			bloodOxygenMin,
			bloodOxygenMax,
			hrvRmssd,
			hrvDeepRmssd,
			skinTempDeltaCelsius,
			skinTempNightlyCelsius,
			skinTempBaselineCelsius,
			totalCalories,
			activeCalories,
			lastSync: now.toISOString(),
			deviceLabel: "Fitbit Air · Google Health API",
			apiSource: "google-health-api",
		},
	};
}

/**
 * Queries the most recent heart-rate samples inside a short lookback window,
 * bypassing the 2-minute KV telemetry cache so clicking the Resting HR card
 * attempts to display the freshest heart rate reading.
 */
async function fetchLatestHeartRate(
	accessToken: string,
): Promise<FitbitLiveHeartRateResponse> {
	const lookbackIso = new Date(
		Date.now() - HEART_RATE_LOOKBACK_MS,
	).toISOString();
	const hrResult = await queryGoogleHealthDataType(accessToken, "heart-rate", {
		filter: `heart_rate.sample_time.physical_time >= "${lookbackIso}"`,
		pageSize: HEART_RATE_PAGE_SIZE,
	});
	if (!seriesSucceeded(hrResult.status)) {
		console.error(
			`Google Health live heart rate failed (${hrResult.status})`,
			hrResult.errorText ?? "",
		);
		return {
			ok: false,
			bpm: null,
			sampleTime: null,
			recentMinBpm: null,
			recentMaxBpm: null,
			fetchedAt: new Date().toISOString(),
			error: PUBLIC_LIVE_HEART_RATE_ERROR,
		};
	}

	const summary = summarizeHeartRateSamples(hrResult.points);
	const bpm = summary.latestBpm;
	const sampleTime = summary.latestTime;
	const recentMinBpm = summary.minBpm;
	const recentMaxBpm = summary.maxBpm;

	return {
		ok: bpm !== null,
		bpm,
		sampleTime,
		recentMinBpm,
		recentMaxBpm,
		fetchedAt: new Date().toISOString(),
	};
}

/**
 * Handles all `/api/fitbit*` routes inside the Cloudflare Worker.
 */
export async function handleFitbitRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	const url = new URL(request.url);
	const pathname = url.pathname.replace(/\/+$/, "") || "/";

	// Route 1: Initiate OAuth 2.0 Authorization Flow (owner-only)
	if (pathname === "/api/fitbit/auth" && request.method === "GET") {
		if (!(await isOwnerRequest(request, url, env))) {
			return forbiddenResponse();
		}

		if (!env.GOOGLE_CLIENT_ID) {
			return new Response(
				JSON.stringify(
					{
						error: "Missing GOOGLE_CLIENT_ID",
						message:
							"Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in `.dev.vars` (local) or via `npx wrangler secret put` (production). See README.md for the Google Health API setup guide.",
					},
					null,
					2,
				),
				{
					status: 503,
					headers: { "Content-Type": "application/json; charset=utf-8" },
				},
			);
		}

		const stateBytes = new Uint8Array(16);
		crypto.getRandomValues(stateBytes);
		const state = Array.from(stateBytes, (b) =>
			b.toString(16).padStart(2, "0"),
		).join("");

		const redirectUri = getRedirectUri(request, env);
		// Ensure we always request the new googlehealth.* scopes even if an old env var was cached
		const configuredScopes = env.GOOGLE_HEALTH_SCOPES;
		const scopes =
			configuredScopes && configuredScopes.includes("googlehealth.")
				? configuredScopes
				: DEFAULT_SCOPES;

		const authUrl = new URL(GOOGLE_AUTH_ENDPOINT);
		authUrl.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
		authUrl.searchParams.set("redirect_uri", redirectUri);
		authUrl.searchParams.set("response_type", "code");
		authUrl.searchParams.set("scope", scopes);
		authUrl.searchParams.set("access_type", "offline");
		authUrl.searchParams.set("prompt", "consent");
		authUrl.searchParams.set("state", state);

		// The state cookie is only ever issued here, after the owner check, so a
		// valid cookie at the callback proves the flow was started by the owner.
		const secureAttr = url.protocol === "https:" ? "; Secure" : "";
		return new Response(null, {
			status: 302,
			headers: {
				Location: authUrl.toString(),
				"Set-Cookie": `${OAUTH_STATE_COOKIE}=${state}; Path=/api/fitbit; HttpOnly; SameSite=Lax; Max-Age=600${secureAttr}`,
				"Cache-Control": "no-store",
			},
		});
	}

	// Route 2: OAuth 2.0 Redirect Callback (owner-only via the state cookie)
	if (pathname === "/api/fitbit/callback" && request.method === "GET") {
		const code = url.searchParams.get("code");
		const state = url.searchParams.get("state");
		const oauthError = url.searchParams.get("error");

		// Strict CSRF / owner check: the `state` parameter AND the state cookie
		// must both be present and match. A missing value is always rejected.
		const cookieState = readCookie(request, OAUTH_STATE_COOKIE);
		if (
			!state ||
			!cookieState ||
			!(await timingSafeStringEqual(state, cookieState))
		) {
			return new Response(
				"Invalid or expired OAuth state. Start again from /api/fitbit/auth.",
				{ status: 403, headers: { "Cache-Control": "no-store" } },
			);
		}

		if (oauthError) {
			return Response.redirect(
				`${url.origin}/?fitbit_error=${encodeURIComponent(oauthError)}#fitbit`,
				302,
			);
		}

		if (!code) {
			return new Response("Missing authorization code parameter.", {
				status: 400,
			});
		}

		if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
			return new Response(
				"Server is missing GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET.",
				{ status: 500 },
			);
		}

		const redirectUri = getRedirectUri(request, env);
		const tokenBody = new URLSearchParams({
			code,
			client_id: env.GOOGLE_CLIENT_ID,
			client_secret: env.GOOGLE_CLIENT_SECRET,
			redirect_uri: redirectUri,
			grant_type: "authorization_code",
		});

		const tokenRes = await fetch(GOOGLE_TOKEN_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
				Accept: "application/json",
			},
			body: tokenBody.toString(),
		});

		if (!tokenRes.ok) {
			const errBody = await tokenRes.text();
			console.error(
				`Google OAuth code exchange failed (${tokenRes.status})`,
				errBody,
			);
			return new Response(
				"Google did not accept the sign-in. Start again from the connect link.",
				{ status: 502, headers: { "Cache-Control": "no-store" } },
			);
		}

		const tokenData = (await tokenRes.json()) as {
			access_token: string;
			refresh_token?: string;
			expires_in?: number;
			scope?: string;
			token_type?: string;
		};

		let existingRefreshToken: string | undefined;
		const existingRaw = await kvGet(env, KV_TOKEN_KEY);
		if (existingRaw) {
			try {
				const parsed = JSON.parse(existingRaw) as StoredOAuthTokens;
				existingRefreshToken = parsed.refresh_token;
			} catch {
				// Ignore malformed entry
			}
		}

		const record: StoredOAuthTokens = {
			access_token: tokenData.access_token,
			refresh_token: tokenData.refresh_token ?? existingRefreshToken,
			expires_at: Date.now() + (tokenData.expires_in ?? 3600) * 1000,
			scope: tokenData.scope ?? DEFAULT_SCOPES,
			token_type: tokenData.token_type ?? "Bearer",
			updated_at: new Date().toISOString(),
		};

		await kvPut(env, KV_TOKEN_KEY, JSON.stringify(record));
		await clearCachedTelemetry(env);

		const secureAttr = url.protocol === "https:" ? "; Secure" : "";
		return new Response(null, {
			status: 302,
			headers: {
				Location: `${url.origin}/?fitbit=connected#fitbit`,
				"Set-Cookie": `${OAUTH_STATE_COOKIE}=; Path=/api/fitbit; HttpOnly; SameSite=Lax; Max-Age=0${secureAttr}`,
				"Cache-Control": "no-store",
			},
		});
	}

	// Route 3: Disconnect / Clear Stored Tokens (POST /api/fitbit/disconnect, owner-only)
	if (pathname === "/api/fitbit/disconnect" && request.method === "POST") {
		if (!(await isOwnerRequest(request, url, env))) {
			return forbiddenResponse();
		}
		await kvDelete(env, KV_TOKEN_KEY);
		await clearCachedTelemetry(env);
		return Response.json(
			{ disconnected: true },
			{ headers: { "Cache-Control": "no-store" } },
		);
	}

	// Route 4: Live / Latest Heart Rate Sample Endpoint (GET /api/fitbit/heart-rate)
	// Public, but served from a 30-second cache so visitor polling can't flood
	// the Google Health API.
	if (pathname === "/api/fitbit/heart-rate" && request.method === "GET") {
		const cachedHeartRate = await readLiveHeartRateCache(env);
		if (cachedHeartRate) {
			return Response.json(cachedHeartRate, {
				headers: { "Cache-Control": "no-store" },
			});
		}

		const rawTokens = await kvGet(env, KV_TOKEN_KEY);
		if (!rawTokens) {
			return Response.json(
				{
					ok: false,
					bpm: null,
					sampleTime: null,
					recentMinBpm: null,
					recentMaxBpm: null,
					fetchedAt: new Date().toISOString(),
					error: "Not authorized",
				} satisfies FitbitLiveHeartRateResponse,
				{
					status: 200,
					headers: { "Cache-Control": "no-store" },
				},
			);
		}

		try {
			let tokens = JSON.parse(rawTokens) as StoredOAuthTokens;
			if (Date.now() >= tokens.expires_at - 60_000) {
				tokens = await refreshAccessToken(tokens, env);
			}
			const hrPayload = await fetchLatestHeartRate(tokens.access_token);
			if (!hrPayload.error) {
				await writeLiveHeartRateCache(env, hrPayload);
			}
			return Response.json(hrPayload satisfies FitbitLiveHeartRateResponse, {
				headers: { "Cache-Control": "no-store" },
			});
		} catch (error) {
			console.error("Google Health live heart rate failed", error);
			return Response.json(
				{
					ok: false,
					bpm: null,
					sampleTime: null,
					recentMinBpm: null,
					recentMaxBpm: null,
					fetchedAt: new Date().toISOString(),
					error: PUBLIC_LIVE_HEART_RATE_ERROR,
				} satisfies FitbitLiveHeartRateResponse,
				{
					status: 200,
					headers: { "Cache-Control": "no-store" },
				},
			);
		}
	}

	// Route 5: Public telemetry endpoint (GET /api/fitbit)
	if (pathname === "/api/fitbit" && request.method === "GET") {
		const configured = isOAuthConfigured(env);
		const apiNotice =
			"Powered by Google Health API v4 (health.googleapis.com)";

		const rawTokens = await kvGet(env, KV_TOKEN_KEY);
		if (!rawTokens) {
			const unauthPayload: FitbitApiResponse = {
				authorized: false,
				configured,
				authUrl: "/api/fitbit/auth",
				apiNotice,
				stats: null,
			};
			return Response.json(unauthPayload, {
				status: 200,
				headers: { "Cache-Control": "no-store" },
			});
		}

		// `?refresh=1` bypasses the KV cache, so only the owner may use it.
		// For everyone else the parameter is silently ignored.
		const forceRefresh =
			url.searchParams.get("refresh") === "1" &&
			(await isOwnerRequest(request, url, env));
		if (!forceRefresh) {
			const cachedStatsRaw = await kvGet(env, KV_STATS_CACHE_KEY);
			if (cachedStatsRaw) {
				try {
					const cachedStats = JSON.parse(cachedStatsRaw) as FitbitLiveStats;
					return Response.json(
						{
							authorized: true,
							configured,
							authUrl: "/api/fitbit/auth",
							apiNotice,
							stats: cachedStats,
						} satisfies FitbitApiResponse,
						{
							// A max-age here let the browser reuse an older step
							// count after a newer read had already been shown.
							headers: { "Cache-Control": "no-store" },
						},
					);
				} catch {
					// Continue to live fetch on cache parse error
				}
			}
		}

		try {
			let tokens = JSON.parse(rawTokens) as StoredOAuthTokens;

			// Refresh access token if expired or expiring within 60 seconds
			if (Date.now() >= tokens.expires_at - 60_000) {
				tokens = await refreshAccessToken(tokens, env);
			}

			const { stats: liveStats, cacheable } = await fetchGoogleHealthTelemetry(
				tokens.access_token,
			);
			const existingSyncMs = statsSyncMs(
				await kvGet(env, KV_STATS_CACHE_KEY),
			);
			const liveSyncMs = Date.parse(liveStats.lastSync);
			const liveIsCurrent =
				!Number.isFinite(liveSyncMs) || liveSyncMs >= existingSyncMs;
			if (liveIsCurrent && cacheable) {
				await kvPut(
					env,
					KV_STATS_CACHE_KEY,
					JSON.stringify(liveStats),
					STATS_CACHE_TTL_SECONDS,
				);
			} else if (liveIsCurrent) {
				// A partial read must not leave the previous snapshot in place,
				// or the next load shows that older, lower step count.
				await kvDelete(env, KV_STATS_CACHE_KEY);
			}

			return Response.json(
				{
					authorized: true,
					configured,
					authUrl: "/api/fitbit/auth",
					apiNotice,
					stats: liveStats,
				} satisfies FitbitApiResponse,
				{
					headers: { "Cache-Control": "no-store" },
				},
			);
		} catch (error) {
			console.error("Google Health telemetry failed", error);

			return Response.json(
				{
					authorized: false,
					configured,
					authUrl: "/api/fitbit/auth",
					apiNotice,
					stats: null,
					error: PUBLIC_HEALTH_ERROR,
				} satisfies FitbitApiResponse,
				{
					status: 200,
					headers: { "Cache-Control": "no-store" },
				},
			);
		}
	}

	return Response.json({ error: "Not found" }, { status: 404 });
}
