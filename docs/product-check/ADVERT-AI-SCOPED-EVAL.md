# Product Check adverts: scoped AI round, evaluation plan and cost (stream F, 2026-11-13)

> Prepared only. **No paid AI call was made.** The remaining approved AI budget is not documented as a current figure
> (P8-RESULTS says "3.69 USD left of 20" after P8; later rounds spent more), and running needs the owner's OpenRouter key,
> which the agent never handles. The owner decides (Thai summary below). Source of every cost figure: the gateway's
> settled cost on the fresh-3 run (`~/LENSIQ-field/evals/adverts/fresh3/ai/run.log`, 967 texts, prompt B, ZDR routes).

## สรุปสำหรับเจ้าของ

- รอบที่แล้ว (fresh-3) AI จับโฆษณาเกินจริงได้ 90–95 % แต่แจ้งเตือนผิด 13.6–29.1 ต่อ 100 ข้อความ (เป้า ≤ 5) จึงยังปิด `pc_claims`
- รอบ "AI แบบจำกัดขอบเขต" ที่เสนอ: AI ตอบได้เฉพาะกฎในตระกูลของประเภทสินค้าที่ผู้ใช้เลือก ต้องยกข้อความหลักฐานจากโฆษณาตรงตัวอักษร
  และวัด 2 แบบ: (1) AI ยืนยันเฉพาะสิ่งที่กฎบนเครื่องพบ (ลดแจ้งเตือนผิด) (2) AI เพิ่มสัญญาณได้เฉพาะเมื่อยกหลักฐานตรงตัว (เพิ่มการจับ)
- ต้องมีชุดข้อความใหม่ (fresh-4) เพราะชุดเก่าใช้ไปแล้วทั้งหมด: ประมาณ 400 ข้อความ ไทย อังกฤษ จีน ติดป้ายแบบ blind 2 ชุด ล็อกก่อนวัด
- **ค่าใช้จ่ายประมาณ 1.0–1.8 USD** (3 โมเดล × 2 แบบ × 400 ข้อความ เผื่อ 20 %) ถ้าใช้ Haiku อย่างเดียว ประมาณ 0.3 USD

## 1. What "scoped" means

| Variant | AI may | Shown to the user |
|---|---|---|
| S1 "confirm" | only confirm or reject signals the on-device rules already found, rule ids of the chosen product type's family | rule signals the AI confirmed |
| S2 "scoped add" | add a signal only for a rule of the chosen family, with an evidence span that occurs verbatim in the text | rules ∪ AI signals whose span is verbatim |

Both: product type chosen by the user (released mode), seller identifiers removed before sending (`LQPCAdvert.scrub`),
text only, the same consent as `pc_claims`. Fresh-3 (b) was "rules ∪ AI, any rule": the false flags came from AI-only
signals outside the chosen family and from paraphrased evidence; S1 and S2 target exactly those two sources.

## 2. Locked set (to collect; not collected yet)

- `~/LENSIQ-field/product-check/texts-fresh-4/`: about 400 public-page quotes (L53 terms: internal measurement only,
  never redistributed or used for training, source and licence per row), target 240 over-claim / 160 compliant,
  Thai ≥ 120, Chinese ≥ 100, categories drug / supplement / food / herbal / cosmetic, no source above 50 % of a cell,
  no text already in P3, fresh, fresh-2 or fresh-3 (exact and near-duplicate check).
- Two blind AI labellers (same rule list and instructions as fresh-3), κ reported.
- Files and hashes in `~/LENSIQ-field/evals/adverts/fresh4/` and `evals-locks/adverts-fresh4.sha256` committed BEFORE any
  scoring (owner rule 2026-11-13); then one run per variant and model; the set is spent.

## 3. Scoring rule (fixed now, as fresh-3)

Over-claim = both labellers flagged; compliant = both empty; disagreements apart. Released mode (type chosen). Per model
and variant, with 95 % Wilson intervals: recall (≥ 1 signal on over-claim texts), false flags per 100 compliant texts and
share of compliant texts flagged, rule-id precision / recall vs consensus, by language and category. Rules alone are
scored on the same set as the baseline. Targets: false flags ≤ 5 per 100 compliant AND recall ≥ 80 % AND rule-id precision
≥ 80 %. `pc_claims` stays off unless one variant meets all three; Chinese keeps "limited support" unless its subgroup
meets them too.

## 4. Cost estimate (measured per-text cost on fresh-3, prompt B)

| Model | Fresh-3 spend (967 texts) | Per 400 texts | S1 + S2 (2 x 400) |
|---|---|---|---|
| gpt-6-luna | 0.186 USD | 0.08 | 0.15 |
| claude-haiku-5.5 | 0.290 USD | 0.12 | 0.24 |
| gpt-6.1-terra | 1.281 USD | 0.53 | 1.06 |
| **All three** | | | **1.45 (≈ 1.8 with a 20 % margin)** |

S1 sends only texts on which the rules fired (about 60 % of over-claim and 2 % of compliant texts on fresh-3), so its
real cost is lower. Labelling and collecting are agent work (no paid API).

## 5. Owner decision needed

Run the scoped round? Options: (ก) all three models, ≈ 1.8 USD cap; (ข) Haiku only, ≈ 0.3 USD cap (it is the default
`pc_claims` model); (ค) not now. Recommendation: ข (cheapest, the model the page would use). Without an answer nothing is
spent; the set can still be collected and locked so the run is ready.
