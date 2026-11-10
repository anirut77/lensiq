# Fortune remedies, lucky items and "merit on your behalf": design

> **Status: DESIGN ONLY, waiting for owner approval. Nothing is built.** Build order: third, after Product Check,
> Nutrition and Try-On. Written 2026-11-10 from the current code (`fortune-ai.js`, `lifecal*.js`, `horoscope*.js`,
> `zodiac*.js`, `numbers*.js`, `tarot*.js`, `iching*.js`, `faceread*.js`, `palm*.js`, `fengshui*.js`,
> `lensiq-luckycolor.js`, `lensiq-planner.js`, `report.js`, `dream.js`, `astro.js`, `admin.js`, `backend/src/auth.js`,
> `backend/src/receipt.js`, migrations 0001–0010) and one web research pass (accessed 2026-11-10).
> This is not legal or tax advice. Every legal point is a **risk signal** for counsel to check, not a finding.
> Labels: **[PRIMARY]** = law text or government site; **[SECONDARY]** = press, blog, commerce or law-firm summary;
> **[UNVERIFIED]** = not confirmed. Belief content is tradition, not fact, and Thai sources often disagree.

> **Owner approval (2026-11-10):** design approved. Donations are paid directly to the temple's e-Donation QR (route D1
> only). The Direct Sales and Direct Marketing Act and the Fundraising Control Act questions are on the legal list as
> "must answer before charging" (CTO-BRIEF §8 L42, L43). Merit MVP = curated place, remedy and lucky-item database with
> admin editing; no paid service yet.
>
> **Shared back-office (cross-doc note, 2026-11-10).** All four new designs (Nutrition, Try-On, Merit, Style) use ONE
> admin area, `backoffice.html`, built once in Nutrition **N3** (first in build order): roles owner / admin / editor,
> per-person audit log, image upload with size limits + automatic face blur (Product Check `faceBlur`) + person check,
> TH / EN / ZH, phone layout. Try-On T2, Merit M1 and Style S5 then only add their own sections, so their effort drops
> (T2 L→M, M1 M→S, S5 L→M). **BO-1 decided (owner, 2026-11-10):** do not wait for org accounts. Phase 1 back-office uses the existing
> platform admin login (owner with mandatory TOTP, plus admin and editor roles); merchant self-service login moves to
> org accounts later.

## สรุปสำหรับเจ้าของ (Thai summary)

- **สิ่งที่จะสร้าง** มี 3 ส่วน
  1. **คำแนะนำตามความเชื่อ (ฟรี):** สถานที่ทำบุญหรือไหว้ขอพร วิธีแก้ชง และของมงคล (สี พลอย กำไล วัตถุฮวงจุ้ย ของสำหรับบ้าน รถ ร้าน)
     - ทุกข้อผูกกับผลดวงที่ระบบคำนวณอยู่แล้ว และบอกว่ามาจากศาสตร์ใดและผลข้อใด
     - ทุกข้อมีลิงก์แหล่งที่มา เขียนใหม่ด้วยคำของเราเอง ไม่คัดลอก
     - ทุกข้อติดป้าย "ตามความเชื่อ โปรดใช้วิจารณญาณ"
     - ไม่มีปุ่มซื้อ และไม่ผูกกับการจ่ายเงินใด ๆ
  2. **หลังบ้าน (admin):** เพิ่ม แก้ไข ซ่อน และลบสถานที่ วิธีแก้ และของมงคลได้
     - ผูกแต่ละรายการกับผลดวง
     - แก้ข้อความได้ 3 ภาษา ใส่รูป พิกัด เวลาเปิด รายการของถวาย และลิงก์แหล่งที่มา
     - ตั้งวันทบทวน และมีประวัติการแก้ไขทุกครั้ง
     - มีบทบาท owner, admin, editor และใช้บนมือถือได้
  3. **บริการ "ทำบุญแทน" (เสียเงิน):** ผู้ใช้จ้างทีมงานไปทำบุญหรือถวายของแทน
     - ค่าบริการ (ค่าแรง ค่าเดินทาง ค่าถ่ายรูปและวิดีโอยืนยัน) **แยกบรรทัดชัดเจน**จากเงินทำบุญและค่าของถวาย
     - เงินทำบุญและค่าของถวายส่งต่อครบทุกบาท พร้อมหลักฐานและใบเสร็จ
- **กฎที่ใช้:** CLAUDE.md "Remedies and merit" ซึ่งเจ้าของตัดสินใจเมื่อ 10 พ.ย. 2569 แทนกฎเดิม "no paid remedies"
  - ไม่ขายผลลัพธ์ ไม่ขายการแก้ดวง และไม่มีถ้อยคำทำนองว่า "จ่ายแล้วดวงดีขึ้น"
  - ถ้าตาข่ายวิกฤตทำงาน จะแสดงสายด่วน 1323 แทน และไม่เสนอบริการที่ต้องจ่ายเงิน
- **ทำในเครื่อง:**
  - การจับคู่ผลดวงกับคำแนะนำทำในเครื่องทั้งหมด ผลดวงไม่ออกจากเครื่อง
  - ข้อมูลออกจากเครื่องเฉพาะตอนจองบริการ และส่งเฉพาะที่จำเป็น (ชื่อ และวันเกิดถ้าพิธีต้องใช้)
  - รูปยืนยันเป็นรูปทีมงานและของถวายเท่านั้น ไม่มีรูปลูกค้า คนอื่นในภาพถูกเบลอ และคนตรวจซ้ำก่อนส่ง
- **ขั้นงาน:** M0–M7 รวมขนาดราว L–XL
  - ส่วนเนื้อหาฟรี (M0–M5) ใช้ได้ก่อน
  - บริการทำบุญแทน (M6–M7) สร้างเพื่อทดสอบได้ แต่**ห้ามเก็บเงินจริง**จนกว่าทนายตอบข้อ L-M1 ถึง L-M16
- **ความเสี่ยงหลัก:**
  - กฎหมายขายตรงและตลาดแบบตรง (ต้องจดทะเบียนกับ สคบ. หรือไม่)
  - พ.ร.บ.ควบคุมการเรี่ยไร
  - ร่างประกาศ สคบ. เรื่องโฆษณาวัตถุมงคล
  - การลดหย่อนภาษีเงินบริจาค (ตั้งแต่ 1 ม.ค. 2569 ต้องผ่าน e-Donation)
  - ทีมงานยักยอกเงิน
  - ระบบเบลอหน้าพลาดราว 39% (จึงต้องมีคนตรวจทุกรูป)
- **สิ่งที่เจ้าของต้องเตรียม:**
  - ค่าบริการ จังหวัดที่ให้บริการ และทีมงาน
  - บัญชีธนาคารแยกสำหรับเงินทำบุญ
  - ผู้ตรวจเนื้อหาที่รู้ศาสตร์
  - ทนายและนักบัญชี
  - รูปถ่ายสถานที่ที่ถ่ายเอง

---

## 1. Rule basis

This design follows the CLAUDE.md standing rule **"Remedies and merit"** (owner decision 2026-11-10), which replaces the
earlier Fortune hard ban "no paid remedies". In this doc:

| Rule | Where it is enforced in this design |
|---|---|
| Never sell a remedy, a change of fortune or any outcome. No "pay and your luck improves" or "guaranteed to fix ชง" | §7.1 wording lint `merit-safety` (TH/EN/ZH) on every text; booking pages state "the service is staff time, not a result"; §8 T5 |
| The paid service charges only for staff time, travel and photo/video proof. The donation or offering amount is shown separately, passed on in full, with proof and a receipt | §6.2 three-bucket price, separate pass-through ledger, §6.3 proof, §6.4 receipts |
| Recommendations are free information, labelled "according to belief, please use your own judgement", and never tied to a purchase | §2.2 panel has no price and no booking button; lucky items have no buy link; §7.1 |
| Never offer the paid service when the crisis net triggers; show help resources instead | §7.2, measured at 100 % in §8 T3 |

