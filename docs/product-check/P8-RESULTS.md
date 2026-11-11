# Product Check P8: real-model evaluation, results (2026-11-10)

> Phase P8 of `docs/PRODUCT-CHECK-DESIGN.md` §12. Planned: the three AI features (`pc_fields`, `pc_claims`,
> `pc_translate`) on 9 models through OpenRouter (the only key configured), on a local `wrangler dev` with local D1.
> **The run could not take place. The owner's OpenRouter key has reached its own spending limit.** No model answered,
> so this round has **no accuracy number**. Spend this round: **0 USD**.
>
> **Update, same day.** The owner raised the key limit to 20 USD. The cost smoke and then the approved partial run took
> place: see **"Smoke 2026-11-10"** and **"Run 2026-11-10"** at the end. Sections 1 to 8 record the first, blocked
> attempt and are kept as written. The Thai summary of the run is at the start of "Run 2026-11-10".

## สรุปสำหรับเจ้าของ (Thai summary)

- **ยังวัดผล AI ไม่ได้** เพราะคีย์ OpenRouter ของเจ้าของตั้งวงเงินรวมไว้ 11 USD และใช้ไปแล้ว 11.16 USD ก่อนรอบนี้เริ่ม (วงเงินนี้ไม่รีเซ็ตเอง)
  - OpenRouter ปฏิเสธทุกคำขอด้วย 403 "Key limit exceeded"
  - ค่าใช้จ่ายรอบนี้ 0 USD เพราะไม่มีคำขอใดถูกคิดเงิน
- **สิ่งที่เจ้าของต้องทำ:** เข้า OpenRouter → Keys → เพิ่มวงเงินของคีย์นี้ (แนะนำอย่างน้อย 60 USD สำหรับงบทดลอง 50 USD) หรือสร้างคีย์ใหม่ แล้วสั่งรันรอบ P8 ใหม่
- ที่ได้จากรอบนี้:
  - ตรวจจาก API สาธารณะของ OpenRouter ว่าโมเดลใดมีเส้นทางแบบไม่เก็บข้อมูล (ZDR)
  - **Qwen3.7-plus (ในเชนเริ่มต้น) ไม่มีเส้นทาง ZDR** จึงใช้ผ่าน OpenRouter ไม่ได้
  - GLM-4.6V ไม่มีเส้นทาง ZDR ที่รองรับ structured output
  - เพิ่มราคาจริงต่อโมเดลของ OpenRouter ลง `prices.js` (11 แถว)
- **พบบั๊ก 1 จุดและแก้แล้ว (อนุมัติแล้ว):** gateway เคยอ่าน 403 "เกินวงเงินคีย์" เป็น "ถูกปฏิเสธด้านเนื้อหา"
  - ตอนนี้จัดเป็นปัญหาการตั้งค่า (`auth`) และแจ้งเตือนเจ้าของ
  - เฉพาะการปฏิเสธจากระบบกลั่นกรองเนื้อหาจริงเท่านั้นที่ยังเป็น `content_policy_input`

## 1. What happened

| Step | Result |
|---|---|
| P7 snapshot applied, unit tests (gateway, adapters, pc features, eval tools) | 87 / 87 pass |
| Key file | symlinked as `backend/.dev.vars` (git-ignored, confirmed with `git check-ignore`). The value was never read into a log. Removed afterwards |
| Local settings | `wrangler dev --local --var AI_EVAL_LOCAL:1 --var TURNSTILE_DISABLED_FOR_LOCAL_DEV:true --var ALLOWED_ORIGINS:http://localhost:8000 --var GO_LIVE_GATE:report`; owner's file not edited |
| `npm run db:migrate:local`, `npm run ai:test-enable` | ok (local D1 only) |
| Probe: `openrouter:openai/gpt-6-luna`, 1 item per feature | 3 / 3 refused, `content_policy_input`, 0 USD |
| Direct check of the same refusal (one 5-token request) | HTTP 403, "Key limit exceeded (total limit) … $11.16 of $11.00 used; does not reset" |
| OpenRouter key-info (`GET /api/v1/key`) before the run | limit 11.00 USD, usage 11.16 USD (this month 10.15), remaining 0 |
| Smoke run `--limit 3` and full run | **not run.** Every call would be refused |
| Restore | `npm run ai:test-enable -- --off` done, wrangler stopped, symlinks removed |

Spend: gateway settled cost 0 USD. OpenRouter usage is unchanged by this round (refused requests are not billed).

## 2. Models chosen (OpenRouter public API, read 2026-11-10)

Sources: `https://openrouter.ai/api/v1/models` (list price, USD per 1M tokens) and
`https://openrouter.ai/api/v1/endpoints/zdr` (zero-data-retention endpoints). The gateway always sends `zdr: true`,
`data_collection: "deny"`, `require_parameters: true` and `max_price` = the price row. These flags were not changed.

"Routable" means a ZDR endpoint exists that supports `structured_outputs`, costs no more than the list price (so it
passes `max_price`), and has status 0.

| Provider (design) | OpenRouter slug | In / out | Routable ZDR endpoints | Status |
|---|---|---|---|---|
| Anthropic, Haiku-class | `anthropic/claude-haiku-5.5` | 0.10 / 0.50 | google-vertex/global | to run. Served by Google Vertex, not Anthropic |
| Anthropic, Sonnet-class | `anthropic/claude-sonnet-5.5` | 2 / 10 | google-vertex/global | to run. Served by Google Vertex. Bedrock has ZDR but no structured outputs |
| OpenAI, small | `openai/gpt-6-luna` | 0.10 / 0.50 | azure | to run. Served by Azure |
| OpenAI, mid | `openai/gpt-6.1-terra` | 1 / 5 | azure | to run. Served by Azure |
| Google Gemini | `google/gemini-3.5-flash-lite` | 0.30 / 2.50 | google-vertex/global, …/flex | to run. Held out of the default chains (18+ question); evaluating it is fine |
| Qwen (design: qwen3.7-plus) | `qwen/qwen3.7-plus` | 0.32 / 1.28 | **none** | **fails: no ZDR route**. Kept as a probe to record the failure |
| Qwen, substitute | `qwen/qwen3.8-27b` | 0.15 / 1.875 | 5 (primeintellect, tenstorrent, near-ai, mancer, deepinfra) | to run. Open weights on third-party hosts, not Alibaba |
| DeepSeek | `deepseek/deepseek-v4.1-flash` | 0.051 / 0.567 | 2 (wafer/us, relace/fp4) | to run. Third-party US hosts. The PRC-storage note applies to DeepSeek's own API, not to these hosts. The eval texts are public adverts and synthetic labels with no personal data |
| z.ai GLM (design: glm-4.6v) | `z-ai/glm-4.6v` | 0.30 / 0.90 | **none with structured outputs** | **expected to fail** (`require_parameters`). Kept as a probe |
| z.ai GLM, substitute | `z-ai/glm-5.3-flash` | 0.15 / 0.50 | 29 | to run |
| Moonshot Kimi | `moonshotai/kimi-k3` | 0.192 / 16 | 2 (wafer, wafer/fast) | to run. Output-heavy price, so the 10 USD per-model cap matters |

