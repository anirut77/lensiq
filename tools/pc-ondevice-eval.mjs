#!/usr/bin/env node
// tools/pc-ondevice-eval.mjs — Product Check P2 measurement: runs the SAME on-device pipeline as medicine.html's
// "Product check" tab (lensiq-pc-run.js: PP-OCRv5 det -> crop -> per-script rec; native BarcodeDetector and the zxing-wasm
// ponyfill; BlazeFace face gate) in headless Chrome on this machine, over
//   A. the public photo set (Open Food Facts / Open Beauty Facts; ~/LENSIQ-field/product-check/public-photos/manifest.jsonl;
//      source label "public dataset, community-entered, unverified ground truth"), and
//   B. a synthetic set rendered on canvas (>= 100 labels with known text: Thai, English, Chinese, Japanese, Korean,
//      Vietnamese x clean / blur / glare / rotation / small; source label "synthetic").
// Images and per-image outputs stay OUTSIDE the repo (default ~/LENSIQ-field/product-check/eval/). Prints a Markdown
// summary (n, rates with Wilson 95 % intervals) for docs/product-check/P2-RESULTS.md.
//
//   node tools/pc-ondevice-eval.mjs                     both sets
//   node tools/pc-ondevice-eval.mjs --photos-only | --synthetic-only | --heldout-only | --limit 20 | --dir <photos dir> | --out <json>
//   (C. held-out rotated set: new texts, angles -12 / -5 / 5 / 12 degrees; runs unless --photos-only / --synthetic-only)
//   node tools/pc-ondevice-eval.mjs --probe            only check that WebGL + the face detector run here
//
// Metrics (defined before the first run):
//   barcode read     = the image yields a decoded code whose digits equal the manifest barcode after both are left-padded
//                      to 14 digits (GTIN-14); per engine (native = the browser's BarcodeDetector, zxing = the vendored
//                      ponyfill). Denominator = all images: whether a barcode is visible in the photo is NOT labelled, so
//                      this is a lower bound of the reader's rate on visible barcodes.
//   wrong GTIN       = a code was decoded but none equals the manifest barcode (a misread or another code on the pack).
//   token found      = LQPC.tokenHit(OCR text, {brands, product_name}).hit: at least one token of the brand(s) or product
//                      name (Latin / digit runs >= 3 chars, Thai / Hangul / kana / Han runs >= 2 chars, NFKC, lower case)
//                      appears as a substring of the OCR text with whitespace removed. Images without any token are not
//                      scored. Reported for the brand alone and for brand-or-name.
//   OCR latency      = det on the full image + det and rec on the crop (ms, after the models are loaded), this machine.
//   script           = the one a user would pick for the pack's country (th / cjk / ko / latin); the Thai default is also
//                      run on every image ("th default").
//   face gate        = LQPC.faceGate over BlazeFace short range on the frame, 2 x 2 tiles and the crop (threshold 0.3).
//   synthetic        = LQPC.charAccuracy(known text, OCR text) per label (1 - edit distance / length, whitespace ignored).
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { homedir, tmpdir, cpus, totalmem, platform, release } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const P = require("../lensiq-pc.js");
const argv = process.argv.slice(2);
const opt = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const has = n => argv.includes(n);
const DIR = resolve(opt("--dir", join(homedir(), "LENSIQ-field", "product-check", "public-photos")));
const OUT = resolve(opt("--out", join(homedir(), "LENSIQ-field", "product-check", "eval", `p2-ondevice-${new Date().toISOString().slice(0, 10)}.json`)));
const LIMIT = +opt("--limit", 0) || 0;
if (OUT.startsWith(repo + "/")) { console.error("pc-ondevice-eval: --out must be outside the repo (data never in the repo)"); process.exit(2); }

