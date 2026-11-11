# AI Gateway (round 17, phases P5 "AI Gateway core" and P6 "provider adapters")

> Built from the owner-approved design `docs/PRODUCT-CHECK-DESIGN.md` §10–12 (approved 2026-11-09). Nothing is deployed;
> no real API key was used. Every provider in the tests is a mock (fake adapter or fake SDK).
> Accuracy claims: none. This phase moves and controls AI calls; it does not change what any model answers.
> P6 (2026-11-10): the seven other provider adapters, written against the official REST docs with plain `fetch`, tested
> with a mocked `fetch` only (no key, no network). Prices and terms re-read from the official pages on 2026-11-10 (§3b).

## สรุปสำหรับเจ้าของ (Thai summary)

- ทุกการเรียก AI ผ่าน Worker เท่านั้น (`POST /v1/ai/<feature>`) เบราว์เซอร์ไม่ติดต่อผู้ให้บริการโดยตรง CSP เหมือนเดิม
- ติดตั้งใหม่: **AI ปิดทั้งระบบ** และงบของฟีเจอร์ใหม่ = 0 จึงไม่มีอะไรทำงานจนกว่าเจ้าของตั้งงบ
- ผู้ให้บริการทุกรายเปิดไว้ในรายการที่อนุญาตเป็นค่าเริ่มต้น (PC-D2) ผู้ดูแลปิดรายใดก็ได้ ปิดแล้วจะไม่ถูกเรียกและไม่แสดงในหน้าขอความยินยอม
- คีย์อยู่ใน Worker secret เท่านั้น หน้าแอดมินเห็นแค่ "ตั้งแล้ว / ยังไม่ตั้ง" ทางเก็บคีย์แบบเข้ารหัสใน D1 เดิมยังอยู่ แต่ปิดเป็นค่าเริ่มต้น (PC-D4)
- งบรายเดือนจองไว้ก่อนเรียกด้วยคำสั่ง SQL เดียว เรียกพร้อมกันกี่ครั้งก็ไม่เกินงบ หลังเรียกปรับเป็นค่าจริง ถ้าไม่ถูกคิดเงินคืนงบ
- ผู้ช่วยเขียนคำทำนายย้ายมาใช้ gateway แล้ว (feature `fortune_reword`) พฤติกรรมเดิมทุกอย่าง ชุดทดสอบเดิมผ่านโดยไม่แก้
- P6: ต่อผู้ให้บริการครบทุกราย (Gemini, OpenAI, Qwen, DeepSeek, z.ai, Kimi, OpenRouter) ด้วย fetch ธรรมดา ไม่เพิ่ม SDK
  ทดสอบด้วยการจำลองทั้งหมด ไม่ใช้คีย์จริง ราคาอ่านจากหน้าทางการ 2026-11-10 ราคาที่ยืนยันไม่ได้ (Kimi, OpenRouter) จองงบด้วยราคาสูงแบบระมัดระวัง
  Gemini ใช้ได้เฉพาะคีย์แบบเสียเงิน OpenRouter บังคับไม่เก็บข้อมูลทุกครั้งและแสดงว่าเป็นผู้ประมวลผลรายที่สอง DeepSeek แจ้งว่าเก็บในจีนและอาจนำไปฝึก
  Qwen (สิงคโปร์) ต้องตั้ง `DASHSCOPE_WORKSPACE_ID` เพิ่ม (รหัส workspace ไม่ใช่ความลับ) ไม่ตั้งจะไม่ถูกใช้
- หน้าขอความยินยอมบอกชื่อผู้ให้บริการที่ใช้จริง โมเดล ประเทศที่ประมวลผล และการเก็บข้อมูลของผู้ให้บริการ (ไทย / อังกฤษ / จีน)
  ผู้ใช้เลือก "จำการเลือก" ได้ และถอนความยินยอมได้ทุกเมื่อ โหมดข้อความเป็นค่าเริ่มต้น โหมดภาพเฉพาะฟีเจอร์ที่อนุญาต

## Product Check decisions (owner, 2026-11-10; P7)

| Topic | Decision | Where |
|---|---|---|
| Text the AI may receive | **Only text from the on-device OCR of the label** (option b). The user may delete or correct; added words are struck through and dropped (`LQPCGuard.provenance`). The Worker cannot verify this (it never sees the label or its OCR; sending them would move deleted label data off the device), so it is enforced at the page's single send path and by e2e | `lensiq-pc-guard.js`, `lensiq-pc-ai.js` |
| Dispensing / prescription labels | AI **off** (`dispensingAI: "off"`); the Worker refuses such text too. Foreign labels added after the v5 check (Taiwan clinic, Shanghai outpatient; dev only) | `pc-features.js` |
| Product-label evidence (option 1; **measured independently; owner decision ก, 2026-11-10: keep the filter, add guidance when refused, fix the misclassified cases**) | AI only for a capture that IS a product label: one strong cue (registration-number shape, or a barcode with a valid check digit) or two label cue types, AND no personal-document sign (recipient / sender, delivery, order, receipt, certificate, appointment, letter), AND not a dispensing label. One function, `LQPCGuard.aiGate`, for text mode and image mode: otherwise no consent screen, no request, a message in TH / EN / ZH; on-device results stay. The Worker runs the same function on the text and answers `bad_input`; the page may hand in `gtins` / `regs` as evidence (never passed to a provider). Client-only: image mode without text, that a barcode was really scanned, OCR provenance. Targets: 0 personal-data items reaching the AI, < 5 % product labels refused. **Official (independent agent, locked set sha256 `470d3e7b…`, scored once; synthetic): personal-data items reaching the AI 0/260 in text mode and in image mode (met); real product labels refused 69/360 = 19.2 % (not met)**: clean 12.5 %, low-quality OCR 22.5 %, Thai 25.0 %, foreign 16.7 %, with barcode / registration facts 5.0 %, without 28.2 %, front panel 38.9 %, short capture 28.9 %, long 7.8 %, back 1.1 %. 61 refusals = no evidence (front panels, 2–4 lines); 8 = misclassified, fixed. Spent set after the fixes (not an independent figure): 0/260 and 61/360 = 16.9 %. Dev (synthetic, tuned on): documents 174/174 refused, product labels 14/335 = 4.2 % refused | `lensiq-pc-guard.js`, `lensiq-pc-ai.js`, `pc-features.js`; `docs/product-check/P7-RESULTS.md` §3.4, §3.7 |
| Refused for lack of product evidence (decision ก) | The page says what to do next: photograph the side with the registration number or the ingredients list, or scan the barcode; one-tap buttons to the page's own barcode scan and camera. Nothing is sent. A personal document or a dispensing label gets its reason only, no retry hint. The Worker answer is unchanged (`bad_input`) | `lensiq-pc-ai.js` (`#pcAiGuide`); e2e 4e |
| Option ข | **Not built.** If ordered: its own commit, measured once by an independent agent on a new locked set (the current one is spent) | `docs/product-check/P7-RESULTS.md` §3.7 |
| Local evaluation mode (**eval bypass, approved for local evaluation only**) | With `AI_EVAL_LOCAL=1` AND a localhost request URL AND a localhost Origin the Worker skips the product-label filter (not the name guard, not the dispensing refusal) so advert snippets can be scored. Never in a deployed Worker (§10a) | `ai/gateway.js` `evalLocalMode`, `ai/pc-features.js`, tests P7-9a–e |
| Maker phones and e-mails | **kept** (`companyPhones: "keep"`) | `lensiq-pc-guard.js` |
| Mandatory text preview | always before a send; possible names underlined | `lensiq-pc-ai.js` |
| Patient-name guard figures | independent, fresh frozen set each time: v1 60.6 %, v2 78.8 %, v3 76.0 %, v4 73.2 %, **v5 62.0 %** recall (harder, non-Thai-heavy set; target 99 %: not met). The layers above carry the rest; known gaps in P7-RESULTS §3.2c | `docs/product-check/P7-RESULTS.md` §3 |

