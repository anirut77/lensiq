/* สแกนสินค้าด้วยกล้อง — จำสินค้าด้วยค่าลักษณะภาพ (MobileNet embedding) + KNN ที่สอนในเบราว์เซอร์
   สำหรับชำระเงินด้วยตนเอง นับสต็อก และรายงานขาย ประมวลผลในเครื่องทั้งหมด */

// ================= ส่วนคำนวณ (ไม่ใช้ DOM ทดสอบแยกได้ใน Node) =================
const BG = "__bg__";
const CFG = {
  K: 5,              // จำนวนเพื่อนบ้านใกล้สุด
  MIN_SIM: 0.72,     // ความคล้ายต่ำสุด (cosine) ต่ำกว่านี้ = ไม่รู้จัก
  MIN_SIM_BY: { mnv2: 0.7, basic: 0.85 }, // ค่าเริ่มต้นแยกตามตัวสกัดภาพ (แบบพื้นฐานค่าความคล้ายสูงกว่าโดยธรรมชาติ)
  MIN_CONF: 0.6,     // สัดส่วนโหวตต่ำสุดที่ยอมรับ (3 ใน 5)
  STABLE_MS: 600,    // ต้องเห็นสินค้าเดิมต่อเนื่องนานเท่านี้จึงเพิ่ม
  MIN_FRAMES: 3,     // และอย่างน้อยกี่เฟรม
  CLEAR_MS: 400,     // เห็นพื้นหลังต่อเนื่องเท่านี้ = นำสินค้าออกแล้ว
  UNKNOWN_CLEAR_MS: 900, // ถ้าเป็นภาพที่ไม่รู้จัก ต้องนานกว่านี้จึงถือว่านำออก
  CAPTURE_MS: 200,   // เก็บตัวอย่าง ~5 ภาพ/วินาที
  INFER_MS: 90,      // รอบประมวลผลขั้นต่ำ
  RECOMMENDED: 20,   // จำนวนตัวอย่างแนะนำต่อสินค้า
  VAT: 7
};

const DEFAULT_PRODUCTS = [
  { id: "d-cola", name: "โคล่า กระป๋อง 325 มล.", sku: "BEV-COLA-325", price: 17, barcode: "" },
  { id: "d-tea", name: "ชาเขียวพร้อมดื่ม 420 มล.", sku: "BEV-TEA-420", price: 25, barcode: "" },
  { id: "d-chips", name: "มันฝรั่งทอดกรอบ 50 ก.", sku: "SNK-CHIP-50", price: 30, barcode: "" },
  { id: "d-choc", name: "ช็อกโกแลตบาร์ 40 ก.", sku: "SNK-CHOC-40", price: 35, barcode: "" },
  { id: "d-tumbler", name: "แก้วเก็บความเย็น LENSIQ", sku: "MRC-TMB-01", price: 290, barcode: "" },
  { id: "d-tee", name: "เสื้อยืด LENSIQ", sku: "MRC-TEE-01", price: 350, barcode: "" }
];
/* สินค้าเริ่มต้นชุดเก่า (ก่อนเปลี่ยนแบรนด์) — ถ้ายังไม่ถูกแก้ไขและไม่มีตัวอย่างภาพ จะถูกแทนด้วยชุดใหม่ */
const LEGACY_DEFAULT_IDS = ["p-350", "p-600", "p-1500", "p-alk", "p-spk"];
function isUntouchedLegacy(p, sampleCount = 0) {
  return !!p && LEGACY_DEFAULT_IDS.includes(p.id) && /^AQUALINE /.test(p.name || "") && !p.thumb && !p.barcode && !sampleCount;
}

function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na && nb ? d / Math.sqrt(na * nb) : 0;
}

/* samples=[{label, emb}] คืน {label|null, guess, conf(สัดส่วนโหวต), sim(ความคล้ายสูงสุดของคลาสที่ชนะ), votes} */
function knnPredict(q, samples, opt = {}) {
  const k = opt.k ?? CFG.K, minSim = opt.minSim ?? CFG.MIN_SIM, skip = opt.skip ?? -1;
  const top = [];
  for (let i = 0; i < samples.length; i++) {
    if (i === skip) continue;
    const sim = cosine(q, samples[i].emb);
    if (top.length < k || sim > top[top.length - 1].sim) {
      let j = top.length; while (j > 0 && top[j - 1].sim < sim) j--;
      top.splice(j, 0, { sim, label: samples[i].label });
      if (top.length > k) top.pop();
    }
  }
  if (!top.length) return { label: null, guess: null, conf: 0, sim: 0, votes: {}, reason: "empty" };
  const votes = {}, simSum = {}, simMax = {};
  for (const t of top) {
    votes[t.label] = (votes[t.label] || 0) + 1;
    simSum[t.label] = (simSum[t.label] || 0) + t.sim;
    simMax[t.label] = Math.max(simMax[t.label] ?? -1, t.sim);
  }
  let best = null;
  for (const l in votes) if (best === null || votes[l] > votes[best] || (votes[l] === votes[best] && simSum[l] > simSum[best])) best = l;
  const conf = votes[best] / top.length, sim = simMax[best];
  if (sim < minSim) return { label: null, guess: best, conf, sim, votes, reason: "lowsim" };
  return { label: best, guess: best, conf, sim, votes };
}

/* แปลงผลทำนายเป็นป้ายสำหรับตัวกันนับซ้ำ: product id / BG / null(ไม่แน่ใจ) */
function decide(pred, minConf = CFG.MIN_CONF) {
  if (!pred || pred.label === null) return null;
  return pred.conf >= minConf ? pred.label : null;
}

/* ตัวกันนับซ้ำ: สินค้าต้องนิ่งต่อเนื่อง STABLE_MS แล้วจึงเพิ่ม จากนั้นต้องกลับเป็นพื้นหลัง (หรือเปลี่ยนเป็นสินค้าอื่น) ก่อนจะนับชิ้นเดิมได้อีก
   needClear=true: เริ่มแบบล็อก (ต้องเห็นพื้นหลังก่อน) ใช้ตอนเพิ่งเปิดหน้าจอ/สลับแท็บ */
function gateInit(needClear = false) {
  return { cand: null, since: 0, n: 0, locked: needClear ? "*" : null, clearSince: null, progress: 0 };
}
function gateStep(g, label, now, opt = {}) {
  const stableMs = opt.stableMs ?? CFG.STABLE_MS, minFrames = opt.minFrames ?? CFG.MIN_FRAMES;
  const clearMs = opt.clearMs ?? CFG.CLEAR_MS, unknownClearMs = opt.unknownClearMs ?? CFG.UNKNOWN_CLEAR_MS;
  if (label && label !== BG) {
    if (g.locked === label || g.locked === "*") { g.clearSince = null; g.cand = null; g.n = 0; g.progress = 0; return null; }
    if (g.cand === label) g.n++; else { g.cand = label; g.since = now; g.n = 1; }
    g.progress = stableMs ? Math.min(1, (now - g.since) / stableMs) : 1;
    if (g.n >= minFrames && now - g.since >= stableMs) {
      g.locked = label; g.cand = null; g.n = 0; g.progress = 0; g.clearSince = null;
      return label;
    }
    return null;
  }
  g.cand = null; g.n = 0; g.progress = 0;
  if (g.locked) {
    if (g.clearSince === null) g.clearSince = now;
    if (now - g.clearSince >= (label === BG ? clearMs : unknownClearMs)) { g.locked = null; g.clearSince = null; }
  }
  return null;
}

/* ตัวกันนับซ้ำของบาร์โค้ด: หนึ่ง gate ต่อหนึ่งรหัส (Map) ใช้ได้หลายบาร์โค้ดพร้อมกันในเฟรมเดียว
   multi=false: เหมือนเดิมทุกประการ — gate เดียว ใช้รหัสแรกที่ pick(codes) เลือก (ค่าเริ่มต้น = รหัสแรก)
   step(codes, now, pick?) -> รหัสที่ควรเพิ่มในรอบนี้ (ตามลำดับที่เห็น) · gate ที่ไม่เห็นนาน clearMs ถูกลบทิ้ง */
function createCodeGates(cfg = {}) {
  const clearMs = cfg.clearMs ?? 1200, multi = cfg.multi !== false;
  const opt = { stableMs: cfg.stableMs ?? 0, minFrames: cfg.minFrames ?? 1, clearMs, unknownClearMs: clearMs };
  const gates = new Map(); // code -> { g, last }
  let single = gateInit(false);
  function prune(now) {
    for (const [code, e] of gates) if (now - e.last >= clearMs && !e.g.locked) gates.delete(code);
  }
  function step(codes, now, pick) {
    const list = (codes || []).map(c => (c && typeof c === "object" ? c.rawValue : c)).filter(v => v != null && v !== "").map(String);
    if (!multi) {
      const code = pick ? (pick(list) ?? list[0] ?? null) : (list[0] ?? null);
      const add = gateStep(single, code ? "bc:" + code : BG, now, opt);
      return add ? [add.slice(3)] : [];
    }
    const out = [], seen = new Set();
    for (const code of list) {
      if (seen.has(code)) continue;
      seen.add(code);
      let e = gates.get(code);
      if (!e) gates.set(code, e = { g: gateInit(false), last: now });
      e.last = now;
      if (gateStep(e.g, "bc:" + code, now, opt)) out.push(code);
    }
    for (const [code, e] of gates) if (!seen.has(code)) gateStep(e.g, BG, now, opt);
    prune(now);
    return out;
  }
  function reset() { gates.clear(); single = gateInit(false); }
  return { step, prune, reset, multi, get size() { return multi ? gates.size : (single.locked ? 1 : 0); }, has: code => gates.has(String(code)) };
}

