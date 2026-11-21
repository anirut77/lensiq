/* lensiq-device-data.js — "my data on this device": save to a file / load from a file (owner decision D-4, 2026-11-19;
 * docs/PRODUCTION-MOVE-PLAN.md §2.7). What LENSIQ keeps in a browser belongs to that web address. When the site moves, the
 * person saves it here on the old address and loads the file on the new one. No server is involved: the file is made and
 * read in the browser, nothing is sent anywhere, and only the person's own settings and records on THIS device are read.
 *
 * Switch: window.LENSIQ_DEVICE_EXPORT — OFF unless exactly true, and always off in a customer bundle (the operator lock
 * LENSIQ_RESEARCH_DEMO === false, tools/build-site.mjs --customer). Off = nothing is drawn: the slot on privacy.html stays
 * hidden and empty.
 *
 * Only the allow-list ITEMS is read or written (localStorage only; never IndexedDB, never sessionStorage):
 *   settings: language, catalogue filter, nutrition display, Merit tradition
 *   age:      the 18+ "read it straight" confirmation and choice (written on load only after the person ticks 18+ again)
 *   records:  the pet card collection — only when the person ticks this group
 *   (the medicine look-up history lq-med-history is left out until counsel answers: owner item 215, 2026-11-21)
 * Never: sign-in tokens, the tester code, consents, owner / admin keys, quote requests, business stores (Attendance, Exam,
 * Gate, Crowd …), images, face data, the medicine look-up history — see EXCLUDED. Every value is checked; images (data: / blob: URLs) and over-long
 * values are left out. Tests: tests/unit/device-data-d4.test.js, tests/e2e/device-data-d4.e2e.mjs (locked).
 *
 *   LQDeviceData.enabled(win) · collect(storage, groups) · build(storage, groups, now) · serialize(obj) · fileName(now)
 *   parse(text) -> {ok, error, items, unknown, invalid, needsAdult} · apply(storage, parsed, {adultConfirmed}) -> {written, skipped}
 */
