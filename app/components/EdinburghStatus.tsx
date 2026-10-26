import {
	useEffect,
	useLayoutEffect,
	useRef,
	useState,
	type TouchEvent,
} from "react";

type PressureTrend = "rising" | "falling" | "steady";

interface EdinburghWeather {
	temperatureC: number;
	feelsLikeC: number;
	weatherCode: number;
	conditionText: string;
	humidityPercent: number;
	precipitationMm: number;
	windSpeedKmh: number;
	windGustsKmh: number;
	windDirectionDeg: number;
	pressureHpa: number;
	pressureTrend: PressureTrend | null;
	visibilityKm: number;
	uvIndex: number;
	sunrise: string;
	sunset: string;
	moonPhase: number | null;
	moonrise: string;
	moonset: string;
	dewPointC: number | null;
	cloudCoverPercent: number | null;
	aqiEuropean: number | null;
	aqiUs: number | null;
	pm25: number | null;
	pollen: PollenCounts | null;
	fetchedAt: number;
}

interface PollenCounts {
	alder: number | null;
	birch: number | null;
	grass: number | null;
	mugwort: number | null;
	olive: number | null;
	ragweed: number | null;
}

const WEATHER_CACHE_KEY = "edinburgh_open_meteo_cache_v4";
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
// Hour-to-hour changes smaller than this are steady, not a real rise or fall.
const PRESSURE_STEADY_HPA = 0.5;
const METRIC_PAGE_COUNT = 2;
const SWIPE_THRESHOLD_PX = 48;

const OPEN_METEO_WEATHER_URL =
	"https://api.open-meteo.com/v1/forecast?latitude=55.9533&longitude=-3.1883&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,uv_index,dew_point_2m,cloud_cover&hourly=surface_pressure,pressure_msl&past_hours=1&daily=sunrise,sunset,moon_phase,moonrise,moonset,uv_index_max&timezone=Europe%2FLondon&forecast_days=1";

const OPEN_METEO_AQI_URL =
	"https://air-quality-api.open-meteo.com/v1/air-quality?latitude=55.9533&longitude=-3.1883&current=european_aqi,us_aqi,pm2_5,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,olive_pollen,ragweed_pollen&timezone=Europe%2FLondon";

// Instantiate Intl.DateTimeFormat objects ONCE at module scope so the 1-second
// clock tick never re-parses ICU timezone tables on the main thread.
const TIME_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	hour: "2-digit",
	minute: "2-digit",
	second: "2-digit",
	hour12: false,
});

const DATE_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	weekday: "short",
	day: "numeric",
	month: "short",
});

const TZ_SHORT_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	timeZoneName: "short",
});

const TZ_OFFSET_FORMATTER = new Intl.DateTimeFormat("en-GB", {
	timeZone: "Europe/London",
	timeZoneName: "longOffset",
});

function describeWmoWeatherCode(code: number): string {
	switch (code) {
		case 0:
			return "Clear sky";
		case 1:
			return "Mostly clear";
		case 2:
			return "Partly cloudy";
		case 3:
			return "Overcast";
		case 45:
		case 48:
			return "Mist & haar";
		case 51:
		case 53:
		case 55:
			return "Light drizzle";
		case 56:
		case 57:
			return "Freezing drizzle";
		case 61:
		case 63:
		case 65:
			return "Rain";
		case 66:
		case 67:
			return "Freezing rain";
		case 71:
		case 73:
		case 75:
		case 77:
			return "Snowfall";
		case 80:
		case 81:
		case 82:
			return "Passing showers";
		case 85:
		case 86:
			return "Snow showers";
		case 95:
		case 96:
		case 99:
			return "Thunderstorm";
		default:
			return "Variable clouds";
	}
}

function degreesToCardinal(deg: number): string {
	const directions = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
	const index = Math.round(((deg %= 360) < 0 ? deg + 360 : deg) / 45) % 8;
	return directions[index];
}

