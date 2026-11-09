# Product Check: free drug and herbal data sources (licence check before integration)

> Research only, 2026-11-10. **Nothing is integrated, downloaded into the repo or committed.** Every licence below was
> read on the source's own page on 2026-11-09/10 unless marked **[SECONDARY]** (taken from a third party) or
> **[UNVERIFIED]** (not confirmed). Not legal advice: every row feeds the counsel list (CTO-BRIEF §8, L29–L38).
>
> Rules applied (CLAUDE.md, design PC-D10): no GPL / AGPL / non-commercial data in the product; share-alike only in a
> separate table, never merged or shipped in `vendor/`; a credit line for every source.
>
> Test downloads (only where the terms allow it) are in `~/LENSIQ-field/drug-data/`, outside the repo:
> `tmt-2020-ccby/` (TMT 2020-02-17 files from data.go.th, CC BY) and `tmt-docs/` (TMT specification PDF, for reading).

## สรุปสำหรับเจ้าของ (Thai summary)

- **ใช้ได้เลย:** openFDA (CC0), DailyMed (งานรัฐบาลสหรัฐ แต่ข้อความฉลากเป็นของผู้ผลิต: ใช้แค่ข้อเท็จจริง), RxNorm/RxNav
  (API ฟรี ไม่ต้องใช้ UMLS ยกเว้น RxClass), RxNorm Current Prescribable Content (ไม่ต้องใช้ UMLS), EMA, Health Canada DPD
  (OGL-Canada), **TMT ฉบับ 17 ก.พ. 2563 บน data.go.th (CC BY)** ซึ่งแม็ปชื่อการค้า → ตัวยา ความแรง รูปแบบยาได้ทันที
  แต่ข้อมูลเก่า 6 ปี
- **ต้องสมัครและขออนุญาต:** TMT ฉบับปัจจุบัน (ออกทุกจันทร์ที่ 1 และ 3 ของเดือน) ต้องล็อกอินที่ this.or.th
  และหน้าเว็บเขียน "สงวนลิขสิทธิ์" ไม่มีสัญญาอนุญาต จึงต้องขอหนังสืออนุญาตจาก สมสท. ก่อนขาย; TTMT (ยาแผนไทย) เหมือนกัน
- **บัญชียาหลักแห่งชาติ:** ตัวประกาศเป็นประกาศของหน่วยงานรัฐ ไม่มีลิขสิทธิ์ตาม พ.ร.บ.ลิขสิทธิ์ มาตรา 7(3);
  โค้ด thai-nlem-api เป็น MIT แต่ไม่บอกที่มาของ CSV ให้ใช้เป็นตัวอย่างและตรวจกับประกาศจริงก่อน
- **ห้ามใช้:** ingredient_kb.jsonl (AI สร้าง ไม่ผ่านเภสัชกร), DrugBank (ไม่ใช่เพื่อการค้า), WHO ATC/DDD (ห้ามคัดลอกเพื่อการค้า),
  ข้อมูลกรมการแพทย์แผนไทยที่ติด CC BY-NC (ตำรับยาแผนไทยของชาติ, Positive List)
- **ต้องถามทนาย:** ป้าย "Open Data Common" บน data.go.th ไม่มีคำนิยามสัญญาอนุญาต (ใช้กับ TMT/TTMT ปัจจุบันและข้อมูลกรมแพทย์แผนไทยหลายชุด)

## 1. Source table

Verdicts: **use now** · **separate table** (share-alike, PC-D10) · **ask permission** · **do not use**.

