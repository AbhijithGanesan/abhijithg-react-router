export interface ProfileItem {
	name: string;
	handle: string;
	href: string;
	iconPath: string;
	hoverClass: string;
}

/**
 * Phyllotaxis / Vogel's Spiral (1979):
 *
 * Golden Ratio: φ = (1 + √5) / 2 ≈ 1.6180339887
 * Golden Angle: θ₀ = 360° / φ² ≈ 137.508°
 *
 * Polar coordinates for node n:
 *   θ(n) = n × 137.508°
 *   r(n) = c × √n
 */
export const GOLDEN_ANGLE_DEG = 137.508;
export const GOLDEN_ANGLE_RAD = (GOLDEN_ANGLE_DEG * Math.PI) / 180;

export const DEFAULT_PROFILES: ProfileItem[] = [
	{
		name: "GitHub",
		handle: "@AbhijithGanesan",
		href: "https://github.com/AbhijithGanesan",
		hoverClass: "hover:border-[#f0f6fc] hover:text-[#ffffff]",
		iconPath:
			"M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z",
	},
	{
		name: "LinkedIn",
		handle: "in/abhijith-ganesan",
		href: "https://www.linkedin.com/in/abhijith-ganesan",
		hoverClass: "hover:border-[#38bdf8] hover:text-[#38bdf8]",
		iconPath:
			"M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z",
	},
	{
		name: "X",
		handle: "@AbhijithGanesan",
		href: "https://x.com/AbhijithGanesan",
		hoverClass: "hover:border-[#cbd5e1] hover:text-[#ffffff]",
		iconPath:
			"M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z",
	},
	{
		name: "YouTube",
		handle: "@AbhijithGanesan",
		href: "https://www.youtube.com/@AbhijithGanesan",
		hoverClass: "hover:border-[#f87171] hover:text-[#f87171]",
		iconPath:
			"M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z",
	},
	{
		name: "Spotify",
		handle: "abhijith0",
		href: "https://open.spotify.com/user/abhijith0",
		hoverClass: "hover:border-[#4ade80] hover:text-[#4ade80]",
		iconPath:
			"M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z",
	},
	{
		name: "Discord",
		handle: "abhijith",
		href: "https://discord.com/users/117363198205624322",
		hoverClass: "hover:border-[#818cf8] hover:text-[#818cf8]",
		iconPath:
			"M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z",
	},
	{
		name: "Strava",
		handle: "1823241457",
		href: "https://www.strava.com/athletes/1823241457",
		hoverClass: "hover:border-[#fb923c] hover:text-[#fb923c]",
		iconPath:
			"M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169",
	},
	{
		name: "Steam",
		handle: "id/Abhijith",
		href: "https://steamcommunity.com/id/Abhijith",
		hoverClass: "hover:border-[#66c0f4] hover:text-[#66c0f4]",
		iconPath:
			"M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z",
	},
	{
		name: "Twitch",
		handle: "AbhijithGG",
		href: "https://www.twitch.tv/abhijithgg",
		hoverClass: "hover:border-[#c084fc] hover:text-[#c084fc]",
		iconPath:
			"M11.571 4.714h1.715v5.143H11.57zm4.715 0H18v5.143h-1.714zM6 0L1.714 4.286v15.428h5.143V24l4.286-4.286h3.428L22.286 12V0zm14.571 11.143l-3.428 3.428h-3.429l-3 3v-3H6.857V1.714h13.714Z",
	},
];

interface ProfileGridProps {
	profiles?: ProfileItem[];
}

export function ProfileGrid({ profiles = DEFAULT_PROFILES }: ProfileGridProps) {
	const referenceSize = 640;
	// 70 filled the ring when the spiral held 15 marks. Nine marks use a wider step so the outer node stays on that ring.
	const spiralSpacingConstant = 93;

	return (
		<section
			aria-label="Elsewhere on the internet"
			className="relative flex flex-col items-center justify-center py-4"
		>
			<div className="@container relative aspect-square w-[min(94vw,640px)] select-none">
				{/* Subtle Fluent 2 neutral stroke rings */}
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-0 flex items-center justify-center"
				>
					<div className="h-[36%] w-[36%] rounded-full border border-[#242424]" />
					<div className="absolute h-[64%] w-[64%] rounded-full border border-[#1f1f1f]" />
					<div className="absolute h-[90%] w-[90%] rounded-full border border-[#1a1a1a]" />
				</div>

				{/* Phyllotaxis Spiral Nodes (Fluent 2 Circular Controls) */}
				{profiles.map((profile, index) => {
					const theta = index * GOLDEN_ANGLE_RAD;
					const radius = spiralSpacingConstant * Math.sqrt(index);

					const offsetX = radius * Math.cos(theta);
					const offsetY = radius * Math.sin(theta);

					const leftPercent = 50 + (offsetX / referenceSize) * 100;
					const topPercent = 50 + (offsetY / referenceSize) * 100;

					// Diameters are the 640px sizes. They scale with the square, so the
					// center pair keeps its gap on a phone instead of overlapping.
					const sizeClass =
						index === 0
							? "size-[13.125cqw]"
							: index <= 5
								? "size-[11.25cqw]"
								: "size-[10cqw]";

					const iconSizeClass =
						index === 0
							? "size-[5.625cqw]"
							: index <= 5
								? "size-[4.688cqw]"
								: "size-[4.063cqw]";

					return (
						<a
							key={profile.name}
							href={profile.href}
							target="_blank"
							rel="noopener noreferrer"
							aria-label={`${profile.name} (${profile.handle})`}
							style={{
								left: `${leftPercent.toFixed(3)}%`,
								top: `${topPercent.toFixed(3)}%`,
							}}
							className={`group absolute -translate-x-1/2 -translate-y-1/2 flex items-center justify-center rounded-full border border-[#2e2e2e] border-t-[#424242] bg-[#141414] text-[#d6d6d6] hover:bg-[#1f1f1f] active:bg-[#292929] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#479ef5] ${profile.hoverClass} ${sizeClass}`}
						>
							<svg
								viewBox="0 0 24 24"
								fill="currentColor"
								aria-hidden="true"
								className={`pointer-events-none ${iconSizeClass}`}
							>
								<path d={profile.iconPath} />
							</svg>

							{/* Fluent 2 Tooltip Flyout */}
							<span className="invisible pointer-events-none absolute -bottom-8 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border border-[#383838] bg-[#242424] px-2.5 py-1 text-xs font-normal leading-4 text-[#ffffff] group-hover:visible group-focus-visible:visible">
								{profile.name}
							</span>
						</a>
					);
				})}
			</div>
		</section>
	);
}
