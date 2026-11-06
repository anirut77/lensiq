# Virtual try-on and PDF conversion: commercial licensing

**Not legal advice.** This file records the engineering defaults and the evidence an operator needs to keep. Before
paid use, counsel should review the licence of every model and provider you switch on.

## 1. Defaults (v0.10)

| Feature | Default | Licence of the default path | How to change |
|---|---|---|---|
| On-device studio outfit editor (`studio.html`) | **on** | MediaPipe Selfie Multiclass (Apache-2.0) + MODNet (Apache-2.0, see THIRD_PARTY F7). Runs in the browser and sends nothing. | No change needed. This is the commercial-safe try-on. |
| Cloud "realistic" try-on (`/api/tryon`, `tryon.py`) | **off** | none, because nothing runs | Configure a model **and** attest its licence (section 2) |
| `/api/convert` PDF to DOCX | **on**, engine `permissive` | pdfplumber / pdfminer.six (MIT), pypdfium2 (BSD-3 / Apache-2.0), python-docx (MIT) | `LENSIQ_CONVERT_ENGINE=pdf2docx` opts into the AGPL engine (section 3) |

`GET /api/tryon/status` and `GET /api/convert/status` report what is active. Neither response contains secrets.

## 2. `/api/tryon`: enabling it

The usual open try-on models carry non-commercial licences. The table lists the licence each upstream repository
published as of 2026. Re-check it, because licences change.

| Model family | Licence | Commercial use |
|---|---|---|
| IDM-VTON (yisol) | CC BY-NC-SA 4.0 | No |
| OOTDiffusion (levihsu) | CC BY-NC-SA 4.0 | No |
| StableVITON (rlawjdghek) | CC BY-NC-SA 4.0 | No |
| CatVTON (Zheng-Chong) | CC BY-NC-SA 4.0 | No |
| LaDI-VTON, GP-VTON, DCI-VTON, HR-VITON, Leffa | research / NC terms | No |

`tryon.py` refuses to treat these as commercial. Model names that match the families above return
`reason: "model-is-noncommercial"` unless the operator selects the explicit demo mode.

### Environment variables

| Variable | Required | Meaning |
|---|---|---|
| `REPLICATE_API_TOKEN` | yes | Replicate API token |
| `REPLICATE_TRYON_MODEL` | yes | `owner/model` on Replicate. **There is no default any more.** |
| `LENSIQ_TRYON_LICENSE` | yes | `commercial` means you hold written commercial rights for this model. `noncommercial-demo` is for research or internal demos only. Any other value keeps try-on off. |
| `REPLICATE_TRYON_VERSION` | recommended | Pins a version, so a model update cannot silently change its licence |
| `LENSIQ_TRYON_INPUT` | if the model differs from IDM-VTON's input schema | JSON that maps `{"human","garment","desc"}` to the model's field names |
| `LENSIQ_TRYON_EXTRA` | optional | JSON of constant scalar inputs, such as `{"category":"upper_body"}` |

`status.reason` takes one of these values: `no-token`, `no-model`, `license-not-attested`,
`model-is-noncommercial` or `ok`. The studio page can show the reason without exposing configuration.

### Evidence to keep, per deployment

- The model's licence page, or the signed contract with the provider, saved as a PDF with the date.
- The pinned `REPLICATE_TRYON_VERSION`.
- A DPIA entry. Try-on sends a photo of a person to a processor in the USA (see `docs/pdpa/DPIA.md`, M7).

### Commercially licensed alternatives (evaluate; not endorsements)

| Option | Type | Notes |
|---|---|---|
| Keep the on-device studio (default) | in-browser, Apache-2.0 | Free, private and offline. Quality is lower than diffusion try-on (see the evaluation notes in `ACCURACY.md`). |
| Commercial try-on APIs (for example FASHN, Google Cloud Vertex AI Virtual Try-On, Kling / Kolors try-on API, Perfect Corp) | SaaS, per-image pricing | Commercial terms come with the contract. Most do not use Replicate's prediction API, so each needs an adapter: a replacement for `tryon.run()` of about 40 lines, which keeps the same guards (https-only result URLs, token sent only to the provider host). Check where the data is processed, whether the provider retains images, and whether it trains on customer images. |
| A Replicate-hosted model whose card grants commercial use | SaaS | Works with the current adapter. Set `LENSIQ_TRYON_INPUT` to match the model's input schema. |
| Licensing IDM-VTON or a similar model from the rights holder | contract | Then `LENSIQ_TRYON_LICENSE=commercial` is truthful. You must also rename the model so the NC name filter does not match, or host it under your own name. |

## 3. `/api/convert`: engines

| Engine | Quality | Licence obligations |
|---|---|---|
| `permissive` (default) | Text, headings (from font size), bold and italic, ruled tables and page breaks. Does **not** keep absolute positions or images. Thai lines are re-joined without spaces. Scanned PDFs report "no text layer". | Keep the MIT, BSD and Apache notices (`LICENSES/THIRD_PARTY.md`) |
| `pdf2docx` (opt-in) | Layout-preserving, with images | PyMuPDF is **AGPL-3.0**: users who reach the converter over a network are owed the complete source of the service. pdf2docx is GPL-3.0. Alternatively, buy an Artifex licence. |

To enable the opt-in engine:

```bash
pip install -r requirements.txt -r requirements-agpl.txt
export LENSIQ_CONVERT_ENGINE=pdf2docx   # server.py logs a licence warning at start-up
```

`tests/python/test_licensing.py` checks four things:

- The default path never imports `fitz` or `pdf2docx`.
- `requirements.txt` contains no copyleft package.
- Try-on cannot be enabled without an attestation.
- The default converter really converts a PDF: the test covers headings, bold, a table and the page break.

Other permissive libraries considered: **pypdf** (BSD-3) is good for page operations but extracts text without
font sizes. **pdfminer.six** alone works too, and pdfplumber is a thin MIT layer over it that adds table detection.
