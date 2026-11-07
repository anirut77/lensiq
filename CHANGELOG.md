# Changelog

All notable changes to LENSIQ are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has no tagged releases yet, so entries are grouped by date and commit.

## [Unreleased]

### Cameras round 9 (on-site accuracy check, camera health, soak test)
- **On-site accuracy check** (`lensiq-sitecheck.js`, panels on store / attendance tab "ตรวจความแม่นยำ" / driver / qc): a person labels what really happened while the page runs as usual. They tap each door crossing, say who stood at the camera, follow a randomised eyes-closed prompt while parked, or mark each bottle good or bad. The page then reports its own accuracy on that site with 95% confidence intervals (Wilson, exact Poisson, 60-s block bootstrap), a pass / fail / "collect more" verdict against fixed targets and minimum samples, and recommended settings. QC can apply the suggested limits with one tap. JSON export holds labels and numbers only (attendance uses pseudonyms). Attendance also counts the existing "ยืนยัน / ไม่ใช่" answers in normal use. TH/EN/中文 via `i18n/zh-rt-sitecheck.js` / `en-rt-sitecheck.js`.
- **Camera health indicator** on every store tile and on attendance / driver / qc: median brightness, backlight, washed-out image, blur, camera shake (robust sub-cell thumbnail match), analysis rate and person/face size, sampled about once per second with hysteresis. Thresholds come from the new robustness benchmark (`people.bench.mjs --degrade dark|night|back|blur|shake`, `--frame-drop`, `--health`), ACCURACY.md §12. Main finding: ±2% camera shake overcounts by 22%.
- **Soak test** `tests/bench/soak.mjs`: store.html with YOLOX on WASM looping a video for N minutes. It records retained JS heap after GC, Chrome process-tree RSS, DOM nodes, listeners and analysis rate.
- Tests: `tests/unit/sitecheck.test.js`, `tests/e2e/sitecheck.e2e.mjs`. `lensiq-sitecheck.js` and `i18n/zh-rt-sitecheck.js` are added to the typecheck gate, and the i18n coverage test now covers `lensiq-sitecheck.js`.

### Commercial readiness (legal drafts, pilot kit, native-speaker review, support)
- **Public documents, TH/EN/ZH, marked "ฉบับร่าง — รอทนายความตรวจทาน"**: `terms.html` (service, entertainment/Kalama-sutta nature of readings, HR tools never decide, acceptable use, members, PromptPay push payments with no auto-renewal, refund policy from BILLING-PLAN §6, liability limits with UCTA/CCC s.373 carve-outs, Thai law), `privacy.html` (PDPA s.23: controller/DPO placeholders, purposes and bases, Google sign-in data, processors GitHub/Cloudflare/Google/Anthropic/Opn, transfers, retention, rights, cookie/storage list), `help.html` (FAQ, support levels per tier, status), `camera-notice.html` (printable A4 signs A–E incl. pilot recording). One full document per language (`legal.css`, `legal.js` language-parallel anchors: `privacy.html#p3` works in every language); titles in `i18n/zh-legal.js` / `en-legal.js`.
- **Legal footer on every page** without its own footer (`nav.js` legalFoot; hidden in kiosk/print); index and about footers link the documents.
- **"Report a problem with this reading"** on every fortune result (`lensiq-report.js`, loaded by nav.js; wraps `FortuneAI.renderSections` from outside): category, note, editable preview, then mailto / copy / save-on-device. No backend, nothing sent automatically.
- **Native-speaker review**: `tools/fortune-review-export.mjs` (stratified 15 domains × TH/ZH × tone terciles → CSV + printable HTML + manifest) and `tools/fortune-review-ingest.mjs` (means, flagged readings, reviewer agreement, visitor reports, release gate); workflow and rubric in `docs/FORTUNE-REVIEW.md`.
- **Licence audit**: `LICENSES/THIRD-PARTY-NOTICES.txt` now ships the Apache-2.0/MIT texts and copyright notices missing from vendored files; YOLOX row added to about.html; MODNet re-verified Apache-2.0; age/gender (UTKFace) flagged with a recommended gate.
- **Docs**: `docs/LEGAL-REVIEW-PACK.md`, pilot kit (`docs/PILOT-PLAN.md` 2-week plan, `docs/pilot/AGREEMENT-TH.md`, `docs/pilot/RESULTS-FORM.md`), segment one-pagers (`ONE-PAGER-RETAIL|EVENTS|HR|FORTUNE.md`), `docs/SUPPORT.md` tiers + Thai response templates + status/incident routine.

