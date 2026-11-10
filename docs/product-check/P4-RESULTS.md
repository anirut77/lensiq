# Product Check P4: official lookups and free drug data (results)

> Round 17, phase P4 (design `docs/PRODUCT-CHECK-DESIGN.md` §4, §6, §12). Built 2026-11-10. Not deployed, not committed by
> the build agent. Every number states its source: **synthetic** (generated queries), **public dataset** (TMT, NLEM, P3 text
> set) or **live public source** (called on the run date). There are **no field numbers** (owner photos) in P4.

## สรุปสำหรับเจ้าของ (Thai summary)

- **ทำแล้ว:**
  - ค้น อย. ผ่าน Worker ครบ 21 คำสั่งของเว็บเซอร์วิส มีสวิตช์ผู้ดูแลระบบผ่าน API (`/admin/api/pc/lookup` ยังไม่มีปุ่มในหน้า admin.html)
    เปิด ("live") ในบิลด์เดโม และต้องได้หนังสืออนุญาตก่อนเก็บเงิน (L13)
  - ตัดชื่อบุคคลธรรมดา ที่อยู่ และชื่อผู้ผลิตต่างประเทศออกก่อนส่งกลับ
  - แหล่งเรียกคืนสินค้า: openFDA, EU Safety Gate (ทดสอบเท่านั้น), RASFF, Health Canada, ทะเบียนยา HSA สิงคโปร์
  - ฉลาก openFDA / NDC / DailyMed / RxNav ส่งเฉพาะข้อเท็จจริงและลิงก์ ไม่ใช้ RxClass
  - ตาราง TMT 2563 (CC BY) จับชื่อการค้าไทย → ตัวยา ความแรง รูปแบบยา ทำงานในเครื่อง
  - ตารางบัญชียาหลักแห่งชาติ 2567
  - รายการเตือนของไทย 8 รายการ ทุกรายการตรวจกับหน้าประกาศ อย. แล้ว
  - การ์ด "สัญญาณเสี่ยง" ในแท็บตรวจสินค้า พร้อมคำโฆษณาเกินจริงจาก P3
- **ตัวเลข** (ชุดทดสอบคงที่ เขียนก่อนเขียนโค้ด แบ่ง dev และ held-out):
  - ชื่อการค้า → ตัวยา บน held-out: ชื่อตรง 100% ข้อความแบบฉลาก 100% ข้อความ OCR ผิดหนึ่งตัว 92.7% จับผิดตัวยา 1.3%
  - ชื่อที่ไม่มีในตาราง: จับผิด 0/45
  - แหล่งออนไลน์จริง: ถูก 25/25 กรณี
  - แหล่งล่ม: ขึ้นว่า "ตรวจไม่ได้" 8/8
- **ยังไม่ได้วัด:** ตัวชี้วัดหลัก "บอกว่าดูปกติกับสินค้าผิดกฎหมาย" ต้องใช้ภาพจริง ≥ 75 ภาพจากเจ้าของ
- **ความเสี่ยง:**
  - TMT เป็นข้อมูลปี 2563 (ยาใหม่ไม่มี)
  - ยังตรวจบัญชียาหลักกับราชกิจจาฯ ไม่ได้ เพราะเว็บกันบอท (L32)
  - Safety Gate ยังไม่ยืนยันสัญญาอนุญาต (L16)
  - ส่วนค้นหาของ RASFF และ Safety Gate ไม่มีเอกสารทางการ อาจเปลี่ยนได้

## 1. Fixed test set (written before any matching code)

`docs/product-check/p4-testset.json`, generated once by `tools/pc-lookup-testset.mjs` (seed `lensiq-pc-p4-2026-11-10`)
on 2026-11-10 **before** `lensiq-pc-lookup.js` existed. SHA-256
`a21a63b50c907c7c418c02127011e731a920d218fb90f2e1f62da95d321e4a32`; `tests/unit/pc-lookup.test.js` fails if it changes.