**Finding that holds without a run:** through OpenRouter with `zdr: true`, the design's default fallback model for
`pc_claims` / `pc_translate` (`qwen3.7-plus`) is not available. The Anthropic and OpenAI models are served by Google
Vertex and Azure, not by their makers. The consent screen says "OpenRouter, routed to <provider>", which covers this.

## 3. Changes made this round (not committed)

1. **`backend/src/ai/adapters/prices.js`:** 11 OpenRouter per-model price rows (the table above).
   - Each row has `asOf: 2026-11-10` and `source: https://openrouter.ai/api/v1/models`.
   - Without them, every OpenRouter model settles at the 10 / 50 ceiling. That overstates the cost 20 to 100 times and
     would end the trial budget early.
   - Each row is also sent as `max_price`, so routing stays within the listed price.
   - Unit tests 87 / 87 and typecheck still pass.
2. **`backend/src/ai/adapters/openrouter.js`:** the 403 fix in §4 (approved). No P7 code changed.

## 4. Bug found and fixed (owner-approved, 2026-11-10)

**Before.** `errorKind` mapped every 403 to `content_policy_input`. OpenRouter also returns 403 for "Key limit
exceeded". So:

- a spending-limit problem was logged as a content refusal;
- the page told the user the input was refused for content;
- no `ai_config_error` alert reached the owner.

**Now.** `kindOf403(data)` sorts a 403 by the error's structure and fixed message patterns. This applies both to HTTP
403 and to the HTTP 200 + error-object form.

| 403 type | How it is detected | Kind |
|---|---|---|
| Key, credit, spending or usage limit | message pattern | `auth`: owner alert, next provider |
| Real moderation flag | `metadata.reasons`, `metadata.flagged_input`, or "flagged" / "moderation" in the message | `content_policy_input` |
| Any other 403 | — | `auth`: a configuration problem, never shown to the user as a content refusal |

The error body includes the key's hash and its management URL. It is read only for these tests and is never copied
into the result, a log line or an alert.

**Tests** (`tests/unit/backend-ai-adapters.test.js`):

- **44a, adapter:**
  - a limit 403 maps to `auth`, in both the HTTP-403 and HTTP-200 forms;
  - a moderation 403 maps to `content_policy_input`;
  - credit and spending messages and an unknown 403 map to `auth`;
  - no part of the body (hash, URL, message) is in the result.
- **44b, through the gateway:**
  - a limit 403 is logged as `auth` and raises an `ai_config_error` alert naming openrouter and auth, and the reason is
    not `content_policy`;
  - a moderation 403 gives reason `content_policy` and no configuration alert;
  - neither the body nor the key appears in the result, the log lines or the alert rows.

**Checks after the fix:**

| Check | Result |
|---|---|
| Unit tests | 1342 / 1342 pass |
| Backend tests | 238 / 238 pass |
| Lint, with the provider guard `check-ai-providers` | OK |
| Format | OK |
| Typecheck | OK, ratchet 627 (≤ 627) |

## 5. Numbers vs targets

| Item | Target | Measured | Source |
|---|---|---|---|
| `pc_claims` union recall (on-device + AI), P3 held-out | ≥ 80 % recall, ≥ 80 % precision, ≤ 5 false flags / 100 | **not measured** (key limit) | public dataset, AI-labelled |
| `pc_fields` per-field accuracy | first baseline | **not measured** | synthetic |
| `pc_translate` coverage / numbers kept / terms | first baseline | **not measured** | synthetic |
| Latency p50 / p90, cost per call, rejection rate, fallbacks | report | **not measured** | — |
| Spend | ≤ 50 USD total, ≤ 10 USD per model | 0 USD | gateway settled cost; OpenRouter key-info |

Recommended chains and cost per 1,000 checks: **none yet.** They need the measured numbers.

## 6. Held-out reuse

- The eval loader appended a run line to `~/LENSIQ-field/product-check/texts/p7-ai-heldout-runs.jsonl`: one probe
  run, 1 text sent and refused.
- No model has seen a held-out text.
- The held-out split is still clean for P8. After the real P8 run, a fresh split is needed.

## 7. To re-run (owner step first)

1. On OpenRouter, raise this key's total limit (at least about 60 USD for a 50 USD trial) or issue a new key into
   `backend/.dev.vars`.
2. Then run the same procedure: symlink the key file, `db:migrate:local`, `wrangler dev --local` with the `--var` flags
   above, then `ai:test-enable`.
3. Run the wrapper on the models in §2 with `--limit 3` first, then the full sets: 264 claims + 16 fields + 10 translate
   = 290 calls per model.
   - The re-run tools are outside the repo in `~/LENSIQ-field/product-check/eval/p8-tools/`:
     - `p8-run.mjs`: the wrapper. It uses the P7 runner unchanged and adds p90 latency, Wilson intervals, attempt kinds
       and raw per-item results with no texts.
     - `keyusage.mjs`: prints only the numeric usage fields of OpenRouter's `/api/v1/key`.
   - Both scripts hardcode this round's worktree path (`W` in `p8-run.mjs`, the `.dev.vars` path in `keyusage.mjs`).
     Point them at the checkout you run from.
   - Example: `node ~/LENSIQ-field/product-check/eval/p8-tools/p8-run.mjs --models openrouter:anthropic/claude-haiku-5.5,… --limit 3 --tag smoke`
   - Output goes to `~/LENSIQ-field/product-check/eval/p8-*.json`.
4. Estimated spend: about 15 to 25 USD for all 9 models. The largest are Sonnet 5.5 (about 3 to 4 USD) and Kimi K3
   (output-priced, up to the 10 USD cap).