### Platform round 5 (source exposure, types, zh)
- **Pages deploy from an allowlist**: `.github/workflows/pages-lfs.yml` ("Pages", push on `main`) is the production deploy. `tools/build-site.mjs` copies only tracked pages, page scripts/styles, `i18n/`, `vendor/`, `.nojekyll` and licence notices into `_site/` and fails on server code, `*.py`, `tests/`, `tools/`, `docs/`, `types/`, `package.json`. `tools/check-site.mjs` also checks every static reference and crawls all 27 pages (TH + 中文) under `/lensiq/` in headless Chrome with no 404 allowed. Both run in CI. Works with or without Git LFS objects. The switch from "Deploy from a branch" is in `docs/DEPLOYMENT-CHECKLIST.md` §0. `tools/static-server.mjs` gained `prefix` / `onResponse`.
- **Types**: the `tsc --checkJs` gate grows from 7 to 78 files (all pure-logic modules: stats, track, detect, camera, hand, i18n-rt, config, studio-qa, insights-*, photobooth-layout, *-kb.js, all `i18n/*.js`), mostly with declarations in `types/lensiq-globals.d.ts` plus type-only JSDoc.
- **Fixes**: `LQDetect.YOLOX_DEFAULT` pointed at the non-vendored `yolox_tiny_416.onnx` (would 404); it is now the shipped `yolox_nano_416.onnx`. 中文: studio panel aria-label and ID-photo size buttons, the driver plate placeholder (`例如 1กข 1234（泰国车牌）`, input marked `lang="th"`), and the Thai letter tables on numbers.html marked `lang="th"`. 27/27 pages fully Chinese in `tools/zh-coverage.mjs`.

### Platform round 4 (privacy, licensing, code quality, zh)
- **Self-hosted font, no third-party requests**: Prompt (OFL) woff2 subsets (thai / latin / latin-ext × 300–700, ~140 KB) in `vendor/fonts/prompt/` with `OFL.txt`, `@font-face` (`font-display: swap`, `unicode-range`) in `styles.css`. Chinese uses OS CJK fonts. The CSP (`server.py`, `tools/csp-meta.mjs`) no longer allows `fonts.googleapis.com` / `fonts.gstatic.com`. `tools/self-host-fonts.mjs` removes the Google `<link>`s from every page (`--check` in CI; `--fetch` re-downloads). `tools/check-external.mjs` proves in headless Chrome that no page (TH and 中文) requests a third-party origin.
- **Commercial-safe server defaults**: `/api/convert` now uses `pdfconvert.py` with pdfplumber, pdfminer.six, pypdfium2 and python-docx (MIT/BSD/Apache). It keeps headings, bold/italic, tables and page breaks. PyMuPDF (AGPL) and pdf2docx (GPL) moved to `requirements-agpl.txt` and run only with `LENSIQ_CONVERT_ENGINE=pdf2docx`, which logs a start-up warning. New `GET /api/convert/status`. `/api/tryon` has **no default model**: it needs `REPLICATE_TRYON_MODEL` plus a `LENSIQ_TRYON_LICENSE` attestation. Known CC BY-NC-SA models (IDM-VTON, OOTDiffusion, CatVTON …) are refused as `commercial` and allowed only as `noncommercial-demo`. `/api/tryon/status` reports `reason`. Input field mapping comes from `LENSIQ_TRYON_INPUT` / `LENSIQ_TRYON_EXTRA`. See `docs/TRYON-LICENSING.md`, `tests/python/test_licensing.py`.
- **PDPA**: filled `docs/pdpa/DPIA.md` (Thai, with an English summary; requires legal review) covering purposes and the lawful basis per module, s.26 biometrics, US transfers, retention per key, controls, L×S risk scoring, residual risks and legal items L1–L8. Also `docs/pdpa/ROPA.md` (s.39).
- **Types**: `tsc --checkJs` gate on the platform modules (`npm run typecheck`, `tsconfig.typecheck.json`, `types/lensiq-globals.d.ts`, JSDoc typedefs in `lensiq-agg.js` / `lensiq-i18n.js`). `node tools/typecheck.mjs --report` lists the errors per file for the rest. TypeScript 5.9.3 is a devDependency.
- **i18n coverage**: `LQI18N.coverage()`, the `?i18n=debug` overlay (red outlines + live Thai % badge), and `tools/zh-coverage.mjs`, which measures Thai % in 中文 mode for all 26 pages after typical interactions (`tools/zh-coverage.interactions.json` holds per-page clicks; `--shared --max 0` is a CI gate). Header logo and language-switch labels are now translated.
- **Git LFS readiness**: `docs/LFS-MIGRATION.md` (forward-only, no history rewrite), `tools/lfs/gitattributes.lfs`, `tools/check-lfs.mjs` (also `pretest:e2e`), LFS caching in CI, `.github/workflows/pages-lfs.yml` (manual until migration).
- **Docs**: `docs/ARCHITECTURE.md`, `docs/PILOT-PLAN.md`, `docs/SUPPORT.md`, `docs/ONE-PAGER-TH.md`, `docs/ONE-PAGER-ZH.md`.

