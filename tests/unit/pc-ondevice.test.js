"use strict";
// tests/unit/pc-ondevice.test.js — Product Check P2, on-device step (lensiq-pc.js, LQPC). Fixed test set written before
// the pipeline was run (design docs/PRODUCT-CHECK-DESIGN.md §3, §8.2, §12 P2):
//   registration-number SHAPES with real-format examples (Thai drug / herbal / food / cosmetic / device / advert permits,
//   Malaysia MAL / NOT, Singapore SIN, Canada DIN / NPN, US NDC, China, EU, Australia) — format only, never "registered";
//   GTIN check digits and GS1 element strings (AI 01 mod-10, 17 with DD = 00 -> last day, 10, 21; FNC1 / GS; "(01)…" text);
//   quality metrics on synthetic images (Laplacian / Tenengrad blur, HSV glare blob, exposure clipping, text height);
//   DB box post-processing + reading order + product crop; CTC decoding on synthetic logits / probabilities;
//   the face gate decision (fails closed); measurement helpers; page-level safety rules for the new files.
const test = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync, statSync, existsSync } = require("node:fs");
const { join } = require("node:path");

const ROOT = join(__dirname, "..", "..");
const P = require("../../lensiq-pc.js");

/* ---------- synthetic images ---------- */
function img(w, h, fn) {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [r, g, b] = fn(x, y), i = 4 * (y * w + x);
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
  }
  return { data, width: w, height: h };
}
const gray = v => [v, v, v];
const checker = (s = 4) => (x, y) => gray(((x / s | 0) + (y / s | 0)) % 2 ? 230 : 25);
function boxBlur(im, r) {
  const { width: w, height: h, data } = im, out = new Uint8ClampedArray(data.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) {
    let s = 0, n = 0;
    for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) { const xx = x + i, yy = y + j; if (xx >= 0 && yy >= 0 && xx < w && yy < h) { s += data[4 * (yy * w + xx) + c]; n++; } }
    out[4 * (y * w + x) + c] = s / n;
  }
  for (let i = 3; i < out.length; i += 4) out[i] = 255;
  return { data: out, width: w, height: h };
}

test("model table: det + four recognisers, sizes match the vendored files, Thai is the default script", () => {
  assert.equal(P.DEFAULT_SCRIPT, "th");
  assert.deepEqual(Object.keys(P.SCRIPTS).sort(), ["cjk", "ko", "latin", "th"]);
  for (const m of [P.DET, ...Object.values(P.SCRIPTS)]) {
    const f = join(ROOT, m.model);
    assert.ok(existsSync(f), m.model);
    assert.equal(statSync(f).size, m.bytes, m.model + " size");
    assert.ok(m.bytes < 25 * 1024 * 1024, "every model < 25 MB");
    if (m.dict) assert.ok(existsSync(join(ROOT, m.dict)), m.dict);
  }
  assert.equal(P.scriptFor("ja"), "cjk"); assert.equal(P.scriptFor("zh-TW"), "cjk"); assert.equal(P.scriptFor("ko"), "ko");
  assert.equal(P.scriptFor("vi"), "latin"); assert.equal(P.scriptFor(""), "th"); assert.equal(P.scriptFor("th"), "th");
  assert.equal(P.downloadBytes("th"), 4826518 + 7891015);
  for (const f of ["vendor/models/pc-ocr/LICENSE", "vendor/models/pc-ocr/README.txt", "vendor/models/face-gate/LICENSE", "vendor/models/face-gate/README.txt",
    "vendor/zxing/README.txt", "vendor/zxing/LICENSE-barcode-detector", "vendor/zxing/LICENSE-zxing-wasm", "vendor/zxing/LICENSE-zxing-cpp-Apache-2.0"]) assert.ok(existsSync(join(ROOT, f)), f);
});

