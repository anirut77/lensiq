/* แดชบอร์ดรวม LENSIQ — อ่านข้อมูลจากทุกระบบที่เก็บไว้ในเบราว์เซอร์นี้ (localStorage / IndexedDB) แล้วสรุปรวม
   ไม่ส่งข้อมูลออกนอกเครื่อง ส่วนคำนวณด้านบนไม่ใช้ DOM จึงทดสอบด้วย Node ได้ */

// ================= ส่วนคำนวณ (ไม่ใช้ DOM) =================
const IQ_DAY = 86400000;
const IQ_DEMO_KEY = "iq-demo";
const IQ_EMO = ["neutral", "happy", "surprised", "sad", "angry", "fearful", "disgusted"];
const IQ_VA = { neutral: [0, 0], happy: [0.8, 0.5], surprised: [0.2, 0.85], sad: [-0.7, -0.4], angry: [-0.7, 0.6], fearful: [-0.6, 0.7], disgusted: [-0.7, 0.3] };
const IQ_QC_REASONS = { under: "ระดับน้ำต่ำกว่าเกณฑ์", over: "ระดับน้ำเกินเกณฑ์", nolevel: "ไม่พบระดับน้ำ", capMissing: "ไม่มีฝา", capColor: "สีฝาไม่ถูกต้อง", capTilt: "ฝาเอียง", capHigh: "ฝาปิดไม่สนิท (ยกสูง)", labelMissing: "ไม่มีฉลาก", labelShift: "ฉลากเบี้ยว/ผิดตำแหน่ง" };
const IQ_DR_TYPES = { microsleep: "หลับใน", long_closure: "หลับตานาน", yawn: "หาว", nod: "สัปหงก", distraction: "ละสายตาจากถนน", face_missing: "ไม่พบใบหน้า", perclos: "PERCLOS สูง", break: "แนะนำให้พัก" };

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
    return { day: k.slice(7), in: d.in || 0, out: d.out || 0, peak: d.peak || 0, maxQueue: d.maxQueue || 0, hourlyIn: (d.hourly && d.hourly.in) || [], hourlyOut: (d.hourly && d.hourly.out) || [], zones, byCam, demo: !!d.iqDemo };
  });
  // เชื่อมหลายเครื่อง: st-agg-YYYY-MM-DD = ตัวเลขสรุปจากเครื่องลูก (แคชจากเครื่องหลักหรือไฟล์ที่นำเข้า)
  // รวมเข้ายอดของวันนั้น และเพิ่มเป็นแถวแยก byCam["n:<node>"] ; ไม่มีคีย์นี้ = ยอดเดิมทุกอย่าง
  const aggKeys = IQ_AGG ? Object.keys(snap).filter(k => /^st-agg-\d{4}-\d{2}-\d{2}$/.test(k)).sort() : [];
  for (const k of aggKeys) {
    const date = k.slice(7), packs = IQ_AGG.cachePacks(get(k, null), date);
    if (!packs.length) continue;
    let d = days.find(x => x.day === date);
    if (!d) { d = { day: date, in: 0, out: 0, peak: 0, maxQueue: 0, hourlyIn: [], hourlyOut: [], zones: {}, byCam: {}, demo: false }; days.push(d); }
    if (!Object.keys(d.byCam).length && (d.in || d.out)) d.byCam.local = { name: "เครื่องหลัก", in: d.in, out: d.out };
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
   opt = { from, to (custom), compare: "prev" (ช่วงก่อนหน้ายาวเท่ากัน, ค่าเริ่มต้น) | "week" (เลื่อนย้อน 7 วัน) | "none" } */
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
  if (M.booth) out.push({ id: "booth", label: "ผู้เข้าชมบูธ", value: M.booth.visitors, fmt: "int", delta: dl(M.booth.visitors, P?.booth?.visitors), sub: M.booth.visitors ? `หยุดชม ${Math.round(M.booth.stopped / M.booth.visitors * 100)}% · ร่วมกิจกรรม ${M.booth.participants} คน` : "ไม่มีผู้เข้าชมในช่วงนี้" });
  if (M.store) out.push({ id: "store", label: "คนเข้าร้าน", value: M.store.in, fmt: "int", delta: dl(M.store.in, P?.store?.in), sub: M.store.in ? `คนในร้านสูงสุด ${M.store.peak} คน · คิวสูงสุด ${M.store.maxQueue}` : "ไม่มีข้อมูลในช่วงนี้" });
  if (M.sg) out.push({ id: "sg", label: "ผู้ชมโฆษณา (มองจอ)", value: M.sg.viewers, fmt: "int", delta: null, sub: `จาก ${M.sg.ots.toLocaleString("th-TH")} คนที่ผ่านจอ · ยอดสะสม ไม่แยกรายวัน`, cumulative: true });
  if (M.co) out.push({ id: "co", label: "ยอดขายสแกน", value: M.co.revenue, fmt: "baht", delta: dl(M.co.revenue, P?.co?.revenue), sub: `${M.co.receipts.toLocaleString("th-TH")} ใบเสร็จ · ${M.co.items.toLocaleString("th-TH")} ชิ้น` });
  if (M.cx) out.push({ id: "cx", label: "ลูกค้าที่จดจำ (มาซื้อ)", value: M.cx.customers, fmt: "int", delta: dl(M.cx.customers, P?.cx?.customers), sub: `สมาชิกทั้งหมด ${M.cx.members} คน · ยอดขาย ฿${Math.round(M.cx.revenue).toLocaleString("th-TH")}` });
  if (M.neuro) out.push({ id: "neuro", label: "อารมณ์เชิงบวกเฉลี่ย", value: M.neuro.positive, fmt: "pct", delta: null, sub: M.neuro.sessions ? `${M.neuro.sessions} การทดสอบ · มองจอ ${Math.round((M.neuro.attention || 0) * 100)}%` : "ไม่มีการทดสอบในช่วงนี้" });
  if (M.att) out.push({ id: "att", label: "ผู้เช็คชื่อ", value: M.att.checkins, fmt: "int", delta: dl(M.att.checkins, P?.att?.checkins), sub: `${M.att.sessions} รอบอบรม/วัน` });
  if (M.qc) out.push({ id: "qc", label: "อัตราผ่าน QC", value: M.qc.yield, fmt: "pct1", delta: null, sub: `ตรวจ ${M.qc.total.toLocaleString("th-TH")} ขวด · คัดทิ้ง ${M.qc.reject.toLocaleString("th-TH")}` });
  if (M.dr) out.push({ id: "dr", label: "คะแนนความปลอดภัยคนขับ", value: M.dr.safety, fmt: "score", delta: null, sub: `${M.dr.trips} เที่ยว · เหตุการณ์ ${M.dr.events} ครั้ง` });
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
    { key: "pass", label: "คนผ่าน", src: pick([
      { ok: boothOk, value: M.booth?.visitors, source: "วิเคราะห์บูธ", note: "ผู้เข้าชมที่กล้องเห็นอย่างน้อย 1 วินาที", href: "booth.html" },
      { ok: !!(M.store && M.store.in), value: M.store?.in, source: "วิเคราะห์หน้าร้าน", note: "คนเดินข้ามเส้นนับเข้าร้าน", href: "store.html" },
      { ok: all && !!(M.sg && M.sg.ots), value: M.sg?.ots, source: "ป้ายโฆษณา", note: "คนที่อยู่หน้าจอ (ยอดสะสม)", href: "signage.html" }]) },
    { key: "look", label: "หยุดดู", src: pick([
      { ok: boothOk, value: M.booth?.stopped, source: "วิเคราะห์บูธ", note: "หยุดอยู่หน้าบูธตั้งแต่ 5 วินาที", href: "booth.html" },
      { ok: all && !!(M.sg && M.sg.ots), value: M.sg?.viewers, source: "ป้ายโฆษณา", note: "หันมองจอ (ยอดสะสม)", href: "signage.html" }]) },
    { key: "engage", label: "มีส่วนร่วม", src: pick([
      { ok: boothOk, value: M.booth?.engaged, source: "วิเคราะห์บูธ", note: "หยุดชมและหันมองบูธอย่างน้อยครึ่งหนึ่งของเวลา", href: "booth.html" }]) },
    { key: "buy", label: "ซื้อ", src: pick([
      { ok: !!((M.co && M.co.receipts) || (M.cx && M.cx.tickets)), value: (M.co?.receipts || 0) + (M.cx?.tickets || 0), source: [M.co?.receipts ? "สแกนสินค้า" : "", M.cx?.tickets ? "จดจำลูกค้า" : ""].filter(Boolean).join(" + "), note: "จำนวนบิลขาย", href: M.co?.receipts ? "checkout.html" : "customers.html" }]) }
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
  if (id === "sg" && D.sg) return D.sg.ads.filter(a => a.ots || a.viewers).sort((a, b) => b.viewers - a.viewers).slice(0, 6).map(a => ({ label: a.title, value: a.viewers, sub: `ผ่านจอ ${a.ots} · เล่น ${a.plays} ครั้ง` }));
  if (id === "neuro" && D.neuro) return D.neuro.filter(s => iqInT(s.t, r)).sort((a, b) => b.t - a.t).slice(0, 6).map(s => ({ label: `${s.test} (${s.pid})`, value: s.positive, sub: `ค่าอารมณ์ ${s.valence == null ? "–" : (s.valence > 0 ? "+" : "") + s.valence.toFixed(2)}` }));
  if (id === "att" && D.att) { const c = {}; D.att.filter(l => iqIn(l.day, r)).forEach(l => { const k = l.session + " · " + l.day; c[k] = (c[k] || 0) + 1; }); return iqTopBars(c); }
  if (id === "qc" && M.qc) return iqTopBars(M.qc.reasons, IQ_QC_REASONS);
  if (id === "dr" && M.dr) return iqTopBars(M.dr.byType, IQ_DR_TYPES);
  if (id === "store" && M.store) {
    const cams = Object.values(M.store.byCam);
    if (cams.length > 1) return cams.filter(c => c.in || c.out).sort((a, b) => b.in - a.in).map(c => ({ label: c.name, value: c.in, sub: `ออก ${c.out}` }));
    return [];
  }
  if (id === "fr" && D.fr) return iqTopBars(D.fr.el, IQ_EL);
  if (id === "palm" && D.palm) return iqTopBars(D.palm.types, IQ_PALM);
  if (id === "fs" && D.fs) { const L = {}; Object.keys(D.fs.kua).forEach(k => { L[k] = "เลขกัว " + k; }); return iqTopBars(D.fs.kua, L); }
  return [];
}

