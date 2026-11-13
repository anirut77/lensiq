/* lensiq-nut-ui.js — nutrition.html, label mode (Nutrition MVP; docs/NUTRITION-DESIGN.md §2.1, §2.2, §7).
 * Flow: camera snapshot or photo -> text boxes (PP-OCRv5 det, lensiq-pc-run.js) -> automatic crop the user can redraw ->
 * OCR in the chosen script -> LQNut.parseLabel -> card: printed values (with their source line and a status) | converted
 * values on their own line | amount eaten -> calculated values | allergen statement verbatim.
 * Typed or pasted label text takes the same path without the camera. Everything runs on this device: no upload, no AI, no
 * food database, no image or text stored. The only stored item is the "hide calories" setting (localStorage
 * "lq-nut-hide-kcal", written only when the user changes it).
 * Wellbeing rules (design §7): numbers with units in one neutral colour; no judgement words, scores, goals or targets;
 * "hide calories" removes every energy value from the card (one tap shows it for that card only).
 * Test hooks: window.__LQ_NUT = {st, setImage(canvas), parseText(text)}.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window), N = W.LQNut, P = W.LQPC, R = W.LQPCRun;
  const $ = s => /** @type {any} */ (document.querySelector(s));
  if (!N || !$("#nutOut")) return;
  const fill = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, x) => (v && x in v ? String(v[x]) : m));
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const esc = s => String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  const raw = s => `<span translate="no">${esc(s)}</span>`;
  const KEY = "lq-nut-hide-kcal";
  const store = { get() { try { return localStorage.getItem(KEY) === "1"; } catch { return false; } },
    set(v) { try { if (v) localStorage.setItem(KEY, "1"); else localStorage.removeItem(KEY); } catch { /* blocked storage: the setting lasts for this visit */ } } };

  const st = { gen: 0, script: (P && P.DEFAULT_SCRIPT) || "th", cam: null, still: false, crop: null, boxes: [], text: "", parsed: null, reveal: false,
    tilt: 0, hide: store.get(), amount: { kind: "servings", n: 1 }, busy: false, editing: null, ms: null };
  W.__LQ_NUT = { st };
  $("#nutHideKcal").checked = st.hide;

  /* ---------- labels (TH default; EN / ZH in i18n/en-nut.js, i18n/zh-nut.js) ---------- */
  const FIELD = () => ({ energy_kcal: T("nut.f.energy_kcal", "พลังงาน"), energy_kj: T("nut.f.energy_kj", "พลังงาน (กิโลจูล)"), fat: T("nut.f.fat", "ไขมันทั้งหมด"),
    satfat: T("nut.f.satfat", "ไขมันอิ่มตัว"), protein: T("nut.f.protein", "โปรตีน"), carb: T("nut.f.carb", "คาร์โบไฮเดรตทั้งหมด"), sugar: T("nut.f.sugar", "น้ำตาล"),
    fibre: T("nut.f.fibre", "ใยอาหาร"), sodium: T("nut.f.sodium", "โซเดียม"), salt: T("nut.f.salt", "เกลือ") });
  const BASIS = () => ({ serving: T("nut.b.serving", "ต่อหนึ่งหน่วยบริโภค"), "100g": T("nut.b.100g", "ต่อ 100 กรัม"), "100ml": T("nut.b.100ml", "ต่อ 100 มิลลิลิตร"),
    pack: T("nut.b.pack", "ต่อบรรจุภัณฑ์") });
  const UNIT = () => ({ g: T("nut.u.g", "กรัม"), mg: T("nut.u.mg", "มิลลิกรัม"), kcal: T("nut.u.kcal", "กิโลแคลอรี"), kJ: T("nut.u.kj", "กิโลจูล"), ml: T("nut.u.ml", "มิลลิลิตร"),
    "µg": T("nut.u.ug", "ไมโครกรัม") });
  const FORMAT = () => ({ "th-new": T("nut.fmt.thnew", "ฉลากโภชนาการไทย"), "th-old": T("nut.fmt.thold", "ฉลากโภชนาการไทย (แบบเดิม)"),
    "th-gda": T("nut.fmt.gda", "ฉลาก GDA ด้านหน้าบรรจุภัณฑ์ (ต่อบรรจุภัณฑ์)"), us: T("nut.fmt.us", "ฉลากแบบสหรัฐอเมริกา"), eu: T("nut.fmt.eu", "ฉลากแบบยุโรป"),
    cn: T("nut.fmt.cn", "ฉลากแบบจีน"), jp: T("nut.fmt.jp", "ฉลากแบบญี่ปุ่น"), generic: T("nut.fmt.generic", "ไม่ทราบรูปแบบฉลาก") });
  const WHY = () => ({ unit: T("nut.why.unit", "หน่วยไม่ชัด"), "ocr-confidence": T("nut.why.ocr", "อ่านตัวอักษรไม่ชัด"),
    "energy-macros": T("nut.why.energy", "ไม่สอดคล้องกับโปรตีน ไขมัน และคาร์โบไฮเดรต"), plausibility: T("nut.why.plaus", "ตัวเลขผิดปกติ"),
    duplicate: T("nut.why.dup", "พบสองค่าไม่เท่ากัน"), columns: T("nut.why.cols", "จำนวนคอลัมน์ไม่ตรงกัน"), basis: T("nut.why.basis", "ไม่พบว่าค่านี้คิดต่ออะไร"),
    "satfat-above-fat": T("nut.why.sat", "มากกว่าไขมันทั้งหมด"), "sugar-above-carb": T("nut.why.sugar", "มากกว่าคาร์โบไฮเดรตทั้งหมด") });
  const HINT = () => ({ blur: T("nut.q.blur", "ภาพอาจไม่คมชัด ถือกล้องให้นิ่งแล้วถ่ายใหม่"), glare: T("nut.q.glare", "มีแสงสะท้อนบนฉลาก เอียงบรรจุภัณฑ์เล็กน้อยหรือย้ายจากแสงไฟ"),
    dark: T("nut.q.dark", "ภาพมืดเกินไป ถ่ายในที่สว่างขึ้น"), bright: T("nut.q.bright", "ภาพสว่างจ้าเกินไป บางส่วนของฉลากอาจหายไป"),
    small: T("nut.q.small", "ตัวอักษรในภาพเล็กมาก เข้าใกล้ฉลากมากขึ้น"),
    tilt: T("nut.q.tilt", "ภาพเอียง ระบบจึงให้ตรวจทุกค่า ถือฉลากให้ตรงแล้วถ่ายใหม่จะอ่านได้ดีขึ้น"), notext: T("nut.q.notext", "ไม่พบตัวอักษรในภาพ ลองถ่ายด้านที่มีกรอบข้อมูลโภชนาการ") });
  const isEnergy = f => f === "energy_kcal" || f === "energy_kj";
  const num = (v, unit) => { const x = N.round(v, unit); return typeof x === "number" ? x.toLocaleString("en-US", { maximumFractionDigits: 1 }) : String(x); };
  const valText = (cmp, v, unit) => `${cmp ? T("nut.lt", "น้อยกว่า") + " " : ""}${num(v, unit)} ${UNIT()[unit] || unit}`;
  const status = (text, kind) => { const el = $("#nutStatus"); el.textContent = text || ""; if (kind) el.dataset.kind = kind; else delete el.dataset.kind; };

  /* ---------- settings ---------- */
  $("#nutHideKcal").addEventListener("change", e => { st.hide = e.target.checked; store.set(st.hide); st.reveal = false; render(); });
  $("#nutScript").addEventListener("change", e => { st.script = e.target.value; });

  /* ---------- text path ---------- */
  function parseText(text, lines, tilt) {
    st.text = String(text || "");
    st.parsed = N.parseLabel(lines || st.text.split(/\r?\n/), { tilt: lines ? tilt || 0 : 0 });
    st.reveal = false; st.editing = null;
    render();
    const n = st.parsed.items.length;
    status(n ? T("nut.st.parsed", "พบค่าบนฉลาก {n} ค่า ตรวจกับฉลากจริงทุกครั้ง", { n }) : T("nut.st.novalues", "ไม่พบค่าโภชนาการในข้อความนี้ ลองถ่ายให้เห็นกรอบข้อมูลโภชนาการชัดขึ้น"),
      n ? "ok" : "warn");
  }
  W.__LQ_NUT.parseText = t => parseText(t);
  $("#nutParse").addEventListener("click", () => parseText($("#nutText").value));
  const SAMPLE = ["ข้อมูลโภชนาการ", "หนึ่งหน่วยบริโภค : 1 ซอง (40 กรัม)", "จำนวนหน่วยบริโภคต่อซอง : 2", "คุณค่าทางโภชนาการต่อหนึ่งหน่วยบริโภค",
    "พลังงานทั้งหมด 170 กิโลแคลอรี", "ไขมันทั้งหมด 6 ก. 9%", "ไขมันอิ่มตัว 2 ก. 10%", "โปรตีน 4 ก.", "คาร์โบไฮเดรตทั้งหมด 25 ก. 8%", "น้ำตาลทั้งหมด 11 ก.",
    "โซเดียม 230 มก. 10%", "ข้อมูลสำหรับผู้แพ้อาหาร: มี นม ข้าวสาลี"].join("\n");
  $("#nutSample").addEventListener("click", () => { clearImage(); $("#nutText").value = SAMPLE; parseText(SAMPLE); st.sample = true; render(); });

  /* ---------- amount eaten ---------- */
  function amountControls() {
    const k = st.amount.kind, needsN = k === "servings" || k === "g" || k === "ml";
    const opt = (v, th, key) => `<option value="${v}"${k === v ? " selected" : ""}>${esc(T(key, th))}</option>`;
    return `<div class="nut-amt"><label class="nut-field"><span>${esc(T("nut.amt.h", "ปริมาณที่กินจริง"))}</span><select id="nutAmtKind">
      ${opt("servings", "จำนวนหน่วยบริโภค", "nut.amt.servings")}${opt("pack", "ทั้งบรรจุภัณฑ์", "nut.amt.pack")}${opt("half", "ครึ่งบรรจุภัณฑ์", "nut.amt.half")}
      ${opt("g", "กรัม", "nut.amt.g")}${opt("ml", "มิลลิลิตร", "nut.amt.ml")}</select></label>
      <label class="nut-field"${needsN ? "" : " hidden"}><span>${esc(T("nut.amt.n", "จำนวน"))}</span>
      <input id="nutAmtN" type="number" min="0" step="any" inputmode="decimal" value="${esc(st.amount.n)}"></label></div>`;
  }
  function wireAmount() {
    const kind = $("#nutAmtKind"), n = $("#nutAmtN");
    if (kind) kind.addEventListener("change", () => {
      st.amount.kind = kind.value;
      if (kind.value === "g" || kind.value === "ml") st.amount.n = (st.parsed && st.parsed.serving && (st.parsed.serving.grams || st.parsed.serving.ml)) || 100;
      else if (kind.value === "servings") st.amount.n = 1;
      render();
    });
    if (n) n.addEventListener("input", () => { const v = parseFloat(String(n.value).replace(",", ".")); if (v > 0) { st.amount.n = v; render(true); } });
  }
  const REASON = () => ({ "no-serving-weight": T("nut.calc.noweight", "ฉลากนี้ไม่ได้พิมพ์น้ำหนักที่ใช้คำนวณ จึงคำนวณจากกรัมหรือมิลลิลิตรไม่ได้ ลองเลือกจำนวนหน่วยบริโภคแทน ระบบไม่เดาน้ำหนักเอง"),
    "no-servings-per-pack": T("nut.calc.nospp", "ฉลากนี้ไม่ได้พิมพ์จำนวนหน่วยบริโภคต่อบรรจุภัณฑ์ จึงคำนวณทั้งบรรจุภัณฑ์ไม่ได้ ลองเลือกจำนวนหน่วยบริโภคแทน"),
    "no-basis": T("nut.calc.nobasis", "คำนวณจากค่าที่อ่านได้ไม่ได้") });

  /* ---------- the card ---------- */
  function render(keepFocus) {
    const out = $("#nutOut"), p = st.parsed;
    if (!p) { out.innerHTML = ""; return; }
    const F = FIELD(), B = BASIS(), Wy = WHY(), hidden = st.hide && !st.reveal;
    const calc = N.recalc(p, st.amount);
    const calcOf = it => (calc.ok ? calc.rows.find(r => r.field === it.field && r.basis_from === it.basis) : null);
    const rows = p.items.filter(it => !(hidden && isEnergy(it.field))).map((it, idx) => {
      const k = p.items.indexOf(it), c = calcOf(it), conv = N.convert(it);
      const chip = it.status === "edited" ? `<span class="nut-st" data-st="edited">${esc(T("nut.st.edited", "แก้โดยคุณ"))}</span>`
        : it.status === "check" ? `<span class="nut-st" data-st="check">${esc(T("nut.st.check", "โปรดตรวจ"))}: ${esc(it.why.map(w => Wy[w] || w).join(", "))}</span>`
          : `<span class="nut-st" data-st="read">${esc(T("nut.st.read", "อ่านได้"))}</span>`;
      const printed = st.editing === k
        ? `<form class="nut-edit-form"><input class="nut-edit-in" type="text" inputmode="decimal" value="${esc(it.value_text.replace(/^</, "< "))}" aria-label="${esc(T("nut.edit.a",
          "ค่าใหม่ตามฉลากจริง"))}"> <span>${esc(UNIT()[it.unit] || it.unit)}</span> <button class="btn primary small" type="submit">${esc(T("nut.edit.save", "บันทึก"))}</button>
          <button class="btn ghost small nut-edit-cancel" type="button">${esc(T("nut.edit.cancel", "ยกเลิก"))}</button></form>`
        : `<span class="nut-printed">${raw(it.shown || it.value_text + " " + it.unit)}</span>`;
      const hideConv = hidden && conv && isEnergy(conv.field);
      return `<div class="nut-item" data-field="${esc(it.field)}" data-basis="${esc(it.basis)}" data-k="${k}">
        <div class="nut-name"><b>${esc(F[it.field] || it.field)}</b> <small>${esc(B[it.basis] || it.basis)}</small></div>
        <div class="nut-val"><span class="nut-lab">${esc(T("nut.col.printed", "ตามฉลาก"))}</span> ${printed}
          ${conv && !hideConv ? `<span class="nut-conv">≈ ${esc(valText(conv.cmp, conv.value, conv.unit))} ${esc(F[conv.field])} (${esc(T("nut.conv", "แปลงโดย LENSIQ"))})</span>` : ""}</div>
        <div class="nut-calcw"><span class="nut-lab">${esc(T("nut.col.calc", "คำนวณจากค่าบนฉลาก"))}</span> <span class="nut-calc">${c ? "≈ " + esc(valText(c.cmp, c.value, c.unit)) : "–"}</span></div>
        <div class="nut-meta">${chip} <button class="btn ghost small nut-edit" type="button">${esc(T("nut.edit", "แก้ค่า"))}</button></div>
        <details class="nut-srcw"><summary>${esc(T("nut.src.h", "บรรทัดที่มา"))}</summary><p class="nut-src">${raw(it.raw)}</p></details>
      </div>`;
    }).join("");
    const nf = p.notFound.filter(f => !(hidden && isEnergy(f)));
    const al = p.allergen;
    const marked = al ? (() => {
      let h = esc(al.text);
      for (const w of [...al.words].sort((a, b) => b.length - a.length)) h = h.split(esc(w)).join(`\u0001${esc(w)}\u0002`);
      return h.replace(/\u0001/g, "<mark>").replace(/\u0002/g, "</mark>");
    })() : "";
    const sv = p.serving, spp = p.servingsPerPack;
    out.innerHTML = `<section class="card nut-card" aria-labelledby="nutCardH">
      <h2 id="nutCardH">${esc(T("nut.card.h", "ค่าบนฉลาก"))}</h2>
      <p class="nut-badges"><span class="nut-badge">${esc(FORMAT()[p.format] || p.format)}</span>${st.sample ? `<span class="nut-badge">${esc(T("nut.card.sample",
        "ฉลากตัวอย่างสมมติ"))}</span>` : ""}</p>
      ${sv || spp ? `<dl class="nut-kv">${sv ? `<dt>${esc(T("nut.card.serving", "หนึ่งหน่วยบริโภค"))}</dt><dd>${raw(sv.text)}</dd>` : ""}${spp
        ? `<dt>${esc(T("nut.card.spp", "จำนวนหน่วยบริโภคต่อบรรจุภัณฑ์"))}</dt><dd>${esc(spp.text)}</dd>` : ""}</dl>` : ""}
      ${hidden ? `<p class="nut-hidden-note">${esc(T("nut.card.hidden", "ซ่อนแคลอรีไว้ตามการตั้งค่า"))} <button class="btn ghost small" type="button" id="nutReveal">${esc(T("nut.card.reveal",
        "แสดงค่าที่ซ่อนไว้ในการ์ดนี้"))}</button></p>` : ""}
      ${amountControls()}
      <p class="nut-calcmsg" id="nutCalcMsg" aria-live="polite">${calc.ok ? esc(T("nut.calc.note", "ค่าที่คำนวณได้ปัดเศษแล้ว (≈) และคำนวณจากค่าที่พิมพ์บนฉลากเท่านั้น")) : esc(REASON()[calc.reason]
        || REASON()["no-basis"])}</p>
      <div class="nut-items">${rows || `<p class="hint">${esc(T("nut.card.none", "ไม่พบค่าโภชนาการ"))}</p>`}</div>
      ${nf.length ? `<p class="nut-nf" id="nutNotFound">${esc(T("nut.card.notfound", "ไม่พบบนฉลาก (ไม่ได้แปลว่าเป็นศูนย์)"))}: ${esc(nf.map(f => F[f] || f).join(", "))}</p>` : ""}
      <div class="nut-allergen" id="nutAllergen" role="note">
        <h3>${esc(T("nut.al.h", "ข้อมูลสำหรับผู้แพ้อาหาร"))}</h3>
        ${al ? `<p class="nut-al-text" translate="no">${marked}</p>` : `<p>${esc(T("nut.al.none", "ไม่พบข้อความเรื่องสารก่อภูมิแพ้ในภาพนี้ ซึ่งไม่ได้แปลว่าไม่มี"))}</p>`}
        <p class="nut-al-check"><b>${esc(T("nut.al.check", "โปรดตรวจฉลากจริงด้วยตัวเองทุกครั้ง"))}</b></p>
      </div>
    </section>`;
    wireCard(keepFocus);
  }
  function wireCard(keepFocus) {
    wireAmount();
    if (keepFocus) { const n = $("#nutAmtN"); if (n) { n.focus(); try { n.setSelectionRange(n.value.length, n.value.length); } catch { /* number inputs */ } } }
    const rv = $("#nutReveal");
    if (rv) rv.addEventListener("click", () => { st.reveal = true; render(); });
    for (const b of document.querySelectorAll("#nutOut .nut-edit")) b.addEventListener("click", () => { st.editing = +(/** @type {HTMLElement} */ (b.closest(".nut-item"))).dataset.k; render();
      const i = $("#nutOut .nut-edit-in"); if (i) i.focus(); });
    const form = $("#nutOut .nut-edit-form");
    if (form) {
      form.addEventListener("submit", e => {
        e.preventDefault();
        const it = st.parsed.items[st.editing], t = N.norm(form.querySelector(".nut-edit-in").value);
        const m = /^(<|น้อยกว่า|less than)?\s*(\d+(?:\.\d+)?)$/i.exec(t);
        if (!m) { form.querySelector(".nut-edit-in").setAttribute("aria-invalid", "true"); return; }
        const cmp = m[1] ? "<" : "";
        Object.assign(it, { value: parseFloat(m[2]), cmp, value_text: cmp + m[2], shown: valText(cmp, parseFloat(m[2]), it.unit), status: "edited", why: [] });
        st.editing = null;
        render();
      });
      form.querySelector(".nut-edit-cancel").addEventListener("click", () => { st.editing = null; render(); });
    }
  }
  W.addEventListener("lq-lang", () => render());

  /* ---------- image + crop box (images stay in memory only) ---------- */
  const video = $("#nutVideo"), still = $("#nutStill"), box = $("#nutCam"), cropEl = $("#nutCrop");
  const sctx = () => /** @type {CanvasRenderingContext2D} */ (still.getContext("2d", { willReadFrequently: true }));
  function fit() { const r = box.getBoundingClientRect(), k = Math.min(r.width / still.width, r.height / still.height); return { r, k, x: (r.width - still.width * k) / 2,
    y: (r.height - still.height * k) / 2 }; }
  function placeCrop() {
    if (!st.still || !st.crop) { cropEl.hidden = true; return; }
    const f = fit(), c = st.crop;
    if (!(f.r.width > 0)) return;
    cropEl.hidden = false;
    Object.assign(cropEl.style, { left: ((f.x + c.x * f.k) / f.r.width) * 100 + "%", top: ((f.y + c.y * f.k) / f.r.height) * 100 + "%", width: ((c.w * f.k) / f.r.width) * 100 + "%",
      height: ((c.h * f.k) / f.r.height) * 100 + "%" });
  }
  function cropCanvas() {
    const c = st.crop || { x: 0, y: 0, w: still.width, h: still.height }, o = document.createElement("canvas");
    o.width = Math.max(1, c.w); o.height = Math.max(1, c.h);
    /** @type {CanvasRenderingContext2D} */ (o.getContext("2d")).drawImage(still, c.x, c.y, c.w, c.h, 0, 0, c.w, c.h);
    return o;
  }
  let drag = null;
  box.addEventListener("pointerdown", e => { if (!st.still) return; const f = fit(); drag = { x: (e.clientX - f.r.left - f.x) / f.k, y: (e.clientY - f.r.top - f.y) / f.k };
    box.setPointerCapture(e.pointerId); });
  box.addEventListener("pointermove", e => {
    if (!drag) return;
    const f = fit(), cl = (v, m) => Math.min(m, Math.max(0, v));
    const x = cl((e.clientX - f.r.left - f.x) / f.k, still.width), y = cl((e.clientY - f.r.top - f.y) / f.k, still.height), x0 = cl(drag.x, still.width), y0 = cl(drag.y, still.height);
    if (Math.abs(x - x0) > 16 && Math.abs(y - y0) > 12) { st.crop = { x: Math.round(Math.min(x, x0)), y: Math.round(Math.min(y, y0)), w: Math.round(Math.abs(x - x0)),
      h: Math.round(Math.abs(y - y0)) }; placeCrop(); }
  });
  box.addEventListener("pointerup", () => { drag = null; });
  box.addEventListener("keydown", e => { // arrows move the crop box, Shift + arrows resize it
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d || !st.still || !st.crop) return;
    e.preventDefault();
    const c = { ...st.crop }, sx = Math.round(still.width * 0.02), sy = Math.round(still.height * 0.02), cl = (v, a, b) => Math.min(b, Math.max(a, v));
    if (e.shiftKey) { c.w = cl(c.w + d[0] * sx, 16, still.width - c.x); c.h = cl(c.h + d[1] * sy, 12, still.height - c.y); }
    else { c.x = cl(c.x + d[0] * sx, 0, still.width - c.w); c.y = cl(c.y + d[1] * sy, 0, still.height - c.h); }
    st.crop = c; placeCrop();
  });
  W.addEventListener("resize", placeCrop);

  function showWrap(live) {
    $("#nutCamWrap").hidden = false;
    video.hidden = !live; still.hidden = live;
    $("#nutSnap").hidden = !live;
    for (const id of ["#nutRun", "#nutAuto"]) $(id).hidden = live;
  }
  function stopCam() { if (st.cam) { try { st.cam.stop(); } catch { /* already stopped */ } } }
  function clearImage() {
    stopCam();
    if (st.still) { sctx().clearRect(0, 0, still.width, still.height); still.width = still.height = 1; }
    Object.assign(st, { still: false, crop: null, boxes: [], sample: false });
    $("#nutCamWrap").hidden = true; $("#nutHints").innerHTML = ""; cropEl.hidden = true;
    st.gen++;
  }
  async function startCam() {
    clearImage();
    showWrap(true);
    try {
      if (!st.cam) st.cam = W.LQCam.create(video, { facing: "environment", ideal: { width: 1920, height: 1080 }, mirror: false });
      await st.cam.start();
      status(T("nut.st.camon", "กล้องเปิดอยู่ หันไปที่กรอบข้อมูลโภชนาการแล้วกด 'ถ่ายภาพนี้' ภาพไม่ถูกบันทึกหรือส่งออก"), "ok");
    } catch (err) { status(W.LQCam && W.LQCam.errorText ? W.LQCam.errorText(err) : T("nut.st.camerr", "เปิดกล้องไม่ได้ เลือกรูปจากเครื่องแทน"), "err"); }
  }
  /** put a picture into the still canvas (<= 1600 px long side), find the text, crop and read it */
  async function setImage(src, w, h) {
    stopCam();
    st.gen++;
    st.sample = false;
    const k = Math.min(1, 1600 / Math.max(w, h));
    still.width = Math.max(1, Math.round(w * k)); still.height = Math.max(1, Math.round(h * k));
    sctx().drawImage(src, 0, 0, still.width, still.height);
    Object.assign(st, { still: true, crop: null, boxes: [] });
    showWrap(false);
    $("#nutHints").innerHTML = "";
    await autoCrop();
    if (st.crop) await read();
  }
  W.__LQ_NUT.setImage = c => setImage(c, c.width, c.height);

  /**
   * the on-device read of one picture (also used by tools/nut-eval.mjs): text boxes (PP-OCRv5 det) -> each box read in the
   * chosen script -> rows paired along the picture's tilt (LQNut.linesFromParts) -> {lines, text, tilt, ms}
   */
  async function readCanvas(c, script) {
    const t0 = performance.now(), d = await R.detect(c), parts = [];
    for (const b of d.boxes.slice(0, 240)) { const r = await R.recognize(c, b, script); if (r.text.trim()) parts.push({ text: r.text.trim(), conf: r.conf, box: b }); }
    const g = N.linesFromParts(parts);
    return { lines: g.lines, tilt: g.tilt, text: g.lines.map(l => l.text).join("\n"), ms: performance.now() - t0 };
  }
  W.LQNutRun = { readCanvas, parse: (/** @type {any} */ o) => N.parseLabel(o.lines, { tilt: o.tilt }) };
  const mb = b => Math.round(b / 1048576);
  const firstLoad = () => (R && R.loaded().det ? "" : " " + T("nut.st.first", "(ครั้งแรกโหลดโมเดลประมาณ {mb} MB)", { mb: mb(P.downloadBytes(st.script)) }));
  async function busy(fn) {
    if (st.busy) return;
    st.busy = true;
    const btns = /** @type {NodeListOf<HTMLButtonElement>} */ (document.querySelectorAll("#nutCamWrap .nut-row button"));
    for (const b of btns) b.disabled = true;
    try { await fn(); } finally { st.busy = false; for (const b of btns) b.disabled = false; }
  }
  function renderHints(q) {
    const H = HINT();
    $("#nutHints").innerHTML = ((q && q.hints) || []).map(h => `<li>${esc(H[h] || h)}</li>`).join("");
  }
  async function autoCrop() {
    if (!st.still || !R || !P) return;
    const gen = st.gen;
    await busy(async () => {
      status(T("nut.st.find", "กำลังหาตำแหน่งตัวอักษรในเครื่องนี้…") + firstLoad(), "");
      try {
        const d = await R.detect(still);
        if (gen !== st.gen) return;
        st.boxes = d.boxes;
        st.crop = P.cropFromBoxes(d.boxes, still.width, still.height) || { x: 0, y: 0, w: still.width, h: still.height };
        placeCrop();
        const c = st.crop, inCrop = d.boxes.filter(b => b.x0 >= c.x && b.y0 >= c.y && b.x1 <= c.x + c.w && b.y1 <= c.y + c.h)
          .map(b => ({ ...b, x0: b.x0 - c.x, x1: b.x1 - c.x, y0: b.y0 - c.y, y1: b.y1 - c.y }));
        renderHints(R.quality(cropCanvas(), inCrop));
        status(d.boxes.length ? T("nut.st.found", "พบตัวอักษร {n} จุด วางกรอบให้แล้ว ลากบนรูปเพื่อวางกรอบใหม่ได้", { n: d.boxes.length })
          : T("nut.st.none", "ไม่พบตัวอักษร ลากบนรูปเพื่อวางกรอบเอง หรือถ่ายใหม่ให้ชัดขึ้น"), d.boxes.length ? "ok" : "warn");
      } catch {
        st.crop = { x: 0, y: 0, w: still.width, h: still.height }; placeCrop();
        status(T("nut.st.modelerr", "โหลดหรือรันโมเดลไม่ได้ พิมพ์ข้อความจากฉลากในช่องด้านล่างแทน"), "err");
      }
    });
  }
  async function read() {
    if (!st.still) { status(T("nut.st.noimg", "เปิดกล้องแล้วถ่ายภาพ หรือเลือกรูปก่อน"), "warn"); return; }
    if (!R) { status(T("nut.st.modelerr", "โหลดหรือรันโมเดลไม่ได้ พิมพ์ข้อความจากฉลากในช่องด้านล่างแทน"), "err"); return; }
    const gen = st.gen;
    await busy(async () => {
      status(T("nut.st.reading", "กำลังอ่านฉลากในเครื่องนี้…") + firstLoad(), "");
      let o;
      try { o = await readCanvas(cropCanvas(), st.script); } catch { status(T("nut.st.modelerr", "โหลดหรือรันโมเดลไม่ได้ พิมพ์ข้อความจากฉลากในช่องด้านล่างแทน"), "err"); return; }
      if (gen !== st.gen) return;
      st.ms = o.ms; st.tilt = o.tilt;
      $("#nutText").value = o.text;
      parseText(o.text, o.lines, o.tilt);
      status(T("nut.st.done", "อ่านเสร็จใน {s} วินาทีบนเครื่องนี้ พบค่าบนฉลาก {n} ค่า ตรวจกับฉลากจริงทุกครั้ง", { s: (o.ms / 1000).toFixed(1), n: st.parsed.items.length }),
        st.parsed.items.length ? "ok" : "warn");
      if (Math.abs(o.tilt) > N.TILT_LIMIT) renderHints({ hints: ["tilt"] });
    });
  }

  $("#nutCamBtn").addEventListener("click", startCam);
  $("#nutSnap").addEventListener("click", async () => {
    if (!video.videoWidth) { status(T("nut.st.noimg", "เปิดกล้องแล้วถ่ายภาพ หรือเลือกรูปก่อน"), "warn"); return; }
    const c = document.createElement("canvas"); c.width = video.videoWidth; c.height = video.videoHeight;
    /** @type {CanvasRenderingContext2D} */ (c.getContext("2d")).drawImage(video, 0, 0);
    await setImage(c, c.width, c.height);
  });
  $("#nutRun").addEventListener("click", read);
  $("#nutAuto").addEventListener("click", async () => { await autoCrop(); });
  $("#nutClear").addEventListener("click", () => { clearImage(); status("", ""); });
  $("#nutFile").addEventListener("change", async e => {
    const f = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!f) return;
    try {
      const bmp = await createImageBitmap(f);
      await setImage(bmp, bmp.width, bmp.height);
      if (bmp.close) bmp.close();
    } catch { status(T("nut.st.fileerr", "เปิดรูปนี้ไม่ได้ ลองรูป JPEG หรือ PNG"), "err"); }
  });
})();