test("registration shapes: Thailand (drug, herbal, food, cosmetic 13 / 10 digits, device, advert permits)", () => {
  const f = t => P.findRegNumbers(t).map(r => `${r.country}:${r.kind}:${r.norm}${r.note ? ":" + r.note : ""}`);
  assert.deepEqual(f("Reg. No. 1A 15/50"), ["TH:drug:1A 15/50"]);
  assert.deepEqual(f("เลขทะเบียน ๒A ๓/๖๐ (NG)"), ["TH:drug:2A 3/60 (NG)"]);
  assert.deepEqual(f("ทะเบียนยาเลขที่ G 123/45"), ["TH:herbal-or-drug:G 123/45:uncertain"]);
  assert.deepEqual(f("อย. 10-1-12345-1-0001"), ["TH:food:10-1-12345-1-0001"]);
  // the publicly reported FAKE cosmetic number (design §4.1): the shape is right — that is all the parser may say
  const cos = P.findRegNumbers("เลขที่ใบรับจดแจ้ง 10-2-6600188171");
  assert.deepEqual(cos.map(r => [r.country, r.kind, r.norm, r.check, r.ok]), [["TH", "cosmetic", "10-2-6600188171", "format", true]]);
  assert.ok(!("registered" in cos[0]) && !("genuine" in cos[0]) && !("valid" in cos[0]), "never asserts registration");
  assert.deepEqual(f("จดแจ้ง 10-1-5512345"), ["TH:cosmetic:10-1-5512345:older"]);
  assert.deepEqual(f("ใบรับแจ้ง 63-2-2-2-0001234"), ["TH:device:63-2-2-2-0001234:unverified"]);
  assert.deepEqual(f("ฆท. 1020/2564"), ["TH:advert:ฆท. 1020/2564"]);
  assert.deepEqual(f("ฆท.HB74/64A"), ["TH:advert:ฆท. HB74/64A"]);
  assert.deepEqual(f("ใบอนุญาตโฆษณา ฆอ. 3920/2564"), ["TH:advert:ฆอ. 3920/2564"]);
  // not registrations
  assert.deepEqual(f("โทร 02-590-7000 วันหมดอายุ 12/2027"), []);
  assert.deepEqual(f("LOT K 12/25"), [], "lot code after LOT is not a registration (LQMed rule)");
  assert.deepEqual(f("8850002027688"), [], "plain 13 digits are left to the barcode reader");
});