function describeUvIndex(uv: number): string {
	if (uv < 3) return "Low";
	if (uv < 6) return "Moderate";
	if (uv < 8) return "High";
	if (uv < 11) return "Very high";
	return "Extreme";
}

function describeAqi(aqi: number | null): string {
	if (aqi === null) return "Unavailable";
	if (aqi <= 20) return "Good";
	if (aqi <= 40) return "Fair";
	if (aqi <= 60) return "Moderate";
	if (aqi <= 80) return "Poor";
	return "Very poor";
}

function describeCloudCover(percent: number): string {
	if (percent <= 10) return "Clear";
	if (percent <= 30) return "Mostly clear";
	if (percent <= 60) return "Partly cloudy";
	if (percent <= 90) return "Mostly cloudy";
	return "Overcast";
}

function describePressureTrend(trend: PressureTrend | null): string {
	if (trend === "rising") return "↑ Rising";
	if (trend === "falling") return "↓ Falling";
	if (trend === "steady") return "→ Steady";
	return "Surface barometric";
}

function describeMoonPhase(phase: number | null): string {
	if (phase === null || !Number.isFinite(phase)) return "--";
	const fraction = ((phase % 1) + 1) % 1;
	if (fraction < 0.03 || fraction >= 0.97) return "New";
	if (fraction < 0.22) return "Waxing crescent";
	if (fraction < 0.28) return "First quarter";
	if (fraction < 0.47) return "Waxing gibbous";
	if (fraction < 0.53) return "Full";
	if (fraction < 0.72) return "Waning gibbous";
	if (fraction < 0.78) return "Last quarter";
	return "Waning crescent";
}

const POLLEN_LEVELS = ["Low", "Moderate", "High", "Very high"] as const;

// Grains/m³ where each band starts. Grass and birch follow the Met Office
// cuts. Alder, mugwort, and ragweed follow the MeteoSwiss cuts. Olive uses
// the birch cuts.
const POLLEN_SPECIES: Array<{
	key: keyof PollenCounts;
	label: string;
	cuts: readonly [number, number, number];
}> = [
	{ key: "alder", label: "Alder", cuts: [11, 70, 250] },
	{ key: "birch", label: "Birch", cuts: [40, 80, 200] },
	{ key: "grass", label: "Grass", cuts: [30, 50, 150] },
	{ key: "mugwort", label: "Mugwort", cuts: [6, 15, 50] },
	{ key: "olive", label: "Olive", cuts: [40, 80, 200] },
	{ key: "ragweed", label: "Ragweed", cuts: [6, 11, 40] },
];

function describePollen(pollen: PollenCounts | null): {
	value: string;
	detail: string;
} {
	if (!pollen) return { value: "--", detail: "Unavailable" };
	if (POLLEN_SPECIES.every((species) => pollen[species.key] === null)) {
		return { value: "--", detail: "Unavailable" };
	}

	let best: { label: string; grains: number; rank: number } | null = null;
	for (const species of POLLEN_SPECIES) {
		const grains = pollen[species.key];
		if (typeof grains !== "number" || grains < 1) continue;
		const [moderate, high, veryHigh] = species.cuts;
		const rank =
			grains >= veryHigh ? 3 : grains >= high ? 2 : grains >= moderate ? 1 : 0;
		if (
			!best ||
			rank > best.rank ||
			(rank === best.rank && grains > best.grains)
		) {
			best = { label: species.label, grains, rank };
		}
	}

	if (!best) return { value: "None", detail: "No pollen reported" };
	return {
		value: POLLEN_LEVELS[best.rank],
		detail: `${best.label} ${Math.round(best.grains)} / m³`,
	};
}

