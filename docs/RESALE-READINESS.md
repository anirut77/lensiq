# Resale readiness (design note: DESIGN ONLY, DO NOT BUILD)

> Owner order 2026-11-18, item 4. Nothing here is built or approved. It describes what another organisation would need to
> run the whole system under its own brand, and the questions for the lawyer. Companion: `docs/OWNER-VALUES-INVENTORY.md`
> (every owner-specific value and where it lives). Not legal advice; every legal point is a question for counsel.

## สรุปภาษาไทย (Thai summary)

หากองค์กรอื่นจะนำ LENSIQ ไปรันทั้งระบบภายใต้แบรนด์ของตัวเอง ต้องมี 5 อย่าง: (1) แยกการติดตั้งต่อผู้ซื้อหนึ่งราย บัญชี
Cloudflare ของผู้ซื้อเอง (Worker, D1, Pages หรือโฮสต์เว็บ, โดเมน, secrets) ไม่ใช้ข้อมูลร่วมกับของเรา (2) แผงแอดมิน "ข้อมูลกิจการ"
ที่เก็บชื่อแบรนด์ โลโก้ ผู้ขาย ผู้ติดต่อ ราคา และการแจ้งเตือน (3) จุดสลับแบรนด์ค่าเดียว แทนที่จะแก้ 3,705 จุด (4) ส่วนที่ยังเป็นของเรา:
โมเดล (โดยเฉพาะโมเดลอายุ/เพศและสีหน้าที่ถูกจำกัดสิทธิ์ ต้องปิดในชุดของผู้ซื้อ), ชุดทดสอบและข้อมูลใน `~/LENSIQ-field` (ไม่ส่งมอบ),
เนื้อหาดูดวง และเบอร์สายด่วน (5) ข้อกำหนดการอัปเดตและซัพพอร์ต และคำถามถึงทนาย 12 ข้อ (ใบอนุญาต ข้อตกลงไวต์เลเบล บทบาท PDPA
ผู้ควบคุม/ผู้ประมวลผล ภาระเรื่องสายด่วน ความรับผิดเนื้อหาดูดวง) สถานะ: ออกแบบเท่านั้น ห้ามสร้างจนกว่าเจ้าของอนุมัติ

## 1. Model of resale: one deployment per buyer

