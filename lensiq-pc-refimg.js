/* lensiq-pc-refimg.js — Product Check reference-image library TOOLING (round 17, P9; design docs/PRODUCT-CHECK-DESIGN.md
 * §6.3, owner decision PC-D7, CTO-BRIEF L19). Browser: window.LQPCRefImg (loaded by tools/pc-refimg.mjs and the e2e test
 * only; NO page of the site loads it yet) · Node: module.exports (pure parts, tests/unit/pc-refimg.test.js).
 *
 * WHAT IT IS: the format and the code to turn reference photos into EMBEDDINGS ONLY (the MobileNetV2 vector checkout.js
 * already uses: vendor/models/mobilenet, node module_apply_default/MobilenetV2/Logits/AvgPool, 1280 values, L2-normalised),
 * plus the matching rule. WHAT IT IS NOT: no photo is stored, shown or committed; no library ships in vendor/ until counsel
 * answers L19 (own photos of retail packs: Thai Copyright Act s.32–33); third-party pack images are never collected.
 *
 * MANIFEST (the owner's photos, kept OUTSIDE the repo; schema "lensiq-pc-refimg-manifest/1"):
 *   {schema, entries: [{file: absolute path outside the repo, key: {gtin} | {reg}, licence, licence_ref?, credit, source,
 *   date: YYYY-MM-DD}]}. Licence kinds (design §6.3, in order of preference):
 *     manufacturer-written-licence  needs licence_ref (the written licence that allows commercial matching)
 *     own-photo-retail-pack         LENSIQ's own photos of retail packs: only after counsel answers L19 (--counsel L19-cleared)
 *     public-domain-us-gov          US agency images: labeller images may not be public domain, so also after L19
 *     synthetic                     generated test pictures (canvas boxes): tests only
 *   user contributions are refused here (opt-in, face-gated, org-accounts PDPA work first).
 * LIBRARY (schema "lensiq-pc-refimg/1"): {schema, embedder: "mnv2", model, dim, built, note, entries: [{key: "gtin:<14>" |
 *   "reg:<normalised>", licence, licence_ref?, credit, source, date, photo_sha256, vec: base64 float32 LE}]}. An allowlist:
 *   validateLibrary refuses any other field, any data: URL, a wrong vector length.
 * MATCHING (design §6.3): identity comes from TEXT (GTIN / registration number), never from the picture. compare() needs at
 *   least MIN_REFS = 3 references for the key; "looks-different" when the best similarity to the references is below the
 *   lowest similarity among the references themselves minus a margin (a per-key spread, not a global threshold: no real
 *   pack photos exist to set one). The result is WEAK and never shown alone (standalone: false): "looks different from the
 *   <n> reference photos we have", next to the text checks, never a verdict.
 *
 *   validateManifest(m, {repoRoot, counsel}) -> {ok, errors, entries} · buildLibrary(entries, {embedder, built}) -> lib
 *   validateLibrary(lib) -> {ok, errors} · encodeVec(f32) / decodeVec(b64) · keyOf({gtin|reg}) · cosine(a, b)
 *   compare(lib, key, vec, {margin, threshold}) -> {state, n, best, refMin, threshold, weak, standalone}
 *   browser: loadModel(tf) -> {model, backend} · embedCanvas(tf, model, canvas) -> Float32Array(1280)
 *            drawSynthetic(canvas, design, variant) (test pictures) · hexOf(n) (a test checksum)
 */