(function (root) {
  "use strict";
  var FORMAT = "lensiq-device-data", VERSION = 1, MAX_FILE = 262144, MAX_VALUE = 65536;
  var GROUPS = ["settings", "age", "records"], DEFAULT_GROUPS = ["settings", "age"];
  var STRAIGHT = "lq-fortune-straight";
  var IMAGE_RE = /\bdata:[^,\s]{0,100},|\bblob:/i;

  /** @param {any} v */
  var plain = function (v) { return !!v && typeof v === "object" && !Array.isArray(v) && Object.getPrototypeOf(v) === Object.prototype; };
  /** @param {string} s */
  var json = function (s) { try { return { ok: true, v: JSON.parse(s) }; } catch (e) { return { ok: false, v: null }; } };
  /** @param {string[]} list @returns {(s: string) => boolean} */
  var oneOf = function (list) { return function (s) { return list.indexOf(s) >= 0; }; };

  /** @type {Array<{key: string, group: string, label: Record<string, string>, check: (s: string) => boolean}>} */
  var ITEMS = [
    { key: "lq-lang", group: "settings", label: { th: "ภาษาของเว็บไซต์", en: "Site language", zh: "网站语言" }, check: oneOf(["th", "en", "zh"]) },
    { key: "lq-sol-filter", group: "settings", label: { th: "ตัวกรองหน้ารวมโซลูชัน", en: "Solutions catalogue filter", zh: "解决方案目录筛选" }, check: oneOf(["all", "now", "pilot", "soon"]) },
    { key: "lq-nut-hide-kcal", group: "settings", label: { th: "ซ่อนแคลอรีในหน้าโภชนาการ", en: "Hide calories on the nutrition page", zh: "在营养页面隐藏热量" }, check: oneOf(["1"]) },
    { key: "lq-merit-tradition", group: "settings", label: { th: "ความเชื่อที่เลือกในหน้าทำบุญ", en: "Tradition chosen on the Merit page", zh: "在祈福页面选择的信仰传统" },
      check: oneOf(["thai_buddhist", "chinese_folk", "hindu_brahman", "general", "off"]) },
    { key: STRAIGHT, group: "age", label: { th: "การยืนยันอายุ 18 ปีขึ้นไปและตัวเลือก \"ดูตรง ๆ\"", en: "18+ confirmation and the \"read it straight\" choice", zh: "18 岁以上确认及“直说”选项" },
      check: function (s) {
        var j = json(s);
        if (!j.ok || !plain(j.v)) return false;
        var k = Object.keys(j.v).sort();
        return k.length === 2 && k[0] === "adult" && k[1] === "straight" && typeof j.v.adult === "boolean" && typeof j.v.straight === "boolean";
      } },
    { key: "lq-pet-zodiac-v1", group: "records", label: { th: "การ์ดสัตว์เลี้ยงที่สะสมไว้", en: "Pet card collection", zh: "收集的宠物卡片" },
      check: function (s) {
        var j = json(s);
        if (!j.ok || !plain(j.v) || j.v.v !== 1 || !plain(j.v.found) || Object.keys(j.v).length !== 2) return false;
        var f = j.v.found;
        return Object.keys(f).length <= 50 && Object.keys(f).every(function (k) { return /^[a-z_]{1,20}$/.test(k) && typeof f[k] === "string" && /^\d{4}-\d\d-\d\d$/.test(f[k]); });
      } }
  ];
  /** keys that are never read into a file or written from one (documentation for counsel and tests; the allow-list rules).
   *  lq-med-history (medicine look-up history, can reveal health information): excluded until counsel answers (owner item
   *  215, 2026-11-21; docs/PDPA-NOTES-FOR-COUNSEL.md D-4 question b) */
  var EXCLUDED = ["lq-member-session", "lq-tester", "lq-owner", "lq-admin-dev", "lq-ai-consent", "lq-leads", "lq-pending-claims",
    "lq-research-demo", "lq-profile", "lq-report-log", "lq-guest-reads", "lq-camcap", "lq-i18n-debug", "lq-med-history", "lensiq-*", "att-*", "lqcr-*", "lqx-*"];

  /** @type {Record<string, Record<string, string>>} */
  var GROUP_LABEL = {
    settings: { th: "การตั้งค่า (ภาษา ตัวกรอง การแสดงผล)", en: "Settings (language, filters, display)", zh: "设置（语言、筛选、显示）" },
    age: { th: "การยืนยันอายุ 18 ปีขึ้นไป", en: "18+ confirmation", zh: "18 岁以上确认" },
    records: { th: "บันทึกของฉันในเครื่องนี้ (การ์ดสัตว์เลี้ยงที่สะสมไว้)", en: "My records on this device (pet card collection)", zh: "我在本设备上的记录（收集的宠物卡片）" }
  };

  /** @type {Record<string, Record<string, string>>} */
  var STR = {
    th: {
      title: "ข้อมูลของฉันในเครื่องนี้: บันทึกเป็นไฟล์ / โหลดจากไฟล์",
      intro: "การตั้งค่าและบันทึกที่ LENSIQ เก็บไว้ในเบราว์เซอร์นี้ผูกกับที่อยู่เว็บไซต์ ถ้าเว็บไซต์ย้ายที่อยู่ คุณบันทึกข้อมูลเป็นไฟล์ที่นี่ แล้วโหลดไฟล์นั้นที่เว็บไซต์ใหม่ได้",
      privacy: "ไฟล์สร้างและอ่านในเครื่องของคุณเท่านั้น ไม่มีการส่งข้อมูลไปที่ใด ไม่มีรูปภาพ ข้อมูลใบหน้า รหัสผ่าน รหัสผู้ทดสอบ หรือการเข้าสู่ระบบอยู่ในไฟล์ เก็บไฟล์ไว้ในที่ปลอดภัย",
      exportH: "บันทึกเป็นไฟล์", groupsLegend: "เลือกสิ่งที่จะบันทึก", listH: "สิ่งที่จะอยู่ในไฟล์:", save: "บันทึกไฟล์",
      saved: "บันทึกไฟล์แล้ว ({n} รายการ)", nothing: "ยังไม่มีข้อมูลในกลุ่มที่เลือกบนเครื่องนี้",
      importH: "โหลดจากไฟล์", importHint: "เลือกไฟล์ที่บันทึกจาก LENSIQ ระบบจะแสดงรายการก่อน และยังไม่เปลี่ยนอะไรจนกว่าคุณจะกด \"ใช้ข้อมูลนี้\"",
      choose: "เลือกไฟล์", previewH: "ข้อมูลในไฟล์ที่จะใช้:", overwrite: "ค่าที่มีอยู่แล้วในเครื่องนี้จะถูกแทนที่",
      unknown: "ข้ามรายการที่ระบบนี้ไม่รับ {n} รายการ (ไม่ถูกบันทึก)",
      adult: "ฉันอายุ 18 ปีขึ้นไป (ต้องยืนยันใหม่บนเครื่องนี้ จึงจะใช้การยืนยันอายุจากไฟล์)",
      apply: "ใช้ข้อมูลนี้", applied: "ใช้ข้อมูลแล้ว {n} รายการ โหลดหน้าใหม่เพื่อให้มีผล",
      adultSkipped: "ไม่ได้ใช้การยืนยันอายุ 18 ปีขึ้นไป เพราะยังไม่ได้ติ๊กยืนยัน",
      bad: "ไฟล์นี้มีข้อมูลที่ไม่ถูกต้อง จึงไม่ได้ใช้อะไรเลย", notOurs: "ไฟล์นี้ไม่ใช่ไฟล์ข้อมูลในเครื่องของ LENSIQ", tooBig: "ไฟล์ใหญ่เกินไป",
      empty: "ไฟล์นี้ไม่มีข้อมูลที่ใช้ได้", failed: "อ่านไฟล์ไม่สำเร็จ ลองใหม่อีกครั้ง"
    },
    en: {
      title: "My data on this device: save to a file / load from a file",
      intro: "The settings and records LENSIQ keeps in this browser belong to this web address. If the site moves, save them to a file here and load that file on the new site.",
      privacy: "The file is made and read on your device only; nothing is sent anywhere. It holds no images, no face data, no passwords, no tester code and no sign-in. Keep the file somewhere safe.",
      exportH: "Save to a file", groupsLegend: "Choose what to save", listH: "What the file will hold:", save: "Save file",
      saved: "File saved ({n} items)", nothing: "There is no data in the chosen groups on this device yet",
      importH: "Load from a file", importHint: "Choose a file saved from LENSIQ. You see the list first; nothing changes until you press \"Use this data\".",
      choose: "Choose file", previewH: "Data in the file that will be used:", overwrite: "Values already on this device will be replaced",
      unknown: "Skipped {n} item(s) this site does not accept (not saved)",
      adult: "I am 18 or older (confirm again on this device to use the age confirmation from the file)",
      apply: "Use this data", applied: "Used {n} item(s). Reload the page for them to take effect",
      adultSkipped: "The 18+ confirmation was not used because the box was not ticked",
      bad: "This file holds data that is not valid, so nothing was used", notOurs: "This is not a LENSIQ device-data file", tooBig: "The file is too large",
      empty: "This file holds no data that can be used", failed: "Could not read the file; please try again"
    },
    zh: {
      title: "我在本设备上的数据：保存为文件 / 从文件载入",
      intro: "LENSIQ 保存在此浏览器中的设置和记录属于当前网址。如果网站迁移，请在此将其保存为文件，然后在新网站上载入该文件。",
      privacy: "文件只在您的设备上生成和读取，不会发送到任何地方。文件中不含图像、人脸数据、密码、测试码或登录信息。请妥善保管文件。",
      exportH: "保存为文件", groupsLegend: "选择要保存的内容", listH: "文件将包含：", save: "保存文件",
      saved: "文件已保存（{n} 项）", nothing: "本设备上所选类别中还没有数据",
      importH: "从文件载入", importHint: "选择从 LENSIQ 保存的文件。系统会先显示清单，在您点击“使用这些数据”之前不会更改任何内容。",
      choose: "选择文件", previewH: "文件中将使用的数据：", overwrite: "本设备上已有的值将被替换",
      unknown: "已跳过本网站不接受的 {n} 项（未保存）",
      adult: "我已年满 18 岁（需在本设备上重新确认，才能使用文件中的年龄确认）",
      apply: "使用这些数据", applied: "已使用 {n} 项。请重新载入页面使其生效",
      adultSkipped: "未勾选确认，因此未使用 18 岁以上确认",
      bad: "此文件包含无效数据，因此未使用任何内容", notOurs: "这不是 LENSIQ 设备数据文件", tooBig: "文件过大",
      empty: "此文件中没有可用的数据", failed: "无法读取文件，请重试"
    }
  };

  /** @param {string} key */
  function itemOf(key) { for (var i = 0; i < ITEMS.length; i++) if (ITEMS[i].key === key) return ITEMS[i]; return null; }
  /** @param {string} key @param {any} value @returns {boolean} */
  function valueOk(key, value) {
    var it = itemOf(key);
    if (!it || typeof value !== "string" || value.length > MAX_VALUE || IMAGE_RE.test(value)) return false;
    try { return it.check(value) === true; } catch (e) { return false; }
  }
  /** @param {any} win */
  function enabled(win) { return !!win && win.LENSIQ_DEVICE_EXPORT === true && win.LENSIQ_RESEARCH_DEMO !== false; }
  /** @param {any} groups @returns {string[]} */
  function normGroups(groups) { var g = Array.isArray(groups) ? groups : []; return GROUPS.filter(function (x) { return g.indexOf(x) >= 0; }); }
  /** @param {any} storage @param {string} k */
  function read(storage, k) { try { return storage ? storage.getItem(k) : null; } catch (e) { return null; } }

  /** @param {any} storage @param {any} groups @returns {{items: Record<string, string>, skipped: Array<{key: string, why: string}>}} */
  function collect(storage, groups) {
    var g = normGroups(groups), items = /** @type {Record<string, string>} */ ({}), skipped = /** @type {Array<{key: string, why: string}>} */ ([]);
    ITEMS.forEach(function (it) {
      if (g.indexOf(it.group) < 0) return;
      var v = read(storage, it.key);
      if (v == null) return;
      if (valueOk(it.key, v)) items[it.key] = v; else skipped.push({ key: it.key, why: "invalid" });
    });
    return { items: items, skipped: skipped };
  }
  /** @param {any} storage @param {any} groups @param {number} [now] */
  function build(storage, groups, now) {
    var g = normGroups(groups);
    return { format: FORMAT, version: VERSION, exportedAt: new Date(now == null ? Date.now() : now).toISOString(), groups: g, items: collect(storage, g).items };
  }
  /** @param {any} obj */
  function serialize(obj) { return JSON.stringify(obj, null, 2); }
  /** @param {number} [now] */
  function fileName(now) {
    var d = new Date(now == null ? Date.now() : now), p = function (/** @type {number} */ n) { return (n < 10 ? "0" : "") + n; };
    return "lensiq-device-data-" + d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) + ".json";
  }

  /** @param {any} text @returns {{ok: boolean, error: string, items: Record<string, string>, unknown: string[], invalid: string[], needsAdult: boolean}} */
  function parse(text) {
    var out = { ok: false, error: "", items: /** @type {Record<string, string>} */ ({}), unknown: /** @type {string[]} */ ([]), invalid: /** @type {string[]} */ ([]), needsAdult: false };
    if (typeof text !== "string") { out.error = "notOurs"; return out; }
    if (text.length > MAX_FILE) { out.error = "tooBig"; return out; }
    var j = json(text);
    if (!j.ok) { out.error = "notOurs"; return out; }
    var o = j.v;
    if (!plain(o) || o.format !== FORMAT || o.version !== VERSION || !plain(o.items)) { out.error = "notOurs"; return out; }
    Object.keys(o.items).forEach(function (k) {
      if (!itemOf(k)) { out.unknown.push(k); return; }
      if (valueOk(k, o.items[k])) out.items[k] = o.items[k]; else out.invalid.push(k);
    });
    if (out.invalid.length) { out.items = {}; out.error = "bad"; return out; }
    if (out.items[STRAIGHT] != null) { var s = json(out.items[STRAIGHT]); out.needsAdult = !!(s.ok && s.v.adult === true); }
    out.ok = true;
    return out;
  }
  /** @param {any} storage @param {any} parsed @param {{adultConfirmed?: boolean}} [o] @returns {{written: string[], skipped: string[]}} */
  function apply(storage, parsed, o) {
    var written = /** @type {string[]} */ ([]), skipped = /** @type {string[]} */ ([]);
    if (!parsed || parsed.ok !== true || !plain(parsed.items)) return { written: written, skipped: Object.keys((parsed && parsed.items) || {}) };
    ITEMS.forEach(function (it) {
      var v = parsed.items[it.key];
      if (v == null) return;
      if (!valueOk(it.key, v)) { skipped.push(it.key); return; }
      if (it.key === STRAIGHT && parsed.needsAdult && !(o && o.adultConfirmed === true)) { skipped.push(it.key); return; }
      try { storage.setItem(it.key, v); written.push(it.key); } catch (e) { skipped.push(it.key); }
    });
    return { written: written, skipped: skipped };
  }

  /* ---------------- the section on privacy.html (drawn only when enabled) ---------------- */
  /** @param {Document} doc */
  function langOf(doc) { var l = String(doc.documentElement.lang || "th").toLowerCase(); return l.indexOf("zh") === 0 ? "zh" : l.indexOf("en") === 0 ? "en" : "th"; }

  /** @param {HTMLElement} slot @param {any} win */
  function mount(slot, win) {
    var doc = slot.ownerDocument, st = { groups: DEFAULT_GROUPS.slice(), parsed: /** @type {any} */ (null), msg: "", impMsg: "" };
    /** @param {string} tag @param {Record<string, string>} [attrs] @param {string} [text] */
    var el = function (tag, attrs, text) {
      var e = doc.createElement(tag);
      Object.keys(attrs || {}).forEach(function (k) { e.setAttribute(k, /** @type {Record<string, string>} */ (attrs)[k]); });
      if (text != null) e.textContent = text;
      return e;
    };
    var BTN = "min-height:44px;max-width:100%;white-space:normal;margin:.4em 0";
    var ls = function () { try { return win.localStorage; } catch (e) { return null; } };

    function render() {
      var l = langOf(doc), T = STR[l];
      /** @param {string} k @param {number} [n] */
      var t = function (k, n) { return String(T[k]).replace("{n}", String(n == null ? "" : n)); };
      slot.textContent = "";
      var sec = el("section", { class: "lq-dd", "aria-labelledby": "lqDdH", style: "max-width:100%;overflow-wrap:anywhere" });
      sec.appendChild(el("h2", { id: "lqDdH" }, T.title));
      sec.appendChild(el("p", {}, T.intro));
      sec.appendChild(el("p", { class: "note" }, T.privacy));
      // save
      sec.appendChild(el("h3", {}, T.exportH));
      var fs = el("fieldset", { style: "border:0;padding:0;margin:0" });
      fs.appendChild(el("legend", {}, T.groupsLegend));
      GROUPS.forEach(function (g) {
        var row = el("div", { style: "margin:.3em 0" }), box = /** @type {HTMLInputElement} */ (el("input", { type: "checkbox", id: "lqDdG-" + g }));
        box.checked = st.groups.indexOf(g) >= 0;
        box.addEventListener("change", function () {
          st.groups = GROUPS.filter(function (x) { var b = /** @type {HTMLInputElement|null} */ (doc.getElementById("lqDdG-" + x)); return !!b && b.checked; });
          st.msg = ""; render();
        });
        row.appendChild(box); row.appendChild(doc.createTextNode(" "));
        row.appendChild(el("label", { for: "lqDdG-" + g }, GROUP_LABEL[g][l]));
        fs.appendChild(row);
      });
      sec.appendChild(fs);
      var have = collect(ls(), st.groups).items, keys = Object.keys(have);
      sec.appendChild(el("p", {}, keys.length ? T.listH : T.nothing));
      var ul = el("ul", { id: "lqDdList" });
      ITEMS.forEach(function (it) { if (have[it.key] != null) ul.appendChild(el("li", {}, it.label[l])); });
      sec.appendChild(ul);
      var save = /** @type {HTMLButtonElement} */ (el("button", { type: "button", id: "lqDdSave", class: "btn", style: BTN }, T.save));
      save.disabled = !keys.length;
      save.addEventListener("click", function () {
        var obj = build(ls(), st.groups), n = Object.keys(obj.items).length;
        if (!n) { st.msg = T.nothing; render(); return; }
        var url = URL.createObjectURL(new Blob([serialize(obj)], { type: "application/json" }));
        var a = /** @type {HTMLAnchorElement} */ (el("a", { href: url, download: fileName() }));
        doc.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { URL.revokeObjectURL(url); }, 5000);
        st.msg = t("saved", n); render();
      });
      sec.appendChild(save);
      sec.appendChild(el("p", { id: "lqDdMsg", role: "status" }, st.msg));
      // load
      sec.appendChild(el("h3", {}, T.importH));
      sec.appendChild(el("p", {}, T.importHint));
      var lab = el("label", { for: "lqDdFile", style: "display:block;margin:.3em 0" }, T.choose);
      var file = /** @type {HTMLInputElement} */ (el("input", { type: "file", id: "lqDdFile", accept: "application/json,.json", style: "max-width:100%" }));
      file.addEventListener("change", function () {
        var f = file.files && file.files[0];
        st.parsed = null; st.impMsg = "";
        var m = doc.getElementById("lqDdImpMsg"); if (m) m.textContent = "";
        if (!f) { render(); return; }
        if (f.size > MAX_FILE) { st.impMsg = T.tooBig; render(); return; }
        f.text().then(function (txt) {
          var p = parse(txt);
          st.parsed = p;
          st.impMsg = p.ok ? (Object.keys(p.items).length ? "" : T.empty) : T[p.error] || T.bad;
          render();
        }, function () { st.impMsg = T.failed; render(); });
      });
      sec.appendChild(lab); sec.appendChild(file);
      var pv = el("div", { id: "lqDdPreview" }), p = st.parsed, usable = !!(p && p.ok && Object.keys(p.items).length);
      if (usable) {
        pv.appendChild(el("p", {}, T.previewH));
        var pl = el("ul", {});
        ITEMS.forEach(function (it) { if (p.items[it.key] != null) pl.appendChild(el("li", {}, it.label[l])); });
        pv.appendChild(pl);
        pv.appendChild(el("p", { class: "note" }, T.overwrite));
        if (p.unknown.length) pv.appendChild(el("p", { class: "note" }, t("unknown", p.unknown.length)));
        if (p.needsAdult) {
          var ar = el("div", { style: "margin:.3em 0" }), ab = el("input", { type: "checkbox", id: "lqDdAdult" });
          ar.appendChild(ab); ar.appendChild(doc.createTextNode(" ")); ar.appendChild(el("label", { for: "lqDdAdult" }, T.adult));
          pv.appendChild(ar);
        }
      }
      sec.appendChild(pv);
      var go = /** @type {HTMLButtonElement} */ (el("button", { type: "button", id: "lqDdApply", class: "btn", style: BTN }, T.apply));
      go.disabled = !usable;
      go.addEventListener("click", function () {
        if (!st.parsed || !st.parsed.ok) return;
        var adult = /** @type {HTMLInputElement|null} */ (doc.getElementById("lqDdAdult"));
        var r = apply(ls(), st.parsed, { adultConfirmed: !!(adult && adult.checked) });
        var m = t("applied", r.written.length);
        if (r.skipped.indexOf(STRAIGHT) >= 0) m += ". " + T.adultSkipped;
        var out = doc.getElementById("lqDdImpMsg"); if (out) out.textContent = m;
        st.impMsg = m;
      });
      sec.appendChild(go);
      sec.appendChild(el("p", { id: "lqDdImpMsg", role: "status" }, st.impMsg));
      slot.appendChild(sec);
    }
    render();
    slot.hidden = false;
    var last = langOf(doc);
    var again = function () { var l = langOf(doc); if (l !== last) { last = l; render(); } };
    win.addEventListener("lq-lang", again);
    if (typeof MutationObserver === "function") new MutationObserver(again).observe(doc.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }

  var api = { FORMAT: FORMAT, VERSION: VERSION, MAX_FILE: MAX_FILE, MAX_VALUE: MAX_VALUE, GROUPS: GROUPS, DEFAULT_GROUPS: DEFAULT_GROUPS,
    ITEMS: ITEMS, EXCLUDED: EXCLUDED, GROUP_LABEL: GROUP_LABEL, STR: STR, enabled: enabled, valueOk: valueOk, collect: collect, build: build,
    serialize: serialize, fileName: fileName, parse: parse, apply: apply, mount: mount };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else {
    root.LQDeviceData = api;
    var doc = root.document, slot = doc && doc.getElementById("lqDeviceData");
    if (slot && enabled(root)) mount(slot, root);
  }
})(typeof window !== "undefined" ? window : globalThis);
