import { LegalDocument, LegalSection } from "../components/LegalDocument";

export function meta() {
	return [
		{ title: "Terms of service · Abhijith Ganesan" },
		{
			name: "description",
			content: "Terms for using the personal website of Abhijith Ganesan.",
		},
	];
}

export default function TermsOfService() {
	return (
		<LegalDocument title="Terms of service">
			<LegalSection heading="This site">
				<p>
					These terms cover use of the personal website of Abhijith Ganesan. The
					site may show projects, links, weather for Edinburgh, and, when a
					Google account is connected, a summary of that account's activity,
					heart, and sleep data.
				</p>
			</LegalSection>
			<LegalSection heading="Health figures">
				<p>
					Figures from Google Health are personal telemetry shown for interest.
					They are not medical advice, a diagnosis, or a recommendation.
				</p>
			</LegalSection>
			<LegalSection heading="Using the site">
				<p>
					You may look around the site. Do not try to break it, interfere with
					it, or take a sign-in token or other private key. The site can change
					or go offline without notice.
				</p>
			</LegalSection>
			<LegalSection heading="No warranty">
				<p>
					The site is provided as-is. There is no promise that it will be
					available, accurate, or suitable for a particular purpose.
				</p>
			</LegalSection>
			<LegalSection heading="Changes">
				<p>
					The date at the top is the date of these terms. Using the site after
					that date means you accept the current version.
				</p>
			</LegalSection>
		</LegalDocument>
	);
}
