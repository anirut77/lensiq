# Changelog

All notable changes to LENSIQ are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). The project has no tagged releases yet, so entries are grouped by date and commit.

## [Unreleased]

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