## 1. Architecture

```
browser (lensiq-ai.js) ── GET  /v1/ai/providers?feature=…   consent-screen data (no secrets)
                       └─ POST /v1/ai/<feature>             {consent:true, providers:[shown ids], mode, input}
Worker  index.js router ─► ai/gateway.js aiRoute()
          1. feature known + live? global switch + feature switch on?            ai/settings.js (D1 'ai_gateway')
          2. body size, consent + the providers the user saw, mode (text | image only if allowed)
          3. Turnstile (action "ai", fail closed), membership                   turnstile.js, members.js (existing)
          4. per-user per-minute / per-day + global per-minute limits           store.js hitAll (existing)
          5. feature.build(input) -> provider-neutral request
          6. runFeature(): for each usable chain entry (allowlisted, adapter, key, shown on the consent screen):
               reserve budget (one SQL statement) -> adapter.call() with a deadline -> validate JSON schema
               -> settle / refund -> one log line -> aggregates -> fallback policy (§4)
        ◄── {ok:true, json, provider, model, region, providerName, regionText} | {fallback:true, reason, error}
fortune.js /api/fortune (unchanged route, grounding, quotas, client contract) ─► runFeature("fortune_reword")
```

| File | Role |
|---|---|
| `backend/src/ai/gateway.js` | core: `runFeature`, `aiRoute`, `providersInfo`, `chainReady`, admin `adminGateway` / `adminPutGateway` / `adminUsage` |
| `backend/src/ai/settings.js` | settings shape, defaults, validation, fortune migration (`getGateway`, `putGateway`) |
| `backend/src/ai/features.js` | feature registry (`fortune_reword` live; P7: `pc_fields`, `pc_claims`, `pc_translate` live, still OFF with budget 0 on a new install) |
| `backend/src/ai/pc-features.js` | P7: the three Product Check features: strict schemas (no verdict field), short prompts, `verify` (evidence spans must be substrings of the text sent; registration numbers marked `ocr` / `model`), server-side patient-name guard (`lensiq-pc-guard.js`, same module as the page). Details: `docs/product-check/P7-RESULTS.md` |
| `backend/src/ai/fallback.js` | the §10.3 policy table as data + `decide()` |
| `backend/src/ai/schema.js` | JSON-Schema subset validator (`validateJson`, `assertSupportedSchema`) |
| `backend/src/ai/db.js` | **all** gateway database access (standard SQL) |
| `backend/src/ai/adapters/index.js` | provider table (names, processing region, retention, secret names), adapter registry, key lookup |
| `backend/src/ai/adapters/prices.js` | versioned price table with effective dates; `priceAt`, `costMicros` |
| `backend/src/ai/adapters/anthropic.js` | the Anthropic adapter (moved from `fortune.js`, same behaviour) |
| `backend/src/ai/adapters/common.js`, `oaicompat.js` | P6: plain-fetch helpers; the shared OpenAI-compatible chat-completions adapter shape |
| `backend/src/ai/adapters/{gemini,openai,dashscope,deepseek,zai,kimi,openrouter}.js` | P6: one adapter per provider (§3) |
| `backend/migrations/0010_ai_gateway.sql` | `ai_usage_monthly` (monthly aggregates) |
| `lensiq-ai.js` | browser helper: consent dialog, remembered consent + withdraw, mode choice, fallback messages (TH/EN/ZH) |
| `admin.html` / `admin.js` / `admin.css`, `i18n/en-admin.js`, `i18n/zh-admin.js` | admin "AI Gateway" tab |
| `tools/check-ai-providers.mjs` | lint guard (part of `npm run lint`) |

## 2. Settings

Stored in D1 `settings` under key `ai_gateway`; read and written only through `ai/db.js`. Validation refuses unknown
keys and out-of-range values (400).

| Setting | Scope | Default (new install) | Range |
|---|---|---|---|
| `enabled` | global | **false** | boolean |
| `legacyKeyStore` | global | **false** (PC-D4) | boolean |
| `providers` | global allowlist | **every provider true** (PC-D2, owner 2026-11-09) | `{anthropic, gemini, openai, dashscope, deepseek, zai, kimi, openrouter}: boolean` |
| `last_eval` | global | null (placeholder until the P8 eval tool) | `YYYY-MM-DD` |
| `features.<id>.enabled` | feature | false | boolean |
| `features.<id>.chain` | feature | `[]` | ≤ 6 × `{provider, model, effort?}`, no duplicates |
| `features.<id>.timeoutMs` | feature | 20 000 (`pc_fields`), 30 000 (text) | 1 000 – 120 000 |
| `features.<id>.monthlyBudgetUsd` | feature | **0** = nothing runs | 0 – 100 000 (null only for `fortune_reword`) |
| `features.<id>.perUserDaily` | feature | 10 | 0 – 10 000 |
| `features.<id>.perUserPerMinute` | feature | 3 | 0 – 600 |
| `features.<id>.globalPerMinute` | feature | 60 | 1 – 10 000 |
| `features.<id>.maxOutputTokens` | feature | 1 500 | 64 – 8 192 |
| `features.<id>.imageModeAllowed` | feature | false | true only for image-capable features (`pc_fields`) |

**Fortune migration (no value lost, nothing deleted).** `fortune_reword` is derived from the existing `ai` settings, which
remain the source of truth and keep working through `/admin/api/ai`:

| `fortune_reword` | existing `ai` setting |
|---|---|
| `enabled` | `enabled` |
| `chain[0]` | `{provider: "anthropic", model, effort}` |
| `maxOutputTokens` | `max_tokens` (fortune still caps at 2 048) |
| `perUserDaily` / `perUserPerMinute` / `globalPerMinute` | `per_caller_daily` / `rpm` / `global_rpm` |

Only what fortune never had is stored in `ai_gateway`: `timeoutMs` (default 120 000 ms, the SDK timeout fortune used),
`monthlyBudgetUsd` (default **null = no gateway budget**, the behaviour before the gateway) and chain entries after the
first. Editing `fortune_reword` in the gateway writes the legacy fields back into `ai` (validated there first). The first
chain entry must stay Anthropic. The global switch does not gate fortune (it keeps its own switch); the allowlist does.
Fortune's other limits (guest daily cap, paid buckets, plan quota, domains) stay in `fortune.js` unchanged.

## 3. Adapters

Provider-neutral request built by a feature: `{system, text, images?: [{mime, base64, width, height}], output: {name,
schema, validate?}, maxOutputTokens}`. Adapter: `{id, capabilities(model), region(model), call(req, entry, ctx)}` with
`ctx = {key, timeoutMs, loadSdk?, fetchImpl?}`. Results: `{ok:true, json, model, usage:{inputTokens, outputTokens,
reasoningTokens?, cachedInputTokens?, imageTokens?}, providerRequestId?}` or `{ok:false, kind, retryAfterMs?, httpStatus?,
usage?, providerRequestId?, unexpected?}`. Cost is computed centrally from `prices.js`.