| Stratum | n | Content | Source |
|---|---|---|---|
| `tmt_dev` | 150 names × 3 queries | Thai brand → active ingredient(s) from the TMT 2020-02-17 snapshot; split by a fixed-seed hash of the trade name (20 % held-out). Queries: **exact** name, **label** line (name + strength + dose form), **ocr** variant (lower case + one OCR look-alike swap, or one dropped letter when no look-alike exists) | public dataset (TMT, CC BY) + synthetic queries |
| `tmt_heldout` | 150 × 3 | same, other names; **never used for tuning** | same |
| `tmt_notfound` | 45 | 30 synthetic nonsense brands (checked absent) + 15 real brands first registered after Feb 2020 (PAXLOVID, LAGEVRIO, EVUSHELD, COMIRNATY, SPIKEVAX, VAXZEVRIA, MOUNJARO, WEGOVY, LEQEMBI, BEYFORTUS, VEKLURY, XOCOVA, RONAPREVE, KISUNLA, AREXVY; checked absent from the snapshot) | synthetic / public |
| non-drug texts | dev 203 / held-out 200 | food, supplement and cosmetic texts of the P3 labelled set, same dev / held-out split as P3 (outside the repo) | public dataset (P3) |
| `registry` | 16 | Thai FDA: one known-registered number per category (drug `1A 844/39`, food `10-1-02141-1-0375`, cosmetic `13-1-6800016755`, herbal `G123/45`, advert `ฆท.1377/2564`, device `69-1-3-2-0000467`), two numbers named in FDA warnings (one cancelled, one still active), six well-formed absent numbers incl. the publicly reported fake cosmetic number `10-2-6600188171`; HSA `SIN09110P` + an absent name | live public source (found by the research agent on 2026-11-10) |
| `recalls` | 9 | openFDA by GTIN (`712199083411` → H-0130-2027) and by name (Synjardy → D-0657-2026); Safety Gate (SR/01376/26); RASFF (2026.9864); Health Canada (NID 77435); one absent term per source | live public source |
| `alerts` | 4 | curated Thai list: 2 listed numbers, 1 partial-digits trap, 1 registered unlisted number | synthetic queries over the list |
| `down` | 8 | Thai FDA, openFDA, Safety Gate, RASFF, HSA, Health Canada, DailyMed, RxNav answering 500 or timing out | synthetic (fake upstream) |

Measured with `node tools/pc-lookup-eval.mjs --tmt dev|heldout --alerts --down --live`. Unit tests and CI use recorded
fixtures only (`tests/unit/fixtures/pc/`), never the network.

## 2. Numbers per condition

Wilson 95 % intervals in brackets. "Wrong" = an ingredient was returned but not the expected one (the safety-relevant
error); "miss" = nothing returned (the card then says nothing about the brand).

### 2.1 TMT brand → ingredient (on the device; public dataset + synthetic queries)

| Split · query | n | Hit | Wrong match | Miss | Latency per query (Node, build Mac; the range covers every re-run, including the sharded eval loop) |
|---|---|---|---|---|---|
| dev · exact | 150 | 100 % [97.5, 100] | 0 % [0, 2.5] | 0 % | p50 0.01–0.54 ms across runs |
| dev · label line | 150 | 100 % [97.5, 100] | 0 % [0, 2.5] | 0 % | p50 0.05–1.02 ms across runs |
| dev · OCR noise | 150 | 88.7 % [82.6, 92.8] | 0.7 % [0.1, 3.7] | 10.7 % | p50 0.01–0.31 ms across runs |
| **held-out · exact** | 150 | **100 %** [97.5, 100] | **0 %** [0, 2.5] | 0 % | p50 0.01–0.42 ms across runs |
| **held-out · label line** | 150 | **100 %** [97.5, 100] | **0 %** [0, 2.5] | 0 % | p50 0.05–0.98 ms across runs |
| **held-out · OCR noise** | 150 | **92.7 %** [87.3, 95.9] | **1.3 %** [0.4, 4.7] | 6.0 % | p50 0.01–0.29 ms across runs |
| not-found names | 45 | — | **0 / 45 false match** [0, 7.9] | — | |
| non-drug texts, any TMT match (dev) | 203 | — | 3.0 % [1.4, 6.3] | — | |
| **non-drug texts, any TMT match (held-out)** | 200 | — | **6.5 %** [3.8, 10.8] | — | |

