# LENSIQ backend: test deployment runbook (closed tester group)

Status 2026-11-10: **prepared, nothing deployed.** Plan and owner decisions: `~/LENSIQ-field/evals/deploy/DEPLOY-PLAN.md`,
`OWNER-DECISIONS.md`. Logs of the deploy go to `~/LENSIQ-field/evals/deploy/DEPLOY-LOG.md` (template in §9).

Who does what: **O** = owner, **A** = agent. The agent never sees, prints or stores a secret value.

## 0. Rules that hold for every step

**The Cloudflare account is shared.** It also holds the Workers `dearday-staging`, `aidanex-staging`,
`aidanex-pet-clinic-pilot` and the domains `faksak.com`, `tripsdna.com`. LENSIQ creates only:

| Resource | Name | Created by |
|---|---|---|
| Worker | `lensiq-api-test` (URL `https://lensiq-api-test.<your-subdomain>.workers.dev`) | `npm run backend:deploy:test` |
| D1 database | `lensiq-test` | `npm run backend:d1:create` |
| Turnstile widget | `LENSIQ test` (hostname `anirut77.github.io`) | owner, dashboard (§3) |
| Cron trigger | 1 (`17 3 * * *`, daily maintenance) of the account's 5 | with the deploy |

Nothing else is created, changed, redeployed or deleted. How this is enforced:

- Every script that creates or changes something goes through `tools/lib/cf-guard.mjs`. It reads the names from
  `backend/wrangler.toml [env.test]`, **prints the target first**, and **refuses with exit code 3 before wrangler
  starts** unless the Worker is exactly `lensiq-api-test` and the database exactly `lensiq-test` (a name that does not
  start with `lensiq-`, or one of the five names above, can never pass).
- The guard checks the **effective** target, not only the names in the file: for each exact argument list it works out
  which Worker or database wrangler will really act on, and refuses anything else. This matters because wrangler does
  not resolve names the same way in every command (table below; verified against the installed wrangler 4.158.0 bundle
  and wrangler's own configuration reader in `tests/integration/deploy-wrangler-resolution.test.mjs`, and re-checked
  against the installed bundle before every changing action, so a wrangler upgrade that changes a rule stops the
  scripts).

  | wrangler command | How wrangler picks the target | What the tools pass | Effective target |
  |---|---|---|---|
  | `deploy`, `deploy --dry-run` | `--name`, else the environment's `name` | `--env test --name lensiq-api-test` | Worker `lensiq-api-test` |
  | `rollback`, `versions list`, `deployments list` | `--name`, else the environment's `name` | `--env test --name lensiq-api-test` | Worker `lensiq-api-test` |
  | `secret put`, `secret list` | **`<--name>-<--env>` when both are given**, else `--name`, else the environment's `name` | **`--env test` only** | Worker `lensiq-api-test` |
  | `d1 create` | the name argument | `lensiq-test` | D1 `lensiq-test` (new) |
  | `d1 migrations apply`, `d1 execute` | the name argument selects the entry in `[env.test]`; the **`database_id`** written there is what is acted on | `lensiq-test --remote --env test` | D1 `lensiq-test`, after a read-only `d1 list` proved that this id belongs to the database named `lensiq-test` |
  | `d1 list`, `whoami` | none (read-only) | – | – |

  With `--name` added, a secret command would target a Worker called `lensiq-api-test-test` and, with piped input,
  create a draft Worker of that name. The tools never pass it, the guard refuses that form, and `secret delete` and
  `tail` (same rule) are not used at all.
- A secret is only ever written to a Worker that is already deployed: every path that writes one (`secrets:setup`,
  `backend:off` / `on`, `backend:bootstrap:close`, `backend:tester:revoke`) first asks, read-only,
  `wrangler deployments list --env test --name lensiq-api-test --json` and refuses when it does not answer. So no draft
  Worker can be created.
- If `CLOUDFLARE_API_TOKEN` or `CLOUDFLARE_ACCOUNT_ID` (or the older `CF_*` names) is set in the shell, wrangler uses it
  instead of the owner's `wrangler login`. The tools print a warning (never the value) and refuse every changing
  action until the owner has confirmed the account shown by `npm run backend:whoami` (`-- --account-confirmed`).