The other Fortune hard bans are unchanged: no predictions of death, illness, accident, disaster or infidelity; no lottery
numbers; no medical or cosmetic advice. The existing reading-text lint in `fortune-ai.js` stays exactly as it is:
- `REMEDY_UNSAFE_*` (lines 1400–1402) blocks บูชา, เครื่องราง, buying and ritual words inside readings.
- `UNSAFE_TH.paid` (line 401) blocks paid แก้ชง wording.

So the reading text itself never mentions merit places, items or the service. The new content lives in a **separate panel
with its own lint** (§2.2, §7.1). No existing test is loosened.

---

## 2. User flow

### 2.1 Free recommendations (on device)

1. The user gets a reading on any fortune page, exactly as today.
2. Under the reading, a new collapsible panel opens: **"สิ่งที่ทำได้ตามความเชื่อ / What believers do / 按习俗可以做的事"**.
   It is rendered by a new module, `lensiq-merit.js`, and never goes through the `FortuneAI` composer.
3. The panel lists up to 3 cards per type: **Places**, **ชง** (only when the zodiac or horoscope result is a clash
   relation), and **Lucky items**. Each card shows:
   - **Because:** the discipline and the result, e.g. "ทักษา: ศรีของคุณคือดาวพฤหัส (ผลข้อ `tk.sri.5`)" or
     "ปีนักษัตร: ปีมะเมีย 2569 ชงกับปีเกิดของคุณ (ชวด, ชงเต็ม)".
   - **What believers do:** a paraphrase, with where and when for items, and what to offer and how for places.
   - **Source:** 1–3 links, with publisher and access date.
   - The label "ตามความเชื่อ โปรดใช้วิจารณญาณ · According to belief, please use your own judgement · 依据民间信仰，请自行判断".
   - A footer: "ไม่มีสิ่งใดรับประกันผล". There is no price, no buy link and no booking button.
4. Tapping a place opens its detail view (`merit.html#place=<slug>`). It shows the map link, opening hours, the offering
   list, how to pay respects, photo rules at the site, source links and the "updated" date.
   - The view leads with "ไปเองได้" (how to go yourself).
   - Below a divider, a neutral text link reads: "ไม่สะดวกไปเอง: บริการทีมงานไปแทน (ค่าบริการแยกจากเงินทำบุญ)". It is
     hidden when the crisis state is set (§7.2) or when the place has no staff coverage.
5. A hub page, `merit.html`, sits in category 6 (Fortune) and also lists everything without a reading:
   - by purpose (work, study, trade, family harmony, peace of mind, birthday merit, dedication to ancestors, ชง
     observance);
   - by province;
   - by birth weekday (พระประจำวันเกิด).

Matching runs on the device against a published, versioned content bundle (`vendor/merit/merit-<ver>.json`, §3.4). No
reading result leaves the device.

### 2.2 Placement rules

- The panel is never inside the reading text. The reading lint scope is unchanged.
- Recommendations are never ranked by whether a paid option exists.
- At most one place card per reading shows a "staff can go" badge. The badge is informational and is not a button.
- In customer (B2B) builds, the panel follows the Fortune page config. The service link is off unless
  `window.LENSIQ_MERIT_SERVICE === true`, which is the default only in the consumer build after counsel.

### 2.3 "Merit on your behalf" booking (paid; test mode until counsel)

1. **Entry:** from the place detail view or the service page `merit-service.html`. Never from the reading panel.
2. **Gate checks, in this order:**
   1. The crisis state is not set (§7.2).
   2. The user confirms they are 20 or older, or have guardian consent (same wording as `terms.html` §7).
   3. The user is signed in (Google member account, existing).
   4. The province has staff coverage on the chosen dates.
3. **Choose:**
   - the place;
   - the service type:
     - `offering`: ถวายของ / ไหว้;
     - `sanghathan`: ถวายสังฆทาน;
     - `chong`: ฝากดวงแก้ชง at a shrine that offers it;
     - `vow_repay`: แก้บน for a vow the user already made. User-initiated only; we never suggest making a vow.
   - the date window;
   - the offering set from that place's admin-maintained list, at cost.
4. **Who it is for:** the booker, or a named other person ("I have their permission").
   - Default fields: first name and birth weekday only.
   - The birth date and time are asked **only** when the service type needs them (ฝากดวง paper), with the reason
     shown.
5. **Dedication text (optional):** one preset purpose (the same purpose list as §2.1), plus an optional note of at most
   200 characters.
   - The note is crisis-checked on the device and again on the server (§7.2).
   - It is shown to staff verbatim.
   - The `merit-safety` lint does not apply to the user's own words, but health, lottery and harm wording opens a gentle
     notice. Staff read the words as given; we make no claim about them.
6. **Price screen (§6.2):** three separate lines:
   1. service fee (our revenue);
   2. offering items at cost;
   3. donation (pass-through, amount chosen by the user, may be 0).

   The screen also shows the total, the refund policy (§6.6), what proof is delivered, and the sentence "ค่าบริการคือค่า
   เวลาเดินทางและหลักฐานของทีมงาน ไม่ใช่ค่าผลลัพธ์ ไม่มีการรับประกันผลใด ๆ". The user ticks "accept terms" (as
   `pricing.html` does today).
7. **Pay:** PromptPay through Opn (existing billing code). Donations can also take donation route D1 (§6.2): the user pays
   the temple's own e-Donation QR directly.
8. **Tracking:** booked → assigned → on the way → done (proof uploaded) → proof released → closed. The user gets e-mail
   updates (existing `mail.js`).
9. **Proof:** 3–6 photos and an optional video of at most 30 s with audio off by default, after face blur and a human
   check (§6.3). Receipts: our receipt for the service fee, the shop receipt photo for the offering items, and the temple
   receipt or e-Donation reference for the donation (§6.4).
10. **Problems:** the user can report a problem and request a refund from the order page (§6.6).

---

## 3. Data model

D1 (Cloudflare, staging), migration `00xx_merit.sql`. Images go to R2. All text columns are JSON `{th, en, zh}` and must
be complete in all three languages before an entity can be published.

### 3.1 Content

```
merit_places        id, slug, kind (temple|shrine|sacred_site|chinese_shrine|hindu_shrine), name{th,en,zh},
                    province_code (ISO 3166-2:TH), district, lat, lng, map_url, opening_hours{json per weekday + notes},
                    how_to{th,en,zh}, offerings[{item{th,en,zh}, qty, est_cost_satang, where_to_buy}],
                    photo_rules{th,en,zh}, purposes[] (enum §5.3), deity_or_image{th,en,zh},
                    status (draft|review|published|hidden), updated_at, review_due_at, created_by, updated_by
merit_remedies      id, kind (chong|birthday_merit|sanghathan|pray|habit_link), title{..}, steps{..},
                    when{..} (e.g. after Chinese New Year), place_ids[], status, updated_at, review_due_at
merit_items         id, kind (colour|gemstone|amulet|bracelet|fengshui_object|plant|home|car|shop),
                    name{..}, placement{..} (where), timing{..} (when), avoid{..}, status, updated_at, review_due_at
                    -- no price column, no vendor column, no buy URL (rule: never tied to a purchase)
merit_mappings      id, target_type (place|remedy|item), target_id, discipline (enum §3.2), result_key (pattern §3.2),
                    match (exact|prefix|set), condition{json: tone?, year?, topic?}, priority, rationale{..},
                    source_ids[]   -- every mapping cites at least one source for the belief link itself
merit_sources       id, url, publisher, title, accessed_at, kind (primary|secondary|book|interview),
                    lang, paraphrase_note, alive_checked_at, alive_ok
merit_entity_sources entity_type, entity_id, source_id, supports (which field)
merit_media         id, entity_type, entity_id, r2_key, w, h, bytes, credit, licence, taken_by, taken_at,
                    face_blur{auto_regions, reviewed_by, reviewed_at}, status
merit_revisions     id, entity_type, entity_id, actor_id, actor_role, ts, action (create|edit|hide|unhide|delete|
                    publish|map|unmap), diff (JSON patch, <= 8 KB), reason
merit_bundles       version, built_at, built_by, entity_count, sha256, r2_key   -- the published on-device bundle
```

