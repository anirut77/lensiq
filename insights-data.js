/* insights-data.js — แดชบอร์ดรวม LENSIQ: อ่านและแปลงข้อมูลดิบของทุกระบบ ช่วงเวลา ตัวชี้วัดรวม CSV สำรอง/กู้คืน ลบข้อมูลตัวอย่าง
   ไม่ใช้ DOM จึงทดสอบด้วย Node ได้ · UMD: เบราว์เซอร์ = window.LQInsightsData · Node = require("./insights-data.js") */
(/** @param {any} root */ function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.LQInsightsData = factory();
})(typeof self !== "undefined" ? self : this, function () {
"use strict";

// ================= ส่วนคำนวณ (ไม่ใช้ DOM) =================
const IQ_DAY = 86400000;
const IQ_DEMO_KEY = "iq-demo";
const IQ_EMO = ["neutral", "happy", "surprised", "sad", "angry", "fearful", "disgusted"];
const IQ_VA = { neutral: [0, 0], happy: [0.8, 0.5], surprised: [0.2, 0.85], sad: [-0.7, -0.4], angry: [-0.7, 0.6], fearful: [-0.6, 0.7], disgusted: [-0.7, 0.3] };
const IQ_QC_REASONS = { under: "ระดับน้ำต่ำกว่าเกณฑ์", over: "ระดับน้ำเกินเกณฑ์", nolevel: "ไม่พบระดับน้ำ", capMissing: "ไม่มีฝา", capColor: "สีฝาไม่ถูกต้อง", capTilt: "ฝาเอียง", capHigh: "ฝาปิดไม่สนิท (ยกสูง)", labelMissing: "ไม่มีฉลาก", labelShift: "ฉลากเบี้ยว/ผิดตำแหน่ง" };
const IQ_DR_TYPES = { microsleep: "หลับใน", long_closure: "หลับตานาน", yawn: "หาว", nod: "สัปหงก", distraction: "ละสายตาจากถนน", face_missing: "ไม่พบใบหน้า", perclos: "PERCLOS สูง", break: "แนะนำให้พัก" };

/* ข้อความ: ไทยเป็นค่าเริ่มต้น ; มี LQI18N (lensiq-i18n.js) = แปลตามภาษาที่เลือก — iqT(key, thai, vars) แทน {name} ด้วย vars */
const iqI18N = () => (typeof self !== "undefined" && self.LQI18N) || (typeof globalThis !== "undefined" && globalThis.LQI18N) || null;
const iqFill = (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (v[k] != null ? String(v[k]) : m)) : String(s));
function iqT(key, thai, vars) { const L = iqI18N(); return L && typeof L.tf === "function" ? L.tf(key, thai, vars) : iqFill(thai, vars); }
/** ข้อความไทยที่เป็นคีย์ของตัวเอง (ป้ายสั้น หัวตาราง ชื่อขั้น) — แปลตอนเรียก จึงตามภาษาที่เลือกขณะเรนเดอร์ */
const TN = s => iqT(s, s);
/** ยอดเงินบาทตามภาษา (ไทย ฿1,234 · จีน 1,234 泰铢) */
const iqBaht = v => { const L = iqI18N(), n = Math.round(+v || 0); return L && L.lang === "zh" ? n.toLocaleString("zh-CN") + " 泰铢" : "฿" + n.toLocaleString("th-TH"); };
const iqPad = n => String(n).padStart(2, "0");
const iqDay = (ts = Date.now()) => { const d = new Date(ts); return `${d.getFullYear()}-${iqPad(d.getMonth() + 1)}-${iqPad(d.getDate())}`; };
/** เวลาเริ่มวัน (เที่ยงคืนตามเวลาเครื่อง) ของ key YYYY-MM-DD */
const iqDayStart = key => { const [y, m, d] = key.split("-").map(Number); return new Date(y, m - 1, d).getTime(); };
const iqAddDays = (key, n) => { const d = new Date(iqDayStart(key)); d.setDate(d.getDate() + n); return iqDay(d.getTime()); };
const iqMean = a => a.length ? a.reduce((s, x) => s + x, 0) / a.length : null;
const iqSum = a => a.reduce((s, x) => s + x, 0);
const iqParse = (raw, d = null) => { if (raw == null) return d; try { const v = JSON.parse(raw); return v ?? d; } catch { return d; } };

/* รวมยอดหลายเครื่อง (lensiq-agg.js) — เบราว์เซอร์: window.LQAgg · Node: require ; ไม่มีไฟล์ = ข้ามส่วนนี้ */
const IQ_AGG = typeof LQAgg !== "undefined" ? LQAgg : (typeof require === "function" ? (() => { try { return require("./lensiq-agg.js"); } catch { return null; } })() : null);
/* ตรวจความแม่นยำหน้างาน + คุณภาพภาพรายชั่วโมง (lensiq-sitecheck.js) — เบราว์เซอร์: window.LQSite · Node: require ; ไม่มี = ข้าม */
const IQ_SITE = () => typeof LQSite !== "undefined" ? LQSite : (typeof require === "function" ? (() => { try { return require("./lensiq-sitecheck.js"); } catch { return null; } })() : null);

/** คีย์ localStorage ที่เป็นข้อมูลของระบบในชุดเดโมนี้
   st- ครอบคลุม st-cams / st-cam-<slot> / st-heat-<slot> แล้ว ; สถิติดูดวงเป็นตัวเลขนับแบบไม่ระบุตัวตนจึงระบุชื่อคีย์ตรง ๆ
   ห้ามเพิ่ม fr-leads (ชื่อเล่น+ช่องทางติดต่อ = ข้อมูลส่วนบุคคล), fr-prefs หรือ lq-camcap */
const IQ_FORTUNE_KEYS = ["fr-stats", "palm-stats", "fs-stats", "ic-stats", "zd-stats", "as-stats", "dm-stats"];
function iqIsModuleKey(k) {
  return k === "booth-state" || k === "nm-sessions" || IQ_FORTUNE_KEYS.includes(k) || /^(cx|st|sg|co|att|qc|dr|iq)-/.test(k);
}
const IQ_EL = { wood: "ไม้", fire: "ไฟ", earth: "ดิน", metal: "ทอง", water: "น้ำ" };
const IQ_PALM = { earth: "มือธาตุดิน", air: "มือธาตุลม", fire: "มือธาตุไฟ", water: "มือธาตุน้ำ" };

/* ---------- แปลงข้อมูลดิบของแต่ละระบบให้อยู่ในรูปเดียวกัน ----------
   snap = { key: rawString } (สำเนาของ localStorage) */
function iqCollect(snap) {
  const get = (k, d) => iqParse(snap[k], d);
  const D = {};

  // บูธ (booth.js: booth-state)
  const bs = get("booth-state", null);
  if (bs && Array.isArray(bs.visitors) && bs.visitors.length) {
    D.booth = {
      event: bs.event || {}, demo: !!bs.iqDemo,
      quality: bs.quality && typeof bs.quality === "object" ? bs.quality : null, qualityDay: (bs.event && bs.event.date) || (bs.visitors[0] ? iqDay(bs.visitors[0].first) : ""),
      visitors: bs.visitors.map(v => {
        const frames = v.frames || 0, attRate = frames ? (v.att || 0) / frames : 0, dwell = v.dwell || 0;
        const stopped = dwell >= 5;
        return { t: v.first, dwell, stopped, engaged: stopped && attRate >= 0.5, participant: (v.acts || []).length > 0, valence: frames ? (v.vSum || 0) / frames : 0, returning: (v.visits || 1) > 1 };
      })
    };
  }

  // วิเคราะห์อารมณ์ (neuro.js: nm-sessions)
  const ns = get("nm-sessions", []);
  if (Array.isArray(ns) && ns.length) {
    D.neuro = ns.map(s => {
      const S = s.samples || [], face = S.filter(x => x.face);
      return {
        t: Date.parse(s.date) || 0, test: s.test || "", pid: s.pid || "", demo: !!s.iqDemo,
        valence: iqMean(face.map(x => x.v)), attention: S.length ? S.filter(x => x.att).length / S.length : 0,
        positive: face.length ? face.filter(x => x.v > 0.15).length / face.length : 0
      };
    }).filter(s => s.t);
  }

  // จดจำลูกค้า (customers.js: cx-members, cx-orders)
  const cm = get("cx-members", []), co = get("cx-orders", []);
  if ((Array.isArray(cm) && cm.length) || (Array.isArray(co) && co.length)) {
    D.cx = {
      members: (cm || []).map(m => ({ id: m.id, created: m.created || 0, demo: !!m.iqDemo })),
      orders: (co || []).map(o => ({ t: o.time, mid: o.mid, ticket: o.ticket || o.id, cups: o.qty || 1, amount: (o.price || 0) * (o.qty || 1), name: o.name }))
    };
  }

  // วิเคราะห์หน้าร้าน (store.js: st-day-YYYY-MM-DD)
  // หลายกล้อง (zv 2): byCam = {slot: {name, in, out}} ไม่บังคับ ; โซนคีย์ "<slot>:<id>" ชื่อแสดงเติมชื่อกล้องนำหน้า
  const days = Object.keys(snap).filter(k => /^st-day-\d{4}-\d{2}-\d{2}$/.test(k)).sort().map(k => {
    const d = get(k, {}) || {};
    const byCam = {};
    if (d.byCam && typeof d.byCam === "object") for (const [s, b] of Object.entries(d.byCam)) if (b && typeof b === "object") byCam[s] = { name: String(b.name || s), in: +b.in || 0, out: +b.out || 0 };
    const zones = {};
    for (const [id, z] of Object.entries(d.zones && typeof d.zones === "object" ? d.zones : {})) {
      if (!z || typeof z !== "object") continue;
      const i = id.indexOf(":"), cam = i > 0 ? byCam[id.slice(0, i)] : null;
      zones[id] = { ...z, name: i > 0 && cam && Object.keys(byCam).length > 1 ? `${cam.name} · ${z.name}` : z.name };
    }
    return { day: k.slice(7), in: d.in || 0, out: d.out || 0, peak: d.peak || 0, maxQueue: d.maxQueue || 0, hourlyIn: (d.hourly && d.hourly.in) || [], hourlyOut: (d.hourly && d.hourly.out) || [], zones, byCam, demo: !!d.iqDemo,
      quality: d.quality && typeof d.quality === "object" ? d.quality : null };
  });
  // เชื่อมหลายเครื่อง: st-agg-YYYY-MM-DD = ตัวเลขสรุปจากเครื่องลูก (แคชจากเครื่องหลักหรือไฟล์ที่นำเข้า)
  // รวมเข้ายอดของวันนั้น และเพิ่มเป็นแถวแยก byCam["n:<node>"] ; ไม่มีคีย์นี้ = ยอดเดิมทุกอย่าง
  const aggKeys = IQ_AGG ? Object.keys(snap).filter(k => /^st-agg-\d{4}-\d{2}-\d{2}$/.test(k)).sort() : [];
  for (const k of aggKeys) {
    const date = k.slice(7), packs = IQ_AGG.cachePacks(get(k, null), date);
    if (!packs.length) continue;
    let d = days.find(x => x.day === date);
    if (!d) { d = { day: date, in: 0, out: 0, peak: 0, maxQueue: 0, hourlyIn: [], hourlyOut: [], zones: {}, byCam: {}, demo: false, quality: null }; days.push(d); }
    if (!Object.keys(d.byCam).length && (d.in || d.out)) d.byCam.local = { name: TN("เครื่องหลัก"), in: d.in, out: d.out };
    const M = IQ_AGG.mergeDay({ in: d.in, out: d.out, peak: d.peak, maxQueue: d.maxQueue, hourly: { in: d.hourlyIn, out: d.hourlyOut } }, packs);
    Object.assign(d, { in: M.in, out: M.out, peak: M.peak, maxQueue: M.maxQueue, hourlyIn: M.hourlyIn, hourlyOut: M.hourlyOut, nodes: packs.length });
    for (const p of packs) {
      d.byCam["n:" + p.node] = { name: p.name, in: p.in, out: p.out };
      for (const [zk, z] of Object.entries(p.zones)) d.zones[`n:${p.node}/${zk}`] = { ...z, name: `${p.name} · ${z.name}` };
    }
  }
  days.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0));
  if (days.length) D.store = days;

  // ป้ายโฆษณา (signage.js: sg-stats — สถิติสะสม ไม่แยกรายวัน)
  const sg = get("sg-stats", null);
  if (sg && sg.v === 1 && sg.totals && (sg.totals.ots > 0 || Object.keys(sg.ads || {}).length)) {
    D.sg = {
      since: sg.since || 0, totals: sg.totals, demo: !!sg.iqDemo,
      ads: Object.entries(sg.ads || {}).map(([id, a]) => ({ id, title: a.title || id, viewers: a.viewers || 0, ots: a.ots || 0, plays: a.plays || 0 }))
    };
  }

  // สแกนสินค้า (checkout.js: co-sales)
  const sales = get("co-sales", []);
  if (Array.isArray(sales) && sales.length) D.co = sales.map(o => ({ t: o.t, total: +o.total || 0, qty: o.qty || 0, demo: !!o.iqDemo }));

  // เช็คชื่อ (attendance.js: att-logs)
  const al = get("att-logs", []);
  if (Array.isArray(al) && al.length) D.att = al.map(l => ({ day: l.date, session: l.session || "", demo: !!l.iqDemo }));

  // ตรวจคุณภาพ (qc.js: qc-shift)
  const qs = get("qc-shift", null);
  if (qs && qs.total > 0) D.qc = { start: qs.start, total: qs.total, pass: qs.pass || 0, reject: qs.reject || 0, reasons: qs.reasons || {}, log: (qs.log || []).map(l => ({ t: l.t, pass: !!l.pass, reasons: l.reasons || [] })), demo: !!qs.iqDemo };

  // คนขับ (driver.js: dr-trips, dr-events)
  const tr = get("dr-trips", []), ev = get("dr-events", []);
  if (Array.isArray(tr) && tr.length) D.dr = {
    trips: tr.map(t => ({ t: t.start, safety: t.safety, total: t.total || 0, durationMs: t.durationMs || 0, counts: t.counts || {} })),
    events: (Array.isArray(ev) ? ev : []).map(e => ({ t: e.t, type: e.type, level: e.level }))
  };

  // ดูดวง (faceread.js: fr-stats, palm.js: palm-stats, fengshui.js: fs-stats) — นับครั้งต่อวัน ไม่ระบุตัวตน
  const fortune = (k, catKey) => {
    const v = get(k, null);
    if (!v || typeof v !== "object" || !(v.total > 0)) return null;
    const days = {};
    for (const [d, n] of Object.entries(v.days || {})) if (/^\d{4}-\d{2}-\d{2}$/.test(d) && n > 0) days[d] = +n;
    const cats = {};
    for (const [c, n] of Object.entries(v[catKey] || {})) if (n > 0) cats[c] = +n;
    return { total: +v.total, days, [catKey]: cats };
  };
  const fr = fortune("fr-stats", "el"), palm = fortune("palm-stats", "types"), fs = fortune("fs-stats", "kua");
  if (fr) D.fr = fr;
  if (palm) D.palm = palm;
  if (fs) D.fs = fs;
  // ค่าตั้งหน้าร้าน (st-settings) — ใช้คำนวณเวลารอคิวและระบุโซนแคชเชียร์
  const sts = get("st-settings", null);
  if (sts && typeof sts === "object") D.stCfg = { serviceSec: +sts.serviceSec > 0 ? +sts.serviceSec : 60, maxOcc: +sts.maxOcc > 0 ? +sts.maxOcc : null, cashierZone: String(sts.cashierZone || ""), queueZone: String(sts.queueZone || "") };
  return D;
}