**Anthropic (P5)** — moved from `fortune.js` with identical behaviour: official SDK, `new Anthropic({apiKey, timeout,
maxRetries: 1}).beta.messages.create({model, max_tokens, betas: ["server-side-fallback-2026-07-01"], fallbacks:
"default", system: [{…, cache_control: {type: "ephemeral"}}], output_config: {effort, format: {type: "json_schema",
schema}}, messages})`; no sampling parameters; `stop_reason` checked first (`refusal` → refusal, `max_tokens` →
truncated); no text / bad JSON → invalid_json. SDK error mapping: `RateLimitError` → rate_limited (with `retry-after`),
`APIConnectionTimeoutError` → timeout, `APIConnectionError` → connection, `APIError` by status (529/503 overloaded, 5xx
server_error, 401/403 auth, 400/404/413/422 bad_request), anything else → server_error with `unexpected: true` (fortune
still answers 500 for it). `fortune.js buildRequest()` still returns the exact SDK body (built by the adapter).

Review fixes (2026-11-10):
- **SDK retries:** 0 for every feature (the gateway owns retries), except `fortune_reword`, which keeps `maxRetries: 1`
  and gets **no same-model retry from the gateway**: a 5xx, bad JSON or rate limit costs exactly the calls it cost before.
- **Deadline:** one overall deadline per request (`overallMs`; fortune 85 s, under the 90 s abort of `fortune-ai.js`;
  others min(120 s, timeout x 2 x chain length)). Each attempt gets min(timeout, time left) and an `AbortSignal` that is
  aborted at its deadline; "retry-after fits" is decided on the real time left.
- **Pinning:** when a monthly budget cap applies, the Anthropic request is sent without `betas` / `fallbacks: "default"`,
  so the served model is the model that was priced and reserved. Fortune (no cap) keeps the server-side fallback.
- **Cache pricing:** usage carries `cacheWriteTokens` / `cachedInputTokens`; Anthropic rows price cache writes at 1.25x
  and reads at 0.1x the input price; the reservation prices the system prompt as a cache write.
- **Legacy key explained:** with an encrypted key stored from the admin page and `legacyKeyStore` off, the admin "AI
  settings" tab and `/api/fortune/status` (`reason: "key_stored_not_used"`, `message` in TH/EN/ZH) say so.

**P6 adapters (2026-11-10).** Plain `fetch` (no SDK), one POST per attempt, key only in a header, the gateway's
`AbortSignal` passed to `fetch`, `redirect: "manual"`. Same result shape and error kinds as Anthropic. The gateway now
passes `ctx.fetchImpl = deps.aiFetch` (tests), `ctx.config` (non-secret provider settings) and `ctx.day` (its price day).

Independent-review fixes (2026-11-10):
- **No key echo:** request ids (`x-request-id`, body `id` / `request_id`, Gemini `responseId`) are kept only when they
  match `^[A-Za-z0-9._:-]{1,64}$`, do not contain the key (or its first 8 characters) and are not key-shaped (`sk-`,
  `sk_`, `AIza`, `Bearer`); the served model must match `^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,63}$` under the same rule,
  otherwise the requested model is reported. The same check applies to OpenRouter's routed provider name.
- **Workspace id validated:** `providerReady` uses the adapter's own `WS_RE`; a malformed `DASHSCOPE_WORKSPACE_ID` is
  "invalid" (not offered, not called; the admin says "invalid format", the key check fails without a request).
- **OpenRouter caps:** `max_price` also sets `request: 0` (no per-request fee) and `image: 0.016` USD (one image at the
  ceiling, `prices.js ROUTER_CAPS`); the price row is read for the gateway's price day, not the clock.
- **Reported cost:** used only when it is a finite number from 0 to 100x the price-table cost; anything else falls back
  to the table cost and raises `ai_config_error` (`reported_cost_out_of_range`).
- **Estimate hints:** `adapter.estimateHints(req, entry)` adds the JSON instruction + schema text that JSON-object
  providers append to the system prompt, and Qwen reserves 2 x the 28-px patch count of a 1024 x 1024 crop (2,676
  tokens) per image instead of 1,600.

| Provider | Endpoint (POST) | JSON | Images | Provider-specific error mapping |
|---|---|---|---|---|
| Gemini | `generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`, `x-goog-api-key` | `responseMimeType: application/json` + `responseJsonSchema` (native) | `inlineData` parts | 429 with a `FreeTier` quota → **auth** + `freeTier` (paid tier only, L2); RetryInfo `retryDelay` → `retryAfterMs`; `FAILED_PRECONDITION` / `PERMISSION_DENIED` → auth; `DEADLINE_EXCEEDED` → timeout; `promptFeedback.blockReason` → content_policy_input; finish SAFETY / PROHIBITED_CONTENT / BLOCKLIST / SPII / RECITATION → refusal; MAX_TOKENS → truncated; thoughts tokens → reasoning |
| OpenAI | `api.openai.com/v1/chat/completions`, Bearer | `json_schema` strict (keywords strict mode may not accept, e.g. `maxLength`, are dropped from what is sent; the gateway still validates the full schema); `store: false`; `max_completion_tokens`; `reasoning_effort` | `image_url` data URL | 429 `insufficient_quota` → auth; 400 `content_policy_violation` → content_policy_input; `message.refusal` → refusal |
| Qwen (Alibaba, Singapore) | `{DASHSCOPE_WORKSPACE_ID}.ap-southeast-1.maas.aliyuncs.com/compatible-mode/v1/chat/completions`, Bearer | `json_object` + schema in the prompt (json_schema "not supported yet" in Singapore); `enable_thinking: false` (VL structured output needs it) | `image_url` data URL | `data_inspection_failed` → content_policy_input; `Arrearage` / `FreeTierOnly` / `OUT_OF_SERVICE` → auth; `ModelNotFound` → bad_request. No workspace id → not offered, adapter answers unsupported |
| DeepSeek | `api.deepseek.com/chat/completions`, Bearer | `json_object` + "json" and the schema in the prompt (both required by the docs); blank content → invalid_json | `deepseek-flash` only (`deepseek-v4-pro` → unsupported, no request) | 402 insufficient balance → auth; 422 → bad_request; cache hits from `prompt_cache_hit_tokens` |
| z.ai (GLM) | `api.z.ai/api/paas/v4/chat/completions`, Bearer | `json_object` for text; vision requests have no `response_format` in the spec → schema in the prompt only | `image_url` data URL | business codes: 1113 (balance, HTTP 429), 1308 / 1310 / 1311 → auth; 1301 → content_policy_input; 1302 → rate_limited; 1305 → overloaded; 1210–1222 / 1261 → bad_request; finish `sensitive` → refusal |
| Kimi (Moonshot) | `api.moonshot.ai/v1/chat/completions`, Bearer | `json_schema` strict | `image_url` data URL in a content array | status table |
| OpenRouter | `openrouter.ai/api/v1/chat/completions`, Bearer | `json_schema` strict; `usage: {include: true}` | `image_url` (routed model must accept it) | **forced** `provider: {data_collection: "deny", zdr: true, require_parameters: true, max_price}` set last (a request cannot override it); 402 → auth; 403 moderation → content_policy_input; HTTP 200 with an `error` object handled like the status; served `model` and routed `provider` read from the response |