function derivePressureTrend(
	times: string[] | undefined,
	series: Array<number | null> | undefined,
	currentTime: string | undefined,
): PressureTrend | null {
	if (!times || !series || !currentTime) return null;
	const hourKey = currentTime.slice(0, 13);
	const index = times.findIndex((time) => time.slice(0, 13) === hourKey);
	if (index < 1) return null;
	const current = series[index];
	const previous = series[index - 1];
	if (typeof current !== "number" || typeof previous !== "number") return null;
	const delta = current - previous;
	if (delta >= PRESSURE_STEADY_HPA) return "rising";
	if (delta <= -PRESSURE_STEADY_HPA) return "falling";
	return "steady";
}

function isFreshWeatherCache(value: unknown): value is EdinburghWeather {
	if (!value || typeof value !== "object") return false;
	const weather = value as EdinburghWeather;
	const trend = weather.pressureTrend;
	return (
		typeof weather.fetchedAt === "number" &&
		Date.now() - weather.fetchedAt < WEATHER_CACHE_TTL_MS &&
		typeof weather.temperatureC === "number" &&
		(typeof weather.dewPointC === "number" || weather.dewPointC === null) &&
		(typeof weather.cloudCoverPercent === "number" ||
			weather.cloudCoverPercent === null) &&
		typeof weather.moonrise === "string" &&
		(weather.pollen === null || typeof weather.pollen === "object") &&
		(trend === "rising" ||
			trend === "falling" ||
			trend === "steady" ||
			trend === null)
	);
}

function formatIsoClockTime(isoLocal: string | null | undefined): string {
	if (!isoLocal) return "--:--";
	const timePart = isoLocal.split("T")[1];
	return timePart ? timePart.slice(0, 5) : isoLocal;
}

interface WeatherMetric {
	key: string;
	label: string;
	value: string;
	detail: string;
	detailClassName?: string;
}

function formatOptional(value: number | null, digits: number, unit: string): string {
	if (value === null) return "--";
	return `${value.toFixed(digits)}${unit}`;
}

function buildWeatherMetrics(weather: EdinburghWeather): {
	primary: WeatherMetric[];
	secondary: WeatherMetric[];
} {
	const pollen = describePollen(weather.pollen);
	const primary: WeatherMetric[] = [
		{
			key: "precipitation",
			label: "Precipitation",
			value: `${weather.precipitationMm.toFixed(1)} mm`,
			detail: "Current hour",
		},
		{
			key: "wind",
			label: "Wind",
			value: `${weather.windSpeedKmh.toFixed(1)} km/h`,
			detail: `${degreesToCardinal(weather.windDirectionDeg)} (${weather.windDirectionDeg}°) · Gusts ${weather.windGustsKmh.toFixed(0)} km/h`,
			detailClassName: "font-mono",
		},
		{
			key: "dew-point",
			label: "Dew Point",
			value: formatOptional(weather.dewPointC, 1, "°C"),
			detail: weather.dewPointC === null ? "Unavailable" : "At 2 m",
		},
		{
			key: "pressure",
			label: "Pressure",
			value: `${weather.pressureHpa} hPa`,
			detail: describePressureTrend(weather.pressureTrend),
		},
		{
			key: "cloud-cover",
			label: "Cloud Cover",
			value:
				weather.cloudCoverPercent === null
					? "--"
					: `${weather.cloudCoverPercent}%`,
			detail:
				weather.cloudCoverPercent === null
					? "Unavailable"
					: describeCloudCover(weather.cloudCoverPercent),
		},
		{
			key: "humidity",
			label: "Humidity",
			value: `${weather.humidityPercent}%`,
			detail: "Relative humidity",
		},
	];

	const aqi = weather.aqiEuropean ?? weather.aqiUs;
	const secondary: WeatherMetric[] = [
		{
			key: "uv",
			label: "UV Index",
			value: weather.uvIndex.toFixed(1),
			detail: `${describeUvIndex(weather.uvIndex)} exposure`,
		},
		{
			key: "aqi",
			label: "Air Quality (AQI)",
			value: aqi === null ? "--" : String(aqi),
			detail:
				weather.pm25 === null
					? describeAqi(aqi)
					: `${describeAqi(aqi)} · PM2.5 ${weather.pm25.toFixed(1)}`,
		},
		{
			key: "daylight",
			label: "Daylight",
			value: `↑ ${weather.sunrise}`,
			detail: `↓ ${weather.sunset} sunset`,
			detailClassName: "font-mono",
		},
		{
			key: "moon",
			label: "Moon",
			value: describeMoonPhase(weather.moonPhase),
			detail: `↑ ${weather.moonrise} · ↓ ${weather.moonset}`,
			detailClassName: "font-mono",
		},
		{
			key: "visibility",
			label: "Visibility",
			value: `${weather.visibilityKm} km`,
			detail: "Horizontal range",
		},
		{
			key: "pollen",
			label: "Pollen",
			value: pollen.value,
			detail: pollen.detail,
		},
	];

	return { primary, secondary };
}

