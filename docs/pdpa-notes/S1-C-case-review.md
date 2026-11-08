# PDPA note — S1-C Case review tool (`case-review.html`)

For the owner's counsel (pre-sale review). Draft by the builder; not legal advice.

## What the feature does
A reviewer opens video clips from local files, adds timestamp tags and notes, changes the case status
(open / in review / closed) and exports an audit log (CSV / JSON) or a printable case summary. Every action is
written to an append-only audit log with the reviewer's name, the time (UTC) and a SHA-256 hash chained to the
previous entry, so editing or removing an entry on the device can be detected ("check integrity").

**Not lie / deception detection.** The page does no automated analysis of the video at all: no face detection or
recognition, no emotion inference, no voice / stress / credibility analysis, no AI model is loaded. A banner says
"this tool does not judge whether anyone is telling the truth or lying"; the tag types are limited to observable
facts (event seen, speech / key statement, document / object shown, person enters / leaves frame, picture / sound
unclear, needs a second reviewer, other). Unit tests assert that no camera, AI or network API is used and that no
emotion / deception vocabulary appears in tag types, actions or statuses.

## Personal data involved
| Data | Where | Default | Retention |
|---|---|---|---|
| Video clips (may show identifiable people, possibly employees / customers) | read from a local file into memory (object URL) | **not stored**; gone when the page closes | n/a |
| Stored copy of a clip | IndexedDB `lensiq-case`, AES-GCM 256, non-extractable key in the same browser | **off**; only when the reviewer taps "store encrypted on this device" per clip (logged); only a file whose fingerprint matches the original can be stored | auto-deleted after 7 / 30 (default) / 90 / 180 / 365 days, **checked when case-review.html is opened** (so the copy is removed on the first visit after expiry, not at the exact moment); logged as `clip.purge` in the case log, or in the device ledger when the case log cannot take the entry; "delete stored copy" any time |
| Clip metadata: file name, size, duration, SHA-256 fingerprint | localStorage `lqcase-cases` | yes | until the case is deleted |
| Case title, reference no., tags, notes, status, reviewer names, audit log | localStorage `lqcase-cases` (plain text, not encrypted) | yes | until the case is deleted or "delete all" |
| Device ledger: case deletions (case id, who, when, entry count, last hash; no title / notes), retention-setting changes (who, from, to), purges that could not be written to a case log (case id, clip id) | localStorage `lqcase-ledger` | on those events | until "delete all" |
| Reviewer name (self-declared, no authentication) | localStorage `lqcase-reviewer` | yes | until "delete all" |

Nothing leaves the device: no upload, no server call, no analytics events are sent by this page's own scripts
(the shared nav / analytics opt-in of the site applies as on every page). Exports are files the reviewer saves
deliberately; they contain no video.

## Points for counsel
1. **Purpose / lawful basis** — typically HR investigations, incident review, security. The controller is the
   customer organisation; LENSIQ provides software running on the customer's device (processor-like role, but no
   data reaches LENSIQ). Basis is likely legitimate interest (s.24(5)) or legal obligation; employees / visitors
   should be informed by the organisation's CCTV / investigation notice (page shows a reminder).
2. **Sensitive data (s.26)** — notes are free text and could contain health, criminal or other sensitive data. The
   UI warns "do not enter more sensitive data than needed". Consider whether the contract / guide should require it.
3. **Notes are not encrypted at rest** (only stored clips are). Mitigation today: device-local, screen-lock advice,
   delete case / delete all. Deferred option: encrypt case logs with the same IndexedDB key (see below).
4. **Reviewer identity is self-declared** — the audit log proves the record was not altered after the fact on that
   device, not who the person really was. Should be stated in customer docs; the page says so.
5. **Hash chain limits** — the chain is an unkeyed SHA-256 chain. It detects edits made *outside* the page (a
   hand-edited localStorage value, a doctored JSON export) but it is **tamper-evident, not tamper-proof**:
   - anyone with access to the device / browser dev tools can rewrite an entry and recompute every hash after it
     (the hashing code is public and in the page); the rebuilt chain then checks as consistent;
   - truncating the newest entries is not detectable from the log alone;
   - someone with device access can delete the whole case (the deletion ledger records it, but the ledger is on the
     same device and has the same limits).
   The real anchor is the **last hash on a printed summary or an export kept elsewhere** (with someone other than the
   reviewer). The UI therefore says "hash chain consistent / no edits made outside this page were found — compare the
   last hash with a printed or exported copy", not "cannot be edited". Customer docs for HR / disciplinary use must
   say the same. A device-bound HMAC key was considered and not used: it would not stop someone using the page itself,
   and it would stop exports from verifying on another reviewer's device.
6. **Data-subject rights** — access: export JSON / CSV / printed summary; erasure: delete case (clips + log) with a
   minimal ledger entry kept (justify as accountability record, or allow "delete all"); objection: organisational.
7. **Retention** — stored clips auto-delete (default 30 days), on the next visit to the page after expiry (a static
   site has no background job). Changing the period needs a reviewer name and is written to the device ledger; a
   shorter period that would delete stored clips immediately must be chosen twice. Case logs have no automatic
   retention; consider a default retention period for closed cases in a later round.
9. **File identity** — a clip's SHA-256 fingerprint is computed in memory (limit 1 GB on desktop, 256 MB on phones /
   low-memory devices). Re-opening a file records `match: true` (same file), `false` (different file) or `null` (could
   not be verified, e.g. too large). Tags and notes made while a non-matching or unverified file is open record that
   file's fingerprint (`loaded`) and show a warning in the page, CSV detail and printed summary.
10. **Separate clip vault (deviation from the round spec, needs sign-off)** — the spec says "IndexedDB + LQVault". The
   case clips use the same scheme (AES-GCM 256, non-extractable WebCrypto key in IndexedDB) but their own key store
   (`lensiq-case`), so that "delete all face data" on face pages does not lock case clips and vice versa. Consequence
   for privacy text: **deleting face data does not delete case clips**; they are deleted with "delete stored copy",
   "delete this case", "delete all case-review data" or retention. privacy.html must say this.
8. **Exports** leave the tool's control once saved; customer policy should cover where exported files are kept.

## Deferred (and why)
- Encrypting case logs / notes at rest: needs a migration path and a fallback for non-secure contexts; kept out of
  this round to avoid blocking use on http:// installs. The clip vault already uses a separate key store from
  LQVault so "delete all face data" elsewhere does not lock case clips (and vice versa).
- Multi-device / shared review: handled by JSON export -> import (chain re-verified on import); no server sync.
- Automatic retention for closed cases (see point 7).