| # | Source | What it gives | Licence (key clause, URL) | Commercial OK? | Redistribution OK? | Share-alike? | Access method | Refresh | Verdict |
|---|---|---|---|---|---|---|---|---|---|
| S1 | **TMT current release files** (THIS / สมสท., part of HSRI / สวรส.) | Thai drug terminology: SUBS, VTM, GP, GPP, GPU, TP, TPP, TPU (8 concepts) for modern human medicines with Reg. No. letters A, B, C. Trade name → active ingredient, strength, dose form, manufacturer | **No licence or terms of use on the download, login, register or FAQ pages.** Footer: "© สงวนลิขสิทธิ์ 2565 : สำนักพัฒนามาตรฐานระบบข้อมูลสุขภาพไทย". https://this.or.th/service/tmt/download/ . The HSRI catalogue lists the dataset as "Open Data Common", a label with no definition in any Thai CKAN licence list (checked data.go.th, gdcatalog.go.th, opendata.hsri.or.th): https://opendata.hsri.or.th/dataset/tmlt-thai-standard | unknown | unknown | no | ZIP (`TMTRFyyyymmdd.zip`, SHA-256 shown) **behind a free login** (username, name, email; Google / Line sign-in). No direct URL; downloads need a session, so not scriptable without the owner's account | "ทุกวันจันทร์สัปดาห์ที่ 1 และ 3 ของเดือน ตั้งแต่เวลา 16.00 น." (FAQ 6, https://this.or.th/faq-tmt/). Latest: TMTRF20261102, released 2026-11-03 | **ask permission** (L29) |
| S2 | **TMT 2020-02-17 snapshot on data.go.th** (published by THIS itself) | Same structure, frozen at 17 Feb 2020: `MasterTMT_20200217.xls` (30,683 TPU rows, columns `TPUCode, ActiveIngredient, Strength, Dosageform, Contvalue, Contunit, DispUnit, TradeName, Manufacturer, FSN, Status`), concept files and relationship files (see 2.1) | Dataset licence field: **"Creative Commons Attributions"** (data.go.th `cc-by`, version not stated). https://data.go.th/dataset/thai-medicines-terminology-tmt | yes (CC BY) | yes, with attribution | no | Direct HTTPS file URLs, no login (2.3). Test-downloaded to `~/LENSIQ-field/drug-data/tmt-2020-ccby/` | none (one-off) | **use now** as a seed only; drugs registered after Feb 2020 are missing (L30) |
| S3 | **TTMT** (Thai traditional medicines terminology, THIS for DTAM) | Thai traditional medicine products with TTMT codes | Same as S1: no licence text; footer "สงวนลิขสิทธิ์"; HSRI catalogue "Open Data Common". https://this.or.th/service/ttmt/maste-ttmt-release-file/ | unknown | unknown | no | `MasterTTMT_yyyymmdd.zip` behind the same login | irregular, ~monthly to quarterly (latest MasterTTMT_20261001, 2026-10-16) | **ask permission** (L29) |
| S4 | **thai-nlem-api** (github.com/suradet-ps/thai-nlem-api) | Rust REST API over `data/nlem_2567.csv` (1,725 lines; columns incl. group codes, `generic name`, `syn name`, `dosage`, `ED`, NLEM category ก–จ, conditions, warnings) | **MIT**: "Distributed under the MIT License" (GitHub licence API: `mit`). https://github.com/suradet-ps/thai-nlem-api . The README does **not** name the source of the CSV | yes (MIT) | yes, keep the MIT notice | no | Clone repo or raw CSV: https://raw.githubusercontent.com/suradet-ps/thai-nlem-api/main/data/nlem_2567.csv | last push 2026-10-02; covers NLEM 2567 only | **use now as reference code**; the CSV only after a spot-check against the official announcement (S5) |
| S5 | **NLEM (บัญชียาหลักแห่งชาติ) official announcements** | National essential medicines list by category ก–จ, with conditions | Announcement of the National Drug System Development Committee in the Royal Gazette (e.g. 2567: เล่ม 141 ตอนพิเศษ 53 ง, 23 Feb 2024; ฉบับที่ 2: เล่ม 141 ตอนพิเศษ 275 ง, 3 Oct 2024 [SECONDARY: dmsic.moph.go.th]). Thai Copyright Act B.E. 2537 **s.7(3)**: "ระเบียบ ข้อบังคับ ประกาศ คำสั่ง ... ของกระทรวง ทบวง กรม หรือหน่วยงานอื่นใดของรัฐ" are not copyright works; s.7(5) adds state compilations of them | yes (no copyright) | yes | no | PDF only (Royal Gazette, ndi.fda.moph.go.th, dmsic.moph.go.th); no official machine-readable file found. ndi.fda.moph.go.th refused connections on 2026-11-10 | irregular (2–3 updates a year); a 2569 edition is reported [UNVERIFIED] | **use now** (we build our own table from the Gazette text; check the latest edition first) |
| S6 | **NLEM on data.go.th** (Thai FDA, 2013 and herbal 2013) | Old NLEM XLS (`ed55-publish_post_web56_edit16-10-56.xls`) and herbal NLEM PDF | "Creative Commons Attributions". https://data.go.th/dataset/item_64a59021-3316-4e88-a56d-b8669dc99071 | yes | yes | no | Direct XLS / PDF | none ("ไม่มีการปรับปรุง") | **do not use** (outdated 2013 list; history only) |
| S7 | **openFDA** (`drug/label`, `drug/ndc`, `drug/enforcement`) | US labels, NDC directory, recalls | "the content, data, documentation, code, and related materials on openFDA is public domain" (CC0 1.0); "you should not imply endorsement". Exception: GMDN device data. https://open.fda.gov/license/ | yes | yes | no | REST `https://api.fda.gov/drug/label.json`, `/drug/ndc.json`, `/drug/enforcement.json`; bulk index https://api.fda.gov/download.json | label/NDC weekly, enforcement weekly | **use now** (already in `backend/src/med.js`) |
| S8 | **DailyMed** (NLM SPL) | Full SPL label documents, NDC ↔ SPL ↔ RxCUI | NLM: "Works produced by the U.S. government are not subject to copyright protection in the United States"; third-party content "may be copyrighted". DailyMed: "NLM does not review any SPL content prior to publication". https://www.nlm.nih.gov/web_policies.html · https://dailymed.nlm.nih.gov/dailymed/about-dailymed.cfm | yes for facts; label wording is the labeller's | facts yes; do not republish full label text | no | REST `https://dailymed.nlm.nih.gov/dailymed/services/v2/` (`spls`, `drugnames`, `ndcs`, `rxcuis`, `.json`); bulk https://dailymed.nlm.nih.gov/dailymed/spl-resources-all-drug-labels.cfm | daily | **use now** (look up and link out; store derived facts only) |
| S9 | **RxNav APIs** (RxNorm, RxTerms, Prescribable RxNorm) | Name → RxCUI → ingredient (INN-like) mapping, NDC ↔ RxCUI | "With one exception, no license is needed to use these APIs." Exception: **RxClass** (contains SNOMED CT, under the UMLS / SNOMED affiliate terms). "no more than 20 requests per second" per IP. Requested credit: "This product uses publicly available data from the U.S. National Library of Medicine (NLM), National Institutes of Health…"; NLM name / logo not to be used. https://lhncbc.nlm.nih.gov/RxNav/TermsofService.html | yes | API results: yes (non-proprietary RxNorm content) | no | REST `https://rxnav.nlm.nih.gov/REST/` (e.g. `/approximateTerm.json`, `/rxcui/{id}/related.json?tty=IN`) | weekly / monthly | **use now**, but **not RxClass** without a UMLS licence (L33) |
| S10 | **RxNorm full release files** | Full RxNorm incl. proprietary source vocabularies | "A free UMLS license is required to download the full RxNorm monthly and weekly releases"; proprietary sources carry UMLS Source Restriction Levels (licence §12). https://www.nlm.nih.gov/research/umls/rxnorm/docs/termsofservice.html | only SAB=RXNORM content; others restricted | restricted | no | UTS download after UMLS sign-up | monthly | **do not use** the full files; use S9 or S11 |
| S11 | **RxNorm Current Prescribable Content** | Subset of currently prescribable RxNorm drugs | NLM provides it "without licensing restrictions"; "You do not need to log into the UMLS Terminology Services to access the subset." https://www.nlm.nih.gov/research/umls/rxnorm/docs/prescribe.html | yes | yes, with NLM credit | no | ZIP from https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html | monthly + weekly | **use now** (offline name → ingredient table) |
| S12 | **icdevelop/thai-pharma-kb** (Hugging Face) `tmt_lookup.json` | 31,034 products from TMT (snapshot 2026-07-20): brand → ingredient, strength, form | Card: "License: health-ai-developer-foundations" (Google HAI-DEF terms) and "TMT is data of a Thai government agency — verify redistribution terms before republishing". HAI-DEF §3.1: recipients must get the agreement, use restrictions and a "Notice" file. https://huggingface.co/datasets/icdevelop/thai-pharma-kb · https://developers.google.com/health-ai-developer-foundations/terms | unclear (HAI-DEF restrictions + TMT rights not cleared) | only under HAI-DEF conditions | no (but restrictions pass on) | Gated download ("auto" gate, must accept) | one-off | **do not use**; take TMT from THIS (S1 / S2) instead |
| S13 | **icdevelop/thai-pharma-kb** `ingredient_kb.jsonl` | 1,918 ingredient records: indications, dosage, interactions, legal class | **AI-generated** by gemini-2.5-pro: "This data is AI-generated and not yet pharmacist-reviewed. It must not be used in real clinical practice until verified." | n/a | n/a | n/a | gated | n/a | **do not use, ever** (owner rule) |
| S14 | **Thai FDA datasets on data.go.th** (organisation `fda`, 65 datasets) | Drug **licensee** lists (ขย1–ขย4, ขยบ, manufacturers, importers) CSV / XLSX; Thai-name hazardous substance list; orange-book PDFs. **No drug, herbal or cosmetic product-registration dataset** | Licensee lists: "Open Data Common" (undefined, see S1); most others "License not specified". https://data.go.th/organization/fda | unknown | unknown | no | CKAN API `https://data.go.th/api/3/action/package_search?fq=organization:fda` | licensee lists ~yearly (last 2026-08-04) | **ask permission** (L31); not needed for the label → ingredient step |
| S15 | **Thai FDA "ตรวจสอบเลขทะเบียน" web services** (`WS_LICENSE_SEARCH`: `GET_DATA_DRUG`, `GET_DATA_CMT`, food, narcotic, device) | Registration lookup by Reg. No. / name | data.go.th entries say "License not specified". http://porta.fda.moph.go.th/FDA_SEARCH_ALL/WS_LICENSE_SEARCH.asmx | unknown | unknown | no | SOAP web service (already proxied in `backend/src/med.js`) | daily | **ask permission** (already L13; letter drafted) |
| S16 | **DTAM herbal datasets** (กรมการแพทย์แผนไทยฯ, gdc.dtam.moph.go.th) | (a) 24-digit herbal drug codes with TTMT code, name, form, maker (`dtam-acad-005`); (b) herbal NLEM structure: symptom group, name, form, ingredients, uses, warnings (`dtamset-06`, source "หนังสือบัญชียาหลักแห่งชาติด้านสมุนไพร พ.ศ. 2566") | (a), (b): "Open Data Common" (undefined). https://data.go.th/dataset/dtam-acad-005 · https://data.go.th/dataset/dtamset-06 | unknown | unknown | no | Direct CSV: see 2.3 | (a) yearly; (b) per NLEM edition | **ask permission** (L31); (b)'s underlying NLEM text is s.7(3) public, so we may rebuild it from the Gazette instead |
| S17 | **DTAM national Thai formulas list and Positive List** (`dtam-acad-002`, `dtam-acad-006`) | National Thai traditional formulas (from MoPH announcements); herbal Positive List | **"Creative Commons Attribution Non-Commercial"** on the dataset. https://data.go.th/dataset/dtam-acad-002 · https://data.go.th/dataset/dtam-acad-006 | **no** | non-commercial only | no | CSV | yearly | **do not use** these CSVs. The underlying MoPH announcements are s.7(3) public; rebuilding from the Gazette is a counsel question (L34) |
| S18 | **Thai Traditional Medicine knowledge** (national formulas and texts under the Thai Traditional Medicine Knowledge Protection Act B.E. 2542) | 891 national texts and 59,687 national formulas declared since 2015 [SECONDARY: news report] | Protected under the Act (declared by MoPH under s.17 [SECONDARY]); commercial use of national formulas needs DTAM permission [UNVERIFIED section]. https://sp.mahidol.ac.th/pdf/law/Thai-Traditional-Medicine2542.pdf | **no** without DTAM permission | no | no | none (books / Gazette) | n/a | **do not use** formula content; names only, after counsel (L34) |
| S19 | **Thai Herbal Pharmacopoeia** (THP 2021 + 2025 supplement, Department of Medical Sciences) | Herbal monographs: identity, quality specs | "Copyright © 2025 Published by Department of Medical Sciences" [SECONDARY: search snippet of the supplement title page]; online monographs need sign-in [SECONDARY]. https://bdn-thp.dmsc.moph.go.th/ | no licence granted | no | no | e-book / app only | per edition | **ask permission** (L35); facts like Latin names can be cited |
| S20 | **Mahidol / Chulalongkorn herbal databases** (e.g. Faculty of Pharmacy Mahidol, Medicinal Plant Information Center) | Herbal monographs, literature | No open licence found. Mahidol repository items state "ห้ามนำไปใช้เพื่อการค้า" (item-level) [SECONDARY]. https://medplant.mahidol.ac.th/ | no | no | no | web only | n/a | **ask permission** (L36); this is where the UBU letter (a) fits |
| S21 | **WHO ATC/DDD index** | ATC classes, DDDs | "Copying and distribution for commercial purposes is not allowed." "Changing or manipulating the material is not allowed." https://atcddd.fhi.no/copyright_disclaimer/ | **no** | no | no | web | yearly | **ask permission** (already L14; keep using RxNorm instead) |
| S22 | **DrugBank** | Drug, target and interaction data | Terms §1.3: "solely for educational, scientific, and non-commercial research purposes" unless "you have paid for a commercial license". https://trust.drugbank.com/drugbank-trust-center/terms-of-use (updated 2025-09-17). A CC0 "open data" vocabulary file existed in older releases [SECONDARY, not verified on the current release page] | **no** (non-commercial) | no | n/a | login | n/a | **do not use** (flag: non-commercial). CC0 vocabulary not needed: RxNorm covers names |
| S23 | **EMA medicine data** | Centrally authorised EU medicines (incl. a herbal medicines table) | "may be reproduced and / or distributed … for non-commercial and commercial purposes, provided that EMA is always acknowledged as the source"; not for third-party content or the logo. https://www.ema.europa.eu/en/about-us/legal-notice | yes | yes, with "Source: EMA" | no | XLSX, e.g. https://www.ema.europa.eu/en/documents/report/medicines-output-medicines-report_en.xlsx and `…-herbal_medicines-report_en.xlsx` (https://www.ema.europa.eu/en/medicines/download-medicine-data) | nightly | **use now** |
| S24 | **Health Canada Drug Product Database (DPD)** | DIN products, ingredients, strengths, forms, schedules | Dataset licence: "Open Government Licence - Canada". https://open.canada.ca/data/en/dataset/bf55e42a-63cb-4556-bfd8-44f26e5a36fe | yes | yes, with attribution; no endorsement | no | REST `https://health-products.canada.ca/api/drug/drugproduct/?lang=en&type=json` (+ `activeingredient`, `form`, …); bulk https://www.canada.ca/content/dam/hc-sc/documents/services/drug-product-database/allfiles.zip | nightly (files dated 2026-11-02) | **use now** |

