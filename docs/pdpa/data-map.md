# Data map

How personal data flows through each LENSIQ module: **source → processing → storage → transfer**. Compiled from the source code (2026-11-06). *Not legal advice.*

"Device" means the browser profile on the kiosk, laptop, tablet or phone running the page. Browser storage is **per origin**: data saved at `https://192.168.1.20:8443` is separate from data saved at `http://localhost:8000` or `https://<user>.github.io`.

## Common to every page

| Flow | Detail |
|---|---|
| Static files | HTML, JS, models from the host (GitHub Pages, your static host, or `server.py`). The host sees normal web request logs (IP, user agent, URL). |
| Fonts | **Self-hosted since v0.10.** The Prompt font comes from `vendor/fonts/prompt/` on the same host (OFL). No page contacts Google or any other third-party origin: the CSP allows only `'self'`, and `tools/check-external.mjs` verifies this headless on all pages. Chinese text uses the visitor's OS fonts. |
| Service worker | `sw.js` caches `vendor/` models locally (Cache Storage). These are not personal data. |
| Camera | `getUserMedia` frames are processed in memory, frame by frame. They are **never** written to storage or sent over the network by the analytics modules. |

## Per module

| Module | Source | Processing (on device) | Stored on device | Leaves the device? |
|---|---|---|---|---|
| `store.html` store analytics | Overhead camera(s) | COCO-SSD person boxes, tracking, line crossing, zones, queue. Optional re-ID: MobileNet appearance vector, **memory only**, short window, off by default. | Daily counts, hourly series, zone dwell, heatmap grid (`st-*`). No images, no IDs. | **Node mode:** numeric daily pack to your own hub `server.py` over HTTPS (LAN). Fields: in/out, hourly in/out, occupancy, peak, max queue, zone visits/dwell, per-camera in/out, device/zone names. No images, boxes or descriptors. |
| `booth.html` booth analytics | Camera facing the booth | Face detection, 128-D descriptor for same-day repeat-visitor matching, expression for engagement. | Counts and timeline (`booth-state`). Same-day descriptors in `sessionStorage` (`booth-desc`, per tab). Only if "remember" is on: an encrypted same-day copy (`lqv-booth-desc`). All are purged at the day change. | No |
| `signage.html` smart signage | Camera on the screen | Face detection, attention/dwell, expression. Age/gender **only when the setting is on**. Hand gestures. | Aggregate stats (`sg-stats`), ad settings. Ad images uploaded by the operator (IndexedDB `sg-media`). | No |
| `neuro.html` neuromarketing | Webcam facing participant (consent) | Expression → valence/arousal time series | Sessions: label, numeric series (`nm-sessions`) | No |
| `customers.html` customer recognition | Counter webcam, **enrolled consenting members** | Face descriptor matching | Member name, phone, consent time, last seen (`cx-members`). Orders (`cx-orders`). **Descriptor encrypted** (`lqv-cx-faces`, key in IndexedDB `lensiq-vault`). | No |
| `attendance.html` attendance | Registration webcam/tablet | Face descriptor matching | Person name and code (`att-people`), check-in logs (`att-logs`), **descriptor encrypted** (`lqv-att-faces`) | No |
| `driver.html` drowsiness | Driver-facing (IR) camera | Eye/mouth ratios, head pose | Trip and event log: type, time, level (`dr-*`). No images. | No |
| `checkout.html` product scan | Camera over the counter | MobileNet embeddings of **products** | Products, teach samples, product thumbnails (IndexedDB `co-checkout`), sales (`co-*`) | No (people should not be in frame) |
| `qc.html` production QC | Fixed line camera | Classical image measurements of **products** | Recipes, shift stats, reject thumbnails, background frames (IndexedDB `lensiq-qc`, `qc-*`) | No. Position the camera so that workers are not in frame. |
| `photobooth.html` | Webcam / tablet | Segmentation (MediaPipe, MODNet), stickers, frames | Operator templates (IndexedDB `pb-templates`). **Photos are not stored**; the guest downloads or prints them. | **Only with AI try-on enabled + guest consent:** person photo + garment image → `server.py` → **Replicate (USA)**. Not stored on the LENSIQ server. |
| `studio.html` | Upload or webcam | Matting, outfit fit, retouch | Operator outfit templates (IndexedDB). No guest photos. | No |
| Fortune pages (`faceread`, `palm`, `horoscope`, `tarot`, `fengshui`, `numbers`, `iching`, `zodiac`, `astro`, `dream`) | Camera (face/palm), typed date/number/text, card draws | Rule-based KB readings. Face/hand landmarks are used in memory only. | Anonymous usage counters (`*-stats`), prefs, AI consent flag (`fa-consent`). **Faceread lead form (off by default, needs a tick):** nickname + contact (`fr-leads`). | **Only with AI enabled + consent:** derived facts (e.g. element, line categories, card names, zodiac) + optional nickname → `server.py` → **Anthropic Claude API (USA)**. No photo, real name, birth date or contact. The server does not log facts. |
| `insights.html` dashboard | Other modules' local data | Aggregation, statistics | Range, goals and alert prefs (`iq-*`). **Backup export JSON** contains every module key, including member names, phones and attendance names. It **excludes** encrypted face data and the hub token. | Only as a file the operator downloads |
| `converter.html` PDF→DOCX | User-selected PDF | `server.py` (`pdfconvert.py`: pdfplumber + python-docx by default; pdf2docx/PyMuPDF only if opted in) in a temp dir, deleted after the response. Falls back to in-browser conversion. | Nothing | To your `server.py` host |
| `crowd.html` crowd counting & density (round 14) | Camera over a floor, entrance or shopfront | Person boxes (COCO-SSD / YOLOX), tracking, zones, entry/exit line, dwell, density grid, shopfront funnel; conversion from numbers the operator types | Day records of numbers only (`lqcr-day-*`, last 60 days, past days compacted), line and zones (`lqcr-line`), alert log. Demo-mode data is never saved. No images, no IDs. | No (CSV / printed summary / JSON numbers pack only as files the operator saves) |
| Exam evidence clip (round 14, `exam-lab.html` / `exam-hall.html` / `exam-dashboard.html`) | The exam camera, only when the institution switches clips on (off by default) | 10-second video-only ring buffer in memory (MediaRecorder); a clip is kept when an invigilator taps "Keep clip" (or auto-keep set by the institution) | IndexedDB `lq-exam-clips`: AES-GCM encrypted clip, one non-extractable key per clip; salted hash of the invigilator PIN (`lq-exam-clip-pin`); auto-delete after 1/7/14/30/90 days | No (never uploaded; "save as file" only behind the PIN) |
| `case-review.html` case review (round 14) | Video files the reviewer opens from the device (no camera) | None automatic: tags, notes, reviewer names, hash-chained append-only log | Logs as plain text (`lqcase-*`), deletion ledger; clips only if the reviewer opts into encrypted storage (IndexedDB `lensiq-case`, own key store), purged after the set period on the next visit | No (CSV / JSON / printed summary as files) |
| `medicine.html` medicine checker (round 14) | Camera on a box / label, or typed text | Barcode, Thai registration-number parser, OCR (PaddleOCR Thai), Pillbox candidate list (`vendor/pillbox/`) | Settings (`lq-med-cfg`), opt-in look-up history (`lq-med-history`, `lq-med-codes`, never emergency wording), per-tab online consent (sessionStorage `lq-med-online`). No images. | **Only after the per-tab opt-in:** text (registration number, NDC, drug name) → openFDA / RxNav (USA) directly or via the Worker; Thai FDA via the Worker `/api/med/*` (no query/IP logs, 24 h cache keyed by SHA-256) |
| `omr.html` answer-sheet grader (round 14) | Phone camera or chosen photos of printed answer sheets | Corner markers, perspective warp, bubble darkness (no ML, no faces) | Exams, keys, answers, student numbers / optional names, scores (`lqomr-v1`). Sheet images in memory only. | No |
| `planner.html` auspicious-date planner (round 14) | Typed event, months, birth weekday / zodiac / optional birth date | Calendar maths on the device (`lensiq-planner.js` + `horoscope.js`) | Nothing | No (.ics file built locally) |
| `luckycolor.html` lucky-colour mirror (round 14) | Front camera | Clothing segmentation (MediaPipe Selfie Multiclass / segmenter), colour names; no face model | `lqlc-prefs` (goal, day) only | No |
| `index.html` demo request form | Typed name, org, email, phone, message | None | `lq-leads` in localStorage (demo mode, **not sent anywhere**) | No |

