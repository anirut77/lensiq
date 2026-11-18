# Crisis net: list for the mental-health expert review

The crisis net (`fortune-crisis-net.js`, one pattern source; copied into `fortune-crisis.js` by `tools/fortune-read-embed.mjs` and
loaded by the fallback stand-in in `fortune-read.js`) has not been reviewed by a mental-health professional. This page lists
the topics the expert is asked to review. Every number states its source.

## Locks

| Lock | When | Files | Why |
|---|---|---|---|
| `crisis-endall` | 2026-11-18, before the product change | `end-it-all-set.json` (= crisis-v3-protect set, sha256 8b62de1a…), `end-it-all-union-measure.mjs`, `tests/unit/crisis-endall.test.js` | owner decision 105 ค: E1 every crisis sentence caught by either pattern is caught; E2 ≥ 22/24 caught; E3 no new false positive on the set; E4 one pattern source |
| `crisis-endall` re-lock 1 | 2026-11-18, before the first commit and any measurement | `tests/unit/crisis-endall.test.js` | format fault only: the reference regex split over two lines (max 200 characters); same pattern, no assertion changed |
