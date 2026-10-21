import { useEffect } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/home";
import { EdinburghStatus } from "../components/EdinburghStatus";
import { FitbitSection } from "../components/FitbitSection";
import { ProfileGrid } from "../components/ProfileGrid";
import { SpaceBackground } from "../components/SpaceBackground";

/**
 * Smooths discrete mouse-wheel notches. Trackpads and touch stay native.
 * A notch eases into place instead of jumping most of the distance on the
 * first frame, and the smaller events that follow it stay in the same glide
 * so they do not scroll the page underneath the animation.
 */
function useFastWheelSmoothScroll() {
	useEffect(() => {
		if (
			typeof window === "undefined" ||
			window.matchMedia("(prefers-reduced-motion: reduce)").matches
		) {
			return;
		}

		// About a quarter of a second to settle one notch, at any refresh rate.
		const STIFFNESS = 22;
		const MAX_FRAME_SECONDS = 1 / 60;
		const STOP_PX = 0.5;
		// A notch often arrives as one large event plus a few smaller ones.
		const GESTURE_TAIL_MS = 160;

		let currentY = window.scrollY;
		let targetY = window.scrollY;
		let expectedY = window.scrollY;
		let maxScrollY = 0;
		let rafId: number | null = null;
		let lastFrameTime = 0;
		let gestureUntil = 0;

		const stop = () => {
			if (rafId !== null) {
				window.cancelAnimationFrame(rafId);
				rafId = null;
			}
			lastFrameTime = 0;
		};

		const applyScroll = (y: number) => {
			expectedY = y;
			window.scrollTo(0, y);
		};

		const step = (now: number) => {
			const dt =
				lastFrameTime > 0
					? Math.min(MAX_FRAME_SECONDS, (now - lastFrameTime) / 1000)
					: MAX_FRAME_SECONDS;
			lastFrameTime = now;

			const alpha = 1 - Math.exp(-STIFFNESS * dt);
			currentY += (targetY - currentY) * alpha;

			if (Math.abs(targetY - currentY) < STOP_PX) {
				currentY = targetY;
				applyScroll(targetY);
				rafId = null;
				lastFrameTime = 0;
				return;
			}

			applyScroll(currentY);
			rafId = window.requestAnimationFrame(step);
		};

		const handleScroll = () => {
			if (Math.abs(window.scrollY - expectedY) <= 1) {
				return;
			}
			currentY = window.scrollY;
			targetY = currentY;
			expectedY = currentY;
			stop();
		};

		const handleWheel = (event: WheelEvent) => {
			if (
				event.defaultPrevented ||
				event.ctrlKey ||
				event.metaKey ||
				event.shiftKey ||
				event.altKey ||
				Math.abs(event.deltaY) <= Math.abs(event.deltaX)
			) {
				return;
			}

			const now = performance.now();
			const isDiscreteMouseWheel =
				event.deltaMode !== 0 || Math.abs(event.deltaY) >= 48;
			if (!isDiscreteMouseWheel && now >= gestureUntil) {
				return;
			}

			event.preventDefault();
			gestureUntil = now + GESTURE_TAIL_MS;

			if (rafId === null) {
				currentY = window.scrollY;
				targetY = window.scrollY;
				expectedY = currentY;
			}

			maxScrollY = Math.max(
				0,
				document.documentElement.scrollHeight - window.innerHeight,
			);
			const deltaPx =
				event.deltaMode === 1
					? event.deltaY * 40
					: event.deltaMode === 2
						? event.deltaY * window.innerHeight
						: event.deltaY;
			targetY = Math.max(0, Math.min(maxScrollY, targetY + deltaPx));

			if (rafId === null && Math.abs(targetY - currentY) >= STOP_PX) {
				lastFrameTime = 0;
				rafId = window.requestAnimationFrame(step);
			}
		};

		window.addEventListener("wheel", handleWheel, { passive: false });
		window.addEventListener("scroll", handleScroll, { passive: true });
		return () => {
			window.removeEventListener("wheel", handleWheel);
			window.removeEventListener("scroll", handleScroll);
			stop();
		};
	}, []);
}

export function meta({}: Route.MetaArgs) {
	return [
		{ title: "Abhijith Ganesan" },
		{
			name: "description",
			content: "You’ve reached the digital space of Abhijith Ganesan.",
		},
	];
}

export default function Home() {
	useFastWheelSmoothScroll();

	return (
		<div className="relative min-h-dvh text-[#ffffff]">
			{/* 1. Full-viewport Static Starfield + GPU-Composited Comets */}
			<SpaceBackground />

			{/* 2. Top Header / Edinburgh Live Status Bar (Fluent 2 Surface) */}
			<header className="sticky top-0 z-40 mx-auto w-full max-w-5xl px-4 pt-4 sm:px-6">
				<EdinburghStatus />
			</header>

			{/* 3. Main Hero + Phyllotaxis Profile Grid (Bounded GPU-cached blur blocks) */}
			<main className="relative z-10 mx-auto flex max-w-5xl flex-col items-center px-4 pt-12 pb-6 sm:px-6 sm:pt-16">
				<div className="weather-blur-target max-w-3xl text-center">
					<p className="text-base font-normal leading-6 text-[#adadad] sm:text-lg">
						You&rsquo;ve reached the digital space of
					</p>
					<h1 className="mt-2 font-display text-5xl font-semibold tracking-tight text-[#ffffff] sm:text-7xl">
						Abhijith Ganesan
					</h1>
					<p className="mx-auto mt-3 max-w-xl text-base leading-6 text-[#adadad] sm:text-lg">
						Explore the links below, or stay and watch the night sky.
					</p>
				</div>

				{/* Golden-angle spiral of external profile links */}
				<div className="weather-blur-target mt-6 flex justify-center">
					<ProfileGrid />
				</div>
			</main>

			{/* 4. Live Fitbit Air Section + Footer (Bounded GPU-cached blur blocks) */}
			<div className="relative z-10 mx-auto max-w-5xl">
				<div className="weather-blur-target">
					<FitbitSection />
				</div>

				<footer className="weather-blur-target border-t border-[#242424] px-4 py-8 text-center font-mono text-xs text-[#adadad] sm:px-6">
					<p>
						React Router v8 · Cloudflare Workers · Vite 8 · Tailwind CSS v4 ·
						TypeScript 7 · HTML5 Canvas · Open-Meteo · Google Health API
					</p>
					<p className="mt-3">
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
				</footer>
			</div>
		</div>
	);
}