(function (root, factory) {
  const m = factory();
  if (typeof module !== "undefined" && module.exports) module.exports = m; else /** @type {any} */ (root).LQPCRefImg = m;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  const MANIFEST_SCHEMA = "lensiq-pc-refimg-manifest/1", LIB_SCHEMA = "lensiq-pc-refimg/1";
  const MIN_REFS = 3, MARGIN = 0.05, MAX_ENTRIES = 5000;
  const STATES = ["no-references", "too-few", "similar", "looks-different"];
  /** @type {Record<string, {needsCounsel?: boolean, needsRef?: boolean, testOnly?: boolean}>} */
  const LICENCES = { "manufacturer-written-licence": { needsRef: true }, "own-photo-retail-pack": { needsCounsel: true }, "public-domain-us-gov": { needsCounsel: true },
    synthetic: { testOnly: true } };
  const COUNSEL_OK = "L19-cleared";
  const EMB_NODE = "module_apply_default/MobilenetV2/Logits/AvgPool";
  const MODEL_URL = "vendor/models/mobilenet/model.json";
  const FIELDS = ["key", "licence", "licence_ref", "credit", "source", "date", "photo_sha256", "vec"];

  /* ---------------- keys ---------------- */
  /** GTIN-8/12/13/14 with a valid check digit -> 14 digits, else null. @param {any} g */
  function gtin14(g) {
    const d = String(g == null ? "" : g).replace(/\s+/g, "");
    if (!/^(\d{8}|\d{12,14})$/.test(d)) return null;
    const digits = d.split("").map(Number), check = digits.pop();
    let sum = 0;
    digits.reverse().forEach((x, i) => { sum += x * (i % 2 === 0 ? 3 : 1); });
    return (10 - (sum % 10)) % 10 === check ? d.padStart(14, "0") : null;
  }
  const regNorm = (/** @type {any} */ r) => String(r == null ? "" : r).normalize("NFKC").toUpperCase().replace(/[^0-9A-Zก-ฮ]/g, "");
  /** {gtin} | {reg} -> "gtin:<14 digits>" | "reg:<letters and digits>" | "" @param {any} k */
  function keyOf(k) {
    if (!k || typeof k !== "object") return "";
    if (k.gtin != null) { const g = gtin14(k.gtin); return g ? "gtin:" + g : ""; }
    if (k.reg != null) { const r = regNorm(k.reg); return r.length >= 3 && r.length <= 40 ? "reg:" + r : ""; }
    return "";
  }

  /* ---------------- manifest ---------------- */
  const isDate = (/** @type {any} */ s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || "")) && !Number.isNaN(Date.parse(String(s)));
  const text = (/** @type {any} */ s, n = 300) => typeof s === "string" && s.trim().length > 0 && s.length <= n;
  const isAbs = (/** @type {string} */ p) => /^(\/|[A-Za-z]:[\\/])/.test(p);
  /** @param {string} p */
  const normPath = p => {
    const parts = [];
    for (const x of p.replace(/\\/g, "/").split("/")) { if (x === "..") parts.pop(); else if (x && x !== ".") parts.push(x); }
    return "/" + parts.join("/");
  };
  /**
   * @param {any} m @param {{repoRoot?: string, counsel?: string}} [o]
   * @returns {{ok: boolean, errors: string[], entries: any[]}}
   */
  function validateManifest(m, o = {}) {
    /** @type {string[]} */ const errors = [];
    if (!m || typeof m !== "object" || m.schema !== MANIFEST_SCHEMA) return { ok: false, errors: [`schema must be ${MANIFEST_SCHEMA}`], entries: [] };
    const list = Array.isArray(m.entries) ? m.entries : [];
    if (!list.length) errors.push("entries: empty");
    if (list.length > MAX_ENTRIES) errors.push(`entries: more than ${MAX_ENTRIES}`);
    const repo = o.repoRoot ? normPath(String(o.repoRoot)) : "";
    list.forEach((/** @type {any} */ e, /** @type {number} */ i) => {
      const at = `entries[${i}]`;
      if (!e || typeof e !== "object") { errors.push(`${at}: not an object`); return; }
      const f = typeof e.file === "string" ? e.file : "";
      if (!f || /^data:/i.test(f) || /^[a-z]+:\/\//i.test(f)) errors.push(`${at}.file: a path to a photo on this computer`);
      else if (!isAbs(f)) errors.push(`${at}.file: must be an absolute path outside the repo`);
      else if (repo && (normPath(f) + "/").startsWith(repo + "/")) errors.push(`${at}.file: inside the repo (photos stay outside the repo)`);
      if (!keyOf(e.key)) errors.push(`${at}.key: a GTIN with a valid check digit or a registration number`);
      if (e.key && e.key.gtin != null && !gtin14(e.key.gtin)) errors.push(`${at}.key.gtin: not a valid GTIN`);
      const lic = String(e.licence || "");
      if (lic === "user-contribution") errors.push(`${at}.licence: user contributions are not supported here (opt-in, face-gated, after the org-accounts PDPA work)`);
      else if (!Object.hasOwn(LICENCES, lic)) errors.push(`${at}.licence: one of ${Object.keys(LICENCES).join(", ")}`);
      else {
        const L = LICENCES[lic];
        if (L.needsCounsel && o.counsel !== COUNSEL_OK) errors.push(`${at}.licence ${lic}: waits for counsel (CTO-BRIEF L19); run with --counsel ${COUNSEL_OK} only after the answer`);
        if (L.needsRef && !text(e.licence_ref, 120)) errors.push(`${at}.licence_ref: the written licence reference is required`);
      }
      if (!text(e.credit)) errors.push(`${at}.credit: required`);
      if (!text(e.source)) errors.push(`${at}.source: required`);
      if (!isDate(e.date)) errors.push(`${at}.date: YYYY-MM-DD`);
      for (const k of ["credit", "source", "licence_ref"]) if (typeof e[k] === "string" && /data:|base64,/i.test(e[k])) errors.push(`${at}.${k}: no embedded data`);
    });
    return { ok: !errors.length, errors, entries: errors.length ? [] : list };
  }

  /* ---------------- vectors ---------------- */
  const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  /** @param {Uint8Array} b */
  function b64(b) {
    let s = "";
    for (let i = 0; i < b.length; i += 3) {
      const n = (b[i] << 16) | ((b[i + 1] || 0) << 8) | (b[i + 2] || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < b.length ? B64[(n >> 6) & 63] : "=") + (i + 2 < b.length ? B64[n & 63] : "=");
    }
    return s;
  }
  /** @param {string} s */
  function unb64(s) {
    const t = String(s).replace(/=+$/, ""), out = new Uint8Array(Math.floor((t.length * 3) / 4));
    let o = 0;
    for (let i = 0; i < t.length; i += 4) {
      const n = (B64.indexOf(t[i]) << 18) | (B64.indexOf(t[i + 1]) << 12) | ((B64.indexOf(t[i + 2]) & 63) << 6) | (B64.indexOf(t[i + 3]) & 63);
      if (o < out.length) out[o++] = (n >> 16) & 255;
      if (o < out.length) out[o++] = (n >> 8) & 255;
      if (o < out.length) out[o++] = n & 255;
    }
    return out;
  }
  /** Float32 little-endian -> base64. @param {ArrayLike<number>} v */
  function encodeVec(v) {
    const f = Float32Array.from(v), dv = new DataView(new ArrayBuffer(f.length * 4));
    f.forEach((x, i) => dv.setFloat32(i * 4, x, true));
    return b64(new Uint8Array(dv.buffer));
  }
  /** @param {string} s */
  function decodeVec(s) {
    if (typeof s !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(s)) return new Float32Array(0);
    const b = unb64(s), dv = new DataView(b.buffer), n = Math.floor(b.length / 4), f = new Float32Array(n);
    for (let i = 0; i < n; i++) f[i] = dv.getFloat32(i * 4, true);
    return f;
  }
  /** @param {ArrayLike<number>} a @param {ArrayLike<number>} b */
  function cosine(a, b) {
    let d = 0, x = 0, y = 0;
    for (let i = 0; i < Math.min(a.length, b.length); i++) { d += a[i] * b[i]; x += a[i] * a[i]; y += b[i] * b[i]; }
    return x && y ? d / Math.sqrt(x * y) : 0;
  }

  /* ---------------- library ---------------- */
  /**
   * Entries (manifest fields + photo_sha256 + vec as numbers) -> library. Only the allowlisted fields go in; the photo path
   * never does. @param {any[]} entries @param {{embedder?: string, built?: string}} [o]
   */
  function buildLibrary(entries, o = {}) {
    const rows = entries.map(e => {
      const r = { key: keyOf(e.key), licence: String(e.licence), credit: String(e.credit), source: String(e.source), date: String(e.date),
        photo_sha256: String(e.photo_sha256 || "").toLowerCase(), vec: encodeVec(e.vec) };
      return e.licence_ref ? { ...r, licence_ref: String(e.licence_ref) } : r;
    });
    return { schema: LIB_SCHEMA, embedder: o.embedder || "mnv2", model: "MobileNetV2 feature vector (vendor/models/mobilenet, as checkout.js)",
      dim: entries.length ? Float32Array.from(entries[0].vec).length : 0, built: o.built || "",
      note: "Embeddings only: no photo, no pixels. Identity comes from the GTIN / registration number; a 'looks different' result is a weak signal, never shown alone.",
      entries: rows };
  }
  /** @param {any} lib @returns {{ok: boolean, errors: string[]}} */
  function validateLibrary(lib) {
    /** @type {string[]} */ const errors = [];
    if (!lib || lib.schema !== LIB_SCHEMA) return { ok: false, errors: ["schema"] };
    const allowedTop = ["schema", "embedder", "model", "dim", "built", "note", "entries"];
    for (const k of Object.keys(lib)) if (!allowedTop.includes(k)) errors.push(`field not allowed: ${k}`);
    if (!Number.isInteger(lib.dim) || lib.dim < 1) errors.push("dim");
    (Array.isArray(lib.entries) ? lib.entries : []).forEach((/** @type {any} */ e, /** @type {number} */ i) => {
      for (const k of Object.keys(e)) if (!FIELDS.includes(k)) errors.push(`entries[${i}]: field not allowed: ${k}`);
      for (const [k, v] of Object.entries(e)) if (typeof v !== "string" || (k !== "vec" && (v.length > 300 || /data:|base64,/i.test(v)))) errors.push(`entries[${i}].${k}`);
      if (!/^(gtin:\d{14}|reg:[0-9A-Zก-ฮ]{3,40})$/.test(String(e.key))) errors.push(`entries[${i}].key`);
      if (!/^[0-9a-f]{64}$/.test(String(e.photo_sha256))) errors.push(`entries[${i}].photo_sha256`);
      if (decodeVec(e.vec).length !== lib.dim) errors.push(`entries[${i}].vec: length`);
      if (!Object.hasOwn(LICENCES, String(e.licence))) errors.push(`entries[${i}].licence`);
    });
    if (!Array.isArray(lib.entries)) errors.push("entries");
    if (/data:image|base64,/i.test(JSON.stringify(lib))) errors.push("embedded data");
    return { ok: !errors.length, errors };
  }
  /**
   * @param {any} lib @param {any} key {gtin} | {reg} (from the TEXT of the capture) @param {ArrayLike<number>} vec
   * @param {{margin?: number, threshold?: number}} [o]
   */
  function compare(lib, key, vec, o = {}) {
    const k = keyOf(key);
    const refs = (lib && Array.isArray(lib.entries) ? lib.entries : []).filter((/** @type {any} */ e) => e.key === k).map((/** @type {any} */ e) => decodeVec(e.vec));
    const base = { n: refs.length, weak: true, standalone: false };
    if (!refs.length) return { state: "no-references", ...base };
    if (refs.length < MIN_REFS) return { state: "too-few", ...base };
    let refMin = 1;
    for (let i = 0; i < refs.length; i++) for (let j = i + 1; j < refs.length; j++) refMin = Math.min(refMin, cosine(refs[i], refs[j]));
    const best = Math.max(...refs.map(r => cosine(r, vec)));
    const threshold = typeof o.threshold === "number" ? o.threshold : refMin - (typeof o.margin === "number" ? o.margin : MARGIN);
    const r4 = (/** @type {number} */ x) => Math.round(x * 10000) / 10000;
    return { state: best >= threshold ? "similar" : "looks-different", ...base, best: r4(best), refMin: r4(refMin), threshold: r4(threshold) };
  }

  /* ---------------- browser: model + synthetic test pictures ---------------- */
  /** @param {any} tf TensorFlow.js (vendor/tfjs) */
  async function loadModel(tf) {
    let backend = "";
    for (const name of ["webgl", "cpu"]) {
      try { if (await tf.setBackend(name)) { await tf.ready(); backend = name; break; } } catch { /* next */ }
    }
    const model = await tf.loadGraphModel(new URL(MODEL_URL, location.href).href);
    return { model, backend };
  }
  /** The checkout.js vector of a picture (resized to 224 x 224, L2-normalised). @param {any} tf @param {any} model @param {any} canvas */
  function embedCanvas(tf, model, canvas) {
    const out = tf.tidy(() => {
      const x = tf.image.resizeBilinear(tf.browser.fromPixels(canvas).toFloat().div(255), [224, 224]).expandDims(0);
      const f = model.execute({ images: x }, EMB_NODE).reshape([-1]);
      return f.div(f.norm().add(1e-8));
    });
    const v = out.dataSync();
    out.dispose();
    return Float32Array.from(v);
  }
  /** Synthetic "pack" pictures (no real artwork): design = colours + pattern, variant = small shift / scale / light change. */
  const DESIGNS = [
    { bg: "#1d4ed8", band: "#ffffff", mark: "#dc2626", pattern: "band" }, { bg: "#15803d", band: "#facc15", mark: "#0f172a", pattern: "stripes" },
    { bg: "#b91c1c", band: "#111827", mark: "#f9fafb", pattern: "bars" }, { bg: "#7c3aed", band: "#f472b6", mark: "#fde68a", pattern: "dots" },
    { bg: "#f97316", band: "#0ea5e9", mark: "#ffffff", pattern: "grid" }
  ];
  /** @param {any} c canvas @param {number} design @param {number} variant */
  function drawSynthetic(c, design, variant) {
    const D = DESIGNS[design % DESIGNS.length], W = 224, H = 224;
    c.width = W; c.height = H;
    const g = c.getContext("2d");
    const r = (k => () => { k = (k * 1103515245 + 12345) >>> 0; return (k >>> 8) / 16777216; })(design * 7919 + variant * 104729 + 17);
    const dx = (r() - 0.5) * 16, dy = (r() - 0.5) * 16, s = 0.92 + r() * 0.12, light = 0.9 + r() * 0.2;
    g.fillStyle = "#9ca3af"; g.fillRect(0, 0, W, H);
    g.save(); g.translate(W / 2 + dx, H / 2 + dy); g.scale(s, s); g.rotate((r() - 0.5) * 0.08);
    g.fillStyle = D.bg; g.fillRect(-80, -95, 160, 190);
    g.fillStyle = D.band;
    if (D.pattern === "band") { g.fillRect(-80, -20, 160, 40); g.fillStyle = D.mark; g.beginPath(); g.arc(0, -60, 22, 0, Math.PI * 2); g.fill(); }
    else if (D.pattern === "stripes") {
      for (let i = -6; i < 8; i++) { g.save(); g.beginPath(); g.rect(-80, -95, 160, 190); g.clip(); g.translate(i * 26, 0); g.rotate(0.6); g.fillRect(-6, -200, 12, 400); g.restore(); }
      g.fillStyle = D.mark; g.fillRect(-50, 50, 100, 24);
    }
    else if (D.pattern === "bars") { for (let i = 0; i < 6; i++) g.fillRect(-60, -70 + i * 26, 120 - i * 12, 12); g.fillStyle = D.mark; g.fillRect(-70, 70, 140, 14); }
    else if (D.pattern === "dots") { for (let i = 0; i < 5; i++) for (let j = 0; j < 6; j++) { g.beginPath(); g.arc(-60 + i * 30, -75 + j * 30, 9, 0, Math.PI * 2); g.fill(); } }
    else { for (let i = 0; i < 7; i++) { g.fillRect(-80 + i * 26, -95, 4, 190); g.fillRect(-80, -95 + i * 30, 160, 4); } g.fillStyle = D.mark; g.fillRect(-30, -30, 60, 60); }
    g.restore();
    const img = g.getImageData(0, 0, W, H), p = img.data;
    for (let i = 0; i < p.length; i += 4) for (let k = 0; k < 3; k++) p[i + k] = Math.max(0, Math.min(255, Math.round(p[i + k] * light + (r() - 0.5) * 6)));
    g.putImageData(img, 0, 0);
    return c;
  }
  /** A stable 64-hex test checksum for a synthetic picture number. @param {number} n */
  const hexOf = n => Array.from({ length: 8 }, (_, i) => ((Math.imul(n + 1, 2654435761) ^ Math.imul(i + 1, 40503)) >>> 0).toString(16).padStart(8, "0")).join("");

  return { MANIFEST_SCHEMA, LIB_SCHEMA, MIN_REFS, MARGIN, STATES, LICENCES, COUNSEL_OK, EMB_NODE, MODEL_URL, gtin14, keyOf, validateManifest, encodeVec, decodeVec,
    cosine, buildLibrary, validateLibrary, compare, loadModel, embedCanvas, drawSynthetic, DESIGNS, hexOf };
});
