# Data map

How personal data flows through each LENSIQ module: **source → processing → storage → transfer**. Compiled from the source code (2026-11-06). *Not legal advice.*

"Device" means the browser profile on the kiosk, laptop, tablet or phone running the page. Browser storage is **per origin**: data saved at `https://192.168.1.20:8443` is separate from data saved at `http://localhost:8000` or `https://<user>.github.io`.

## Common to every page

| Flow | Detail |
|---|---|
| Static files | HTML, JS, models from the host (GitHub Pages, your static host, or `server.py`). The host sees normal web request logs (IP, user agent, URL). |
| **Google Fonts** | Each page requests `https://fonts.googleapis.com/css2?family=Prompt…` and font files from `fonts.gstatic.com`. **The visitor's IP address and user agent are disclosed to Google (USA).** No cookies are set by this request. Strict deployments should self-host the font (OFL) and remove the `<link>` tags. |
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
| `converter.html` PDF→DOCX | User-selected PDF | `server.py` (pdf2docx/PyMuPDF) in a temp dir, deleted after the response | Nothing | To your `server.py` host |
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

## Third parties and cross-border transfers

| Recipient | Country | Trigger | Data | Safeguard to document |
|---|---|---|---|---|
| Google (Fonts) | USA | Every page load (unless self-hosted) | IP, user agent, referrer page | Notice in privacy policy, or self-host |
| Anthropic (Claude API) | USA | AI fortune enabled + per-user consent | Derived facts, optional nickname | Explicit consent naming the country (s.28–29). Anthropic commercial terms / DPA. |
| Replicate | USA | Try-on enabled + per-user consent | Person photo, garment image | Explicit consent. Replicate terms. Model licence (see THIRD_PARTY F2). |
| Your hosting provider (e.g. Render) | Provider region | Option D deployment | Request logs, API payloads in transit | Processor agreement |