Already assessed in `docs/PRODUCT-CHECK-DESIGN.md` §4 and not repeated here: Singapore HSA (use now), ChEMBL, Open Food
Facts / Open Beauty Facts (separate table, L15), WHO alerts (L14), Health Canada LNHPD (use now).

**No share-alike source was found in this round**, so no new separate table is needed under PC-D10.

## 2. Integration notes

### 2.1 TMT fields: Thai brand → ingredient, strength, form (verified on the 2020 CC BY files)

| File | Columns | Use |
|---|---|---|
| `MasterTMT_yyyymmdd.xls` | `TPUCode, ActiveIngredient, Strength, Dosageform, Contvalue, Contunit, DispUnit, TradeName, Manufacturer, FSN, Status` | **One-file mapping**: TradeName → ActiveIngredient + Strength + Dosageform. 30,683 rows, 19,588 trade names, 2,624 ingredient strings (2020) |
| `TP…xls`, `TPU…xls` | `TMTID(TP)` / `TMTID(TPU)`, `FSN`, `MANUFACTURER`, `CHANGEDATE` | FSN pattern `BRAND (maker) (ingredient strength) dose form[, unit]` |
| `GP…xls`, `VTM…xls`, `SUBS…xls`, `GPU…xls` | `TMTID(x)`, `FSN`, `CHANGEDATE` | GP FSN = `ingredient strength dose form`; VTM FSN = ingredient(s) only |
| `GPtoTP`, `VTMtoGP`, `TPtoTPU`, `GPtoGPU`, `GPUtoTPU`, `SUBStoVTM` | two ID columns, e.g. `GPID, TPID`; `VTMID, GPID` | Graph walk TP → GP → VTM |
| `TMTRFyyyymmdd_SNAPSHOT.xls` / `_DELTA.xls` / `_FULL.xls` | snapshot of active TPU; changes since last release; full history (release note) | Weekly-style updates |

