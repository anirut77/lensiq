/* ไพ่ทาโรต์ & เซียมซี — LENSIQ
   ส่วนบน: ฟังก์ชันล้วน (สับไพ่ด้วย crypto, ไพ่ประจำวันแบบ seed ตามวันที่, ตีความ, สรุปภาพรวม, สถิติ) — ทดสอบได้ใน Node
   ส่วนล่าง: UI ในเบราว์เซอร์ (ทำงานเมื่อพบ #trApp)
   เพื่อความบันเทิงตามความเชื่อ ไม่ใช่การพยากรณ์ทางวิทยาศาสตร์ */
(function (root) {
  "use strict";
  var KB = root.TAROT_KB || (typeof require === "function" ? require("./tarot-kb.js") : null);

  /* ---------- สุ่มด้วย crypto.getRandomValues ---------- */
  function cryptoU32() {
    var c = (typeof globalThis !== "undefined" && globalThis.crypto) || root.crypto;
    var a = new Uint32Array(1); c.getRandomValues(a); return a[0];
  }
  /** จำนวนเต็มสุ่มแบบสม่ำเสมอ 0..n-1 (rejection sampling ไม่เอียง) */
  function randInt(n, u32) {
    u32 = u32 || cryptoU32;
    var lim = Math.floor(4294967296 / n) * n, x;
    do { x = u32(); } while (x >= lim);
    return x % n;
  }
  /** Fisher–Yates คืนอาร์เรย์ใหม่ */
  function shuffle(arr, u32) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = randInt(i + 1, u32); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  /** สำรับที่สับแล้ว [{id, rev}] — rev สุ่มเฉพาะเมื่อเปิดใช้ไพ่กลับหัว */
  function makeDeck(withReversed, u32) {
    return shuffle(KB.cards.map(function (c) { return c.id; }), u32).map(function (id) {
      return { id: id, rev: withReversed ? randInt(2, u32) === 1 : false };
    });
  }

  /* ---------- ไพ่ประจำวัน: seed จากวันที่ (เหมือนกันทั้งวัน) ---------- */
  function dayKey(d) { d = d || new Date(); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function hashStr(s) { var h = 2166136261; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
  function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; var t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  function dailyCard(d) {
    var r = mulberry32(hashStr("lensiq-tarot-" + dayKey(d)));
    r(); return KB.cards[Math.floor(r() * KB.cards.length)];
  }

  /* ---------- ตีความ ---------- */
  function meaning(card, rev, topic) { return (rev ? card.reversed : card.upright)[topic || "general"]; }
  function interpret(card, rev, topic, pos) {
    var m = meaning(card, rev, topic);
    var text = m;
    if (pos && pos.advice) text = m + " — " + card.advice;
    return { lead: pos ? pos.lead : "", text: text, orient: rev ? "กลับหัว" : "ตั้งตรง" };
  }

  /** สรุปภาพรวมจากไพ่ที่เปิด: picks = [{id, rev}] ตามลำดับตำแหน่ง */
  function synthesize(picks, topic, spreadKey) {
    var S = KB.spreads[spreadKey], cards = picks.map(function (p) { return KB.byId[p.id]; });
    var n = picks.length, el = { fire: 0, water: 0, air: 0, earth: 0 }, majors = 0, rev = 0, courts = 0, aces = 0;
    cards.forEach(function (c, i) {
      el[c.element]++;
      if (c.arcana === "major") majors++;
      if (picks[i].rev) rev++;
      if (c.court) courts++;
      if (c.arcana === "minor" && c.n === 1) aces++;
    });
    var Y = KB.synth, lines = [];
    var ranked = Object.keys(el).sort(function (a, b) { return el[b] - el[a]; });
    var dom = n >= 3 && el[ranked[0]] > el[ranked[1]] && el[ranked[0]] / n >= 0.4 ? ranked[0] : null;
    if (n >= 3) {
      if (majors / n >= 0.5) lines.push(Y.majorsHigh);
      else if (majors > 0) lines.push(Y.majorsSome);
      else lines.push(Y.majorsNone);
      lines.push(dom ? KB.elements[dom].dom : Y.balanced);
      if (rev / n >= 0.5) lines.push(Y.reversedHigh);
      else if (rev === 0) lines.push(Y.reversedNone);
      if (courts >= 2) lines.push(Y.courts);
      if (aces >= 1) lines.push(Y.aces);
    } else {
      var c0 = cards[0];
      lines.push((c0.arcana === "major" ? "ไพ่ชุดใหญ่ — ข้อความสำคัญสำหรับวันนี้ " : "ไพ่ชุด" + KB.suits[c0.suit].th + " ธาตุ" + KB.elements[c0.element].th + " — ") + "พลังเด่นคือ " + c0.keywords.slice(0, 2).join(" และ "));
    }
    lines.push(Y.topicTip[topic]);
    // คำแนะนำหลัก: ตำแหน่งคำแนะนำ ถ้าไม่มีใช้ไพ่ใบสุดท้าย
    var advIdx = S.positions.findIndex(function (p) { return p.advice; });
    if (advIdx < 0) advIdx = n - 1;
    var advCard = cards[advIdx];
    var headline = n >= 3 && majors / n >= 0.5 ? "ช่วงเปลี่ยนแปลงสำคัญ" : dom ? "พลังธาตุ" + KB.elements[dom].th + " · " + KB.elements[dom].theme.split(" ")[0] : n >= 3 ? "สมดุลทุกด้าน" : cards[0].keywords[0];
    var keyIdx = n >= 3 ? (spreadKey === "celtic" ? 0 : 1) : 0;
    var keyCard = cards[keyIdx], keyPos = S.positions[keyIdx];
    var keyMessages = [
      headline + (n >= 3 ? " — " + (majors ? "ไพ่ชุดใหญ่ " + majors + " ใบ" : "ไพ่ชุดเล็กทั้งหมด") : ""),
      keyPos.th.replace(/^\d+ · /, "") + ": " + keyCard.th + " — " + keyCard.keywords.slice(0, 2).join(" · "),
      "คำแนะนำ: " + advCard.advice
    ];
    return { n: n, elements: el, dominant: dom, majors: majors, reversed: rev, courts: courts, aces: aces, lines: lines, headline: headline, advice: advCard.advice, adviceCard: advCard.id, keyMessages: keyMessages };
  }

  /** สถิติแบบไม่ระบุตัวตน (localStorage "tarot-stats") — รับ/คืนออบเจ็กต์ */
  function addStat(st, ids, topic, now) {
    st = st && typeof st === "object" ? st : {};
    var day = dayKey(new Date(now || Date.now()));
    var out = { v: 1, total: (st.total || 0) + 1, days: Object.assign({}, st.days || {}), cards: Object.assign({}, st.cards || {}), topics: Object.assign({}, st.topics || {}) };
    out.days[day] = (out.days[day] || 0) + 1;
    (ids || []).forEach(function (id) { out.cards[id] = (out.cards[id] || 0) + 1; });
    if (topic) out.topics[topic] = (out.topics[topic] || 0) + 1;
    return out;
  }

  var TR = { randInt: randInt, shuffle: shuffle, makeDeck: makeDeck, dayKey: dayKey, hashStr: hashStr, mulberry32: mulberry32, dailyCard: dailyCard,
    meaning: meaning, interpret: interpret, synthesize: synthesize, addStat: addStat };
  if (typeof module !== "undefined" && module.exports) module.exports = TR;
  else root.TR = TR;
})(typeof window !== "undefined" ? window : this);

if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("trApp")) (function () {
  "use strict";
  var KB = window.TAROT_KB, TR = window.TR;
  var $ = function (s) { return document.querySelector(s); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var STATS_KEY = "tarot-stats", PREF_KEY = "tarot-prefs", IDLE_MS = 60000;
  var lsGet = function (k, d) { try { var v = JSON.parse(localStorage.getItem(k)); return v == null ? d : v; } catch (e) { return d; } };
  var lsSet = function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } };
  var prefs = Object.assign({ stats: true, reversed: true }, lsGet(PREF_KEY, {}));
  var reduced = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia && matchMedia("(pointer: coarse)").matches;
  var wait = function (ms) { return new Promise(function (r) { setTimeout(r, reduced ? Math.min(ms, 60) : ms); }); };

  var st = { topic: "general", spread: "three", reversed: !!prefs.reversed, deck: null, picks: [], phase: "setup" };

  function cardHTML(c, rev, flipped, extra) {
    return '<span class="tc-in"><span class="tc-back"></span><span class="tc-face"><img src="' + c.img + '" alt="' + esc(c.th + " (" + c.en + ")" + (rev ? " กลับหัว" : "")) + '" loading="lazy" decoding="async"></span></span>';
  }

  /* ---------- แท็บ ---------- */
  var tabs = [["tabTarot", "panelTarot", ""], ["tabDaily", "panelDaily", "daily"], ["tabSiamsee", "panelSiamsee", "siamsee"]];
  function selectTab(id, focus) {
    tabs.forEach(function (t) {
      var on = t[0] === id, b = document.getElementById(t[0]);
      b.setAttribute("aria-selected", on ? "true" : "false"); b.tabIndex = on ? 0 : -1;
      document.getElementById(t[1]).hidden = !on;
      if (on && focus) b.focus();
      if (on) { try { history.replaceState(null, "", t[2] ? "#" + t[2] : location.pathname + location.search); } catch (e) { /* file:// */ } }
    });
    touch();
  }
  tabs.forEach(function (t, i) {
    var b = document.getElementById(t[0]);
    b.addEventListener("click", function () { selectTab(t[0]); });
    b.addEventListener("keydown", function (e) {
      var k = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
      if (k) { e.preventDefault(); selectTab(tabs[(i + k + tabs.length) % tabs.length][0], true); }
    });
  });

  /* ---------- ขั้น 1 ---------- */
  $("#trTopics").innerHTML = Object.keys(KB.topics).map(function (k) {
    var t = KB.topics[k];
    return '<label class="tr-opt"><input type="radio" name="topic" value="' + k + '"' + (k === st.topic ? " checked" : "") + '><b><span class="ic" aria-hidden="true">' + t.icon + "</span>" + esc(t.th) + "</b></label>";
  }).join("");
  $("#trSpreads").innerHTML = KB.spreadOrder.map(function (k) {
    var s = KB.spreads[k];
    return '<label class="tr-opt"><input type="radio" name="spread" value="' + k + '"' + (k === st.spread ? " checked" : "") + "><b>" + esc(s.th) + "</b><small>" + esc(s.sub) + "</small></label>";
  }).join("");
  $("#trReversed").checked = st.reversed;
  $("#trReversed").addEventListener("change", function () { st.reversed = this.checked; prefs.reversed = this.checked; lsSet(PREF_KEY, prefs); });
  $("#trTopics").addEventListener("change", function (e) {
    st.topic = e.target.value;
    // หัวข้อความรัก → แนะนำรูปแบบความรัก 5 ใบ (ถ้ายังเป็นค่าเริ่มต้น)
  });
  $("#trSpreads").addEventListener("change", function (e) { st.spread = e.target.value; });
  $("#trSetup").addEventListener("submit", function (e) { e.preventDefault(); startShuffle(); });

  function setStep(n) { document.querySelectorAll(".tr-steps span").forEach(function (s) { s.classList.toggle("on", +s.dataset.s === n); }); }

  /* ---------- ขั้น 2: สับ & เลือก ---------- */
  var fan = $("#trFan"), board = $("#trBoard"), pickSec = $("#trPick");
  var fanLayout = null;
  async function startShuffle() {
    touch();
    st.deck = TR.makeDeck(st.reversed); st.picks = []; st.phase = "pick";
    $("#trSetup").hidden = true; $("#trResult").hidden = true; pickSec.hidden = false;
    $(".tr-fan-wrap").hidden = false; $(".tr-pick-actions").hidden = false; $("#trFanHint").hidden = false;
    $("#trReveal").hidden = true; $("#trCardImg").hidden = true;
    setStep(2);
    var S = KB.spreads[st.spread];
    $("#trPickTitle").textContent = "ตั้งจิตถึงคำถาม แล้วเลือกไพ่ " + S.positions.length + " ใบ";
    renderBoard(); updateCount();
    pickSec.scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    $("#trPickTitle").focus({ preventScroll: true });
    // แอนิเมชันสับ
    var deck = $("#trDeck"); fan.innerHTML = ""; fan.setAttribute("aria-busy", "true");
    deck.hidden = false; deck.classList.remove("go"); void deck.offsetWidth;
    if (!reduced) { deck.classList.add("go"); await wait(1350); }
    deck.classList.remove("go"); deck.hidden = true;
    renderFan(true);
    fan.removeAttribute("aria-busy");
  }
  function computeFan() {
    var W = fan.clientWidth || 320, n = st.deck.length;
    var fw = W < 500 ? 62 : W < 900 ? 74 : 86;
    var minStep = coarse ? 30 : 11;
    var fit = (W - fw - 64) / (n - 1);
    var step = Math.max(minStep, fit), fits = fit >= minStep;
    return { W: W, fw: fw, step: step, fits: fits, inner: Math.max(W, (n - 1) * step + fw + 24), n: n };
  }
  function renderFan(deal) {
    var L = fanLayout = computeFan();
    fan.style.setProperty("--fw", L.fw + "px");
    var inner = document.createElement("div"); inner.className = "tr-fan-inner"; inner.style.width = L.inner + "px";
    var html = "";
    st.deck.forEach(function (d, i) {
      var t = i / (L.n - 1);
      var rot = L.fits ? (t - 0.5) * 24 : (t - 0.5) * 6;
      var top = 24 + (L.fits ? Math.pow(Math.abs(t - 0.5) * 2, 2) * 16 : 0);
      var left = (L.fits ? 32 : 12) + i * L.step;
      html += '<button type="button" class="fcard' + (d.picked ? " gone" : "") + '" data-i="' + i + '" aria-label="ไพ่ใบที่ ' + (i + 1) + '" style="left:' + (deal && !reduced ? (L.inner - L.fw) / 2 : left) + "px;top:" + top + "px;transform:rotate(" + rot.toFixed(2) + 'deg)" data-left="' + left + '"></button>';
    });
    inner.innerHTML = html; fan.innerHTML = ""; fan.append(inner);
    fan.scrollLeft = (L.inner - L.W) / 2;
    if (deal && !reduced) {
      fan.classList.add("dealing");
      requestAnimationFrame(function () { requestAnimationFrame(function () {
        inner.querySelectorAll(".fcard").forEach(function (b) { b.style.left = b.dataset.left + "px"; });
        setTimeout(function () { fan.classList.remove("dealing"); }, 600);
      }); });
    }
    $("#trFanHint").textContent = L.fits ? "แตะหรือคลิกไพ่ใบที่ใจเลือก" : "ปัดหรือลากซ้าย–ขวาเพื่อดูไพ่ทั้ง 78 ใบ แล้วแตะใบที่ใจเลือก";
  }
  // ลากเพื่อเลื่อน (เมาส์) — ทัชใช้การเลื่อนปกติ
  var drag = null, dragMoved = false;
  fan.addEventListener("pointerdown", function (e) { if (e.pointerType !== "mouse") return; drag = { x: e.clientX, s: fan.scrollLeft }; dragMoved = false; });
  window.addEventListener("pointermove", function (e) {
    if (!drag) return;
    var dx = e.clientX - drag.x;
    if (Math.abs(dx) > 6) { dragMoved = true; fan.classList.add("dragging"); }
    if (dragMoved) fan.scrollLeft = drag.s - dx;
  });
  window.addEventListener("pointerup", function () { drag = null; fan.classList.remove("dragging"); setTimeout(function () { dragMoved = false; }, 0); });
  fan.addEventListener("click", function (e) {
    var b = e.target.closest(".fcard"); if (!b || dragMoved) return;
    pick(+b.dataset.i, b);
  });

  function boardMetrics() {
    var S = KB.spreads[st.spread], g = S.gap || 0.16, W = pickSec.clientWidth || 340;
    var maxCw = W < 600 ? 120 : st.spread === "celtic" ? 104 : 140;
    var cw = Math.floor(Math.min(maxCw, W / ((S.cols / 2) * (1 + g)) - 1));
    var lab = st.spread === "celtic" ? 22 : 40;
    return { S: S, cw: cw, g: g, u: cw * (1 + g) / 2, v: (cw * 12 / 7 + lab + cw * g * 0.5) / 2 };
  }
  function renderBoard() {
    var M = boardMetrics(), S = M.S;
    board.style.gridTemplateColumns = "repeat(" + S.cols + "," + M.u.toFixed(1) + "px)";
    board.style.gridTemplateRows = "repeat(" + S.rows + "," + M.v.toFixed(1) + "px)";
    board.innerHTML = S.positions.map(function (p, i) {
      var p2 = st.picks[i], short = st.spread === "celtic" ? String(i + 1) : p.th;
      var inner = p2 ? '<button type="button" class="tcard' + (p2.rev ? " rev" : "") + (p2.open ? " flip" : "") + '" data-i="' + i + '" aria-label="' + esc(p.th) + (p2.open ? " — " + esc(KB.byId[p2.id].th) : " — ไพ่คว่ำ") + '" style="width:' + M.cw + 'px">' + cardHTML(KB.byId[p2.id], p2.rev) + "</button>"
        : '<span class="ph" style="width:' + M.cw + 'px" aria-hidden="true">' + (i + 1) + "</span>";
      return '<div class="slot' + (p.x ? " x" : "") + (!p2 && i === st.picks.length ? " next" : "") + '" style="grid-column:' + p.c + " / span 2;grid-row:" + p.r + ' / span 2">' + inner +
        '<span class="lbl" style="max-width:' + (M.cw + 8) + 'px">' + esc(short) + "</span></div>";
    }).join("");
  }
  board.addEventListener("click", function (e) {
    var b = e.target.closest(".tcard"); if (!b) return;
    var p = st.picks[+b.dataset.i]; if (p && p.open) openModal(p.id, p.rev, KB.spreads[st.spread].positions[+b.dataset.i]);
  });
  function updateCount() {
    var need = KB.spreads[st.spread].positions.length;
    $("#trPickCount").textContent = "เลือกแล้ว " + st.picks.length + " / " + need;
  }
  function pick(i, btn) {
    var need = KB.spreads[st.spread].positions.length;
    if (st.phase !== "pick" || st.picks.length >= need || st.deck[i].picked) return;
    touch();
    st.deck[i].picked = true; btn.classList.add("gone"); btn.disabled = true;
    st.picks.push({ id: st.deck[i].id, rev: st.deck[i].rev, open: false });
    renderBoard();
    var landed = board.querySelector('.tcard[data-i="' + (st.picks.length - 1) + '"]');
    if (landed && !reduced) landed.classList.add("land");
    updateCount();
    if (st.picks.length === need) {
      st.phase = "ready";
      $("#trReveal").hidden = false; $("#trFanHint").hidden = true; $(".tr-fan-wrap").hidden = true; $(".tr-pick-actions").hidden = true;
      board.scrollIntoView({ block: "center", behavior: reduced ? "auto" : "smooth" });
      $("#trReveal").focus({ preventScroll: true });
    }
  }
  $("#trReshuffle").addEventListener("click", startShuffle);
  $("#trBack").addEventListener("click", function () { resetTarot(); });
  $("#trAuto").addEventListener("click", function () {
    var need = KB.spreads[st.spread].positions.length;
    while (st.picks.length < need) {
      var free = st.deck.map(function (d, i) { return d.picked ? -1 : i; }).filter(function (i) { return i >= 0; });
      var i = free[TR.randInt(free.length)];
      var b = fan.querySelector('.fcard[data-i="' + i + '"]');
      pick(i, b || document.createElement("button"));
    }
  });
  var resizeT = null;
  window.addEventListener("resize", function () {
    clearTimeout(resizeT);
    resizeT = setTimeout(function () { if (!pickSec.hidden) { renderBoard(); if (st.phase === "pick") renderFan(false); } }, 150);
  });

  /* ---------- เปิดไพ่ & ผลลัพธ์ ---------- */
  var current = null;
  $("#trReveal").addEventListener("click", async function () {
    touch();
    this.hidden = true; st.phase = "reveal";
    $("#trPickTitle").textContent = "ไพ่ของคุณ · " + KB.spreads[st.spread].th + " (" + KB.spreads[st.spread].sub + ")"; $("#trPickCount").textContent = "แตะไพ่เพื่อดูความหมายเต็ม";
    for (var i = 0; i < st.picks.length; i++) {
      st.picks[i].open = true;
      var b = board.querySelector('.tcard[data-i="' + i + '"]');
      if (b) { b.classList.add("flip"); b.setAttribute("aria-label", KB.spreads[st.spread].positions[i].th + " — " + KB.byId[st.picks[i].id].th); }
      await wait(st.picks.length > 5 ? 180 : 320);
    }
    await wait(400);
    showResult();
  });

  function showResult() {
    st.phase = "result"; setStep(3);
    var S = KB.spreads[st.spread], T = KB.topics[st.topic];
    var Y = TR.synthesize(st.picks, st.topic, st.spread);
    current = { kind: "tarot", picks: st.picks.slice(), spread: st.spread, topic: st.topic, synth: Y };
    var q = $("#trQuestion").value.trim();
    $("#trResMeta").innerHTML = "หัวข้อ <b>" + esc(T.th) + "</b> · " + esc(S.th) + " (" + esc(S.sub) + ")" + (q ? '<br>คำถาม: <q>' + esc(q) + "</q>" : "");
    var bars = Object.keys(KB.elements).map(function (k) {
      var e = KB.elements[k], v = Y.elements[k];
      return '<div class="elbar"><span>' + e.icon + " " + esc(e.th) + '</span><i style="--w:' + Math.round(v / Y.n * 100) + "%;--c:" + e.color + '"></i><b>' + v + "</b></div>";
    }).join("");
    $("#trSynth").innerHTML = "<h3>" + esc(Y.headline) + '</h3><div class="syn-grid"><div><div class="syn-bars" aria-label="จำนวนไพ่ตามธาตุ">' + bars + '</div><div class="syn-chips"><span>ชุดใหญ่ ' + Y.majors + "/" + Y.n + "</span><span>กลับหัว " + Y.reversed + "/" + Y.n + "</span>" +
      (Y.courts ? "<span>ราชสำนัก " + Y.courts + "</span>" : "") + (Y.aces ? "<span>เอซ " + Y.aces + "</span>" : "") + '</div></div><div><ul class="syn-list">' +
      Y.lines.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + '</ul><p class="syn-advice"><b>คำแนะนำโดยรวม</b><br>' + esc(Y.advice) + "</p></div></div>";
    $("#trReadings").innerHTML = st.picks.map(function (p, i) {
      var c = KB.byId[p.id], pos = S.positions[i], I = TR.interpret(c, p.rev, st.topic, pos);
      return '<article class="tr-read"><button type="button" class="tcard flip' + (p.rev ? " rev" : "") + '" data-i="' + i + '" aria-label="ดูความหมายเต็มของ ' + esc(c.th) + '">' + cardHTML(c, p.rev) + "</button><div>" +
        '<span class="pos">' + esc(pos.th) + "</span><h3>" + esc(c.th) + " <small>" + esc(c.en) + '</small><span class="orient' + (p.rev ? " r" : "") + '">' + I.orient + "</span></h3>" +
        '<div class="kws">' + c.keywords.map(function (k) { return "<span>" + esc(k) + "</span>"; }).join("") + "</div>" +
        '<p class="lead-pos">' + esc(I.lead) + "</p><p>" + esc(I.text) + '</p><button type="button" class="btn ghost more" data-i="' + i + '">ดูความหมายเต็ม</button></div></article>';
    }).join("");
    $("#trResult").hidden = false;
    $("#trCardImg").hidden = true;
    if (prefs.stats) { lsSet(STATS_KEY, TR.addStat(lsGet(STATS_KEY, null), st.picks.map(function (p) { return p.id; }), st.topic)); renderStats(); }
    $("#trResult").scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    $("#trResTitle").focus({ preventScroll: true });
    touch();
  }
  $("#trReadings").addEventListener("click", function (e) {
    var b = e.target.closest("[data-i]"); if (!b) return;
    var i = +b.dataset.i, p = st.picks[i]; openModal(p.id, p.rev, KB.spreads[st.spread].positions[i]);
  });
  $("#trAgain").addEventListener("click", function () { resetTarot(); });

  function resetTarot() {
    st.phase = "setup"; st.picks = []; st.deck = null; current = current && current.kind === "tarot" ? null : current;
    pickSec.hidden = true; $("#trResult").hidden = true; $("#trSetup").hidden = false; setStep(1);
    if (document.body.classList.contains("tr-kiosk")) $("#trQuestion").value = "";
    if (!$("#panelTarot").hidden) $("#trSetup").scrollIntoView({ block: "start" });
    touch();
  }

  /* ---------- โมดัลรายละเอียดไพ่ ---------- */
  var modal = $("#trModal");
  function openModal(id, rev, pos) {
    var c = KB.byId[id], E = KB.elements[c.element];
    var dl = function (m) { return "<dl><dt>ภาพรวม</dt><dd>" + esc(m.general) + "</dd><dt>ความรัก</dt><dd>" + esc(m.love) + "</dd><dt>การงาน</dt><dd>" + esc(m.work) + "</dd><dt>การเงิน</dt><dd>" + esc(m.money) + "</dd></dl>"; };
    $("#trModalBody").innerHTML = '<div class="md"><img src="' + c.img + '" alt="' + esc(c.th) + '"' + (rev ? ' class="rev"' : "") + "><div>" +
      '<h2 id="trModalTitle">' + esc(c.th) + (c.aka ? ' <small class="muted">(' + esc(c.aka) + ")</small>" : "") + "</h2>" +
      '<p class="sub">' + esc(c.en) + " · " + (c.arcana === "major" ? "ไพ่ชุดใหญ่ " + c.numeral : "ไพ่ชุดเล็ก ชุด" + esc(KB.suits[c.suit].th)) + " · ธาตุ" + esc(E.th) +
      (pos ? " · ตำแหน่ง: " + esc(pos.th) : "") + (rev != null ? ' <span class="orient' + (rev ? " r" : "") + '">' + (rev ? "กลับหัว" : "ตั้งตรง") + "</span>" : "") + "</p>" +
      '<div class="kws">' + c.keywords.map(function (k) { return "<span>" + esc(k) + "</span>"; }).join("") + "</div>" +
      "<h3>ความหมายไพ่ตั้งตรง</h3>" + dl(c.upright) + "<h3>ความหมายไพ่กลับหัว</h3>" + dl(c.reversed) +
      '<p class="adv"><b>คำแนะนำ:</b> ' + esc(c.advice) + "</p></div></div>";
    if (modal.showModal) modal.showModal(); else modal.setAttribute("open", "");
    touch();
  }
  $("#trModalClose").addEventListener("click", function () { modal.close ? modal.close() : modal.removeAttribute("open"); });
  modal.addEventListener("click", function (e) { if (e.target === modal) modal.close(); });

  /* ---------- ไพ่ประจำวัน ---------- */
  var daily = TR.dailyCard(new Date());
  var thDate = (function () { try { return new Date().toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" }); } catch (e) { return TR.dayKey(); } })();
  $("#trDailyDate").textContent = thDate;
  $("#trDailyImg").src = daily.img; $("#trDailyImg").alt = daily.th + " (" + daily.en + ")";
  $("#trDailyCard").addEventListener("click", function () {
    var b = this; if (b.classList.contains("flip")) { openModal(daily.id, false, null); return; }
    b.classList.add("flip"); b.setAttribute("aria-label", "ไพ่ประจำวัน: " + daily.th + " — แตะเพื่อดูความหมายเต็ม");
    var u = daily.upright;
    $("#trDailyText").innerHTML = "<h2>" + esc(daily.th) + ' <small class="muted">' + esc(daily.en) + "</small></h2>" +
      '<div class="kws">' + daily.keywords.map(function (k) { return "<span>" + esc(k) + "</span>"; }).join("") + "</div>" +
      "<p>" + esc(u.general) + "</p><dl><dt>♥ ความรัก</dt><dd>" + esc(u.love) + "</dd><dt>◆ การงาน</dt><dd>" + esc(u.work) + "</dd><dt>● การเงิน</dt><dd>" + esc(u.money) + "</dd></dl>" +
      '<p class="syn-advice"><b>คำแนะนำวันนี้</b><br>' + esc(daily.advice) + '</p><div class="tr-res-actions" style="margin-top:12px"><button class="btn primary big" id="trDailyShare" type="button">แชร์ไพ่ประจำวัน</button></div><img class="tr-cardimg" id="trDailyCardImg" alt="การ์ดไพ่ประจำวันสำหรับแชร์" hidden>';
    $("#trDailyShare").addEventListener("click", function () { share(this, { kind: "daily" }, $("#trDailyCardImg")); });
    touch();
  });

  /* ---------- เซียมซี ---------- */
  var ssBusy = false, ssCurrent = null;
  async function drawSiamsee() {
    if (ssBusy) return; ssBusy = true; touch();
    $("#ssDraw").disabled = true; $("#ssResult").hidden = true; $("#ssFall").hidden = true; $("#ssCardImg").hidden = true;
    var cup = $("#ssCup");
    cup.classList.add("shaking");
    if (navigator.vibrate && !reduced) { try { navigator.vibrate([60, 60, 60, 60, 60]); } catch (e) { /* ไม่รองรับ */ } }
    await wait(1600);
    cup.classList.remove("shaking");
    var s = KB.siamsee[TR.randInt(KB.siamsee.length)];
    $("#ssFallNo").textContent = "ใบที่ " + s.n;
    $("#ssFall").hidden = false;
    await wait(950);
    ssCurrent = s;
    $("#ssNo").textContent = s.n;
    $("#ssTitle").textContent = "เซียมซีใบที่ " + s.n;
    $("#ssLevel").textContent = s.level;
    $("#ssVerse").textContent = s.verse.join("\n");
    $("#ssMeaning").textContent = s.meaning;
    $("#ssCats").innerHTML = KB.siamseeCats.map(function (c) { return '<li><b><span class="ic" aria-hidden="true">' + c.icon + "</span>" + esc(c.th) + "</b><span>" + esc(s[c.key]) + "</span></li>"; }).join("");
    $("#ssResult").hidden = false;
    $("#ssDraw").disabled = false; ssBusy = false;
    if (prefs.stats) { lsSet(STATS_KEY, TR.addStat(lsGet(STATS_KEY, null), [], "siamsee")); renderStats(); }
    if (window.innerWidth < 900) $("#ssResult").scrollIntoView({ block: "start", behavior: reduced ? "auto" : "smooth" });
    $("#ssTitle").focus({ preventScroll: true });
    touch();
  }
  $("#ssDraw").addEventListener("click", drawSiamsee);
  $("#ssAgain").addEventListener("click", function () { $("#ssResult").hidden = true; $("#ssFall").hidden = true; $("#ssCup").scrollIntoView({ block: "center" }); drawSiamsee(); });
  $("#ssShare").addEventListener("click", function () { share(this, { kind: "siamsee" }, $("#ssCardImg")); });

  /* ---------- เขย่ามือถือ (DeviceMotion) ---------- */
  var motionOn = false, lastShake = 0, prevA = null;
  var canMotion = typeof window.DeviceMotionEvent !== "undefined" && coarse;
  function onMotion(e) {
    var a = e.accelerationIncludingGravity || e.acceleration; if (!a || a.x == null) return;
    if (prevA) {
      var d = Math.abs(a.x - prevA.x) + Math.abs(a.y - prevA.y) + Math.abs(a.z - prevA.z);
      var now = Date.now();
      if (d > 24 && now - lastShake > 2200) { lastShake = now; handleShake(); }
    }
    prevA = { x: a.x, y: a.y, z: a.z };
  }
  function handleShake() {
    if (!$("#panelSiamsee").hidden) { if (!ssBusy) drawSiamsee(); }
    else if (!$("#panelTarot").hidden && st.phase === "pick" && st.picks.length === 0) { startShuffle(); toast("สับไพ่ใหม่แล้ว"); }
  }
  async function enableMotion() {
    if (motionOn) return true;
    try {
      if (typeof DeviceMotionEvent.requestPermission === "function") {
        var r = await DeviceMotionEvent.requestPermission(); // iOS ต้องเรียกจากการแตะ
        if (r !== "granted") { toast("ไม่ได้รับสิทธิ์ตรวจจับการเขย่า ใช้ปุ่มแทนได้"); return false; }
      }
      window.addEventListener("devicemotion", onMotion);
      motionOn = true;
      ["#trShake", "#ssShake"].forEach(function (s) { $(s).textContent = "พร้อมแล้ว — เขย่ามือถือได้เลย"; $(s).setAttribute("aria-pressed", "true"); });
      return true;
    } catch (e) { toast("อุปกรณ์นี้ไม่รองรับการเขย่า ใช้ปุ่มแทนได้"); return false; }
  }
  if (canMotion) {
    $("#trShake").hidden = false; $("#ssShake").hidden = false;
    $("#trShake").addEventListener("click", function () { enableMotion().then(function (ok) { if (ok) toast("เขย่ามือถือเพื่อสับไพ่ใหม่"); }); });
    $("#ssShake").addEventListener("click", function () { enableMotion().then(function (ok) { if (ok) toast("เขย่ามือถือเพื่อเสี่ยงเซียมซี"); }); });
  }

  /* ---------- การ์ดแชร์ 1080×1350 ---------- */
  function wrapTh(c, text, maxW) {
    var segs = (typeof Intl !== "undefined" && Intl.Segmenter) ? Array.from(new Intl.Segmenter("th", { granularity: "word" }).segment(text), function (s) { return s.segment; }) : text.split("");
    var lines = [], cur = "";
    segs.forEach(function (sg) { if (c.measureText(cur + sg).width > maxW && cur) { lines.push(cur.trim()); cur = sg.trimStart(); } else cur += sg; });
    if (cur.trim()) lines.push(cur.trim());
    return lines;
  }
  function loadImg(src) { return new Promise(function (res) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = function () { res(null); }; im.src = src; }); }
  function rr(c, x, y, w, h, r) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); }
  function drawBack(c, x, y, w, h) {
    var g = c.createLinearGradient(x, y, x + w, y + h); g.addColorStop(0, "#1e2a5a"); g.addColorStop(1, "#0e1430");
    rr(c, x, y, w, h, 10); c.fillStyle = g; c.fill(); c.strokeStyle = "#22d3ee"; c.lineWidth = 2; c.stroke();
  }
  async function makeCard(opt) {
    try { await Promise.all([document.fonts.load("700 60px Prompt"), document.fonts.load("500 30px Prompt"), document.fonts.load("400 30px Prompt")]); } catch (e) { /* ฟอนต์ระบบ */ }
    var W = 1080, H = 1350, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
    var c = cv.getContext("2d"), F = "Prompt, system-ui, sans-serif";
    var g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, "#0e1430"); g.addColorStop(1, "#24195e");
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    var rnd = TR.mulberry32(7); c.fillStyle = "rgba(165,243,252,.55)";
    for (var i = 0; i < 90; i++) { c.beginPath(); c.arc(rnd() * W, rnd() * H, rnd() * 2.2 + .4, 0, Math.PI * 2); c.fill(); }
    var rg = c.createRadialGradient(W / 2, 480, 40, W / 2, 480, 560); rg.addColorStop(0, opt.kind === "siamsee" ? "rgba(192,57,43,.45)" : "rgba(103,79,242,.45)"); rg.addColorStop(1, "rgba(14,20,48,0)");
    c.fillStyle = rg; c.fillRect(0, 0, W, H);
    // โลโก้
    c.save(); c.translate(72, 64);
    rr(c, 0, 0, 60, 60, 18); c.fillStyle = "rgba(255,255,255,.08)"; c.fill();
    c.strokeStyle = "#22d3ee"; c.lineWidth = 4; c.lineCap = "round";
    c.beginPath(); [[14, 24, 14, 14, 24, 14], [46, 24, 46, 14, 36, 14], [14, 36, 14, 46, 24, 46], [46, 36, 46, 46, 36, 46]].forEach(function (q) { c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[4], q[5]); }); c.stroke();
    c.beginPath(); c.arc(30, 30, 8, 0, Math.PI * 2); c.fillStyle = "#8b78ff"; c.fill();
    c.restore();
    c.textBaseline = "middle"; c.textAlign = "left";
    c.font = "700 40px " + F; c.fillStyle = "#fff"; c.fillText("LENS", 148, 96); var lw = c.measureText("LENS").width; c.fillStyle = "#a99bff"; c.fillText("IQ", 148 + lw, 96);
    c.textAlign = "right"; c.font = "500 34px " + F; c.fillStyle = "#c9d0ea";
    c.fillText(opt.kind === "siamsee" ? "เซียมซี" : opt.kind === "daily" ? "ไพ่ประจำวัน" : "ไพ่ทาโรต์", W - 72, 96);
    c.textAlign = "center";
    var msgs, msgTop;
    if (opt.kind === "siamsee") {
      var s = ssCurrent;
      c.beginPath(); c.arc(W / 2, 330, 120, 0, Math.PI * 2); c.fillStyle = "#c0392b"; c.fill();
      c.lineWidth = 6; c.strokeStyle = "#f3c969"; c.stroke();
      c.fillStyle = "#fff"; c.font = "700 120px " + F; c.fillText(String(s.n), W / 2, 338);
      c.font = "600 54px " + F; c.fillText("เซียมซีใบที่ " + s.n, W / 2, 520);
      c.font = "500 32px " + F; c.fillStyle = "#f3c969"; c.fillText("ระดับ: " + s.level, W / 2, 580);
      c.font = "500 42px " + F; c.fillStyle = "#fdf6ea";
      s.verse.forEach(function (l, k) { c.fillText(l, W / 2, 668 + k * 62); });
      msgs = [s.meaning, "การงาน: " + s.work, "ความรัก: " + s.love];
      msgTop = 830;
    } else {
      var picks, labels, sub;
      if (opt.kind === "daily") { picks = [{ id: daily.id, rev: false }]; labels = [""]; sub = thDate; }
      else {
        var S = KB.spreads[current.spread];
        picks = current.picks; labels = S.positions.map(function (p, k) { return current.spread === "celtic" ? String(k + 1) : p.th; });
        sub = KB.topics[current.topic].th + " · " + S.th + " (" + S.sub + ")";
      }
      c.font = "400 32px " + F; c.fillStyle = "#c9d0ea"; c.fillText(sub, W / 2, 190);
      var n = picks.length, rows = n > 5 ? 2 : 1, per = Math.ceil(n / rows), gap = 22;
      var cw = n === 1 ? 300 : Math.min(rows === 2 ? 148 : 220, (W - 160 - (per - 1) * gap) / per), chh = cw * 12 / 7;
      var imgs = await Promise.all(picks.map(function (p) { return loadImg(KB.byId[p.id].img); }));
      var y0 = 240;
      for (var r = 0; r < rows; r++) {
        var row = picks.slice(r * per, r * per + per), x0 = (W - (row.length * cw + (row.length - 1) * gap)) / 2;
        row.forEach(function (p, k) {
          var idx = r * per + k, x = x0 + k * (cw + gap), y = y0 + r * (chh + (n > 1 ? 56 : 20));
          c.save(); rr(c, x, y, cw, chh, 10); c.clip();
          if (imgs[idx]) {
            if (p.rev) { c.translate(x + cw / 2, y + chh / 2); c.rotate(Math.PI); c.drawImage(imgs[idx], -cw / 2, -chh / 2, cw, chh); }
            else c.drawImage(imgs[idx], x, y, cw, chh);
          } else drawBack(c, x, y, cw, chh);
          c.restore();
          rr(c, x, y, cw, chh, 10); c.strokeStyle = "rgba(255,255,255,.35)"; c.lineWidth = 2; c.stroke();
          if (n > 1) { c.font = "400 " + (n > 5 ? 22 : 24) + "px " + F; c.fillStyle = "#c9d0ea"; c.fillText(wrapTh(c, labels[idx], cw + 16)[0] + (p.rev ? " ↻" : ""), x + cw / 2, y + chh + 26); }
        });
      }
      msgTop = y0 + rows * (chh + (n > 1 ? 56 : 20)) + 30;
      if (opt.kind === "daily") msgs = [daily.th + " — " + daily.keywords.slice(0, 3).join(" · "), daily.upright.general, "คำแนะนำ: " + daily.advice];
      else msgs = current.synth.keyMessages;
    }
    // 3 ข้อความหลัก
    var space = 1250 - msgTop, boxH = Math.min(124, (space - 2 * 16) / 3), fs = boxH < 100 ? 28 : 32;
    c.font = "500 " + fs + "px " + F;
    msgs.slice(0, 3).forEach(function (m, k) {
      var y = msgTop + k * (boxH + 16);
      rr(c, 90, y, W - 180, boxH, 22); c.fillStyle = "rgba(255,255,255,.09)"; c.fill();
      c.fillStyle = k === 2 ? "#a5f3fc" : "#fff";
      var ls = wrapTh(c, m, W - 240).slice(0, 2);
      if (wrapTh(c, m, W - 240).length > 2) ls[1] = ls[1].replace(/.{1}$/, "") + "…";
      ls.forEach(function (l, j) { c.fillText(l, W / 2, y + boxH / 2 + (j - (ls.length - 1) / 2) * (fs * 1.35)); });
    });
    c.font = "400 24px " + F; c.fillStyle = "#8f9bc4";
    wrapTh(c, KB.disclaimerShort + (opt.kind === "siamsee" ? " · กลอนแต่งขึ้นใหม่" : " · ภาพไพ่ RWS 1909 สาธารณสมบัติ"), W - 160).forEach(function (l, k) { c.fillText(l, W / 2, 1290 + k * 30); });
    return cv;
  }
  var cardUrls = {};
  async function share(btn, opt, imgEl) {
    touch(); btn.disabled = true;
    try {
      var cv = await makeCard(opt);
      var blob = await new Promise(function (r) { cv.toBlob(r, "image/jpeg", 0.92); });
      if (cardUrls[opt.kind]) URL.revokeObjectURL(cardUrls[opt.kind]);
      var url = cardUrls[opt.kind] = URL.createObjectURL(blob);
      imgEl.src = url; imgEl.hidden = false;
      var name = "lensiq-" + (opt.kind === "siamsee" ? "siamsee" : opt.kind === "daily" ? "daily-tarot" : "tarot") + ".jpg";
      var file = new File([blob], name, { type: "image/jpeg" });
      btn.disabled = false; // อย่าล็อกปุ่มค้างระหว่างแผ่นแชร์ของระบบเปิดอยู่
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try { await navigator.share({ files: [file], title: "ไพ่ทาโรต์ & เซียมซี — LENSIQ", text: KB.disclaimerShort }); return; }
        catch (e) { if (e.name === "AbortError") return; }
      }
      var a = document.createElement("a"); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove();
      toast("บันทึกการ์ดแล้ว");
    } catch (e) { console.error(e); toast("สร้างการ์ดไม่สำเร็จ"); }
    finally { btn.disabled = false; }
  }
  $("#trShare").addEventListener("click", function () { if (current) share(this, { kind: "tarot" }, $("#trCardImg")); });

  function toast(msg) { var t = $("#trToast"); t.textContent = msg; t.classList.add("show"); clearTimeout(toast.h); toast.h = setTimeout(function () { t.classList.remove("show"); }, 2200); }

  /* ---------- สถิติ ---------- */
  function renderStats() {
    var s = lsGet(STATS_KEY, null), box = $("#trStats");
    if (!s || !s.total) { box.innerHTML = '<p class="muted">ยังไม่มีการเปิดไพ่ในเครื่องนี้</p>'; return; }
    var tp = s.topics || {}, keys = ["general", "love", "work", "money", "siamsee"];
    var top = Object.keys(s.cards || {}).sort(function (a, b) { return s.cards[b] - s.cards[a]; }).slice(0, 5);
    box.innerHTML = '<p class="stat-n"><b>' + s.total + "</b> ครั้ง <small>(วันนี้ " + ((s.days || {})[TR.dayKey()] || 0) + ")</small></p>" +
      keys.map(function (k) {
        var nm = k === "siamsee" ? "เซียมซี" : KB.topics[k].th, v = tp[k] || 0;
        return '<div class="elbar" style="grid-template-columns:4.6em 1fr 2em"><span>' + esc(nm) + '</span><i style="--w:' + Math.round(v / s.total * 100) + '%;--c:#674ff2"></i><b>' + v + "</b></div>";
      }).join("") + (top.length ? '<p class="stat-top">ไพ่ที่ออกบ่อย: ' + top.map(function (id) { return esc(KB.byId[id] ? KB.byId[id].th : id) + " (" + s.cards[id] + ")"; }).join(", ") + "</p>" : "");
  }
  $("#trStatsOn").checked = !!prefs.stats;
  $("#trStatsOn").addEventListener("change", function () { prefs.stats = this.checked; lsSet(PREF_KEY, prefs); });
  $("#trStatsClear").addEventListener("click", function () { if (confirm("ล้างสถิติในเครื่องนี้?")) { try { localStorage.removeItem(STATS_KEY); } catch (e) { /* ไม่เป็นไร */ } renderStats(); } });
  renderStats();

  /* ---------- โหมดบูธ ---------- */
  var idleT = null, idleTick = null, wasFs = false;
  function busy() { return st.phase !== "setup" || !$("#ssResult").hidden || $("#trDailyCard").classList.contains("flip"); }
  function resetAll() {
    if (modal.open) modal.close();
    resetTarot();
    $("#ssResult").hidden = true; $("#ssFall").hidden = true; $("#ssCardImg").hidden = true;
    var dc = $("#trDailyCard"); dc.classList.remove("flip");
    $("#trDailyText").innerHTML = '<h2>ไพ่ประจำวันนี้</h2><p class="muted">แตะไพ่เพื่อเปิดดูพลังของวันนี้</p>';
    $("#trQuestion").value = "";
    window.scrollTo(0, 0);
  }
  function touch() {
    clearTimeout(idleT); clearInterval(idleTick);
    var el = $("#trIdle"); el.hidden = true;
    if (!document.body.classList.contains("tr-kiosk") || !busy()) return;
    var until = Date.now() + IDLE_MS;
    idleTick = setInterval(function () {
      var left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 15) { el.hidden = false; el.textContent = "กลับหน้าเริ่มต้นใน " + left + " วินาที — แตะเพื่ออยู่ต่อ"; }
    }, 1000);
    idleT = setTimeout(function () { clearInterval(idleTick); el.hidden = true; resetAll(); }, IDLE_MS);
  }
  ["pointerdown", "keydown", "wheel", "touchstart"].forEach(function (ev) { document.addEventListener(ev, function () { if (document.body.classList.contains("tr-kiosk")) touch(); }, { passive: true }); });
  function setKiosk(on) {
    document.body.classList.toggle("tr-kiosk", on);
    $("#trKiosk").setAttribute("aria-pressed", on ? "true" : "false");
    $("#trKioskExit").hidden = !on;
    if (on) {
      var de = document.documentElement;
      if (de.requestFullscreen && !document.fullscreenElement) de.requestFullscreen().then(function () { wasFs = true; }).catch(function () { /* iOS ไม่รองรับ */ });
      window.scrollTo(0, 0);
    } else if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    touch();
  }
  $("#trKiosk").addEventListener("click", function () { setKiosk(!document.body.classList.contains("tr-kiosk")); });
  $("#trKioskExit").addEventListener("click", function () { setKiosk(false); });
  document.addEventListener("fullscreenchange", function () { if (!document.fullscreenElement && wasFs) { wasFs = false; setKiosk(false); } });

  // แหล่งอ้างอิง
  $("#trSources").innerHTML = KB.sources.map(function (s) { return '<li><a href="' + esc(s.url) + '" target="_blank" rel="noopener">' + esc(s.label) + "</a></li>"; }).join("");
  $("#trCredit").textContent = KB.imageCredit + " · รายละเอียดใน vendor/tarot/CREDITS.txt";

  if (location.hash === "#siamsee") selectTab("tabSiamsee"); else if (location.hash === "#daily") selectTab("tabDaily");
  window.__tr = { state: st, get current() { return current; }, makeCard: makeCard, resetAll: resetAll, drawSiamsee: drawSiamsee }; // ใช้ทดสอบ
})();