The product is a static site (all vision runs in the visitor's browser) plus one Cloudflare Worker with a D1 database.
Because the data (leads, members, receipts, audit log) lives in the Worker, **each buyer gets a separate deployment**, not
a tenant inside ours. Reasons: PDPA roles stay clean (section 7, Q4), a buyer's incident cannot touch another buyer,
and the buyer's keys never pass through us. Multi-tenant hosting by us is out of scope.

| Piece | Per buyer | How |
|---|---|---|
| Cloudflare account | buyer's own | The buyer creates it and runs `wrangler login`. We do not hold their credentials. Our `tools/lib/cf-guard.mjs` allows only `lensiq-*` resources on our shared account, so a buyer needs its own guard prefix. |
| Worker + D1 | one each | `backend/wrangler.toml` copied with the buyer's names and D1 id; `npm run backend:deploy`; migrations 0001 to latest. `docs/BACKEND.md`, `docs/DEPLOY.md`. |
| Static site | buyer's host | Cloudflare Pages or GitHub Pages from the buyer's own repo; built by `tools/build-site.mjs` with their API origin and Turnstile site key. |
| Domain | buyer's own | `docs/CUSTOM-DOMAIN.md` (a) subdomain in their account, (b) new domain. Keep Worker `ALLOWED_ORIGINS`, `TURNSTILE_HOSTNAMES`, `SITE_URL` in step. |
| Secrets | buyer enters them | `npm run secrets:setup` (owner TOTP, KEK, AI key, Opn, Turnstile secret, LINE, mail, alert webhook). We never see or store them. |
| Admin account | buyer's | First-run setup creates the buyer's owner account with TOTP and recovery codes. |
| Payments | buyer's merchant account | Opn keys are the buyer's; our bank account and PromptPay id never appear. |

## 2. Admin settings needed (from the inventory)

A DB-backed "ข้อมูลกิจการ / Business settings" area, read by the pages and the Worker from one place (the `seller-settings`
branch is the first slice):

1. **Business identity:** display name, legal name, tax ID, address, branch, VAT status, support e-mail, DPO name and
   e-mail, status URL, LINE OA ids, effective date of the legal texts.
2. **Brand:** wordmark text or uploaded logo, tagline, accent colour. Favicon and colours stay a build-time config.
3. **Prices:** B2B price table (product, unit, pilot and regular price, VAT note) replacing about 64 hard-coded lines
   (22 HTML, 42 i18n); consumer plans stay in the existing billing tab.
4. **Notifications and limits:** show "set / not set" for secrets (never values), alert test button, daily push cap,
   retention days (the notice and the cron must read the same numbers).
5. **Go-live switches** (`sales_open`, `counsel_confirmed`, billing on): behind TOTP re-authentication, not plain fields.

Not editable in the admin: help-line numbers and crisis wording, licence flags (`LENSIQ_RESEARCH_DEMO`, age/gender and
expression), analytics allow-lists, legal text bodies.

## 3. Branding switch points

Today the name is written directly into 75 pages and 159 translation files (3,705 occurrences). To rebrand without editing
all of them:

- one brand object (`nav.js:6`) fed from the settings, and a `{brand}` token in the i18n layer for the page text;
- server messages (receipt and mail subjects, alerts, AI prompt: 52 occurrences) read the brand from the settings table;
- logo from the admin; favicon and theme from the build step;
- code names (`lensiq-*.js`, `LENSIQ_*`, `lq-*` keys, the `LQ*` globals) stay: users never see them, and renaming would
  break tests and stored state;
- each change needs the existing wording tests re-locked so that the default output stays identical (project rule: no
  loosened tests).

A buyer should also remove our "demo site" notices and our About-page credits remain (third-party licences, section 4).

## 4. What stays ours

- **Models and licences.** Buyer builds ship only commercially cleared models: MediaPipe, TensorFlow.js models, YOLOX,
  PaddleOCR, YuNet and MODNet (Apache-2.0 or MIT, `LICENSES/THIRD-PARTY-NOTICES.txt`, `LICENSES/THIRD_PARTY.md`). The
  buyer must keep the notices file and the About credits. **Licence-limited models** (age/gender trained on UTKFace and the
  expression model: F5; the BiSeNet face parser: F1, non-commercial and never committed) stay in our code and our demo
  mode only. In a buyer build: `LENSIQ_RESEARCH_DEMO = false`, the model files removed from the package, and the licence
  label kept. Open items F5/F6 (training-data terms of face-api.js detector, landmarks and recognition weights) are
  unresolved and affect resale as much as our own sales (Q2).
- **Test sets and evals.** Everything under `~/LENSIQ-field` (locked eval sets, exam face sets, plate sets, crowd videos,
  logs) is never shipped, not in the repo and not to a buyer. Only the committed hashes (`evals-locks/*.sha256`) and the
  published accuracy figures (`docs/accuracy-figures.json`, with their source) go with the product. A buyer cannot
  re-measure without our sets; that is intentional and a licence point (Q7).
- **Content.** Fortune knowledge bases (`*-kb.js`), merit entries, the fortune writing rules and crisis net, claim rules
  (`docs/claim-rules.json`), PDPA pack and legal drafts. These are licensed to the buyer for their deployment, not
  transferred.
- **Crisis help lines** are Thailand-specific and code-fixed. A buyer outside Thailand needs a reviewed local pack.
- **Training and tooling:** training scripts, plate and product-check pipelines, eval harnesses and the CI gate stay ours.

## 5. Updates and support model

- **Releases:** we ship versioned releases (tag plus change log). The buyer deploys them to their own Worker and site;
  migrations are forward-only and run by `backend:deploy`. A buyer may not edit shipped files in place (their changes
  live in settings and config), so updates apply cleanly.
- **Security and safety fixes** (crisis flow, privacy, model licence changes) are pushed to every buyer with a notice and
  a deadline. Helpline numbers are re-checked on a schedule (`helpline-recheck.yml`) and shipped as a release.
- **Support tiers:** reuse `docs/SUPPORT.md` (severity and response targets), restated as a reseller agreement: first
  line is the buyer, second line is us.
- **No remote access** to a buyer's data. We support through logs the buyer chooses to share.
- **Cost to us per buyer:** onboarding runbook, one review of their legal text, and release handling. Price it before
  any offer (owner decision; not set here).

## 6. Legal and licence questions for the lawyer

Numbering continues in `docs/LEGAL-PACKET.md` style; these are new and not yet in that file.

Licensing
1. Our own code is MIT (`LICENSE`). Can we keep MIT for the public repo and license buyers a separate commercial
   package (support, notices, content, rebrand rights)? Does MIT's notice requirement mean a buyer can resell the code
   itself without us?
2. F5/F6: are face-api.js weights trained on research-only datasets (UTKFace, WIDER FACE, 300-W, VGG Face and others)
   usable commercially, by us and by a buyer? Is a buyer exposed if we redistribute them? If not clear, what warranty and
   indemnity may we give?
3. Third-party attributions (Apache-2.0 NOTICE, MIT, SIL OFL): is the current notices file enough when a buyer
   rebrands, or must their build carry additional text?

White-label terms
4. Who owns the buyer's brand, data and configuration; who owns improvements the buyer asks for; what happens on
   termination (data export and deletion, model files, content licence)?
5. May the buyer sub-license to its own customers, and what resale restrictions (field of use, region, no use in
   dense-crowd or other claims we have not measured) can we impose? What warranty of accuracy is allowed given that
   field accuracy is not yet measured for most products?
6. Do the locked-test and measured-claims rules need to bind the buyer (they may not advertise accuracy figures we did not
   measure)?
7. May we withhold the test sets, and does a buyer have a right to independently audit accuracy?

PDPA and roles
8. In a per-buyer deployment the buyer is the data controller and we are at most a processor (support, updates). When,
   if ever, are we a joint controller (shared model improvement, shared analytics)? Which DPA template (`docs/legal/customer/DPA-TEMPLATE.md`)
   applies, and who appoints the DPO and files incident notices?
9. Cross-border transfers: the buyer's Worker, the optional AI provider and mail provider are outside Thailand. Who
   documents the basis, and is our privacy text a template the buyer may adapt?

Safety and content
10. Crisis lines: if a buyer removes or changes the crisis flow or help-line numbers, what liability stays with us?
    Can we make those parts non-removable by contract, and what is our duty to update them? What is required outside
    Thailand?
11. Fortune content liability: who is liable for readings published under a buyer's brand (our rules: no certain
    prediction of death or illness, no instruction to stop treatment, no fear-selling; paid content behind off switches)?
    Do consumer-protection or advertising rules apply differently to a buyer, and does the straight-reading option
    (18+ confirmation) work under their brand?
12. Face and biometric features (Attendance face option, Exam face checks, Customers): who must run the DPIA and obtain
    consent when the buyer's customers are the data subjects, and which of our PDPA files (`docs/pdpa/`) can be reused
    as templates?

## 7. Next step (only if the owner approves)

1. Finish `seller-settings` and the `{brand}` token round. 2. Write the per-buyer runbook from `docs/DEPLOY.md`. 3. Send
questions 1 to 12 to counsel with `docs/LEGAL-PACKET.md`. 4. Decide price and support terms. If the owner does not answer,
nothing is built and nothing changes for users.