Limits seen: only **80 of 30,683 trade names are in Thai script** (most Thai brands are romanised); the Thai FDA
**registration number is not in these files**, so Reg. No. → TMT needs another join (the FDA web service, L13). Scope:
modern human medicines A/B/C only; herbal and traditional products are in TTMT (S3), not TMT. Current release ZIPs put
concept and relationship files under `TMTRFyyyymmdd_BONUS/Concept/` and `…/Relationship/` [SECONDARY: the
`rathpanyowat/tmt-to-fhir` parser; not checked on a current ZIP because it needs a login].

### 2.2 What the owner must do

1. Register a free account at https://this.or.th/wp-login.php?action=register (for S1 and S3). **Downloading for internal
   testing is the owner's decision**: the site states no terms either way.
2. Ask THIS in writing for commercial use and redistribution of TMT / TTMT derived tables (L29). Contacts on the
   download page: TMT 02-027-9711 ext. 9071; email tmt@this.or.th (from the 2020 release note).
3. Optional: ask DTAM and DMSc (L31, L35) and send the UBU letter (`docs/legal/UBU-PHARMACY-COLLAB-TH.md`).

### 2.3 Exact URLs for the integration step

```
# TMT 2020-02-17 (CC BY, no login) — base: https://data.go.th/dataset/ca6ec620-369c-4f56-a8d6-56f1541e5ddf/resource/
caa41e90-aa41-41c0-9316-2b73a1f45cec/download/mastertmt_20200217.xls
637179af-e1b4-4f5d-8dcc-dee8446ada3e/download/tpu20200217.xls
2d4b187f-bd93-4bc0-b05e-f28bb3320b5e/download/tp20200217.xls
f735111c-7df1-4b2c-9a8b-73bee778c523/download/gp20200217.xls
058ccb5c-56b0-4808-90e5-c185fd1c9a6b/download/vtm20200217.xls
7e218ac1-1760-442a-bf15-283bba8f5977/download/gptotp20200217.xls
aaf9fe9f-16a6-474f-b062-118da05ca5a3/download/vtmtogp20200217.xls
f3397fbf-6e37-44af-ad30-0e397c45f2d2/download/tptotpu20200217.xls
b88ca253-d6e2-42f1-9162-95f929e6a5c3/download/thai-medicines-terminology-tmt-pjzk04.zip   (all files)
# TMT / TTMT current (login, permission pending)
https://this.or.th/service/tmt/download/
https://this.or.th/service/ttmt/maste-ttmt-release-file/
# NLEM
https://raw.githubusercontent.com/suradet-ps/thai-nlem-api/main/data/nlem_2567.csv   (MIT; verify vs Gazette)
https://ratchakitcha.soc.go.th/  (official text)
# US
https://api.fda.gov/drug/label.json · https://api.fda.gov/drug/ndc.json · https://api.fda.gov/drug/enforcement.json
https://dailymed.nlm.nih.gov/dailymed/services/v2/spls.json
https://rxnav.nlm.nih.gov/REST/approximateTerm.json?term=<name> · https://rxnav.nlm.nih.gov/REST/rxcui/<id>/related.json?tty=IN
https://www.nlm.nih.gov/research/umls/rxnorm/docs/rxnormfiles.html  (Current Prescribable Content ZIP)
# EU / Canada
https://www.ema.europa.eu/en/documents/report/medicines-output-medicines-report_en.xlsx
https://www.ema.europa.eu/en/documents/report/medicines-output-herbal_medicines-report_en.xlsx
https://health-products.canada.ca/api/drug/drugproduct/?lang=en&type=json
https://www.canada.ca/content/dam/hc-sc/documents/services/drug-product-database/allfiles.zip
# Herbal (permission pending)
https://gdc.dtam.moph.go.th/dataset/34a1a301-6fbe-44e9-b860-886c09de0932/resource/b6be437f-7061-43c8-b9af-d6bb2565155f/download/untitled.csv  (dtam-acad-005)
https://gdc.dtam.moph.go.th/dataset/43bf2f68-8b1e-4966-9967-69334a8cd096/resource/0811280e-72b8-433c-8399-a43c2113249d/download/untitled.csv  (dtamset-06)
```