test("registration shapes: Malaysia, Singapore, Canada, USA, China, EU, Australia (format only)", () => {
  const f = t => P.findRegNumbers(t).map(r => `${r.country}:${r.kind}:${r.norm}`);
  assert.deepEqual(f("MAL19990123AZ"), ["MY:mal:MAL19990123AZ"]);
  assert.deepEqual(f("mal 20071234 x"), ["MY:mal:MAL20071234X"]);
  assert.deepEqual(f("Notification no. NOT200101234K"), ["MY:not:NOT200101234K"]);
  assert.deepEqual(f("SIN12345P"), ["SG:sin:SIN12345P"]);
  assert.deepEqual(f("DIN 02242963"), ["CA:din:02242963"]);
  assert.deepEqual(f("NPN: 80012345"), ["CA:npn:80012345"]);
  assert.deepEqual(f("an 8-digit number 02242963 alone"), [], "DIN / NPN need their label word");
  assert.deepEqual(f("NDC 0603-5892-21"), ["US:ndc:0603-5892-21"]);
  assert.deepEqual(f("NDC 50580-506-02"), ["US:ndc:50580-506-02"]);
  assert.deepEqual(f("NDC 00093715001"), ["US:ndc:00093715001"]);
  assert.deepEqual(f("国药准字H20003263"), ["CN:cn-drug:国药准字H20003263"]);
  assert.deepEqual(f("国食健注G20190123"), ["CN:cn-health:国食健注G20190123"]);
  assert.deepEqual(f("EU/1/00/123/001"), ["EU:eu:EU/1/00/123/001"]);
  assert.deepEqual(f("AUST R 12345"), ["AU:aust:AUST R 12345"]);
  for (const r of P.findRegNumbers("MAL19990123AZ SIN12345P DIN 02242963 NDC 0603-5892-21")) assert.equal(r.check, "format");
  for (const c of ["TH", "MY", "SG", "CA", "US", "CN", "EU", "AU", "JP", "KR", "GS1"]) {
    assert.ok(P.VERIFY[c] && P.VERIFY[c].length, "verify links for " + c);
    for (const v of P.VERIFY[c]) assert.match(v.url, /^https:\/\//);
  }
  assert.ok(P.VERIFY.TH.some(v => /oryor\.com/.test(v.url)), "oryor.com");
});

test("GTIN / EAN / UPC check digits and GS1 issuer prefix (issuer, not origin)", () => {
  for (const d of ["4006381333931", "036000291452", "96385074", "09501101530003", "8850006939727"]) assert.equal(P.gtinValid(d), true, d);
  for (const d of ["4006381333932", "036000291453", "96385075", "09501101530004", "12345", "abc"]) assert.equal(P.gtinValid(d), false, d);
  assert.equal(P.gs1Prefix("8850006939727").issuer, "TH");
  assert.equal(P.gs1Prefix("4006381333931").issuer, "DE");
  assert.equal(P.gs1Prefix("036000291452").issuer, "US/CA");
  assert.equal(P.gs1Prefix("6920354838392").issuer, "CN");
  assert.equal(P.gs1Prefix("4901234567894").issuer, "JP");
  assert.equal(P.gs1Prefix("8801234567893").issuer, "KR");
  assert.equal(P.gs1Prefix("9556183960811").issuer, "MY");
  // GTIN-14: the GTIN-13 behind the indicator digit counts. 950 = GS1 Global Office (example numbers), not a national office
  assert.deepEqual(P.gs1Prefix("09501101530003"), { code: "950", issuer: "" });
  assert.equal(P.gs1Prefix("00036000291452").issuer, "US/CA");
});

test("GS1 element strings: AI 01 (mod-10), 17 (DD = 00 -> last day), 10, 21; FNC1 / GS; symbology id; '(01)…' text form", () => {
  const GS = "\u001d", now = new Date(Date.UTC(2026, 10, 9));
  const a = P.parseGS1("]d2" + "0109501101530003" + "17250630" + "10ABC123" + GS + "21XYZ987", { now });
  assert.equal(a.ok, true); assert.equal(a.symbology, "]d2");
  assert.equal(a.gtin, "09501101530003"); assert.equal(a.gtinValid, true);
  assert.equal(a.expiry.iso, "2025-06-30"); assert.equal(a.expiry.dayAssumed, false);
  assert.equal(a.lot, "ABC123"); assert.equal(a.serial, "XYZ987");
  assert.deepEqual(a.fields.map(x => x.ai), ["01", "17", "10", "21"]);
  const b = P.parseGS1("0109501101530003172511001012345", { now });
  assert.equal(b.expiry.iso, "2025-11-30"); assert.equal(b.expiry.dayAssumed, true, "DD = 00 means the last day of the month");
  assert.equal(b.lot, "12345");
  assert.equal(P.parseGS1("01095011015300031724020010L1", { now }).expiry.iso, "2024-02-29", "leap year");
  assert.equal(P.parseGS1("01095011015300031723020010L1", { now }).expiry.iso, "2023-02-28");
  const t = P.parseGS1("(01)09501101530003(17)270131(10)LOT 7(21)S1", { now });
  assert.equal(t.ok, true); assert.equal(t.expiry.iso, "2027-01-31"); assert.equal(t.lot, "LOT 7"); assert.equal(t.serial, "S1");
  const g = P.parseGS1("010950110153000310ABC<GS>17260500", { now });
  assert.equal(g.lot, "ABC"); assert.equal(g.expiry.iso, "2026-05-31");
  const bad = P.parseGS1("(01)09501101530004(17)250630", { now });
  assert.equal(bad.gtinValid, false); assert.ok(bad.errors.includes("gtin-check"));
  assert.equal(P.parseGS1("(01)09501101530003(17)251301", { now }).expiry, null, "month 13 is not a date");
  assert.equal(P.parseGS1("0109501101530003", { now }).ok, true);
  assert.equal(P.parseGS1("99", { now }).ok, true, "AI 90-99 internal, empty value allowed");
  assert.equal(P.parseGS1("0109501101", { now }).ok, false, "short fixed field");
  assert.equal(P.parseGS1("hello", { now }).ok, false);
  // century window (GS1 GenSpecs 7.12): within -49 / +50 years of today
  assert.equal(P.gs1Date("991231", now).year, 1999);
  assert.equal(P.gs1Date("700101", now).year, 2070);
  assert.equal(P.gs1Date("760101", now).year, 2076);
  assert.equal(P.gs1Date("770101", now).year, 1977);
  assert.equal(P.lastDay(2025, 2), 28); assert.equal(P.lastDay(2028, 2), 29); assert.equal(P.lastDay(2026, 12), 31);
});

test("barcodeInfo: GS1 DataMatrix vs plain EAN / UPC vs other text", () => {
  const now = new Date(Date.UTC(2026, 10, 9));
  const dm = P.barcodeInfo("010950110153000317270131\u001d10A1", "data_matrix", { now });
  assert.equal(dm.kind, "gs1"); assert.equal(dm.expiry.iso, "2027-01-31"); assert.equal(dm.lot, "A1");
  const e = P.barcodeInfo("8850006939727", "ean_13");
  assert.equal(e.kind, "gtin"); assert.equal(e.gtinValid, true); assert.equal(e.prefix.issuer, "TH");
  assert.equal(P.barcodeInfo("8850006939728", "ean_13").gtinValid, false);
  assert.equal(P.barcodeInfo("https://example.com/x", "qr_code").kind, "other");
});

test("quality: Laplacian variance + Tenengrad drop with blur; glare blob; exposure clipping; text height", () => {
  const sharp = img(160, 120, checker(4)), soft = boxBlur(sharp, 4);
  const gs = P.luma(sharp), gb = P.luma(soft);
  assert.ok(P.laplacianVar(gs, 160, 120) > 10 * P.laplacianVar(gb, 160, 120), "Laplacian variance falls with blur");
  assert.ok(P.tenengrad(gs, 160, 120) > 3 * P.tenengrad(gb, 160, 120), "Tenengrad falls with blur");
  assert.ok(!P.assess(sharp).hints.includes("blur"));
  const flat = img(160, 120, (x, y) => gray(120 + ((x + y) % 3)));
  assert.ok(P.assess(flat).hints.includes("blur"), "no detail -> blur hint");
  // glare: a compact near-white, unsaturated blob on a textured mid-tone label
  const base = (x, y) => [150 + (x % 7) * 3, 90 + (y % 5) * 4, 60];
  const spot = img(200, 150, (x, y) => ((x - 120) ** 2 + (y - 60) ** 2 < 15 ** 2 ? [255, 255, 252] : base(x, y)));
  const g = P.assess(spot);
  assert.ok(g.hints.includes("glare"), "glare blob found " + JSON.stringify(g.glare));
  assert.ok(g.glare.blob > 0.02 && g.glare.blob < 0.03);
  assert.ok(!P.assess(img(200, 150, base)).hints.includes("glare"));
  assert.ok(!P.assess(img(200, 150, () => [250, 250, 250])).hints.includes("glare"), "a plain white label is not a glare spot");
  assert.ok(P.assess(img(80, 60, () => gray(3))).hints.includes("dark"));
  assert.ok(P.assess(img(80, 60, (x) => (x < 40 ? gray(255) : gray(200)))).hints.includes("bright"));
  // text height from detection boxes (photo pixels)
  assert.deepEqual(P.textSize([{ y0: 0, y1: 10 }, { y0: 0, y1: 12 }, { y0: 5, y1: 13 }]), { n: 3, median: 10 });
  assert.ok(P.assess(sharp, [{ x0: 0, x1: 50, y0: 0, y1: 9 }]).hints.includes("small"));
  assert.ok(P.assess(sharp, []).hints.includes("notext"));
  assert.ok(!P.assess(sharp, [{ x0: 0, x1: 90, y0: 0, y1: 30 }]).hints.includes("small"));
  // resolution-independent: the same scene at 2x gives the same blur decision
  const big = img(320, 240, checker(8));
  assert.equal(P.assess(big).blur.flag, P.assess(sharp).blur.flag);
});

test("DB post-processing: components, box score, unclip, small / weak boxes dropped; reading order; product crop", () => {
  const W = 100, H = 60, prob = new Float32Array(W * H);
  const fill = (x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) prob[y * W + x] = v; };
  fill(10, 10, 40, 18, 0.9);   // line 1, left word
  fill(50, 11, 90, 19, 0.95);  // line 1, right word
  fill(12, 35, 60, 45, 0.8);   // line 2
  fill(70, 35, 90, 45, 0.45);  // above thresh .3 but box score < .6 -> dropped
  fill(5, 52, 7, 54, 0.99);    // 2x2 -> too small
  const bs = P.dbBoxes(prob, W, H);
  assert.equal(bs.length, 3, JSON.stringify(bs));
  const b0 = bs.find(b => b.x0 < 20 && b.y0 < 20);
  // unclip: d = w*h*1.5 / (2(w+h)) = 30*8*1.5 / 76 = 4.74
  assert.ok(Math.abs(b0.x0 - (10 - 4.737)) < 0.01 && Math.abs(b0.y1 - (18 + 4.737)) < 0.01, JSON.stringify(b0));
  assert.equal(b0.score, 0.9);
  const lines = P.sortLines(bs.slice().reverse());
  assert.equal(lines.length, 2);
  assert.ok(lines[0][0].x0 < lines[0][1].x0, "left to right");
  assert.ok(lines[1][0].y0 > lines[0][0].y0, "top to bottom");
  const sc = P.scaleBoxes(bs, 4, 4, 400, 240);
  assert.ok(sc.every(b => b.x1 <= 400 && b.y1 <= 240 && Number.isInteger(b.x0)));
  const crop = P.cropFromBoxes([{ x0: 100, y0: 50, x1: 200, y1: 80 }, { x0: 120, y0: 100, x1: 300, y1: 130 }], 400, 300);
  assert.deepEqual(crop, { x: 88, y: 38, w: 224, h: 104 });
  assert.deepEqual(P.cropFromBoxes([{ x0: 0, y0: 0, x1: 50, y1: 20 }], 60, 30), { x: 0, y: 0, w: 58, h: 28 }, "clamped at 0 (margin 8 px)");
  assert.deepEqual(P.cropFromBoxes([{ x0: 10, y0: 5, x1: 55, y1: 25 }], 60, 30), { x: 2, y: 0, w: 58, h: 30 }, "clamped at the far edges");
  assert.equal(P.cropFromBoxes([], 10, 10), null);
});