/* ---------- ช่วงเวลา ---------- */
function iqEarliest(D) {
  const ts = [];
  if (D.booth) D.booth.visitors.forEach(v => ts.push(v.t));
  if (D.neuro) D.neuro.forEach(s => ts.push(s.t));
  if (D.cx) D.cx.orders.forEach(o => ts.push(o.t));
  if (D.co) D.co.forEach(o => ts.push(o.t));
  if (D.qc) ts.push(D.qc.start);
  if (D.dr) D.dr.trips.forEach(t => ts.push(t.t));
  const keys = ts.filter(Number.isFinite).map(t => iqDay(t));
  if (D.store) D.store.forEach(d => keys.push(d.day));
  if (D.att) D.att.forEach(l => l.day && keys.push(l.day));
  ["fr", "palm", "fs"].forEach(m => { if (D[m]) keys.push(...Object.keys(D[m].days)); });
  return keys.length ? keys.sort()[0] : null;
}

/** preset: today | d7 | d14 | d30 | d90 | all | custom → { from, to, mode, keys, prev, compare } ; keys = รายวัน (mode hour = รายชั่วโมงของวันเดียว)
   opt = { from, to (custom), compare: "prevTN(" (ช่วงก่อนหน้ายาวเท่ากัน, ค่าเริ่มต้น) | ")weekTN(" (เลื่อนย้อน 7 วัน) | ")none" } */
