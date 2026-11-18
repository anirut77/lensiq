# Crisis net: list for the mental-health expert review

The crisis net (`fortune-crisis-net.js`, one pattern source; copied into `fortune-crisis.js` by `tools/fortune-read-embed.mjs` and
loaded by the fallback stand-in in `fortune-read.js`) has not been reviewed by a mental-health professional. This page lists
the topics the expert is asked to review. Every number states its source.

## Locks

| Lock | When | Files | Why |
|---|---|---|---|
| `crisis-endall` | 2026-11-18, before the product change | `end-it-all-set.json` (= crisis-v3-protect set, sha256 8b62de1a…), `end-it-all-union-measure.mjs`, `tests/unit/crisis-endall.test.js` | owner decision 105 ค: E1 every crisis sentence caught by either pattern is caught; E2 ≥ 22/24 caught; E3 no new false positive on the set; E4 one pattern source |
| `crisis-endall` re-lock 1 | 2026-11-18, before the first commit and any measurement | `tests/unit/crisis-endall.test.js` | format fault only: the reference regex split over two lines (max 200 characters); same pattern, no assertion changed |

## Topic 1: the English phrase "end it all" (owner decision 105 ค, 2026-11-18)

**What the net does now.** Two English patterns, used together (either one is enough):

1. `end it all`, except when followed by "with", "between" or "off" (the pattern since review round 2).
2. Added 2026-11-18: a first-person or intent word (I, I'm, I'll, me, wanna, gonna, want to, ready to, decided to, time to,
   planning to, might, just, …) up to 25 characters before "end it all" or "ending it all", or pills / rope / bridge /
   tonight / forever up to 20 characters after it. This one has no with / between / off exclusion, so "I want to end it all
   with pills" and "I'll end it all off the bridge" are caught.

**Numbers.** Source: synthetic (24 crisis + 24 ordinary English sentences, written by the agent; crisis-v3-protect set,
locked as `crisis-endall`). No field data and no public dataset.

| Net | Crisis caught | Ordinary sentences flagged (false positives) | Precision |
|---|---|---|---|
| Before (pattern 1 only) | 20 / 24 (83.3 %) | 21 / 24 (87.5 %) | 48.8 % |
| Pattern 2 alone (not used alone) | 21 / 24 (87.5 %) | 3 / 24 (12.5 %) | 87.5 % |
| **Now (1 or 2)** | **23 / 24 (95.8 %)** | **21 / 24 (87.5 %)** | 52.3 % |

The same numbers hold for the fallback used when `fortune-crisis.js` fails to load. The fortune pages' own check
(`fortune-ai.js`, which adds an older list to this net) went from 22 / 24 to 23 / 24 crisis caught and flags 24 / 24 ordinary
sentences (its older list has "end it all" with no exclusion at all).

Still missed: "thinking of ending it all" (no first-person word, nothing after). False positives stay high on purpose: the
owner chose to catch more and accept that an ordinary sentence such as "The parade will end it all at the town square" starts
the gentle crisis session (the reading continues; the closing line with 1323 is shown at the end; nothing says the person was
flagged). The synthetic ordinary sentences are deliberately hard; how often such sentences reach a fortune page is not
measured.

**Request to the expert.**

1. Is "end it all" with no other signal enough to start the crisis session, given the false-positive cost above?
2. Which other English wordings of the same intent should be caught ("thinking of ending it all", "be done with it all",
   "check out", …)?
3. Please review the **full phrase list** in `fortune-crisis-net.js` (Thai `TH`, English `EN`, Chinese `ZH`, and the few
   Korean / Malay / Vietnamese / Japanese phrases), plus the older lists in `fortune-ai.js` (`CRISIS_TH`, `CRISIS_EN`,
   `CRISIS_ZH`): missing phrasings, phrases that should not start the crisis session, and the dying-of-laughter joke
   exception (`อยากตายเพราะหัวเราะ`).
