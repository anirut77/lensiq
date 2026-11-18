/* style.js — Style S4 page: daily outfit and hair colour match (docs/STYLE-DESIGN.md §1.4, §3.4). OFF by default:
 * lensiq-config.js LENSIQ_STYLE must be exactly true (owner approval), otherwise this file stops at its first statement and
 * the page keeps showing the static "not available yet" notice; nothing else is loaded.
 *
 * Colours of clothes only: the user picks a photo of clothes laid flat (no person needed) or adds a colour by hand. The photo
 * is decoded in memory, its colours are measured (LQOutfit.extract) and the pixels are dropped at once: no picture is shown,
 * kept, uploaded or stored. Nothing is written to the device (the 18+ confirmation lives in memory only). The only number
 * is the colour harmony between colours (LQOutfit.harmony). The lucky-colour link is optional and reuses LQLucky unchanged.
 * Test hook: window.__styleS4 = {state}.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  // The off switch comes first: while it is off nothing below runs.
  if (W.LENSIQ_STYLE !== true) return;

  const $ = (/** @type {string} */ s) => /** @type {any} */ (document.querySelector(s));
  const fill = (/** @type {string} */ s, /** @type {any} */ v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? String(v[k]) : m));
  /** @param {string} k @param {string} th @param {any} [v] */
  const T = (k, th, v) => (W.LQI18N ? W.LQI18N.tf(k, th, v) : fill(th, v));
  const MAX_ITEMS = 8, MAX_SIDE = 640;
  const state = { ready: false, photos: 0, items: /** @type {any[]} */ ([]), harmony: /** @type {any} */ (null), lucky: /** @type {any} */ (null),
    hairMatch: /** @type {any} */ (null), suggestions: /** @type {any[]} */ ([]), adult: false, hair: "", luckyOn: false, error: "", notice: "", busy: false };
  W.__styleS4 = { state };
  /** @type {any} */ let C = null, O = null, L = null;

  const FAM = () => ({ red: T("sty.fam.red", "แดง"), yellow: T("sty.fam.yellow", "เหลือง"), cream: T("sty.fam.cream", "ครีม"), pink: T("sty.fam.pink", "ชมพู"),
    green: T("sty.fam.green", "เขียว"), orange: T("sty.fam.orange", "ส้ม"), sky: T("sty.fam.sky", "ฟ้า"), navy: T("sty.fam.navy", "น้ำเงิน"),
    purple: T("sty.fam.purple", "ม่วง"), black: T("sty.fam.black", "ดำ"), grey: T("sty.fam.grey", "เทา"), white: T("sty.fam.white", "ขาว"), brown: T("sty.fam.brown", "น้ำตาล") });
  const NEUTRAL_NAMES = () => [T("sty.neu.0", "ขาวนวล"), T("sty.neu.1", "เบจ"), T("sty.neu.2", "เทาอ่อน"), T("sty.neu.3", "เทา"), T("sty.neu.4", "เทาเข้ม"), T("sty.neu.5", "ดำ")];
  const DAYS = () => [T("sty.day.0", "วันอาทิตย์"), T("sty.day.1", "วันจันทร์"), T("sty.day.2", "วันอังคาร"), T("sty.day.3", "วันพุธ"), T("sty.day.4", "วันพฤหัสบดี"),
    T("sty.day.5", "วันศุกร์"), T("sty.day.6", "วันเสาร์")];
  const GOALS = () => ({ work: T("sty.goal.work", "การงาน"), money: T("sty.goal.money", "โชคลาภ"), love: T("sty.goal.love", "ความรัก"), support: T("sty.goal.support", "ผู้ใหญ่อุปถัมภ์") });
  const AREAS = () => ({ boriwan: T("sty.area.boriwan", "ทีมงานและคนรอบข้าง"), ayu: T("sty.area.ayu", "อารมณ์ดี สดชื่น"), dech: T("sty.area.dech", "การงาน ความน่าเชื่อถือ"),
    sri: T("sty.area.sri", "โชคลาภ เงินทอง เสน่ห์"), mula: T("sty.area.mula", "ความมั่นคง หลักฐาน"),
    utsaha: T("sty.area.utsaha", "ความขยันและพลังทำงาน"), montri: T("sty.area.montri", "ผู้ใหญ่เอ็นดู มีคนสนับสนุน") });
  const BAND = () => ({ high: T("sty.band.high", "สีเข้ากันดี"), mid: T("sty.band.mid", "สีพอเข้ากัน"), low: T("sty.band.low", "สีตัดกันแรง") });
  const REASON = () => ({
    tonal: T("sty.why.tonal", "สีโทนเดียวกันต่างความสว่าง ดูกลมกลืน"),
    analogous: T("sty.why.analogous", "สีใกล้เคียงกันบนวงล้อสี ดูต่อเนื่อง"),
    neutralAccent: T("sty.why.neutralAccent", "สีกลางกับสีเด่นหนึ่งสี เป็นการจับคู่ที่ใช้ง่าย"),
    neutrals: T("sty.why.neutrals", "สีกลางทั้งชุด เรียบและเข้ากันง่าย"),
    lightContrast: T("sty.why.lightContrast", "ความสว่างต่างกันชัด ช่วยให้แต่ละชิ้นเด่นขึ้น"),
    strongCompete: T("sty.why.strongCompete", "สีสดสองสีต่างโทนที่ความสว่างใกล้กัน แย่งความสนใจกัน"),
    lowContrast: T("sty.why.lowContrast", "ความสว่างของทุกชิ้นใกล้กันมาก ชุดอาจดูแบน")
  });
  const familyOf = (/** @type {any} */ it) => L.classify(it.rgb[0], it.rgb[1], it.rgb[2]);
  const famName = (/** @type {string} */ f) => /** @type {any} */ (FAM())[f] || f;
  const neutralName = (/** @type {string} */ hex) => { const i = O.NEUTRALS.indexOf(hex); return i >= 0 ? NEUTRAL_NAMES()[i] : hex; };

  function loadScript(/** @type {string} */ src) {
    return new Promise((res, rej) => {
      const s = document.createElement("script");
      s.src = src; s.async = false;
      s.onload = () => res(undefined); s.onerror = () => rej(new Error("load " + src));
      document.head.appendChild(s);
    });
  }
  function el(/** @type {string} */ tag, /** @type {string} */ cls, /** @type {string} */ text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function msg(/** @type {string} */ t) { $("#styMsg").textContent = t || ""; }

  /* ---------- photo -> colours (in memory only) ---------- */
  async function decode(/** @type {File} */ file) {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * k)), h = Math.max(1, Math.round(bmp.height * k));
    const cv = typeof OffscreenCanvas !== "undefined" ? new OffscreenCanvas(w, h) : Object.assign(document.createElement("canvas"), { width: w, height: h });
    const cx = /** @type {any} */ (cv).getContext("2d", { willReadFrequently: true });
    cx.drawImage(bmp, 0, 0, w, h);
    const img = cx.getImageData(0, 0, w, h);
    bmp.close();
    /** @type {any} */ (cv).width = 0; /** @type {any} */ (cv).height = 0;
    return img;
  }
  async function addFiles(/** @type {FileList} */ files) {
    state.error = ""; state.notice = "";
    for (const f of Array.from(files || [])) {
      if (state.items.length >= MAX_ITEMS) { state.notice = "max"; msg(T("sty.msg.max", "เพิ่มได้สูงสุด 8 สี ลบบางสีก่อนแล้วลองใหม่")); break; }
      state.busy = true; msg(T("sty.msg.busy", "กำลังอ่านสีจากรูป…"));
      try {
        let img = await decode(f), gains, card = null, cardNote = "";
        if ($("#styCard").checked) {
          const found = C.detectCard(img);
          const cs = found ? C.cardStats(img, found.box, { target: 0.9 }) : null;
          if (cs && cs.ok) { gains = cs.gains; card = found.box; } else cardNote = T("sty.msg.nocard", "ไม่พบการ์ดสีขาวในภาพ จึงไม่ได้แก้สีของแสง");
        }
        const r = O.extract(img, { gains, card, whole: $("#styWhole").checked });
        img = null;
        if (r.status !== "ok" || !r.colours.length) {
          state.notice = "empty";
          msg(T("sty.msg.empty", "ไม่พบสีเสื้อผ้าที่ต่างจากพื้นหลัง ถ้าเสื้อผ้าเต็มภาพ ให้เลือก \"เสื้อผ้าเต็มภาพ\" แล้วลองใหม่"));
        } else {
          const n = r.colours.length;
          for (const c of r.colours.slice(0, MAX_ITEMS - state.items.length)) state.items.push({ lab: c.lab, rgb: c.rgb, hex: c.hex, w: c.share * n, src: "photo" });
          state.photos++;
          msg(cardNote || T("sty.msg.done", "อ่านสีจากรูปแล้ว รูปไม่ได้ถูกเก็บไว้"));
        }
      } catch (e) {
        state.error = "decode"; msg(T("sty.msg.error", "เปิดรูปนี้ไม่ได้ ลองรูปอื่น"));
      } finally { state.busy = false; }
    }
    update();
  }
  function addHex(/** @type {string} */ hex) {
    if (state.items.length >= MAX_ITEMS) { msg(T("sty.msg.max", "เพิ่มได้สูงสุด 8 สี ลบบางสีก่อนแล้วลองใหม่")); return; }
    const rgb = C.hexToRgb(hex);
    state.items.push({ lab: C.rgbToLab(rgb), rgb, hex: C.rgbToHex(rgb), w: 1, src: "hand" });
    msg(""); update();
  }

  /* ---------- results ---------- */
  function today() { const v = $("#styDay").value; return v === "auto" ? L.dayPlanet(new Date()) : +v; }
  function update() {
    const tot = state.items.reduce((s, it) => s + it.w, 0) || 1;
    state.items.forEach(it => { it.share = it.w / tot; });
    state.harmony = state.items.length >= 2 ? O.harmony(state.items) : null;
    state.lucky = state.luckyOn && state.items.length ? O.lucky(state.items, today(), $("#styGoal").value, L) : null;
    const hair = state.hair ? O.HAIR.find((/** @type {any} */ h) => h.id === state.hair) : null;
    state.hairMatch = hair && state.items.length ? O.hairMatch(C.hexToLab(hair.hex), state.items) : null;
    state.suggestions = state.adult && state.items.length ? O.suggest({ items: state.items, harmony: state.harmony || O.harmony(state.items),
      lucky: state.lucky, hair: hair ? C.hexToLab(hair.hex) : null }) : [];
    render();
  }
  function render() {
    const chips = $("#styChips"), F = FAM();
    chips.textContent = "";
    state.items.forEach((it, i) => {
      const row = el("div", "sty-chip", null); row.setAttribute("data-chip", String(i));
      const sw = el("i", "", null); sw.style.background = it.hex; sw.setAttribute("aria-hidden", "true");
      const fam = /** @type {any} */ (F)[familyOf(it)] || "";
      const txt = el("span", "", `${fam} · ${it.hex} · ${Math.round(it.share * 100)}%`);
      const rm = el("button", "btn ghost sm", "×"); rm.type = "button"; rm.setAttribute("data-remove", String(i)); rm.setAttribute("aria-label", T("sty.chip.remove", "ลบสีนี้"));
      rm.addEventListener("click", () => { state.items.splice(i, 1); update(); });
      row.append(sw, txt, rm); chips.appendChild(row);
    });
    const h = state.harmony, res = $("#styResult");
    res.hidden = !state.items.length;
    if (state.items.length === 1) { $("#styScore").textContent = T("sty.res.one", "เพิ่มอีกอย่างน้อยหนึ่งสีเพื่อดูคะแนน"); $("#styReasons").textContent = ""; }
    if (h) {
      $("#styScore").textContent = fill(T("sty.res.score", "คะแนน {score}/100 · {band}"), { score: h.score, band: /** @type {any} */ (BAND())[h.band] });
      const ul = $("#styReasons"), R = REASON(); ul.textContent = "";
      for (const k of h.reasons) { const li = el("li", "", /** @type {any} */ (R)[k]); li.dataset.reason = k; ul.appendChild(li); }
    }
    $("#styLucky").hidden = !state.items.length;
    $("#styLuckyCtl").hidden = !state.luckyOn;
    renderLucky();
    $("#styLook").hidden = !state.items.length;
    $("#styLookBody").hidden = !state.adult;
    const hm = state.hairMatch;
    $("#styHairScore").textContent = hm ? fill(T("sty.hair.score", "ความกลมกลืนของสีผมกับสีชุด {score}/100 · {band}"), { score: hm.score, band: /** @type {any} */ (BAND())[hm.band] }) : "";
    renderSuggest();
  }
  function renderLucky() {
    const out = $("#styLuckyOut"), lk = state.lucky;
    out.hidden = !lk; out.textContent = "";
    if (!lk) return;
    const day = DAYS()[today()], goal = /** @type {any} */ (GOALS())[lk.rec.goal], fam = famName(lk.family);
    let line;
    if (lk.level === 3) line = fill(T("sty.lucky.l3", "สีหลักของชุด ({fam}) ตรงกับสีเสริม{goal}ของ{day}"), { fam, goal, day });
    else if (lk.level === 2) line = fill(T("sty.lucky.l2", "สีหลักของชุด ({fam}) เป็นสีเสริม{goal}ลำดับรองของ{day}"), { fam, goal, day });
    else if (lk.level === 1) line = fill(T("sty.lucky.l1", "สีหลักของชุด ({fam}) ช่วยเสริมด้าน{area}ของ{day}"), { fam, day, area: /** @type {any} */ (AREAS())[lk.bhumi] || "" });
    else line = fill(T("sty.lucky.l0", "สีหลักของชุด ({fam}) เป็นสีพื้นที่ใช้ได้ทุกวัน เพิ่มของชิ้นเล็กสี{accent}เพื่อเสริม{goal}ของ{day}"),
      { fam, goal, day, accent: lk.accent.map(famName).join(" / ") });
    out.appendChild(el("p", "", line));
    for (const s of lk.support || []) out.appendChild(el("p", "", fill(T("sty.lucky.support", "สี{fam}ในชุดก็ช่วยเสริม{goal}ด้วย"), { fam: famName(s.family), goal })));
    out.appendChild(el("p", "sty-belief", T("sty.lucky.belief", "ตามความเชื่อ โปรดใช้วิจารณญาณ")));
  }
  function renderSuggest() {
    const ul = $("#stySuggest"); ul.textContent = "";
    for (const s of state.suggestions) {
      let t = "";
      if (s.key === "keep") t = T("sty.sug.keep", "สีของชุดนี้เข้ากันดีแล้ว ใส่ได้เลย");
      else if (s.key === "swapNeutral") t = fill(T("sty.sug.swapNeutral", "ลองเปลี่ยนชิ้นสี{fam}เป็นสีกลาง เช่น{neutral} เพื่อลดการแย่งความสนใจของสีสด"),
        { fam: famName(familyOf(state.items[s.i])), neutral: neutralName(s.hex) });
      else if (s.key === "addContrast") t = fill(T("sty.sug.addContrast", "ลองเพิ่มชิ้นที่สว่างหรือเข้มกว่า เช่น{neutral} ให้ชุดมีมิติ"), { neutral: neutralName(s.hex) });
      else if (s.key === "addAccentToday") t = fill(T("sty.sug.addAccentToday", "เพิ่มของชิ้นเล็กสี{fam} เช่น ผ้าพันคอ กระเป๋า หรือกิ๊บติดผม เพื่อเสริม{goal}ของ{day} (ตามความเชื่อ โปรดใช้วิจารณญาณ)"),
        { fam: famName(s.family), goal: /** @type {any} */ (GOALS())[state.lucky.rec.goal], day: DAYS()[today()] });
      else if (s.key === "hairAccessory") t = fill(T("sty.sug.hairAccessory", "กิ๊บหรือที่คาดผมสี{fam} ช่วยเชื่อมสีผมกับชุด"), { fam: famName(familyOf(state.items[s.i])) });
      if (!t) continue;
      const li = el("li", "", null); li.dataset.key = s.key;
      if (s.hex) { const sw = el("i", "sty-sw", null); sw.style.background = s.hex; sw.setAttribute("aria-hidden", "true"); li.appendChild(sw); }
      li.appendChild(document.createTextNode(t)); ul.appendChild(li);
    }
  }

  /* ---------- wiring ---------- */
  function wire() {
    $("#styFile").addEventListener("change", (/** @type {any} */ e) => { const fs = e.target.files; addFiles(fs).finally(() => { e.target.value = ""; }); });
    $("#styPickAdd").addEventListener("click", () => addHex($("#styPick").value));
    $("#styClear").addEventListener("click", () => { state.items = []; state.photos = 0; state.notice = ""; msg(""); update(); });
    $("#styLuckyOn").addEventListener("change", (/** @type {any} */ e) => { state.luckyOn = !!e.target.checked; update(); });
    $("#styDay").addEventListener("change", update);
    $("#styGoal").addEventListener("change", update);
    $("#styAdult").addEventListener("change", (/** @type {any} */ e) => { state.adult = !!e.target.checked; if (!state.adult) { state.hair = ""; $("#styHair").value = ""; } update(); });
    $("#styHair").addEventListener("change", (/** @type {any} */ e) => { state.hair = e.target.value; update(); });
    W.addEventListener("lq-lang", () => { if (state.ready) render(); });
  }

  async function boot() {
    $("#styOff").hidden = true;
    $("#styApp").hidden = false;
    try {
      await loadScript("lensiq-colour.js?v=1");
      await loadScript("lensiq-luckycolor.js?v=1");
      await loadScript("lensiq-outfit.js?v=1");
      C = W.LQColour; O = W.LQOutfit; L = W.LQLucky;
      $("#styAdult").checked = false; $("#styLuckyOn").checked = false;
      wire(); state.ready = true; render();
    } catch (e) {
      state.error = "load"; msg(T("sty.msg.load", "โหลดหน้านี้ไม่สำเร็จ ลองเปิดใหม่"));
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot); else boot();
})();
