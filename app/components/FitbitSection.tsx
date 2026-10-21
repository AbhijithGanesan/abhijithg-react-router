import { useCallback, useEffect, useRef, useState } from "react";
import type {
	FitbitApiResponse,
	FitbitLiveHeartRateResponse,
	FitbitLiveStats,
} from "../../workers/fitbit";

const SAMPLE_TELEMETRY: FitbitLiveStats = {
	steps: 8420,
	stepsGoal: 10000,
	restingHeartRate: 58,
	latestHeartRateBpm: 66,
	latestHeartRateTime: new Date().toISOString(),
	sleepScore: 86,
	sleepDurationMinutes: 531, // 8h 51m
	sleepEfficiency: 96,
	sleepDeepMinutes: 118,
	sleepRemMinutes: 120,
	sleepLightMinutes: 293,
	sleepAwakeMinutes: 23,
	sleepInBedMinutes: 554,
	sleepRestlessnessPercent: 7.4,
	sleepShortAwakeningsCount: 18,
	sleepStartTime: "2026-10-20T01:52:00Z",
	sleepEndTime: "2026-10-20T11:06:00Z",
	breathingRate: 15.8,
	breathingRateDeep: 15.8,
	breathingRateLight: 16.0,
	breathingRateRem: 13.6,
	breathingRateFull: 15.8,
	bloodOxygen: 97.5,
	bloodOxygenMin: 94.6,
	bloodOxygenMax: 99.6,
	hrvRmssd: 45.3,
	hrvDeepRmssd: 43.2,
	skinTempDeltaCelsius: 0.04,
	skinTempNightlyCelsius: 34.5,
	skinTempBaselineCelsius: 34.5,
	totalCalories: 1862,
	activeCalories: 97,
	lastSync: new Date().toISOString(),
	deviceLabel: "Fitbit Air",
	apiSource: "google-health-api",
};

const SYNC_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	day: "numeric",
	month: "short",
	hour: "2-digit",
	minute: "2-digit",
	hour12: false,
});

const HR_SAMPLE_TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

function formatDurationMinutes(totalMinutes: number | null | undefined): string {
	if (totalMinutes === null || totalMinutes === undefined || totalMinutes <= 0) {
		return "--";
	}
	const hours = Math.floor(totalMinutes / 60);
	const mins = totalMinutes % 60;
	if (hours === 0) return `${mins}m`;
	return `${hours}h ${mins}m`;
}

function formatSyncTimestamp(isoString: string): string {
	try {
		return SYNC_TIME_FORMATTER.format(new Date(isoString));
	} catch {
		return isoString;
	}
}

function formatSampleClockTime(isoString: string | null | undefined): string {
	if (!isoString) return "No recent sync";
	try {
		return `${HR_SAMPLE_TIME_FORMATTER.format(new Date(isoString))} UK`;
	} catch {
		return "Latest sample";
	}
}

function formatRelativeSampleAge(isoString: string | null | undefined): string {
	if (!isoString) return "No data";
	try {
		const diffSec = Math.max(
			0,
			Math.floor((Date.now() - new Date(isoString).getTime()) / 1000),
		);
		if (diffSec < 120) return "Live";
		if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
		if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
		return "Synced";
	} catch {
		return "Synced";
	}
}

function formatTempDelta(delta: number | null): string {
	if (delta === null || !Number.isFinite(delta)) return "--";
	const sign = delta >= 0 ? "+" : "";
	return `${sign}${delta.toFixed(2)}°C`;
}

