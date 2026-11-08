# Retention table

Every place LENSIQ stores data, per module, with default retention and the delete procedure. The list was compiled by searching the source for `localStorage`, `sessionStorage`, `indexedDB.open` and `LQVault` (2026-11-06). *Not legal advice.* Set your own retention in the DPIA and apply it with the procedures below.

**Conventions**

- *LS* = `localStorage`, *SS* = `sessionStorage` (cleared when the tab closes), *IDB* = IndexedDB. All are per browser profile and per origin.
- "Until cleared" means the software applies **no automatic expiry**. The operator must apply the retention period manually (export, then clear) or by wiping the device.
- **Universal wipe:** Browser settings → Site settings → *this site* → **Clear data**. This removes LS, SS, IDB, Cache Storage and the face-vault keys for that origin. Use it for decommissioning and lost devices.

## Personal and sensitive data

| Module | Key / store | Data class | Default retention | How to delete |
|---|---|---|---|---|
| customers | `lqv-cx-faces` (LS, AES-GCM envelope) + key `face-v1:lqv-cx-faces` in IDB `lensiq-vault` | **Biometric (sensitive, s.26):** 128-D face descriptor per member | **365 days since last visit** (choices: 30/90/180/365/730). Expired descriptors are deleted on page load. | Per member: profile → delete face data. All: "ลบข้อมูลใบหน้าทั้งหมด" (delete all face data) wipes the ciphertext **and** its key. |
| customers | `cx-members` (LS) | Name, phone, created, consentAt, lastSeen, faceDeletedAt | Until cleared. The member record stays after the face expires (needed for order history). | Delete the member in the page, or clear site data. **Set a review cycle in the DPIA.** |
| customers | `cx-orders` (LS) | Order history linked to a member id | Until cleared | Delete the member / clear site data |
| customers | `cx-privacy` (LS) | Retention setting | n/a | n/a |
| attendance | `lqv-att-faces` (LS, encrypted) + IDB key | **Biometric:** descriptor per person | **365 days since last check-in** (30–730) | Per person: delete. All: "ลบข้อมูลใบหน้าทั้งหมด" (also removes `att-people`). |
| attendance | `att-people` (LS) | Name, code, created, lastSeen | Same as the face record (expired faces are removed from matching) | As above |
| attendance | `att-logs` (LS) | Check-in events (person id/name, time) | Until cleared | Export CSV, then clear logs in the page or clear site data |
| booth | `booth-desc` (SS) | **Biometric (anonymous):** same-day visitor descriptors | **Until the day changes** (checked every 60 s) or the tab closes | "Purge" button. Automatic at the day change. |
| booth | `lqv-booth-desc` (LS, encrypted) + IDB key | Same-day descriptors, **only when "remember" is ticked** | Until the day changes | Automatic. It is wiped when "remember" is turned off. |
| booth | `booth-state`, `booth-prefs` (LS) | Event name, counts, dwell, timeline (no identity) | Until cleared | Reset event in the page / clear site data |
| neuro | `nm-sessions` (LS) | Participant session label + expression series | Until cleared | "ลบผลนี้" (delete this result) per session / clear site data. Use pseudonymous labels, not names. |
| driver | `dr-trips`, `dr-events` (≤5000 events), `dr-current`, `dr-settings`, `dr-cam`, `dr-muted` (LS) | Trip and drowsiness events (time, type, level) | Until cleared. Events are capped at 5000. | "Clear data" button in the page |
| faceread | `fr-leads` (LS) | Nickname, contact, consent text, element (**opt-in form, off by default**) | Until cleared | Export CSV → "ลบข้อมูลลูกค้าทั้งหมด" (delete all customer data) |
| index (home) | `lq-leads` (LS) | Demo-request form: name, org, email, phone, message (**not sent anywhere**) | Until cleared | Clear site data |
| insights | *Exported backup file* `lensiq-backup-*.json` | Copy of all module keys (`cx-*`, `att-*`, `st-*`, …) **including names and phones**. Excludes `lqv-*` face data and the `lq-agg` token. | Wherever the operator saves it | Treat as personal data: encrypt at rest and delete when no longer needed |

