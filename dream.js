/* ทำนายฝัน — LENSIQ
   ส่วนบน: ฟังก์ชันล้วน (หาสัญลักษณ์จากข้อความความฝัน, ประเภทฝัน 4 แบบตามตำราไทย, facts) — ทดสอบใน Node
   ส่วนล่าง: UI ในเบราว์เซอร์ (ทำงานเมื่อพบ #drApp)
   ความเป็นส่วนตัว: ข้อความความฝันประมวลผลในเครื่องเท่านั้น ไม่บันทึก ไม่ส่งออก (AI ได้รับเฉพาะรายการสัญลักษณ์ที่พบ)
   ไม่มีเลขเด็ด/เลขนำโชค — เพื่อความบันเทิงตามความเชื่อ */
(function (root) {
  "use strict";
  var KB = root.DREAM_KB || (typeof require === "function" ? require("./dream-kb.js") : null);
  var FK = root.FortuneKit || (typeof require === "function" ? require("./fortune-kit.js") : null);
  var BY = {}; KB.SYMBOLS.forEach(function (s) { BY[s.id] = s; });
  // คำค้นทั้งหมด เรียงยาวก่อน เพื่อให้ "งูเห่า" ชนะ "งู" และ "เครื่องบิน" ชนะ "บินได้"
  var ALIASES = [];
  KB.SYMBOLS.forEach(function (s) { s.al.forEach(function (a) { ALIASES.push({ a: a.normalize("NFC"), id: s.id }); }); });
  ALIASES.sort(function (x, y) { return y.a.length - x.a.length; });

  function normalize(t) { return String(t || "").normalize("NFC").replace(/\s+/g, "").toLowerCase(); }
  /** หาสัญลักษณ์ในข้อความ → [{id, alias, at}] ตามลำดับที่ปรากฏ ไม่ซ้ำ สูงสุด max (ค่าเริ่ม 8) */
  function detect(text, max) {
    var s = normalize(text).slice(0, 600), used = new Array(s.length), found = {}, out = [];
    ALIASES.forEach(function (x) {
      var from = 0, i;
      while ((i = s.indexOf(x.a, from)) >= 0) {
        var free = true;
        for (var k = i; k < i + x.a.length; k++) if (used[k]) { free = false; break; }
        if (free) {
          for (var k2 = i; k2 < i + x.a.length; k2++) used[k2] = true;
          if (!found[x.id]) { found[x.id] = 1; out.push({ id: x.id, alias: x.a, at: i }); }
        }
        from = i + x.a.length;
      }
    });
    out.sort(function (a, b) { return a.at - b.at; });
    return out.slice(0, max || 8);
  }
  var SACRED = ["monk", "buddha", "temple", "naga", "merit", "ancestor", "candle"];
  /** ประเภทฝัน 4 แบบตามตำราไทย (ฉบับตีความเพื่อความบันเทิง) */
  function dreamType(ids, mood, time) {
    if (ids.some(function (id) { return SACRED.indexOf(id) >= 0; })) return "thep";
    if (time === "dawn" && ["happy", "excited", "calm"].indexOf(mood) >= 0) return "bupphanimit";
    if (time === "early" && !mood) return "that";
    if (["anxious", "confused", "sad"].indexOf(mood) >= 0 || time === "late" || time === "nap") return "jit";
    if (time === "early") return "that";
    return time === "dawn" ? "bupphanimit" : "jit";
  }
  /** ธีมเด่น (ธีมที่ปรากฏ ≥ 2 สัญลักษณ์) */
  function dominantTheme(ids) {
    var c = {}; ids.forEach(function (id) { var t = BY[id] && BY[id].theme; if (t) c[t] = (c[t] || 0) + 1; });
    var top = Object.keys(c).sort(function (a, b) { return c[b] - c[a]; })[0];
    return top && c[top] >= 2 ? top : null;
  }
  /** ความหมายของช่วงเวลาที่เข้ากับประเภทฝัน (ty = KB.TYPES[...]) */
  function timeMeaning(ty, time) {
    var TI = KB.TIMES[time]; if (!TI) return "";
    return ty && ty.omen === false && TI.r ? TI.r : TI.o;
  }
  /* ฝันที่ตำราไม่ถือเป็นลาง (จิตนิวรณ์/ธาตุกำเริบ) ต้องไม่มีถ้อยคำทำนายล่วงหน้า:
     ความหมายที่มีคำว่า ลาง/สัญญาณ/นิมิต/จะมี…เข้ามา ถูกแทนด้วยความหมายแบบ "ภาพสะท้อนใจ" ของธีมเดียวกัน */
  var OMEN_WORDS = /ลาง|สัญญาณ|นิมิต|บอกเหตุ|เห็นผล|โชคลาภ|โชคดี|ไหลมา|เข้ามา|เนื้อคู่|จะได้|จะมี|จะงอกเงย|กำลังจะ|อาจมี|มีโอกาส|มีแนวโน้ม|บารมี|ข่าวดี|อุปถัมภ์|คุ้มครอง/;
  function thaiList(a) { return a.length <= 1 ? (a[0] || "") : a.slice(0, -1).join(" ") + " และ" + a[a.length - 1]; }
  function buildFacts(ids, mood, time, topic, opts) {
    opts = opts || {};
    var r = opts.rng || Math.random, pk = FK.pickR, items = [], M = KB.MOODS[mood], boost = M ? M.w : 0;
    var valid = ids.filter(function (id) { return BY[id]; }).slice(0, 8);
    var ty = KB.TYPES[dreamType(valid, mood, time)], TI = KB.TIMES[time], omen = ty.omen !== false;
    var clean = function (arr) { return arr.filter(function (t) { return t && (omen || !OMEN_WORDS.test(t)); }); };
    valid.forEach(function (id, i) {
      var s = BY[id], T = KB.THEMES[s.theme], x = s.x, R = T.r || {};
      var m;
      if (omen) {
        m = {
          overview: [s.o, pk(r, T.o)],
          love: x.l ? [x.l, pk(r, T.l)] : T.l.slice(),
          work: x.w ? [x.w, pk(r, T.w)] : T.w.slice(),
          money: x.m ? [x.m, pk(r, T.m)] : T.m.slice(),
          advice: x.a ? [x.a].concat(T.a) : T.a.slice()
        };
      } else {
        // ความหมายดั้งเดิมยังบอกได้ว่า "ตำราโยงภาพนี้กับเรื่องอะไร" แต่ไม่อ้างว่าเป็นลางของฝันครั้งนี้
        var ov = OMEN_WORDS.test(s.o) ? "ฝันเห็น" + s.th + " ตำราดั้งเดิมโยงเข้ากับเรื่อง" + T.th + " ในฝันแบบนี้จึงอ่านได้ว่าใจกำลังให้ความสำคัญกับเรื่อง" + T.th : s.o;
        m = {
          overview: clean([ov, pk(r, R.o || T.o)]),
          love: clean([x.l, R.l]), work: clean([x.w, R.w]), money: clean([x.m, R.m]),
          advice: clean([x.a].concat(T.a))
        };
        Object.keys(m).forEach(function (k) { if (!m[k].length) delete m[k]; });
      }
      items.push({ id: "sym." + id, group: "สัญลักษณ์ในฝัน", label: "ฝันเห็น" + s.th, short: s.th + "ในฝัน", evidence: "หมวด" + KB.CATS[s.cat] + " · ธีม" + T.th,
        strength: Math.min(1, (i === 0 ? 0.92 : 0.84 - i * 0.04) + boost), tags: Object.keys(m), meanings: m,
        focus: ["overview", "advice"].concat((KB.THEME_FOCUS && KB.THEME_FOCUS[s.theme]) || []), theme: s.theme });
    });
    var dom = dominantTheme(valid);
    if (dom) {
      var D = KB.THEMES[dom], dm = { overview: omen ? D.o.slice() : (D.r ? D.r.o.slice() : clean(D.o)), advice: clean(D.a.slice()) };
      items.push({ id: "theme." + dom, group: "ธีมเด่นของฝัน", label: "ธีม" + D.th, short: "ธีม" + D.th, strength: 0.8, tags: ["overview", "advice"], meanings: dm, focus: ["overview", "advice"].concat((KB.THEME_FOCUS && KB.THEME_FOCUS[dom]) || []), theme: dom });
    }
    // ความรู้สึกในฝันเป็นส่วนหนึ่งของการอ่านฝัน (ไม่ใช่ "บุคลิก") — วางในภาพรวม ใช้ประโยคตามคลังโดยตรง
    if (M) items.push({ id: "mood." + mood, group: "ความรู้สึกในฝัน", label: "ความรู้สึก" + M.th, short: "ความรู้สึกในฝัน", strength: 0.62, tags: ["overview"], meanings: { overview: [M.o] }, plain: true });
    // ประเภทฝันกำหนดวิธีอ่านทั้งหมด จึงขึ้นก่อนในภาพรวม (ความหมายของช่วงเวลาต้องเข้ากับประเภทฝัน)
    // ภาพรวมอธิบายประเภทฝัน; หัวข้อจังหวะเวลาพูดเฉพาะช่วงเวลาที่ฝัน (ไม่ทวนคำอธิบายประเภทซ้ำ)
    var tm = { overview: ["ตามตำราไทย ฝันครั้งนี้เข้าลักษณะ" + ty.th + " " + (ty.d || "")], timing: TI ? [timeMeaning(ty, time)] : [] };
    if (!TI) delete tm.timing;
    items.push({ id: "type", group: "ประเภทฝัน", label: "ฝันแบบ" + ty.th, short: "ฝันแบบ" + ty.th, strength: 0.95, tags: Object.keys(tm), meanings: tm, plain: true, omen: omen, timingFull: [ty.o].concat(TI ? [timeMeaning(ty, time)] : []) });
    var names = valid.slice(0, 3).map(function (id) { return BY[id].th; });
    return { domain: "dream", topic: topic || "overall", subject: {}, headline: names.length ? "ฝันเห็น" + thaiList(names) : "", items: items,
      register: omen ? "omen" : "reflect" };
  }
  /** ค้นสัญลักษณ์ตามชื่อ/คำค้น (สำหรับช่องค้นหา) */
  function search(q, cat) {
    var n = normalize(q);
    return KB.SYMBOLS.filter(function (s) { return (!cat || s.cat === cat) && (!n || s.al.some(function (a) { return a.indexOf(n) >= 0 || n.indexOf(a) >= 0; }) || s.th.indexOf(n) >= 0); });
  }
  var DR = { normalize: normalize, detect: detect, dreamType: dreamType, timeMeaning: timeMeaning, dominantTheme: dominantTheme, buildFacts: buildFacts, search: search, BY: BY };
  if (typeof module !== "undefined" && module.exports) module.exports = DR;
  root.Dream = DR;
})(typeof window !== "undefined" ? window : globalThis);