## 8. Risks

1. The trial budget (50 USD) is larger than the key's own limit (11 USD). The key limit is the real cap until the owner
   raises it.
2. With `zdr: true`, a few cheap models have only 1 or 2 endpoints at or below the list price (DeepSeek v4.1 flash,
   Kimi K3). Expect `overloaded` (503) fallbacks if those hosts are busy.
3. Prices on OpenRouter change. The rows are dated, and a change needs a new row.

## Smoke 2026-11-10

> Cost smoke only: `p8-run.mjs --limit 3` (3 items per feature) on the 9 routable ZDR models in §2. **Not an accuracy
> result**: 3 items per feature cannot support any recall / precision claim. The full run was **not** started.
> Owner raised the key limit to 20 USD before this run.

**Setup.** Same procedure as §1: key file symlinked as `backend/.dev.vars` (never read into a log), local D1,
`wrangler dev --local` with the same `--var` flags, `ai:test-enable --budget 1.5`, wrapper `--budget 1.5 --per-model 0.5`
(stop rule 1.5 USD). Per-call OpenRouter cost and native tokens came from `GET /api/v1/generation?id=<provider_request_id>`
(new helper `p8-tools/genstats.mjs`, numbers only).

**Spend.**

| Source | USD |
|---|---|
| OpenRouter key-info, usage before → after | 11.164886 → 11.363218 = **0.198332** |
| Gateway settled cost (price table, max with reported; timeouts billed at the reservation) | 0.236968 |
| Sum of OpenRouter per-generation `total_cost` (4 timed-out calls have no generation record) | 0.172801 |
| Key remaining after smoke | 8.636782 of 20.00 |

**Per model and feature** (3 calls each; averages per attempt; tokens are the gateway's usage, out = output + reasoning;
cost "gw" = gateway settled, "OR" = OpenRouter `total_cost`; latency = gateway p50 / p90 ms).

| Model (routed via) | Feature | OK | In tok | Out tok | gw USD/call | OR USD/call | p50 / p90 ms | Failures |
|---|---|---|---|---|---|---|---|---|
| claude-haiku-5.5 (Google Vertex) | fields | 3/3 | 1427 | 934 | 0.00061 | 0.00061 | 6056 / 6922 | – |
| | claims | 3/3 | 1252 | 458 | 0.00035 | 0.00035 | 2941 / 4437 | – |
| | translate | 3/3 | 575 | 192 | 0.00015 | 0.00015 | 2251 / 2813 | – |
| claude-sonnet-5.5 (Google Vertex) | fields | 3/3 | 1427 | 247 | 0.00532 | 0.00532 | 2699 / 3603 | – |
| | claims | 3/3 | 1252 | 199 | 0.00449 | 0.00449 | 1756 / 4330 | – |
| | translate | 3/3 | 575 | 144 | 0.00259 | 0.00259 | 2100 / 2370 | – |
| gpt-6-luna (Azure) | fields | 3/3 | 512 | 439 | 0.00027 | 0.00027 | 7594 / 8749 | – |
| | claims | 3/3 | 612 | 385 | 0.00025 | 0.00025 | 5502 / 7368 | – |
| | translate | 3/3 | 239 | 173 | 0.00011 | 0.00011 | 4813 / 6561 | – |
| gpt-6.1-terra (Azure) | fields | 3/3 | 512 | 392 | 0.00247 | 0.00247 | 5720 / 5833 | – |
| | claims | 3/3 | 612 | 319 | 0.00221 | 0.00221 | 4531 / 5053 | – |
| | translate | 3/3 | 239 | 159 | 0.00103 | 0.00103 | 2965 / 3186 | – |
| gemini-3.5-flash-lite (Google Vertex) | fields | 3/3 | 905 | 184 | 0.00073 | 0.00073 | 1411 / 1536 | – |
| | claims | 3/3 | 768 | 74 | 0.00042 | 0.00041 | 1194 / 1311 | – |
| | translate | 3/3 | 318 | 130 | 0.00042 | 0.00042 | 1432 / 3206 | – |
| qwen3.8-27b (Mancer) | fields | **0/3** | 110 | 500 | 0.00289 | 0.00064 | 20065 / 20285 | 2 timeout (20 s), 1 truncated |
| | claims | **1/3** | 509 | 1438 | 0.00277 | 0.00187 | 22122 / 24848 | 2 truncated |
| | translate | **1/3** | 230 | 1372 | 0.00261 | 0.00090 | 12189 / 15189 | 2 truncated |
| deepseek-v4.1-flash (Wafer, Relace) | fields | **0/3** | 298 | 1500 | 0.00087 | 0.00083 | 6984 / 15289 | 3 truncated |
| | claims | **1/3** | 473 | 1384 | 0.00081 | 0.00076 | 6474 / 17142 | 2 truncated |
| | translate | 3/3 | 204 | 890 | 0.00052 | 0.00049 | 7100 / 8614 | – |
| glm-5.3-flash (various hosts) | fields | 2/3 | 319 | 1027 | 0.00056 | 0.00046 | 13637 / 14004 | 1 truncated, 1 schema rejection (retried on another host) |
| | claims | 3/3 | 524 | 577 | 0.00037 | 0.00024 | 3585 / 10055 | – |
| | translate | 3/3 | 187 | 456 | 0.00026 | 0.00022 | 6818 / 8551 | – |
| kimi-k3 (Wafer) | fields | 2/3 | 490 | 634 | 0.01829 | 0.01023 | 16470 / 20096 | 1 timeout (20 s) |
| | claims | 3/3 | 819 | 984 | 0.01590 | 0.01589 | 23331 / 26376 | – |
| | translate | 2/3 | 263 | 215 | 0.01152 | 0.00349 | 9988 / 30157 | 1 timeout (30 s) |

Failure notes:

- **No "no ZDR route" failure** on any of the 9 models; every model routed to a ZDR host.
- **"truncated"** = the answer hit the 1,500-token output cap (`maxOutputTokens` default) before the JSON closed. All
  cases are reasoning models (Qwen3.8-27b, DeepSeek v4.1 flash, GLM 5.3 flash) spending the cap on reasoning. They are
  billed and the page falls back to its on-device result. As configured, Qwen and DeepSeek are not usable for
  `pc_fields`. Raising the cap or turning reasoning off is a product change and needs owner approval first.