- **Delete** is a soft delete: `status = deleted`, kept for 90 days, then purged. The revision row stays.
- **Hide** removes the entity from the next bundle.

### 3.2 Mapping to discipline results

There is one normalised key space. The keys are the item ids the engines already emit (inventory below).
`lensiq-merit.js` normalises two known inconsistencies before matching:
- Planet numbering: `lifecal.js` uses 1..8 (Sun = 1, Rahu = 8), while `horoscope.js`, the planner and luckycolor use
  0..7.
- Bhumi name: `lifecal.js` uses `det`, while `horoscope.js` uses `dech`.

| Discipline (`discipline`) | Page | Result keys a mapping can use (existing ids) | Natural hook |
|---|---|---|---|
| `taksa` ทักษา | taksa, report, horoscope | `tk.<bhumi>.<planet>` (boriwan, ayu, det, sri, mula, utsaha, montri, kalakini), `maha.<p>.<bhumi>`, `today.bhumi.<bhumi>`, `thai.day.<0-7>` | colour of ศรี/เดช planet; กาลกิณี colour to avoid; พระประจำวันเกิด; นพเก้า stone per planet |
| `bazi` 八字 | bazi, report, horoscope | `dm.<0-9>`, `str.<strong\|balanced\|weak>`, `el.hi.<el>`, `el.lo.<el>`, `bazi.useful.<el>`, `bazi.lack.<el>`, `luck.<god>`, `facts.helpful[]` | useful element → colour, material, bracelet stone, direction |
| `zodiac` ปีนักษัตร / ชง | zodiac, report | `animal.<0-11>`, `rel.<clash\|same\|harm\|punish\|break\|harmony\|trine\|neutral>`, `el.<rel>`, `annual.lucky[]`, `annual.direction` | **ชง remedies**: `zodiac.js` `isChong()` (line 35) is true for clash, same, harm, punish and break |
| `horoscope` daily/monthly | horoscope | `today.clash`, `today.rel.<..>`, `month.rel.<..>`, `cn.year.<animal>.<el>` | day-level ชง notice (lighter: a reminder, not a ritual) |
| `lek7` เลข 7 ตัว | lek7 | `l7.<0-6>.<tone>` | birthday merit / sanghathan by house (care-type only; no item) |
| `numbers` เลขศาสตร์ | numbers | `pair.<NN>` (grade), `sum.<n>`, `kala`, birth weekday `sun..sat, wedn` | weekday colour; **never** "change your number" (existing `getrich` ban) |
| `fengshui` 風水 | fengshui | `kua.<1-9>`, group `east\|west`, `dir.<shengqi\|tianyi\|yannian\|fuwei>`, `dir.quiet`, `rec.<door\|desk\|bed>.<dir>`, `room.<room>.<dir>.s<star>`, `year.center.<n>` | feng shui objects and plants, placed by direction and room |
| `face` โหงวเฮ้ง | faceread | `element.<wood..water>`, `palace.<12>.<high\|mid\|low>`, `zone.<..>` | element colour and items only (no cosmetic advice) |
| `palm` ลายมือ | palm | `element.<earth\|air\|fire\|water>` (Western 4), `mount.<7>`, `bagua.<9>` | colour or gemstone by Western element; bagua → home area |
| `tarot` ไพ่ยิปซี | tarot | `card.<pos>.<cardId>[.r]` (m00..m21, suit01..14), card element (wands = fire, cups = water, swords = air, pentacles = earth) | colour or item by suit element; caution cards → a reflective place (quiet temple), never a "fix" |
| `siamsee` เซียมซี | tarot | `siamsee.<1-28>`, level | merit place of the kind where siamsee is drawn |
| `iching` 易經 | iching | `hex.<1-64>`, `tri.<lower\|upper>.<trigram>` | trigram → direction/element → item; caution hexagrams (3, 6, 12, 23, 29, 36, 39, 47) → reflective practice only |
| `astro` Western | astro | `sun.<0-11>`, `el.<4>`, `mode.<3>` | birthstone and colour by element |
| `dream` ทำนายฝัน | dream | `sym.<id>`, `theme.<12>`, `type.<4>` | merit or "ทำบุญอุทิศ" custom after certain dream themes (no fear framing) |
| `planner` ฤกษ์ | planner | reasons `phra` (วันพระ), `full`, `waxing`, `wd.<ev>.<wd>` | วันพระ → nearest place from the hub; colour of the day |
| `luckycolor` สีมงคล | luckycolor | goal `work\|money\|love\|support` → bhumi pair; colour family | colour items (clothing, phone case, car items) |
| `report` | report | reuses `bazi`, `taksa`, `lek7` and `zodiac` keys | no own keys |

Notes from the code inventory:
- `lifegraph` ids (`lg.*`) are not mapped in seed. They are summaries of the above.
- `FACE_CAUTION` (`fortune-ai.js` line 1362) checks `mouth.down`, which no engine produces. This is an existing small
  bug, logged and out of scope here.
- `numbers.js` `dailyEnergy` direction is pseudo-random, not traditional. **It is never mapped.**

### 3.3 Merit service

```
merit_staff         id, member_id (Google sub hash), display_name, phone_enc, provinces[], vetting{id_checked_at,
                    ref_checked_at, contract_signed_at, training_at}, status (applicant|active|paused|ended),
                    trust_score, created_at
merit_coverage      staff_id, province_code, weekdays[], max_jobs_per_day
merit_bookings      id, member_id, place_id, service_type, window_from, window_to, beneficiary{first_name,
                    birth_weekday, birth_date_enc?, birth_time_enc?, relation}, purpose, note_enc,
                    fee_satang, items_satang_est, donation_satang, donation_route (D1|D2), payment_id,
                    status (draft|paid|assigned|en_route|done|proof_review|proof_released|closed|cancelled|refunded|
                    disputed), crisis_blocked (bool, counts only), created_at, purge_after
merit_booking_items booking_id, item, qty, est_satang, actual_satang, shop_receipt_media_id
merit_jobs          id, booking_id, staff_id, assigned_by, assigned_at, started_at (geo-checked), done_at,
                    checklist{json}, sla_due_at
merit_proofs        id, job_id, media_id, kind (photo|video|temple_receipt|edonation_ref|shop_receipt),
                    auto_blur_regions, reviewed_by, reviewed_at, released_at
merit_passthrough   id, booking_id, kind (items|donation), amount_satang, paid_to (temple/shop name),
                    method (cash|temple_qr|edonation), reference, evidence_media_id, reconciled_by, reconciled_at
merit_incidents     id, booking_id, kind (no_show|closed_site|wrong_place|proof_rejected|complaint|fraud_flag),
                    detail, opened_by, resolved_by, outcome
```
- Refunds reuse the existing `refunds` table (0008), linked by `payment_id`.
- Amounts are integer satang, as in the existing billing code.
- `*_enc` fields are encrypted with the Worker secret (existing `crypto.js`).

### 3.4 Publish path