function WeatherMetricCard({ metric }: { metric: WeatherMetric }) {
	return (
		<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
			<div className="text-xs text-[#adadad]">{metric.label}</div>
			<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
				{metric.value}
			</div>
			<div
				className={`mt-0.5 text-[11px] leading-4 text-[#adadad] ${metric.detailClassName ?? ""}`}
			>
				{metric.detail}
			</div>
		</div>
	);
}

function MetricGrid({
	metrics,
	className,
	label,
}: {
	metrics: WeatherMetric[];
	className: string;
	label: string;
}) {
	return (
		<div className={className} role="group" aria-label={label}>
			{metrics.map((metric) => (
				<WeatherMetricCard key={metric.key} metric={metric} />
			))}
		</div>
	);
}

const PAGER_BUTTON_CLASS =
	"flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[#303030] border-t-[#3d3d3d] bg-[#1f1f1f] text-[#adadad] hover:border-[#3d3d3d] hover:bg-[#292929] hover:text-[#ffffff] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#479ef5] disabled:cursor-default disabled:opacity-40 disabled:hover:border-[#303030] disabled:hover:bg-[#1f1f1f] disabled:hover:text-[#adadad]";

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
	return (
		<svg
			viewBox="0 0 20 20"
			fill="currentColor"
			aria-hidden="true"
			className={`h-4 w-4 ${direction === "left" ? "rotate-90" : "-rotate-90"}`}
		>
			<path
				fillRule="evenodd"
				d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
				clipRule="evenodd"
			/>
		</svg>
	);
}

interface FormattedClock {
	dateStr: string;
	timeStr: string;
	tzShort: string;
	utcOffset: string;
}

function formatEdinburghClock(now: Date): FormattedClock {
	const tzShort =
		TZ_SHORT_FORMATTER.formatToParts(now).find(
			(p) => p.type === "timeZoneName",
		)?.value ?? "GMT";
	const rawLongOffset =
		TZ_OFFSET_FORMATTER.formatToParts(now).find(
			(p) => p.type === "timeZoneName",
		)?.value ?? "GMT+00:00";
	const utcOffset = rawLongOffset.replace("GMT", "UTC");

	return {
		dateStr: DATE_FORMATTER.format(now),
		timeStr: TIME_FORMATTER.format(now),
		tzShort,
		utcOffset: utcOffset === "UTC" ? "UTC+00:00" : utcOffset,
	};
}