## Server-side (`server.py`, when used)

| Data | Where | Retention |
|---|---|---|
| Multi-device aggregates, device names, SHA-256 of device tokens, pairing code | `data/agg.json` (or `LENSIQ_DATA_DIR`), file mode 0600, never served over HTTP | Latest **62 days** (`AGG_LIM.days_kept`). A node and its data are deleted by `DELETE /api/agg/node/<id>`. |
| Uploaded PDF / generated DOCX | OS temp directory | Deleted when the request finishes |
| Try-on images | Memory only | The request duration |
| Fortune facts | Memory only. Logging records only error type / request id. | The request duration |
| Rate-limit counters (client IP) | Memory | Rolling one minute / daily, lost on restart |
| Access logs | Flask/WSGI or proxy logs (operator-configured) | Set by the operator. Logs contain IP addresses. |

## Cloud backend — members (`backend/`, Cloudflare Worker + D1, when deployed)

Source → processing → storage → transfer for the optional "Sign in with Google" membership (ROPA M22a–h, retention in `retention-table.md`).

| Flow | Source | Processing | Stored (D1) | Leaves / shared with |
|---|---|---|---|---|
| Sign-in | Google ID token after the member clicks the button (Google script loads only on click) | Worker verifies RS256 signature (JWKS), iss/aud/exp/iat, single-use nonce, `email_verified` | `users`: random id, Google `sub`, e-mail, optional given name, consent version/time, marketing opt-in. **No avatar, no access token.** `auth_nonces`: nonce hash (10 min). | Google (identity provider the member chose); Cloudflare (processor) |
| Session | Worker issues a random 256-bit bearer token | Hash compared on each request | `member_sessions`: token hash, times (30 days / 14 days idle) | Token held in the member's browser only |
| Readings and AI usage | Page reports "a reading of domain X happened" | Quota counting | `member_ledger` (kind, domain, time — no reading text; 400 days), `usage_counters` (35 days) | No |
| Saved readings | Member taps "save" | Size/field clipping (≤ 16 KB) | `saved_readings` until deleted | No |
| Payment | Opn checkout (PromptPay) and signed webhook | Signature check + status confirmation with the Opn API | `payments`/`subscriptions`/`customers` (≥ 5 years), `webhooks.payload` (90 days) | Opn Payments (processor) |
| Transactional e-mail (round 12, OFF until `MAIL_PROVIDER` is set) | Successful payment, refund, plan ending in 3 days | `mail.js`: fixed TH/EN/ZH text + document number + amount + account-page link (no document, tax ID, address or sign-in link); member opt-outs `email_receipts` / `email_reminders` | `mail_log`: kind, document ref, member id, provider message id, outcome — **no address, subject or body**; 400 days; member id cleared on erasure | Mail provider (Resend or MailChannels) receives the verified e-mail address + the text — processor, country to document |
| Short session + token refresh (round 12, optional) | Sign-in with `session: "short"` | 12 h absolute / 1 h idle; `POST /api/auth/refresh` rotates the token (≤ 7 days after sign-in) | `member_sessions.kind`, `signed_in_at` | No |
| CSP violation reports (round 12) | Browser of a page whose CSP is sent as an HTTP header (today: the Worker-served admin) | Parsed to directive + blocked origin + page path | `csp_reports` day counters, 90 days — no IP, user agent, query or script sample | No |
| Erasure | Member: `DELETE /api/me` on `account.html` | Batch delete + unlink | Deletes `users`, sessions, ledger, saved readings, usage counters; unlinks payments (user id and e-mail cleared). `audit_log` keeps `member.deleted` with the random id for 400 days; webhook payloads age out at 90 days. | No |