1. The admin presses **Publish**.
2. The Worker builds `merit-<ver>.json` from `status = published` rows: texts, mappings, source links, thumbnails as R2
   URLs.
3. The bundle is signed (sha256 in `merit_bundles`) and served statically.
4. The site caches the last bundle and works offline.
5. The repo ships a small seed bundle, so the site runs without the backend; it is built by a script from a reviewed JSON.

---

## 4. Admin back-office

### 4.1 Shared back-office foundation (applies to every back-office)

Today `admin.html` / `admin.js` is a **single-owner** console. `admin_users` holds the owner. The `audit_log.actor`
values are `owner|system|anonymous`. Password + TOTP, re-auth "sudo" window and trusted devices are in
`backend/src/auth.js`.

The shared requirement needs the following. If Product Check, Nutrition or Try-On builds this foundation first, Merit
reuses it and M1 shrinks to S.

| Need | Design |
|---|---|
| Roles | `owner` (everything, incl. roles, money, refunds, staff vetting), `admin` (content + bookings + job queue + proof release; refunds up to a cap set by the owner), `editor` (content only: create/edit/hide, submit for review; **cannot** publish, delete, see bookings, see personal data). Extend `admin_users` with `role`, `display_name`, `disabled`; an invite flow by the owner; TOTP required for every role |
| Re-auth | Existing sudo window for: publish, delete, refunds, staff vetting, role changes, revealing an encrypted field |
| Audit log | Add `actor_id` and `actor_role` to `audit_log`. Every write logs `{entity, id, action, diff hash}`. The full diff goes in `merit_revisions`. Owner can export as CSV |
| Images | Upload ≤ 8 MB, re-encoded on the device to ≤ 1,600 px long side and ≤ 400 KB WebP; EXIF (GPS) stripped; type-sniffed; face blur runs on the device before upload (the Product Check `prepareUpload` path, threshold 0.4 + tiles); a **human checks every image** before it can be published or released (the detector misses about 39 % of real faces in the public set: `docs/product-check/FACE-BLUR-RESULTS.md` §2.3, source: public dataset) |
| Languages | Admin UI strings TH/EN/ZH (`i18n/en-admin.js`, `zh-admin.js`); every content entity has TH/EN/ZH fields and a completeness meter; publish refuses an entity with an empty language |
| Phone screens | Single-column cards ≥ 360 px wide, 44 px touch targets, the job queue and proof review usable one-handed; staff use the same app in a `staff` view (job list, checklist, camera upload) |

### 4.2 Merit sections

- **Places / Remedies / Items:** list with filters (status, discipline, province, review due), then an edit form.
  - Text in TH/EN/ZH side by side.
  - Photos with a credit and licence field (required).
  - A map picker (lat/lng plus a map link, no embedded third-party map script).
  - Opening hours per weekday.
  - Offering list with estimated costs.
  - Source links (at least 1 required to submit; at least 2 recommended).
  - The "updated" date is set automatically on publish. The review reminder defaults to 180 days, or 365 days for items.
  - Actions: hide, unhide, delete (soft).
- **Mappings:** pick a discipline, then a result key from a picker fed by the key list in §3.2. The picker never takes
  free text, so typos are impossible. Each mapping also needs a condition, a priority, a rationale and source(s).
  A **preview** button renders the panel for a sample result.
- **Review queue:** editor submissions, items past `review_due_at`, and dead source links (weekly link check).
- **History:** per entity, from `merit_revisions` (who, when, what changed, reason), with a one-click revert that
  creates a new revision.
- **Bundles:** publish, see version history, roll back.
- **Service:** see §6.

---

## 5. Content sourcing method and seed size

### 5.1 Method

1. **Fixed list first.** The seed list below is fixed before research starts, so coverage is not shaped by what was easy
   to find.
2. **Sources:**
   - at least 1 per entry, preferably 2 that agree;
   - priority order: temple or shrine official page, government (e.g. Tourism Authority, National Office of Buddhism),
     major Thai media, then books;
   - commerce pages that sell offerings are allowed only as a second source, and only for facts (opening hours, what
     is sold).
3. **Paraphrase, never copy.** The editor writes in their own words.
   - An automatic copy check flags any run of 25 or more Thai characters or 8 or more English words identical to the
     stored source snapshot. Snapshots are kept outside the repo, for checking only.
   - Photos are taken by LENSIQ staff (licence: own) or have a clear commercial licence. No copied web images.
4. **Disagreement is shown, not hidden.** When sources disagree (e.g. weekday-to-stone, monthly colour lists), the entry
   says "ตำราต่างกัน" and cites both.