Index build (28,437 products) 90–130 ms in Node on the build Mac; **not measured on a phone yet**.

**Tuning record (dev only).** First run, before any tuning (dev): exact 96.7 % / wrong 2.7 %, label 96.7 % / 2.7 %, OCR
84.0 % / 3.3 %, non-drug texts 24.6 %. Changes made on dev only, in this order:
1. one-letter-off matching switched off by default: it made most of the non-drug false matches ("natural" → NATARAL);
2. n-grams up to 6 words;
3. the score counts the words that carry letters first, so a strength never outranks an exact name;
4. the OCR path folds look-alikes in letter tokens and cuts a trailing "-400";
5. a single word that is a product sold under its generic name, or "vitamin X", is not a brand;
6. stop words MINOR and TRIM.

The matcher was then frozen and held-out ran once. Afterwards only display code changed: one row per product, the
language accessor, translate="no" spans. The top-1 result the eval measures did not change: both splits were re-run
with identical numbers.

**Known limits (held-out errors, all listed):**
- OCR misses (9) are dropped-letter variants: "t-bufer", "detro", "viara", "naural betacar-15", "efmat 200",
  "pipen-200", "ketra 500", "keefen", "trnmed". There is no edit-distance path by default.
- Two OCR wrong matches return a shorter brand inside a longer one:
  - "bronchonyl expect0rant" → BRONCHONYL: terbutaline, without guaifenesin;
  - "salicylic acid + betametha5one" → SALICYLIC ACID.
  In both cases the card shows the TMT name, so the user sees which product matched.
- Non-drug false matches on held-out (13 texts) are TMT brands that are also ordinary words or supplement brands:
  GLUCOSE, JOINT, VISTRA, BOTOX, GO-ON, SUNSHINE, FOLIC ACID, FOLI-C, GLUCOSAMINE. On dev (6 texts) the remaining ones
  were PRO 10, GLUCOSE, VIAGRA in an advert, VISTRA and POPPY. "glucose" still matches the product GLUCOSE because its
  TMT ingredient string differs from the name.
  - Proposed fix, measured on a fresh set next round: skip any single word that equals any TMT ingredient name.
  - Not done now because held-out had already been run.

### 2.2 Curated Thai warning list (on the device)

- 4 / 4 fixed cases correct (synthetic queries over the list); the partial-digits trap does not match.
- 8 entries, newest 2026-11-07. All 8 were confirmed by `tools/pc-alerts-build.mjs --verify` on their official pages:
  number, a name token and the printed Thai date were found on each page.
- One page (`/news/sildenafil1`) answers HTTP 500 but serves the full article; the facts were still found on it.

### 2.3 Official sources through the Worker (live public sources, 2026-11-10, from the build Mac in Bangkok)

| Source | Cases | Correct | Wrong match | Could not check | Latency |
|---|---|---|---|---|---|
| Thai FDA WS_LICENSE_SEARCH (6 categories) | 14 | 14 | 0 | 0 | p50 65 ms; herbal 2.7–3.0 s; drug 0.4–1.2 s |
| Singapore HSA register | 2 | 2 | 0 | 0 | 141–600 ms |
| openFDA enforcement (drug + food) | 3 | 3 | 0 | 0 | 0.4–1.5 s |
| EU Safety Gate (testing only) | 2 | 2 | 0 | 0 | 1.3–4.4 s |
| RASFF Window | 2 | 2 | 0 | 0 | 1.5–2.7 s |
| Health Canada recalls (open-data file) | 2 | 2 | 0 | 0 | 0.9–1.0 s (whole 16 MB file; the Worker caches a derived index for 6 h) |

**Total: 25 / 25 correct.**
- The two numbers named in FDA warnings: one comes back "cancelled", which is a risk signal. The other is still
  **active** in the register (P4-REG-08), so only the curated list raises the signal for it. The card always shows both
  sources.
