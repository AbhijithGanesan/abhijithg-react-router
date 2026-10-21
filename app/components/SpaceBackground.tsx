import { useEffect, useRef } from "react";

interface Star {
	nx: number;
	ny: number;
	radius: number;
	opacity: number;
	rgb: string;
}

const STAR_TINTS = [
	"255, 255, 255",
	"242, 244, 248",
	"216, 230, 255",
	"255, 238, 220",
];

/**
 * Draws the comet trail + glowing head once onto a small 220x16 canvas.
 * The GPU compositor then moves and fades this small canvas element across the
 * screen via the Web Animations API (`element.animate`) at the monitor's native
 * refresh rate with 0% per-frame main-thread CPU usage.
 */
function paintCometSprite(canvas: HTMLCanvasElement) {
	const w = 220;
	const h = 16;
	canvas.width = w;
	canvas.height = h;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;

	ctx.clearRect(0, 0, w, h);
	const cy = h / 2;
	const headX = w - 10;

	// Tail gradient (pointing left from headX to 0)
	const tailGrad = ctx.createLinearGradient(headX, cy, 0, cy);
	tailGrad.addColorStop(0, "rgba(255, 255, 255, 0.95)");
	tailGrad.addColorStop(0.2, "rgba(220, 235, 255, 0.65)");
	tailGrad.addColorStop(0.55, "rgba(160, 195, 255, 0.2)");
	tailGrad.addColorStop(1, "rgba(0, 0, 0, 0)");

	ctx.strokeStyle = tailGrad;
	ctx.lineWidth = 2;
	ctx.lineCap = "round";
	ctx.beginPath();
	ctx.moveTo(headX, cy);
	ctx.lineTo(2, cy);
	ctx.stroke();

	// Soft head glow
	const headGlow = ctx.createRadialGradient(headX, cy, 0, headX, cy, 7);
	headGlow.addColorStop(0, "rgba(255, 255, 255, 1)");
	headGlow.addColorStop(0.4, "rgba(200, 225, 255, 0.45)");
	headGlow.addColorStop(1, "rgba(200, 225, 255, 0)");
	ctx.fillStyle = headGlow;
	ctx.beginPath();
	ctx.arc(headX, cy, 7, 0, Math.PI * 2);
	ctx.fill();
}

/**
 * SpaceBackground
 *
 * Zero-rAF-Loop Architecture:
 * 1. Paints 155–189 random stars ONCE onto a static background `<canvas>` on mount.
 *    Uses 0% continuous CPU/GPU after the initial 1ms paint.
 * 2. Animates occasional comets using a small 220x16 pre-painted `<canvas>`
 *    sprite driven by the native Web Animations API (`element.animate` on
 *    `transform` and `opacity`). Between comets, the sprite is `visibility: hidden`
 *    with zero active animations so the browser's compositor is 100% idle and
 *    high-polling-rate mice (1000 Hz – 8000 Hz) do not trigger `BeginMainFrame`
 *    input flushes when moving across the background.
 */
