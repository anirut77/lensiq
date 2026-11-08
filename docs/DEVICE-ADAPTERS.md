# LENSIQ device adapters: design (round 14 / S2-D)

**Status: design only. No code ships with this document.** It describes how a future version of LENSIQ could accept
readings from external devices next to the camera: a heart-rate strap over Bluetooth, a serial/USB sensor, or a
webhook from another system. It keeps the on-device and consent rules that the camera pages already follow.

> **Commitment.** Physiological signals (heart rate, RR intervals, skin conductance, breathing, temperature or any
> similar signal) will **never** be used for lie, deception, truthfulness, stress-as-guilt, emotion or mood inference,
> in any product, mode or export. That includes exam invigilation, case review, HR, interviews and fortune pages. The
> adapter layer enforces this as a rule, not as a setting (see [Prohibited uses](#prohibited-uses)).

## 1. Goals and non-goals

Goals
- One small interface that any page can use to list, connect, read and disconnect a device, whatever the transport is.
- On-device by default: readings stay in the page's memory unless the user keeps them, and nothing leaves the device
  without a separate opt-in.
- Consent first: no device is opened before an explicit, per-device, per-purpose consent; a reading never outlives its purpose.
- The same event shape for every transport, so pages and tests do not care where a number came from.

Non-goals
- No inference about a person's mind (see the commitment above). No medical diagnosis or medical-device claims.
- No background collection: an adapter runs only while its page is open and visible (or explicitly pinned in kiosk mode).
- No vendor SDKs that phone home, and no AGPL/GPL/non-commercial libraries.

## 2. Use cases we design for

| Use case | Transport | Example reading | Why it is allowed |
|---|---|---|---|
| Fitness / wellness display at a booth or gym check-in | Web Bluetooth, GATT Heart Rate Service `0x180D` | `heart_rate` 72 bpm | The person sees their own number; nothing is judged. |
| Door / occupancy sensor feeding a zone page | Serial/USB (Web Serial, WebHID) | `contact` open/closed, `count` +1 | Counts objects or events, not people's states. |
| Environmental readings next to QC / store analytics | Serial/USB | `temperature_c`, `humidity_pct`, `co2_ppm` | Room data, not personal data. |
| Another system notifying LENSIQ (POS sale, gate opened, alarm armed) | Webhook (through the optional backend) | `pos_sale` with an amount | Business events, used for counts such as conversion. |

## 3. Adapter interface

Plain JavaScript, same style as `lensiq-camera.js` (a global in the browser, `module.exports` for Node tests). Name
reserved: `window.LQDevice`. Every adapter implements:

```text
Adapter = {
  kind: "ble-hr" | "serial" | "hid" | "webhook" | "mock",
  supported() -> boolean                          // feature detect only (navigator.bluetooth / navigator.serial / backend configured)
  request(opts) -> Promise<DeviceRef>             // MUST be called from a user gesture; shows the browser's own chooser
  open(ref, { purpose, consentId }) -> Promise<Session>
}
Session = {
  id, kind, label,                                // label from the device, editable by the user, never a person's name by default
  state: "opening" | "live" | "paused" | "reconnecting" | "closed" | "error",
  on(type, fn) -> unsubscribe                     // "reading" | "state" | "error"
  pause(), resume(), close()                      // close() also forgets the in-memory buffer
  lastError
}
```

Registry (`LQDevice`):

```text
LQDevice.register(adapter)
LQDevice.adapters() -> [{kind, supported}]
LQDevice.connect(kind, { purpose, consentId }) -> Promise<Session>   // request() + open() with the consent check in between
LQDevice.sessions() -> Session[]
LQDevice.closeAll()
```

### 3.1 Transports

**Web Bluetooth heart rate (`ble-hr`).** `navigator.bluetooth.requestDevice({ filters: [{ services: [0x180D] }] })`
(Heart Rate Service). Subscribe to notifications on the Heart Rate Measurement characteristic `0x2A37`. Parse the flags
byte: bit 0 = value format (UINT8 / UINT16), bit 1-2 = sensor contact status, bit 3 = energy expended present,
bit 4 = RR intervals present (units of 1/1024 s). Optionally read Body Sensor Location `0x2A38`. Battery Service
`0x180F` / Battery Level `0x2A19` may be read to show battery. **RR intervals are parsed and dropped by default** (they
are not needed for a bpm display and are the raw material for HRV-based "stress" claims, which we do not make). Web
Bluetooth needs a secure context and a user gesture, and is not available in every browser (Safari/iOS): `supported()`
returns false and the page shows a plain message.

**Serial / USB (`serial`, `hid`).** Web Serial (`navigator.serial.requestPort()`) for sensors that print lines over
USB-CDC or a USB-UART bridge; WebHID for HID-class sensors. The adapter takes a small, declarative **line profile** per
device model, for example `{ baud: 9600, line: "\n", map: [{ match: "^T=(\\d+\\.\\d+)$", type: "temperature_c" }] }`. No
`eval`, no device-supplied code. Unknown lines are ignored and counted (`stats.ignored`).

**Webhook (`webhook`).** A browser cannot receive HTTP requests, so this transport needs the optional backend (`backend/`,
Cloudflare Worker) and is **off unless the owner deploys and configures it**. The sender POSTs JSON to
`/api/device/hook/<channel>` with an HMAC-SHA256 signature header over the raw body and a timestamp (reject if older than
5 minutes; reject replays by id). The Worker validates the schema, drops unknown fields, does not log IPs or bodies, keeps
events in a short queue (default 10 minutes), and the page polls or uses a WebSocket to fetch them. Personal data must not
be sent through webhooks; the schema rejects free-text fields over 200 characters and any field named like a person
identifier (`name`, `email`, `phone`, `national_id` …).

**Mock (`mock`).** Scripted readings for tests and demos (`?fakedev`), like `__LQ_FAKE_DET` for cameras.

### 3.2 Lifecycle

```text
idle --(user taps "Connect", consent shown and accepted)--> requesting --(browser chooser)--> opening --> live
live <--> paused         (page hidden / user pause; BLE notifications stopped, serial reader released)
live --> reconnecting    (link lost; backoff 1 s, 2 s, 4 s … capped at 30 s, max 10 tries, like LQCam reconnect)
reconnecting --> live | error
any --> closed           (user disconnect, page hide in non-kiosk mode, consent withdrawn, purpose ended)
```

Rules
- `request()` only inside a user gesture; never auto-connect on page load. A previously granted device
  (`navigator.bluetooth.getDevices()`, `navigator.serial.getPorts()`) may reconnect only if its consent record is still valid.
- `visibilitychange` hidden → pause (unless kiosk mode is on), `pagehide` → close.
- `close()` clears the in-memory buffer. Consent withdrawal calls `close()` on every session for that purpose and
  deletes anything stored for it.
- Errors are typed: `unsupported`, `denied`, `insecure`, `notfound`, `busy`, `disconnected`, `parse`, `consent`.

## 4. Event schema

Every reading, from any transport, is one object. Version 1:

```json
{
  "v": 1,
  "id": "r-1731052800123-7",
  "session": "s-3",
  "source": { "kind": "ble-hr", "model": "Heart Rate Sensor", "label": "Booth strap A" },
  "t": 1731052800123,
  "type": "heart_rate",
  "value": 72,
  "unit": "bpm",
  "quality": { "contact": true, "battery_pct": 80 },
  "purpose": "booth-fitness-display"
}
```

| Field | Meaning |
|---|---|
| `v` | Schema version. |
| `id` | Unique per reading (session-local counter + time). |
| `session` | Session id (random per connection, not a device serial number). |
| `source.kind / model / label` | Transport, device model string as reported, user-editable label. No MAC address, no serial number stored. |
| `t` | Milliseconds since epoch, device clock of the browser (not the sensor). |
| `type` | From a closed list: `heart_rate`, `temperature_c`, `humidity_pct`, `co2_ppm`, `contact`, `count`, `button`, `pos_sale`, `gate_event`, `alarm_state`. New types are added by code review, never at run time. |
| `value` / `unit` | Number or small enum string, with a unit from a fixed list. |
| `quality` | Optional transport facts: sensor contact, signal, battery. |
| `purpose` | The consented purpose this reading belongs to (see §5). A reading without a valid purpose is dropped. |

Not in the schema on purpose: RR intervals, raw waveforms, HRV, any derived "stress", "arousal", "emotion", "honesty"
or "risk" score. There is no field in which to put them.

## 5. Consent

- **Per device, per purpose.** A consent record is `{ id, purpose, kinds, scope: "this-session" | "this-device", createdAt, expiresAt, text }`, stored locally. Purposes come from a fixed list in code (`booth-fitness-display`, `room-sensors`, `door-counter`, `pos-events` …) with a plain-language text in TH/EN/ZH.
- **Heart rate is health data (PDPA s.26, sensitive).** Its consent must be explicit, separate from any other consent, never pre-ticked, and say: what is read (bpm only), where it goes (this screen only), how long it is kept (not kept unless the person presses "keep my session summary"), and the commitment that it is never used to judge truthfulness or feelings.
- **The person wearing the sensor consents, not only the operator.** In booth/kiosk mode the screen shows a consent step to the wearer before the first number appears, and a visible "stop" button ends the session at once.
- Withdrawal is one tap and takes effect immediately (`close()` + delete stored summaries for that purpose).
- Children: heart-rate purposes are not offered when the page is in a mode flagged for minors (exam pages), and booth mode asks the operator to confirm an adult is present for under-20s, following PDPA s.20.

## 6. On-device processing and storage

- Default: readings exist only in a ring buffer in memory (e.g. last 120 readings) to draw a live number or sparkline.
- Optional "keep": a per-session summary only (start, end, min/avg/max bpm, count) in `localStorage`/IndexedDB under
  the page's prefix, encrypted with the existing `LQVault` when the page already uses it. No per-reading history for
  health data. Room/sensor data may keep per-minute aggregates, like `lensiq-agg`.
- Leaving the device: off by default. Exports (CSV/JSON) are user-initiated downloads. Any network sync would be a
  separate, explicit opt-in with the destination named, and health data is excluded from sync entirely.
- Retention defaults: health summaries 30 days, sensor aggregates 60 days (same cap style as crowd counting), all deletable.

## Prohibited uses

The adapter layer will refuse these, in code, not just in documentation:

1. **No lie/deception or emotion detection.** No adapter, page or export may combine a physiological reading with a
   question, an answer, a video timestamp, an exam item or an interview segment to produce any judgement about
   truthfulness, stress, nervousness, mood or emotion. `LQDevice.connect()` rejects the `heart_rate` type for pages on a
   deny list (exam-*, case-review, interview, hr/attendance, fortune pages), and a unit test will scan the source for
   such combinations (the same way the exam tests assert that no emotion API is used).
2. No physiological reading in a flag, alert, score or ranking of a person.
3. No medical claims (no arrhythmia detection, no "health score"); the display says it is not a medical device.
4. No raw waveforms, RR intervals or HRV stored or exported.
5. No identification of a person from a device (MAC/serial numbers are not stored; labels are user-chosen).

## 7. Testing plan (when built)

- Pure parsers in Node: Heart Rate Measurement flag combinations (UINT8/UINT16, contact bits, energy, RR present →
  dropped), serial line profiles, webhook schema/HMAC/replay checks.
- `mock` adapter e2e: consent gate blocks until accepted; withdrawal closes and deletes; page hidden pauses; reconnect
  backoff; no network request without opt-in; deny-list pages reject `heart_rate`.
- Static test: no "emotion", "stress", "lie", "deception", "truth" scoring symbols near device code.

## 8. Licences and dependencies

None needed: Web Bluetooth, Web Serial and WebHID are browser APIs; HMAC uses WebCrypto. If a parser library is ever
vendored it must be MIT/Apache-2.0/BSD with its LICENSE next to it (no AGPL/GPL/non-commercial).

## 9. Open questions

1. Which first device model to support for the booth heart-rate display (any strap that implements standard `0x180D` should work).
2. Whether kiosk mode for heart rate is wanted at all, given the sensitive-data consent burden.
3. Webhook hosting: only if the owner deploys the backend; otherwise the webhook transport stays unavailable.