- Natural-person licensee names were dropped in 1 of the 14 Thai FDA answers (the herbal row). The first run counted 2:
  a public company (Big C) whose trade name sits in `thanm` was dropped too. The reviewer found this, and pc.js now shows
  the first field that is clearly a company. It also refuses a name that starts with a person's title, and anchors the
  Thai company markers, so a family name containing กรม or สถาบัน is no longer taken for a company.
- These latencies are from a Mac in Bangkok, not from a Cloudflare Worker.

### 2.4 Sources down (synthetic, fake upstream)

- **8 / 8** sources answering 500 or timing out give `could_not_check` in the Worker and in the card model, never "no
  signal".
- The unit tests cover every source with 500, 429, timeout and network error (40 cases).

### 2.5 Targets

- No owner target exists for these P4 conditions. The design §9.2 key metric (false "looks fine" on illegal products,
  0 observed and Wilson upper bound ≤ 5 %) needs the ≥ 75-photo illegal stratum, which has not been supplied. **It is
  not measured.**
- Proposed for the owner to confirm:
  - TMT wrong match ≤ 2 % with an upper bound ≤ 5 % on held-out (met: 0–1.3 %, upper bound 4.7 %);
  - not-found false match 0 (met);
  - fixed live cases 100 % (met);
  - source down → "could not check" 100 % (met);
  - non-drug false brand ≤ 5 % (**not met on held-out: 6.5 %**).

## 3. Source verdicts as used (from DRUG-DATA-SOURCES.md and design §4)

| Source | Used how | Licence as recorded | Status in P4 |
|---|---|---|---|
| Thai FDA WS_LICENSE_SEARCH (21 operations) | Worker `/api/pc/thfda`; admin switch `live` / `link`, live in the demo build | not stated (L13) | **testing only; written permission before charging.** Natural-person names, addresses, foreign makers dropped |
| TMT 2020-02-17 (data.go.th) | derived table `vendor/pc-drugs/tmt-2563.json`, on the device | CC BY (version not stated, L30) | use now, credit + "data as of 2020-02-17" |
| TMT 2568 / current release | refused by `tools/pc-tmt-build.mjs` (`licence_allowed: false`) | "Open Data Common" / none (L29) | not used |
| NLEM 2567 (thai-nlem-api CSV) | derived table `vendor/pc-drugs/nlem-2567.json` + MIT notice | MIT (CSV), s.7 (Gazette) | use now; **Gazette cross-check pending (L32)** |
| Curated Thai list | `vendor/pc-alerts/th.json`, facts only | facts (L18) | use now for testing; pharmacist review pending |
| openFDA enforcement / label / NDC | Worker, facts + link only | CC0 | use now |
| DailyMed | Worker, set id / title / date / link | US Gov; labeller text not copied (L33) | use now |
| RxNav (approximateTerm, related IN) | Worker | no licence needed; **no RxClass** (L33) | use now |
| EU Safety Gate public search | Worker | Commission reuse notice for the search; CC0 only for the weekly XML (L16) | **testing only** |
| RASFF Window search | Worker | CC BY 4.0 (data.europa.eu `restored_rasff`); search endpoint undocumented (L16) | **testing only** (coordinator decision 2026-11-10): off in customer builds unless the owner switches it on |
| Health Canada recalls (open-data JSON) | sharded offline (`tools/pc-hc-build.mjs`), searched on the device | OGL-Canada | use now |
| Singapore HSA register | Worker | Singapore Open Data Licence v1.0 | use now (a register, not a recall list) |
| HSA alerts / RSS | not used | HSA terms §4.3: no commercial reuse | link out only |
| DrugBank, WHO ATC, RxClass, thai-pharma-kb, GPL / NC data | not used | — | — |

## 4. NLEM cross-check (L32)

- Gazette text could not be fetched from the build machine on 2026-11-10:
  - ratchakitcha.soc.go.th answered a bot challenge (HTTP 403);
  - ndi.fda.moph.go.th timed out.
  - The table therefore says `gazette_checked: false`.
- Internal check (`--tmt-overlap`): 595 of 865 single-ingredient NLEM entries (68.8 %) appear as TMT ingredient names.
  The rest are mostly spelling and salt variants. This shows the CSV is a real NLEM-shaped list, not its accuracy.
