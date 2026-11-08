# vendor/pillbox — slim Pillbox imprint index (not under vendor/data/: .gitignore excludes every data/ folder)

Used by `medicine.html` (mode "loose pill") to list **candidate** products whose imprint, colour, shape and size
match what the user typed. The file is lazy-loaded only when the user opens the loose-pill search (about 3.3 MB raw,
about 1.1 MB gzip as GitHub Pages serves it) and then cached by `sw.js` (cache-first for `vendor/`).

| File | What |
|---|---|
| `pillbox-2020-v1.json` | the index (format `lensiq-pillbox-slim/1`) |
| `LICENSE.txt` | public-domain notice, required NLM attribution, NLM warning |

**NLM warning (verbatim):** "These files will not be updated and should not be used for pill identification."

## Format

```
{ format, source, source_url, license, nlm_warning, built, stats,
  cols: ["imprint","color","shape","size_mm","score","name","strength","rxcui","setid","source","dea","n"],
  colors: [...], shapes: [...], names: [...], strengths: [...], sources: [...], dea: [...],
  rows: [[imprint, colorIdx, shapeIdx, size_mm, score, nameIdx, strengthIdx, rxcui, setid32, sourceIdx, deaIdx, n], ...] }
```

- `imprint` is Pillbox `splimprint` upper-cased; `;` separates the two sides (e.g. `5892;V`).
- `color` may be several colours joined by `;` (capsule halves).
- `setid32` is the SPL set id without dashes (DailyMed link: `https://dailymed.nlm.nih.gov/dailymed/lookup.cfm?setid=<uuid>`).
- `source`: HRX = human prescription, HOTC = human OTC, HOMEO = homeopathic, ANIMAL = veterinary, REMAIN = other.
- `n` = number of SPL rows merged into this row (same imprint + colour + shape + size + score + name + strength).
- Rows without an imprint (1,947 of 83,925) are dropped.

## Rebuild

```bash
curl -L -o /tmp/pillbox/pillbox.csv 'https://datadiscovery.nlm.nih.gov/api/views/crzr-uvwg/rows.csv?accessType=DOWNLOAD'
node tools/build-pillbox.mjs /tmp/pillbox/pillbox.csv
```

Built 2026-11-08 from a CSV with SHA-256 `e7aab1eafc0516a951696590f1d67ff23223fc06ca3fb85bf2f3144f4699f6bb`
(83,925 rows) -> 35,171 merged rows. The data will not change (Pillbox is retired); if the format changes, bump the
file name (`-v2`) so the service-worker cache picks up the new file.