test("DB post-processing: a tilted text line gets a rotated rectangle (angle, length, height); level lines stay axis-aligned", () => {
  const W = 200, H = 100, prob = new Float32Array(W * H), a = (10 * Math.PI) / 180;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5 - 100) * Math.cos(a) + (y + 0.5 - 50) * Math.sin(a), v = -(x + 0.5 - 100) * Math.sin(a) + (y + 0.5 - 50) * Math.cos(a);
    if (Math.abs(u) <= 60 && Math.abs(v) <= 5) prob[y * W + x] = 0.9;
  }
  const [b] = P.dbBoxes(prob, W, H);
  assert.ok(b && b.angle != null, JSON.stringify(b));
  assert.ok(Math.abs((b.angle * 180) / Math.PI - 10) < 1.5, "angle " + (b.angle * 180) / Math.PI);
  const d = (120 * 10 * 1.5) / (2 * 130); // unclip of a 120 x 10 line
  assert.ok(Math.abs(b.rw - (120 + 2 * d)) < 4 && Math.abs(b.rh - (10 + 2 * d)) < 3, `rw ${b.rw} rh ${b.rh}`);
  assert.ok(Math.abs(b.cx - 100) < 1.5 && Math.abs(b.cy - 50) < 1.5, `centre ${b.cx},${b.cy}`);
  const s = P.scaleBoxes([b], 2, 2, 400, 200)[0];
  assert.ok(Math.abs(s.angle - b.angle) < 1e-9 && Math.abs(s.rw - 2 * b.rw) < 1e-6 && Math.abs(s.cx - 2 * b.cx) < 1e-6, "scaled with the photo");
  const flat = new Float32Array(W * H);
  for (let y = 45; y < 55; y++) for (let x = 40; x < 160; x++) flat[y * W + x] = 0.9;
  assert.equal(P.dbBoxes(flat, W, H)[0].angle, undefined, "level line: no rotated box");
});