/* ---------- CSV สรุปรวม ---------- */
function iqCsvCell(v) { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v) && isNaN(+v)) v = "'" + v; return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; }
function iqCsv(D, r) {
  const rows = [["วันที่", "ผู้เข้าชมบูธ", "หยุดชมบูธ", "มีส่วนร่วมบูธ", "คนเข้าร้าน", "ใบเสร็จสแกน", "ยอดขายสแกน (บาท)", "บิลลูกค้าที่จดจำ", "ยอดขายลูกค้าที่จดจำ (บาท)", "ลูกค้าที่จดจำมาซื้อ", "การทดสอบอารมณ์", "อารมณ์เชิงบวกเฉลี่ย (%)", "ผู้เช็คชื่อ", "QC ตรวจ", "QC ผ่าน", "เที่ยววิ่ง", "เหตุการณ์คนขับ"]];
  const val = (x, f = v => v) => x == null ? "" : f(x);
  r.keys.forEach(day => {
    const M = iqMetrics(D, { ...r, preset: "day", from: day, to: day });
    const hasAny = (M.booth?.visitors || M.store?.in || M.co?.receipts || M.cx?.tickets || M.neuro?.sessions || M.att?.checkins || M.qc?.total || M.dr?.trips);
    if (!hasAny) return;
    rows.push([day, val(M.booth?.visitors), val(M.booth?.stopped), val(M.booth?.engaged), val(M.store?.in), val(M.co?.receipts), val(M.co?.revenue, v => v.toFixed(2)),
      val(M.cx?.tickets), val(M.cx?.revenue, v => v.toFixed(2)), val(M.cx?.customers), val(M.neuro?.sessions), M.neuro?.sessions ? (M.neuro.positive * 100).toFixed(1) : "",
      val(M.att?.checkins), val(M.qc?.total), val(M.qc?.pass), val(M.dr?.trips), val(M.dr?.events)]);
  });
  const T = iqMetrics(D, r);
  rows.push([], ["รวมช่วงที่เลือก", `${r.from} ถึง ${r.to}`]);
  iqKpis(D, r).forEach(k => rows.push([k.label, k.value == null ? "" : (k.fmt === "pct" || k.fmt === "pct1" ? (k.value * 100).toFixed(1) + "%" : k.fmt === "score" ? k.value.toFixed(0) : k.value), k.sub]));
  if (T.sg) rows.push([], ["ป้ายโฆษณา (ยอดสะสมตั้งแต่ " + new Date(T.sg.since).toISOString().slice(0, 10) + ")"], ["ผ่านหน้าจอ", T.sg.ots], ["มองจอ", T.sg.viewers], ["เวลามองรวม (วินาที)", T.sg.attn.toFixed(1)]);
  return "﻿" + rows.map(r => r.map(iqCsvCell).join(",")).join("\r\n");
}

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

  // --- วิเคราะห์อารมณ์: 16 การทดสอบ (ฉลากสีฟ้า vs ฉลากสีทอง คนละ 5 คน = ชุด A/B)
  const ns = get("nm-sessions", []);
  if (!Array.isArray(ns) || !ns.some(s => s.iqDemo)) {
    const tests = [["บรรจุภัณฑ์ใหม่ ฉลากสีฟ้า", "image", 10, 0.32, 5], ["บรรจุภัณฑ์ใหม่ ฉลากสีทอง", "image", 10, 0.04, 5], ["โฆษณา Matcha Fizz 20 วิ", "video", 20, 0.3, 3], ["โฆษณา Signature Latte", "video", 18, 0.12, 3]];
    const sessions = []; let si = 0;
    tests.forEach(([name, type, dur, mood, reps], ti) => { for (let rep = 0; rep < reps; rep++) {
      const i = si++, date = new Date(now - (20 - i) * IQ_DAY - ri(1, 6) * 3600000).toISOString(), samples = [], m0 = mood + rnd(-0.08, 0.08);
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

/* ---------- สำรอง/กู้คืน ---------- */
function iqBackup(snap, idb = {}, now = Date.now()) {
  const ls = {};
  Object.keys(snap).filter(iqIsModuleKey).sort().forEach(k => { ls[k] = snap[k]; });
  return { format: "lensiq-backup", version: 1, exportedAt: new Date(now).toISOString(), localStorage: ls, indexedDB: idb };
}
/** ตรวจไฟล์สำรอง คืน { ok, error?, keys, idbStores } */
function iqValidateBackup(obj) {
  if (!obj || typeof obj !== "object" || obj.format !== "lensiq-backup") return { ok: false, error: "ไม่ใช่ไฟล์สำรองของ LENSIQ" };
  if (!obj.localStorage || typeof obj.localStorage !== "object") return { ok: false, error: "ไฟล์ไม่มีส่วนข้อมูล localStorage" };
  const keys = Object.keys(obj.localStorage).filter(k => iqIsModuleKey(k) && typeof obj.localStorage[k] === "string");
  const idb = obj.indexedDB && obj.indexedDB["co-checkout"];
  return { ok: true, keys, idbStores: idb ? Object.keys(idb).filter(s => s === "products" || s === "samples") : [] };
}

/* ================= การวิเคราะห์เชิงสถิติ + แปลผลภาษาไทย (ไม่ใช้ DOM) =================
   ใช้ lensiq-stats.js (LQStats) ; ทุกข้อความสร้างจากตัวเลขที่คำนวณได้จริงเท่านั้น ข้อมูลไม่พอ = บอกตรง ๆ ว่า "ข้อมูลยังน้อย" */
const IQ_ST = typeof LQStats !== "undefined" ? LQStats : (typeof require === "function" ? require("./lensiq-stats.js") : null);
const IQ_WD = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
const IQ_MIN_DAYS = 7;
const IQ_CASH_RE = /แคชเชียร์|cashier|ชำระ|จ่ายเงิน|เคาน์เตอร์/i;
const iqFin = x => typeof x === "number" && Number.isFinite(x);
const iqN = (v, d = 0) => iqFin(v) ? v.toLocaleString("th-TH", { maximumFractionDigits: d, minimumFractionDigits: 0 }) : "–";
const iqP = (v, d = 0) => iqFin(v) ? (v * 100).toFixed(d) + "%" : "–";
/** เปลี่ยนแปลงเป็นข้อความ เช่น "+12%" ; น้อยกว่า 1% = "ไม่ถึง 1%" */
const iqChg = v => !iqFin(v) ? "–" : Math.abs(v) < 0.005 ? "ไม่ถึง 1%" : (v > 0 ? "+" : "−") + Math.abs(Math.round(v * 100)) + "%";
const iqPts = v => !iqFin(v) ? "–" : (v > 0 ? "+" : v < 0 ? "−" : "") + Math.abs(v * 100).toFixed(1) + " จุด";
const iqB = v => iqFin(v) ? "฿" + Math.round(v).toLocaleString("th-TH") : "–";
const iqDL = key => new Date(iqDayStart(key)).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
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
  /** เทียบจำนวนนับช่วงนี้กับช่วงเทียบ (ปรับตามจำนวนวันที่มีข้อมูล) */
  const countTest = arr => {
    if (!r.prev) return null;
    const c1 = tot(arr, r.from, r.to), e1 = expo(arr, r.from, r.to), c2 = tot(arr, r.prev.from, r.prev.to), e2 = expo(arr, r.prev.from, r.prev.to);
    if (!(e1 > 0 && e2 > 0)) return null;
    const t = S.poissonTest(c1, e1, c2, e2); if (!t) return null;
    const enough = !A.short && (c1 + c2) >= 10;
    return { ...t, cur: c1, prev: c2, e1, e2, level: S.confLevel(t.p, enough), enough };
  };
  const rateTest = (xa, na) => {
    if (!r.prev) return null;
    const x1 = tot(xa, r.from, r.to), n1 = tot(na, r.from, r.to), x2 = tot(xa, r.prev.from, r.prev.to), n2 = tot(na, r.prev.from, r.prev.to);
    if (!(n1 > 0 && n2 > 0) || x1 > n1 || x2 > n2) return null;
    const t = S.twoProp(x1, n1, x2, n2); if (!t) return null;
    const enough = !A.short && n1 >= 30 && n2 >= 30;
    return { ...t, change: t.p2 > 0 ? t.diff / t.p2 : null, level: S.confLevel(t.p, enough), enough };
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
    if (k.id === "store") { k.test = countTest(H.storeIn); const ci = S.meanCI(iqWin(H, H.storeIn, r.from, fullEnd)); if (ci && ci.lo != null && ci.n >= 3) k.ci = { text: `เฉลี่ย ${iqN(ci.mean)}/วัน (95%: ${iqN(Math.max(0, ci.lo))}–${iqN(ci.hi)})` }; }
    if (k.id === "booth") k.test = countTest(H.booth);
    if (k.id === "att") k.test = countTest(H.att);
    if (k.id === "co" || k.id === "cx") {
      const t = countTest(H.bills); k.test = t ? { ...t, what: "จำนวนบิล" } : null;
      const ci = S.meanCI(iqWin(H, H.revenue, r.from, fullEnd)); if (ci && ci.lo != null && ci.n >= 3 && k.id === "co") k.ci = { text: `ยอดรวมทุกช่องทางเฉลี่ย ${iqB(ci.mean)}/วัน (95%: ${iqB(Math.max(0, ci.lo))}–${iqB(ci.hi)})` };
    }
    if (k.id === "qc") { const M = iqMetrics(D, r).qc, w = M && M.total ? S.wilson(M.pass, M.total) : null; if (w) k.ci = { text: `95%: ${iqP(w.lo, 1)}–${iqP(w.hi, 1)}` }; }
    if (k.id === "sg" && D.sg) { const w = S.wilson(Math.min(D.sg.totals.viewers || 0, D.sg.totals.ots || 0), D.sg.totals.ots || 0); if (w) k.ci = { text: `อัตรามอง ${iqP(w.p)} (95%: ${iqP(w.lo)}–${iqP(w.hi)})` }; }
    if (k.id === "dr" && D.dr) { const ci = S.meanCI(D.dr.trips.filter(t => iqInT(t.t, r)).map(t => t.safety)); if (ci && ci.lo != null && ci.n >= 3) k.ci = { text: `95%: ${iqN(Math.max(0, ci.lo))}–${iqN(Math.min(100, ci.hi))}` }; }
    if (k.id === "neuro" && D.neuro) { const ci = S.meanCI(D.neuro.filter(s => iqInT(s.t, r)).map(s => s.positive)); if (ci && ci.lo != null && ci.n >= 3) k.ci = { text: `95%: ${iqP(Math.max(0, ci.lo))}–${iqP(Math.min(1, ci.hi))}` }; }
    // ยอดขาย: ตัวเลขเทียบเป็นยอดเงิน แต่การทดสอบนับเป็นจำนวนบิล จึงบอกชัดว่าความมั่นใจมาจากจำนวนบิล
    if (k.test && iqFin(k.test.change) && k.id !== "co" && k.id !== "cx") k.delta = k.test.change;
    if (k.test) k.test.short = (k.test.what ? `${k.test.what} ${iqChg(k.test.change)} ` : "") + S.TH_CONF_SHORT[k.test.level];
  });
  // อัตราซื้อ (บิล ÷ คนเข้าร้าน) — ต้องมีทั้งหน้าร้านและการขาย
  if (D.store && (D.co || D.cx)) {
    const x = tot(H.bills.map((b, i) => iqFin(H.storeIn[i]) ? b : null), r.from, r.to), n = tot(H.storeIn.map((v, i) => iqFin(H.bills[i]) ? v : null), r.from, r.to);
    if (n > 0 && x <= n) {
      const w = S.wilson(x, n), t = rateTest(H.bills.map((b, i) => iqFin(H.storeIn[i]) ? b : null), H.storeIn.map((v, i) => iqFin(H.bills[i]) ? v : null));
      const k = { id: "conv", label: "อัตราซื้อ (บิล ÷ คนเข้าร้าน)", value: w.p, fmt: "pct1", delta: t && iqFin(t.change) ? t.change : null, sub: `${iqN(x)} บิล จาก ${iqN(n)} คน · ประมาณการ (คนละระบบ)`, ci: { text: `95%: ${iqP(w.lo, 1)}–${iqP(w.hi, 1)}` }, test: t, spark: iqWin(H, H.conv, r.from, r.to) };
      if (t) t.short = S.TH_CONF_SHORT[t.level];
      const at = K.findIndex(q => q.id === "store"); K.splice(at >= 0 ? at + 1 : K.length, 0, k);
      A.conv = { x, n, ci: w, test: t };
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
    if (fc) {
      const last7 = iqSum(y.slice(-7).filter(iqFin));
      A.forecast.total = { mean: iqSum(fc.mean), lo: iqSum(fc.lo), hi: iqSum(fc.hi), last7, change: last7 > 0 ? iqSum(fc.mean) / last7 - 1 : null };
    }
  }

  // ---------- ความสัมพันธ์ ----------
  const cFrom = r.days >= 14 ? r.from : keys[0], cTo = fullEnd < cFrom ? r.to : fullEnd;
  const W = a => iqWin(H, a, cFrom, cTo);
  const corr = [];
  const addC = (id, x, y, xName, yName, caution) => { const c = S.correlation(x, y); if (c.n >= 3) corr.push({ id, xName, yName, ...c, x: S.clean(x).length ? x : [], y, caution }); };
  if (D.store && (D.co || D.cx)) {
    addC("queue-conv", W(H.maxQueue), W(H.conv), "คิวสูงสุดของวัน (คน)", "อัตราซื้อ", "วันที่คนเยอะทั้งคิวยาวและอัตราซื้ออาจเปลี่ยนเพราะความหนาแน่นเอง ไม่ใช่เพราะคิว");
    if (W(H.dwell).some(iqFin)) addC("dwell-conv", W(H.dwell), W(H.conv), "เวลาอยู่ในโซนสินค้าเฉลี่ย (วินาที)", "อัตราซื้อ", "คนที่ตั้งใจซื้ออยู่แล้วอาจใช้เวลานานกว่า ความสัมพันธ์จึงอาจกลับทิศ");
    addC("in-bills", W(H.storeIn), W(H.bills), "คนเข้าร้าน", "จำนวนบิล", "ทั้งสองค่าขึ้นกับวันในสัปดาห์เหมือนกัน ความสัมพันธ์สูงเป็นเรื่องปกติ");
  }
  if (D.sg && D.store && D.sg.hourly) {
    const hin = Array(24).fill(0);
    H.keys.forEach((k, i) => { if (k >= cFrom && k <= cTo && H.hourly[i]) H.hourly[i].forEach((v, h) => { hin[h] += v; }); });
    const xs = [], ys = [];
    for (let h = 0; h < 24; h++) { const o = D.sg.hourly[String(h)]; if (o && o.ots > 0 && hin[h] > 0) { xs.push(o.ots); ys.push(hin[h]); } }
    addC("ots-in", xs, ys, "คนผ่านจอโฆษณา (รายชั่วโมง สะสม)", "คนเข้าร้าน (รายชั่วโมง)", "ทั้งสองค่าขึ้นกับช่วงเวลาของวันเหมือนกัน ไม่ได้แปลว่าป้ายพาคนเข้าร้าน");
  }
  if (D.booth) addC("booth-stop", W(H.booth), W(H.boothStop).map((s, i) => W(H.booth)[i] ? s / W(H.booth)[i] : null), "ผู้เข้าชมบูธต่อวัน", "อัตราหยุดชม", "บูธที่คนแน่นอาจทำให้คนหยุดน้อยลงหรือมากขึ้นได้ทั้งสองทาง");
  A.corr = corr;

  // ---------- A/B ----------
  A.ab = {};
  if (D.sg && D.sg.ads.length >= 2) A.ab.sg = S.abRates(D.sg.ads.filter(a => a.ots > 0 && a.viewers <= a.ots).map(a => ({ id: a.id, name: a.title, x: a.viewers, n: a.ots })), { minN: 30 });
  if (D.neuro) {
    const g = new Map();
    D.neuro.filter(s => iqInT(s.t, r) || r.preset === "all").forEach(s => { const k = s.test || "–"; (g.get(k) || g.set(k, []).get(k)).push(s.positive); });
    const all = [...g.entries()].map(([name, values]) => ({ id: name, name, values }));
    if (all.length >= 2) A.ab.neuro = S.abMeans(all, { minN: 3 });
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
    if (r.prev) { const e2 = expo(c.in, r.prev.from, r.prev.to), p = iqSum(iqWin(H, c.in, r.prev.from, r.prev.to).filter(iqFin)); if (e1 > 0 && e2 > 0) { test = S.poissonTest(cur, e1, p, e2); test.level = S.confLevel(test.p, !A.short && cur + p >= 10); } }
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

  A.goals = iqGoals(D, A, opt.goals || {});
  A.alerts = iqEvalAlerts(D, A, opt.alerts || {});
  return A;
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
function iqGoals(D, A, goals) {
  const out = [], r = A.r, H = A.H, avg = arr => { const v = iqWin(H, arr, r.from, A.fullEnd < r.from ? r.to : A.fullEnd).filter(iqFin); return v.length ? iqSum(v) / v.length : null; };
  IQ_GOAL_DEFS.forEach(g => {
    const t = +goals[g.id]; if (!(t > 0)) return;
    let actual = null, target = t;
    if (g.id === "storeInDay" && D.store) actual = avg(H.storeIn);
    if (g.id === "revenueDay" && (D.co || D.cx)) actual = avg(H.revenue);
    if (g.id === "convPct" && A.conv) { actual = A.conv.ci.p; target = t / 100; }
    if (g.id === "qcYieldPct" && D.qc) { const M = iqMetrics(D, r).qc; actual = M && M.total ? M.pass / M.total : null; target = t / 100; }
    if (g.id === "safetyMin" && D.dr) actual = iqMean(D.dr.trips.filter(x => iqInT(x.t, r)).map(x => x.safety).filter(iqFin));
    out.push({ ...g, target, actual, progress: actual != null ? actual / target : null, met: actual != null && actual >= target });
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
function iqEvalAlerts(D, A, raw) {
  const R = iqAlertRules(raw), out = [], today = A.today;
  const day = D.store ? D.store.find(d => d.day === today) : null;
  const occMax = R.occMax != null ? R.occMax : (D.stCfg && D.stCfg.maxOcc) || null;
  if (day && occMax > 0 && day.peak > occMax) out.push({ id: "occ", level: "high", title: "คนในร้านเกินที่กำหนด", text: `วันนี้มีคนในร้านพร้อมกันสูงสุด ${iqN(day.peak)} คน เกินเกณฑ์ ${iqN(occMax)} คน`, action: "เปิดช่องบริการเพิ่มหรือจำกัดคนเข้าชั่วคราว" });
  const svc = (D.stCfg && D.stCfg.serviceSec) || 60;
  if (day && R.queueWaitMin > 0 && day.maxQueue * svc / 60 > R.queueWaitMin) out.push({ id: "queue", level: "high", title: "คิวรอนานเกินเกณฑ์", text: `วันนี้คิวยาวสุด ${iqN(day.maxQueue)} คน รอประมาณ ${iqN(day.maxQueue * svc / 60, 1)} นาที (เกณฑ์ ${iqN(R.queueWaitMin)} นาที, คิดจาก ${svc} วินาที/คน)`, action: "เพิ่มพนักงานแคชเชียร์ในช่วงคิวยาว" });
  if (D.store && (D.co || D.cx) && R.convDropPct > 0) {
    const H = A.H, e = A.fullEnd, a0 = iqAddDays(e, -6), b0 = iqAddDays(e, -13), b1 = iqAddDays(e, -7);
    const bills = H.bills.map((b, i) => iqFin(H.storeIn[i]) ? b : null), ins = H.storeIn.map((v, i) => iqFin(H.bills[i]) ? v : null);
    const s = (arr, f, t) => iqSum(iqWin(H, arr, f, t).filter(iqFin));
    const x1 = s(bills, a0, e), n1 = s(ins, a0, e), x2 = s(bills, b0, b1), n2 = s(ins, b0, b1);
    if (n1 > 0 && n2 > 0 && x1 <= n1 && x2 <= n2) {
      const t = IQ_ST.twoProp(x1, n1, x2, n2), rel = t.p2 > 0 ? t.diff / t.p2 : 0;
      if (rel < -R.convDropPct / 100) out.push({ id: "conv", level: t.p < 0.05 ? "high" : "mid", title: "อัตราซื้อลดลงจากสัปดาห์ก่อน", text: `7 วันล่าสุด ${iqP(t.p1, 1)} เทียบ ${iqP(t.p2, 1)} (${iqChg(rel)}, เกณฑ์ลด ${iqN(R.convDropPct)}%) · ${IQ_ST.TH_CONF_SHORT[IQ_ST.confLevel(t.p, n1 >= 30 && n2 >= 30)]}`, action: "ตรวจคิว ราคา และสินค้าขาดชั้นในสัปดาห์นี้" });
    }
  }
  if (D.qc && R.qcYieldMin > 0) { const y = D.qc.total ? D.qc.pass / D.qc.total : null; if (y != null && y * 100 < R.qcYieldMin) out.push({ id: "qc", level: "high", title: "อัตราผ่าน QC ต่ำกว่าเกณฑ์", text: `กะล่าสุดผ่าน ${iqP(y, 1)} (เกณฑ์ ${iqN(R.qcYieldMin)}%)`, action: "หยุดตรวจสาเหตุหลักที่ไลน์ผลิต" }); }
  return out;
}

/* ---------- แปลผล: การ์ดสรุปอัตโนมัติ ---------- */
function iqSure(level, ciText) {
  const base = IQ_ST.TH_CONF[level] || IQ_ST.TH_CONF.insufficient;
  return ciText ? `${base} · ${ciText}` : base;
}
const IQ_LEVEL_W = { strong: 3, moderate: 2.2, weak: 1.2, none: 0.6, insufficient: 0.5 };

function iqInsights(D, A) {
  const S = IQ_ST, r = A.r, C = [], seed = r.from + r.to;
  const add = c => { c.score = (c.score || 1); C.push(c); };
  const vsTxt = r.compare === "week" ? "ช่วงเดียวกันของสัปดาห์ก่อน" : r.days === 1 ? "เมื่อวาน" : `${r.days} วันก่อนหน้า`;

  if (A.short) add({ id: "short", tone: "info", module: "all", level: "insufficient", title: "ข้อมูลยังน้อย", body: `มีข้อมูลเพียง ${iqN(A.dataDays)} วัน ตัวเลขด้านล่างเป็นค่าที่เห็นจริง แต่การเปรียบเทียบ การหาค่าผิดปกติ และการพยากรณ์ยังเชื่อถือไม่ได้`, sure: IQ_ST.TH_CONF.insufficient, why: ["การสรุปแนวโน้มต้องมีอย่างน้อย 7 วัน และพยากรณ์ตามวันในสัปดาห์ต้องมีราว 3 สัปดาห์"], action: "เปิดระบบเก็บข้อมูลทุกวันต่อเนื่องอย่างน้อย 1–3 สัปดาห์ แล้วกลับมาดูหน้านี้", score: 2.5 });

  (A.alerts || []).forEach(a => add({ id: "alert-" + a.id, tone: "bad", module: "alert", level: "strong", title: a.title, body: a.text, sure: "เกิดขึ้นจริงตามข้อมูลวันนี้ (ไม่ใช่การคาดการณ์)", why: [], action: a.action, score: a.level === "high" ? 9 : 6 }));

  // คนเข้าร้าน เทียบช่วงก่อน
  const ks = A.kpis.find(k => k.id === "store");
  if (ks && ks.test) {
    const t = ks.test, ch = t.change, up = ch > 0, flat = !iqFin(ch) || t.level === "none" || t.level === "insufficient";
    const why = [];
    const H = A.H, wkend = (f, to) => iqWinKeys(H, f, to).filter((k, i) => [0, 6].includes(iqWdOf(k)) && iqFin(iqWin(H, H.storeIn, f, to)[i])).length;
    const w1 = wkend(r.from, r.to), w2 = wkend(r.prev.from, r.prev.to);
    if (w1 !== w2 && r.days > 1) why.push(`ช่วงนี้มีวันเสาร์–อาทิตย์ที่มีข้อมูล ${w1} วัน เทียบกับ ${w2} วันในช่วงก่อน ซึ่งปกติวันหยุดคนมากกว่า`);
    const anIn = A.forecast && A.forecast.metric === "storeIn" ? A.forecast.anomalies.filter(a => a.day >= r.from && a.day <= r.to) : [];
    if (anIn.length) { const net = iqSum(anIn.map(a => a.value - a.expected)); why.push(`มีวันที่ตัวเลขผิดปกติอยู่ในช่วงนี้ ${anIn.length} วัน (${anIn.map(a => `${iqDL(a.day)} ${a.dir === "up" ? "สูง" : "ต่ำ"}`).join(", ")}) รวมแล้วทำให้ยอดช่วงนี้${net >= 0 ? "สูง" : "ต่ำ"}กว่าปกติราว ${iqN(Math.abs(net))} คน`); }
    if (Math.abs(t.e1 - t.e2) >= 1) why.push(`จำนวนวันที่กล้องเก็บข้อมูลต่างกัน (${iqN(t.e1, 1)} เทียบ ${iqN(t.e2, 1)} วัน) จึงเทียบเป็นค่าต่อวันแทนยอดรวม`);
    const camMove = (A.cams || []).filter(c => c.test && iqFin(c.test.change) && c.test.level !== "insufficient").sort((a, b) => Math.abs(b.test.change) - Math.abs(a.test.change))[0];
    if (camMove && A.cams.length > 1) why.push(`จุดที่เปลี่ยนมากที่สุดคือ ${camMove.name} (${iqChg(camMove.test.change)})`);
    if (!why.length) why.push("ไม่พบสิ่งผิดปกติในข้อมูลที่อธิบายการเปลี่ยนแปลงนี้ได้ อาจมาจากปัจจัยภายนอกที่กล้องไม่เห็น");
    const pk = A.heat && A.heat.top[0];
    const ci = iqFin(t.lo) ? `ช่วงที่น่าจะเป็น ${iqChg(t.lo)} ถึง ${iqChg(t.hi)}` : "";
    add({ id: "store-change", tone: flat ? "info" : up ? "good" : "bad", module: "store", level: t.level, title: flat ? iqPick(seed + "s", ["คนเข้าร้านใกล้เคียงเดิม", "จำนวนคนเข้าร้านยังทรงตัว"]) : `คนเข้าร้าน${up ? "เพิ่มขึ้น" : "ลดลง"} ${iqChg(ch).replace(/^[+−]/, "")}`,
      body: `เฉลี่ย ${iqN(t.rate1, 0)} คน/วัน เทียบกับ ${iqN(t.rate2, 0)} คน/วัน (${vsTxt})${r.to === A.today ? " (วันนี้คิดตามสัดส่วนเวลาที่ผ่านไป)" : ""}`,
      sure: iqSure(t.level, ci), why,
      action: flat ? "รักษาการจัดพนักงานแบบเดิม และดูการ์ดช่วงเวลาที่คนเยอะเพื่อปรับกะ" : up ? (pk ? `เตรียมพนักงานและสินค้าให้พอในช่วง${IQ_WD[pk.wd]} ${iqPad(pk.h)}:00 น. ซึ่งเป็นช่วงที่คนเยอะที่สุด` : "เตรียมพนักงานและสินค้าให้พอกับคนที่เพิ่มขึ้น") : "ตรวจว่ากล้องทำงานครบทุกวัน แล้วลองทำโปรโมชันหน้าร้านในช่วงที่คนน้อย",
      score: IQ_LEVEL_W[t.level] * (1 + Math.min(1, Math.abs(ch || 0) * 3)) });
  }

  // ค่าผิดปกติล่าสุด
  if (A.forecast && A.forecast.anomalies.length && !A.short) {
    const a = A.forecast.anomalies.slice().sort((x, y) => (x.day < y.day ? 1 : -1))[0], F = A.forecast, H = A.H, i = H.keys.indexOf(a.day);
    const why = [`ระบบคิดค่าที่คาดไว้จากแนวโน้มและรูปแบบวัน${IQ_WD[iqWdOf(a.day)]}ตามปกติแล้ว ค่านี้ยังห่างจากที่คาดมาก (คะแนนผิดปกติ ${iqN(Math.abs(a.z), 1)} เกณฑ์ 3.5)`];
    if (F.metric === "storeIn" && i >= 0 && iqFin(H.bills[i])) {
      const med = S.median(H.bills.filter(iqFin)), up = H.bills[i] > med * 1.25, dn = H.bills[i] < med * 0.75;
      why.push(`ยอดบิลวันเดียวกัน ${iqN(H.bills[i])} บิล (ปกติราว ${iqN(med)}) ${up ? "สูงขึ้นด้วย จึงน่าจะเป็นคนจริงที่เพิ่มขึ้น" : dn ? "ต่ำลงด้วย จึงน่าจะเป็นคนจริงที่ลดลง" : "ไม่ได้เปลี่ยนตาม จึงอาจเป็นการนับคลาดเคลื่อนหรือคนเดินผ่านเข้าออกซ้ำ"}`);
    }
    if (i >= 0 && H.hourly[i] && a.dir === "down") { const act = H.hourly[i].filter(v => v > 0).length; if (act <= 6) why.push(`วันนั้นมีข้อมูลเพียง ${act} ชั่วโมง อาจเป็นเพราะเปิดกล้องไม่ครบวัน`); }
    add({ id: "anomaly", tone: "warn", module: F.metric === "storeIn" ? "store" : "sales", level: Math.abs(a.z) > 6 ? "strong" : "moderate",
      title: `${iqDL(a.day)}: ${F.name}${a.dir === "up" ? "สูง" : "ต่ำ"}ผิดปกติ`,
      body: `${iqN(a.value)} ${F.unit} ขณะที่ค่าที่คาดไว้ประมาณ ${iqN(Math.max(0, a.expected))} ${F.unit}${A.forecast.anomalies.length > 1 ? ` · พบวันผิดปกติทั้งหมด ${A.forecast.anomalies.length} วันในประวัติ` : ""}`,
      sure: iqPick(seed + "a", ["ค่อนข้างมั่นใจว่าผิดไปจากรูปแบบปกติ แต่ข้อมูลไม่ได้บอกสาเหตุ", "ผิดจากรูปแบบปกติชัดเจน ส่วนสาเหตุต้องตรวจสอบเพิ่ม"]), why,
      action: a.dir === "up" ? "เทียบกับปฏิทินโปรโมชันหรือกิจกรรมของวันนั้น ถ้าเป็นโปรโมชัน ลองทำซ้ำในวันที่คนน้อย" : "ตรวจว่าวันนั้นกล้องเปิดครบเวลาทำการหรือไม่ ถ้าครบ ให้หาสาเหตุ เช่น ปิดร้านบางช่วงหรือสภาพอากาศ",
      score: 2.6 });
  }

  // ช่วงเวลาที่คนเยอะ
  if (A.heat && A.heat.top.length) {
    const h = A.heat, p = h.top[0], lo = h.low, src = h.src === "store" ? "คนเข้าร้าน" : "บิลขาย";
    const best = h.byWd.indexOf(Math.max(...h.byWd)), worst = h.byWd.indexOf(Math.min(...h.byWd.filter((v, i) => h.n[i].some(x => x > 0)).concat([Infinity])));
    add({ id: "peak", tone: "info", module: h.src === "store" ? "store" : "sales", level: h.short ? "insufficient" : "moderate",
      title: `ช่วงที่${src}มากที่สุด: วัน${IQ_WD[p.wd]} ${iqPad(p.h)}:00–${iqPad(p.h)}:59`,
      body: `เฉลี่ย ${iqN(p.v, 1)} ${h.src === "store" ? "คน" : "บิล"}ต่อชั่วโมง${lo ? ` · ช่วงที่เงียบที่สุดคือวัน${IQ_WD[lo.wd]} ${iqPad(lo.h)}:00 (${iqN(lo.v, 1)})` : ""} · ทั้งวันมากสุดคือวัน${IQ_WD[best]}${worst >= 0 && worst !== best ? ` น้อยสุดคือวัน${IQ_WD[worst]}` : ""}`,
      sure: h.short ? `ข้อมูลยังน้อย (${h.nDays} วัน) รูปแบบอาจเปลี่ยนเมื่อเก็บข้อมูลนานขึ้น` : `คิดจากข้อมูล ${h.nDays} วัน แต่ละช่องเฉลี่ยจากวันเดียวกันประมาณ ${iqN(h.nDays / 7, 0)} สัปดาห์`,
      why: ["คำนวณจากค่าเฉลี่ยรายชั่วโมงของแต่ละวันในสัปดาห์ (ไม่รวมวันนี้ที่ยังไม่จบ)"],
      action: `จัดกะพนักงานให้หนาแน่นในวัน${IQ_WD[p.wd]}ช่วง ${iqPad(Math.max(0, p.h - 1))}:00–${iqPad(Math.min(23, p.h + 1))}:59${lo ? ` และใช้ช่วงวัน${IQ_WD[lo.wd]} ${iqPad(lo.h)}:00 เติมสินค้าหรือทำโปรโมชันดึงคน` : ""}`,
      score: h.short ? 0.9 : 1.6 });
  }

  // พยากรณ์
  if (A.forecast && A.forecast.fc && A.forecast.total) {
    const F = A.forecast, T = F.total, enough = F.enough;
    add({ id: "forecast", tone: "info", module: F.metric === "storeIn" ? "store" : "sales", level: enough ? "moderate" : "insufficient",
      title: `คาดการณ์ 7 วันข้างหน้า: ${F.name}ราว ${iqN(T.mean)} ${F.unit}`,
      body: `ช่วงที่น่าจะเป็น (80%) ${iqN(T.lo)}–${iqN(T.hi)} ${F.unit} · เทียบ 7 วันล่าสุด ${iqN(T.last7)} ${F.unit} (${iqChg(T.change)})`,
      sure: enough ? "ใช้แบบจำลอง Holt-Winters ตามรูปแบบรายสัปดาห์ ช่วงคาดการณ์กว้างเท่าที่ข้อมูลผันผวนจริง" : `ข้อมูลยังน้อย (${iqN(F.y.filter(iqFin).length)} วัน) จึงใช้${F.fc.method === "mean" ? "ค่าเฉลี่ย" : "ค่าของสัปดาห์ก่อน"}เป็นตัวคาดการณ์ ความแม่นยำต่ำ`,
      why: enough ? [`แบบจำลองเรียนรู้จาก ${iqN(F.y.length)} วันที่ผ่านมา โดยให้น้ำหนักกับข้อมูลล่าสุด (α=${F.fc.params.alpha}) และรูปแบบวันในสัปดาห์ (γ=${F.fc.params.gamma})`] : [],
      action: T.change > 0.05 ? "สั่งสินค้าและจัดพนักงานเผื่อไว้ใกล้ค่าบนของช่วงคาดการณ์" : T.change < -0.05 ? "ลดการสั่งสินค้าที่เน่าเสียง่าย และวางแผนกิจกรรมเรียกลูกค้า" : "วางแผนสต็อกและกะพนักงานใกล้เคียงสัปดาห์ที่ผ่านมา",
      score: enough ? 1.5 : 0.7 });
  }

  // อัตราซื้อ
  if (A.conv) {
    const c = A.conv, t = c.test, flat = !t || t.level === "none" || t.level === "insufficient";
    add({ id: "conv", tone: !t || flat ? "info" : t.diff > 0 ? "good" : "bad", module: "sales", level: t ? t.level : (c.n >= 100 && !A.short ? "moderate" : "insufficient"),
      title: !t ? `อัตราซื้อ ${iqP(c.ci.p, 1)}` : flat ? `อัตราซื้อ ${iqP(c.ci.p, 1)} ใกล้เคียงเดิม` : `อัตราซื้อ${t.diff > 0 ? "ดีขึ้น" : "ลดลง"} ${iqPts(t.diff)}`,
      body: `${iqN(c.x)} บิลจากคนเข้าร้าน ${iqN(c.n)} คน${t ? ` · ${vsTxt} ${iqP(t.p2, 1)}` : ""}`,
      sure: t ? iqSure(t.level, `อัตราจริงน่าจะอยู่ระหว่าง ${iqP(c.ci.lo, 1)}–${iqP(c.ci.hi, 1)}`) : c.n >= 100 ? `อัตราจริงน่าจะอยู่ระหว่าง ${iqP(c.ci.lo, 1)}–${iqP(c.ci.hi, 1)} (ช่วงนี้ไม่มีช่วงเทียบ)` : IQ_ST.TH_CONF.insufficient,
      why: ["บิลกับคนเข้าร้านนับจากคนละระบบ จึงเป็นค่าประมาณ (กลุ่มที่มาด้วยกันจ่ายบิลเดียว)"].concat((A.corr || []).filter(x => x.id === "queue-conv" && x.enough && x.r < -0.3).map(x => `วันที่คิวยาวมักมีอัตราซื้อต่ำกว่า (r = ${iqN(x.r, 2)})`)),
      action: !t || flat ? "ทดลองจัดวางสินค้าใกล้แคชเชียร์หรือโปรโมชันบิลถัดไป แล้ววัดผลเทียบสัปดาห์นี้" : t.diff > 0 ? "บันทึกว่าช่วงนี้เปลี่ยนอะไร (ราคา จัดวาง โปรโมชัน) เพื่อทำซ้ำ" : "ดูคิวและสินค้าขาดชั้นในช่วงคนเยอะ เพราะเป็นสาเหตุที่พบบ่อยของการเดินออกโดยไม่ซื้อ",
      score: IQ_LEVEL_W[t ? t.level : "insufficient"] * (1 + Math.min(1, Math.abs(t ? t.change || 0 : 0) * 3)) + 0.2 });
  }

  // ความสัมพันธ์ที่น่าสนใจ (เฉพาะที่ข้อมูลพอและไม่ใช่ค่าที่สัมพันธ์กันโดยธรรมชาติ)
  (A.corr || []).filter(c => c.id !== "in-bills" && c.id !== "ots-in").forEach(c => {
    const lv = !c.enough ? "insufficient" : S.confLevel(c.p, true);
    if (lv === "none" || lv === "insufficient") return;
    add({ id: "corr-" + c.id, tone: "info", module: "corr", level: lv, title: `${c.xName.replace(/ \(.*\)$/, "")} กับ${c.yName}: ${S.corrWord(c.r)}`,
      body: `r = ${iqN(c.r, 2)} (95%: ${iqN(c.lo, 2)} ถึง ${iqN(c.hi, 2)}) จาก ${c.n} วัน`,
      sure: IQ_ST.TH_CONF[lv] + " ว่ามีความสัมพันธ์ แต่ยังไม่ใช่หลักฐานว่าค่าหนึ่งทำให้อีกค่าเปลี่ยน",
      why: [c.caution], action: c.id === "queue-conv" && c.r < 0 ? "ลองเพิ่มแคชเชียร์ในวันที่คาดว่าคนเยอะ แล้วดูว่าอัตราซื้อดีขึ้นจริงหรือไม่" : c.id === "dwell-conv" && c.r > 0 ? "ลองเพิ่มจุดชิมหรือป้ายข้อมูลสินค้าเพื่อให้คนอยู่ในโซนนานขึ้น แล้ววัดผล" : "ทดลองเปลี่ยนทีละอย่างแล้ววัดผลเพื่อยืนยันเหตุและผล",
      score: IQ_LEVEL_W[lv] * Math.abs(c.r) * 1.2 });
  });

  // A/B ป้ายโฆษณา
  if (A.ab.sg) {
    const ab = A.ab.sg;
    if (!ab.enough) add({ id: "ab-sg", tone: "info", module: "sg", level: "insufficient", title: "เทียบโฆษณา: ข้อมูลยังน้อย", body: `ต้องมีคนผ่านจออย่างน้อย 30 คนต่อโฆษณาอย่างน้อย 2 ชิ้น`, sure: IQ_ST.TH_CONF.insufficient, why: [], action: "เปิดป้ายโฆษณาต่อไปให้แต่ละชิ้นได้แสดงพอ ๆ กัน", score: 0.5 });
    else {
      const t = ab.spread || ab.test, lv = S.confLevel(t.p, true), b = ab.best, w = ab.worst || ab.runner;
      add({ id: "ab-sg", tone: lv === "strong" || lv === "moderate" ? "good" : "info", module: "sg", level: lv,
        title: lv === "none" || lv === "weak" ? "โฆษณาแต่ละชิ้นดึงสายตาได้ใกล้เคียงกัน" : `โฆษณา “${b.name}” ดึงสายตาได้ดีที่สุด`,
        body: `อัตรามอง ${iqP(b.ci.p)} เทียบ “${w.name}” ${iqP(w.ci.p)} (ต่าง ${iqPts(t.diff)}, 95%: ${iqPts(t.lo)} ถึง ${iqPts(t.hi)})`,
        sure: iqSure(lv, `ห่างจากอันดับสอง ${iqPts(ab.test.diff)} (${S.TH_CONF_SHORT[S.confLevel(ab.test.p, true)]})`),
        why: ["ยอดสะสมทุกช่วงเวลา ถ้าแต่ละชิ้นเล่นคนละช่วงเวลา (เช่น ชั่วโมงเร่งด่วน) ผลอาจต่างเพราะเวลา ไม่ใช่ตัวโฆษณา"],
        action: lv === "strong" || lv === "moderate" ? `เพิ่มรอบเล่น “${b.name}” ในช่วงคนผ่านมาก และปรับหรือลดรอบ “${w.name}”` : "ยังไม่ควรตัดสินจากตัวเลขนี้ ให้หมุนเวียนเล่นสลับกันในทุกช่วงเวลาแล้ววัดต่อ",
        score: IQ_LEVEL_W[lv] * 0.9 });
    }
  }
  if (A.ab.neuro) {
    const ab = A.ab.neuro;
    if (!ab.enough) add({ id: "ab-neuro", tone: "info", module: "neuro", level: "insufficient", title: "เทียบสื่อทดสอบอารมณ์: ข้อมูลยังน้อย", body: `ควรมีผู้ทดสอบอย่างน้อย 3 คนต่อสื่อ (ตอนนี้มากสุด ${Math.max(...ab.groups.map(g => g.n))} คน)`, sure: IQ_ST.TH_CONF.insufficient, why: [], action: "ให้ผู้ทดสอบเพิ่มดูทุกสื่อ แล้วเทียบอีกครั้ง", score: 0.5 });
    else {
      const t = ab.spread || ab.test, w = ab.worst || ab.runner, lv = S.confLevel(t.p, true), sig = lv === "strong" || lv === "moderate";
      add({ id: "ab-neuro", tone: sig ? "good" : "info", module: "neuro", level: lv,
        title: sig ? `“${ab.best.name}” ได้อารมณ์เชิงบวกมากกว่า “${w.name}”` : "สื่อที่ทดสอบได้อารมณ์ใกล้เคียงกัน",
        body: `อารมณ์บวกเฉลี่ย “${ab.best.name}” ${iqP(ab.best.ci.mean)} เทียบ “${w.name}” ${iqP(w.ci.mean)} (ต่าง ${iqPts(t.diff)}, 95%: ${iqPts(t.lo)} ถึง ${iqPts(t.hi)})`,
        sure: iqSure(lv, `ผู้ทดสอบ ${ab.best.n} และ ${w.n} ครั้ง · ห่างจากอันดับสอง${ab.runner && ab.runner !== w ? ` “${ab.runner.name}”` : ""} ${iqPts(ab.test.diff)} (${S.TH_CONF_SHORT[S.confLevel(ab.test.p, true)]})`), why: ["วัดจากสีหน้าระหว่างดูสื่อ ผู้ทดสอบกลุ่มเล็กอาจไม่เหมือนลูกค้าจริง"],
        action: sig ? `เลือก “${ab.best.name}” แทน “${w.name}” แล้วทดสอบกับกลุ่มผู้ชมที่ใหญ่ขึ้นก่อนตัดสินใจลงทุน` : "เพิ่มผู้ทดสอบหรือปรับสื่อให้ต่างกันชัดขึ้น", score: IQ_LEVEL_W[lv] * 0.8 });
    }
  }

  // ลูกค้ากลับมาซ้ำ
  if (A.cohort && A.cohort.customers) {
    const c = A.cohort, ci = c.repeatCI, enough = c.customers >= 10, r2 = c.rows.filter(x => x.retention.length > 1);
    const w1 = r2.length ? iqMean(r2.map(x => x.retention[1])) : null;
    add({ id: "cohort", tone: "info", module: "cx", level: enough ? "moderate" : "insufficient", title: `ลูกค้าที่กลับมาซื้อซ้ำ ${iqP(c.repeatRate)}`,
      body: `${iqN(c.repeat)} จาก ${iqN(c.customers)} คนที่จดจำได้ซื้อมากกว่า 1 สัปดาห์${w1 != null ? ` · เฉลี่ยกลับมาในสัปดาห์ถัดไป ${iqP(w1)}` : ""}`,
      sure: enough ? `อัตราจริงน่าจะอยู่ระหว่าง ${iqP(ci.lo)}–${iqP(ci.hi)}` : "ข้อมูลยังน้อย (ลูกค้าไม่ถึง 10 คน)", why: ["นับเฉพาะลูกค้าที่ยินยอมให้จดจำใบหน้า จึงอาจสูงกว่าลูกค้าทั้งหมด"],
      action: c.repeatRate != null && c.repeatRate < 0.4 ? "ลองให้สิทธิพิเศษเมื่อกลับมาซื้อครั้งที่สองภายใน 7 วัน" : "รักษาฐานลูกค้าประจำด้วยเมนูหรือสิทธิพิเศษตามประวัติการสั่ง", score: enough ? 1.1 : 0.5 });
  }
  if (A.boothStop && A.boothStop.n) {
    const s = A.boothStop, enough = s.n >= 30;
    add({ id: "booth", tone: "info", module: "booth", level: enough ? "moderate" : "insufficient", title: `ผู้เข้าชมบูธหยุดชม ${iqP(s.p)}`,
      body: `${iqN(s.x)} จาก ${iqN(s.n)} คนหยุดอย่างน้อย 5 วินาที${A.boothReturn ? ` · กลับมาซ้ำ ${iqP(A.boothReturn.p)}` : ""}`,
      sure: enough ? `อัตราจริงน่าจะอยู่ระหว่าง ${iqP(s.lo)}–${iqP(s.hi)}` : "ข้อมูลยังน้อย (ผู้เข้าชมไม่ถึง 30 คน)", why: [],
      action: s.p < 0.4 ? "ปรับสิ่งที่มองเห็นจากทางเดิน (ป้าย ไฟ ของตัวอย่าง) ให้ดึงคนหยุดมากขึ้น" : "บูธดึงคนหยุดได้ดี ให้เพิ่มกิจกรรมที่เปลี่ยนคนหยุดดูเป็นผู้ร่วมกิจกรรม", score: enough ? 1 : 0.5 });
  }
  // QC (ถ้ามีการแจ้งเตือน QC อยู่แล้ว ไม่ต้องซ้ำ)
  const M = iqMetrics(D, r);
  if (M.qc && M.qc.total && !(A.alerts || []).some(x => x.id === "qc")) {
    const w = S.wilson(M.qc.pass, M.qc.total), topR = Object.entries(M.qc.reasons).sort((a, b) => b[1] - a[1])[0];
    add({ id: "qc", tone: w.p < 0.95 ? "bad" : "good", module: "qc", level: M.qc.total >= 100 ? "moderate" : "insufficient", title: `อัตราผ่าน QC ${iqP(w.p, 1)}`,
      body: `ตรวจ ${iqN(M.qc.total)} ขวด คัดทิ้ง ${iqN(M.qc.reject)}${topR ? ` · สาเหตุหลัก: ${IQ_QC_REASONS[topR[0]] || topR[0]} (${iqP(topR[1] / Math.max(1, M.qc.reject))} ของที่คัดทิ้ง)` : ""}`,
      sure: M.qc.total >= 100 ? `อัตราจริงน่าจะอยู่ระหว่าง ${iqP(w.lo, 1)}–${iqP(w.hi, 1)}` : "ข้อมูลยังน้อย (ตรวจไม่ถึง 100 ขวด)", why: [],
      action: topR ? `เริ่มแก้ที่${IQ_QC_REASONS[topR[0]] || topR[0]}ก่อน เพราะเป็นสัดส่วนใหญ่ที่สุดของของเสีย` : "รักษาการตั้งค่าเดิม", score: w.p < 0.95 ? 2 : 0.8 });
  }
  if (M.dr && M.dr.trips) {
    const ev = M.dr.hours > 0 ? M.dr.events / M.dr.hours : null, topT = Object.entries(M.dr.byType).sort((a, b) => b[1] - a[1])[0];
    add({ id: "dr", tone: M.dr.safety != null && M.dr.safety < 70 ? "bad" : "info", module: "dr", level: M.dr.trips >= 5 ? "moderate" : "insufficient", title: `คะแนนความปลอดภัยคนขับเฉลี่ย ${iqN(M.dr.safety)}/100`,
      body: `${iqN(M.dr.trips)} เที่ยว ${iqN(M.dr.hours, 1)} ชั่วโมง · เหตุการณ์ ${iqN(ev, 1)} ครั้ง/ชั่วโมง${topT ? ` · พบบ่อยสุด: ${IQ_DR_TYPES[topT[0]] || topT[0]}` : ""}`,
      sure: M.dr.trips >= 5 ? "คิดจากทุกเที่ยวในช่วงนี้" : "ข้อมูลยังน้อย (ไม่ถึง 5 เที่ยว)", why: [],
      action: topT && (topT[0] === "yawn" || topT[0] === "microsleep" || topT[0] === "long_closure") ? "จัดเวลาพักทุก 2 ชั่วโมง และเลี่ยงกะขับช่วงตี 2–6" : "ทบทวนเหตุการณ์ละสายตากับคนขับ และตรวจตำแหน่งกล้อง", score: 0.9 });
  }

  // เป้าหมาย
  (A.goals || []).forEach(g => {
    if (g.actual == null) return;
    const f = v => g.fmt === "pct" ? iqP(v, 1) : g.fmt === "baht" ? iqB(v) : iqN(v);
    add({ id: "goal-" + g.id, tone: g.met ? "good" : "warn", module: "goal", level: A.short ? "insufficient" : "moderate", title: `${g.label}: ${g.met ? "ถึงเป้า" : "ยังไม่ถึงเป้า"} (${iqP(g.progress)})`,
      body: `ได้ ${f(g.actual)} จากเป้า ${f(g.target)}`, sure: A.short ? "ข้อมูลยังน้อย ค่าเฉลี่ยอาจเปลี่ยนมาก" : "เทียบค่าเฉลี่ยของวันที่จบแล้วในช่วงที่เลือก", why: [],
      action: g.met ? "ตั้งเป้าที่สูงขึ้นเล็กน้อยสำหรับช่วงถัดไป" : "ดูการ์ดอื่นในหน้านี้เพื่อหาจุดที่ปรับได้เร็วที่สุด", score: g.met ? 0.8 : 1.8 });
  });

  C.forEach(c => { c.why = (c.why || []).filter(Boolean); });
  return C.sort((a, b) => b.score - a.score);
}

/** ตรวจว่าข้อความไม่มี NaN / undefined / Infinity */
function iqTextOk(v) {
  const bad = [];
  const walk = x => { if (typeof x === "string") { if (/NaN|undefined|Infinity|\bnull\b|\[object/.test(x)) bad.push(x); } else if (Array.isArray(x)) x.forEach(walk); else if (x && typeof x === "object") Object.values(x).forEach(walk); };
  walk(v); return bad;
}

/** รายงานประจำวัน/สัปดาห์ (โครงสร้างล้วน ใช้ทั้งพิมพ์และส่งออก) */
function iqReport(D, A, cards, kind) {
  return {
    kind, title: kind === "day" ? "รายงานประจำวัน" : "รายงานประจำสัปดาห์", from: A.r.from, to: A.r.to, generatedAt: new Date(A.now).toISOString(),
    kpis: A.kpis.map(k => ({ label: k.label, value: k.value, fmt: k.fmt, delta: k.delta, sure: k.test ? IQ_ST.TH_CONF_SHORT[k.test.level] : "", ci: k.ci ? k.ci.text : "" })),
    insights: cards.slice(0, 8).map(c => ({ title: c.title, body: c.body, sure: c.sure, why: c.why, action: c.action })),
    forecast: A.forecast && A.forecast.total ? { name: A.forecast.name, unit: A.forecast.unit, ...A.forecast.total, method: A.forecast.fc.method } : null,
    goals: A.goals, alerts: A.alerts
  };
}

/** ส่งออกผลวิเคราะห์เป็น JSON (ตัวเลขสรุปเท่านั้น ไม่มีชื่อลูกค้า) */
function iqAnalysisJson(D, A, cards) {
  const F = A.forecast;
  return {
    format: "lensiq-analysis", version: 1, generatedAt: new Date(A.now).toISOString(), range: { from: A.r.from, to: A.r.to, compare: A.r.compare, prev: A.r.prev },
    dataDays: A.dataDays, short: A.short,
    kpis: A.kpis.map(k => ({ id: k.id, label: k.label, value: k.value, delta: k.delta, ci: k.ci ? k.ci.text : null, p: k.test ? k.test.p : null, confidence: k.test ? k.test.level : null })),
    insights: cards.map(c => ({ id: c.id, tone: c.tone, confidence: c.level, title: c.title, body: c.body, sure: c.sure, why: c.why, action: c.action })),
    daily: A.H.keys.map((k, i) => ({ day: k, storeIn: A.H.storeIn[i], bills: A.H.bills[i], revenue: A.H.revenue[i] == null ? null : Math.round(A.H.revenue[i] * 100) / 100, conversion: A.H.conv[i], maxQueue: A.H.maxQueue[i], booth: A.H.booth[i] })),
    forecast: F && F.fc ? { metric: F.metric, method: F.fc.method, conf: F.fc.conf, days: F.fkeys.map((k, j) => ({ day: k, mean: F.fc.mean[j], lo: F.fc.lo[j], hi: F.fc.hi[j] })), anomalies: F.anomalies.map(a => ({ day: a.day, value: a.value, expected: a.expected, z: a.z })) } : null,
    correlations: A.corr.map(c => ({ id: c.id, x: c.xName, y: c.yName, n: c.n, r: c.r, lo: c.lo, hi: c.hi, p: c.p, rho: c.rho, caution: c.caution })),
    heatmap: A.heat ? { source: A.heat.src, from: A.heat.from, to: A.heat.to, days: A.heat.nDays, meanByWeekdayHour: A.heat.grid } : null,
    goals: A.goals, alerts: A.alerts
  };
}
/** CSV รายวันพร้อมค่าเฉลี่ยเคลื่อนที่ ค่าผิดปกติ และพยากรณ์ */
function iqAnalysisCsv(A) {
  const F = A.forecast, an = new Map((F ? F.anomalies : []).map(a => [a.day, a])), ma = IQ_ST.movingAvg(A.H.storeIn, 7);
  const rows = [["วันที่", "วัน", "คนเข้าร้าน", "ค่าเฉลี่ย 7 วัน", "บิลขาย", "อัตราซื้อ (%)", "ยอดขายรวม (บาท)", "คิวสูงสุด", "ผิดปกติ", "ค่าที่คาดไว้"]];
  A.H.keys.forEach((k, i) => { if (k < A.r.from || k > A.r.to) return; const a = an.get(k); rows.push([k, IQ_WD[iqWdOf(k)], A.H.storeIn[i] ?? "", ma[i] == null ? "" : ma[i].toFixed(1), A.H.bills[i] ?? "", A.H.conv[i] == null ? "" : (A.H.conv[i] * 100).toFixed(2), A.H.revenue[i] == null ? "" : A.H.revenue[i].toFixed(2), A.H.maxQueue[i] ?? "", a ? (a.dir === "up" ? "สูง" : "ต่ำ") : "", a ? a.expected.toFixed(1) : ""]); });
  if (F && F.fc) { rows.push([], ["พยากรณ์ " + F.name, "วิธี " + F.fc.method, "ช่วง " + Math.round(F.fc.conf * 100) + "%"]); F.fkeys.forEach((k, j) => rows.push([k, IQ_WD[iqWdOf(k)], F.fc.mean[j].toFixed(1), F.fc.lo[j].toFixed(1), F.fc.hi[j].toFixed(1)])); }
  return "﻿" + rows.map(r => r.map(iqCsvCell).join(",")).join("\r\n");
}

if (typeof module !== "undefined" && module.exports) module.exports = {
  iqDay, iqAddDays, iqDayStart, iqIsModuleKey, iqCollect, iqRange, iqMetrics, iqKpis, iqSeries, iqTrimHours, iqBuckets, iqFunnel, iqModuleBars, iqCsv,
  iqBuildDemo, iqHasDemo, iqRemoveDemo, iqBackup, iqValidateBackup, IQ_DEMO_KEY, IQ_FORTUNE_KEYS,
  iqDaily, iqAnalyze, iqHeat, iqInsights, iqGoals, iqEvalAlerts, iqAlertRules, iqReport, iqAnalysisJson, iqAnalysisCsv, iqTextOk, IQ_GOAL_DEFS, IQ_ALERT_DEFAULTS, IQ_WD
};

// ================= ส่วนหน้าจอ =================
if (typeof document !== "undefined") (() => {
  const $ = s => document.querySelector(s);
  const NS = "http://www.w3.org/2000/svg";
  const el = (tag, attrs = {}, parent, text) => {
    const n = tag.startsWith("svg:") ? document.createElementNS(NS, tag.slice(4)) : document.createElement(tag);
    for (const k in attrs) { if (k === "class") n.setAttribute("class", attrs[k]); else n.setAttribute(k, attrs[k]); }
    if (text != null) n.textContent = text;
    parent?.append(n); return n;
  };
  const RANGE_KEY = "iq-range";
  const PRESETS = [["today", "วันนี้"], ["d7", "7 วัน"], ["d30", "30 วัน"], ["d90", "90 วัน"], ["all", "ทั้งหมด"], ["custom", "กำหนดเอง"]];
  const CUSTOM_KEY = "iq-range-custom", COMPARE_KEY = "iq-compare", GOALS_KEY = "iq-goals", ALERTS_KEY = "iq-alerts";
  const MODULES = [
    { id: "booth", name: "วิเคราะห์บูธ", href: "booth.html", what: "นับผู้เข้าชม เวลาหยุดชม และผู้ร่วมกิจกรรม" },
    { id: "store", name: "วิเคราะห์หน้าร้าน", href: "store.html", what: "นับคนเข้า–ออก คิว และโซนยอดนิยม" },
    { id: "sg", name: "ป้ายโฆษณาอัจฉริยะ", href: "signage.html", what: "วัดคนผ่านจอและคนที่หันมอง" },
    { id: "co", name: "สแกนสินค้าด้วยกล้อง", href: "checkout.html", what: "คิดเงินแบบบริการตนเองและรายงานยอดขาย" },
    { id: "cx", name: "จดจำลูกค้า", href: "customers.html", what: "จำลูกค้าที่ยินยอมและประวัติการสั่ง" },
    { id: "neuro", name: "วิเคราะห์อารมณ์", href: "neuro.html", what: "ทดสอบโฆษณาและบรรจุภัณฑ์จากสีหน้า" },
    { id: "att", name: "เช็คชื่อด้วยใบหน้า", href: "attendance.html", what: "ลงชื่อเข้าอบรมด้วยการสแกนใบหน้า" },
    { id: "qc", name: "ตรวจคุณภาพขวดน้ำ", href: "qc.html", what: "ตรวจระดับน้ำ ฝา และฉลากบนสายการผลิต" },
    { id: "dr", name: "เฝ้าระวังความง่วงคนขับ", href: "driver.html", what: "ตรวจการหลับตา หาว และละสายตา" },
    { id: "fr", name: "โหงวเฮ้ง (อ่านใบหน้า)", href: "faceread.html", what: "นับจำนวนครั้งที่ดูดวงและธาตุที่ได้ (ไม่เก็บภาพ/ข้อมูลติดต่อ)" },
    { id: "palm", name: "ดูลายมือ", href: "palm.html", what: "นับจำนวนครั้งที่ดูลายมือและประเภทมือ" },
    { id: "fs", name: "ฮวงจุ้ย", href: "fengshui.html", what: "นับจำนวนครั้งที่ดูทิศมงคลและเลขกัว" },
    { id: "photo", name: "ตู้ถ่ายรูป", href: "photobooth.html", what: "ตู้สติ๊กเกอร์และรูปติดบัตร" }
  ];
  const nf = n => Math.round(n).toLocaleString("th-TH");
  const compact = n => Math.abs(n) >= 10000 ? (n / 1000).toLocaleString("th-TH", { maximumFractionDigits: 1 }) + "K" : nf(n);
  const baht = n => "฿" + (Math.abs(n) >= 100000 ? compact(n) : Math.round(n).toLocaleString("th-TH"));
  const fmtVal = (v, f) => v == null ? "–" : f === "baht" ? baht(v) : f === "pct" ? Math.round(v * 100) + "%" : f === "pct1" ? (v * 100).toFixed(1) + "%" : f === "score" ? Math.round(v) + "/100" : compact(v);
  const dayLabel = key => new Date(iqDayStart(key)).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  const bucketLabel = (b, r) => r.mode === "hour" ? iqPad(b) + ":00" : dayLabel(b);
  const fmtDate = t => new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

  let preset = "d7";
  let compare = "prev";
  try { const p = localStorage.getItem(RANGE_KEY); if (PRESETS.some(([k]) => k === p)) preset = p; const c = localStorage.getItem(COMPARE_KEY); if (["prev", "week", "none"].includes(c)) compare = c; } catch {}

  const snapshot = () => { const s = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (iqIsModuleKey(k)) s[k] = localStorage.getItem(k); } } catch {} return s; };
  const apply = ({ set = {}, remove = [] }) => { for (const k in set) localStorage.setItem(k, set[k]); remove.forEach(k => localStorage.removeItem(k)); };
  function msg(text, cls = "") { const m = $("#dataMsg"); m.textContent = text; m.className = "iq-msg " + cls; }

  // ---------- tooltip (เมาส์ แตะ และคีย์บอร์ด) ----------
  const tip = $("#iqTip");
  let tipOwner = null;
  function showTip(owner, title, rows, x, y) {
    tipOwner = owner;
    tip.replaceChildren();
    el("div", { class: "tt-h" }, tip, title);
    rows.forEach(([name, val, cls]) => { const r = el("div", { class: "tt-r" }, tip); if (cls) el("i", { class: "key " + cls }, r); el("b", {}, r, val); el("span", {}, r, name); });
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.max(8, Math.min(innerWidth - w - 8, x - w / 2)) + "px";
    tip.style.top = (y - h - 14 < 8 ? y + 18 : y - h - 14) + "px";
  }
  const hideTip = owner => { if (!owner || owner === tipOwner) { tip.hidden = true; tipOwner = null; } };
  document.addEventListener("pointerdown", e => { if (tipOwner && !tipOwner.contains(e.target)) hideTip(); });
  addEventListener("scroll", () => hideTip(), { passive: true });

  /* แกน Y ค่ากลม ๆ */
  function niceTicks(max, n = 4) {
    if (!(max > 0)) return [0, 1];
    const raw = max / n, p = Math.pow(10, Math.floor(Math.log10(raw))), m = raw / p, step = (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
    const out = []; for (let v = 0; v <= max + step * 0.999; v += step) out.push(+v.toFixed(6));
    if (out.length < 2) out.push(step);
    return out;
  }

  /* ตัวช่วยโต้ตอบตามแกน X: เมาส์/แตะเลือกตำแหน่งที่ใกล้ที่สุด, ลูกศรซ้ายขวาเมื่อโฟกัส */
  function bindIndex(svg, n, xOf, onIdx) {
    let cur = -1;
    const at = e => { const r = svg.getBoundingClientRect(), x = e.clientX - r.left; let best = 0; for (let i = 1; i < n; i++) if (Math.abs(xOf(i) - x) < Math.abs(xOf(best) - x)) best = i; return best; };
    const go = (i, e) => { cur = i; const r = svg.getBoundingClientRect(); onIdx(i, e ? e.clientX : r.left + xOf(i), r.top + 8); };
    svg.addEventListener("pointermove", e => go(at(e), e));
    svg.addEventListener("pointerdown", e => go(at(e), e));
    svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { onIdx(-1); hideTip(svg); } });
    svg.addEventListener("keydown", e => {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); go(Math.max(0, Math.min(n - 1, (cur < 0 ? (e.key === "ArrowRight" ? -1 : n) : cur) + (e.key === "ArrowRight" ? 1 : -1)))); }
      if (e.key === "Escape") { onIdx(-1); hideTip(svg); }
    });
    svg.addEventListener("focus", () => { if (cur < 0) go(n - 1); });
    svg.addEventListener("blur", () => { onIdx(-1); hideTip(svg); });
  }

  /* วาดใหม่เมื่อความกว้างเปลี่ยน */
  const ro = new ResizeObserver(entries => entries.forEach(en => { const box = en.target; const w = Math.round(en.contentRect.width); if (w && w !== box._w) { box._w = w; box._draw?.(w); } }));
  function responsive(box, draw) { box._draw = draw; box._w = 0; ro.observe(box); const w = Math.round(box.getBoundingClientRect().width); if (w) { box._w = w; draw(w); } }

  /* กราฟแท่งแนวตั้ง 1 ชุดข้อมูล (ตามเวลา) */
  function columnChart(box, { labels, values, fmt, name }) {
    responsive(box, W => {
      box.replaceChildren();
      const H = 150, L = 40, R = 6, T = 10, B = 24, n = values.length;
      const ticks = niceTicks(Math.max(...values, 0)), max = ticks.at(-1);
      const band = (W - L - R) / n, bw = Math.max(2, Math.min(24, band * 0.68));
      const x = i => L + band * i + band / 2, y = v => T + (1 - v / max) * (H - T - B);
      const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "iq-svg", role: "img", tabindex: 0, "aria-label": `${name}: ${labels.map((l, i) => `${l} ${fmtVal(values[i], fmt)}`).join(", ")}` }, box);
      ticks.forEach(v => { el("svg:line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? "base" : "grid" }, svg); el("svg:text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "tick" }, svg, fmt === "baht" ? compact(v) : compact(v)); });
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L) / 54))));
      labels.forEach((l, i) => { if ((n - 1 - i) % every === 0) el("svg:text", { x: x(i), y: H - 6, "text-anchor": n > 1 && i === n - 1 && x(i) + 24 > W ? "end" : "middle", class: "tick" }, svg, l); });
      const bars = values.map((v, i) => {
        const top = y(v), h = y(0) - top, r = Math.min(4, h, bw / 2), x0 = x(i) - bw / 2;
        if (h <= 0) return null;
        return el("svg:path", { class: "bar s1", d: `M${x0},${y(0)}V${top + r}Q${x0},${top} ${x0 + r},${top}H${x0 + bw - r}Q${x0 + bw},${top} ${x0 + bw},${top + r}V${y(0)}Z` }, svg);
      });
      bindIndex(svg, n, x, (i, cx, cy) => {
        bars.forEach((b, k) => b && b.classList.toggle("on", k === i));
        if (i < 0) return;
        const r = svg.getBoundingClientRect();
        showTip(svg, labels[i], [[name, fmtVal(values[i], fmt), "s1"]], r.left + x(i), r.top + y(values[i]));
      });
    });
  }

  /* กราฟเส้นหลายชุด (แกน Y เดียว หน่วยเดียวกัน) + crosshair + ป้ายปลายเส้น */
  function lineChart(box, { labels, series }) {
    responsive(box, W => {
      box.replaceChildren();
      const narrow = W < 520, H = narrow ? 210 : 260, L = 40, R = narrow ? 12 : 92, T = 12, B = 26, n = labels.length;
      const ticks = niceTicks(Math.max(1, ...series.flatMap(s => s.values))), max = ticks.at(-1);
      const x = i => n === 1 ? (L + W - R) / 2 : L + (W - L - R) * i / (n - 1), y = v => T + (1 - v / max) * (H - T - B);
      const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: "iq-svg", role: "img", tabindex: 0, "aria-label": "แนวโน้มรวม " + series.map(s => `${s.name} รวม ${nf(iqSum(s.values))}`).join(", ") + " (ดูตัวเลขทั้งหมดในตารางด้านล่าง)" }, box);
      ticks.forEach(v => { el("svg:line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? "base" : "grid" }, svg); el("svg:text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "tick" }, svg, compact(v)); });
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 58))));
      labels.forEach((l, i) => { if ((n - 1 - i) % every === 0) el("svg:text", { x: x(i), y: H - 6, "text-anchor": n > 1 && i === n - 1 && x(i) + 24 > W ? "end" : "middle", class: "tick" }, svg, l); });
      series.forEach(s => {
        el("svg:path", { class: "line " + s.cls, d: s.values.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("") }, svg);
        el("svg:circle", { class: "dot " + s.cls, cx: x(n - 1), cy: y(s.values[n - 1]), r: 4 }, svg);
      });
      if (!narrow) { // ป้ายปลายเส้น — เลี่ยงชนกันด้วยการเว้นระยะขั้นต่ำ (มีเส้นนำถ้าเลื่อน)
        const ends = series.map(s => ({ s, y0: y(s.values[n - 1]), y: y(s.values[n - 1]) })).sort((a, b) => a.y - b.y);
        const GAP = 16, maxY = H - B - 4;
        for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < GAP) ends[i].y = ends[i - 1].y + GAP;
        if (ends.length && ends.at(-1).y > maxY) { ends.at(-1).y = maxY; for (let i = ends.length - 2; i >= 0; i--) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - GAP); }
        ends.forEach(e => {
          if (Math.abs(e.y - e.y0) > 1) el("svg:line", { x1: x(n - 1) + 6, x2: W - R + 4, y1: e.y0, y2: e.y, class: "leader" }, svg);
          el("svg:text", { x: W - R + 8, y: e.y + 4, class: "endlab" }, svg, `${e.s.short} ${nf(e.s.values[n - 1])}`);
        });
      }
      const cross = el("svg:line", { y1: T, y2: H - B, class: "cross", visibility: "hidden" }, svg);
      const dots = series.map(s => el("svg:circle", { r: 4, class: "dot " + s.cls, visibility: "hidden" }, svg));
      bindIndex(svg, n, x, (i, cx) => {
        const vis = i < 0 ? "hidden" : "visible";
        cross.setAttribute("visibility", vis); dots.forEach(d => d.setAttribute("visibility", vis));
        if (i < 0) return;
        cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
        dots.forEach((d, k) => { d.setAttribute("cx", x(i)); d.setAttribute("cy", y(series[k].values[i])); });
        const r = svg.getBoundingClientRect();
        showTip(svg, labels[i], series.map(s => [s.name, nf(s.values[i]), s.cls]), r.left + x(i), r.top + T);
      });
    });
  }

  /* แท่งแนวนอนแบบ HTML (หมวดหมู่) ค่าอยู่ปลายแท่ง */
  function hbars(box, rows, fmt, name) {
    box.replaceChildren();
    const max = Math.max(...rows.map(r => r.value), 0) || 1;
    const list = el("div", { class: "hb", role: "list", "aria-label": name }, box);
    rows.forEach(r => {
      const row = el("div", { class: "hb-row", role: "listitem", tabindex: 0 }, list);
      el("div", { class: "hb-l" }, row, r.label);
      const tr = el("div", { class: "hb-t" }, row);
      const bar = el("div", { class: "hb-b s1" }, tr); bar.style.width = Math.max(1.5, r.value / max * 100) + "%";
      el("div", { class: "hb-v" }, row, fmtVal(r.value, fmt));
      const show = e => { const b = row.getBoundingClientRect(); showTip(row, r.label, [[name, fmtVal(r.value, fmt), "s1"], ...(r.sub ? [[r.sub, ""]] : [])], e?.clientX ?? b.left + b.width / 2, b.top); };
      row.addEventListener("pointerenter", show); row.addEventListener("pointerdown", show); row.addEventListener("focus", () => show());
      row.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hideTip(row); }); row.addEventListener("blur", () => hideTip(row));
    });
  }

  function tableView(parent, head, rows) {
    const d = el("details", { class: "iq-table" }, parent);
    el("summary", {}, d, "ดูเป็นตาราง");
    const wrap = el("div", { class: "tw" }, d), t = el("table", {}, wrap), tr = el("tr", {}, el("thead", {}, t));
    head.forEach((h, i) => el("th", { class: i ? "n" : "" }, tr, h));
    const tb = el("tbody", {}, t);
    rows.forEach(r => { const row = el("tr", {}, tb); r.forEach((c, i) => el("td", { class: i ? "n" : "" }, row, c)); });
  }

  // ---------- เรนเดอร์ทั้งหน้า ----------
  let last = null; // ผลวิเคราะห์ล่าสุด (ใช้ส่งออก/รายงาน/ทดสอบ)
  const loadJson = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v && typeof v === "object" ? v : d; } catch { return d; } };
  const saveJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const rangeOpt = () => ({ ...loadJson(CUSTOM_KEY, {}), compare });
  function analyze(p = preset, opt = rangeOpt()) {
    const snap = snapshot(), D = iqCollect(snap), now = Date.now(), r = iqRange(p, now, D, opt);
    const A = iqAnalyze(D, r, { now, goals: loadJson(GOALS_KEY, {}), alerts: loadJson(ALERTS_KEY, {}) });
    return { snap, D, r, A, cards: iqInsights(D, A) };
  }

  function render() {
    const { snap, D, r, A, cards } = analyze();
    last = { D, r, A, cards };
    window.__IQ = { last, render, report: buildReport, analyze };
    const has = id => !!D[id];
    const any = MODULES.some(m => has(m.id));
    document.querySelectorAll(".range button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === preset)));
    $("#customRange").hidden = preset !== "custom";
    if (preset === "custom") { $("#cFrom").value = r.from; $("#cTo").value = r.to; $("#cFrom").max = $("#cTo").max = iqDay(); }
    $("#compare").value = compare; $("#compare").disabled = preset === "all";
    $("#rangeNote").textContent = (r.from === r.to ? `วันที่ ${dayLabel(r.from)}` : `${dayLabel(r.from)} – ${dayLabel(r.to)} (${r.days} วัน)`) + (r.prev ? ` · เทียบ ${r.prev.from === r.prev.to ? dayLabel(r.prev.from) : `${dayLabel(r.prev.from)} – ${dayLabel(r.prev.to)}`}` : "");
    const demo = iqHasDemo(snap);
    $("#demoBanner").hidden = !demo;
    $("#seedDemo").hidden = demo; $("#removeDemo").hidden = !demo;
    $("#seedDemoEmpty").hidden = demo;
    $("#empty").hidden = any; $("#dash").hidden = !any; $("#reportCard").hidden = !any;
    renderData(snap);
    if (!any) { renderEmptyList(); renderAlerts([]); return; }

    renderAlerts(A.alerts);
    renderInsights(cards);
    renderKpis(A, r);

    // แนวโน้มรวม
    const S0 = { booth: iqSeries(D, r, "booth"), store: iqSeries(D, r, "store"), sales: iqSeries(D, r, "sales") };
    let buckets = iqBuckets(r);
    const defs = [["booth", "ผู้เข้าชมบูธ", "บูธ", "s1"], ["store", "คนเข้าร้าน", "เข้าร้าน", "s2"], ["sales", "จำนวนบิลขาย", "บิลขาย", "s3"]]
      .filter(([k]) => k === "sales" ? (has("co") || has("cx")) : has(k));
    let vals = defs.map(([k]) => S0[k]);
    if (r.mode === "hour") { const t = iqTrimHours(buckets, vals); buckets = t.buckets; vals = t.series; }
    const tc = $("#trend"), tbox = $("#trendChart"), leg = $("#trendLegend");
    tc.hidden = !defs.length;
    if (defs.length) {
      leg.replaceChildren();
      defs.forEach(([, name, , cls]) => { const li = el("li", {}, leg); el("i", { class: "key " + cls }, li); li.append(name); });
      const labels = buckets.map(b => bucketLabel(b, r)), series = defs.map(([, name, short, cls], i) => ({ name, short, cls, values: vals[i] }));
      $("#trendSub").textContent = r.mode === "hour" ? "รายชั่วโมงของวันนี้" : "รายวัน · หน่วยเป็นจำนวนคน/บิล";
      const hasVals = series.some(s => s.values.some(v => v > 0));
      tbox.hidden = !hasVals; $("#trendEmpty").hidden = hasVals;
      if (hasVals) lineChart(tbox, { labels, series });
      $("#trendTable").replaceChildren();
      tableView($("#trendTable"), ["ช่วงเวลา", ...series.map(s => s.name)], labels.map((l, i) => [l, ...series.map(s => nf(s.values[i]))]));
      $("#trendNote").textContent = has("sg") ? "ผู้ชมโฆษณา (มองจอ) ไม่แสดงในกราฟนี้ เพราะระบบป้ายโฆษณาเก็บเป็นยอดสะสม ไม่แยกรายวัน" : "";
    }

    renderFunnel(D, r, A);
    renderHeat(A);
    renderForecast(A);
    renderCorr(A);
    renderAB(A);
    renderCams(A);
    renderCohort(A);
    renderGoals(A);
    renderAlertRules(D);
    renderModules(D, r, A);
  }

  // ---------- แจ้งเตือน ----------
  function renderAlerts(list) {
    const box = $("#alerts"); box.replaceChildren(); box.hidden = !list.length;
    list.forEach(a => {
      const d = el("div", { class: "alert " + a.level, role: "alert" }, box);
      el("span", { class: "a-ic", "aria-hidden": "true" }, d, "!");
      const t = el("div", {}, d); el("b", {}, t, a.title); el("span", {}, t, " — " + a.text); if (a.action) el("div", { class: "a-act" }, t, "ควรทำ: " + a.action);
    });
    const R = iqAlertRules(loadJson(ALERTS_KEY, {}));
    if (!list.length || !R.notify || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    let seen = []; try { seen = JSON.parse(sessionStorage.getItem("iq-notified") || "[]"); } catch {}
    const day = iqDay();
    list.filter(a => !seen.includes(day + a.id)).forEach(a => { try { new Notification("LENSIQ: " + a.title, { body: a.text, tag: "lensiq-" + a.id }); } catch {} seen.push(day + a.id); });
    try { sessionStorage.setItem("iq-notified", JSON.stringify(seen.slice(-50))); } catch {}
  }

  // ---------- การ์ดสรุปอัตโนมัติ ----------
  const TONE = { good: ["▲", "ดีขึ้น"], bad: ["▼", "ต้องดูแล"], warn: ["!", "ผิดปกติ"], info: ["i", "ข้อสังเกต"] };
  const LV = { strong: 4, moderate: 3, weak: 2, none: 1, insufficient: 0 };
  const LV_TXT = { strong: "มั่นใจสูง", moderate: "ค่อนข้างมั่นใจ", weak: "ยังไม่แน่ชัด", none: "ไม่ต่างชัด", insufficient: "ข้อมูลยังน้อย" };
  const SEC = { store: "#heatCard", sales: "#funnel", corr: "#corrCard", sg: "#abCard", neuro: "#abCard", cx: "#cohortCard", goal: "#goalCard", alert: "#alertCard", booth: "#m-booth", qc: "#m-qc", dr: "#m-dr", all: "#modules" };
  let showAll = false;
  function renderInsights(cards) {
    const box = $("#insightCards"); box.replaceChildren();
    const N = 6, list = showAll ? cards : cards.slice(0, N);
    $("#insightSub").textContent = cards.length ? `${cards.length} ข้อ เรียงตามความสำคัญและความมั่นใจ · คำนวณในเครื่องนี้ทั้งหมด` : "";
    if (!cards.length) el("p", { class: "nodata" }, box, "ยังไม่มีข้อสังเกตในช่วงนี้");
    list.forEach((c, i) => {
      const [ic, toneTxt] = TONE[c.tone] || TONE.info;
      const a = el("article", { class: "ins " + c.tone, "aria-labelledby": "ins-" + i }, box);
      const h = el("div", { class: "ins-h" }, a);
      el("span", { class: "ins-ic", "aria-hidden": "true" }, h, ic);
      el("h3", { id: "ins-" + i }, h, c.title);
      el("span", { class: "sr" }, h, ` (${toneTxt})`);
      el("p", { class: "ins-b" }, a, c.body);
      const s = el("div", { class: "ins-sure" }, a);
      const m = el("span", { class: "meter", role: "img", "aria-label": `ความมั่นใจ ${LV_TXT[c.level] || ""} (${LV[c.level] || 0} จาก 4)` }, s);
      for (let k = 1; k <= 4; k++) el("i", { class: k <= (LV[c.level] || 0) ? "on" : "" }, m);
      el("span", {}, s, c.sure);
      if (c.why && c.why.length) { const d = el("details", { class: "ins-why" }, a); el("summary", {}, d, "เหตุผลที่เป็นไปได้ (จากข้อมูล)"); const ul = el("ul", {}, d); c.why.forEach(w => el("li", {}, ul, w)); }
      const act = el("p", { class: "ins-act" }, a); el("b", {}, act, "ควรทำ: "); act.append(c.action);
      if (SEC[c.module]) el("a", { class: "ins-more", href: SEC[c.module] }, a, "ดูรายละเอียด →");
    });
    const more = $("#insightMore");
    more.hidden = cards.length <= N;
    more.textContent = showAll ? "แสดงเฉพาะ 6 ข้อสำคัญ" : `แสดงทั้งหมด ${cards.length} ข้อ`;
    more.setAttribute("aria-expanded", String(showAll));
  }

  // ---------- KPI ----------
  function sparkline(parent, values, name) {
    const v = (values || []).map(x => iqFin(x) ? x : null), pts = v.filter(x => x != null);
    if (pts.length < 2) return;
    const W = 120, H = 28, max = Math.max(...pts), min = Math.min(0, ...pts), n = v.length;
    const x = i => n === 1 ? W / 2 : 2 + (W - 4) * i / (n - 1), y = val => H - 3 - (max > min ? (val - min) / (max - min) : 0.5) * (H - 6);
    const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, preserveAspectRatio: "none", class: "spark", "aria-hidden": "true", focusable: "false" }, parent);
    let d = "", pen = false;
    v.forEach((val, i) => { if (val == null) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`; pen = true; });
    el("svg:path", { d, class: "sp-l" }, svg);
    const li = v.map((q, i) => q == null ? -1 : i).filter(i => i >= 0).pop();
    el("svg:circle", { cx: x(li), cy: y(v[li]), r: 2.5, class: "sp-d" }, svg);
    parent.setAttribute("data-spark", name || "");
  }
  function renderKpis(A, r) {
    const kp = $("#kpis"); kp.replaceChildren();
    const vs = r.compare === "week" ? "สัปดาห์ก่อน" : r.days === 1 ? "เมื่อวาน" : `${r.days} วันก่อนหน้า`;
    A.kpis.forEach(k => {
      const mod = MODULES.find(m => m.id === k.id);
      const a = el("a", { class: "kpi", href: mod ? mod.href : "#funnel" }, kp);
      el("div", { class: "k" }, a, k.label);
      const row = el("div", { class: "kv" }, a);
      el("div", { class: "v" }, row, fmtVal(k.value, k.fmt));
      if (k.spark) sparkline(row, k.spark, k.label);
      if (k.delta != null && iqFin(k.delta)) {
        const up = k.delta >= 0, sure = k.test ? k.test.short : "";
        const d = el("div", { class: "d" + (k.test && (k.test.level === "strong" || k.test.level === "moderate") ? (up ? " up" : " dn") : "") }, a);
        el("span", { "aria-hidden": "true" }, d, up ? "▲ " : "▼ ");
        d.append(`${up ? "เพิ่ม" : "ลด"} ${Math.abs(Math.round(k.delta * 100))}% เทียบ ${vs}`);
        if (sure) el("span", { class: "conf" }, d, " · " + sure);
      } else if (k.test && k.test.level === "insufficient") el("div", { class: "d" }, a, "เทียบช่วงก่อน: ข้อมูลยังน้อย");
      if (k.ci) el("div", { class: "ci" }, a, k.ci.text);
      el("div", { class: "s" }, a, k.sub);
    });
  }

  // ---------- funnel ----------
  function renderFunnel(D, r, A) {
    const F = iqFunnel(D, r), box = $("#funnelBody"); box.replaceChildren();
    const SF = A.storeFunnel;
    $("#funnel").hidden = F.count === 0 && !SF;
    const sb = $("#storeFunnel"); sb.replaceChildren();
    if (SF) {
      el("h3", { class: "sub-h" }, sb, "เส้นทางในร้าน");
      const max = Math.max(...SF.steps.map(s => s.value || 0), 1);
      const list = el("ol", { class: "sfn" }, sb);
      SF.steps.forEach(s => {
        const li = el("li", { class: "fn-row" + (s.value == null ? " none" : "") }, list);
        const head = el("div", { class: "fn-h" }, li); el("b", {}, head, s.label);
        if (s.value == null) { el("div", { class: "fn-miss" }, li, s.note); return; }
        const line = el("div", { class: "fn-line" }, li), tr = el("div", { class: "fn-t" }, line), bar = el("div", { class: "fn-b" }, tr);
        bar.style.width = Math.max(1, s.value / max * 100) + "%";
        el("div", { class: "fn-v" }, line, nf(s.value));
        el("div", { class: "fn-s" }, li, [s.note, s.rate != null ? (s.overcount ? `${(s.rate * 100).toFixed(0)}% ของขั้นก่อน (นับซ้ำได้ จึงไม่คิดช่วงความเชื่อมั่น)` : `${(s.rate * 100).toFixed(1)}% ของขั้นก่อนหน้า${s.ci ? ` (95%: ${(s.ci.lo * 100).toFixed(1)}–${(s.ci.hi * 100).toFixed(1)}%)` : ""}`) : ""].filter(Boolean).join(" · "));
      });
      if (SF.overall != null) el("p", { class: "note" }, sb, `จากคนเข้าร้านถึงบิลขาย ${(SF.overall * 100).toFixed(1)}% · บิลกับคนเข้าร้านนับจากคนละระบบ จึงเป็นค่าประมาณ`);
    }
    $("#funnelNote").textContent = "";
    if (!F.count) return;
    if (SF) el("h3", { class: "sub-h" }, box, "เส้นทางลูกค้า (บูธ / ป้าย / การขาย)");
    const max = Math.max(...F.steps.map(s => s.value || 0), 1);
    F.steps.forEach((s, i) => {
      const row = el("div", { class: "fn-row" + (s.src ? "" : " none") }, box);
      const head = el("div", { class: "fn-h" }, row);
      el("span", { class: "fn-n" }, head, String(i + 1));
      el("b", {}, head, s.label);
      if (s.src) { const a = el("a", { class: "src", href: s.src.href }, head, "จาก " + s.src.source); a.title = s.src.note; }
      if (!s.src) { el("div", { class: "fn-miss" }, row, i === 1 || i === 0 ? "ยังไม่มีข้อมูล — ใช้ระบบวิเคราะห์บูธหรือหน้าร้าน" + (r.preset !== "all" ? " (ป้ายโฆษณานับเฉพาะช่วง \"ทั้งหมด\")" : "") : i === 2 ? "ยังไม่มีข้อมูล — ใช้ระบบวิเคราะห์บูธ" : "ยังไม่มีข้อมูล — ใช้ระบบสแกนสินค้าหรือจดจำลูกค้า"); return; }
      const line = el("div", { class: "fn-line" }, row);
      const tr = el("div", { class: "fn-t" }, line), bar = el("div", { class: "fn-b s1" }, tr);
      bar.style.width = Math.max(1, s.value / max * 100) + "%";
      el("div", { class: "fn-v" }, line, nf(s.value));
      const prev = F.steps[i - 1], w = s.ofPrev != null && prev && s.value <= prev.value ? LQStats.wilson(s.value, prev.value) : null;
      el("div", { class: "fn-s" }, row, [s.src.note, s.ofPrev != null ? `${Math.round(s.ofPrev * 100)}% ของขั้นก่อนหน้า${w ? ` (95%: ${Math.round(w.lo * 100)}–${Math.round(w.hi * 100)}%)` : ""}` : s.crossSource ? "คนละระบบกับขั้นก่อนหน้า จึงไม่คิดอัตรา" : ""].filter(Boolean).join(" · "));
    });
    $("#funnelNote").textContent = F.mixed ? "ขั้นตอนมาจากคนละระบบ ใช้ดูภาพรวมเท่านั้น ไม่ได้ติดตามคนคนเดียวกันข้ามระบบ" : "ทุกขั้นมาจากระบบเดียวกัน";
  }

  // ---------- ฮีตแมป วัน × ชั่วโมง ----------
  const WD_ORDER = [1, 2, 3, 4, 5, 6, 0], WD_SHORT = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];
  function renderHeat(A) {
    const card = $("#heatCard"), box = $("#heatChart"), H = A.heat;
    card.hidden = !H;
    if (!H) return;
    $("#heatSub").textContent = `${H.src === "store" ? "คนเข้าร้าน" : "บิลขาย"}เฉลี่ยต่อชั่วโมง · ${dayLabel(H.from)} – ${dayLabel(H.to)} (${H.nDays} วัน)${H.short ? " · ข้อมูลยังน้อย" : ""}`;
    const bins = [0, 0.15, 0.3, 0.5, 0.7, 0.85].map(f => f * H.max), bin = v => v == null ? -1 : v <= 0 ? 0 : Math.max(0, bins.filter(b => v > b).length - 1);
    const hours = []; for (let h = H.lo; h <= H.hi; h++) hours.push(h);
    responsive(box, W => {
      box.replaceChildren();
      const L = 34, T = 18, B = 4, cw = (W - L) / hours.length, ch = Math.max(20, Math.min(30, cw * 1.1)), Ht = T + ch * 7 + B;
      const svg = el("svg:svg", { viewBox: `0 0 ${W} ${Ht}`, width: W, height: Ht, class: "iq-svg heat", role: "img", tabindex: 0, "aria-label": `ฮีตแมปวันในสัปดาห์กับชั่วโมง ค่าสูงสุดวัน${IQ_WD[H.top[0].wd]} ${iqPad(H.top[0].h)}:00 เฉลี่ย ${H.top[0].v.toFixed(1)} (ใช้ลูกศรเพื่ออ่านทีละช่อง ดูตัวเลขทั้งหมดในตาราง)` }, box);
      const every = Math.max(1, Math.ceil(28 / cw));
      hours.forEach((h, j) => { if (j % every === 0) el("svg:text", { x: L + cw * j + cw / 2, y: 12, "text-anchor": "middle", class: "tick" }, svg, iqPad(h)); });
      const cells = [];
      WD_ORDER.forEach((wd, ri) => {
        el("svg:text", { x: L - 6, y: T + ch * ri + ch / 2 + 4, "text-anchor": "end", class: "tick" }, svg, WD_SHORT[wd]);
        hours.forEach((h, j) => {
          const v = H.grid[wd][h], b = bin(v);
          const c = el("svg:rect", { x: L + cw * j + 1, y: T + ch * ri + 1, width: Math.max(1, cw - 2), height: ch - 2, rx: 3, class: "hc " + (b < 0 ? "hn" : "h" + b) }, svg);
          cells.push({ c, wd, h, v, ri, j });
        });
      });
      const ring = el("svg:rect", { class: "hring", visibility: "hidden", rx: 4, width: cw, height: ch }, svg);
      let cur = -1;
      const show = (k, cx, cy) => {
        cur = k; const q = cells[k]; if (!q) return;
        ring.setAttribute("x", L + cw * q.j); ring.setAttribute("y", T + ch * q.ri); ring.setAttribute("visibility", "visible");
        const R = svg.getBoundingClientRect();
        showTip(svg, `วัน${IQ_WD[q.wd]} ${iqPad(q.h)}:00–${iqPad(q.h)}:59`, [[H.src === "store" ? "คนเข้า/ชม. (เฉลี่ย)" : "บิล/ชม. (เฉลี่ย)", q.v == null ? "–" : q.v.toFixed(1), ""], [`จาก ${H.n[q.wd][q.h]} วัน`, ""]], cx ?? R.left + L + cw * q.j + cw / 2, cy ?? R.top + T + ch * q.ri);
      };
      const hit = e => { const R = svg.getBoundingClientRect(), x = e.clientX - R.left, y = e.clientY - R.top, j = Math.floor((x - L) / cw), ri = Math.floor((y - T) / ch); return j >= 0 && j < hours.length && ri >= 0 && ri < 7 ? ri * hours.length + j : -1; };
      svg.addEventListener("pointermove", e => { const k = hit(e); if (k >= 0) show(k, e.clientX, e.clientY - 6); });
      svg.addEventListener("pointerdown", e => { const k = hit(e); if (k >= 0) show(k, e.clientX, e.clientY - 6); });
      svg.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") { ring.setAttribute("visibility", "hidden"); hideTip(svg); } });
      svg.addEventListener("keydown", e => {
        const n = hours.length, mv = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: n, ArrowUp: -n }[e.key];
        if (mv != null) { e.preventDefault(); show(Math.max(0, Math.min(cells.length - 1, (cur < 0 ? 0 : cur + mv)))); }
        if (e.key === "Escape") { ring.setAttribute("visibility", "hidden"); hideTip(svg); }
      });
      svg.addEventListener("blur", () => { ring.setAttribute("visibility", "hidden"); hideTip(svg); });
    });
    const lg = $("#heatLegend"); lg.replaceChildren();
    el("span", {}, lg, "น้อย");
    for (let b = 0; b < 6; b++) el("i", { class: "hk h" + b, title: b === 5 ? `มากกว่า ${bins[5].toFixed(1)}` : `${bins[b].toFixed(1)}–${bins[b + 1].toFixed(1)}` }, lg);
    el("span", {}, lg, "มาก");
    const nl = el("span", { class: "hk-n" }, lg); el("i", { class: "hk hn" }, nl); nl.append("ไม่มีข้อมูล");
    $("#heatTable").replaceChildren();
    tableView($("#heatTable"), ["วัน", ...hours.map(h => iqPad(h))], WD_ORDER.map(wd => [IQ_WD[wd], ...hours.map(h => H.grid[wd][h] == null ? "–" : H.grid[wd][h].toFixed(1))]));
  }

  // ---------- พยากรณ์ + ค่าผิดปกติ ----------
  function renderForecast(A) {
    const card = $("#fcCard"), F = A.forecast, box = $("#fcChart");
    card.hidden = !(F && F.fc);
    if (card.hidden) return;
    const hist = 28, ks = F.keys.slice(-hist), ys = F.y.slice(-hist), an = new Map(F.anomalies.map(a => [a.day, a]));
    const labels = [...ks, ...F.fkeys].map(dayLabel), n = labels.length, h0 = ks.length;
    $("#fcSub").textContent = `${F.name} · จริง ${ks.length} วันล่าสุด + คาดการณ์ 7 วัน · ${F.fc.method === "holt-winters" ? "Holt-Winters รายสัปดาห์" : F.fc.method === "seasonal-naive" ? "ใช้ค่าสัปดาห์ก่อน (ข้อมูลยังน้อย)" : "ค่าเฉลี่ย (ข้อมูลยังน้อย)"}`;
    responsive(box, W => {
      box.replaceChildren();
      const narrow = W < 520, Hh = narrow ? 210 : 250, L = 40, R = 10, T = 12, B = 26;
      const all = [...ys.filter(iqFin), ...F.fc.hi, ...F.fc.mean, F.todaySoFar || 0];
      const ticks = niceTicks(Math.max(1, ...all)), max = ticks.at(-1);
      const x = i => L + (W - L - R) * i / Math.max(1, n - 1), y = v => T + (1 - v / max) * (Hh - T - B);
      const svg = el("svg:svg", { viewBox: `0 0 ${W} ${Hh}`, width: W, height: Hh, class: "iq-svg", role: "img", tabindex: 0, "aria-label": `${F.name} ${ks.length} วันล่าสุดและคาดการณ์ 7 วัน รวมคาดการณ์ ${nf(F.total.mean)} (${nf(F.total.lo)}–${nf(F.total.hi)}) วันผิดปกติ ${F.anomalies.length} วัน (ดูตัวเลขในตาราง)` }, box);
      ticks.forEach(v => { el("svg:line", { x1: L, x2: W - R, y1: y(v), y2: y(v), class: v === 0 ? "base" : "grid" }, svg); el("svg:text", { x: L - 6, y: y(v) + 4, "text-anchor": "end", class: "tick" }, svg, compact(v)); });
      const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor((W - L - R) / 58))));
      labels.forEach((l, i) => { if ((n - 1 - i) % every === 0) el("svg:text", { x: x(i), y: Hh - 6, "text-anchor": i === n - 1 ? "end" : "middle", class: "tick" }, svg, l); });
      // แถบพยากรณ์
      el("svg:rect", { x: x(h0 - 1), y: T, width: x(n - 1) - x(h0 - 1), height: Hh - T - B, class: "fc-zone" }, svg);
      const band = [...F.fc.hi.map((v, j) => `${x(h0 + j).toFixed(1)},${y(v).toFixed(1)}`), ...F.fc.lo.map((v, j) => `${x(h0 + j).toFixed(1)},${y(v).toFixed(1)}`).reverse()];
      const lastY = ys[ys.length - 1];
      if (iqFin(lastY)) { band.unshift(`${x(h0 - 1).toFixed(1)},${y(lastY).toFixed(1)}`); band.push(`${x(h0 - 1).toFixed(1)},${y(lastY).toFixed(1)}`); }
      el("svg:path", { d: "M" + band.join("L") + "Z", class: "fc-band" }, svg);
      let d = "", pen = false;
      ys.forEach((v, i) => { if (!iqFin(v)) { pen = false; return; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`; pen = true; });
      el("svg:path", { d, class: "line s1" }, svg);
      const fd = (iqFin(lastY) ? `M${x(h0 - 1).toFixed(1)},${y(lastY).toFixed(1)}` : "") + F.fc.mean.map((v, j) => `${iqFin(lastY) || j ? "L" : "M"}${x(h0 + j).toFixed(1)},${y(v).toFixed(1)}`).join("");
      el("svg:path", { d: fd, class: "line fc" }, svg);
      if (F.todaySoFar != null) el("svg:circle", { cx: x(h0), cy: y(F.todaySoFar), r: 4, class: "dot-open" }, svg);
      ks.forEach((k, i) => { if (an.has(k)) el("svg:circle", { cx: x(i), cy: y(ys[i]), r: 6.5, class: "anom" }, svg); });
      const cross = el("svg:line", { y1: T, y2: Hh - B, class: "cross", visibility: "hidden" }, svg);
      bindIndex(svg, n, x, i => {
        cross.setAttribute("visibility", i < 0 ? "hidden" : "visible"); if (i < 0) return;
        cross.setAttribute("x1", x(i)); cross.setAttribute("x2", x(i));
        const rr = svg.getBoundingClientRect(), rows = [];
        if (i < h0) { rows.push(["จริง", iqFin(ys[i]) ? nf(ys[i]) : "–", "s1"]); const a = an.get(ks[i]); if (a) rows.push([`ผิดปกติ (คาดไว้ ${nf(Math.max(0, a.expected))})`, a.dir === "up" ? "สูง" : "ต่ำ", ""]); }
        else { const j = i - h0; rows.push(["คาดการณ์", nf(F.fc.mean[j]), "fc"], ["ช่วง 80%", `${nf(F.fc.lo[j])}–${nf(F.fc.hi[j])}`, ""]); if (j === 0 && F.todaySoFar != null) rows.push(["วันนี้ถึงตอนนี้", nf(F.todaySoFar), ""]); }
        showTip(svg, labels[i], rows, rr.left + x(i), rr.top + T);
      });
    });
    const T = F.total;
    $("#fcNote").textContent = `รวม 7 วันข้างหน้าคาดว่า ${nf(T.mean)} ${F.unit} (ช่วง 80%: ${nf(T.lo)}–${nf(T.hi)}) · วงกลมสีส้ม = วันที่ผิดปกติ (${F.anomalies.length} วันในประวัติ)${F.enough ? "" : " · ข้อมูลยังน้อย ความแม่นยำต่ำ"}`;
    $("#fcTable").replaceChildren();
    tableView($("#fcTable"), ["วันที่", "จริง", "คาดการณ์", "ต่ำ (80%)", "สูง (80%)", "หมายเหตุ"], [
      ...ks.map((k, i) => [dayLabel(k), iqFin(ys[i]) ? nf(ys[i]) : "–", "", "", "", an.has(k) ? `ผิดปกติ (คาดไว้ ${nf(Math.max(0, an.get(k).expected))})` : ""]),
      ...F.fkeys.map((k, j) => [dayLabel(k), j === 0 && F.todaySoFar != null ? nf(F.todaySoFar) + " (ถึงตอนนี้)" : "", nf(F.fc.mean[j]), nf(F.fc.lo[j]), nf(F.fc.hi[j]), ""])]);
  }

  // ---------- ความสัมพันธ์ ----------
  function scatter(parent, c) {
    const [X, Y] = [[], []]; c.x.forEach((v, i) => { if (iqFin(v) && iqFin(c.y[i])) { X.push(v); Y.push(c.y[i]); } });
    const W = 150, H = 104, L = 8, B = 8, T = 6, R = 6;
    const x0 = Math.min(...X), x1 = Math.max(...X), y0 = Math.min(...Y), y1 = Math.max(...Y);
    const sx = v => L + (x1 > x0 ? (v - x0) / (x1 - x0) : 0.5) * (W - L - R), sy = v => H - B - (y1 > y0 ? (v - y0) / (y1 - y0) : 0.5) * (H - T - B);
    const svg = el("svg:svg", { viewBox: `0 0 ${W} ${H}`, class: "iq-svg sc", role: "img", "aria-label": `แผนภาพการกระจาย ${c.xName} กับ ${c.yName} ${c.n} จุด` }, parent);
    el("svg:line", { x1: L, x2: W - R, y1: H - B, y2: H - B, class: "base" }, svg); el("svg:line", { x1: L, x2: L, y1: T, y2: H - B, class: "base" }, svg);
    X.forEach((v, i) => el("svg:circle", { cx: sx(v), cy: sy(Y[i]), r: 3.5, class: "dot s1 sc-d" }, svg));
    // เส้นแนวโน้ม (least squares)
    const mx = iqMean(X), my = iqMean(Y); let sxy = 0, sxx = 0; X.forEach((v, i) => { sxy += (v - mx) * (Y[i] - my); sxx += (v - mx) ** 2; });
    if (sxx > 0) { const b = sxy / sxx, a = my - b * mx; el("svg:line", { x1: sx(x0), x2: sx(x1), y1: sy(a + b * x0), y2: sy(a + b * x1), class: "sc-fit" }, svg); }
  }
  function renderCorr(A) {
    const card = $("#corrCard"), box = $("#corrBody"); box.replaceChildren();
    card.hidden = !A.corr.length;
    A.corr.forEach(c => {
      const row = el("div", { class: "corr" }, box);
      if (c.x.length) scatter(el("div", { class: "corr-sc" }, row), c);
      const t = el("div", { class: "corr-t" }, row);
      el("h3", {}, t, `${c.xName} กับ ${c.yName}`);
      const lv = c.enough ? LQStats.confLevel(c.p, true) : "insufficient";
      el("p", { class: "corr-r" }, t, c.r == null ? "คำนวณไม่ได้ (ค่าไม่เปลี่ยนเลย)" : `${LQStats.corrWord(c.r)} · r = ${c.r.toFixed(2)}${c.lo != null ? ` (95%: ${c.lo.toFixed(2)} ถึง ${c.hi.toFixed(2)})` : ""} · ${c.n} จุด`);
      el("p", { class: "corr-s" }, t, c.enough ? LQStats.TH_CONF[lv] : `ข้อมูลยังน้อย (${c.n} จุด ต้องมีอย่างน้อย 8)`);
      el("p", { class: "corr-c" }, t, "ข้อควรระวัง: " + c.caution);
    });
  }

  // ---------- A/B ----------
  function ciRows(parent, groups, { pct = true, name }) {
    const list = el("div", { class: "ab", role: "list", "aria-label": name }, parent);
    const hi = Math.min(1, Math.max(...groups.map(g => (g.ci.hi ?? g.ci.mean ?? g.ci.p) || 0)) * 1.05 || 1);
    groups.forEach(g => {
      const m = g.ci.p ?? g.ci.mean, lo = g.ci.lo ?? m, up = g.ci.hi ?? m;
      const row = el("div", { class: "ab-row" + (g.enough ? "" : " few"), role: "listitem", tabindex: 0 }, list);
      el("div", { class: "ab-l" }, row, g.name);
      const tr = el("div", { class: "ab-t" }, row);
      const wk = el("i", { class: "ab-w" }, tr); wk.style.left = (Math.max(0, lo) / hi * 100) + "%"; wk.style.width = Math.max(0.5, (Math.min(hi, up) - Math.max(0, lo)) / hi * 100) + "%";
      const dot = el("i", { class: "ab-d" }, tr); dot.style.left = (m / hi * 100) + "%";
      el("div", { class: "ab-v" }, row, `${pct ? Math.round(m * 100) + "%" : m.toFixed(2)}${g.enough ? "" : " *"}`);
      const tipRows = [[name, pct ? (m * 100).toFixed(1) + "%" : m.toFixed(2), "s1"], ["ช่วง 95%", g.ci.lo == null ? "–" : `${(lo * 100).toFixed(1)}–${(up * 100).toFixed(1)}%`, ""], [g.n != null ? `จาก ${nf(g.n)} ${g.x != null ? "คนผ่านจอ" : "ครั้ง"}` : "", ""]];
      const show = e => { const b = row.getBoundingClientRect(); showTip(row, g.name, tipRows, e?.clientX ?? b.left + b.width / 2, b.top); };
      row.addEventListener("pointerenter", show); row.addEventListener("pointerdown", show); row.addEventListener("focus", () => show());
      row.addEventListener("pointerleave", e => { if (e.pointerType === "mouse") hideTip(row); }); row.addEventListener("blur", () => hideTip(row));
    });
  }
  function renderAB(A) {
    const card = $("#abCard"), box = $("#abBody"); box.replaceChildren();
    card.hidden = !A.ab.sg && !A.ab.neuro;
    const block = (title, ab, opts, verdict) => {
      el("h3", { class: "sub-h" }, box, title);
      ciRows(box, ab.groups, opts);
      el("p", { class: "note" }, box, verdict);
    };
    if (A.ab.sg) {
      const ab = A.ab.sg, t = ab.spread || ab.test;
      block("ป้ายโฆษณา: อัตรามองจอต่อโฆษณา", ab, { pct: true, name: "อัตรามอง" }, ab.enough && t ? `ดีที่สุด “${ab.best.name}” ต่างจากต่ำสุด ${(t.diff * 100).toFixed(1)} จุด (95%: ${(t.lo * 100).toFixed(1)} ถึง ${(t.hi * 100).toFixed(1)}) · ${LQStats.TH_CONF_SHORT[LQStats.confLevel(t.p, true)]} · เส้นแนวนอน = ช่วงความเชื่อมั่น 95% (Wilson)` : "ข้อมูลยังน้อย — ต้องมีคนผ่านจออย่างน้อย 30 คนต่อโฆษณา");
    }
    if (A.ab.neuro) {
      const ab = A.ab.neuro, t = ab.spread || ab.test;
      block("วิเคราะห์อารมณ์: สัดส่วนอารมณ์บวกต่อสื่อ", ab, { pct: true, name: "อารมณ์บวกเฉลี่ย" }, ab.enough && t ? `ดีที่สุด “${ab.best.name}” ต่างจากต่ำสุด ${(t.diff * 100).toFixed(1)} จุด (95%: ${(t.lo * 100).toFixed(1)} ถึง ${(t.hi * 100).toFixed(1)}, Welch t) · ${LQStats.TH_CONF_SHORT[LQStats.confLevel(t.p, true)]} · * = ผู้ทดสอบไม่ถึง 3 คน` : "ข้อมูลยังน้อย — ควรมีผู้ทดสอบอย่างน้อย 3 คนต่อสื่อ (* = ยังไม่ถึง)");
    }
  }

  // ---------- แยกกล้อง/เครื่อง ----------
  function renderCams(A) {
    const card = $("#camCard"), box = $("#camBody"); box.replaceChildren();
    card.hidden = A.cams.length < 2;
    if (card.hidden) return;
    const t = el("table", { class: "cams" }, el("div", { class: "tw" }, box)), hr = el("tr", {}, el("thead", {}, t));
    ["จุดนับ", "คนเข้า", "สัดส่วน", "เทียบช่วงก่อน", "แนวโน้ม"].forEach((h, i) => el("th", { class: i && i < 4 ? "n" : "", scope: "col" }, hr, h));
    const tb = el("tbody", {}, t);
    A.cams.forEach(c => {
      const tr = el("tr", {}, tb);
      const nm = el("th", { scope: "row" }, tr, c.name); if (c.node) el("span", { class: "tag" }, nm, "เครื่องลูก");
      el("td", { class: "n" }, tr, nf(c.in));
      const sh = el("td", { class: "n" }, tr); const bar = el("span", { class: "share" }, sh); el("i", {}, bar).style.width = ((c.share || 0) * 100) + "%"; sh.append(c.share == null ? "–" : Math.round(c.share * 100) + "%");
      el("td", { class: "n" }, tr, c.test && iqFin(c.test.change) ? `${c.test.change >= 0 ? "▲" : "▼"} ${Math.abs(Math.round(c.test.change * 100))}% · ${LQStats.TH_CONF_SHORT[c.test.level]}` : "–");
      const sp = el("td", { class: "spk" }, tr); sparkline(sp, c.spark, c.name);
    });
    $("#camNote").textContent = "เทียบเป็นค่าต่อวันที่มีข้อมูล (exact Poisson test) · จุดที่เป็นเครื่องลูกส่งเฉพาะตัวเลขสรุปมาที่เครื่องหลัก";
  }

  // ---------- ลูกค้ากลับมาซ้ำ ----------
  function renderCohort(A) {
    const card = $("#cohortCard"), box = $("#cohortBody"); box.replaceChildren();
    const C = A.cohort;
    card.hidden = !C && !A.boothReturn;
    if (card.hidden) return;
    if (C) {
      el("p", { class: "big" }, box, `${Math.round((C.repeatRate || 0) * 100)}% ของลูกค้าที่จดจำได้กลับมาซื้อมากกว่า 1 สัปดาห์`);
      el("p", { class: "muted" }, box, `${nf(C.repeat)} จาก ${nf(C.customers)} คน · 95%: ${C.repeatCI ? `${Math.round(C.repeatCI.lo * 100)}–${Math.round(C.repeatCI.hi * 100)}%` : "–"}${C.customers < 10 ? " · ข้อมูลยังน้อย" : ""}`);
      const maxAge = Math.min(6, Math.max(...C.rows.map(r => r.retention.length)) - 1);
      const t = el("table", { class: "cohort" }, el("div", { class: "tw" }, box)), hr = el("tr", {}, el("thead", {}, t));
      el("th", { scope: "col" }, hr, "สัปดาห์ที่เริ่ม"); el("th", { scope: "col", class: "n" }, hr, "คน");
      for (let k = 1; k <= maxAge; k++) el("th", { scope: "col", class: "n" }, hr, "+" + k);
      const tb = el("tbody", {}, t);
      C.rows.forEach(r => {
        const tr = el("tr", {}, tb); el("th", { scope: "row" }, tr, dayLabel(iqAddDays(C.start, r.period * 7))); el("td", { class: "n" }, tr, nf(r.size));
        for (let k = 1; k <= maxAge; k++) { const v = r.retention[k]; const td = el("td", { class: "n rc" + (v == null ? "" : " h" + Math.min(5, Math.floor(v * 6))) }, tr, v == null ? "" : Math.round(v * 100) + "%"); if (v != null) td.title = `${Math.round(v * r.size)} จาก ${r.size} คน`; }
      });
      el("p", { class: "note" }, box, "แต่ละแถว = ลูกค้าที่ซื้อครั้งแรกในสัปดาห์นั้น · +1 = สัดส่วนที่กลับมาซื้อในสัปดาห์ถัดไป · นับเฉพาะลูกค้าที่ยินยอมให้จดจำ");
    }
    if (A.boothReturn && A.boothReturn.n) el("p", { class: "muted" }, box, `บูธ: ผู้เข้าชมที่กลับมาซ้ำในงานเดียวกัน ${Math.round(A.boothReturn.p * 100)}% (95%: ${Math.round(A.boothReturn.lo * 100)}–${Math.round(A.boothReturn.hi * 100)}%) จาก ${nf(A.boothReturn.n)} คน`);
  }

  // ---------- เป้าหมาย ----------
  function renderGoals(A) {
    const box = $("#goalBody"); box.replaceChildren();
    const G = A.goals;
    if (!G.length) el("p", { class: "nodata" }, box, "ยังไม่ได้ตั้งเป้า — กรอกเป้าด้านล่างแล้วกดบันทึก");
    G.forEach(g => {
      const f = v => v == null ? "–" : g.fmt === "pct" ? (v * 100).toFixed(1) + "%" : g.fmt === "baht" ? baht(v) : nf(v);
      const row = el("div", { class: "goal" + (g.met ? " met" : "") }, box);
      const h = el("div", { class: "goal-h" }, row); el("b", {}, h, g.label); el("span", {}, h, `${f(g.actual)} / ${f(g.target)}`);
      const pr = el("div", { class: "goal-t", role: "progressbar", "aria-valuemin": 0, "aria-valuemax": 100, "aria-valuenow": Math.round(Math.min(1, g.progress || 0) * 100), "aria-label": g.label }, row);
      el("i", {}, pr).style.width = Math.min(100, (g.progress || 0) * 100) + "%";
      el("div", { class: "goal-s" }, row, g.actual == null ? "ไม่มีข้อมูลในช่วงนี้" : g.met ? "✓ ถึงเป้าแล้ว" : `ได้ ${Math.round((g.progress || 0) * 100)}% ของเป้า`);
    });
    const cur = loadJson(GOALS_KEY, {}), form = $("#goalForm");
    if (!form.dataset.built) {
      form.dataset.built = "1";
      IQ_GOAL_DEFS.forEach(g => { const l = el("label", {}, form.querySelector(".fields")); el("span", {}, l, `${g.label} (${g.unit})`); el("input", { type: "number", min: 0, step: "any", inputmode: "decimal", name: g.id }, l); });
    }
    IQ_GOAL_DEFS.forEach(g => { const i = form.elements[g.id]; if (document.activeElement !== i) i.value = cur[g.id] ?? ""; });
    $("#goalNote").textContent = (A.r.from === A.today && A.r.to === A.today ? "ช่วง “วันนี้” เทียบยอดถึงตอนนี้ (วันยังไม่จบ)" : "ค่าต่อวันเทียบกับค่าเฉลี่ยของวันที่จบแล้วในช่วงที่เลือก") + " · เก็บในเบราว์เซอร์นี้ (iq-goals)";
  }

  // ---------- กฎแจ้งเตือน ----------
  function renderAlertRules(D) {
    const R = iqAlertRules(loadJson(ALERTS_KEY, {})), form = $("#alertForm");
    const defs = [["occMax", `คนในร้านพร้อมกันเกิน (คน)${D.stCfg && D.stCfg.maxOcc ? ` · ว่าง = ใช้ค่าหน้าร้าน ${D.stCfg.maxOcc}` : ""}`], ["queueWaitMin", "เวลารอคิวเกิน (นาที)"], ["convDropPct", "อัตราซื้อลดลงจากสัปดาห์ก่อนเกิน (%)"], ["qcYieldMin", "อัตราผ่าน QC ต่ำกว่า (%)"]];
    if (!form.dataset.built) {
      form.dataset.built = "1";
      const fs = form.querySelector(".fields");
      defs.forEach(([k, label]) => { const l = el("label", {}, fs); el("span", { "data-k": k }, l, label); el("input", { type: "number", min: 0, step: "any", inputmode: "decimal", name: k, placeholder: "ปิด" }, l); });
      const l = el("label", { class: "chk" }, fs); el("input", { type: "checkbox", name: "notify" }, l); el("span", {}, l, "แจ้งเตือนผ่านเบราว์เซอร์ด้วย (เมื่อเปิดหน้านี้)");
    }
    defs.forEach(([k, label]) => { form.querySelector(`[data-k="${k}"]`).textContent = label; const i = form.elements[k]; if (document.activeElement !== i) i.value = R[k] ?? ""; });
    form.elements.notify.checked = R.notify;
    const perm = typeof Notification === "undefined" ? "unsupported" : Notification.permission;
    $("#notifyPerm").hidden = perm !== "default" || !R.notify;
    $("#alertNote").textContent = perm === "unsupported" ? "เบราว์เซอร์นี้ไม่รองรับการแจ้งเตือน จะแสดงเฉพาะบนหน้านี้" : perm === "denied" ? "เบราว์เซอร์ปิดการแจ้งเตือนของเว็บนี้ไว้ จะแสดงเฉพาะบนหน้านี้" : "ตรวจทุกครั้งที่เปิดหรือข้อมูลเปลี่ยน · ช่องว่าง = ปิดกฎนั้น";
  }

  // ---------- รายระบบ + เจาะลึก ----------
  function drill(card, x) {
    const d = el("details", { class: "drill" }, card);
    el("summary", {}, d, "เจาะลึกสถิติ");
    const s = x.desc, f = v => v == null ? "–" : x.unit === "บาท" ? baht(v) : nf(v);
    el("p", { class: "cap" }, d, `${x.name} · ${dayLabel(x.from)} – ${dayLabel(x.to)}`);
    const dl = el("dl", { class: "mod-s six" }, d);
    [["วันที่มีข้อมูล", nf(s.n)], ["เฉลี่ย", f(s.mean)], ["มัธยฐาน", f(s.median)], ["ส่วนเบี่ยงเบน", f(s.sd)], [`ต่ำสุด${x.minDay ? " (" + dayLabel(x.minDay) + ")" : ""}`, f(s.min)], [`สูงสุด${x.maxDay ? " (" + dayLabel(x.maxDay) + ")" : ""}`, f(s.max)]].forEach(([k, v]) => { const q = el("div", {}, dl); el("dt", {}, q, k); el("dd", {}, q, v); });
    if (s.cv != null) el("p", { class: "cap" }, d, `ความผันผวน (CV) ${(s.cv * 100).toFixed(0)}% — ${s.cv < 0.15 ? "ค่อนข้างคงที่" : s.cv < 0.35 ? "ผันผวนปานกลาง" : "ผันผวนมาก ควรดูเป็นค่าเฉลี่ยหลายวัน"}`);
    const wd = WD_ORDER.map(w => ({ label: "วัน" + IQ_WD[w], value: x.weekday[w] })).filter(r => r.value != null);
    if (wd.length >= 2) { el("p", { class: "cap" }, d, "ค่าเฉลี่ยตามวันในสัปดาห์"); hbars(el("div", { class: "mini" }, d), wd, x.unit === "บาท" ? "baht" : "int", "เฉลี่ย"); }
    el("p", { class: "cap" }, d, x.anomalies.length ? "วันที่ผิดปกติ: " + x.anomalies.map(a => `${dayLabel(a.day)} ${f(a.value)} (คาดไว้ ${f(Math.max(0, a.expected))})`).join(" · ") : s.n >= 14 ? "ไม่พบวันที่ผิดปกติในช่วงนี้" : "ต้องมีอย่างน้อย 14 วันจึงหาค่าผิดปกติได้");
  }
  function renderModules(D, r, A) {
    const M = iqMetrics(D, r), grid = $("#modules"); grid.replaceChildren();
    const B = iqBuckets(r);
    const timeChart = (box, metric, name, fmt) => {
      let b = B, v = iqSeries(D, r, metric);
      if (r.mode === "hour") { const t = iqTrimHours(b, [v]); b = t.buckets; v = t.series[0]; }
      if (!v.some(x => x > 0)) { el("p", { class: "nodata" }, box, "ไม่มีข้อมูลในช่วงนี้"); return; }
      const c = el("div", { class: "mini" }, box);
      columnChart(c, { labels: b.map(x => bucketLabel(x, r)), values: v, fmt, name });
    };
    const barChart = (box, id, fmt, name) => {
      const rows = iqModuleBars(D, r, id);
      if (!rows.length) { el("p", { class: "nodata" }, box, "ไม่มีข้อมูลในช่วงนี้"); return; }
      hbars(el("div", { class: "mini" }, box), rows, fmt, name);
    };
    const order = MODULES.slice().sort((a, b) => (has(b) - has(a)));
    function has(m) { return m.id === "photo" ? 0 : D[m.id] ? 1 : 0; }
    order.forEach(m => {
      const card = el("section", { class: "mod" + (has(m) ? "" : " off"), id: "mod-" + m.id, "aria-labelledby": "m-" + m.id }, grid);
      const head = el("div", { class: "mod-h" }, card);
      el("h3", { id: "m-" + m.id }, head, m.name);
      el("a", { class: "open", href: m.href }, head, "เปิดระบบ →");
      if (!has(m)) { el("p", { class: "nodata" }, card, m.id === "photo" ? "ยังไม่มีข้อมูล — ระบบนี้ไม่ได้เก็บสถิติการใช้งาน" : `ยังไม่มีข้อมูล — ${m.what}`); return; }
      const stats = el("dl", { class: "mod-s" }, card);
      const st = (k, v) => { const d = el("div", {}, stats); el("dt", {}, d, k); el("dd", {}, d, v); };
      const body = el("div", {}, card);
      if (m.id === "booth") { const x = M.booth; st("ผู้เข้าชม", nf(x.visitors)); st("หยุดชม", nf(x.stopped)); st("ร่วมกิจกรรม", nf(x.participants)); el("p", { class: "cap" }, body, `งาน: ${D.booth.event.name || "–"}`); timeChart(body, "booth", "ผู้เข้าชมบูธ", "int"); }
      if (m.id === "store") {
        const x = M.store; st("คนเข้าร้าน", nf(x.in)); st("สูงสุดในร้าน", nf(x.peak)); st("คิวสูงสุด", nf(x.maxQueue)); timeChart(body, "store", "คนเข้าร้าน", "int");
        if (Object.keys(x.byCam).length > 1) { el("p", { class: "cap" }, body, Object.keys(x.byCam).some(k => k.startsWith("n:") || k === "local") ? "คนเข้าแยกตามเครื่อง/กล้อง" : "คนเข้าแยกตามกล้อง"); barChart(body, "store", "int", "คนเข้า"); }
      }
      if (m.id === "fr" || m.id === "palm" || m.id === "fs") {
        const x = M[m.id]; st("ครั้งในช่วงนี้", nf(x.count)); st("รวมทั้งหมด", nf(x.total)); st("วันที่มีผู้ใช้", nf(x.days));
        el("p", { class: "cap" }, body, { fr: "ธาตุที่ได้ (สะสมทั้งหมด)", palm: "ประเภทมือ (สะสมทั้งหมด)", fs: "เลขกัว (สะสมทั้งหมด)" }[m.id]);
        barChart(body, m.id, "int", "ครั้ง");
      }
      if (m.id === "sg") { const x = M.sg; st("ผ่านหน้าจอ", nf(x.ots)); st("มองจอ", nf(x.viewers)); st("อัตรามอง", x.ots ? Math.round(x.viewers / x.ots * 100) + "%" : "–"); el("p", { class: "cap" }, body, `ยอดสะสมตั้งแต่ ${fmtDate(x.since)} · ผู้ชมต่อโฆษณา`); barChart(body, "sg", "int", "ผู้ชม (มองจอ)"); }
      if (m.id === "co") { const x = M.co; st("ยอดขาย", baht(x.revenue)); st("ใบเสร็จ", nf(x.receipts)); st("เฉลี่ย/ใบ", x.receipts ? baht(x.revenue / x.receipts) : "–"); timeChart(body, "coRevenue", "ยอดขายสแกน (บาท)", "baht"); }
      if (m.id === "cx") { const x = M.cx; st("ลูกค้ามาซื้อ", nf(x.customers)); st("แก้ว", nf(x.cups)); st("ยอดขาย", baht(x.revenue)); timeChart(body, "cxRevenue", "ยอดขายลูกค้าที่จดจำ (บาท)", "baht"); }
      if (m.id === "neuro") { const x = M.neuro; st("การทดสอบ", nf(x.sessions)); st("อารมณ์บวก", x.positive == null ? "–" : Math.round(x.positive * 100) + "%"); st("ค่าอารมณ์", x.valence == null ? "–" : (x.valence > 0 ? "+" : "") + x.valence.toFixed(2)); el("p", { class: "cap" }, body, "สัดส่วนเวลาที่อารมณ์เชิงบวก ต่อการทดสอบล่าสุด"); barChart(body, "neuro", "pct", "อารมณ์เชิงบวก"); }
      if (m.id === "att") { const x = M.att; st("ผู้เช็คชื่อ", nf(x.checkins)); st("รอบ", nf(x.sessions)); el("p", { class: "cap" }, body, "จำนวนผู้เช็คชื่อต่อรอบ"); barChart(body, "att", "int", "ผู้เช็คชื่อ"); }
      if (m.id === "qc") { const x = M.qc; st("ตรวจ", nf(x.total)); st("ผ่าน", x.yield == null ? "–" : (x.yield * 100).toFixed(1) + "%"); st("คัดทิ้ง", nf(x.reject)); el("p", { class: "cap" }, body, "สาเหตุที่คัดทิ้ง"); barChart(body, "qc", "int", "ขวดที่คัดทิ้ง"); }
      if (m.id === "dr") { const x = M.dr; st("เที่ยววิ่ง", nf(x.trips)); st("ชั่วโมงขับ", x.hours.toFixed(1)); st("คะแนนเฉลี่ย", x.safety == null ? "–" : Math.round(x.safety) + "/100"); el("p", { class: "cap" }, body, "เหตุการณ์แยกตามประเภท"); barChart(body, "dr", "int", "เหตุการณ์"); }
      if (A.drill[m.id]) drill(card, A.drill[m.id]);
    });
  }

  // ---------- รายงานพิมพ์ได้ ----------
  function buildReport(kind = "week") {
    const { D, A, cards } = analyze(kind === "day" ? "today" : "d7", { compare: kind === "day" ? "week" : "prev" });
    const R = iqReport(D, A, cards, kind), box = $("#report"); box.replaceChildren();
    el("h1", {}, box, `LENSIQ · ${R.title}`);
    el("p", { class: "rp-meta" }, box, `ช่วง ${dayLabel(R.from)}${R.from !== R.to ? " – " + dayLabel(R.to) : ""} · สร้างเมื่อ ${new Date(R.generatedAt).toLocaleString("th-TH")} · ข้อมูลจากเบราว์เซอร์เครื่องนี้`);
    el("h2", {}, box, "ตัวเลขสำคัญ");
    const t = el("table", {}, box), hr = el("tr", {}, el("thead", {}, t));
    ["ตัวชี้วัด", "ค่า", "เทียบช่วงก่อน", "ความมั่นใจ / ช่วง 95%"].forEach(h => el("th", {}, hr, h));
    const tb = el("tbody", {}, t);
    R.kpis.forEach(k => { const tr = el("tr", {}, tb); el("td", {}, tr, k.label); el("td", {}, tr, fmtVal(k.value, k.fmt)); el("td", {}, tr, iqFin(k.delta) ? `${k.delta >= 0 ? "+" : "−"}${Math.abs(Math.round(k.delta * 100))}%` : "–"); el("td", {}, tr, [k.sure, k.ci].filter(Boolean).join(" · ") || "–"); });
    if (R.alerts.length) { el("h2", {}, box, "การแจ้งเตือน"); const ul = el("ul", {}, box); R.alerts.forEach(a => el("li", {}, ul, `${a.title}: ${a.text}`)); }
    el("h2", {}, box, "สรุปผลอัตโนมัติ");
    R.insights.forEach(c => { const s = el("section", { class: "rp-ins" }, box); el("h3", {}, s, c.title); el("p", {}, s, c.body); el("p", { class: "rp-sure" }, s, "ความมั่นใจ: " + c.sure); if (c.why.length) el("p", {}, s, "เหตุผลที่เป็นไปได้: " + c.why.join(" · ")); el("p", {}, s, "ควรทำ: " + c.action); });
    if (R.forecast) { el("h2", {}, box, "คาดการณ์ 7 วันข้างหน้า"); el("p", {}, box, `${R.forecast.name} ราว ${nf(R.forecast.mean)} ${R.forecast.unit} (ช่วง 80%: ${nf(R.forecast.lo)}–${nf(R.forecast.hi)})`); }
    if (R.goals.length) { el("h2", {}, box, "เป้าหมาย"); const ul = el("ul", {}, box); R.goals.forEach(g => el("li", {}, ul, `${g.label}: ${g.actual == null ? "ไม่มีข้อมูล" : g.met ? "ถึงเป้า" : `ได้ ${Math.round(g.progress * 100)}% ของเป้า`}`)); }
    el("p", { class: "rp-foot" }, box, "ความมั่นใจคำนวณจากการทดสอบทางสถิติ (Poisson exact test, Wilson, Welch t) · ความสัมพันธ์ไม่ใช่หลักฐานของเหตุและผล");
    return R;
  }

  function renderEmptyList() {
    const ul = $("#emptyList"); ul.replaceChildren();
    MODULES.filter(m => m.id !== "photo").forEach(m => { const li = el("li", {}, ul); el("a", { href: m.href }, li, m.name); li.append(" — " + m.what); });
  }

  function renderData(snap) {
    const keys = Object.keys(snap).filter(k => !k.startsWith("iq-"));
    const bytes = keys.reduce((s, k) => s + k.length + (snap[k] || "").length, 0) * 2;
    $("#dataInfo").textContent = keys.length ? `ข้อมูลในเบราว์เซอร์นี้: ${keys.length} รายการ ประมาณ ${(bytes / 1024).toFixed(0)} KB` : "ยังไม่มีข้อมูลในเบราว์เซอร์นี้";
  }

  // ---------- IndexedDB ของระบบสแกนสินค้า (สินค้าและตัวอย่างที่สอน) ----------
  async function dbExists(name) { try { if (!indexedDB.databases) return true; return (await indexedDB.databases()).some(d => d.name === name); } catch { return false; } }
  function openCo() {
    return new Promise((res, rej) => {
      const r = indexedDB.open("co-checkout", 1);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore("products", { keyPath: "id" }); d.createObjectStore("samples", { keyPath: "key", autoIncrement: true }).createIndex("label", "label"); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  }
  async function readCo() {
    if (!window.indexedDB || !(await dbExists("co-checkout"))) return null;
    const db = await openCo();
    try {
      const all = s => new Promise((res, rej) => { const q = db.transaction(s).objectStore(s).getAll(); q.onsuccess = () => res(q.result); q.onerror = () => rej(q.error); });
      const [products, samples] = await Promise.all([all("products"), all("samples")]);
      if (!products.length && !samples.length) return null;
      return { products, samples: samples.map(s => ({ ...s, emb: Array.from(s.emb || []) })) };
    } finally { db.close(); }
  }
  async function writeCo(data) {
    const db = await openCo();
    try {
      await new Promise((res, rej) => {
        const t = db.transaction(["products", "samples"], "readwrite");
        ["products", "samples"].forEach(s => { if (Array.isArray(data[s])) { const os = t.objectStore(s); os.clear(); data[s].forEach(x => os.put(x)); } });
        t.oncomplete = res; t.onerror = t.onabort = () => rej(t.error);
      });
    } finally { db.close(); }
  }

  function download(name, text, type) {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => iqDay().replace(/-/g, "");

  // ---------- ปุ่ม ----------
  document.querySelector(".range").addEventListener("click", e => {
    const b = e.target.closest("button[data-p]"); if (!b) return;
    preset = b.dataset.p; try { localStorage.setItem(RANGE_KEY, preset); } catch {}
    if (preset === "custom" && !loadJson(CUSTOM_KEY, null)) saveJson(CUSTOM_KEY, { from: iqAddDays(iqDay(), -13), to: iqDay() });
    hideTip(); render();
  });
  $("#compare").addEventListener("change", e => { compare = e.target.value; try { localStorage.setItem(COMPARE_KEY, compare); } catch {} hideTip(); render(); });
  const onCustom = () => { const f = $("#cFrom").value, t = $("#cTo").value; if (f && t) { saveJson(CUSTOM_KEY, { from: f, to: t }); hideTip(); render(); } };
  $("#cFrom").addEventListener("change", onCustom); $("#cTo").addEventListener("change", onCustom);
  $("#insightMore").onclick = () => { showAll = !showAll; renderInsights(last.cards); };
  const numForm = (form, keys) => { const o = {}; keys.forEach(k => { const v = form.elements[k].value.trim(); o[k] = v === "" ? null : Math.max(0, +v); }); return o; };
  $("#goalForm").addEventListener("submit", e => { e.preventDefault(); const o = numForm(e.target, IQ_GOAL_DEFS.map(g => g.id)); Object.keys(o).forEach(k => { if (o[k] == null || !(o[k] > 0)) delete o[k]; }); saveJson(GOALS_KEY, o); $("#goalMsg").textContent = Object.keys(o).length ? `บันทึกเป้าแล้ว ${Object.keys(o).length} รายการ` : "ล้างเป้าทั้งหมดแล้ว"; render(); });
  $("#alertForm").addEventListener("submit", e => { e.preventDefault(); const o = numForm(e.target, ["occMax", "queueWaitMin", "convDropPct", "qcYieldMin"]); o.notify = e.target.elements.notify.checked; saveJson(ALERTS_KEY, o); $("#alertMsg").textContent = "บันทึกกฎแจ้งเตือนแล้ว"; render(); });
  $("#notifyPerm").onclick = async () => { try { await Notification.requestPermission(); } catch {} render(); };
  const doReport = kind => { buildReport(kind); document.body.classList.add("printing"); setTimeout(() => { try { print(); } finally { document.body.classList.remove("printing"); } }, 50); };
  $("#reportDay").onclick = () => doReport("day"); $("#reportWeek").onclick = () => doReport("week");
  $("#exportAnalysis").onclick = () => { const { D, A, cards } = last; download(`lensiq-analysis-${A.r.from}_${A.r.to}.json`, JSON.stringify(iqAnalysisJson(D, A, cards), null, 1), "application/json"); $("#reportMsg").textContent = "ส่งออกผลวิเคราะห์ (JSON) แล้ว — มีเฉพาะตัวเลขสรุป ไม่มีชื่อลูกค้า"; };
  $("#exportDaily").onclick = () => { const { A } = last; download(`lensiq-daily-${A.r.from}_${A.r.to}.csv`, iqAnalysisCsv(A), "text/csv;charset=utf-8"); $("#reportMsg").textContent = "ส่งออกตารางรายวันพร้อมพยากรณ์ (CSV) แล้ว"; };

  $("#exportJson").onclick = async () => {
    let idb = {};
    try { const co = await readCo(); if (co) idb["co-checkout"] = co; } catch (e) { console.warn(e); }
    const b = iqBackup(snapshot(), idb);
    download(`lensiq-backup-${stamp()}.json`, JSON.stringify(b), "application/json");
    msg(`ส่งออกแล้ว ${Object.keys(b.localStorage).length} รายการ${idb["co-checkout"] ? " พร้อมสินค้าและตัวอย่างที่สอนของระบบสแกนสินค้า" : ""}`, "ok");
  };
  $("#exportCsv").onclick = () => {
    const D = iqCollect(snapshot()), r = iqRange(preset, Date.now(), D, rangeOpt());
    download(`lensiq-summary-${r.from}_${r.to}.csv`, iqCsv(D, r), "text/csv;charset=utf-8");
    msg("ส่งออก CSV สรุปตามช่วงเวลาที่เลือกแล้ว", "ok");
  };
  $("#importFile").addEventListener("change", async e => {
    const f = e.target.files[0]; e.target.value = "";
    if (!f) return;
    let obj; try { obj = JSON.parse(await f.text()); } catch { return msg("อ่านไฟล์ไม่สำเร็จ: ไม่ใช่ไฟล์ JSON", "err"); }
    const v = iqValidateBackup(obj);
    if (!v.ok) return msg(v.error, "err");
    const when = obj.exportedAt ? new Date(obj.exportedAt).toLocaleString("th-TH") : "ไม่ทราบเวลา";
    if (!confirm(`กู้คืนข้อมูลจากไฟล์สำรอง (${when})?\n\n• ข้อมูลทุกระบบในเบราว์เซอร์นี้จะถูกแทนที่ด้วยข้อมูลในไฟล์ (${v.keys.length} รายการ)${v.idbStores.length ? "\n• สินค้าและตัวอย่างที่สอนของระบบสแกนสินค้าจะถูกแทนที่ด้วย" : ""}\n• ย้อนกลับไม่ได้ ควรส่งออกข้อมูลปัจจุบันเก็บไว้ก่อน`)) return;
    try {
      const cur = snapshot();
      Object.keys(cur).filter(k => k !== RANGE_KEY).forEach(k => localStorage.removeItem(k));
      v.keys.forEach(k => localStorage.setItem(k, obj.localStorage[k]));
      if (v.idbStores.length) await writeCo(obj.indexedDB["co-checkout"]);
      msg(`กู้คืนสำเร็จ ${v.keys.length} รายการ`, "ok");
    } catch (err) { console.error(err); msg("กู้คืนไม่สำเร็จ: " + (err.name === "QuotaExceededError" ? "พื้นที่จัดเก็บเต็ม" : err.message), "err"); }
    render();
  });
  const seed = () => {
    const snap = snapshot();
    if (iqHasDemo(snap)) return msg("มีข้อมูลตัวอย่างอยู่แล้ว", "warn");
    try {
      const out = iqBuildDemo(snap, Date.now(), (Date.now() / 1000) | 0);
      apply(out);
      msg(`สร้างข้อมูลตัวอย่างแล้ว (ทุกรายการมีป้าย "${IQ_DEMO_TAG}")${out.skipped.length ? " · ข้าม: " + out.skipped.join(", ") : ""} — เปิดแต่ละระบบเพื่อดูข้อมูลชุดเดียวกันได้`, "ok");
    } catch (err) { console.error(err); msg("สร้างข้อมูลตัวอย่างไม่สำเร็จ: " + (err.name === "QuotaExceededError" ? "พื้นที่จัดเก็บเต็ม" : err.message), "err"); }
    render();
  };
  $("#seedDemo").onclick = seed; $("#seedDemoEmpty").onclick = seed;
  const removeDemo = () => {
    if (!confirm("ลบข้อมูลตัวอย่างทั้งหมดออกจากทุกระบบ? (ข้อมูลจริงจะไม่ถูกลบ)")) return;
    const out = iqRemoveDemo(snapshot());
    apply(out);
    msg(out.kept.length ? `ลบข้อมูลตัวอย่างแล้ว ยกเว้น ${out.kept.length} รายการที่มีการบันทึกข้อมูลจริงเพิ่มหลังสร้างตัวอย่าง (${out.kept.join(", ")})` : "ลบข้อมูลตัวอย่างแล้ว", out.kept.length ? "warn" : "ok");
    render();
  };
  $("#removeDemo").onclick = removeDemo; $("#removeDemoBanner").onclick = removeDemo;

  // เชื่อมหลายเครื่อง: เครื่องหลักที่มีเซิร์ฟเวอร์ดึงยอด 31 วันล่าสุดมาแคช (st-agg-*) — ส่ง/รับเฉพาะตัวเลขสรุป
  async function refreshAgg() {
    let cfg = null; try { cfg = JSON.parse(localStorage.getItem("lq-agg")); } catch {}
    if (!IQ_AGG || !cfg || cfg.role !== "hub" || !cfg.code || /\.github\.io$/i.test(location.hostname) || location.protocol === "file:") return;
    const to = iqDay(), from = iqAddDays(to, -30);
    try {
      const r = await fetch(`/api/agg?from=${from}&to=${to}`, { headers: { Authorization: "Bearer " + IQ_AGG.normCode(cfg.code) }, cache: "no-store", credentials: "omit" });
      if (!r.ok) return;
      const j = await r.json(), dates = j && j.dates && typeof j.dates === "object" ? j.dates : {};
      const keys = new Set(Object.keys(dates).filter(d => IQ_AGG.DATE_RE.test(d) && d >= from && d <= to));
      for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^st-agg-\d{4}-\d{2}-\d{2}$/.test(k) && k.slice(7) >= from && k.slice(7) <= to) keys.add(k.slice(7)); }
      for (const d of keys) {
        const c = IQ_AGG.cacheFromServer(iqParse(localStorage.getItem("st-agg-" + d), null), dates[d]);
        if (c) localStorage.setItem("st-agg-" + d, JSON.stringify(c)); else localStorage.removeItem("st-agg-" + d);
      }
      render();
    } catch (e) { console.warn("agg", e && e.name); }
  }

  // อัปเดตเมื่อระบบอื่นในแท็บอื่นบันทึกข้อมูล
  addEventListener("storage", e => { if (!e.key || iqIsModuleKey(e.key)) render(); });
  render();
  refreshAgg();
})();