function EdinburghLiveClock() {
	const [clock, setClock] = useState<FormattedClock | null>(null);
	const rowRef = useRef<HTMLDivElement | null>(null);
	const dateRef = useRef<HTMLDivElement | null>(null);
	const [dateOnOwnLine, setDateOnOwnLine] = useState(false);

	useEffect(() => {
		const tick = () => {
			setClock(formatEdinburghClock(new Date()));
		};
		tick();
		const intervalId = window.setInterval(tick, 1000);
		return () => window.clearInterval(intervalId);
	}, []);

	useEffect(() => {
		const row = rowRef.current;
		const date = dateRef.current;
		if (!row || !date) return;

		const measure = () => {
			const place = row.firstElementChild;
			if (!place) return;
			const onOwnLine =
				date.getBoundingClientRect().top >=
				place.getBoundingClientRect().bottom - 1;
			setDateOnOwnLine(onOwnLine);
		};

		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(row);
		observer.observe(date);
		return () => observer.disconnect();
	}, []);

	return (
		<div
			ref={rowRef}
			className="flex w-full flex-wrap items-center justify-between gap-3 md:w-auto md:justify-start md:gap-5"
		>
			<div>
				<div className="text-sm font-semibold leading-5 text-[#ffffff]">
					Edinburgh, Scotland
				</div>
				<div className="text-xs leading-4 text-[#adadad]">
					Europe/London ·{" "}
					{clock ? `${clock.utcOffset} (${clock.tzShort})` : "UTC+00:00"}
				</div>
			</div>

			<div className="hidden h-7 w-px bg-[#292929] md:block" />

			{/* Live Time & Date */}
			<div
				ref={dateRef}
				className={dateOnOwnLine ? "text-left" : "text-right md:text-left"}
			>
				<div className="font-mono text-base font-semibold leading-5 text-[#ffffff] tabular-nums sm:text-lg">
					{clock ? clock.timeStr : "--:--:--"}
				</div>
				<div className="text-xs leading-4 text-[#adadad]">
					{clock ? clock.dateStr : "Syncing clock…"}
				</div>
			</div>
		</div>
	);
}

