/* lensiq-tester.js — tester access for the closed test (deploy plan B3 / B7; backend/src/tester.js).
 *
 * Active ONLY when the page's deploy config sets window.LENSIQ_TESTER_GATE = true (tools/build-site.mjs, medicine.html on
 * the public site). Everywhere else (the repo default, local runs, on-premise installs) there is no gate: unlocked() is
 * true, no header is added and nothing is drawn, so every page behaves exactly as before.
 *
 * With the gate on:
 *   - without ?tester=1 in the address and without a code kept for this session, NOTHING is drawn: an ordinary visitor
 *     sees the page as it was. The AI step stays hidden (lensiq-pc-ai.js asks LQTester.unlocked()) and no request for
 *     an AI feature is made;
 *   - with ?tester=1 a small "tester access" card appears in #lqTesterSlot: one password-type field. The code is checked
 *     by POST /v1/tester/check (header X-Tester-Code; never in a URL) and kept in sessionStorage for THIS browser tab
 *     session only (memory when storage is blocked). "Forget" removes it;
 *   - the card carries the privacy note for the closed tester group (TH / EN / ZH; draft for counsel). It names no
 *     processor by itself: once a tester is in, the processors are listed from the CONFIGURED chains (GET
 *     /v1/ai/providers), the same data the consent screen shows before anything is sent;
 *   - when the Worker answers "tester_required" later (code rotated or revoked) the code is forgotten and the AI step
 *     hides again (LQTester.refused()).
 *
 *   LQTester.gate() -> boolean · LQTester.unlocked() -> boolean · LQTester.headers() -> {} | {"X-Tester-Code": code}
 *   LQTester.check(code) -> Promise<"ok"|"wrong"|"locked"|"off"|"network"> · LQTester.forget() · LQTester.refused()
 * Event: window "lq-tester" after every change.
 */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;
  var KEY = "lq-tester", HEADER = "X-Tester-Code", MIN = 16;

  /** @type {Record<string, Record<string, string>>} */
  var STR = {
    th: {
      title: "สำหรับผู้ทดสอบ", intro: "ช่องนี้สำหรับกลุ่มผู้ทดสอบแบบปิดเท่านั้น ใส่รหัสที่ได้รับจากเจ้าของระบบเพื่อเปิดขั้นตอน \"ถาม AI\" และแหล่งข้อมูลที่ยังอยู่ระหว่างทดสอบ",
      label: "รหัสผู้ทดสอบ", use: "ใช้รหัสนี้ในรอบนี้", forget: "ลืมรหัสบนอุปกรณ์นี้", on: "เปิดสิทธิ์ผู้ทดสอบแล้ว (เฉพาะรอบการใช้งานนี้)",
      short: "รหัสสั้นเกินไป (อย่างน้อย 16 ตัวอักษร)", wrong: "รหัสไม่ถูกต้อง", locked: "ใส่รหัสผิดหลายครั้ง ลองใหม่ภายหลัง",
      off: "บริการปิดชั่วคราว หน้านี้ใช้ผลจากในเครื่องเท่านั้น", cap: "วันนี้มีการใช้งานครบจำนวนแล้ว ลองใหม่พรุ่งนี้ (ไม่เกี่ยวกับรหัสของคุณ)",
      refused: "เซิร์ฟเวอร์ไม่รับคำขอนี้ จึงยังตรวจรหัสไม่ได้ (ไม่ได้แปลว่ารหัสผิด) ลองใหม่ภายหลังหรือแจ้งเจ้าของระบบ", network: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่อีกครั้ง",
        revoked: "รหัสนี้ใช้ไม่ได้แล้ว ขอรหัสใหม่จากเจ้าของระบบ",
      briefH: "ข้อตกลงสำหรับผู้ทดสอบ",
      brief: "นี่คือการทดสอบแบบปิด ยังไม่ใช่ผลิตภัณฑ์ ผลที่ได้เป็นการประมาณ ไม่ใช่คำตัดสิน อย่าถ่ายใบสั่งยา ฉลากยาที่มีชื่อผู้ป่วย หรือเอกสารที่มีข้อมูลส่วนบุคคล ใช้ฉลากสินค้าเท่านั้น " +
        "การส่งให้ AI ต้องได้รับความยินยอมจากคุณทุกครั้ง หรือเลือกให้จำไว้ และถอนความยินยอมได้ทุกเมื่อ พบปัญหาแจ้งเจ้าของระบบ",
      privH: "ความเป็นส่วนตัวของการทดสอบนี้ (ฉบับร่าง รอทนายตรวจ)",
      priv: "การตรวจด้วย AI ของ Product Check (การทดสอบแบบปิด): เฉพาะเมื่อคุณยินยอม ข้อความบนฉลาก และภาพถ่ายสินค้าที่เบลอใบหน้าบนเครื่องของคุณแล้วถ้าคุณเลือกโหมดภาพ " +
        "จะถูกส่งผ่าน Cloudflare (ผู้ให้บริการเซิร์ฟเวอร์ API ของเรา) ไปยังผู้ประมวลผล AI ที่หน้าขอความยินยอมระบุชื่อไว้ก่อนส่งทุกครั้ง ซึ่งอยู่นอกประเทศไทย " +
        "ระบบบังคับใช้เส้นทางแบบไม่เก็บเนื้อหา LENSIQ ไม่เก็บข้อความหรือภาพบนฉลาก Cloudflare Turnstile ใช้ตรวจว่าไม่ใช่บอทก่อนส่ง " +
        "รหัสผู้ทดสอบเก็บไว้ในเบราว์เซอร์นี้เฉพาะรอบการใช้งานนี้",
      procNow: "ผู้ประมวลผล AI ที่ตั้งค่าไว้ตอนนี้:", procNone: "ตอนนี้การตรวจด้วย AI ปิดอยู่ จึงยังไม่มีผู้ประมวลผล AI ที่ตั้งค่าไว้", via: "{router} แล้วส่งต่อไปยัง {served}"
    },
    en: {
      title: "Tester access", intro: "This is for the closed tester group only. Enter the code the owner gave you to open the \"ask AI\" step and the sources that are still being tested.",
      label: "Tester code", use: "Use this code for this session", forget: "Forget the code on this device", on: "Tester access is on (this session only)",
      short: "The code is too short (at least 16 characters)", wrong: "That code is not correct", locked: "Too many wrong codes. Try again later",
      off: "The service is switched off for now; this page uses on-device results only",
      cap: "Today's usage limit has been reached; try again tomorrow (this is not about your code)",
      refused: "The server did not accept this request, so the code could not be checked (this does not mean the code is wrong). Try again later or tell the owner",
        network: "The server could not be reached. Try again",
        revoked: "This code no longer works. Ask the owner for a new one",
      briefH: "Notes for testers",
      brief: "This is a closed test, not a product. Results are estimates, not a verdict. Do not photograph prescriptions, dispensing labels with a patient's name or documents with personal " +
        "data; use product labels only. Sending to AI needs your consent each time, or choose to remember it, and you can withdraw at any time. Report problems to the owner.",
      privH: "Privacy in this test (draft, pending legal review)",
      priv: "Product Check AI (closed test): only after your consent, the label text, and the product photo with faces blurred on your device if you choose photo mode, " +
        "is sent through Cloudflare (our API host) to the AI processors named on the consent screen before anything is sent, outside Thailand. " +
        "Routes that keep no content are enforced. LENSIQ stores no label text or image. Cloudflare Turnstile checks that the sender is not a bot. " +
        "The tester code is kept in this browser for this session only.",
      procNow: "AI processors configured right now:", procNone: "AI checks are switched off right now, so no AI processor is configured", via: "{router}, then on to {served}"
    },
    zh: {
      title: "测试人员入口", intro: "仅供封闭测试小组使用。输入所有者提供的代码，即可开启“询问 AI”步骤和仍在测试中的数据来源。",
      label: "测试代码", use: "本次会话使用此代码", forget: "在本设备上清除代码", on: "测试权限已开启（仅限本次会话）",
      short: "代码太短（至少 16 个字符）", wrong: "代码不正确", locked: "错误次数过多，请稍后再试",
      off: "服务暂时关闭，本页仅使用本机结果", cap: "今日使用次数已达上限，请明天再试（与您的代码无关）",
      refused: "服务器未接受此请求，因此无法核对代码（这不表示代码错误）。请稍后再试或告知所有者", network: "无法连接服务器，请重试", revoked: "此代码已失效，请向所有者索取新代码",
      briefH: "测试须知",
      brief: "这是封闭测试，不是正式产品。结果仅为估计，不是结论。请勿拍摄处方、带有患者姓名的配药标签或含个人数据的文件，只使用产品标签。每次发送给 AI 都需要您的同意，也可选择记住，并可随时撤回。发现问题请告知所有者。",
      privH: "本次测试的隐私说明（草稿，待律师审阅）",
      priv: "Product Check AI（封闭测试）：仅在您同意后，标签文字（如果您选择照片模式，还包括已在您的设备上模糊人脸的产品照片）" +
        "会经由 Cloudflare（我们的 API 托管方）发送至同意页面在每次发送前列明的 AI 处理方，处理地点在泰国境外。系统强制使用不保留内容的线路。" +
        "LENSIQ 不保存标签文字或图片。Cloudflare Turnstile 用于在发送前确认不是机器人。测试代码仅在本次会话期间保存在此浏览器中。",
      procNow: "当前配置的 AI 处理方：", procNone: "目前 AI 核查已关闭，尚未配置 AI 处理方", via: "{router}，再转至 {served}"
    }
  };

  /** @param {any} l @returns {"th"|"en"|"zh"} */
  function lang(l) { return l === "en" || l === "zh" ? l : "th"; }
  /** @param {boolean} gate @param {string} code */
  function unlockedFor(gate, code) { return !gate || !!code; }
  /** @param {boolean} gate @param {string} code @returns {Record<string, string>} */
  function headersFor(gate, code) { var h = /** @type {Record<string, string>} */ ({}); if (gate && code) h[HEADER] = code; return h; }
  /** Result of POST /v1/tester/check. @param {{ok?: boolean, status?: number, j?: any}} r */
  function resultOf(r) {
    var why = r && r.j ? String(r.j.reason || r.j.code || "") : "";
    if (r && r.ok && r.j && r.j.ok === true) return "ok";
    if (r && r.j && r.j.off === true) return "off";
    if (why === "tester_locked") return "locked";
    if (why === "tester_required") return "wrong";          // the ONLY answer that means "this code is not accepted"
    if (why === "daily_cap" || why === "d1_budget") return "cap";
    if (r && r.status === 0) return "network";
    return "refused";                                       // any other refusal (origin, route off, server error): not a code problem
  }

  var pure = { STR: STR, KEY: KEY, HEADER: HEADER, MIN: MIN, unlockedFor: unlockedFor, headersFor: headersFor, resultOf: resultOf };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; return; }

  /* ============================ browser ============================ */
  var doc = root.document;
  if (!doc) return;
  var mem = "";
  var store = function () { try { return root.sessionStorage; } catch (e) { return null; } };
  function gate() { return W.LENSIQ_TESTER_GATE === true; }
  function code() {
    if (mem) return mem;
    try { var s = store(); mem = (s && s.getItem(KEY)) || ""; } catch (e) { mem = ""; }
    return mem;
  }
  /** @param {string} c */
  function keep(c) { mem = c; try { var s = store(); if (s) { if (c) s.setItem(KEY, c); else s.removeItem(KEY); } } catch (e) { /* memory only */ } }
  var note = "";
  function changed() { paint(); try { W.dispatchEvent(new Event("lq-tester")); } catch (e) { /* old browser */ } }
  function forget() { keep(""); infos = null; note = ""; changed(); }
  /** The Worker refused a kept code (rotated / revoked). */
  function refused() { if (!gate() || !code()) return; keep(""); infos = null; note = "revoked"; changed(); }
  var asking = false;
  var FEATURES = ["pc_fields", "pc_translate", "pc_claims"];
  /** @param {any} o @param {string} l */
  function pick(o, l) { return o ? String(o[l] || o.th || o.en || "") : ""; }
  /** One line per configured processor, in the page language. @param {any[]} infos @param {"th"|"en"|"zh"} l @returns {string[]} */
  function processorLines(infos, l) {
    /** @type {string[]} */ var out = [];
    (infos || []).forEach(function (/** @type {any} */ i) {
      ((i && i.enabled && i.chain) || []).forEach(function (/** @type {any} */ c) {
        var name = c.routed ? STR[l].via.replace("{router}", pick(c.name, l)).replace("{served}", pick(c.routed.name, l)) : pick(c.name, l);
        var line = name + " (" + pick(c.routed ? c.routed.region : c.region, l) + ")";
        if (out.indexOf(line) < 0) out.push(line);
      });
    });
    return out;
  }
  /** @type {any[]|null} */ var infos = null;
  function loadProcessors() {
    var A = W.LQApi;
    if (asking || infos || !A || !A.enabled() || !gate() || !code()) return;
    asking = true;
    Promise.all(FEATURES.map(function (f) { return A.getJSON("/v1/ai/providers?feature=" + f, { headers: headersFor(true, code()) }); }))
      .then(function (/** @type {any[]} */ r) {
        asking = false;
        if (r.some(function (/** @type {any} */ i) { return i && i.tester === true; })) { refused(); return; }
        infos = r; paint();
      });
  }
  /** @param {string} c @returns {Promise<string>} */
  function check(c) {
    var A = W.LQApi;
    if (!A || !A.enabled()) return Promise.resolve("network");
    var h = /** @type {Record<string, string>} */ ({}); h[HEADER] = c;
    return A.call("/v1/tester/check", { method: "POST", body: {}, headers: h }).then(resultOf);
  }

  var cur = function () { return lang(W.LQI18N ? W.LQI18N.lang : "th"); };
  var T = function (/** @type {string} */ k) { return STR[cur()][k]; };
  /** @param {string} tag @param {Record<string, any>} [attrs] @param {string} [text] */
  function el(tag, attrs, text) {
    var e = doc.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, String(/** @type {any} */ (attrs)[k]));
    if (text != null) e.textContent = text;
    return e;
  }
  var wanted = function () { return /[?&]tester=1\b/.test(String((root.location && root.location.search) || "")); };

  function paint() {
    var slot = doc.getElementById("lqTesterSlot");
    if (!slot) return;
    slot.textContent = "";
    if (!gate() || (!wanted() && !code())) return; // ordinary visitors: nothing is drawn
    var card = el("div", { class: "card lq-tester", "data-i18n-skip": "" });
    card.appendChild(el("h3", { id: "lqTesterH" }, T("title")));
    if (code()) {
      card.appendChild(el("p", { class: "md-status", "data-kind": "ok", id: "lqTesterState" }, T("on")));
      var f = el("button", { type: "button", class: "btn ghost", id: "lqTesterForget" }, T("forget"));
      f.addEventListener("click", forget);
      card.appendChild(f);
    } else {
      card.appendChild(el("p", { class: "hint" }, T("intro")));
      var form = /** @type {HTMLFormElement} */ (el("form", { class: "md-row", id: "lqTesterForm" }));
      var lab = el("label", { for: "lqTesterCode" }, T("label"));
      var inp = /** @type {HTMLInputElement} */ (el("input", { type: "password", id: "lqTesterCode", autocomplete: "off", autocapitalize: "off", spellcheck: "false", maxlength: "200" }));
      inp.style.maxWidth = "100%"; inp.style.minWidth = "0"; inp.style.flex = "1 1 200px";
      var go = el("button", { type: "submit", class: "btn primary", id: "lqTesterUse" }, T("use"));
      form.appendChild(lab); form.appendChild(inp); form.appendChild(go);
      var msg = el("p", { class: "md-status", id: "lqTesterMsg", "aria-live": "polite" }, note ? T(note) : "");
      if (note) msg.setAttribute("data-kind", "warn");
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var c = String(inp.value || "").trim();
        if (c.length < MIN) { note = "short"; msg.textContent = T("short"); msg.setAttribute("data-kind", "warn"); return; }
        go.setAttribute("disabled", "");
        check(c).then(function (r) {
          go.removeAttribute("disabled");
          if (r === "ok") { note = ""; keep(c); changed(); return; }
          note = r; inp.value = ""; msg.textContent = T(r); msg.setAttribute("data-kind", "warn");
        });
      });
      card.appendChild(form); card.appendChild(msg);
    }
    var d1 = el("details"); d1.appendChild(el("summary", undefined, T("briefH"))); d1.appendChild(el("p", { class: "hint" }, T("brief")));
    var d2 = el("details", { id: "lqTesterPrivacy" }); d2.appendChild(el("summary", undefined, T("privH"))); d2.appendChild(el("p", { class: "hint" }, T("priv")));
    if (code()) {
      if (!infos) loadProcessors();
      else {
        var lines = processorLines(infos, cur());
        d2.appendChild(el("p", { class: "hint", id: "lqTesterProcs" }, lines.length ? T("procNow") : T("procNone")));
        if (lines.length) { var ul = el("ul", { class: "md-list" }); lines.forEach(function (x) { ul.appendChild(el("li", undefined, x)); }); d2.appendChild(ul); }
      }
    }
    card.appendChild(d1); card.appendChild(d2);
    slot.appendChild(card);
  }

  W.LQTester = Object.assign({}, pure, {
    gate: gate, unlocked: function () { return unlockedFor(gate(), code()); }, headers: function () { return headersFor(gate(), code()); },
    check: check, forget: forget, refused: refused, paint: paint
  });
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", paint); else paint();
  W.addEventListener("lq-lang", paint);
})(typeof window !== "undefined" ? window : globalThis);