### Added
- **Content-Security-Policy on GitHub Pages**: `tools/csp-meta.mjs` injects a `<meta http-equiv="Content-Security-Policy">` equivalent to the header `server.py` sends (`script-src 'self' 'wasm-unsafe-eval'`, no inline scripts, Google Fonts only), because static hosting cannot set headers.
- **Service worker** (`sw.js`): caches `vendor/` models and libraries cache-first in a versioned cache. This gives fast repeat visits and offline kiosks.
- **CI workflow**: unit, Python and headless-Chrome end-to-end tests plus lint on every push. `package.json` scripts: `test:unit`, `test:py`, `test:e2e`, `lint`.
- **PDPA pack** (`docs/pdpa/`): DPIA template, Thai/English consent and notice texts, retention table, data map.
- **Third-party licence inventory** (`LICENSES/THIRD_PARTY.md`), flagging non-commercial and restricted components (face-parse weights, IDM-VTON try-on, PyMuPDF AGPL, pdf2docx GPL, face-api training-data provenance, MODNet relicensing).
- **Thai / Simplified Chinese UI**: `lensiq-i18n.js` (`window.LQI18N`), a TH | 中文 switch in the header on every page (persisted as `lq-lang`), `i18n/zh-common.js` (nav, footer, common buttons, PDPA texts, landing page). See `docs/I18N.md` for page dictionaries.
- **Thai line breaking**: `nav.js` keeps Thai words (Intl.Segmenter + loanword list) unbroken in headings, labels and buttons, and keeps loanwords such as "แดชบอร์ด" whole everywhere.
- **`window.LQModels`**: a "กำลังโหลดโมเดล xx MB" notice, a cache check and a confirm-on-slow-network helper for large model downloads.
- **Tools**: `tools/check-csp.mjs` (pages under the Pages policy), `tools/mobile-audit.mjs` (390 px audit: overflow, <44 px targets, <12 px text, mid-word Thai breaks; `--selftest`), `tools/static-server.mjs`.
- ESLint flat config (`eslint.config.mjs`), `tests/python/test_security.py`, `tests/unit/{i18n,csp-meta}.test.js`, `tests/e2e/i18n.e2e.mjs`; `tests/e2e/run.mjs --retry=N`, multiple filters, per-file timeout; Linux/CI Chrome detection in `cdp.mjs`.
- `README.md`, `SECURITY.md`, `docs/DEPLOYMENT-CHECKLIST.md`.

### Changed
- **Face vault secure-context enforcement**: face enrolment requires `https://` or `localhost`. Without WebCrypto or IndexedDB, writes throw `VaultInsecureError`; there is no plaintext fallback, not even when encryption fails. Pages show `LQVault.enrollBlockReason()`.
- **Landing page** reorganised for phones: card groups swipe horizontally and hardware moved into "how it works", which cuts the 390 px page from about 10,000 to about 7,100 px. It is fully translated, and "AI" is removed from the fortune labels.
- **Site-wide mobile CSS** (`styles.css`): ≥44 px touch targets on coarse pointers (buttons, chips, nav, form controls, checkboxes via their label), a 12 px floor for small-text classes, and 16 px inputs (no iOS zoom).
- **Server/try-on hardening**: JSON errors without internals on `/api/*`, provider error details logged but never returned, Replicate token only sent to `api.replicate.com`, https-only result URLs (no SSRF), 25 MB download cap, `Cross-Origin-Resource-Policy`, a wider static deny list (`tools/`, `node_modules/`, `*.py`, `*.pem` …), malformed environment values fall back to defaults.
- `requirements.txt`: every direct and transitive dependency pinned exactly.
- **Server hardening** in `server.py`: shared guard on `/api/convert`, `/api/tryon`, `/api/fortune` (Host allowlist against DNS rebinding, Origin/`Sec-Fetch-Site` CSRF checks, LAN-only by default, per-IP rate limits, size and content-type limits), CSP and security headers on every response, and a block on serving server source, `data/`, `certs/` and dotfiles.
- **Mobile**: touch targets of 44 px or more, and Thai line breaking (no mid-word wraps) across pages.

## 2026-11-06

### Fixed (`afd677c`)
- Studio layering and fit; fortune composer and safety filter; statistics layer; server hardening; first PDPA texts.

### Added (`5997e5a`)
- Studio outfit editor, analytics statistics layer, multi-camera signage, booth and QC, store re-ID, left/right palm, new fortune pages (feng shui, lucky numbers, I-Ching, zodiac, Western astrology, dream).

### Added (`77543d2`)
- Multi-device aggregation: phones act as camera nodes and push numeric aggregates to a LAN hub (`/api/agg`).

### Added (`0460847`)
- Multi-camera (up to 4) and multi-target detection across camera pages.

### Fixed (`a4fc472`)
- Main menu items unreachable on short screens: scrollable dropdown, drawer on short touch screens.

### Changed (`27324f2`)
- Polished Thai prose of the fortune composer.

### Fixed (`2558c56`)
- Skip the AI status probe on static hosting.

### Added (`7239e4e`)
- Fortune AI layer (optional Claude rewrite), expanded knowledge bases, feng shui and lucky numbers.

## 2026-11-05

### Added (`3808a3c`)
- Fortune suite: palm reading, birth-date horoscope, tarot and เซียมซี; deeper face reading.

### Added (`c70f895`)
- Face-reading page (โหงวเฮ้ง, entertainment) with an editable knowledge base.

### Fixed (`4c842a4`)
- MODNet loading (absolute ORT wasm path); updated dashboard demo data.

### Added (`db8d00d`)
- LENSIQ computer-vision platform for marketing, analytics and photo booth.

## 2026-11-04

### Added (`67d0fbe`)
- Initial commit.
