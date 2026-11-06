/* อี้จิง (易經) — LENSIQ
   ส่วนบน: ฟังก์ชันล้วน (โยนเหรียญ 3 เหรียญ, หาฮู่จากเส้น, เส้นเปลี่ยน → ฮู่ที่จะกลายเป็น, กฎอ่านเส้นเปลี่ยน, facts) — ทดสอบใน Node
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
  /** ฮู่หมายเลข n → bits (ล่าง→บน) */
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
  /** สุ่มฮู่ทั้งชุดด้วย crypto (หรือ u32 ที่กำหนด) */
  function castRandom(u32) { var v = []; for (var i = 0; i < 6; i++) v.push(tossLine(u32).value); return cast(v); }
  /** ฮู่ประจำวัน — seed จากวันที่ เหมือนกันทั้งวัน */
  function dailyCast(d) {
    var r = FK.mulberry32(FK.hashStr("lensiq-iching-" + FK.dayKey(d)));
    return castRandom(function () { return Math.floor(r() * 4294967296) >>> 0; });
  }
  function hexLabel(n) { var h = KB.HEX[n]; return "ฮู่ที่ " + n + " " + h.zh + " (" + h.py + ") · " + h.th; }
  /** ชื่อสำหรับประโยคคำทำนาย (ไทยก่อน อักษรจีนในวงเล็บ ซึ่งตัวเรียบเรียงจะตัดออกเมื่อเอ่ยซ้ำ) */
  function proseLabel(n) { var h = KB.HEX[n]; return "ฮู่ที่ " + n + " " + h.th + " (" + h.zh + " " + h.py + ")"; }
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
    var pm = hexM(P);
    items.push({ id: "hex." + c.primary, group: "ฮู่หลัก", label: proseLabel(c.primary), short: "ฮู่" + P.th, evidence: imageOf(c.lower, c.upper) + " · " + fo.rule,
      strength: fo.hex === "relating" ? 0.86 : 0.97, tags: Object.keys(pm), meanings: pm });
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
      var R = KB.HEX[c.relating], rm = { timing: [fillK(pk(r, F.timing), { H: "ฮู่" + R.th, K: kw(R) }), R.gist], advice: [R.advice] };
      var tk = topic === "overall" ? null : topic;
      if (tk) rm[tk] = [R[tk]];
      items.push({ id: "rel." + c.relating, group: "ฮู่ที่จะกลายเป็น", label: proseLabel(c.relating), short: "ฮู่" + R.th, evidence: imageOf(c.relLower, c.relUpper),
        strength: fo.hex === "primary" ? 0.8 : 0.93, tags: Object.keys(rm), meanings: rm });
    } else {
      items.push({ id: "still", group: "จังหวะ", label: "ไม่มีเส้นเปลี่ยน", short: "ความนิ่ง", strength: 0.6, tags: ["timing"],
        meanings: { timing: ["สถานการณ์ช่วงนี้ค่อนข้างนิ่งและมั่นคง สิ่งที่ฮู่หลักบอกจะเป็นแนวทางได้อีกระยะหนึ่ง", "ไม่มีเส้นใดเปลี่ยน แปลว่าพลังของช่วงนี้ชัดเจนและต่อเนื่อง"] } });
    }
    return {
      domain: "iching", topic: topic || "overall", subject: opts.nickname ? { nickname: opts.nickname } : {},
      headline: "ฮู่" + P.th + (c.relating ? " ที่กำลังเปลี่ยนไปสู่ฮู่" + KB.HEX[c.relating].th : ""), items: items,
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
  var st = { values: [], topic: "overall", cast: null, busy: false, daily: null };

  /* ---------- วาดฮู่ (SVG) ---------- */
  function hexSVG(bits, changing, cls, label) {
    var W = 120, lh = 12, gap = 9, H = 6 * lh + 5 * gap, out = [];
    for (var i = 0; i < 6; i++) {
      var pos = i + 1, y = H - (i + 1) * lh - i * gap, ch = changing && changing.indexOf(pos) >= 0, col = ch ? "var(--ic-ch,#c2410c)" : "currentColor";
      if (bits[i] === undefined) { out.push('<rect x="0" y="' + y + '" width="' + W + '" height="' + lh + '" rx="3" fill="currentColor" opacity=".12"/>'); continue; }
      if (bits[i]) out.push('<rect x="0" y="' + y + '" width="' + W + '" height="' + lh + '" rx="3" fill="' + col + '"/>');
      else out.push('<rect x="0" y="' + y + '" width="52" height="' + lh + '" rx="3" fill="' + col + '"/><rect x="68" y="' + y + '" width="52" height="' + lh + '" rx="3" fill="' + col + '"/>');
      if (ch) out.push('<circle cx="' + (W + 14) + '" cy="' + (y + lh / 2) + '" r="5" fill="none" stroke="' + col + '" stroke-width="2.4"/>');
    }
    return '<svg class="' + (cls || "ic-hex") + '" viewBox="-2 -2 ' + (W + 26) + " " + (H + 4) + '" role="img" aria-label="' + esc(label || "ภาพฮู่") + '">' + out.join("") + "</svg>";
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
  $("#icTopics").innerHTML = Object.keys(KB.TOPICS).map(function (k, i) { return '<label class="fk-opt"><input type="radio" name="icTopic" value="' + k + '"' + (i ? "" : " checked") + "><b>" + esc(KB.TOPICS[k]) + "</b></label>"; }).join("");
  $("#icTopics").addEventListener("change", function (e) { st.topic = e.target.value; });
  $("#icCoins").innerHTML = [0, 1, 2].map(function (i) { return '<span class="ic-coin" data-i="' + i + '"><span class="ic-coin-in">' + coinSVG + '</span><b class="ic-coin-v"></b></span>'; }).join("");
  function renderBuild() {
    $("#icBuild").innerHTML = hexSVG(st.values.map(function (v) { return IC.isYang(v) ? 1 : 0; }).concat([undefined, undefined, undefined, undefined, undefined, undefined]).slice(0, 6),
      st.values.map(function (v, i) { return IC.isChanging(v) ? i + 1 : 0; }).filter(Boolean), "ic-hex big", "ฮู่ที่กำลังสร้าง " + st.values.length + " จาก 6 เส้น");
    $("#icLines").innerHTML = st.values.map(function (v, i) { return "<li>เส้นที่ " + (i + 1) + ": <b>" + v + "</b> " + (v === 9 ? "หยางเก่า (เปลี่ยน)" : v === 7 ? "หยาง" : v === 8 ? "หยิน" : "หยินเก่า (เปลี่ยน)") + "</li>"; }).join("");
    $("#icTossCount").textContent = st.values.length < 6 ? "โยนครั้งที่ " + (st.values.length + 1) + " จาก 6 (สร้างเส้นจากล่างขึ้นบน)" : "ครบ 6 เส้นแล้ว";
    $("#icToss").textContent = st.values.length < 6 ? "โยนเหรียญ (" + (st.values.length + 1) + "/6)" : "ดูผล";
  }
  $("#icStart").addEventListener("click", function () {
    st.values = []; st.cast = null;
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
    coins.forEach(function (el, i) { el.classList.remove("spin"); el.classList.add(t.coins[i] === 3 ? "heads" : "tails"); el.querySelector(".ic-coin-v").textContent = t.coins[i] === 3 ? "หัว 3" : "ก้อย 2"; });
    st.values.push(t.value); renderBuild();
    st.busy = false;
    if (st.values.length === 6) { await FK.wait(400); showResult(IC.cast(st.values)); }
  }
  $("#icToss").addEventListener("click", function () { if (st.values.length >= 6 && st.cast == null) showResult(IC.cast(st.values)); else tossOnce(); });
  $("#icAuto").addEventListener("click", async function () { while (st.values.length < 6) await tossOnce(); });
  $("#icBack").addEventListener("click", reset);

  function hexCard(n, bits, changing, role) {
    var h = KB.HEX[n], lo = IC.hexFromBits(bits);
    return '<div class="ic-hexcard"><p class="ic-role">' + esc(role) + "</p>" + hexSVG(bits, changing, "ic-hex big", IC.hexLabel(n)) +
      '<p class="ic-zh" lang="zh">' + esc(h.zh) + '</p><h3>ฮู่ที่ ' + n + " · " + esc(h.th) + '</h3><p class="fk-small">' + esc(h.py) + " · " + esc(IC.imageOf(lo.lower, lo.upper)) + " " + KB.TRIGRAMS[lo.upper].sym + KB.TRIGRAMS[lo.lower].sym + "</p>" +
      '<ul class="fk-chips">' + h.kw.map(function (k) { return "<li>" + esc(k) + "</li>"; }).join("") + "</ul></div>";
  }
  var stats;
  function showResult(c) {
    st.cast = c;
    var fo = IC.focus(c), P = KB.HEX[c.primary];
    $("#icStage").hidden = true; $("#icResult").hidden = false;
    var q = $("#icQuestion").value.trim();
    $("#icResMeta").innerHTML = "หัวข้อ <b>" + esc(KB.TOPICS[st.topic]) + "</b>" + (q ? '<br>คำถาม: <q>' + esc(q) + "</q>" : "");
    $("#icHexes").innerHTML = hexCard(c.primary, c.bits, c.changing, "ฮู่หลัก (สถานการณ์ตอนนี้)") +
      (c.relating ? '<span class="ic-arrow" aria-hidden="true">→</span>' + hexCard(c.relating, c.relBits, [], "ฮู่ที่จะกลายเป็น (แนวโน้ม)") : "");
    $("#icRule").innerHTML = "<b>วิธีอ่าน:</b> " + esc(fo.rule) + (fo.lines.length ? " · เส้นที่ให้น้ำหนัก: " + fo.lines.join(", ") : "");
    $("#icGist").innerHTML = '<p class="ic-gist">' + esc(P.gist) + "</p>" + (c.changing.length ? '<ul class="ic-lines">' + c.changing.map(function (p) {
      var L = KB.LINE_POS[p - 1], old = c.values[p - 1] === 9;
      return "<li" + (fo.lines.indexOf(p) === 0 ? ' class="key"' : "") + "><b>" + esc(L.th) + "</b> — " + esc((old ? L.y : L.n)[0]) + "</li>";
    }).join("") + "</ul>" : "");
    $("#icReadWrap").innerHTML = FK.readingBlock("icRd", "คำทำนายโดยละเอียด", true, st.topic);
    FK.bindReading("icRd", "iching", function (topic, r) { return IC.buildFacts(c, topic, { rng: r }); }, { withTopics: true, topic: st.topic, onTopic: function (t) { st.topic = t; } });
    stats.add({ hex: c.primary, topics: st.topic, changing: c.changing.length });
    $("#icResTitle").focus();
    kiosk.touch();
  }
  function reset() {
    st.values = []; st.cast = null;
    $("#icSetup").hidden = false; $("#icStage").hidden = true; $("#icResult").hidden = true; $("#icCardImg").hidden = true;
    if (document.body.classList.contains("fk-kiosk")) $("#icQuestion").value = "";
    document.querySelectorAll(".ic-coin").forEach(function (el) { el.classList.remove("heads", "tails"); el.querySelector(".ic-coin-v").textContent = ""; });
  }
  $("#icAgain").addEventListener("click", function () { reset(); $("#icSetup").scrollIntoView({ block: "start" }); });
  $("#icPrint").addEventListener("click", function () { window.print(); });

  function card(c, lines, kind) {
    var P = KB.HEX[c.primary];
    return {
      kind: kind, glow: "rgba(234,179,8,.32)", artH: 360, title: "ฮู่ที่ " + c.primary + " " + P.zh + " · " + P.th,
      sub: c.relating ? "กำลังเปลี่ยนเป็นฮู่ที่ " + c.relating + " · " + KB.HEX[c.relating].th : P.kw.join(" · "),
      msgs: (lines && lines.length >= 2 ? lines : [P.gist, P.advice]).slice(0, 2).concat(["คำแนะนำ: " + P.advice]).slice(0, 3),
      foot: KB.disclaimerShort + " · ตัวบทอี้จิงเป็นสาธารณสมบัติ",
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
    if (st.cast) FK.share(this, card(st.cast, rd.lines, "อี้จิง"), "lensiq-iching.jpg", $("#icCardImg"), "อี้จิง — LENSIQ");
  });

  /* ---------- ฮู่ประจำวัน ---------- */
  function renderDaily() {
    if (st.daily) return;
    var c = st.daily = IC.dailyCast(), P = KB.HEX[c.primary];
    var date = (function () { try { return new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return FK.dayKey(); } })();
    $("#icDaily").innerHTML = '<p class="fk-small">' + esc(date) + "</p>" + hexCard(c.primary, c.bits, c.changing, "ฮู่ประจำวันนี้") +
      '<p class="ic-gist">' + esc(P.gist) + '</p><p class="fk-small">' + esc(KB.DAILY_NOTE) + "</p>" + FK.readingBlock("icDayRd", "คำทำนายประจำวัน", true) +
      '<div class="fk-res-actions"><button class="btn primary big" id="icDayShare" type="button">แชร์การ์ดประจำวัน</button></div><img class="fk-cardimg" id="icDayImg" alt="การ์ดฮู่ประจำวันสำหรับแชร์" hidden>';
    FK.bindReading("icDayRd", "iching", function (topic, r) { return IC.buildFacts(c, topic, { rng: r }); }, { withTopics: true });
    $("#icDayShare").addEventListener("click", function () { FK.share(this, card(c, (FK.readings.icDayRd || {}).lines, "ฮู่ประจำวัน"), "lensiq-iching-daily.jpg", $("#icDayImg"), "ฮู่ประจำวัน — LENSIQ"); });
  }

  /* ---------- ตาราง 64 ฮู่ ---------- */
  var allDone = false;
  function renderAll() {
    if (allDone) return; allDone = true;
    var html = "";
    for (var n = 1; n <= 64; n++) { var h = KB.HEX[n]; html += '<button type="button" class="ic-cell" data-n="' + n + '">' + hexSVG(IC.bitsOf(n), [], "ic-hex", IC.hexLabel(n)) + "<b>" + n + " " + esc(h.zh) + "</b><small>" + esc(h.th) + "</small></button>"; }
    $("#icGrid").innerHTML = html;
  }
  $("#icGrid").addEventListener("click", function (e) {
    var b = e.target.closest(".ic-cell"); if (!b) return;
    var n = +b.dataset.n, h = KB.HEX[n], bits = IC.bitsOf(n);
    $("#icDetail").innerHTML = hexCard(n, bits, [], "รายละเอียดฮู่") + '<dl class="ic-dl"><dt>แก่น</dt><dd>' + esc(h.gist) + "</dd><dt>ความรัก</dt><dd>" + esc(h.love) + "</dd><dt>การงาน</dt><dd>" + esc(h.work) + "</dd><dt>การเงิน</dt><dd>" + esc(h.money) + "</dd><dt>คำแนะนำ</dt><dd>" + esc(h.advice) + "</dd></dl>";
    $("#icDetail").hidden = false; $("#icDetail").scrollIntoView({ block: "nearest", behavior: FK.reduced ? "auto" : "smooth" });
  });

  /* ---------- สถิติ / บูธ / แหล่งอ้างอิง ---------- */
  stats = FK.statsPanel({
    box: "icStats", toggle: "icStatsOn", clear: "icStatsClear", key: "ic-stats", prefKey: "ic-prefs",
    render: function (s) { return '<p class="fk-small">ฮู่ที่ออกบ่อย</p>' + FK.bars(s.hex, s.total, function (k) { return k + " " + (KB.HEX[k] ? KB.HEX[k].th : ""); }, 5) + '<p class="fk-small">หัวข้อ</p>' + FK.bars(s.topics, s.total, function (k) { return KB.TOPICS[k] || k; }, 4); }
  });
  var kiosk = FK.kiosk({ toggle: "icKiosk", exit: "icKioskExit", idle: "icIdle", busy: function () { return !$("#icSetup").hidden ? false : true; }, reset: function () { reset(); selectTab("tabCast"); } });
  $("#icSources").innerHTML = KB.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + "</a></li>"; }).join("");
  if (location.hash === "#daily") selectTab("tabDaily"); else if (location.hash === "#all") selectTab("tabAll");
  window.__ic = { state: st, showResult: showResult, reset: reset }; // ใช้ทดสอบ
})();