// headless Chrome WITH WebGL (SwiftShader): the e2e launcher disables WebGL, but MediaPipe's FaceDetector needs it.
// A tiny wrapper drops the three "disable" switches and execs the real Chrome (same PID, so cdp.mjs can stop it).
const realChrome = process.env.LQ_CHROME || ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", "/usr/bin/google-chrome", "/usr/bin/chromium"].find(p => existsSync(p));
const wrapDir = mkdtempSync(join(tmpdir(), "lq-pc-eval-"));
const wrapper = join(wrapDir, "chrome-webgl.sh");
writeFileSync(wrapper, [
  "#!/bin/bash", "args=()",
  `for a in "$@"; do case "$a" in --disable-webgl|--disable-3d-apis|--disable-gpu) ;; *) args+=("$a");; esac; done`,
  `exec ${JSON.stringify(realChrome)} --use-angle=swiftshader --enable-unsafe-swiftshader "\${args[@]}"`, ""
].join("\n"));
chmodSync(wrapper, 0o755);
process.env.LQ_CHROME = wrapper;
const { launch } = await import("../tests/e2e/cdp.mjs");
const { serve } = await import("./static-server.mjs");

const pct = x => (100 * x).toFixed(1) + " %";
const rate = (k, n) => { if (!n) return "n = 0"; const w = P.wilson(k, n); return `${k} / ${n} = ${pct(k / n)} [${pct(w.lo)} – ${pct(w.hi)}]`; };
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[s.length >> 1] : 0; };
const q = (a, f) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.min(s.length - 1, Math.floor(f * s.length))] : 0; };
const gtin14 = d => String(d || "").replace(/\D/g, "").padStart(14, "0");
const SCRIPT_OF = { th: "th", cn: "cjk", jp: "cjk", kr: "ko", my: "latin", us: "latin", eu: "latin", de: "latin" };