test("CTC decode on synthetic logits and probabilities: blank 0, repeats collapse, space is the last class", () => {
  assert.deepEqual(P.parseDict("a\nb\n \nก\n"), ["a", "b", " ", "ก"]);
  const dict = ["a", "b", "c"], C = 5; // blank, a, b, c, space
  const seq = [1, 1, 0, 1, 2, 4, 3, 3];
  const logits = new Float32Array(seq.length * C).fill(-5);
  seq.forEach((c, t) => { logits[t * C + c] = 5; });
  const r = P.ctcDecode(logits, seq.length, C, dict);
  assert.equal(r.text, "aab c");
  assert.ok(r.conf > 0.99 && r.conf <= 1);
  assert.equal(r.chars.length, 5);
  const probs = new Float32Array(seq.length * C);
  seq.forEach((c, t) => { for (let k = 0; k < C; k++) probs[t * C + k] = k === c ? 0.6 : 0.1; });
  const q = P.ctcDecode(probs, seq.length, C, dict);
  assert.equal(q.text, "aab c"); assert.equal(q.conf, 0.6);
  assert.equal(P.ctcDecode(new Float32Array(3 * C), 3, C, dict).text, "", "all blank");
});

test("face gate fails closed: model missing / not run / error / any face >= 0.3 blocks; allowed only after both scopes ran clean", () => {
  assert.deepEqual(P.faceGate(null), { allow: false, reason: "model-missing", maxScore: 0 });
  assert.equal(P.faceGate({ loaded: false, runs: [{ scope: "frame", faces: [] }, { scope: "crop", faces: [] }] }).allow, false);
  assert.equal(P.faceGate({ loaded: true, error: "x", runs: [] }).reason, "error");
  assert.equal(P.faceGate({ loaded: true, runs: [] }).reason, "not-run");
  assert.equal(P.faceGate({ loaded: true, runs: [{ scope: "frame", faces: [] }] }).reason, "not-run", "the crop must be checked too");
  const ok = P.faceGate({ loaded: true, runs: [{ scope: "frame", faces: [] }, { scope: "crop", faces: [{ score: 0.29 }] }] });
  assert.deepEqual(ok, { allow: true, reason: "", maxScore: 0.29 });
  const face = P.faceGate({ loaded: true, runs: [{ scope: "frame", faces: [{ score: 0.31 }] }] });
  assert.equal(face.allow, false); assert.equal(face.reason, "face");
  assert.equal(P.faceGate({ loaded: true, runs: [{ scope: "frame", faces: [] }, { scope: "crop", faces: [{ score: 0.3 }] }] }).allow, false, ">= threshold blocks");
  assert.equal(P.faceGate({ loaded: true, runs: [{ scope: "frame", faces: [] }, { scope: "crop" }] }).reason, "not-run", "a run without a result list did not run");
});