export function EdinburghStatus() {
	const [weather, setWeather] = useState<EdinburghWeather | null>(null);
	const [weatherError, setWeatherError] = useState(false);
	const [isExpanded, setIsExpanded] = useState(false);
	const [metricPage, setMetricPage] = useState(0);
	const containerRef = useRef<HTMLElement | null>(null);
	const swipeStart = useRef<{ x: number; y: number } | null>(null);

	useEffect(() => {
		return () => {
			delete document.documentElement.dataset.weatherExpanded;
			delete document.documentElement.dataset.weatherClosing;
		};
	}, []);

	useEffect(() => {
		if (!isExpanded) setMetricPage(0);
	}, [isExpanded]);

	useLayoutEffect(() => {
		const root = document.documentElement;

		if (isExpanded) {
			delete root.dataset.weatherClosing;
			root.dataset.weatherExpanded = "true";

			const handlePointerDown = (event: PointerEvent) => {
				if (
					containerRef.current &&
					!containerRef.current.contains(event.target as Node)
				) {
					setIsExpanded(false);
				}
			};

			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key === "Escape") setIsExpanded(false);
			};

			document.addEventListener("pointerdown", handlePointerDown);
			document.addEventListener("keydown", handleKeyDown);
			return () => {
				document.removeEventListener("pointerdown", handlePointerDown);
				document.removeEventListener("keydown", handleKeyDown);
			};
		}

		if (root.dataset.weatherExpanded !== "true") {
			return;
		}

		// Hand the blurred sections to a fade-out style for the same 150ms as the flyout.
		delete root.dataset.weatherExpanded;
		root.dataset.weatherClosing = "true";
		const timeout = window.setTimeout(() => {
			delete root.dataset.weatherClosing;
		}, 150);
		return () => window.clearTimeout(timeout);
	}, [isExpanded]);

	useEffect(() => {
		let isMounted = true;

		const loadWeather = async (forceRefresh = false) => {
			if (!forceRefresh) {
				try {
					const rawCached = window.sessionStorage.getItem(WEATHER_CACHE_KEY);
					if (rawCached) {
						const parsed: unknown = JSON.parse(rawCached);
						if (isFreshWeatherCache(parsed)) {
							if (isMounted) {
								setWeather(parsed);
								setWeatherError(false);
							}
							return;
						}
					}
				} catch {
					// Ignore storage errors
				}
			}

			try {
				const [weatherRes, aqiRes] = await Promise.all([
					fetch(OPEN_METEO_WEATHER_URL, {
						headers: { Accept: "application/json" },
					}),
					fetch(OPEN_METEO_AQI_URL, {
						headers: { Accept: "application/json" },
					}).catch(() => null),
				]);

				if (!weatherRes.ok) {
					throw new Error(`Open-Meteo HTTP ${weatherRes.status}`);
				}

				const weatherData = (await weatherRes.json()) as {
					current?: {
						time?: string;
						temperature_2m?: number;
						apparent_temperature?: number;
						relative_humidity_2m?: number;
						precipitation?: number;
						weather_code?: number;
						surface_pressure?: number;
						wind_speed_10m?: number;
						wind_direction_10m?: number;
						wind_gusts_10m?: number;
						visibility?: number;
						uv_index?: number;
						dew_point_2m?: number;
						cloud_cover?: number;
					};
					hourly?: {
						time?: string[];
						surface_pressure?: Array<number | null>;
						pressure_msl?: Array<number | null>;
					};
					daily?: {
						sunrise?: Array<string | null>;
						sunset?: Array<string | null>;
						moon_phase?: Array<number | null>;
						moonrise?: Array<string | null>;
						moonset?: Array<string | null>;
						uv_index_max?: number[];
					};
				};

				let aqiEuropean: number | null = null;
				let aqiUs: number | null = null;
				let pm25: number | null = null;
				let pollen: PollenCounts | null = null;

				if (aqiRes && aqiRes.ok) {
					const aqiData = (await aqiRes.json()) as {
						current?: {
							european_aqi?: number;
							us_aqi?: number;
							pm2_5?: number;
							alder_pollen?: number | null;
							birch_pollen?: number | null;
							grass_pollen?: number | null;
							mugwort_pollen?: number | null;
							olive_pollen?: number | null;
							ragweed_pollen?: number | null;
						};
					};
					const current = aqiData.current;
					if (typeof current?.european_aqi === "number") {
						aqiEuropean = Math.round(current.european_aqi);
					}
					if (typeof current?.us_aqi === "number") {
						aqiUs = Math.round(current.us_aqi);
					}
					if (typeof current?.pm2_5 === "number") {
						pm25 = current.pm2_5;
					}
					const pollenCount = (value: number | null | undefined) =>
						typeof value === "number" ? value : null;
					if (current) {
						pollen = {
							alder: pollenCount(current.alder_pollen),
							birch: pollenCount(current.birch_pollen),
							grass: pollenCount(current.grass_pollen),
							mugwort: pollenCount(current.mugwort_pollen),
							olive: pollenCount(current.olive_pollen),
							ragweed: pollenCount(current.ragweed_pollen),
						};
					}
				}

				const c = weatherData.current;
				const temp = c?.temperature_2m;
				if (typeof temp !== "number") {
					throw new Error("Missing temperature_2m");
				}

				const code = c?.weather_code ?? 0;
				const visibilityMeters = c?.visibility ?? 10000;

				const payload: EdinburghWeather = {
					temperatureC: temp,
					feelsLikeC: c?.apparent_temperature ?? temp,
					weatherCode: code,
					conditionText: describeWmoWeatherCode(code),
					humidityPercent: Math.round(c?.relative_humidity_2m ?? 0),
					precipitationMm: c?.precipitation ?? 0,
					windSpeedKmh: c?.wind_speed_10m ?? 0,
					windGustsKmh: c?.wind_gusts_10m ?? 0,
					windDirectionDeg: c?.wind_direction_10m ?? 0,
					pressureHpa: Math.round(c?.surface_pressure ?? 1013),
					pressureTrend: derivePressureTrend(
						weatherData.hourly?.time,
						weatherData.hourly?.surface_pressure ??
							weatherData.hourly?.pressure_msl,
						c?.time,
					),
					visibilityKm: Number((visibilityMeters / 1000).toFixed(1)),
					dewPointC:
						typeof c?.dew_point_2m === "number" ? c.dew_point_2m : null,
					cloudCoverPercent:
						typeof c?.cloud_cover === "number"
							? Math.round(c.cloud_cover)
							: null,
					uvIndex:
						c?.uv_index ?? weatherData.daily?.uv_index_max?.[0] ?? 0,
					sunrise: formatIsoClockTime(weatherData.daily?.sunrise?.[0]),
					sunset: formatIsoClockTime(weatherData.daily?.sunset?.[0]),
					moonPhase:
						typeof weatherData.daily?.moon_phase?.[0] === "number"
							? weatherData.daily.moon_phase[0]
							: null,
					moonrise: formatIsoClockTime(weatherData.daily?.moonrise?.[0]),
					moonset: formatIsoClockTime(weatherData.daily?.moonset?.[0]),
					aqiEuropean,
					aqiUs,
					pm25,
					pollen,
					fetchedAt: Date.now(),
				};

				try {
					window.sessionStorage.setItem(
						WEATHER_CACHE_KEY,
						JSON.stringify(payload),
					);
				} catch {
					// Ignore storage errors
				}

				if (isMounted) {
					setWeather(payload);
					setWeatherError(false);
				}
			} catch {
				if (isMounted) {
					setWeatherError(true);
				}
			}
		};

		loadWeather(false);
		const refreshTimer = window.setInterval(
			() => loadWeather(true),
			WEATHER_CACHE_TTL_MS,
		);

		return () => {
			isMounted = false;
			window.clearInterval(refreshTimer);
		};
	}, []);

	const metricGroups = weather ? buildWeatherMetrics(weather) : null;
	const visibleMetrics =
		metricPage === 0 ? metricGroups?.primary : metricGroups?.secondary;

	const showPreviousMetrics = () => {
		setMetricPage((page) => Math.max(page - 1, 0));
	};

	const showNextMetrics = () => {
		setMetricPage((page) => Math.min(page + 1, METRIC_PAGE_COUNT - 1));
	};

	const onMetricTouchStart = (event: TouchEvent<HTMLDivElement>) => {
		if ((event.target as HTMLElement).closest("button")) {
			swipeStart.current = null;
			return;
		}
		const touch = event.changedTouches[0];
		if (!touch) return;
		swipeStart.current = { x: touch.clientX, y: touch.clientY };
	};

	const onMetricTouchEnd = (event: TouchEvent<HTMLDivElement>) => {
		const origin = swipeStart.current;
		swipeStart.current = null;
		if (!origin) return;
		const touch = event.changedTouches[0];
		if (!touch) return;
		const dx = touch.clientX - origin.x;
		const dy = touch.clientY - origin.y;
		if (Math.abs(dx) < SWIPE_THRESHOLD_PX || Math.abs(dx) <= Math.abs(dy)) {
			return;
		}
		if (dx < 0) showNextMetrics();
		else showPreviousMetrics();
	};

	return (
		<aside
			ref={containerRef}
			aria-label="Edinburgh Live Time and Weather"
			className="relative z-50 w-full"
		>
			{/* Fluent 2 Card Surface: #141414, 8px radius, 1px #292929 border with top specular highlight */}
			<div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#292929] border-t-[#383838] bg-[#141414] px-4 py-3 text-sm text-[#d6d6d6] md:gap-4">
				{/* Left: Location & Live Clock (isolated 1s re-render boundary) */}
				<EdinburghLiveClock />

				{/* Right: Fluent 2 Button Trigger for Weather Flyout */}
				<div className="flex w-full items-center md:w-auto">
					{weather ? (
						<button
							type="button"
							onClick={() => setIsExpanded((prev) => !prev)}
							aria-expanded={isExpanded}
							aria-controls="edinburgh-weather-dropdown"
							className={`group flex w-full cursor-pointer items-center justify-between gap-4 rounded-md border px-3.5 py-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#479ef5] md:w-auto md:justify-start ${
								isExpanded
									? "border-[#479ef5] border-t-[#62abf5] bg-[#18202c]"
									: "border-[#303030] border-t-[#3d3d3d] bg-[#1f1f1f] hover:border-[#3d3d3d] hover:bg-[#292929] active:bg-[#1a1a1a]"
							}`}
						>
							<div className="pointer-events-none flex items-baseline gap-2">
								<span className="font-mono text-sm font-semibold text-[#ffffff] tabular-nums sm:text-base">
									{weather.temperatureC.toFixed(1)}°C
								</span>
								<span className="text-xs text-[#d6d6d6]">
									{weather.conditionText}
								</span>
							</div>

							<div className="pointer-events-none flex items-center gap-2.5">
								<span className="text-xs text-[#adadad]">
									Feels like {weather.feelsLikeC.toFixed(1)}°C
								</span>
								<svg
									viewBox="0 0 20 20"
									fill="currentColor"
									aria-hidden="true"
									className={`h-4 w-4 shrink-0 transition-transform duration-150 ease-out group-hover:text-[#ffffff] ${
										isExpanded ? "rotate-180 text-[#62abf5]" : "text-[#adadad]"
									}`}
								>
									<path
										fillRule="evenodd"
										d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z"
										clipRule="evenodd"
									/>
								</svg>
							</div>
						</button>
					) : (
						<div className="w-full rounded-md border border-[#292929] bg-[#1f1f1f] px-3.5 py-2 text-xs text-[#adadad] md:w-auto">
							{weatherError ? "Weather unavailable" : "Loading weather…"}
						</div>
					)}
				</div>
			</div>

			{/* Fluent 2 Flyout Surface (#202020). Fades in place so closing does not shift it. */}
			{weather && (
				<div
					id="edinburgh-weather-dropdown"
					aria-hidden={!isExpanded}
					inert={!isExpanded ? true : undefined}
					className={`absolute right-0 left-0 z-50 mt-2 rounded-lg border border-[#333333] border-t-[#424242] bg-[#202020] p-4 transition-[opacity,visibility] duration-150 ease-out [contain:layout_style_paint] sm:p-5 ${
						isExpanded
							? "visible opacity-100"
							: "invisible pointer-events-none opacity-0"
					}`}
				>
					{metricGroups && visibleMetrics && (
						<>
							<div
								className="touch-pan-y lg:hidden"
								onTouchStart={onMetricTouchStart}
								onTouchEnd={onMetricTouchEnd}
							>
								<div className="mb-2.5 flex items-center justify-between gap-3">
									<button
										type="button"
										className={PAGER_BUTTON_CLASS}
										aria-label="Show previous conditions"
										disabled={metricPage === 0}
										onClick={showPreviousMetrics}
									>
										<ChevronIcon direction="left" />
									</button>
									<p
										className="font-mono text-xs text-[#adadad] tabular-nums"
										aria-live="polite"
									>
										{metricPage + 1} / {METRIC_PAGE_COUNT}
									</p>
									<button
										type="button"
										className={PAGER_BUTTON_CLASS}
										aria-label="Show next conditions"
										disabled={metricPage === METRIC_PAGE_COUNT - 1}
										onClick={showNextMetrics}
									>
										<ChevronIcon direction="right" />
									</button>
								</div>
								<MetricGrid
									metrics={visibleMetrics}
									label={
										metricPage === 0
											? "Primary conditions"
											: "More conditions"
									}
									className="grid touch-pan-y grid-cols-2 gap-2.5 sm:grid-cols-3"
								/>
							</div>
							<MetricGrid
								metrics={[...metricGroups.primary, ...metricGroups.secondary]}
								label="Atmospheric conditions"
								className="hidden gap-2.5 lg:grid lg:grid-cols-4"
							/>
						</>
					)}
							</div>
						)}
		</aside>
	);
}