## Third parties and cross-border transfers

| Recipient | Country | Trigger | Data | Safeguard to document |
|---|---|---|---|---|
| Anthropic (Claude API) | USA | AI fortune enabled + per-user consent | Derived facts, optional nickname | Explicit consent naming the country (s.28–29). Anthropic commercial terms / DPA. |
| Replicate | USA | Try-on enabled (token + model + `LENSIQ_TRYON_LICENSE`) + per-user consent | Person photo, garment image | Explicit consent. Replicate terms. Model licence (see THIRD_PARTY F2, `docs/TRYON-LICENSING.md`). |
| Your hosting provider (e.g. Render) | Provider region | Option D deployment | Request logs, API payloads in transit | Processor agreement |
| Cloudflare (Workers + D1) | Global network; D1 in the chosen region (APAC hint recommended) | Backend deployed (`LENSIQ_API_BASE`) | Member, billing, analytics and audit tables above | Cloudflare DPA (s.40); transfer basis s.28/29 (DPIA §11, L9) |
| Google (Sign in with Google) | USA | Member clicks the sign-in button | ID token exchange (Google already holds the account) | Privacy notice names Google; data minimised (no avatar, no access token) |
| Opn Payments | Thailand / Japan group | Paid checkout | Amount, charge id, buyer e-mail / tax-invoice fields | Processor agreement; no card or bank data stored by LENSIQ |
| E-mail provider (Resend — USA; or MailChannels — USA) | USA (provider region) | Only when the controller sets `MAIL_PROVIDER` + `MAIL_API_KEY` | Member's verified e-mail address, fixed notice text, document number, amount | Processor agreement (s.40), transfer basis s.28/29 [ตรวจทานกฎหมาย] (DPIA §14, L17) |

## On-device image stores (round 12 — precise wording)

By design no page sends image data anywhere except `/api/tryon` after the per-user consent (an automated e2e check that
asserts this for every page is still to be added). A few operator tools do **keep images on the device** that runs them; they are listed here so the site wording can stay precise:

| Page | What is stored on the device | Where | Can show people? | Delete |
|---|---|---|---|---|
| `qc.html` | Background frame per lane (JPEG data URL) and thumbnails of rejected items | localStorage `qc-*` (recipes), IndexedDB `lensiq-qc` store `thumbs` | Possibly, by accident (a worker's hand or body in the frame) — aim the camera at the belt only | Delete the shift / recipe, or clear site data |
| `photobooth.html` | Operator frame / sticker templates | IndexedDB `pb-templates` | Only if the operator uploads such an image | Template settings → delete |
| `studio.html` | Operator outfit templates; a speed estimate number (`lq.studio.ms`) | IndexedDB / localStorage | Only if the operator uploads such an image; guest photos are never stored | Template settings → delete, or clear site data |

Guest photos in photobooth / studio stay in memory until the guest downloads or prints them. A UI label "images saved on this device only"
with a delete button and a retention setting on these pages is front-end work tracked outside the backend (ROPA M11a, M12a).
