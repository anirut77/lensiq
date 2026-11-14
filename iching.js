/* อี้จิง (易經) — LENSIQ
   ส่วนบน: ฟังก์ชันล้วน (โยนเหรียญ 3 เหรียญ, หากว้าจากเส้น, เส้นเปลี่ยน → กว้าที่จะกลายเป็น, กฎอ่านเส้นเปลี่ยน, facts) — ทดสอบใน Node
   ส่วนล่าง: UI ในเบราว์เซอร์ (ทำงานเมื่อพบ #icApp)
   วิธีโยนเหรียญ: หัว = 3 ก้อย = 2 รวม 3 เหรียญ → 6 หยินเก่า (เปลี่ยน), 7 หยางอ่อน, 8 หยินอ่อน, 9 หยางเก่า (เปลี่ยน)
   เพื่อความบันเทิงตามความเชื่อ ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ */
(function (root) {
  "use strict";
  var KB = root.ICHING_KB || (typeof require === "function" ? require("./iching-kb.js") : null);
  var FK = root.FortuneKit || (typeof require === "function" ? require("./fortune-kit.js") : null);

  var isYang = function (v) { return v === 7 || v === 9; };
  var isChanging = function (v) { return v === 6 || v === 9; };
  /** โยน 3 เหรียญ: คืน { coins:[3|2 ×3], value: 6..9 } */
  function tossLine(u32) {
    var coins = [0, 1, 2].map(function () { return FK.randInt(2, u32) ? 3 : 2; });
    return { coins: coins, value: coins[0] + coins[1] + coins[2] };
  }
  function triKey(b) {
    for (var i = 0; i < KB.TRI_ORDER.length; i++) { var t = KB.TRIGRAMS[KB.TRI_ORDER[i]].bits; if (t[0] === b[0] && t[1] === b[1] && t[2] === b[2]) return KB.TRI_ORDER[i]; }
    return null;
  }
  /** bits 6 ตัว (ล่าง→บน, 1 = หยาง) → { n, lower, upper } */
  function hexFromBits(bits) {
    var lo = triKey(bits.slice(0, 3)), up = triKey(bits.slice(3, 6));
    return { n: KB.KING_WEN[KB.TRI_ORDER.indexOf(lo)][KB.TRI_ORDER.indexOf(up)], lower: lo, upper: up };
  }
  /** กว้าหมายเลข n → bits (ล่าง→บน) */
  function bitsOf(n) {
    for (var a = 0; a < 8; a++) for (var b = 0; b < 8; b++) if (KB.KING_WEN[a][b] === n) return KB.TRIGRAMS[KB.TRI_ORDER[a]].bits.concat(KB.TRIGRAMS[KB.TRI_ORDER[b]].bits);
    return null;
  }
  /** values = ค่าเส้น 6 ตัว (ล่าง→บน) 6/7/8/9 */
  function cast(values) {
    if (!values || values.length !== 6 || values.some(function (v) { return [6, 7, 8, 9].indexOf(v) < 0; })) throw new Error("ต้องมีค่าเส้น 6 ตัว (6–9)");
    var bits = values.map(function (v) { return isYang(v) ? 1 : 0; });
    var changing = [];
    values.forEach(function (v, i) { if (isChanging(v)) changing.push(i + 1); });
    var rbits = values.map(function (v, i) { return isChanging(v) ? 1 - bits[i] : bits[i]; });
    var p = hexFromBits(bits), r = changing.length ? hexFromBits(rbits) : null;
    return { values: values.slice(), bits: bits, changing: changing, primary: p.n, lower: p.lower, upper: p.upper, relBits: rbits, relating: r ? r.n : null, relLower: r ? r.lower : null, relUpper: r ? r.upper : null };
  }
  /** กฎจูซี (ฉบับย่อ): คืน { hex: "primary"|"relating"|"both", lines: [ตำแหน่งที่ให้น้ำหนัก ตามลำดับความสำคัญ], rule } */
  function focus(c) {
    var ch = c.changing, n = ch.length, still = [1, 2, 3, 4, 5, 6].filter(function (p) { return ch.indexOf(p) < 0; });
    var out;
    if (n === 0) out = { hex: "primary", lines: [] };
    else if (n === 1) out = { hex: "primary", lines: ch.slice() };
    else if (n === 2) out = { hex: "primary", lines: [ch[1], ch[0]] };
    else if (n === 3) out = { hex: "both", lines: [] };
    else if (n === 4) out = { hex: "relating", lines: still.slice() };       // เส้นนิ่ง 2 เส้น เส้นล่างสำคัญกว่า
    else if (n === 5) out = { hex: "relating", lines: still.slice() };
    else out = { hex: "relating", lines: [] };
    out.rule = KB.RULES[n];
    return out;
  }
  /** สุ่มกว้าทั้งชุดด้วย crypto (หรือ u32 ที่กำหนด) */
  function castRandom(u32) { var v = []; for (var i = 0; i < 6; i++) v.push(tossLine(u32).value); return cast(v); }
  /** กว้าประจำวัน — seed จากวันที่ เหมือนกันทั้งวัน */
  function dailyCast(d) {
    var r = FK.mulberry32(FK.hashStr("lensiq-iching-" + FK.dayKey(d)));
    return castRandom(function () { return Math.floor(r() * 4294967296) >>> 0; });
  }
  function hexLabel(n) { var h = KB.HEX[n]; return "กว้าที่ " + n + " " + h.zh + " (" + h.py + ") · " + h.th; }
  /** ชื่อสำหรับประโยคคำทำนาย (ไทยก่อน อักษรจีนในวงเล็บ ซึ่งตัวเรียบเรียงจะตัดออกเมื่อเอ่ยซ้ำ) */
  function proseLabel(n) { var h = KB.HEX[n]; return "กว้าที่ " + n + " " + h.th + " (" + h.zh + " " + h.py + ")"; }
  function imageOf(lower, upper) { return KB.TRIGRAMS[upper].th + "อยู่เหนือ" + KB.TRIGRAMS[lower].th; }

  /* ---------- facts สำหรับ fortune-ai.js ---------- */
  var fillK = function (t, v) { return t.replace(/\{(\w+)\}/g, function (_, k) { return v[k] != null ? v[k] : ""; }); };
  function buildFacts(c, topic, opts) {
    opts = opts || {};
    var r = opts.rng || Math.random, pk = FK.pickR, P = KB.HEX[c.primary], F = KB.FRAMES, fo = focus(c), items = [];
    var kw = function (h) { return pk(r, h.kw); };
    var hexM = function (h) {
      return {
        overview: [h.gist, fillK(pk(r, F.overview), { K: kw(h) })],
        love: [h.love, fillK(pk(r, F.love), { K: kw(h) })],
        work: [h.work, fillK(pk(r, F.work), { K: kw(h) })],
        money: [h.money, fillK(pk(r, F.money), { K: kw(h) })],
        advice: [h.advice]
      };
    };
    // กว้าที่ตำราอ่านว่าเป็นช่วงติดขัด (屯 訟 否 剝 坎 明夷 蹇 困) — บอกตรง ๆ อย่างนุ่มนวล พร้อมสิ่งที่ทำได้
    var CAUTION_HEX = [3, 6, 12, 23, 29, 36, 39, 47];
    var pm = hexM(P);
    items.push({ id: "hex." + c.primary, group: "กว้าหลัก", label: proseLabel(c.primary), short: "กว้า" + P.th, evidence: imageOf(c.lower, c.upper) + " · " + fo.rule,
      strength: fo.hex === "relating" ? 0.86 : 0.97, tags: Object.keys(pm), meanings: pm, tone: CAUTION_HEX.indexOf(c.primary) >= 0 ? "caution" : "favourable" });
    var lo = KB.TRIGRAMS[c.lower], up = KB.TRIGRAMS[c.upper];
    items.push({ id: "tri.lower." + c.lower, group: "ตัวตนภายใน", label: "ตรีแกรมล่าง" + lo.th + " (" + lo.zh + ")", short: "ตรีแกรม" + lo.th, evidence: lo.q,
      strength: 0.72, tags: ["personality"], meanings: { personality: lo.inner.slice() } });
    items.push({ id: "tri.upper." + c.upper, group: "สภาพแวดล้อมภายนอก", label: "ตรีแกรมบน" + up.th + " (" + up.zh + ")", short: "ตรีแกรม" + up.th, evidence: up.q,
      strength: 0.7, tags: ["social"], meanings: { social: up.outer.slice() } });
    c.changing.forEach(function (pos) {
      var L = KB.LINE_POS[pos - 1], old = c.values[pos - 1] === 9, key = fo.lines.indexOf(pos);
      var m = { overview: (old ? L.y : L.n).slice(), advice: [pk(r, old ? L.y : L.n)] };
      items.push({ id: "line." + pos, group: "เส้นเปลี่ยน", label: L.th + (old ? " (หยางเก่า → หยิน)" : " (หยินเก่า → หยาง)"), short: "เส้นที่ " + pos,
        evidence: "ค่าเส้น " + c.values[pos - 1], strength: fo.hex === "primary" && key === 0 ? 0.9 : 0.74 - pos * 0.005, tags: ["overview", "advice"], meanings: m });
    });
    if (c.relating) {
      var R = KB.HEX[c.relating], rm = { timing: [fillK(pk(r, F.timing), { H: "กว้า" + R.th, K: kw(R) }), R.gist], advice: [R.advice] };
      var tk = topic === "overall" ? null : topic;
      if (tk) rm[tk] = [R[tk]];
      items.push({ id: "rel." + c.relating, group: "กว้าที่จะกลายเป็น", label: proseLabel(c.relating), short: "กว้า" + R.th, evidence: imageOf(c.relLower, c.relUpper),
        strength: fo.hex === "primary" ? 0.8 : 0.93, tags: Object.keys(rm), meanings: rm });
    } else {
      items.push({ id: "still", group: "จังหวะ", label: "ไม่มีเส้นเปลี่ยน", short: "ความนิ่ง", strength: 0.6, tags: ["timing"],
        meanings: { timing: ["สถานการณ์ช่วงนี้ค่อนข้างนิ่งและมั่นคง สิ่งที่กว้าหลักบอกจะเป็นแนวทางได้อีกระยะหนึ่ง", "ไม่มีเส้นใดเปลี่ยน แปลว่าพลังของช่วงนี้ชัดเจนและต่อเนื่อง"] } });
    }
    return {
      domain: "iching", topic: topic || "overall", subject: opts.nickname ? { nickname: opts.nickname } : {},
      headline: "กว้า" + P.th + (c.relating ? " ที่กำลังเปลี่ยนไปสู่กว้า" + KB.HEX[c.relating].th : ""), items: items,
      extras: { tips: [P.advice] }
    };
  }

  var IC = {
    tossLine: tossLine, cast: cast, castRandom: castRandom, dailyCast: dailyCast, focus: focus, hexFromBits: hexFromBits, bitsOf: bitsOf, triKey: triKey,
    isYang: isYang, isChanging: isChanging, hexLabel: hexLabel, proseLabel: proseLabel, imageOf: imageOf, buildFacts: buildFacts
  };
  if (typeof module !== "undefined" && module.exports) module.exports = IC;
  root.IChing = IC;
})(typeof window !== "undefined" ? window : globalThis);