5. **Purpose filter.** Every place and remedy purpose is one of: work, study/exams, trade, family harmony, peace of mind,
   birthday merit, dedication to ancestors, ชง observance, gratitude.
   - Never recorded, even when sources say so: health or cure (e.g. วัดไร่ขิง "cures illness", [SECONDARY] Silpa-mag),
     lottery or numbers (ไอ้ไข่ is popular for this; we record work and trade only), fertility or children (Erawan "luck
     and children"; existing `pregnancy` ban), harm to others, love spells.
6. **Knowledgeable reviewer** signs off each discipline batch (§8 T1) before the first publish.

### 5.2 What the research found (examples for the seed; all to be re-checked by the editor)

| Topic | Paraphrase | Source |
|---|---|---|
| ปีชง 2569 (Horse) | Full clash ชวด; co-clash มะเมีย, เถาะ, ระกา; ฉลู lighter. Customs: pay respects to ไท้ส่วยเอี๊ย after Chinese New Year (17 Feb 2569), blood donation, releasing animals, visiting 9 temples | [SECONDARY] Thansettakij <https://www.thansettakij.com/general-news/651345>; Krungsri <https://www.krungsri.com/th/plearn-plearn/lifestyle/living/jinx-year-2026>; Thairath <https://www.thairath.co.th/lifestyle/life/2899290> |
| ปีชง 2570 (Goat) | Full clash ฉลู; co-clash commonly มะโรง, จอ, sometimes มะแม. **Inferred from the 2558 Goat-year articles; re-check when 2570 articles appear** | [SECONDARY] Thairath <https://www.thairath.co.th/news/local/472318>; KTC <https://www.ktc.co.th/article/knowledge/how-to-fix-brewing-year-2024> |
| ฝากดวง steps | Write name, birth date and time on red paper; pray to Tai Sui; place the offering set bought at the shrine; sweep the paper over the body; leave the paper for the shrine to burn at year end. **When done for someone else, the sweeping step is skipped** (matters for the proxy service) | [SECONDARY] KTC <https://www.ktc.co.th/article/travel-guide/thailand/chinese-temple> |
| แก้ชง places | วัดมังกรกมลาวาส (เล่งเน่ยยี่), วัดทิพยวารีวิหาร, วัดโพธิ์แมนคุณาราม, วัดกัลยาณมิตร, ศาลเจ้าพ่อเสือ, ศาลเจ้าแม่ทับทิม and others | same KTC page; เล่งเน่ยยี่ 2 **[UNVERIFIED]** |
| ศาลท้าวมหาพรหม | Basic set: incense, candle, marigold garlands, no meat; the four faces linked to different life areas (we keep work, honour, family; drop "children") | [SECONDARY] Thansettakij <https://www.thansettakij.com/lifestyle/546562>; Matichon <https://www.matichon.co.th/lifestyle/news_3661433> |
| พระพิฆเนศ (ห้วยขวาง, วัดแขก) | Sweets, milk, fruit, marigolds; prayed to for work and success | [SECONDARY] Khaosod <https://www.khaosod.co.th/special-stories/news_7873532>; Prachachat <https://www.prachachat.net/hilight-prachachat/news-1469592> |
| พระประจำวันเกิด and สังฆทาน | A Buddha posture per birth weekday; folk numbers of monks and item types per weekday. **Folk custom, not scripture**, said so in the entry | [SECONDARY] Sanook <https://www.sanook.com/horoscope/64749/>; Thairath <https://www.thairath.co.th/lifestyle/culture/2852724> |
| นพเก้า | Nine stones of the traditional ring; weekday or planet mapping differs between sources (show both) | [SECONDARY] Silpa-mag <https://www.silpa-mag.com/?p=161083>; stone-to-planet **[UNVERIFIED]** |
| สีมงคล / กาลกิณี | Monthly media lists disagree; the app's own `horoscope-kb.js` weekday colours stay the primary on-device basis, and media lists are cited as "another view" | [SECONDARY] Thairath <https://www.thairath.co.th/horoscope/belief/2911287> |
| Feng shui objects | Only general Thai home tips found (doors, bedroom). Placement rules for 貔貅, coins, water features and plants **[UNVERIFIED]**: research in M3 from Chinese-language and Thai books | [SECONDARY] KTC <https://www.ktc.co.th/article/knowledge/feng-shui-home-tips-atpb> |

**Code vs sources check (M3 task).**
- `zodiac.js` `relation()` gives, for Horse 2569: clash ชวด, same มะเมีย, harm ฉลู, break เถาะ. Thai media also list
  **ระกา**, which the code does not produce.
- The panel must cite the source per animal and must not claim the code's table is the only view.
- The reviewer decides whether ระกา is added as a "some sources" row. The relation code itself is not changed in this
  project.

### 5.3 Seed list size (fixed before research)

| Discipline / type | Seed entries | Mappings |
|---|---|---|
| Places (all disciplines) | 40: Bangkok 24, central 6, north 3, north-east 3, south 4; incl. 8 Chinese shrines for ชง, 8 พระประจำวันเกิด places, 4 Hindu shrines | via the rows below |
| `taksa` | 8 weekday-planet colour items + 8 กาลกิณี "avoid" notes + 9 นพเก้า stones + 8 พระประจำวันเกิด links | ≈ 40 |
| `bazi` | 5 elements × (colour, material, bracelet stone, direction, plant) = 25 items | ≈ 30 |
| `zodiac` ชง | 12 animals × 5 chong relations → 6 remedy entries (ฝากดวง, blood donation, release animals, 9 temples, quiet merit, day-level note) + 8 shrines | ≈ 70 (generated per year, reviewed yearly) |
| `horoscope` | 4 entries (day clash, month clash, bhumi day) | ≈ 12 |
| `lek7` | 7 houses × caution → 7 birthday-merit / sanghathan entries | 7 |
| `numbers` | 8 weekday colour items (shared with taksa) | 8 |
| `fengshui` | 9 directions × 2 objects + 6 rooms × 2 = 30 items | ≈ 50 |
| `face` / `palm` / `astro` | element-based: 5 + 4 + 4 colour/stone sets (shared items) | ≈ 20 |
| `tarot` / `siamsee` / `iching` | 4 suit elements + 8 trigrams → shared items; 6 reflective places | ≈ 40 |
| `dream` | 12 themes → 4 merit customs | 12 |
| `planner` / `luckycolor` | วันพระ hook + 4 goals × colour items (shared) | ≈ 10 |
| **Total** | **≈ 40 places, ≈ 30 remedies, ≈ 110 items** | **≈ 300** |

---

## 6. Merit service operations

### 6.1 Booking and capacity

- **Window.** Bookings need at least 48 h notice and a 3-day window. Staff pick a slot inside the window, and the user
  sees the planned date. Peak days (Chinese New Year, วันพระใหญ่, Ganesh Chaturthi) have their own cap.
- **Price changes.** Only places with `offerings[]` and an active `merit_coverage` row can be booked. If a place's
  details change after booking (closed, ritual price changed by more than 20 %), the user is asked to re-confirm or gets
  a full refund.

### 6.2 Fee and donation split (three buckets)

| Bucket | What | Whose money | Shown as |
|---|---|---|---|
| A. Service fee | Staff time, travel, photo/video proof, handling | LENSIQ revenue (VAT once registered) | "ค่าบริการ (ค่าเวลา ค่าเดินทาง ค่าหลักฐาน)" |
| B. Offering items | Flowers, incense, fruit, ฝากดวง set, eggs, สังฆทาน set | Pass-through at cost | "ค่าของถวาย (ตามจริง)", with an estimate up front and the actual amount with the shop receipt after; any difference above the estimate is absorbed by us; below the estimate is refunded |
| C. Donation | Money put in the temple box / given to the temple | Pass-through, **in full** | "เงินทำบุญ (ส่งต่อเต็มจำนวน)" |

**Donation routes**
- **D1 (recommended default).** The user pays the temple's own e-Donation / official QR from their own bank. The
  donation never passes through us, the receipt is in the user's name, and it is tax-deductible if the temple is a
  registered e-Donation unit.
  - From 1 Jan 2569, temple donations count for tax only through e-Donation. [SECONDARY] PPTV
    <https://www.pptvhd36.com/news/สังคม/254968>.
  - Donor portal: [PRIMARY] <https://epayapp.rd.go.th/rd-edonation/portal/for-donor>.
  - Deduction rule s.47(7): [PRIMARY] <https://rd.go.th/37411.html>.
- **D2.** We collect bucket C with the order and staff hand it over.
  - It is held in a **separate bank account** (not mixed with revenue) and reconciled per booking in `merit_passthrough`.
  - The user is told it is likely **not** tax-deductible, unless the temple records it under the user's ID in
    e-Donation. Whether an intermediary can do that is **[UNVERIFIED]** (L-M5).

**Fee level (owner sets; placeholder only).** For reference, one public service charges 99 THB per alms set plus 9 THB
for flowers ([SECONDARY] PPTV <https://www.pptvhd36.com/news/สังคม/142764>). A shop at วัดโสธร quotes per kit
([SECONDARY] Yellow Pages <https://www.yellowpages.co.th/lp/kaitom8>). A draft for discussion is a Bangkok single-site
fee of about 290–490 THB and other provinces by distance band. **Not researched enough to set; owner decision.**

**Rule.** Fee size never depends on the "power" of a place or ritual, only on time and distance.

### 6.3 Proof

- **Content.** Staff take 3–6 photos and an optional video of at most 30 s (audio off by default). Required shots:
  1. the site landmark or sign;
  2. the offering items laid out, with the booking code written on a card (no personal name on the card);
  3. the act (hands or offering placed);
  4. the donation route evidence: temple receipt, box photo with the amount, or e-Donation reference.
  - The staff member may appear. **Customers never appear**, and no customer photo is ever requested.
- **Faces.**
  - Before upload, face blur runs automatically on the staff device for everyone other than the staff member (monks,
    visitors). Because the detector misses faces, the staff app warns "หลีกเลี่ยงการถ่ายติดหน้าคนอื่น".
  - An admin reviews every proof item before release. They can blur by hand or reject.
  - Released proof is visible only to the booker. It is kept 90 days, then deleted. Shop and temple receipt images are
    kept with the financial record (§9).
- **Place rules.** Each place's `photo_rules` field is shown to staff on the job card. Where photos are not allowed (e.g.
  inside the Emerald Buddha ubosot; [SECONDARY] travel guide, official rule [UNVERIFIED]), proof is taken outside plus
  the receipt.
- **Integrity.** The job "started" and "done" steps record a coarse geo-check (within 500 m of the place, not stored after
  closing) and server time. Photos are taken in-app only, with no gallery upload, to prevent reused images. A perceptual
  hash flags duplicates across jobs.

### 6.4 Receipts

- **A. Service fee.** Our receipt or tax invoice from the existing `receipt.js`. The line description reads
  "ค่าบริการทีมงาน (ไม่รวมเงินทำบุญ)". VAT applies only when VAT-registered.
- **B. Offering items.** A photo of the shop receipt. Where the shop gives none, a staff-signed purchase note with an
  itemised list, which counts as weaker evidence and is flagged.
- **C. Donation.**
  - D1: the user's own e-Donation record.
  - D2: the temple's receipt (อนุโมทนาบัตร) made out in the user's name when the temple agrees, or in "LENSIQ on behalf
    of <first name>". We never issue a donation receipt ourselves.
- The order page shows all three, with a reconciliation line: collected C = handed-over C.

### 6.5 Staff coverage by province

- `merit_coverage` stores provinces, weekdays and a daily cap.
- **Launch scope:** Bangkok and nearby provinces only (owner decides). The hub shows uncovered places as "ข้อมูลเท่านั้น".
- **Assignment** prefers staff with a lower open-job count and higher trust. Same-day travel only; no overnight jobs in
  phase 1.

### 6.6 Refunds (draft; counsel L-M2, L-M15)

| Case | Refund |
|---|---|
| Cancelled by the user before assignment | 100 % |
| Cancelled after assignment, before travel | A + B + C minus items already bought (shown with receipt) |
| We could not do it (no staff, site closed, weather) | 100 %, or reschedule if the user picks it |
| Proof rejected by our own review and the job cannot be redone | 100 % |
| Done with released proof | No refund of A; B and C were passed on. A complaint goes to an incident review, and refund of A is at admin discretion up to a cap |
| Unhappy with "results" | Not a refund reason, because no result is sold. The terms say this plainly |
| Duplicate or erroneous payment | 100 % (existing policy) |

- **Mechanics** follow existing billing: bank transfer refunds for PromptPay, recorded in `refunds`, receipt stamped.
- The 7-day cancellation right under the Direct Sales and Direct Marketing Act, for a service already performed, is an
  open question for counsel (L-M2).

### 6.7 Admin job queue

The queue has columns: new (paid) → needs assignment → assigned → en route → done → proof review → released → closed,
plus exceptions (overdue SLA, incident, D2 not reconciled).

- Filters: province and date.
- Bulk-assign is limited to the owner and admins.
- **SLA:** proof released within 24 h of the job. Missing it raises an alert (existing `alerts.js`).
- Each booking shows only what staff need: first name, birth details only for ฝากดวง, purpose and note.
  - Encrypted fields open with re-auth, and each opening is logged.
  - After `closed` + 30 days, the beneficiary fields are purged.

### 6.8 Operations playbook (summary; full playbook written in M7)

1. **Daily.** Check the queue at 09:00, assign jobs, and confirm opening hours for today's places (phone or website).
2. **Before going.**
   - Staff read the job card: place rules, offering list, steps, dress code, photo rules.
   - Staff buy items at the listed shop or the temple shop and keep the receipt.
3. **At the site.**
   - Start the job (geo-check) and follow the steps in the card.
   - Say the dedication using the first name and the purpose as written. Never add promises.
   - For ฝากดวง, skip the steps the custom reserves for the person themselves (§5.2).
   - Make the donation per route and take the proof shots.
4. **After.** Upload in-app, hand over or record the money, and mark done.
5. **Admin review.** Check blur, check amounts against receipts, release, and close.
6. **Exceptions.**
   - Site closed: photo of the notice, then reschedule or refund.
   - Ritual or price changed: call the user.
   - Staff unwell: reassign.
   - Accident or incident on site: staff safety first, then incident report.
7. **Monthly.**
   - Reconcile the pass-through account against all D2 bookings, zero tolerance.
   - Spot-check 5 % of jobs by a second visit or a call to the temple office.
   - Review complaints.

### 6.9 Staff vetting

- Thai ID check, and two references.
- Criminal record check only with the applicant's written consent, if counsel confirms it is lawful (L-M11).
- A signed contract with a conduct code: no promises, no soliciting extra money, no photos of others, no personal use of
  user data.
- Training: one shadowed job, plus a quiz on the playbook and the safety rules.
- Probation: the first 10 jobs get a 100 % proof review plus 2 spot checks.
- Clothing: plain clothes and a name card on site. Staff present themselves as a helper, never as temple or monastic
  representatives.

### 6.10 Anti-fraud

| Threat | Measure |
|---|---|
| Staff keep the donation or inflate item costs | Prefer D1; D2 money in a separate account; receipts per booking; monthly reconciliation; 5 % spot checks; price bands per place (flag > 20 % over estimate); trust score |
| Fake or reused proof | In-app camera only; geo/time check; perceptual-hash duplicate flag; booking code card in shot |
| Scammers impersonating LENSIQ ("ทำบุญออนไลน์" scams; [SECONDARY] Bangkokbiznews <https://www.bangkokbiznews.com/news/news-update/1166355>, Thai PBS <https://www.thaipbs.or.th/news/content/325234>) | We only take payment in the signed-in order page (Opn); a public page states "we never ask you to transfer to a personal account"; a report channel |
| Users using the service to launder money or pay a third party | Donation cap per booking (owner sets, e.g. 5,000 THB) and per month; D2 only to listed places |
| Fake places | Only admin-published places can be booked; a place needs 2 sources and an admin visit or phone check before booking opens |
| Account takeover of staff or admin | TOTP for all roles; staff see only their assigned jobs; re-auth to reveal encrypted fields |

---

## 7. Safeguards

### 7.1 No promises, no ban-list content

- **New lint `merit-safety` (TH/EN/ZH).** It runs in unit tests on every bundle text and in the admin form before submit.
  - It reuses the reading bans: death, illness, accident, disaster, infidelity, lottery, medical or cosmetic advice,
    pregnancy, discrimination, certainty words ("แน่นอน", "การันตี", "รับประกัน"), get-rich.
  - It adds service-specific patterns: "ดวงดีขึ้นแน่", "แก้ชงได้ผล", "หายชง", "เสริมดวงทันที", "จ่าย…แล้ว…(ดี|รวย|หาย)",
    price words in recommendation texts, and buy links in items.
- **Fixed sentences.** Every recommendation renders "ตามความเชื่อ โปรดใช้วิจารณญาณ / According to belief, please use your
  own judgement / 依据民间信仰，请自行判断" and "ไม่มีสิ่งใดรับประกันผล". These are fixed strings, not editable per entry.
- **No product ties.** Lucky items have no price or vendor fields in the schema. Any future selling of items is a
  separate owner decision and a separate design.
- **The reading never references the panel**, so the existing `remedy-safety` and `paid` lints in `fortune-ai.js` stay
  exactly as they are.

### 7.2 Crisis net

- The crisis check reuses `FortuneAI.crisis.check` (`fortune-ai.js` lines 4046–4057, TH/EN/ZH).
- **Crisis state.** When any fortune page shows the support card (tarot or I Ching question, dream text, nickname, AI
  path), a session flag `lq-crisis-at` is set. The existing `lq-support-n` counter stays as is.
- **While the flag is younger than 24 h** (owner can change the window), the service is withheld:
  - the merit panel hides every "staff can go" badge and service link;
  - `merit-service.html` shows the support card (1323, 1669, 191, 1300) instead of the booking form.
- **Booking text fields** (beneficiary name, note) are checked on the device. A match shows the support card and stops
  the booking.
- **Server side.** The same regex set is ported to `backend/src/merit.js` as a shared module, with one source and a
  parity test. A match returns `403 support` with the card data, logs only a counter, and never stores the text.
- **Free recommendations.** The panel itself is also hidden while the flag is set: no merit or remedy content next to a
  support card.
- The card wording is still "pending-professional-review". That item is tracked as L-M14.

### 7.3 Minors

- The paid service needs a confirmed age of 20+ or guardian consent, matching `terms.html` §7 (counsel pending, L-M13).
- Bookings for a beneficiary under 20 are allowed only when the booker is the parent or guardian (ticked), and only with
  first name and birth weekday. Birth date and time are not collected for minors.
- Free recommendations stay available to all ages. There is no age gate on information, but no service link is shown to
  users who have not passed the age check.

### 7.4 Other

- Respect for religion. Each entry is reviewed for respectful wording (reviewer rubric, §8 T1). No ranking of deities or
  temples by "power".
- **Not fundraising.** We never solicit money for a temple. The service is an errand for the user (see L-M3).
- **No endorsement.** No temple or shrine name is used to imply endorsement, partnership or "official" status.

---

## 8. Measurement plan (fixed test sets, written before building)

All numbers are reported per condition. An independent reviewer agent re-measures every round. Source labels: **synthetic**
(generated inputs), **public** (web sources), **field** (pilot).

| Test | Fixed set | Metric | Target | Source |
|---|---|---|---|---|
| **T1 Mapping correctness** | 300 (result → recommendation) pairs, stratified: every discipline ≥ 15 pairs, every recommendation type, tones favourable/neutral/caution; built from synthetic inputs with the export tool pattern of `docs/FORTUNE-REVIEW.md` | A knowledgeable reviewer (Thai astrology + Chinese metaphysics; paid, like FORTUNE-REVIEW) rates each pair: *faithful to cited source* / *acceptable, sources differ* / *wrong*; also respectfulness 1–5 | wrong ≤ 3 %; per-discipline wrong ≤ 5 %; respect mean ≥ 4.0; 15 % double-rated, agreement ≥ 80 % | synthetic inputs, human review |
| **T2 Source integrity** | Every published entity and mapping | ≥ 1 source each; link alive; copy check (§5.1) | 100 % sourced; 0 copy-check hits; dead links fixed within 14 days | automated |
| **T3 Crisis gate** | (a) the existing crisis phrase sets in `tests/unit/fortune-claims-crisis.test.js` + 60 new phrases typed into the booking name and note fields (TH/EN/ZH × direct/indirect/abuse); (b) cross-page: support card on tarot, I Ching or dream → open merit hub, place view, service page; (c) server API with the same phrases | Paid offer hidden / booking refused | **100 %** (any miss fails the build); false block on 120 ordinary notes ≤ 2 % reported | synthetic |
| **T4 Booking e2e** | 24 fixed scenarios in `tests/e2e/merit-booking.e2e.mjs` (CDP, like the existing e2e): happy path D1 and D2; three-bucket totals; items over and under estimate; cancel at each stage; site closed → refund; no coverage; under-20 blocked; minor beneficiary fields; crisis in note; proof upload → blur → review → release; receipt rendering (fee only on our receipt); role matrix (editor cannot see bookings, admin refund cap, owner re-auth); audit row per write; phone viewport 360 px | All pass | 24 / 24 | synthetic, test-mode payments |
| **T5 Wording** | All bundle texts TH/EN/ZH + service pages + e-mails | `merit-safety` lint hits; then a human consumer-law check (L-M1) | 0 lint hits; counsel sign-off before charging | automated + counsel |
| **T6 Proof face blur** | 100 staged proof photos taken by staff at public places (bystanders present, no customers), outside the repo | Share of bystander faces left unblurred after auto blur; after human review | Auto: report; after review: 0 known unblurred faces released | field |
| **T7 Ops pilot** | 20 real bookings by the owner's team (test money, own donations) | On-time %, proof complete %, reconciliation differences, incidents | ≥ 90 % on time; 100 % proof complete; 0 THB unreconciled | field |

The set definitions (T1 sample seed, T3 phrases, T4 scenarios) are committed before any tuning and never edited to pass.

---

## 9. Privacy (PDPA)

| Data | Where | Basis (to confirm, L-M7) | Retention |
|---|---|---|---|
| Reading results | Device only; matching on device | not collected | none |
| Booker account (Google sub, e-mail) | D1 (existing members) | contract s.24(3) | existing policy |
| Beneficiary first name, birth weekday | D1, encrypted | contract; for third parties, booker attests permission | purged 30 days after close |
| Birth date and time (ฝากดวง only) | D1, encrypted, re-auth to view | explicit consent, shown with reason | purged 30 days after close; never for minors |
| Purpose and note | D1, encrypted | contract | purged 30 days after close |
| **Religious belief implied by the booking** (a Buddhist / Chinese / Hindu rite) | the booking itself | **s.26 sensitive data (religious or philosophical belief): explicit consent** at booking, separate tick | as above |
| Payment and financial records (amounts, receipts, pass-through) | D1 + R2 | legal obligation s.24(6) (tax and accounting) | 5 years [counsel / accountant to confirm] |
| Proof photos and video | R2 | contract | 90 days after release |
| Staff data (ID check, references, consented record check, phone) | D1, encrypted | contract + consent for the record check | contract end + 1 year (confirm) |
| Crisis events | device counter; server counter only (no text) | none needed (no personal data) | counters only |

Photo proof shows staff only, never customers. Bystanders and monks are blurred and checked by a human. No images of
users are ever requested or stored.

Records to add on approval:
- `docs/PDPA-NOTES-FOR-COUNSEL.md`: new item G1 "Merit service".
- `docs/pdpa/ROPA.md`: new rows.
- `docs/pdpa/DPIA.md`: new section (sensitive data, third-party beneficiaries, staff as processors or employees).

Processors are Cloudflare and Opn, as existing. No AI provider is used in this feature.

---

## 10. Phases and effort

| Phase | Content | Effort | Depends on |
|---|---|---|---|
| **M0** | Docs: counsel notes G1, legal rows (§13) into `docs/CTO-BRIEF.md` §8, ROPA/DPIA drafts; fixed test sets T1–T5 written | S | approval |
| **M1** | Shared back-office foundation (§4.1): roles, per-actor audit, image upload + blur + human check, admin i18n, mobile layout | M (S if built earlier for another back-office) | M0 |
| **M2** | Content schema + admin CRUD for places, remedies, items, mappings, sources, revisions, review reminders, link checker, copy check, bundle publish | M | M1 |
| **M3** | Seed research and writing (§5.3), owner's own photos, reviewer round T1; ชง code-vs-sources check | L (mostly editor + reviewer time) | M2 |
| **M4** | On-device `lensiq-merit.js` panel on all fortune pages + `merit.html` hub (TH/EN/ZH), `merit-safety` lint, crisis flag, unit tests | M | M2 (can start on the seed JSON) |
| **M5** | Measurement round: T1, T2, T3, T5 (lint part); independent re-measure; report | S | M3, M4 |
| **M6** | Service backend + pages: booking, three-bucket checkout (test keys), pass-through ledger, job queue, staff view, proof pipeline, receipts, refunds, incidents, server crisis check; T3(c), T4 | L | M5; built in test mode |
| **M7** | Ops pilot T6–T7 with the owner's team, full playbook, staff vetting kit, terms and refund text | M | M6 + owner staff |
| **Gate** | **No real charging** until counsel answers L-M1 to L-M16 and the direct-marketing and e-commerce registrations are done | — | counsel |

The free content (M0–M5) is about M–L in total. The service (M6–M7) is about L. The whole programme is about L–XL. Each
phase is reported in the standard format and waits for approval before the next one.

---

## 11. Risks

| # | Risk | Likelihood / impact | Mitigation |
|---|---|---|---|
| R1 | The service counts as direct marketing (ตลาดแบบตรง): registration with สคบ., 1 M THB capital for a company, security deposit, 7-day cancellation ([SECONDARY] iLaw <https://www.ilaw.or.th/?p=2386>, Thansettakij <https://www.thansettakij.com/social-biz/642880>) | High / high | L-M2; no charging before the answer |
| R2 | Collecting donations looks like fundraising under the Fundraising Control Act B.E. 2487 or conflicts with the 2539 Sangha order limiting fundraising to temple grounds ([SECONDARY] Thai PBS <https://www.thaipbs.or.th/news/content/294076>; TCI article <https://so06.tci-thaijo.org/index.php/bim/article/view/269491>) | Medium / high | D1 default (the user pays the temple directly); present D2 as an errand, not a fund; L-M3 |
| R3 | The draft สคบ. rule on advertising amulets and "services that bring luck" may be in force ([SECONDARY] Thansettakij <https://www.thansettakij.com/business/economy/573522>) | Medium / high | `merit-safety` lint; no outcome words; L-M1, L-M4 |
| R4 | Staff misuse of money or proof | Medium / high (trust) | §6.10; D1 default; reconciliation; spot checks |
| R5 | Reputational backlash ("commercialising merit") | Medium / medium | Fee only for time; no fees tied to rituals; respectful wording; no temple endorsement claims |
| R6 | Content accuracy: sources disagree, the ชง table differs from the code (ระกา) | High / medium | Show disagreement; reviewer T1; yearly ชง review |
| R7 | Auto face blur misses faces (≈ 39 % on the public set) | High / medium | Human review of 100 % of proof and admin images |
| R8 | Copyright or site rules for photos of temples and Buddha images (Copyright Act s.37–39 cover public places and buildings; statues inside may not; [PRIMARY] WIPO Lex <https://www.wipo.int/wipolex/en/text/129762>) | Medium / medium | Own photos only, exterior or allowed areas; L-M8 |
| R9 | Crisis false negatives in free text | Low / high | Shared regex on device + server; T3 at 100 % on the fixed set; the professional review item stays open |
| R10 | Tax: users expect deductions from D2 donations; VAT on pass-through | Medium / medium | Clear notice; D1 default; L-M5, L-M6 |
| R11 | Staff safety and liability on travel | Low / high | Same-day jobs only; insurance (owner); L-M11 |
| R12 | Scope creep into selling lucky items | Medium / medium | No price or vendor fields; separate decision |

---

## 12. What the owner must provide

1. **Choices to confirm:**
   - the service fee per zone (§6.2);
   - the donation cap;
   - the launch provinces;
   - the crisis hide window (default 24 h);
   - the review interval (180 or 365 days);
   - whether `vow_repay` (แก้บน for an existing vow) is offered;
   - whether D2 is offered at all, or D1 only at launch.
2. **People:**
   - 1 content editor (Thai, knows the traditions);
   - 1 paid knowledgeable reviewer for T1 (Thai astrology + Chinese metaphysics);
   - 2–3 field staff in Bangkok for the pilot;
   - admin and editor accounts (names, e-mails).
3. **Money and company:**
   - a separate bank account for pass-through funds;
   - Opn test keys (existing);
   - DBD e-commerce and direct-marketing registration if counsel says so;
   - staff insurance quote.
4. **Photos:** own photos of the 40 seed places, taken in allowed areas, with no identifiable people (or blurred and
   checked).
5. **Counsel and accountant:** answers to L-M1 to L-M16 before charging.
6. **Optional:** a phone or letter contact with each seed temple or shrine office to confirm opening hours, offering
   practice and the proxy custom. This is not a partnership and implies no endorsement.

---

## 13. Proposed legal rows (for `docs/CTO-BRIEF.md` §8, added in M0 after approval)

| # | Item | Why | Where in code / docs | Status | Added |
|---|---|---|---|---|---|
| L-M1 | **Consumer-protection wording check** | Every service text, advert, e-mail and recommendation (TH/EN/ZH) is reviewed against the Consumer Protection Act B.E. 2522 s.22 (no false or exaggerated claims) and the advertising committee rules before launch; the `merit-safety` lint is only a first filter | design §7.1, §8 T5; `lensiq-merit.js`, `merit*.html`, `i18n/*-merit.js` | open | 2026-11-10 |
| L-M2 | Direct Sales and Direct Marketing Act B.E. 2545 (am. 2560) | Is an online paid errand "ตลาดแบบตรง"? Registration, capital, security deposit amount [UNVERIFIED], the 7-day cancellation right for a service already performed | design §6.6, §11 R1 | open | 2026-11-10 |
| L-M3 | Fundraising Control Act B.E. 2487 and the 2539 Sangha Supreme Council order | Does passing on a user's donation (D2) count as fundraising for a temple? Any religious exemption [UNVERIFIED] | design §6.2, §7.4 | open | 2026-11-10 |
| L-M4 | สคบ. regulation on advertising amulets and luck-bringing services (drafted 2566) | In force or not [UNVERIFIED]; does it cover the merit service, ชง content and lucky-item recommendations? | design §7.1, §11 R3 | open | 2026-11-10 |
| L-M5 | Donation tax deduction (Revenue Code s.47(7), e-Donation only from 1 Jan 2569) | Can a donation handed over by our staff be recorded under the user's ID? Exact wording we may use about deductibility | design §6.2, §6.4 | open | 2026-11-10 |
| L-M6 | VAT and accounting of pass-through money | Is bucket B/C outside our turnover when held in a separate account? Invoice wording; accounting retention period | design §6.2, §6.4, §9 | open | 2026-11-10 |
| L-M7 | PDPA: religious belief as s.26 sensitive data; third-party beneficiary data | Explicit consent wording; booker's attestation for another person; retention periods | design §9 | open | 2026-11-10 |
| L-M8 | Photos of temples, shrines and sacred images | Copyright Act s.37–39 limits; per-site rules (e.g. Emerald Buddha ubosot); commercial use in the app | design §6.3, §11 R8 | open | 2026-11-10 |
| L-M9 | Proof photos with monks or bystanders | Auto blur misses faces; is human review + 90-day retention adequate? | design §6.3, §8 T6 | open | 2026-11-10 |
| L-M10 | Royal Decree on Digital Platform Services B.E. 2565 (ETDA) | Out of scope while we sell only our own service; check again if third-party providers or temples are ever listed as sellers | design §6.5 | open | 2026-11-10 |
| L-M11 | Field staff: contractor or employee, record checks, liability, insurance | Lawful vetting with consent; responsibility for staff conduct and safety | design §6.9, §11 R11 | open | 2026-11-10 |
| L-M12 | Third-party belief content and source links | Paraphrase plus link is our method; confirm no copyright issue with summarising media articles | design §5.1 | open | 2026-11-10 |
| L-M13 | Minors and the paid service | Age 20 or guardian consent (same as `terms.html` §7); bookings naming a minor beneficiary | design §7.3 | open | 2026-11-10 |
| L-M14 | Crisis card wording | Still "pending-professional-review"; now also shown on the service page | `fortune-ai.js` crisis; design §7.2 | open | 2026-11-10 |
| L-M15 | Refund terms and the Unfair Contract Terms Act B.E. 2540 | "No refund for results" and the post-service refund limits must be fair and clear | design §6.6 | open | 2026-11-10 |
| L-M16 | Impersonation and temple names | Using temple or shrine names without implying endorsement; scam impersonation of LENSIQ (Computer Crime Act s.14) and our duty to warn | design §6.10, §7.4 | open | 2026-11-10 |

Research gaps to close with primary sources in M0:
- the direct-marketing deposit amount and the cancellation section number;
- the in-force status of the สคบ. amulet rule;
- e-Donation through an intermediary;
- any religious exemption in the 2487 Act;
- the official Grand Palace photography rule;
- feng shui object placement sources.