const IQ_SPANS = { today: 1, d7: 7, d14: 14, d30: 30, d90: 90 };
const IQ_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function iqRange(preset, now, D, opt = {}) {
  let to = iqDay(now), from, span = IQ_SPANS[preset];
  if (preset === "custom" && IQ_DATE_RE.test(opt.from || "") && IQ_DATE_RE.test(opt.to || "")) {
    from = opt.from < opt.to ? opt.from : opt.to; to = opt.from < opt.to ? opt.to : opt.from;
    if (to > iqDay(now)) to = iqDay(now);
    if (from > to) from = to;
  } else if (preset === "custom") preset = "d7", span = 7;
  if (!from) from = span ? iqAddDays(to, -(span - 1)) : (iqEarliest(D || {}) || to);
  if (from > to) from = to;
  const keys = [];
  for (let k = from; k <= to; k = iqAddDays(k, 1)) keys.push(k);
  const n = keys.length, compare = opt.compare === "week" || opt.compare === "none" ? opt.compare : "prev";
  let prev = null;
  if (preset !== "all" && compare === "prev") prev = { from: iqAddDays(from, -n), to: iqAddDays(from, -1) };
  if (preset !== "all" && compare === "week") prev = { from: iqAddDays(from, -7), to: iqAddDays(to, -7) };
  return { preset, from, to, mode: preset === "today" || (preset === "custom" && n === 1) ? "hour" : "day", keys, prev, days: n, compare: prev ? compare : "none" };
}
const iqIn = (day, r) => !!day && day >= r.from && day <= r.to;
const iqInT = (t, r) => Number.isFinite(t) && iqIn(iqDay(t), r);

