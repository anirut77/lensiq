/* insights-ui.js — หน้าจอแดชบอร์ดรวม (insights.html): เรนเดอร์ทุกส่วน ปุ่ม ส่งออก สำรอง/กู้คืน ข้อมูลตัวอย่าง
   ใช้ส่วนคำนวณจาก insights-data / -demo / -analysis / -cards และกราฟจาก insights-charts (โหลดก่อนไฟล์นี้) */
if (typeof document !== "undefined") (() => {
  const { iqPad, iqDay, iqDayStart, iqAddDays, iqParse, IQ_AGG, iqIsModuleKey, iqCollect, iqRange, iqMetrics, iqBuckets, iqSeries, iqTrimHours, iqFunnel, iqModuleBars, iqCsv, iqHasDemo, iqRemoveDemo, iqBackup, iqValidateBackup } = LQInsightsData;
  const { IQ_DEMO_TAG, iqBuildDemo } = LQInsightsDemo;
  const { IQ_WD, iqFin, iqAnalyze, IQ_GOAL_DEFS, iqAlertRules } = LQInsightsAnalysis;
  const { T, IQ_EXPLAIN, iqInsights, iqReport, iqAnalysisJson, iqAnalysisCsv, iqMethods } = LQInsightsCards;
  const { el, nf, compact, baht, fmtVal, showTip, hideTip, niceTicks, bindIndex, responsive, columnChart, lineChart, hbars, tableView, sparkline, scatter } = LQInsightsCharts;
  // ทดสอบ/คอนโซล: ฟังก์ชันส่วนคำนวณเรียกได้จาก window เหมือนเดิม (เช่น iqAnalysisJson)
  Object.assign(window, LQInsightsData, LQInsightsDemo, LQInsightsAnalysis, LQInsightsCards);
  const $ = s => document.querySelector(s);
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
  const dayLabel = key => new Date(iqDayStart(key)).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  const bucketLabel = (b, r) => r.mode === "hour" ? iqPad(b) + ":00" : dayLabel(b);
  const fmtDate = t => new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

  let preset = "d7";
  let compare = "prev";
  try { const p = localStorage.getItem(RANGE_KEY); if (PRESETS.some(([k]) => k === p)) preset = p; const c = localStorage.getItem(COMPARE_KEY); if (["prev", "week", "none"].includes(c)) compare = c; } catch {}

  const snapshot = () => { const s = {}; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (iqIsModuleKey(k)) s[k] = localStorage.getItem(k); } } catch {} return s; };
  const apply = ({ set = {}, remove = [] }) => { for (const k in set) localStorage.setItem(k, set[k]); remove.forEach(k => localStorage.removeItem(k)); };
  function msg(text, cls = "") { const m = $("#dataMsg"); m.textContent = text; m.className = "iq-msg " + cls; }


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
    $("#rangeNote").textContent = (r.from === r.to ? T("iq.rn.day", "วันที่ {d}", { d: dayLabel(r.from) }) : T("iq.rn.span", "{a} – {b} ({n} วัน)", { a: dayLabel(r.from), b: dayLabel(r.to), n: r.days })) + (r.prev ? T("iq.rn.vs", " · เทียบ {p}", { p: r.prev.from === r.prev.to ? dayLabel(r.prev.from) : `${dayLabel(r.prev.from)} – ${dayLabel(r.prev.to)}` }) : "");
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
    renderQuality(A);
  }

  // ---------- แจ้งเตือน ----------
  function renderAlerts(list) {
    const box = $("#alerts"); box.replaceChildren(); box.hidden = !list.length;
    list.forEach(a => {
      const d = el("div", { class: "alert " + a.level, role: "alert" }, box);
      el("span", { class: "a-ic", "aria-hidden": "true" }, d, "!");
      const t = el("div", {}, d); el("b", {}, t, T(a.title, a.title)); el("span", {}, t, " — " + a.text); if (a.action) el("div", { class: "a-act" }, t, T("iq.ui.do", "ควรทำ: ") + T(a.action, a.action));
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
  const LV_WORD = { strong: "สูง", moderate: "ปานกลาง", weak: "ต่ำ", none: "ต่ำ", insufficient: "ยังบอกไม่ได้" };
  const SEC = { store: "#heatCard", sales: "#funnel", corr: "#corrCard", sg: "#abCard", neuro: "#abCard", cx: "#cohortCard", goal: "#goalCard", quality: "#qualCard", alert: "#alertCard", booth: "#m-booth", qc: "#m-qc", dr: "#m-dr", all: "#modules" };
  let showAll = false;
  function renderInsights(cards) {
    const box = $("#insightCards"); box.replaceChildren();
    const N = 6, list = showAll ? cards : cards.slice(0, N);
    $("#insightSub").textContent = cards.length ? T("iq.ui.sub", "{n} ข้อ เรื่องสำคัญและมั่นใจกว่าอยู่ก่อน", { n: cards.length }) : "";
    if (!cards.length) el("p", { class: "nodata" }, box, T("iq.ui.none", "ยังไม่มีข้อสังเกตในช่วงนี้"));
    list.forEach((c, i) => {
      const [ic, toneTxt] = TONE[c.tone] || TONE.info;
      const a = el("article", { class: "ins " + c.tone, "aria-labelledby": "ins-" + i }, box);
      const h = el("div", { class: "ins-h" }, a);
      el("span", { class: "ins-ic", "aria-hidden": "true" }, h, ic);
      el("h3", { id: "ins-" + i }, h, c.title);
      el("span", { class: "sr" }, h, ` (${toneTxt})`);
      el("p", { class: "ins-b" }, a, c.body);
      const s = el("div", { class: "ins-sure" }, a);
      const lvWord = T("iq.lv." + c.level, LV_WORD[c.level] || LV_WORD.insufficient);
      const m = el("span", { class: "meter", role: "img", "aria-label": T("iq.ui.meter", "ความมั่นใจ {w} ({n} จาก 4)", { w: lvWord, n: LV[c.level] || 0 }) }, s);
      for (let k = 1; k <= 4; k++) el("i", { class: k <= (LV[c.level] || 0) ? "on" : "" }, m);
      const st = el("span", {}, s); el("b", {}, st, T("iq.ui.conf", "ความมั่นใจ: {w}", { w: lvWord }) + " · "); st.append(c.sure);
      const act = el("p", { class: "ins-act" }, a); el("b", {}, act, T("iq.ui.do", "ควรทำ: ")); act.append(c.action);
      if (c.why && c.why.length) { const d = el("details", { class: "ins-why" }, a); el("summary", {}, d, T("iq.ui.why", "ทำไมถึงคิดแบบนี้")); const ul = el("ul", {}, d); c.why.forEach(w => el("li", {}, ul, w)); }
      if (c.stat) { const d = el("details", { class: "ins-why ins-stat" }, a); el("summary", {}, d, T("iq.ui.stat", "ตัวเลขทางสถิติ")); el("p", {}, d, c.stat); el("a", { href: "#methodHelp" }, el("p", {}, d), T("iq.ui.method", "วิธีคำนวณ")); }
      if (SEC[c.module]) el("a", { class: "ins-more", href: SEC[c.module] }, a, T("iq.ui.more", "ดูรายละเอียด →"));
    });
    const more = $("#insightMore");
    more.hidden = cards.length <= N;
    more.textContent = showAll ? T("iq.ui.less", "แสดงเฉพาะ 6 ข้อสำคัญ") : T("iq.ui.all", "แสดงทั้งหมด {n} ข้อ", { n: cards.length });
    more.setAttribute("aria-expanded", String(showAll));
  }

  // ---------- KPI ----------
  function renderKpis(A, r) {
    const kp = $("#kpis"); kp.replaceChildren();
    const vs = r.compare === "week" ? T("iq.kpi.vsw", "สัปดาห์ก่อน") : r.days === 1 ? T("iq.vs.yday", "เมื่อวาน") : T("iq.vs.prev", "{n} วันก่อนหน้า", { n: r.days });
    A.kpis.forEach(k => {
      const mod = MODULES.find(m => m.id === k.id);
      const card = el("div", { class: "kpi" }, kp);
      const a = el("a", { class: "kpi-main", href: mod ? mod.href : "#funnel" }, card);
      el("div", { class: "k" }, a, T(k.label, k.label));
      const row = el("div", { class: "kv" }, a);
      el("div", { class: "v" }, row, fmtVal(k.value, k.fmt));
      if (k.spark) sparkline(row, k.spark, k.label);
      if (k.delta != null && iqFin(k.delta)) {
        const up = k.delta >= 0, sure = k.test ? k.test.short : "";
        const d = el("div", { class: "d" + (k.test && (k.test.level === "strong" || k.test.level === "moderate") ? (up ? " up" : " dn") : "") }, a);
        el("span", { "aria-hidden": "true" }, d, up ? "▲ " : "▼ ");
        d.append(up ? T("iq.kpi.up", "เพิ่ม {p}% เทียบ{vs}", { p: Math.abs(Math.round(k.delta * 100)), vs }) : T("iq.kpi.dn", "ลด {p}% เทียบ{vs}", { p: Math.abs(Math.round(k.delta * 100)), vs }));
        if (sure) el("span", { class: "conf" }, d, " · " + sure);
      } else if (k.test && k.test.level === "insufficient") el("div", { class: "d" }, a, T("iq.kpi.few", "เทียบช่วงก่อน: ข้อมูลยังน้อย"));
      if (k.ci) el("div", { class: "ci" }, a, k.ci.text);
      el("div", { class: "s" }, a, k.sub);
      const ex = IQ_EXPLAIN[k.id];
      if (ex) { const d = el("details", { class: "kx" }, card); el("summary", {}, d, T("iq.kpi.what", "ตัวเลขนี้คืออะไร")); el("p", {}, d, T("iq.explain." + k.id, ex)); }
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
  function renderCorr(A) {
    const card = $("#corrCard"), box = $("#corrBody"); box.replaceChildren();
    card.hidden = !A.corr.length;
    A.corr.forEach(c => {
      const row = el("div", { class: "corr" }, box);
      if (c.x.length) scatter(el("div", { class: "corr-sc" }, row), c);
      const t = el("div", { class: "corr-t" }, row);
      el("h3", {}, t, `${c.xName} กับ ${c.yName}`);
      const lv = c.level || "insufficient", adj = c.adjusted === "weekday+trend";
      el("p", { class: "corr-r" }, t, c.r == null ? "คำนวณไม่ได้ (ค่าไม่เปลี่ยนเลย)" : `${LQStats.corrWord(c.r)} · r = ${c.r.toFixed(2)}${c.lo != null ? ` (95%: ${c.lo.toFixed(2)} ถึง ${c.hi.toFixed(2)})` : ""} · ${c.n} จุด${adj ? ` · หลังตัดผลวันในสัปดาห์และแนวโน้ม (ก่อนตัด r = ${c.rRaw.toFixed(2)})` : ""}`);
      el("p", { class: "corr-s" }, t, c.enough ? `${T("iq.conf.corr." + lv, LQStats.plainConf(lv, "corr"))} · นับเป็นข้อมูลอิสระได้ราว ${Math.round(c.nEff)} จุด (ค่าที่ติดกันมักคล้ายกัน)${iqFin(c.p) ? " · " + LQStats.pTextTH(c.p, { kind: "corr", q: c.q, m: c.m }) : ""}` : `ข้อมูลยังน้อย (${c.n} จุด นับเป็นข้อมูลอิสระได้ราว ${Math.round(c.nEff || c.n)} จุด ต้องมีอย่างน้อย 8 และ 6)`);
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
      const eb = g.eb ? (g.eb.p ?? g.eb.mean) : null, fmtV = v => pct ? Math.round(v * 100) + "%" : v.toFixed(2);
      if (iqFin(eb)) { const sk = el("i", { class: "ab-s", title: "ค่าหลังปรับ" }, tr); sk.style.left = (Math.max(0, Math.min(hi, eb)) / hi * 100) + "%"; }
      el("div", { class: "ab-v" }, row, `${fmtV(m)}${iqFin(eb) ? ` · ปรับ ${fmtV(eb)}` : ""}${g.enough ? "" : " *"}`);
      const tipRows = [[name + " (ดิบ)", pct ? (m * 100).toFixed(1) + "%" : m.toFixed(2), "s1"], ["ช่วง 95%", g.ci.lo == null ? "–" : `${(lo * 100).toFixed(1)}–${(up * 100).toFixed(1)}%`, ""], ["หลังปรับตามขนาดข้อมูล", iqFin(eb) ? (pct ? (eb * 100).toFixed(1) + "%" : eb.toFixed(2)) : "–", ""], [g.n != null ? `จาก ${nf(g.n)} ${g.x != null ? "คนผ่านจอ" : "ครั้ง"}` : "", ""]];
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
      block("ป้ายโฆษณา: อัตรามองจอต่อโฆษณา", ab, { pct: true, name: "อัตรามอง" }, (ab.enough && t ? `อันดับหนึ่ง “${ab.best.name}” ต่างจากอันดับสุดท้าย ${(t.diff * 100).toFixed(1)} จุด (ช่วงร่วม 95%: ${(t.lo * 100).toFixed(1)} ถึง ${(t.hi * 100).toFixed(1)}) · ${LQStats.plainConf(t.level || "insufficient", "diff")} · ทดสอบรวมทุกชิ้นก่อน (${ab.omnibus.method === "permutation" ? "permutation" : "chi-square"}) แล้วเทียบครบ ${t.pairs} คู่ปรับด้วย Holm · จุดทึบ = ค่าดิบ เส้น = ช่วง 95% (Wilson) ขีดตั้ง = ค่าหลังปรับตามขนาดข้อมูล` : `ข้อมูลยังน้อย — ต้องมีคนผ่านจออย่างน้อย ${ab.minN} คนต่อโฆษณา`) + (ab.few ? ` · * = คนผ่านจอไม่ถึง ${ab.minN} คน ไม่นำมาจัดอันดับ` : ""));
    }
    if (A.ab.neuro) {
      const ab = A.ab.neuro, t = ab.spread || ab.test;
      block("วิเคราะห์อารมณ์: สัดส่วนอารมณ์บวกต่อสื่อ", ab, { pct: true, name: "อารมณ์บวกเฉลี่ย" }, ab.enough && t ? `อันดับหนึ่ง “${ab.best.name}” ต่างจากอันดับสุดท้าย ${(t.diff * 100).toFixed(1)} จุด (ช่วงร่วม 95%: ${(t.lo * 100).toFixed(1)} ถึง ${(t.hi * 100).toFixed(1)}) · ${LQStats.plainConf(t.level || "insufficient", "diff")} · Welch ANOVA แล้วเทียบทุกคู่ปรับด้วย Holm · ขีดตั้ง = ค่าหลังปรับตามขนาดข้อมูล · * = ผู้ทดสอบไม่ถึง ${ab.minN} คน ยังไม่จัดอันดับ` : `ข้อมูลยังน้อย — ต้องมีผู้ทดสอบอย่างน้อย ${ab.minN} คนต่อสื่อ อย่างน้อย 2 สื่อ (* = ยังไม่ถึง)`);
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
    $("#camNote").textContent = "เทียบเป็นค่าต่อวันที่มีข้อมูล ปรับวันในสัปดาห์และเผื่อความผันผวนรายวัน (negative binomial) · ความมั่นใจปรับแล้วสำหรับการดูหลายข้อพร้อมกัน · จุดที่เป็นเครื่องลูกส่งเฉพาะตัวเลขสรุปมาที่เครื่องหลัก";
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

  // ---------- ความน่าเชื่อถือของข้อมูล ----------
  const GRADE = { good: ["ดี", "ข้อมูลครบ ไม่พบกล้องดับ"], fair: ["พอใช้", "มีบางวัน/บางชั่วโมงขาดไป ตัวเลขยังใช้ได้แต่ควรระวัง"], check: ["ต้องตรวจ", "ข้อมูลขาดหลายวันหรือกล้องดับบ่อย ควรแก้ก่อนเชื่อการเทียบช่วง"], ok: ["–", "ระบบที่มีใช้เป็นครั้งคราว ไม่ต้องมีข้อมูลทุกวัน"], none: ["–", ""] };
  function renderQuality(A) {
    const Q = A.quality, card = $("#qualCard"), box = $("#qualBody");
    card.hidden = !Q || !Q.sources.length; if (card.hidden) return;
    box.replaceChildren();
    const [g, gTxt] = GRADE[Q.grade] || GRADE.none;
    const head = el("p", { class: "q-grade q-" + Q.grade }, box); el("b", {}, head, T("iq.q.grade", "ระดับ: {g}", { g: T("iq.q.g." + Q.grade, g) })); head.append(" · " + T("iq.q.gtxt." + Q.grade, gTxt));
    const t = el("table", { class: "cams" }, el("div", { class: "tw" }, box)), hr = el("tr", {}, el("thead", {}, t));
    [T("iq.q.h.src", "แหล่งข้อมูล"), T("iq.q.h.days", "วันที่มีข้อมูล"), T("iq.q.h.cov", "ครบ"), T("iq.q.h.miss", "วันที่ขาด")].forEach((h, i) => el("th", { class: i && i < 3 ? "n" : "", scope: "col" }, hr, h));
    const tb = el("tbody", {}, t);
    Q.sources.forEach(x => {
      const tr = el("tr", {}, tb); el("th", { scope: "row" }, tr, T(x.name, x.name));
      el("td", { class: "n" }, tr, `${nf(x.have)} / ${nf(x.days)}`);
      el("td", { class: "n" }, tr, x.coverage == null ? T("iq.q.occasional", "ใช้เป็นครั้งคราว") : Math.round(x.coverage * 100) + "%");
      el("td", {}, tr, x.missing.length ? x.missing.slice(0, 5).map(dayLabel).join(", ") + (x.missing.length > 5 ? ` +${x.missing.length - 5}` : "") : "–");
    });
    if (Q.outages.length) {
      el("h3", { class: "sub-h" }, box, T("iq.q.outH", "กล้องดับที่ตรวจพบ"));
      const ul = el("ul", { class: "q-out" }, box);
      Q.outages.slice(0, 8).forEach(o => el("li", {}, ul, o.kind === "store" ? T("iq.q.outS", "{d} {h1}:00–{h2}:59 · ปกติช่วงนี้มีคนราว {n} คน", { d: dayLabel(o.day), h1: iqPad(o.from), h2: iqPad(o.to), n: nf(o.lost) }) : T("iq.q.outC", "{d} กล้อง{name}นับได้ 0 คน ขณะที่กล้องอื่นยังนับได้", { d: dayLabel(o.day), name: o.name })));
    } else el("p", { class: "muted" }, box, T("iq.q.noOut", "ไม่พบช่วงที่กล้องหน้าร้านดับในช่วงที่เลือก"));
    if (Q.demo) el("p", { class: "note" }, box, T("iq.q.demo", "มีข้อมูลตัวอย่างปนอยู่ ตัวเลขทั้งหมดใช้ดูหน้าตาเท่านั้น"));
    el("p", { class: "note" }, box, T("iq.q.note", "นับวันที่ควรมีตั้งแต่วันแรกที่แต่ละระบบเริ่มเก็บข้อมูล · “กล้องดับ” = ชั่วโมงที่ปกติมีคน (ค่ากลางของวันเดียวกันในสัปดาห์ ≥ 3 คน/ชม.) แต่เป็นศูนย์ติดกันตั้งแต่ 2 ชั่วโมง"));
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
    const Mt = iqMethods();
    el("p", { class: "rp-foot" }, box, `วิธีคำนวณ: เทียบจำนวนรายวันด้วย negative binomial + ความคลาดเคลื่อนต่อเนื่อง AR(1) · อัตราด้วย Wilson / quasi-binomial · A/B ทดสอบรวมก่อนแล้วเทียบทุกคู่ (Holm) · ปรับการดูหลายข้อด้วย Benjamini–Hochberg · ความสัมพันธ์ไม่ใช่หลักฐานของเหตุและผล · ${Mt.app} · lensiq-stats ${Mt.statsVersion}`);
    if (R.quality) el("p", { class: "rp-foot" }, box, `ความครบของข้อมูล: ${R.quality.coverage == null ? "–" : Math.round(R.quality.coverage * 100) + "%"} · กล้องดับที่ตรวจพบ ${R.quality.outages} ครั้ง`);
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
  // เปลี่ยนภาษา (TH | 中文 ใน lensiq-i18n.js) → สร้างข้อความที่คำนวณได้ใหม่ในภาษาที่เลือก
  addEventListener("lq-lang", () => { hideTip(); render(); });
  render();
  refreshAgg();
})();
