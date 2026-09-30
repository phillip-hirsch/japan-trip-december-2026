# Running the TanStack Start / Cloudflare Workers trip-planner behind Cloudflare Access (workers.dev, JWT verification, session expiry, PWA, local dev)

# Cloudflare Access fact sheet (checked 2026-09-29)

Legend: **[V]** = verified by me against the primary source today; **[U]** = not verified (source cited by a report only, or no primary source exists).

Project baseline (all **[V]**, read from `/Users/phillip/Developer/japan-trip-december-2026/node_modules` and `pnpm view`): wrangler 4.143.0 installed (npm latest 4.144.0), @cloudflare/vite-plugin 1.62.0 installed (latest 1.62.2), @tanstack/react-start 1.168.59 (latest 1.168.59), @tanstack/start-client-core 1.170.33, @tanstack/start-server-core 1.169.38, @cloudflare/workers-types latest 5.20260930.1 (not installed), jose latest 6.2.12 (published 2026-09-05) and **jose is NOT installed in the project** (`require.resolve` fell through to a stray `~/node_modules/jose@6.2.3`; not in `pnpm-lock.yaml`). `wrangler.jsonc` currently has `main: "@tanstack/react-start/server-entry"` and no `assets` or `access` block.

## 1. Can Access protect *.workers.dev? How to enable