const srv = await serve(repo);
const browser = await launch();
const out = { tool: "tools/pc-ondevice-eval.mjs", date: new Date().toISOString(), machine: {}, photos: null, synthetic: null };
try {
  const page = await browser.newPage(null, { isolated: true });
  await page.goto(`${srv.base}/medicine.html`);
  await page.waitFor("window.LQPCRun && window.LQPC", 15000);
  out.machine = { ...(await page.evaluate(() => ({ ua: navigator.userAgent, webgl2: !!document.createElement("canvas").getContext("webgl2"), threads: navigator.hardwareConcurrency }))),
    cpu: cpus()[0] && cpus()[0].model, cores: cpus().length, ramGB: Math.round(totalmem() / 1073741824), os: `${platform()} ${release()}` };
  console.log("machine:", JSON.stringify(out.machine));
  // model load (first use) timing, all scripts
  out.models = await page.evaluate(async () => {
    const c = document.createElement("canvas"); c.width = 64; c.height = 32; c.getContext("2d").fillRect(0, 0, 64, 32);
    const t = {}, t0 = performance.now();
    await window.LQPCRun.detect(c); t.det = performance.now() - t0;
    for (const s of ["th", "cjk", "ko", "latin"]) { const a = performance.now(); await window.LQPCRun.recognize(c, { x0: 0, y0: 0, x1: 64, y1: 32 }, s); t[s] = performance.now() - a; }
    const f = performance.now(), g = await window.LQPCRun.faceCheck(c, null); t.face = performance.now() - f;
    return { loadMs: t, face: { allow: g.allow, reason: g.reason, error: g.error || "" } };
  });
  out.models.bytes = { det: P.DET.bytes, ...Object.fromEntries(Object.entries(P.SCRIPTS).map(([k, v]) => [k, v.bytes])) };
  console.log("models:", JSON.stringify(out.models));
  if (has("--probe")) { console.log(JSON.stringify(out, null, 1)); process.exit(0); }

  /* ---------- A. public photo set ---------- */
  if (!has("--synthetic-only") && !has("--heldout-only")) {
    const man = join(DIR, "manifest.jsonl");
    if (!existsSync(man)) throw new Error("manifest not found: " + man);
    let rows = readFileSync(man, "utf8").trim().split("\n").map(l => JSON.parse(l));
    if (LIMIT) rows = rows.slice(0, LIMIT);
    const res = [];
    for (const [i, r] of rows.entries()) {
      const b64 = readFileSync(join(DIR, "images", r.file)).toString("base64");
      const script = SCRIPT_OF[r.country_stratum] || "th";
      const o = await page.evaluate(async (data, script) => {
        const img = new Image(); img.src = "data:image/jpeg;base64," + data; await img.decode();
        const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d").drawImage(img, 0, 0);
        const R = window.LQPCRun, P = window.LQPC, t0 = performance.now();
        const det = await R.detect(c);
        const crop = P.cropFromBoxes(det.boxes, c.width, c.height) || { x: 0, y: 0, w: c.width, h: c.height };
        const cc = document.createElement("canvas"); cc.width = crop.w; cc.height = crop.h; cc.getContext("2d").drawImage(c, crop.x, crop.y, crop.w, crop.h, 0, 0, crop.w, crop.h);
        const o1 = await R.ocr(cc, { script });
        const ms = performance.now() - t0;
        const o2 = script === "th" ? o1 : await R.ocr(cc, { script: "th" });
        let nat = { codes: [] }, zx = { codes: [] };
        try { nat = await R.barcodes(c, { engine: "native" }); } catch (e) { nat = { codes: [], error: String(e) }; }
        try { zx = await R.barcodes(c, { engine: "zxing" }); } catch (e) { zx = { codes: [], error: String(e) }; }
        const face = await R.faceCheck(c, crop);
        const qual = R.quality(cc, det.boxes.map(b => ({ x0: b.x0 - crop.x, x1: b.x1 - crop.x, y0: b.y0 - crop.y, y1: b.y1 - crop.y })));
        return { w: c.width, h: c.height, boxes: det.boxes.length, text: o1.text, textTh: o2.text, ms, msDet: det.ms, native: nat.engine === "native" ? nat.codes : null, zxing: zx.codes,
          face: { allow: face.allow, reason: face.reason, maxScore: face.maxScore, error: face.error || "", scopes: Object.fromEntries((face.runs || []).map(r => [r.scope, Math.max(0,
            ...r.faces.map(f => f.score))])) }, hints: qual.hints };
      }, b64, script);
      const want = gtin14(r.barcode);
      const hitN = o.native ? o.native.some(c => gtin14(c.rawValue) === want || (P.parseGS1(c.rawValue).gtin && gtin14(P.parseGS1(c.rawValue).gtin) === want)) : null;
      const hitZ = o.zxing.some(c => gtin14(c.rawValue) === want || (P.parseGS1(c.rawValue).gtin && gtin14(P.parseGS1(c.rawValue).gtin) === want));
      const tokAll = P.tokenHit(o.text, r), tokBrand = P.tokenHit(o.text, { brands: r.brands, product_name: "" });
      const tokAllTh = P.tokenHit(o.textTh, r);
      res.push({ file: r.file, stratum: r.country_stratum, kind: r.image_kind, packArt: !!r.pack_art_person, script, w: o.w, h: o.h, boxes: o.boxes, ms: o.ms,
        native: o.native ? { n: o.native.length, hit: hitN } : null, zxing: { n: o.zxing.length, hit: hitZ },
        tok: tokAll.hit, tokBrand: tokBrand.hit, tokTh: tokAllTh.hit, face: o.face, hints: o.hints, textLen: o.text.length });
      if ((i + 1) % 20 === 0) console.log(`  ${i + 1} / ${rows.length}`);
    }
    out.photos = { source: "public dataset (Open Food Facts / Open Beauty Facts), community-entered, unverified ground truth", dir: DIR, n: res.length, rows: res };
  }

  // drawn cartoon faces (synthetic, no person): does the gate see a face that is not a photo? (5 sizes on a pack-like background)
  if (!has("--heldout-only")) out.drawnFaces = await page.evaluate(async () => {
    const res = [];
    for (const r of [40, 60, 90, 130, 170]) {
      const f = document.createElement("canvas"); f.width = 400; f.height = 400;
      const x = f.getContext("2d"); x.fillStyle = "#cfd8dc"; x.fillRect(0, 0, 400, 400);
      const cx = 200, cy = 210, g = x.createRadialGradient(cx - 10, cy - 20, 4, cx, cy, r * 1.2); g.addColorStop(0, "#f2c9a8"); g.addColorStop(1, "#c98e6a");
      x.fillStyle = g; x.beginPath(); x.ellipse(cx, cy, r * 0.78, r, 0, 0, Math.PI * 2); x.fill();
      x.fillStyle = "#3b2a20"; x.beginPath(); x.ellipse(cx, cy - r * 0.8, r * 0.82, r * 0.45, 0, Math.PI, 0); x.fill();
      for (const ex of [cx - r * 0.3, cx + r * 0.3]) { x.fillStyle = "#fff"; x.beginPath(); x.ellipse(ex, cy - r * 0.15, r * 0.15, r * 0.08, 0, 0,
        Math.PI * 2); x.fill(); x.fillStyle = "#2b1d14"; x.beginPath(); x.arc(ex, cy - r * 0.15, r * 0.06, 0, Math.PI * 2); x.fill(); }
      x.strokeStyle = "#a8735a"; x.lineWidth = Math.max(2, r * 0.04); x.beginPath(); x.moveTo(cx, cy - r * 0.05); x.lineTo(cx - r * 0.07, cy + r * 0.3); x.lineTo(cx + r * 0.07, cy
        + r * 0.32); x.stroke();
      x.fillStyle = "#a33a3a"; x.beginPath(); x.ellipse(cx, cy + r * 0.55, r * 0.25, r * 0.09, 0, 0, Math.PI * 2); x.fill();
      const o = await window.LQPCRun.faceCheck(f, { x: 0, y: 0, w: 400, h: 400 });
      res.push({ r, allow: o.allow, reason: o.reason, maxScore: o.maxScore });
    }
    return res;
  });
  console.log("drawn faces:", JSON.stringify(out.drawnFaces));

  /* ---------- B. synthetic labels ---------- */
  if (!has("--photos-only") && !has("--heldout-only")) {
    const TEXT = {
      th: ["ผลิตภัณฑ์เสริมอาหาร", "ส่วนประกอบ น้ำตาล เกลือ", "ปริมาณสุทธิ 120 กรัม", "เก็บในที่แห้งและเย็น", "ผลิตโดย บริษัท ตัวอย่าง จำกัด", "วันผลิต 01/05/2569"],
      en: ["Net weight 250 g", "Ingredients: water, sugar, salt", "Store in a cool dry place", "Best before 12/2027", "Manufactured by Example Co., Ltd.", "Lot No. A12345"],
      vi: ["Thành phần: nước, đường, muối", "Khối lượng tịnh: 250 g", "Bảo quản nơi khô ráo, thoáng mát", "Hạn sử dụng: xem trên bao bì", "Sản xuất bởi Công ty Mẫu", "Số lô: A12345"],
      zh: ["配料：水、白砂糖、食用盐", "净含量：250克", "保质期：十二个月", "贮存条件：阴凉干燥处", "生产商：示例食品有限公司", "产品批号：A12345"],
      ja: ["原材料名：砂糖、食塩、水", "内容量：二百五十グラム", "賞味期限：枠外下部に記載", "保存方法：直射日光を避けて", "製造者：株式会社サンプル", "ロット番号：A12345"],
      ko: ["원재료명: 정제수, 설탕, 소금", "내용량: 250 그램", "보관방법: 서늘한 곳에 보관", "유통기한: 별도 표기일까지", "제조원: 예시식품 주식회사", "제조번호: A12345"]
    };
    const SCRIPT = { th: "th", en: "latin", vi: "latin", zh: "cjk", ja: "cjk", ko: "ko" };
    const FONT = { th: "LQThai", en: "LQTestSans", vi: "LQTestSans", zh: "PingFang SC", ja: "Hiragino Sans", ko: "Apple SD Gothic Neo" };
    const CONDS = ["clean", "blur", "glare", "rotate", "small"];
    const labels = [];
    for (const lang of Object.keys(TEXT)) for (let k = 0; k < 5; k++) for (const cond of CONDS) labels.push({ lang, k, cond, lines: [TEXT[lang][k], TEXT[lang][(k + 1) % 6], TEXT[lang][(k
      + 2) % 6]] });
    const fonts = await page.evaluate(async () => {
      const add = async (fam, url, o) => { const f = new FontFace(fam, "url(" + url + ")", o); document.fonts.add(await f.load()); };
      await add("LQThai", "vendor/fonts/prompt/prompt-500-thai.woff2", { weight: "500", unicodeRange: "U+0E00-0E7F" });
      await add("LQThai", "vendor/fonts/prompt/prompt-500-latin.woff2", { weight: "500", unicodeRange: "U+0000-00FF" });
      await add("LQTestSans", "tests/fixtures/fonts/liberation/LiberationSans-Regular.ttf", { weight: "400" });
      const ok = {};
      for (const [f, s] of [["LQThai", "ผลิต"], ["LQTestSans", "Thành"], ["PingFang SC", "配料"], ["Hiragino Sans", "原材料"], ["Apple SD Gothic Neo",
        "원재료"]]) ok[f] = document.fonts.check(`32px "${f}"`, s);
      return ok;
    });
    console.log("synthetic fonts:", JSON.stringify(fonts));
    const sres = [];
    for (const L of labels) {
      const o = await page.evaluate(async (L, font, script) => {
        const small = L.cond === "small", size = small ? 15 : 34, W = small ? 520 : 900, lh = size * 1.9;
        const c = document.createElement("canvas"); c.width = W; c.height = Math.round(lh * 3 + size * 2.5);
        const x = c.getContext("2d"); x.fillStyle = "#f7f4ec"; x.fillRect(0, 0, c.width, c.height);
        if (L.cond === "rotate") { x.translate(c.width / 2, c.height / 2); x.rotate((8 * Math.PI) / 180); x.translate(-c.width / 2, -c.height / 2); }
        x.fillStyle = "#1a1a1a"; x.textBaseline = "middle"; x.font = `${size}px "${font}"`;
        L.lines.forEach((t, i) => x.fillText(t, size, size * 1.4 + i * lh));
        let img = c;
        if (L.cond === "blur") { const b = document.createElement("canvas"); b.width = c.width; b.height = c.height; const bx = b.getContext("2d"); bx.filter = "blur(2px)"; bx.drawImage(c,
          0, 0); img = b; }
        if (L.cond === "glare") { const g = x.createRadialGradient(c.width * 0.45, c.height * 0.5, 4, c.width * 0.45, c.height * 0.5, c.height * 0.45); g.addColorStop(0,
          "rgba(255,255,255,0.92)"); g.addColorStop(1, "rgba(255,255,255,0)"); x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = g; x.fillRect(0, 0, c.width, c.height); }
        const t0 = performance.now(), r = await window.LQPCRun.ocr(img, { script });
        const qual = window.LQPCRun.quality(img, r.boxes);
        return { text: r.text, ms: performance.now() - t0, hints: qual.hints };
      }, L, FONT[L.lang], SCRIPT[L.lang]);
      const ca = P.charAccuracy(L.lines.join(""), o.text);
      let caTh = null;
      if (L.lang === "en" && L.cond === "clean") { // English read with the Thai default model (the page's default)
        const t = await page.evaluate(async (L) => {
          const c = document.createElement("canvas"); c.width = 900; c.height = 190;
          const x = c.getContext("2d"); x.fillStyle = "#f7f4ec"; x.fillRect(0, 0, 900, 190);
          x.fillStyle = "#1a1a1a"; x.textBaseline = "middle"; x.font = '34px "LQTestSans"';
          L.lines.forEach((t, i) => x.fillText(t, 34, 48 + i * 65));
          return (await window.LQPCRun.ocr(c, { script: "th" })).text;
        }, L);
        caTh = P.charAccuracy(L.lines.join(""), t);
      }
      sres.push({ lang: L.lang, cond: L.cond, k: L.k, script: SCRIPT[L.lang], ca, caTh, ms: o.ms, hints: o.hints, ref: L.lines.join(" / "), text: o.text.replace(/\n/g, " / ") });
    }
    out.synthetic = { source: "synthetic (rendered on canvas in this browser; fonts: Prompt (OFL), Liberation Sans (OFL), macOS system PingFang SC / Hiragino Sans / Apple SD Gothic Neo)",
      fonts, n: sres.length, rows: sres };
  }

  /* ---------- C. held-out rotated labels (added after the rotated-box change; texts and angles never used for tuning) ---------- */
  if (!has("--photos-only") && !has("--synthetic-only")) {
    const HT = {
      th: ["ยาสามัญประจำบ้าน", "ห้ามใช้ในเด็กอายุต่ำกว่า 2 ปี", "เลขที่ผลิต 6A0912", "เก็บให้พ้นมือเด็ก", "ขนาดบรรจุ 10 เม็ด", "ผลิตที่ประเทศไทย"],
      en: ["Keep out of reach of children", "Batch 6A0912", "Contains 10 tablets", "Do not use if seal is broken", "Made in Thailand", "Expiry 05/2028"],
      vi: ["Để xa tầm tay trẻ em", "Số lô 6A0912", "Hộp 10 viên", "Không dùng nếu bao bì bị rách", "Sản xuất tại Thái Lan", "Hạn dùng 05/2028"],
      zh: ["请放在儿童接触不到的地方", "生产批号 6A0912", "每盒十片", "包装破损请勿使用", "泰国制造", "有效期至二零二八年五月"],
      ja: ["子供の手の届かない所に保管", "製造番号 6A0912", "十錠入り", "開封後はお早めに", "タイ製", "使用期限二〇二八年五月"],
      ko: ["어린이 손에 닿지 않게 보관", "제조번호 6A0912", "10정 포장", "포장이 손상되면 사용 금지", "태국산", "사용기한 2028년 5월"]
    };
    const SC = { th: "th", en: "latin", vi: "latin", zh: "cjk", ja: "cjk", ko: "ko" };
    const FT = { th: "LQThai", en: "LQTestSans", vi: "LQTestSans", zh: "PingFang SC", ja: "Hiragino Sans", ko: "Apple SD Gothic Neo" };
    await page.evaluate(async () => {
      const add = async (fam, url, o) => { const f = new FontFace(fam, "url(" + url + ")", o); document.fonts.add(await f.load()); };
      await add("LQThai", "vendor/fonts/prompt/prompt-500-thai.woff2", { weight: "500", unicodeRange: "U+0E00-0E7F" });
      await add("LQThai", "vendor/fonts/prompt/prompt-500-latin.woff2", { weight: "500", unicodeRange: "U+0000-00FF" });
      await add("LQTestSans", "tests/fixtures/fonts/liberation/LiberationSans-Regular.ttf", { weight: "400" });
    });
    const hres = [];
    for (const lang of Object.keys(HT)) for (let k = 0; k < 3; k++) for (const deg of [-12, -5, 5, 12]) {
      const lines = [HT[lang][2 * k], HT[lang][2 * k + 1]];
      const o = await page.evaluate(async (lines, font, script, deg) => {
        const c = document.createElement("canvas"); c.width = 860; c.height = 260;
        const x = c.getContext("2d"); x.fillStyle = "#fbf8f0"; x.fillRect(0, 0, c.width, c.height);
        x.translate(c.width / 2, c.height / 2); x.rotate((deg * Math.PI) / 180); x.translate(-c.width / 2, -c.height / 2);
        x.fillStyle = "#202020"; x.textBaseline = "middle"; x.font = `32px "${font}"`;
        lines.forEach((t, i) => x.fillText(t, 60, 95 + i * 70));
        return (await window.LQPCRun.ocr(c, { script })).text;
      }, lines, FT[lang], SC[lang], deg);
      hres.push({ lang, k, deg, script: SC[lang], ca: P.charAccuracy(lines.join(""), o), ref: lines.join(" / "), text: o.replace(/\n/g, " / ") });
    }
    out.heldout = { source: "synthetic, held out (new texts and angles -12 / -5 / 5 / 12 degrees, generated after the rotated-box change)", n: hres.length, rows: hres };
  }
} finally {
  await browser.close(); await srv.close();
  try { rmSync(wrapDir, { recursive: true, force: true }); } catch { /* ignore */ }
}

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(out, null, 1));