/* ---------- ตัวชี้วัดรวม ---------- */
function iqMetrics(D, r) {
  const M = {};
  if (D.booth) {
    const V = D.booth.visitors.filter(v => iqInT(v.t, r));
    M.booth = { visitors: V.length, stopped: V.filter(v => v.stopped).length, engaged: V.filter(v => v.engaged).length, participants: V.filter(v => v.participant).length, valence: iqMean(V.map(v => v.valence)) };
  }
  if (D.store) {
    const S = D.store.filter(d => iqIn(d.day, r));
    const byCam = {};
    S.forEach(d => Object.entries(d.byCam || {}).forEach(([s, b]) => { const c = byCam[s] || (byCam[s] = { name: b.name, in: 0, out: 0 }); c.name = b.name; c.in += b.in; c.out += b.out; }));
    M.store = { in: iqSum(S.map(d => d.in)), peak: S.length ? Math.max(...S.map(d => d.peak)) : 0, maxQueue: S.length ? Math.max(...S.map(d => d.maxQueue)) : 0, days: S.filter(d => d.in > 0).length, byCam };
  }
  if (D.sg) M.sg = { viewers: D.sg.totals.viewers || 0, ots: D.sg.totals.ots || 0, attn: D.sg.totals.attn || 0, since: D.sg.since };
  if (D.co) {
    const S = D.co.filter(o => iqInT(o.t, r));
    M.co = { revenue: Math.round(iqSum(S.map(o => o.total)) * 100) / 100, receipts: S.length, items: iqSum(S.map(o => o.qty)) };
  }
  if (D.cx) {
    const O = D.cx.orders.filter(o => iqInT(o.t, r));
    M.cx = { customers: new Set(O.map(o => o.mid)).size, members: D.cx.members.length, revenue: iqSum(O.map(o => o.amount)), cups: iqSum(O.map(o => o.cups)), tickets: new Set(O.map(o => o.ticket)).size };
  }
  if (D.neuro) {
    const S = D.neuro.filter(s => iqInT(s.t, r));
    M.neuro = { sessions: S.length, positive: iqMean(S.map(s => s.positive)), valence: iqMean(S.map(s => s.valence).filter(v => v != null)), attention: iqMean(S.map(s => s.attention)) };
  }
  if (D.att) {
    const L = D.att.filter(l => iqIn(l.day, r));
    M.att = { checkins: L.length, sessions: new Set(L.map(l => l.session + "|" + l.day)).size };
  }
  if (D.qc) {
    // ช่วง "ทั้งหมด" ใช้ยอดรวมของกะ (บันทึกรายขวดเก็บสูงสุด 5,000 รายการ)
    if (r.preset === "all") M.qc = { total: D.qc.total, pass: D.qc.pass, reject: D.qc.reject, reasons: { ...D.qc.reasons } };
    else {
      const L = D.qc.log.filter(l => iqInT(l.t, r)), reasons = {};
      L.forEach(l => { if (!l.pass) l.reasons.forEach(k => { reasons[k] = (reasons[k] || 0) + 1; }); });
      M.qc = { total: L.length, pass: L.filter(l => l.pass).length, reject: L.filter(l => !l.pass).length, reasons };
    }
    M.qc.yield = M.qc.total ? M.qc.pass / M.qc.total : null;
  }
  if (D.dr) {
    const T = D.dr.trips.filter(t => iqInT(t.t, r)), E = D.dr.events.filter(e => iqInT(e.t, r) && e.type !== "break"), byType = {};
    E.forEach(e => { byType[e.type] = (byType[e.type] || 0) + 1; });
    M.dr = { trips: T.length, safety: iqMean(T.map(t => t.safety).filter(Number.isFinite)), events: E.length, byType, hours: iqSum(T.map(t => t.durationMs)) / 3600000 };
  }
  ["fr", "palm", "fs"].forEach(m => {
    if (!D[m]) return;
    const days = Object.entries(D[m].days).filter(([d]) => iqIn(d, r));
    M[m] = { count: iqSum(days.map(([, n]) => n)), total: D[m].total, days: days.length };
  });
  return M;
}