- Only 1 schema rejection (GLM, `pc_fields`).
- In the gateway, a timeout is billed at its reservation. This is why the gateway cost is higher than OpenRouter's for
  Qwen and Kimi.

**Full-run projection** (264 claims + 16 fields + 10 translate = 290 calls per model; measured cost per call × count;
retries included at the smoke rate):

| Model | Projected USD (gateway) | Projected USD (OpenRouter) |
|---|---|---|
| kimi-k3 | 4.61 | 4.39 |
| claude-sonnet-5.5 | 1.30 | 1.30 |
| qwen3.8-27b | 0.80 | 0.51 |
| gpt-6.1-terra | 0.63 | 0.63 |
| deepseek-v4.1-flash | 0.23 | 0.22 |
| gemini-3.5-flash-lite | 0.13 | 0.13 |
| glm-5.3-flash | 0.11 | 0.08 |
| claude-haiku-5.5 | 0.11 | 0.11 |
| gpt-6-luna | 0.07 | 0.07 |
| **Total** | **7.99** | **7.44** |

**Does it fit?** The key has 8.64 USD left. With a 10 % margin, about 7.77 USD is usable. The projected 7.99 USD (gateway) is
**over that by about 0.2 USD**. Kimi K3 alone is 58 % of the total. The OpenRouter figure (7.44) fits only because it
leaves out the timed-out calls, which were still billed, so it is too low to plan on. The smoke used only 3
items per feature, so the real cost per call could differ by ±20 % or more. **Verdict: not safe to run all 9 in full.**

**Proposed plan (for owner approval):**

1. **Run the 8 models other than Kimi in full first.** Projected cost is about 3.4 USD (gateway), which leaves about 5.2 USD.
   - Question (b), the cheapest model for `pc_fields` and `pc_translate`, is answered by gpt-6-luna, claude-haiku-5.5,
     gemini-3.5-flash-lite and glm-5.3-flash. The 4 together cost under 0.5 USD.
   - Question (a), whether any model lifts `pc_claims` union recall to 80 % or more at 80 % or more precision, is
     covered by Sonnet 5.5 and gpt-6.1-terra plus the cheap models.
2. **Run Kimi K3 only if no model reaches target (a).** Run it on `pc_claims` only, with `--per-model` set to the
   remaining limit minus 10 %. That is about 4.2 USD and would still fit. Drop its `pc_fields` and `pc_translate`
   runs: it is the most expensive and slowest model there, and two of its smoke calls timed out.
3. **Next option, if spend must shrink further:** drop `pc_fields` for Qwen3.8-27b and DeepSeek v4.1 flash. Both scored
   0/3 there because of truncation, so running them buys no answers and saves about 0.06 USD. Their `pc_claims` runs
   are also mostly truncated: 1/3 answered each. Keeping or dropping those is the owner's choice. A run with a higher
   output cap would be a separate, approved change.

Raw files (no texts, no keys) are in `~/LENSIQ-field/product-check/eval/p8-smoke-2026-11-10T08-52-30-037Z{.json,-raw.json,
-genstats.json,-attempts.jsonl,-stdout.txt}`. The held-out loader logged 1 more run line. It records the 264 texts loaded, but only the same first 3 claims texts were sent to each model.

## Run 2026-11-10

> The owner-approved partial run: 7 cheap models on all three features, Sonnet 5.5 and Kimi K3 on `pc_claims` only.
> Local `wrangler dev` + local D1, OpenRouter key with a 20 USD limit, ZDR routes only. Nothing was deployed.
> **Sources:** `pc_claims` = public dataset, labelled by two AI agents (pharmacist adjudication pending), P3 held-out
> split, 264 texts. `pc_fields` (16 items) and `pc_translate` (10 items, 23 lines) = synthetic
> (`docs/product-check/p7-ai-testset.json`). No field data.

### สรุปสำหรับเจ้าของ (Thai summary)

- **`pc_claims` (คำโฆษณาเกินจริง): ไม่มีโมเดลใดผ่านเป้า 80 / 80 / ≤ 5 เลย** (ชุดข้อมูลสาธารณะ ติดป้ายโดย AI)
  - ตัวตรวจในเครื่องอย่างเดียว: precision 91.9 %, recall 65.5 %, แจ้งผิด 3.3 ต่อ 100 ข้อความที่ถูกต้อง
  - เมื่อรวม AI: recall ขึ้นถึง 81–95 % (7 จาก 9 โมเดล) แต่ precision ตกเหลือ 58–79 % และแจ้งผิดเพิ่มเป็น 11–36 ต่อ 100
  - ใกล้ที่สุดคือ **gpt-6.1-terra**: precision 78.7 %, recall 91.6 %, แจ้งผิด 10.6 ต่อ 100 (ยังไม่ผ่าน 2 ใน 3 ข้อ)
  - Sonnet 5.5 แพงกว่า 3 เท่าและไม่ดีกว่า (precision 70.0 %); Kimi K3 แพงที่สุด ช้าที่สุด หมดเวลา 49 จาก 263 ครั้ง
- **`pc_fields` และ `pc_translate` (ชุดสังเคราะห์ ขนาดเล็ก)**: โมเดลราคาถูกทำได้ดี: Haiku 5.5 อ่านฟิลด์ถูก 91.3 %, gpt-6-luna 86.3 %,
  แปลครบทุกบรรทัดทั้งคู่ ต้นทุนไม่ถึง 0.40 USD ต่อ 1,000 ครั้ง
- **Qwen3.8-27b, DeepSeek v4.1 flash และ GLM 5.3 flash ใช้กับ `pc_fields` / `pc_claims` ไม่ได้ในการตั้งค่าปัจจุบัน**: คำตอบถูกตัดที่เพดาน
  1,500 โทเคน (ไม่ได้แก้เพดาน เพราะเป็นการเปลี่ยนผลิตภัณฑ์)
- **ค่าใช้จ่ายรอบนี้ 4.95 USD** (ตามคีย์ OpenRouter) คีย์เหลือ 3.69 USD จาก 20 USD
- **ข้อเสนอ:** ยังไม่ควรเปิด `pc_claims` แบบ AI ให้ลูกค้า ต้องลดการแจ้งผิดก่อน (ปรับ prompt หรือให้ AI เสริมเฉพาะกฎที่ตัวในเครื่องอ่อน)
  แล้ววัดใหม่บนชุด held-out **ชุดใหม่** เพราะชุดนี้ถูกใช้ไปแล้ว

