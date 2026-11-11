# Moving LENSIQ to your own domain

Status: prepared, not done. Nothing here has been run. The steps marked **Owner** are yours, the steps marked **Agent** are done on request.

## Who changes what (read this first)

- **The agent changes nothing in DNS.** No record is added, edited or deleted by the agent: not in Cloudflare, not at a registrar, not in GitHub.
  The agent also does not register a domain, add a zone, change nameservers, add a Worker custom domain or route, edit a Turnstile widget,
  or change GitHub repository settings (including the Pages custom domain). Every one of those steps is **Owner** only, done in your own
  dashboards.
- What the agent does is **configuration inside this repo and a deploy of the `lensiq-api-test` Worker** (rows marked Agent in the table
  below), each printed before it runs, tested, and committed only after you say so.
- **Other projects share your Cloudflare account. Never touch them.** The account also holds other projects' domains (`faksak.com`,
  `tripsdna.com`) and Workers (`dearday`, `aidanex`). LENSIQ work touches only resources named `lensiq-*`. Do not add, edit or delete any
  record, route, custom domain, Worker, page rule, redirect, ruleset or setting on those domains or Workers. **Do not use `faksak.com` or
  `tripsdna.com` for LENSIQ, not even as a subdomain**, because that would add records to a zone that belongs to another project;
  if you ever want that, decide it in writing first. When a dashboard page lists several zones or Workers, check the name before
  you click.

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

The only repo files the agent edits are `deploy/domains.json` (rows 1), `backend/wrangler.toml` `[env.test.vars]` (rows 2 to 4) and the
files `npm run site:set-api` writes (row 5). `deploy/domains.json` is a list of approved API hostnames and nothing else; adding a name to it
changes no DNS record and no Cloudflare setting. After step 1 of (a) it would look like this (example name):

```json
{
  "note": "Owner-approved custom hostnames for the LENSIQ API Worker (docs/CUSTOM-DOMAIN.md). ...",
  "apiHosts": ["lensiq-api.example.com"]
}
```

Rule for the API hostname: one of its labels must start with `lensiq` (for example `lensiq-api.example.com` or
`api.lensiq-example.com`). This is a format check against typos and other projects' names; it does not prove
ownership. The control is that only a name you approved, committed in `deploy/domains.json`, is accepted, exactly.

## (a) A subdomain of a domain already in your Cloudflare account

Example names: API `lensiq-api.<your-domain>`, site `lensiq.<your-domain>`. Cost: none.
Your existing records, Workers and settings on that domain are not touched; each step adds one new name.
`<your-domain>` must be a domain that is yours **for LENSIQ**. It must not be `faksak.com` or `tripsdna.com` (see "Who changes what");
if those are the only domains in the account, use (b) instead.
The site stays on GitHub Pages (a `CNAME` record pointing at `anirut77.github.io`); moving it to Cloudflare Pages would be a different
hosting change and is not covered here. The API is the Worker `lensiq-api-test`, attached to the new name as a **Custom Domain**
(Cloudflare creates the DNS record and certificate itself), which is simpler and safer than a route pattern on a shared zone.

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

Cost: the yearly registration fee of the domain (depends on the ending; the agent reports the price when you ask, but the price
shown at checkout is the one that counts). **Buying the domain is money spent: the agent never buys it and asks you first.**
Cloudflare's Free plan is enough; nothing else is charged. A new zone holds only LENSIQ records, so no other project is touched.

1. **Owner**: register the domain (Cloudflare Registrar: dashboard → Domain Registration → Register Domains; or any
   registrar). Use a name that is your LENSIQ brand, not one of the other projects' names.
2. **Owner**: if it was registered elsewhere: Cloudflare dashboard → Add a domain → enter it → Free plan → set the
   two Cloudflare nameservers at the registrar → wait for "Active". (If it is registered at Cloudflare, it is already a zone.)
3. **Owner, Cloudflare dashboard (Worker)**: Workers & Pages → `lensiq-api-test` → Settings → Domains & Routes → Add →
   **Custom domain** → `api.<lensiq-domain>` → Add. This is the Worker route for the new zone; wait for "Active". Open
   `https://api.<lensiq-domain>/health`.
4. **Owner, Cloudflare dashboard (site)**: DNS → Records → add a `CNAME` named `www` with target `anirut77.github.io`, proxy status "DNS only".
   For the bare domain `<lensiq-domain>`, add the four `A` records (and the `AAAA` records, if you want IPv6) that GitHub documents under
   "Managing a custom domain for your GitHub Pages site" (copy them from that page on the day, they can change). Then in GitHub:
   repo `anirut77/lensiq` → Settings → Pages → Custom domain → `www.<lensiq-domain>` (or the bare domain) → Save → tick "Enforce HTTPS"
   when the check passes.
5. **Owner, Cloudflare dashboard (Turnstile)**: widget `lensiq-test` → Settings → Hostnames → add the new site hostname
   (keep `anirut77.github.io`).
6. **Owner**: tell the agent both hostnames (for example `api.<lensiq-domain>` and `www.<lensiq-domain>`).
7. Continue with (a) from step 7: the **Agent** edits `deploy/domains.json` and the config rows 2 to 5, deploys the
   `lensiq-api-test` Worker with `npm run backend:deploy:test`, and runs the smoke test. The Agent still changes no DNS.
8. **Owner**: sign in at `https://api.<lensiq-domain>/admin` (sessions from the old address do not carry over).

If you want routes on a zone that is shared with another project (a pattern like `example.com/api/*`), do not: that edits a zone you
use for something else. Use a dedicated hostname as above.

## Rollback

Every step is additive until the optional last one. To go back: `npm run site:set-api` with the `workers.dev`
address, rebuild, push. The Worker keeps answering on `workers.dev` throughout.