/** การ์ดตัวเลขด้านบน — เฉพาะระบบที่มีข้อมูล ; delta เทียบช่วงก่อนหน้าความยาวเท่ากัน */
function iqKpis(D, r) {
  const M = iqMetrics(D, r), P = r.prev ? iqMetrics(D, { ...r, preset: "prev", from: r.prev.from, to: r.prev.to }) : null;
  const dl = (cur, prev) => (P && prev != null && prev > 0 && cur != null) ? (cur - prev) / prev : null;
  const out = [];
  if (M.booth) out.push({ id: "booth", label: "ผู้เข้าชมบูธ", value: M.booth.visitors, fmt: "int", delta: dl(M.booth.visitors, P?.booth?.visitors), sub: M.booth.visitors ? iqT("iq.kpi.sub.booth", "หยุดชม {p}% · ร่วมกิจกรรม {n} คน", { p: Math.round(M.booth.stopped / M.booth.visitors * 100), n: M.booth.participants }) : TN("ไม่มีผู้เข้าชมในช่วงนี้") });
  if (M.store) out.push({ id: "store", label: "คนเข้าร้าน", value: M.store.in, fmt: "int", delta: dl(M.store.in, P?.store?.in), sub: M.store.in ? iqT("iq.kpi.sub.store", "คนในร้านสูงสุด {p} คน · คิวสูงสุด {q}", { p: M.store.peak, q: M.store.maxQueue }) : TN("ไม่มีข้อมูลในช่วงนี้") });
  if (M.sg) out.push({ id: "sg", label: "ผู้ชมโฆษณา (มองจอ)", value: M.sg.viewers, fmt: "int", delta: null, sub: iqT("iq.kpi.sub.sg", "จาก {n} คนที่ผ่านจอ · ยอดสะสม ไม่แยกรายวัน", { n: M.sg.ots.toLocaleString("th-TH") }), cumulative: true });
  if (M.co) out.push({ id: "co", label: "ยอดขายสแกน", value: M.co.revenue, fmt: "baht", delta: dl(M.co.revenue, P?.co?.revenue), sub: iqT("iq.kpi.sub.co", "{r} ใบเสร็จ · {i} ชิ้น", { r: M.co.receipts.toLocaleString("th-TH"), i: M.co.items.toLocaleString("th-TH") }) });
  if (M.cx) out.push({ id: "cx", label: "ลูกค้าที่จดจำ (มาซื้อ)", value: M.cx.customers, fmt: "int", delta: dl(M.cx.customers, P?.cx?.customers), sub: iqT("iq.kpi.sub.cx2", "สมาชิกทั้งหมด {m} คน · ยอดขาย {v}", { m: M.cx.members, v: iqBaht(M.cx.revenue) }) });
  if (M.neuro) out.push({ id: "neuro", label: "อารมณ์เชิงบวกเฉลี่ย", value: M.neuro.positive, fmt: "pct", delta: null, sub: M.neuro.sessions ? iqT("iq.kpi.sub.neuro", "{n} การทดสอบ · มองจอ {p}%", { n: M.neuro.sessions, p: Math.round((M.neuro.attention || 0) * 100) }) : TN("ไม่มีการทดสอบในช่วงนี้") });
  if (M.att) out.push({ id: "att", label: "ผู้เช็คชื่อ", value: M.att.checkins, fmt: "int", delta: dl(M.att.checkins, P?.att?.checkins), sub: iqT("iq.kpi.sub.att", "{n} รอบอบรม/วัน", { n: M.att.sessions }) });
  if (M.qc) out.push({ id: "qc", label: "อัตราผ่าน QC", value: M.qc.yield, fmt: "pct1", delta: null, sub: iqT("iq.kpi.sub.qc", "ตรวจ {n} ขวด · คัดทิ้ง {r}", { n: M.qc.total.toLocaleString("th-TH"), r: M.qc.reject.toLocaleString("th-TH") }) });
  if (M.dr) out.push({ id: "dr", label: "คะแนนความปลอดภัยคนขับ", value: M.dr.safety, fmt: "score", delta: null, sub: iqT("iq.kpi.sub.dr", "{n} เที่ยว · เหตุการณ์ {e} ครั้ง", { n: M.dr.trips, e: M.dr.events }) });
  return out;
}

/* ---------- อนุกรมเวลา (รายชั่วโมงเมื่อเลือก "วันนี้" ไม่เช่นนั้นรายวัน) ---------- */
function iqBuckets(r) {
  if (r.mode === "hour") return Array.from({ length: 24 }, (_, h) => h);
  return r.keys.slice();
}
function iqBucketOf(t, r) { return r.mode === "hour" ? new Date(t).getHours() : iqDay(t); }

/** metric: booth | store | sales | coRevenue | cxRevenue  → ค่าต่อช่วง เรียงตาม iqBuckets */
function iqSeries(D, r, metric) {
  const B = iqBuckets(r), idx = new Map(B.map((b, i) => [b, i])), vals = B.map(() => 0);
  const add = (t, v = 1) => { if (!iqInT(t, r)) return; const i = idx.get(iqBucketOf(t, r)); if (i != null) vals[i] += v; };
  if (metric === "booth" && D.booth) D.booth.visitors.forEach(v => add(v.t));
  if (metric === "store" && D.store) D.store.forEach(d => {
    if (!iqIn(d.day, r)) return;
    if (r.mode === "hour") d.hourlyIn.forEach((n, h) => { vals[h] += n || 0; });
    else vals[idx.get(d.day)] += d.in;
  });
  if (metric === "sales") {
    if (D.co) D.co.forEach(o => add(o.t));
    if (D.cx) { const seen = new Set(); D.cx.orders.forEach(o => { if (seen.has(o.ticket)) return; seen.add(o.ticket); add(o.t); }); }
  }
  if (metric === "coRevenue" && D.co) D.co.forEach(o => add(o.t, o.total));
  if (metric === "cxRevenue" && D.cx) D.cx.orders.forEach(o => add(o.t, o.amount));
  return vals.map(v => Math.round(v * 100) / 100);
}

