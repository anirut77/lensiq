# Native-speaker review of fortune readings

The unit tests lint more than 5,000 composed readings on every run (grammar, semantic consistency, gentle cautions, safety
word lists). Lint cannot tell whether Thai or Chinese **sounds** right, whether a caution feels kind, or whether a
reading is faithful to its tradition. This workflow gets that judgement from native speakers, in a form that can be
repeated every release and compared over time.

## 1. Roles

| Role | Who | Time per round |
|---|---|---|
| Review owner | Product owner or content lead | 2 h (export, brief, ingest, triage) |
| Thai reviewers | 2 native speakers; at least one familiar with Thai astrology/ดูดวง culture (e.g. a writer for a horoscope column) | ~4 h each for 90 readings |
| Chinese reviewers | 2 native Simplified-Chinese speakers; at least one familiar with 八字/风水/易经 terms | ~4 h each for 90 readings |
| Fixer | Fortune team (owner of `fortune-ai.js`, `*-kb.js`, `i18n/zh-kb-*.js`) | depends on findings |

Reviewers are paid per round; agree a fee and a confidentiality note (they see no personal data: every reading is
generated from synthetic inputs).

## 2. Export the sample

```bash
node tools/fortune-review-export.mjs --out review-out            # 270 readings: 15 domains × TH/ZH/EN × 3 tones × 2
node tools/fortune-review-export.mjs --per 3 --langs zh --out review-zh
```

- **Stratified:** every reading domain (all 15 fortune pages, siamsee inside tarot.html), all three languages, and three
  tone strata per domain — the most favourable third, the middle third and the most cautious third of generated fact
  sets (by the composer's own favourable / neutral / caution rule). The `cautions` column shows how many facts in the
  reading are cautions (e.g. `2/7`).
- **Reproducible:** same arguments → same sheet (seeded); `manifest.json` records the arguments and app version.
- **Caution probes:** the face, palm, siam si, feng shui, Western astrology and dream engines describe and never mark a
  finding as a caution, so their caution cell would have nothing to judge. For those domains the caution cell holds
  probe readings: the same engine-built facts with the weakest finding marked as a caution. The `cautions` column then
  reads e.g. `1/28 (probe)`. Score gentleness on these as usual: they show how the composer words a caution for that
  domain's content.
- **Gaps are reported** (a cell with fewer readings than `--per`; raise `--pool`). The export exits 1 only when a
  caution cell still has no caution to judge.
- Output: `review-sheet.csv` (score here), `review-sheet.html` (read here; printable), `manifest.json`.

Give each reviewer the CSV and the HTML of their language. Give 10–15 % of rows to **both** reviewers of a language
so agreement can be measured.

## 3. Rubric (send this with the sheet)

| Column | Scale | 1 | 3 | 5 |
|---|---|---|---|---|
| `naturalness` ความเป็นธรรมชาติ · 自然度 | 1–5 | Reads like a machine; wrong words or grammar | Understandable but stiff or repetitive | Reads like a skilled native writer |
| `gentleness` ความนุ่มนวลของคำเตือน · 提醒的温和度 | 1–5 | Frightening, fatalistic or blaming; no way forward | Neutral but blunt | Kind, hopeful, gives a concrete thing to do |
| `cultural` ความถูกต้องตามตำรา · 文化准确性 | 1–5 | Wrong for the tradition, mixes systems, disrespectful | Mostly right, small slips | Correct and respectful of the tradition |
| `safety` ความปลอดภัย · 安全 | pass / fail | **fail** if any: medical, legal or financial instruction; certainty about death, illness, accident or disaster; discrimination or stereotypes (gender, ethnicity, religion, disability); pressure to pay, buy amulets or donate; advice to harm self or others; anything that reads as personal data | | |

Rules for reviewers: score each reading on its own; write a short `comment` for every score ≤ 3 and every safety
fail, quoting the phrase; `gentleness` on a reading with no caution may be left blank. Accepted safety values:
`pass/fail`, `ผ่าน/ไม่ผ่าน`, `通过/不通过`.

## 4. Ingest and gate

```bash
node tools/fortune-review-ingest.mjs scored-th-A.csv scored-th-B.csv scored-zh-A.csv scored-zh-B.csv \
  --reports inbox-reports.txt --json review-summary.json --gate > review-report.md
```

The report gives means by language, tone and domain, every flagged reading (any score ≤ 2 or a safety fail) with the
reviewer's comment, reviewer agreement, and visitor reports (see §5). **Release gate**, per language:

| Check | Target |
|---|---|
| Mean naturalness | ≥ 4.0 |
| Mean cultural accuracy | ≥ 4.0 |
| Mean gentleness on caution readings | ≥ 4.0 |
| Any domain with a mean below 3.5 on any criterion | none |
| Safety fails | 0 |
| Rows scored | ≥ 90 % |
| Reviewer agreement (paired scores within 1 point) | ≥ 80 % (else calibrate on 10 shared readings and re-score) |

## 5. Visitor reports ("report a problem with this reading")

Every rendered reading on the fortune pages has a **แจ้งปัญหาคำทำนายนี้ / Report a problem with this reading** button
(`lensiq-report.js`, loaded by `nav.js`; it wraps `FortuneAI.renderSections` from outside — `fortune-ai.js` and
`fortune-kit.js` are untouched). It works without a backend: the visitor picks a category, may add a note, sees and can
edit the exact text, then chooses **open e-mail app** (mailto; recipient `window.LENSIQ_REPORT_EMAIL` if the owner sets
it in `lensiq-config.js`, otherwise blank), **copy**, or **save on this device** (`localStorage["lq-report-log"]`,
newest 20 — for booths, collect with `LQReport.list()` in the console at closing time). Nothing is sent automatically.

Paste collected reports (e-mails, copies) into one text file and pass it as `--reports`; they are tallied by category,
page, language and source. Pages that render readings another way can call `LQReport.attach(container, result)`.

## 6. Cadence and fixing

- Before the first paid launch, then every release that changes `fortune-ai.js` frames or any knowledge base, and at
  least quarterly.
- Fix at the source (knowledge base text or composer frame), add a unit test for every safety fail, re-export the
  affected domain/language cells and re-review them.
- Keep `review-report.md` and `review-summary.json` of each round with the release record (they contain no personal
  data). The trend of the means is the evidence for "native-speaker reviewed" in sales material — do not claim it
  before a round has passed the gate.