/* ทดสอบแบบ leave-one-out: ทายทีละตัวอย่างโดยไม่ใช้ตัวมันเอง */
function looEval(samples, opt = {}) {
  const per = {}, conf = {};
  let correct = 0;
  for (let i = 0; i < samples.length; i++) {
    const actual = samples[i].label;
    const p = knnPredict(samples[i].emb, samples, { ...opt, skip: i });
    const got = p.label === null ? "?" : p.label;
    per[actual] = per[actual] || { n: 0, ok: 0 };
    per[actual].n++;
    if (got === actual) { correct++; per[actual].ok++; }
    else { const key = actual + "\u0000" + got; conf[key] = (conf[key] || 0) + 1; }
  }
  const confusions = Object.entries(conf).map(([k, count]) => { const [actual, pred] = k.split("\u0000"); return { actual, pred, count }; })
    .sort((a, b) => b.count - a.count);
  return { n: samples.length, correct, acc: samples.length ? correct / samples.length : 0, perClass: per, confusions };
}

// ---- ตะกร้าและยอดเงิน (คิดเป็นสตางค์เพื่อเลี่ยงทศนิยมคลาดเคลื่อน) ----
function cartAdd(cart, p, qty = 1) {
  const line = cart.find(l => l.id === p.id);
  if (line) line.qty += qty;
  else cart.push({ id: p.id, name: p.name, sku: p.sku || "", price: +p.price || 0, qty });
  return cartSetQty(cart, p.id, (line || cart[cart.length - 1]).qty);
}
function cartSetQty(cart, id, qty) {
  const i = cart.findIndex(l => l.id === id);
  if (i < 0) return cart;
  qty = Math.floor(+qty || 0);
  if (qty <= 0) cart.splice(i, 1); else cart[i].qty = Math.min(qty, 9999);
  return cart;
}
function cartTotals(cart, vatRate = CFG.VAT) {
  let satang = 0, qty = 0;
  for (const l of cart) { satang += Math.round(l.price * 100) * l.qty; qty += l.qty; }
  const vat = Math.round(satang * vatRate / (100 + vatRate));
  return { qty, lines: cart.length, total: satang / 100, vat: vat / 100, net: (satang - vat) / 100 };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");
const dayKey = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`; };
function orderNo(ts, seq) { return `CO-${dayKey(ts)}-${pad(seq, 4)}`; }
/* ลำดับใบเสร็จเริ่มใหม่ทุกวัน */
function nextSeq(state, ts = Date.now()) {
  const day = dayKey(ts);
  if (!state || state.day !== day) return { day, n: 1 };
  return { day, n: state.n + 1 };
}

function salesByProduct(orders) {
  const m = {};
  for (const o of orders) for (const l of o.items) {
    const r = m[l.id] || (m[l.id] = { id: l.id, name: l.name, sku: l.sku || "", qty: 0, revenue: 0 });
    r.qty += l.qty; r.revenue += Math.round(l.price * 100) * l.qty; r.name = l.name;
  }
  return Object.values(m).map(r => ({ ...r, revenue: r.revenue / 100 })).sort((a, b) => b.revenue - a.revenue || b.qty - a.qty);
}

function normBarcode(s) { return String(s || "").replace(/\s+/g, "").trim(); }
function findByBarcode(products, code) {
  const c = normBarcode(code);
  if (!c) return null;
  return products.find(p => {
    const b = normBarcode(p.barcode);
    if (!b) return false;
    if (b === c) return true;
    // UPC-A (12 หลัก) กับ EAN-13 ที่ขึ้นต้นด้วย 0 เป็นรหัสเดียวกัน
    return (b.length === 12 && c === "0" + b) || (c.length === 12 && b === "0" + c);
  }) || null;
}

function stockRows(products, stock) {
  return products.map(p => {
    const expected = stock.expected?.[p.id], counted = stock.counts?.[p.id] || 0;
    const has = expected !== undefined && expected !== null && expected !== "";
    return { id: p.id, name: p.name, sku: p.sku || "", expected: has ? +expected : null, counted, diff: has ? counted - expected : null };
  });
}

function csvCell(v) {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
function toCSV(rows) { return "﻿" + rows.map(r => r.map(csvCell).join(",")).join("\r\n"); }

// ---- ส่งออก/นำเข้าโมเดล ----
const MODEL_FORMAT = "lensiq-checkout-model";
const MODEL_FORMATS_OK = [MODEL_FORMAT, "aqualine-checkout-model"]; // รับไฟล์ที่ส่งออกก่อนเปลี่ยนแบรนด์ด้วย
function serializeModel(products, samples, embedder = "mnv2") {
  const classes = {};
  for (const s of samples) (classes[s.label] = classes[s.label] || []).push(Array.from(s.emb, x => Math.round(x * 1e6) / 1e6));
  return {
    format: MODEL_FORMAT, version: 1, created: new Date().toISOString(),
    embedder, dim: samples[0]?.emb.length || 0,
    products: products.map(({ id, name, sku, price, barcode }) => ({ id, name, sku, price, barcode })),
    classes
  };
}
function parseModel(obj) {
  if (typeof obj === "string") obj = JSON.parse(obj);
  if (!obj || !MODEL_FORMATS_OK.includes(obj.format)) throw new Error("ไฟล์ไม่ใช่โมเดลสแกนสินค้า");
  if (!Array.isArray(obj.products)) throw new Error("ไม่พบรายการสินค้าในไฟล์");
  const products = obj.products.filter(p => p && p.id && p.id !== BG && p.name).map(p => ({
    id: String(p.id), name: String(p.name).slice(0, 80), sku: String(p.sku || "").slice(0, 40),
    price: Math.max(0, +p.price || 0), barcode: normBarcode(p.barcode).slice(0, 40)
  }));
  const ids = new Set(products.map(p => p.id));
  const samples = [];
  let dim = 0;
  for (const [label, list] of Object.entries(obj.classes || {})) {
    if (label !== BG && !ids.has(label)) continue;
    if (!Array.isArray(list)) continue;
    for (const v of list) {
      if (!Array.isArray(v) || !v.length || v.some(x => typeof x !== "number" || !isFinite(x))) throw new Error("ข้อมูลตัวอย่างเสียหาย");
      if (!dim) dim = v.length;
      if (v.length !== dim) throw new Error("ขนาดข้อมูลตัวอย่างไม่ตรงกัน");
      samples.push({ label, emb: Float32Array.from(v) });
    }
  }
  const embedder = obj.embedder === "basic" ? "basic" : "mnv2";
  return { products, samples, dim, embedder };
}

/* ตัวสกัดลักษณะภาพแบบพื้นฐาน (ไม่ต้องใช้ WebGL) ใช้สำรองเมื่อโหลดโมเดล MobileNetV2 ไม่สำเร็จ
   รับ RGBA ของภาพในกรอบ คืนเวกเตอร์ที่ L2-normalize แล้ว:
   ฮิสโทแกรมสี HSV (108) + สีแยก 4 ส่วนภาพ (96) + ทิศทางขอบ HOG 4x4x8 (128) + ภาพย่อขาวดำ 8x8 (64) = 396 มิติ */
const BASIC_DIM = 396;
function basicFeatures(px, w, h) {
  const n = w * h, gray = new Float32Array(n);
  const col = new Float32Array(108), sp = new Float32Array(96), hog = new Float32Array(128), th = new Float32Array(64);
  for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
    const r = px[i * 4] / 255, g = px[i * 4 + 1] / 255, b = px[i * 4 + 2] / 255;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    let hue = 0;
    if (d > 1e-6) hue = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    const s = mx ? d / mx : 0;
    const hb = Math.min(11, Math.floor(hue * 2)), sb = Math.min(2, Math.floor(s * 3)), vb = Math.min(2, Math.floor(mx * 3));
    col[(hb * 3 + sb) * 3 + vb]++;
    const q = (y >= h / 2 ? 2 : 0) + (x >= w / 2 ? 1 : 0);
    sp[q * 24 + hb * 2 + (s > 0.3 ? 1 : 0)]++;
    gray[i] = 0.299 * r + 0.587 * g + 0.114 * b;
    th[Math.min(7, Math.floor(y * 8 / h)) * 8 + Math.min(7, Math.floor(x * 8 / w))] += gray[i];
  }
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x, gx = gray[i + 1] - gray[i - 1], gy = gray[i + w] - gray[i - w];
    const mag = Math.sqrt(gx * gx + gy * gy);
    if (mag < 1e-4) continue;
    let a = Math.atan2(gy, gx); if (a < 0) a += Math.PI;
    const bin = Math.min(7, Math.floor(a / Math.PI * 8));
    const cell = Math.min(3, Math.floor(y * 4 / h)) * 4 + Math.min(3, Math.floor(x * 4 / w));
    hog[cell * 8 + bin] += mag;
  }
  const l2 = v => { let s = 0; for (const x of v) s += x * x; s = Math.sqrt(s) || 1; for (let i = 0; i < v.length; i++) v[i] /= s; return v; };
  const sqrtL2 = v => { for (let i = 0; i < v.length; i++) v[i] = Math.sqrt(v[i]); return l2(v); }; // Hellinger
  let m = 0; for (const x of th) m += x; m /= th.length;
  for (let i = 0; i < th.length; i++) th[i] -= m;
  const parts = [[sqrtL2(col), 1], [sqrtL2(sp), 0.8], [sqrtL2(hog), 1], [l2(th), 0.6]];
  const out = new Float32Array(BASIC_DIM);
  let o = 0;
  for (const [v, wt] of parts) for (const x of v) out[o++] = x * wt;
  return l2(out);
}

// ================= ส่วนหน้าจอ =================
if (typeof document !== "undefined") (() => {
  const $ = s => document.querySelector(s);
  const $$ = s => [...document.querySelectorAll(s)];
  const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const baht = n => "฿" + (+n).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtTime = ts => new Date(ts).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" });
  const LS = {
    get(k, d) { try { const v = JSON.parse(localStorage.getItem("co-" + k)); return v ?? d; } catch { return d; } },
    set(k, v) { try { localStorage.setItem("co-" + k, JSON.stringify(v)); return true; } catch { engine("พื้นที่จัดเก็บในเบราว์เซอร์เต็ม กรุณาส่งออกข้อมูลแล้วล้างรายงานขาย", "err"); return false; } }
  };

  const video = $("#video"), overlay = $("#overlay"), crop = document.createElement("canvas");
  crop.width = crop.height = 224;
  const cropCtx = crop.getContext("2d", { willReadFrequently: false });

  let products = [], samples = [], allSamples = [], fx = null, stream = null, camOn = false;
  // fx = ตัวสกัดลักษณะภาพที่ใช้อยู่ {id:"mnv2"|"basic", label, embed(now)} — samples คือเฉพาะตัวอย่างของ fx นี้
  let tab = "pay", lastInfer = 0, lastPred = null, fps = [];
  let capture = null; // {label, last}
  let cart = LS.get("cart", []);
  let stock = LS.get("stock", { expected: {}, counts: {}, started: Date.now() });
  const settings = Object.assign({ minSim: CFG.MIN_SIM, minSimBy: {}, minConf: CFG.MIN_CONF, stableMs: CFG.STABLE_MS, auto: true, beep: true, mirror: false, stockAuto: true, multiCodePay: false, multiCodeStock: true }, LS.get("settings", {}));
  let payGate = gateInit(true), stockGate = gateInit(true), flash = null;
  // บาร์โค้ด: gate แยกตามแท็บ (ชำระเงิน/นับสต็อก) ตามการตั้งค่า "สแกนหลายบาร์โค้ดพร้อมกัน"
  // minFrames 2: a code must be read the same in 2 barcode ticks (~250 ms apart) before it counts — on the synthetic
  // benchmark (tests/bench/checkout.bench.mjs) this cut wrong codes from 1.7% to 0.06% of scans for ~2 points of reads
  const mkCodeGates = t => createCodeGates({ clearMs: 1200, minFrames: 2, multi: t === "stock" ? settings.multiCodeStock : settings.multiCodePay });
  const codeGates = { pay: mkCodeGates("pay"), stock: mkCodeGates("stock") };

  // ---------- สถานะระบบ ----------
  let modelMsg = { text: "กำลังโหลดโมเดลจำสินค้า...", cls: "" }, camMsg = null;
  function engine(text, cls = "", retry) {
    const e = $("#engine");
    e.textContent = text; e.className = "engine " + cls;
    if (retry) {
      const b = document.createElement("button");
      b.type = "button"; b.className = "btn ghost retry"; b.textContent = "ลองใหม่"; b.onclick = retry;
      e.append(b);
    }
  }
  function showStatus() {
    if (camMsg && camMsg.cls === "err") {
      engine(camMsg.text, "err", () => startCam());
      if (!window.isSecureContext) { const a = document.createElement("a"); a.href = "cameras.html"; a.className = "btn ghost retry"; a.textContent = "วิธีเปิดผ่าน https"; $("#engine").append(a); }
      return;
    }
    if (modelMsg.cls === "err") return engine(modelMsg.text, "err", loadModel);
    const parts = [modelMsg.text];
    if (camMsg) parts.push(camMsg.text);
    const cls = modelMsg.cls === "ok" && camOn ? "ok" : (modelMsg.cls === "warn" || camMsg?.cls === "warn" ? "warn" : "");
    engine(parts.join(" · "), cls);
  }

  // ---------- IndexedDB ----------
  let db = null;
  function openDB() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error("no indexedDB"));
      const r = indexedDB.open("co-checkout", 1);
      r.onupgradeneeded = () => {
        const d = r.result;
        d.createObjectStore("products", { keyPath: "id" });
        d.createObjectStore("samples", { keyPath: "key", autoIncrement: true }).createIndex("label", "label");
      };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  function tx(stores, mode, fn) {
    if (!db) return Promise.resolve(null);
    return new Promise((res, rej) => {
      const t = db.transaction(stores, mode); let out;
      Promise.resolve(fn(t)).then(v => { out = v; });
      t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error);
    });
  }
  const reqP = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
  const saveProduct = p => tx("products", "readwrite", t => { t.objectStore("products").put(p); }).catch(dbErr);
  async function addSampleDB(s) {
    if (!db) return;
    try { s.key = await tx("samples", "readwrite", t => reqP(t.objectStore("samples").add({ label: s.label, emb: s.emb, fx: s.fx, t: Date.now() }))); } catch (e) { dbErr(e); }
  }
  function deleteSamplesDB(label) {
    return tx("samples", "readwrite", t => {
      const st = t.objectStore("samples"), cur = st.index("label").openKeyCursor(IDBKeyRange.only(label));
      cur.onsuccess = () => { const c = cur.result; if (c) { st.delete(c.primaryKey); c.continue(); } };
    }).catch(dbErr);
  }
  function dbErr(e) { console.error(e); engine("บันทึกข้อมูลลงเครื่องไม่สำเร็จ (" + (e?.name || "IndexedDB") + ") — ข้อมูลอาจหายเมื่อปิดหน้า กรุณาส่งออกโมเดลเก็บไว้", "warn"); }

  async function loadData() {
    try {
      db = await openDB();
      const [ps, ss] = await Promise.all([
        tx("products", "readonly", t => reqP(t.objectStore("products").getAll())),
        tx("samples", "readonly", t => reqP(t.objectStore("samples").getAll()))
      ]);
      products = ps || [];
      allSamples = (ss || []).map(s => ({ key: s.key, label: s.label, fx: s.fx || "mnv2", emb: s.emb instanceof Float32Array ? s.emb : Float32Array.from(s.emb) }));
      // ย้ายข้อมูล: ถ้ามีแต่สินค้าตัวอย่างชุดเก่าที่ยังไม่ถูกแก้ไข/สอน แทนด้วยชุดใหม่ (ถ้าผู้ใช้ปรับแต่งแล้วจะไม่แตะต้อง)
      if (products.length && products.every(p => isUntouchedLegacy(p, allSamples.filter(s => s.label === p.id).length))) {
        const old = products;
        products = DEFAULT_PRODUCTS.map((p, i) => ({ ...p, created: Date.now() + i }));
        await tx("products", "readwrite", t => { old.forEach(p => t.objectStore("products").delete(p.id)); products.forEach(p => t.objectStore("products").put(p)); });
      }
      if (!products.length && !LS.get("seeded", false)) {
        products = DEFAULT_PRODUCTS.map((p, i) => ({ ...p, created: Date.now() + i }));
        await tx("products", "readwrite", t => { products.forEach(p => t.objectStore("products").put(p)); });
        LS.set("seeded", true);
      }
      products.sort((a, b) => (a.created || 0) - (b.created || 0));
    } catch (e) {
      console.error(e); db = null;
      products = DEFAULT_PRODUCTS.map(p => ({ ...p }));
      modelMsg = { text: "เบราว์เซอร์นี้บันทึกข้อมูลถาวรไม่ได้ (IndexedDB) — ข้อมูลการสอนจะหายเมื่อปิดหน้า", cls: "warn" };
    }
  }
  const pById = id => products.find(p => p.id === id);
  const countOf = label => samples.reduce((n, s) => n + (s.label === label), 0);
  const nameOf = id => id === BG ? "พื้นหลัง / ไม่มีสินค้า" : id === "?" ? "ไม่รู้จัก" : (pById(id)?.name || id);

  // ---------- โมเดล ----------
  // TensorFlow.js (รวมอยู่ใน vendor/face-api.js) — ทำงานได้แม้ไม่มี WebGL โดยใช้ WASM
  const EMB_NODE = "module_apply_default/MobilenetV2/Logits/AvgPool";
  async function initBackend(tf) {
    tf.setWasmPaths("vendor/");
    for (const name of ["webgl", "wasm", "cpu"]) {
      try { if (await tf.setBackend(name)) { await tf.ready(); return name; } } catch (e) { console.warn(name, e); }
    }
    throw new Error("no backend");
  }
  function mnv2Embed(tf, model, src) {
    const out = tf.tidy(() => {
      const x = tf.browser.fromPixels(src).toFloat().div(255).expandDims(0);
      const f = model.execute({ images: x }, EMB_NODE).reshape([-1]);
      return f.div(f.norm().add(1e-8)); // L2-normalize
    });
    const v = out.dataSync(); out.dispose();
    return Float32Array.from(v);
  }
  let embMs = 0;
  async function loadModel() {
    modelMsg = { text: "กำลังโหลดโมเดลจำสินค้า (MobileNetV2 ~14 MB)...", cls: "" }; showStatus();
    try {
      if (typeof faceapi === "undefined" || !faceapi.tf?.loadGraphModel) throw new Error("ไม่พบ TensorFlow.js");
      const tf = faceapi.tf, backend = await initBackend(tf);
      const model = await tf.loadGraphModel(new URL("vendor/models/mobilenet/model.json", location.href).href);
      const warm = document.createElement("canvas"); warm.width = warm.height = 224;
      const t0 = performance.now();
      const v = mnv2Embed(tf, model, warm);
      if (v.length !== 1280 || !v.every(Number.isFinite)) throw new Error("ผลลัพธ์โมเดลไม่ถูกต้อง");
      console.info("checkout: backend", backend, "warm-up ms", Math.round(performance.now() - t0), "tensors", tf.memory().numTensors);
      fx = {
        id: "mnv2", label: "MobileNetV2", backend,
        embed() {
          const r = roi();
          cropCtx.drawImage(video, r.x, r.y, r.s, r.s, 0, 0, 224, 224);
          const t = performance.now(), e = mnv2Embed(tf, model, crop);
          embMs = embMs ? embMs * 0.9 + (performance.now() - t) * 0.1 : performance.now() - t;
          return e;
        },
        tensors: () => tf.memory().numTensors
      };
      modelMsg = { text: `โมเดลจำสินค้า MobileNetV2 พร้อม (ตัวประมวลผล: ${backend.toUpperCase()}${backend === "webgl" ? "" : " — ไม่มี WebGL ใช้ CPU แทน อาจช้ากว่าปกติ"})`, cls: "ok" };
    } catch (e) {
      console.warn("โหลด MobileNetV2 ไม่สำเร็จ เปลี่ยนเป็นตัวสกัดภาพพื้นฐาน", e);
      const small = document.createElement("canvas"); small.width = small.height = 64;
      const sctx = small.getContext("2d", { willReadFrequently: true });
      fx = {
        id: "basic", label: "พื้นฐาน",
        embed() {
          const r = roi();
          cropCtx.drawImage(video, r.x, r.y, r.s, r.s, 0, 0, 224, 224); // ใช้ทำรูปย่อสินค้า
          const t = performance.now(); sctx.drawImage(crop, 0, 0, 64, 64);
          const v = basicFeatures(sctx.getImageData(0, 0, 64, 64).data, 64, 64);
          embMs = performance.now() - t;
          return v;
        }
      };
      modelMsg = { text: `โหลดโมเดล MobileNetV2 ไม่สำเร็จ (${e?.message || e}) — ใช้โหมดสำรอง (จำจากสี ลวดลาย และรูปทรง) แม่นยำน้อยกว่า ควรสอนพื้นหลังและเก็บภาพหลายมุม`, cls: "warn" };
    }
    samples = allSamples.filter(s => s.fx === fx.id);
    settings.minSim = settings.minSimBy[fx.id] ?? CFG.MIN_SIM_BY[fx.id];
    syncSliders();
    renderAll();
    if (!location.hash && !samples.length) setTab("train");
    showStatus();
  }

  // ---------- กล้อง ----------
  const camSel = $("#camSel");
  async function listCams() {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    try {
      const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === "videoinput");
      const cur = stream?.getVideoTracks()[0]?.getSettings().deviceId || LS.get("cam", "");
      camSel.innerHTML = cams.length
        ? cams.map((d, i) => `<option value="${esc(d.deviceId)}">${esc(d.label || "กล้อง " + (i + 1))}</option>`).join("")
        : `<option value="">ไม่พบกล้อง</option>`;
      if (cams.some(d => d.deviceId === cur)) camSel.value = cur;
    } catch (e) { console.warn(e); }
  }
  let facing = "environment"; // กล้องหลังเป็นค่าเริ่มต้น (มือถือ/แท็บเล็ตส่องสินค้า)
  let resumeCam = false;
  function stopCam() {
    stream?.getTracks().forEach(t => t.stop()); stream = null; camOn = false;
    video.srcObject = null; $("#camBtn").textContent = "เปิดกล้อง";
  }
  function fitOverlay() {
    if (!video.videoWidth) return;
    if (overlay.width !== video.videoWidth || overlay.height !== video.videoHeight) { overlay.width = video.videoWidth; overlay.height = video.videoHeight; }
    $("#cam").style.aspectRatio = `${video.videoWidth} / ${video.videoHeight}`;
  }
  video.addEventListener("resize", fitOverlay); // มือถือหมุนจอ -> ขนาดภาพจากกล้องสลับแนว
  /* useDevice=false: ไม่ใช้กล้องที่เลือกไว้ ใช้ facingMode แทน (ปุ่มสลับกล้องหน้า/หลัง) */
  async function startCam(useDevice = true) {
    stopCam();
    camMsg = { text: "กำลังเปิดกล้อง...", cls: "" }; showStatus();
    try {
      if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
      const id = useDevice ? (camSel.value || LS.get("cam", "")) : "";
      const base = { width: { ideal: 1280 }, height: { ideal: 720 } };
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: id ? { ...base, deviceId: { exact: id } } : { ...base, facingMode: { ideal: facing } } });
      } catch (e) {
        if (!id || !["OverconstrainedError", "NotFoundError"].includes(e.name)) throw e;
        stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { ...base, facingMode: { ideal: facing } } }); // กล้องที่เลือกไว้หายไป ใช้กล้องเริ่มต้น
      }
      video.srcObject = stream;
      await video.play();
      if (!video.videoWidth) await new Promise(r => video.addEventListener("loadedmetadata", r, { once: true }));
      fitOverlay();
      const track = stream.getVideoTracks()[0], ts = track.getSettings();
      LS.set("cam", ts.deviceId || "");
      if (ts.facingMode) facing = ts.facingMode === "user" ? "user" : "environment";
      // กลับด้านภาพเฉพาะกล้องหน้า (กล้องที่ไม่บอกทิศ เช่น เว็บแคม USB ใช้ค่าที่ผู้ใช้ตั้งไว้)
      if (ts.facingMode) { mirror.checked = ts.facingMode === "user"; applyMirror(); }
      track.addEventListener("ended", () => { if (document.hidden) return; stopCam(); camMsg = { text: "กล้องถูกถอดหรือหยุดทำงาน", cls: "err" }; showStatus(); });
      camOn = true; $("#camBtn").textContent = "ปิดกล้อง";
      camMsg = { text: `กล้อง: ${track.label || "พร้อม"} (${video.videoWidth}×${video.videoHeight})`, cls: "ok" };
      payGate = gateInit(true); stockGate = gateInit(true);
      await listCams();
    } catch (e) {
      console.error(e); stopCam();
      const m = {
        Insecure: "บนมือถือต้องเปิดผ่าน https:// — ดูวิธีในหน้า ระบบทั้งหมด",
        NotAllowedError: "ไม่ได้รับอนุญาตให้ใช้กล้อง — กดไอคอนกล้องที่แถบที่อยู่แล้วเลือก \"อนุญาต\"",
        NotFoundError: "ไม่พบกล้อง — ตรวจสอบการเสียบสาย USB ของกล้อง",
        NotReadableError: "กล้องถูกโปรแกรมอื่นใช้อยู่ (เช่น Zoom, FaceTime) — ปิดโปรแกรมนั้นก่อน",
        OverconstrainedError: "กล้องที่เลือกไม่รองรับความละเอียดที่ขอ",
        AbortError: "การเปิดกล้องถูกยกเลิก"
      }[e.name];
      camMsg = { text: `เปิดกล้องไม่ได้: ${m || "เกิดข้อผิดพลาด"} (${e.name})`, cls: "err" };
    }
    showStatus();
  }
  $("#camBtn").onclick = () => camOn ? (stopCam(), resumeCam = false, camMsg = { text: "ปิดกล้องแล้ว", cls: "" }, showStatus()) : startCam();
  $("#flipCam").onclick = () => { facing = facing === "user" ? "environment" : "user"; LS.set("cam", ""); startCam(false); };
  camSel.onchange = () => { LS.set("cam", camSel.value); startCam(); };
  navigator.mediaDevices?.addEventListener?.("devicechange", listCams);
  // ปิดกล้องเมื่อสลับแอป/ล็อกจอ แล้วเปิดใหม่เมื่อกลับมา (ประหยัดแบตและคืนกล้องให้แอปอื่น)
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (camOn) { resumeCam = true; stopCam(); } }
    else if (resumeCam) { resumeCam = false; startCam(); }
  });
  const mirror = $("#mirror");
  mirror.checked = settings.mirror;
  function applyMirror() { $("#cam").classList.toggle("mirror", mirror.checked); }
  mirror.onchange = () => { settings.mirror = mirror.checked; saveSettings(); applyMirror(); };
  applyMirror();

  // ---------- เสียง ----------
  let audio = null;
  function beep(freq = 1046, dur = 0.12) {
    if (!settings.beep) return;
    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      if (audio.state === "suspended") audio.resume();
      const o = audio.createOscillator(), g = audio.createGain(), t = audio.currentTime;
      o.type = "sine"; o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.25, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g).connect(audio.destination); o.start(t); o.stop(t + dur + 0.02);
    } catch (e) { console.warn(e); }
  }
  document.addEventListener("pointerdown", () => { if (settings.beep && !audio) try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }, { once: true });

  // ---------- ลูปประมวลผล ----------
  function roi() {
    const vw = video.videoWidth, vh = video.videoHeight, side = Math.round(Math.min(vw, vh) * 0.62);
    return { x: Math.round((vw - side) / 2), y: Math.round((vh - side) / 2), s: side };
  }
  function loop() {
    requestAnimationFrame(loop);
    const now = performance.now();
    if (!camOn || !fx || tab === "report" || video.readyState < 2 || now - lastInfer < CFG.INFER_MS) return;
    lastInfer = now;
    let emb;
    try { emb = fx.embed(now); } catch (e) { console.error(e); return; }
    if (!emb) return;
    fps.push(now); while (fps.length && now - fps[0] > 1000) fps.shift();
    $("#fps").textContent = `${fps.length} รอบ/วิ · ${Math.round(embMs)} มิลลิวินาที/ภาพ`;

    if (capture && now - capture.last >= CFG.CAPTURE_MS) { capture.last = now; addSample(capture.label, emb); }

    lastPred = samples.length ? knnPredict(emb, samples, { minSim: settings.minSim }) : null;
    const label = decide(lastPred, settings.minConf);
    const gopt = { stableMs: settings.stableMs };
    let gate = null;
    if (tab === "pay" && settings.auto) {
      gate = payGate;
      const add = gateStep(payGate, label, now, gopt);
      if (add) { const p = pById(add); if (p) { addToCart(p, "กล้อง"); } }
    } else if (tab === "stock" && settings.stockAuto) {
      gate = stockGate;
      const add = gateStep(stockGate, label, now, gopt);
      if (add) { const p = pById(add); if (p) countStock(p.id, 1, true); }
    }
    renderPred(lastPred, label, gate);
    drawOverlay(lastPred, label, gate, now);
  }

  function renderPred(pred, label, gate) {
    const box = $("#pred");
    if (!samples.length) { box.innerHTML = `<b>ยังไม่ได้สอนสินค้า</b><span>ไปที่แท็บ "สอนสินค้า" แล้วเก็บตัวอย่างภาพ</span>`; return; }
    const name = label ? nameOf(label) : (pred?.reason === "lowsim" ? "ไม่รู้จักสินค้านี้" : "ไม่แน่ใจ");
    const conf = pred ? Math.round(pred.conf * 100) : 0, sim = pred ? pred.sim.toFixed(2) : "–";
    let st = "";
    if (gate) {
      if (gate.locked) st = gate.locked === "*" ? "นำสินค้าออกจากกรอบก่อนเริ่มสแกน" : "นับแล้ว — นำออกจากกรอบเพื่อสแกนชิ้นต่อไป";
      else if (gate.cand) st = "กำลังยืนยัน... ถือนิ่ง ๆ";
      else st = "พร้อมสแกน — วางสินค้าในกรอบ";
    }
    box.innerHTML = `<b class="${label && label !== BG ? "hit" : ""}">${esc(name)}</b>
      <span>มั่นใจ ${conf}% · ความคล้าย ${sim}${pred && !label && pred.guess ? ` · ใกล้เคียง: ${esc(nameOf(pred.guess))}` : ""}</span>
      <div class="bar"><i style="width:${gate?.cand ? Math.round(gate.progress * 100) : label && label !== BG ? conf : 0}%"></i></div>
      ${st ? `<span class="gate">${esc(st)}</span>` : ""}`;
  }

  function drawOverlay(pred, label, gate, now) {
    const ctx = overlay.getContext("2d"), W = overlay.width, H = overlay.height;
    ctx.clearRect(0, 0, W, H);
    if (!W) return;
    const r = roi(), lw = Math.max(3, W / 300);
    ctx.fillStyle = "rgba(11,42,60,.35)";
    ctx.fillRect(0, 0, W, r.y); ctx.fillRect(0, r.y + r.s, W, H - r.y - r.s);
    ctx.fillRect(0, r.y, r.x, r.s); ctx.fillRect(r.x + r.s, r.y, W - r.x - r.s, r.s);
    let color = "#ffffff";
    if (flash && now - flash.t < 500) color = "#2ecc71";
    else if (gate?.locked) color = "#c9a45c";
    else if (label && label !== BG) color = "#6cc4e3";
    ctx.lineWidth = lw; ctx.strokeStyle = color;
    ctx.setLineDash(label && label !== BG ? [] : [lw * 4, lw * 3]);
    ctx.strokeRect(r.x, r.y, r.s, r.s); ctx.setLineDash([]);
    if (gate?.cand && gate.progress > 0) {
      ctx.strokeStyle = "#2ecc71"; ctx.lineWidth = lw * 2;
      ctx.beginPath(); ctx.moveTo(r.x, r.y + r.s + lw * 2); ctx.lineTo(r.x + r.s * gate.progress, r.y + r.s + lw * 2); ctx.stroke();
    }
    if (flash && now - flash.t < 900) {
      const fs = Math.round(W / 26);
      ctx.font = `600 ${fs}px Prompt, sans-serif`; ctx.textAlign = "center";
      const txt = "+1 " + flash.name, tw = ctx.measureText(txt).width;
      ctx.fillStyle = "rgba(20,101,59,.9)";
      ctx.fillRect(W / 2 - tw / 2 - fs / 2, r.y - fs * 1.9, tw + fs, fs * 1.5);
      ctx.fillStyle = "#fff"; ctx.fillText(txt, W / 2, r.y - fs * 0.75);
    }
  }

  // ---------- บาร์โค้ด ----------
  let detector = null, bcBusy = false;
  async function initBarcode() {
    const note = $("#bcNote");
    if (!("BarcodeDetector" in window)) { note.textContent = "เบราว์เซอร์นี้ไม่รองรับการอ่านบาร์โค้ดจากกล้อง (BarcodeDetector) — ใช้เครื่องยิงบาร์โค้ด USB หรือพิมพ์รหัสในช่องด้านบนแทน"; note.className = "hint warn"; return; }
    try {
      const fmts = await BarcodeDetector.getSupportedFormats();
      if (!fmts.length) throw new Error("no formats");
      detector = new BarcodeDetector({ formats: fmts });
      note.textContent = "อ่านบาร์โค้ดจากกล้องได้ (" + fmts.slice(0, 6).join(", ") + (fmts.length > 6 ? " ..." : "") + ")";
      note.className = "hint ok";
    } catch (e) { note.textContent = "อุปกรณ์นี้อ่านบาร์โค้ดจากกล้องไม่ได้ — ใช้เครื่องยิงบาร์โค้ด USB หรือพิมพ์รหัสแทน"; note.className = "hint warn"; }
  }
  async function barcodeTick() {
    if (!detector || bcBusy || !camOn || (tab !== "pay" && tab !== "stock") || video.readyState < 2) return;
    bcBusy = true;
    try {
      const codes = await detector.detect(video);
      const now = performance.now();
      const pick = list => list.find(v => findByBarcode(products, v)) ?? null; // โหมดรหัสเดียว: รหัสแรกที่ตรงสินค้า
      for (const code of codeGates[tab].step(codes, now, pick)) handleBarcode(code, "กล้อง (บาร์โค้ด)");
    } catch (e) { console.warn(e); }
    bcBusy = false;
  }
  setInterval(barcodeTick, 250);
  function handleBarcode(code, src) {
    const p = findByBarcode(products, code);
    const msg = tab === "stock" ? $("#stockMsg") : $("#payMsg");
    if (!p) { msg.textContent = `ไม่พบสินค้าที่มีบาร์โค้ด ${code}`; msg.className = "form-msg err"; beep(330, 0.2); return; }
    if (tab === "stock") countStock(p.id, 1, true); else addToCart(p, src);
  }
  $("#bcForm").onsubmit = e => { e.preventDefault(); const v = $("#bcIn").value; $("#bcIn").value = ""; if (normBarcode(v)) handleBarcode(normBarcode(v), "บาร์โค้ด"); };

  // ---------- แท็บ ----------
  function setTab(t) {
    if (!["train", "pay", "stock", "report"].includes(t)) t = "pay";
    tab = t;
    $$(".tabs [role=tab]").forEach(b => { const on = b.dataset.tab === t; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; });
    $$(".panel").forEach(p => { p.hidden = p.id !== "panel-" + t; });
    $("#work").hidden = t === "report";
    document.body.dataset.coTab = t;
    if (t === "pay") payGate = gateInit(true);
    if (t === "stock") stockGate = gateInit(true);
    stopCapture();
    if (t === "report") renderReport();
    if (t === "train") renderTrain();
    if (t === "stock") renderStock();
    history.replaceState(null, "", "#" + t);
  }
  window.addEventListener("hashchange", () => { const h = location.hash.slice(1); if (h && h !== tab) setTab(h); });
  $$(".tabs [role=tab]").forEach((b, i, all) => {
    b.onclick = () => setTab(b.dataset.tab);
    b.onkeydown = e => {
      const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (d) { const n = all[(i + d + all.length) % all.length]; n.focus(); setTab(n.dataset.tab); }
    };
  });

  // ---------- สอนสินค้า ----------
  async function addSample(label, emb) {
    const s = { label, emb, fx: fx.id };
    samples.push(s); allSamples.push(s);
    const p = pById(label);
    if (p && !p.thumb) { p.thumb = crop.toDataURL("image/jpeg", 0.7); saveProduct(p); }
    updateCount(label);
    addSampleDB(s);
  }
  function updateCount(label) {
    const row = document.querySelector(`.trow[data-id="${CSS.escape(label)}"]`);
    if (!row) return;
    const n = countOf(label);
    row.querySelector(".cnt").textContent = n;
    /** @type {HTMLElement} */ (row.querySelector(".meter i")).style.width = Math.min(100, n / CFG.RECOMMENDED * 100) + "%";
    row.classList.toggle("enough", n >= CFG.RECOMMENDED);
    const th = /** @type {HTMLElement} */ (row.querySelector(".thumb")), p = pById(label);
    if (p?.thumb && th && !th.style.backgroundImage) th.style.backgroundImage = `url(${p.thumb})`;
  }
  function startCapture(label, btn) {
    if (!fx) { trainMsg("โมเดลยังโหลดไม่เสร็จ กรุณารอสักครู่", "err"); return; }
    if (!camOn) { trainMsg("กรุณาเปิดกล้องก่อน", "err"); return; }
    capture = { label, last: 0, btn }; btn.classList.add("rec");
    btn.querySelector("span").textContent = "กำลังเก็บ... ปล่อยเพื่อหยุด";
  }
  function stopCapture() {
    if (!capture) return;
    capture.btn.classList.remove("rec");
    capture.btn.querySelector("span").textContent = "กดค้างเพื่อเก็บภาพ";
    capture = null;
  }
  function trainMsg(t, cls = "") { const m = $("#trainMsg"); m.textContent = t; m.className = "form-msg " + cls; }

  function trainRow(id, p) {
    const n = countOf(id), isBg = id === BG;
    const meta = isBg ? "สอนภาพตอนไม่มีสินค้าในกรอบ (พื้นโต๊ะ มือเปล่า) เพื่อไม่ให้นับผิด"
      : [p.sku && "SKU " + p.sku, baht(p.price), p.barcode && "บาร์โค้ด " + p.barcode].filter(Boolean).join(" · ");
    return `<li class="trow${n >= CFG.RECOMMENDED ? " enough" : ""}${isBg ? " bg" : ""}" data-id="${esc(id)}">
      <div class="thumb" ${p?.thumb ? `style="background-image:url(${p.thumb})"` : ""}>${isBg ? "∅" : ""}</div>
      <div class="info"><b>${esc(isBg ? "พื้นหลัง / ไม่มีสินค้า" : p.name)}</b><small>${esc(meta)}</small>
        <div class="meter" title="แนะนำอย่างน้อย ${CFG.RECOMMENDED} ภาพ"><i style="width:${Math.min(100, n / CFG.RECOMMENDED * 100)}%"></i></div>
        <small><span class="cnt">${n}</span> ตัวอย่าง (แนะนำ ≥ ${CFG.RECOMMENDED} จากหลายมุม)</small></div>
      <div class="acts">
        <button class="btn primary hold" type="button" data-hold="${esc(id)}"><span>กดค้างเพื่อเก็บภาพ</span></button>
        <div class="mini">
          ${isBg ? "" : `<button class="link" type="button" data-edit="${esc(id)}">แก้ไข</button>`}
          <button class="link" type="button" data-clear="${esc(id)}">ลบตัวอย่าง</button>
          ${isBg ? "" : `<button class="link danger" type="button" data-del="${esc(id)}">ลบสินค้า</button>`}
        </div>
      </div></li>`;
  }
  function renderTrain() {
    $("#trainList").innerHTML = trainRow(BG, null) + products.map(p => trainRow(p.id, p)).join("");
    $("#trainSummary").textContent = `${products.length} สินค้า · ${samples.length} ตัวอย่าง` + (fx ? ` · ตัวสกัดภาพ: ${fx.label}` : "");
    const other = fx ? allSamples.length - samples.length : 0;
    $("#otherNote").hidden = !other;
    $("#otherNote").textContent = other ? `มีตัวอย่างอีก ${other} ภาพที่สอนด้วยตัวสกัดภาพแบบอื่น (ใช้กับเครื่องนี้ไม่ได้ จึงซ่อนไว้)` : "";
  }
  const list = $("#trainList");
  list.addEventListener("pointerdown", e => {
    const b = e.target.closest("[data-hold]"); if (!b || e.button > 0) return;
    e.preventDefault(); try { b.setPointerCapture(e.pointerId); } catch {} startCapture(b.dataset.hold, b);
  });
  ["pointerup", "pointercancel", "lostpointercapture"].forEach(ev => list.addEventListener(ev, stopCapture));
  list.addEventListener("keydown", e => {
    const b = e.target.closest("[data-hold]");
    if (b && (e.key === " " || e.key === "Enter")) { e.preventDefault(); if (!e.repeat && !capture) startCapture(b.dataset.hold, b); }
  });
  list.addEventListener("keyup", e => { if (e.target.closest("[data-hold]") && (e.key === " " || e.key === "Enter")) stopCapture(); });
  list.addEventListener("contextmenu", e => { if (e.target.closest("[data-hold]")) e.preventDefault(); });
  window.addEventListener("blur", stopCapture);
  list.addEventListener("click", async e => {
    const t = e.target.closest("button"); if (!t) return;
    if (t.dataset.clear) {
      const id = t.dataset.clear;
      if (!countOf(id) || !confirm(`ลบตัวอย่างภาพทั้งหมดของ "${nameOf(id)}" (${countOf(id)} ภาพ)?`)) return;
      samples = samples.filter(s => s.label !== id); allSamples = allSamples.filter(s => s.label !== id);
      const p = pById(id); if (p) { delete p.thumb; saveProduct(p); }
      await deleteSamplesDB(id); renderTrain(); trainMsg("ลบตัวอย่างแล้ว", "ok");
    } else if (t.dataset.del) {
      const p = pById(t.dataset.del);
      if (!p || !confirm(`ลบสินค้า "${p.name}" และตัวอย่างภาพทั้งหมด?`)) return;
      products = products.filter(x => x !== p); samples = samples.filter(s => s.label !== p.id); allSamples = allSamples.filter(s => s.label !== p.id);
      await tx("products", "readwrite", tr => { tr.objectStore("products").delete(p.id); }).catch(dbErr);
      await deleteSamplesDB(p.id); renderAll(); trainMsg("ลบสินค้าแล้ว", "ok");
    } else if (t.dataset.edit) {
      const p = pById(t.dataset.edit), f = $("#prodForm");
      f.pid.value = p.id; f.name.value = p.name; f.sku.value = p.sku || ""; f.price.value = p.price; f.barcode.value = p.barcode || "";
      f.querySelector("[type=submit]").textContent = "บันทึกการแก้ไข"; $("#cancelEdit").hidden = false;
      f.scrollIntoView({ behavior: "smooth", block: "center" }); f.name.focus();
    }
  });

  const pf = $("#prodForm");
  function resetForm() { pf.reset(); pf.pid.value = ""; pf.querySelector("[type=submit]").textContent = "เพิ่มสินค้า"; $("#cancelEdit").hidden = true; }
  $("#cancelEdit").onclick = resetForm;
  pf.onsubmit = async e => {
    e.preventDefault();
    const name = pf.name.value.trim(), price = +pf.price.value, barcode = normBarcode(pf.barcode.value), sku = pf.sku.value.trim();
    if (!name) return trainMsg("กรุณากรอกชื่อสินค้า", "err");
    if (!(price >= 0) || pf.price.value === "") return trainMsg("กรุณากรอกราคาเป็นตัวเลข 0 ขึ้นไป", "err");
    if (barcode && products.some(p => p.id !== pf.pid.value && findByBarcode([p], barcode))) return trainMsg("บาร์โค้ดนี้ซ้ำกับสินค้าอื่น", "err");
    let p = pById(pf.pid.value);
    if (p) Object.assign(p, { name, sku, price, barcode });
    else { p = { id: "p-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, sku, price, barcode, created: Date.now() }; products.push(p); }
    await saveProduct(p);
    trainMsg(pf.pid.value ? "บันทึกการแก้ไขแล้ว" : `เพิ่ม "${name}" แล้ว — กดค้างที่ปุ่มเก็บภาพเพื่อสอนสินค้านี้`, "ok");
    resetForm(); renderAll();
  };

  // ส่งออก/นำเข้า/ทดสอบ
  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  $("#exportModel").onclick = () => {
    if (!products.length) return trainMsg("ยังไม่มีสินค้า", "err");
    download(`checkout-model-${dayKey()}.json`, JSON.stringify(serializeModel(products, samples, fx?.id || "mnv2")), "application/json");
    trainMsg(`ส่งออกโมเดลแล้ว (${samples.length} ตัวอย่าง)`, "ok");
  };
  $("#importModel").onclick = () => $("#modelFile").click();
  $("#modelFile").onchange = async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    try {
      const m = parseModel(await f.text());
      if (fx && m.samples.length && m.embedder !== fx.id) throw new Error(`ไฟล์นี้สอนด้วยตัวสกัดภาพแบบ ${m.embedder === "basic" ? "พื้นฐาน (โหมดสำรอง)" : "MobileNetV2"} แต่เครื่องนี้ใช้แบบ ${fx.label} — ต้องสอนตัวอย่างภาพใหม่ในเครื่องนี้`);
      if (!confirm(`นำเข้า ${m.products.length} สินค้า และ ${m.samples.length} ตัวอย่าง?\nข้อมูลการสอนปัจจุบันจะถูกแทนที่ทั้งหมด`)) return;
      products = m.products.map((p, i) => ({ ...p, created: Date.now() + i }));
      samples = m.samples.map(s => ({ ...s, fx: m.embedder })); allSamples = samples.slice();
      await tx(["products", "samples"], "readwrite", t => {
        t.objectStore("products").clear(); t.objectStore("samples").clear();
        products.forEach(p => t.objectStore("products").put(p));
        samples.forEach(s => { t.objectStore("samples").add({ label: s.label, emb: s.emb, fx: s.fx, t: Date.now() }); });
      }).catch(dbErr);
      renderAll(); trainMsg(`นำเข้าแล้ว: ${products.length} สินค้า ${samples.length} ตัวอย่าง (รูปย่อจะสร้างใหม่เมื่อเก็บภาพเพิ่ม)`, "ok");
    } catch (err) { console.error(err); trainMsg("นำเข้าไม่สำเร็จ: " + (err instanceof SyntaxError ? "ไฟล์ JSON ไม่ถูกต้อง" : err.message), "err"); }
  };
  $("#runEval").onclick = () => {
    const out = $("#evalOut");
    const labels = new Set(samples.map(s => s.label));
    if (labels.size < 2) { out.innerHTML = `<p class="form-msg err">ต้องสอนอย่างน้อย 2 กลุ่ม (เช่น สินค้า 1 อย่าง + พื้นหลัง) จึงจะทดสอบได้</p>`; return; }
    out.innerHTML = `<p class="hint">กำลังทดสอบ ${samples.length} ตัวอย่าง...</p>`;
    setTimeout(() => {
      const r = looEval(samples, { minSim: settings.minSim });
      const rows = Object.entries(r.perClass).sort((a, b) => a[1].ok / a[1].n - b[1].ok / b[1].n)
        .map(([l, v]) => `<tr><td>${esc(nameOf(l))}${v.n < CFG.RECOMMENDED ? ' <span class="tag">ตัวอย่างน้อย</span>' : ""}</td><td class="n">${v.n}</td><td class="n">${Math.round(v.ok / v.n * 100)}%</td></tr>`).join("");
      const conf = r.confusions.slice(0, 6).map(c => `<li><b>${esc(nameOf(c.actual))}</b> → ถูกทายเป็น <b>${esc(nameOf(c.pred))}</b> <span class="pill">${c.count} ครั้ง</span></li>`).join("");
      out.innerHTML = `<div class="tiles"><div class="tile"><div class="k">ความแม่นยำ (leave-one-out)</div><div class="v">${(r.acc * 100).toFixed(1)}%</div><div class="s">ถูก ${r.correct} จาก ${r.n}</div></div></div>
        <div class="table-wrap"><table><thead><tr><th>กลุ่ม</th><th class="n">ตัวอย่าง</th><th class="n">ทายถูก</th></tr></thead><tbody>${rows}</tbody></table></div>
        <h3>คู่ที่สับสนบ่อย</h3>${conf ? `<ul class="confs">${conf}</ul>` : `<p class="hint">ไม่มีคู่ที่สับสน</p>`}
        <p class="hint">ตัวอย่างที่ถ่ายต่อเนื่องจะคล้ายกันมาก ผลนี้จึงมักสูงกว่าการใช้งานจริง ควรทดลองสแกนจริงในแท็บ "ชำระเงิน" ด้วย คู่ที่สับสนให้เก็บภาพเพิ่มจากมุมที่ต่างกันชัดเจน (เช่น ฉลาก ด้านข้าง ขนาดบรรจุภัณฑ์)</p>`;
    }, 30);
  };

  // ---------- ชำระเงิน ----------
  const saveCart = () => LS.set("cart", cart);
  function payMsg(t, cls = "") { const m = $("#payMsg"); m.textContent = t; m.className = "form-msg " + cls; }
  function addToCart(p, src) {
    cartAdd(cart, p, 1); saveCart(); renderCart(p.id);
    flash = { t: performance.now(), name: p.name };
    beep(); payMsg(`เพิ่ม ${p.name} (${src})`, "ok");
  }
  function renderCart(hl) {
    const tot = cartTotals(cart);
    $("#cartList").innerHTML = cart.length ? cart.map(l => `<li data-id="${esc(l.id)}" class="${l.id === hl ? "hl" : ""}">
        <div class="nm"><b>${esc(l.name)}</b><small>${baht(l.price)}${l.sku ? " · " + esc(l.sku) : ""}</small></div>
        <div class="qty"><button type="button" data-q="-1" aria-label="ลดจำนวน ${esc(l.name)}">−</button><input type="number" min="0" max="9999" value="${l.qty}" aria-label="จำนวน ${esc(l.name)}"><button type="button" data-q="1" aria-label="เพิ่มจำนวน ${esc(l.name)}">+</button></div>
        <b class="sum">${baht(l.price * l.qty)}</b></li>`).join("")
      : `<li class="empty">ตะกร้าว่าง — วางสินค้าในกรอบกล้อง สแกนบาร์โค้ด หรือเพิ่มเอง</li>`;
    $("#cartQty").textContent = `${tot.qty} ชิ้น`;
    $("#cartTotal").textContent = baht(tot.total);
    $("#cartVat").textContent = `รวมภาษีมูลค่าเพิ่ม ${CFG.VAT}% แล้ว ${baht(tot.vat)}`;
    $("#checkoutBtn").disabled = !cart.length;
    $("#pbQty").textContent = `${tot.qty} ชิ้น · ดูตะกร้า`;
    $("#pbTotal").textContent = baht(tot.total);
    $("#pbPay").disabled = !cart.length;
  }
  $("#pbPay").onclick = () => $("#checkoutBtn").click();
  $("#pbCart").onclick = () => $("#panel-pay").scrollIntoView({ behavior: "smooth", block: "start" });
  $("#cartList").addEventListener("click", e => {
    const b = e.target.closest("[data-q]"); if (!b) return;
    const id = b.closest("li").dataset.id, l = cart.find(x => x.id === id);
    cartSetQty(cart, id, l.qty + +b.dataset.q); saveCart(); renderCart();
  });
  $("#cartList").addEventListener("change", e => {
    if (e.target.type !== "number") return;
    cartSetQty(cart, e.target.closest("li").dataset.id, e.target.value); saveCart(); renderCart();
  });
  $("#clearCart").onclick = () => { if (cart.length && confirm("ล้างสินค้าทั้งหมดในตะกร้า?")) { cart = []; saveCart(); renderCart(); payMsg("ล้างตะกร้าแล้ว"); } };
  $("#manualAdd").onclick = () => { const p = pById($("#manualSel").value); if (p) addToCart(p, "เพิ่มเอง"); };
  const autoChk = $("#autoScan"), beepChk = $("#beepChk");
  autoChk.checked = settings.auto; beepChk.checked = settings.beep;
  autoChk.onchange = () => { settings.auto = autoChk.checked; payGate = gateInit(true); saveSettings(); };
  beepChk.onchange = () => { settings.beep = beepChk.checked; saveSettings(); if (settings.beep) beep(); };

  // ตั้งค่าความไว
  function saveSettings() { LS.set("settings", settings); }
  /** @type {[string, (v: number) => string][]} */
  const SLIDERS = [["minSim", v => v.toFixed(2)], ["minConf", v => Math.round(v * 100) + "%"], ["stableMs", v => (v / 1000).toFixed(1) + " วิ"]];
  function syncSliders() { SLIDERS.forEach(([k, f]) => { $("#set-" + k).value = settings[k]; $("#out-" + k).textContent = f(+settings[k]); }); }
  SLIDERS.forEach(([k, f]) => {
    $("#set-" + k).oninput = e => {
      settings[k] = +e.target.value; $("#out-" + k).textContent = f(settings[k]);
      if (k === "minSim" && fx) settings.minSimBy[fx.id] = settings[k];
      saveSettings();
    };
  });
  syncSliders();
  $("#resetSettings").onclick = () => {
    if (fx) delete settings.minSimBy[fx.id];
    Object.assign(settings, { minSim: fx ? CFG.MIN_SIM_BY[fx.id] : CFG.MIN_SIM, minConf: CFG.MIN_CONF, stableMs: CFG.STABLE_MS });
    saveSettings(); syncSliders();
  };

  // ใบเสร็จ
  const dlg = $("#payDlg");
  let pendingOrder = null;
  $("#checkoutBtn").onclick = () => {
    if (!cart.length) return;
    const tot = cartTotals(cart);
    pendingOrder = { items: cart.map(l => ({ ...l })), ...tot };
    $("#dlgStep1").hidden = false; $("#dlgStep2").hidden = true;
    $("#dlgSummary").innerHTML = receiptLines(pendingOrder);
    $("#cashIn").value = ""; $("#changeOut").textContent = "";
    $("#payMethod").value = "เงินสด"; $("#cashRow").hidden = false;
    dlg.showModal();
  };
  $("#payMethod").onchange = () => { $("#cashRow").hidden = $("#payMethod").value !== "เงินสด"; };
  $("#cashIn").oninput = () => {
    const c = +$("#cashIn").value, t = pendingOrder?.total || 0;
    $("#changeOut").textContent = $("#cashIn").value === "" ? "" : c >= t ? `เงินทอน ${baht(c - t)}` : `ยังขาดอีก ${baht(t - c)}`;
    $("#changeOut").className = "form-msg " + (c >= t ? "ok" : "err");
  };
  function receiptLines(o) {
    return `<table class="rc"><tbody>${o.items.map(l => `<tr><td>${esc(l.name)}<br><small>${l.qty} × ${baht(l.price)}</small></td><td class="n">${baht(l.price * l.qty)}</td></tr>`).join("")}</tbody>
      <tfoot><tr><td>รวม ${o.qty} ชิ้น</td><td class="n"><b>${baht(o.total)}</b></td></tr>
      <tr class="sub"><td>มูลค่าก่อนภาษี</td><td class="n">${baht(o.net)}</td></tr>
      <tr class="sub"><td>ภาษีมูลค่าเพิ่ม ${CFG.VAT}%</td><td class="n">${baht(o.vat)}</td></tr></tfoot></table>`;
  }
  $("#confirmPay").onclick = () => {
    const method = $("#payMethod").value, o = pendingOrder;
    if (!o) return;
    let cash = null;
    if (method === "เงินสด" && $("#cashIn").value !== "") {
      cash = +$("#cashIn").value;
      if (cash < o.total) { $("#changeOut").textContent = "รับเงินไม่พอ"; $("#changeOut").className = "form-msg err"; return; }
    }
    const seq = nextSeq(LS.get("seq", null)), t = Date.now();
    const order = { no: orderNo(t, seq.n), t, ...o, method, cash, change: cash !== null ? Math.round((cash - o.total) * 100) / 100 : null };
    const sales = LS.get("sales", []); sales.push(order);
    if (!LS.set("sales", sales)) return;
    LS.set("seq", seq);
    cart = []; saveCart(); renderCart(); pendingOrder = null;
    $("#rcNo").textContent = order.no; $("#rcTime").textContent = fmtTime(t);
    $("#rcBody").innerHTML = receiptLines(order) + `<p class="rc-pay">ชำระโดย: ${esc(method)}${cash !== null ? ` · รับเงิน ${baht(cash)} · ทอน ${baht(order.change)}` : ""}</p>`;
    $("#dlgStep1").hidden = true; $("#dlgStep2").hidden = false;
    beep(1318, 0.18);
    payMsg(`ชำระเงินเรียบร้อย ใบเสร็จ ${order.no}`, "ok");
  };
  $("#cancelPay").onclick = () => dlg.close();
  $("#printRc").onclick = () => window.print();
  $("#doneRc").onclick = () => { dlg.close(); payGate = gateInit(true); };
  dlg.addEventListener("close", () => { pendingOrder = null; });

  // ---------- นับสต็อก ----------
  const saveStock = () => LS.set("stock", stock);
  function stockMsg(t, cls = "") { const m = $("#stockMsg"); m.textContent = t; m.className = "form-msg " + cls; }
  function countStock(id, d, auto) {
    stock.counts[id] = Math.max(0, (stock.counts[id] || 0) + d);
    saveStock(); renderStock(id);
    if (auto) { const p = pById(id); flash = { t: performance.now(), name: p?.name || id }; beep(); stockMsg(`+1 ${p?.name || id}`, "ok"); }
  }
  function renderStock(hl) {
    const rows = stockRows(products, stock);
    let tc = 0, te = 0;
    $("#stockBody").innerHTML = rows.map(r => {
      tc += r.counted; te += r.expected || 0;
      const dcls = r.diff === null ? "" : r.diff === 0 ? "ok" : r.diff < 0 ? "neg" : "pos";
      return `<tr data-id="${esc(r.id)}" class="${r.id === hl ? "hl" : ""}"><td>${esc(r.name)}<br><small>${esc(r.sku)}</small></td>
        <td class="n"><input type="number" min="0" max="999999" value="${r.expected ?? ""}" placeholder="–" aria-label="จำนวนที่ควรมี ${esc(r.name)}"></td>
        <td class="n"><div class="qty"><button type="button" data-s="-1" aria-label="ลด">−</button><b>${r.counted}</b><button type="button" data-s="1" aria-label="เพิ่ม">+</button></div></td>
        <td class="n diff ${dcls}">${r.diff === null ? "–" : r.diff > 0 ? "+" + r.diff : r.diff}</td></tr>`;
    }).join("") || `<tr><td colspan="4" class="empty">ยังไม่มีสินค้า</td></tr>`;
    $("#stockTotal").textContent = `นับได้ ${tc} ชิ้น · ควรมี ${te} ชิ้น · เริ่มนับ ${fmtTime(stock.started)}`;
  }
  $("#stockBody").addEventListener("click", e => {
    const b = e.target.closest("[data-s]"); if (b) countStock(b.closest("tr").dataset.id, +b.dataset.s, false);
  });
  $("#stockBody").addEventListener("change", e => {
    if (e.target.type !== "number") return;
    const id = e.target.closest("tr").dataset.id, v = e.target.value;
    if (v === "") delete stock.expected[id]; else stock.expected[id] = Math.max(0, Math.floor(+v));
    saveStock(); renderStock();
  });
  const stockAuto = $("#stockAuto");
  stockAuto.checked = settings.stockAuto;
  stockAuto.onchange = () => { settings.stockAuto = stockAuto.checked; stockGate = gateInit(true); saveSettings(); };
  [["pay", "multiCodePay"], ["stock", "multiCodeStock"]].forEach(([t, k]) => {
    const el = $("#" + k); if (!el) return;
    el.checked = !!settings[k];
    el.onchange = () => { settings[k] = el.checked; codeGates[t] = mkCodeGates(t); saveSettings(); };
  });
  $("#stockReset").onclick = () => {
    if (!confirm("เริ่มนับใหม่? จำนวนที่นับได้จะเป็น 0 (จำนวนที่ควรมียังอยู่)")) return;
    stock.counts = {}; stock.started = Date.now(); saveStock(); renderStock(); stockMsg("เริ่มนับใหม่แล้ว", "ok");
  };
  $("#stockCsv").onclick = () => {
    const rows = stockRows(products, stock);
    download(`stock-count-${dayKey()}.csv`, toCSV([["SKU", "สินค้า", "ควรมี", "นับได้", "ส่วนต่าง"], ...rows.map(r => [r.sku, r.name, r.expected ?? "", r.counted, r.diff ?? ""])]), "text/csv;charset=utf-8");
  };

  // ---------- รายงานขาย ----------
  let metric = "revenue";
  function renderReport() {
    const sales = LS.get("sales", []), by = salesByProduct(sales);
    const rev = sales.reduce((s, o) => s + Math.round(o.total * 100), 0) / 100, items = sales.reduce((s, o) => s + o.qty, 0);
    $("#repTiles").innerHTML = [
      ["ยอดขายรวม", baht(rev), `${sales.length} ใบเสร็จ`],
      ["จำนวนสินค้าที่ขาย", items.toLocaleString("th-TH") + " ชิ้น", `${by.length} รายการสินค้า`],
      ["เฉลี่ยต่อใบเสร็จ", baht(sales.length ? rev / sales.length : 0), ""],
      ["ใบเสร็จล่าสุด", sales.length ? sales[sales.length - 1].no : "–", sales.length ? fmtTime(sales[sales.length - 1].t) : ""]
    ].map(([k, v, s]) => `<div class="tile"><div class="k">${k}</div><div class="v">${esc(v)}</div><div class="s">${esc(s)}</div></div>`).join("");
    drawChart(by);
    $("#repTable").innerHTML = `<thead><tr><th>สินค้า</th><th>SKU</th><th class="n">จำนวน</th><th class="n">ยอดขาย</th></tr></thead><tbody>${by.map(r => `<tr><td>${esc(r.name)}</td><td>${esc(r.sku)}</td><td class="n">${r.qty}</td><td class="n">${baht(r.revenue)}</td></tr>`).join("") || `<tr><td colspan="4" class="empty">ยังไม่มีการขาย</td></tr>`}</tbody>`;
    $("#orderTable").innerHTML = `<thead><tr><th>เลขที่</th><th>เวลา</th><th class="n">ชิ้น</th><th class="n">ยอด</th><th>ชำระโดย</th></tr></thead><tbody>${sales.slice().reverse().slice(0, 200).map(o => `<tr><td>${esc(o.no)}</td><td>${esc(fmtTime(o.t))}</td><td class="n">${o.qty}</td><td class="n">${baht(o.total)}</td><td>${esc(o.method)}</td></tr>`).join("") || `<tr><td colspan="5" class="empty">ยังไม่มีใบเสร็จ</td></tr>`}</tbody>`;
  }
  function drawChart(by) {
    const cv = $("#chart"), wrap = cv.parentElement, dpr = window.devicePixelRatio || 1;
    const rows = by.slice(0, 12), rowH = 34, padT = 8, W = wrap.clientWidth || 600, H = Math.max(80, padT * 2 + rows.length * rowH);
    cv.width = W * dpr; cv.height = H * dpr; cv.style.width = W + "px"; cv.style.height = H + "px";
    const ctx = cv.getContext("2d"); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.font = "13px Prompt, sans-serif"; ctx.textBaseline = "middle";
    if (!rows.length) { ctx.fillStyle = "#5b7585"; ctx.textAlign = "center"; ctx.fillText("ยังไม่มีข้อมูลการขาย", W / 2, H / 2); return; }
    const val = r => metric === "revenue" ? r.revenue : r.qty, fmtV = v => metric === "revenue" ? baht(v) : v.toLocaleString("th-TH") + " ชิ้น";
    const max = Math.max(...rows.map(val)) || 1;
    const labelW = Math.min(W * 0.38, Math.max(...rows.map(r => ctx.measureText(r.name).width)) + 12), valW = 92;
    const barW = Math.max(20, W - labelW - valW);
    rows.forEach((r, i) => {
      const y = padT + i * rowH, w = Math.max(2, barW * val(r) / max);
      ctx.fillStyle = "#16303f"; ctx.textAlign = "right";
      let name = r.name; while (ctx.measureText(name).width > labelW - 12 && name.length > 4) name = name.slice(0, -2);
      if (name !== r.name) name += "…";
      ctx.fillText(name, labelW - 10, y + rowH / 2);
      ctx.fillStyle = "#2a78d6"; ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(labelW, y + 7, w, rowH - 14, 4) : ctx.rect(labelW, y + 7, w, rowH - 14); ctx.fill();
      ctx.fillStyle = "#52514e"; ctx.textAlign = "left"; ctx.fillText(fmtV(val(r)), labelW + w + 8, y + rowH / 2);
    });
  }
  $$("[data-metric]").forEach(b => b.onclick = () => {
    metric = b.dataset.metric;
    $$("[data-metric]").forEach(x => x.setAttribute("aria-pressed", x === b));
    renderReport();
  });
  let rz; window.addEventListener("resize", () => { clearTimeout(rz); rz = setTimeout(() => { if (tab === "report") renderReport(); }, 150); });
  $("#salesCsv").onclick = () => {
    const sales = LS.get("sales", []);
    const rows = [["เลขที่ใบเสร็จ", "วันที่เวลา", "SKU", "สินค้า", "ราคาต่อหน่วย", "จำนวน", "รวม", "ชำระโดย"]];
    sales.forEach(o => o.items.forEach(l => rows.push([o.no, new Date(o.t).toLocaleString("th-TH"), l.sku, l.name, l.price, l.qty, Math.round(l.price * l.qty * 100) / 100, o.method])));
    download(`sales-${dayKey()}.csv`, toCSV(rows), "text/csv;charset=utf-8");
  };
  $("#productCsv").onclick = () => {
    const by = salesByProduct(LS.get("sales", []));
    download(`sales-by-product-${dayKey()}.csv`, toCSV([["SKU", "สินค้า", "จำนวน", "ยอดขาย"], ...by.map(r => [r.sku, r.name, r.qty, r.revenue])]), "text/csv;charset=utf-8");
  };
  $("#clearSales").onclick = () => {
    if (!confirm("ลบประวัติการขายทั้งหมด? ควรส่งออก CSV ก่อน การลบนี้ย้อนกลับไม่ได้")) return;
    LS.set("sales", []); LS.set("seq", null); renderReport();
  };

  // ---------- รวม ----------
  function renderAll() {
    renderTrain(); renderCart(); renderStock();
    $("#manualSel").innerHTML = products.map(p => `<option value="${esc(p.id)}">${esc(p.name)} — ${baht(p.price)}</option>`).join("");
  }

  (async () => {
    await loadData();
    renderAll();
    setTab(location.hash.slice(1) || "pay");
    initBarcode();
    loadModel();
    await listCams();
    startCam();
    requestAnimationFrame(loop);
  })();
})();

if (typeof module !== "undefined" && module.exports) module.exports = {
  BG, CFG, DEFAULT_PRODUCTS, LEGACY_DEFAULT_IDS, isUntouchedLegacy, MODEL_FORMAT, MODEL_FORMATS_OK, BASIC_DIM, basicFeatures, cosine, knnPredict, decide, gateInit, gateStep, createCodeGates, looEval,
  cartAdd, cartSetQty, cartTotals, orderNo, nextSeq, dayKey, salesByProduct, findByBarcode, normBarcode,
  stockRows, toCSV, csvCell, serializeModel, parseModel
};