/** ตัดชั่วโมงที่ว่างหัวท้าย (เฉพาะโหมดรายชั่วโมง) ให้อยู่ราว 08–20 น. */
function iqTrimHours(buckets, seriesList) {
  let lo = 8, hi = 20;
  buckets.forEach((b, i) => { if (seriesList.some(s => s[i] > 0)) { lo = Math.min(lo, b); hi = Math.max(hi, b); } });
  const keep = buckets.map((b, i) => i).filter(i => buckets[i] >= lo && buckets[i] <= hi);
  return { buckets: keep.map(i => buckets[i]), series: seriesList.map(s => keep.map(i => s[i])) };
}

/* ---------- Funnel: คนผ่าน → หยุดดู → มีส่วนร่วม → ซื้อ (ใช้เฉพาะข้อมูลจริงที่มี) ---------- */
function iqFunnel(D, r) {
  const M = iqMetrics(D, r), all = r.preset === "all";
  const pick = list => list.find(c => c.ok) || null;
  const boothOk = !!(M.booth && M.booth.visitors);
  const steps = [
    { key: "pass", label: TN("คนผ่าน"), src: pick([
      { ok: boothOk, value: M.booth?.visitors, source: TN("วิเคราะห์บูธ"), note: TN("ผู้เข้าชมที่กล้องเห็นอย่างน้อย 1 วินาที"), href: "booth.html" },
      { ok: !!(M.store && M.store.in), value: M.store?.in, source: TN("วิเคราะห์หน้าร้าน"), note: TN("คนเดินข้ามเส้นนับเข้าร้าน"), href: "store.html" },
      { ok: all && !!(M.sg && M.sg.ots), value: M.sg?.ots, source: TN("ป้ายโฆษณา"), note: TN("คนที่อยู่หน้าจอ (ยอดสะสม)"), href: "signage.html" }]) },
    { key: "look", label: TN("หยุดดู"), src: pick([
      { ok: boothOk, value: M.booth?.stopped, source: TN("วิเคราะห์บูธ"), note: TN("หยุดอยู่หน้าบูธตั้งแต่ 5 วินาที"), href: "booth.html" },
      { ok: all && !!(M.sg && M.sg.ots), value: M.sg?.viewers, source: TN("ป้ายโฆษณา"), note: TN("หันมองจอ (ยอดสะสม)"), href: "signage.html" }]) },
    { key: "engage", label: TN("มีส่วนร่วม"), src: pick([
      { ok: boothOk, value: M.booth?.engaged, source: TN("วิเคราะห์บูธ"), note: TN("หยุดชมและหันมองบูธอย่างน้อยครึ่งหนึ่งของเวลา"), href: "booth.html" }]) },
    { key: "buy", label: TN("ซื้อ"), src: pick([
      { ok: !!((M.co && M.co.receipts) || (M.cx && M.cx.tickets)), value: (M.co?.receipts || 0) + (M.cx?.tickets || 0), source: [M.co?.receipts ? TN("สแกนสินค้า") : "", M.cx?.tickets ? TN("จดจำลูกค้า") : ""].filter(Boolean).join(" + "), note: TN("จำนวนบิลขาย"), href: M.co?.receipts ? "checkout.html" : "customers.html" }]) }
  ];
  const have = steps.filter(s => s.src);
  const sources = new Set(have.map(s => s.src.source));
  // อัตราต่อขั้นคิดเฉพาะเมื่อขั้นก่อนหน้ามาจากระบบเดียวกัน (ต่างระบบ = คนละกลุ่มคน เทียบอัตราไม่ได้)
  let prev = null, prevSrc = null;
  steps.forEach(s => {
    if (!s.src) { prev = null; prevSrc = null; return; }
    s.value = s.src.value || 0;
    s.sameAsPrev = prevSrc != null && prevSrc === s.src.source;
    s.crossSource = prevSrc != null && prevSrc !== s.src.source;
    s.ofPrev = s.sameAsPrev && prev > 0 ? s.value / prev : null;
    prev = s.value; prevSrc = s.src.source;
  });
  return { steps, count: have.length, mixed: sources.size > 1, usable: have.length >= 2 };
}

/* ---------- สรุปรายระบบ (สำหรับการ์ดแต่ละระบบ) ---------- */
function iqTopBars(obj, labels = {}, n = 6) {
  return Object.entries(obj).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => ({ label: labels[k] || k, value: v }));
}
function iqModuleBars(D, r, id) {
  const M = iqMetrics(D, r);
  if (id === "sg" && D.sg) return D.sg.ads.filter(a => a.ots || a.viewers).sort((a, b) => b.viewers - a.viewers).slice(0, 6).map(a => ({ label: a.title, value: a.viewers, sub: iqT("iq.bar.sg", "ผ่านจอ {o} · เล่น {p} ครั้ง", { o: a.ots, p: a.plays }) }));
  if (id === "neuro" && D.neuro) return D.neuro.filter(s => iqInT(s.t, r)).sort((a, b) => b.t - a.t).slice(0, 6).map(s => ({ label: `${s.test} (${s.pid})`, value: s.positive, sub: iqT("iq.bar.neuro", "ค่าอารมณ์ {v}", { v: s.valence == null ? "–" : (s.valence > 0 ? "+" : "") + s.valence.toFixed(2) }) }));
  if (id === "att" && D.att) { const c = {}; D.att.filter(l => iqIn(l.day, r)).forEach(l => { const k = l.session + " · " + l.day; c[k] = (c[k] || 0) + 1; }); return iqTopBars(c); }
  if (id === "qc" && M.qc) return iqTopBars(M.qc.reasons, IQ_QC_REASONS);
  if (id === "dr" && M.dr) return iqTopBars(M.dr.byType, IQ_DR_TYPES);
  if (id === "store" && M.store) {
    const cams = Object.values(M.store.byCam);
    if (cams.length > 1) return cams.filter(c => c.in || c.out).sort((a, b) => b.in - a.in).map(c => ({ label: c.name, value: c.in, sub: iqT("iq.bar.out", "ออก {n}", { n: c.out }) }));
    return [];
  }
  if (id === "fr" && D.fr) return iqTopBars(D.fr.el, IQ_EL);
  if (id === "palm" && D.palm) return iqTopBars(D.palm.types, IQ_PALM);
  if (id === "fs" && D.fs) { const L = {}; Object.keys(D.fs.kua).forEach(k => { L[k] = iqT("iq.kua", "เลขกัว {k}", { k }); }); return iqTopBars(D.fs.kua, L); }
  return [];
}