Common status table (`common.js kindOfStatus`): 429 rate_limited (+ `Retry-After`), 503 / 529 overloaded, 408 / 504
timeout, other 5xx server_error, 401 / 402 / 403 auth, 400 / 404 / 409 / 413 / 422 bad_request; a rejected `fetch` →
connection (AbortError → timeout); a non-JSON body → invalid_json; finish `length` → truncated; finish `content_filter`
/ `sensitive` → refusal. Usage: `completion_tokens` already include reasoning, so output = completion − reasoning
(never counted twice); cached tokens are reported but priced at the full input price unless a row says otherwise.

**OpenRouter and the budget.** OpenRouter rows are priced at the conservative ceiling (§5), the same ceiling is sent as
`provider.max_price` (a hard filter: no provider above it is used), and the provider-reported `usage.cost` is passed on
as `usage.reportedCostMicros`; the gateway settles with max(price-table cost, reported cost) and keeps the P5 rule: the
budget counter is charged at most the reservation, a higher real cost goes to the aggregates and raises
`cost_over_reservation`. The routed provider is returned as `routedVia` and shown on the result card ("OpenRouter
(router: a second processor) (routed to OpenAI)", TH / EN / ZH, `lensiq-ai.js checkedBy`). It is not written to the
log line (the allowed log fields are fixed by test 14).

**Default chains (P6, `adapters/index.js DEFAULT_CHAINS`)** for new installs; the features stay **off with budget 0**,
so nothing runs until the owner acts, and the admin can edit any chain (every provider is allowed, PC-D2). Rule until
the P8 eval: provider does not train on API data, price verified on the provider's own page, native JSON schema
preferred, cheapest first, then a different company:

| Feature | Chain (in / out USD per 1M) |
|---|---|
| `pc_fields` (label fields, image or text) | Claude Haiku 5.5 effort low (0.10 / 0.50) → GPT-6 Luna (0.10 / 0.50) → Qwen3-VL-Plus (0.20 / 1.60) |
| `pc_claims` (over-claim classifier; a wrong flag can harm a brand, so quality first) | Claude Sonnet 5.5 effort low (2 / 10) → GPT-6.1 Terra (1 / 5) → Qwen3.7-Plus (0.50 / 2.00) |
| `pc_translate` (label translation, Thai / CJK) | Claude Haiku 5.5 effort low → GPT-6 Luna → Qwen3.7-Plus (0.50 / 2.00) |
| `fortune_reword` | unchanged (first entry = the "AI settings" Anthropic model) |

**Gemini held out (owner pending, 2026-11-10):** Gemini is removed from the `pc_fields`, `pc_claims` and `pc_translate` defaults because Google's terms require users 18+ and forbid apps likely to be used by under-18s (the public medicine page cannot check age), until the owner or counsel decides (L2). It stays allowed (PC-D2) and the admin can add it back to any default chain. `pc_claims` was aligned the same way at merge (Qwen3.7-Plus third instead).

DeepSeek, Kimi, z.ai and OpenRouter are in no default chain (training allowed or not stated, unverified price, or a
second processor); the owner can add them.

### 3a. Keys: secret names and the key check

The gateway reads exactly these names (`backend/src/ai/adapters/index.js`, `SECRET_NAMES`). Production:
`cd backend && npx wrangler secret put <NAME>`. Local `wrangler dev`: `backend/.dev.vars` (git-ignored by
`backend/.gitignore`; `backend/.dev.vars.example` lists the names with empty values). Agents never see a key.

| Provider | Secret name | Adapter | Key-check request (read 2026-11-10, no key used) |
|---|---|---|---|
| Anthropic (Claude) | `ANTHROPIC_API_KEY` | P5 | `GET api.anthropic.com/v1/models?limit=1` |
| Google Gemini | `GEMINI_API_KEY` | P6 | `GET generativelanguage.googleapis.com/v1beta/models?pageSize=1` |
| OpenAI | `OPENAI_API_KEY` | P6 | `GET api.openai.com/v1/models` |
| Alibaba Cloud Qwen (Model Studio, Singapore) | `DASHSCOPE_API_KEY` + **`DASHSCOPE_WORKSPACE_ID`** (not a secret) | P6 | `GET {WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/api/v1/models?page_size=1` ([list models](https://www.alibabacloud.com/help/en/model-studio/list-models), updated 2026-11-06) |
| DeepSeek | `DEEPSEEK_API_KEY` | P6 | `GET api.deepseek.com/models` |
| Zhipu z.ai (GLM) | `ZAI_API_KEY` | P6 | `POST api.z.ai/api/paas/v4/tokenizer` with a one-word message (no list-models endpoint is documented in the [API reference](https://docs.z.ai/llms.txt) or `openapi.json`; the tokenizer generates no text; its billing is not stated) |
| Moonshot Kimi | `KIMI_API_KEY` | P6 | `GET api.moonshot.ai/v1/models` (host confirmed in the [K3 quickstart](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart)) |
| OpenRouter | `OPENROUTER_API_KEY` | P6 | `GET openrouter.ai/api/v1/key` |

**DashScope workspace id (P6 finding).** Alibaba's current docs give the Singapore endpoint only as
`https://{WorkspaceId}.ap-southeast-1.maas.aliyuncs.com/…` ([first API call](https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen),
updated 2026-10-27); the old `dashscope-intl.aliyuncs.com` host is no longer documented. The workspace id is read
from the Worker variable `DASHSCOPE_WORKSPACE_ID` (`[vars]` or a secret; listed in `backend/.dev.vars.example`).
Without it Qwen is never offered or called, the admin shows "DASHSCOPE_WORKSPACE_ID not set", and the key check says
`FAIL http=- (DASHSCOPE_WORKSPACE_ID not set)` without sending anything.

**Key check:** `npm run -s ai:keycheck` (= `node tools/ai-key-check.mjs`; `--vars FILE` for another file). It reads the
names above from the environment, then `backend/.dev.vars`, and sends one read-only request per configured provider
(the provider's "list models" endpoint; OpenRouter: `/api/v1/key`, because its model list is public) with the key in a
header. Nothing is generated or billed. Output, one line per provider, e.g.
`openai     OPENAI_API_KEY      FAIL http=401` — provider, secret name, `OK` / `FAIL` / `SKIP` (not set), HTTP status.
It never prints a key, a key prefix, a response body or an error message; exit 1 when any key fails; it refuses to run
in CI. P6 verified every endpoint from the official docs (above); none was called with a real key. Worker secrets set with `wrangler secret put` cannot be
read back, so for production run the check with the same keys in `backend/.dev.vars` or the environment.

**Lint guard** (`tools/check-ai-providers.mjs`, run by `npm run lint`): fails when `api.anthropic.com`,
`@anthropic-ai/sdk`, `generativelanguage.googleapis.com`, `api.openai.com`, `dashscope`, `deepseek`, `z.ai`,
`bigmodel.cn`, `moonshot`, `kimi`, `openrouter`, `aliyuncs` or a `maas.` host label (P6 review) appears in `backend/src` outside `backend/src/ai/adapters/`, or when a
file there imports / requires a provider SDK package (`openai`, `@google/genai`, `@google/generative-ai`,
`@anthropic-ai/*`, `groq-sdk`, `@mistralai/*`).

### 3c. Keys set from the admin panel (2026-11-11; `ai/keystore.js`, migration 0012)

Owner spec 2026-11-11. Admin → AI Gateway → "AI provider keys".

- **Write-only.** No answer carries a key; the panel shows the provider, where the key in use comes from (set in the
  panel / set on the server / none), the last 4 characters, when it was set and the last test result.
- **Envelope encryption.** A random 256-bit data key encrypts the provider key (AES-GCM, bound to the provider); the
  data key is encrypted with `SECRETS_KEK` (bound to the provider). A row moved to another provider, or read with
  another KEK, does not decrypt: it is shown as "cannot be read, set it again" and never used.
- **Priority.** A key set in the panel is used before the Worker secret of the same provider; removing it falls back
  to the Worker secret. The consent screen and the calls use the same resolution (`usableChain`).
- **Re-authentication.** Set, replace and remove need 2-step verification on and the password plus a fresh 6-digit
  code in that very request. The 5-minute confirmation window and recovery codes are not accepted. Malformed keys and
  a missing KEK are refused before the code is checked, so no code is used up on them.
- **Audit.** `ai.provider_key.set | replaced | removed | tested` with provider and last 4 only.
- **Test key.** One request that bills nothing (§3a), key in a header, only OK / FAIL returned; 10 tests per hour
  for the whole back office. z.ai is not tested from the panel: its check endpoint does not state that it is free.
- **Spend per provider.** Each attempt adds `pcost:<provider>`; the monthly usage shows spend per provider.
- **Default and fallback model per feature, budgets:** unchanged, in the feature cards of the same tab.
- Fixed test set: `tests/unit/backend-ai-keys.test.js` (K1–K10, locked before the build; sha256 in
  `~/LENSIQ-field/evals/keys-locked.sha256`, one amendment recorded in the file), `tests/unit/backend-ai-keys-ui.test.js`,
  `tests/e2e/admin-keys.e2e.mjs`.

### 3b. Provider terms and prices checked (P6, 2026-11-10)

Read on the official pages on 2026-11-10 without a key; summaries only, not legal advice. Counsel reviews each before
charging (`docs/CTO-BRIEF.md` §8 L1–L8). The consent texts in `adapters/index.js` (TH / EN / ZH) follow this table.

| Provider | Region shown on the consent screen | Retention / training note shown | Price used (USD per 1M in / out) | Sources |
|---|---|---|---|---|
| Anthropic | USA / global routing | deleted within 30 days; no training | Haiku 5.5 0.10 / 0.50, Sonnet 5.5 2 / 10, Opus 5.5 4 / 20 (verified) | [pricing](https://platform.claude.com/docs/en/about-claude/pricing) |
| Google Gemini | any country where Google operates (no residency) | paid tier: not used to improve products, logged for a limited period. **Paid tier only** (the Unpaid tier uses content to improve products, with human review). Users 18+ and not in apps likely used by under-18s (terms effective 2026-03-23) | 3.5 Flash-Lite 0.30 / 2.50; 3.8 Flash 0.75 / 3.75 → 1.50 / 7.50 from 2027-01-01; 4 Argon 2 / 10 → 4 / 20 from 2026-12-01 (verified) | [terms](https://aistudio.google.com/docs/terms), [pricing](https://aistudio.google.com/docs/pricing), [generateContent](https://aistudio.google.com/docs/api-reference/generate-content), [structured output](https://aistudio.google.com/docs/structured-output) |
| OpenAI | USA (no regional processing chosen; the docs do not state a default location; residency endpoints +10 %) | abuse-monitoring logs up to 30 days; API data not used for training | gpt-6-luna 0.10 / 0.50, gpt-6.1-terra 1 / 5, gpt-6.1-sol 2 / 10 (verified) | [your data](https://developers.openai.com/api/docs/guides/your-data), [pricing](https://developers.openai.com/api/docs/pricing), [structured outputs](https://developers.openai.com/api/docs/guides/structured-outputs) |
| Alibaba Model Studio (Qwen) | Singapore (workspace endpoint) | "will never use your data for model training"; retention period not stated; "International" scope still not defined | qwen3-vl-plus 0.20 / 1.60 (tier 0–32K); qwen3.7-plus 0.50 / 2.00 full price (0.40 / 1.60 listed is a limited-time discount) (verified, page updated 2026-11-07) | [privacy notice](https://www.alibabacloud.com/help/en/model-studio/privacy-notice) (2026-10-11), [pricing](https://www.alibabacloud.com/help/en/model-studio/model-pricing), [JSON mode](https://www.alibabacloud.com/help/en/model-studio/json-mode), [error codes](https://www.alibabacloud.com/help/en/model-studio/error-code), [first call](https://www.alibabacloud.com/help/en/model-studio/first-api-call-to-qwen) |
| DeepSeek | People's Republic of China | **data stored in the PRC and may be used for training** (privacy policy 2026-02-10: "collect, process and store your Personal Data in People's Republic of China"; inputs used to "train and improve" models; developers are the controller for end-user data of their apps) | deepseek-flash 0.30 / 1.20 peak, cache miss (off-peak 0.15 / 0.60 not assumed) (verified) | [privacy policy](https://cdn.deepseek.com/policies/en-US/deepseek-privacy-policy.html), [pricing](https://api-docs.deepseek.com/quick_start/pricing), [JSON mode](https://api-docs.deepseek.com/guides/json_mode), [errors](https://api-docs.deepseek.com/quick_start/error_codes) |
| z.ai (Zhipu GLM) | Singapore ("generally processed in Singapore") | API DPA: content "not stored"; consent text adds "training on API content not stated by the provider" (P6 review) | glm-4.6v 0.30 / 0.90 (verified; page undated; image token count not documented) | [privacy policy + API DPA](https://docs.z.ai/legal-agreement/privacy-policy) (2025-09-29), [pricing](https://docs.z.ai/guides/overview/pricing), [API](https://docs.z.ai/api-reference/introduction), [error codes](https://docs.z.ai/api-reference/api-code.md) |
| Moonshot Kimi | Singapore ("secure servers located in Singapore") | user content kept while the account is active and may be used to optimise models (API not excluded) | kimi-k3 3 / 15 **unverified** (the provider's price table did not render; Alibaba's resale page lists 3 / 15) → budget at the ceiling 10 / 50 | [privacy](https://platform.kimi.ai/docs/agreement/userprivacy) (2025-04-30), [K3 quickstart](https://platform.kimi.ai/docs/guide/kimi-k3-quickstart), [pricing](https://platform.kimi.ai/docs/pricing/chat) |
| OpenRouter | OpenRouter, then the routed provider's country — **a second processor** | zdr + data_collection deny forced; OpenRouter stores request metadata, not prompts, by default (content flagged as CSAM excepted) | pass-through of the routed model (+ 5.5 % on credit purchases); per-model prices not read from an official page → every OpenRouter model at the ceiling 10 / 50 = `max_price` | [provider routing](https://openrouter.ai/docs/features/provider-routing), [data collection](https://openrouter.ai/docs/guides/privacy/data-collection), [API overview](https://openrouter.ai/docs/api-reference/overview), [errors](https://openrouter.ai/docs/api-reference/errors) |

Changes to the consent texts from P5: OpenAI region now says no regional processing is chosen; Qwen retention says the
provider does not state the period; DeepSeek says "data is stored in the PRC and may be used for training"; Kimi
region is Singapore (was "not verified") and its retention names the training permission; OpenRouter is named "a
second processor" in its name and region, and its retention notes the metadata OpenRouter keeps.

## 4. Fallback policy (design §10.3, implemented exactly in `ai/fallback.js`)

| kind | retry same | next provider | billed |
|---|---|---|---|
| timeout, connection | no | yes | assume yes for the budget |
| rate_limited, overloaded | once if `retryAfterMs` fits (≤ min(5 s, attempt timeout)) | yes | no |
| server_error | once | yes | no |
| refusal | no | yes | yes |
| truncated | no | yes (the optional "retry with more tokens" is not used) | yes |
| invalid_json, schema_mismatch | once | yes | yes |
| bad_request, auth, unsupported | no | yes + admin alert `ai_config_error` (once per hour per case) | no |
| content_policy_input | no | **no** (the same input is not shopped around) | no |

Unknown kinds are treated as server_error. A chain entry whose model has no price while a budget is set is skipped as
`unsupported` (`no_price`). Every model result is validated against the feature's schema in the gateway, never trusted
from the adapter.

Fallback reasons returned to the page: `budget` (429), `limit` (429), `disabled` (503), `not_configured` (503),
`unavailable` (404), `consent_required` / `image_not_allowed` / `bad_request` / `bad_input` (400), `turnstile`
(403/503), `member_required` (401), `content_policy` (422), `invalid_output` / `provider_error` (502).

## 5. Budget

- Unit: micro-USD (USD per 1M tokens = micro-USD per token). `cost = input × in + (output + reasoning) × out`, rounded up.
- **Reserve before:** the estimate (input ≈ UTF-8 bytes / 2 + 64 tokens, 1 600 tokens per image, the full output
  allowance) is reserved in ONE statement on `usage_counters` (day = Bangkok month `YYYY-MM-01`, subject `ai:budget`):
  `INSERT … SELECT … WHERE amount <= cap ON CONFLICT DO UPDATE SET n = n + amount WHERE n + amount <= cap RETURNING n`.
  Concurrent calls cannot overshoot (test: 40 concurrent calls on a 2 000 micro-USD cap → 7 ran, 1 778 used).
- **Settle after:** the real cost from the provider's usage (estimate when a billed failure reports no usage).
  **Refund** the whole reservation when the policy says "not billed".
- A reservation that does not fit skips to the next (possibly cheaper) chain entry; when nothing could be reserved the
  answer is `{fallback:true, reason:"budget"}` and no provider is called.
- Features with no cap (`fortune_reword` by default) reserve nothing; their cost still goes to the monthly aggregates.
- **Settlement never passes the reservation:** the budget counter is charged min(real cost, reservation), so it can
  never pass the cap; when the real cost is higher (more input tokens than estimated, or a dearer served model) the
  real cost still goes to the aggregates and the admin gets an `ai_config_error` alert (`cost_over_reservation`,
  once per hour). Test: cap 1,000 micro-USD, chain gpt-6-luna, served gpt-6.1-sol (real 7,000) → counter ≤ 1,000.
- The budget settle uses portable SQL (`CASE WHEN … THEN 0 ELSE … END`, no scalar `MAX`).
  If the owner sets a budget in the middle of a month for a feature that had none, earlier spend that month is not counted.
- Prices (`ai/adapters/prices.js`, from design §11): rows are never edited, a change is a new row with a later `from`
  date. Dated changes included: `gemini-4-argon` 2 / 10 → 4 / 20 from 2026-12-01; `gemini-3.8-flash` 0.75 / 3.75 →
  1.50 / 7.50 from 2027-01-01. Kimi's price is unverified (marked). OpenRouter has no fixed row.
- **P6 (2026-11-10):** every row carries `asOf` and the official `source` URL (§3b). A row marked `unverified` (Kimi
  K3; OpenRouter's `*` row, used for every OpenRouter model) is priced at **at least the conservative ceiling** of
  USD 10 / 50 per 1M (OpenAI `gpt-6-astra`, the dearest general model on an official page) for both reservation and
  settlement, so an unverified price can only over-count. `qwen3.7-plus` is on a "limited-time 20 % off" with no end
  date: a new row from 2026-11-10 uses the full price 0.50 / 2.00 (the P5 row 0.40 / 1.60 is kept).

## 6. Logs and monthly aggregates

One `ai.attempt` line per provider attempt (`util.log`), allowed fields only: `feature, provider, model, served_model,
region, attempt, kind, billed, in_tok, out_tok, reasoning_tok, cached_tok, image_tok, cost_micros, latency_ms,
request_id, provider_request_id`. Never images, base64, text, prompts, IPs, user ids or e-mails (test plants each one).

Monthly aggregates (`ai_usage_monthly`, migration 0010): requests, successes, fallbacks by reason, provider calls by kind
and provider, tokens, cost, latency histogram (p50 / p95 shown as "≤ bucket"). Counts only, kept; shown in admin.

## 7. Consent (browser, `lensiq-ai.js`)

- Data from `GET /v1/ai/providers?feature=…`: the ordered usable chain with provider name, model, processing location and
  the provider's retention in TH / EN / ZH, `imageModeAllowed`, `stores: false`. The **same** function decides what is
  shown and what may run; the POST carries the provider ids the user saw and the gateway never uses any other.
- The dialog names the first provider (the one actually used), its model and processing country, "may fall back to …"
  with each fallback's country, what is sent (text only / text + product crop), and that LENSIQ stores nothing.
- Mode: **text only is the default and the fallback**; image is offered only when the feature allows it (PC-D1, PC-D9).
- "Remember my choice" stores `{providers, mode, ts}` per feature in `localStorage["lq-ai-consent"]` (try/catch; blocked
  storage just asks again). A different chain asks again. `LQAI.renderWithdraw()` shows a visible "withdraw" button;
  without "remember" the consent lasts for the page session only.
- Fallback messages in TH / EN / ZH, e.g. budget: "AI checks are paused for this month; you are seeing the on-device
  result only". The result card text "Checked by <provider>, <location>" comes from `LQAI.checkedBy()`.
- No page uses `lensiq-ai.js` yet: Product Check (P7) is the first consumer.

## 8. Admin

- `GET|PUT|DELETE /admin/api/ai/keys[/:provider]`, `POST /admin/api/ai/keys/:provider/test`: §3c.
- `GET /admin/api/ai/gateway`: settings, provider table with `key_set`, `key_source`, `key_last4` (never values) and the `wrangler secret put`
  name, legacy key status, features, prices, efforts.
- `PUT /admin/api/ai/gateway`: **re-auth required** (password, TOTP when on, or the 5-minute window) and audited
  (`ai.gateway.settings` with the changed keys; a missing re-auth is audited as `reauth.failed`).
- `GET /admin/api/ai/usage?month=YYYY-MM`: monthly aggregates per feature.
- UI: admin → "AI Gateway" tab: global switch, legacy key switch, last eval date (placeholder), provider allowlist with
  key presence, per-feature switch, ordered chain editor (provider / model with suggestions / effort, move up / down,
  remove, add), budget and limits, image-mode switch where allowed, monthly usage table. Thai default; English / Chinese
  via the section's language selector (`i18n/en-admin.js`, `i18n/zh-admin.js`). Phone width: rows wrap.

## 9. Cloudflare-specific parts (kept out of the business logic — portability, owner Part A)

| Cloudflare part | Where | Portable replacement |
|---|---|---|
| D1 | `ai/db.js` only (standard SQL: `INSERT … ON CONFLICT … RETURNING`) and `store.js` | any SQL database with upsert + RETURNING (SQLite, Postgres) |
| Worker secrets | `ai/adapters/index.js keyFor()` reads `env.<NAME>_API_KEY` | environment variables / a secret manager |
| Turnstile | `turnstile.js verifyTurnstile()` called by `aiRoute` | another bot check behind the same function |
| `caches.default` | not used by the gateway | — |
| `CF-Connecting-IP` | `util.js clientIp()` → `store.js callerHash()` (per-user limit key for guests) | the proxy's client-IP header |
| cron | not used by the gateway (the existing daily cron purges `usage_counters` after 35 days) | any scheduler |
| Workers Logs | `util.log()` → `console.log` JSON lines | any log collector |

## 10. Fixed test set (written before the code)

All mocked: fake adapters (`deps.aiAdapters`), a fake SDK (`deps.loadSdk`), mocked Turnstile. No network, no keys.

| # | Test | File | Status |
|---|---|---|---|
| 1 | Policy table: each kind × retry / next / billed exactly as §10.3; retries at most once; config errors alert | `tests/unit/backend-ai-gateway.test.js` | pass |
| 2 | Fallback walker: 15 cases (each kind, incl. retry-after fits / does not fit / missing) × attempts, next provider, billed, budget = sum of settled costs | same | pass (15) |
| 3 | Per-attempt deadline → timeout, assumed billed, next provider | same | pass |
| 4 | Budget: reserve, settle to real cost, refund when not billed | same | pass |
| 5 | Budget: 40 concurrent calls never overshoot the cap | same | pass |
| 6 | Cap hit (default 0) → `reason: "budget"`, provider never called; new install globally off | same | pass |
| 7 | Price table effective dates 2026-11-30 / 2026-12-01 / 2027-01-01; reasoning tokens billed as output | same | pass |
| 8 | Allowlist off → provider skipped and not shown; every provider on by default | same | pass |
| 9 | Consent covers the chain shown (provider not shown is never used) | same | pass |
| 10 | Schema validator: extra keys, wrong types, enum, maxLength, nested, nullable via type arrays; no values in errors; unsupported keywords refused | same | pass |
| 11 | Gateway validates every result: schema_mismatch retried once then next provider | same | pass |
| 12 | Per-user per-minute / per-day and global per-minute limits → `reason: "limit"` | same | pass |
| 13 | Route guards: globally off, consent missing, image mode not allowed, feature off, unknown feature 404 (P7: `pc_fields` now has a route; off by default it answers 503 `disabled`) | same | pass |
| 14 | Logs: one line per attempt, allowed fields only; no image, base64, text, prompt, IP, e-mail or key | same | pass |
| 15 | `GET /v1/ai/providers`: ordered chain, name / model / region / retention in TH/EN/ZH, no secrets, unknown feature 404 | same | pass |
| 16 | Settings migration: fortune values kept, edits written back, invalid edits refused | same | pass |
| 17 | Fortune through the gateway: one `ai.attempt` line, usage aggregated | same | pass |
| 18 | Admin: sign-in required, PUT needs re-auth and is audited, key presence only, usage endpoint | same | pass |
| 19 | Fortune unchanged: the existing suite, expectations not edited | `tests/unit/backend-fortune.test.js` (14) + every other existing backend test | pass |
| 20 | Lint guard: real tree clean; planted provider strings in a temp tree fail, same strings under adapters pass; wired into `npm run lint` | `tests/unit/backend-ai-lint-guard.test.js` | pass (3) |
| 21 | Admin UI: tab, panel, API paths, text-only rendering; every `adg.*` key in EN and ZH; dictionaries served by the Worker | `tests/unit/backend-ai-admin-ui.test.js` | pass (3) |
| 24 | Review fixes: served-model overshoot stays ≤ cap + alert; pinning with a cap; cache-write 1.25x / read 0.1x; fortune makes the same number of SDK calls as before for 5xx / bad JSON / rate limit (SDK retries 1, no gateway retry, ≤ 85 s); other features SDK retries 0 + one gateway retry; retry-after decided on real time left; AbortSignal aborted at the deadline; prototype / unknown kinds → server_error; CASE WHEN settle; unsupported schema fails closed and gives the limits back; legacy key explained (admin + fortune status, TH/EN/ZH); consent lists every provider's retention + how to withdraw; lint guard blocks SDK package imports | `tests/unit/backend-ai-review.test.js` | pass (11) |
| 23 | Key check (owner update): secret names exactly as documented; OK / FAIL / SKIP + HTTP status only; key in a header, never in the URL or the output (no prefix / suffix); `.dev.vars` git-ignored; refuses in CI | `tests/unit/backend-ai-keycheck.test.js` | pass (3) |
| 22 | Browser helper: strings complete in TH/EN/ZH; consent view names provider / model / region; mode choice; remember / withdraw / blocked storage; request body; fallback messages; wired into typecheck + eslint | `tests/unit/lensiq-ai.test.js` | pass (6) |

**P6 provider adapters — fixed test set (written 2026-11-10, before any adapter code; 15 tests; rows 36–43 added for the independent review: 8 more; 23 tests, all pass).** All mocked: every adapter gets an
injected `fetchImpl`; the global `fetch` is replaced by one that fails the test if called. No keys, no network.

| # | Test | File | Status |
|---|---|---|---|
| 25 | Request shape per adapter (gemini, openai, dashscope, deepseek, zai, kimi, openrouter): the documented endpoint URL, method POST, key only in the auth header (never in the URL or body), JSON mode / structured output flag per provider, image parts in the provider's format, output token limit, AbortSignal passed to fetch | `tests/unit/backend-ai-adapters.test.js` | pass |
| 26 | Success parse per adapter: JSON parsed (code fences tolerated for JSON-object providers), served model, provider request id, usage mapped (input incl. cached, output, reasoning not counted twice) | same | pass |
| 27 | Error kinds per adapter: 429 + retry-after → rate_limited with `retryAfterMs`; 5xx → server_error; 503 → overloaded; 401 / 403 → auth; 400 / 404 / 422 → bad_request; billing / balance (402, z.ai 1113, OpenAI `insufficient_quota`) → auth; provider content filter on input → content_policy_input; finish "length" → truncated; refusal / output filter → refusal; empty or bad JSON → invalid_json; fetch rejected → connection; aborted → timeout; image to a text-only model → unsupported (no request) | same | pass |
| 28 | Gemini: paid tier only — a free-tier quota error → auth (admin alert) and an admin note in TH/EN/ZH; prompt blocked → content_policy_input; thinking tokens billed as reasoning | same | pass |
| 29 | OpenRouter: `provider: {data_collection: "deny", zdr: true, require_parameters: true, max_price}` forced on every call (a request cannot override it); served model and routed provider read from the response; consent text names OpenRouter as a second processor (TH/EN/ZH); a dearer served model → budget counter ≤ cap + `cost_over_reservation` alert (reported cost honoured) | same | pass |
| 30 | DeepSeek consent text: data stored in the PRC and may be used for training (TH/EN/ZH) | same | pass |
| 31 | Price table: every row has `asOf` + official `source` URL, or `unverified: true`; an unverified row reserves and settles at the conservative ceiling; OpenRouter models without a row use the conservative ceiling | same | pass |
| 32 | Key check: documented endpoints (DashScope Singapore workspace `GET /api/v1/models`, z.ai `POST /paas/v4/tokenizer` — no text generated); key in a header only; DashScope without its workspace id → FAIL without a request; output still status + HTTP only | same | pass |
| 33 | Default chains for `pc_fields` / `pc_claims` / `pc_translate`: verified price, provider does not train on API data, vision models for `pc_fields`; features stay off with budget 0; `fortune_reword` unchanged | same | pass |
| 34 | Registry: every provider in the allowlist has an adapter, region, retention, secret; consent screen shows every allowlisted provider with a key (P5 row 15 expected only Anthropic because no other adapter existed; that one expectation now lists the full chain — stricter, not looser) | same + `tests/unit/backend-ai-gateway.test.js` | pass |
| 35 | No provider SDK dependency added to `backend/package.json`; lint guard still clean with all adapters | same | pass |
| 36 | Review: a key echoed in `x-request-id`, body id or served model never reaches the result or the log; key-shaped and over-long ids / models dropped | `tests/unit/backend-ai-adapters.test.js` | pass |
| 37 | Review: malformed `DASHSCOPE_WORKSPACE_ID` → not ready, not offered, admin "invalid", key check FAIL without a request | same | pass |
| 38 | Review: lint guard patterns `aliyuncs` and `maas.` (planted files in `backend-ai-lint-guard.test.js` too) | same + `tests/unit/backend-ai-lint-guard.test.js` | pass |
| 39 | Review: z.ai consent text says training on API content is not stated (TH/EN/ZH) | same | pass |
| 40 | Review: OpenRouter `max_price.request` 0 and `max_price.image` cap; price day passed by the gateway | same | pass |
| 41 | Review: reported cost accepted only as a finite number 0–100x the table cost; else table cost + alert | same | pass |
| 42 | Review: estimate includes the JSON instruction + schema for JSON-object providers; Qwen-VL per-image tokens above the default; the gateway uses them | same | pass |
| 43 | Owner pending: Gemini held out of the `pc_fields` / `pc_claims` / `pc_translate` defaults (18+), still allowed and addable | same | pass |

## 10a. Local evaluation mode (`AI_EVAL_LOCAL`; owner decision 2026-11-10)

For measuring models on the owner's laptop only (`tools/pc-ai-eval.mjs` against `wrangler dev`).

**One condition**, `evalLocalMode(env, request)` in `ai/gateway.js`, used for both the cost echo and the filter bypass.
All three must hold:

1. the Worker's own variable `AI_EVAL_LOCAL` is exactly `1`;
2. the **request URL's hostname** is `localhost`, `127.0.0.1` or `[::1]` (`isLocalRequestUrl`): the Worker is being
   served by local `wrangler dev`. A deployed Worker is never reached under such a host, and the caller cannot choose it;
3. the request's Origin is localhost / 127.0.0.1 (`turnstile.js` `isLocalOrigin`; the router has already checked that
   Origin against `ALLOWED_ORIGINS`).

| In local evaluation mode | Always, in every mode |
|---|---|
| The answer carries this request's settled cost and per-attempt latency (`eval`) | Patient-name guard on the server: text with a name, HN, phone, ID, e-mail or birth date left is `bad_input` |
| The Product Check **product-label filter** is skipped: a text with no label evidence, or with a personal-document sign, is still built and sent (advert snippets of the P3 claim set, short translation fragments) | Dispensing / prescription labels are refused (`dispensingAI: "off"`) |
| | Consent, provider chain, budgets, rate limits, schema and `verify` checks |

**Why it cannot be active in a deployed Worker** (tests `P7-9a` to `P7-9e` in `tests/unit/backend-pc-features.test.js`):

- The variable is read in one place and comes only from the Worker's environment. `backend/wrangler.toml`, the deploy
  scripts and the CI workflows never define it (asserted on the files). It lives in the git-ignored `backend/.dev.vars`
  or a `wrangler dev --var`.
- Nothing in a request sets it: body, `input`, query string, headers and cookies are ignored (tested with all of them at
  once). The builders take the flag only from the gateway's own argument, as the boolean `true`.
- The admin API and panel have no such setting; a `PUT /admin/api/ai/gateway` or a `settings` row carrying it changes
  nothing.
- With the variable set, a public Origin never gets the mode. Production `ALLOWED_ORIGINS` has no localhost, so the
  router answers 403 to a forged localhost Origin before the gateway runs.
- **The Origin header is caller-chosen, so it is not relied on alone.** With the variable set and a localhost Origin, a
  Worker reached under a public host (`api.example`, `*.workers.dev`, look-alikes such as `localhost.evil.example`)
  gives no bypass and no cost echo (tested). Only variable + localhost URL + localhost Origin switches the mode on.

Residual points: a variable set by hand in the Cloudflare dashboard is outside what a test can see, but it has no
effect on a deployed Worker (condition 2). Local `wrangler dev` must be called on its localhost address (the eval tools
already refuse any other base); a dev setup that rewrites the request host to a route's zone would simply not get the mode.

## 10b. Test deployment: pinned routes, tester gate, deploy defaults (2026-11-10; `docs/DEPLOY.md`)

- **Pinned serving provider (`AI_ROUTE_PIN = "required"`, test environment only).** `adapters/openrouter.js ROUTES` maps
  the Claude models to `google-vertex` and the GPT models to `azure`. With the pin on, the request carries
  `provider.only = [slug]` and `allow_fallbacks = false` next to the forced `zdr` / `data_collection: "deny"`;
  `GET /v1/ai/providers` adds `routed: {slug, name, region}` (TH / EN / ZH) to each pinned chain entry, and the consent
  screen shows "OpenRouter, then on to Google Cloud Vertex AI … outside Thailand (global, US or Europe; country not
  fixed)". A remembered consent is stored for `provider>slug` (`lensiq-ai.js procs()`): another serving provider asks
  again. An answer whose served provider is not the pinned one (or is missing) is rejected by the adapter
  (`routeMismatch`; attempt kind `refusal`: billed, next chain entry) and the gateway raises the owner alert
  `ai_config_error` with `kind: route_mismatch`. With the pin off (repo default) nothing changes.
  Unverified wording: the region list and the exact served-provider name (DEPLOY.md §8 points 8–10).
- **Tester gate.** With `TESTER_GATE = "required"`, `GET /v1/ai/providers` answers `{enabled:false, tester:true, chain:[]}`
  and `POST /v1/ai/:feature` answers 403 `{fallback:true, reason:"tester_required"}` (429 `tester_locked` after 5 wrong
  codes in 15 minutes per caller) unless `X-Tester-Code` equals the secret `TESTER_ACCESS_CODE`. The page
  (`lensiq-tester.js`) hides the AI step without a code.
- **Deploy defaults** (`npm run ai:deploy-defaults`, `tools/ai-deploy-defaults.mjs`): a separate, tested artefact; the
  repo defaults (`DEFAULT_CHAINS`, budget 0) are unchanged. All off; OpenRouter only; Haiku 5.5 then GPT-6 Luna; budgets
  5 / 3 / 2 USD; 20 per user per day, 3 per user per minute, 20 per minute for all users; photo mode allowed for
  `pc_fields`. `INSERT … ON CONFLICT DO NOTHING`.
- **Logs.** `ai.attempt` gained `routed` (served provider name) and `route_mismatch`. Test "logs: …" in
  `tests/unit/backend-deploy-gate.test.js` plants image bytes, label text, a name, a phone number, query text, the
  caller address and the tester code, and finds none of them in any AI or lookup log line or stored row.

## 11. Open points

- PDPA: remembered consent and image mode go to counsel (`docs/PDPA-NOTES-FOR-COUNSEL.md` §F).
- Per-user / global limit hits answer `reason: "limit"` with their own message, not `"budget"` (the design text groups
  them; "paused for this month" would be wrong for a per-minute limit).
- Cloudflare's own "AI Gateway" product was not evaluated (design §11 note); our adapter layer stays for portability.