/* ================================ UI ================================ */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("drApp")) (function () {
  "use strict";
  var DR = window.Dream, KB = window.DREAM_KB, FK = window.FortuneKit, $ = FK.$, esc = FK.esc;
  var st = { detected: [], manual: [], removed: {}, cat: "", ids: [] };
  var POPULAR = ["snake", "teeth", "elephant", "flood", "fly", "wedding", "chased", "fall", "gold", "monk", "fish", "ex"];

  $("#drMoods").innerHTML = Object.keys(KB.MOODS).map(function (k) { return '<label class="fk-opt"><input type="radio" name="drMood" value="' + k + '"><b>' + esc(KB.MOODS[k].th) + "</b></label>"; }).join("");
  $("#drTimes").innerHTML = Object.keys(KB.TIMES).map(function (k) { return '<label class="fk-opt"><input type="radio" name="drTime" value="' + k + '"><b>' + esc(KB.TIMES[k].th.split(" (")[0]) + "</b><small>" + esc((KB.TIMES[k].th.split(" (")[1] || "").replace(")", "")) + "</small></label>"; }).join("");
  $("#drPopular").innerHTML = POPULAR.map(function (id) { var s = DR.BY[id]; return '<button type="button" class="dr-pop" data-id="' + id + '"><span aria-hidden="true">' + s.ic + "</span> " + esc(s.th) + "</button>"; }).join("");
  $("#drCats").innerHTML = '<button type="button" class="dr-cat" data-c="" aria-pressed="true">ทั้งหมด</button>' + Object.keys(KB.CATS).map(function (k) { return '<button type="button" class="dr-cat" data-c="' + k + '" aria-pressed="false">' + esc(KB.CATS[k]) + "</button>"; }).join("");

  function selected() {
    var ids = st.detected.map(function (d) { return d.id; }).filter(function (id) { return !st.removed[id]; });
    st.manual.forEach(function (id) { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids.slice(0, 8);
  }
  function renderSel() {
    var ids = st.ids = selected();
    $("#drSel").innerHTML = ids.length ? ids.map(function (id) { var s = DR.BY[id]; return '<li><span aria-hidden="true">' + s.ic + "</span> " + esc(s.th) + ' <button type="button" class="dr-x" data-id="' + id + '" aria-label="เอา ' + esc(s.th) + ' ออก">×</button></li>'; }).join("") : '<li class="muted dr-empty">ยังไม่มีสัญลักษณ์ — พิมพ์เล่าความฝัน หรือแตะเลือกด้านล่าง</li>';
    $("#drGo").disabled = !ids.length;
    document.querySelectorAll(".dr-sym,.dr-pop").forEach(function (b) { b.setAttribute("aria-pressed", String(ids.indexOf(b.dataset.id) >= 0)); });
  }
  function renderList() {
    var list = DR.search($("#drSearch").value, st.cat);
    $("#drList").innerHTML = list.length ? list.map(function (s) { return '<button type="button" class="dr-sym" data-id="' + s.id + '" aria-pressed="false"><span aria-hidden="true">' + s.ic + "</span>" + esc(s.th) + "</button>"; }).join("") : '<p class="muted">ไม่พบสัญลักษณ์ ลองคำอื่น</p>';
    renderSel();
  }
  var detT;
  $("#drText").addEventListener("input", function () {
    clearTimeout(detT);
    detT = setTimeout(function () { st.detected = DR.detect($("#drText").value); renderSel(); }, 200);
  });
  function toggle(id) {
    var ids = selected(), i = st.manual.indexOf(id);
    if (ids.indexOf(id) >= 0) { if (i >= 0) st.manual.splice(i, 1); st.removed[id] = true; }
    else { delete st.removed[id]; if (i < 0) st.manual.push(id); }
    renderSel();
  }
  document.addEventListener("click", function (e) {
    var b = e.target.closest(".dr-sym,.dr-pop"); if (b) { toggle(b.dataset.id); return; }
    var x = e.target.closest(".dr-x"); if (x) { toggle(x.dataset.id); return; }
    var c = e.target.closest(".dr-cat"); if (c) { st.cat = c.dataset.c; document.querySelectorAll(".dr-cat").forEach(function (y) { y.setAttribute("aria-pressed", String(y === c)); }); renderList(); }
  });
  $("#drSearch").addEventListener("input", renderList);
  renderList();

  var stats = FK.statsPanel({
    box: "drStats", toggle: "drStatsOn", clear: "drStatsClear", key: "dm-stats", prefKey: "dm-prefs",
    render: function (s) { return '<p class="fk-small">ฝันยอดนิยม</p>' + FK.bars(s.sym, s.total, function (k) { return DR.BY[k] ? DR.BY[k].th : k; }, 6) + '<p class="fk-small">ความรู้สึกในฝัน</p>' + FK.bars(s.mood, s.total, function (k) { return KB.MOODS[k] ? KB.MOODS[k].th : k; }, 3); }
  });

  $("#drForm").addEventListener("submit", function (e) {
    e.preventDefault();
    st.detected = DR.detect($("#drText").value);
    var ids = selected(); if (!ids.length) { $("#drMsg").textContent = "เลือกหรือพิมพ์สิ่งที่เห็นในฝันอย่างน้อย 1 อย่าง"; return; }
    $("#drMsg").textContent = "";
    var moodEl = document.querySelector('input[name="drMood"]:checked'), timeEl = document.querySelector('input[name="drTime"]:checked');
    show(ids, moodEl ? moodEl.value : "", timeEl ? timeEl.value : "");
  });
  function show(ids, mood, time) {
    st.res = { ids: ids, mood: mood, time: time };
    var ty = KB.TYPES[DR.dreamType(ids, mood, time)], dom = DR.dominantTheme(ids);
    $("#drResult").hidden = false;
    $("#drCards").innerHTML = ids.map(function (id) { var s = DR.BY[id], T = KB.THEMES[s.theme]; return '<article class="dr-card"><span class="dr-ic" aria-hidden="true">' + s.ic + "</span><div><h3>ฝันเห็น" + esc(s.th) + '</h3><p class="dr-theme">ธีม' + esc(T.th) + " · " + esc(KB.CATS[s.cat]) + "</p><p>" + esc(s.o) + "</p></div></article>"; }).join("");
    $("#drType").innerHTML = "<b>ประเภทฝัน: " + esc(ty.th) + "</b> — " + esc(ty.o) + (dom ? '<br><b>ธีมเด่น:</b> ' + esc(KB.THEMES[dom].th) : "") + (KB.TIMES[time] ? '<br><span class="fk-small">' + esc(DR.timeMeaning(ty, time)) + "</span>" : "");
    $("#drReadWrap").innerHTML = FK.readingBlock("drRd", "คำทำนายฝัน", true);
    FK.bindReading("drRd", "dream", function (topic, r) { return DR.buildFacts(ids, mood, time, topic, { rng: r }); }, { withTopics: true });
    stats.add({ sym: ids, mood: mood, theme: dom || DR.BY[ids[0]].theme });
    $("#drResTitle").focus(); kiosk.touch();
  }
  function reset() {
    st.detected = []; st.manual = []; st.removed = {}; st.res = null;
    $("#drText").value = ""; $("#drForm").reset(); $("#drResult").hidden = true; $("#drCardImg").hidden = true; renderList();
  }
  $("#drAgain").addEventListener("click", function () { reset(); $("#drForm").scrollIntoView({ block: "start" }); });
  $("#drPrint").addEventListener("click", function () { window.print(); });
  $("#drShare").addEventListener("click", function () {
    var R = st.res; if (!R) return;
    var syms = R.ids.map(function (id) { return DR.BY[id]; }), lines = (FK.readings.drRd || {}).lines || [];
    FK.share(this, {
      kind: "ทำนายฝัน", glow: "rgba(139,120,255,.45)", artH: 340,
      title: "ฝันเห็น" + syms.slice(0, 3).map(function (s) { return s.th; }).join(" · "), sub: "ประเภทฝัน: " + KB.TYPES[DR.dreamType(R.ids, R.mood, R.time)].th,
      msgs: (lines.length >= 2 ? lines.slice(0, 2) : [syms[0].o]).concat([KB.THEMES[syms[0].theme].a[0]]).slice(0, 3),
      foot: KB.disclaimerShort + " · ไม่มีเลขนำโชค",
      art: function (c, x, y, w, h) {
        c.textAlign = "center"; c.textBaseline = "middle";
        c.beginPath(); c.arc(x + w / 2, y + h / 2, h / 2 - 6, 0, Math.PI * 2); c.fillStyle = "rgba(255,255,255,.07)"; c.fill();
        // พระจันทร์เสี้ยวและเมฆ วาดเอง
        c.beginPath(); c.arc(x + w / 2 + 150, y + 70, 46, 0, Math.PI * 2); c.fillStyle = "#fde68a"; c.fill();
        c.beginPath(); c.arc(x + w / 2 + 170, y + 58, 42, 0, Math.PI * 2); c.fillStyle = "#1e2a5a"; c.fill();
        var em = syms.slice(0, 3).map(function (s) { return s.ic; }), n = em.length;
        c.font = (n > 1 ? 120 : 190) + "px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif";
        em.forEach(function (e, i) { c.fillText(e, x + w / 2 + (i - (n - 1) / 2) * 170, y + h / 2 + 10); });
      }
    }, "lensiq-dream.jpg", $("#drCardImg"), "ทำนายฝัน — LENSIQ");
  });

  var kiosk = FK.kiosk({ toggle: "drKiosk", exit: "drKioskExit", idle: "drIdle", busy: function () { return !$("#drResult").hidden || !!$("#drText").value || selected().length > 0; }, reset: reset });
  $("#drSources").innerHTML = KB.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + "</a></li>"; }).join("");
  window.__dr = { state: st, show: show, reset: reset };
})();