/* ---------- summary (Markdown) ---------- */
const lines = [];
const L = s => lines.push(s);
L(`Machine: ${out.machine.cpu}, ${out.machine.cores} cores, ${out.machine.ramGB} GB RAM, ${out.machine.os}; ${(/Chrome\/[\d.]+/.exec(out.machine.ua)
  || [""])[0]} headless, ONNX Runtime Web WASM 1 thread; WebGL2 (SwiftShader, for the face detector only): ${out.machine.webgl2}. NOT a phone.`);
L("");
L("| Model | Bytes | MiB | First load (ms, this machine) |");
L("|---|---|---|---|");
for (const k of ["det", "th", "cjk", "ko", "latin"]) L(`| ${k === "det" ? "PP-OCRv5 mobile det" : "rec "
  + k} | ${out.models.bytes[k].toLocaleString("en")} | ${(out.models.bytes[k] / 1048576).toFixed(1)} | ${Math.round(out.models.loadMs[k])} |`);
const mib = s => (P.downloadBytes(s) / 1048576).toFixed(1);
L(`| download per script (det + rec) | th ${mib("th")} · cjk ${mib("cjk")} · ko ${mib("ko")} · latin ${mib("latin")} MiB | | |`);
if (out.photos) {
  const R = out.photos.rows, strata = ["th", "cn", "jp", "kr", "my", "us", "eu", "de"];
  L(""); L(`### A. Public photo set (n = ${R.length} images; ${out.photos.source})`); L("");
  L("| Stratum (script) | Images | Barcode read, native (macOS) | Barcode read, zxing-wasm | Wrong GTIN (zxing) | Brand token found" +
    " | Brand-or-name token found | same, Thai default script | OCR ms median / p90 |");
  L("|---|---|---|---|---|---|---|---|---|");
  const row = (name, rs) => {
    const nat = rs.filter(r => r.native), sb = rs.filter(r => r.tokBrand !== null), sa = rs.filter(r => r.tok !== null), st = rs.filter(r => r.tokTh !== null);
    L(`| ${name} | ${rs.length} | ${nat.length ? rate(nat.filter(r => r.native.hit).length, nat.length) : "n/a"} | ${rate(rs.filter(r => r.zxing.hit).length,
      rs.length)} | ${rs.filter(r => r.zxing.n && !r.zxing.hit).length} | ${rate(sb.filter(r => r.tokBrand).length, sb.length)} | ${rate(sa.filter(r => r.tok).length,
      sa.length)} | ${rate(st.filter(r => r.tokTh).length, st.length)} | ${Math.round(med(rs.map(r => r.ms)))} / ${Math.round(q(rs.map(r => r.ms), 0.9))} |`);
  };
  for (const s of strata) { const rs = R.filter(r => r.stratum === s); if (rs.length) row(`${s} (${SCRIPT_OF[s]})`, rs); }
  row("**all**", R);
  row("front images", R.filter(r => r.kind === "front"));
  row("ingredients images", R.filter(r => r.kind === "ingredients"));
  const pa = R.filter(r => r.packArt), other = R.filter(r => !r.packArt);
  L(""); L("Face gate (BlazeFace short range on the frame, 2 x 2 tiles and the crop; threshold 0.3):");
  L(`- pack-art images (printed / drawn people on the pack): blocked ${rate(pa.filter(r => !r.face.allow).length, pa.length)}; reasons ${JSON.stringify(pa.reduce((a, r) => (a[r.face.reason
    || "allowed"] = (a[r.face.reason || "allowed"] || 0) + 1, a), {}))}`);
  L(`- other images (no person after the P1 manual check): blocked ${rate(other.filter(r => !r.face.allow).length, other.length)}; reasons ${JSON.stringify(other.reduce((a,
    r) => (a[r.face.reason || "allowed"] = (a[r.face.reason || "allowed"] || 0) + 1, a), {}))}`);
  const by = (rs, sc) => rs.filter(r => (r.face.scopes || {})[sc] >= 0.3).length;
  L(`- which run found the face (images with a score >= 0.3; one image can count in several): pack art frame ${by(pa, "frame")} / tiles ${by(pa, "tiles")} / crop ${by(pa,
    "crop")}; other images frame ${by(other, "frame")} / tiles ${by(other, "tiles")} / crop ${by(other, "crop")}`);
  for (const t of [0.5, 0.7]) L(`- for comparison only (the gate stays at 0.3): blocked at threshold ${t}: pack art ${rate(pa.filter(r => r.face.maxScore >= t).length,
    pa.length)}, other ${rate(other.filter(r => r.face.maxScore >= t).length, other.length)}`);
  if (out.drawnFaces) L(`- drawn cartoon faces (synthetic, 5 sizes): blocked ${rate(out.drawnFaces.filter(f => !f.allow).length,
    out.drawnFaces.length)}, scores ${JSON.stringify(out.drawnFaces.map(f => f.maxScore))}`);
  const hints = {}; for (const r of R) for (const h of r.hints) hints[h] = (hints[h] || 0) + 1;
  L(`- quality hints raised (heuristic thresholds, not validated): ${JSON.stringify(hints)} over ${R.length} images`);
}
if (out.synthetic) {
  const S = out.synthetic.rows;
  L(""); L(`### B. Synthetic labels (n = ${S.length}; ${out.synthetic.source})`); L("");
  const conds = ["clean", "blur", "glare", "rotate", "small"];
  L(`| Language (model) | ${conds.join(" | ")} | all: mean char accuracy | labels >= 95 % |`);
  L(`|---|${conds.map(() => "---").join("|")}|---|---|`);
  for (const lang of ["th", "en", "vi", "zh", "ja", "ko"]) {
    const rs = S.filter(r => r.lang === lang);
    const m = rs2 => (rs2.length ? (100 * rs2.reduce((a, r) => a + r.ca, 0) / rs2.length).toFixed(1) + ` (n=${rs2.length})` : "-");
    L(`| ${lang} (${rs[0].script}) | ${conds.map(c => m(rs.filter(r => r.cond === c))).join(" | ")} | ${m(rs)} | ${rate(rs.filter(r => r.ca >= 0.95).length, rs.length)} |`);
  }
  const all = S, en = S.filter(r => r.caTh !== null);
  L(`| **all** | ${conds.map(c => { const rs = all.filter(r => r.cond === c); return (100 * rs.reduce((a, r) => a + r.ca, 0) / rs.length).toFixed(1)
    + ` (n=${rs.length})`; }).join(" | ")} | ${(100 * all.reduce((a, r) => a + r.ca, 0) / all.length).toFixed(1)} (n=${all.length}) | ${rate(all.filter(r => r.ca >= 0.95).length,
    all.length)} |`);
  if (en.length) L(`\nEnglish read with the Thai default model (clean only): mean char accuracy ${(100 * en.reduce((a, r) => a + r.caTh, 0) / en.length).toFixed(1)} % (n = ${en.length}).`);
  L(`OCR ms per synthetic label: median ${Math.round(med(S.map(r => r.ms)))}, p90 ${Math.round(q(S.map(r => r.ms), 0.9))}.`);
}
if (out.heldout) {
  const H = out.heldout.rows, mean = rs => (rs.length ? (100 * rs.reduce((a, r) => a + r.ca, 0) / rs.length).toFixed(1) : "-");
  L(""); L(`### C. Held-out rotated labels (n = ${H.length}; ${out.heldout.source})`); L("");
  L("| Language (model) | -12° | -5° | 5° | 12° | all | labels >= 95 % |");
  L("|---|---|---|---|---|---|---|");
  for (const lang of ["th", "en", "vi", "zh", "ja", "ko"]) {
    const rs = H.filter(r => r.lang === lang);
    L(`| ${lang} (${rs[0].script}) | ${[-12, -5, 5, 12].map(d => mean(rs.filter(r => r.deg === d))).join(" | ")} | ${mean(rs)} (n=${rs.length}) | ${rate(rs.filter(r => r.ca >= 0.95).length,
      rs.length)} |`);
  }
  L(`| **all** | ${[-12, -5, 5, 12].map(d => mean(H.filter(r => r.deg === d))).join(" | ")} | ${mean(H)} (n=${H.length}) | ${rate(H.filter(r => r.ca >= 0.95).length, H.length)} |`);
}
const md = lines.join("\n");
console.log("\n" + md);
writeFileSync(OUT.replace(/\.json$/, ".md"), md + "\n");
console.log(`\npc-ondevice-eval: wrote ${OUT} (+ .md)`);
