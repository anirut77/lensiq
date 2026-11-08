/* insights-analysis.js — แดชบอร์ดรวม LENSIQ: การวิเคราะห์เชิงสถิติ: ตารางรายวัน การทดสอบเทียบช่วง (BH) ฤดูกาล พยากรณ์ ความสัมพันธ์ A/B ความน่าเชื่อถือของข้อมูล เป้าหมาย แจ้งเตือน
   ไม่ใช้ DOM จึงทดสอบด้วย Node ได้ · UMD: เบราว์เซอร์ = window.LQInsightsAnalysis · Node = require("./insights-analysis.js") */
(/** @param {any} root */ function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./insights-data.js"), require("./lensiq-stats.js"));
  else root.LQInsightsAnalysis = factory(root.LQInsightsData, root.LQStats);
})(typeof self !== "undefined" ? self : this, function (M_data, LQStats) {
"use strict";
  const { iqT, IQ_DAY, iqDay, iqDayStart, iqAddDays, iqSum, iqEarliest, iqInT, iqKpis, iqBuckets, iqSeries, iqTrimHours } = M_data;

/* ================= การวิเคราะห์เชิงสถิติ + แปลผลภาษาไทย (ไม่ใช้ DOM) =================
   ใช้ lensiq-stats.js (LQStats) ; ทุกข้อความสร้างจากตัวเลขที่คำนวณได้จริงเท่านั้น ข้อมูลไม่พอ = บอกตรง ๆ ว่า "ข้อมูลยังน้อย" */
const IQ_ST = LQStats;
const IQ_WD = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const IQ_MIN_DAYS = 7;
const IQ_CASH_RE = /แคชเชียร์|cashier|ชำระ|จ่ายเงิน|เคาน์เตอร์/i;
const iqFin = x => typeof x === "number" && Number.isFinite(x);
/** ภาษาที่แสดงอยู่ (ไทยเป็นค่าเริ่มต้น ; LQI18N.lang = "zh" → จีน, "en" → อังกฤษ) และ locale สำหรับวันที่/ตัวเลข */
const iqLang = () => { const L = (typeof self !== "undefined" && self.LQI18N) || (typeof globalThis !== "undefined" && globalThis.LQI18N) || null; return L && (L.lang === "zh" || L.lang === "en") ? L.lang : "th"; };
const iqLoc = () => ({ zh: "zh-CN", en: "en-GB" }[iqLang()] || "th-TH");
const iqN = (v, d = 0) => iqFin(v) ? v.toLocaleString(iqLoc(), { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "–";
const iqP = (v, d = 0) => iqFin(v) ? (v * 100).toFixed(d) + "%" : "–";
/** เปลี่ยนแปลงเป็นตัวเลขมีเครื่องหมาย เช่น "+12%" "−0.4%" "0%" (ใช้ในช่วงและตาราง) — ต่ำกว่า 1% แสดงทศนิยม 1 ตำแหน่ง ไม่ปัดเป็น 0 */
const iqChg = v => { if (!iqFin(v)) return "–"; const a = Math.abs(v) * 100; if (a < 0.05) return "0%"; return (v > 0 ? "+" : "−") + (a < 1 ? a.toFixed(1) : String(Math.round(a))) + "%"; };
/** ขนาดการเปลี่ยนแบบไม่มีเครื่องหมาย (ใช้หลังคำว่า เพิ่ม/ลด) */
const iqChgAbs = v => iqChg(v).replace(/^[+−]/, "");
/** การเปลี่ยนที่ปัดแล้วเป็นศูนย์ (แสดง “ทรงตัว” แทน “ลด 0%”) */
const iqIsFlat = v => !iqFin(v) || Math.abs(v) < 0.0005;
const iqPts = v => !iqFin(v) ? "–" : iqT("iq.pts", "{v} จุด", { v: (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(1) });
/** ยอดเงินบาท: ไทย "฿1,234" ; จีน "1,234 泰铢" (สัญลักษณ์ ฿ อยู่ในช่วงอักษรไทย) */
const iqB = v => !iqFin(v) ? "–" : iqLang() === "zh" ? Math.round(v).toLocaleString("zh-CN") + " 泰铢" : "฿" + Math.round(v).toLocaleString("th-TH");
const iqDL = key => new Date(iqDayStart(key)).toLocaleDateString(iqLoc(), { day: "numeric", month: "short" });
const iqWdOf = key => new Date(iqDayStart(key)).getDay();
const iqHash = s => { let h = 2166136261; for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619); return h >>> 0; };
const iqPick = (seed, list) => list[iqHash(seed) % list.length];

/** ตารางรายวัน (null = วันที่ระบบนั้นไม่มีข้อมูล ไม่ใช่ศูนย์) */
function iqDaily(D, keys) {
  const n = keys.length, idx = new Map(keys.map((k, i) => [k, i])), arr = () => Array(n).fill(null);
  const o = { keys, storeIn: arr(), storeOut: arr(), peak: arr(), maxQueue: arr(), zone: arr(), cashier: arr(), dwell: arr(), bills: arr(), revenue: arr(), booth: arr(), boothStop: arr(), qcTotal: arr(), qcPass: arr(), drEvents: arr(), drHours: arr(), drTrips: arr(), att: arr(), cx: arr(), cams: {}, hourly: Array(n).fill(null) };
  const cz = D.stCfg && D.stCfg.cashierZone, qz = D.stCfg && D.stCfg.queueZone;
  if (D.store) D.store.forEach(d => {
    const i = idx.get(d.day); if (i == null) return;
    o.storeIn[i] = d.in; o.storeOut[i] = d.out; o.peak[i] = d.peak; o.maxQueue[i] = d.maxQueue;
    o.hourly[i] = d.hourlyIn && d.hourlyIn.length ? d.hourlyIn.slice(0, 24).map(v => +v || 0) : null;
    let zv = 0, cv = 0, ds = 0, dn = 0, anyZ = false, anyC = false;
    for (const [id, z] of Object.entries(d.zones || {})) {
      if (!z) continue;
      const isC = (cz && (id === cz || id.endsWith(":" + cz))) || IQ_CASH_RE.test(z.name || ""), isQ = qz && id === qz;
      if (isC) { cv += +z.visits || 0; anyC = true; }
      else if (!isQ) { zv += +z.visits || 0; anyZ = true; if (z.dwellN > 0) { ds += +z.dwellSum || 0; dn += z.dwellN; } }
    }
    if (anyZ) o.zone[i] = zv; if (anyC) o.cashier[i] = cv; if (dn) o.dwell[i] = ds / dn / 1000;
    for (const [s, b] of Object.entries(d.byCam || {})) { const c = o.cams[s] || (o.cams[s] = { name: b.name, in: arr() }); c.name = b.name; c.in[i] = b.in; }
  });
  // บิลขาย (สแกนสินค้า + จดจำลูกค้า) เติมศูนย์ตั้งแต่วันแรกที่มีการขาย
  if (D.co || D.cx) {
    const ts = [], seen = new Set();
    (D.co || []).forEach(x => ts.push([x.t, x.total]));
    if (D.cx) D.cx.orders.forEach(x => { ts.push([seen.has(x.ticket) ? null : x.t, x.amount]); seen.add(x.ticket); });
    const days = ts.filter(([t]) => iqFin(t)).map(([t]) => iqDay(t)).sort();
    const first = days[0] || null;
    if (first) keys.forEach((k, i) => { if (k >= first) { o.bills[i] = 0; o.revenue[i] = 0; } });
    (D.co || []).forEach(x => { const i = iqFin(x.t) ? idx.get(iqDay(x.t)) : null; if (i != null) { o.bills[i]++; o.revenue[i] += x.total; } });
    if (D.cx) { const s2 = new Set(); D.cx.orders.forEach(x => { const i = iqFin(x.t) ? idx.get(iqDay(x.t)) : null; if (i == null) return; o.revenue[i] += x.amount; if (!s2.has(x.ticket)) { s2.add(x.ticket); o.bills[i]++; } }); }
  }
  if (D.cx) { const per = keys.map(() => new Set()); D.cx.orders.forEach(x => { const i = iqFin(x.t) ? idx.get(iqDay(x.t)) : null; if (i != null) per[i].add(x.mid); }); per.forEach((s, i) => { if (o.bills[i] != null) o.cx[i] = s.size; }); }
  const bump = (a, i, v = 1) => { a[i] = (a[i] || 0) + v; };
  if (D.booth) D.booth.visitors.forEach(v => { const i = iqFin(v.t) ? idx.get(iqDay(v.t)) : null; if (i != null) { bump(o.booth, i); if (v.stopped) bump(o.boothStop, i); else if (o.boothStop[i] == null) o.boothStop[i] = 0; } });
  if (D.qc) D.qc.log.forEach(l => { const i = iqFin(l.t) ? idx.get(iqDay(l.t)) : null; if (i != null) { bump(o.qcTotal, i); bump(o.qcPass, i, l.pass ? 1 : 0); } });
  if (D.dr) {
    D.dr.trips.forEach(t => { const i = iqFin(t.t) ? idx.get(iqDay(t.t)) : null; if (i != null) { bump(o.drTrips, i); bump(o.drHours, i, t.durationMs / 3600000); if (o.drEvents[i] == null) o.drEvents[i] = 0; } });
    D.dr.events.forEach(e => { const i = iqFin(e.t) && e.type !== "break" ? idx.get(iqDay(e.t)) : null; if (i != null && o.drEvents[i] != null) o.drEvents[i]++; });
  }
  if (D.att) D.att.forEach(l => { const i = idx.get(l.day); if (i != null) bump(o.att, i); });
  o.conv = keys.map((_, i) => o.storeIn[i] > 0 && o.bills[i] != null ? o.bills[i] / o.storeIn[i] : null);
  return o;
}

/** ค่าในช่วง [from, to] ของอาร์เรย์รายวัน */
function iqWin(H, arr, from, to) { const out = []; H.keys.forEach((k, i) => { if (k >= from && k <= to) out.push(arr[i]); }); return out; }
function iqWinKeys(H, from, to) { return H.keys.filter(k => k >= from && k <= to); }

/** วิเคราะห์ทั้งหมดของช่วง r ; opt = { now, goals, alerts } */
function iqAnalyze(D, r, opt = {}) {
  const S = IQ_ST, now = opt.now != null ? opt.now : Date.now(), today = iqDay(now);
  const earliest = iqEarliest(D) || r.to;
  const low = [r.from, r.prev ? r.prev.from : r.from, iqAddDays(r.to, -119)].sort()[0];
  let h0 = earliest > low ? earliest : low; if (h0 > r.to) h0 = r.to;
  const keys = []; for (let k = h0; k <= r.to; k = iqAddDays(k, 1)) keys.push(k);
  const H = iqDaily(D, keys);
  const fullEnd = r.to >= today ? iqAddDays(today, -1) : r.to;
  const A = { r, now, today, H, fullEnd, has: {} };
  const fullStore = iqWin(H, H.storeIn, keys[0], fullEnd).filter(iqFin);
  const fullBills = iqWin(H, H.bills, keys[0], fullEnd).filter(iqFin);
  A.dataDays = Math.max(fullStore.length, fullBills.length, iqWin(H, H.booth, keys[0], r.to).filter(iqFin).length, iqWin(H, H.att, keys[0], r.to).filter(iqFin).length);
  A.storeDays = fullStore.length;
  A.short = A.dataDays < IQ_MIN_DAYS;

  // สัดส่วนของวันนี้ที่ผ่านไปแล้ว (จากรูปแบบรายชั่วโมงในอดีต) ใช้เทียบวันนี้ที่ยังไม่จบอย่างยุติธรรม
  const curH = new Date(now).getHours() + new Date(now).getMinutes() / 60;
  let frac = Math.min(1, Math.max(0.04, curH / 24));
  const hh = H.hourly.filter((h, i) => h && H.keys[i] < today);
  if (hh.length >= 3) {
    let before = 0, tot = 0;
    hh.forEach(h => h.forEach((v, k) => { tot += v; if (k + 1 <= curH) before += v; else if (k < curH) before += v * (curH - k); }));
    if (tot > 0) frac = Math.min(1, Math.max(0.04, before / tot));
  }
  A.todayFrac = frac;
  const expo = (arr, from, to) => { let e = 0; H.keys.forEach((k, i) => { if (k >= from && k <= to && iqFin(arr[i])) e += k === today ? frac : 1; }); return e; };
  const tot = (arr, from, to) => iqSum(iqWin(H, arr, from, to).filter(iqFin));
  /** เทียบจำนวนนับรายวันช่วงนี้ (A) กับช่วงเทียบ (B) — quasi-Poisson/negative binomial ปรับวันในสัปดาห์ (LQStats.countCompare)
     วันอื่นในประวัติ (สูงสุด ~120 วัน ไม่รวมวันนี้) ใช้ประมาณผลของวันในสัปดาห์และความผันผวนรายวัน ; วันนี้คิดตามสัดส่วนเวลาที่ผ่านไป
     ระดับความมั่นใจตั้งค่าภายหลังจาก q-value (Benjamini–Hochberg) ใน iqAdjustTests */
  const countTest = arr => {
    if (!r.prev) return null;
    const days = [];
    H.keys.forEach((k, i) => {
      const v = arr[i]; if (!iqFin(v)) return;
      const e = k === today ? frac : 1, wd = iqWdOf(k), inA = k >= r.from && k <= r.to, inB = k >= r.prev.from && k <= r.prev.to;
      if (inA) days.push({ y: v, e, wd, g: "A", t: i });
      if (inB) days.push({ y: v, e, wd, g: "B", t: i });
      if (!inA && !inB && k < today) days.push({ y: v, e, wd, g: "h", t: i });
    });
    const t = S.countCompare(days); if (!t) return null;
    const enough = !A.short && t.n >= 10 && t.enough;
    const ch = iqFin(t.adjChange) ? t.adjChange : t.change;
    // ข้อมูลพอไหม: ผลต่างที่ตรวจจับได้ตอนนี้ และต้องเก็บอีกกี่วันถึงจะจับการเปลี่ยนขนาด max(10%, ที่เห็น) ได้ราว 80% ของครั้ง
    const plan = S.planMore({ lo: t.lo, hi: t.hi, days: Math.max(1, Math.round(t.e1)), target: Math.max(0.1, Math.abs(ch || 0)), scale: "log" });
    // ดูซ้ำทุกวัน (round 11): mixture-SPRT p (τ = 15% บน log scale) — ใช้กับข้อความ “ถ้าเปิดดูทุกวัน” และการแจ้งเตือน
    // round 12: ช่วงที่เทียบเป็นหน้าต่างเลื่อน (ไม่สะสม) → คำรับประกัน always-valid ไม่ครอบคลุม ; การคุมเตือนผิด = ปรับเทียบด้วยการจำลอง (docs/STATS.md §14)
    const pSeq = iqFin(t.lo) && iqFin(t.hi) && t.adjRatio > 0 ? S.seqP(Math.log(t.adjRatio), t.p, S.SEQ.tauLog) : 1;
    return { ...t, cur: t.c1, prev: t.c2, level: S.confLevel(t.p, enough), enough, plan, kind: "count", pSeq, levelSeq: S.confLevel(pSeq, enough) };
  };
  const rateTest = (xa, na) => {
    if (!r.prev) return null;
    const x1 = tot(xa, r.from, r.to), n1 = tot(na, r.from, r.to), x2 = tot(xa, r.prev.from, r.prev.to), n2 = tot(na, r.prev.from, r.prev.to);
    if (!(n1 > 0 && n2 > 0) || x1 > n1 || x2 > n2) return null;
    // รายวัน → quasi-binomial (คนในวันเดียวกันไม่เป็นอิสระต่อกัน)
    const daily = (from, to) => H.keys.map((k, i) => (k >= from && k <= to && iqFin(xa[i]) && iqFin(na[i]) ? { x: xa[i], n: na[i] } : null)).filter(Boolean);
    const dA = daily(r.from, r.to), t = S.twoPropDaily(dA, daily(r.prev.from, r.prev.to)); if (!t) return null;
    const enough = !A.short && n1 >= 30 && n2 >= 30;
    const plan = S.planMore({ lo: t.lo, hi: t.hi, days: Math.max(1, dA.length), target: Math.max(Math.abs(t.diff), 0.1 * t.p2), scale: "lin" });
    const pSeq = t.p2 > 0 ? S.seqP(t.diff, t.p, S.SEQ.tauRel * t.p2) : 1;
    return { ...t, change: t.p2 > 0 ? t.diff / t.p2 : null, level: S.confLevel(t.p, enough), enough, plan, kind: "rate", pSeq, levelSeq: S.confLevel(pSeq, enough) };
  };
  A.countTest = countTest; A.rateTest = rateTest;

  // ---------- KPI พร้อม sparkline / CI / การทดสอบ ----------
  const K = iqKpis(D, r);
  const sparkOf = id => {
    const m = { booth: "booth", store: "store", co: "coRevenue", cx: "cxRevenue" }[id];
    if (m) { const v = iqSeries(D, r, m); return r.mode === "hour" ? iqTrimHours(iqBuckets(r), [v]).series[0] : v; }
    if (id === "att") return iqWin(H, H.att, r.from, r.to).map(v => v || 0);
    if (id === "qc") return iqWin(H, H.qcTotal, r.from, r.to).map((t, i) => t ? iqWin(H, H.qcPass, r.from, r.to)[i] / t : null);
    return null;
  };
  K.forEach(k => {
    k.spark = sparkOf(k.id);
    if (k.id === "store") { k.test = countTest(H.storeIn); const ci = iqDailyCI(H, H.storeIn, r.from, fullEnd); if (ci && ci.lo != null && ci.n >= 3) k.ci = { text: iqT("iq.kpi.ci.store", "เฉลี่ย {m}/วัน (95%: {lo}–{hi})", { m: iqN(ci.mean), lo: iqN(Math.max(0, ci.lo)), hi: iqN(ci.hi) }) }; }
    if (k.id === "booth") k.test = countTest(H.booth);
    if (k.id === "att") k.test = countTest(H.att);
    if (k.id === "cx") { const t = countTest(H.cx); k.test = t ? { ...t, what: "ลูกค้าที่จดจำต่อวัน" } : null; }
    if (k.id === "co") { const t = countTest(H.bills); k.test = t ? { ...t, what: "จำนวนบิล" } : null; }
    if (k.id === "co" || k.id === "cx") {
      const ci = iqDailyCI(H, H.revenue, r.from, fullEnd); if (ci && ci.lo != null && ci.n >= 3 && k.id === "co") k.ci = { text: iqT("iq.kpi.ci.co", "ยอดรวมทุกช่องทางเฉลี่ย {m}/วัน (95%: {lo}–{hi})", { m: iqB(ci.mean), lo: iqB(Math.max(0, ci.lo)), hi: iqB(ci.hi) }) };
    }
    if (k.id === "qc") { const w = iqQcCI(D, r); if (w) k.ci = { text: `95%: ${iqP(w.lo, 1)}–${iqP(w.hi, 1)}` + (w.method === "quasi-binomial" ? iqT("iq.kpi.ci.qcb", " (รวมความผันผวนระหว่างช่วงในกะ)") : "") }; }
    if (k.id === "sg" && D.sg) { const w = S.wilson(Math.min(D.sg.totals.viewers || 0, D.sg.totals.ots || 0), D.sg.totals.ots || 0); if (w) k.ci = { text: iqT("iq.kpi.ci.sg", "อัตรามอง {p} (95%: {lo}–{hi})", { p: iqP(w.p), lo: iqP(w.lo), hi: iqP(w.hi) }) }; }
    if (k.id === "dr" && D.dr) { const ci = S.meanCI(D.dr.trips.filter(t => iqInT(t.t, r)).map(t => t.safety)); if (ci && ci.lo != null && ci.n >= 3) k.ci = { text: `95%: ${iqN(Math.max(0, ci.lo))}–${iqN(Math.min(100, ci.hi))}` }; }
    if (k.id === "neuro" && D.neuro) { const ci = S.meanCI(D.neuro.filter(s => iqInT(s.t, r)).map(s => s.positive)); if (ci && ci.lo != null && ci.n >= 3) k.ci = { text: `95%: ${iqP(Math.max(0, ci.lo))}–${iqP(Math.min(1, ci.hi))}` }; }
    // ตัวเลขเทียบช่วงก่อน (delta) กับป้ายความมั่นใจต้องมาจากการทดสอบเดียวกันเสมอ (ค่าต่อวัน ปรับวันในสัปดาห์แล้ว)
    // ยอดขาย: ทดสอบด้วยจำนวนบิล (ยอดเงินแกว่งตามขนาดบิลเกินกว่าจะทดสอบตรง ๆ) → delta เป็นของจำนวนบิล และระบุ what ให้เห็น
    // ลูกค้าที่จดจำ: ทดสอบจำนวนลูกค้าต่อวัน → delta ของจำนวนเดียวกัน
    k.delta = null;
    if (k.test) { const ch = iqFin(k.test.adjChange) ? k.test.adjChange : k.test.change; if (iqFin(ch)) k.delta = ch; }
  });
  // อัตราซื้อ (บิล ÷ คนเข้าร้าน) — ต้องมีทั้งหน้าร้านและการขาย
  if (D.store && (D.co || D.cx)) {
    const x = tot(H.bills.map((b, i) => iqFin(H.storeIn[i]) ? b : null), r.from, r.to), n = tot(H.storeIn.map((v, i) => iqFin(H.bills[i]) ? v : null), r.from, r.to);
    if (n > 0 && x <= n) {
      const w = S.wilson(x, n), t = rateTest(H.bills.map((b, i) => iqFin(H.storeIn[i]) ? b : null), H.storeIn.map((v, i) => iqFin(H.bills[i]) ? v : null));
      // ช่วงหลัก = quasi-binomial (√φ จากความต่างรายวัน — คนในวันเดียวกันไม่อิสระต่อกัน) ; Wilson เดิมยังแสดงไว้คู่กันในชื่อ “นับต่อคน”
      const dd = H.keys.map((kk, i) => (kk >= r.from && kk <= r.to && iqFin(H.bills[i]) && iqFin(H.storeIn[i]) && H.storeIn[i] > 0 ? { x: H.bills[i], n: H.storeIn[i] } : null)).filter(Boolean);
      const qb = S.quasiBinomCI ? S.quasiBinomCI(dd) : null, main = qb && qb.method === "quasi-binomial" ? qb : null;
      const ciText = main ? iqT("iq.kpi.ci.conv", "95%: {lo}–{hi} (รวมความผันผวนรายวัน) · นับต่อคน: {wlo}–{whi}", { lo: iqP(main.lo, 1), hi: iqP(main.hi, 1), wlo: iqP(w.lo, 1), whi: iqP(w.hi, 1) })
        : iqT("iq.kpi.ci.conv1", "95% นับต่อคน: {wlo}–{whi}", { wlo: iqP(w.lo, 1), whi: iqP(w.hi, 1) });
      const k = { id: "conv", label: "อัตราซื้อ (บิล ÷ คนเข้าร้าน)", value: w.p, fmt: "pct1", delta: t && iqFin(t.change) ? t.change : null, sub: iqT("iq.kpi.sub.conv", "{x} บิล จาก {n} คน · ประมาณการ (คนละระบบ)", { x: iqN(x), n: iqN(n) }), ci: { text: ciText }, test: t, spark: iqWin(H, H.conv, r.from, r.to) };
      const at = K.findIndex(q => q.id === "store"); K.splice(at >= 0 ? at + 1 : K.length, 0, k);
      A.conv = { x, n, ci: main || w, ciVisitor: w, ciDaily: qb, test: t };
    }
  }
  A.kpis = K;

  // ---------- ฤดูกาล วัน × ชั่วโมง ----------
  A.heat = iqHeat(D, H, r, today);

  // ---------- พยากรณ์ + ค่าผิดปกติ (ใช้วันที่จบแล้วเท่านั้น) ----------
  const fsrc = D.store ? ["storeIn", "คนเข้าร้าน", "คน"] : (D.co || D.cx) ? ["bills", "จำนวนบิลขาย", "บิล"] : D.booth ? ["booth", "ผู้เข้าชมบูธ", "คน"] : null;
  if (fsrc) {
    const arr = H[fsrc[0]], fk = H.keys.filter(k => k <= fullEnd);
    let i0 = fk.findIndex((k, i) => iqFin(arr[i])); if (i0 < 0) i0 = fk.length;
    const ks = fk.slice(i0), y = ks.map(k => arr[H.keys.indexOf(k)]);
    const fc = y.filter(iqFin).length ? S.forecast(y, 7, { conf: 0.8 }) : null;
    const an = S.anomalies(y, { minN: 14 }).map(a => ({ ...a, day: ks[a.i] }));
    const fkeys = Array.from({ length: 7 }, (_, j) => iqAddDays(fullEnd, j + 1));
    const actualToday = today > fullEnd && H.keys.includes(today) ? arr[H.keys.indexOf(today)] : null;
    A.forecast = { metric: fsrc[0], name: fsrc[1], unit: fsrc[2], keys: ks, y, fc, fkeys, anomalies: an, todaySoFar: actualToday, enough: !!(fc && fc.enough) && y.filter(iqFin).length >= 21 };
    A.forecast.rough = !A.forecast.enough; // ช่วงพยากรณ์ของข้อมูลสั้น = ค่าคร่าว ๆ (กราฟวาดเส้นประ)
    if (fc) {
      const last7 = iqSum(y.slice(-7).filter(iqFin));
      A.forecast.total = { mean: iqSum(fc.mean), lo: iqSum(fc.lo), hi: iqSum(fc.hi), last7, change: last7 > 0 ? iqSum(fc.mean) / last7 - 1 : null };
    }
  }

  // ---------- ความสัมพันธ์ ----------
  const cFrom = r.days >= 14 ? r.from : keys[0], cTo = fullEnd < cFrom ? r.to : fullEnd;
  const W = a => iqWin(H, a, cFrom, cTo);
  const corr = [];
  // อนุกรมรายวัน: ตัดผลวันในสัปดาห์ + แนวโน้มก่อน แล้วปรับ CI/p ด้วยขนาดตัวอย่างที่มีผลจริง (n_eff) — LQStats.tsCorrelation
  const cWd = iqWinKeys(H, cFrom, cTo).map(iqWdOf);
  // caution = ข้อความเดียว หรือ { adj, raw } (หลังตัดผลวันในสัปดาห์แล้ว / ยังไม่ได้ตัด) — ไม่เตือนเรื่องวันในสัปดาห์ถ้าตัดออกแล้ว
  const addC = (id, x, y, xName, yName, caution, daily = true) => { const c = S.tsCorrelation(x, y, { wd: daily ? cWd : null }); if (c.n >= 3) corr.push({ id, xName, yName, ...c, x: S.clean(x).length ? x : [], y, caution: typeof caution === "string" ? caution : c.adjusted === "weekday+trend" ? caution.adj : caution.raw, daily }); };
  if (D.store && (D.co || D.cx)) {
    addC("queue-conv", W(H.maxQueue), W(H.conv), "คิวสูงสุดของวัน (คน)", "อัตราซื้อ", { adj: "วันที่ร้านแน่นกว่าปกติ ทั้งคิวและอัตราซื้ออาจเปลี่ยนเพราะความแน่นเอง ไม่ใช่เพราะคิว", raw: "วันที่คนเยอะ (เช่น เสาร์–อาทิตย์) ทั้งคิวยาวและอัตราซื้ออาจเปลี่ยนเพราะความหนาแน่นเอง ไม่ใช่เพราะคิว" });
    if (W(H.dwell).some(iqFin)) addC("dwell-conv", W(H.dwell), W(H.conv), "เวลาอยู่ในโซนสินค้าเฉลี่ย (วินาที)", "อัตราซื้อ", "คนที่ตั้งใจซื้ออยู่แล้วอาจใช้เวลานานกว่า ความสัมพันธ์จึงอาจกลับทิศ");
    addC("in-bills", W(H.storeIn), W(H.bills), "คนเข้าร้าน", "จำนวนบิล", { adj: "ตัดผลวันในสัปดาห์ออกแล้ว แต่วันที่คนเข้ามากบิลก็มากตามธรรมชาติ ความสัมพันธ์สูงจึงเป็นเรื่องปกติ ไม่ได้บอกเหตุและผล", raw: "ทั้งสองค่าขึ้นกับวันในสัปดาห์เหมือนกัน ความสัมพันธ์สูงเป็นเรื่องปกติ" });
  }
  if (D.sg && D.store && D.sg.hourly) {
    const hin = Array(24).fill(0);
    H.keys.forEach((k, i) => { if (k >= cFrom && k <= cTo && H.hourly[i]) H.hourly[i].forEach((v, h) => { hin[h] += v; }); });
    const xs = [], ys = [];
    for (let h = 0; h < 24; h++) { const o = D.sg.hourly[String(h)]; if (o && o.ots > 0 && hin[h] > 0) { xs.push(o.ots); ys.push(hin[h]); } }
    addC("ots-in", xs, ys, "คนผ่านจอโฆษณา (รายชั่วโมง สะสม)", "คนเข้าร้าน (รายชั่วโมง)", "ทั้งสองค่าขึ้นกับช่วงเวลาของวันเหมือนกัน ไม่ได้แปลว่าป้ายพาคนเข้าร้าน", false);
  }
  if (D.booth) addC("booth-stop", W(H.booth), W(H.boothStop).map((s, i) => W(H.booth)[i] ? s / W(H.booth)[i] : null), "ผู้เข้าชมบูธต่อวัน", "อัตราหยุดชม", "บูธที่คนแน่นอาจทำให้คนหยุดน้อยลงหรือมากขึ้นได้ทั้งสองทาง");
  A.corr = corr; A.corrSpan = { from: cFrom, to: cTo };

  // ---------- A/B ----------
  A.ab = {};
  // round 11: ทดสอบบนยอดแยก วัน × ช่วงเวลา (abRatesStrata) — ไม่ให้ “เล่นคนละช่วงเวลา” กลายเป็น “โฆษณาต่างกัน” ; ไม่มีข้อมูลแยก/เล่นร่วมช่วงกันน้อย = ป้ายไม่เกิน “ยังไม่แน่”
  if (D.sg && D.sg.ads.length >= 2) {
    A.ab.sg = S.abRatesStrata(D.sg.ads.filter(a => a.ots > 0 && a.viewers <= a.ots).map(a => ({ id: a.id, name: a.title, x: a.viewers, n: a.ots, strata: a.strata || null })), { minN: 30 });
    A.ab.sg.strataInfo = D.sg.strataInfo || null;
  }
  if (D.neuro) {
    const g = new Map();
    D.neuro.filter(s => iqInT(s.t, r) || r.preset === "all").forEach(s => { const k = s.test || "–"; (g.get(k) || g.set(k, []).get(k)).push(s.positive); });
    const all = [...g.entries()].map(([name, values]) => ({ id: name, name, values }));
    if (all.length >= 2) A.ab.neuro = S.abMeans(all, { minN: 10 });
  }

  // ---------- funnel ในร้าน ----------
  if (D.store) {
    const ok = H.keys.map((k, i) => k >= r.from && k <= r.to && iqFin(H.storeIn[i]));
    const sumIf = a => iqSum(a.map((v, i) => ok[i] && iqFin(v) ? v : 0)), anyIf = a => a.some((v, i) => ok[i] && iqFin(v));
    const steps = [{ key: "pass", label: "คนผ่านหน้าร้าน", value: null, note: "ยังไม่มีกล้องนับคนเดินผ่านด้านนอก" }, { key: "in", label: "เข้าร้าน", value: sumIf(H.storeIn), note: "นับจากเส้นประตู" }];
    if (anyIf(H.zone)) steps.push({ key: "zone", label: "แวะโซนสินค้า", value: sumIf(H.zone), note: "ครั้งที่แวะโซน (คนเดียวแวะได้หลายโซน)" });
    if (anyIf(H.cashier)) steps.push({ key: "cash", label: "ไปแคชเชียร์", value: sumIf(H.cashier), note: "ครั้งที่เข้าโซนแคชเชียร์" });
    if (D.co || D.cx) steps.push({ key: "buy", label: "ซื้อ (บิล)", value: sumIf(H.bills), note: "บิลจากสแกนสินค้า/จดจำลูกค้า" });
    const f = S.funnel(steps.slice(1));
    A.storeFunnel = { steps: [steps[0], ...f.steps], overall: f.overall };
  }

  // ---------- ลูกค้ากลับมาซ้ำ ----------
  if (D.cx && D.cx.orders.length) {
    const t0 = Math.min(...D.cx.orders.map(o => o.t).filter(iqFin));
    const wk = t => Math.floor((iqDayStart(iqDay(t)) - iqDayStart(iqDay(t0))) / (7 * IQ_DAY) + 1e-9);
    A.cohort = { ...S.cohorts(D.cx.orders.filter(o => iqFin(o.t)).map(o => ({ id: o.mid, period: wk(o.t) })), 8), start: iqDay(t0) };
  }
  if (D.booth) { const V = D.booth.visitors.filter(v => iqInT(v.t, r)); A.boothReturn = S.wilson(V.filter(v => v.returning).length, V.length); A.boothStop = S.wilson(V.filter(v => v.stopped).length, V.length); }

  // ---------- แยกกล้อง/เครื่อง ----------
  A.cams = Object.entries(H.cams).map(([slot, c]) => {
    const cur = iqSum(iqWin(H, c.in, r.from, r.to).filter(iqFin)), e1 = expo(c.in, r.from, r.to);
    let test = null;
    if (r.prev && e1 > 0) test = countTest(c.in);
    return { slot, name: c.name, in: cur, node: slot.startsWith("n:") || slot === "local", spark: iqWin(H, c.in, r.from, r.to), test };
  }).filter(c => c.in > 0 || (c.test && c.test.n > 0)).sort((a, b) => b.in - a.in);
  const camTot = iqSum(A.cams.map(c => c.in)); A.cams.forEach(c => { c.share = camTot ? c.in / camTot : null; });

  // ---------- เจาะลึกรายระบบ ----------
  const dr = (id, arr, name, unit) => {
    const from = r.days >= 7 ? r.from : H.keys[0], ks = iqWinKeys(H, from, r.to), v = iqWin(H, arr, from, r.to);
    const vals = v.filter(iqFin); if (!vals.length) return null;
    const d = S.describe(vals), wd = Array.from({ length: 7 }, (_, w) => S.mean(v.filter((x, i) => iqWdOf(ks[i]) === w && ks[i] !== today)));
    const at = x => ks[v.indexOf(x)];
    const an = (A.forecast && A.forecast.metric === id ? A.forecast.anomalies : S.anomalies(v.map((x, i) => ks[i] === today ? null : x), { minN: 14 }).map(a => ({ ...a, day: ks[a.i] }))).filter(a => a.day >= from && a.day <= r.to);
    return { id, name, unit, from, to: r.to, desc: d, minDay: at(d.min), maxDay: at(d.max), weekday: wd, anomalies: an, ma7: S.movingAvg(v, 7), keys: ks, values: v };
  };
  A.drill = {};
  if (D.store) A.drill.store = dr("storeIn", H.storeIn, "คนเข้าร้านต่อวัน", "คน");
  if (D.booth) A.drill.booth = dr("booth", H.booth, "ผู้เข้าชมบูธต่อวัน", "คน");
  if (D.co || D.cx) { const x = dr("revenue", H.revenue, "ยอดขายรวมต่อวัน", "บาท"); A.drill.co = x; A.drill.cx = x; }
  if (D.att) A.drill.att = dr("att", H.att, "ผู้เช็คชื่อต่อวัน", "คน");
  if (D.qc) A.drill.qc = dr("qcTotal", H.qcTotal, "ขวดที่ตรวจต่อวัน", "ขวด");
  if (D.dr) A.drill.dr = dr("drEvents", H.drEvents, "เหตุการณ์คนขับต่อวัน", "ครั้ง");
  Object.keys(A.drill).forEach(k => { if (!A.drill[k]) delete A.drill[k]; });

  // ---------- ทดสอบหลายข้อพร้อมกัน: ระดับความมั่นใจจาก q-value (Benjamini–Hochberg) ----------
  iqAdjustTests(A);
  K.forEach(k => { if (k.test) k.test.short = iqT("iq.conf.short." + k.test.level, S.TH_CONF_SHORT[k.test.level]); });

  A.quality = iqQuality(D, A);
  A.goals = iqGoals(D, A, opt.goals || {});
  A.alertRules = iqAlertRules(opt.alerts || {});
  A.alerts = iqEvalAlerts(D, A, opt.alerts || {});
  return A;
}

const IQ_LV_ORDER = ["insufficient", "none", "weak", "moderate", "strong"];
/** ป้ายความมั่นใจไม่เกิน cap (เช่น A/B ป้ายโฆษณาที่เล่นร่วมช่วงเวลากันน้อย → ไม่เกิน "weak") */
const iqCapLevel = (lv, cap) => (cap && IQ_LV_ORDER.indexOf(lv) > IQ_LV_ORDER.indexOf(cap) ? cap : lv);
/** ค่าเฉลี่ยต่อวันของช่วง [from, to] ปรับวันในสัปดาห์ + เผื่อวันที่ติดกันคล้ายกัน (LQStats.dailyMeanCI ; round 11 — เดิม meanCI ธรรมดา) */
function iqDailyCI(H, arr, from, to) {
  const ks = iqWinKeys(H, from, to), v = iqWin(H, arr, from, to);
  return IQ_ST.dailyMeanCI ? IQ_ST.dailyMeanCI(v, ks.map(iqWdOf)) : IQ_ST.meanCI(v.filter(iqFin));
}
/** อัตราผ่าน QC พร้อมช่วง 95% ที่เผื่อขวดในช่วงเดียวกันของกะไม่อิสระต่อกัน (round 11)
    บันทึกรายขวดครบ (≥ 90% ของยอด และ ≥ 40 ขวด) → แบ่งเป็นช่วงติดกัน ~12 ช่วง (อย่างน้อย 20 ขวด/ช่วง) แล้วใช้ quasiBinomCI บนช่วง
    (เครื่องจักร/ล็อตวัตถุดิบเปลี่ยนระหว่างกะ → ช่วงต่อช่วงต่างกันเกิน binomial) ; บันทึกไม่ครบ = Wilson บนยอดรวม (method "wilson")
    r = ช่วงที่เลือก (null = ทั้งกะ) ; คืน { p, lo, hi, x, n, method, blocks, phi } */
function iqQcCI(D, r) {
  if (!D.qc) return null;
  const all = !r || r.preset === "all", L = (D.qc.log || []).filter(l => l && iqFin(l.t) && (all || iqInT(l.t, r))).sort((a, b) => a.t - b.t);
  const M = all ? { pass: D.qc.pass, total: D.qc.total } : { pass: L.filter(l => l.pass).length, total: L.length };
  if (!(M.total > 0)) return null;
  if (L.length >= 40 && L.length >= 0.9 * M.total) {
    const B = Math.max(20, Math.ceil(L.length / 12)), blocks = [];
    for (let i = 0; i < L.length; i += B) { const b = L.slice(i, i + B); blocks.push({ x: b.filter(l => l.pass).length, n: b.length }); }
    const q = IQ_ST.quasiBinomCI(blocks);
    if (q && q.method === "quasi-binomial") return { ...q, blocks: blocks.length };
  }
  const w = IQ_ST.wilson(M.pass, M.total);
  return w && { ...w, method: "wilson", blocks: 0, phi: 1 };
}
/** ทุกการทดสอบที่หน้านี้แสดงป้ายความมั่นใจ (KPI เทียบช่วงก่อน, อัตราซื้อ, แยกกล้อง, ความสัมพันธ์, A/B) ถือเป็นชุดเดียวกัน
    ปรับด้วย Benjamini–Hochberg (คุมสัดส่วนข้อสรุปผิดในบรรดาข้อที่บอกว่า “ต่างชัด” ไม่ให้เกินราว 5%) แล้วตั้งระดับจาก q
    การทดสอบเดียวกันที่แสดงหลายที่ (เช่น จำนวนบิลใน KPI สองใบ) นับครั้งเดียว ; ข้อที่ข้อมูลยังน้อยไม่นับและเป็น "insufficient" */
function iqAdjustTests(A) {
  const S = IQ_ST, fam = new Map();
  const reg = (key, t) => { if (t) (fam.get(key) || fam.set(key, []).get(key)).push(t); };
  (A.kpis || []).forEach(k => reg("kpi:" + k.id, k.test));
  (A.cams || []).forEach(c => reg("cam:" + c.slot, c.test));
  (A.corr || []).forEach(c => reg("corr:" + c.id, c));
  Object.entries(A.ab || {}).forEach(([id, ab]) => {
    if (!ab || !ab.enough) return;
    if (ab.test) reg(`ab:${id}:${ab.best.id}|${ab.runner.id}`, ab.test);
    if (ab.spread) reg(`ab:${id}:${ab.best.id}|${ab.worst.id}`, ab.spread);
  });
  const keys = [...fam.keys()].filter(k => fam.get(k).every(t => t.enough !== false && iqFin(t.p)));
  const q = S.adjustP(keys.map(k => fam.get(k)[0].p), "BH"), m = keys.length;
  fam.forEach((ts, key) => {
    const i = keys.indexOf(key);
    ts.forEach(t => { t.q = i >= 0 ? q[i] : null; t.m = m; t.level = i >= 0 ? iqCapLevel(S.confLevel(q[i], true), t.cap) : "insufficient"; t.capped = !!(t.cap && i >= 0 && t.level !== S.confLevel(q[i], true)); });
  });
  A.multi = { m, method: "BH" };
  return A.multi;
}

/* ---------- ความน่าเชื่อถือของข้อมูล: ครบทุกวันไหม กล้องดับช่วงไหน ----------
   coverage = วันที่มีข้อมูล ÷ วันที่ควรมี (นับตั้งแต่วันแรกที่ระบบนั้นเริ่มเก็บ ไม่นับวันก่อนติดตั้ง)
   กล้องดับ (หน้าร้าน): วันที่จบแล้วที่ชั่วโมงซึ่งปกติมีคน (ค่ากลางของวันเดียวกันในสัปดาห์ ≥ 3 คน/ชม.) เป็น 0 ติดกัน ≥ 2 ชั่วโมง
   กล้องแยกตัวดับ: กล้องที่ปกติได้ ≥ 10% ของยอด แต่วันนั้นได้ 0 ขณะที่กล้องอื่นยังนับได้ */
function iqQuality(D, A) {
  const S = IQ_ST, H = A.H, r = A.r, today = A.today, end = r.to >= today ? today : r.to;
  const srcs = [["store", "หน้าร้าน (คนเข้า)", H.storeIn, !!D.store], ["sales", "การขาย (บิล)", H.bills, !!(D.co || D.cx)], ["booth", "บูธ", H.booth, !!D.booth], ["att", "เช็คชื่อ", H.att, !!D.att], ["qc", "ตรวจ QC ขวด", H.qcTotal, !!D.qc], ["dr", "คนขับ", H.drTrips, !!D.dr]];
  const sources = [];
  srcs.forEach(([id, name, arr, on]) => {
    if (!on) return;
    const firstI = arr.findIndex(iqFin); if (firstI < 0) return;
    const first = H.keys[firstI], from = first > r.from ? first : r.from;
    if (from > end) return;
    const ks = H.keys.filter(k => k >= from && k <= end), have = ks.filter(k => iqFin(arr[H.keys.indexOf(k)]));
    // ระบบที่ใช้เป็นครั้งคราว (บูธ เช็คชื่อ QC คนขับ) ไม่ได้ต้องมีทุกวัน → ไม่นับวันว่างเป็นข้อมูลหาย
    const daily = id === "store" || id === "sales";
    const missing = daily ? ks.filter(k => !iqFin(arr[H.keys.indexOf(k)]) && k !== today) : [];
    sources.push({ id, name, daily, days: ks.length, have: have.length, coverage: daily && ks.length ? have.length / Math.max(1, ks.filter(k => k !== today).length || 1) : null, missing });
  });
  sources.forEach(x => { if (x.coverage != null) x.coverage = Math.min(1, x.coverage); });
  const outages = [];
  if (D.store) {
    // ชั่วโมงปกติของแต่ละวันในสัปดาห์ = ค่ากลางย้อนหลัง (ไม่รวมวันนี้)
    const prof = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => []));
    H.keys.forEach((k, i) => { if (k < today && H.hourly[i]) { const wd = iqWdOf(k); H.hourly[i].forEach((v, h) => prof[wd][h].push(v)); } });
    const med = prof.map(row => row.map(v => (v.length >= 2 ? S.median(v) : null)));
    H.keys.forEach((k, i) => {
      if (k < r.from || k > r.to || k >= today || !H.hourly[i]) return;
      const wd = iqWdOf(k), hr = H.hourly[i]; let run = [];
      const flush = () => { if (run.length >= 2) { const lost = iqSum(run.map(h => med[wd][h])); outages.push({ day: k, kind: "store", from: run[0], to: run[run.length - 1], hours: run.length, lost: Math.round(lost) }); } run = []; };
      for (let h = 0; h < 24; h++) { if (med[wd][h] >= 3 && !(hr[h] > 0)) run.push(h); else flush(); }
      flush();
    });
    const cams = Object.entries(H.cams);
    if (cams.length > 1) {
      const tot = H.keys.map((_, i) => iqSum(cams.map(([, c]) => (iqFin(c.in[i]) ? c.in[i] : 0))));
      cams.forEach(([slot, c]) => {
        const share = iqSum(c.in.filter(iqFin)) / Math.max(1, iqSum(tot));
        if (share < 0.1) return;
        H.keys.forEach((k, i) => { if (k >= r.from && k <= r.to && k < today && iqFin(c.in[i]) && c.in[i] === 0 && tot[i] > 20) outages.push({ day: k, kind: "camera", slot, name: c.name, lost: Math.round(tot[i] * share / (1 - share)) }); });
      });
    }
  }
  const daily = sources.filter(x => x.daily && x.coverage != null);
  const coverage = daily.length ? Math.min(...daily.map(x => x.coverage)) : null;
  const anomalyOutage = (A.forecast ? A.forecast.anomalies : []).filter(a => a.dir === "down" && outages.some(o => o.day === a.day)).map(a => a.day);
  const grade = coverage == null ? (sources.length ? "ok" : "none") : coverage >= 0.95 && !outages.length ? "good" : coverage >= 0.8 && outages.length <= 2 ? "fair" : "check";
  return { sources, outages, coverage, grade, anomalyOutage, demo: !!(D.store && D.store.some(d => d.demo)) || !!(D.sg && D.sg.demo) || !!(D.booth && D.booth.demo) };
}

/** ฮีตแมปวันในสัปดาห์ × ชั่วโมง (ค่าเฉลี่ยต่อวัน) — หน้าร้าน ไม่มีก็ใช้เวลาของบิลขาย */
function iqHeat(D, H, r, today) {
  const span = r.days >= 14 ? [r.from, r.to] : [iqAddDays(r.to, -55), r.to];
  const cells = []; let src = null, nDays = 0;
  if (D.store) {
    src = "store";
    H.keys.forEach((k, i) => { if (k < span[0] || k > span[1] || k === today || !H.hourly[i]) return; nDays++; const wd = iqWdOf(k); H.hourly[i].forEach((v, h) => cells.push({ wd, h, v })); });
  } else if (D.co || D.cx) {
    src = "bills";
    const per = new Map(); H.keys.forEach((k, i) => { if (k >= span[0] && k <= span[1] && k !== today && H.bills[i] != null) per.set(k, Array(24).fill(0)); });
    const add = t => { const k = iqFin(t) ? iqDay(t) : null; if (per.has(k)) per.get(k)[new Date(t).getHours()]++; };
    (D.co || []).forEach(o => add(o.t)); if (D.cx) { const s = new Set(); D.cx.orders.forEach(o => { if (!s.has(o.ticket)) { s.add(o.ticket); add(o.t); } }); }
    per.forEach((a, k) => { nDays++; const wd = iqWdOf(k); a.forEach((v, h) => cells.push({ wd, h, v })); });
  }
  if (!src || !nDays) return null;
  const G = IQ_ST.seasonGrid(cells);
  let lo = 23, hi = 0;
  G.mean.forEach(row => row.forEach((v, h) => { if (v > 0) { lo = Math.min(lo, h); hi = Math.max(hi, h); } }));
  if (lo > hi) return null;
  const top = []; G.mean.forEach((row, wd) => row.forEach((v, h) => { if (v != null && h >= lo && h <= hi) top.push({ wd, h, v }); }));
  top.sort((a, b) => b.v - a.v);
  const open = top.filter(c => c.v >= G.max * 0.15); // ช่วงที่เปิดทำการจริง (ไม่นับชั่วโมงที่แทบไม่มีคน)
  const byWd = G.mean.map(row => iqSum(row.map(v => v || 0)));
  return { src, grid: G.mean, n: G.n, max: G.max, lo, hi, nDays, from: span[0], to: span[1], top: top.slice(0, 3), low: open.length > 3 ? open[open.length - 1] : null, byWd, short: nDays < 14 };
}

/* ---------- เป้าหมาย (iq-goals) ---------- */
const IQ_GOAL_DEFS = [
  { id: "storeInDay", label: "คนเข้าร้านต่อวัน", unit: "คน", fmt: "int" },
  { id: "convPct", label: "อัตราซื้อ", unit: "%", fmt: "pct" },
  { id: "revenueDay", label: "ยอดขายรวมต่อวัน", unit: "บาท", fmt: "baht" },
  { id: "qcYieldPct", label: "อัตราผ่าน QC", unit: "%", fmt: "pct" },
  { id: "safetyMin", label: "คะแนนความปลอดภัยคนขับเฉลี่ย", unit: "คะแนน", fmt: "int" }
];
/** สถานะเทียบเกณฑ์จากช่วง 95% (ไม่ตัดสินจากค่าที่เห็นตัวเดียว):
    "above" = ทั้งช่วงถึงเกณฑ์ · "below" = ทั้งช่วงต่ำกว่าเกณฑ์ · "unclear" = ช่วงคร่อมเกณฑ์ (ยังสรุปไม่ได้) ; ไม่มีช่วง = "unclear" */
function iqVsTarget(est, lo, hi, target) {
  if (!iqFin(est) || !iqFin(target)) return null;
  if (iqFin(lo) && iqFin(hi)) return lo >= target ? "above" : hi < target ? "below" : "unclear";
  return "unclear";
}
/** ต้องตรวจเพิ่มอีกกี่หน่วยให้ช่วง 95% ของสัดส่วนพ้นเกณฑ์ (ถ้าอัตราจริงเท่ากับที่เห็นตอนนี้) ; มากเกินไป = null */
function iqMoreForRate(p, n, target, conf = 0.95, max = 1e6) {
  if (!iqFin(p) || !(n > 0) || !iqFin(target) || p === target) return null;
  const z = IQ_ST.zCrit(conf), need = Math.ceil(z * z * Math.max(p * (1 - p), 1 / n) / (p - target) ** 2);
  return need > max ? null : Math.max(0, need - n);
}
function iqGoals(D, A, goals) {
  const S = IQ_ST, out = [], r = A.r, H = A.H;
  const avgCI = v => { const c = S.meanCI(v); return c ? { est: c.mean, lo: c.lo, hi: c.hi, n: c.n } : null; };
  // ต่อวัน (round 11): ปรับวันในสัปดาห์ + เผื่อวันที่ติดกันคล้ายกัน — เดิม meanCI ธรรมดา (สัปดาห์ไม่ครบเอียง, วันที่ติดกันคล้ายกัน → มั่นใจเกิน)
  const dayCI = arr => { const c = iqDailyCI(H, arr, r.from, A.fullEnd < r.from ? r.to : A.fullEnd); return c ? { est: c.mean, lo: c.lo, hi: c.hi, n: c.n, method: c.method, weekdayAdj: c.weekdayAdj } : null; };
  IQ_GOAL_DEFS.forEach(g => {
    const t = +goals[g.id]; if (!(t > 0)) return;
    let ci = null, target = t;
    if (g.id === "storeInDay" && D.store) ci = dayCI(H.storeIn);
    if (g.id === "revenueDay" && (D.co || D.cx)) ci = dayCI(H.revenue);
    if (g.id === "convPct" && A.conv) { ci = { est: A.conv.ci.p, lo: A.conv.ci.lo, hi: A.conv.ci.hi, n: A.conv.n }; target = t / 100; }
    if (g.id === "qcYieldPct" && D.qc) { const w = iqQcCI(D, r); ci = w ? { est: w.p, lo: w.lo, hi: w.hi, n: w.n, method: w.method } : null; target = t / 100; }
    if (g.id === "safetyMin" && D.dr) ci = avgCI(D.dr.trips.filter(x => iqInT(x.t, r)).map(x => x.safety).filter(iqFin));
    const actual = ci ? ci.est : null, status = ci ? iqVsTarget(ci.est, ci.lo, ci.hi, target) : null;
    out.push({ ...g, target, actual, lo: ci ? ci.lo : null, hi: ci ? ci.hi : null, n: ci ? ci.n : 0, method: ci ? ci.method || "t" : null, progress: actual != null ? actual / target : null, status, met: status === "above" });
  });
  return out;
}

/* ---------- กฎแจ้งเตือน (iq-alerts) ---------- */
const IQ_ALERT_DEFAULTS = { occMax: null, queueWaitMin: 5, convDropPct: 15, qcYieldMin: 95, notify: false };
function iqAlertRules(raw) {
  const o = { ...IQ_ALERT_DEFAULTS };
  if (raw && typeof raw === "object") for (const k of Object.keys(IQ_ALERT_DEFAULTS)) if (k in raw) o[k] = k === "notify" ? !!raw[k] : (raw[k] === null || raw[k] === "" ? null : (+raw[k] >= 0 ? +raw[k] : o[k]));
  return o;
}
/** ระดับความมั่นใจของการทดสอบที่ระบบประเมินซ้ำทุกวัน (round 11): ระดับที่ใช้ = ต่ำกว่าระหว่าง p ครั้งเดียว กับ mixture-SPRT p
    (round 12: หน้าต่างเลื่อน 7 vs 7 วัน → การคุมเตือนผิดเป็นแบบปรับเทียบด้วยการจำลอง ≤ 5% ใน 22 วันที่ τ 0.10–0.25 ไม่ใช่ always-valid ตามทฤษฎี)
    t = ผลของ twoPropDaily ; คืน { level, fixed (ระดับจาก p ครั้งเดียว), pSeq } */
function iqSeqClear(t, enough = true) {
  const S = IQ_ST, fixed = S.confLevel(t.p, enough), pSeq = t.p2 > 0 ? S.seqP(t.diff, t.p, S.SEQ.tauRel * t.p2) : 1;
  const seq = S.confLevel(pSeq, enough);
  return { level: IQ_LV_ORDER.indexOf(seq) < IQ_LV_ORDER.indexOf(fixed) ? seq : fixed, fixed, pSeq };
}
function iqEvalAlerts(D, A, raw) {
  const R = iqAlertRules(raw), out = [], today = A.today;
  const day = D.store ? D.store.find(d => d.day === today) : null;
  const occMax = R.occMax != null ? R.occMax : (D.stCfg && D.stCfg.maxOcc) || null;
  if (day && occMax > 0 && day.peak > occMax) out.push({ id: "occ", level: "high", title: iqT("iq.al.occ.t", "คนในร้านเกินที่กำหนด"), text: iqT("iq.al.occ", "วันนี้มีคนในร้านพร้อมกันสูงสุด {a} คน เกินเกณฑ์ {b} คน", { a: iqN(day.peak), b: iqN(occMax) }), action: iqT("iq.al.occ.a", "เปิดช่องบริการเพิ่มหรือจำกัดคนเข้าชั่วคราว") });
  const svc = (D.stCfg && D.stCfg.serviceSec) || 60;
  if (day && R.queueWaitMin > 0 && day.maxQueue * svc / 60 > R.queueWaitMin) out.push({ id: "queue", level: "high", title: iqT("iq.al.queue.t", "คิวรอนานเกินเกณฑ์"), text: iqT("iq.al.queue", "วันนี้คิวยาวสุด {q} คน รอราว {m} นาที (เกณฑ์ {t} นาที คิดจาก {s} วินาที/คน)", { q: iqN(day.maxQueue), m: iqN(day.maxQueue * svc / 60, 1), t: iqN(R.queueWaitMin), s: svc }), action: iqT("iq.al.queue.a", "เพิ่มพนักงานแคชเชียร์ในช่วงคิวยาว") });
  if (D.store && (D.co || D.cx) && R.convDropPct > 0) {
    const H = A.H, e = A.fullEnd, a0 = iqAddDays(e, -6), b0 = iqAddDays(e, -13), b1 = iqAddDays(e, -7);
    const bills = H.bills.map((b, i) => iqFin(H.storeIn[i]) ? b : null), ins = H.storeIn.map((v, i) => iqFin(H.bills[i]) ? v : null);
    const s = (arr, f, t) => iqSum(iqWin(H, arr, f, t).filter(iqFin));
    const x1 = s(bills, a0, e), n1 = s(ins, a0, e), x2 = s(bills, b0, b1), n2 = s(ins, b0, b1);
    if (n1 > 0 && n2 > 0 && x1 <= n1 && x2 <= n2) {
      // รายวัน → quasi-binomial (คนในวันเดียวกันไม่เป็นอิสระต่อกัน) แทนการนับทีละคน
      const daily = (f, to) => H.keys.map((k, i) => (k >= f && k <= to && iqFin(bills[i]) && iqFin(ins[i]) && ins[i] > 0 && bills[i] <= ins[i] ? { x: bills[i], n: ins[i] } : null)).filter(Boolean);
      const t = IQ_ST.twoPropDaily(daily(a0, e), daily(b0, b1));
      const rel = t && t.p2 > 0 ? t.diff / t.p2 : 0, okN = n1 >= 30 && n2 >= 30 && !!t && t.days >= 8;
      // การแจ้งเตือนนี้ประเมินใหม่ทุกวัน (7 วันล่าสุดเทียบ 7 วันก่อน) — ถ้าตัดสินด้วย p < 0.05 ทุกวัน 22 วันจะเตือนผิดอย่างน้อยครั้งหนึ่งราว 30%
      // round 11: “ลดชัด” ต้องผ่าน mixture-SPRT p (iqSeqClear) ด้วย → เตือนผิด ≤ 5% ตลอด 22 วัน (จากการจำลอง: หน้าต่างเลื่อนไม่ได้รับคำรับประกัน always-valid ตามทฤษฎี) ; ถ้ายังไม่ผ่านยังแจ้งเตือนระดับ “ยังสรุปไม่ได้” เหมือนเดิม
      const sq = t ? iqSeqClear(t, okN) : { level: "insufficient", fixed: "insufficient", pSeq: 1 }, lv = sq.level;
      const clear = lv === "strong" || lv === "moderate";
      if (t && rel < -R.convDropPct / 100) {
        // ตัดสินจากการทดสอบ ไม่ใช่ค่าที่เห็นอย่างเดียว: ลดชัด = แจ้งเตือนจริง ; ยังไม่ชัด = บอกว่ายังสรุปไม่ได้ และต้องดูต่ออีกกี่วัน
        const plan = IQ_ST.planMore({ lo: t.lo, hi: t.hi, days: Math.max(1, daily(a0, e).length), target: Math.abs(t.diff), scale: "lin" });
        const v = { a: iqP(t.p1, 1), b: iqP(t.p2, 1), c: iqChg(rel), t: iqN(R.convDropPct) };
        out.push(clear
          ? { id: "conv", level: "high", cardLevel: lv, title: iqT("iq.al.conv.t", "อัตราซื้อลดลงจากสัปดาห์ก่อน"), text: iqT("iq.al.conv", "7 วันล่าสุด {a} เทียบ {b} ({c} เกณฑ์ลด {t}%)", v), sure: iqT("iq.conf.change." + lv, IQ_ST.plainConf(lv, "change")), action: iqT("iq.al.conv.a", "ตรวจคิว ราคา และสินค้าขาดชั้นในสัปดาห์นี้"), test: { p: t.p, pSeq: sq.pSeq, level: lv, levelFixed: sq.fixed, method: t.method } }
          : { id: "conv", level: "mid", cardLevel: lv, title: iqT("iq.al.conv.t0", "อัตราซื้ออาจลดลง ยังสรุปไม่ได้"), text: iqT("iq.al.conv", "7 วันล่าสุด {a} เทียบ {b} ({c} เกณฑ์ลด {t}%)", v), sure: iqT("iq.al.conv.s0", "ยังสรุปไม่ได้ ความต่างขนาดนี้เกิดจากความผันผวนรายวันได้"),
            action: plan && plan.moreDays ? iqT("iq.al.conv.a0", "ยังไม่ต้องเปลี่ยนแผน ดูต่ออีกประมาณ {n} วัน ถ้ายังต่ำอยู่ค่อยตรวจคิวและสินค้าขาดชั้น", { n: iqN(plan.moreDays) }) : iqT("iq.al.conv.a1", "ยังไม่ต้องเปลี่ยนแผน ดูต่ออีก 1–2 สัปดาห์ ถ้ายังต่ำอยู่ค่อยตรวจคิวและสินค้าขาดชั้น"), test: { p: t.p, pSeq: sq.pSeq, level: lv, levelFixed: sq.fixed, method: t.method },
            seqNote: sq.fixed !== lv ? iqT("iq.al.conv.seq", "ระบบตรวจเงื่อนไขนี้ใหม่ทุกวัน จึงใช้เกณฑ์ที่เข้มกว่าการดูครั้งเดียว (กันการเตือนผิดจากการดูซ้ำ) — ค่า p ครั้งเดียว {p}", { p: iqP(t.p, 1) }) : "" });
      }
    }
  }
  if (D.qc && R.qcYieldMin > 0 && D.qc.total > 0) {
    // ตัดสินจากช่วง 95% (Wilson) เทียบเกณฑ์ ไม่ใช่ค่าที่เห็นตัวเดียว: แนะนำหยุดไลน์เฉพาะเมื่อทั้งช่วงต่ำกว่าเกณฑ์
    // round 11: ช่วงที่เผื่อขวดในช่วงเดียวกันของกะไม่อิสระต่อกัน (iqQcCI) ; บันทึกรายขวดไม่ครบ = Wilson เหมือนเดิม
    const w = iqQcCI(D, null), T0 = R.qcYieldMin / 100, st = iqVsTarget(w.p, w.lo, w.hi, T0);
    const v = { p: iqP(w.p, Math.abs(w.p - T0) < 0.001 ? 2 : 1), lo: iqP(w.lo, 1), hi: iqP(w.hi, 1), t: iqN(R.qcYieldMin), n: iqN(D.qc.total) };
    if (st === "below") out.push({ id: "qc", level: "high", cardLevel: "strong", status: st, ci: w, target: T0, title: iqT("iq.al.qc.t", "อัตราผ่าน QC ต่ำกว่าเกณฑ์"), text: iqT("iq.al.qc", "กะล่าสุดผ่าน {p} จาก {n} ขวด (เกณฑ์ {t}%)", v), sure: iqT("iq.al.qc.s", "ต่ำกว่าเกณฑ์จริง อัตราจริงน่าจะอยู่ระหว่าง {lo}–{hi} ต่ำกว่า {t}% ทั้งช่วง", v), action: iqT("iq.al.qc.a", "หยุดไลน์เพื่อหาสาเหตุหลักก่อนผลิตต่อ") });
    else if (st === "unclear" && w.p < T0) {
      const more = iqMoreForRate(w.p, D.qc.total, T0);
      out.push({ id: "qc", level: "mid", cardLevel: "insufficient", status: st, ci: w, target: T0, title: iqT("iq.al.qc.t0", "อัตราผ่าน QC ยังสรุปไม่ได้"), text: iqT("iq.al.qc", "กะล่าสุดผ่าน {p} จาก {n} ขวด (เกณฑ์ {t}%)", v), sure: iqT("iq.al.qc.s0", "ยังสรุปไม่ได้ อัตราจริงน่าจะอยู่ระหว่าง {lo}–{hi} ซึ่งคร่อมเกณฑ์ {t}%", v),
        action: more ? iqT("iq.al.qc.a0", "ยังไม่ต้องหยุดไลน์ ตรวจต่ออีกราว {m} ขวดแล้วดูใหม่ ระหว่างนี้ดูสาเหตุที่คัดทิ้งบ่อยที่สุด", { m: iqN(more) }) : iqT("iq.al.qc.a1", "ยังไม่ต้องหยุดไลน์ อัตราใกล้เกณฑ์มาก ตรวจต่อและดูสาเหตุที่คัดทิ้งบ่อยที่สุด") });
    }
  }
  return out;
}

return { iqCapLevel, iqDailyCI, iqQcCI, iqSeqClear, IQ_LV_ORDER, iqLang, iqLoc, iqChgAbs, iqIsFlat, iqVsTarget, iqMoreForRate, iqQuality, IQ_ST, IQ_WD, IQ_MIN_DAYS, IQ_CASH_RE, iqFin, iqN, iqP, iqChg, iqPts, iqB, iqDL, iqWdOf, iqHash, iqPick, iqDaily, iqWin, iqWinKeys, iqAnalyze, iqAdjustTests, iqHeat, IQ_GOAL_DEFS, iqGoals, IQ_ALERT_DEFAULTS, iqAlertRules, iqEvalAlerts };
});