test("measurement helpers: character accuracy, name tokens / token hit, Wilson interval", () => {
  assert.equal(P.levenshtein("kitten", "sitting"), 3);
  assert.ok(Math.abs(P.charAccuracy("abc", "abd") - 2 / 3) < 1e-12);
  assert.equal(P.charAccuracy("พารา เซตามอล", "พาราเซตามอล"), 1, "whitespace ignored");
  assert.equal(P.charAccuracy("ab", "xxxxxx"), 0, "floored at 0");
  assert.deepEqual(P.nameTokens("Oat milk & shea butter"), ["oat", "milk", "shea", "butter"]);
  assert.deepEqual(P.nameTokens("น้ำยาบ้วนปาก Colgate 3x"), ["น้ำยาบ้วนปาก", "colgate"]);
  assert.deepEqual(P.nameTokens("辛拉面 신라면"), ["辛拉面", "신라면"], "text order");
  const h = P.tokenHit("COLGATE\nMax Fresh", { brands: "Colgate", product_name: "Colgate Max Fresh Rainbow Diş Macunu" });
  assert.equal(h.hit, true); assert.ok(h.found.includes("colgate"));
  assert.equal(P.tokenHit("nothing here", { brands: "Shokubutsu", product_name: "Oat milk" }).hit, false);
  assert.equal(P.tokenHit("x", { brands: "", product_name: "" }).hit, null, "no tokens -> not scorable");
  const w = P.wilson(5, 10);
  assert.ok(Math.abs(w.lo - 0.2366) < 0.001 && Math.abs(w.hi - 0.7634) < 0.001, JSON.stringify(w));
  assert.deepEqual(P.wilson(0, 0), { p: 0, lo: 0, hi: 0 });
  assert.ok(P.wilson(0, 73).hi <= 0.05 + 1e-9, "0 / 73 -> upper bound <= 5 % (design §9.2)");
});