- **wrangler never inherits the shell's environment.** Some variables change which Worker or which API wrangler talks
  to without any argument (`WRANGLER_CI_OVERRIDE_NAME` replaces the Worker name of `deploy`). The tools start wrangler
  with an allow-listed environment only (`PATH`, `HOME`, terminal and locale variables, the config-folder variables,
  and the harmless wrangler switches below; no proxies, no `NODE_OPTIONS`, nothing else), and **refuse with exit 3,
  naming the variable, before wrangler starts** when a variable of the "target" or "endpoint" class is set, or any
  `WRANGLER_*` / `CLOUDFLARE_*` / `CF_*` variable the table does not know. This holds for every action except `plan`
  and for all three tools (`backend-deploy`, `secrets-setup`, `ai-deploy-defaults`). Every such variable named in the
  installed wrangler 4.158.0 bundle is classified (a unit test fails when a new one appears):

  | Class | Variables | What the tools do |
  |---|---|---|
  | Target-changing | `WRANGLER_CI_OVERRIDE_NAME`, `WRANGLER_CI_MATCH_TAG`, `WRANGLER_CI_GENERATE_PREVIEW_ALIAS`, `WRANGLER_CI_OVERRIDE_NETWORK_MODE_HOST`, `WRANGLER_CI_DISABLE_CONFIG_WATCHING`, `CLOUDFLARE_ENV`, `CLOUDFLARE_INCLUDE_PROCESS_ENV`, `CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV`, `WRANGLER_C3_COMMAND`, `WRANGLER_BUILD_CONDITIONS`, `WRANGLER_BUILD_PLATFORM`, `WRANGLER_D1_EXTRA_LOCATION_CHOICES`, `WRANGLER_DISABLE_SUBDOMAIN_MIXED_STATE_CHECK`, `WRANGLER_OUTPUT_FILE_DIRECTORY`, `WRANGLER_OUTPUT_FILE_PATH`, `WRANGLER_REGISTRY_PATH`, `CLOUDFLARE_PAGES`, `CLOUDFLARE_WORKERS`, `CLOUDFLARE_PREVIEW_BUILD`, `CF_PAGES`, `CF_PAGES_COMMIT_SHA`, `CF_PAGES_UPLOAD_JWT`, `CF_BUILD_ID`, `CF_PULL_REQUEST_ID`, `CF_PULL_REQUEST_NUMBER`, `*_HYPERDRIVE_LOCAL_CONNECTION_STRING_*` | **refuse** |
  | Endpoint-changing | `WRANGLER_API_ENVIRONMENT`, `CLOUDFLARE_API_ENVIRONMENT`, `CLOUDFLARE_API_BASE_URL`, `CF_API_BASE_URL`, `CLOUDFLARE_BASE_URL`, `CLOUDFLARE_COMPLIANCE_REGION`, `WRANGLER_AUTH_DOMAIN`, `WRANGLER_AUTH_URL`, `WRANGLER_TOKEN_URL`, `WRANGLER_REVOKE_URL`, `WRANGLER_CLIENT_ID`, `CLOUDFLARE_CLIENT_ID`, `WRANGLER_CF_AUTHORIZATION_TOKEN`, `CLOUDFLARE_CF_AUTH`, `CLOUDFLARE_ACCESS_CLIENT_ID`, `CLOUDFLARE_ACCESS_CLIENT_SECRET`, `WRANGLER_BASIN_SQL_AUTH_TOKEN`, `CLOUDFLARE_CONTAINER_REGISTRY`, `WRANGLER_DOCKER_HOST`, `WRANGLER_DOCKER_BIN`, `WRANGLER_HTTPS_CERT_PATH`, `WRANGLER_HTTPS_KEY_PATH`, `WRANGLER_DISABLE_REQUEST_BODY_DRAINING`, `WRANGLER_CONTAINER_IMAGE_COMPRESSION` | **refuse** |
  | Credentials (replace `wrangler login`) | `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_API_USER_SERVICE_KEY`, `CF_API_TOKEN`, `CF_ACCOUNT_ID`, `CF_API_KEY`, `CF_EMAIL` | warn; passed to wrangler only for read-only actions (so `backend:whoami` shows that account) and, for changing actions, after `--account-confirmed`; otherwise refuse |
  | Harmless | `WRANGLER_HIDE_BANNER`, `WRANGLER_SEND_METRICS`, `WRANGLER_SEND_ERROR_REPORTS`, `WRANGLER_LOG`, `WRANGLER_LOG_PATH`, `WRANGLER_LOG_SANITIZE`, `WRANGLER_WRITE_LOGS`, `WRANGLER_CACHE_DIR`, `WRANGLER_NO_SKILLS_UPDATE_PROMPTS`, `WRANGLER_DISABLE_EXPERIMENTAL_WARNING`, `WRANGLER_TRACE_ID`, `CLOUDFLARE_AUTH_USE_KEYRING` | passed on |
  | Anything else starting with `WRANGLER_`, `CLOUDFLARE_` or `CF_` | (a newer wrangler) | **refuse** until classified |

  Some "refuse" entries are only build or Pages switches; they are refused all the same, because nothing in this deploy
  needs them. If the owner's network needs a proxy, wrangler will fail visibly (proxy variables are not passed on); say
  so and it will be added on purpose.
- The tester code rules (16 characters or more, not easy to guess) are enforced by the Worker itself
  (`backend/src/tester.js weakCode`), not only by `secrets:setup`: a short or weak code set by any route makes the gate
  refuse everyone and raises the owner alert `tester_code_weak`.
- Tests: `tests/unit/deploy-tools.test.js`, `tests/integration/deploy-wrangler-resolution.test.mjs`.
- Do not type `npx wrangler deploy`, `wrangler delete` or `wrangler secret put` by hand. Use the `npm run` scripts below.
  (A bare `npx wrangler deploy` in `backend/` would target the template name `lensiq-api` with a placeholder database
  id and fail; it still must not be used.)
- No script runs in CI.

**Free plan, shared quotas.** The account is on Workers Free. Never upgrade; if a step needs the paid plan, stop and ask
the owner (decision D7).