### Setup and deviations

- Worktree `agent-a1f9e86d1d633cf6d` (final P7 code + the P8 fixes; no product code edited). Key file symlinked as
  `backend/.dev.vars`, never read into a log; `wrangler dev --local` with the same `--var` flags as §1;
  `db:migrate:local`; `ai:test-enable` (gateway budgets 20 / 20 / 10 USD). Afterwards: `ai:test-enable -- --off`,
  wrangler stopped, symlinks and the local build output removed. A scan of every output for `sk-or`, the key and its
  sha256 found nothing.
- Order as approved, cheapest first: gpt-6-luna, claude-haiku-5.5, gemini-3.5-flash-lite, glm-5.3-flash,
  deepseek-v4.1-flash, gpt-6.1-terra, qwen3.8-27b, then claude-sonnet-5.5 and kimi-k3 on `pc_claims` only.
- **Hard stop rule kept.** Key usage was read before and after each model (numbers only). A model started only when
  remaining credit minus its projected cost was ≥ 0.40 USD. Kimi's gate: 6.02 − 4.20 = 1.82 USD, so it ran in full
  (264 texts, no subsample), with a 5.55 USD cap.
- Output cap (1,500 tokens) and reasoning settings were **not** changed. Truncations are recorded as measured.
- **Deviation 1, parallel shards.** To keep the run to under 2 hours, each model's items were split over 1 to 6
  parallel processes of the unchanged P7 runner (`--shard i/n` in the wrapper), one model at a time. Latency was
  therefore measured with 1 to 6 calls in flight. Kimi's timeouts (single host, 4 in flight) may be higher than in
  sequential use.
- **Deviation 2, runner bug (not fixed in the repo, reported).** `tools/pc-ai-eval.mjs` throws when the Worker answers
  HTTP 400 `bad_input` without a cost echo. The Worker does this for **2 held-out texts** (`PCT-0036`, `PCT-0231`): its
  "dispensing label: AI off" rule refuses them before any provider call. The wrapper (outside the repo) now records
  such a call as unanswered at cost 0. For every model these 2 texts count as device-only.
- Waste: two crashed gpt-6-luna shards (re-run) and one duplicate Gemini process (stopped). About 0.10 USD (gateway).
- The local per-minute limit (60 per caller) answered 429 on 73 calls. The wrapper waited and asked again; nothing was
  sent or billed for those. Latency below is the gateway's own time per call, so these waits are not in it.

### `pc_claims`: P3 held-out split (public dataset, AI-labelled), 264 texts, 123 of them compliant

Scores are per (text, rule) pair, as in P3. "AI" = the model's own flags (an unanswered call adds none). "Union" =
on-device `LQClaims` flags + the model's flags: this is what the page would show. FF = false flags per 100 compliant
texts. Brackets are Wilson 95 % intervals. **Targets: recall ≥ 80 %, precision ≥ 80 %, FF ≤ 5.**

| Model | Answered | AI precision | AI recall | AI FF | **Union precision** | **Union recall** | **Union FF** | Meets 80 / 80 / 5 |
|---|---|---|---|---|---|---|---|---|
| on-device only (no AI) | – | – | – | – | 91.9 [86.7–95.2] | 65.5 [59.1–71.4] | 3.3 | recall no |
| gpt-6-luna | 262/264 | 68.5 [62.9–73.6] | 86.7 [81.7–90.5] | 26.8 | 68.9 [63.6–73.8] | 94.2 [90.4–96.6] | 26.8 | **no** (precision, FF) |
| claude-haiku-5.5 | 261/264 | 55.9 [50.5–61.1] | 82.3 [76.8–86.7] | 35.8 | 58.5 [53.4–63.4] | 94.7 [90.9–96.9] | 35.8 | **no** (precision, FF) |
| gemini-3.5-flash-lite | 262/264 | 60.7 [54.2–66.8] | 61.5 [55.0–67.6] | 26.0 | 65.9 [60.2–71.1] | 83.6 [78.2–87.9] | 27.6 | **no** (precision, FF) |
| glm-5.3-flash | 200/264 | 65.9 [58.6–72.5] | 50.4 [44.0–56.9] | 21.1 | 72.0 [66.2–77.2] | 81.0 [75.4–85.6] | 24.4 | **no** (precision, FF) |
| deepseek-v4.1-flash | 88/264 | 58.1 [43.3–71.6] | 11.1 [7.6–15.8] | 9.8 | 83.3 [77.3–88.0] | 68.6 [62.3–74.3] | 13.0 | **no** (recall, FF) |
| gpt-6.1-terra | 261/264 | 79.1 [73.4–83.9] | 80.5 [74.9–85.2] | 8.9 | 78.7 [73.4–83.2] | 91.6 [87.2–94.6] | 10.6 | **no** (precision, FF) |
| qwen3.8-27b | 85/264 | 75.9 [57.9–87.8] | 9.7 [6.5–14.3] | 4.1 | 88.6 [83.0–92.5] | 68.6 [62.3–74.3] | 7.3 | **no** (recall, FF) |
| claude-sonnet-5.5 | 262/264 | 69.9 [64.3–75.0] | 85.4 [80.2–89.4] | 16.3 | 70.0 [64.6–74.9] | 92.9 [88.8–95.6] | 17.1 | **no** (precision, FF) |
| kimi-k3 | 213/264 | 64.4 [57.5–70.6] | 57.5 [51.0–63.8] | 18.7 | 70.6 [65.0–75.6] | 87.2 [82.2–90.9] | 20.3 | **no** (precision, FF) |

**No model meets the three targets.** The AI lifts recall from 65.5 % to 81–95 % for 7 of the 9 models, but every one
of them drops precision below 80 % and at least triples the false flags on compliant texts. The closest is
gpt-6.1-terra: its precision interval [73.4–83.2] includes 80 %, but its FF is 10.6 (13 flags on 123 compliant texts,
11 texts flagged). The labels are AI-made, so some "false" flags may be label gaps. That needs the pharmacist
adjudication before any precision claim is made to a customer.

Cost, latency and failures on `pc_claims` (cost per check: "gw" = gateway settled, "OR" = sum of OpenRouter
per-generation `total_cost`; a timed-out call has no OpenRouter record, so OR is too low for Qwen and Kimi):

