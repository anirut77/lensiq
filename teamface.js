/* teamface.js — โหงวเฮ้งทีม (teamface.html): a light-hearted team-building activity. Each consenting member gets a
 * playful "role in the team" card from the face-shape element of the existing face-reading engine (faceread.js FRCore +
 * faceread-kb.js FR_KB, used read-only), then the page shows how the team's roles mix. Always positive.
 * FOR FUN ONLY — never for hiring, appraisal or judging anyone (fixed banner on the page).
 * No images are kept (the frame is analysed and dropped), no names are required, nothing is stored or uploaded.
 *
 * Pure part (Node: const TF = require("./teamface.js")):
 *   ROLES {wood|fire|earth|metal|water: {name, tag, str:[2], power, work, ice, borrow}}  (key tf.role.<id>.<field>)
 *   roleFor(elementScores) -> {role, second}      element ids from FRCore.elementScores(m).ranked
 *   teamSummary(members:[{role}]) -> {n, counts, present, missing, dominant, pattern}
 *     pattern: 'empty' | 'solo' | 'same' (everyone shares one role) | 'balanced' (≥ 4 roles, n ≥ 4) | 'dominant' (one role ≥ 50%, n ≥ 3) | 'duo' (2 roles) | 'mixed'
 *   NOT_ASSESSMENT (label on every screen and every card) · recordLike(text) -> true when a nickname looks like a
 *     candidate / employee record id, an e-mail or a phone number · recruitLike(text) -> true for recruitment words
 *     (interview, candidate, applicant …). Results can never be attached to candidate records: there is no export, no
 *     id, record-like nicknames / recruitment team names are dropped, and record parameters in the URL are ignored.
 * Test hooks: window.__LQ_TF. ?fakedet: scripted face boxes via LQDetect.fake("c1") -> FRCore.synthFace(box).
 */
