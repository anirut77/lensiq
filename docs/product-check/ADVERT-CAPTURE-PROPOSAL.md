# Product Check: "advert" capture type for the AI claims check (proposal, design only)

> Update 2026-11-11: the owner approved **option B** (approved work list item 4); it is built, on-device only, see
> `ADVERT-RESULTS.md`. Option A (AI for adverts) is not built and still waits for counsel (§7).
>
> Status: **proposal for an owner decision. Nothing here is built.** Written 2026-11-10 after the product-label
> evidence filter (P7-RESULTS §3.4). Numbers: P7-RESULTS §3.6, source **public dataset, labelled by two AI agents,
> pharmacist adjudication pending**.

## สรุปสำหรับเจ้าของ (Thai summary)

- **ปัญหา:** ตัวกรอง "ต้องเป็นฉลากสินค้า" ทำให้ข้อความโฆษณา (โพสต์โซเชียล ใบปลิว หน้าร้านออนไลน์) ไม่ถูกส่งให้ AI ตรวจคำโฆษณาเกินจริง
  - ชุด P3 (held-out 264 ข้อความ): ผ่านตัวกรอง 6.1 % ข้อความที่มีคำโฆษณาเกินจริงผ่านเพียง 2.1 % (3 จาก 141)
  - โฆษณาจึงได้แค่กฎในเครื่อง ซึ่ง recall 65.9 % (เป้า 80 %)
- **ข้อเสนอ:** เพิ่มประเภทการถ่าย "โฆษณา" แยกจาก "ฉลาก" ผู้ใช้เลือกเอง มีกฎความเป็นส่วนตัวของตัวเอง
  - บังคับครอบภาพให้เหลือเฉพาะตัวโฆษณา ตัดคอมเมนต์ แชต และโปรไฟล์ออก
  - ส่งเฉพาะข้อความที่อ่านในเครื่อง ไม่ส่งภาพโฆษณาเลย
  - ลบชื่อคน ชื่อบัญชี เบอร์โทร LINE ID ลิงก์ และชื่อร้านก่อนส่ง
  - ผลลัพธ์พูดถึง "ข้อความ" เท่านั้น ไม่พูดถึงผู้ขาย
- **ทางเลือกที่ปลอดภัยกว่า:** โฆษณาใช้กฎในเครื่องอย่างเดียว ไม่ส่งอะไรออก แล้วปรับกฎให้ recall สูงขึ้น (ไม่มีความเสี่ยงข้อมูลบุคคลที่สาม)
- **ความเสี่ยงหลัก:** หมิ่นประมาทผู้ขาย ข้อมูลส่วนบุคคลของบุคคลที่สาม (PDPA) ทนายต้องตรวจก่อนสร้าง
- **ขนาดงาน:** ทางเลือก A (AI สำหรับโฆษณา) = L, ทางเลือก B (ในเครื่องอย่างเดียว) = M, ชุดทดสอบ = M
- **ที่ขอให้ตัดสิน:** A, B หรือ B ก่อนแล้วค่อย A หลังทนายตอบ (ผมแนะนำแบบหลัง)

## 1. The gap, in numbers

| Measure (P3 claim texts) | Dev | Held-out |
|---|---|---|
| Texts that pass the product-label filter as they are | 19/270 = 7.0 % [4.6, 10.7] | 16/264 = 6.1 % [3.8, 9.6] |
| Violating texts that pass | 4/147 = 2.7 % [1.1, 6.8] | 3/141 = 2.1 % [0.7, 6.1] |
| On-device recall on the refused texts (vs agent A) | 94.7 % (tuned on) | 147/223 = 65.9 % [59.5, 71.8] |

The filter was built to stop personal documents (shipping labels, certificates) from reaching a provider, and it does
that by asking for product-label evidence. Advert wording has none, so the AI claims check is off exactly where most
over-claims are. The filter itself should not be loosened: it is the layer that closed 30 of the 32 leaks of the v5
guard run.

## 2. Proposal A: an "advert" capture type with its own rules

**Entry.** A second, explicit choice next to "label": "โฆษณา / โพสต์ / หน้าร้าน" (advert, post, shop page). The user
picks it; the app never guesses that a capture is an advert. Only `pc_claims` is offered for it (no `pc_fields`, no
`pc_translate`, no official lookups, no registration verdicts).

**Flow, all on the device before anything is asked:**

