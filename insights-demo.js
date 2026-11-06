/* insights-demo.js — แดชบอร์ดรวม LENSIQ: สร้างข้อมูลตัวอย่าง (ทุกรายการมีป้าย “(ตัวอย่าง)” ไม่ทับข้อมูลจริง)
   ไม่ใช้ DOM จึงทดสอบด้วย Node ได้ · UMD: เบราว์เซอร์ = window.LQInsightsDemo · Node = require("./insights-demo.js") */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./insights-data.js"));
  else root.LQInsightsDemo = factory(root.LQInsightsData);
})(typeof self !== "undefined" ? self : this, function (M_data) {
"use strict";
  const { IQ_DAY, IQ_DEMO_KEY, IQ_EMO, IQ_VA, iqPad, iqDay, iqDayStart, iqAddDays, iqSum, iqParse } = M_data;

/* ---------- ข้อมูลตัวอย่าง ---------- */
function iqRng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const IQ_DEMO_TAG = "(ตัวอย่าง)";
const IQ_MENU = [["อเมริกาโน่", "กาแฟ", 50], ["ลาเต้", "กาแฟ", 60], ["คาปูชิโน่", "กาแฟ", 60], ["มอคค่า", "กาแฟ", 65], ["ชาไทย", "ชา", 50], ["ชาเขียวมัทฉะลาเต้", "ชา", 60], ["ชามะนาว", "ชา", 45], ["โกโก้", "ช็อกโกแลต", 55], ["นมสดคาราเมล", "นม", 50], ["อิตาเลียนโซดาบลูฮาวาย", "โซดา", 45], ["น้ำผึ้งมะนาวโซดา", "โซดา", 45]].map(([name, cat, price], i) => ({ id: "d" + (i + 1), name, cat, price }));
const IQ_PRODUCTS = [["d-cola", "โคล่า กระป๋อง 325 มล.", "BEV-COLA-325", 17], ["d-tea", "ชาเขียวพร้อมดื่ม 420 มล.", "BEV-TEA-420", 25], ["d-chips", "มันฝรั่งทอดกรอบ 50 ก.", "SNK-CHIP-50", 30], ["d-choc", "ช็อกโกแลตบาร์ 40 ก.", "SNK-CHOC-40", 35], ["d-tumbler", "แก้วเก็บความเย็น LENSIQ", "MRC-TMB-01", 290], ["d-tee", "เสื้อยืด LENSIQ", "MRC-TEE-01", 350]];
const IQ_ADS = [["ad-sport", "Matcha Fizz เย็นซ่า"], ["ad-family", "เซ็ตครอบครัว 4 แก้ว"], ["ad-alkaline", "ชาเขียวอุ่น หวานน้อย"], ["ad-beauty", "Berry Yogurt Smoothie"], ["ad-smile", "ยิ้มรับส่วนลด 15%"], ["ad-classic", "Signature Latte"]];
const IQ_NAMES = ["นภา", "ธนพล", "สุดารัตน์", "กิตติ", "พิมพ์ชนก", "วรวุฒิ", "อรอุมา", "ภูมิ", "ศิริพร", "ณัฐวุฒิ", "มณีรัตน์", "ชยพล", "ปวีณา", "อนุชา", "ขวัญใจ", "ธีรภัทร", "จิราพร", "สมชาย", "รัชนี", "เอกชัย"];

/* สร้างข้อมูลตัวอย่างตาม schema จริงของแต่ละระบบ ไม่เขียนทับข้อมูลจริง
   คืน { set: {key: rawString}, manifest, skipped: [ชื่อระบบ] } */
function iqBuildDemo(snap, now = Date.now(), seed = 20261105) {
  const R = iqRng(seed), rnd = (a, b) => a + R() * (b - a), ri = (a, b) => Math.floor(rnd(a, b + 1)), pick = a => a[Math.floor(R() * a.length)];
  const get = (k, d) => iqParse(snap[k], d);
  const today = iqDay(now), set = {}, skipped = [], man = { v: 1, created: now, created_keys: [], replaced: {}, finger: {}, modules: [] };
  const timeOn = (day, h, m = 0, s = 0) => iqDayStart(day) + ((h * 60 + m) * 60 + s) * 1000;
  const putNew = (k, v, fp) => { set[k] = JSON.stringify(v); if (snap[k] == null) man.created_keys.push(k); else man.replaced[k] = snap[k]; if (fp) man.finger[k] = fp; };
  const appendArr = (k, items, sortBy, desc = false) => {
    const cur = get(k, []), base = Array.isArray(cur) ? cur : [];
    // แทรกรายการตัวอย่างตามเวลา โดยไม่เปลี่ยนลำดับของข้อมูลจริง
    let all = base.concat(items);
    if (sortBy) {
      const before = (a, b) => desc ? sortBy(a) > sortBy(b) : sortBy(a) < sortBy(b);
      const demo = items.slice().sort((a, b) => before(a, b) ? -1 : before(b, a) ? 1 : 0);
      all = []; let j = 0;
      base.forEach(x => { while (j < demo.length && before(demo[j], x)) all.push(demo[j++]); all.push(x); });
      while (j < demo.length) all.push(demo[j++]);
    }
    set[k] = JSON.stringify(all);
    if (snap[k] == null) man.created_keys.push(k);
  };
  const tag = (o) => Object.assign(o, { iqDemo: true });

  // --- บูธ: งานแสดงสินค้า 3 วัน (ข้ามถ้ามีงานจริงที่มีผู้เข้าชมแล้ว)
  const bs = get("booth-state", null);
  if (bs && Array.isArray(bs.visitors) && bs.visitors.length && !bs.iqDemo) skipped.push("วิเคราะห์บูธ (มีข้อมูลงานจริงอยู่)");
  else if (!(bs && bs.iqDemo)) {
    const visitors = []; let seq = 0;
    for (let d = 2; d >= 0; d--) {
      const day = iqAddDays(today, -d), n = ri(55, 85);
      for (let i = 0; i < n; i++) {
        const first = timeOn(day, ri(10, 18), ri(0, 59), ri(0, 59));
        if (first > now) continue;
        const stop = R() < 0.46, dwell = +(stop ? rnd(5, 40) * (R() < 0.25 ? 4 : 1) : rnd(1, 4.9)).toFixed(1);
        const frames = Math.round(dwell * 4) + 4, attRate = stop ? rnd(0.3, 0.95) : rnd(0.05, 0.6);
        const hap = stop ? rnd(0.15, 0.6) : rnd(0, 0.25), sur = rnd(0, 0.12), neg = rnd(0, 0.08), neu = Math.max(0, 1 - hap - sur - neg);
        const probs = [neu, hap, sur, neg * 0.5, neg * 0.2, neg * 0.2, neg * 0.1];
        const val = probs.reduce((s, p, k) => s + p * IQ_VA[IQ_EMO[k]][0], 0);
        const engaged = stop && attRate >= 0.5, visits = R() < 0.08 ? 2 : 1;
        const id = "V" + String(++seq).padStart(3, "0");
        visitors.push({ id, first, last: first + dwell * 1000, dwell, visits, arrivals: visits > 1 ? [first, first + 3600000] : [first], frames, att: Math.round(frames * attRate),
          emo: probs.map(p => +(p * frames).toFixed(3)), vSum: +(val * frames).toFixed(3), acts: engaged && R() < 0.45 ? [pick(["ทดลองชิม", "ลงทะเบียนรับของ", "เล่นเกม"])] : [] });
      }
    }
    visitors.sort((a, b) => a.first - b.first).forEach((v, i) => { v.id = "V" + String(i + 1).padStart(3, "0"); });
    const S = { event: { name: `${IQ_DEMO_TAG} งานแสดงสินค้า LENSIQ Expo`, date: iqAddDays(today, -2) }, seq: visitors.length, visitors, timeline: [], desc: {}, descDay: today, iqDemo: true };
    putNew("booth-state", S, { n: visitors.length }); man.modules.push("booth");
  }

  // --- แผนรายวัน 9 สัปดาห์ (ใช้ร่วมกันระหว่างหน้าร้าน สแกนสินค้า และจดจำลูกค้า ให้ตัวเลขสอดคล้องกัน)
  // ฤดูกาลรายสัปดาห์ (เสาร์–อาทิตย์สูง จันทร์ต่ำ) + แนวโน้มโตช้า ๆ + ค่าผิดปกติ 2 วัน (โปรโมชัน 12 วันก่อน / กล้องดับครึ่งวัน 26 วันก่อน)
  // วันที่คิวยาวอัตราซื้อต่ำลงเล็กน้อย และวันที่คนอยู่ในโซนนานอัตราซื้อสูงขึ้น เพื่อให้ส่วนความสัมพันธ์มีอะไรให้ดู
  const DEMO_DAYS = 63, WK_MULT = [1.35, 0.88, 0.95, 1, 1.02, 1.15, 1.5];
  const SHAPE_WD = [0, 0, 0, 0, 0, 0, 0, 1, 3, 5, 6, 8, 12, 10, 6, 5, 6, 8, 11, 10, 7, 4, 1, 0];
  const SHAPE_WE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 3, 6, 8, 10, 11, 12, 12, 11, 11, 12, 11, 8, 5, 1, 0];
  const plan = [];
  for (let d = DEMO_DAYS - 1; d >= 0; d--) {
    const day = iqAddDays(today, -d), wk = new Date(iqDayStart(day)).getDay(), weekend = wk === 0 || wk === 6;
    const promo = d === 12, outage = d === 26;
    let base = 150 * WK_MULT[wk] * (1 + 0.004 * (DEMO_DAYS - 1 - d)) * rnd(0.92, 1.08);
    if (promo) base *= 1.9;
    const shape = weekend ? SHAPE_WE : SHAPE_WD, tot = iqSum(shape), curH = day === today ? new Date(now).getHours() : 24;
    const hin = Array(24).fill(0);
    shape.forEach((w, h) => { if (h >= curH || (outage && h >= 12)) return; hin[h] = Math.round(base * w / tot * rnd(0.82, 1.18)); });
    const tin = iqSum(hin);
    const maxQueue = Math.max(1, Math.min(9, Math.round(tin / 48 + rnd(-1, 1.6))));
    const dwell = rnd(22, 48);
    const conv = Math.max(0.03, (promo ? 0.115 : 0.1) - 0.0065 * maxQueue + (dwell - 35) * 0.0012 + rnd(-0.008, 0.008));
    plan.push({ day, d, wk, hin, tin, maxQueue, dwell, bills: Math.round(tin * conv), curH });
  }
  const billTimes = p => { // เวลาบิลตามรูปแบบคนเข้าร้าน (เลื่อนไป ~15 นาที)
    const ts = [], tot = iqSum(p.hin) || 1;
    for (let i = 0; i < p.bills; i++) {
      let u = R() * tot, h = 0; while (h < 23 && u >= p.hin[h]) { u -= p.hin[h]; h++; }
      const t = timeOn(p.day, h, ri(0, 59), ri(0, 59)) + 15 * 60000;
      if (t <= now) ts.push(t);
    }
    return ts.sort((a, b) => a - b);
  };
  const share = plan.map(() => rnd(0.33, 0.45)); // สัดส่วนบิลที่เป็นลูกค้าที่จดจำได้

  // --- วิเคราะห์อารมณ์: 32 การทดสอบ (ฉลากสีฟ้า vs ฉลากสีทอง คนละ 12 คน = ชุด A/B ; วิดีโอ 4 คน = ต่ำกว่าเกณฑ์ 10 คน แสดงแต่ไม่จัดอันดับ)
  const ns = get("nm-sessions", []);
  if (!Array.isArray(ns) || !ns.some(s => s.iqDemo)) {
    const tests = [["บรรจุภัณฑ์ใหม่ ฉลากสีฟ้า", "image", 10, 0.32, 12], ["บรรจุภัณฑ์ใหม่ ฉลากสีทอง", "image", 10, 0.04, 12], ["โฆษณา Matcha Fizz 20 วิ", "video", 20, 0.3, 4], ["โฆษณา Signature Latte", "video", 18, 0.12, 4]];
    const sessions = []; let si = 0;
    tests.forEach(([name, type, dur, mood, reps], ti) => { for (let rep = 0; rep < reps; rep++) {
      const i = si++, date = new Date(now - (33 - i) * 0.6 * IQ_DAY - ri(1, 6) * 3600000).toISOString(), samples = [], m0 = mood + rnd(-0.08, 0.08);
      for (let t = 0; t <= dur; t += 0.5) {
        const face = R() < 0.95 ? 1 : 0;
        if (!face) { samples.push({ t, face: 0, att: 0, e: null, v: null, a: null, eng: 0 }); continue; }
        const wave = m0 + 0.25 * Math.sin(t / dur * Math.PI * 2 + i) + rnd(-0.15, 0.15);
        const hap = Math.max(0, Math.min(0.9, wave)), neg = Math.max(0, Math.min(0.6, -wave * 0.8)), sur = rnd(0, 0.15), neu = Math.max(0, 1 - hap - neg - sur);
        const e = [neu, hap, sur, neg * 0.5, neg * 0.2, neg * 0.15, neg * 0.15].map(x => +x.toFixed(3));
        const v = e.reduce((s, p, k) => s + p * IQ_VA[IQ_EMO[k]][0], 0), a = e.reduce((s, p, k) => s + p * IQ_VA[IQ_EMO[k]][1], 0);
        const att = R() < 0.85 ? 1 : 0;
        samples.push({ t, face: 1, att, e, v: +v.toFixed(3), a: +a.toFixed(3), eng: +(att ? 1 - e[0] : 0).toFixed(3) });
      }
      sessions.push(tag({ id: "iqdemo-ns-" + (i + 1), test: `${IQ_DEMO_TAG} ${name}`, pid: "P" + String(rep + 1).padStart(2, "0"), date, media: `ตัวอย่าง-${ti + 1}.${type === "video" ? "mp4" : "jpg"}`, type, duration: dur, samples }));
    } });
    appendArr("nm-sessions", sessions, s => Date.parse(s.date)); man.modules.push("neuro");
  }

  // --- จดจำลูกค้า: สมาชิก 36 คนทยอยสมัคร + ออร์เดอร์ 9 สัปดาห์ (ไม่มีข้อมูลใบหน้า จึงไม่ถูกสแกนจำผิดคน)
  const cm = get("cx-members", []);
  if (!Array.isArray(cm) || !cm.some(m => m.iqDemo)) {
    const members = Array.from({ length: 36 }, (_, i) => tag({ id: "iqdemo-m" + (i + 1), name: `${IQ_DEMO_TAG} คุณ${IQ_NAMES[i % IQ_NAMES.length]}${i >= IQ_NAMES.length ? " " + (Math.floor(i / IQ_NAMES.length) + 1) : ""}`, phone: "", created: iqDayStart(iqAddDays(today, -(DEMO_DAYS - 1 - Math.floor(i * 1.7)))) + 9 * 3600000, consentAt: iqDayStart(iqAddDays(today, -(DEMO_DAYS - 1 - Math.floor(i * 1.7)))) + 9 * 3600000 }));
    const loyal = members.map(() => Math.pow(R(), 2.2) + 0.03);
    const orders = []; let k = 0;
    plan.forEach((p, pi) => {
      const ts = billTimes(p), n = Math.round(ts.length * share[pi]);
      ts.slice(0, n).forEach(time => {
        const ok = members.map((m, i) => m.created <= time ? loyal[i] : 0), totW = iqSum(ok); if (!totW) return;
        let u = R() * totW, mi = 0; while (mi < ok.length - 1 && u >= ok[mi]) { u -= ok[mi]; mi++; }
        const m = members[mi], dr = IQ_MENU[Math.floor(Math.pow(R(), 1.3) * IQ_MENU.length)], size = pick(["S", "M", "M", "L"]), qty = R() < 0.15 ? 2 : 1;
        const id = "iqdemo-o" + (++k);
        orders.push(tag({ id, ticket: id, mid: m.id, drinkId: dr.id, name: dr.name, cat: dr.cat, size, sweet: pick([0, 25, 50, 50, 100]), temp: pick(["เย็น", "เย็น", "ร้อน", "ปั่น"]), qty, price: dr.price + ({ S: 0, M: 10, L: 20 })[size], time }));
      });
    });
    appendArr("cx-members", members); appendArr("cx-orders", orders.sort((a, b) => a.time - b.time), o => o.time); man.modules.push("cx");
  }

  // --- หน้าร้าน: 9 สัปดาห์ (เฉพาะวันที่ยังไม่มีข้อมูลจริง)
  let storeDays = 0;
  plan.forEach((p, pi) => {
    const { day, hin, tin } = p, key = "st-day-" + day;
    if (snap[key] != null) return;
    if (day === today && tin === 0) return;
    const hout = Array(24).fill(0);
    hin.forEach((n, h) => { if (h + 1 >= p.curH || h + 1 > 23) return; hout[h + 1] = Math.round(n * rnd(0.9, 1)); });
    const tout = Math.min(tin, iqSum(hout)), peak = Math.max(...hin.map(n => Math.ceil(n / 2.6)), 1), peakH = hin.indexOf(Math.max(...hin));
    const shelf = Math.round(tin * rnd(0.55, 0.75)), cash = Math.round(p.bills * rnd(1.1, 1.35));
    // กล้อง 2 ตัว: ประตูหน้า (c1) + ประตูข้าง/แคชเชียร์ (c2) ; ยอดรวม = ผลรวมของสองกล้อง
    const in1 = Math.round(tin * rnd(0.6, 0.75)), out1 = Math.min(in1, Math.round(tout * rnd(0.6, 0.75)));
    const D0 = { date: day, in: tin, out: tout, occ: 0, peak, peakAt: timeOn(day, peakH, ri(0, 59)), maxQueue: p.maxQueue, hourly: { in: hin, out: hout },
      zones: { "c1:iqdemo-z1": { name: `${IQ_DEMO_TAG} ชั้นวางน้ำดื่ม`, visits: shelf, dwellSum: Math.round(shelf * p.dwell * 1000), dwellN: shelf, peak: ri(3, 8) }, "c2:iqdemo-z2": { name: `${IQ_DEMO_TAG} แคชเชียร์`, visits: cash, dwellSum: cash * ri(40, 90) * 1000, dwellN: cash, peak: ri(2, 6) } },
      byCam: { c1: { name: `${IQ_DEMO_TAG} ประตูหน้า`, in: in1, out: out1 }, c2: { name: `${IQ_DEMO_TAG} ประตูข้าง`, in: tin - in1, out: tout - out1 } }, zv: 2, iqDemo: true };
    putNew(key, D0, { in: tin, out: tout }); storeDays++;
  });
  if (storeDays) man.modules.push("store");
  if (snap["st-heat-c1"] == null) {
    const W = 64, H = 48, heat = new Array(W * H).fill(0);
    [[0.3, 0.7, 60], [0.55, 0.5, 90], [0.8, 0.75, 45], [0.45, 0.85, 30]].forEach(([px, py, w]) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = x / W - px, dy = y / H - py; heat[y * W + x] += w * Math.exp(-(dx * dx + dy * dy) / 0.006); }
    });
    putNew("st-heat-c1", heat.map(v => Math.round(v * 10) / 10), { sum: Math.round(iqSum(heat.map(v => Math.round(v * 10) / 10))) });
  }

  // --- ป้ายโฆษณา: สถิติสะสม 14 วัน (ข้ามถ้ามีสถิติจริงแล้ว) ; แต่ละโฆษณามีอัตรามองต่างกันจริงเพื่อให้เทียบ A/B ได้
  const sg = get("sg-stats", null);
  if (sg && sg.v === 1 && sg.totals && sg.totals.ots > 0 && !sg.iqDemo) skipped.push("ป้ายโฆษณา (มีสถิติจริงอยู่)");
  else if (!(sg && sg.iqDemo)) {
    const bands = ["u18", "18_34", "35_54", "55p"], demo = {}, hourly = {}, ads = {};
    bands.forEach(b => { demo[b] = { male: 0, female: 0, unk: 0 }; });
    let ots = 0, viewers = 0, attn = 0, dwell = 0;
    for (let h = 8; h <= 20; h++) {
      const o = Math.round((SHAPE_WD[h] * 5 + SHAPE_WE[h] * 2) / 7 * 14 * 6 * rnd(0.85, 1.15)) + ri(10, 40), v = Math.round(o * rnd(0.32, 0.5));
      hourly[String(h)] = { ots: o, viewers: v }; ots += o; viewers += v; attn += v * rnd(2.5, 5.5); dwell += o * rnd(3, 7);
      for (let i = 0; i < o; i++) { const b = bands[Math.min(3, Math.floor(Math.pow(R(), 0.9) * 4))], g = R() < 0.46 ? "male" : R() < 0.9 ? "female" : "unk"; if (R() < 0.92) demo[b][g]++; }
    }
    const rates = [0.36, 0.41, 0.33, 0.39, 0.52, 0.38];
    IQ_ADS.forEach(([id, title], i) => { const o = Math.round(ots / 6 * rnd(0.8, 1.2)), v = Math.round(o * rates[i] * rnd(0.96, 1.04)), look = Math.round(v * rnd(8, 20)); ads[id] = { title, plays: ri(300, 520), ots: o, viewers: v, attn: +(v * rnd(2, 6)).toFixed(1), look, happy: Math.round(look * rnd(0.1, 0.45)) }; });
    const gestures = { swipe_left: ri(20, 60), swipe_right: ri(20, 60), pinch: ri(10, 40), hold: ri(5, 25), palm: ri(5, 20) };
    const st = { v: 1, since: now - 14 * IQ_DAY, ads, demo, hourly, totals: { ots, viewers, dwell: +dwell.toFixed(1), attn: +attn.toFixed(1) }, gestures, selects: { "p-sport": ri(10, 30), "p-classic": ri(5, 20) }, iqDemo: true };
    putNew("sg-stats", st, { ots }); man.modules.push("sg");
  }

  // --- สแกนสินค้า: ใบเสร็จ 9 สัปดาห์ ตามแผนรายวัน (เลขที่ขึ้นต้น DEMO- แยกจากเลขจริง)
  const sales = get("co-sales", []);
  if (!Array.isArray(sales) || !sales.some(o => o.iqDemo)) {
    const out = [];
    plan.forEach((p, pi) => {
      const ts = billTimes(p), n0 = Math.round(ts.length * share[pi]); let seq = 0;
      ts.slice(n0).forEach(t => {
        const items = [], nl = R() < 0.7 ? 1 : 2;
        for (let j = 0; j < nl; j++) { const pr = pick(IQ_PRODUCTS); const ex = items.find(l => l.id === pr[0]); if (ex) ex.qty++; else items.push({ id: pr[0], name: pr[1], sku: pr[2], price: pr[3], qty: ri(1, 3) }); }
        let satang = 0, qty = 0; items.forEach(l => { satang += l.price * 100 * l.qty; qty += l.qty; });
        const vat = Math.round(satang * 7 / 107);
        out.push(tag({ no: `DEMO-${p.day.replace(/-/g, "")}-${String(++seq).padStart(4, "0")}`, t, qty, lines: items.length, total: satang / 100, vat: vat / 100, net: (satang - vat) / 100, items, method: pick(["เงินสด", "QR พร้อมเพย์", "QR พร้อมเพย์", "บัตรเครดิต/เดบิต"]), cash: null, change: null }));
      });
    });
    appendArr("co-sales", out, o => o.t); man.modules.push("co");
  }

  // --- เช็คชื่อ: 3 รอบอบรม (บันทึกเท่านั้น ไม่สร้างข้อมูลใบหน้า)
  const al = get("att-logs", []);
  if (!Array.isArray(al) || !al.some(l => l.iqDemo)) {
    const logs = [];
    [[9, "อบรมความปลอดภัยในโรงงาน", 18], [4, "อบรมพนักงานขายหน้าร้าน", 14], [1, "ประชุมประจำเดือน", 20]].forEach(([ago, s, n]) => {
      const day = iqAddDays(today, -ago);
      for (let i = 0; i < n; i++) logs.push(tag({ pid: "iqdemo-p" + (i + 1), name: `${IQ_DEMO_TAG} ${IQ_NAMES[i % IQ_NAMES.length]}`, code: "D" + String(i + 1).padStart(3, "0"), session: `${IQ_DEMO_TAG} ${s}`, date: day, time: `08:${iqPad(30 + Math.floor(i * 1.4))}:${iqPad(ri(0, 59))}` }));
    });
    appendArr("att-logs", logs); man.modules.push("att");
  }

  // --- ตรวจคุณภาพ: กะ 2 ชั่วโมงล่าสุด (ข้ามถ้ามีกะจริงที่ตรวจแล้ว)
  const qs = get("qc-shift", null);
  if (qs && qs.total > 0 && !qs.iqDemo) skipped.push("ตรวจคุณภาพขวด (มีกะจริงอยู่)");
  else if (!(qs && qs.iqDemo)) {
    const start = now - 2 * 3600000, log = [], reasons = {}, rejects = []; let pass = 0;
    for (let t = start + 5000; t < now; t += ri(9, 15) * 1000) {
      const ok = R() > 0.045, rs = ok ? [] : [pick(["under", "under", "capTilt", "labelShift", "capMissing", "over", "capHigh"])];
      if (ok) pass++; else { rs.forEach(k => { reasons[k] = (reasons[k] || 0) + 1; }); rejects.unshift({ t, reasons: rs, img: "" }); }
      log.push({ t, recipe: `${IQ_DEMO_TAG} ขวดเครื่องดื่ม 600 มล.`, how: "auto", pass: ok, reasons: rs, fy: +rnd(118, 126).toFixed(1), ft: 122, fs: ok ? "ok" : rs[0] === "under" ? "under" : rs[0] === "over" ? "over" : "ok", cc: +rnd(92, 99).toFixed(1), cde: +rnd(2, 9).toFixed(1), ca: +rnd(-2, 2).toFixed(1), ls: +rnd(88, 97).toFixed(1), lsh: ri(-2, 2), sim: "" });
    }
    const shift = { start, total: log.length, pass, reject: log.length - pass, missed: ri(1, 4), reasons, log, rejects: rejects.slice(0, 20), iqDemo: true };
    putNew("qc-shift", shift, { total: shift.total }); man.modules.push("qc");
  }

  // --- คนขับ: 20 เที่ยวใน 8 สัปดาห์
  const tr = get("dr-trips", []);
  if (!Array.isArray(tr) || !tr.some(t => t.iqDemo)) {
    const trips = [], events = [];
    for (let i = 0; i < 20; i++) {
      const id = "DEMO-T" + (i + 1), start = timeOn(iqAddDays(today, -(55 - i * 2.8 | 0)), ri(6, 14), ri(0, 59)); if (start > now) continue;
      const durationMs = ri(45, 180) * 60000, evs = [], ne = ri(0, 7);
      for (let j = 0; j < ne; j++) { const type = pick(["yawn", "yawn", "distraction", "distraction", "nod", "long_closure", "perclos", "microsleep"]); const level = { yawn: 1, distraction: 2, nod: 2, long_closure: 2, perclos: 2, microsleep: 3 }[type]; evs.push(tag({ t: start + Math.round(rnd(0.05, 0.95) * durationMs), type, level, dur: ri(800, 4000), detail: "", trip: id })); }
      if (evs.filter(e => e.level >= 2).length >= 3) evs.push(tag({ t: start + durationMs - 600000, type: "break", level: 2, dur: 0, detail: "", trip: id }));
      evs.sort((a, b) => a.t - b.t);
      const counts = {}; let maxLevel = 0; evs.forEach(e => { counts[e.type] = (counts[e.type] || 0) + 1; maxLevel = Math.max(maxLevel, e.level); });
      const maxFatigue = ri(5, 55), W = { 1: 2, 2: 6, 3: 15 }, pen = evs.filter(e => e.type !== "break").reduce((s, e) => s + (W[e.level] || 0), 0);
      const safety = Math.max(0, Math.min(100, Math.round(100 - pen / Math.max(1, durationMs / 3600000) - Math.max(0, maxFatigue - 30) * 0.3)));
      trips.push(tag({ id, driver: `${IQ_DEMO_TAG} ${IQ_NAMES[(i % 3) + 15]}`, plate: `ตัวอย่าง ${i % 3 + 1}กข-${1200 + i % 3}`, start, end: start + durationMs, durationMs, counts, total: evs.filter(e => e.type !== "break").length, maxLevel, maxFatigue, maxPerclos: +rnd(0.02, 0.2).toFixed(3), safety, thr: 0.21, baseEar: 0.3, calibrated: true, aborted: false }));
      events.push(...evs);
    }
    appendArr("dr-trips", trips, t => t.start, true);
    appendArr("dr-events", events, e => e.t);
    man.modules.push("dr");
  }

  const prevMan = get(IQ_DEMO_KEY, null);
  if (prevMan) { // รวมกับรายการเดิม (กรณีสร้างเพิ่มหลังลบบางส่วน)
    man.created_keys = [...new Set([...(prevMan.created_keys || []), ...man.created_keys])];
    man.replaced = { ...(prevMan.replaced || {}), ...man.replaced }; man.finger = { ...(prevMan.finger || {}), ...man.finger };
    man.modules = [...new Set([...(prevMan.modules || []), ...man.modules])];
  }
  set[IQ_DEMO_KEY] = JSON.stringify(man);
  return { set, manifest: man, skipped };
}

return { iqRng, IQ_DEMO_TAG, IQ_MENU, IQ_PRODUCTS, IQ_ADS, IQ_NAMES, iqBuildDemo };
});
