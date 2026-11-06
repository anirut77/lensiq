/* insights-cards.js — แดชบอร์ดรวม LENSIQ: แปลผลเป็นภาษาคน (การ์ดสรุปอัตโนมัติ) รายงาน และส่งออกผลวิเคราะห์
   ไม่ใช้ DOM จึงทดสอบด้วย Node ได้ · UMD: เบราว์เซอร์ = window.LQInsightsCards · Node = require("./insights-cards.js") */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./insights-data.js"), require("./insights-analysis.js"), require("./lensiq-stats.js"));
  else root.LQInsightsCards = factory(root.LQInsightsData, root.LQInsightsAnalysis, root.LQStats);
})(typeof self !== "undefined" ? self : this, function (M_data, M_analysis, LQStats) {
"use strict";
  const { iqT, IQ_QC_REASONS, IQ_DR_TYPES, iqPad, iqMean, iqSum, iqMetrics, iqCsvCell } = M_data;
  const { IQ_ST, IQ_WD, iqFin, iqN, iqP, iqChg, iqPts, iqB, iqDL, iqWdOf, iqPick, iqWin, iqWinKeys } = M_analysis;

/* ---------- ข้อความ: ไทยเป็นค่าเริ่มต้น ; มี LQI18N (lensiq-i18n.js) = แปลตามภาษาที่เลือก ----------
   T(key, thai, vars): {name} ในข้อความถูกแทนด้วย vars ; TN(thai) = ใช้ข้อความไทยเป็นคีย์ (ชื่อตัวชี้วัด วัน เหตุผล QC) */
const T = iqT;
const TN = thai => T(thai, thai);
const wdName = wd => T("iq.wd." + wd, IQ_WD[wd]);
/** ปัดตัวเลขให้อ่านง่าย: ≥ 100 ปัดหลักสิบ/ร้อยตามขนาด ; ต่ำกว่านั้นจำนวนเต็ม */
const iqRound = v => !iqFin(v) ? "–" : Math.abs(v) >= 10000 ? iqN(Math.round(v / 100) * 100) : Math.abs(v) >= 1000 ? iqN(Math.round(v / 10) * 10) : iqN(Math.round(v));
/** ระดับความมั่นใจแบบสั้น (คำเดียว) ใช้ในบรรทัด “ความมั่นใจ:” */
const IQ_LV_WORD = { strong: "สูง", moderate: "ปานกลาง", weak: "ต่ำ", none: "ต่ำ", insufficient: "ยังบอกไม่ได้" };
/** ข้อความความมั่นใจตามชนิดคำถาม: change | corr | diff — “น่าจะเปลี่ยนจริง” / “อาจเป็นแค่ความผันผวนรายวัน” ฯลฯ */
function iqSure(level, ciText, kind = "change") {
  const base = T(`iq.conf.${kind}.${level}`, IQ_ST.plainConf(level, kind));
  return ciText ? `${base} · ${ciText}` : base;
}
/** ข้อความอธิบายตัวเลขทางสถิติ (แสดงในส่วนรายละเอียดของการ์ด) — p อธิบายตามความหมายจริง ไม่ใช่ “โอกาสที่เป็นความบังเอิญ” */
function iqStat(t, kind = "change", extra = "") {
  if (!t || !iqFin(t.p) || t.level === "insufficient") return "";
  return IQ_ST.pTextTH(t.p, { kind, q: t.q, m: t.m }) + (extra ? ` · ${extra}` : "");
}
const IQ_LEVEL_W = { strong: 3, moderate: 2.2, weak: 1.2, none: 0.6, insufficient: 0.5 };
const sig = lv => lv === "strong" || lv === "moderate";
/** ช่วง 95% แบบภาษาง่าย (ปัดเป็น %) */
const rangeTxt = (lo, hi) => iqFin(lo) && iqFin(hi) ? T("iq.range95", "น่าจะอยู่ระหว่าง {lo} ถึง {hi}", { lo: iqChg(lo), hi: iqChg(hi) }) : "";

/** คำอธิบายตัวเลขแต่ละตัว (แสดงเมื่อกด “ตัวเลขนี้คืออะไร”) */
const IQ_EXPLAIN = {
  booth: "จำนวนคนที่กล้องหน้าบูธเห็นอย่างน้อย 1 วินาที “หยุดชม” = อยู่หน้าบูธตั้งแต่ 5 วินาที",
  store: "จำนวนคนที่เดินข้ามเส้นนับเข้าประตูร้าน (รวมทุกกล้อง) เทียบกับช่วงก่อนเป็นค่าต่อวัน ปรับผลของวันในสัปดาห์แล้ว",
  conv: "บิลขาย ÷ คนเข้าร้าน นับจากคนละระบบ จึงเป็นค่าประมาณ (คนที่มาด้วยกันมักจ่ายบิลเดียว)",
  sg: "คนที่หันมองจอ ÷ คนที่ผ่านหน้าจอ เป็นยอดสะสมตั้งแต่เริ่มใช้ ไม่แยกรายวัน",
  co: "ยอดเงินจากระบบสแกนสินค้า การเทียบความมั่นใจคิดจากจำนวนบิล (ยอดเงินแกว่งตามขนาดบิลมากเกินกว่าจะทดสอบตรง ๆ)",
  cx: "จำนวนลูกค้าที่ยินยอมให้จดจำใบหน้าและมาซื้อในช่วงนี้ (นับคนละครั้ง)",
  neuro: "สัดส่วนเวลาที่สีหน้าผู้ทดสอบเป็นเชิงบวกระหว่างดูสื่อ เฉลี่ยทุกการทดสอบ",
  att: "จำนวนครั้งที่เช็คชื่อด้วยใบหน้าสำเร็จ",
  qc: "ขวดที่ผ่านการตรวจ ÷ ขวดที่ตรวจทั้งหมด ช่วง 95% บอกว่าอัตราจริงน่าจะอยู่ตรงไหน",
  dr: "คะแนน 0–100 ต่อเที่ยว หักตามเหตุการณ์ง่วง/ละสายตาต่อชั่วโมงขับ"
};

function iqInsights(D, A) {
  const S = IQ_ST, r = A.r, C = [], seed = r.from + r.to;
  const add = c => { c.score = (c.score || 1); C.push(c); };
  const vsTxt = r.compare === "week" ? T("iq.vs.week", "ช่วงเดียวกันสัปดาห์ก่อน") : r.days === 1 ? T("iq.vs.yday", "เมื่อวาน") : T("iq.vs.prev", "{n} วันก่อนหน้า", { n: r.days });
  const pk = A.heat && A.heat.top[0], lowH = A.heat && A.heat.low;
  const slot = (wd, h) => T("iq.slot", "วัน{wd} {h1}–{h2} น.", { wd: wdName(wd), h1: iqPad(Math.max(0, h - 1)) + ":00", h2: iqPad(Math.min(23, h + 1)) + ":59" });
  const Q = A.quality || { outages: [], sources: [] };

  if (A.short) add({ id: "short", kind: "info", tone: "info", module: "all", level: "insufficient", title: T("iq.short.title", "ข้อมูลยังน้อย"),
    body: T("iq.short.body", "มีข้อมูลแค่ {n} วัน ตัวเลขที่เห็นเป็นของจริง แต่ยังเทียบ หาวันผิดปกติ หรือคาดการณ์ได้ไม่แม่น", { n: iqN(A.dataDays) }),
    sure: iqSure("insufficient"), why: [T("iq.short.why", "การเทียบแนวโน้มต้องมีอย่างน้อย 7 วัน การคาดการณ์ตามวันในสัปดาห์ต้องมีราว 3 สัปดาห์")],
    action: T("iq.short.act", "เปิดระบบเก็บข้อมูลทุกวันต่อเนื่องอีก 1–3 สัปดาห์ แล้วกลับมาดูหน้านี้"), score: 2.5 });

  (A.alerts || []).forEach(a => add({ id: "alert-" + a.id, kind: "info", tone: "bad", module: "alert", level: "strong", title: TN(a.title), body: a.text, sure: T("iq.alert.sure", "เกิดขึ้นจริงตามข้อมูลวันนี้ ไม่ใช่การคาดการณ์"), why: [], action: TN(a.action), score: a.level === "high" ? 9 : 6 }));

  // ความน่าเชื่อถือของข้อมูล (ข้อมูลหาย / กล้องดับ) — บอกก่อน เพราะกระทบทุกตัวเลข
  if (Q.outages.length || Q.sources.some(x => x.missing && x.missing.length)) {
    const st = Q.outages.filter(o => o.kind === "store"), cam = Q.outages.filter(o => o.kind === "camera"), miss = Q.sources.filter(x => x.missing && x.missing.length);
    const parts = [];
    if (st.length) parts.push(T("iq.q.outage", "กล้องหน้าร้านน่าจะดับ {n} ครั้ง ({list})", { n: st.length, list: st.slice(0, 3).map(o => `${iqDL(o.day)} ${iqPad(o.from)}:00–${iqPad(o.to)}:59`).join(", ") }));
    if (cam.length) parts.push(T("iq.q.cam", "กล้อง{name}นับได้ 0 คน {n} วัน", { name: cam[0].name, n: cam.length }));
    miss.forEach(x => parts.push(T("iq.q.miss", "{name} ไม่มีข้อมูล {n} วัน", { name: TN(x.name), n: x.missing.length })));
    const lost = iqSum(Q.outages.map(o => o.lost || 0));
    add({ id: "quality", kind: "info", tone: "warn", module: "quality", level: Q.outages.length ? "moderate" : "weak",
      title: T("iq.q.title", "ข้อมูลบางช่วงไม่ครบ"), body: parts.join(" · ") + (lost > 0 ? T("iq.q.lost", " · คนที่น่าจะนับตกไปราว {n} คน", { n: iqRound(lost) }) : ""),
      sure: T("iq.q.sure", "ดูจากชั่วโมงที่ปกติมีคนแต่กลับเป็นศูนย์ติดกันหลายชั่วโมง"), why: Q.anomalyOutage.length ? [T("iq.q.why", "วันผิดปกติ {d} น่าจะมาจากกล้องดับ ไม่ใช่ลูกค้าหายจริง", { d: Q.anomalyOutage.map(iqDL).join(", ") })] : [],
      action: st.length ? T("iq.q.act", "ตรวจไฟและอินเทอร์เน็ตของกล้องหน้าร้าน แล้วระวังการอ่านตัวเลขของวันที่ {d}", { d: iqDL(st[st.length - 1].day) }) : T("iq.q.act2", "เปิดระบบให้ครบทุกวันทำการ ตัวเลขเทียบช่วงจะเชื่อถือได้มากขึ้น"), score: 3 });
  }

  // คนเข้าร้าน เทียบช่วงก่อน
  const ks = A.kpis.find(k => k.id === "store");
  if (ks && ks.test) {
    const t = ks.test, ch = iqFin(t.adjChange) ? t.adjChange : t.change, up = ch > 0, flat = !iqFin(ch) || !sig(t.level);
    const why = [];
    const H = A.H, wkend = (f, to) => iqWinKeys(H, f, to).filter((k, i) => [0, 6].includes(iqWdOf(k)) && iqFin(iqWin(H, H.storeIn, f, to)[i])).length;
    const w1 = wkend(r.from, r.to), w2 = wkend(r.prev.from, r.prev.to);
    if (w1 !== w2 && r.days > 1) why.push(T("iq.store.why.wkend", "ช่วงนี้มีเสาร์–อาทิตย์ {a} วัน ช่วงก่อนมี {b} วัน (ระบบปรับเรื่องนี้ให้แล้ว)", { a: w1, b: w2 }));
    const anIn = A.forecast && A.forecast.metric === "storeIn" ? A.forecast.anomalies.filter(a => a.day >= r.from && a.day <= r.to) : [];
    if (anIn.length) why.push(T("iq.store.why.anom", "มีวันผิดปกติในช่วงนี้ {n} วัน ({list})", { n: anIn.length, list: anIn.map(a => `${iqDL(a.day)} ${a.dir === "up" ? T("iq.high", "สูง") : T("iq.low", "ต่ำ")}`).join(", ") }));
    if (Math.abs(t.e1 - t.e2) >= 1) why.push(T("iq.store.why.days", "จำนวนวันที่มีข้อมูลไม่เท่ากัน ({a} กับ {b} วัน) จึงเทียบเป็นค่าต่อวัน", { a: iqN(t.e1, 1), b: iqN(t.e2, 1) }));
    const camMove = (A.cams || []).filter(c => c.test && iqFin(c.test.change) && c.test.level !== "insufficient").sort((a, b) => Math.abs(b.test.change) - Math.abs(a.test.change))[0];
    if (camMove && A.cams.length > 1) why.push(T("iq.store.why.cam", "จุดที่เปลี่ยนมากสุดคือ {name} ({chg})", { name: camMove.name, chg: iqChg(camMove.test.change) }));
    if (t.ar && t.ar.share >= 0.2) why.push(T("iq.store.why.drift", "ยอดรายวันของร้านนี้มักสูงหรือต่ำต่อเนื่องหลายวัน ระบบจึงเผื่อความไม่แน่นอนไว้มากขึ้น"));
    const out = Q.outages.filter(o => o.kind === "store" && o.day >= r.from && o.day <= r.to);
    if (out.length) why.push(T("iq.store.why.out", "กล้องดับบางชั่วโมงในช่วงนี้ {n} วัน ยอดจริงอาจสูงกว่าที่เห็น", { n: out.length }));
    const pct = iqChg(ch).replace(/^[+−]/, "");
    add({ id: "store-change", kind: "change", tone: flat ? "info" : up ? "good" : "bad", module: "store", level: t.level,
      title: flat ? iqPick(seed + "s", [T("iq.store.flat1", "คนเข้าร้านใกล้เคียงเดิม"), T("iq.store.flat2", "คนเข้าร้านยังทรงตัว")]) : up ? T("iq.store.up", "คนเข้าร้านเพิ่มขึ้น {pct}", { pct }) : T("iq.store.down", "คนเข้าร้านลดลง {pct}", { pct }),
      body: T("iq.store.body", "เฉลี่ยวันละ {a} คน เทียบกับ {b} คน ({vs})", { a: iqRound(t.rate1), b: iqRound(t.rate2), vs: vsTxt }) + (r.to === A.today ? T("iq.store.today", " · วันนี้คิดตามเวลาที่ผ่านไป") : ""),
      sure: iqSure(t.level, flat ? "" : rangeTxt(t.lo, t.hi)), stat: iqStat(t, "change", T("iq.store.stat", "ปรับวันในสัปดาห์และเผื่อความผันผวนรายวันจากข้อมูล {n} วัน", { n: iqN(t.days || 0) })), why,
      action: flat ? (pk ? T("iq.store.act.flat", "จัดกะแบบเดิมได้ เน้นคนเพิ่มช่วง{slot}", { slot: slot(pk.wd, pk.h) }) : T("iq.store.act.flat2", "จัดกะแบบเดิมได้"))
        : up ? (pk ? T("iq.store.act.up", "เพิ่มพนักงาน 1 คนช่วง{slot} ซึ่งมีคนเข้าเฉลี่ย {v} คน/ชม.", { slot: slot(pk.wd, pk.h), v: iqRound(pk.v) }) : T("iq.store.act.up2", "เตรียมพนักงานและสินค้าให้พอกับคนที่เพิ่มขึ้น"))
        : out.length ? T("iq.store.act.out", "ตรวจกล้องที่ดับก่อน แล้วค่อยสรุปว่าคนลดลงจริง") : (lowH ? T("iq.store.act.down", "ลองทำโปรโมชันหน้าร้านช่วงวัน{wd} {h}:00 น. ซึ่งคนน้อยที่สุด แล้ววัดผล 2 สัปดาห์", { wd: wdName(lowH.wd), h: iqPad(lowH.h) }) : T("iq.store.act.down2", "ลองทำโปรโมชันหน้าร้านในช่วงที่คนน้อย แล้ววัดผล 2 สัปดาห์")),
      score: IQ_LEVEL_W[t.level] * (1 + Math.min(1, Math.abs(ch || 0) * 3)) });
  }

  // ค่าผิดปกติล่าสุด
  if (A.forecast && A.forecast.anomalies.length && !A.short) {
    const a = A.forecast.anomalies.slice().sort((x, y) => (x.day < y.day ? 1 : -1))[0], F = A.forecast, H = A.H, i = H.keys.indexOf(a.day);
    const outage = Q.outages.find(o => o.day === a.day && o.kind === "store");
    const why = [T("iq.anom.why", "ระบบคาดค่าวัน{wd}จากแนวโน้มและรูปแบบปกติแล้ว วันนี้ยังห่างจากที่คาดมาก", { wd: wdName(iqWdOf(a.day)) })];
    if (F.metric === "storeIn" && i >= 0 && iqFin(H.bills[i])) {
      const med = S.median(H.bills.filter(iqFin)), hi = H.bills[i] > med * 1.25, lo = H.bills[i] < med * 0.75;
      why.push(hi ? T("iq.anom.bills.up", "บิลวันเดียวกันก็สูงด้วย ({n} บิล ปกติราว {m}) น่าจะเป็นคนจริงที่เพิ่มขึ้น", { n: iqN(H.bills[i]), m: iqN(med) }) : lo ? T("iq.anom.bills.dn", "บิลวันเดียวกันก็ต่ำด้วย ({n} บิล ปกติราว {m}) น่าจะเป็นคนจริงที่ลดลง", { n: iqN(H.bills[i]), m: iqN(med) }) : T("iq.anom.bills.same", "บิลวันเดียวกันไม่ได้เปลี่ยนตาม ({n} บิล) อาจเป็นการนับคลาดเคลื่อน", { n: iqN(H.bills[i]) }));
    }
    if (outage) why.push(T("iq.anom.out", "กล้องเป็นศูนย์ช่วง {h1}:00–{h2}:59 ซึ่งปกติมีคน", { h1: iqPad(outage.from), h2: iqPad(outage.to) }));
    const unit = TN(F.unit), name = TN(F.name);
    add({ id: "anomaly", kind: "info", tone: "warn", module: F.metric === "storeIn" ? "store" : "sales", level: Math.abs(a.z) > 6 ? "strong" : "moderate",
      title: a.dir === "up" ? T("iq.anom.up", "{d}: {name}สูงผิดปกติ", { d: iqDL(a.day), name }) : T("iq.anom.dn", "{d}: {name}ต่ำผิดปกติ", { d: iqDL(a.day), name }),
      body: T("iq.anom.body", "ได้ {v} {u} ปกติน่าจะราว {e} {u}", { v: iqRound(a.value), e: iqRound(Math.max(0, a.expected)), u: unit }) + (F.anomalies.length > 1 ? T("iq.anom.more", " · ในประวัติมีวันแบบนี้ {n} วัน", { n: F.anomalies.length }) : ""),
      sure: outage ? T("iq.anom.sure.out", "ผิดปกติชัด และน่าจะมาจากกล้องดับ") : iqPick(seed + "a", [T("iq.anom.sure1", "ผิดจากรูปแบบปกติชัด แต่ข้อมูลไม่ได้บอกสาเหตุ"), T("iq.anom.sure2", "ผิดปกติชัด ส่วนสาเหตุต้องตรวจเพิ่ม")]), why,
      action: outage ? T("iq.anom.act.out", "ตรวจไฟและอินเทอร์เน็ตของกล้องวันนั้น ไม่ต้องปรับแผนขายจากตัวเลขวันนี้") : a.dir === "up" ? T("iq.anom.act.up", "ดูว่าวันนั้นมีโปรโมชันหรือกิจกรรมอะไร ถ้าใช่ ลองทำซ้ำในวันที่คนน้อย") : T("iq.anom.act.dn", "ถามหน้าร้านว่าวันนั้นปิดบางช่วง ฝนตก หรือมีเหตุอะไร แล้วจดไว้"),
      score: 2.6 });
  }

  // ช่วงเวลาที่คนเยอะ
  if (A.heat && A.heat.top.length) {
    const h = A.heat, p = h.top[0], lo = h.low, isStore = h.src === "store";
    const best = h.byWd.indexOf(Math.max(...h.byWd)), worst = h.byWd.indexOf(Math.min(...h.byWd.filter((v, i) => h.n[i].some(x => x > 0)).concat([Infinity])));
    add({ id: "peak", kind: "info", tone: "info", module: isStore ? "store" : "sales", level: h.short ? "insufficient" : "moderate",
      title: isStore ? T("iq.peak.title.s", "คนเข้าร้านมากสุด: วัน{wd} {h}:00 น.", { wd: wdName(p.wd), h: iqPad(p.h) }) : T("iq.peak.title.b", "บิลขายมากสุด: วัน{wd} {h}:00 น.", { wd: wdName(p.wd), h: iqPad(p.h) }),
      body: T("iq.peak.body", "เฉลี่ย {v} {u}/ชม.", { v: iqRound(p.v), u: isStore ? T("iq.u.person", "คน") : T("iq.u.bill", "บิล") }) + (lo ? T("iq.peak.low", " · เงียบสุดวัน{wd} {h}:00 น. ({v})", { wd: wdName(lo.wd), h: iqPad(lo.h), v: iqRound(lo.v) }) : "") + T("iq.peak.days", " · ทั้งวันคนมากสุดวัน{b}", { b: wdName(best) }) + (worst >= 0 && worst !== best ? T("iq.peak.days2", " น้อยสุดวัน{w}", { w: wdName(worst) }) : ""),
      sure: h.short ? T("iq.peak.sure.short", "ข้อมูลยังน้อย ({n} วัน) รูปแบบอาจเปลี่ยนได้", { n: h.nDays }) : T("iq.peak.sure", "เฉลี่ยจากข้อมูล {n} วัน (แต่ละช่องราว {w} สัปดาห์)", { n: h.nDays, w: iqN(h.nDays / 7, 0) }),
      why: [T("iq.peak.why", "ค่าเฉลี่ยรายชั่วโมงของแต่ละวันในสัปดาห์ ไม่รวมวันนี้ที่ยังไม่จบ")],
      action: T("iq.peak.act", "จัดคนให้แน่นช่วง{slot}", { slot: slot(p.wd, p.h) }) + (lo ? T("iq.peak.act2", " และใช้ช่วงวัน{wd} {h}:00 น. เติมสินค้า", { wd: wdName(lo.wd), h: iqPad(lo.h) }) : ""),
      score: h.short ? 0.9 : 1.6 });
  }

  // พยากรณ์
  if (A.forecast && A.forecast.fc && A.forecast.total) {
    const F = A.forecast, Tt = F.total, enough = F.enough, unit = TN(F.unit), name = TN(F.name);
    add({ id: "forecast", kind: "info", tone: "info", module: F.metric === "storeIn" ? "store" : "sales", level: enough ? "moderate" : "insufficient",
      title: T("iq.fc.title", "7 วันข้างหน้า: {name}ราว {v} {u}", { name, v: iqRound(Tt.mean), u: unit }),
      body: T("iq.fc.body", "น่าจะอยู่ระหว่าง {lo}–{hi} {u} · 7 วันล่าสุดได้ {last} {u} ({chg})", { lo: iqRound(Tt.lo), hi: iqRound(Tt.hi), u: unit, last: iqRound(Tt.last7), chg: iqChg(Tt.change) }),
      sure: enough ? T("iq.fc.sure", "คาดจากรูปแบบรายสัปดาห์ (Holt-Winters) ช่วงกว้างเท่าที่ข้อมูลแกว่งจริง โอกาสอยู่ในช่วงราว 80%") : T("iq.fc.sure.short", "ข้อมูลยังน้อย ({n} วัน) ใช้ค่าของสัปดาห์ก่อนเป็นตัวคาด ความแม่นยำต่ำ", { n: iqN(F.y.filter(iqFin).length) }),
      why: enough ? [T("iq.fc.why", "เรียนรู้จาก {n} วันที่ผ่านมา ให้น้ำหนักข้อมูลล่าสุด (α={a}) และรูปแบบวันในสัปดาห์ (γ={g})", { n: iqN(F.y.length), a: F.fc.params.alpha, g: F.fc.params.gamma })] : [],
      action: Tt.change > 0.05 ? T("iq.fc.act.up", "สั่งสินค้าและจัดคนให้พอสำหรับราว {hi} {u} (ค่าบนของช่วง)", { hi: iqRound(Tt.hi), u: unit }) : Tt.change < -0.05 ? T("iq.fc.act.dn", "ลดของสดที่เสียง่ายลงราว {p} และวางกิจกรรมดึงลูกค้า", { p: iqChg(Tt.change).replace(/^[+−]/, "") }) : T("iq.fc.act.flat", "วางสต็อกและกะใกล้เคียงสัปดาห์ที่ผ่านมา"),
      score: enough ? 1.5 : 0.7 });
  }

  // อัตราซื้อ
  if (A.conv) {
    const c = A.conv, t = c.test, flat = !t || !sig(t.level), H = A.H;
    const inDay = iqMean(iqWin(H, H.storeIn, r.from, A.fullEnd < r.from ? r.to : A.fullEnd).filter(iqFin)) || 0;
    const revDay = iqWin(H, H.revenue, r.from, r.to).filter(iqFin), billsN = iqWin(H, H.bills, r.from, r.to).filter(iqFin);
    const perBill = iqSum(billsN) > 0 ? iqSum(revDay) / iqSum(billsN) : null;
    const lostWk = t && !flat && t.diff < 0 ? -t.diff * inDay * 7 : null;
    add({ id: "conv", kind: "change", tone: flat ? "info" : t.diff > 0 ? "good" : "bad", module: "sales", level: t ? t.level : (c.n >= 100 && !A.short ? "moderate" : "insufficient"),
      title: !t ? T("iq.conv.t0", "อัตราซื้อ {p}", { p: iqP(c.ci.p, 1) }) : flat ? T("iq.conv.flat", "อัตราซื้อ {p} ใกล้เคียงเดิม", { p: iqP(c.ci.p, 1) }) : t.diff > 0 ? T("iq.conv.up", "อัตราซื้อดีขึ้น {d}", { d: iqPts(t.diff) }) : T("iq.conv.dn", "อัตราซื้อลดลง {d}", { d: iqPts(-t.diff).replace(/^\+/, "") }),
      body: T("iq.conv.body", "{x} บิลจากคนเข้าร้าน {n} คน", { x: iqRound(c.x), n: iqRound(c.n) }) + (t ? T("iq.conv.vs", " · {vs} {p}", { vs: vsTxt, p: iqP(t.p2, 1) }) : ""),
      stat: iqStat(t, "change", T("iq.conv.stat", "คิดความผันผวนรายวัน (quasi-binomial) เพราะคนในวันเดียวกันไม่ได้ตัดสินใจอิสระต่อกัน")),
      sure: t ? iqSure(t.level, T("iq.conv.ci", "อัตราจริงน่าจะอยู่ระหว่าง {lo}–{hi}", { lo: iqP(c.ci.lo, 1), hi: iqP(c.ci.hi, 1) })) : c.n >= 100 ? T("iq.conv.ci", "อัตราจริงน่าจะอยู่ระหว่าง {lo}–{hi}", { lo: iqP(c.ci.lo, 1), hi: iqP(c.ci.hi, 1) }) : iqSure("insufficient"),
      why: [T("iq.conv.why", "บิลกับคนเข้าร้านนับจากคนละระบบ จึงเป็นค่าประมาณ")].concat((A.corr || []).filter(x => x.id === "queue-conv" && x.enough && x.r < -0.3 && sig(x.level)).map(x => T("iq.conv.why.q", "วันที่คิวยาวมักซื้อน้อยลง (r ≈ {r})", { r: iqN(x.r, 1) }))),
      action: lostWk ? T("iq.conv.act.dn", "ดูคิวและของขาดชั้นช่วงคนเยอะก่อน ถ้าอัตรากลับไปที่ {p} จะได้บิลคืนราว {n} บิล/สัปดาห์{b}", { p: iqP(t.p2, 1), n: iqRound(lostWk), b: perBill ? T("iq.conv.baht", " (≈ {v})", { v: iqB(Math.round(lostWk * perBill / 10) * 10) }) : "" })
        : t && !flat ? T("iq.conv.act.up", "จดไว้ว่าช่วงนี้เปลี่ยนอะไร (ราคา จัดวาง โปรโมชัน) เพื่อทำซ้ำ")
        : T("iq.conv.act.flat", "ลองวางสินค้าขายดีใกล้แคชเชียร์ 2 สัปดาห์ แล้วดูว่าอัตราซื้อขึ้นจาก {p} หรือไม่", { p: iqP(c.ci.p, 1) }),
      score: IQ_LEVEL_W[t ? t.level : "insufficient"] * (1 + Math.min(1, Math.abs(t ? t.change || 0 : 0) * 3)) + 0.2 });
  }

  // ความสัมพันธ์ที่น่าสนใจ (เฉพาะที่ข้อมูลพอ มีหลักฐาน และไม่ใช่ค่าที่สัมพันธ์กันโดยธรรมชาติ)
  (A.corr || []).filter(c => c.id !== "in-bills" && c.id !== "ots-in").forEach(c => {
    const lv = c.level || "insufficient";
    if (lv === "none" || lv === "insufficient") return;
    const adj = c.adjusted === "weekday+trend", x = TN(c.xName.replace(/ \(.*\)$/, "")), y = TN(c.yName), dir = c.r > 0;
    add({ id: "corr-" + c.id, kind: "corr", tone: "info", module: "corr", level: lv,
      title: dir ? T("iq.corr.pos", "{x}มาก {y}ก็มักสูง", { x, y }) : T("iq.corr.neg", "{x}มาก {y}มักต่ำ", { x, y }),
      body: T("iq.corr.body", "{w} (r ≈ {r}) จาก {n} วัน", { w: TN(S.corrWord(c.r).replace(/ \(.*\)$/, "")), r: iqN(c.r, 1), n: c.n }) + (adj ? T("iq.corr.adj", " · ตัดผลของวันในสัปดาห์และแนวโน้มออกแล้ว") : ""),
      sure: iqSure(lv, T("iq.corr.cause", "แต่ยังไม่ใช่หลักฐานว่าอย่างหนึ่งทำให้อีกอย่างเปลี่ยน"), "corr"),
      stat: iqStat(c, "corr", T("iq.corr.stat", "r = {r} (95%: {lo} ถึง {hi}) · ข้อมูลรายวันติดกันมักคล้ายกัน จึงนับเป็นข้อมูลอิสระได้ราว {ne} จาก {n} วัน", { r: iqN(c.r, 2), lo: iqN(c.lo, 2), hi: iqN(c.hi, 2), ne: iqN(c.nEff, 0), n: c.n })),
      why: [TN(c.caution)], action: c.id === "queue-conv" && c.r < 0 ? T("iq.corr.act.q", "วันที่คาดว่าคนเยอะ เปิดแคชเชียร์เพิ่ม 1 จุด แล้วดูอัตราซื้อ 2 สัปดาห์") : c.id === "dwell-conv" && c.r > 0 ? T("iq.corr.act.d", "เพิ่มจุดชิมหรือป้ายข้อมูลสินค้าให้คนอยู่ในโซนนานขึ้น แล้ววัดผล 2 สัปดาห์") : T("iq.corr.act", "ทดลองเปลี่ยนทีละอย่างแล้ววัดผล เพื่อดูว่าเป็นเหตุและผลจริงไหม"),
      score: IQ_LEVEL_W[lv] * Math.abs(c.r) * 1.2 });
  });

  // A/B ป้ายโฆษณา
  if (A.ab.sg) {
    const ab = A.ab.sg;
    if (!ab.enough) add({ id: "ab-sg", kind: "diff", tone: "info", module: "sg", level: "insufficient", title: T("iq.absg.few.t", "เทียบโฆษณา: ข้อมูลยังน้อย"), body: T("iq.absg.few.b", "ต้องมีคนผ่านจออย่างน้อย {n} คนต่อชิ้น อย่างน้อย 2 ชิ้น", { n: ab.minN }), sure: iqSure("insufficient", "", "diff"), why: [], action: T("iq.absg.few.a", "เปิดป้ายต่อไปให้ทุกชิ้นได้แสดงพอ ๆ กัน"), score: 0.5 });
    else {
      const t = ab.spread || ab.test, lv = t.level || "insufficient", b = ab.best, w = ab.worst || ab.runner, few = ab.groups.filter(g => !g.enough), yes = sig(lv);
      const gain = (b.ci.p - w.ci.p) * 1000;
      add({ id: "ab-sg", kind: "diff", tone: yes ? "good" : "info", module: "sg", level: lv,
        title: yes ? T("iq.absg.t", "“{b}” ดึงสายตาได้ดีที่สุด", { b: b.name }) : T("iq.absg.t0", "โฆษณาแต่ละชิ้นดึงสายตาได้ใกล้เคียงกัน"),
        body: T("iq.absg.b", "คนหันมอง {pb} เทียบ “{w}” {pw} (จาก {k} ชิ้น)", { pb: iqP(b.ci.p), w: w.name, pw: iqP(w.ci.p), k: ab.groups.filter(g => g.enough).length }),
        sure: iqSure(lv, yes ? T("iq.absg.ci", "ต่างกันราว {lo} ถึง {hi} จุด", { lo: iqN(t.lo * 100, 0), hi: iqN(t.hi * 100, 0) }) : "", "diff"),
        stat: iqStat(t, "diff", T("iq.absg.stat", "ทดสอบรวมทุกชิ้นก่อน ({m}) แล้วเทียบครบทุกคู่ ({k} คู่) ปรับด้วย Holm · อันดับใช้ค่าหลังปรับตามขนาดข้อมูล ({pb} และ {pw})", { m: ab.omnibus && ab.omnibus.method === "permutation" ? "permutation" : "chi-square", k: t.pairs || 1, pb: iqP(b.eb.p), pw: iqP(w.eb.p) })),
        why: [T("iq.absg.why", "เป็นยอดสะสม ถ้าแต่ละชิ้นเล่นคนละช่วงเวลา ผลอาจต่างเพราะเวลา ไม่ใช่ตัวโฆษณา"),
          few.length ? T("iq.absg.why.few", "{n} ชิ้นมีคนผ่านจอไม่ถึง {m} คน ยังไม่นำมาจัดอันดับ", { n: few.length, m: ab.minN }) : ""],
        action: yes ? T("iq.absg.act", "ย้ายรอบเล่นของ “{w}” ไปให้ “{b}” คาดว่าคนมองเพิ่มราว {n} คนต่อทุก 1,000 คนที่ผ่าน", { w: w.name, b: b.name, n: iqRound(gain) }) : T("iq.absg.act0", "อย่าเพิ่งตัดชิ้นไหน เล่นสลับให้ครบทุกช่วงเวลาอีก 1–2 สัปดาห์แล้วดูใหม่"),
        score: IQ_LEVEL_W[lv] * 0.9 });
    }
  }
  if (A.ab.neuro) {
    const ab = A.ab.neuro;
    if (!ab.enough) add({ id: "ab-neuro", kind: "diff", tone: "info", module: "neuro", level: "insufficient", title: T("iq.abn.few.t", "เทียบสื่อทดสอบอารมณ์: ข้อมูลยังน้อย"), body: T("iq.abn.few.b", "ต้องมีผู้ทดสอบอย่างน้อย {m} คนต่อสื่อ อย่างน้อย 2 สื่อ (ตอนนี้มากสุด {n} คน)", { m: ab.minN, n: Math.max(...ab.groups.map(g => g.n)) }), sure: iqSure("insufficient", "", "diff"), why: [], action: T("iq.abn.few.a", "ให้ผู้ทดสอบเพิ่มจนครบ {m} คนต่อสื่อ แล้วเทียบอีกครั้ง", { m: ab.minN }), score: 0.5 });
    else {
      const t = ab.spread || ab.test, w = ab.worst || ab.runner, lv = t.level || "insufficient", yes = sig(lv), few = ab.groups.filter(g => !g.enough);
      add({ id: "ab-neuro", kind: "diff", tone: yes ? "good" : "info", module: "neuro", level: lv,
        title: yes ? T("iq.abn.t", "“{b}” ได้อารมณ์บวกมากที่สุด", { b: ab.best.name }) : T("iq.abn.t0", "สื่อที่ทดสอบได้อารมณ์ใกล้เคียงกัน"),
        body: T("iq.abn.b", "อารมณ์บวกเฉลี่ย {pb} เทียบ “{w}” {pw} · ผู้ทดสอบ {nb} และ {nw} คน", { pb: iqP(ab.best.ci.mean), w: w.name, pw: iqP(w.ci.mean), nb: ab.best.n, nw: w.n }),
        sure: iqSure(lv, yes ? T("iq.abn.ci", "ต่างกันราว {lo} ถึง {hi} จุด", { lo: iqN(t.lo * 100, 0), hi: iqN(t.hi * 100, 0) }) : "", "diff"),
        stat: iqStat(t, "diff", T("iq.abn.stat", "Welch ANOVA ก่อน แล้วเทียบทุกคู่ด้วย Welch t ปรับด้วย Holm ({k} คู่)", { k: t.pairs || 1 })),
        why: [T("iq.abn.why", "วัดจากสีหน้าระหว่างดูสื่อ ผู้ทดสอบกลุ่มเล็กอาจไม่เหมือนลูกค้าจริง"), few.length ? T("iq.abn.why.few", "{n} สื่อมีผู้ทดสอบไม่ถึง {m} คน ยังไม่นำมาจัดอันดับ", { n: few.length, m: ab.minN }) : ""],
        action: yes ? T("iq.abn.act", "เลือก “{b}” แล้วทดสอบกับผู้ชมกลุ่มใหญ่ขึ้นก่อนลงทุน", { b: ab.best.name }) : T("iq.abn.act0", "เพิ่มผู้ทดสอบ หรือปรับสื่อให้ต่างกันชัดขึ้น แล้วทดสอบใหม่"), score: IQ_LEVEL_W[lv] * 0.8 });
    }
  }

  // ลูกค้ากลับมาซ้ำ
  if (A.cohort && A.cohort.customers) {
    const c = A.cohort, ci = c.repeatCI, enough = c.customers >= 10, r2 = c.rows.filter(x => x.retention.length > 1);
    const w1 = r2.length ? iqMean(r2.map(x => x.retention[1])) : null;
    add({ id: "cohort", kind: "info", tone: "info", module: "cx", level: enough ? "moderate" : "insufficient", title: T("iq.coh.t", "ลูกค้ากลับมาซื้อซ้ำ {p}", { p: iqP(c.repeatRate) }),
      body: T("iq.coh.b", "{a} จาก {n} คนที่จดจำได้ ซื้อมากกว่า 1 สัปดาห์", { a: iqN(c.repeat), n: iqN(c.customers) }) + (w1 != null ? T("iq.coh.w1", " · กลับมาสัปดาห์ถัดไป {p}", { p: iqP(w1) }) : ""),
      sure: enough ? T("iq.coh.ci", "อัตราจริงน่าจะอยู่ระหว่าง {lo}–{hi}", { lo: iqP(ci.lo), hi: iqP(ci.hi) }) : T("iq.coh.few", "ข้อมูลยังน้อย (ลูกค้าไม่ถึง 10 คน)"), why: [T("iq.coh.why", "นับเฉพาะลูกค้าที่ยินยอมให้จดจำใบหน้า จึงอาจสูงกว่าลูกค้าทั้งหมด")],
      action: c.repeatRate != null && c.repeatRate < 0.4 ? T("iq.coh.act", "ให้คูปองที่ใช้ได้ภายใน 7 วันกับลูกค้าครั้งแรก เป้าหมาย: เพิ่มจาก {a} เป็น {b}", { a: iqP(c.repeatRate), b: iqP(c.repeatRate + 0.05) }) : T("iq.coh.act2", "รักษาลูกค้าประจำด้วยเมนูหรือสิทธิพิเศษตามประวัติการสั่ง"), score: enough ? 1.1 : 0.5 });
  }
  if (A.boothStop && A.boothStop.n) {
    const s = A.boothStop, enough = s.n >= 30;
    add({ id: "booth", kind: "info", tone: "info", module: "booth", level: enough ? "moderate" : "insufficient", title: T("iq.booth.t", "คนเดินผ่านบูธแล้วหยุดดู {p}", { p: iqP(s.p) }),
      body: T("iq.booth.b", "{x} จาก {n} คนหยุดอย่างน้อย 5 วินาที", { x: iqN(s.x), n: iqN(s.n) }) + (A.boothReturn ? T("iq.booth.ret", " · กลับมาซ้ำ {p}", { p: iqP(A.boothReturn.p) }) : ""),
      sure: enough ? T("iq.coh.ci", "อัตราจริงน่าจะอยู่ระหว่าง {lo}–{hi}", { lo: iqP(s.lo), hi: iqP(s.hi) }) : T("iq.booth.few", "ข้อมูลยังน้อย (ผู้เข้าชมไม่ถึง 30 คน)"), why: [],
      action: s.p < 0.4 ? T("iq.booth.act", "ปรับสิ่งที่เห็นจากทางเดิน (ป้าย ไฟ ของตัวอย่าง) เป้าหมาย: คนหยุดดูเกิน {p}", { p: iqP(Math.min(0.6, s.p + 0.1)) }) : T("iq.booth.act2", "บูธดึงคนได้ดี เพิ่มกิจกรรมให้คนที่หยุดดูได้ลองหรือลงทะเบียน"), score: enough ? 1 : 0.5 });
  }
  // QC (ถ้ามีการแจ้งเตือน QC อยู่แล้ว ไม่ต้องซ้ำ)
  const M = iqMetrics(D, r);
  if (M.qc && M.qc.total && !(A.alerts || []).some(x => x.id === "qc")) {
    const w = S.wilson(M.qc.pass, M.qc.total), topR = Object.entries(M.qc.reasons).sort((a, b) => b[1] - a[1])[0], rn = topR ? TN(IQ_QC_REASONS[topR[0]] || topR[0]) : "";
    add({ id: "qc", kind: "info", tone: w.p < 0.95 ? "bad" : "good", module: "qc", level: M.qc.total >= 100 ? "moderate" : "insufficient", title: T("iq.qc.t", "ขวดผ่าน QC {p}", { p: iqP(w.p, 1) }),
      body: T("iq.qc.b", "ตรวจ {n} ขวด คัดทิ้ง {r}", { n: iqN(M.qc.total), r: iqN(M.qc.reject) }) + (topR ? T("iq.qc.top", " · สาเหตุหลัก: {r} ({p} ของที่คัดทิ้ง)", { r: rn, p: iqP(topR[1] / Math.max(1, M.qc.reject)) }) : ""),
      sure: M.qc.total >= 100 ? T("iq.coh.ci", "อัตราจริงน่าจะอยู่ระหว่าง {lo}–{hi}", { lo: iqP(w.lo, 1), hi: iqP(w.hi, 1) }) : T("iq.qc.few", "ข้อมูลยังน้อย (ตรวจไม่ถึง 100 ขวด)"), why: [],
      action: topR ? T("iq.qc.act", "แก้เรื่อง{r}ก่อน จะลดของเสียได้ราว {n} ขวดต่อ {t} ขวดที่ตรวจ", { r: rn, n: iqN(topR[1]), t: iqN(M.qc.total) }) : T("iq.qc.act2", "รักษาการตั้งค่าเดิม"), score: w.p < 0.95 ? 2 : 0.8 });
  }
  if (M.dr && M.dr.trips) {
    const ev = M.dr.hours > 0 ? M.dr.events / M.dr.hours : null, topT = Object.entries(M.dr.byType).sort((a, b) => b[1] - a[1])[0];
    add({ id: "dr", kind: "info", tone: M.dr.safety != null && M.dr.safety < 70 ? "bad" : "info", module: "dr", level: M.dr.trips >= 5 ? "moderate" : "insufficient", title: T("iq.dr.t", "คะแนนความปลอดภัยคนขับ {s}/100", { s: iqN(M.dr.safety) }),
      body: T("iq.dr.b", "{n} เที่ยว {h} ชั่วโมง · เหตุการณ์ {e} ครั้ง/ชม.", { n: iqN(M.dr.trips), h: iqN(M.dr.hours, 1), e: iqN(ev, 1) }) + (topT ? T("iq.dr.top", " · พบบ่อยสุด: {t}", { t: TN(IQ_DR_TYPES[topT[0]] || topT[0]) }) : ""),
      sure: M.dr.trips >= 5 ? T("iq.dr.sure", "คิดจากทุกเที่ยวในช่วงนี้") : T("iq.dr.few", "ข้อมูลยังน้อย (ไม่ถึง 5 เที่ยว)"), why: [],
      action: topT && (topT[0] === "yawn" || topT[0] === "microsleep" || topT[0] === "long_closure") ? T("iq.dr.act", "ให้พักทุก 2 ชั่วโมง และเลี่ยงกะขับช่วงตี 2–6") : T("iq.dr.act2", "คุยกับคนขับเรื่องการละสายตา และตรวจตำแหน่งกล้อง"), score: 0.9 });
  }

  // เป้าหมาย
  (A.goals || []).forEach(g => {
    if (g.actual == null) return;
    const f = v => g.fmt === "pct" ? iqP(v, 1) : g.fmt === "baht" ? iqB(v) : iqRound(v);
    const gap = g.target - g.actual;
    add({ id: "goal-" + g.id, kind: "info", tone: g.met ? "good" : "warn", module: "goal", level: A.short ? "insufficient" : "moderate", title: g.met ? T("iq.goal.met", "{l}: ถึงเป้าแล้ว", { l: TN(g.label) }) : T("iq.goal.not", "{l}: ได้ {p} ของเป้า", { l: TN(g.label), p: iqP(g.progress) }),
      body: T("iq.goal.b", "ได้ {a} จากเป้า {t}", { a: f(g.actual), t: f(g.target) }), sure: A.short ? T("iq.goal.short", "ข้อมูลยังน้อย ค่าเฉลี่ยอาจเปลี่ยนมาก") : T("iq.goal.sure", "เทียบค่าเฉลี่ยของวันที่จบแล้วในช่วงที่เลือก"), why: [],
      action: g.met ? T("iq.goal.act.met", "ตั้งเป้าสูงขึ้นเล็กน้อยสำหรับช่วงถัดไป") : T("iq.goal.act", "ยังขาดอีก {g} ต่อวัน ดูการ์ดอื่นในหน้านี้เพื่อหาจุดที่ปรับได้เร็วที่สุด", { g: f(gap) }), score: g.met ? 0.8 : 1.8 });
  });

  C.forEach(c => { c.why = (c.why || []).filter(Boolean); });
  return C.sort((a, b) => b.score - a.score);
}

/** วิธีคำนวณที่ใช้ (แนบไปกับทุกการส่งออก เพื่อให้ตรวจสอบย้อนหลังได้) */
const IQ_APP_VERSION = "insights 8 (2026-11)";
function iqMethods() {
  return {
    app: IQ_APP_VERSION, statsVersion: IQ_ST.VERSION || null,
    periodCounts: "negative binomial GLM (weekday-adjusted) + AR(1)+noise error on the working variate; (φ, q) by REML via Kalman filter, likelihood-weighted model averaging, df = (n−p)(1−φ)/(1+φ); variance floor = Poisson",
    rates: "Wilson score CI; period comparison quasi-binomial on daily rates (twoPropDaily)",
    multipleTesting: "Benjamini–Hochberg q across all tests on the page; confidence label from q (strong < 1%, moderate < 5%, weak < 20%)",
    abTests: "omnibus first (chi-square / Monte Carlo permutation for small expected counts; Welch ANOVA for means), then all pairs with Holm; decision p = max(Holm p, omnibus p); Bonferroni-adjusted pairwise CIs; ranking by empirical-Bayes shrunk values; min 30 exposures (rates) / 10 testers (means) per arm",
    correlation: "Pearson r on residuals after weekday + linear trend removal; Fisher z CI with Bartlett AR(1) effective n",
    anomalies: "modified z-score (Iglewicz–Hoaglin, |z| ≥ 3.5) on STL-lite residuals and ≥ 25% from expected",
    forecast: "additive Holt-Winters (weekly), 80% prediction interval (Hyndman et al. 2008); seasonal naive / mean when short",
    dataQuality: "coverage = days with data ÷ expected days since the source started; outage = ≥ 2 consecutive zero hours where the weekday median is ≥ 3/hour"
  };
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
    goals: A.goals, alerts: A.alerts, quality: A.quality ? { grade: A.quality.grade, coverage: A.quality.coverage, outages: A.quality.outages.length } : null, methods: iqMethods()
  };
}

/** ส่งออกผลวิเคราะห์เป็น JSON (ตัวเลขสรุปเท่านั้น ไม่มีชื่อลูกค้า) */
function iqAnalysisJson(D, A, cards) {
  const F = A.forecast;
  return {
    format: "lensiq-analysis", version: 2, methods: iqMethods(), generatedAt: new Date(A.now).toISOString(), range: { from: A.r.from, to: A.r.to, compare: A.r.compare, prev: A.r.prev },
    dataDays: A.dataDays, short: A.short,
    kpis: A.kpis.map(k => ({ id: k.id, label: k.label, value: k.value, delta: k.delta, ci: k.ci ? k.ci.text : null, p: k.test ? k.test.p : null, q: k.test && iqFin(k.test.q) ? k.test.q : null, confidence: k.test ? k.test.level : null, method: k.test ? k.test.method || "two-proportion-z" : null, adjChange: k.test && iqFin(k.test.adjChange) ? k.test.adjChange : null, dispersionKappa: k.test && iqFin(k.test.kappa) ? k.test.kappa : null })),
    multipleTesting: A.multi ? { method: "Benjamini-Hochberg", tests: A.multi.m } : null,
    insights: cards.map(c => ({ id: c.id, tone: c.tone, confidence: c.level, title: c.title, body: c.body, sure: c.sure, stat: c.stat || null, why: c.why, action: c.action })),
    daily: A.H.keys.map((k, i) => ({ day: k, storeIn: A.H.storeIn[i], bills: A.H.bills[i], revenue: A.H.revenue[i] == null ? null : Math.round(A.H.revenue[i] * 100) / 100, conversion: A.H.conv[i], maxQueue: A.H.maxQueue[i], booth: A.H.booth[i] })),
    forecast: F && F.fc ? { metric: F.metric, method: F.fc.method, conf: F.fc.conf, days: F.fkeys.map((k, j) => ({ day: k, mean: F.fc.mean[j], lo: F.fc.lo[j], hi: F.fc.hi[j] })), anomalies: F.anomalies.map(a => ({ day: a.day, value: a.value, expected: a.expected, z: a.z })) } : null,
    correlations: A.corr.map(c => ({ id: c.id, x: c.xName, y: c.yName, n: c.n, nEff: c.nEff, adjusted: c.adjusted, r: c.r, rRaw: c.rRaw, lo: c.lo, hi: c.hi, p: c.p, q: iqFin(c.q) ? c.q : null, confidence: c.level, rho: c.rho, caution: c.caution })),
    heatmap: A.heat ? { source: A.heat.src, from: A.heat.from, to: A.heat.to, days: A.heat.nDays, meanByWeekdayHour: A.heat.grid } : null,
    quality: A.quality || null,
    abTests: Object.fromEntries(Object.entries(A.ab || {}).map(([id, ab]) => [id, ab ? { enough: ab.enough, minN: ab.minN, omnibus: ab.omnibus, pairs: (ab.pairs || []).map(p => ({ a: p.a, b: p.b, diff: p.diff, lo: p.lo, hi: p.hi, ciConf: p.ciConf, pRaw: p.pRaw, pHolm: p.pHolm, pAdj: p.pAdj })), groups: ab.groups.map(g => ({ id: g.id, name: g.name, n: g.n, enough: g.enough, raw: g.ci.p ?? g.ci.mean, shrunk: g.eb.p ?? g.eb.mean })) } : null])),
    goals: A.goals, alerts: A.alerts
  };
}
/** CSV รายวันพร้อมค่าเฉลี่ยเคลื่อนที่ ค่าผิดปกติ และพยากรณ์ */
function iqAnalysisCsv(A) {
  const F = A.forecast, an = new Map((F ? F.anomalies : []).map(a => [a.day, a])), ma = IQ_ST.movingAvg(A.H.storeIn, 7);
  const rows = [["วันที่", "วัน", "คนเข้าร้าน", "ค่าเฉลี่ย 7 วัน", "บิลขาย", "อัตราซื้อ (%)", "ยอดขายรวม (บาท)", "คิวสูงสุด", "ผิดปกติ", "ค่าที่คาดไว้"]];
  A.H.keys.forEach((k, i) => { if (k < A.r.from || k > A.r.to) return; const a = an.get(k); rows.push([k, IQ_WD[iqWdOf(k)], A.H.storeIn[i] ?? "", ma[i] == null ? "" : ma[i].toFixed(1), A.H.bills[i] ?? "", A.H.conv[i] == null ? "" : (A.H.conv[i] * 100).toFixed(2), A.H.revenue[i] == null ? "" : A.H.revenue[i].toFixed(2), A.H.maxQueue[i] ?? "", a ? (a.dir === "up" ? "สูง" : "ต่ำ") : "", a ? a.expected.toFixed(1) : ""]); });
  if (F && F.fc) { rows.push([], ["พยากรณ์ " + F.name, "วิธี " + F.fc.method, "ช่วง " + Math.round(F.fc.conf * 100) + "%"]); F.fkeys.forEach((k, j) => rows.push([k, IQ_WD[iqWdOf(k)], F.fc.mean[j].toFixed(1), F.fc.lo[j].toFixed(1), F.fc.hi[j].toFixed(1)])); }
  const Mt = iqMethods();
  rows.push([], ["วิธีคำนวณ (methods)", Mt.app, "lensiq-stats " + (Mt.statsVersion || "")], ...["periodCounts", "rates", "multipleTesting", "abTests", "anomalies", "forecast", "dataQuality"].map(k => [k, Mt[k]]));
  return "﻿" + rows.map(r => r.map(iqCsvCell).join(",")).join("\r\n");
}

return { T, iqSure, iqStat, IQ_LEVEL_W, IQ_EXPLAIN, iqInsights, iqTextOk, iqReport, iqAnalysisJson, iqAnalysisCsv, iqMethods, IQ_APP_VERSION, iqRound };
});