1. **Crop to the advert (mandatory).** The user drags a box around the advert body. Everything outside is discarded
   before OCR. The screen says: leave out comments, chats, profile headers and other people's names.
2. **OCR on the device**, text mode only. **The advert image is never sent** (no image mode for this type: a
   screenshot is full of faces, avatars and handles, and blur recall is not good enough to rely on).
3. **Advert guard** (new rule set on top of `LQPCGuard`; the existing name / phone / ID / e-mail / address rules stay):
   - removes: person names and social handles (`@name`, profile-name lines, "ตอบกลับ", "replied", 回复), **every**
     phone number and LINE ID (for adverts `companyPhones` is forced to "remove": a seller's phone is often a private
     person's), URLs and shop links, QR / PromptPay numbers, bank account numbers, order and tracking numbers;
   - removes the **seller or shop name** when it can be recognised (page-name line, "ร้าน…", "by …"): the model does
     not need it, and without it the answer cannot be about a named seller;
   - **refuses the capture** (no consent screen, on-device results stay) when it looks like a conversation or comment
     thread: chat-bubble layout cues in OCR (timestamps per line, "อ่านแล้ว", "Seen", "Delivered", 已读), reply /
     like / share counters, more than N short lines that each start with a name, or a customer review block
     ("รีวิวจากลูกค้า" followed by names).
4. **Advert evidence instead of label evidence**: at least two advert cue types (price / promotion wording, order call
   to action, product-category word, claim wording) and **no personal-document sign of the existing list except the
   selling words** (delivery, COD and "order" are normal in adverts; recipient / sender blocks, tracking numbers,
   receipts, certificates and letters still veto).
5. **Mandatory preview** of the exact text, as today, with removed parts shown as `[removed]` and possible names
   underlined. Typed additions are dropped (provenance, unchanged).
6. **Separate consent** (see §4), then `POST /v1/ai/pc_claims` with `capture: "advert"`.

**Never sent, in any case:** the image; faces or profile photos; names of commenters, customers, reviewers or
endorsers; the seller's or shop's name, handle, phone, LINE ID, address, URL or QR; chat or comment text; the page URL
the screenshot came from; location or time of the capture.

**What the result may say.** Same as today: a risk signal per rule with the evidence span, "according to the listed
rules, not a legal finding". For adverts, additionally: the card names **the wording**, never the seller; no share
button that includes the seller's name or the original screenshot; no "report this seller" action; no stored history
of adverts by seller. Endorsement rules (D07, F14, H04, C04) are reported as "an endorsement is cited", never with the
endorser's name.

## 3. What the Worker can and cannot verify

| Check | Server-side? |
|---|---|
| Name / phone / ID / e-mail guard on the text received (same module) | yes |
| Advert guard rules (handles, URLs, LINE IDs, shop-name lines, conversation signs) | yes, on the text |
| `capture: "advert"` only for `pc_claims`, text mode only; an image with it is refused | yes |
| Separate rate limit and monthly budget for advert requests | yes |
| A dispensing label sent as an "advert" is refused | yes |
| That the user really cropped to the advert | **no** (client only) |
| That the text is OCR of the capture, not typed (provenance) | **no** (client only) |
| That a remaining word is a person's name rather than a brand | **no** (rule guard recall on names is 62 to 76 % on independent synthetic sets) |

The honest reading: an "advert" route is a second, wider door through the filter. A user (or a script) can label any
text an advert. The server therefore has to apply the **stricter** guard on that route and refuse on any personal-data
hit instead of trusting client redaction.

## 4. Consent wording: what differs from the label consent

- States that the capture is **an advert that may show other people**: "ครอบเฉพาะตัวโฆษณา อย่าให้มีคอมเมนต์ แชต หรือชื่อคนอื่น"
  (crop to the advert only; no comments, chats or other people's names).
- States that names, accounts, phone numbers, LINE IDs, links and the shop name are removed before sending and that the
  image is never sent.
- States that the result is about the wording, is not a finding against any seller, and must not be published as one.
- **Not remembered by default** ("remember my choice" off for this type, or remembered separately from the label
  consent), because each advert capture carries a fresh third-party risk.
- Complete in Thai, English and Chinese, as every user-facing text.

## 5. Measurement plan (fixed set before any build)

1. **Advert guard set (synthetic), about 400 items**, written by an agent that does not see the guard: adverts with
   seeded third-party data (commenter names, handles, phones, LINE IDs, shop names, chat screenshots, review blocks)
   in Thai, English and Chinese, plus clean adverts. Locked in `~/LENSIQ-field/evals/advert/`, sha256 recorded in the
   repo before scoring. Targets to propose: **0** conversation / comment captures reaching the consent screen;
   third-party identifiers left in the sent text **under 1 %** of seeded items; clean adverts refused under 10 %.
2. **Claims set**: the P3 texts are already advert-like, but the held-out half has now been sent to providers. A
   **fresh split** (new texts from the same public sources, two AI labellers, pharmacist adjudication) is needed for
   the recall number: on-device alone vs on-device + AI, target 80 % recall, false flags per 100 compliant texts.
3. **Screenshot set (field)**: 50 to 100 real screenshots collected by the owner (kept outside the repo, never
   committed) to measure the crop step and OCR on real layouts. Source stated as "field".
4. An independent reviewer agent re-measures each number. Budget for the paid part: about 300 texts x the models kept
   after P8, inside the 10 USD per-model cap.

## 6. Effort

| Item | Size | Owner dependency |
|---|---|---|
| A1. Capture type, crop step, advert guard rules, advert evidence, preview, consent (TH / EN / ZH) | **L** | counsel's answers (§7), consent wording approval |
| A2. Worker: `capture: "advert"` route rules, stricter guard, separate limits and budget, tests | **M** | none |
| A3. Fixed sets (guard set, fresh claims split) and independent measurement | **M** | pharmacist adjudication; paid-run budget |
| A4. Field screenshot set | **S** for us | owner collects 50 to 100 screenshots |
| B. On-device-only adverts (below) | **M** | pharmacist adjudication of the missed rules |

## 7. Risks

1. **Defamation of sellers.** A "risk signal" shown next to a recognisable seller, then shared, can be read as an
   accusation. Mitigations: seller name removed before sending and absent from the card; wording about the text only;
   no sharing with the seller's identity; "not a legal finding" on every card. Residual: the user still holds the
   screenshot and can combine the two outside the app. **Counsel must review before build.**
2. **Personal data of third parties (PDPA).** Commenters, customers in reviews and individual sellers did not consent.
   The user is the one disclosing, but we would be processing and sending it to a provider abroad. Rule-based name
   removal is not reliable (62 to 76 % recall on independent sets), and Thai nicknames and shop names overlap with
   ordinary words. Lawful basis, the role of the user, and cross-border transfer need counsel's answer. Added to
   `docs/PDPA-NOTES-FOR-COUNSEL.md` F6 (f).
3. **A wider door through the filter.** Anything can be labelled an advert; the personal-document leaks the filter
   closed could come back through this route. Mitigation: stricter server guard, refusal on conversation signs, text
   only, separate budget. This must be measured on the v5-style document set as well (target: 0 documents sent).
4. **Sensitive content in adverts.** Before / after photos and testimonials can reveal a person's health condition
   (sensitive data under PDPA s.26). Text only and review-block refusal reduce it; they do not remove it.
5. **False confidence.** Users may treat "no signal" as "the advert is legal". The card must keep saying it is not.
6. **Platform terms.** Screenshots of social platforms stay on the device; only extracted text would leave. No
   scraping, no URL fetch.
7. **Cost and abuse.** Advert text is free-form and long; a separate rate limit and budget are needed.

## 8. Alternative B: adverts stay on the device

The "advert" capture type is added, but it runs **only the on-device rules** (`LQClaims`): nothing is asked, nothing is
sent, no consent screen, no third-party data leaves the phone. The work goes into the rules instead:

- raise held-out recall from 65.9 % towards the 80 % target using the P3 dev misses and the P8 results (which rules
  the models find and the regexes miss), then measure once on a fresh held-out split;
- the crop step is still useful (cleaner OCR), and the conversation refusal is not needed;
- risks 1 to 4 above mostly disappear (the card still must not name the seller).

Cost: recall stays bounded by what wording rules can express (paraphrase, images of text, new slang).

## 9. Recommendation

**B first, A only after counsel answers §7.1 and §7.2.** B closes part of the gap with no new data flow and gives the
fresh split that A needs anyway. A is worth building only if (i) P8 shows a real uplift of AI over the on-device rules
on advert text, and (ii) the advert guard meets its targets on an independent locked set.

Decisions asked of the owner: A, B, or B then A; whether individual sellers' shop names are always removed; whether
the advert consent is ever remembered.
