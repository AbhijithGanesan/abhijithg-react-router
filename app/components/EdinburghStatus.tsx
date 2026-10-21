import { useEffect, useLayoutEffect, useRef, useState } from "react";

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
	visibilityKm: number;
	uvIndex: number;
	sunrise: string;
	sunset: string;
	aqiEuropean: number | null;
	aqiUs: number | null;
	pm25: number | null;
	fetchedAt: number;
}

const WEATHER_CACHE_KEY = "edinburgh_open_meteo_cache_v2";
const WEATHER_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

const OPEN_METEO_WEATHER_URL =
	"https://api.open-meteo.com/v1/forecast?latitude=55.9533&longitude=-3.1883&current=temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,weather_code,surface_pressure,wind_speed_10m,wind_direction_10m,wind_gusts_10m,visibility,uv_index&daily=sunrise,sunset,uv_index_max&timezone=Europe%2FLondon&forecast_days=1";

const OPEN_METEO_AQI_URL =
	"https://air-quality-api.open-meteo.com/v1/air-quality?latitude=55.9533&longitude=-3.1883&current=european_aqi,us_aqi,pm2_5&timezone=Europe%2FLondon";

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

function formatIsoClockTime(isoLocal: string | undefined): string {
	if (!isoLocal) return "--:--";
	const timePart = isoLocal.split("T")[1];
	return timePart ? timePart.slice(0, 5) : isoLocal;
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
	const containerRef = useRef<HTMLElement | null>(null);

	useEffect(() => {
		return () => {
			delete document.documentElement.dataset.weatherExpanded;
			delete document.documentElement.dataset.weatherClosing;
		};
	}, []);

	useLayoutEffect(() => {
		const root = document.documentElement;

		if (isExpanded) {
			delete root.dataset.weatherClosing;
			root.dataset.weatherExpanded = "true";

			const handlePointerDown = (event: MouseEvent) => {
				if (
					containerRef.current &&
					!containerRef.current.contains(event.target as Node)
				) {
					setIsExpanded(false);
				}
			};

			const handleKeyDown = (event: KeyboardEvent) => {
				if (event.key === "Escape") {
					setIsExpanded(false);
				}
			};

			document.addEventListener("mousedown", handlePointerDown);
			document.addEventListener("keydown", handleKeyDown);
			return () => {
				document.removeEventListener("mousedown", handlePointerDown);
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
						const parsed = JSON.parse(rawCached) as EdinburghWeather;
						if (Date.now() - parsed.fetchedAt < WEATHER_CACHE_TTL_MS) {
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
					};
					daily?: {
						sunrise?: string[];
						sunset?: string[];
						uv_index_max?: number[];
					};
				};

				let aqiEuropean: number | null = null;
				let aqiUs: number | null = null;
				let pm25: number | null = null;

				if (aqiRes && aqiRes.ok) {
					const aqiData = (await aqiRes.json()) as {
						current?: {
							european_aqi?: number;
							us_aqi?: number;
							pm2_5?: number;
						};
					};
					if (typeof aqiData.current?.european_aqi === "number") {
						aqiEuropean = Math.round(aqiData.current.european_aqi);
					}
					if (typeof aqiData.current?.us_aqi === "number") {
						aqiUs = Math.round(aqiData.current.us_aqi);
					}
					if (typeof aqiData.current?.pm2_5 === "number") {
						pm25 = aqiData.current.pm2_5;
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
					visibilityKm: Number((visibilityMeters / 1000).toFixed(1)),
					uvIndex:
						c?.uv_index ?? weatherData.daily?.uv_index_max?.[0] ?? 0,
					sunrise: formatIsoClockTime(weatherData.daily?.sunrise?.[0]),
					sunset: formatIsoClockTime(weatherData.daily?.sunset?.[0]),
					aqiEuropean,
					aqiUs,
					pm25,
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
					<div className="pointer-events-none mb-3.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#2e2e2e] pb-2.5">
						<div className="text-sm font-semibold text-[#ffffff]">
							Edinburgh Atmospheric Conditions
						</div>
						<div className="font-mono text-xs text-[#adadad]">
							55.9533°N, 3.1883°W · Europe/London
						</div>
					</div>

					<div className="pointer-events-none grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
									{/* 1. Feels Like */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">Feels Like</div>
										<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
											{weather.feelsLikeC.toFixed(1)}°C
										</div>
										<div className="mt-0.5 text-[11px] text-[#adadad]">
											Actual {weather.temperatureC.toFixed(1)}°C
										</div>
									</div>

									{/* 2. Sunrise & Sunset */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">Daylight</div>
										<div className="mt-1 font-mono text-sm font-semibold text-[#ffffff] tabular-nums">
											↑ {weather.sunrise}
										</div>
										<div className="mt-0.5 font-mono text-xs text-[#d6d6d6] tabular-nums">
											↓ {weather.sunset} sunset
										</div>
									</div>

									{/* 3. UV Index */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">UV Index</div>
										<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
											{weather.uvIndex.toFixed(1)}
										</div>
										<div className="mt-0.5 text-[11px] text-[#adadad]">
											{describeUvIndex(weather.uvIndex)} exposure
										</div>
									</div>

									{/* 4. Air Quality Index */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">
											Air Quality (AQI)
										</div>
										<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
											{weather.aqiEuropean ?? weather.aqiUs ?? "--"}
										</div>
										<div className="mt-0.5 text-[11px] text-[#adadad]">
											{describeAqi(weather.aqiEuropean)}
											{weather.pm25 !== null
												? ` · PM2.5 ${weather.pm25.toFixed(1)}`
												: ""}
										</div>
									</div>

									{/* 5. Humidity */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">Humidity</div>
										<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
											{weather.humidityPercent}%
										</div>
										<div className="mt-0.5 text-[11px] text-[#adadad]">
											Relative humidity
										</div>
									</div>

									{/* 6. Precipitation */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">Precipitation</div>
										<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
											{weather.precipitationMm.toFixed(1)} mm
										</div>
										<div className="mt-0.5 text-[11px] text-[#adadad]">
											Current hour
										</div>
									</div>

									{/* 7. Wind Speed & Direction */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">Wind</div>
										<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
											{weather.windSpeedKmh.toFixed(1)} km/h
										</div>
										<div className="mt-0.5 font-mono text-[11px] text-[#adadad]">
											{degreesToCardinal(weather.windDirectionDeg)} (
											{weather.windDirectionDeg}°) · Gusts{" "}
											{weather.windGustsKmh.toFixed(0)} km/h
										</div>
									</div>

									{/* 8. Atmospheric Pressure */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">Pressure</div>
										<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
											{weather.pressureHpa} hPa
										</div>
										<div className="mt-0.5 text-[11px] text-[#adadad]">
											Surface barometric
										</div>
									</div>

									{/* 9. Visibility */}
									<div className="rounded-md border border-[#2e2e2e] bg-[#141414] p-3">
										<div className="text-xs text-[#adadad]">Visibility</div>
										<div className="mt-1 font-mono text-base font-semibold text-[#ffffff] tabular-nums">
											{weather.visibilityKm} km
										</div>
										<div className="mt-0.5 text-[11px] text-[#adadad]">
											Horizontal range
										</div>
									</div>
								</div>
							</div>
						)}
		</aside>
	);
}
