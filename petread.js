/* petread.js — page script of petread.html (Pet face reading for dogs and cats, owner order 2026-11-16 part B).
 * Photo or camera on the device -> the on-device detector (YOLOX-Nano, loaded only after the owner picks a photo) pre-fills
 * species and coat -> the owner confirms the traits -> LQPet.compose -> FortuneAI.renderSections (crisis net, grouped layout)
 * -> the share card (lensiq-pet-card.js). Nothing is stored or uploaded; the card is saved locally or shared through the
 * phone's own share sheet. A person in the photo is never read: the reading ignores them and the card pixelates them.
 * Zodiac cards (owner spec 2026-11-19, window.LENSIQ_PET_ZODIAC, off on the live site; LENSIQ_PET_CARD_CLASSIC keeps the 4 colour
 * themes): on each Read the system draws one of 13 templates (lensiq-pet-draw.js, odds from LENSIQ_PET_ZODIAC_ODDS, default b)
 * and records it in the on-device collection (template ids + first-found date only). The draw never touches the reading. The
 * draw module and the art (lensiq-pet-zodiac-art.js) load only when a card is made, never in a crisis or calm session.
 * Test seam (any host): window.__LQPET = {ready, st, useImage(src), cardText(), lastStream}; zodiacDraw(id) on localhost only. Scripted detections only on
 * localhost with ?fakedet (window.__LQ_FAKE_DET("pet")), as in lensiq-detect.js. */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  /** @param {string} s @returns {any} */
  const $ = s => document.querySelector(s);
  const lang = () => (W.LQI18N && (W.LQI18N.lang === "en" || W.LQI18N.lang === "zh") ? W.LQI18N.lang : "th");
  const T = (key, thai, vars) => (W.LQI18N ? W.LQI18N.tf(key, thai, vars) : thai.replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] != null ? vars[k] : m)));
  const KB = W.LQPetKB, P = W.LQPet;
  const isTest = () => /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && new URLSearchParams(location.search).has("fakedet");
  const st = { img: null, det: null, detected: false, detFailed: false, stream: null, res: null, theme: "sunny", size: "post", busy: 0 };
  const api = { ready: false, st, useImage, cardText: () => (st.model ? P.cardText(st.model) : []), model: () => st.model || null, lastStream: null,
    zodiacDraw };
  W.__LQPET = api;

  /* ---------- trait picker (rendered from the KB in the page language) ---------- */
  const GROUPS = [
    ["species", "radio", "pet.g.species", "น้องเป็น"], ["coat", "radio", "pet.g.coat", "สีขน"], ["marks", "checkbox", "pet.g.marks", "จุดเด่น (เลือกได้หลายข้อ)"],
    ["eyes", "radio", "pet.g.eyes", "สีตา"], ["ears", "radio", "pet.g.ears", "หู"], ["face", "radio", "pet.g.face", "รูปหน้า"],
    ["size", "radio", "pet.g.size", "ขนาดตัว"], ["energy", "radio", "pet.g.energy", "นิสัยที่เห็นบ่อย"],
  ];
  const NAME = { species: "petSpecies", coat: "petCoat", marks: "petMark", eyes: "petEyes", ears: "petEars", face: "petFace", size: "petSize", energy: "petEnergy" };
  const labelOf = (g, k) => (g === "species" ? { cat: { th: "แมว", en: "Cat", zh: "猫" }, dog: { th: "หมา", en: "Dog", zh: "狗" } }[k] : KB.labels[g][k])[lang()];
  function renderTraits() {
    const box = $("#petTraits"), keep = values();
    box.textContent = "";
    for (const [g, type, key, thai] of GROUPS) {
      const fs = document.createElement("fieldset"); fs.className = "pet-traits-g";
      const lg = document.createElement("legend"); lg.textContent = T(key, thai); fs.appendChild(lg);
      const grid = document.createElement("div"); grid.className = "fk-opts";
      for (const k of P.TRAITS[g]) {
        const lab = document.createElement("label"); lab.className = "fk-opt";
        const inp = document.createElement("input"); if (type === "checkbox") inp.type = "checkbox"; else inp.type = "radio"; inp.name = NAME[g]; inp.value = k;
        if (g === "marks" ? keep.traits.marks.includes(k) : (g === "species" ? keep.species : keep.traits[g]) === k) inp.checked = true;
        const b = document.createElement("b"); b.textContent = labelOf(g, k);
        lab.appendChild(inp); lab.appendChild(b); grid.appendChild(lab);
      }
      fs.appendChild(grid); box.appendChild(fs);
    }
    syncChips(); markFields();
  }
  /** required / optional markers (owner scope item 2, zodiac mode only): the reading needs only the species (read() checks it);
   *  every other trait group is optional; the photo, name and date fields already say optional in their own labels */
  function markFields() {
    if (!zMode()) return;
    for (const fs of document.querySelectorAll("#petTraits fieldset")) {
      const lg = fs.querySelector("legend"), sp = !!fs.querySelector('input[name="petSpecies"]'), m = document.createElement("span");
      m.className = sp ? "pet-req" : "pet-opt";
      m.textContent = sp ? T("pet.z.req", "(จำเป็น)") : T("pet.z.opt", "(ไม่บังคับ)");
      lg.appendChild(m);
      if (sp) { const g = fs.querySelector(".fk-opts"); g.setAttribute("role", "radiogroup"); g.setAttribute("aria-required", "true"); g.setAttribute("aria-label", lg.textContent); }
    }
  }
  function syncChips() { for (const l of document.querySelectorAll("#petTraits .fk-opt")) l.classList.toggle("on", !!l.querySelector("input:checked")); }
  function checked(name) { const el = $(`input[name="${name}"]:checked`); return el ? el.value : null; }
  function values() {
    const marks = [...document.querySelectorAll('input[name="petMark"]:checked')].map(i => /** @type {HTMLInputElement} */ (i).value);
    const tr = { marks }; for (const g of ["coat", "eyes", "ears", "face", "size", "energy"]) tr[g] = checked(NAME[g]);
    return { species: checked("petSpecies"), traits: tr };
  }
  function setRadio(name, v) { const el = $(`input[name="${name}"][value="${v}"]`); if (el) { el.checked = true; syncChips(); } }

  /* ---------- photo ---------- */
  const MAXPX = 1600;
  function toCanvas(src) {
    const w = src.naturalWidth || src.videoWidth || src.width, h = src.naturalHeight || src.videoHeight || src.height;
    const k = Math.min(1, MAXPX / Math.max(w, h)), c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
    c.getContext("2d").drawImage(src, 0, 0, c.width, c.height);
    return c;
  }
  function loadImg(url) { return new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error("image")); im.src = url; }); }
  /** src: File / Blob / data URL / canvas / image */
  async function useImage(src) {
    let c;
    if (src && src.getContext) c = toCanvas(src);
    else if (typeof src === "string") c = toCanvas(await loadImg(src));
    else if (src && typeof src.size === "number") { const u = URL.createObjectURL(src); try { c = toCanvas(await loadImg(u)); } finally { URL.revokeObjectURL(u); } }
    else if (src && src.naturalWidth) c = toCanvas(src);
    if (!c) return;
    st.img = c; st.det = null; st.detected = false; st.detFailed = false; setHuman(false);
    drawView(); $("#petEmpty").hidden = true; if (api.bar) api.bar();
    await runDetector();
    if (st.res) read(true);
  }
  function drawView() {
    const v = $("#petView"), c = st.img; if (!c) return;
    v.width = c.width; v.height = c.height; v.hidden = false; $("#petVideo").hidden = true;
    const x = v.getContext("2d"); x.drawImage(c, 0, 0);
    const d = st.det; if (!d) return;
    const lw = Math.max(3, Math.round(c.width / 200));
    const box = (b, col, dash) => { x.save(); x.lineWidth = lw; x.strokeStyle = col; if (dash) x.setLineDash([lw * 3, lw * 2]); x.strokeRect(b.x * c.width,
      b.y * c.height, b.w * c.width, b.h * c.height); x.restore(); };
    if (d.pet) box(d.pet, "#e8590c", false);
    for (const p of d.persons) box(p, "#868e96", true);
  }

  /* ---------- detector (loaded on the first photo only) ---------- */
  const withTimeout = (p, ms) => Promise.race([p, new Promise((_, no) => setTimeout(() => no(new Error("timeout")), ms))]);
  async function runDetector() {
    const msg = $("#petDetMsg");
    try {
      let d;
      if (isTest() && typeof W.__LQ_FAKE_DET === "function") d = P.pickDetections(W.__LQ_FAKE_DET("pet", Date.now()) || []);
      else {
        msg.textContent = T("pet.det.loading", "กำลังเตรียมตัวช่วยดูรูปในเครื่อง ครั้งแรกอาจใช้เวลาสักครู่…");
        const model = await withTimeout(P.loadDetector(), 45000);
        d = await withTimeout(P.detect(model, st.img), 20000);
      }
      st.det = d; st.detected = true;
      drawView();
      if (d.pet) {
        setRadio("petSpecies", d.species);
        const guess = P.coatGuess(st.img, d.pet);
        // the hint never overrides a coat the owner picked; a hint from an earlier photo is replaced
        if (guess && (!checked("petCoat") || st.coatAuto)) { setRadio("petCoat", guess); st.coatAuto = true; }
        msg.textContent = d.species === "cat" ? T("pet.det.cat", "พบน้องแมวในรูป เลือกให้แล้ว ตรวจและแก้ลักษณะด้านล่างได้")
          : T("pet.det.dog", "พบน้องหมาในรูป เลือกให้แล้ว ตรวจและแก้ลักษณะด้านล่างได้");
      } else msg.textContent = T("pet.det.none", "ไม่พบน้องหมาหรือน้องแมวในรูปนี้ เลือกลักษณะเองด้านล่างได้เลย");
      setHuman(d.persons.length > 0);
    } catch (e) {
      st.det = null; st.detFailed = true;
      msg.textContent = T("pet.det.fail", "ตัวช่วยดูรูปใช้ไม่ได้บนเครื่องนี้ตอนนี้ เลือกลักษณะเองด้านล่างได้เลย");
    }
  }
  function setHuman(on) {
    st.humanSeen = !!on; const el = $("#petHuman");
    el.hidden = !on; el.textContent = on ? KB.human[lang()] + " " + T("pet.human.card", "บนการ์ด ส่วนที่เป็นคนจะถูกเบลอ") : "";
  }

  /* ---------- camera ---------- */
  // iPhone Safari steps for a refused camera (review round 1, D3). ONE place: swap for the shared helper of the iphone-webkit
  // stream when it lands on main. The first step opens the page menu; the Settings app is the fallback.
  const IOS_CAM_FIRST_TH = "แตะชื่อหน้าด้านบนสุด";
  function camMsg(e) {
    const n = e && e.name;
    if (n === "NotAllowedError" || n === "PermissionDeniedError" || n === "SecurityError")
      return T("pet.cam.denied", "ไม่ได้รับอนุญาตให้ใช้กล้อง ใช้ปุ่ม เลือกรูป แทนได้ หรือเปิดสิทธิ์กล้องบน iPhone ใน Safari: " + IOS_CAM_FIRST_TH +
        " (เปิดเมนูของหน้า) > การตั้งค่าเว็บไซต์ > กล้อง > อนุญาต แล้วโหลดหน้าใหม่ ถ้าไม่เห็นเมนูนี้ ไปที่แอปการตั้งค่า > Safari > กล้อง");
    if (n === "NotFoundError" || n === "OverconstrainedError") return T("pet.cam.none", "ไม่พบกล้องบนเครื่องนี้ ใช้ปุ่ม เลือกรูป แทนได้");
    if (n === "NotReadableError" || n === "AbortError") return T("pet.cam.busy", "กล้องถูกแอปอื่นใช้อยู่ ปิดแอปนั้นแล้วลองใหม่ หรือใช้ปุ่ม เลือกรูป แทน");
    if (!window.isSecureContext || n === "Insecure") return T("pet.cam.https", "กล้องใช้ได้เฉพาะหน้าเว็บที่เปิดด้วย https ใช้ปุ่ม เลือกรูป แทนได้");
    return T("pet.cam.other", "เปิดกล้องไม่สำเร็จ ใช้ปุ่ม เลือกรูป แทนได้");
  }
  /** capture guide (owner scope item 1, zodiac mode only): a pet-head frame over the live picture and a one-line hint */
  function showGuide(on) {
    const v = !!on && zMode();
    $("#petGuide").toggleAttribute("hidden", !v); $("#petGuideHint").hidden = !v; // an <svg> has no .hidden property
  }
  async function camOn() {
    const m = $("#petCamMsg");
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw Object.assign(new Error("insecure"), { name: "Insecure" });
      camOff(true);
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
      st.stream = s; api.lastStream = s;
      const v = $("#petVideo"); v.srcObject = s; v.hidden = false; $("#petView").hidden = true; $("#petEmpty").hidden = true;
      try { await v.play(); } catch (e) { /* autoplay muted */ }
      $("#petSnap").disabled = false; $("#petCamOff").disabled = false; showGuide(true);
      m.textContent = T("pet.cam.on", "กล้องเปิดอยู่ จัดหน้าน้องให้อยู่กลางภาพ แล้วกด ถ่ายรูป");
    } catch (e) { m.textContent = camMsg(e); }
  }
  function camOff(quiet) {
    const v = $("#petVideo");
    if (st.stream) for (const t of st.stream.getTracks()) t.stop();
    st.stream = null; v.srcObject = null; v.hidden = true; showGuide(false);
    $("#petSnap").disabled = true; $("#petCamOff").disabled = true;
    if (st.img) $("#petView").hidden = false; else $("#petEmpty").hidden = false;
    if (!quiet) $("#petCamMsg").textContent = T("pet.cam.off", "ปิดกล้องแล้ว");
  }
  function snap() {
    const v = $("#petVideo"); if (!v.videoWidth) return;
    const c = toCanvas(v); camOff(true);
    $("#petCamMsg").textContent = T("pet.cam.snapped", "ถ่ายรูปแล้ว ปิดกล้องให้แล้ว");
    useImage(c);
  }

  /* ---------- crisis v3 (owner decision 2026-11-17) ----------
   * The crisis net (fortune-crisis-net.js, the one pattern source, via LQFortuneCrisis) runs on every field of the page before any
   * check. With the crisis flag set, or the page calm (crisis session, distress words), the reading still comes, gently: the typed
   * name is left out (nothing typed is shown back), no lucky part, no share card (data-lq-remedy, hidden by styles.css) and
   * FortuneAI ends the reading with the one closing line (tel:1323 + counselling link). Nothing says the person was flagged. */
  const CR = () => W.LQFortuneCrisis;
  const crisisOn = () => { const c = CR(); return !!(c && c.active && c.active(document)) || document.documentElement.getAttribute("data-lq-crisis") === "1"; };
  const calm = () => { const c = CR(); return crisisOn() || !!(c && ((c.calmOn && c.calmOn(document)) || (c.distress && c.distress(document)))); };
  const shareOk = () => { const c = CR(); return !calm() && (!c || !c.allow || c.allow("share", document)); };
  function crisisFirst() {
    const c = CR(), FA = W.FortuneAI;
    const txt = c && c.fields ? c.fields(document) : $("#petName").value;
    const hit = c && c.check ? c.check(txt) : !!(FA && FA.crisis && FA.crisis.check && FA.crisis.check(txt));
    if (hit && !crisisOn()) { if (c && c.setActive) c.setActive(document); else document.documentElement.setAttribute("data-lq-crisis", "1"); }
  }

  /* ---------- reading ---------- */
  function input() {
    const v = values();
    return { species: v.species || "cat", name: $("#petName").value, traits: v.traits, birth: $("#petBirth").value || null,
      owner: $("#petOwnerBirth").value ? { birth: $("#petOwnerBirth").value } : null, humanSeen: !!st.humanSeen };
  }
  function read(quiet) {
    const FA = window.FortuneAI, box = $("#petReading");
    crisisFirst(); // the net before any format check
    if (!checked("petSpecies")) { $("#petMsg").textContent = T("pet.err.species", "เลือกก่อนว่าน้องเป็นแมวหรือหมา"); return; }
    $("#petMsg").textContent = "";
    const gentle = calm(), inp = input();
    if (gentle) inp.name = ""; // v3: nothing typed is shown back
    const res = P.compose(inp, { lang: lang() });
    if (gentle) { res.sections = res.sections.filter(s => s.id !== "lucky"); res.typedName = ""; res.name = ""; } // v3: no lucky part
    st.res = res;
    $("#petResult").hidden = false;
    if (FA && FA.renderSections) FA.renderSections(box, res, { aiBadge: false, straightControl: false });
    else { box.textContent = ""; for (const s of res.sections) { const h = document.createElement("h3"); h.textContent = s.title; box.appendChild(h);
      for (const p of s.paragraphs) { const e = document.createElement("p"); e.textContent = p; box.appendChild(e); } } }
    afterRender();
    if (!quiet) { const h = $("#petResH"); try { h.focus({ preventScroll: false }); } catch (e) { /* old engine */ } }
  }
  // the card only next to a real reading on a normal page: never in the crisis / calm state (v3) or next to a soft step
  function afterRender() {
    const ok = !!document.querySelector("#petReading .fa-section") && !document.querySelector("#petReading .fa-support, #petReading .fa-soft") && shareOk();
    $("#petCardSec").hidden = !ok;
    if (ok) drawCard(); else st.model = null;
  }

  /* ---------- the card ---------- */
  let qrLib = null;
  // the QR encodes the site address: only with LENSIQ_CARD_SHOW_ADDRESS on (owner change 2026-11-20)
  const addrOn = () => W.LENSIQ_CARD_SHOW_ADDRESS === true;
  function qrMatrix() {
    const q = W.qrcode; if (!addrOn() || typeof q !== "function") return null;
    const m = q(0, "M"); m.addData(P.LINK); m.make();
    return { n: m.getModuleCount(), dark: (r, c) => m.isDark(r, c) };
  }
  function loadQr() {
    if (W.qrcode) return Promise.resolve();
    if (!qrLib) qrLib = new Promise((ok, no) => {
      const s = document.createElement("script"); s.src = "vendor/qrcode-generator/qrcode.js"; s.onload = () => ok(); s.onerror = () => { qrLib = null; no(new Error("qr")); };
      document.head.appendChild(s);
    });
    return qrLib;
  }
  /* ---------- zodiac cards ---------- */
  const zMode = () => W.LENSIQ_PET_ZODIAC === true && W.LENSIQ_PET_CARD_CLASSIC !== true;
  const zReady = () => !!(W.LQPetDraw && W.LQPetZodiacArt);
  let zLib = null;
  function loadScript(src) {
    return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = () => ok(); s.onerror = () => no(new Error(src)); document.head.appendChild(s); });
  }
  /** the draw module and the template art, on the first zodiac card only */
  function loadZodiac() {
    if (zReady()) return Promise.resolve();
    if (!zLib) zLib = loadScript("lensiq-pet-draw.js?v=2").then(() => loadScript("lensiq-pet-zodiac-art.js?v=1")).catch(e => { zLib = null; throw e; });
    return zLib;
  }
  const store = () => { try { return W.localStorage; } catch (e) { return null; } };
  /** the system picks the card: a new draw for every Read and every "draw again"; free, nothing counts draws */
  function zDraw() {
    const D = W.LQPetDraw, cfg = D.config(W.LENSIQ_PET_ZODIAC_ODDS), ctx = { today: D.today() };
    const r = D.draw(cfg, ctx);
    D.recordFind(store(), r.id, ctx.today);
    st.z = { id: r.id, rule: r.rule || "", cfg, ctx, seq: (st.z ? st.z.seq : 0) + 1 };
    st.zNeed = false;
  }
  /** test seam (localhost only): draw a given template, not recorded in the collection */
  function zodiacDraw(id) {
    if (!/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return Promise.resolve(false);
    return loadZodiac().then(() => {
      const D = W.LQPetDraw; if (D.TEMPLATES.indexOf(id) < 0) return false;
      const cfg = D.config(W.LENSIQ_PET_ZODIAC_ODDS);
      st.z = { id, rule: "", cfg, ctx: { today: D.today() }, seq: (st.z ? st.z.seq : 0) + 1 }; st.zNeed = false;
      drawCard(); return true;
    });
  }
  const fmtDay = d => { try { return new Date(d + "T00:00:00").toLocaleDateString({ th: "th-TH", en: "en-GB", zh: "zh-CN" }[lang()], { day: "numeric", month: "short", year: "numeric" }); } catch (e) { return d; } };
  function renderZ() {
    const D = W.LQPetDraw, on = zMode() && zReady() && !!st.z;
    $("#petZ").hidden = !on; $("#petZColWrap").hidden = !on; $("#petThemes").hidden = on;
    if (!on) return;
    const l = lang(), A = W.LQPetZodiacArt;
    $("#petZGot").textContent = T("pet.z.got", "การ์ดที่ได้: {name}", { name: D.label(st.z.id, l) });
    $("#petZOdds").textContent = D.oddsText(st.z.cfg, st.z.ctx, l).join("\n");
    const found = D.loadCollection(store()), n = Object.keys(found).length;
    $("#petZCount").textContent = T("pet.z.count", "สะสมแล้ว {n}/13 ใบ", { n });
    const ul = $("#petZCol"); ul.textContent = "";
    for (const id of D.TEMPLATES) {
      const li = document.createElement("li"), cv = document.createElement("canvas"), b = document.createElement("b"), sm = document.createElement("span");
      li.className = "pet-zslot"; li.dataset.id = id; li.dataset.state = found[id] ? "found" : "missing";
      if (id === "secret") li.dataset.secret = "1";
      cv.setAttribute("aria-hidden", "true");
      A.drawSlot(cv, id, { found: !!found[id] });
      b.textContent = found[id] || id !== "secret" ? D.short(id, l) : T("pet.z.secretSlot", "ช่องการ์ด Secret");
      sm.textContent = found[id] ? T("pet.z.found", "ได้เมื่อ {d}", { d: fmtDay(found[id]) }) : T("pet.z.missing", "ยังไม่พบ");
      li.append(cv, b, sm); ul.appendChild(li);
    }
  }

  function drawCard() {
    if (!st.res) return;
    const zm = zMode();
    if (zm && !zReady() && !st.zFail) {
      loadZodiac().then(() => { if (st.res && !$("#petCardSec").hidden) drawCard(); },
        () => { st.zFail = true; $("#petCardNote").textContent = T("pet.z.loadFail", "โหลดลายการ์ดไม่สำเร็จ ใช้การ์ดแบบเดิมแทน"); drawCard(); });
      return;
    }
    const zOn = zm && zReady();
    if (zOn && (st.zNeed || !st.z)) zDraw();
    const want = $("#petPhotoOn").checked, on = want && !!st.img, qrOn = addrOn() && $("#petQrOn").checked;
    if (qrOn && !W.qrcode) { loadQr().then(drawCard, () => { $("#petQrOn").checked = false; drawCard(); }); }
    st.model = P.cardModel(st.res, { photo: on, theme: st.theme, size: st.size, template: zOn ? st.z.id : undefined });
    const cv = $("#petCard");
    // privacy (review round 1, D1): the photo only after the detector ran; every person box it found, down to PRIVACY_MIN
    const detOk = !!st.det && st.detected && !st.detFailed;
    const opts = { theme: st.theme, size: st.size, photo: on ? st.img : null, detOk,
      pet: st.det && st.det.pet, persons: (st.det && (st.det.blur || st.det.persons)) || [], qr: qrOn ? qrMatrix() : null };
    const label = zOn ? W.LQPetDraw.label(st.z.id, lang()) : "";
    const info = zOn ? W.LQPetZodiacArt.drawCard(cv, st.model, Object.assign(opts, { template: st.z.id, label })) : W.LQPetCard.draw(cv, st.model, opts);
    cv.dataset.template = zOn ? st.z.id : ""; cv.dataset.label = label; cv.dataset.rule = zOn ? st.z.rule : "";
    cv.dataset.drawSeq = zOn ? String(st.z.seq) : "";
    renderZ();
    cv.dataset.drawn = "1"; cv.dataset.photo = info.photo ? "1" : "0"; cv.dataset.blur = String(info.blur || 0); cv.dataset.theme = info.theme;
    cv.dataset.size = info.size; cv.dataset.qr = info.qr ? "1" : "0"; cv.dataset.frame = info.frame.join(",");
    const note = $("#petCardNote");
    if (want && !st.img) note.textContent = T("pet.card.noimg", "ยังไม่มีรูปน้อง การ์ดใช้ภาพวาดแทน");
    else if (want && info.refused === "nodet")
      note.textContent = T("pet.card.nodet", "ตัวช่วยดูรูปยังไม่ได้ตรวจรูปนี้ว่ามีคนอยู่หรือไม่ จึงไม่ใส่รูปในการ์ด ใช้ภาพวาดแทน");
    else if (want && info.refused) note.textContent = T("pet.card.refused", "มีคนอยู่ติดกับน้องในรูป จึงไม่ใส่รูปในการ์ด ใช้ภาพวาดแทน ลองใช้รูปที่มีแต่น้อง");
    else if (info.blur) note.textContent = T("pet.card.blur", "พบคนในรูป ส่วนที่เป็นคนถูกเบลอบนการ์ดแล้ว ถ้ายังเห็นหน้าคน อย่าใส่รูปในการ์ด");
    else if (!st.zFail || !zm) note.textContent = "";
  }
  function cardBlob() { return new Promise(ok => $("#petCard").toBlob(b => ok(b), "image/png")); }
  async function save() {
    const b = await cardBlob(); if (!b) return;
    const u = URL.createObjectURL(b), a = document.createElement("a");
    a.href = u; a.download = "lensiq-pet-card.png"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(u), 4000);
  }
  async function share() {
    const b = await cardBlob(); if (!b) return;
    const f = typeof File === "function" ? new File([b], "lensiq-pet-card.png", { type: "image/png" }) : null;
    try {
      if (f && navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share(addrOn() ? { files: [f], text: P.LINK } : { files: [f] }); return; }
    } catch (e) { if (e && e.name === "AbortError") return; }
    save();
  }

  /* ---------- wiring ---------- */
  function init() {
    // the card draws with the page font: load its weights now, so drawing a card never fetches anything later
    try { const fam = getComputedStyle(document.body).fontFamily; if (document.fonts && document.fonts.load) for (const w of [500, 700,
      800]) document.fonts.load(`${w} 30px ${fam}`, "กขคabc猫狗").catch(() => {}); } catch (e) { /* no font API */ }
    renderTraits();
    $("#petTraits").addEventListener("change", e => { syncChips(); if (e.target && e.target.name === "petCoat") st.coatAuto = false; });
    $("#petFile").addEventListener("change", e => { const f = e.target.files && e.target.files[0]; if (f) { camOff(true); useImage(f); } e.target.value = ""; });
    $("#petCamOn").addEventListener("click", camOn);
    $("#petCamOff").addEventListener("click", () => camOff(false));
    $("#petSnap").addEventListener("click", snap);
    $("#petForm").addEventListener("submit", e => { e.preventDefault(); st.zNeed = true; read(false); });
    $("#petZRedraw").addEventListener("click", () => { st.zNeed = true; drawCard(); });
    $("#petPhotoOn").addEventListener("change", drawCard);
    $("#petQrOn").addEventListener("change", drawCard);
    if (!addrOn()) { const q = $("#petQrOn"); q.checked = false; const lb = q.closest("label"); if (lb) lb.hidden = true; }
    for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".pet-size"))) b.addEventListener("click", () => {
      st.size = b.dataset.size;
      for (const o of document.querySelectorAll(".pet-size")) o.setAttribute("aria-pressed", String(o === b));
      drawCard();
    });
    // D2: once a photo is set (or a species picked) a Read bar stays at the bottom of the screen until the form's own Read
    // button or the reading is in view
    const seen = { form: false, result: false };
    const bar = () => {
      const show = !!(st.img || checked("petSpecies")) && !seen.form && !seen.result;
      $("#petReadBarWrap").hidden = !show; document.body.classList.toggle("pet-bar-on", show);
    };
    api.bar = bar;
    if (typeof IntersectionObserver === "function") {
      const io = new IntersectionObserver(es => { for (const e of es) seen[e.target.id === "petRead" ? "form" : "result"] = e.isIntersecting; bar(); });
      io.observe($("#petRead")); io.observe($("#petResult"));
    }
    $("#petTraits").addEventListener("change", bar);
    $("#petReadBar").addEventListener("click", () => { st.zNeed = true; read(false); bar(); });
    for (const b of /** @type {NodeListOf<HTMLElement>} */ (document.querySelectorAll(".pet-theme[data-theme]"))) b.addEventListener("click", () => {
      st.theme = b.dataset.theme;
      for (const o of document.querySelectorAll(".pet-theme[data-theme]")) o.setAttribute("aria-pressed", String(o === b));
      drawCard();
    });
    $("#petCardSave").addEventListener("click", save);
    $("#petCardShare").addEventListener("click", share);
    // a reading that the crisis net's gentle step later lets through: show the card then
    new MutationObserver(() => { if (st.res) { const want = !!document.querySelector("#petReading .fa-section")
      && !document.querySelector("#petReading .fa-support, #petReading .fa-soft") && shareOk();
      if (want === $("#petCardSec").hidden) afterRender(); } })
      .observe($("#petReading"), { childList: true });
    window.addEventListener("lq-lang", () => { renderTraits(); setHuman(st.humanSeen); if (st.res) read(true); });
    // v3: the crisis flag set later (another field, the report dialog): the same reading again, gently, closing line last
    window.addEventListener("lq-crisis", () => { if (st.res && !st.redraw) { st.redraw = true; try { read(true); } finally { st.redraw = false; } } });
    window.addEventListener("pagehide", () => camOff(true));
    document.addEventListener("visibilitychange", () => { if (document.hidden && st.stream) camOff(true); });
    api.ready = true;
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
