# Deployment checklist (shop / booth / event operator)

Follow this list top to bottom for each site. It does not depend on pricing or packaging. Related documents: [`README.md`](../README.md), [`docs/pdpa/`](pdpa/README.md), [`LICENSES/THIRD_PARTY.md`](../LICENSES/THIRD_PARTY.md), [`SECURITY.md`](../SECURITY.md).

---

## 1. Before install: legal and licensing

- [ ] **Modules chosen** and a one-line purpose written for each.
- [ ] **Lawful basis** recorded per module. Face recognition (`customers`, `attendance`) and booth repeat-visitor matching are **biometric (sensitive) data**, which needs **explicit consent** (PDPA s.26). Offer a non-biometric alternative.
- [ ] **DPIA** completed and signed ([`pdpa/DPIA-template.md`](pdpa/DPIA-template.md)).
- [ ] **Signage** printed from [`pdpa/consent-texts.md`](pdpa/consent-texts.md) §1 (or the "print notice" button in `store.html`). Placed at every entrance and next to every camera.
- [ ] **Consent texts** finalised (TH/EN) and matching the on-screen checkboxes. Paper consent forms prepared if used.
- [ ] **Privacy notice** published (URL/QR on the signs), including the Google Fonts disclosure or a self-hosted font.
- [ ] **Licence review before any paid use.** Do not enable, or replace, every item flagged NON-COMMERCIAL / RESTRICTED in `LICENSES/THIRD_PARTY.md`:
  - [ ] `LENSIQ_FACEPARSE` stays `false`, and `faceparse-*.onnx` is not on the device.
  - [ ] AI try-on (`REPLICATE_API_TOKEN`) is unset, or switched to a commercially licensed model.
  - [ ] PDF converter: Artifex licence obtained, or the converter is internal only or removed.
  - [ ] Counsel's opinion on face-api.js training-data provenance (age/gender especially). Signage age/gender is left **off** unless cleared.
- [ ] Retention periods decided ([`pdpa/retention-table.md`](pdpa/retention-table.md)), and a named owner for the export/clear routine.

## 2. Device setup

- [ ] **Secure context.** Pages must be opened over `https://` (valid certificate) or `http://localhost`. Camera access and face enrolment do not work otherwise.
- [ ] **Browser.** Current Chrome/Edge (110+) or Safari 16.4+. Auto-update on. Use a **dedicated browser profile** per site and do not sign in with personal accounts.
- [ ] **OS hardening.** Separate non-admin user, screen lock, full-disk encryption (FileVault / BitLocker / Android encryption), automatic updates.
- [ ] **Kiosk mode.** Chrome `--kiosk --app=https://…/page.html`, iPad Guided Access, or Android screen pinning.
- [ ] **Disable sleep.** OS power settings set to never sleep, display always on. `store.html` also requests a screen wake lock while running.
- [ ] **Power.** Mains power with UPS or a powered USB hub for cameras. Phones/tablets on chargers. Avoid USB extension cables longer than 3 m without power.
- [ ] **Camera placement.**
  - Store counting: overhead or high corner, 2.5–3.5 m, looking down across the doorway. The counting line drawn perpendicular to the walking direction.
  - Face modules (booth, signage, customers, attendance, neuro): at face height (1.4–1.7 m), within 0.5–3 m of the subject, not backlit.
  - Driver: IR camera on the dash facing the driver.
  - QC/checkout: fixed mount looking down, no people in frame.
- [ ] **Lighting.** Even front light, no strong window backlight, at least about 300 lux on faces. Avoid flickering LED dimmers.
- [ ] Models pre-loaded once while online, so the service worker caches `vendor/` and later sessions work offline.
- [ ] Camera permission granted and remembered for the site only (browser site settings).

## 3. Network (multi-device hub, `./start.sh mobile`)

- [ ] Hub and nodes on a **private, password-protected Wi-Fi** (WPA2/WPA3). Not open guest Wi-Fi. Client isolation must be off between them.
- [ ] Hub has a **fixed LAN IP** (DHCP reservation). The self-signed certificate is regenerated when the IP changes, and every node must trust it again.
- [ ] **Self-signed certificate trusted** on each node. Open `https://<hub-ip>:8443` once and accept the warning. For permanent installs prefer a real certificate (local DNS name + ACME, or reverse proxy).
- [ ] Pairing code read on the hub (`https://localhost:8443/store.html` → "เชื่อมหลายเครื่อง" (connect multiple devices) → "เครื่องหลัก" (hub)). Each node joined with a distinct, descriptive name (e.g. "Front door").
- [ ] **Rotate the pairing code after all nodes have joined** (hub UI, or `POST /api/agg/pair/rotate` from the hub machine). Existing nodes keep working.
- [ ] Hub firewall allows inbound 8443 from the LAN only. No port forwarding from the internet.
- [ ] Internet-hosted `server.py` (option D): `LENSIQ_HOSTS`, `LENSIQ_API_ALLOW_ANY=1`, `LENSIQ_TRUST_PROXY=1` set; TLS at the proxy; rate limits reviewed; secrets (`ANTHROPIC_API_KEY`, `REPLICATE_API_TOKEN`) stored in the host's secret store, not in files.