- To finish L32, the owner downloads the 2567 announcement PDF, extracts the text outside the repo and runs
  `node tools/pc-nlem-build.mjs --gazette FILE.txt`. That checks a fixed 40-name sample.

## 5. Table sizes

| File | Size | gzip | Content |
|---|---|---|---|
| `vendor/pc-drugs/tmt-2563.json` | 1,266,153 B | ~279 KB | 28,437 products (pack-size duplicates merged), 2,623 ingredients, 180 forms, 1,808 makers; input `mastertmt_20200217.xls` SHA-256 `b959c348…7d63` (same file re-downloaded from the exact data.go.th URL on 2026-11-10) |
| `vendor/pc-drugs/nlem-2567.json` | 78,236 B | ~17 KB | 933 entries, 120 groups; input CSV SHA-256 `ee6d15b5…da45` |
| `vendor/pc-alerts/th.json` | 5,556 B | ~1.6 KB | 8 entries |

The tables load only when the Product Check card first needs them, from this site (no third party).

## 6. Independent review (2026-11-10)

An independent reviewer agent re-ran every mode of `tools/pc-lookup-eval.mjs`, the three `--check` builds, the unit tests
and the e2e tests. It also ran its own scorer over the held-out set and opened all 6 FDA source pages of the curated list.

- **Numbers:** every number above reproduced exactly: TMT dev / held-out, not-found, non-drug, alerts, down, live 25/25,
  table sizes, test-set checksum. Only latencies varied (machine and network noise).
- **Pages:** all numbers, lots, substances and printed dates were found on the pages, and no sentence was copied.
- **Must-fix, both fixed:**
  - M1: a natural person's name containing กรม / สถาบัน / สหกรณ์ (or "MS. SA LEE") could pass as a company. Person
    titles are now refused, Thai markers anchored and bare short tokens removed, with unit cases.
  - M2: the data credits were not yet in `LICENSES/`. They are now in THIRD_PARTY.md, THIRD-PARTY-NOTICES.txt and
    CREDITS-MEDIA.md.
- **Should-fix, fixed:**
  - S1: the licensee field order. A company in `licen` wins, and the dropped count is corrected to 1 of 14.
  - S2: the known-limits list.
  - S3: the admin switch is API only, now stated.
  - S4: the card used the UTC date (shows yesterday before 07:00 in Bangkok); it now uses the local calendar day.
- **Should-fix, open:** S5, the CTO-BRIEF / FIELD-PILOT / PDPA updates. The build agent may not edit those files, so
  the proposed text is in the round report.
- **Not verifiable:** that tuning used dev only, because the work is uncommitted and the P3 texts live outside the repo.
  The tuning record in §2.1 is the build agent's account.

## 7. Second review (2026-11-10): fixes after rebasing onto main 600787e

The second review reproduced every number above and found no data leak. It blocked approval on one fail-open path. All
items below are fixed in the product, each with a unit or e2e test; no test was loosened.