/* ---------- CSV สรุปรวม ---------- */
function iqCsvCell(v) { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function iqCsv(D, r) {
  const rows = [[TN("วันที่"), TN("ผู้เข้าชมบูธ"), TN("หยุดชมบูธ"), TN("มีส่วนร่วมบูธ"), TN("คนเข้าร้าน"), TN("ใบเสร็จสแกน"), TN("ยอดขายสแกน (บาท)"), TN("บิลลูกค้าที่จดจำ"), TN("ยอดขายลูกค้าที่จดจำ (บาท)"), TN("ลูกค้าที่จดจำมาซื้อ"), TN("การทดสอบอารมณ์"), TN("อารมณ์เชิงบวกเฉลี่ย (%)"), TN("ผู้เช็คชื่อ"), TN("QC ตรวจ"), TN("QC ผ่าน"), TN("เที่ยววิ่ง"), TN("เหตุการณ์คนขับ"), TN("ชั่วโมงที่ภาพมีปัญหา (ยอดอาจคลาดเคลื่อน)")]];
  const F = iqFlagged(D, r);
  const val = (x, f = v => v) => x == null ? "" : f(x);
  r.keys.forEach(day => {
    const M = iqMetrics(D, { ...r, preset: "day", from: day, to: day });
    const hasAny = (M.booth?.visitors || M.store?.in || M.co?.receipts || M.cx?.tickets || M.neuro?.sessions || M.att?.checkins || M.qc?.total || M.dr?.trips);
    if (!hasAny) return;
    rows.push([day, val(M.booth?.visitors), val(M.booth?.stopped), val(M.booth?.engaged), val(M.store?.in), val(M.co?.receipts), val(M.co?.revenue, v => v.toFixed(2)),
      val(M.cx?.tickets), val(M.cx?.revenue, v => v.toFixed(2)), val(M.cx?.customers), val(M.neuro?.sessions), M.neuro?.sessions ? (M.neuro.positive * 100).toFixed(1) : "",
      val(M.att?.checkins), val(M.qc?.total), val(M.qc?.pass), val(M.dr?.trips), val(M.dr?.events),
      F.filter(f => f.day === day).map(f => (f.src === "booth" ? TN("บูธ") + " " : "") + iqPad(f.h) + ":00").join(" ")]);
  });
  const T = iqMetrics(D, r);
  rows.push([], [TN("รวมช่วงที่เลือก"), iqT("iq.csv.span", "{a} ถึง {b}", { a: r.from, b: r.to })]);
  iqKpis(D, r).forEach(k => rows.push([TN(k.label), k.value == null ? "" : (k.fmt === "pct" || k.fmt === "pct1" ? (k.value * 100).toFixed(1) + "%" : k.fmt === "score" ? k.value.toFixed(0) : k.value), k.sub]));
  if (T.sg) rows.push([], [iqT("iq.csv.sg", "ป้ายโฆษณา (ยอดสะสมตั้งแต่ {d})", { d: new Date(T.sg.since).toISOString().slice(0, 10) })], [TN("ผ่านหน้าจอ"), T.sg.ots], [TN("มองจอ"), T.sg.viewers], [TN("เวลามองรวม (วินาที)"), T.sg.attn.toFixed(1)]);
  return "﻿" + rows.map(r => r.map(iqCsvCell).join(",")).join("\r\n");
}

/** มีข้อมูลตัวอย่างค้างอยู่ไหม */
function iqHasDemo(snap) {
  if (snap[IQ_DEMO_KEY] != null) return true;
  return Object.keys(snap).some(k => iqIsModuleKey(k) && typeof snap[k] === "string" && snap[k].includes('"iqDemo":true'));
}

/* ลบข้อมูลตัวอย่าง: รายการในอาร์เรย์ลบตามเครื่องหมาย iqDemo ; คีย์ที่เป็นออบเจ็กต์เดียวลบ/คืนค่าเดิมเฉพาะเมื่อยังไม่ถูกแก้ไข
   คืน { set, remove, kept } */
const IQ_HEAT_RE = /^st-heat(-c[1-4])?$/;
function iqRemoveDemo(snap) {
  const man = iqParse(snap[IQ_DEMO_KEY], {}) || {}, created = new Set(man.created_keys || []), set = {}, remove = [], kept = [];
  const restore = k => { if (man.replaced && man.replaced[k] != null) set[k] = man.replaced[k]; else remove.push(k); };
  ["nm-sessions", "cx-members", "cx-orders", "co-sales", "att-logs", "dr-trips", "dr-events"].forEach(k => {
    const a = iqParse(snap[k], null);
    if (!Array.isArray(a) || !a.some(x => x && x.iqDemo)) return;
    const rest = a.filter(x => !(x && x.iqDemo));
    if (!rest.length && created.has(k)) remove.push(k); else set[k] = JSON.stringify(rest);
  });
  const unchanged = (k, v) => {
    const f = (man.finger || {})[k];
    if (k === "booth-state") return v.iqDemo && (!f || v.visitors.length === f.n);
    if (k === "sg-stats") return v.iqDemo && (!f || v.totals.ots === f.ots);
    if (k === "qc-shift") return v.iqDemo && (!f || v.total === f.total);
    if (k.startsWith("st-day-")) return v.iqDemo && (!f || (v.in === f.in && v.out === f.out));
    if (IQ_HEAT_RE.test(k)) return Array.isArray(v) && f && Math.abs(Math.round(iqSum(v)) - f.sum) <= 2;
    return false;
  };
  // ฮีตแมป: st-heat (รุ่นเก่า) และ st-heat-<slot> — ลบเฉพาะที่ตัวอย่างสร้างขึ้น
  const singles = Object.keys(snap).filter(k => k === "booth-state" || k === "sg-stats" || k === "qc-shift" || k.startsWith("st-day-") || (IQ_HEAT_RE.test(k) && created.has(k)));
  singles.forEach(k => {
    const v = iqParse(snap[k], null);
    if (!v) return;
    const isDemo = IQ_HEAT_RE.test(k) ? true : !!v.iqDemo;
    if (!isDemo) return;
    if (unchanged(k, v)) restore(k);
    else kept.push(k);
  });
  remove.push(IQ_DEMO_KEY);
  return { set, remove, kept };
}

/* ---------- คุณภาพภาพรายชั่วโมง (round 10): ชั่วโมงที่กล้องมีปัญหา ≥ 5 นาที ---------- */
/** -> [{src: "store"|"booth", day, h, sec: {shake, dark, …}, min}] ในช่วง r (ไม่มีข้อมูลคุณภาพ = []) */
function iqFlagged(D, r) {
  const S = IQ_SITE(), out = [];
  if (!S) return out;
  if (D.store) D.store.forEach(d => { if (d.quality && iqIn(d.day, r)) S.flaggedHours(d.quality).forEach(f => out.push({ src: "store", day: d.day, ...f })); });
  if (D.booth && D.booth.quality && D.booth.qualityDay && iqIn(D.booth.qualityDay, r)) S.flaggedHours(D.booth.quality).forEach(f => out.push({ src: "booth", day: D.booth.qualityDay, ...f }));
  return out.sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : a.h - b.h));
}
/**
 * มุมมองที่ "ไม่นับชั่วโมงที่ภาพมีปัญหา": คืนสำเนาของ D ที่ตัดยอดหน้าร้านในชั่วโมงนั้น (hourly + ยอดรวมวัน) และผู้เข้าชมบูธที่มาถึง
 * ในชั่วโมงนั้นออก — ข้อมูลที่เก็บไว้ไม่ถูกแก้ (สำเนาเท่านั้น) · คืน {D, removed: {store, booth}}
 */