## 3. Credit lines (paste into `docs/CREDITS-MEDIA.md` / `LICENSES/THIRD_PARTY.md`)

Only for sources marked **use now**. Shown on the result card where the data is used.

- **TMT (2020-02-17)**: "Thai Medicines Terminology (TMT), release TMTRF20200217, by สำนักพัฒนามาตรฐานระบบข้อมูลสุขภาพไทย
  (สมสท.), https://data.go.th/dataset/thai-medicines-terminology-tmt, licensed Creative Commons Attribution (version not stated on data.go.th; link the version counsel confirms under L30,
  e.g. https://creativecommons.org/licenses/by/4.0/).
  Modified: converted to a lookup table; strength and dose form fields reformatted." · TH: "บัญชีข้อมูลยาและรหัสยามาตรฐานไทย (TMT)
  ฉบับเผยแพร่ 17 ก.พ. 2563 โดย สมสท. ที่มา data.go.th สัญญาอนุญาต CC BY ดัดแปลง: แปลงเป็นตารางค้นหา"
- **NLEM**: "National List of Essential Medicines (บัญชียาหลักแห่งชาติ), announcement of the National Drug System Development
  Committee, Royal Gazette <volume / issue / date>. Public government announcement (Thai Copyright Act s.7)." ·
  "Parsing reference: thai-nlem-api by suradet-ps, MIT License, https://github.com/suradet-ps/thai-nlem-api" (keep the MIT
  notice if the CSV or code is copied)
