# Orbital Portfolio & Link Hub (Cloudflare Workers + React Router v8)

A lightweight, dark-space personal portfolio and biometric telemetry hub built on the Cloudflare React Router SSR template (`React Router v8`, `Vite 8`, `@cloudflare/vite-plugin`, `Tailwind CSS v4`, and `TypeScript 7`).

## Key Features

1. **`SpaceBackground` (`app/components/SpaceBackground.tsx`)**
   - Full-viewport HTML5 `<canvas>` (`pointer-events: none`, fixed behind content) filled with `#08080a`.
   - Paints **155–189 stars** once per page load. Each star has its own radius, tint, and opacity. The starfield does not animate.
   - Moves a pre-painted comet sprite with the Web Animations API. A timer launches one about every 6 seconds.
   - Respects `prefers-reduced-motion: reduce` by keeping the static starfield and skipping comets.

2. **`ProfileGrid` (`app/components/ProfileGrid.tsx`)**
   - Apple Watch–style circular profile launcher arranged using **Vogel's phyllotaxis spiral** and the **Golden Angle**:
     $$\varphi = \frac{1 + \sqrt{5}}{2} \approx 1.618034, \quad \theta_0 = \frac{360^\circ}{\varphi^2} \approx 137.508^\circ$$
     $$r_n = c\sqrt{n}, \quad \theta_n = n \cdot 137.508^\circ$$
   - Scales inside a `min(94vw, 640px)` square. Hover and focus show the profile name in a tooltip.

