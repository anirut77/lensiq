/* fortune-kit.js — ตัวช่วยร่วมของหน้าดูดวงชุดใหม่ (อี้จิง · 12 นักษัตร · ราศีตะวันตก · ทำนายฝัน)
 *
 * ส่วนบน (pure, ทดสอบใน Node ได้): สุ่มด้วย crypto, seed ตามวันที่, สถิติแบบไม่ระบุตัวตน, ชื่อศาสตร์ในคำทำนาย
 * ส่วนล่าง (เบราว์เซอร์): กล่องคำทำนาย (fortune-ai.js + ช่องยินยอม AI), การ์ดแชร์ 1080×1350, โหมดบูธ, แผงสถิติ, toast
 *
 * ชื่อศาสตร์: fortune-ai.js / server.py รับ domain ได้เฉพาะชุดเดิม จึงส่ง domain สำรองที่ใกล้เคียง (FALLBACK)
 * แล้วแทนชื่อศาสตร์ในข้อความที่เรียบเรียงแล้วด้วยชื่อจริง (relabel) — ถ้าภายหลัง fortune-ai.js ส่งออก DOMAIN_NAMES
 * ที่มี domain ใหม่ ระบบจะใช้ domain จริงทันที
 * เพื่อความบันเทิงตามความเชื่อ ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ */
(function (root) {
  "use strict";

  /* ---------- สุ่ม / seed ---------- */
  function cryptoU32() {
    var c = (typeof globalThis !== "undefined" && globalThis.crypto) || root.crypto;
    var a = new Uint32Array(1); c.getRandomValues(a); return a[0];
  }
  /** จำนวนเต็มสุ่ม 0..n-1 แบบไม่เอียง (rejection sampling) */
  function randInt(n, u32) {
    u32 = u32 || cryptoU32;
    var lim = Math.floor(4294967296 / n) * n, x;
    do { x = u32(); } while (x >= lim);
    return x % n;
  }
  function pad2(n) { return String(n).padStart(2, "0"); }
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate()); }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var pickR = function (r, a) { return a[Math.floor(r() * a.length)]; };

  /* ---------- สถิติ (ไม่ระบุตัวตน) ----------
     รูปแบบเดียวกับ tarot-stats / hs-stats: { v:1, total, days:{YYYY-MM-DD:n}, <มิติ>:{ค่า:n} }
     dims = { topics: "love", hex: [1, 2] } → นับทีละค่า (ค่าเป็นสตริง/ตัวเลขสั้น ๆ เท่านั้น) */
  function addStat(st, dims, now) {
    st = st && typeof st === "object" ? st : {};
    var out = { v: 1, total: (st.total || 0) + 1, days: Object.assign({}, st.days || {}) };
    Object.keys(st).forEach(function (k) { if (k !== "v" && k !== "total" && k !== "days" && st[k] && typeof st[k] === "object") out[k] = Object.assign({}, st[k]); });
    var day = dayKey(new Date(now || Date.now()));
    out.days[day] = (out.days[day] || 0) + 1;
    // เก็บเพียง 120 วันล่าสุด กัน localStorage โต
    var ks = Object.keys(out.days).sort(); while (ks.length > 120) delete out.days[ks.shift()];
    Object.keys(dims || {}).forEach(function (k) {
      if (k === "v" || k === "total" || k === "days") return;
      var vals = [].concat(dims[k]).filter(function (x) { return x != null && x !== ""; });
      if (!vals.length) return;
      var o = out[k] = out[k] || {};
      vals.forEach(function (x) { x = String(x).slice(0, 24); o[x] = (o[x] || 0) + 1; });
    });
    return out;
  }
  function topOf(obj, n) { obj = obj || {}; return Object.keys(obj).sort(function (a, b) { return obj[b] - obj[a] || (a < b ? -1 : 1); }).slice(0, n || 5); }

  /* ---------- ชื่อศาสตร์ในคำทำนาย ---------- */
  var BASE_NAMES = { horoscope: "ตำราโหราศาสตร์", siamsee: "คำเซียมซี", tarot: "ไพ่ทาโรต์", numbers: "ศาสตร์แห่งตัวเลข" };
  var DOMAINS = {
    iching: { name: "คัมภีร์อี้จิง", fallback: "siamsee" },
    zodiac: { name: "ตำรา 12 นักษัตร", fallback: "horoscope" },
    astro: { name: "โหราศาสตร์ตะวันตก", fallback: "horoscope" },
    dream: { name: "ตำราทำนายฝัน", fallback: "siamsee" }
  };
  /** domain ที่ fortune-ai.js รองรับ (จริงถ้ามี ไม่งั้นสำรอง) */
  function factsDomain(domain, FA) {
    var d = DOMAINS[domain]; if (!d) return domain;
    var names = FA && FA.DOMAIN_NAMES;
    return names && names[domain] ? domain : d.fallback;
  }
  /** แทนชื่อศาสตร์สำรองในผลลัพธ์ด้วยชื่อจริง (คืนออบเจ็กต์ใหม่) */
  function relabel(result, domain, sentDomain) {
    var d = DOMAINS[domain];
    if (!result || !d || sentDomain === domain) return result;
    var from = BASE_NAMES[sentDomain || d.fallback]; if (!from) return result;
    var rep = function (s) { return String(s).split(from).join(d.name); };
    return Object.assign({}, result, { sections: (result.sections || []).map(function (s) { return Object.assign({}, s, { title: rep(s.title || ""), paragraphs: (s.paragraphs || []).map(rep) }); }) });
  }

  /** ประโยคเด่นสั้น ๆ สำหรับการ์ดแชร์ (เหมือน tarot.js/horoscope.js) */
  function keyLines(res, facts, n) {
    if (res && res.lang === "zh") {
      var zl = [];
      ((res.summary && res.summary.lines) || []).forEach(function (l) { var t = String(l.t).split(/[：:]/).pop(); if (t.length >= 8 && t.length <= 34 && zl.length < n) zl.push(t); });
      (res.sections || []).forEach(function (s) { (s.paragraphs || []).forEach(function (p) { p.split(/(?<=。)/).forEach(function (x) { x = x.replace(/。$/, ""); var t = x.split("，").slice(-1)[0]; if (zl.length < n && t.length >= 8 && t.length <= 30 && zl.indexOf(t) < 0) zl.push(t); }); }); });
      return zl.slice(0, n);
    }
    var secs = (res && res.sections) || [], ov = secs.find(function (s) { return s.id === "overview"; }) || secs[0];
    var text = ov ? ov.paragraphs.join(" ") : "", all = secs.map(function (s) { return s.paragraphs.join(" "); }).join(" ");
    var cand = [];
    var okKey = function (k) { return ["overview", "personality", "advice"].indexOf(k) >= 0 || k === facts.topic || (facts.topic === "overall" && k !== "timing"); };
    (facts.items || []).forEach(function (it) { Object.keys(it.meanings || {}).filter(okKey).forEach(function (k) { (it.meanings[k] || []).forEach(function (m) { cand.push({ m: m, w: (it.strength || 0.5) + (text.indexOf(m) >= 0 ? 1 : all.indexOf(m) >= 0 ? 0.5 : 0) }); }); }); });
    cand.sort(function (a, b) { return b.w - a.w || a.m.length - b.m.length; });
    var out = [];
    [false, true].forEach(function (trunc) {
      cand.forEach(function (c) {
        if (out.length >= n) return;
        var x = String(c.m).trim();
        if (x.length > 62) { if (!trunc) return; var cut = x.lastIndexOf(" ", 60); x = cut > 24 ? x.slice(0, cut) : ""; }
        if (x.length >= 14 && out.every(function (o) { return o.slice(0, 12) !== x.slice(0, 12); })) out.push(x);
      });
    });
    return out;
  }

  var K = {
    cryptoU32: cryptoU32, randInt: randInt, dayKey: dayKey, hashStr: hashStr, mulberry32: mulberry32, pickR: pickR, pad2: pad2,
    addStat: addStat, topOf: topOf, factsDomain: factsDomain, relabel: relabel, keyLines: keyLines, DOMAINS: DOMAINS, BASE_NAMES: BASE_NAMES
  };
  if (typeof module !== "undefined" && module.exports) module.exports = K;
  root.FortuneKit = K;

  /* ================================ เบราว์เซอร์ ================================ */
  if (typeof document === "undefined") return;

  var T = K.T = function (key, thai, vars) {
    if (root.LQI18N && typeof root.LQI18N.tf === "function") return root.LQI18N.tf(key, thai, vars);
    return String(thai).replace(/\{(\w+)\}/g, function (m, k) { return vars && vars[k] != null ? vars[k] : m; });
  };
  K.isZh = function () { return !!(root.LQI18N && root.LQI18N.lang === "zh"); };
  var esc = K.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  K.$ = function (s) { return document.querySelector(s); };
  K.lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  K.lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };
  K.reduced = !!(root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches);
  K.wait = function (ms) { return new Promise(function (r) { setTimeout(r, K.reduced ? Math.min(ms, 60) : ms); }); };
  K.toast = function (msg) {
    var t = document.getElementById("fkToast");
    if (!t) { t = document.createElement("div"); t.id = "fkToast"; t.className = "toast"; t.setAttribute("role", "status"); document.body.appendChild(t); }
    t.textContent = msg; t.classList.add("show"); clearTimeout(K.toast.h); K.toast.h = setTimeout(function () { t.classList.remove("show"); }, 2200);
  };

  /* ---------- กล่องคำทำนาย ---------- */
  var TOPICS = [["overall", "ภาพรวม"], ["love", "ความรัก"], ["work", "การงาน"], ["money", "การเงิน"]];
  K.TOPICS = TOPICS;
  K.readingBlock = function (id, title, withTopics, topic) {
    topic = topic || "overall";
    return '<section class="fk-reading" id="' + id + '" aria-labelledby="' + id + '-h"><div class="rd-head"><h3 id="' + id + '-h">' + esc(title) + '</h3><span class="rd-src" id="' + id + '-src"></span></div>' +
      (withTopics ? '<div class="rd-topics" role="radiogroup" aria-label="' + esc(T("fk.topics", "หัวข้อที่สนใจ")) + '">' + TOPICS.map(function (t) { return '<button type="button" role="radio" data-topic="' + t[0] + '" aria-checked="' + (t[0] === topic) + '">' + esc(T("fk.topic." + t[0], t[1])) + "</button>"; }).join("") + "</div>" : "") +
      '<div class="rd-consent" id="' + id + '-consent"></div><div class="rd-body" id="' + id + '-body" aria-live="polite"><p class="muted">' + esc(T("fk.loading", "กำลังเรียบเรียงคำทำนาย…")) + '</p></div>' +
      '<div class="rd-actions"><button type="button" class="btn ghost" id="' + id + '-again">' + esc(T("fk.again", "อ่านอีกสำนวน")) + '</button></div></section>';
  };
  function plainRender(el, res) {
    el.innerHTML = (res.sections || []).map(function (s) { return '<section class="fa-section"><h3>' + esc(s.title || "") + "</h3>" + (s.paragraphs || []).map(function (p) { return "<p>" + esc(p) + "</p>"; }).join("") + "</section>"; }).join("");
  }
  function localFallback(facts) {
    var sec = { id: "overview", title: T("fa.sec.overview", "ภาพรวม"), paragraphs: [] };
    (facts.items || []).slice(0, 6).forEach(function (it) { var k = Object.keys(it.meanings || {})[0]; if (k) sec.paragraphs.push(it.label + " — " + it.meanings[k][0]); });
    return { source: "local", sections: [sec] };
  }
  K.readings = {};
  /** factsFn(topic, rng) → facts (domain = ชื่อจริง เช่น "iching") ; opts: { withTopics, topic, onTopic(topic), onDone(state) } */
  K.bindReading = function (id, domain, factsFn, opts) {
    opts = opts || {};
    var box = document.getElementById(id); if (!box) return Promise.resolve();
    var FA = root.FortuneAI || null, st = K.readings[id] = { topic: opts.topic || "overall" };
    var body = document.getElementById(id + "-body"), src = document.getElementById(id + "-src");
    function run() {
      var seed = (Math.random() * 4294967296) >>> 0, r = FA && FA.rng ? FA.rng(seed) : Math.random;
      var facts = factsFn(st.topic, r), sent = factsDomain(domain, FA);
      facts = Object.assign({}, facts, { domain: sent, topic: st.topic });
      var useAI = FA && FA.hasConsent ? FA.hasConsent() : false;
      var p = FA && FA.interpret ? FA.interpret(facts, { useAI: useAI, seed: seed }) : Promise.resolve(localFallback(facts));
      box.setAttribute("aria-busy", "true");
      return p.catch(function () { return localFallback(facts); }).then(function (res) {
        res = relabel(res, domain, sent);
        st.result = res; st.facts = facts; st.lines = keyLines(res, facts, 3);
        if (FA && FA.renderSections) FA.renderSections(body, res, { aiBadge: false }); else plainRender(body, res);
        src.textContent = res.source === "ai" ? T("fk.src.ai", "เรียบเรียงโดย AI (Claude)") : T("fk.src.local", "เรียบเรียงในเครื่อง · สำนวนใหม่ทุกครั้ง");
        src.className = "rd-src" + (res.source === "ai" ? " ai" : "");
        box.removeAttribute("aria-busy");
        if (opts.onDone) opts.onDone(st);
      });
    }
    document.getElementById(id + "-again").addEventListener("click", function () { run(); });
    if (opts.withTopics) box.querySelectorAll(".rd-topics button").forEach(function (b) {
      b.addEventListener("click", function () {
        st.topic = b.dataset.topic;
        box.querySelectorAll(".rd-topics button").forEach(function (x) { x.setAttribute("aria-checked", String(x === b)); });
        if (opts.onTopic) opts.onTopic(st.topic);
        run();
      });
    });
    if (FA && FA.consentControl) FA.consentControl(document.getElementById(id + "-consent"), { onChange: function () { run(); } }).catch(function () { /* ไม่มีเซิร์ฟเวอร์ AI */ });
    st.run = run;
    return run();
  };

  /* ---------- การ์ดแชร์ 1080×1350 ---------- */
  K.wrapTh = function (c, text, maxW) {
    var zh = /[\u4e00-\u9fff]/.test(text) && !/[\u0E00-\u0E7F]/.test(text);
    var segs = zh ? String(text).split("") : (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter("th", { granularity: "word" }).segment(text), function (s) { return s.segment; }) : String(text).split("");
    var lines = [], cur = "";
    segs.forEach(function (sg) { if (c.measureText(cur + sg).width > maxW && cur) { lines.push(cur.trim()); cur = sg.trimStart(); } else cur += sg; });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  };
  K.rr = function (c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); };
  /** opt: { kind (ข้อความมุมขวาบน), glow ("rgba(..)"), title, sub, art(c, x, y, w, h), artH, msgs[3], foot } */
  K.makeCard = async function (opt) {
    try { await Promise.all([document.fonts.load("700 60px Prompt"), document.fonts.load("500 30px Prompt"), document.fonts.load("400 30px Prompt")]); } catch (e) { /* ฟอนต์ระบบ */ }
    var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), F = "Prompt, system-ui, sans-serif", rr = K.rr;
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, opt.bg0 || "#0e1430"); g.addColorStop(1, opt.bg1 || "#24195e");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rnd = mulberry32(11); c.fillStyle = "rgba(165,243,252,.5)";
    for (var i = 0; i < 80; i++) { c.beginPath(); c.arc(rnd() * W, rnd() * H, rnd() * 2.2 + .4, 0, Math.PI * 2); c.fill(); }
    var rg = c.createRadialGradient(W / 2, 420, 40, W / 2, 420, 560); rg.addColorStop(0, opt.glow || "rgba(103,79,242,.45)"); rg.addColorStop(1, "rgba(14,20,48,0)");
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // โลโก้ LENSIQ
    c.save(); c.translate(72, 64);
    rr(c, 0, 0, 60, 60, 18); c.fillStyle = "rgba(255,255,255,.08)"; c.fill();
    c.strokeStyle = "#22d3ee"; c.lineWidth = 4; c.lineCap = "round";
    c.beginPath(); [[14, 24, 14, 14, 24, 14], [46, 24, 46, 14, 36, 14], [14, 36, 14, 46, 24, 46], [46, 36, 46, 46, 36, 46]].forEach(function (q) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); }); c.stroke();
    c.beginPath(); c.arc(30, 30, 8, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill();
    c.restore();
    c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "700 40px " + F; c.fillStyle = "#fff"; c.fillText("LENS", 148, 96); var lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 148 + lw, 96);
    c.textAlign = "right"; c.font = "500 34px " + F; c.fillStyle = "#c9d0ea"; c.fillText(opt.kind || "", W - 72, 96);
    c.textAlign = "center";
    var artH = opt.artH || 420, y = 170;
    if (opt.art) { c.save(); opt.art(c, 90, y, W - 180, artH, F); c.restore(); c.textAlign = "center"; c.textBaseline = "middle"; }
    y += artH + 40;
    c.font = "700 54px " + F; c.fillStyle = "#fff";
    K.wrapTh(c, opt.title || "", W - 160).slice(0, 2).forEach(function (l, k) { c.fillText(l, W / 2, y + k * 64); });
    y += (K.wrapTh(c, opt.title || "", W - 160).length > 1 ? 128 : 64);
    if (opt.sub) { c.font = "500 32px " + F; c.fillStyle = "#f3c969"; c.fillText(K.wrapTh(c, opt.sub, W - 160)[0], W / 2, y); y += 56; }
    var msgs = (opt.msgs || []).slice(0, 3), space = 1250 - y, boxH = Math.min(124, (space - 2 * 16) / 3), fs = boxH < 100 ? 28 : 32;
    c.font = "500 " + fs + "px " + F;
    msgs.forEach(function (m, k) {
      var yy = y + k * (boxH + 16);
      rr(c, 90, yy, W - 180, boxH, 22); c.fillStyle = "rgba(255,255,255,.09)"; c.fill();
      c.fillStyle = k === 2 ? "#a5f3fc" : "#fff";
      var all = K.wrapTh(c, m, W - 240), ls = all.slice(0, 2);
      if (all.length > 2) ls[1] = ls[1].replace(/.$/, "") + "…";
      ls.forEach(function (l, j) { c.fillText(l, W / 2, yy + boxH / 2 + (j - (ls.length - 1) / 2) * (fs * 1.35)); });
    });
    c.font = "400 24px " + F; c.fillStyle = "#8f9bc4";
    K.wrapTh(c, opt.foot || T("fk.card.foot", "เพื่อความบันเทิงตามความเชื่อ ไม่ใช่วิทยาศาสตร์"), W - 160).slice(0, 2).forEach(function (l, k) { c.fillText(l, W / 2, 1290 + k * 30); });
    return cv;
  };
  var cardUrls = {};
  /** สร้างการ์ด แสดงตัวอย่างใน imgEl แล้วแชร์ (Web Share) หรือดาวน์โหลด */
  K.share = async function (btn, cardOpt, fileName, imgEl, shareTitle) {
    btn.disabled = true;
    try {
      var cv = await K.makeCard(cardOpt);
      var blob = await new Promise(function (r) { cv.toBlob(r, "image/jpeg", 0.92); });
      if (cardUrls[fileName]) URL.revokeObjectURL(cardUrls[fileName]);
      var url = cardUrls[fileName] = URL.createObjectURL(blob);
      if (imgEl) { imgEl.src = url; imgEl.hidden = false; }
      var file = new File([blob], fileName, { type: "image/jpeg" });
      btn.disabled = false;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: shareTitle || "LENSIQ", text: T("fk.share.text", "เพื่อความบันเทิงตามความเชื่อ") }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = url; a.download = fileName; document.body.append(a); a.click(); a.remove();
      K.toast(T("fk.card.saved", "บันทึกการ์ดแล้ว"));
    } catch (e) { console.warn(e); K.toast(T("fk.card.fail", "สร้างการ์ดไม่สำเร็จ")); }
    finally { btn.disabled = false; }
  };

  /* ---------- โหมดบูธ ---------- */
  /** o: { toggle, exit, idle (element ids), busy(), reset(), idleMs } */
  K.kiosk = function (o) {
    var idleT = null, idleTick = null, wasFs = false, ms = o.idleMs || 60000;
    var tg = document.getElementById(o.toggle), ex = document.getElementById(o.exit), idle = document.getElementById(o.idle);
    var on = function () { return document.body.classList.contains("fk-kiosk"); };
    function touch() {
      clearTimeout(idleT); clearInterval(idleTick); idle.hidden = true;
      if (!on() || !o.busy()) return;
      var until = Date.now() + ms;
      idleTick = setInterval(function () {
        var left = Math.ceil((until - Date.now()) / 1000);
        if (left <= 15) { idle.hidden = false; idle.textContent = T("fk.idle", "กลับหน้าเริ่มต้นใน {n} วินาที — แตะเพื่ออยู่ต่อ", { n: left }); }
      }, 1000);
      idleT = setTimeout(function () { clearInterval(idleTick); idle.hidden = true; o.reset(); window.scrollTo(0, 0); }, ms);
    }
    ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { if (on()) touch(); }, { passive: true }); });
    function set(v) {
      document.body.classList.toggle("fk-kiosk", v);
      tg.setAttribute("aria-pressed", v ? "true" : "false"); ex.hidden = !v;
      if (v) {
        var de = document.documentElement;
        if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(function () { wasFs = true; }).catch(function () { /* iOS */ });
        window.scrollTo(0, 0);
      } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
      touch();
    }
    tg.addEventListener("click", function () { set(!on()); });
    ex.addEventListener("click", function () { set(false); });
    document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && wasFs) { wasFs = false; set(false); } });
    if (/[?&]kiosk\b/.test(location.search)) set(true);
    return { touch: touch, set: set };
  };

  /* ---------- แผงสถิติ ---------- */
  /** o: { box, toggle, clear (ids), key, prefKey, render(stats) → html } ; คืน { add(dims), enabled() } */
  K.statsPanel = function (o) {
    var prefs = Object.assign({ stats: true }, K.lsGet(o.prefKey, {}));
    var box = document.getElementById(o.box), tg = document.getElementById(o.toggle), cl = document.getElementById(o.clear);
    function render() {
      var s = K.lsGet(o.key, null);
      if (!s || !s.total) { box.innerHTML = '<p class="muted">' + esc(T("fk.stats.empty", "ยังไม่มีข้อมูลในเครื่องนี้")) + "</p>"; return; }
      box.innerHTML = '<p class="stat-n"><b>' + s.total + "</b> " + esc(T("fk.stats.times", "ครั้ง")) + " <small>(" + esc(T("fk.stats.today", "วันนี้ {n}", { n: (s.days || {})[dayKey()] || 0 })) + ")</small></p>" + (o.render ? o.render(s) : "");
    }
    tg.checked = !!prefs.stats;
    tg.addEventListener("change", function () { prefs.stats = tg.checked; K.lsSet(o.prefKey, prefs); });
    cl.addEventListener("click", function () { if (confirm(T("fk.stats.clear", "ล้างสถิติในเครื่องนี้?"))) { try { localStorage.removeItem(o.key); } catch (e) { /* ไม่เป็นไร */ } render(); } });
    render();
    if (root.addEventListener) root.addEventListener("lq-lang", render);
    return {
      add: function (dims) { if (!prefs.stats) return; K.lsSet(o.key, addStat(K.lsGet(o.key, null), dims)); render(); },
      enabled: function () { return !!prefs.stats; }, render: render
    };
  };
  /** แท่งสถิติแบบเดียวกับหน้าไพ่ */
  K.bars = function (obj, total, label, n) {
    return topOf(obj, n || 6).map(function (k) {
      var v = obj[k] || 0;
      return '<div class="elbar"><span>' + esc(label ? label(k) : k) + '</span><i style="--w:' + Math.round(v / (total || 1) * 100) + '%;--c:#674ff2"></i><b>' + v + "</b></div>";
    }).join("");
  };
})(typeof window !== "undefined" ? window : globalThis);