export function SpaceBackground() {
	const starfieldCanvasRef = useRef<HTMLCanvasElement | null>(null);
	const cometCanvasRef = useRef<HTMLCanvasElement | null>(null);

	useEffect(() => {
		const starCanvas = starfieldCanvasRef.current;
		const cometCanvas = cometCanvasRef.current;
		if (!starCanvas || !cometCanvas) return;

		const ctx = starCanvas.getContext("2d", { alpha: false });
		if (!ctx) return;

		paintCometSprite(cometCanvas);

		// Generate 155–189 random stars once per page load
		const starCount = Math.floor(155 + Math.random() * 35);
		const stars: Star[] = Array.from({ length: starCount }, () => {
			const sizeRoll = Math.random();
			const radius =
				sizeRoll > 0.9
					? 1.55 + Math.random() * 0.75
					: sizeRoll > 0.5
						? 1.0 + Math.random() * 0.45
						: 0.65 + Math.random() * 0.35;

			return {
				nx: Math.random(),
				ny: Math.random(),
				radius,
				opacity: 0.38 + Math.random() * 0.55,
				rgb: STAR_TINTS[Math.floor(Math.random() * STAR_TINTS.length)],
			};
		});

		let width = window.innerWidth;
		let height = window.innerHeight;

		const drawStaticStarfield = () => {
			width = window.innerWidth;
			height = window.innerHeight;
			const dpr = Math.min(window.devicePixelRatio || 1, 2);

			starCanvas.width = Math.floor(width * dpr);
			starCanvas.height = Math.floor(height * dpr);
			ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

			// Fluent 2 deep obsidian background (#08080a)
			ctx.fillStyle = "#08080a";
			ctx.fillRect(0, 0, width, height);

			for (let i = 0; i < stars.length; i++) {
				const s = stars[i];
				const x = s.nx * width;
				const y = s.ny * height;

				if (s.radius > 1.5) {
					const r = s.radius * 3.2;
					const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
					grad.addColorStop(0, `rgba(${s.rgb}, 0.22)`);
					grad.addColorStop(1, `rgba(${s.rgb}, 0)`);
					ctx.fillStyle = grad;
					ctx.beginPath();
					ctx.arc(x, y, r, 0, Math.PI * 2);
					ctx.fill();
				}

				ctx.fillStyle = `rgba(${s.rgb}, ${s.opacity.toFixed(3)})`;
				ctx.beginPath();
				ctx.arc(x, y, s.radius, 0, Math.PI * 2);
				ctx.fill();
			}
		};

		drawStaticStarfield();

		const reducedMotionQuery = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		);
		let prefersReducedMotion = reducedMotionQuery.matches;

		let cometAnim: Animation | null = null;

		const launchComet = () => {
			if (prefersReducedMotion || document.hidden) return;

			const fromLeft = Math.random() > 0.35;
			const startX = fromLeft
				? Math.random() * width * 0.55
				: width * (0.45 + Math.random() * 0.45);
			const startY = Math.random() * height * 0.45;

			const angleDeg = fromLeft
				? 18 + Math.random() * 22
				: 140 + Math.random() * 22;
			const angleRad = (angleDeg * Math.PI) / 180;
			const travelDistance = 360 + Math.random() * 260;

			const endX = startX + Math.cos(angleRad) * travelDistance;
			const endY = startY + Math.sin(angleRad) * travelDistance;
			const durationMs = 1350 + Math.random() * 450;

			cometAnim?.cancel();
			cometCanvas.style.visibility = "visible";

			const anim = cometCanvas.animate(
				[
					{
						transform: `translate3d(${startX.toFixed(1)}px, ${startY.toFixed(1)}px, 0) rotate(${angleDeg.toFixed(1)}deg) scale(0.85)`,
						opacity: 0,
					},
					{
						opacity: 0.95,
						offset: 0.2,
					},
					{
						opacity: 0.85,
						offset: 0.75,
					},
					{
						transform: `translate3d(${endX.toFixed(1)}px, ${endY.toFixed(1)}px, 0) rotate(${angleDeg.toFixed(1)}deg) scale(1)`,
						opacity: 0,
					},
				],
				{
					duration: durationMs,
					easing: "linear",
				},
			);

			anim.onfinish = () => {
				cometCanvas.style.visibility = "hidden";
				if (cometAnim === anim) {
					cometAnim = null;
				}
			};
			anim.oncancel = () => {
				cometCanvas.style.visibility = "hidden";
			};

			cometAnim = anim;
		};

		let cometIntervalId: number | null = null;

		const startAmbientTimers = () => {
			if (prefersReducedMotion) return;

			launchComet();
			cometIntervalId = window.setInterval(() => {
				launchComet();
			}, 6000);
		};

		const stopAmbientTimers = () => {
			if (cometIntervalId !== null) {
				window.clearInterval(cometIntervalId);
				cometIntervalId = null;
			}
			cometAnim?.cancel();
			cometAnim = null;
			cometCanvas.style.visibility = "hidden";
		};

		const handleMotionChange = (event: MediaQueryListEvent) => {
			prefersReducedMotion = event.matches;
			if (prefersReducedMotion) {
				stopAmbientTimers();
			} else {
				startAmbientTimers();
			}
		};

		startAmbientTimers();

		window.addEventListener("resize", drawStaticStarfield, { passive: true });
		reducedMotionQuery.addEventListener("change", handleMotionChange);

		return () => {
			stopAmbientTimers();
			window.removeEventListener("resize", drawStaticStarfield);
			reducedMotionQuery.removeEventListener("change", handleMotionChange);
		};
	}, []);

	return (
		<div
			aria-hidden="true"
			className="pointer-events-none fixed inset-0 z-0 overflow-hidden [contain:strict]"
		>
			<canvas
				ref={starfieldCanvasRef}
				className=" block h-full w-full"
			/>
			<canvas
				ref={cometCanvasRef}
				style={{ visibility: "hidden" }}
				className="absolute top-0 left-0 h-4 w-[220px] origin-right opacity-0"
			/>
		</div>
	);
}