function iqExcludeFlagged(D, r) {
  const F = iqFlagged(D, { ...r, preset: "all", from: "0000-00-00", to: "9999-99-99" });
  const out = { ...D }, removed = { store: 0, booth: 0 };
  if (D.store) out.store = D.store.map(d => {
    const hs = F.filter(f => f.src === "store" && f.day === d.day).map(f => f.h);
    if (!hs.length) return d;
    const hin = d.hourlyIn.slice(), hout = d.hourlyOut.slice(); let din = 0, dout = 0;
    hs.forEach(h => { din += hin[h] || 0; dout += hout[h] || 0; hin[h] = 0; hout[h] = 0; });
    removed.store += din;
    return { ...d, in: Math.max(0, d.in - din), out: Math.max(0, d.out - dout), hourlyIn: hin, hourlyOut: hout, excludedHours: hs };
  });
  if (D.booth) {
    const hs = new Set(F.filter(f => f.src === "booth").map(f => f.day + "|" + f.h));
    if (hs.size) {
      const V = D.booth.visitors.filter(v => !hs.has(iqDay(v.t) + "|" + new Date(v.t).getHours()));
      removed.booth = D.booth.visitors.length - V.length;
      out.booth = { ...D.booth, visitors: V };
    }
  }
  return { D: out, removed };
}
/** ผลตรวจความแม่นยำหน้างานล่าสุดต่อกล้อง (อ่านอย่างเดียว) จาก localStorage หรือ snapshot — ดู LQSite.latestByCamera */
function iqAccuracy(src) { const S = IQ_SITE(); return S ? S.latestByCamera(src) : []; }

/* ---------- สำรอง/กู้คืน ---------- */
function iqBackup(snap, idb = {}, now = Date.now()) {
  const ls = {};
  Object.keys(snap).filter(iqIsModuleKey).sort().forEach(k => { ls[k] = snap[k]; });
  return { format: "lensiq-backup", version: 1, exportedAt: new Date(now).toISOString(), localStorage: ls, indexedDB: idb };
}
/** ตรวจไฟล์สำรอง คืน { ok, error?, keys, idbStores } */
function iqValidateBackup(obj) {
  if (!obj || typeof obj !== "object" || obj.format !== "lensiq-backup") return { ok: false, error: TN("ไม่ใช่ไฟล์สำรองของ LENSIQ") };
  if (!obj.localStorage || typeof obj.localStorage !== "object") return { ok: false, error: TN("ไฟล์ไม่มีส่วนข้อมูล localStorage") };
  const keys = Object.keys(obj.localStorage).filter(k => iqIsModuleKey(k) && typeof obj.localStorage[k] === "string");
  const idb = obj.indexedDB && obj.indexedDB["co-checkout"];
  return { ok: true, keys, idbStores: idb ? Object.keys(idb).filter(s => s === "products" || s === "samples") : [] };
}

return { iqT, TN, IQ_DAY, IQ_DEMO_KEY, IQ_EMO, IQ_VA, IQ_QC_REASONS, IQ_DR_TYPES, iqPad, iqDay, iqDayStart, iqAddDays, iqMean, iqSum, iqParse, IQ_AGG, IQ_FORTUNE_KEYS, iqIsModuleKey, IQ_EL, IQ_PALM, iqCollect, iqEarliest, IQ_SPANS, IQ_DATE_RE, iqRange, iqIn, iqInT, iqMetrics, iqKpis, iqBuckets, iqBucketOf, iqSeries, iqTrimHours, iqFunnel, iqTopBars, iqModuleBars, iqCsvCell, iqCsv, iqHasDemo, IQ_HEAT_RE, iqRemoveDemo, iqBackup, iqValidateBackup, iqFlagged, iqExcludeFlagged, iqAccuracy };
});