test("Product Check files: no dosing, no buy links, no verdict words, no image encoding / upload, no emotion inference, all text TH + EN + ZH", () => {
  const code = s => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  const files = ["lensiq-pc.js", "lensiq-pc-run.js", "lensiq-pc-ui.js"].map(f => code(readFileSync(join(ROOT, f), "utf8")));
  const html = readFileSync(join(ROOT, "medicine.html"), "utf8");
  const tab = /<section id="tab-pc"[\s\S]*?<\/section>/.exec(html);
  assert.ok(tab, "Product Check tab exists in medicine.html");
  const all = files.join("\n") + tab[0];
  assert.ok(!/mg\/kg|body ?weight|น้ำหนักตัว|dose calculator|calculateDose|doseFor|ขนาดยาที่ควร|รับประทานครั้งละ|take \d+ (tablet|capsule)/i.test(all), "no dosing words");
  assert.ok(!/(shopee|lazada|amazon|buy now|ซื้อเลย|สั่งซื้อ|affiliate|sponsor)/i.test(all), "no buy links");
  assert.ok(!/best for|ดีที่สุด|ยอดนิยม|recommended for you/i.test(all), "no ranking");
  assert.ok(!/ของแท้|ของปลอม|\bgenuine\b|\bcounterfeit\b|\bfake\b|真品|假货|正品/i.test(all), "never says genuine / fake");
  assert.ok(!/toDataURL|toBlob|FormData|readAsDataURL|fetch\([^)]*method:\s*"POST"/.test(files.join("\n")), "no image encoding / upload in P2");
  assert.ok(!/localStorage\.setItem\([^)]*(image|frame|photo|canvas)/i.test(files.join("\n")), "no images in storage");
  assert.ok(!/expression|emotion|faceapi|\blie\b|deception|truthful|age_gender/i.test(files.join("\n")), "no emotion / age / lie inference");
  assert.match(tab[0], /ไม่ใช่การยืนยันขั้นสุดท้าย/, "fixed bottom line (TH)");
  assert.match(tab[0], /tel:1669/); assert.match(tab[0], /tel:1367/);
  // every md.pc.* key used in the tab or the UI exists in English and Chinese
  const keys = new Set([...(tab[0] + files[2]).matchAll(/["'](md\.pc\.[\w.]+)["']/g)].map(m => m[1]));
  assert.ok(keys.size > 40, "keys " + keys.size);
  const en = readFileSync(join(ROOT, "i18n", "en-med.js"), "utf8"), zh = readFileSync(join(ROOT, "i18n", "zh-med.js"), "utf8");
  const missing = [...keys].filter(k => !en.includes(`"${k}"`) || !zh.includes(`"${k}"`));
  assert.deepEqual(missing, [], "EN / ZH strings for every md.pc key");
  const thaiIn = s => /[ก-๛]/.test(s);
  for (const [lang, src] of [["en", en], ["zh", zh]]) {
    for (const m of src.matchAll(/"(md\.pc\.[\w.]+)":\s*"((?:[^"\\]|\\.)*)"/g)) assert.ok(!thaiIn(m[2]) || /ฆท|ฆอ|อย\./.test(m[2]), `${lang} ${m[1]} has Thai text`);
  }
});

test("face gate: a detection without a finite score counts as a face (never as 0)", () => {
  const two = faces => ({ loaded: true, runs: [{ scope: "frame", faces }, { scope: "crop", faces: [] }] });
  for (const faces of [[{}], [{ score: NaN }], [{ score: null }], [{ score: "0.1" }], [{ score: Infinity }], [null]]) {
    const g = P.faceGate(two(faces));
    assert.equal(g.allow, false, JSON.stringify(faces));
    assert.equal(g.reason, "face");
    assert.equal(g.maxScore, 1);
  }
  assert.equal(P.faceGate(two([{ score: 0.1, box: { x: 1, y: 2, w: 3, h: 4 } }])).allow, true, "a box next to a finite low score is fine");
});

test("expiry vs the device's LOCAL date: past / today / future, and the 00:00-07:00 Thai-time edge", () => {
  assert.equal(P.expiryStatus("2026-11-08", "2026-11-09"), "past");
  assert.equal(P.expiryStatus("2026-11-09", "2026-11-09"), "today", "the expiry day itself is not 'past'");
  assert.equal(P.expiryStatus("2026-11-10", "2026-11-09"), "future");
  assert.equal(P.expiryStatus("", "2026-11-09"), "");
  assert.equal(P.expiryStatus("2026-11-09", "nonsense"), "");
  const tz = process.env.TZ;
  try {
    process.env.TZ = "Asia/Bangkok";
    // 03:00 on 10 Nov in Bangkok = 20:00 UTC on 9 Nov: UTC still says the 9th, the user's calendar says the 10th
    const early = new Date("2026-11-09T20:00:00Z");
    assert.equal(early.toISOString().slice(0, 10), "2026-11-09");
    assert.equal(P.localDate(early), "2026-11-10");
    assert.equal(P.expiryStatus("2026-11-09", P.localDate(early)), "past", "expired yesterday (local) although UTC is still on that day");
    assert.equal(P.expiryStatus("2026-11-10", P.localDate(early)), "today");
    assert.equal(P.localDate(new Date("2026-11-09T16:59:59Z")), "2026-11-09", "23:59:59 Bangkok");
    assert.equal(P.localDate(new Date("2026-11-09T17:00:00Z")), "2026-11-10", "midnight Bangkok");
  } finally { if (tz === undefined) delete process.env.TZ; else process.env.TZ = tz; }
});
