/* lensiq-report.js — "แจ้งปัญหาคำทำนายนี้" / "Report a problem with this reading" on every fortune result.
 *
 * Loaded by nav.js on the fortune pages (no extra <script> tag). Works with no backend:
 *   - it wraps FortuneAI.renderSections(container, result, opts) from the outside (same arguments, same return value,
 *     the reading is never changed) and puts a small "report" button right AFTER the reading container, so the button
 *     sits outside the reading's lang="th"/"zh-Hans" block and survives re-renders without duplicating;
 *   - the button opens a <dialog>: problem type, optional note, "attach the reading text" (on by default) and an
 *     editable preview, so the visitor sees and can redact exactly what would be sent;
 *   - three ways out, none automatic: open the visitor's own e-mail app (mailto:, recipient = window.LENSIQ_REPORT_EMAIL
 *     when the owner sets it, otherwise blank), copy to the clipboard, or save on this device (localStorage
 *     "lq-report-log", newest 20, for booth operators who collect reports at the end of the day).
 * Nothing is sent over the network by this file. The report format ("LENSIQ reading report v1") is what
 * tools/fortune-review-ingest.mjs --reports reads, so collected reports join the native-speaker review.
 *
 * Owner hooks: window.LENSIQ_REPORT_EMAIL = "support@example.com" (in lensiq-config.js) ;
 *   LQReport.attach(container, result) for pages that render readings without FortuneAI.renderSections ;
 *   LQReport.open(result) ; LQReport.list() / LQReport.clear() for the saved reports ; LQReport.format(result, fields). */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;
  if (W.LQReport) return;
  var doc = root.document;
  var KEY = "lq-report-log", MAX = 20, MAILTO_MAX = 1800;
  var T = function (/** @type {string} */ k, /** @type {string} */ th, /** @type {any} */ v) {
    var s = W.LQI18N ? W.LQI18N.tf(k, th, v) : th;
    return v ? String(s).replace(/\{(\w+)\}/g, function (m, x) { return v[x] != null ? v[x] : m; }) : s;
  };
  var CATS = [
    ["unnatural", "ภาษาไม่เป็นธรรมชาติ อ่านแล้วสะดุด"],
    ["harsh", "คำเตือนแรงหรือน่ากลัวเกินไป"],
    ["wrong", "ไม่ตรงตามตำราหรือความเชื่อ"],
    ["unsafe", "เนื้อหาไม่เหมาะสมหรืออาจเป็นอันตราย"],
    ["translation", "ภาษาจีนหรือคำแปลผิด"],
    ["other", "อื่น ๆ"]
  ];

  /* ---------- report text (pure) ---------- */
  /** @param {any} res @returns {string} */
  function readingText(res) {
    if (!res) return "";
    var out = [];
    var sm = res.summary;
    if (sm && Array.isArray(sm.lines)) { out.push("[" + (sm.title || "summary") + "]"); sm.lines.forEach(function (/** @type {any} */ l) { out.push((l.k || "") + " " + (l.t || "")); }); }
    (res.sections || []).forEach(function (/** @type {any} */ s) { out.push("[" + (s.title || s.id || "") + "]"); (s.paragraphs || []).forEach(function (/** @type {string} */ p) { out.push(p); }); });
    var pl = res.plan;
    if (pl && Array.isArray(pl.items)) { out.push("[" + (pl.title || "plan") + "]"); pl.items.forEach(function (/** @type {any} */ x) { out.push("- " + (x.for || "") + " " + (x.t || "")); }); }
    if (res.reminder) out.push("[reminder] " + res.reminder);
    return out.join("\n");
  }
  /** @param {any} res @param {{cat?: string, note?: string, include?: boolean, page?: string, lang?: string, now?: Date}} f */
  function format(res, f) {
    f = f || {};
    var now = f.now || new Date();
    var page = f.page || (root.location ? (root.location.pathname.split("/").pop() || "index.html") : "");
    var PAGE_DOMAIN = { "faceread.html": "face", "palm.html": "palm", "horoscope.html": "horoscope", "tarot.html": "tarot", "fengshui.html": "fengshui", "numbers.html": "numbers", "iching.html": "iching", "zodiac.html": "zodiac", "astro.html": "astro", "dream.html": "dream", "bazi.html": "bazi", "taksa.html": "taksa", "lek7.html": "lek7", "lifegraph.html": "lifegraph" };
    var lines = [
      "LENSIQ reading report v1",
      "page: " + page,
      "ui_lang: " + (f.lang || (W.LQI18N ? W.LQI18N.lang : "th")),
      "reading_lang: " + (res && res.lang === "zh" ? "zh" : "th"),
      "source: " + (res && res.source === "ai" ? "ai" : "local"),
      "domain: " + (res && (res.domain || (res.facts && res.facts.domain)) || PAGE_DOMAIN[page] || "-"),
      "category: " + (f.cat || "other"),
      "date: " + now.toISOString().slice(0, 13) + ":00Z"
    ];
    lines.push("--- note ---", (f.note || "").trim() || "-");
    if (f.include !== false) lines.push("--- reading ---", readingText(res));
    return lines.join("\n");
  }

  /* ---------- saved reports (this device only) ---------- */
  function list() { try { var a = JSON.parse(root.localStorage.getItem(KEY) || "[]"); return Array.isArray(a) ? a : []; } catch (e) { return []; } }
  /** @param {string} text */
  function save(text) {
    var a = list(); a.unshift({ t: Date.now(), text: text }); a = a.slice(0, MAX);
    try { root.localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) { return -1; }
    return a.length;
  }
  function clear() { try { root.localStorage.removeItem(KEY); } catch (e) { /* storage blocked */ } }

  if (!doc) { W.LQReport = { format: format, readingText: readingText }; if (typeof module !== "undefined" && module.exports) module.exports = W.LQReport; return; }

  /* ---------- UI ---------- */
  function style() {
    if (doc.getElementById("lq-rp-style")) return;
    var st = doc.createElement("style"); st.id = "lq-rp-style";
    st.textContent =
      ".lq-rp-wrap{margin:10px 0 0;display:flex;justify-content:flex-end}" +
      ".lq-rp-btn{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:6px 12px;border:0;background:none;color:#4a5470;font:inherit;font-size:.86rem;text-decoration:underline;text-underline-offset:3px;cursor:pointer;border-radius:10px}" +
      ".lq-rp-btn:hover{color:#0e1430}.lq-rp-btn:focus-visible{outline:2px solid #0891b2;outline-offset:2px}" +
      ".lq-rp-btn svg{width:16px;height:16px;flex:none}" +
      "dialog.lq-rp{border:0;border-radius:16px;padding:0;width:min(560px,calc(100vw - 24px));max-height:calc(100vh - 24px);box-shadow:0 20px 60px rgba(14,20,48,.3);color:#121833}" +
      "dialog.lq-rp::backdrop{background:rgba(14,20,48,.45)}" +
      ".lq-rp form{padding:20px 18px 16px;display:grid;gap:12px;font-size:.95rem}" +
      ".lq-rp h2{font-size:1.15rem;margin:0;color:#0e1430}.lq-rp p{margin:0;color:#525c78;font-size:.88rem}" +
      ".lq-rp fieldset{border:1px solid #dde2ef;border-radius:12px;padding:8px 12px;margin:0}.lq-rp legend{padding:0 4px;font-weight:600;color:#0e1430}" +
      ".lq-rp label.o{display:flex;align-items:center;gap:8px;min-height:40px}" +
      ".lq-rp textarea{width:100%;font:inherit;font-size:.88rem;border:1px solid #dde2ef;border-radius:10px;padding:8px 10px;resize:vertical}" +
      ".lq-rp .row{display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end}" +
      ".lq-rp .row button{min-height:44px;border-radius:99px;padding:8px 18px;border:1.5px solid #0e1430;background:#fff;color:#0e1430;font:inherit;cursor:pointer}" +
      ".lq-rp .row button.p{background:#0e1430;color:#fff}" +
      ".lq-rp .st{min-height:1.2em;color:#0e7a4a;font-size:.88rem}" +
      "body[class*='-kiosk'] .lq-rp-wrap{display:none}@media print{.lq-rp-wrap{display:none}}";
    (doc.head || doc.documentElement).appendChild(st);
  }
  var ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 21V4m0 0h11l-1.5 4L15 12H4"/></svg>';
  /** @type {WeakMap<Element, any>} */
  var lastRes = new WeakMap();

  /** @param {Element} container @param {any} res */
  function attach(container, res) {
    if (!container || !container.parentNode || !res || !(res.sections || []).length) return;
    style();
    lastRes.set(container, res);
    var nx = container.nextElementSibling;
    if (nx && nx.classList && nx.classList.contains("lq-rp-wrap")) return; // already there: it reads lastRes on click
    var wrap = doc.createElement("div"); wrap.className = "lq-rp-wrap";
    var b = doc.createElement("button"); b.type = "button"; b.className = "lq-rp-btn";
    b.innerHTML = ICON + "<span></span>";
    /** @type {HTMLElement} */ (b.lastChild).textContent = T("rp.btn", "แจ้งปัญหาคำทำนายนี้");
    b.addEventListener("click", function () { open(lastRes.get(container), b); });
    wrap.appendChild(b);
    container.parentNode.insertBefore(wrap, container.nextSibling);
  }

  /** @type {HTMLDialogElement|null} */
  var dlg = null;
  /** @param {any} res @param {HTMLElement} [opener] */
  function open(res, opener) {
    style();
    if (dlg) dlg.remove();
    var d = /** @type {HTMLDialogElement} */ (doc.createElement("dialog"));
    d.className = "lq-rp"; d.setAttribute("aria-labelledby", "lq-rp-h");
    var f = doc.createElement("form"); f.method = "dialog";
    var h = doc.createElement("h2"); h.id = "lq-rp-h"; h.textContent = T("rp.title", "แจ้งปัญหาคำทำนาย");
    var lead = doc.createElement("p"); lead.textContent = T("rp.lead", "ช่วยเราปรับปรุงคำทำนาย เลือกประเภทปัญหาแล้วตรวจข้อความก่อนส่ง ระบบไม่ส่งข้อมูลใดโดยอัตโนมัติ");
    var fs = doc.createElement("fieldset"), lg = doc.createElement("legend"); lg.textContent = T("rp.cat.label", "ปัญหาที่พบ"); fs.appendChild(lg);
    CATS.forEach(function (c, i) {
      var l = doc.createElement("label"); l.className = "o";
      var r = doc.createElement("input"); r.type = "radio"; r.name = "lq-rp-cat"; r.value = c[0]; if (i === 0) r.checked = true;
      l.appendChild(r); l.appendChild(doc.createTextNode(T("rp.cat." + c[0], c[1]))); fs.appendChild(l);
    });
    var nl = doc.createElement("label"); nl.textContent = T("rp.note.label", "รายละเอียดเพิ่มเติม (ไม่บังคับ)");
    var note = doc.createElement("textarea"); note.rows = 2; note.maxLength = 600; nl.appendChild(note);
    var il = doc.createElement("label"); il.className = "o";
    var inc = doc.createElement("input"); inc.type = "checkbox"; inc.checked = true;
    il.appendChild(inc); il.appendChild(doc.createTextNode(T("rp.include", "แนบข้อความคำทำนาย")));
    var priv = doc.createElement("p"); priv.textContent = T("rp.privacy", "ข้อความอาจมีข้อมูลที่คุณกรอก เช่น ชื่อเล่นหรือตัวเลข ตรวจและลบออกได้ในช่องด้านล่างก่อนส่ง");
    var pl = doc.createElement("label"); pl.textContent = T("rp.preview", "ข้อความที่จะส่ง (แก้ไขได้)");
    var pv = doc.createElement("textarea"); pv.rows = 7; pv.setAttribute("lang", res && res.lang === "zh" ? "zh-Hans" : "th"); pl.appendChild(pv);
    var stat = doc.createElement("p"); stat.className = "st"; stat.setAttribute("role", "status");
    var row = doc.createElement("div"); row.className = "row";
    var mk = function (/** @type {string} */ k, /** @type {string} */ th, /** @type {boolean} */ primary) {
      var bt = doc.createElement("button"); bt.type = "button"; bt.textContent = T(k, th); if (primary) bt.className = "p"; row.appendChild(bt); return bt;
    };
    var bMail = mk("rp.email", "เปิดแอปอีเมล", true), bCopy = mk("rp.copy", "คัดลอก", false), bSave = mk("rp.save", "บันทึกในเครื่องนี้", false), bClose = mk("rp.close", "ปิด", false);
    var edited = false;
    var cat = function () { var c = /** @type {HTMLInputElement|null} */ (f.querySelector('input[name="lq-rp-cat"]:checked')); return c ? c.value : "other"; };
    var refresh = function () { if (!edited) pv.value = format(res, { cat: cat(), note: note.value, include: inc.checked }); };
    pv.addEventListener("input", function () { edited = true; });
    [note, inc].forEach(function (el) { el.addEventListener("input", function () { edited = false; refresh(); }); el.addEventListener("change", function () { edited = false; refresh(); }); });
    fs.addEventListener("change", function () { edited = false; refresh(); });
    bMail.addEventListener("click", function () {
      var to = typeof W.LENSIQ_REPORT_EMAIL === "string" && /^[^@\s<>"]+@[^@\s<>"]+$/.test(W.LENSIQ_REPORT_EMAIL) ? W.LENSIQ_REPORT_EMAIL : "";
      var body = pv.value.length > MAILTO_MAX ? pv.value.slice(0, MAILTO_MAX) + "\n…" : pv.value;
      root.location.href = "mailto:" + encodeURIComponent(to).replace(/%40/g, "@") + "?subject=" + encodeURIComponent("LENSIQ reading report: " + cat()) + "&body=" + encodeURIComponent(body);
      stat.textContent = to ? T("rp.thanks", "ขอบคุณที่ช่วยแจ้ง") : T("rp.noemail", "ยังไม่ได้ตั้งอีเมลรับเรื่อง ใส่อีเมลฝ่ายสนับสนุนจากหน้าช่วยเหลือในช่องผู้รับ");
    });
    bCopy.addEventListener("click", function () {
      var done = function () { stat.textContent = T("rp.copied", "คัดลอกแล้ว"); };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(pv.value).then(done, function () { pv.select(); });
      else { pv.select(); try { doc.execCommand("copy"); done(); } catch (e) { /* select only */ } }
    });
    bSave.addEventListener("click", function () {
      var n = save(pv.value);
      stat.textContent = n < 0 ? T("rp.savefail", "บันทึกไม่ได้ (เบราว์เซอร์ปิดพื้นที่จัดเก็บ) ใช้การคัดลอกแทน") : T("rp.saved", "บันทึกแล้ว ({n} รายการในเครื่องนี้)", { n: n });
    });
    bClose.addEventListener("click", function () { d.close(); });
    d.addEventListener("close", function () { d.remove(); dlg = null; if (opener && opener.isConnected) opener.focus(); });
    [h, lead, fs, nl, il, priv, pl, stat, row].forEach(function (el) { f.appendChild(el); });
    d.appendChild(f); doc.body.appendChild(d); dlg = d;
    refresh();
    if (typeof d.showModal === "function") d.showModal(); else { d.setAttribute("open", ""); }
    var first = /** @type {HTMLElement|null} */ (fs.querySelector("input")); if (first) first.focus();
  }

  /* ---------- hook FortuneAI.renderSections (same pattern as lensiq-fortune-hook.js) ---------- */
  var tries = 0;
  function wrap() {
    var FA = W.FortuneAI;
    if (!FA || typeof FA.renderSections !== "function") { if (tries++ < 60) setTimeout(wrap, 250); return; }
    if (FA.renderSections.__lqReport) return;
    var orig = FA.renderSections;
    /** @this {any} */
    var hooked = function (/** @type {Element} */ container, /** @type {any} */ result) {
      var out = orig.apply(this, arguments);
      try { attach(container, result); } catch (e) { /* never break a reading */ }
      return out;
    };
    hooked.__lqReport = true;
    // keep flags other wrappers set on the function they wrapped (e.g. lensiq-member.js)
    Object.keys(orig).forEach(function (k) { if (!(k in hooked)) /** @type {any} */ (hooked)[k] = /** @type {any} */ (orig)[k]; });
    FA.renderSections = hooked;
  }
  root.addEventListener("lq-lang", function () {
    doc.querySelectorAll(".lq-rp-btn span").forEach(function (s) { s.textContent = T("rp.btn", "แจ้งปัญหาคำทำนายนี้"); });
  });
  W.LQReport = { attach: attach, open: open, format: format, readingText: readingText, list: list, clear: clear };
  wrap();
})(typeof window !== "undefined" ? window : globalThis);