(function (root) {
  "use strict";
  var IDS = ["wood", "fire", "earth", "metal", "water"];
  var ROLES = {
    wood: { name: "นักริเริ่ม", tag: "ชอบเริ่มสิ่งใหม่และชวนทีมเติบโต",
      str: ["มองไกล เห็นโอกาสก่อนใคร", "ชอบเรียนรู้และแบ่งปันความรู้"], power: "เปลี่ยนไอเดียให้เป็นโครงการแรก",
      work: "ชวนคุยเรื่องเป้าหมายระยะยาว แล้วให้ได้ลองสิ่งใหม่", ice: "ถ้าได้เรียนเรื่องใหม่หนึ่งเรื่องฟรี ๆ จะเลือกเรื่องอะไร",
      borrow: "ผลัดกันเสนอ \"ลองอะไรใหม่สักอย่าง\" ในประชุมเดือนละครั้ง" },
    fire: { name: "ผู้จุดประกาย", tag: "เติมพลังและไอเดียให้ห้องประชุมสว่างขึ้น",
      str: ["ไอเดียเยอะ คิดเร็ว", "ทำให้บรรยากาศสนุก"], power: "ปลุกพลังทีมในวันที่เหนื่อย",
      work: "เปิดเวทีให้ได้นำเสนอ และช่วยกันเลือกไอเดียที่จะทำจริง", ice: "เพลงไหนที่เปิดแล้วพร้อมลุยงานทันที",
      borrow: "เริ่มประชุมด้วยเรื่องดี ๆ ของสัปดาห์คนละหนึ่งเรื่อง" },
    earth: { name: "ผู้ประสาน", tag: "กาวใจของทีม มั่นคงและรับฟัง",
      str: ["รับฟังเก่ง ใจเย็น", "ทำให้ทุกคนรู้สึกเป็นส่วนหนึ่ง"], power: "ทำให้ทีมเดินไปด้วยกันอย่างมั่นคง",
      work: "ขอความเห็นตรง ๆ และขอบคุณเมื่อช่วยประสานงาน", ice: "ของว่างที่ทำให้วันทำงานดีขึ้นคืออะไร",
      borrow: "ผลัดกันเป็น \"คนเช็กใจทีม\" ถามว่าใครต้องการความช่วยเหลือ" },
    metal: { name: "ผู้วางระบบ", tag: "จัดระเบียบเก่ง ทำให้งานเสร็จอย่างเรียบร้อย",
      str: ["วางแผนเป็นขั้นตอน", "รักษามาตรฐานงาน"], power: "เปลี่ยนความวุ่นให้เป็นเช็กลิสต์ที่ทำได้",
      work: "ตกลงเป้าหมายและกำหนดเวลาให้ชัด แล้วไว้ใจให้จัดระบบ", ice: "เครื่องมือหรือแอปที่ช่วยให้ชีวิตเป็นระเบียบที่สุดคืออะไร",
      borrow: "ปิดท้ายประชุมด้วยสรุป \"ใครทำอะไร ภายในเมื่อไร\" ร่วมกัน" },
    water: { name: "นักเชื่อมโยง", tag: "ยืดหยุ่น รู้จักคนเยอะ เชื่อมทีมกับโลกภายนอก",
      str: ["ปรับตัวไว", "เชื่อมคนกับข้อมูลได้เก่ง"], power: "หาทางออกใหม่เมื่อแผนเดิมติดขัด",
      work: "เล่าภาพรวมให้ฟัง แล้วให้ช่วยหาคนหรือข้อมูลที่ใช่", ice: "ถ้าเลือกไปทำงานที่ไหนก็ได้หนึ่งสัปดาห์ จะไปที่ไหน",
      borrow: "ชวนเพื่อนจากทีมอื่นมาแลกเปลี่ยนไอเดียบ้างเป็นครั้งคราว" }
  };
  function roleFor(el) {
    var r = el && el.ranked ? el.ranked : [];
    var a = r[0] && ROLES[r[0].id] ? r[0].id : "earth";
    var b = r[1] && ROLES[r[1].id] && r[1].id !== a ? r[1].id : null;
    return { role: a, second: b };
  }
  function teamSummary(members) {
    members = (members || []).filter(function (m) { return m && ROLES[m.role]; });
    var counts = {}; IDS.forEach(function (k) { counts[k] = 0; });
    members.forEach(function (m) { counts[m.role]++; });
    var n = members.length;
    var present = IDS.filter(function (k) { return counts[k] > 0; }).sort(function (a, b) { return counts[b] - counts[a] || IDS.indexOf(a) - IDS.indexOf(b); });
    var missing = IDS.filter(function (k) { return !counts[k]; });
    var top = present[0] || null, dom = top && n >= 3 && counts[top] / n >= 0.5 && (present.length < 2 || counts[present[1]] < counts[top]) ? top : null;
    var pattern = !n ? "empty" : n === 1 ? "solo" : present.length === 1 ? "same" : present.length >= 4 && n >= 4 ? "balanced" : dom ? "dominant" : present.length === 2 ? "duo" : "mixed";
    return { n: n, counts: counts, present: present, missing: missing, dominant: dom, pattern: pattern };
  }
  var NOT_ASSESSMENT = "เพื่อความบันเทิง/กิจกรรมละลายพฤติกรรม ไม่ใช่การประเมิน";
  function recordLike(t) {
    t = String(t || "").trim().toLowerCase();
    if (!t) return false;
    return /[a-z]{1,4}[-_ ]?\d{2,}/.test(t) || /\d{3,}/.test(t) || /@/.test(t) || recruitLike(t);
  }
  function recruitLike(t) {
    return /ผู้สมัคร|สัมภาษณ์|สรรหา|คัดเลือก|ประเมินผล|candidate|applicant|interview|recruit|hiring|appraisal|候选|应聘|面试|招聘|考核/.test(String(t || "").toLowerCase());
  }
  var TFCore = { IDS: IDS, ROLES: ROLES, roleFor: roleFor, teamSummary: teamSummary, NOT_ASSESSMENT: NOT_ASSESSMENT, recordLike: recordLike, recruitLike: recruitLike };
  if (typeof module !== "undefined" && module.exports) module.exports = TFCore;
  root.TFCore = TFCore;
})(typeof window !== "undefined" ? window : globalThis);