/* ================================ UI ================================ */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("icApp")) (function () {
  "use strict";
  var IC = window.IChing, KB = window.ICHING_KB, FK = window.FortuneKit, $ = FK.$, esc = FK.esc;
  var st = { values: [], topic: "overall", cast: null, busy: false, daily: null, detail: null, coins: null };

  /* ---------- ภาษา (ไทยเป็นค่าเริ่มต้น · จีนจาก i18n/zh-fortune-iching.js และ i18n/zh-kb-iching.js) ---------- */
  var T = function (k, th, v) { return window.LQI18N ? window.LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var isZh = function () { return !!(window.LQI18N && window.LQI18N.lang === "zh"); };
  var isEn = function () { return !!(window.LQI18N && window.LQI18N.lang === "en"); };
  // อังกฤษ: ความหมายกว้า/เส้นจาก i18n/en-kb-iching.js (โครงสร้างเดียวกับ zh-kb-iching.js)
  var ZK = function (k) { var D = isEn() ? window.FORTUNE_EN && window.FORTUNE_EN.iching : isZh() && window.FORTUNE_ZH && window.FORTUNE_ZH.iching; return (D && D.items && D.items[k]) || null; };
  var one = function (v, i) { var x = Array.isArray(v) ? v[Math.min(i || 0, v.length - 1)] : v; return isEn() && typeof x === "string" ? x.charAt(0).toUpperCase() + x.slice(1) : x; };
  /** ข้อความความหมายของกว้า: f = gist|love|work|money|advice */
  var ZF = { gist: "o", love: "l", work: "w", money: "m", advice: "a" };
  function hx(n, f) { var z = ZK("hex." + n); return z && z[ZF[f]] ? one(z[ZF[f]]) : KB.HEX[n][f]; }
  function hName(n) { return T("iching.hn." + n, KB.HEX[n].th); }
  function hChar(n) { var z = isZh() ? ZK("hex." + n) : null; return z ? z.n.split("· ").pop() : KB.HEX[n].zh; }
  function hKw(n) { var s = isZh() || isEn() ? T("iching.kw." + n, "") : ""; return s ? s.split("|") : KB.HEX[n].kw; }
  function triName(k) { return T("iching.tri." + k, KB.TRIGRAMS[k].th); }
  function image(lo, up) { return T("iching.image", "{up}อยู่เหนือ{lo}", { up: triName(up), lo: triName(lo) }); }
  function hexLabel(n) { return T("iching.hexLabel", "กว้าที่ {n} {zh} ({py}) · {th}", { n: n, zh: hChar(n), py: KB.HEX[n].py, th: hName(n) }); }
  function topicName(k) { return T("iching.topic." + k, KB.TOPICS[k] || k); }
  function ruleText(c) { var n = c.changing.length; return T("iching.rule." + n, KB.RULES[n]); }
  function linePos(p) { return T("iching.linepos." + p, KB.LINE_POS[p - 1].th); }
  function lineText(p, old) { var z = ZK("line." + p), L = KB.LINE_POS[p - 1]; return z && z.o ? one(z.o, old ? 0 : 1) : (old ? L.y : L.n)[0]; }
  function valName(v) { return v === 9 ? T("iching.v9", "หยางเก่า (เปลี่ยน)") : v === 7 ? T("iching.v7", "หยาง") : v === 8 ? T("iching.v8", "หยิน") : T("iching.v6", "หยินเก่า (เปลี่ยน)"); }

  /* ---------- วาดกว้า (SVG) ---------- */
  function hexSVG(bits, changing, cls, label) {
    var W = 120, lh = 12, gap = 9, H = 6 * lh + 5 * gap, out = [];
    for (var i = 0; i < 6; i++) {
      var pos = i + 1, y = H - (i + 1) * lh - i * gap, ch = changing && changing.indexOf(pos) >= 0, col = ch ? "var(--ic-ch,#c2410c)" : "currentColor";
      if (bits[i] === undefined) { out.push('<rect x="0" y="' + y + '" width="' + W + '" height="' + lh + '" rx="3" fill="currentColor" opacity=".12"/>'); continue; }
      if (bits[i]) out.push('<rect x="0" y="' + y + '" width="' + W + '" height="' + lh + '" rx="3" fill="' + col + '"/>');
      else out.push('<rect x="0" y="' + y + '" width="52" height="' + lh + '" rx="3" fill="' + col + '"/><rect x="68" y="' + y + '" width="52" height="' + lh + '" rx="3" fill="' + col + '"/>');
      if (ch) out.push('<circle cx="' + (W + 14) + '" cy="' + (y + lh / 2) + '" r="5" fill="none" stroke="' + col + '" stroke-width="2.4"/>');
    }
    return '<svg class="' + (cls || "ic-hex") + '" viewBox="-2 -2 ' + (W + 26) + " " + (H + 4) + '" role="img" aria-label="' + esc(label || T("iching.hexImg", "ภาพกว้า")) + '">' + out.join("") + "</svg>";
  }
  function drawHex(c, x, y, w, h, bits, changing, color) {
    var lh = h / 8.2, gap = (h - 6 * lh) / 5;
    for (var i = 0; i < 6; i++) {
      var yy = y + h - (i + 1) * lh - i * gap, ch = changing.indexOf(i + 1) >= 0;
      c.fillStyle = ch ? "#fb923c" : color;
      if (bits[i]) { FK.rr(c, x, yy, w, lh, 6); c.fill(); }
      else { FK.rr(c, x, yy, w * 0.43, lh, 6); c.fill(); FK.rr(c, x + w * 0.57, yy, w * 0.43, lh, 6); c.fill(); }
    }
  }
  var coinSVG = '<svg viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="29" fill="url(#icGold)" stroke="#8a5a00" stroke-width="2.5"/><circle cx="32" cy="32" r="22" fill="none" stroke="#8a5a00" stroke-width="1.5" opacity=".6"/><rect x="25" y="25" width="14" height="14" fill="#fdf6ea" stroke="#8a5a00" stroke-width="2"/></svg>';

  /* ---------- แท็บ ---------- */
  var tabs = [["tabCast", "panelCast"], ["tabDaily", "panelDaily"], ["tabAll", "panelAll"]];
  function selectTab(id, focus) {
    tabs.forEach(function (t) { var b = document.getElementById(t[0]), on = t[0] === id; b.setAttribute("aria-selected", on); b.tabIndex = on ? 0 : -1; document.getElementById(t[1]).hidden = !on; if (on && focus) b.focus(); });
    if (id === "tabDaily") renderDaily();
    if (id === "tabAll") renderAll();
  }
  tabs.forEach(function (t, i) {
    var b = document.getElementById(t[0]);
    b.addEventListener("click", function () { selectTab(t[0]); });
    b.addEventListener("keydown", function (e) { var d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (d) { e.preventDefault(); selectTab(tabs[(i + d + tabs.length) % tabs.length][0], true); } });
  });

  /* ---------- ขั้นตอนโยนเหรียญ ---------- */
  function renderTopics() {
    $("#icTopics").innerHTML = Object.keys(KB.TOPICS).map(function (k) { return '<label class="fk-opt"><input type="radio" name="icTopic" value="' + k + '"' + (k === st.topic ? " checked" : "") + "><b>" + esc(topicName(k)) + "</b></label>"; }).join("");
  }
  renderTopics();
  $("#icTopics").addEventListener("change", function (e) { st.topic = e.target.value; });
  $("#icCoins").innerHTML = [0, 1, 2].map(function (i) { return '<span class="ic-coin" data-i="' + i + '"><span class="ic-coin-in">' + coinSVG + '</span><b class="ic-coin-v"></b></span>'; }).join("");
  function coinLabels() {
    document.querySelectorAll(".ic-coin").forEach(function (el, i) { el.querySelector(".ic-coin-v").textContent = st.coins ? (st.coins[i] === 3 ? T("iching.heads", "หัว 3") : T("iching.tails", "ก้อย 2")) : ""; });
  }
  function renderBuild() {
    var n = st.values.length;
    $("#icBuild").innerHTML = hexSVG(st.values.map(function (v) { return IC.isYang(v) ? 1 : 0; }).concat([undefined, undefined, undefined, undefined, undefined, undefined]).slice(0, 6),
      st.values.map(function (v, i) { return IC.isChanging(v) ? i + 1 : 0; }).filter(Boolean), "ic-hex big", T("iching.building", "กว้าที่กำลังสร้าง {n} จาก 6 เส้น", { n: n }));
    $("#icLines").innerHTML = st.values.map(function (v, i) { return "<li>" + esc(T("iching.lineN", "เส้นที่ {n}:", { n: i + 1 })) + " <b>" + v + "</b> " + esc(valName(v)) + "</li>"; }).join("");
    $("#icTossCount").textContent = n < 6 ? T("iching.tossCount", "โยนครั้งที่ {n} จาก 6 (สร้างเส้นจากล่างขึ้นบน)", { n: n + 1 }) : T("iching.tossDone", "ครบ 6 เส้นแล้ว");
    $("#icToss").textContent = n < 6 ? T("iching.tossBtn", "โยนเหรียญ ({n}/6)", { n: n + 1 }) : T("iching.seeResult", "ดูผล");
  }
  /** รอบ 11: คำถามที่พิมพ์เองมีสัญญาณวิกฤต → แสดงการ์ดช่วยเหลือแทนการทำนาย (ไม่เก็บ/ไม่ส่งข้อความ) — คืน true เมื่อหยุด */
  // round 3: the question is shown back only when it is plain; otherwise a neutral placeholder
  function echoQ(s) { var CRx = window.LQFortuneCrisis; return !s || !CRx ? s : CRx.plainName(s) || CRx.softText((window.LQI18N && window.LQI18N.lang) || "th").qHidden; }
  function crisisStop(q) {
    var FAx = window.FortuneAI, box = document.getElementById("icSupport");
    var CRx = window.LQFortuneCrisis, lang = (window.LQI18N && window.LQI18N.lang) || "th";
    var hard = !!(FAx && FAx.crisis && FAx.crisis.check(q)), soft = !hard && !!(CRx && CRx.pageSoft()); // round 3: the soft step
    if (!hard && !soft) { if (box) { box.hidden = true; box.textContent = ""; } return false; }
    if (!box) { box = document.createElement("div"); box.id = "icSupport"; box.tabIndex = -1; $("#icSetup").insertAdjacentElement("afterend", box); }
    var card = function () { box.hidden = false; FAx.crisis.render(box, FAx.crisis.result({ lang: lang })); box.focus(); };
    box.hidden = false;
    if (soft) { CRx.renderSoft(box, lang, function () { CRx.ack(); box.hidden = true; box.textContent = ""; $("#icStart").click(); }, card); return true; }
    FAx.crisis.render(box, FAx.crisis.result({ lang: lang }));
    box.focus();
    return true;
  }
  $("#icStart").addEventListener("click", function () {
    if (crisisStop($("#icQuestion").value)) return;
    st.values = []; st.cast = null; st.coins = null;
    $("#icSetup").hidden = true; $("#icStage").hidden = false; $("#icResult").hidden = true;
    renderBuild(); $("#icToss").focus();
  });
  async function tossOnce() {
    if (st.busy || st.values.length >= 6) return;
    st.busy = true;
    var t = IC.tossLine();
    var coins = document.querySelectorAll(".ic-coin");
    coins.forEach(function (el) { el.classList.remove("heads", "tails"); el.classList.add("spin"); el.querySelector(".ic-coin-v").textContent = ""; });
    await FK.wait(650);
    st.coins = t.coins;
    coins.forEach(function (el, i) { el.classList.remove("spin"); el.classList.add(t.coins[i] === 3 ? "heads" : "tails"); });
    coinLabels();
    st.values.push(t.value); renderBuild();
    st.busy = false;
    if (st.values.length === 6) { await FK.wait(400); showResult(IC.cast(st.values)); }
  }
  $("#icToss").addEventListener("click", function () { if (st.values.length >= 6 && st.cast == null) showResult(IC.cast(st.values)); else tossOnce(); });
  $("#icAuto").addEventListener("click", async function () { while (st.values.length < 6) await tossOnce(); });
  $("#icBack").addEventListener("click", reset);

  function hexCard(n, bits, changing, role) {
    var h = KB.HEX[n], lo = IC.hexFromBits(bits);
    return '<div class="ic-hexcard"><p class="ic-role">' + esc(role) + "</p>" + hexSVG(bits, changing, "ic-hex big", hexLabel(n)) +
      '<p class="ic-zh" lang="zh">' + esc(hChar(n)) + '</p><h3>' + esc(T("iching.cardH", "กว้าที่ {n} · {th}", { n: n, th: hName(n) })) + '</h3><p class="fk-small">' + esc(h.py) + " · " + esc(image(lo.lower, lo.upper)) + " " + KB.TRIGRAMS[lo.upper].sym + KB.TRIGRAMS[lo.lower].sym + "</p>" +
      '<ul class="fk-chips">' + hKw(n).map(function (k) { return "<li>" + esc(k) + "</li>"; }).join("") + "</ul></div>";
  }
  var stats;
  /** วาดผล (ใช้ทั้งตอนได้ผลและตอนสลับภาษา) — ประกอบคำทำนายใหม่ด้วย facts ชุดเดิม */
  function renderResult(c) {
    var fo = IC.focus(c);
    var q = echoQ($("#icQuestion").value.trim());
    $("#icResMeta").innerHTML = esc(T("iching.resTopic", "หัวข้อ")) + " <b>" + esc(topicName(st.topic)) + "</b>" + (q ? "<br>" + esc(T("iching.resQ", "คำถาม:")) + " <q>" + esc(q) + "</q>" : "");
    $("#icHexes").innerHTML = hexCard(c.primary, c.bits, c.changing, T("iching.rolePrimary", "กว้าหลัก (สถานการณ์ตอนนี้)")) +
      (c.relating ? '<span class="ic-arrow" aria-hidden="true">→</span>' + hexCard(c.relating, c.relBits, [], T("iching.roleRelating", "กว้าที่จะกลายเป็น (แนวโน้ม)")) : "");
    $("#icRule").innerHTML = "<b>" + esc(T("iching.howRead", "วิธีอ่าน:")) + "</b> " + esc(ruleText(c)) + (fo.lines.length ? esc(T("iching.keyLines", " · เส้นที่ให้น้ำหนัก: {l}", { l: fo.lines.join(", ") })) : "");
    $("#icGist").innerHTML = '<p class="ic-gist">' + esc(hx(c.primary, "gist")) + "</p>" + (c.changing.length ? '<ul class="ic-lines">' + c.changing.map(function (p) {
      var old = c.values[p - 1] === 9;
      return "<li" + (fo.lines.indexOf(p) === 0 ? ' class="key"' : "") + "><b>" + esc(linePos(p)) + "</b> — " + esc(lineText(p, old)) + "</li>";
    }).join("") + "</ul>" : "");
    $("#icReadWrap").innerHTML = FK.readingBlock("icRd", T("iching.rdTitle", "คำทำนายโดยละเอียด"), true, st.topic);
    FK.bindReading("icRd", "iching", function (topic, r) { return IC.buildFacts(c, topic, { rng: r }); }, { withTopics: true, topic: st.topic, onTopic: function (t) { st.topic = t; }, userText: function () { return ($("#icQuestion") || {}).value || ""; } });
  }
  function showResult(c) {
    st.cast = c;
    $("#icStage").hidden = true; $("#icResult").hidden = false;
    renderResult(c);
    stats.add({ hex: c.primary, topics: st.topic, changing: c.changing.length });
    $("#icResTitle").focus();
    kiosk.touch();
  }
  function reset() {
    st.values = []; st.cast = null; st.coins = null;
    $("#icSetup").hidden = false; $("#icStage").hidden = true; $("#icResult").hidden = true; $("#icCardImg").hidden = true;
    if (document.body.classList.contains("fk-kiosk")) $("#icQuestion").value = "";
    document.querySelectorAll(".ic-coin").forEach(function (el) { el.classList.remove("heads", "tails"); el.querySelector(".ic-coin-v").textContent = ""; });
  }
  $("#icAgain").addEventListener("click", function () { reset(); $("#icSetup").scrollIntoView({ block: "start" }); });
  $("#icPrint").addEventListener("click", function () { window.print(); });

  function card(c, lines, kind) {
    var n = c.primary;
    return {
      kind: kind, glow: "rgba(234,179,8,.32)", artH: 360, title: T("iching.cardTitle", "กว้าที่ {n} {zh} · {th}", { n: n, zh: hChar(n), th: hName(n) }),
      sub: c.relating ? T("iching.cardSub", "กำลังเปลี่ยนเป็นกว้าที่ {n} · {th}", { n: c.relating, th: hName(c.relating) }) : hKw(n).join(" · "),
      msgs: (lines && lines.length >= 2 ? lines : [hx(n, "gist"), hx(n, "advice")]).slice(0, 2).concat([T("iching.cardAdvice", "คำแนะนำ: {a}", { a: hx(n, "advice") })]).slice(0, 3),
      foot: T("iching.cardFoot", KB.disclaimerShort + " · ตัวบทอี้จิงเป็นสาธารณสมบัติ"),
      art: function (cx, x, y, w, h) {
        var hw = 230, hh = 250, x0 = c.relating ? x + w / 2 - hw - 70 : x + (w - hw) / 2, yy = y + 40;
        drawHex(cx, x0, yy, hw, hh, c.bits, c.changing, "#fde68a");
        if (c.relating) {
          cx.fillStyle = "#c9d0ea"; cx.font = "600 64px Prompt, sans-serif"; cx.textAlign = "center"; cx.textBaseline = "middle"; cx.fillText("→", x + w / 2, yy + hh / 2);
          drawHex(cx, x + w / 2 + 70, yy, hw, hh, c.relBits, [], "#a5f3fc");
        }
      }
    };
  }
  $("#icShare").addEventListener("click", function () {
    var rd = FK.readings.icRd || {};
    if (st.cast) FK.share(this, card(st.cast, rd.lines, T("iching.cardKind", "อี้จิง")), "lensiq-iching.jpg", $("#icCardImg"), T("iching.shareTitle", "อี้จิง — LENSIQ"));
  });

  /* ---------- กว้าประจำวัน ---------- */
  var dailyDone = false;
  function renderDaily() {
    if (dailyDone) return; dailyDone = true;
    var c = st.daily = st.daily || IC.dailyCast(), P = c.primary;
    var date = (function () { try { return new Date().toLocaleDateString(isZh() ? "zh-CN" : isEn() ? "en-GB" : "th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return FK.dayKey(); } })();
    $("#icDaily").innerHTML = '<p class="fk-small">' + esc(date) + "</p>" + hexCard(P, c.bits, c.changing, T("iching.roleDaily", "กว้าประจำวันนี้")) +
      '<p class="ic-gist">' + esc(hx(P, "gist")) + '</p><p class="fk-small">' + esc(T("iching.dailyNote", KB.DAILY_NOTE)) + "</p>" + FK.readingBlock("icDayRd", T("iching.dayRdTitle", "คำทำนายประจำวัน"), true) +
      '<div class="fk-res-actions"><button class="btn primary big" id="icDayShare" type="button">' + esc(T("iching.dayShare", "แชร์การ์ดประจำวัน")) + '</button></div><img class="fk-cardimg" id="icDayImg" alt="' + esc(T("iching.dayImgAlt", "การ์ดกว้าประจำวันสำหรับแชร์")) + '" hidden>';
    FK.bindReading("icDayRd", "iching", function (topic, r) { return IC.buildFacts(c, topic, { rng: r }); }, { withTopics: true });
    $("#icDayShare").addEventListener("click", function () { FK.share(this, card(c, (FK.readings.icDayRd || {}).lines, T("iching.dayKind", "กว้าประจำวัน")), "lensiq-iching-daily.jpg", $("#icDayImg"), T("iching.dayShareTitle", "กว้าประจำวัน — LENSIQ")); });
  }

  /* ---------- ตาราง 64 กว้า ---------- */
  var allDone = false;
  function renderAll() {
    if (allDone) return; allDone = true;
    var html = "";
    for (var n = 1; n <= 64; n++) html += '<button type="button" class="ic-cell" data-n="' + n + '">' + hexSVG(IC.bitsOf(n), [], "ic-hex", hexLabel(n)) + "<b>" + n + ' <span lang="zh">' + esc(hChar(n)) + "</span></b><small>" + esc(hName(n)) + "</small></button>";
    $("#icGrid").innerHTML = html;
  }
  function renderDetail(n) {
    var dt = function (k, th) { return "<dt>" + esc(T("iching.dt." + k, th)) + "</dt>"; };
    $("#icDetail").innerHTML = hexCard(n, IC.bitsOf(n), [], T("iching.roleDetail", "รายละเอียดกว้า")) + '<dl class="ic-dl">' + dt("gist", "แก่น") + "<dd>" + esc(hx(n, "gist")) + "</dd>" + dt("love", "ความรัก") + "<dd>" + esc(hx(n, "love")) + "</dd>" +
      dt("work", "การงาน") + "<dd>" + esc(hx(n, "work")) + "</dd>" + dt("money", "การเงิน") + "<dd>" + esc(hx(n, "money")) + "</dd>" + dt("advice", "คำแนะนำ") + "<dd>" + esc(hx(n, "advice")) + "</dd></dl>";
  }
  $("#icGrid").addEventListener("click", function (e) {
    var b = e.target.closest(".ic-cell"); if (!b) return;
    st.detail = +b.dataset.n; renderDetail(st.detail);
    $("#icDetail").hidden = false; $("#icDetail").scrollIntoView({ block: "nearest", behavior: FK.reduced ? "auto" : "smooth" });
  });

  /* ---------- สถิติ / บูธ / แหล่งอ้างอิง ---------- */
  stats = FK.statsPanel({
    box: "icStats", toggle: "icStatsOn", clear: "icStatsClear", key: "ic-stats", prefKey: "ic-prefs",
    render: function (s) { return '<p class="fk-small">' + esc(T("iching.statHex", "กว้าที่ออกบ่อย")) + "</p>" + FK.bars(s.hex, s.total, function (k) { return k + " " + (KB.HEX[k] ? hName(k) : ""); }, 5) + '<p class="fk-small">' + esc(T("iching.statTopic", "หัวข้อ")) + "</p>" + FK.bars(s.topics, s.total, function (k) { return KB.TOPICS[k] ? topicName(k) : k; }, 4); }
  });
  var kiosk = FK.kiosk({ toggle: "icKiosk", exit: "icKioskExit", idle: "icIdle", busy: function () { return !$("#icSetup").hidden ? false : true; }, reset: function () { reset(); selectTab("tabCast"); } });
  // citation list: back office / docs only (owner order 2026-11-12, tools/fortune-sources.mjs)

  /* ---------- สลับภาษา: วาดข้อความแบบไดนามิกใหม่ และประกอบคำทำนายใหม่จาก facts เดิม ---------- */
  window.addEventListener("lq-lang", function () {
    renderTopics(); coinLabels();
    if (stats.render) stats.render();
    if (!$("#icStage").hidden) renderBuild();
    if (st.cast && !$("#icResult").hidden) renderResult(st.cast);
    if (dailyDone) { dailyDone = false; renderDaily(); }
    if (allDone) { allDone = false; renderAll(); }
    if (st.detail && !$("#icDetail").hidden) renderDetail(st.detail);
  });

  if (location.hash === "#daily") selectTab("tabDaily"); else if (location.hash === "#all") selectTab("tabAll");
  window.__ic = { state: st, showResult: showResult, reset: reset }; // ใช้ทดสอบ
})();