3. **`EdinburghStatus` (`app/components/EdinburghStatus.tsx`)**
   - Live 1-second clock for Edinburgh, UK (`Europe/London`) formatted with `Intl.DateTimeFormat`.
   - Fetches current weather and air quality from [Open-Meteo](https://open-meteo.com/) (`latitude=55.9533`, `longitude=-3.1883`, `timezone=Europe/London`) with `sessionStorage` caching (10-minute TTL).

4. **`FitbitSection` (`app/components/FitbitSection.tsx`) & Worker OAuth (`workers/fitbit.ts`)**
   - Scroll-down live biometric dashboard. The cards are steps today, resting heart rate (with a live heart-rate view), sleep score and duration, heart-rate variability (RMSSD), blood oxygen, breathing rate, skin-temperature variation, and calories, plus a last-synced time.
   - Powered by the **Google Health API** (`health.googleapis.com`).
   - Uses `IntersectionObserver` to fetch `/api/fitbit` when scrolled into view, with a "Stats unavailable right now" fallback (plus a sample-data layout preview) when not yet authorized. Connecting an account is owner-only — see below.

---

## Google Health API & Fitbit OAuth 2.0 Setup Guide

### 1. Create a Google Cloud Project & Enable the Google Health API

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create or select a project.
2. Navigate to **APIs & Services → Library** and enable the **Google Health API** (`health.googleapis.com`).

### 2. Configure the OAuth Consent Screen & Scopes

1. Go to **APIs & Services → OAuth consent screen**.
2. Choose **External** (or Internal for Workspace), fill in the app name, and add your Google Account email as a **Test User** (while in Testing mode).
3. Add the following Google Health API read-only scopes:
   - `https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly` (steps, total calories, and active energy)
   - `https://www.googleapis.com/auth/googlehealth.health_metrics_and_measurements.readonly` (resting heart rate, recent heart-rate samples, heart-rate variability, breathing rate, blood oxygen, and sleep skin temperature)
   - `https://www.googleapis.com/auth/googlehealth.sleep.readonly` (sleep sessions and stages)
4. On the Branding page, set the privacy policy to `https://<your-domain>/privacy` and the terms of service to `https://<your-domain>/terms`. Those pages are dated 1 October 2026. The home page footer links to both. The site icon is `public/logo.svg`, with `public/favicon.ico` for browsers that do not use the SVG.

### 3. Create OAuth 2.0 Client Credentials & Redirect URI

1. Go to **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Select **Web application**.
3. Under **Authorized redirect URIs**, add both your local development URI and your deployed Cloudflare Worker URI:
   - Local development: `http://localhost:5173/api/fitbit/callback`
   - Production Worker: `https://<your-worker-subdomain>.workers.dev/api/fitbit/callback` (or your custom domain `https://<your-domain>/api/fitbit/callback`)
4. Copy the generated **Client ID** and **Client Secret**.

### 4. Configure Cloudflare KV & Worker Secrets

1. Create the KV namespace for storing OAuth access and refresh tokens:
   ```bash
   npx wrangler kv namespace create FITBIT_KV
   npx wrangler kv namespace create FITBIT_KV --preview
   ```
2. Update the `id` and `preview_id` under `kv_namespaces` in `wrangler.jsonc`. That file is the only Worker config. `npm run dev` uses the local KV preview, where the saved tokens live. Production uses the deployed namespace.
3. For local development, create a `.dev.vars` file in the project root:
   ```ini
   GOOGLE_CLIENT_ID="your-google-client-id.apps.googleusercontent.com"
   GOOGLE_CLIENT_SECRET="your-google-client-secret"
   OAUTH_REDIRECT_URI="http://localhost:5173/api/fitbit/callback"
   ADMIN_TOKEN="a-long-random-string"
   CONTACT_TO="your-private-inbox@example.com"
   CONTACT_FROM="noreply@your-domain.com"
   TURNSTILE_SECRET="your-turnstile-secret"
   TURNSTILE_HOSTNAMES="localhost,127.0.0.1"
   ```
   `TURNSTILE_HOSTNAMES` in `.dev.vars` overrides the production allowlist in `wrangler.jsonc`. `FITBIT_KV` also stores the contact-form rate-limit markers. The binding name is historical.
4. For production deployment, upload your secrets to Cloudflare Workers:
   ```bash
   npx wrangler secret put GOOGLE_CLIENT_ID
   npx wrangler secret put GOOGLE_CLIENT_SECRET
   npx wrangler secret put OAUTH_REDIRECT_URI
   npx wrangler secret put ADMIN_TOKEN
   npx wrangler secret put CONTACT_TO
   npx wrangler secret put CONTACT_FROM
   npx wrangler secret put TURNSTILE_SECRET
   ```
   Generate a strong `ADMIN_TOKEN` with e.g.
   `node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`.

> **Owner-only controls:** The dashboard (`GET /api/fitbit` and `/api/fitbit/heart-rate`) is public. Connecting, disconnecting and force-refreshing are restricted to whoever knows `ADMIN_TOKEN`. If `ADMIN_TOKEN` is not set, those routes are disabled (they fail closed).

### Contact form

The page at `/contact` posts to `/api/contact`. The Worker emails `CONTACT_TO` from `CONTACT_FROM`. Neither address is written into the page. `CONTACT_TO` is also kept out of this repository: it is a secret, not a value in `wrangler.jsonc`.

Cloudflare setup, on the account that owns the site domain:

1. The domain must use Cloudflare DNS.
2. In the dashboard, go to **Compute → Email Service → Email Sending** and choose **Onboard Domain**. Accept the DNS records Cloudflare adds. The domain can send mail after those records are in place.
3. Go to **Compute → Email Service → Email Routing → Destination Addresses**. Add the private inbox that should receive messages and open the verification email.
4. Choose a sender on the onboarded domain, such as `noreply@your-domain.com`. That is `CONTACT_FROM`. The private inbox is `CONTACT_TO`.
5. Put both values in `.dev.vars` for local development, and upload them for production:

   ```bash
   npx wrangler secret put CONTACT_TO
   npx wrangler secret put CONTACT_FROM
   ```

6. Deploy with `npm run deploy`. The `EMAIL` binding is already in `wrangler.jsonc` and does not contain an address. `remote: true` on that binding makes `npm run dev` send a real message through Cloudflare. `FITBIT_KV` stays on the local preview.

Sending to a verified destination address is free. Messages are not stored. A hashed connection address is kept for about 10 minutes so the form cannot be submitted continuously. The form also requires `TURNSTILE_SECRET`. Without it, every submission is rejected. The widget on `/contact` uses the site key in `app/routes/contact.tsx`. Production checks the hostname against `TURNSTILE_HOSTNAMES` in `wrangler.jsonc` (`abhijithg.com`). Local `.dev.vars` should set that variable to `localhost,127.0.0.1`. The form does not send until the mail secrets, the Turnstile secret, and the domain onboarding are all in place.

### 5. Complete the One-Time Authorization Flow

1. Start the app (`npm run dev` locally or `npm run deploy` in production).
2. Visit `/api/fitbit/auth?key=<ADMIN_TOKEN>` (e.g. `http://localhost:5173/api/fitbit/auth?key=...`). Requests without a valid key get `403 Forbidden`.
3. Approve the read-only activity, heart rate, and sleep scopes on the Google consent screen.
4. Google redirects back to `/api/fitbit/callback`. The Worker checks that the OAuth `state` matches the short-lived cookie issued in step 2, exchanges the authorization code for an `access_token` and long-lived `refresh_token`, and stores them in `FITBIT_KV`.
5. Subsequent visits to `/api/fitbit` automatically refresh the `access_token` whenever needed and return live biometric telemetry.

**Other owner-only actions:**

```bash
# Disconnect (deletes stored tokens and cached stats)
curl -X POST -H "Authorization: Bearer <ADMIN_TOKEN>" https://<your-domain>/api/fitbit/disconnect

# Bypass the 2-minute stats cache (ignored for non-owners)
curl -H "Authorization: Bearer <ADMIN_TOKEN>" "https://<your-domain>/api/fitbit?refresh=1"
```

---

## Development & Deployment

```bash
# Install dependencies
npm install

# Run local development server (http://localhost:5173)
npm run dev

# Build for production
npm run build

# Build, then deploy that build to Cloudflare Workers
npm run deploy
```