- **openFDA**: "Data from openFDA (U.S. Food and Drug Administration), https://open.fda.gov, CC0 1.0. FDA does not endorse
  LENSIQ."
- **DailyMed**: "Source: National Library of Medicine, DailyMed, https://dailymed.nlm.nih.gov. Label content is the
  responsibility of the labeller. NLM does not endorse LENSIQ."
- **RxNorm / RxNav**: "This product uses publicly available data from the U.S. National Library of Medicine (NLM), National
  Institutes of Health, Department of Health and Human Services; NLM is not responsible for the product and does not
  endorse or recommend this or any other product."
- **EMA**: "Source: European Medicines Agency (EMA), https://www.ema.europa.eu."
- **Health Canada DPD**: "Contains information licensed under the Open Government Licence – Canada
  (https://open.canada.ca/en/open-government-licence-canada). Source: Health Canada Drug Product Database. Health Canada
  does not endorse LENSIQ."

## 4. Legal review items (continue `docs/CTO-BRIEF.md` §8)

| # | Item | Why | Where in code / docs | Status | Added |
|---|---|---|---|---|---|
| L29 | TMT / TTMT current release files (THIS / สมสท.) | No licence on the pages; "สงวนลิขสิทธิ์" footer; login; HSRI catalogue label "Open Data Common" undefined. Written permission for commercial use and redistribution of derived tables needed before charging; is TMT a s.7(5) state compilation? | `docs/product-check/DRUG-DATA-SOURCES.md` S1, S3 | open | 2026-11-10 |
| L30 | TMT 2020-02-17 snapshot under CC BY | CC BY version not stated on data.go.th; does CC BY on the old release cover our derived table, and may it be mixed with later (unlicensed) releases? Six-year-old data shown to users needs a "data as of" label | S2 | open | 2026-11-10 |
| L31 | data.go.th "Open Data Common" and "License not specified" datasets (Thai FDA licensee lists, DTAM herbal codes and herbal NLEM structure) | The label has no definition in any Thai CKAN licence list; ask DGA / the data owner what it permits | S14, S16 | open | 2026-11-10 |
| L32 | NLEM via the Royal Gazette and the MIT thai-nlem-api CSV | Confirm s.7(3) / s.7(5) covers our own table of the announcement; the CSV's origin is not stated, so verify against the Gazette | S4, S5 | open | 2026-11-10 |
| L33 | RxNav: no RxClass without UMLS; DailyMed label text | RxClass carries SNOMED CT; DailyMed text belongs to labellers, so store derived facts and link out only | S8–S11 | open | 2026-11-10 |
| L34 | Thai traditional medicine knowledge (national formulas, Positive List) | DTAM CSVs are CC BY-NC; national formulas are protected under the TTM Knowledge Protection Act B.E. 2542; may we show formula names or herbal Positive List facts rebuilt from MoPH announcements? | S17, S18 | open | 2026-11-10 |
| L35 | Thai Herbal Pharmacopoeia (DMSc) | Copyright notice; no reuse licence; ask DMSc before using monograph content | S19 | open | 2026-11-10 |
| L36 | University herbal databases and the UBU collaboration | No open licence; a collaboration agreement (data rights, credit, publication, no personal data) is needed before using any faculty data or pharmacist labels commercially | S20; `docs/legal/UBU-PHARMACY-COLLAB-TH.md` (not sent) | open (letter drafted) | 2026-11-10 |
| L37 | icdevelop/thai-pharma-kb | HAI-DEF terms applied to a dataset (pass-on restrictions, Notice file); TMT rights not cleared; `ingredient_kb.jsonl` is AI-generated. Not used: record the decision | S12, S13 | closed: not used (2026-11-10) | 2026-11-10 |
| L38 | DrugBank and WHO ATC/DDD | Non-commercial / no commercial copying; not used. If ever needed: DrugBank commercial licence, WHO CC permission | S21, S22 | open (not used) | 2026-11-10 |
