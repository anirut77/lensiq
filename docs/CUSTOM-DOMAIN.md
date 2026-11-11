# Moving LENSIQ to your own domain

Status: prepared, not done. Nothing here has been run. The agent does not change DNS, domains or GitHub settings;
the steps marked **Owner** are yours, the steps marked **Agent** are done on request.

Today:

| Part | Address today | Where it is configured |
|---|---|---|
| Public site | `https://anirut77.github.io/lensiq/` | GitHub Pages |
| API | `https://lensiq-api-test.anirut-s-4df.workers.dev` | Worker `lensiq-api-test` |
| Admin | same host as the API, path `/admin` | served by the Worker itself |

## What is already independent of the address

Checked by `tests/unit/backend-admin-setup-ui.test.js` ("custom domain: ...").

- The Worker code names no host. It answers on whatever host the request arrives on.
- Admin: the page calls its own origin. The session cookie is host-only (`__Host-`), so it needs no change. With
  `ADMIN_ORIGINS` empty, the only accepted admin origin is the Worker's own host.
- Public site: all links are relative. The API address, the Turnstile site key and the page CSP (`connect-src`) are
  written at build time from `deploy/public-site.json`.
- CORS, Turnstile hostnames and the site link used in messages are variables in `backend/wrangler.toml`.

## What changes (configuration only)

| # | Value | File | Who |
|---|---|---|---|
| 1 | Approved API hostname | `deploy/domains.json` → `apiHosts` | Agent |
| 2 | `ALLOWED_ORIGINS` (add the new site origin, keep the old one during the move) | `backend/wrangler.toml` `[env.test.vars]` | Agent |
| 3 | `TURNSTILE_HOSTNAMES` (add the new site hostname) | same | Agent |
| 4 | `SITE_URL` | same | Agent |
| 5 | API address used by the site | `npm run site:set-api -- --api-base https://<api host> --sitekey <site key>` | Agent |
| 6 | Turnstile widget: add the new site hostname | Cloudflare dashboard | Owner |
| 7 | Custom domain on the Worker | Cloudflare dashboard | Owner |
| 8 | Custom domain of the public site | DNS record + GitHub Pages setting | Owner |

Rule for the API hostname: one of its labels must start with `lensiq` (for example `lensiq-api.example.com` or
`api.lensiq-example.com`). This is a format check against typos and other projects' names; it does not prove
ownership. The control is that only a name you approved, committed in `deploy/domains.json`, is accepted, exactly.

## (a) A subdomain of a domain already in your Cloudflare account

Example names: API `lensiq-api.<your-domain>`, site `lensiq.<your-domain>`. Cost: none.
Your existing records, Workers and settings on that domain are not touched; each step adds one new name.

1. **Owner, Cloudflare dashboard**: Workers & Pages → `lensiq-api-test` → Settings → Domains & Routes → Add →
   Custom domain → enter `lensiq-api.<your-domain>` → Add. Cloudflare creates the DNS record and the certificate for
   that one name. Wait until it shows "Active".
2. **Owner**: open `https://lensiq-api.<your-domain>/health`. It should answer.
3. **Owner, Cloudflare dashboard**: Turnstile → widget `lensiq-test` → Settings → Hostnames → add
   `lensiq.<your-domain>` (keep `anirut77.github.io`).
4. **Owner, Cloudflare dashboard**: DNS → Records → Add record: type `CNAME`, name `lensiq`, target
   `anirut77.github.io`, proxy status "DNS only" (grey cloud).
5. **Owner, GitHub**: repo `anirut77/lensiq` → Settings → Pages → Custom domain → `lensiq.<your-domain>` → Save. When
   the check passes, tick "Enforce HTTPS". The site then lives at `https://lensiq.<your-domain>/` (no `/lensiq/`
   path); the old address redirects there.
6. **Owner**: tell the agent both hostnames.
7. **Agent**: rows 1 to 5 of the table, printing each target first; tests; one commit; push when you say.
8. **Agent**: `npm run backend:deploy:test` (same Worker, new variables), then
   `npm run backend:smoke -- --base https://lensiq-api.<your-domain> --origin https://lensiq.<your-domain>`.
9. **Owner**: open `https://lensiq-api.<your-domain>/admin` and sign in. Sessions and "trusted device" from the old
   address do not carry over (they belong to the old host); the account, password and 2-step verification do.

To check before step 8: whether `wrangler deploy` keeps a custom domain that was added in the dashboard when the
config file does not list it. The agent runs `npm run backend:dry-run` first and reports. If the config must list
it, that is one more line (`routes`, `custom_domain = true`) in `[env.test]`, added only with your approval.

Later, optional: turn off the `workers.dev` address (`workers_dev = false`) and remove the old origin from rows 2
and 3. Until then both addresses work.

## (b) A new domain for LENSIQ

Cost: the yearly registration fee of the domain (depends on the ending; the agent reports the price before you
buy). Cloudflare's Free plan is enough; nothing else is charged.

1. **Owner**: register the domain (Cloudflare Registrar: dashboard → Domain Registration → Register Domains; or any
   registrar).
2. **Owner**: if it was registered elsewhere: Cloudflare dashboard → Add a domain → enter it → Free plan → set the
   two Cloudflare nameservers at the registrar → wait for "Active".
3. Continue with (a) from step 1, using for example `api.<lensiq-domain>` for the API and `www.<lensiq-domain>` (or
   the bare domain) for the site. For the bare domain, GitHub documents the `A` records to add in step 4.

## Rollback

Every step is additive until the optional last one. To go back: `npm run site:set-api` with the `workers.dev`
address, rebuild, push. The Worker keeps answering on `workers.dev` throughout.
