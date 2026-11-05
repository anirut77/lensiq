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

/** คีย์ localStorage ที่เป็นข้อมูลของระบบในชุดเดโมนี้ */
function iqIsModuleKey(k) {
  return k === "booth-state" || k === "nm-sessions" || /^(cx|st|sg|co|att|qc|dr|iq)-/.test(k);
}

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
  const days = Object.keys(snap).filter(k => /^st-day-\d{4}-\d{2}-\d{2}$/.test(k)).sort().map(k => {
    const d = get(k, {}) || {};
    return { day: k.slice(7), in: d.in || 0, out: d.out || 0, peak: d.peak || 0, maxQueue: d.maxQueue || 0, hourlyIn: (d.hourly && d.hourly.in) || [], zones: d.zones || {}, demo: !!d.iqDemo };
  });
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
  return keys.length ? keys.sort()[0] : null;
}

/** preset: today | d7 | d30 | all → { from, to, mode, keys, prev } ; keys = รายชั่วโมง (today) หรือรายวัน */
function iqRange(preset, now, D) {
  const to = iqDay(now);
  const span = { today: 1, d7: 7, d30: 30 }[preset];
  let from = span ? iqAddDays(to, -(span - 1)) : (iqEarliest(D || {}) || to);
  if (from > to) from = to;
  const keys = [];
  for (let k = from; k <= to; k = iqAddDays(k, 1)) keys.push(k);
  const prev = span ? { from: iqAddDays(from, -span), to: iqAddDays(from, -1) } : null;
  return { preset, from, to, mode: preset === "today" ? "hour" : "day", keys, prev, days: keys.length };
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
    M.store = { in: iqSum(S.map(d => d.in)), peak: S.length ? Math.max(...S.map(d => d.peak)) : 0, maxQueue: S.length ? Math.max(...S.map(d => d.maxQueue)) : 0, days: S.filter(d => d.in > 0).length };
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

  // --- วิเคราะห์อารมณ์: 6 การทดสอบ (เพิ่มต่อท้าย)
  const ns = get("nm-sessions", []);
  if (!Array.isArray(ns) || !ns.some(s => s.iqDemo)) {
    const tests = [["โฆษณา Matcha Fizz 20 วิ", "video", 20, 0.35], ["โฆษณา Signature Latte", "video", 18, 0.1], ["บรรจุภัณฑ์ใหม่ ฉลากสีฟ้า", "image", 10, 0.25], ["บรรจุภัณฑ์ใหม่ ฉลากสีทอง", "image", 10, 0.05], ["โฆษณา แพ็กครอบครัว", "video", 24, 0.3], ["โฆษณา Collagen", "video", 15, -0.05]];
    const sessions = tests.map(([name, type, dur, mood], i) => {
      const date = new Date(now - (12 - i * 2) * IQ_DAY - ri(1, 6) * 3600000).toISOString(), samples = [];
      for (let t = 0; t <= dur; t += 0.5) {
        const face = R() < 0.95 ? 1 : 0;
        if (!face) { samples.push({ t, face: 0, att: 0, e: null, v: null, a: null, eng: 0 }); continue; }
        const wave = mood + 0.25 * Math.sin(t / dur * Math.PI * 2 + i) + rnd(-0.15, 0.15);
        const hap = Math.max(0, Math.min(0.9, wave)), neg = Math.max(0, Math.min(0.6, -wave * 0.8)), sur = rnd(0, 0.15), neu = Math.max(0, 1 - hap - neg - sur);
        const e = [neu, hap, sur, neg * 0.5, neg * 0.2, neg * 0.15, neg * 0.15].map(x => +x.toFixed(3));
        const v = e.reduce((s, p, k) => s + p * IQ_VA[IQ_EMO[k]][0], 0), a = e.reduce((s, p, k) => s + p * IQ_VA[IQ_EMO[k]][1], 0);
        const att = R() < 0.85 ? 1 : 0;
        samples.push({ t, face: 1, att, e, v: +v.toFixed(3), a: +a.toFixed(3), eng: +(att ? 1 - e[0] : 0).toFixed(3) });
      }
      return tag({ id: "iqdemo-ns-" + (i + 1), test: `${IQ_DEMO_TAG} ${name}`, pid: "P" + String(i % 3 + 1).padStart(2, "0"), date, media: `ตัวอย่าง-${i + 1}.${type === "video" ? "mp4" : "jpg"}`, type, duration: dur, samples });
    });
    appendArr("nm-sessions", sessions, s => Date.parse(s.date)); man.modules.push("neuro");
  }

  // --- จดจำลูกค้า: สมาชิก 12 คน + ออร์เดอร์ 30 วัน (ไม่มีข้อมูลใบหน้า จึงไม่ถูกสแกนจำผิดคน)
  const cm = get("cx-members", []);
  if (!Array.isArray(cm) || !cm.some(m => m.iqDemo)) {
    const members = IQ_NAMES.slice(0, 12).map((n, i) => tag({ id: "iqdemo-m" + (i + 1), name: `${IQ_DEMO_TAG} คุณ${n}`, phone: "", created: now - ri(31, 60) * IQ_DAY, consentAt: now - 40 * IQ_DAY }));
    const orders = []; let k = 0;
    for (let d = 29; d >= 0; d--) {
      const day = iqAddDays(today, -d), n = ri(3, 9);
      for (let i = 0; i < n; i++) {
        const time = timeOn(day, ri(7, 18), ri(0, 59)); if (time > now) continue;
        const m = members[Math.floor(Math.pow(R(), 1.6) * members.length)], dr = IQ_MENU[Math.floor(Math.pow(R(), 1.3) * IQ_MENU.length)], size = pick(["S", "M", "M", "L"]), qty = R() < 0.15 ? 2 : 1;
        const id = "iqdemo-o" + (++k);
        orders.push(tag({ id, ticket: id, mid: m.id, drinkId: dr.id, name: dr.name, cat: dr.cat, size, sweet: pick([0, 25, 50, 50, 100]), temp: pick(["เย็น", "เย็น", "ร้อน", "ปั่น"]), qty, price: dr.price + ({ S: 0, M: 10, L: 20 })[size], time }));
      }
    }
    appendArr("cx-members", members); appendArr("cx-orders", orders, o => o.time); man.modules.push("cx");
  }

  // --- หน้าร้าน: 30 วัน (เฉพาะวันที่ยังไม่มีข้อมูลจริง)
  let storeDays = 0;
  for (let d = 29; d >= 0; d--) {
    const day = iqAddDays(today, -d), key = "st-day-" + day;
    if (snap[key] != null) continue;
    const wk = new Date(iqDayStart(day)).getDay(), base = (wk === 0 || wk === 6) ? ri(190, 260) : ri(120, 190);
    const hin = Array(24).fill(0), hout = Array(24).fill(0), shape = [0, 0, 0, 0, 0, 0, 0, 0, 0, 3, 5, 7, 10, 9, 6, 6, 7, 9, 11, 10, 7, 4, 0, 0];
    const tot = iqSum(shape), curH = day === today ? new Date(now).getHours() : 24;
    let tin = 0;
    shape.forEach((w, h) => { if (h >= curH) return; const n = Math.round(base * w / tot * rnd(0.8, 1.2)); hin[h] = n; tin += n; });
    shape.forEach((w, h) => { if (h + 1 >= curH || h + 1 > 23) return; hout[h + 1] = Math.round(hin[h] * rnd(0.9, 1)); });
    if (day === today && tin === 0) continue;
    const tout = Math.min(tin, iqSum(hout)), peak = Math.max(...hin.map(n => Math.ceil(n / 3)), 1), peakH = hin.indexOf(Math.max(...hin));
    const shelf = Math.round(tin * rnd(0.55, 0.75)), cash = Math.round(tin * rnd(0.3, 0.45));
    const D0 = { date: day, in: tin, out: tout, occ: 0, peak, peakAt: timeOn(day, peakH, ri(0, 59)), maxQueue: ri(2, 7), hourly: { in: hin, out: hout },
      zones: { "iqdemo-z1": { name: `${IQ_DEMO_TAG} ชั้นวางน้ำดื่ม`, visits: shelf, dwellSum: shelf * ri(25, 60) * 1000, dwellN: shelf, peak: ri(3, 8) }, "iqdemo-z2": { name: `${IQ_DEMO_TAG} แคชเชียร์`, visits: cash, dwellSum: cash * ri(40, 90) * 1000, dwellN: cash, peak: ri(2, 6) } }, iqDemo: true };
    putNew(key, D0, { in: tin, out: tout }); storeDays++;
  }
  if (storeDays) man.modules.push("store");
  if (snap["st-heat"] == null) {
    const W = 64, H = 48, heat = new Array(W * H).fill(0);
    [[0.3, 0.7, 60], [0.55, 0.5, 90], [0.8, 0.75, 45], [0.45, 0.85, 30]].forEach(([px, py, w]) => {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const dx = x / W - px, dy = y / H - py; heat[y * W + x] += w * Math.exp(-(dx * dx + dy * dy) / 0.006); }
    });
    putNew("st-heat", heat.map(v => Math.round(v * 10) / 10), { sum: Math.round(iqSum(heat.map(v => Math.round(v * 10) / 10))) });
  }

  // --- ป้ายโฆษณา: สถิติสะสม 14 วัน (ข้ามถ้ามีสถิติจริงแล้ว)
  const sg = get("sg-stats", null);
  if (sg && sg.v === 1 && sg.totals && sg.totals.ots > 0 && !sg.iqDemo) skipped.push("ป้ายโฆษณา (มีสถิติจริงอยู่)");
  else if (!(sg && sg.iqDemo)) {
    const bands = ["u18", "18_34", "35_54", "55p"], demo = {}, hourly = {}, ads = {};
    bands.forEach(b => { demo[b] = { male: 0, female: 0, unk: 0 }; });
    let ots = 0, viewers = 0, attn = 0, dwell = 0;
    for (let h = 8; h <= 20; h++) {
      const o = ri(60, 160) + (h >= 11 && h <= 13 || h >= 17 && h <= 19 ? 80 : 0), v = Math.round(o * rnd(0.32, 0.5));
      hourly[String(h)] = { ots: o, viewers: v }; ots += o; viewers += v; attn += v * rnd(2.5, 5.5); dwell += o * rnd(3, 7);
      for (let i = 0; i < o; i++) { const b = bands[Math.min(3, Math.floor(Math.pow(R(), 0.9) * 4))], g = R() < 0.46 ? "male" : R() < 0.9 ? "female" : "unk"; if (R() < 0.92) demo[b][g]++; }
    }
    IQ_ADS.forEach(([id, title]) => { const o = Math.round(ots / 6 * rnd(0.7, 1.3)), v = Math.round(o * rnd(0.28, 0.55)), look = Math.round(v * rnd(8, 20)); ads[id] = { title, plays: ri(300, 520), ots: o, viewers: v, attn: +(v * rnd(2, 6)).toFixed(1), look, happy: Math.round(look * rnd(0.1, 0.45)) }; });
    const gestures = { swipe_left: ri(20, 60), swipe_right: ri(20, 60), pinch: ri(10, 40), hold: ri(5, 25), palm: ri(5, 20) };
    const st = { v: 1, since: now - 14 * IQ_DAY, ads, demo, hourly, totals: { ots, viewers, dwell: +dwell.toFixed(1), attn: +attn.toFixed(1) }, gestures, selects: { "p-sport": ri(10, 30), "p-classic": ri(5, 20) }, iqDemo: true };
    putNew("sg-stats", st, { ots }); man.modules.push("sg");
  }

  // --- สแกนสินค้า: ใบเสร็จ 30 วัน (เลขที่ขึ้นต้น DEMO- แยกจากเลขจริง)
  const sales = get("co-sales", []);
  if (!Array.isArray(sales) || !sales.some(o => o.iqDemo)) {
    const out = [];
    for (let d = 29; d >= 0; d--) {
      const day = iqAddDays(today, -d), n = ri(6, 18); let seq = 0;
      const ts = Array.from({ length: n }, () => timeOn(day, ri(8, 20), ri(0, 59), ri(0, 59))).filter(t => t <= now).sort((a, b) => a - b);
      ts.forEach(t => {
        const items = [], nl = ri(1, 3);
        for (let j = 0; j < nl; j++) { const p = pick(IQ_PRODUCTS); const ex = items.find(l => l.id === p[0]); if (ex) ex.qty++; else items.push({ id: p[0], name: p[1], sku: p[2], price: p[3], qty: ri(1, 3) }); }
        let satang = 0, qty = 0; items.forEach(l => { satang += l.price * 100 * l.qty; qty += l.qty; });
        const vat = Math.round(satang * 7 / 107);
        out.push(tag({ no: `DEMO-${day.replace(/-/g, "")}-${String(++seq).padStart(4, "0")}`, t, qty, lines: items.length, total: satang / 100, vat: vat / 100, net: (satang - vat) / 100, items, method: pick(["เงินสด", "QR พร้อมเพย์", "QR พร้อมเพย์", "บัตรเครดิต/เดบิต"]), cash: null, change: null }));
      });
    }
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

  // --- คนขับ: 8 เที่ยวใน 14 วัน
  const tr = get("dr-trips", []);
  if (!Array.isArray(tr) || !tr.some(t => t.iqDemo)) {
    const trips = [], events = [];
    for (let i = 0; i < 8; i++) {
      const id = "DEMO-T" + (i + 1), start = timeOn(iqAddDays(today, -(13 - i * 1.7 | 0)), ri(6, 14), ri(0, 59)); if (start > now) continue;
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
    if (k === "st-heat") return Array.isArray(v) && f && Math.abs(Math.round(iqSum(v)) - f.sum) <= 2;
    return false;
  };
  const singles = Object.keys(snap).filter(k => k === "booth-state" || k === "sg-stats" || k === "qc-shift" || k.startsWith("st-day-") || (k === "st-heat" && created.has(k)));
  singles.forEach(k => {
    const v = iqParse(snap[k], null);
    if (!v) return;
    const isDemo = k === "st-heat" ? true : !!v.iqDemo;
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

if (typeof module !== "undefined" && module.exports) module.exports = {
  iqDay, iqAddDays, iqDayStart, iqIsModuleKey, iqCollect, iqRange, iqMetrics, iqKpis, iqSeries, iqTrimHours, iqBuckets, iqFunnel, iqModuleBars, iqCsv,
  iqBuildDemo, iqHasDemo, iqRemoveDemo, iqBackup, iqValidateBackup, IQ_DEMO_KEY
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
  const PRESETS = [["today", "วันนี้"], ["d7", "7 วัน"], ["d30", "30 วัน"], ["all", "ทั้งหมด"]];
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
  try { const p = localStorage.getItem(RANGE_KEY); if (PRESETS.some(([k]) => k === p)) preset = p; } catch {}

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
  function render() {
    const snap = snapshot(), D = iqCollect(snap), r = iqRange(preset, Date.now(), D);
    const has = id => !!D[id];
    const any = MODULES.some(m => has(m.id));
    document.querySelectorAll(".range button").forEach(b => b.setAttribute("aria-pressed", String(b.dataset.p === preset)));
    $("#rangeNote").textContent = r.from === r.to ? `วันที่ ${dayLabel(r.from)}` : `${dayLabel(r.from)} – ${dayLabel(r.to)} (${r.days} วัน)`;
    const demo = iqHasDemo(snap);
    $("#demoBanner").hidden = !demo;
    $("#seedDemo").hidden = demo; $("#removeDemo").hidden = !demo;
    $("#seedDemoEmpty").hidden = demo;
    $("#empty").hidden = any; $("#dash").hidden = !any;
    renderData(snap);
    if (!any) { renderEmptyList(); return; }

    // KPI
    const K = iqKpis(D, r), kp = $("#kpis"); kp.replaceChildren();
    K.forEach(k => {
      const a = el("a", { class: "kpi", href: MODULES.find(m => m.id === k.id).href }, kp);
      el("div", { class: "k" }, a, k.label);
      el("div", { class: "v" }, a, fmtVal(k.value, k.fmt));
      if (k.delta != null) { const up = k.delta >= 0; el("div", { class: "d" }, a, `${up ? "▲" : "▼"} ${Math.abs(Math.round(k.delta * 100))}% เทียบ ${r.days} วันก่อนหน้า`); }
      el("div", { class: "s" }, a, k.sub);
    });

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

    renderFunnel(D, r);
    renderModules(D, r);
  }

  function renderFunnel(D, r) {
    const F = iqFunnel(D, r), box = $("#funnelBody"); box.replaceChildren();
    $("#funnel").hidden = F.count === 0;
    if (!F.count) return;
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
      el("div", { class: "fn-s" }, row, [s.src.note, s.ofPrev != null ? `${Math.round(s.ofPrev * 100)}% ของขั้นก่อนหน้า` : s.crossSource ? "คนละระบบกับขั้นก่อนหน้า จึงไม่คิดอัตรา" : ""].filter(Boolean).join(" · "));
    });
    $("#funnelNote").textContent = F.mixed ? "ขั้นตอนมาจากคนละระบบ ใช้ดูภาพรวมเท่านั้น ไม่ได้ติดตามคนคนเดียวกันข้ามระบบ" : "ทุกขั้นมาจากระบบเดียวกัน";
  }

  function renderModules(D, r) {
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
      const card = el("section", { class: "mod" + (has(m) ? "" : " off"), "aria-labelledby": "m-" + m.id }, grid);
      const head = el("div", { class: "mod-h" }, card);
      el("h3", { id: "m-" + m.id }, head, m.name);
      el("a", { class: "open", href: m.href }, head, "เปิดระบบ →");
      if (!has(m)) { el("p", { class: "nodata" }, card, m.id === "photo" ? "ยังไม่มีข้อมูล — ระบบนี้ไม่ได้เก็บสถิติการใช้งาน" : `ยังไม่มีข้อมูล — ${m.what}`); return; }
      const stats = el("dl", { class: "mod-s" }, card);
      const st = (k, v) => { const d = el("div", {}, stats); el("dt", {}, d, k); el("dd", {}, d, v); };
      const body = el("div", {}, card);
      if (m.id === "booth") { const x = M.booth; st("ผู้เข้าชม", nf(x.visitors)); st("หยุดชม", nf(x.stopped)); st("ร่วมกิจกรรม", nf(x.participants)); el("p", { class: "cap" }, body, `งาน: ${D.booth.event.name || "–"}`); timeChart(body, "booth", "ผู้เข้าชมบูธ", "int"); }
      if (m.id === "store") { const x = M.store; st("คนเข้าร้าน", nf(x.in)); st("สูงสุดในร้าน", nf(x.peak)); st("คิวสูงสุด", nf(x.maxQueue)); timeChart(body, "store", "คนเข้าร้าน", "int"); }
      if (m.id === "sg") { const x = M.sg; st("ผ่านหน้าจอ", nf(x.ots)); st("มองจอ", nf(x.viewers)); st("อัตรามอง", x.ots ? Math.round(x.viewers / x.ots * 100) + "%" : "–"); el("p", { class: "cap" }, body, `ยอดสะสมตั้งแต่ ${fmtDate(x.since)} · ผู้ชมต่อโฆษณา`); barChart(body, "sg", "int", "ผู้ชม (มองจอ)"); }
      if (m.id === "co") { const x = M.co; st("ยอดขาย", baht(x.revenue)); st("ใบเสร็จ", nf(x.receipts)); st("เฉลี่ย/ใบ", x.receipts ? baht(x.revenue / x.receipts) : "–"); timeChart(body, "coRevenue", "ยอดขายสแกน (บาท)", "baht"); }
      if (m.id === "cx") { const x = M.cx; st("ลูกค้ามาซื้อ", nf(x.customers)); st("แก้ว", nf(x.cups)); st("ยอดขาย", baht(x.revenue)); timeChart(body, "cxRevenue", "ยอดขายลูกค้าที่จดจำ (บาท)", "baht"); }
      if (m.id === "neuro") { const x = M.neuro; st("การทดสอบ", nf(x.sessions)); st("อารมณ์บวก", x.positive == null ? "–" : Math.round(x.positive * 100) + "%"); st("ค่าอารมณ์", x.valence == null ? "–" : (x.valence > 0 ? "+" : "") + x.valence.toFixed(2)); el("p", { class: "cap" }, body, "สัดส่วนเวลาที่อารมณ์เชิงบวก ต่อการทดสอบล่าสุด"); barChart(body, "neuro", "pct", "อารมณ์เชิงบวก"); }
      if (m.id === "att") { const x = M.att; st("ผู้เช็คชื่อ", nf(x.checkins)); st("รอบ", nf(x.sessions)); el("p", { class: "cap" }, body, "จำนวนผู้เช็คชื่อต่อรอบ"); barChart(body, "att", "int", "ผู้เช็คชื่อ"); }
      if (m.id === "qc") { const x = M.qc; st("ตรวจ", nf(x.total)); st("ผ่าน", x.yield == null ? "–" : (x.yield * 100).toFixed(1) + "%"); st("คัดทิ้ง", nf(x.reject)); el("p", { class: "cap" }, body, "สาเหตุที่คัดทิ้ง"); barChart(body, "qc", "int", "ขวดที่คัดทิ้ง"); }
      if (m.id === "dr") { const x = M.dr; st("เที่ยววิ่ง", nf(x.trips)); st("ชั่วโมงขับ", x.hours.toFixed(1)); st("คะแนนเฉลี่ย", x.safety == null ? "–" : Math.round(x.safety) + "/100"); el("p", { class: "cap" }, body, "เหตุการณ์แยกตามประเภท"); barChart(body, "dr", "int", "เหตุการณ์"); }
    });
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
    hideTip(); render();
  });

  $("#exportJson").onclick = async () => {
    let idb = {};
    try { const co = await readCo(); if (co) idb["co-checkout"] = co; } catch (e) { console.warn(e); }
    const b = iqBackup(snapshot(), idb);
    download(`lensiq-backup-${stamp()}.json`, JSON.stringify(b), "application/json");
    msg(`ส่งออกแล้ว ${Object.keys(b.localStorage).length} รายการ${idb["co-checkout"] ? " พร้อมสินค้าและตัวอย่างที่สอนของระบบสแกนสินค้า" : ""}`, "ok");
  };
  $("#exportCsv").onclick = () => {
    const D = iqCollect(snapshot()), r = iqRange(preset, Date.now(), D);
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

  // อัปเดตเมื่อระบบอื่นในแท็บอื่นบันทึกข้อมูล
  addEventListener("storage", e => { if (!e.key || iqIsModuleKey(e.key)) render(); });
  render();
})();
