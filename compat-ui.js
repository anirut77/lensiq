/* compat-ui.js — the page for Compatibility (ดวงสมพงษ์), compat.html. Engine and texts: compat.js, compat-kb.js.
 * Owner order 2026-11-16 part A. Locked tests: tests/e2e/fortune-compat.e2e.mjs (contract in its header),
 * tests/e2e/fortune-compat-webkit.e2e.mjs, tests/unit/fortune-compat.test.js.
 *   consent  the second and later people stay disabled until #cpConsent is ticked; without it nothing is computed
 *   privacy  birth data and names stay in the form; nothing is stored, sent or given to AI; the planet calculator
 *            (vendor/astronomy-engine, same origin) is loaded once on demand, so computing itself makes no request
 *   crisis   crisis v3 (owner decision 2026-11-17): a crisis phrase in any field, or the page already in the crisis state,
 *            sets the crisis state and the reading goes on in the free tier (no card, nothing flagged, nothing typed shown);
 *            calm / crisis pages end with the one closing line (tel:1323, counselling link); distress words get the soft step
 *   paid     tier from LQCompat.tierFor(window, LQFortuneCrisis): free = overview + 2 categories; the rest only when
 *            LENSIQ_FORTUNE_PAID is exactly true (default off), marked data-lq-paid for the paid framework to take over
 *   share    the overview carries data-lq-shareable="compat-overview" for the share card / print work (fortune-share-print) */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), D = document;
  const app = D.getElementById("cpApp");
  if (!app || !W.LQCompat) return;
  const $ = id => /** @type {any} */ (D.getElementById(id));
  const C = () => W.LQCompat; // always through the public object
  const lang = () => { const l = W.LQI18N && W.LQI18N.lang; return l === "en" || l === "zh" ? l : "th"; };
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, (m, x) => (v && v[x] != null ? v[x] : m)));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const ENGINE = "vendor/astronomy-engine/astronomy.browser.min.js";
  const MONTHS = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
  const st = { mode: "pair", n: 2, busy: false };
  /* v2 view (LQCompatV2): only when LENSIQ_COMPAT_V2 is exactly true; loaded on demand, pair mode only. Switch off = v1 unchanged. */
  const V2 = () => W.LENSIQ_COMPAT_V2 === true;
  let v2P = null;
  function loadV2() {
    if (W.LQCompatV2) return Promise.resolve(W.LQCompatV2);
    if (v2P) return v2P;
    v2P = new Promise(res => {
      const s = D.createElement("script"); s.src = "compat-v2.js?v=1"; s.async = true;
      s.onload = () => res(W.LQCompatV2 || null); s.onerror = () => { v2P = null; res(null); };
      D.head.appendChild(s);
    });
    return v2P;
  }

  /* ---------- planet calculator: loaded once, on demand ---------- */
  let engineP = null;
  function engine() {
    if (W.Astronomy && W.Astronomy.EclipticGeoMoon) return Promise.resolve(W.Astronomy);
    if (engineP) return engineP;
    engineP = new Promise(res => {
      const s = D.createElement("script"); s.src = ENGINE; s.async = true;
      const t = setTimeout(() => res(null), 12000);
      s.onload = () => { clearTimeout(t); res(W.Astronomy || null); };
      s.onerror = () => { clearTimeout(t); engineP = null; res(null); };
      D.head.appendChild(s);
    });
    return engineP;
  }

  /* ---------- people ---------- */
  function personHTML(i) {
    const legend = i === 0 ? T("compat.you", "คุณ") : T("compat.personN", "คนที่ {n}", { n: i + 1 });
    const days = '<option value="">' + esc(T("compat.optDay", "วันที่")) + "</option>" + Array.from({ length: 31 }, (_, k) => '<option value="' + (k + 1) + '">' + (k + 1) + "</option>").join("");
    const months = '<option value="">' + esc(T("compat.optMonth", "เดือน")) + "</option>" + MONTHS.map((m, k) => '<option value="' + (k + 1) + '">' + esc(T("compat.month." + (k + 1), m)) + "</option>").join("");
    return '<fieldset class="cp-person fk-block" data-cp-person="' + i + '"><legend>' + esc(legend) + "</legend>" +
      '<label class="cp-nick"><span>' + esc(T("compat.nick", "ชื่อเล่น (ไม่บังคับ)")) + '</span><input type="text" name="nick" id="cpNick' + i + '" maxlength="80" autocomplete="off"></label>' +
      '<div class="fk-row cp-date"><label><span>' + esc(T("compat.day", "วันที่")) + '</span><select name="d">' + days + "</select></label>" +
      "<label><span>" + esc(T("compat.month", "เดือน")) + '</span><select name="m">' + months + "</select></label>" +
      "<label><span>" + esc(T("compat.year", "ปีเกิด (พ.ศ. หรือ ค.ศ.)")) + '</span><input type="text" name="y" id="cpYear' + i + '" inputmode="numeric" pattern="[0-9]*" autocomplete="off" placeholder="' +
      esc(T("compat.yearPh", "เช่น 2531")) + '"></label>' +
      "<label><span>" + esc(T("compat.time", "เวลาเกิด (ถ้าทราบ)")) + '</span><input type="time" name="t"></label></div></fieldset>';
  }
  function renderPeople(keep) {
    const box = $("cpPeople"), old = keep ? readAll(true) : [];
    box.innerHTML = Array.from({ length: st.n }, (_, i) => personHTML(i)).join("");
    old.forEach((p, i) => { if (i >= st.n) return; const fs = box.querySelector('[data-cp-person="' + i + '"]'); for (const k of ["nick", "d", "m", "y", "t"]) /** @type {any} */ (fs.querySelector('[name="' + k + '"]')).value = p.raw[k]; });
    syncConsent();
    $("cpAdd").hidden = $("cpRemove").hidden = st.mode !== "group";
    $("cpAdd").disabled = st.n >= 8; $("cpRemove").disabled = st.n <= 3;
  }
  function syncConsent() {
    const ok = $("cpConsent").checked;
    D.querySelectorAll("[data-cp-person]").forEach(fs => { if (fs.getAttribute("data-cp-person") !== "0") /** @type {any} */ (fs).disabled = !ok; });
  }
  function readAll(raw) {
    return Array.from(D.querySelectorAll("[data-cp-person]")).map(fs => {
      const v = k => /** @type {any} */ (fs.querySelector('[name="' + k + '"]')).value.trim();
      const r = { nick: v("nick"), d: v("d"), m: v("m"), y: v("y"), t: v("t") };
      if (raw) return { raw: r };
      let y = parseInt(r.y, 10);
      if (y > 2400) y -= 543;
      const tm = /^(\d{1,2}):(\d{2})/.exec(r.t);
      return { raw: r, y, m: parseInt(r.m, 10), d: parseInt(r.d, 10), time: tm ? { h: +tm[1], mi: +tm[2] } : null, nick: r.nick };
    });
  }

  /* ---------- mode ---------- */
  function syncWorkUse() { /** @type {any} */ (D.querySelector("#cpForm [data-compat-workuse]")).hidden = !(st.mode === "group" || /** @type {any} */ ($("cpRel")).value === "business"); }
  $("cpRel").addEventListener("change", syncWorkUse);
  function setMode(m) {
    st.mode = m; st.n = m === "group" ? 3 : 2;
    D.querySelectorAll("[data-cp-mode]").forEach(b => { const on = b.getAttribute("data-cp-mode") === m; b.setAttribute("aria-selected", on ? "true" : "false"); /** @type {any} */ (b).tabIndex = on ? 0 : -1; });
    const sel = /** @type {HTMLSelectElement} */ ($("cpRel"));
    Array.from(sel.options).forEach(o => { const on = o.getAttribute("data-cp-for") === m; o.hidden = !on; o.disabled = !on; });
    sel.value = m === "group" ? "team" : "couple";
    syncWorkUse();
    renderPeople(true);
    clearResult();
  }
  D.querySelectorAll("[data-cp-mode]").forEach(b => {
    b.addEventListener("click", () => setMode(b.getAttribute("data-cp-mode")));
    b.addEventListener("keydown", /** @param {any} e */ e => { if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); const m = st.mode === "pair" ? "group" : "pair"; setMode(m); /** @type {any} */ ($(m === "pair" ? "cpTabPair" : "cpTabGroup")).focus(); } });
  });
  $("cpConsent").addEventListener("change", () => { syncConsent(); if (/** @type {any} */ ($("cpConsent")).checked) { engine(); msg(""); } });
  $("cpAdd").addEventListener("click", () => { if (st.n < 8) { st.n++; renderPeople(true); } });
  $("cpRemove").addEventListener("click", () => { if (st.n > 3) { st.n--; renderPeople(true); } });

  /* ---------- messages / result shell ---------- */
  const msg = t => { $("cpMsg").textContent = t || ""; };
  function clearResult() { const r = $("cpResult"); r.innerHTML = ""; r.hidden = true; }
  const FA = () => W.FortuneAI, CR = () => W.LQFortuneCrisis;
  /** crisis v3: the crisis state is set (remedies, paid parts, share and print go; analytics stop); nothing is drawn */
  function crisisSet() {
    const fa = FA(), c = CR();
    try { if (c && c.setActive) c.setActive(D); else if (fa && fa.crisis && fa.crisis.setActive) fa.crisis.setActive(); } catch (e) { /* the html flag below */ }
    D.documentElement.setAttribute("data-lq-crisis", "1");
  }
  const crisisHit = texts => { const fa = FA(); return !!(fa && fa.crisis && texts.some(t => t && fa.crisis.check(t))); };
  /** every field the visitor can type into (names, years, times), and the crisis net's own field reader */
  const allTexts = () => Array.from(D.querySelectorAll("#cpForm input, #cpForm textarea")).map(e => /** @type {any} */ (e)).filter(e => e.type !== "checkbox").map(e => e.value)
    .concat([CR() && CR().fields ? CR().fields(D) : ""]);
  const softNames = () => { const c = CR(); return !!(c && c.softName) && Array.from(D.querySelectorAll('#cpForm input[name="nick"]')).some(e => c.softName(/** @type {any} */ (e).value)); };
  // the crisis check runs while the visitor types, on every field, before any truncation or validation
  $("cpForm").addEventListener("input", () => { if (!crisisOn() && crisisHit(allTexts())) crisisSet(); });
  const crisisOn = () => { const fa = FA(); return !!(fa && fa.crisis && fa.crisis.active && fa.crisis.active()) || !!(CR() && CR().active && CR().active(D)); };
  const plain = s => { const c = CR(); return c && c.plainName ? c.plainName(s) : s; };

  /* ---------- compute ---------- */
  $("cpForm").addEventListener("submit", e => { e.preventDefault(); go(); });
  async function go() {
    if (st.busy) return;
    // the crisis net first, on every field, before consent and before any format check
    if (!crisisOn() && crisisHit(allTexts())) crisisSet();
    if (!/** @type {any} */ ($("cpConsent")).checked) { msg(T("compat.needConsent", "โปรดติ๊กยืนยันว่าได้แจ้งเจ้าของข้อมูลแล้ว ก่อนกรอกและดูผล")); clearResult(); return; }
    const ppl = readAll(false);
    for (let i = 0; i < ppl.length; i++) {
      const p = ppl[i], bad = !(p.y >= 1900 && p.y <= 2100) ? "y" : !(p.m >= 1 && p.m <= 12) ? "m" : !(p.d >= 1 && p.d <= new Date(p.y, p.m, 0).getDate()) ? "d" : "";
      if (bad) {
        const who = i === 0 ? T("compat.you", "คุณ") : T("compat.personN", "คนที่ {n}", { n: i + 1 });
        msg(T("compat.bad." + bad, { y: "{who}: ปีเกิดต้องอยู่ระหว่าง พ.ศ. 2443–2643 (ค.ศ. 1900–2100)", m: "{who}: โปรดเลือกเดือนเกิด", d: "{who}: โปรดเลือกวันที่ให้ถูกต้อง" }[bad], { who }));
        const f = D.querySelector('[data-cp-person="' + i + '"] [name="' + bad + '"]'); if (f) /** @type {any} */ (f).focus();
        st.last = null; clearResult();
        return;
      }
    }
    const c = CR();
    if (!crisisOn() && c && c.renderSoft && ((c.pageSoft && c.pageSoft()) || softNames())) {
      const r = $("cpResult"); r.innerHTML = ""; r.hidden = false;
      const box = D.createElement("div"); r.appendChild(box);
      c.renderSoft(box, lang(), () => { c.ack(); compute(ppl); }, () => { crisisSet(); compute(ppl); });
      return;
    }
    compute(ppl);
  }
  async function compute(ppl) {
    st.busy = true; msg(T("compat.working", "กำลังคำนวณในเครื่อง…"));
    try {
      const A = await engine();
      if (V2() && st.mode === "pair") await loadV2();
      const L = C(), opts = { astronomy: A };
      const people = ppl.map(p => L.person({ y: p.y, m: p.m, d: p.d, time: p.time, tz: 7 }, opts));
      const rel = /** @type {any} */ ($("cpRel")).value, names = ppl.map(p => (p.nick && plain(p.nick)) || "");
      const tier = L.tierFor(W, CR(), D);
      const res = st.mode === "group" ? L.group(people, { rel }) : L.pair(people[0], people[1], { rel });
      st.last = { res, names, tier };
      draw();
      msg("");
      const r = $("cpResult");
      try { r.scrollIntoView({ block: "start" }); const h = r.querySelector("h2"); if (h) h.focus({ preventScroll: true }); } catch (e) { /* old browsers */ }
    } catch (e) {
      msg(T("compat.err", "คำนวณไม่สำเร็จ โปรดตรวจวันเกิดแล้วลองอีกครั้ง"));
    } finally { st.busy = false; }
  }

  /* ---------- drawing ---------- */
  const icon = (path, color) => '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path d="' + esc(path) + '" fill="none" stroke="' + esc(color || "currentColor") + '" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  function wheelSVG(rep) {
    const n = rep.overview.wheel.length, cx = 120, cy = 120, r0 = 34, parts = [];
    rep.overview.wheel.forEach((w, i) => {
      const a0 = (i / n) * 2 * Math.PI - Math.PI / 2 + 0.03, a1 = ((i + 1) / n) * 2 * Math.PI - Math.PI / 2 - 0.03;
      const r1 = 60 + 52 * w.level, big = a1 - a0 > Math.PI ? 1 : 0;
      const p = (r, a) => (cx + r * Math.cos(a)).toFixed(1) + " " + (cy + r * Math.sin(a)).toFixed(1);
      parts.push('<path d="M' + p(r0, a0) + " L" + p(112, a0) + " A112 112 0 " + big + " 1 " + p(112, a1) + " L" + p(r0, a1) + " A" + r0 + " " + r0 + " 0 " + big + ' 0 ' + p(r0, a0) + 'Z" fill="' + w.color + '" opacity=".12"/>');
      parts.push('<path d="M' + p(r0, a0) + " L" + p(r1, a0) + " A" + r1 + " " + r1 + " 0 " + big + " 1 " + p(r1, a1) + " L" + p(r0, a1) + " A" + r0 + " " + r0 + " 0 " + big + ' 0 ' + p(r0, a0) + 'Z" fill="' + w.color + '" opacity="' + (0.55 + 0.4 * w.level).toFixed(2) + '"/>');
      const am = (a0 + a1) / 2, ix = cx + 86 * Math.cos(am) - 9, iy = cy + 86 * Math.sin(am) - 9;
      parts.push('<g transform="translate(' + ix.toFixed(1) + " " + iy.toFixed(1) + ') scale(.75)"><circle cx="12" cy="12" r="13" fill="#fff"/><path d="' + esc(w.icon) + '" fill="none" stroke="' + w.color + '" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>');
    });
    const label = rep.overview.wheel.map(w => w.title + ": " + w.leanText).join(", ");
    return '<svg class="cp-wheel" data-compat-wheel viewBox="0 0 240 240" role="img" aria-label="' + esc(label) + '"><circle cx="120" cy="120" r="' + r0 + '" fill="#f4f2ff"/>' + parts.join("") + "</svg>";
  }
  function legendHTML(rep) {
    return '<ul class="cp-legend">' + rep.overview.wheel.map(w => '<li data-compat-wheel-label data-cat="' + w.cat + '" data-lean="' + w.lean + '" style="--cat-color:' + w.color + '">' +
      '<span class="cp-sw" data-swatch style="background:' + w.color + '"></span><span class="cp-ic">' + icon(w.icon, w.color) + '</span><span class="cp-lt"><b>' + esc(w.title) + "</b> <span>" + esc(w.leanText) + "</span></span></li>").join("") + "</ul>";
  }
  function cautionsHTML(rep) {
    const cs = rep.overview.cautions;
    const head = '<h3>' + esc(T("compat.cautionsH", "เรื่องที่ควรใส่ใจ และวิธีปรับ")) + "</h3>";
    if (!cs.length) return '<section class="cp-cautions" data-compat-cautions>' + head + "<p>" + esc(T("compat.cautionsNone", "ไม่มีเรื่องที่ตำราให้ระวังเป็นพิเศษ")) + "</p></section>";
    return '<section class="cp-cautions" data-compat-cautions>' + head + "<ul>" + cs.map(c => '<li style="--cat-color:' + esc(colorOf(c.cat)) + '"><b>' + esc(c.title) + "</b> " + esc(c.text) +
      '<br><span class="cp-step">' + esc(T("compat.step", "วิธีปรับ: {s}", { s: c.step })) + "</span></li>").join("") + "</ul></section>";
  }
  const colorOf = cat => (C().KB.CAT[cat] || {}).color || "#674ff2";
  function methodsHTML(rep) {
    if (!rep.overview.methods.length) return "";
    return '<section class="cp-methods"><h3>' + esc(T("compat.methodsH", "ผลของแต่ละศาสตร์")) + "</h3>" + rep.overview.methods.map(m => {
      const sc = m.score == null ? "" : '<p class="cp-score" data-compat-score>' + esc(fmtScore(m)) + "</p>";
      return '<div class="cp-method" data-compat-method="' + m.id + '" data-compat-detail><h4>' + esc(m.name) + "</h4>" + sc + "<ul>" + m.detail.map(x => "<li>" + esc(x) + "</li>").join("") + "</ul></div>";
    }).join("") + "</section>";
  }
  const fmtScore = m => (Math.round(m.score * 10) / 10) + "/" + m.max + (m.guide ? " · " + T("compat.guide", "เกณฑ์อ้างอิง") : " · " + T("compat.traditional", "คะแนนตามตำรา"));
  const LEAN_SYM = { fit: "●", mixed: "◐", care: "○", none: "–" };
  function agreeHTML(rep) {
    if (!rep.agreement.length) return "";
    const K = C().KB, ms = C().METHODS;
    return '<section class="cp-agree fk-block" data-compat-agree><h3>' + esc(T("compat.agreeH", "ศาสตร์ไหนเห็นตรงกัน")) + '</h3><p class="fk-small">' +
      esc(T("compat.agreeKey", "● เข้ากันดี · ◐ กลาง ๆ · ○ ใส่ใจเป็นพิเศษ · – คำนวณไม่ได้")) + "</p>" +
      rep.agreement.map(a => '<div class="cp-arow" data-agree-cat="' + a.cat + '" style="--cat-color:' + a.color + '"><div class="cp-ahead">' + icon(a.icon, a.color) + "<b>" + esc(a.title) + "</b>" +
        (a.agree ? '<span class="cp-tag ok">' + esc(T("compat.agreeTag", "ตรงกัน")) + "</span>" : '<span class="cp-tag">' + esc(T("compat.differTag", "ต่างกัน")) + "</span>") + '</div><div class="cp-acells">' +
        ms.map(m => { const l = a.leans[m] || "none"; return '<span class="cp-cell" data-agree-method="' + m + '" data-lean="' + l + '"><span aria-hidden="true">' + LEAN_SYM[l] + "</span> " + esc(K.METHOD[m].short[rep.lang]) + '<span class="cp-sr"> ' + esc(K.LEAN[l][rep.lang]) + "</span></span>"; }).join("") +
        '</div><p class="fk-small">' + esc(a.text) + "</p></div>").join("") + "</section>";
  }
  let uid = 0;
  function sectionEl(s, rep) {
    const sec = D.createElement("section");
    sec.className = "fa-section cp-cat fk-block"; sec.setAttribute("data-section", s.id); sec.setAttribute("data-lq-grouped", "1"); sec.id = "cp-cat-" + s.id;
    sec.style.setProperty("--cat-color", s.color);
    if (s.paid) sec.setAttribute("data-lq-paid", "compat");
    const h = D.createElement("h3"); h.innerHTML = '<span class="cp-ic" data-icon>' + icon(s.icon, s.color) + "</span>" + esc(s.title); sec.appendChild(h);
    const gist = D.createElement("p"); gist.className = "lq-gist"; gist.textContent = s.fit[0]; sec.appendChild(gist);
    if (s.care.length) {
      const hc = D.createElement("p"); hc.className = "cp-sub"; hc.textContent = T("compat.careH", "ควรใส่ใจ"); sec.appendChild(hc);
      s.care.forEach((c, i) => { const p = D.createElement("p"); p.className = "lq-caution"; p.textContent = c + " " + T("compat.step", "วิธีปรับ: {s}", { s: s.steps[i] }); sec.appendChild(p); });
    } else { const p = D.createElement("p"); p.className = "cp-none"; p.textContent = s.careNone; sec.appendChild(p); }
    const body = D.createElement("div"); body.className = "lq-more-body"; body.id = "cp-mb-" + (++uid);
    if (s.fit.length > 1) { const hf = D.createElement("p"); hf.className = "cp-sub"; hf.textContent = T("compat.fitH", "สิ่งที่เข้ากัน"); body.appendChild(hf); }
    s.fit.slice(1).forEach(f => { const p = D.createElement("p"); p.textContent = f; body.appendChild(p); });
    const ha = D.createElement("p"); ha.className = "cp-sub"; ha.textContent = T("compat.adjustH", "วิธีปรับเข้าหากัน"); body.appendChild(ha);
    const ul = D.createElement("ul"); s.adjust.forEach(a => { const li = D.createElement("li"); li.textContent = a; ul.appendChild(li); }); body.appendChild(ul);
    sec.appendChild(body);
    const N = W.LQNotice;
    if (N && N.moreButton) sec.appendChild(N.moreButton(D, rep.lang, [body.id], open => { body.classList.toggle("lq-open", open); sec.classList.toggle("lq-open", open); }));
    return sec;
  }
  function mapHTML(rep) {
    const n = rep.names.length, cell = {};
    rep.map.forEach(c => { cell[c.i + "-" + c.j] = c; });
    // the hint and the fade edge show only when the table is wider than the screen (fitMap after drawing)
    let t = '<p class="cp-maphint" data-compat-maphint hidden>' + esc(T("compat.mapScroll", "เลื่อนตารางไปทางขวาเพื่อดูทุกคน →")) + "</p>" +
      '<div class="cp-mapouter"><div class="cp-mapwrap"><table class="cp-map" data-compat-map><caption>' + esc(T("compat.mapKey", "● เข้ากันดี · ◐ กลาง ๆ · ○ ใส่ใจเป็นพิเศษ")) + "</caption><thead><tr><th></th>" +
      rep.names.map((nm, i) => '<th scope="col" title="' + esc(nm) + '">' + (i + 1) + "</th>").join("") + "</tr></thead><tbody>";
    for (let i = 0; i < n; i++) {
      t += '<tr><th scope="row">' + (i + 1) + ". " + esc(short(rep.names[i])) + "</th>";
      for (let j = 0; j < n; j++) {
        if (j <= i) { t += '<td class="cp-x" aria-hidden="true"></td>'; continue; }
        const c = cell[i + "-" + j];
        t += '<td data-pair="' + i + "-" + j + '" data-lean="' + c.lean + '" title="' + esc(c.text) + '"><span aria-hidden="true">' + LEAN_SYM[c.lean] + '</span><span class="cp-sr">' + esc(c.text) + "</span></td>";
      }
      t += "</tr>";
    }
    t += "</tbody></table></div></div>";
    t += '<ul class="cp-pairs">' + rep.map.map(c => '<li data-lean="' + c.lean + '"><span aria-hidden="true">' + LEAN_SYM[c.lean] + "</span> " + esc(c.text) + (c.step ? '<br><span class="cp-step">' + esc(c.step) + "</span>" : "") + "</li>").join("") + "</ul>";
    return t;
  }
  function fitMap() {
    D.querySelectorAll("#cpResult .cp-mapouter").forEach(o => {
      const w = o.querySelector(".cp-mapwrap"), wide = !!w && w.scrollWidth > w.clientWidth + 1, h = o.previousElementSibling;
      o.classList.toggle("cp-scrolls", wide);
      if (h && h.hasAttribute("data-compat-maphint")) /** @type {any} */ (h).hidden = !wide;
    });
  }
  W.addEventListener("resize", fitMap);
  const short = s => (String(s).length > 10 ? String(s).slice(0, 9) + "…" : s);
  function draw() {
    if (!st.last) return;
    const L = C(), r = $("cpResult"), { res, names, tier } = st.last;
    const rep = L.report(res, { lang: lang(), tier: L.tierFor(W, CR(), D) === "full" && tier === "full" ? "full" : "free", names, rel: res.rel });
    r.innerHTML = ""; r.hidden = false;
    if (V2() && rep.mode === "pair" && W.LQCompatV2) {
      // review F6: a v2 failure falls back to the v1 reading below (which keeps the closing 1323 line); the error goes to the console only
      let ok = false;
      try { ok = !!W.LQCompatV2.render(r, { res, rep, names, lang: lang(), tier: rep.tier, doc: D }); } catch (e) { try { console.error("compat v2 view failed; showing v1", e); } catch (x) { /* no console */ } }
      if (ok) { drawEnd(r); return; }
      r.innerHTML = "";
    }
    const ov = D.createElement("div");
    ov.className = "cp-ov fk-block"; ov.setAttribute("data-compat-overview", ""); ov.setAttribute("data-lq-shareable", "compat-overview"); ov.setAttribute("data-lq-printable", "");
    ov.innerHTML = '<h2 tabindex="-1" id="cpResTitle">' + esc(rep.overview.title) + '</h2><div class="cp-wheelbox">' + wheelSVG(rep) + legendHTML(rep) + "</div>" +
      rep.overview.lines.map(l => "<p>" + esc(l) + "</p>").join("") + cautionsHTML(rep) + methodsHTML(rep);
    r.appendChild(ov);
    if (rep.mode === "group") {
      const g = D.createElement("div"); g.className = "cp-group fk-block";
      g.innerHTML = '<p class="cp-workuse" data-compat-workuse>' + esc(rep.workUse) + "</p><h3>" + esc(T("compat.mapH", "แผนผังว่าใครเสริมใคร")) + "</h3>" + mapHTML(rep) +
        "<h3>" + esc(T("compat.rolesH", "หน้าที่ที่แนะนำ (จุดแข็งของแต่ละคน)")) + '</h3><ul class="cp-roles">' +
        rep.roles.map(x => '<li data-compat-role><b>' + esc(x.name) + "</b> · " + esc(x.role) + '<br><span class="fk-small">' + esc(x.strength) + "</span></li>").join("") + "</ul>";
      r.appendChild(g);
    } else {
      if (rep.workUse) { const w = D.createElement("p"); w.className = "cp-workuse"; w.setAttribute("data-compat-workuse", ""); w.textContent = rep.workUse; r.appendChild(w); } // business partners
      const a = D.createElement("div"); a.innerHTML = agreeHTML(rep); r.appendChild(a.firstElementChild);
    }
    const cats = D.createElement("div"); cats.className = "cp-cats";
    const h = D.createElement("h3"); h.className = "cp-catsh"; h.textContent = T("compat.catsH", "รายละเอียดแต่ละหมวด (แตะ \"อ่านเพิ่มเติม\" เพื่อเปิด)"); cats.appendChild(h);
    rep.sections.forEach(s => cats.appendChild(sectionEl(s, rep)));
    r.appendChild(cats);
    fitMap();
    drawEnd(r);
  }
  function drawEnd(r) {
    // crisis v3 rule d: on a crisis / calm page the one closing line ends the reading
    const c = CR();
    try { if (c && c.helpLine && c.calmOn && (c.calmOn(D) || (c.distress && c.distress(D)))) r.appendChild(c.helpLine(D, lang(), "lq-helpline-result")); } catch (e) { /* no line */ }
    if (W.LQRead && W.LQRead.ensureStyle) try { W.LQRead.ensureStyle(D); } catch (e) { /* layout styles are also in compat.css */ }
  }

  W.addEventListener("lq-lang", () => { renderPeople(true); if (st.last) draw(); });
  W.addEventListener("lq-crisis", () => { if (st.last) draw(); }); // v3: the same reading, free tier, closing line
  renderPeople(false);
})();