| Model (routed via) | p50 / p90 ms | gw USD per check | OR USD per check | gw USD per 1,000 | Rejected (schema or exact-quote) | Truncated | Timeout | Refusal |
|---|---|---|---|---|---|---|---|---|
| gpt-6-luna (Azure) | 4125 / 7329 | 0.00019 | 0.00019 | 0.19 | 2 / 264 (0.8 %) | 0 | 0 | 0 |
| claude-haiku-5.5 (Google Vertex) | 1754 / 3141 | 0.00025 | 0.00025 | 0.25 | 1 / 263 (0.4 %) | 0 | 0 | 1 |
| gemini-3.5-flash-lite (Google Vertex) | 1009 / 1287 | 0.00031 | 0.00031 | 0.31 | 1 / 263 (0.4 %) | 0 | 0 | 0 |
| glm-5.3-flash (19 hosts) | 4520 / 12902 | 0.00041 | 0.00031 | 0.41 | 2 / 264 (0.8 %) | 62 | 0 | 0 |
| deepseek-v4.1-flash (Wafer, Relace, Morph) | 8651 / 17168 | 0.00068 | 0.00064 | 0.68 | 2 / 264 (0.8 %) | 174 | 0 | 0 |
| gpt-6.1-terra (Azure) | 3173 / 4722 | 0.00139 | 0.00139 | 1.39 | 0 / 262 | 0 | 0 | 1 |
| qwen3.8-27b (Mancer, Near AI, Tenstorrent) | 15432 / 24930 | 0.00241 | 0.00167 | 2.41 | 0 / 262 | 165 | 12 | 0 |
| claude-sonnet-5.5 (Google Vertex) | 2443 / 4260 | 0.00414 | 0.00414 | 4.14 | 0 / 262 | 0 | 0 | 0 |
| kimi-k3 (Wafer) | 13113 / 30004 | 0.01037 | 0.00587 | 10.37 | 1 / 263 (0.4 %) | 0 | 49 | 0 |

- Rejection: the gateway logs a schema failure and a failed exact-quote check under one kind (`schema_mismatch`), so
  the two cannot be separated from the logs. Together they are 9 of 2,367 `pc_claims` attempts (0.4 %). A rejected
  answer was retried and then answered in every case.
- Kimi K3 by the key's own usage: 2.33 USD for 264 checks = 0.0088 USD per check (8.83 USD per 1,000).

### `pc_fields` and `pc_translate`: synthetic set (16 labels; 10 texts with 23 lines)

`pc_fields` accuracy = correct fields of 5 per label (type, brand, registration, lot, expiry). The P7 scorer counts an
empty answer as correct where the label has no such field, so a model that answers nothing still scores 13.8 %.
No model invented a registration number. No target is set for these two features: this is the first baseline.

| Model | Fields answered | Fields correct (of 80) | type / brand / reg / lot / exp (of 16) | p50 / p90 ms | gw USD per 1,000 | Truncated / timeout |
|---|---|---|---|---|---|---|
| gpt-6-luna | 16/16 | 86.3 % [77.0–92.1] | 16 / 10 / 12 / 16 / 15 | 4091 / 7238 | 0.21 | 0 / 0 |
| claude-haiku-5.5 | 16/16 | 91.3 % [83.0–95.7] | 16 / 13 / 13 / 16 / 15 | 2962 / 5203 | 0.38 | 0 / 0 |
| gemini-3.5-flash-lite | 16/16 | 88.8 % [80.0–94.0] | 16 / 9 / 16 / 16 / 14 | 1320 / 1517 | 0.77 | 0 / 0 |
| glm-5.3-flash | 10/16 | 56.3 % [45.3–66.6] | 7 / 10 / 8 / 10 / 10 | 9156 / 13480 | 0.53 | 5 / 1 |
| deepseek-v4.1-flash | **0/16** | 13.8 % [7.9–23.0] | 0 / 4 / 2 / 3 / 2 | 7516 / 13845 | 0.87 | 15 / 1 |
| gpt-6.1-terra | 16/16 | 93.8 % [86.2–97.3] | 16 / 13 / 15 / 16 / 15 | 4393 / 7354 | 2.41 | 0 / 0 |
| qwen3.8-27b | **0/16** | 13.8 % [7.9–23.0] | 0 / 4 / 2 / 3 / 2 | 12315 / 20006 | 2.87 | 12 / 4 |
| claude-sonnet-5.5 | not measured | not measured | not measured | – | – | – |
| kimi-k3 | not measured | not measured | not measured | – | – | – |

| Model | Translate answered | Lines covered | Numbers kept | Terms right | p50 / p90 ms | gw USD per 1,000 | Truncated |
|---|---|---|---|---|---|---|---|
| gpt-6-luna | 10/10 | 23/23 | 21/22 | 23/23 | 2868 / 3069 | 0.10 | 0 |
| claude-haiku-5.5 | 10/10 | 23/23 | 22/22 | 23/23 | 1300 / 1656 | 0.12 | 0 |
| gemini-3.5-flash-lite | 10/10 | 23/23 | 22/22 | 22/23 | 1154 / 1410 | 0.38 | 0 |
| glm-5.3-flash | 10/10 | 23/23 | 21/22 | 22/23 | 2430 / 4093 | 0.19 | 0 |
| deepseek-v4.1-flash | 10/10 | 23/23 | 22/22 | 22/23 | 3864 / 7526 | 0.47 | 0 |
| gpt-6.1-terra | 10/10 | 23/23 | 22/22 | 22/23 | 3047 / 3656 | 1.01 | 0 |
| qwen3.8-27b | 6/10 | 12/23 | 12/22 | 11/23 | 14246 / 22929 | 2.09 | 4 |
| claude-sonnet-5.5 | not measured | not measured | not measured | not measured | – | – | – |
| kimi-k3 | not measured | not measured | not measured | not measured | – | – | – |

Sonnet 5.5 and Kimi K3 were run on `pc_claims` only, by the owner's instruction. Gateway cost equals the OpenRouter
cost for these two features except where a call timed out. With 16 and 10 items the intervals overlap: the ranking
among luna, Haiku, Gemini and terra is not statistically settled.

### Recommended chains