| # | Finding | Fix | Test |
|---|---|---|---|
| **B1** | A 200 HTML / WAF page, a 200 SOAP Fault or an empty 200 from Thai FDA was read as "not found" and cached 6 h | `isSoapAnswer()` requires the operation's `…Response` and `…Result` and no Fault; anything else is `could_not_check` / `bad_response` and is not cached. The card treats a body without an `items` array as "could not check" | backend: HTML, Fault, empty and wrong-operation bodies (status 502, not cached, asked again); a real empty DataSet stays "not found"; client `rowFor` |
| S1 | Same fail-open in the JSON sources | expected key per source (`results`, `content`, `notifications`, `result.records`, `data`, `approximateGroup` / `relatedGroup`); a JSON parse error is `bad_response` | every source × (wrong JSON, HTML, empty) = 27 cases |
| S2 | Health Canada: a non-array body became an empty index | the builder (`tools/pc-hc-build.mjs`) refuses anything but the file's shape | unit |
| S3 | Company markers were unanchored; titles incomplete | NFKC + zero-width strip (+ sara am recomposed, which NFKC splits); marker must open with บริษัท… or end with จำกัด / Co., Ltd. …; civil, academic, medical, military and police titles, plus abbreviated ranks | all of the reviewer's cases + 20 more persons and 9 companies |
| S4 | `in` checks follow `Object.prototype` | `Object.hasOwn` for routes, ops, batch sources and admin keys. A GET route named `__proto__` etc. answers **404** (unknown route, like any other); the same names as a Thai FDA `op`, as a batch `source` or as an admin key answer **400** | `__proto__`, `constructor`, `toString`, `hasOwnProperty` |
| S5 | Health Canada breaks the free-plan CPU limit; no cache on *.workers.dev | **owner decision 2026-11-10:** no Workers Paid, no cron. `tools/pc-hc-build.mjs` (with `--check`; re-run per release) shards the file offline into `vendor/pc-recalls/hc/`: 540 word shards by 2-letter prefix + 58 item chunks of 100, OGL credit in `meta.json`. The page searches them itself and nothing is sent; the Worker route answers `on_device` | unit (sharded search = full scan on 10 queries; builder shape guard and window); e2e (word shards loaded, never the 16 MB file, never in the batch) |
| S6 | One tap ≈ 20 requests against 30 / min; no limit without D1 | `POST /api/pc/batch` (≤ 16 lookups, one count per tap, validated before any call); the client plan is de-duplicated and capped at 16; in-memory limiter without D1 | unit (batch, 429, bad batches call nothing, memory limiter); e2e (exactly one POST per tap) |
| S7 | TMT index ≈ 56–66 MB heap, 72+ ms on the main thread | **owner decision 2026-11-10:** the table builder writes 473 key-prefix shards (`vendor/pc-drugs/tmt/`, `--check` included). The page loads only the shards a label's candidate keys need and runs the same `matchTmt` over them | unit + eval: **identical results on every dev and held-out query, the not-found names and the non-drug texts (698 / 698 dev, 695 / 695 held-out)**; e2e (shards only, never `tmt-2563.json`) |
| N1 | Licensee-name searches were public | only `drug, food, cosmetic, herbal, device, advert, all` are public | each other op → 400, nothing called |
| N2 | wrangler.toml said "admin.html" | wrangler.toml and BACKEND.md: admin API only | — |
| N3 | No customer-build guard | `PC_BUILD=customer`: Thai FDA and Safety Gate off (`testing_only_off`) unless the owner switches them on; licence label kept | unit |
| N4 | `lensiq-pc-lookup.js` not type-gated | both lookup files in `tsconfig.typecheck.json`; report 627 (ratchet 627) | `npm run typecheck`, `typecheck:report` |

**Memory and time** (`node tools/pc-lookup-bench.mjs`, median of 3 runs, 2026-11-10). This is an **EMULATED mid-range phone
profile**, not a real phone: Chrome DevTools CPU throttling 4x and a 390 px mobile viewport, on the build Mac. Heap is
`Runtime.getHeapUsage` after a forced GC. `performance.measureUserAgentSpecificMemory` needs a cross-origin-isolated page,
which medicine.html is not.

| Build | First label (download + index + match) | Second label | Heap kept | Files fetched |
|---|---|---|---|---|
| Before: first P4 build (whole table, every key aggregated up front) | 393–441 ms (re-runs) | 1.5 ms | 34.0 MB | 1 (1.2 MB) |
| Compact whole index (intermediate fix, now replaced) | 176 ms | 0.7 ms | 6.6 MB | 1 (1.2 MB) |
| **After: on-demand shards** | **28 ms** | 28 ms (its own shards) | **1.2 MB** | 22 small shards |

- In Node (build Mac, `--expose-gc`, index only) the first build used 56.4 MB; the reviewer measured about 66 MB in a browser.
- All three builds match the same products for the test labels.

**Shard sizes:**