## Aggregate / non-personal data

| Module | Key / store | Data class | Default retention | How to delete |
|---|---|---|---|---|
| store | `st-settings`, `st-cams`, `st-cam-c1…c4` (LS) | Lines, zones, camera choice | n/a | Clear site data |
| store | `st-day-YYYY-MM-DD` (LS) | Daily counts, hourly, zones, queue | Until cleared | "ลบข้อมูลสถิติ" (delete stats) removes `st-day-*`, `st-agg-*` and `st-heat*` |
| store | `st-heat-c1…c4` (LS) | Heatmap grid (density only) | Until cleared | As above, or reset per camera |
| store | `st-agg-YYYY-MM-DD` (LS) | Cached aggregates from other nodes (numbers) | Until cleared | As above |
| store | `lq-agg` (LS) | Hub/node role, hub URL, device name, pairing code (hub), **device bearer token** (node), pending packs | Until unpaired | Unpair in the page. Revoke on the hub (see the deployment checklist). |
| signage | `sg-stats`, `sg-settings`, `sg-ads`, `sg-pop` (LS); IDB `sg-media` | View counts and dwell by ad; ad images | Until cleared | "Clear stats" (removes all `sg-*`) |
| checkout | `co-cart`, `co-stock`, `co-settings`, `co-sales`, `co-seq`, `co-seeded`, `co-cam` (LS); IDB `co-checkout` | Sales and stock; product samples and thumbnails | Until cleared | "Clear sales" / clear site data |
| qc | `qc-recipes`, `qc-active`, `qc-shift`, `qc-settings` (LS); IDB `lensiq-qc` | Inspection results, reject thumbnails, background frames | Until cleared | Clear in the page / clear site data |
| photobooth, studio | IDB `pb-templates`; `pb-kiosk` | Operator outfit and frame templates | Until deleted | Delete the template in the page |
| fortune pages | `fr-/palm-/hs-/tarot-/fs-/nm-/ic-/zd-/as-/dm-` `stats` and `prefs` (LS) | Anonymous counters (totals per day, category tallies) | Until cleared. They can be switched off per page. | "ล้างสถิติ" (clear stats) per page |
| AI fortune | `fa-consent` (LS) | Consent flag ("1"/"0") | Until changed | Untick the consent checkbox |
| shared | `lq-camcap` (LS) | Camera capability probe | n/a | n/a |
| insights | `iq-range`, `iq-compare`, `iq-range-custom`, `iq-goals`, `iq-alerts`, `iq-demo` (LS); `iq-notified` (SS) | Dashboard preferences | n/a | n/a |
| service worker | Cache Storage (versioned) | Model and library files | Replaced on version bump | Clear site data |

## Server (`server.py`)

| Data | Location | Retention | How to delete |
|---|---|---|---|
| Aggregate packs, device list, token hashes, pairing code | `data/agg.json` (`LENSIQ_DATA_DIR`) | **62 days** (`AGG_LIM["days_kept"]`, oldest pruned on each push) | Per device: `DELETE /api/agg/node/<id>` with the pairing code (or the hub UI). All: stop the server and delete `data/agg.json`. |
| PDF / DOCX | OS temp dir | Request lifetime | Automatic |
| Try-on / fortune payloads | Memory | Request lifetime | Automatic |
| Web server / proxy access logs | Operator-configured | Operator policy (recommend ≤ 90 days) | Log rotation |
| `certs/` (self-signed key) | Hub machine | 825-day certificate | Delete `certs/` to regenerate |

## Cloud backend — members and billing (`backend/`, Cloudflare Worker + D1)

Only when the controller deploys the Worker and sets `LENSIQ_API_BASE` (ROPA M16–M18, M22a–h). Automatic purges run in the daily cron (`backend/src/retention.js`, "17 3 * * *"). Account erasure is `DELETE /api/me` (`backend/src/members.js` `deleteAccount`) from `account.html`.