export function FitbitSection() {
	const sectionRef = useRef<HTMLElement | null>(null);
	const headerRef = useRef<HTMLDivElement | null>(null);
	const syncRef = useRef<HTMLDivElement | null>(null);
	const [syncOnOwnLine, setSyncOnOwnLine] = useState(false);
	const [hasEnteredView, setHasEnteredView] = useState(false);
	const [loading, setLoading] = useState(false);
	const [data, setData] = useState<FitbitApiResponse | null>(null);
	const [fetchFailed, setFetchFailed] = useState(false);
	const [previewMode, setPreviewMode] = useState(false);
	const [showLiveHr, setShowLiveHr] = useState(false);
	const [liveHrData, setLiveHrData] =
		useState<FitbitLiveHeartRateResponse | null>(null);
	const [liveHrLoading, setLiveHrLoading] = useState(false);
	const [showSleepDetails, setShowSleepDetails] = useState(false);
	const [showBreathingDetails, setShowBreathingDetails] = useState(false);

	const fetchLiveHeartRate = useCallback(async () => {
		setLiveHrLoading(true);
		try {
			const response = await fetch("/api/fitbit/heart-rate", {
				headers: { Accept: "application/json" },
			});
			if (response.ok) {
				const payload = (await response.json()) as FitbitLiveHeartRateResponse;
				if (payload.ok) {
					setLiveHrData(payload);
				}
			}
		} catch {
			// Fall back to cached latestHeartRateBpm from activeStats
		} finally {
			setLiveHrLoading(false);
		}
	}, []);

	useEffect(() => {
		if (!showLiveHr || !data?.authorized) return;

		fetchLiveHeartRate();
		const intervalId = window.setInterval(() => {
			if (document.visibilityState === "visible") {
				fetchLiveHeartRate();
			}
		}, 15_000);

		return () => window.clearInterval(intervalId);
	}, [showLiveHr, data?.authorized, fetchLiveHeartRate]);

	const fetchStats = useCallback(async (forceRefresh = false) => {
		setLoading(true);
		setFetchFailed(false);
		try {
			const endpoint = forceRefresh
				? "/api/fitbit?refresh=1"
				: "/api/fitbit";
			const response = await fetch(endpoint, {
				headers: { Accept: "application/json" },
			});
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			const payload = (await response.json()) as FitbitApiResponse;
			setData(payload);
			if (payload.authorized) {
				setPreviewMode(false);
			}
			if (payload.error) {
				// Keep upstream error details out of the public UI; log for debugging.
				console.warn("Fitbit telemetry unavailable:", payload.error);
			}
		} catch (err) {
			console.warn("Unable to reach /api/fitbit Worker endpoint:", err);
			setFetchFailed(true);
		} finally {
			setLoading(false);
		}
	}, []);

	useEffect(() => {
		const node = sectionRef.current;
		if (!node) return;

		if (typeof window.IntersectionObserver === "undefined") {
			setHasEnteredView(true);
			return;
		}

		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setHasEnteredView(true);
						observer.disconnect();
						break;
					}
				}
			},
			{ rootMargin: "160px 0px" },
		);

		observer.observe(node);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (hasEnteredView) {
			fetchStats(false);
		}
	}, [hasEnteredView, fetchStats]);

	const activeStats: FitbitLiveStats | null = data?.authorized
		? data.stats
		: previewMode
			? SAMPLE_TELEMETRY
			: null;

	useEffect(() => {
		const header = headerRef.current;
		const sync = syncRef.current;
		if (!header || !sync) {
			setSyncOnOwnLine(false);
			return;
		}

		const measure = () => {
			const title = header.firstElementChild;
			if (!title) return;
			const onOwnLine =
				sync.getBoundingClientRect().top >=
				title.getBoundingClientRect().bottom - 1;
			setSyncOnOwnLine(onOwnLine);
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(header);
		return () => observer.disconnect();
	}, [activeStats]);

	const stepsProgressPercent = activeStats
		? Math.min(
				100,
				Math.round(
					(activeStats.steps / Math.max(1, activeStats.stepsGoal)) * 100,
				),
			)
		: 0;

	const isCheckingConnection = loading || (data === null && !fetchFailed);

	const resolvedLiveBpm =
		liveHrData?.bpm ?? activeStats?.latestHeartRateBpm ?? null;
	const resolvedLiveSampleTime =
		liveHrData?.sampleTime ?? activeStats?.latestHeartRateTime ?? null;
	const liveHrDeltaVsResting =
		resolvedLiveBpm !== null &&
		activeStats?.restingHeartRate !== null &&
		activeStats?.restingHeartRate !== undefined
			? resolvedLiveBpm - activeStats.restingHeartRate
			: null;

	return (
		<section
			id="fitbit"
			ref={sectionRef}
			aria-labelledby="fitbit-heading"
			className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6 sm:py-14"
		>
			{/* Fluent 2 Card Container: #141414, 12px radius, 1px #292929 stroke + top specular edge */}
			<div className="rounded-xl border border-[#292929] border-t-[#383838] bg-[#141414] p-5 sm:p-6">
				{/* Header */}
				<div
					ref={headerRef}
					className="flex flex-wrap items-end justify-between gap-4 border-b border-[#292929] pb-4"
				>
					<div>
						<h2
							id="fitbit-heading"
							className="font-display text-lg font-semibold leading-6 text-[#ffffff] sm:text-xl"
						>
							Daily Movement &amp; Recovery
						</h2>
						<p className="mt-0.5 text-xs text-[#adadad] sm:text-sm">
							Live stats from my Fitbit Air, pulled via Google Health.
						</p>
					</div>

					{activeStats && (
						<div
							ref={syncRef}
							className={syncOnOwnLine ? "text-left" : "text-right"}
						>
							<div className="text-[11px] font-medium uppercase tracking-wider text-[#adadad]">
								Last synced
							</div>
							<div className="mt-0.5 font-mono text-xs font-semibold text-[#d6d6d6] tabular-nums">
								{formatSyncTimestamp(activeStats.lastSync)} UK
							</div>
						</div>
					)}
				</div>

				{/* Fallback UI when live stats are unavailable (Fluent 2 Secondary Surface #1f1f1f).
				    Connecting an account is an owner-only action, so no Connect button is shown here. */}
				{!data?.authorized && (
					<div className="mt-5 rounded-lg border border-[#2e2e2e] bg-[#1f1f1f] p-4 sm:p-5">
						<div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
							<div className="space-y-1">
								<div className="flex items-center gap-2.5 text-sm font-semibold text-[#ffffff]">
									<span>
										{isCheckingConnection
											? "Checking for live stats…"
											: "Stats unavailable right now"}
									</span>
									{previewMode && (
										<span className="rounded bg-[#0f6cbd]/20 px-2 py-0.5 text-xs font-medium text-[#479ef5] border border-[#479ef5]/30">
											Sample data
										</span>
									)}
								</div>
								<p className="max-w-xl text-xs leading-5 text-[#adadad]">
									Live stats from my Fitbit aren&rsquo;t available at the
									moment. Check back soon, or preview the layout with sample
									data.
								</p>
							</div>

							<div className="flex flex-wrap items-center gap-2.5 shrink-0">
								{/* Fluent 2 Secondary Standard Button */}
								<button
									type="button"
									onClick={() => setPreviewMode((prev) => !prev)}
									className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-[#383838] border-t-[#474747] bg-[#242424] px-3 py-1.5 text-xs font-semibold text-[#ffffff] hover:bg-[#2e2e2e] active:bg-[#1a1a1a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#479ef5] sm:text-sm"
								>
									{previewMode ? "Hide sample stats" : "Preview layout"}
								</button>
							</div>
						</div>
					</div>
				)}

				{/* Live (or Preview) Biometric Cards — Compact 2x4 Grid */}
				{activeStats && (
					<div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
						{/* 1. Steps */}
						<div className="flex flex-col justify-between rounded-lg border border-[#2e2e2e] border-t-[#3b3b3b] bg-[#1f1f1f] p-4">
							<div>
								<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
									<span>Steps today</span>
									<span className="font-mono text-xs font-semibold text-[#f5c542]">
										{stepsProgressPercent}%
									</span>
								</div>
								<div className="mt-1.5 font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
									{activeStats.steps.toLocaleString("en-GB")}
								</div>
							</div>
							<div>
								{/* Fluent 2 ProgressBar */}
								<div className="mt-2.5 h-1 w-full overflow-hidden rounded-full bg-[#333333]">
									<div
										style={{ width: `${stepsProgressPercent}%` }}
										className="h-full rounded-full bg-[#e6b325]"
									/>
								</div>
								<div className="mt-1.5 text-[11px] text-[#adadad]">
									Goal: {activeStats.stepsGoal.toLocaleString("en-GB")} steps
								</div>
							</div>
						</div>

						{/* 2. Resting Heart Rate (Tap to toggle in-place Live Heart Rate readout) */}
						<button
							type="button"
							aria-pressed={showLiveHr}
							onClick={() => setShowLiveHr((prev) => !prev)}
							className={`grid cursor-pointer rounded-lg border p-4 text-left [grid-template-areas:'card'] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#479ef5] ${
								showLiveHr
									? "border-[#479ef5] border-t-[#62abf5] bg-[#18202c]"
									: "border-[#2e2e2e] border-t-[#3b3b3b] bg-[#1f1f1f] hover:border-[#3d3d3d]"
							}`}
						>
							{/* Summary View (Resting HR) */}
							<div
								aria-hidden={showLiveHr}
								className={`pointer-events-none flex flex-col justify-between [grid-area:card] transition-[opacity,transform,visibility] duration-150 ease-out ${
									showLiveHr
										? "invisible scale-95 opacity-0"
										: "visible scale-100 opacity-100"
								}`}
							>
								<div>
									<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
										<span>Resting HR</span>
										<span className="h-2 w-2 rounded-full bg-[#f1707b]" />
									</div>
									<div className="mt-1.5 flex items-baseline gap-1.5">
										<span className="font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
											{activeStats.restingHeartRate ?? "--"}
										</span>
										<span className="font-mono text-xs text-[#adadad]">
											bpm
										</span>
									</div>
								</div>
								<div className="mt-2.5 flex items-center justify-between text-[11px] text-[#adadad]">
									<span>24-hour resting baseline</span>
									<span className="text-[#479ef5]">Live HR</span>
								</div>
							</div>

							{/* In-Place Live HR View */}
							<div
								aria-hidden={!showLiveHr}
								className={`pointer-events-none flex flex-col justify-between [grid-area:card] transition-[opacity,transform,visibility] duration-150 ease-out ${
									showLiveHr
										? "visible scale-100 opacity-100"
										: "invisible scale-95 opacity-0"
								}`}
							>
								<div>
									<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
										<span>Live HR</span>
										<span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[#f1707b]">
											<span
												className={`h-2 w-2 rounded-full bg-[#f1707b] ${
													showLiveHr
														? liveHrLoading
															? "animate-ping"
															: "animate-pulse"
														: ""
												}`}
											/>
											{liveHrLoading && resolvedLiveBpm === null
												? "Polling…"
												: formatRelativeSampleAge(resolvedLiveSampleTime)}
										</span>
									</div>
									<div className="mt-1.5 flex items-baseline justify-between gap-2">
										<div className="flex items-baseline gap-1.5">
											<span className="font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
												{resolvedLiveBpm ?? "--"}
											</span>
											<span className="font-mono text-xs text-[#adadad]">
												bpm
											</span>
										</div>
										{liveHrDeltaVsResting !== null && (
											<span className="font-mono text-[11px] text-[#d6d6d6] tabular-nums">
												{liveHrDeltaVsResting >= 0
													? `+${liveHrDeltaVsResting}`
													: liveHrDeltaVsResting}{" "}
												vs RHR
											</span>
										)}
									</div>
								</div>
								<div className="mt-2.5 flex items-center justify-between text-[11px] text-[#adadad]">
									<span className="font-mono text-[#d6d6d6] tabular-nums">
										{formatSampleClockTime(resolvedLiveSampleTime)}
									</span>
									<span className="text-[#62abf5]">Back</span>
								</div>
							</div>
						</button>

						{/* 3. Sleep Score (Tap to toggle in-place stage & restlessness breakdown) */}
						<button
							type="button"
							aria-pressed={showSleepDetails}
							onClick={() => setShowSleepDetails((prev) => !prev)}
							className={`grid cursor-pointer rounded-lg border p-4 text-left [grid-template-areas:'card'] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#479ef5] ${
								showSleepDetails
									? "border-[#479ef5] border-t-[#62abf5] bg-[#18202c]"
									: "border-[#2e2e2e] border-t-[#3b3b3b] bg-[#1f1f1f] hover:border-[#3d3d3d]"
							}`}
						>
							{/* Summary View */}
							<div
								aria-hidden={showSleepDetails}
								className={`pointer-events-none flex flex-col justify-between [grid-area:card] transition-[opacity,transform,visibility] duration-150 ease-out ${
									showSleepDetails
										? "invisible scale-95 opacity-0"
										: "visible scale-100 opacity-100"
								}`}
							>
								<div>
									<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
										<span>Sleep score</span>
										<span className="font-mono text-xs text-[#c084fc]">
											{formatDurationMinutes(activeStats.sleepDurationMinutes)}
										</span>
									</div>
									<div className="mt-1.5 flex items-baseline gap-1.5">
										<span className="font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
											{activeStats.sleepScore ?? "--"}
										</span>
										<span className="font-mono text-xs text-[#adadad]">
											/ 100
										</span>
									</div>
								</div>
								<div className="mt-2.5 flex items-center justify-between text-[11px] text-[#adadad]">
									<span>
										{activeStats.sleepEfficiency
											? `${activeStats.sleepEfficiency}% sleep efficiency`
											: "Last recorded night"}
									</span>
									<span className="text-[#479ef5]">Details</span>
								</div>
							</div>

							{/* In-Place Detail View */}
							<div
								aria-hidden={!showSleepDetails}
								className={`pointer-events-none flex flex-col justify-between [grid-area:card] transition-[opacity,transform,visibility] duration-150 ease-out ${
									showSleepDetails
										? "visible scale-100 opacity-100"
										: "invisible scale-95 opacity-0"
								}`}
							>
								<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
									<div className="flex justify-between">
										<span className="text-[#adadad]">Deep</span>
										<span className="font-mono font-semibold text-[#ffffff]">
											{formatDurationMinutes(activeStats.sleepDeepMinutes)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#adadad]">REM</span>
										<span className="font-mono font-semibold text-[#ffffff]">
											{formatDurationMinutes(activeStats.sleepRemMinutes)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#adadad]">Light</span>
										<span className="font-mono font-semibold text-[#ffffff]">
											{formatDurationMinutes(activeStats.sleepLightMinutes)}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#adadad]">Awake</span>
										<span className="font-mono font-semibold text-[#ffffff]">
											{formatDurationMinutes(activeStats.sleepAwakeMinutes)}
										</span>
									</div>
								</div>
								<div className="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-[11px] text-[#adadad]">
									<span>
										Restless:{" "}
										<span className="font-mono text-[#d6d6d6]">
											{activeStats.sleepRestlessnessPercent !== null &&
											activeStats.sleepRestlessnessPercent !== undefined
												? `${activeStats.sleepRestlessnessPercent}%`
												: "--"}
										</span>
									</span>
									<span className="text-[#62abf5]">Back</span>
								</div>
							</div>
						</button>

						{/* 4. Heart Rate Variability (HRV) */}
						<div className="flex flex-col justify-between rounded-lg border border-[#2e2e2e] border-t-[#3b3b3b] bg-[#1f1f1f] p-4">
							<div>
								<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
									<span>Heart rate variability</span>
									<span className="font-mono text-xs text-[#3dcee8]">
										RMSSD
									</span>
								</div>
								<div className="mt-1.5 flex items-baseline gap-1.5">
									<span className="font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
										{activeStats.hrvRmssd ?? "--"}
									</span>
									<span className="font-mono text-xs text-[#adadad]">ms</span>
								</div>
							</div>
							<div className="mt-2.5 text-[11px] text-[#adadad]">
								{activeStats.hrvDeepRmssd
									? `${activeStats.hrvDeepRmssd} ms deep sleep RMSSD`
									: "Nightly autonomic recovery"}
							</div>
						</div>

						{/* 5. Blood Oxygen (SpO2) */}
						<div className="flex flex-col justify-between rounded-lg border border-[#2e2e2e] border-t-[#3b3b3b] bg-[#1f1f1f] p-4">
							<div>
								<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
									<span>Blood oxygen</span>
									<span className="font-mono text-xs text-[#54b054]">SpO₂</span>
								</div>
								<div className="mt-1.5 flex items-baseline gap-1">
									<span className="font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
										{activeStats.bloodOxygen ?? "--"}
									</span>
									<span className="font-mono text-xs text-[#adadad]">%</span>
								</div>
							</div>
							<div className="mt-2.5 text-[11px] text-[#adadad]">
								{activeStats.bloodOxygenMin && activeStats.bloodOxygenMax
									? `Range: ${activeStats.bloodOxygenMin}% – ${activeStats.bloodOxygenMax}%`
									: "Nightly oxygen saturation"}
							</div>
						</div>

						{/* 6. Breathing Rate (Tap to toggle in-place stage breathing rates) */}
						<button
							type="button"
							aria-pressed={showBreathingDetails}
							onClick={() => setShowBreathingDetails((prev) => !prev)}
							className={`grid cursor-pointer rounded-lg border p-4 text-left [grid-template-areas:'card'] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#479ef5] ${
								showBreathingDetails
									? "border-[#479ef5] border-t-[#62abf5] bg-[#18202c]"
									: "border-[#2e2e2e] border-t-[#3b3b3b] bg-[#1f1f1f] hover:border-[#3d3d3d]"
							}`}
						>
							{/* Summary View */}
							<div
								aria-hidden={showBreathingDetails}
								className={`pointer-events-none flex flex-col justify-between [grid-area:card] transition-[opacity,transform,visibility] duration-150 ease-out ${
									showBreathingDetails
										? "invisible scale-95 opacity-0"
										: "visible scale-100 opacity-100"
								}`}
							>
								<div>
									<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
										<span>Breathing rate</span>
										<span className="font-mono text-xs text-[#adadad]">
											Sleep
										</span>
									</div>
									<div className="mt-1.5 flex items-baseline gap-1.5">
										<span className="font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
											{activeStats.breathingRate ?? "--"}
										</span>
										<span className="font-mono text-xs text-[#adadad]">
											brpm
										</span>
									</div>
								</div>
								<div className="mt-2.5 flex items-center justify-between text-[11px] text-[#adadad]">
									<span>Breaths per minute</span>
									<span className="text-[#479ef5]">By stage</span>
								</div>
							</div>

							{/* In-Place Detail View */}
							<div
								aria-hidden={!showBreathingDetails}
								className={`pointer-events-none flex flex-col justify-between [grid-area:card] transition-[opacity,transform,visibility] duration-150 ease-out ${
									showBreathingDetails
										? "visible scale-100 opacity-100"
										: "invisible scale-95 opacity-0"
								}`}
							>
								<div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
									<div className="flex justify-between">
										<span className="text-[#adadad]">Deep</span>
										<span className="font-mono font-semibold text-[#ffffff]">
											{activeStats.breathingRateDeep ??
												activeStats.breathingRate ??
												"--"}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#adadad]">Light</span>
										<span className="font-mono font-semibold text-[#ffffff]">
											{activeStats.breathingRateLight ?? "--"}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#adadad]">REM</span>
										<span className="font-mono font-semibold text-[#ffffff]">
											{activeStats.breathingRateRem ?? "--"}
										</span>
									</div>
									<div className="flex justify-between">
										<span className="text-[#adadad]">Full</span>
										<span className="font-mono font-semibold text-[#ffffff]">
											{activeStats.breathingRateFull ??
												activeStats.breathingRate ??
												"--"}
										</span>
									</div>
								</div>
								<div className="mt-2 flex items-center justify-between border-t border-white/10 pt-1.5 text-[11px] text-[#adadad]">
									<span>Stage brpm averages</span>
									<span className="text-[#62abf5]">Back</span>
								</div>
							</div>
						</button>

						{/* 7. Skin Temperature Variation */}
						<div className="flex flex-col justify-between rounded-lg border border-[#2e2e2e] border-t-[#3b3b3b] bg-[#1f1f1f] p-4">
							<div>
								<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
									<span>Skin temp variation</span>
									<span className="font-mono text-xs text-[#adadad]">
										Δ Base
									</span>
								</div>
								<div className="mt-1.5 flex items-baseline gap-1.5">
									<span className="font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
										{formatTempDelta(activeStats.skinTempDeltaCelsius)}
									</span>
								</div>
							</div>
							<div className="mt-2.5 text-[11px] text-[#adadad]">
								{activeStats.skinTempNightlyCelsius &&
								activeStats.skinTempBaselineCelsius
									? `${activeStats.skinTempNightlyCelsius}°C nightly · ${activeStats.skinTempBaselineCelsius}°C base`
									: "Nightly wrist skin variation"}
							</div>
						</div>

						{/* 8. Total & Active Calories Burned */}
						<div className="flex flex-col justify-between rounded-lg border border-[#2e2e2e] border-t-[#3b3b3b] bg-[#1f1f1f] p-4">
							<div>
								<div className="flex items-center justify-between text-xs font-medium text-[#adadad]">
									<span>Calories burned</span>
									<span className="font-mono text-xs text-[#fb923c]">
										Total
									</span>
								</div>
								<div className="mt-1.5 flex items-baseline gap-1.5">
									<span className="font-mono text-xl font-semibold text-[#ffffff] tabular-nums sm:text-2xl">
										{activeStats.totalCalories !== null
											? activeStats.totalCalories.toLocaleString("en-GB")
											: "--"}
									</span>
									<span className="font-mono text-xs text-[#adadad]">kcal</span>
								</div>
							</div>
							<div className="mt-2.5 text-[11px] text-[#adadad]">
								{activeStats.activeCalories !== null
									? `${activeStats.activeCalories.toLocaleString("en-GB")} kcal active energy burned`
									: "Daily total expenditure"}
							</div>
						</div>
					</div>
				)}
			</div>
		</section>
	);
}