| Data | Shards | Total | Typical file | Meta |
|---|---|---|---|---|
| TMT (`vendor/pc-drugs/tmt/`) | 473 | 2.0 MB | median under 1 KB, p95 21 KB, max 57 KB | 107 KB (ingredients, forms, shard list) |
| Health Canada (`vendor/pc-recalls/hc/`) | 540 word shards (337 KB) + 58 item chunks (1.42 MB) | 1.76 MB | word shard median under 1 KB, max 39 KB; chunk about 25 KB | 4 KB |

- Health Canada covers 5,748 recalls updated 2023-11-08 .. 2026-11-07, out of 34,361 in the file.
- A Health Canada search loads one word shard per query word plus at most 5 chunks.
- `vendor/pc-drugs/tmt-2563.json` stays as the canonical derived table. It feeds the shards, the eval and the tests; the
  page no longer downloads it.

**Numbers after the fixes:**
- TMT dev / held-out: unchanged (§2.1).
- Live: 25 / 25 again (2026-11-10). Health Canada now runs from the shards: "Organic Roasted Black Soybeans" → NID 77435, and the absent term finds nothing.
- Source down: 8 / 8.

## 8. Third pass (2026-11-10): re-review findings, all fixed

| # | Finding | Fix | Test |
|---|---|---|---|
| 1 | An admin PUT stored the computed Thai FDA mode, freezing the `PC_THFDA_MODE` fallback | only an explicit `thfda` in the input is stored | unit |
| 2 | `PC_BUILD=" customer"` failed open | trimmed and lower-cased | unit (3 spellings) |
| 3 | Company nits | a plain "ห้างหุ้นส่วนสามัญ" is a person (only "…จำกัด" / "…สามัญนิติบุคคล" are juristic); "กรม" followed by a royal rank (กรมพระยา, กรมหลวง, กรมหมื่น, กรมขุน) is a person; "จำกัด" must be its own word at the end; titles ทนพ. / ทนพญ. / พลทหาร / ทันตแพทย์(หญิง) / นายแพทย์ / แพทย์หญิง / เภสัชกร(หญิง) | unit (11 persons, 5 companies) |
| 4 | Any openFDA 404 was "none" and cached | only openFDA's `{"error":{"code":"NOT_FOUND"}}` is "none"; any other 404 is `upstream_404`, not cached (enforcement, label, NDC) | unit (4 bodies × 3 routes) |
| 5 | RASFF verdict | testing only, off in customer builds (DRUG-DATA-SOURCES §0) | unit |
| 6 | openFDA `recalling_firm` may be a person | company filter applied (kept only when clearly a company; the card never shows it); `docs/pdpa-notes/S1-D-medicine.md` | — |
| 7 | Prototype-name status codes | stated in §7 (GET 404, op / batch / admin 400) | existing |
| 8 | Health Canada builder too lenient | array or the file's numbered object only; ≥ 10,000 items; ≥ 99 % with NID / URL / Title; ≥ 99 % of non-empty dates must be valid calendar dates (refused on purpose). Items with an EMPTY date are skipped and counted: the real file has 2,717 undated Transport Canada vehicle recalls (7.9 %), so a 99 % rule over all items would refuse it | unit |
| 9 | "(n items)" showed at most 5 | `hcSearchSharded` returns `{items, total}`; the card shows the total | unit (total = full scan count) |
| 10 | Window not stated | the Health Canada row says "recalls updated from <window_from> to <as_of>, searched on this device" (TH / EN / ZH) | unit + e2e |
| 11 | Stale latency figures | ranges across runs in §2.1 and §7 | — |
| 12 | "median 0 KB" | median in bytes (TMT 480 B, Health Canada word shards 47 B) | — |
| 13 | TH-2026-0002 missing `no-dates` | added, rebuilt and re-verified on its page | — |
| 14 | STOP comment | says which words were chosen in advance and which were tuned on dev | — |
| 15 | P2's "not checked in this step" lines contradicted the card | with the card on the page, the list points to the card for the register check, and the over-claim line is gone (TH / EN / ZH); the P2 e2e now asserts the new wording | e2e (both files) |
| 16 | Duplicate batch items were asked twice | de-duplicated server-side; every position still gets its answer | unit |
| 17 | No phone check with the card | 320 / 360 / 390 px, before and after the lookups | e2e |
