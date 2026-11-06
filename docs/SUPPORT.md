# Support and service levels: SLA template

A template for the support agreement between the **provider** (the integrator or LENSIQ vendor) and the **customer**
(the store, event or training operator). Values in [brackets] are negotiable defaults. **This is not legal advice.**
Attach the signed version to the commercial contract.

## 1. Scope

| In scope | Out of scope |
|---|---|
| LENSIQ web app and `server.py` at the version named in the order form | Customer-owned hardware, network, OS and browser updates (best effort only) |
| Configuration of the modules listed in the order form | Accuracy on camera positions that the site survey rejected |
| Model and vendor updates shipped in LENSIQ releases | Third-party cloud AI availability (Anthropic, Replicate): their own SLAs apply |
| PDPA pack updates (`docs/pdpa/`) | Legal advice, and DPIA sign-off on the customer's behalf |

## 2. Plans

| | Basic | Standard | Premium |
|---|---|---|---|
| Support hours (Asia/Bangkok) | Mon–Fri 09:00–18:00 | Mon–Sat 09:00–20:00 | 7 days 08:00–22:00 |
| Channels | Email, ticket | + LINE Official / phone | + named engineer, on-site visit |
| Languages | Thai, English | Thai, English, 中文 | Thai, English, 中文 |
| Releases | Quarterly | Monthly | Monthly + hotfixes |
| On-site visits included | 0 | [1 per year] | [4 per year] |
| Pilot / re-acceptance (`PILOT-PLAN.md`) | Paid | [1 per year] | On every new site |
| Price | [ ] | [ ] | [ ] |

## 3. Severity and response targets

| Severity | Definition | Example | First response | Workaround target | Fix target |
|---|---|---|---|---|---|
| **S1 Critical** | Service down at a site in opening hours, **or a suspected personal-data breach** | Hub unreachable, all counters stopped; face data exposed | Basic [4 h] · Std [1 h] · Prem [30 min] | [8 h] / [4 h] / [2 h] | [3 d] / [2 d] / [1 d] |
| **S2 High** | A module unusable, with no workaround | Store counting at 0 on one camera; enrolment fails | [8 h] / [4 h] / [2 h] | [2 d] / [1 d] / [8 h] | Next release / [5 d] / [3 d] |
| **S3 Medium** | Degraded, but a workaround exists | Dashboard chart wrong; Chinese text missing on a page | [2 d] / [1 d] / [8 h] | n/a | Next release |
| **S4 Low** | Question, cosmetic issue, feature request | | [5 d] / [3 d] / [2 d] | n/a | Roadmap |

The clock runs only during support hours, except for S1 breaches on Premium, where it runs 24/7. The provider may
lower the severity of a ticket, with a stated reason, once a workaround is in place.

## 4. Availability

| Component | Target | Measured as |
|---|---|---|
| On-device pages (static hosting) | Not measured by the provider: they run offline once cached (`sw.js`) | n/a |
| Provider-hosted `server.py` (if the provider hosts it) | [99.5 %] monthly | HTTP 200 on `/api/agg/status` every 5 min from an external probe |
| Customer-hosted hub | Customer responsibility; the provider supports configuration | n/a |

Service credits for provider-hosted components, per month: < 99.5 % → [5 %], < 99 % → [10 %], < 97 % → [25 %] of the
monthly fee. Excluded: scheduled maintenance announced ≥ 48 h ahead (≤ 4 h/month), customer network failures, and
force majeure.

## 5. Data protection obligations (PDPA s.40 processor terms, summary)

- The provider processes personal data only on documented instructions. By default it receives none: no telemetry,
  and the on-device design keeps data on the device. Remote sessions happen only with the customer present.
- **Breach notification to the customer without undue delay and within [24 h]** of the provider becoming aware, so the
  customer can notify the PDPC within 72 h (s.37(4)). The notice includes the facts, the categories affected, the
  measures taken and a contact person.
- Support staff never ask the customer to export face data. Diagnostic bundles contain no `lqv-*`, `cx-*` or `att-*`
  keys. Screenshots are taken only with the customer's consent.
- On termination: the provider deletes any customer data it holds within [30 days] and confirms in writing.

## 6. Customer responsibilities

- Name a contact person per site. Keep devices on supported browsers (current Chrome/Edge/Safari minus one major
  version). Keep the DPIA, signage and retention routine (`docs/pdpa/`) up to date.
- Report incidents with: site, page URL, time, the steps taken, and the browser console output if possible. Never
  include personal data.

## 7. Release and change policy

- Versioning follows `CHANGELOG.md`. Each release passes CI: lint, typecheck, unit, Python and e2e tests, CSP, the
  no-third-party-request check, and the zh shared-component gate.
- Breaking changes (storage keys, the hub schema `lensiq-agg` v1, server environment variables) are announced
  [30 days] ahead, with a migration note.
- Model changes that alter accuracy are listed with before/after numbers in `ACCURACY.md`.

## 8. Escalation

| Level | Provider | Customer |
|---|---|---|
| 1 | Support desk [email / LINE] | Site contact |
| 2 | Support lead [name] | Ops manager |
| 3 | Account director [name] | Management sponsor |

Escalate to the next level when a target in section 3 is missed by more than 50 %.

## 9. Reporting and review

The provider sends a monthly report: tickets by severity, targets met, uptime, releases installed and open risks.
A quarterly review covers accuracy (pilot re-checks), the DPIA review date and the roadmap.
