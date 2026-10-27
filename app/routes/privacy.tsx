import { Link } from "react-router";
import { LegalDocument, LegalSection } from "../components/LegalDocument";

export function meta() {
	return [
		{ title: "Privacy policy · Abhijith Ganesan" },
		{
			name: "description",
			content:
				"How this personal website accesses, displays, and stores Google Health data.",
		},
	];
}

export default function PrivacyPolicy() {
	return (
		<LegalDocument title="Privacy policy" date="1 October 2026">
			<LegalSection heading="This site">
				<p>
					This is the personal website of Abhijith Ganesan. Visitors are not
					asked to create an account. The site does not sell personal
					information and does not use it for advertising.
				</p>
			</LegalSection>
			<LegalSection heading="Google Health data">
				<p>
					If the site owner connects a Google account, the site requests
					read-only access to that account through the Google Health API. The
					access covers:
				</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>Activity and fitness, including steps and calories</li>
					<li>
						Health measurements, including heart rate, heart rate variability,
						breathing rate, blood oxygen, and skin temperature
					</li>
					<li>Sleep, including sessions and stages</li>
				</ul>
				<p>
					The site reads this data only to show a summary on the public home
					page. It does not change or delete anything in the Google account.
					Connecting the account is agreement that this summary, including a
					recent heart-rate reading, may be seen by anyone who opens the
					website.
				</p>
			</LegalSection>
			<LegalSection heading="What is stored">
				<p>
					The site stores the following on Cloudflare, which hosts the website:
				</p>
				<ul className="list-disc space-y-1 pl-5">
					<li>
						The Google sign-in token and refresh token, so the summary can keep
						updating until the account is disconnected
					</li>
					<li>A copy of the displayed summary for about two minutes</li>
					<li>A copy of the latest heart-rate reading for about 30 seconds</li>
					<li>
						A short-lived security cookie while Google sign-in is being
						completed
					</li>
				</ul>
				<p>
					The tokens stay until the owner disconnects the account here or
					removes the site's access in their Google Account. The cached
					summaries expire on their own and are deleted when the account is
					disconnected.
				</p>
			</LegalSection>
			<LegalSection heading="Limited use">
				<p>
					Google user data is used only to provide the health summary shown on
					this website. It is not sold. It is not used for advertising,
					retargeting, credit, or lending. It is not used to train
					machine-learning models. It is not transferred to anyone else, except
					to Cloudflare so the site can store the tokens and the short-lived
					copies needed to display the summary, and to Google when the site
					requests an update. People can see the published summary on the home
					page. It is not read for any other purpose.
				</p>
			</LegalSection>
			<LegalSection heading="Other information">
				<p>
					The Edinburgh weather line comes from Open-Meteo. That request is not
					tied to a Google account. The host and a visitor's browser may keep
					ordinary technical logs, such as an IP address, to operate and protect
					the site. This site does not add its own analytics service.
				</p>
			</LegalSection>
			<LegalSection heading="Disconnecting">
				<p>
					The owner can disconnect the Google account, which deletes the stored
					tokens and cached summaries. Access can also be removed from the
					Google Account's list of third-party connections.
				</p>
			</LegalSection>
			<LegalSection heading="Changes">
				<p>
					If the site starts using Google user data in a new way, this policy
					will be updated first and the date at the top will change. The new use
					will not start until the connected account has agreed to that update.
				</p>
			</LegalSection>
			<LegalSection heading="Contact">
				<p>
					The{" "}
					<Link to="/contact" className="text-[#479ef5] hover:underline">
						contact page
					</Link>{" "}
					sends a name, email address, and message to the site owner by email.
					The owner’s address is not published. Before a message is accepted,
					Cloudflare Turnstile checks that a person sent it. That check receives
					the connection address. The site does not keep the message. It does
					keep a short-lived marker, for about 10 minutes, so the same visitor
					cannot send messages continuously. That marker is a hash of the
					connection address, not the message itself.
				</p>
			</LegalSection>
		</LegalDocument>
	);
}