| Data | Table | Default retention | On account deletion |
|---|---|---|---|
| Member profile: random account id, Google `sub`, verified e-mail, optional given name (≤ 40 chars), status, accepted terms version + time, marketing opt-in + time, created / last login. **No avatar/profile photo, no Google access token.** | `users` | Until the member deletes the account (or the admin deletes it on request). No inactivity expiry yet: **[controller to confirm a review period, e.g. 24 months without login]** | Row deleted |
| Member sessions (SHA-256 of the token only) | `member_sessions` | 30 days absolute, 14 days idle; deleted at logout | All deleted |
| Sign-in nonces (hash only, not linked to a person) | `auth_nonces` | 10 minutes; single use | n/a |
| Usage / transaction ledger (kind, fortune domain, time, payment ref, amount — no reading text) | `member_ledger` | Usage rows 400 days (`MEMBER_LEDGER_DAYS`); `payment` and `refund` rows until account deletion | All deleted |
| Saved readings (derived result the member chose to save, ≤ 16 KB, max 50 per member) | `saved_readings` | Until the member deletes the item or the account | All deleted |
| One-time purchase credits / complimentary grants (feature, granted/remaining, payment id, expiry) | `credits` (`0006_consumer_pricing.sql`) | Until used up or `expires_at` (NULL = no expiry). [controller to confirm a purge of spent credits] | All deleted |
| Usage counters (quota) | `usage_counters` | 35 days | Member's counters deleted |
| Payments, subscriptions, receipt / tax-invoice party | `payments`, `subscriptions`, `customers` | **≥ 5 years** (Revenue Code accounting records) — never purged by the cron | Kept but unlinked: `user_id` → NULL, `payments.buyer_email` and `customers.email` → NULL, active subscription → cancelled. Tax-invoice buyer fields stay as the law requires. |
| Payment webhook raw payloads (Opn; may contain buyer e-mail) | `webhooks.payload` | Payload set to NULL after 90 days (`WEBHOOK_PAYLOAD_DAYS`); the event row (id, status, signature result) stays with the payment | **Not cleared early** — the payload ages out at 90 days. [controller to confirm, or add an early wipe] |
| Audit log (action, random account id, day-salted IP hash, secrets scrubbed; no e-mail or token) | `audit_log` | 400 days (`AUDIT_DAYS`) | Kept, including the `member.deleted` entry as proof of erasure. After deletion the random id no longer links to an e-mail or Google account; daily salts are deleted, so IP hashes cannot be linked across days. |
| Member sessions — short kind (round 12, optional) | `member_sessions.kind = 'short'` | 12 h absolute, 1 h idle; refreshed tokens at most 7 days after the Google sign-in | All deleted |
| Transactional e-mail delivery log (round 12): kind, document ref, member id, provider message id, outcome — no address / subject / body | `mail_log` | 400 days (`AUDIT_DAYS`) | Member id set to NULL (the row no longer links to anyone) |
| E-mail opt-outs (round 12) | `users.email_receipts`, `users.email_reminders` | With the account | Row deleted |
| CSP violation report counters (round 12): directive, blocked origin, page path, count | `csp_reports` | 90 days (`CSP_REPORT_DAYS`) | Not linked to members |
| Raw analytics events / aggregates | `events` / `daily_agg` | 90 days raw (`RAW_EVENT_DAYS`), aggregates kept (not personal) | Not linked to members |

## Recommended operator settings

| Data | Suggested retention |
|---|---|
| Customer face descriptors | 90–180 days of inactivity (shorter than the 365-day default) |
| Attendance face descriptors | Course length + 30 days. Wipe after the event series ends. |
| Attendance logs | As required by the training contract or certificate rules, then export and clear |
| Store / booth / signage aggregates | 13 months for year-on-year comparison is typical. These are not personal data, but apply a limit anyway. |
| Lead forms | 6–12 months, or until the follow-up is complete |
