# Product Check P4 lookup fixtures (unit tests only; CI never calls the network)

Facts only, trimmed to the fields `backend/src/pc.js` reads. Recorded 2026-11-10.

| File | Content | Licence / basis |
|---|---|---|
| `openfda-enforcement-drug.json` | one recall record (D-0657-2026) | openFDA, CC0 1.0 (https://open.fda.gov/terms/) |
| `openfda-enforcement-food.json` | one recall record (H-0130-2027) | openFDA, CC0 1.0 |
| `rasff-search.json` | one notification (2026.9864), selected fields | RASFF Window, European Commission, CC BY 4.0 (data.europa.eu `restored_rasff`). Modified: fields selected |
| `healthcanada-open-data.json` | one recall (NID 77435), advice text dropped; two SYNTHETIC rows ("LQ TEST") for the date and link filters | Contains information licensed under the Open Government Licence – Canada |
| `hsa-search.json` | one register record (SIN09110P) | Contains information from Listing of Registered Therapeutic Products accessed on 2026-11-10 from data.gov.sg, Singapore Open Data Licence v1.0 |
| `thfda-synthetic.xml` | SYNTHETIC rows in the WS_LICENSE_SEARCH shape (made-up products, names, addresses) | none needed (no Thai FDA data: its reuse licence is not stated, L13) |
| `synthetic.json` | SYNTHETIC Safety Gate, label, NDC, DailyMed, RxNav answers | none needed (Safety Gate search licence unconfirmed, L16) |