| Feature | Default | Fallback (different company) | Meets target? | USD per 1,000 checks (default; fallback) |
|---|---|---|---|---|
| `pc_fields` | claude-haiku-5.5 | gpt-6-luna | no target set (baseline: 91.3 % and 86.3 %, synthetic) | 0.38; 0.21 |
| `pc_translate` | claude-haiku-5.5 | gpt-6-luna | no target set (both 23/23 lines, synthetic) | 0.12; 0.10 |
| `pc_claims` | **none meets 80 / 80 / 5.** Closest: gpt-6.1-terra | claude-sonnet-5.5 | **no** | 1.39; 4.14 |

- `pc_fields` / `pc_translate`: gpt-6-luna is the cheapest and Haiku 5.5 costs 0.02 to 0.17 USD more per 1,000. With no
  target and overlapping intervals the "cheapest that meets the target" rule cannot separate them. The current order
  (Haiku first, luna second) is kept: Haiku is about twice as fast and has the higher point score. Swapping them is
  equally defensible.
- `pc_claims`: do not switch it on for customers yet. If it runs in demo mode, terra → Sonnet is the least bad chain.
  A chain's cost is the default's cost when the default answers: both defaults answered ≥ 98.9 % of calls.
- Gemini 3.5 flash-lite is the fastest and is accurate on `pc_fields` (registration 16/16), but stays out of the
  default chains (owner's 18+ question).
- Not usable as configured (1,500-token cap, reasoning on): qwen3.8-27b and deepseek-v4.1-flash for `pc_fields` and
  `pc_claims`, glm-5.3-flash for `pc_fields`. Kimi K3: 18.6 % timeouts, the highest cost, and no better than Sonnet
  (union recall 87.2 % against 92.9 %, FF 20.3 against 17.1).
- The design's `qwen3.7-plus` and `glm-4.6v` have no usable ZDR route (§2) and were not run.

### Spend

| Source | USD |
|---|---|
| OpenRouter key-info, usage before → after | 11.363218 → 16.312387 = **4.949169** |
| Gateway settled cost, all 2,847 attempts in the log | 5.594269 |
| Difference (gateway − key) | **+0.645100**. The gateway bills a timeout at its reservation and the higher of table and reported cost |
| Sum of OpenRouter per-generation `total_cost` (2,780 of 2,847 attempts have a record) | 4.139828 |
| Key remaining | **3.687613** of 20.00 |

Per model, key usage delta: gpt-6-luna 0.069 (with the re-run shards), claude-haiku-5.5 0.074, gemini-3.5-flash-lite
0.175 (with the duplicate), glm-5.3-flash 0.089, deepseek-v4.1-flash 0.185, gpt-6.1-terra 0.416, qwen3.8-27b 0.514,
claude-sonnet-5.5 1.092, kimi-k3 2.331. Every model stayed under 10 USD. Total with the smoke: 5.15 USD of the 50 USD
trial budget.

### What was skipped, and the limit it needs

| Skipped | Why | Estimated cost | More key limit needed |
|---|---|---|---|
| claude-sonnet-5.5 on `pc_fields` + `pc_translate` | owner's instruction (claims only) | 0.11 USD | **0** (fits in the 3.69 left) |
| kimi-k3 on `pc_fields` + `pc_translate` | owner's instruction (claims only) | 0.41 USD | **0** (fits in the 3.69 left) |
| Kimi subsample | not needed: the full 264 texts ran | – | – |
| Re-measure of all 9 models on a fresh `pc_claims` split of the same size | future round | about 4.6 USD | **about 1.3 USD more** (4.6 + 0.40 margin − 3.69), so raise the limit to about 22 USD or more |

### Held-out reuse and data

- **The P3 held-out split has now been sent to 9 models. It is used up for model selection.** Any prompt or rule change
  made from these results must be measured on a **fresh split**.
- Split file used: `~/LENSIQ-field/product-check/texts/split.json`, sha256
  `ab22ce6e464cc5776970b0f52ae592ef70b6052ac8eebee48ed5140edab8a0e3`. Text set `set.jsonl`, sha256
  `8d93deea37713dcc8075609109af8bdf9544b507775f3a10f31a885358fea4de`.
- The loader appended 33 run lines to `texts/p7-ai-heldout-runs.jsonl` (one per shard process, including the crashed
  and duplicate ones).
- All logs and raw results are in the persistent folder `~/LENSIQ-field/evals/p8/` (outside the repo and worktrees):
  - `p8-run-<model>-s<i>of<n>-<time>{.json,-raw.json}`: per-shard summaries and raw per-item results (ids, rule ids,
    scores and numbers; no advert text);
  - `p8-run-merged.json` (the numbers above, per model) and `p8-run-genstats.json` (OpenRouter per-generation costs);
  - `logs/` (wrangler log, key-usage log, queue log, shard outputs), `smoke/` (copies of the smoke and probe outputs),
    `tools/` (`p8-run.mjs`, `p8-agg.mjs`, `genstats.mjs`, `keyusage.mjs`, `runmodel.sh`, `queue.sh`, `secretscan.mjs`).

### Risks and next step

1. `pc_claims` with AI raises false flags on compliant products 3 to 11 times. Shown to a shop owner, that is a wrong
   "risk signal" on a legal product. Precision must be fixed before any pilot.
2. The labels are AI-made. Precision and FF may be understated where the labellers missed a rule. Pharmacist
   adjudication is still pending.
3. `pc_fields` / `pc_translate` numbers are from a small synthetic set (16 and 10 items). They are a baseline, not a
   field result.
4. The P7 eval runner stops on a text the Worker refuses before sending (deviation 2). It needs a small fix and a test
   before the next run.
5. Next step (needs owner approval): (a) tighten the `pc_claims` prompt, or use the AI only for the rules where the
   on-device detector is weak; (b) draw a fresh held-out split; (c) re-measure gpt-6.1-terra, gpt-6-luna and Sonnet
   5.5 on it.

## Follow-up 2026-11-12: 21 texts refused as `bad_input`, and rule-family filtering (owner order 2026-11-12)

Source: the independent fresh3 measurement (local `wrangler dev`, local evaluation mode, eval-only prompt variant B
from branch `p8b-prompt-variants`, not on main). Raw outputs and texts stay in `~/LENSIQ-field/evals/adverts/fresh3/`
(public advert texts, AI-labelled; no text is copied here or into the tests). `pc_claims` stays OFF in the product;
these are correctness fixes.

### F1: the 21 texts answered `bad_input` for all three models (cause found by running the guard on each id locally)

| group | ids | cause | decision |
|---|---|---|---|
| 10 cosmetic (th 6, zh 4) | FR3-0039, 0163, 0184, 0243, 0365, 0428, 0447, 0466, 0692, 0842 | **Not a guard refusal.** Eval-only variant B asks the AI only about the "weak" rules, and the cosmetic family has none, so the variant's `buildClaims` throws "no AI rule for this category" and the gateway reports `bad_input`. These are all 10 cosmetic texts of the set. On main they reach the model in local evaluation mode. | Eval artefact, nothing to fix on main. The variant branch should skip a cosmetic item in the runner (device result only) and count it as such, not as `bad_input`. |
| 10 zh drug / herbal / supplement | FR3-0118, 0367, 0449, 0462, 0541, 0559, 0573, 0626, 0820, 0854 | `lensiq-pc-guard.js` reads 病人 ("patients") anywhere as a patient field: a dispensing-label sign and a name cue. In indications and adverts it is part of a noun phrase ("糖尿病病人", "成人病人之", "…症)病人。"). 7 of the 10 also lose the rest of the sentence to `[removed]` (read as a name). | **Still refused (`ai_off_dispensing`; `ai_off_personal_data` if the device did not redact).** A narrow fix was built and then reverted, see below. |
| 1 zh herbal | FR3-0966 | The CJK institution-header rule reads "…、…等各大医院" (a list of hospitals in advert prose) at a line start as a hospital header, so a dispensing sign. | **Still refused (`ai_off_dispensing`).** Fix reverted, see below. |

None of the 21 is personal data. On a deployed Worker the 11 zh texts would be refused anyway: with the guard's
dispensing reading set aside, all 11 have no product-label evidence (`ai_off_no_product`), like almost every advert
text (below). The cost of the false positive is therefore limited to local advert evaluation.

**Narrow guard fix reverted (2026-11-12).** Commit f4d06e0 let 病人 count only as a field word and kept the header
rule from running across 、，；。 or after 各 / 等 / 多家 / 知名 / 权威. It changed only these 11 texts in every locked and
fixed set (P7 filter 470, p7b 494, guard dev 197 / hold-out 61, evidence 551, AI 26, P3 534, adverts 402 / 635 / 967),
and the P7 re-score reproduced the recorded figures. The independent privacy review then wrote 155 synthetic,
realistic Chinese dispensing / patient texts that the locked sets do not contain, and found the change **weaker on
79**. In some of them the AI gate went from "dispensing" to "ok" with the patient name left in the text and the photo
allowed. Examples: `住院病人张三`, `急诊病人张三 床号12` or `3床病人张三` followed by a pack block with a 国药准字 number;
separators U+3000, NBSP, CR, ∶, ︰; field words 名字 / 名称 / 代码; `三级甲等医院` lost through the 等 rule; a header
after `1、`. The benefit (11 advert texts that a deployed Worker refuses anyway) does not justify that risk, so
`lensiq-pc-guard.js` is back to its parent version (sha256 61aa058b…, the version the P7 figures were recorded with)
and `medicine.html` loads it as `?v=1` again. A safe fix would have to cover the reviewer's broader patterns
(whitespace and colon variants, ward / bed / department prefixes, more field words, ranked-hospital wording). It is
**deferred**. The reviewer's cases are now a fixed regression set: `tests/unit/pc-guard-zh-patient-regression.test.js`
freezes every protection the guard gives them today (154 of 155 cases: name removed 115, dispensing 153, photo
blocked 153, AI refused 154). Run against the f4d06e0 guard, that test fails. One case has no protection today
("住院病人" split one character per line, then a name and a pack block). It is a known gap, not frozen.

Refusal codes: the Worker still answers `bad_input` (HTTP 400, no provider call; the page and the eval runner key on
it) and now adds `code`: `ai_off_personal_data`, `ai_off_dispensing`, `ai_off_personal_doc` or `ai_off_no_product`
(docs/AI-GATEWAY.md §4). A malformed request has no code. `tools/pc-ai-eval.mjs` reports `refused_by` per code. The
page (`lensiq-pc-ai.js`) runs the same `aiGate` first and shows its own notice; a Worker refusal is still shown as the
generic fallback.

Adverts and the product-label filter (report only, no policy change): on a deployed Worker the filter refuses
947 of the 967 fresh3 texts as `no-product` and 6 as `personal-doc`; 14 are allowed (fresh2: 622 of 635 refused,
fresh: 391 of 402). The filter was built for photographed labels, so `pc_claims` on advert text cannot run on a
deployed Worker today. Whether advert checks get their own gate is an owner decision.

### F2: `pc_claims` rule-family filter on the server

With a product category, the gateway's `pc_claims` verify now drops (does not reject) a signal whose rule is outside
the category's family, using the same list the prompt offers (`claimRulesFor`: D drug, F supplement / food, H herbal,
C cosmetic; F22 only for food), and returns only the count as `meta.off_family_dropped`. Without a category nothing
changes. Re-analysis of the recorded fresh3 outputs (not a new measurement): haiku 61 off-family signals in 51 answers
(herbal F10 40, supplement D08 11, food D08 9, herbal D08 1), gpt-6-luna 14 in 13 answers (herbal F10 7, supplement
D08 4, supplement H05 3), gpt-6.1-terra 0. Neither labeller (A or B) used an off-family rule on any fresh3 text, so
every dropped pair was a false flag under both labels. The page does not filter by family itself (it lists every
signal it receives). It sends a category only when the device inferred one from a Thai registration number, and it
sends a Thai food registration as `supplement`, so F22 is never offered from the page.

Tests: `tests/unit/backend-pc-refusal-family.test.js` (8 tests: codes for all three features, no code on a malformed
request, local evaluation mode, Chinese 病人 texts still refused with the right code, family filter, F22, gateway
metadata as counts only), `tests/unit/pc-guard-zh-patient.test.js` (2 tests: every field use of 病人 and every
institution header blocks and removes the name; the "prose passes" test of the reverted fix was removed with it) and
`tests/unit/pc-guard-zh-patient-regression.test.js` (2 tests over the reviewer's 154 frozen cases). The existing P7-4
test sent `category: "drug"` and expected an F04 signal back; its original assertions now run without a category
(unchanged result), and the drug-category call asserts that F04 is dropped with `off_family_dropped: 1`.