- **[V]** No custom domain required. Three ways: (a) one-click Access for workers.dev / Preview URLs, Worker > Settings > Domains & Routes > "Enable Cloudflare Access" (changelog 2025-10-03, https://developers.cloudflare.com/changelog/post/2025-10-03-one-click-access-for-workers/); (b) Worker-level Access, Workers & Pages > Worker > **Access** tab, "protects every domain associated with the Worker, including its routes, Custom Domains, workers.dev hostname, and previews" (changelog 2026-08-14, https://developers.cloudflare.com/changelog/post/2026-08-14-workers-access/; docs last updated 2026-08-18, https://developers.cloudflare.com/workers/configuration/cloudflare-access/); (c) a hostname/path self-hosted Access app on e.g. `my-worker.<sub>.workers.dev` (same page, "Protect a specific hostname, Custom Domain, or path").
- **[V]** Precedence when several match: hostname/path app > Worker-level > account-level "protect all Workers" (same docs page, "Understand Access hierarchy").
- **[V]** Worker-level Access does not support WebSockets: upgrade requests fail with 403; use a hostname-based app instead (same page, "WebSocket limitation").
- **[V]** One-time PIN only emails users who are allowed by an Access policy, so an Allow policy on Phillip's exact email is mandatory; PIN expires after 10 minutes and is single-use (https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/, updated 2026-08-31).
- **[U]** `workers.dev` is on the Public Suffix List (Report B; plausible, not re-checked). Relevant only because the PWA's identity is its origin: changing origin later means reinstalling the PWA.

## 2. Verifying the identity in the Worker

- **[V]** `ctx.access` (aud + `getIdentity()`) exists, but "Workers with Static Assets execute behind an internal router Worker ... the router does not pass ctx.access to the user Worker", and "The Cloudflare Vite plugin can add `assets` to the generated deployment configuration ... Frameworks that use the plugin, including TanStack Start, can therefore be affected" (docs source `src/content/docs/workers/configuration/cloudflare-access.mdx` lines 288-290; cloudflare-docs PR #32781 merged 2026-08-18). Conclusion: **this project cannot use ctx.access in production**.
- **[V]** Cloudflare recommends validating the `Cf-Access-Jwt-Assertion` header rather than the `CF_Authorization` cookie "since the cookie is not guaranteed to be passed"; JWKS at `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`; check signature, `iss` = team domain, `aud` = application AUD tag; keys rotate every 6 weeks, previous key valid 7 more days, both served by the certs endpoint (https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/, updated 2026-05-06). Cloudflare's own Worker example uses jose `jwtVerify` + `createRemoteJWKSet` but builds the JWKS inside the handler; hoist it to module scope.
- **[V]** jose 6.2.12 `createRemoteJWKSet` defaults: `timeoutDuration` 5000 ms, `cooldownDuration` 30000 ms, `cacheMaxAge` 600000 ms; fetch is lazy on first verify (https://github.com/panva/jose/blob/v6.2.12/src/jwks/remote.ts).
- **[V]** Header confirmed for workers.dev one-click Access: "validate the JWT that Cloudflare Access adds to the Cf-Access-Jwt-Assertion header" (2025-10-03 changelog). **[U] Not documented for Worker-level Access**: neither the Worker Access page nor the 2026-08-14 changelog mentions the header; the workers.dev routing page (updated 2026-09-22) speaks generically of "the validated JWT". Report A assumed it; Report B flagged it. Must be confirmed empirically after the first deploy.
- **[V]** TanStack's default server entry is `createServerEntry({ fetch: createStartHandler(defaultStreamHandler) })` and forwards `...args`, so `(request, env, ctx)` reach it but your code never sees `ctx` unless you write a custom entry (`node_modules/@tanstack/react-start/dist/default-entry/esm/server.js`). Cloudflare's TanStack guide (updated 2026-09-04) documents `src/server.ts` importing `handler from '@tanstack/react-start/server-entry'` and `main: "src/server.ts"` (https://developers.cloudflare.com/workers/framework-guides/web-apps/tanstack-start/). `handler.fetch(request, { context })` typing via `Register.server.requestContext` is in `start-server-core/dist/esm/request-handler.d.ts` lines 56-66.
- **[V]** Alternative gate both reports missed: `createStart(() => ({ requestMiddleware: [...] }))` runs for **every** server request (SSR, server functions, server routes) when a start instance exists (`start-server-core/dist/esm/createStartHandler.js` line 302). It sees the `Request` (so the JWT header) but not the Workers `ctx`.
- **[V]** Static assets are served asset-first without running the Worker unless `run_worker_first` is set; they stay behind Access at the edge (https://developers.cloudflare.com/workers/static-assets/routing/worker-script/, updated 2026-08-18).

Minimal verification sketch (untested; requires `pnpm add jose`):

```ts
// src/server.ts  (wrangler.jsonc: "main": "src/server.ts")
import handler from '@tanstack/react-start/server-entry'
import { env } from 'cloudflare:workers'
import { createRemoteJWKSet, jwtVerify } from 'jose'

const JWKS = createRemoteJWKSet(
  new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`),
)

async function accessEmail(
  req: Request,
  ctx: ExecutionContext,
): Promise<string | null> {
  if (ctx.access) {
    // only present under `vp dev` via access.dev
    if (ctx.access.aud !== env.ACCESS_AUD) return null
    return (await ctx.access.getIdentity())?.email ?? null
  }
  const token = req.headers.get('cf-access-jwt-assertion')
  if (!token) return null
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: env.ACCESS_TEAM_DOMAIN,
    audience: env.ACCESS_AUD,
    algorithms: ['RS256'],
  })
  return typeof payload.email === 'string' ? payload.email : null
}

export default {
  async fetch(request, _env, ctx) {
    let email: string | null
    try {
      email = await accessEmail(request, ctx)
    } catch (e) {
      return new Response('Auth unavailable', { status: 503 })
    } // JWKS fetch failure: don't loop to login
    if (email !== env.ALLOWED_EMAIL)
      return new Response('Forbidden', { status: 403 })
    return handler.fetch(request, { context: { email } })
  },
} satisfies ExportedHandler<Env>
```

## 3. Sessions and what breaks on expiry

- **[V]** Application session: immediate to 1 month, default 24 h. Policy session: immediate to 1 month, defaults to app duration. Global session: 15 min to 1 month, default 24 h. If the app token expires while the global token is valid, Access "will automatically issue a new application token" (https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/, updated 2026-09-04). "Revoke existing tokens" per app; logout at `<app>/cdn-cgi/access/logout`.
- **[V]** Cookies: app-domain `CF_Authorization` HttpOnly and SameSite are admin-configurable (default None/None), expiry "adheres to policy session duration"; SameSite=Strict "can result in too many redirects"; optional `CF_Binding` (https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/, updated 2026-08-03). **[U]** Actual Set-Cookie `Expires`/`Max-Age` attributes not inspected.
- **[V]** AJAX: add `X-Requested-With: XMLHttpRequest` and Access returns 401 "on sub-requests with an expired session token" instead of the login redirect (session-management page, "AJAX"). **[U]** Behaviour when there is no cookie at all (vs expired) is undocumented; 401 body/headers undocumented.
- **[V]** Without that header a `fetch()` (including TanStack server-function GET/POST) follows the 302 to `<team>.cloudflareaccess.com` and dies as an opaque CORS TypeError, even during the silent app-token refresh. Real-world: actualbudget/actual #4422 (closed 2025-04-17 by PR #4706 "Reload on all redirects to handle Cloudflare Access auth expiration", which sets `redirect: 'manual'` and reloads on redirect), silverbulletmd/silverbullet #1091 (closed 2025-12-05), twentyhq/twenty #24927 (2026-08-27..31). All confirmed via `gh api`.
- **[V]** TanStack hook point: `createStart(() => ({ serverFns: { fetch } }))` applies to all client-side server-function calls, lowest precedence after call-site/middleware `fetch`, client only (`start-client-core/dist/esm/createStart.d.ts`). `serverFnFetcher.js` line 73 uses `first.fetch ?? handler`; TanStack redirects are parsed from the JSON payload (`parseRedirect`, line 169), not HTTP 3xx, so `redirect: 'manual'` is safe there.
- **[V]** Service Worker script updates are fetched with redirect mode "error" (w3c/ServiceWorker `index.bs` line 2823), so SW updates stall while the session is expired. **[V]** FlowFuse/node-red-dashboard #2068 (2026-03-18, closed 2026-09-15): a SW serving cached HTML prevented the auth redirect from ever reaching the user. **[U]** Workbox 7.4.1 default `cacheOkAndOpaquePlugin` caching status 0 (Report B; plausible from Workbox source, not re-read).
- **[V]** Bypass action "disables Access enforcement for specific traffic", no logging, no identity selectors (https://developers.cloudflare.com/cloudflare-one/access-controls/policies/, updated 2026-09-04); more specific path apps take precedence (https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/, updated 2026-04-17). Combined with the hierarchy above, a path-scoped Bypass app on workers.dev can exempt e.g. `/manifest.webmanifest` and icons, making them public.

## 4. Installed PWAs behind Access

- **[V]** Manifest is fetched without credentials by default; "the crossorigin attribute must be set to use-credentials, even if the manifest file is in the same origin" (MDN Manifest page). LibreChat discussion #5154 (2024-12-31, open) reports install breaking behind Access.
- **[V]** iOS/iPadOS 17.2+: Safari **copies cookies once** at "Add to Home Screen", "including the information about login state"; afterwards "no other website data is shared" (https://webkit.org/blog/14787/webkit-features-in-safari-17-2/). So: log in to Access in Safari, then install, and the CF_Authorization cookie carries over once; every later re-auth must happen inside the installed app.
- **[V]** iOS 26: "every website added to the Home Screen opens as a web app" by default, with a per-site toggle (https://webkit.org/blog/17333/webkit-features-in-safari-26-0/).
- **[V]** WebKit bug 272325 "Session cookies being reset randomly in a Home Screen web app": status NEW, reported 2024-04-08, last modified 2024-11-21, reports through iOS 18.1. Affects session (no-expiry) cookies; CF_Authorization's expiry follows the session duration, which suggests lower exposure (**[U]** until Set-Cookie attributes are checked).
- **[V]** Android Chrome WebAPKs: "Cookies are shared and active, any client side storage is accessible" with the Chrome profile (https://web.dev/articles/webapks). Logging in via Chrome carries over.
- **[U]** How iOS 26 standalone mode handles the out-of-scope hop to `<team>.cloudflareaccess.com` and back to `/cdn-cgi/access/authorized` (only a 2019 third-party write-up for iOS 12.2 exists). Test on device.
- **[U]** Whether iOS honours `crossorigin=use-credentials` for the manifest and sends cookies for `apple-touch-icon` fetches.

## 5. Local development with `vp dev`

- **[V]** wrangler 4.143.0 `config-schema.json` defines `access.dev { aud (required), identity }` "Local dev simulation of Cloudflare Access authentication"; wrangler `cli.js` passes `access: config2.access?.dev` to Miniflare; @cloudflare/vite-plugin 1.62.0 `dist/index.mjs` line 89053 passes `access: entryWorkerConfig?.access?.dev` to the router worker. Feature history: workers-sdk PR #15113 merged 2026-08-13, issue #15204 (vite-plugin gap, 2026-08-15), fixed by PR #15211 and #15238 merged 2026-08-17 (`gh api`).
- **[V]** Consequence: dev and prod are mirror images. Under `vp dev`, `ctx.access` is present and there is no JWT header; in prod (static assets) there is no `ctx.access` and there is (probably, see §2) a JWT header. Report B's temp-dir experiment returning `{hasAccess:true, aud:'test-aud', jwtHeader:null}` is consistent with this wiring (**[U]** not re-run by me).
- **[V]** Neither wrangler nor the Vite plugin mints a signed dev JWT, so a jose-only verifier needs either the `ctx.access` branch (above) or an explicit DEV-gated identity stub. Missing header must never imply "allowed" in production.

## Disagreements between researchers

- Does Worker-level Access (the 2026-08-14 'Access tab' mode) inject Cf-Access-Jwt-Assertion? Report A assumed yes; Report B said undocumented. Verified: no Cloudflare doc or changelog mentions the header for Worker-level Access; it is documented only for workers.dev one-click (2025-10-03 changelog) and hostname apps. Resolved as: treat as unverified, confirm with a temporary diagnostic route after the first protected deploy, and fall back to a hostname-based Access app on the workers.dev hostname if the header is absent.
- iOS cookie behaviour: Report B said Home Screen web apps are fully isolated so a Safari login never carries over; Report A said cookies are copied once at install. Verified against the WebKit 17.2 blog: A is right. Cookies (including login state) are copied at Add-to-Home-Screen time, then storage is isolated. Practical effect: log in to Access in Safari immediately before installing, and re-authenticate inside the installed app afterwards.
- HTTP status for a rejected identity in the Worker: Report A said 401/403, Report B said 403 specifically so the client can reserve 401 for 'Access session expired' (Access itself returns 401 to X-Requested-With requests). Resolved in favour of B (403 for Worker-side rejection, 503 for JWKS fetch failure as A proposed) so the client-side expiry handler has an unambiguous signal.
- Replaying failed mutations after re-auth: Report B said replay is always safe because Access blocked the request at the edge; Report A said avoid auto-replay and preserve drafts. Resolved: replay is safe only when the failure was definitive (Access 401 or an opaqueredirect status 0, which prove the Worker never ran). A generic network TypeError is ambiguous (the request may have reached the Worker), so for non-idempotent mutations preserve the draft and ask rather than auto-replay.
- Local-dev strategy: Report A recommended an import.meta.env.DEV-gated identity stub; Report B recommended wrangler's access.dev block so ctx.access is present under vp dev. Both are valid; B's approach is verified in the installed wrangler 4.143.0 / vite-plugin 1.62.0 and avoids any bypass flag in app code, but it only works if the gate lives in a custom src/server.ts Worker entry (TanStack requestMiddleware never sees ctx). Left as a user decision (see decisions).
- Report A's jose sketch cites 6.2.12; Report B also said 6.2.12. Both correct for npm latest, but neither noted that jose is not installed in the project at all; it must be added.
- Report B claimed the Cf-Access-Jwt-Assertion header is 'confirmed present for workers.dev and hostname-based Access' via the 2025-10-03 changelog: verified. Report B also claimed TanStack Start server-function redirects travel in the JSON body rather than HTTP 3xx: verified in serverFnFetcher.js (parseRedirect on the JSON payload), so redirect:'manual' in the custom fetch is safe.

## Recommendation

Enable Worker-level Access ("All traffic") on the Worker with an Allow policy for Phillip's exact email via One-time PIN, and pick the final origin (workers.dev or a custom domain) before installing the PWA. Set application and global sessions to 1 month; a day or two before departure, log in to Access in Safari and then Add to Home Screen (iOS copies the cookie once), and log in once on desktop. In the app, do not rely on ctx.access in production (the Static Assets router drops it for TanStack Start): add `pnpm add jose`, create `src/server.ts` as the Worker entry (`main: "src/server.ts"`), verify `Cf-Access-Jwt-Assertion` against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` with a module-scoped `createRemoteJWKSet` and `jwtVerify({ issuer, audience, algorithms: ['RS256'] })`, require `email === ALLOWED_EMAIL` (403 on mismatch, 503 on JWKS failure), and pass the email into `handler.fetch(request, { context })`; in dev, add `access.dev { aud, identity.email }` to wrangler.jsonc and take the `ctx.access` branch. On the very first deploy, add a temporary route that reports whether the header is present under Worker-level Access; if it is not, switch to a hostname-based Access app on the workers.dev hostname where the header is documented. On the client, set `createStart({ serverFns: { fetch } })` to a fetch that adds `X-Requested-With: XMLHttpRequest` and `redirect: 'manual'`, treats 401 or `type === 'opaqueredirect'` as "session expired", preserves in-flight input, and performs a loop-guarded top-level navigation to re-authenticate. Defer the service worker until there is real offline value; when you add one, never cache non-`ok`/non-`basic` responses or anything under `/cdn-cgi/`, keep navigations network-first, and precache hashed `/assets/*`. Load the manifest with `crossorigin="use-credentials"` and consider a path-scoped Bypass app for the manifest and icons only. Test the whole expiry flow on the actual iPhone (standalone) before December using a temporary 15-minute session.

## Decisions surfaced

- Final origin: stay on *.workers.dev or attach a custom domain now. The installed PWA is bound to its origin; switching later means reinstalling and losing local data, so this must be decided before the pre-trip install.
- Access attachment mode: Worker-level Access (covers all hostnames automatically, but no WebSockets and the JWT header is undocumented there) vs a hostname-based Access app on the workers.dev hostname (header documented, WebSockets allowed, but must be kept in sync with routes). Also decides whether any future realtime/WebSocket feature is possible.
- Where the identity gate lives: a custom Worker entry (src/server.ts, gets ctx.access in dev so no bypass code, mirrors Cloudflare's documented pattern) vs TanStack `requestMiddleware` in createStart (framework-native, one less Worker-level concept, but requires an explicit DEV-only identity stub because it never sees ctx).
- Session policy: 1-month app + global session with a deliberate pre-trip login ritual (fewest re-auth events in Japan, larger blast radius if a device is lost) vs shorter sessions with a well-built in-app re-auth flow (more code, more risk of the opaque-CORS failure class).
- Offline expectations: whether the itinerary must remain readable when offline or when the Access session has expired. This decides whether a service worker is built at all for this trip, and how aggressively it may cache HTML given the documented 'cached shell hides the login redirect' failure mode.
- Mutation replay policy after re-auth: automatic replay only on definitive Access rejections (401/opaqueredirect) with drafts preserved otherwise, vs never auto-replaying. Depends on whether the app's mutations are idempotent by design (e.g. keyed upserts).
- Public surface: make the manifest and icons public via a Bypass path app (reliable install on iOS, but unlogged public files) vs rely solely on crossorigin=use-credentials (nothing public, but iOS behaviour unverified).
- Cookie hardening: tighten CF_Authorization to SameSite=Lax and optionally enable the Binding Cookie, accepting the need to re-test the login redirect flow on iOS standalone afterwards.