/* ================================ UI ================================ */
if (typeof window !== "undefined" && typeof document !== "undefined" && document.getElementById("tfApp")) (function () {
  "use strict";
  /* page globals (faceread-kb.js FR_KB, faceread.js FRCore, i18n/zh-fortune-faceread.js FR_KB_ZH) read through an untyped
     alias so lint and `tsc --checkJs` need no extra global declarations; the face-reading KB is only read, never written */
  var W = /** @type {any} */ (window);
  var TF = W.TFCore, FR = W.FRCore, KB = W.FR_KB;
  var kbZh = function () { return W.FR_KB_ZH || null; };
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var T = function (k, th, v) { return W.LQI18N ? W.LQI18N.tf(k, th, v) : th.replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  var isZh = function () { return !!(W.LQI18N && W.LQI18N.lang === "zh"); };
  var esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
  var R = function (id, f) { return T("tf.role." + id + "." + f, TF.ROLES[id][f]); };
  var RS = function (id, i) { return T("tf.role." + id + ".str" + i, TF.ROLES[id].str[i]); };
  var elName = function (id) {
    var Z = kbZh(), zh = isZh() && Z && Z.elements && Z.elements[id];
    return zh ? zh.th : KB && KB.elements[id] ? KB.elements[id].th : id;
  };
  var elTrait = function (id) {
    var Z = kbZh(), zh = isZh() && Z && Z.elements && Z.elements[id];
    var t = zh && zh.traits ? zh.traits : KB && KB.elements[id] ? KB.elements[id].traits : [];
    return t && t.length ? t[0] : "";
  };
  var COLOR = { wood: "#2e9e5b", fire: "#e0523a", earth: "#b7791f", metal: "#64748b", water: "#2a78d6" };
  var ICON = {
    wood: '<path d="M12 21v-7M12 14c-4 0-6-3-6-7 3 0 6 2 6 6 0-4 3-7 6-7 0 5-2 8-6 8z"/>',
    fire: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-3 2-4 2-6 1 1 2 2 2 3 1-2 1-4 1-7z"/>',
    earth: '<circle cx="8" cy="12" r="3"/><circle cx="16" cy="12" r="3"/><path d="M11 12h2"/>',
    metal: '<path d="M4 6h16M4 12h10M4 18h13"/><path d="M18 15l2 2-2 2"/>',
    water: '<path d="M3 15c3-3 6 3 9 0s6 3 9 0M3 9c3-3 6 3 9 0s6 3 9 0"/>'
  };
  var icon = function (id) { return '<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + ICON[id] + "</svg>"; };

  var members = [], seq = 0, busy = false, ready = false, looping = false, lastDet = null;
  var video = $("#tfVideo"), ov = $("#tfOverlay"), octx = ov.getContext("2d");
  var FAKE = !!(window.LQDetect && LQDetect.isTest());
  var lastStatus = null;
  function status(k, th, v, cls) { var e = $("#tfStatus"); e.textContent = T(k, th, v); e.className = "status " + (cls || ""); lastStatus = [k, th, v, cls]; }

  var camera = LQCam.create(video, {
    facing: "user", ideal: { width: 1280, height: 720 },
    onChange: function (c, ev) { $("#tfCam").classList.toggle("mirror", c.mirrored); if (ev.type === "started" && c.active) loop(); }
  });
  var modelsP = null;
  function loadModels() {
    if (FAKE) { ready = true; return Promise.resolve("fake"); }
    if (!modelsP) modelsP = LQDetect.tfBackend().then(function () {
      return Promise.all([faceapi.nets.tinyFaceDetector.loadFromUri("vendor/models/"), faceapi.nets.faceLandmark68Net.loadFromUri("vendor/models/")]);
    }).then(function () { ready = true; }).catch(function (e) { modelsP = null; throw e; });
    return modelsP;
  }
  async function detectAll(input) {
    var W = input.videoWidth || input.width, H = input.videoHeight || input.height;
    if (FAKE) {
      return (LQDetect.fake("c1", performance.now()) || []).map(function (d) {
        var box = { x: d.x * W, y: d.y * H, width: d.w * W, height: d.h * H };
        return { box: box, score: d.score || 0.95, pts: FR.synthFace(box) };
      });
    }
    var rs = await faceapi.detectAllFaces(input, new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.45 })).withFaceLandmarks();
    return rs.map(function (r) { var b = r.detection.box; return { box: { x: b.x, y: b.y, width: b.width, height: b.height }, score: r.detection.score, pts: r.landmarks.positions.map(function (p) { return [p.x, p.y]; }) }; });
  }
  async function loop() {
    if (looping) return; looping = true;
    while (camera.active) {
      if (!busy && ready && video.videoWidth) {
        try {
          if (ov.width !== video.videoWidth) { ov.width = video.videoWidth; ov.height = video.videoHeight; }
          var list = await detectAll(video), pk = FR.pickFace(list, null, video.videoWidth, video.videoHeight);
          lastDet = pk.index >= 0 ? list[pk.index] : null;
          octx.clearRect(0, 0, ov.width, ov.height);
          if (lastDet) { octx.strokeStyle = "#22d3ee"; octx.lineWidth = 4; var b = lastDet.box; octx.strokeRect(b.x, b.y, b.width, b.height); }
          syncRead();
        } catch (e) { console.warn(e); }
      }
      await sleep(300);
    }
    looping = false;
  }
  function syncRead() {
    var ok = $("#tfConsent").checked && camera.active && ready && !!lastDet && !busy;
    $("#tfRead").disabled = !ok;
    $("#tfHint").textContent = !$("#tfConsent").checked ? T("tf.js.needConsent", "ติ๊กยินยอมของสมาชิกคนนี้ก่อน") : !camera.active ? T("tf.js.needCam", "เปิดกล้องหรืออัปโหลดรูป") : !lastDet ? T("tf.js.needFace", "ให้ใบหน้าอยู่ในกรอบ หน้าตรง") : T("tf.js.ready", "พร้อมแล้ว กดอ่านบทบาทได้เลย");
  }
  $("#tfConsent").addEventListener("change", syncRead);

  $("#tfCamBtn").addEventListener("click", async function () {
    this.disabled = true; status("tf.js.opening", "กำลังเปิดกล้อง...");
    try { await Promise.all([camera.start(), loadModels()]); $("#tfCamBtn").hidden = true; status("tf.js.camOk", "กล้องพร้อม — ภาพไม่ถูกบันทึก", null, "ok"); syncRead(); }
    catch (e) { this.disabled = false; status("tf.js.camFail", "เปิดกล้องไม่ได้ ลองอัปโหลดรูปแทน", null, "err"); console.error(e); }
  });

  function addMember(el) {
    var r = TF.roleFor(el);
    seq++;
    var nick = $("#tfNick").value.replace(/[<>{}]/g, "").trim().slice(0, 24);
    if (TF.recordLike(nick)) { nick = ""; noAttach = true; } // never a candidate / employee record id on a fun card
    members.push({ id: seq, nick: nick, role: r.role, second: r.second, el: el.top.id });
    $("#tfNick").value = ""; $("#tfConsent").checked = false; // every member opts in for themselves
    renderCards(); renderSummary(); syncRead();
    var card = document.querySelector('.tcard[data-id="' + seq + '"]'); if (card && card.scrollIntoView) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
  function analyse(pts) { var m = FR.measure(pts, null); return FR.elementScores(m); }

  $("#tfRead").addEventListener("click", async function () {
    if (busy || !$("#tfConsent").checked) return;
    busy = true; this.disabled = true;
    try {
      var cnt = $("#tfCount");
      for (var n = 3; n >= 1; n--) { cnt.textContent = n; cnt.hidden = false; await sleep(500); }
      cnt.textContent = T("tf.js.reading", "กำลังอ่าน...");
      var capt = FR.createCapture({ minIou: 0.3 }), cv = document.createElement("canvas");
      for (var i = 0; i < 10 && capt.frames.length < 6; i++) {
        cv.width = video.videoWidth; cv.height = video.videoHeight; cv.getContext("2d").drawImage(video, 0, 0);
        capt.push(await detectAll(cv), cv.width, cv.height);
      }
      cv.width = cv.height = 0; // drop the frame
      if (capt.frames.length < 3) { status("tf.js.unstable", "ยังจับใบหน้าได้ไม่นิ่งพอ ลองหน้าตรงและอยู่นิ่ง ๆ อีกครั้ง", null, "err"); return; }
      addMember(analyse(capt.average()));
      addedStatus();
    } catch (e) { console.error(e); status("tf.js.fail", "อ่านไม่สำเร็จ ลองอีกครั้ง", null, "err"); }
    finally { $("#tfCount").hidden = true; busy = false; syncRead(); }
  });

  $("#tfFile").addEventListener("change", async function () {
    var inp = /** @type {HTMLInputElement} */ ($("#tfFile")), f = inp.files && inp.files[0]; inp.value = "";
    if (!f) return;
    if (!$("#tfConsent").checked) { status("tf.js.needConsent", "ติ๊กยินยอมของสมาชิกคนนี้ก่อน", null, "err"); return; }
    status("tf.js.uploading", "กำลังอ่านรูป (รูปไม่ถูกบันทึก)...");
    var url = URL.createObjectURL(f);
    try {
      await loadModels();
      var img = new Image();
      await new Promise(function (res, rej) { img.onload = res; img.onerror = rej; img.src = url; });
      var sc = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight)), cv = document.createElement("canvas");
      cv.width = Math.round(img.naturalWidth * sc); cv.height = Math.round(img.naturalHeight * sc); cv.getContext("2d").drawImage(img, 0, 0, cv.width, cv.height);
      var list = await detectAll(cv), pk = FR.pickFace(list, null, cv.width, cv.height);
      cv.width = cv.height = 0;
      if (pk.index < 0) { status("tf.js.noFace", "ไม่พบใบหน้าในรูปนี้ ลองรูปหน้าตรงที่ชัดกว่านี้", null, "err"); return; }
      addMember(analyse(list[pk.index].pts));
      addedStatus();
    } catch (e) { console.error(e); status("tf.js.fail", "อ่านไม่สำเร็จ ลองอีกครั้ง", null, "err"); }
    finally { URL.revokeObjectURL(url); }
  });

  var noAttach = false;
  function addedStatus() {
    if (noAttach) { noAttach = false; status("tf.js.nickDrop", "เพิ่มการ์ดแล้ว — ชื่อเล่นที่ดูเหมือนรหัสผู้สมัคร อีเมล หรือเบอร์โทรไม่ถูกใช้ เพราะผลนี้แนบกับข้อมูลผู้สมัครไม่ได้", null, "err"); }
    else status("tf.js.added", "เพิ่มการ์ดแล้ว — สมาชิกคนต่อไปติ๊กยินยอมแล้วกดอ่านได้เลย", null, "ok");
  }
  function label(m, i) { return m.nick || T("tf.js.member", "สมาชิก {n}", { n: i + 1 }); }
  function renderCards() {
    $("#tfCardsWrap").hidden = !members.length;
    $("#tfCards").innerHTML = members.map(function (m, i) {
      return '<article class="tcard" data-id="' + m.id + '" data-role="' + m.role + '" style="--c:' + COLOR[m.role] + '">' +
        '<div class="th"><span class="ic">' + icon(m.role) + '</span><div><span class="who">' + esc(label(m, i)) + '</span><h3>' + esc(R(m.role, "name")) + "</h3></div>" +
        '<button type="button" class="del" data-del="' + m.id + '" aria-label="' + esc(T("tf.js.remove", "ลบการ์ดของ {n}", { n: label(m, i) })) + '">×</button></div>' +
        '<p class="tag">' + esc(R(m.role, "tag")) + "</p>" +
        '<ul class="str"><li>' + esc(RS(m.role, 0)) + "</li><li>" + esc(RS(m.role, 1)) + "</li></ul>" +
        '<p><b>' + esc(T("tf.js.power", "พลังพิเศษ:")) + "</b> " + esc(R(m.role, "power")) + "</p>" +
        '<p><b>' + esc(T("tf.js.work", "ทำงานด้วยกันให้สนุก:")) + "</b> " + esc(R(m.role, "work")) + "</p>" +
        (m.second ? '<p class="sec">' + esc(T("tf.js.second", "เสริมด้วยมุม{r}", { r: R(m.second, "name") })) + "</p>" : "") +
        '<p class="el">' + esc(T("tf.js.el", "รูปหน้าธาตุ{e} ตามตำราโหงวเฮ้ง: {t}", { e: elName(m.el), t: elTrait(m.el) })) + "</p>" +
        '<p class="ice"><b>' + esc(T("tf.js.ice", "คำถามละลายพฤติกรรม:")) + "</b> " + esc(R(m.role, "ice")) + "</p>" +
        '<p class="tf-na">' + esc(T("tf.s.na", TF.NOT_ASSESSMENT)) + "</p></article>";
    }).join("");
  }
  var PAT = {
    empty: ["ยังไม่มีสมาชิก", "เพิ่มการ์ดของสมาชิกอย่างน้อย 2 คนเพื่อดูภาพรวมของทีม"],
    solo: ["เริ่มต้นแล้ว!", "มีการ์ดใบแรกแล้ว ชวนเพื่อนร่วมทีมมาอ่านต่อเพื่อดูว่าทีมเราผสมกันแบบไหน"],
    same: ["ทีม{r}ใจเดียวกัน", "ทุกคนในทีมมีพลังแบบ{r}เหมือนกัน เข้าขากันง่ายและไปทางเดียวกันได้เร็ว ลองผลัดกันหยิบบทบาทอื่นด้านล่างมาเล่นเพื่อเพิ่มมุมมองใหม่ ๆ"],
    balanced: ["ทีมครบเครื่อง", "ทีมเรามีบทบาทหลากหลายเกือบครบทุกสี เหมือนวงดนตรีที่มีครบทุกเครื่อง แต่ละคนผลัดกันเด่นได้ตามจังหวะงาน"],
    dominant: ["ทีมสาย{r}", "ทีมเรามีพลังแบบ{r}เป็นเสียงหลัก ทำให้ทีมไปในทิศทางเดียวกันได้เร็ว ลองผลัดกันหยิบบทบาทอื่นมาเล่นบ้างเพื่อเพิ่มสีสัน"],
    duo: ["ทีมคู่หู", "ทีมเรามีสองพลังหลักที่เติมกันพอดี: {a} กับ {b} จับคู่ให้ทำงานด้วยกันแล้วจะได้ทั้งความคิดและการลงมือ"],
    mixed: ["ทีมหลากสี", "ทีมเรามีหลายบทบาทผสมกัน ทุกคนเอาจุดเด่นของตัวเองมาเติมให้กันได้ในแต่ละช่วงของงาน"]
  };
  function renderSummary() {
    var s = TF.teamSummary(members), p = PAT[s.pattern];
    var team = $("#tfTeam").value.replace(/[<>{}]/g, "").trim().slice(0, 40);
    var dropTeam = TF.recruitLike(team);
    $("#tfTeamWarn").textContent = dropTeam ? T("tf.js.teamDrop", "ไม่ใช้ชื่อทีมนี้: กิจกรรมนี้ใช้กับการสรรหา การสัมภาษณ์ หรือการประเมินไม่ได้") : "";
    if (dropTeam) team = "";
    var vars = { r: s.dominant ? R(s.dominant, "name") : s.pattern === "same" ? R(s.present[0], "name") : "", a: s.present[0] ? R(s.present[0], "name") : "", b: s.present[1] ? R(s.present[1], "name") : "" };
    $("#tfSumTitle").textContent = (team ? team + " · " : "") + T("tf.pat." + s.pattern + ".t", p[0], vars);
    $("#tfSumText").textContent = T("tf.pat." + s.pattern + ".x", p[1], vars);
    $("#tfBars").innerHTML = s.n ? TF.IDS.map(function (id) {
      var pct = Math.round(s.counts[id] / s.n * 100);
      return '<li style="--c:' + COLOR[id] + '"><span class="bl">' + icon(id) + esc(R(id, "name")) + '</span><span class="bar"><i style="width:' + pct + '%"></i></span><span class="bn">' + s.counts[id] + "</span></li>";
    }).join("") : "";
    $("#tfMissing").hidden = !(s.n >= 2 && s.missing.length);
    $("#tfMissList").innerHTML = s.n >= 2 ? s.missing.map(function (id) { return "<li><b>" + esc(R(id, "name")) + ":</b> " + esc(R(id, "borrow")) + "</li>"; }).join("") : "";
    $("#tfIce").hidden = s.n < 2;
    $("#tfIceList").innerHTML = s.present.map(function (id) { return "<li>" + esc(R(id, "ice")) + "</li>"; }).join("");
    $("#tfReset").disabled = !s.n;
    W.__LQ_TF.summary = s;
  }
  $("#tfTeam").addEventListener("input", renderSummary);
  $("#tfCards").addEventListener("click", function (e) {
    var b = e.target.closest("[data-del]"); if (!b) return;
    members = members.filter(function (m) { return m.id !== +b.dataset.del; }); renderCards(); renderSummary();
  });
  $("#tfReset").addEventListener("click", function () {
    if (!confirm(T("tf.js.resetQ", "ลบการ์ดทั้งหมดและเริ่มทีมใหม่หรือไม่"))) return;
    members = []; renderCards(); renderSummary();
  });
  $("#tfPrint").addEventListener("click", function () { window.print(); });
  window.addEventListener("pagehide", function () { try { camera.stop(); } catch (e) { /* ignore */ } });
  window.addEventListener("lq-lang", function () { renderCards(); renderSummary(); syncRead(); if (lastStatus) status(lastStatus[0], lastStatus[1], lastStatus[2], lastStatus[3]); });

  /* record parameters in the link (e.g. ?cand=C-014) are ignored and removed from the address bar */
  (function () {
    var q = new URLSearchParams(location.search), hit = false;
    ["cand", "candidate", "applicant", "record", "employee", "emp", "id"].forEach(function (k) { if (q.has(k)) { q.delete(k); hit = true; } });
    if (hit) { $("#tfGuard").hidden = false; try { history.replaceState(null, "", location.pathname + (q.toString() ? "?" + q : "") + location.hash); } catch (e) { /* ignore */ } }
  })();
  W.__LQ_TF = { get members() { return members; }, addFromPts: function (pts) { addMember(analyse(pts)); addedStatus(); }, summary: null };
  renderCards(); renderSummary(); syncRead();
})();
