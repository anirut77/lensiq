/* omr.js — omr.html: multiple-choice answer-sheet grader. Exams (question count, choices, student-number digits, key),
 * printable A4 sheet, phone camera / photo scan read by LQOMR (lensiq-omr.js: marker search, perspective correction,
 * bubble darkness — plain canvas maths, no AI, no faces), review + manual correction of any bubble, scores, item
 * analysis, CSV export. Camera frames and photos are read in memory and dropped; the straightened sheet picture for the
 * review screen lives in memory only (Map, gone when the page closes). localStorage "lqomr-v1" keeps exams, keys,
 * the marks read from each sheet, student numbers, optional names typed by the teacher, and scores. Nothing is sent.
 * Test hook: window.__LQOMRP.
 */
(function () {
  "use strict";
  const W = /** @type {any} */ (window);
  const O = W.LQOMR;
  const $ = id => document.getElementById(id);
  const T = (key, thai, vars) => W.LQI18N ? W.LQI18N.tf(key, thai, vars) : String(thai).replace(/\{(\w+)\}/g, (m, k) => vars && vars[k] != null ? vars[k] : m);
  const LS = (() => { try { return window.localStorage; } catch { return null; } })();
  const KEY = "lqomr-v1";
  const uid = p => p + "-" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const locale = () => ({ en: "en-GB", zh: "zh-CN" })[W.LQI18N && W.LQI18N.lang] || "th-TH";
  const fmt = (v, d) => v == null || !isFinite(v) ? "—" : (+v).toFixed(d == null ? 2 : d);

  /** @type {{v:number, cur:string|null, exams:any[]}} */
  let S = load();
  const pics = new Map(); // sheetId -> {data, w, h, ppm} straightened gray picture (memory only)
  let openSheet = null, keyScan = false;

  function load() {
    try { const v = LS && JSON.parse(LS.getItem(KEY) || "null"); if (v && v.v === 1 && Array.isArray(v.exams)) return v; } catch {}
    return { v: 1, cur: null, exams: [] };
  }
  function save() {
    try { LS && LS.setItem(KEY, JSON.stringify(S)); return true; }
    catch { msg("examMsg", T("om.err.quota", "บันทึกในเครื่องไม่สำเร็จ (พื้นที่เต็มหรือถูกปิดกั้น) ส่งออก CSV ไว้ก่อน"), true); return false; }
  }
  function msg(id, text, bad) { const el = $(id); if (el) { el.textContent = text || ""; el.classList.toggle("bad", !!bad); } }
  const exam = () => S.exams.find(e => e.id === S.cur) || null;
  const lay = e => O.layout({ n: e.n, choices: e.choices, idDigits: e.idDigits, labels: e.labels });
  const letters = e => O.LABELS[e.labels] ? O.LABELS[e.labels].slice(0, e.choices) : "ABCDE".slice(0, e.choices);

  // ---------------------------------------------------------------- exams
  function renderExams() {
    const sel = /** @type {HTMLSelectElement} */ ($("examPick"));
    sel.textContent = "";
    if (!S.exams.length) {
      const o = document.createElement("option"); o.value = ""; o.textContent = T("om.exam.none", "ยังไม่มีชุดข้อสอบ สร้างชุดใหม่ด้านล่าง"); sel.appendChild(o);
    }
    for (const e of S.exams) {
      const o = document.createElement("option"); o.value = e.id;
      o.textContent = T("om.exam.opt", "{title} · {n} ข้อ · {c} ตัวเลือก", { title: e.title || T("om.exam.untitled", "ไม่มีชื่อ"), n: e.n, c: e.choices });
      sel.appendChild(o);
    }
    sel.value = S.cur || "";
    const e = exam();
    $("ws").hidden = !e;
    /** @type {HTMLDetailsElement} */ ($("newWrap")).open = !S.exams.length;
    $("examMeta").textContent = e ? T("om.exam.meta", "{n} ข้อ · {c} ตัวเลือก · รหัสนักเรียน {d} หลัก · สแกนแล้ว {s} แผ่น · เฉลย {k}/{n} ข้อ",
      { n: e.n, c: e.choices, d: e.idDigits, s: e.sheets.length, k: e.key.filter(k => k && k.length).length }) : "";
    if (e) { renderPreview(); renderKey(); renderResults(); }
  }
  function sheetText(e) {
    return {
      title: e.title, name: T("om.sheet.name", "ชื่อ-สกุล"), cls: T("om.sheet.cls", "ชั้น / ห้อง / เลขที่"), date: T("om.sheet.date", "วันที่"),
      id: T("om.sheet.id", "รหัสนักเรียน"), idHint: T("om.sheet.idHint", "เขียนตัวเลขในช่อง แล้วระบายให้ตรงกัน"),
      fill: T("om.sheet.fill", "ระบายวงกลมให้เต็มวง ด้วยดินสอ 2B หรือปากกาสีเข้ม เปลี่ยนคำตอบให้ลบให้สะอาด"),
      footer: T("om.sheet.footer", "LENSIQ · {n} ข้อ · {c} ตัวเลือก · อย่าเขียนทับสี่เหลี่ยมดำ", { n: e.n, c: e.choices })
    };
  }
  function svgEl(e) {
    const doc = new DOMParser().parseFromString(O.sheetSvg(lay(e), sheetText(e)), "image/svg+xml");
    return document.importNode(doc.documentElement, true);
  }
  function renderPreview() {
    const e = exam(), box = $("sheetPreview");
    box.textContent = "";
    if (e) box.appendChild(svgEl(e));
  }
  $("examPick").addEventListener("change", ev => { S.cur = /** @type {HTMLSelectElement} */ (ev.target).value || null; save(); closeReview(); renderExams(); });
  $("newExam").addEventListener("submit", ev => {
    ev.preventDefault();
    const f = /** @type {HTMLFormElement} */ (ev.target), el = f.elements;
    const v = name => /** @type {HTMLInputElement} */ (el.namedItem(name)).value;
    const L = O.layout({ n: +v("n"), choices: +v("choices"), idDigits: +v("idDigits"), labels: v("labels") });
    const e = { id: uid("x"), title: v("title").trim().slice(0, 80), n: L.n, choices: L.choices, labels: L.labels, idDigits: L.idDigits,
      key: Array.from({ length: L.n }, () => []), sheets: [], created: Date.now() };
    S.exams.push(e); S.cur = e.id;
    if (save()) msg("examMsg", T("om.exam.made", "สร้างชุดข้อสอบแล้ว พิมพ์กระดาษคำตอบและใส่เฉลยด้านล่าง"));
    f.reset(); renderExams();
  });
  $("printBtn").addEventListener("click", () => {
    const e = exam(); if (!e) return;
    const area = $("printArea"); area.textContent = ""; area.appendChild(svgEl(e));
    document.body.classList.add("om-printing");
    const done = () => { document.body.classList.remove("om-printing"); area.textContent = ""; window.removeEventListener("afterprint", done); };
    window.addEventListener("afterprint", done);
    try { window.print(); } catch {}
    if (W.__LQOMRP && W.__LQOMRP.noPrintCleanup) return;
    setTimeout(() => { if (!window.matchMedia || !window.matchMedia("print").matches) done(); }, 1500);
  });
  $("delExam").addEventListener("click", () => {
    const e = exam(); if (!e) return;
    if (!window.confirm(T("om.del.confirm", "ลบชุดข้อสอบ \"{t}\" และคะแนน {n} แผ่น?", { t: e.title || "—", n: e.sheets.length }))) return;
    for (const s of e.sheets) pics.delete(s.id);
    S.exams = S.exams.filter(x => x !== e); S.cur = S.exams.length ? S.exams[S.exams.length - 1].id : null;
    save(); closeReview(); renderExams(); msg("examMsg", T("om.del.done", "ลบชุดข้อสอบแล้ว"));
  });
  $("wipeAll").addEventListener("click", () => {
    if (!window.confirm(T("om.wipe.confirm", "ลบชุดข้อสอบ เฉลย และคะแนนทั้งหมดในเครื่องนี้?"))) return;
    S = { v: 1, cur: null, exams: [] }; pics.clear();
    try { LS && LS.removeItem(KEY); } catch {}
    closeReview(); renderExams(); msg("wipeMsg", T("om.wipe.done", "ลบข้อมูลตรวจข้อสอบทั้งหมดแล้ว"));
  });

  // ---------------------------------------------------------------- key
  /** Thai choice letters (ก ข ค ง จ) are sheet content, not UI text: marked lang="th" so en / zh coverage skips them */
  const thLang = (el, e) => { if (e && e.labels === "th") el.lang = "th"; return el; };
  function choiceBtn(label, on, onClick, aria, e) {
    const b = thLang(document.createElement("button"), e);
    b.type = "button"; b.className = "om-ch" + (on ? " on" : ""); b.textContent = label;
    b.setAttribute("aria-pressed", on ? "true" : "false"); b.setAttribute("aria-label", aria);
    b.addEventListener("click", onClick);
    return b;
  }
  function renderKey() {
    const e = exam(); if (!e) return;
    const Ls = letters(e);
    /** @type {HTMLInputElement} */ ($("keyText")).value = O.keyText(e.key, Ls).replace(/-+$/, "");
    const g = $("keyGrid"); g.textContent = "";
    e.key.forEach((k, q) => {
      const row = document.createElement("div"); row.className = "om-q";
      const n = document.createElement("span"); n.className = "om-qn"; n.textContent = String(q + 1); row.appendChild(n);
      for (let c = 0; c < e.choices; c++) row.appendChild(choiceBtn(Ls[c], k.includes(c), () => {
        e.key[q] = k.length === 1 && k[0] === c ? [] : [c]; save(); renderKey(); renderResults(); renderMeta();
      }, T("om.key.aria", "ข้อ {q} เฉลย {c}", { q: q + 1, c: Ls[c] }), e));
      g.appendChild(row);
    });
  }
  function renderMeta() {
    const e = exam(); if (!e) return;
    $("examMeta").textContent = T("om.exam.meta", "{n} ข้อ · {c} ตัวเลือก · รหัสนักเรียน {d} หลัก · สแกนแล้ว {s} แผ่น · เฉลย {k}/{n} ข้อ",
      { n: e.n, c: e.choices, d: e.idDigits, s: e.sheets.length, k: e.key.filter(k => k && k.length).length });
  }
  $("keyApply").addEventListener("click", () => {
    const e = exam(); if (!e) return;
    const k = O.parseKey(/** @type {HTMLInputElement} */ ($("keyText")).value, e.choices, e.n);
    e.key = k; save(); renderKey(); renderResults(); renderMeta();
    msg("keyMsg", T("om.key.set", "ใช้เฉลยแล้ว {k} จาก {n} ข้อ (ข้อที่ไม่มีเฉลยไม่คิดคะแนน)", { k: k.filter(x => x.length).length, n: e.n }));
  });
  $("keyScan").addEventListener("click", () => {
    keyScan = !keyScan; $("keyScan").setAttribute("aria-pressed", String(keyScan));
    msg("keyMsg", keyScan ? T("om.key.scanOn", "แผ่นถัดไปที่สแกนจะถูกใช้เป็นเฉลย (ไม่นับเป็นคะแนนนักเรียน)") : "");
  });

  // ---------------------------------------------------------------- reading
  function grayOf(src, sw, sh, maxSide) {
    const k = Math.min(1, maxSide / Math.max(sw, sh)), w = Math.max(1, Math.round(sw * k)), h = Math.max(1, Math.round(sh * k));
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    const g = c.getContext("2d", { willReadFrequently: true });
    g.drawImage(src, 0, 0, w, h);
    const px = g.getImageData(0, 0, w, h).data, gray = O.toGray(px, w, h);
    c.width = c.height = 0;
    return { gray, w, h };
  }
  const WHY = () => ({
    markers: T("om.why.markers", "ไม่เห็นสี่เหลี่ยมดำครบทั้งสี่มุม ถอยกล้องให้เห็นทั้งแผ่น และเพิ่มแสง"),
    orientation: T("om.why.orient", "หาด้านบนของกระดาษไม่ได้ (แถบดำด้านบน) ตรวจว่าเป็นกระดาษคำตอบของ LENSIQ")
  });
  /** returns the saved sheet, "key" when the sheet became the answer key, or null (status message says why) */
  function processGray(gray, w, h, source) {
    const e = exam();
    if (!e) { status(T("om.why.exam", "เลือกหรือสร้างชุดข้อสอบก่อน"), true); return null; }
    const L = lay(e), r = O.read(gray, w, h, L);
    if (!r.ok) { status(WHY()[r.why] || WHY().markers, true); return null; }
    if (r.code.ok && !r.code.match) {
      status(T("om.why.format", "กระดาษนี้พิมพ์สำหรับ {n} ข้อ {c} ตัวเลือก แต่ชุดที่เลือกคือ {en} ข้อ {ec} ตัวเลือก เลือกชุดให้ตรงก่อน",
        { n: r.code.n, c: r.code.choices, en: e.n, ec: e.choices }), true);
      return null;
    }
    if (keyScan) {
      e.key = r.marks.map(m => m.slice());
      keyScan = false; $("keyScan").setAttribute("aria-pressed", "false");
      save(); renderKey(); renderResults(); renderMeta();
      const multi = r.marks.filter(m => m.length > 1).length;
      msg("keyMsg", T("om.key.scanned", "อ่านเฉลยจากกระดาษแล้ว {k} ข้อ{m} ตรวจในช่องเฉลยด้านบนก่อนใช้", {
        k: r.marks.filter(m => m.length).length, m: multi ? T("om.key.scannedMulti", " (มี {n} ข้อรับหลายคำตอบ)", { n: multi }) : "" }));
      status(T("om.key.scannedS", "ใช้แผ่นนี้เป็นเฉลยแล้ว"));
      return "key";
    }
    const s = { id: uid("s"), at: Date.now(), source, sid: r.id, name: "", marks: r.marks, auto: r.marks.map(m => m.slice()),
      flags: r.flags, idFlags: r.idFlags, manual: [], confirmed: false, codeOk: !!r.code.ok, quality: r.quality };
    e.sheets.push(s);
    pics.set(s.id, O.warp(gray, w, h, r.H, 2));
    save();
    const g = O.grade(s.marks, e.key);
    status(T("om.scan.read", "อ่านแผ่นแล้ว รหัส {id} · {s}/{m} คะแนน{f}", { id: s.sid || "—", s: g.score, m: g.max,
      f: needs(e, s) ? T("om.scan.readFlag", " · มีข้อให้ตรวจ") : "" }));
    if (navigator.vibrate) try { navigator.vibrate(60); } catch {}
    renderResults(); renderMeta(); openReview(s.id);
    return s;
  }
  function status(text, bad) { const el = $("scanStatus"); el.textContent = text; el.classList.toggle("bad", !!bad); }

  // ---------------------------------------------------------------- camera
  let cam = null, timer = 0, busy = false, stable = 0, lastPts = null, waitGone = false, goneCount = 0;
  const video = /** @type {HTMLVideoElement} */ ($("video")), ov = /** @type {HTMLCanvasElement} */ ($("overlay"));
  function drawOverlay(pts, sw, sh, ok) {
    const b = video.getBoundingClientRect(), dpr = window.devicePixelRatio || 1;
    ov.width = Math.max(1, Math.round(b.width * dpr)); ov.height = Math.max(1, Math.round(b.height * dpr));
    const g = ov.getContext("2d"); g.clearRect(0, 0, ov.width, ov.height);
    if (!pts) return;
    // object-fit: contain inside the box
    const k = Math.min(ov.width / sw, ov.height / sh), ox = (ov.width - sw * k) / 2, oy = (ov.height - sh * k) / 2;
    g.lineWidth = 4 * dpr; g.strokeStyle = ok ? "#16a34a" : "#f59e0b";
    g.beginPath(); pts.forEach(([x, y], i) => i ? g.lineTo(ox + x * k, oy + y * k) : g.moveTo(ox + x * k, oy + y * k)); g.closePath(); g.stroke();
  }
  function tick() {
    timer = 0;
    if (!cam || !cam.active || busy) { schedule(); return; }
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) { schedule(); return; }
    const small = grayOf(video, vw, vh, 640), k = vw / small.w;
    const fm = O.findMarkers(small.gray, small.w, small.h);
    if (!fm.ok) {
      drawOverlay(null, vw, vh, false); stable = 0; lastPts = null;
      if (waitGone && ++goneCount >= 4) { waitGone = false; status(T("om.scan.next", "พร้อมอ่านแผ่นถัดไป")); }
      schedule(); return;
    }
    goneCount = 0;
    const pts = fm.pts.map(([x, y]) => [x * k, y * k]);
    const diag = Math.hypot(vw, vh);
    const moved = lastPts ? Math.max(...pts.map((p, i) => Math.hypot(p[0] - lastPts[i][0], p[1] - lastPts[i][1]))) / diag : 1;
    stable = moved < 0.012 ? stable + 1 : 0; lastPts = pts;
    drawOverlay(pts, vw, vh, stable >= 2);
    if (waitGone) status(T("om.scan.change", "อ่านแผ่นนี้แล้ว เปลี่ยนเป็นแผ่นถัดไป (หรือกด \"ถ่ายตอนนี้\" เพื่ออ่านซ้ำ)"));
    else if (stable < 2) status(T("om.scan.hold", "เห็นมุมครบแล้ว ถือนิ่ง ๆ"));
    if (stable >= 3 && !waitGone && /** @type {HTMLInputElement} */ ($("autoSnap")).checked) { snap(); return; }
    schedule();
  }
  function schedule() { if (cam && cam.active && !timer) timer = setTimeout(tick, 180); }
  function snap() {
    const vw = video.videoWidth, vh = video.videoHeight;
    if (!vw || !vh) return;
    busy = true;
    try {
      const full = grayOf(video, vw, vh, 1600);
      const res = processGray(full.gray, full.w, full.h, "camera");
      stable = 0; goneCount = 0; waitGone = !!res;
    } finally { busy = false; schedule(); }
  }
  $("camStart").addEventListener("click", async () => {
    try {
      if (!cam) cam = W.LQCam.create(video, { facing: "environment", ideal: { width: 1920, height: 1080 }, mirror: false });
      status(T("om.scan.opening", "กำลังเปิดกล้อง…"));
      await cam.start();
      /** @type {HTMLButtonElement} */ ($("camStop")).disabled = false; /** @type {HTMLButtonElement} */ ($("snap")).disabled = false;
      /** @type {HTMLButtonElement} */ ($("camStart")).disabled = true;
      $("camBox").classList.add("on");
      status(T("om.scan.aim", "ส่องกล้องให้เห็นสี่เหลี่ยมดำครบทั้งสี่มุมของกระดาษ"));
      waitGone = false; schedule();
    } catch (err) {
      status(W.LQCam && W.LQCam.errorText ? W.LQCam.errorText(err) : T("om.scan.camErr", "เปิดกล้องไม่ได้ ใช้ปุ่ม \"เลือกรูปจากเครื่อง\" แทน"), true);
    }
  });
  function stopCam() {
    if (cam) cam.stop();
    clearTimeout(timer); timer = 0;
    /** @type {HTMLButtonElement} */ ($("camStop")).disabled = true; /** @type {HTMLButtonElement} */ ($("snap")).disabled = true;
    /** @type {HTMLButtonElement} */ ($("camStart")).disabled = false;
    $("camBox").classList.remove("on"); drawOverlay(null, 1, 1, false);
  }
  $("camStop").addEventListener("click", () => { stopCam(); status(T("om.scan.stopped", "ปิดกล้องแล้ว")); });
  $("snap").addEventListener("click", () => { waitGone = false; snap(); });
  $("photoFile").addEventListener("change", async ev => {
    const inp = /** @type {HTMLInputElement} */ (ev.target), files = Array.from(inp.files || []);
    let ok = 0;
    for (const f of files) {
      try {
        const bmp = await createImageBitmap(f);
        const gi = grayOf(bmp, bmp.width, bmp.height, 1600);
        if (bmp.close) bmp.close();
        if (processGray(gi.gray, gi.w, gi.h, "photo")) ok++;
      } catch { status(T("om.scan.badFile", "เปิดรูปนี้ไม่ได้"), true); }
    }
    if (files.length > 1) status(T("om.scan.files", "อ่านได้ {ok} จาก {n} รูป", { ok, n: files.length }), ok < files.length);
    inp.value = "";
  });

  // ---------------------------------------------------------------- review + manual correction
  const FLAG_L = () => ({ multi: T("om.flag.multi", "ระบายหลายวง"), unsure: T("om.flag.unsure", "รอยจาง / ไม่แน่ใจ"), blank: T("om.flag.blank", "ไม่ได้ระบาย") });
  const dupSid = (e, s) => !!s.sid && e.sheets.some(x => x !== s && x.sid === s.sid);
  /** sheet needs the teacher's look: multiple / faint marks, unreadable or duplicate student number, unknown format */
  function needs(e, s) {
    if (s.confirmed) return 0;
    let n = s.flags.filter((f, q) => (f === "multi" || f === "unsure") && !s.manual.includes(q)).length;
    if (e.idDigits && (!s.sid || s.sid.includes("?"))) n++;
    if (dupSid(e, s)) n++;
    if (!s.codeOk) n++;
    return n;
  }
  function openReview(id) {
    openSheet = id; $("review").hidden = false; renderReview();
  }
  function closeReview() { openSheet = null; $("review").hidden = true; }
  const curSheet = () => { const e = exam(); return e && e.sheets.find(s => s.id === openSheet) || null; };
  function toggleMark(s, q, c) {
    const m = s.marks[q], i = m.indexOf(c);
    if (i >= 0) m.splice(i, 1); else { m.push(c); m.sort((a, b) => a - b); }
    if (!s.manual.includes(q)) s.manual.push(q);
    save(); renderReview(); renderResults();
  }
  function renderReview() {
    const e = exam(), s = curSheet();
    if (!e || !s) { closeReview(); return; }
    const Ls = letters(e), g = O.grade(s.marks, e.key), L = lay(e);
    $("revScore").textContent = T("om.rev.score", "{s}/{m} คะแนน", { s: g.score, m: g.max });
    const issues = [];
    if (e.idDigits && (!s.sid || s.sid.includes("?"))) issues.push(T("om.iss.sid", "อ่านรหัสนักเรียนไม่ครบ พิมพ์แก้ในช่องรหัส"));
    if (dupSid(e, s)) issues.push(T("om.iss.dup", "รหัสนี้ซ้ำกับแผ่นอื่น"));
    if (!s.codeOk) issues.push(T("om.iss.code", "อ่านรหัสรูปแบบกระดาษไม่ได้ ตรวจว่าใช้กระดาษของชุดนี้"));
    const nf = s.flags.filter((f, q) => (f === "multi" || f === "unsure") && !s.manual.includes(q)).length;
    if (nf) issues.push(T("om.iss.flags", "{n} ข้อควรตรวจ (ระบายหลายวงหรือรอยจาง)", { n: nf }));
    $("revFlags").textContent = issues.length ? issues.join(" · ") : s.confirmed ? T("om.iss.confirmed", "ครูยืนยันแผ่นนี้แล้ว") : T("om.iss.none", "ไม่มีข้อที่ต้องตรวจ");
    $("revMeta").textContent = T("om.rev.meta", "สแกนเมื่อ {t} · แก้ด้วยมือ {m} ข้อ", { t: new Date(s.at).toLocaleString(locale()), m: s.manual.length });
    const sid = /** @type {HTMLInputElement} */ ($("revSid")), nm = /** @type {HTMLInputElement} */ ($("revName"));
    if (document.activeElement !== sid) sid.value = s.sid || "";
    if (document.activeElement !== nm) nm.value = s.name || "";
    // grid
    const all = /** @type {HTMLInputElement} */ ($("revAll")).checked, grid = $("revGrid"), FL = FLAG_L();
    grid.textContent = "";
    s.marks.forEach((m, q) => {
      const f = s.flags[q], r = g.res[q];
      if (!all && !f && !s.manual.includes(q)) return;
      const row = document.createElement("div"); row.className = "om-q r-" + r;
      const n = document.createElement("span"); n.className = "om-qn"; n.textContent = String(q + 1); row.appendChild(n);
      for (let c = 0; c < e.choices; c++) row.appendChild(choiceBtn(Ls[c], m.includes(c), () => toggleMark(s, q, c),
        T("om.rev.aria", "ข้อ {q} ตัวเลือก {c}", { q: q + 1, c: Ls[c] }), e));
      const t = document.createElement("span"); t.className = "om-qf";
      const parts = [];
      if (f) parts.push(FL[f] || f);
      if (s.manual.includes(q)) parts.push(T("om.rev.manual", "แก้ด้วยมือ"));
      t.textContent = parts.join(" · ");
      if (e.key[q] && e.key[q].length) {
        if (r === "c") t.textContent += (parts.length ? " · " : "") + T("om.res.right", "ถูก");
        else {
          t.textContent += (parts.length ? " · " : "") + T("om.res.keyL", "เฉลย") + " ";
          const kk = thLang(document.createElement("b"), e); kk.textContent = e.key[q].map(i => Ls[i]).join("/"); t.appendChild(kk);
        }
      }
      row.appendChild(t);
      grid.appendChild(row);
    });
    if (!grid.childNodes.length) { const p = document.createElement("p"); p.className = "hint"; p.textContent = T("om.rev.noFlags", "ไม่มีข้อที่ต้องตรวจ เลือก \"แสดงทุกข้อ\" เพื่อดูหรือแก้ทุกข้อ"); grid.appendChild(p); }
    drawWarp(e, s, L, g);
  }
  function drawWarp(e, s, L, g) {
    const cv = /** @type {HTMLCanvasElement} */ ($("warp")), pic = pics.get(s.id);
    cv.hidden = !pic;
    $("warpNote").textContent = pic ? T("om.rev.warpHint", "แตะวงกลมบนภาพเพื่อสลับว่าระบาย / ไม่ระบาย ภาพนี้อยู่ในหน่วยความจำชั่วคราว ไม่ถูกบันทึก")
      : T("om.rev.noPic", "ไม่มีภาพของแผ่นนี้ (ภาพไม่ถูกบันทึกหลังปิดหน้า) แก้คำตอบได้จากรายการข้อ");
    if (!pic) return;
    cv.width = pic.w; cv.height = pic.h;
    const ctx = cv.getContext("2d"), img = ctx.createImageData(pic.w, pic.h);
    for (let i = 0, j = 0; i < pic.data.length; i++, j += 4) { const v = pic.data[i]; img.data[j] = img.data[j + 1] = img.data[j + 2] = v; img.data[j + 3] = 255; }
    ctx.putImageData(img, 0, 0);
    const k = pic.ppm;
    L.q.forEach((row, q) => row.forEach((b, c) => {
      const on = s.marks[q].includes(c), isKey = e.key[q] && e.key[q].includes(c);
      ctx.beginPath(); ctx.arc(b.x * k, b.y * k, (b.r + 0.5) * k, 0, Math.PI * 2);
      if (on) { ctx.fillStyle = g.res[q] === "c" ? "rgba(22,163,74,.45)" : "rgba(220,38,38,.45)"; ctx.fill(); }
      if (isKey && !on) { ctx.lineWidth = 2; ctx.strokeStyle = "#16a34a"; ctx.stroke(); }
      if (s.flags[q] && s.flags[q] !== "blank" && !s.manual.includes(q) && c === 0) {
        ctx.fillStyle = "#f59e0b"; ctx.fillRect((row[0].x - b.r - 5.5) * k, (b.y - 1) * k, 2 * k, 2 * k);
      }
    }));
  }
  $("warp").addEventListener("click", ev => {
    const e = exam(), s = curSheet(), cv = /** @type {HTMLCanvasElement} */ ($("warp")), pic = s && pics.get(s.id);
    if (!e || !s || !pic) return;
    const b = cv.getBoundingClientRect(), x = (ev.clientX - b.left) / b.width * O.A4W, y = (ev.clientY - b.top) / b.height * O.A4H;
    const L = lay(e);
    let best = null, bd = 1e9;
    L.q.forEach((row, q) => row.forEach((bb, c) => { const d = Math.hypot(bb.x - x, bb.y - y); if (d < bd) { bd = d; best = [q, c]; } }));
    if (best && bd <= 4) toggleMark(s, best[0], best[1]);
  });
  $("revAll").addEventListener("change", renderReview);
  $("revSid").addEventListener("input", ev => { const s = curSheet(); if (!s) return; s.sid = /** @type {HTMLInputElement} */ (ev.target).value.replace(/[^\w?-]/g, "").slice(0, 12); save(); renderResults(); });
  $("revSid").addEventListener("change", renderReview);
  $("revName").addEventListener("input", ev => { const s = curSheet(); if (!s) return; s.name = /** @type {HTMLInputElement} */ (ev.target).value.slice(0, 60); save(); renderResults(); });
  $("revDone").addEventListener("click", () => {
    const s = curSheet(); if (!s) return;
    s.confirmed = true; save(); renderResults(); closeReview();
    msg("resMsg", T("om.rev.confirmed", "ยืนยันแผ่นรหัส {id} แล้ว", { id: s.sid || "—" }));
  });
  $("revDel").addEventListener("click", () => {
    const e = exam(), s = curSheet(); if (!e || !s) return;
    if (!window.confirm(T("om.rev.delConfirm", "ลบผลสแกนแผ่นนี้?"))) return;
    e.sheets = e.sheets.filter(x => x !== s); pics.delete(s.id);
    save(); closeReview(); renderResults(); renderMeta();
  });

  // ---------------------------------------------------------------- results + item analysis
  function tile(k, v, sub) {
    const d = document.createElement("div"); d.className = "tile";
    const a = document.createElement("div"); a.className = "k"; a.textContent = k;
    const b = document.createElement("div"); b.className = "v"; b.textContent = v;
    d.append(a, b);
    if (sub) { const c = document.createElement("div"); c.className = "s"; c.textContent = sub; d.appendChild(c); }
    return d;
  }
  const sorted = e => e.sheets.slice().sort((a, b) => String(a.sid).localeCompare(String(b.sid)) || a.at - b.at);
  function renderResults() {
    const e = exam(); if (!e) return;
    const body = $("resBody"); body.textContent = "";
    const maxPts = e.key.filter(k => k && k.length).length;
    for (const s of sorted(e)) {
      const g = O.grade(s.marks, e.key), tr = document.createElement("tr"), nn = needs(e, s);
      const td = (t, cls) => { const c = document.createElement("td"); c.textContent = t; if (cls) c.className = cls; tr.appendChild(c); return c; };
      td(s.sid || "—", "om-mono"); td(s.name || "");
      td(maxPts ? T("om.res.scoreV", "{s}/{m} ({p} %)", { s: g.score, m: g.max, p: Math.round(g.score / g.max * 100) }) : "—", "om-mono");
      td(nn ? T("om.res.needs", "{n} จุด", { n: nn }) : s.confirmed ? T("om.res.ok", "ยืนยันแล้ว") : "—", nn ? "om-warn" : "");
      const c = document.createElement("td"), b = document.createElement("button");
      b.type = "button"; b.className = "btn ghost om-edit"; b.textContent = T("om.res.edit", "ตรวจ / แก้");
      b.setAttribute("aria-label", T("om.res.editAria", "ตรวจหรือแก้แผ่นรหัส {id}", { id: s.sid || "—" }));
      b.addEventListener("click", () => { openReview(s.id); $("review").scrollIntoView({ block: "start" }); });
      c.appendChild(b); tr.appendChild(c); body.appendChild(tr);
    }
    $("resEmpty").hidden = !!e.sheets.length;
    const a = O.analyse(e.sheets, e.key, e.choices), tiles = $("tiles");
    tiles.textContent = "";
    tiles.append(
      tile(T("om.t.sheets", "แผ่นที่สแกน"), String(a.n), T("om.t.check", "ต้องตรวจ {n} แผ่น", { n: e.sheets.filter(s => needs(e, s)).length })),
      tile(T("om.t.mean", "คะแนนเฉลี่ย"), a.n && maxPts ? fmt(a.mean, 1) : "—", T("om.t.of", "เต็ม {m}", { m: maxPts })),
      tile(T("om.t.median", "มัธยฐาน"), a.n && maxPts ? fmt(a.median, 1) : "—", T("om.t.sd", "SD {v}", { v: a.n && maxPts ? fmt(a.sd, 2) : "—" })),
      tile(T("om.t.range", "ต่ำสุด–สูงสุด"), a.n && maxPts ? `${a.min}–${a.max}` : "—"),
      tile(T("om.t.kr20", "ความเชื่อมั่น KR-20"), fmt(a.kr20, 2), T("om.t.kr20s", "ยิ่งใกล้ 1 ยิ่งสอดคล้องกัน (ใช้ได้เมื่อมีหลายสิบแผ่น)"))
    );
    renderItems(e, a);
    if (openSheet) renderReview();
  }
  const HINT_L = () => ({ easy: T("om.hint.easy", "ง่ายมาก"), hard: T("om.hint.hard", "ยากมาก ตรวจโจทย์และเฉลย"),
    "low-d": T("om.hint.lowd", "จำแนกได้น้อย"), "neg-d": T("om.hint.negd", "กลุ่มอ่อนตอบถูกมากกว่า — ตรวจเฉลย") });
  function renderItems(e, a) {
    const Ls = letters(e), head = $("itemHead"), body = $("itemBody"), H = HINT_L();
    head.textContent = ""; body.textContent = "";
    const hr = document.createElement("tr");
    const cols = [T("om.item.q", "ข้อ"), T("om.item.key", "เฉลย"), "p", "r"].concat(Ls.split(""), [T("om.item.blank", "ว่าง"), T("om.item.multi", "หลายวง"), T("om.item.note", "ข้อสังเกต")]);
    cols.forEach((c, i) => { const th = document.createElement("th"); th.scope = "col"; th.textContent = c; if (i >= 4 && i < 4 + e.choices) thLang(th, e); hr.appendChild(th); });
    head.appendChild(hr);
    for (const it of a.items) {
      const tr = document.createElement("tr"), k = e.key[it.q] || [];
      const td = (t, cls) => { const c = document.createElement("td"); c.textContent = t; if (cls) c.className = cls; tr.appendChild(c); return c; };
      td(String(it.q + 1)); thLang(td(k.length ? k.map(i => Ls[i]).join("/") : "—"), e);
      td(fmt(it.p, 2), "om-mono"); td(fmt(it.d, 2), "om-mono" + (it.d != null && it.d < 0 ? " om-warn" : ""));
      it.counts.forEach((n, c) => td(String(n), "om-mono" + (k.includes(c) ? " om-keyc" : "")));
      td(String(it.blank), "om-mono"); td(String(it.multi), "om-mono"); td(H[it.hint] || "");
      body.appendChild(tr);
    }
  }
  function download(name, text) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  const fileBase = e => "lensiq-omr-" + (e.title || "exam").replace(/[^\w฀-๿-]+/g, "_").slice(0, 40);
  function scoreRows(e) {
    const Ls = letters(e);
    const rows = [[T("om.csv.sid", "รหัสนักเรียน"), T("om.csv.name", "ชื่อ"), T("om.csv.score", "คะแนน"), T("om.csv.max", "เต็ม"), T("om.csv.pct", "ร้อยละ"),
      T("om.csv.check", "จุดที่ต้องตรวจ"), T("om.csv.manual", "ข้อที่แก้ด้วยมือ"), T("om.csv.scanned", "เวลาสแกน")].concat(e.key.map((k, q) => "Q" + (q + 1)))];
    for (const s of sorted(e)) {
      const g = O.grade(s.marks, e.key);
      rows.push([s.sid, s.name, g.score, g.max, g.max ? (g.score / g.max * 100).toFixed(1) : "", needs(e, s), s.manual.map(q => q + 1).join(" "),
        new Date(s.at).toISOString()].concat(s.marks.map(m => O.marksText(m, Ls))));
    }
    rows.push([]);
    rows.push([T("om.csv.keyRow", "เฉลย"), "", "", "", "", "", "", ""].concat(e.key.map(k => O.marksText(k, Ls))));
    return rows;
  }
  function itemRows(e) {
    const Ls = letters(e), a = O.analyse(e.sheets, e.key, e.choices), H = HINT_L();
    const rows = [[T("om.item.q", "ข้อ"), T("om.item.key", "เฉลย"), "p", "r", "r_pb"].concat(Ls.split(""), [T("om.item.blank", "ว่าง"), T("om.item.multi", "หลายวง"), T("om.item.note", "ข้อสังเกต")])];
    for (const it of a.items) rows.push([it.q + 1, O.marksText(e.key[it.q], Ls), fmt(it.p, 3), fmt(it.d, 3), fmt(it.rpb, 3)].concat(it.counts, [it.blank, it.multi, H[it.hint] || ""]));
    rows.push([]);
    rows.push([T("om.t.sheets", "แผ่นที่สแกน"), a.n, T("om.t.mean", "คะแนนเฉลี่ย"), fmt(a.mean, 2), "SD", fmt(a.sd, 2), "KR-20", fmt(a.kr20, 3)]);
    return rows;
  }
  $("csvScores").addEventListener("click", () => { const e = exam(); if (e) download(fileBase(e) + "-scores.csv", O.csvText(scoreRows(e))); });
  $("csvItems").addEventListener("click", () => { const e = exam(); if (e) download(fileBase(e) + "-items.csv", O.csvText(itemRows(e))); });
  $("delSheets").addEventListener("click", () => {
    const e = exam(); if (!e || !e.sheets.length) return;
    if (!window.confirm(T("om.res.clearConfirm", "ลบผลสแกน {n} แผ่นของชุดนี้? (เฉลยยังอยู่)", { n: e.sheets.length }))) return;
    for (const s of e.sheets) pics.delete(s.id);
    e.sheets = []; save(); closeReview(); renderResults(); renderMeta();
    msg("resMsg", T("om.res.cleared", "ลบผลสแกนแล้ว"));
  });

  window.addEventListener("lq-lang", () => renderExams());
  renderExams();
  W.__LQOMRP = {
    get state() { return S; }, pics, layout: () => { const e = exam(); return e && lay(e); },
    processCanvas(c) { const g = grayOf(c, c.width, c.height, 1600); return processGray(g.gray, g.w, g.h, "test"); },
    scoreRows: () => scoreRows(exam()), itemRows: () => itemRows(exam()), get cam() { return cam; }, stopCam
  };
})();