| Quota (Free, per ACCOUNT, resets 00:00 UTC) | LENSIQ's own limit |
|---|---|
| 100,000 Worker requests / day | **20,000 / day** (`DAILY_REQUEST_CAP`, 20 %). Over it every public route answers 429 `daily_cap` "try again tomorrow" until 00:00 UTC; `/health` and the admin stay up. Counted in D1, one row write per 10 requests; if the counter cannot be read the request is refused (fail closed) |
| D1: 5 M rows read, 100,000 rows written / day, 10 databases | 1 database (`lensiq-test`, 1 of the account's 10). **Budget: about 5,000 write statements / day from public routes** (`D1_WRITE_BUDGET`); over it every counted public route answers 429 `d1_budget` "try again tomorrow" and the owner gets an alert. It is an approximate budget, not an exact cap, and reaching it switches the public service off for the day (see below) |
| 5 cron triggers | 1 (the 15-minute payment reconcile is not deployed: billing is off) |
| Workers Logs 200,000 events / day, 3 days | `[env.test.observability] head_sampling_rate = 0.5`: half of the invocations are logged. With the request cap that is at most about 20,000 events / day (10 %). Alerts do not depend on logs (they are stored in D1) |

Limit of the cap, stated plainly: a request the Worker refuses has still reached Cloudflare and still counts toward the
account's 100,000. The cap bounds LENSIQ's own work (database, upstream sources, normal use). It cannot stop a flood
aimed at the `workers.dev` address; no free setting can (rate-limiting rules need a custom domain). If that ever
happens: `npm run backend:off` does not help either; the remedy is to disable the `workers.dev` route of
`lensiq-api-test` in the dashboard (Workers & Pages → lensiq-api-test → Settings → Domains & Routes), which is a
LENSIQ-only setting.

### Public routes of this deployment (`PUBLIC_ROUTES`)

The Worker has many more routes than this test needs. In `[env.test]` an allow-list decides which public routes exist;
every other public route answers 404 `route_off` "not enabled in this deployment" **before the database is touched**
(test: zero D1 statements, also for a forged Origin). The default configuration has no list and behaves as before.

| Route | State here | Notes |
|---|---|---|
| `GET /health` | allowed | never counted, no database |
| `GET /health/deep` | allowed | reads only (schema probe); returns no data |
| `GET /v1/config` | allowed | answers `analytics:false`, sign-in off, billing off, free mode; no database |
| `POST /v1/tester/check` | allowed | the tester card's check of a code |
| `GET /v1/ai/providers`, `POST /v1/ai/:feature` | **gated** (tester code) | plus Turnstile, per-user limits, budget, admin switches (all off until the owner turns them on) |
| `GET /api/pc/*`, `POST /api/pc/batch` | allowed; Thai FDA, Safety Gate, RASFF **gated** | open-licence sources answer everyone |
| `GET /api/med/openfda`, `/rxnav`, `/status` | allowed | |
| `GET /api/med/thfda` | **gated** | the page does not even call it without a code |
| `POST /v1/events` (analytics) | **off** | it would store rows for anyone who sends them |
| `POST /v1/leads` | **off** | it stores name, e-mail, phone |
| `/v1/billing/*`, `/api/auth/*`, `/api/me*` | **off** | billing and member sign-in are not part of this test |
| `/api/fortune`, `/api/fortune/status` | **off** (and behind the tester gate in the code) | no Anthropic key, not part of this test. To use it later: add the route to the list, deliberately |
| `POST /v1/csp-report` | **off** | the public pages cannot send reports anyway (meta CSP) |
| `/admin`, `/admin/api/*` | allowed, own rules | password + TOTP; the three unauthenticated endpoints have an hourly ceiling (below) |

### What a request costs in D1 (measured, statements; test "D1 cost" in `tests/unit/backend-deploy-gate.test.js`)

| Request | Reads | Writes |
|---|---|---|
| Request / write counters | 0 | 1 upsert of one row on an isolate's first request, then 1 per 10 requests (0.1 per request) |
| `GET /v1/config`, any route that is off, any AI request without a code | 0 | 0 |
| `GET /api/pc/status` | 1 | 0 |
| `POST /api/pc/batch` (one tap, up to 16 lookups) | 2 | 1 (+1 read, +1 write for the first caller of the day: the day salt) |
| `GET /api/med/openfda` / `rxnav` | 1 | 1 |
| `POST /v1/tester/check`, right code | 0 | 0 |
| A wrong tester code (any gated route) | 1 | 1, at most 5 per caller per 15 minutes and 100 per hour per isolate; after that 0 / 0 |
| `GET /v1/ai/providers` with the code | 2 | 0 |
| `POST /v1/ai/:feature`, success | 4 | **14** (rate limits, budget reserve and settle, monthly aggregates) |
| Failed admin sign-in | about 4 | about 4 while this hour's total is under 120 per isolate; then 0 (a correct sign-in still writes its session rows) |

**What the budgets are, honestly.** `DAILY_REQUEST_CAP` and `D1_WRITE_BUDGET` are approximate budgets, not exact caps.
Each Worker isolate counts in memory and stores its counts once per 10 requests (one row holds both counters), so the
stored total lags by up to 10 requests per live isolate, and an isolate that is recycled before its next store never
reports its last few. Expect LENSIQ to stop at roughly 5,000 write statements (plus at most about 160 that were in
flight), not at exactly 5,000. One statement writes one row, and an indexed table can be billed up to about two rows,
so plan for at most about 10,000 rows = 10 % of the account's 100,000. The daily cron writes a handful. Reads stay far
below 5 M (20,000 requests x a few reads).

**The budget is also an off switch that anybody can trip.** Reaching either budget turns the public service off until
00:00 UTC. At 1.1 write statements per lookup tap that is about 4,500 taps; at 14.1 per AI call about 350 AI calls
(which also need the tester code and are limited per user); 20,000 requests of any kind reach the request budget.
That is the intended trade: LENSIQ goes quiet for the day rather than use up the quotas the owner's other projects
share. When it happens the owner is told once: an alert `daily_limit_reached` in admin → Alerts, and on the webhook
when `ALERT_WEBHOOK_URL` is set. The admin and `/health` keep working. To come back the same day, raise the number in
`[env.test.vars]` and deploy.

More protections that were added after review:

- **Tester code and brute force.** A correct code always passes: it is compared (constant time) before any limiter and
  without the database, so nobody can lock the testers out by sending wrong codes. Wrong codes are throttled per caller
  (5 per 15 minutes) and capped in total (100 per hour per isolate); over a limit the refusal touches nothing.
  Protection against guessing is the code itself: 16 characters or more and not easy to guess, enforced by the Worker
  (a weak configured code refuses everyone and raises an alert), plus the request budget. The tester card tells the
  reasons apart: "that code is not correct" is shown only when the Worker says the code is not accepted; a refusal for
  another reason (limit reached, service off, server did not accept the request) has its own text.
- **Admin sign-in: nobody can lock the owner out, and failed sign-ins cannot write without bound**
  (`ADMIN_UNAUTH_WRITES_HOUR = 120`). `/admin/api/login`, `/bootstrap` and `/state` are outside the public budgets.
  There is no ceiling that refuses sign-ins. Instead, once the unauthenticated admin requests of an hour have caused 120
  write statements in an isolate, sign-ins are still checked in full (password, TOTP), and a correct one succeeds and
  writes its session; but a failed one no longer writes anything (no attempt counters, no audit row), and `/state`
  answers from memory. While that mode is on, the stored attempt counters and the account's "slow down" delay are not
  applied either, because a stranger could use those to keep the owner out; the throttle then is an in-memory limit of
  10 attempts per caller address per 15 minutes, checked before any password hashing or database access.
  What an attacker can still do: (a) under 120 writes an hour the existing rules apply unchanged, so about ten wrong
  passwords for the right user name delay sign-ins from browsers that have never signed in by up to 15 minutes (the
  owner's own browser keeps a device cookie after the first sign-in and is not affected); (b) each processed attempt
  costs one password hash of CPU, at most 10 per address per 15 minutes; (c) requests to the admin still count toward
  the account's 100,000 a day like any request to the Worker; (d) during such an attack failed sign-ins are not in the
  audit log.
- **Shared site origin (residual risk, accepted for the test).** `https://anirut77.github.io` is also the origin of the
  owner's other Pages projects, and the Worker cannot tell them apart: CORS works per origin, and the Referer is not
  used for any decision (Safari and every iOS browser, Firefox in strict mode and Brave send only the origin, and a
  Referer is not a security boundary anyway). So a page of another project on that origin can call the ungated routes
  (the public lookups) exactly as medicine.html can. The tester code is kept in sessionStorage, which belongs to the
  origin: script from any project on `anirut77.github.io` that runs in the same tab could read it. Both need one of the
  owner's own other projects to do it. A custom domain for LENSIQ removes the sharing; rotating the code is the remedy
  if it is ever exposed.

## 1. What is switched on, and for whom

| | Ordinary visitor of medicine.html | Tester (entered the code) |
|---|---|---|
| Page | as today; no tester card, no "ask AI" step, no banner | `medicine.html?tester=1` shows a "tester access" card; the code is kept for that browser session only |
| Official lookups: openFDA (recalls, labels, NDC), Singapore HSA, DailyMed, RxNav | **live** after the "check official sources" tap (derived facts only) | live |
| Testing-only sources: Thai FDA web service, EU Safety Gate, RASFF (decision D2) | **never called.** The row reads "could not check: still being tested, open to the closed tester group only" | live, labelled "testing only" |
| Medicine checker's Thai FDA registration lookup (`/api/med/thfda`) | never called; the block shows its existing "could not look up" state with the link to the Thai FDA site | live |
| Health Canada recalls | on the device, as today | same |
| AI: `pc_fields`, `pc_translate` | hidden; the Worker answers "tester code required" | after the owner turns them on in admin: consent screen → preview → send |
| AI: `pc_claims` | off | off (prepared for an owner demo only) |
| Fortune AI, analytics, demo-request form, member sign-in, billing | not part of this deployment: the routes answer 404 "not enabled" | same |
| Every other page of the site | unchanged: no API base, no request to the Worker | unchanged |

"As today" for a visitor, precisely: before this deploy every remote row said "could not check: this site has no LENSIQ
server for this check". After it, the open-licence sources answer for everyone and the three testing-only sources keep
saying "could not check", with the new reason.

Defaults written by `npm run ai:deploy-defaults` (everything OFF until the owner turns it on in admin → AI Gateway):

| Setting | Value |
|---|---|
| Global switch, every feature, fortune AI | off |
| Allowed provider | OpenRouter only (the only key that exists) |
| `pc_fields` | `anthropic/claude-haiku-5.5` → `openai/gpt-6-luna`; 5 USD / month; photo mode allowed (testers; blurred preview every time; product-label filter active); text is the default |
| `pc_translate` | same chain; 3 USD / month; text only |
| `pc_claims` | `openai/gpt-6.1-terra` → `anthropic/claude-sonnet-5.5`; 2 USD / month; stays off |
| Limits per feature | 20 per user per day, 3 per user per minute, 20 per minute for all users |
| Route | pinned: Claude models → Google Vertex, GPT models → Azure (`provider.only`, `allow_fallbacks:false`, `zdr:true`, `data_collection:"deny"`). An answer from any other serving provider is rejected and raises an owner alert |
| Not in the default order | Qwen 3.8 and DeepSeek v4.1 flash (slow; answers cut at the 1,500-token cap), GLM 5.3 flash (the Chinese-label option, translation only). **In this deployment they cannot be used yet:** serving providers are pinned so that the consent screen can name them, and a model without a pin is refused (never offered, never called, owner alert `route_not_pinned`). Admin → AI Gateway shows the list of usable models. Adding one means confirming its zero-retention serving provider and adding the pin in `adapters/openrouter.js` |

Total AI ceiling: 10 USD / month (5 + 3 + 2). Cloudflare cost: 0 USD.

## 2. Before the owner is asked to do anything (A)

```sh
npm run test:unit && npm run lint && npm run typecheck && npm run csp:check
npm run backend:dry-run        # wrangler deploy --dry-run --env test: builds the bundle, no account access
npm run backend:plan           # prints the targets and every command, runs nothing
```

## 3. The sequence

| # | Who | Do | Target it changes | What you see |
|---|---|---|---|---|
| 1 | O | Create the OpenRouter key (decision D6): openrouter.ai → Keys → Create key, name `lensiq-test`, credit limit 10 USD or more. Keep the page open for step 7 | nothing at Cloudflare | the key once, on OpenRouter's page |
| 2 | O | **Turnstile widget** (click by click): dash.cloudflare.com → left menu **Turnstile** → **Add widget** → Widget name `LENSIQ test` → Hostname management: **Add a custom hostname**, type `anirut77.github.io` (no `https://`, no `/lensiq`) → Widget mode **Managed** → Pre-clearance: leave off → **Create**. Send the **Site key** to the agent (it is public; it starts with `0x4` and has about 24 characters. `npm run site:set-api` refuses anything that is not shaped like a site key, so the longer Secret key can never be published by mistake). Keep the **Secret key** for step 7 | 1 new Turnstile widget | a page with "Site key" and "Secret key" |
| 3 | O | In the VS Code terminal: `cd "/Users/Aniroot/Documents/GitHub/RSP Demo/backend" && npx wrangler login` | a login token on your computer (the agent never reads it) | the browser opens a Cloudflare page asking to allow Wrangler → press **Allow** → the terminal prints that you are logged in. Reply "done" |
| 4 | A | `npm run backend:whoami` (through the guarded tool) | nothing (read-only) | account name and id (no token). The agent reads the account name back; the owner confirms it is the right account |
| 5 | A | `npm run backend:d1:create` | **D1 `lensiq-test`** (new) | prints `TARGET D1 database "lensiq-test" (CREATE, new)`, then writes the database id into `backend/wrangler.toml [env.test]` (not a secret) |
| 6 | A | `npm run backend:migrate` then `npm run backend:deploy:test` | D1 `lensiq-test` (tables), **Worker `lensiq-api-test`** (new) | each prints its target first. Then `npm run backend:smoke -- --base https://lensiq-api-test.<sub>.workers.dev`: all PASS (AI answers "tester code required", testing-only sources closed) |
| 7 | **O** | In your **own** terminal, repo root: `npm run secrets:setup` | secrets on Worker `lensiq-api-test` only | see §4. Reply "done". The agent never runs this command (it refuses without a real terminal) |
| 8 | **O** | Open `https://lensiq-api-test.<sub>.workers.dev/admin`. While no owner account exists it shows **First-time setup** (3 steps): (1) paste the setup code (the bootstrap token), choose a user name and a password of 12 characters or more, typed twice; (2) scan the QR code with an authenticator app and enter its 6-digit code; (3) save the ten one-time recovery codes, tick "saved", Finish. If an owner account already exists the page shows only the sign-in form; an owner without 2-step verification is taken to step 2 after signing in. | the owner account in D1 `lensiq-test` | the admin back office. **If the page shows a Cloudflare error 1102 ("exceeded CPU") at sign-in: stop and tell the agent** (decision D7; see §8 point 1) |
| 9 | A | `npm run backend:bootstrap:close` (replaces `ADMIN_BOOTSTRAP_TOKEN` with a random value nobody knows; never printed) | one secret of `lensiq-api-test` | `ADMIN_BOOTSTRAP_TOKEN: closed.` The bootstrap can never be used again |
| 10 | A | `npm run ai:deploy-defaults` (prints the settings and the SQL, runs nothing), then `npm run ai:deploy-defaults -- --apply` | D1 `lensiq-test`, table `settings`, 2 rows, only if absent | the all-OFF table of §1 |
| 11 | A | `npm run backend:versions` → write the newest version id into DEPLOY-LOG.md as `ROLLBACK_BASE` | nothing | a list of version ids |
| 12 | A | `npm run site:set-api -- --api-base https://lensiq-api-test.<sub>.workers.dev --sitekey <site key from step 2>`; `node tools/build-site.mjs && node tools/check-site.mjs`; commit as its own commit | the repo file `deploy/public-site.json` | `_site/medicine.html` gains the Worker origin + Turnstile in its CSP and loads `lensiq-site-config.js`; every other page is byte-identical |
| 13 | A, after the owner says "push" | `git push` → CI (about 45 min) → Pages (about 10 min) → up to 10 min browser cache | the public site | `curl -s https://anirut77.github.io/lensiq/medicine.html \| grep workers.dev` shows the origin; `index.html` is unchanged |
| 14 | A | `npm run backend:smoke -- --base https://lensiq-api-test.<sub>.workers.dev` again; output saved to DEPLOY-LOG.md | nothing | all PASS |
| 15 | **O** | Admin → AI Gateway: turn on the global switch, then `pc_fields` and `pc_translate` (password + TOTP). Leave `pc_claims` off | settings in D1 `lensiq-test` | AI is live for tester-code holders only |
| 16 | O | The 5-minute phone checklist (§7) | – | – |
| 17 | A | `npm run backend:list`: the list of everything that exists, copied into DEPLOY-LOG.md | nothing (read-only) | deployments and secret NAMES of `lensiq-api-test`, the account's D1 databases |

## 4. `npm run secrets:setup` (owner, own terminal)

What it does: asks for each secret with hidden input and pipes the value straight into
`wrangler secret put <NAME> --env test` on that process's standard input (wrangler resolves this to the Worker
`lensiq-api-test`; see the table in §0 for why `--name` is not passed). Nothing is echoed (not even `*`), nothing is
written to a file, a log or the shell history, and wrangler's own output is replaced by one line per secret.

- It prints `TARGET Worker "lensiq-api-test"` first, then checks (read-only) that the Worker is deployed and stops if it
  is not: a secret is never written to a Worker that does not exist.
- The terminal shows nothing you type for the whole session, also while wrangler is working (about 2 seconds per
  secret). Anything typed or pasted between two questions is thrown away. The terminal is put back to normal when the
  tool ends, on Ctrl-C and if the window is closed.
- "Shown once" is honest only for the visible screen: the tool erases the lines, but the terminal's scroll-back, tmux
  or a screen recording may still hold the bootstrap token. **Clear the terminal afterwards (Cmd-K).** The token is
  replaced by a random value right after the owner account exists (step 9), so a leftover copy stops working then.

What you see, in order:

| Prompt | What to do |
|---|---|
| `[1/8] SECRETS_KEK` (required now) | press **Enter**: it is generated and never shown |
| `[2/8] ADMIN_BOOTSTRAP_TOKEN` (required now) | press **Enter**: it is generated, set, then **shown once**. Copy it (you paste it into the admin page in step 8), press Enter; the lines are erased |
| `[3/8] TURNSTILE_SECRET` (required now) | paste the widget's **Secret key** from step 2, Enter |
| `[4/8] OPENROUTER_API_KEY` (required now) | paste the key from step 1, Enter |
| `[5/8] TESTER_ACCESS_CODE` (required now) | invent a code of **16 characters or more**, Enter. Refused (with the reason, never the value): one repeated character or pattern, a run such as `123456` / `abcdef`, fewer than 8 different characters, a common word (password, tester, lensiq, admin …). This is what you give to testers |
| `[6/8] ALERT_WEBHOOK_URL`, `[7/8] HEALTH_TOKEN`, `[8/8] OPENFDA_API_KEY` (later) | Enter = skip (for `HEALTH_TOKEN` type `s`, Enter) |

Each secret that was set shows `NAME: set`; a failure shows `NAME: FAILED (exit n)` and can be repeated with
`npm run secrets:setup -- --only NAME`. Ctrl-C stops and sends nothing more. Other forms: `-- --list` (names and
set / not set), `-- --dry-run` (asks, sends nothing). An existing `SECRETS_KEK` is never replaced (the stored TOTP
secret could not be decrypted any more).

Change or revoke the tester code: `npm run secrets:setup -- --only TESTER_ACCESS_CODE` (the old code stops working
within seconds; testers' pages forget it on their next request). Revoke with no replacement:
`npm run backend:tester:revoke` (the code becomes a random value nobody knows; the gate stays "required", so everyone
is refused until a new code is set).

## 5. Turn everything off, and rollback

| Want | Command | Effect | Takes effect |
|---|---|---|---|
| **Everything off** | `npm run backend:off` | every public route except `/health` answers 503 `{off:true}`; AI and lookups refuse; pages fall back to on-device results ("could not check: online checks are switched off for now"). Admin stays reachable | seconds |
| Back on | `npm run backend:on` | sets `SERVICE_OFF` to `0` | seconds |
| AI only, no terminal | Admin → AI Gateway → global switch off | `/v1/ai/*` answer "disabled"; lookups keep working | next request |
| Testers only | revoke the tester code (§4) | every gated route refuses | seconds |
| **Roll the Worker back** | `npm run backend:versions`, then `npm run backend:rollback -- <VERSION_ID>` (= `wrangler rollback <id> --env test --name lensiq-api-test`; rollback resolves `--name`, so both flags are right here) | the chosen version serves again. **D1 data is not rolled back.** If secrets changed since that version wrangler asks to confirm; after any rollback run `npm run secrets:setup -- --list` and re-enter the tester code and keys if in doubt (§8 point 3) | immediate |
| Site back to "no API" | `npm run site:set-api -- --clear`, commit, push | medicine.html cannot reach the Worker | CI + Pages, about 1 hour. Use the kill switch first |
| Check the state | `npm run backend:smoke -- --base <url>` (`--expect off` while the kill switch is on) | read-only | – |

Not to be used: `wrangler delete` (it also deletes the secrets; the key that decrypts the admin TOTP secret would be
lost).

## 6. What exists after the deploy, and how to list it

`npm run backend:list` prints (read-only): the deployments of `lensiq-api-test`, its secret **names**, and the
account's D1 databases (`lensiq-test` is LENSIQ's; the others are not touched). The Turnstile widget is in the dashboard
under Turnstile. Expected list: Worker `lensiq-api-test`; D1 `lensiq-test`; Turnstile widget `LENSIQ test`; secrets
`SECRETS_KEK`, `ADMIN_BOOTSTRAP_TOKEN` (closed in step 9), `TURNSTILE_SECRET`, `OPENROUTER_API_KEY`,
`TESTER_ACCESS_CODE` (and `SERVICE_OFF` once the kill switch has been used); 1 cron trigger.

### Created resources (record: `deploy/created.json`)

Created on 2026-11-11 through `tools/backend-deploy.mjs`. Nothing else in the account was created, changed or deleted.

| Resource | Name | Id / address |
|---|---|---|
| D1 database | `lensiq-test` | `3385c7cc-d171-42ae-9d4c-8fdd8c12b21f` (migrations 0001–0010 applied) |
| Worker | `lensiq-api-test` | `https://lensiq-api-test.anirut-s-4df.workers.dev` · first version `c0562341-11d5-4109-a88e-9a239a5544df` |
| Cron trigger | of `lensiq-api-test` | `17 3 * * *` (daily maintenance) |
| Turnstile widget | `LENSIQ test` | created by the owner in the dashboard (step 2); not recorded here until it exists |

The database id is not a secret and is committed in `backend/wrangler.toml [env.test]`, so a fresh checkout can migrate
and deploy. It is written only by `npm run backend:d1:create` / `backend:d1:bind`; a unit test accepts only the
placeholder or the id in `deploy/created.json`, and the tools check before every write that this id is the database
named `lensiq-test`. Tests never use the committed file to drive a tool (they use a copy with the placeholder id), and
under a test runner the tools refuse to start the real wrangler at all, so `npm test` stays offline on a machine that
is logged in to Cloudflare.

## 7. Five-minute phone checklist (owner)

Phone, mobile data or Wi-Fi, a boxed Thai product with a registration number and one label in English or Chinese.

| # | Do | Expect |
|---|---|---|
| 1 | Open `https://anirut77.github.io/lensiq/medicine.html` in a private tab | page as before; no "ask AI" step, no tester card |
| 2 | Product Check: photograph the side with the registration number → "check official sources" | openFDA / HSA rows answer; Thai FDA says "could not check: open to the closed tester group only" |
| 3 | Open `…/medicine.html?tester=1`, enter a wrong code | "That code is not correct"; still no AI step |
| 4 | Enter the right code | "Tester access is on" and, after a label is read, the "ask AI" step |
| 5 | **pc_fields**: tap "ask AI" | consent screen names OpenRouter, then Google Cloud Vertex AI, the model and "outside Thailand, country not fixed"; text preview; send → "AI estimate" fields with "Checked by …" |
| 6 | **pc_fields, photo mode**: ask again, choose "photo of the product", tick "remember" | the blurred photo preview is shown before sending, every time |
| 7 | **pc_translate**: read the English / Chinese label → ask AI | translated lines, numbers unchanged, "translated from the label, not advice" |
| 8 | **pc_claims** | nothing from AI (feature off); on-device claim hits still appear |
| 9 | "check official sources" again | Thai FDA now answers, labelled "testing only" |
| 10 | "Withdraw consent" → ask AI again | the consent screen is shown again |
| 11 | Owner: admin → AI Gateway → usage | a few requests, cost far below 0.01 USD. Then `npm run backend:off`, repeat step 2 → "online checks are switched off"; `npm run backend:on` |

## 8. The plan's 14 unverified points (checked 2026-11-10 without touching the account)

| # | Point | Result | Evidence |
|---|---|---|---|
| 1 | Admin login (PBKDF2 x 100,000) within the Free 10 ms CPU limit | **still unverified; at risk.** Measured locally: 11.8 ms CPU per derivation (Node 22, Apple M1; min 11.8, max 19.6 over 12 runs), above 10 ms. Cloudflare: "Each isolate has some built-in flexibility to allow for cases where your Worker infrequently runs over the configured limit"; auth work "typically uses 10-20 ms". An occasional owner login may pass; it is proven only in step 8. If it fails: stop, ask the owner (paid plan 5 USD / month is the only fix; iterations are not lowered) | local measurement; developers.cloudflare.com/workers/platform/limits |
| 2 | Cache API on `*.workers.dev` | **still unverified.** The docs name custom domains and Pages; for workers.dev they only say the query string is part of the cache key. The code treats a missing cache as "no cache" (each tap asks the source again) | …/workers/runtime-apis/cache |
| 3 | Does a rollback bring back old secret values | **different from the plan's assumption, partly unverified.** The API refuses a rollback when secrets changed since that version and wrangler asks to confirm; which values are live afterwards is not documented. Rule: after any rollback re-check and re-enter secrets (§5) | wrangler source `versions/rollback`; rollbacks page is silent |
| 4 | `preview_urls` key name | **confirmed**, and it matters: unset it follows `workers_dev`, and version URLs are public. `[env.test]` sets `preview_urls = false`; `wrangler deploy --dry-run --env test` accepts it without a warning (wrangler 4.158.0) | …/workers/wrangler/configuration, local dry run |
| 5 | AI route CPU within 10 ms | **still unverified** until measured on the account (dashboard → Worker → Metrics → CPU time) |  |
| 6 | Large Thai FDA SOAP answer within 10 ms | **still unverified**; same measurement. Testers only now (D2), so exposure is small |  |
| 7 | Daily cron within 10 ms on a large events table | **confirmed as a limit** ("CPU time per Cron Trigger: 10 ms"); not a risk in this test (the analytics route is not enabled in this deployment, so the events table stays empty) | limits page |
| 8 | OpenRouter serving regions for the pinned routes | **confirmed, wording adjusted.** ZDR endpoints on 2026-11-10: Claude Haiku 5.5 → `google-vertex/global`, `/us`, `/europe` (and Bedrock); GPT-6 Luna → `azure`, `azure/us`, `azure/eu` only. A base slug matches every region, so the consent text says "outside Thailand (global, US or Europe; country not fixed)" | openrouter.ai/api/v1/endpoints/zdr, provider-routing docs |
| 9 | Do Anthropic / OpenAI receive the data on those routes | **still unverified.** OpenRouter states only that with ZDR enforced the first-party Anthropic / OpenAI endpoints are removed. The consent and privacy texts therefore name Google Vertex and Azure and make no statement about the model makers | openrouter.ai/docs/features/zdr |
| 10 | The served-provider name in the answer | **different.** P8 runs recorded "Google Vertex" and "Azure"; the endpoints API calls the Vertex provider "Google". The gateway accepts both spellings for the Vertex pin. To be confirmed on the first real call (step 16); a mismatch shows as an owner alert `route_mismatch`, and the chain moves to the next entry | P8-RESULTS; endpoints API |
| 11 | Site rollback time (CI + Pages) | **different: longer.** Last runs: CI 43–46 min, Pages 10 min. **The Pages runs for the last two commits (`5ff561a`, `fac8b7f`) were cancelled at the job's 20-minute limit**, so the live site may be behind `main`. Must be looked at before step 13 | `gh run list` 2026-11-10 |
| 12 | GitHub Pages `Cache-Control: max-age=600` | **confirmed by observation** (response header of the live page); no official doc states it | `curl -sI` 2026-11-10 |
| 13 | D1 Time Travel 7 days on Free | **confirmed**: "30 days … (Workers Paid plan) or 7 days (Workers Free plan)". A restore overwrites the database in place | …/d1/reference/time-travel |
| 14 | Platform logs (Workers Logs) contents | **partly confirmed.** The invocation log holds "<Method> <URL>"; whether query strings are redacted is not stated, so assume the full URL is logged. Bodies and headers are not described as logged. Consequence kept in the design: the tester code and all label data travel in headers / bodies, never in a URL; the page uses `POST /api/pc/batch` | …/workers/observability/logs/workers-logs |

Also learned: `wrangler secret put` on a Worker that does not exist creates a draft Worker (with piped input it
confirms by itself), and secret commands resolve `--env` + `--name` to `<name>-<env>`. So every secret path passes
`--env test` only and first checks, read-only, that `lensiq-api-test` is deployed (§0). Still to confirm on the account
at step 6: that `wrangler deployments list --json` prints a JSON list (if it does not, the tools refuse to write
secrets rather than guess). In a shell with no terminal wrangler needs the account id when the login has more than one
account; the owner's login is expected to have one. The Free daily quotas (requests, D1 rows) are per account.
`workers.dev` runs Browser Integrity Check, which can refuse library user agents (error 1010): the smoke script sends a
browser-style user agent.

## 9. DEPLOY-LOG.md template (`~/LENSIQ-field/evals/deploy/DEPLOY-LOG.md`)

```
Date / who:
Account name confirmed by owner (step 4):
D1 lensiq-test id:
Worker URL:
Turnstile site key (public):
ROLLBACK_BASE version id (step 11):
Smoke output after step 6 / step 14:
Admin sign-in on Free plan (step 8): ok / error 1102
Created resources (npm run backend:list, step 17):
First real AI call: served provider name seen on the result card:
```

## First-time setup of the admin account (2026-11-11)

- The setup screen is shown only while `GET /admin/api/state` says no owner exists. The page never learns whether the
  setup code is configured; a missing code answers "setup is closed" on submit.
- Wrong setup codes: 5 attempts per address per hour, then 429 for that address for the rest of the hour. A wrong
  attempt does not use the code up and does not lock setup for other addresses. The code stops creating accounts as
  soon as one owner exists (the insert is fixed to id 1), and `npm run backend:bootstrap:close` then replaces it.
- CPU: creating the account hashes the password once (PBKDF2-SHA-256, 100,000 iterations, in WebCrypto) and signing
  in hashes it once more. On the Free plan (10 ms CPU per request) this is the one place error 1102 could appear.
  Observed on `lensiq-api-test`: account creation succeeded (audit `bootstrap.ok`, 2026-11-11). If 1102 ever
  appears, stop and ask the owner; the plan is never upgraded by the agent.
- Recovery codes: ten, shown once when 2-step verification is turned on; only SHA-256 hashes are stored
  (migration `0011_admin_recovery.sql`); each works once at sign-in or to turn 2-step verification off; a wrong one
  counts as a failed sign-in. A new set (Security tab) needs the password and a 6-digit code and voids the old set.
- Session mode (cookie on the Worker's own origin, in-memory token elsewhere) is chosen by the page. Developers
  only: `localStorage["lq-admin-dev"] = "1"` enables `?session=cookie|bearer` and shows the API host.
- Order when deploying this change: `npm run backend:migrate` first, then `npm run backend:deploy:test`. `/health/deep`
  probes the recovery-code table, and turning 2-step verification on is undone if the codes cannot be stored.
- Recovery codes carry 50 random bits and are stored as plain SHA-256. Guessing online is not feasible (5 failures per
  15 minutes) and the password is needed as well; a keyed hash is a possible hardening if the database ever leaves
  Cloudflare.
- Custom domain: `docs/CUSTOM-DOMAIN.md`.

## AI provider keys from the admin panel (2026-11-11)

- Order: `npm run backend:migrate` (adds `0012_ai_keys.sql`), then `npm run backend:deploy:test`. Without the table
  the gateway keeps using the Worker secrets and `/health/deep` names `0012_ai_keys.sql` as missing.
- Moving the OpenRouter key into the panel (owner): Admin → AI Gateway → "AI provider keys" → OpenRouter → Set key →
  paste the key, password, 6-digit code → Save → Test key. The panel key is used from then on. The Worker secret
  `OPENROUTER_API_KEY` can stay as a fallback or be deleted later by the owner.
- `SECRETS_KEK` must not be changed while keys are stored in the panel: they would become unreadable (the panel then
  says so) and must be set again.