## 4. Go-live tests

- [ ] Every page in scope opens without errors. The status line shows the models loaded.
- [ ] Store: walk through the line 10 times in each direction and check that in/out match. Check zones and queue.
- [ ] Multi-device: each node shows "connected". The hub dashboard total equals the sum of the nodes. Pull a node's Wi-Fi for 1 minute and confirm it catches up after reconnecting.
- [ ] Customers/attendance: enrol 3 test people **with consent**. The page reports "encrypted (AES-GCM)" storage. Recognition works. Deleting one person removes them. "Delete all face data" works.
- [ ] Booth: a repeat visit within the day is counted once. Changing the device date purges descriptors.
- [ ] AI features (if enabled): without the consent tick nothing is sent; with the tick it works; with the server offline the page falls back to the local reading.
- [ ] Signs are visible from the camera's field of view. Staff can explain the system and the withdrawal procedure.
- [ ] Record the test results and the LENSIQ commit/version in the DPIA.

## 5. Daily and periodic operations

- [ ] **Daily:** check cameras are live and clocks are correct (the date drives daily aggregation and purges). Wipe surfaces and lenses.
- [ ] **Weekly:** review the hub device list and remove unknown devices. Export store/insights CSV if needed.
- [ ] **Monthly (or per your retention):**
  - Export reports (`insights.html` → CSV/JSON). **Backup JSON contains names and phones: store it encrypted.**
  - Clear stats past retention (`store.html` "ลบข้อมูลสถิติ" (delete stats), signage "clear stats", attendance "clear logs", faceread leads).
  - Review customer/attendance records whose purpose has ended.
- [ ] Data-subject requests handled within 30 days and logged ([`pdpa/consent-texts.md`](pdpa/consent-texts.md) §7).
- [ ] Browser and OS updates applied. LENSIQ updates deployed (bump the service-worker version so models refresh).

## 6. Incident response

| Incident | Immediate action |
|---|---|
| **Lost or stolen device** | 1) If the device is a **node**: on the hub, revoke it ("เชื่อมหลายเครื่อง" (connect multiple devices) → remove device, or `DELETE /api/agg/node/<id>` with header `Authorization: Bearer <pairing code>`). This removes its token and its data. 2) **Rotate the pairing code.** 3) Remote-wipe the device via MDM / Find My / Google Find My Device. 4) If it held face data or member lists, assess the breach: data are encrypted only if the device was locked and disk-encrypted. **Notify the PDPC within 72 h** unless the risk is unlikely, and notify the affected people if the risk is high. |
| **Pairing code leaked** | Rotate the code. Review the device list and delete unknown nodes. Check hub numbers for anomalies. |
| **Unknown node pushing data** | Delete the node (its data is removed too). Rotate the code. Check Wi-Fi access. |
| **Suspected misuse of face data** | Stop the module. Preserve the device for investigation. Wipe after the investigation. Notify as above. |
| **AI provider incident** | Unset `ANTHROPIC_API_KEY` / `REPLICATE_API_TOKEN` and restart `server.py`. The pages fall back to local features. |
| **Server compromise (option D)** | Rotate all API keys. Redeploy from a clean commit. Delete `data/agg.json` and re-pair. Review proxy logs. |

Keep an incident log: date, what happened, data affected, actions, notifications.

## 7. Decommission

- [ ] Export any reports you must legally keep (aggregate CSV), then store them per your policy.
- [ ] On every device: browser → Site settings → **Clear data** for the LENSIQ origin. This removes localStorage, IndexedDB (including face-vault keys), sessionStorage and caches. Then remove the browser profile.
- [ ] On the hub: stop `server.py`, delete `data/`, `certs/` and `logs/`. Remove `.venv` if the machine is reused.
- [ ] Revoke and delete API keys at Anthropic and Replicate if used.
- [ ] Remove signage. Update the privacy notice.
- [ ] Factory-reset devices that leave your control.
- [ ] Record the decommission date in the DPIA.
