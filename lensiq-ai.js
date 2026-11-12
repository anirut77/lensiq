/* lensiq-ai.js — browser helper for the AI gateway (round 17 P5; backend/src/ai/gateway.js, docs/AI-GATEWAY.md).
 *
 * Nothing leaves the device until the user agrees on the consent screen, which shows — from GET /v1/ai/providers —
 * the provider and model that will actually be used, where the data is processed, the providers it may fall back to,
 * what is sent (text only, or text + the product image) and that LENSIQ stores nothing. Text only is the default and the
 * fallback; image mode is offered only when the feature allows it (owner decisions PC-D1 / PC-D9). "Remember my choice"
 * keeps the consent for that feature and that exact provider chain in localStorage ("lq-ai-consent"); a visible
 * "withdraw" control removes it. Without "remember", the consent lasts for this page session only. A changed chain
 * asks again. Requests go through LQApi (CSP connect-src stays 'self' + the API origin).
 *
 *   LQAI.run(feature, input, {mode?})  -> Promise<{ok:true, json, provider, model, checkedBy} | {fallback:true, reason, message}>
 *   LQAI.ensureConsent(feature, {mode?}) -> Promise<{mode, info, remembered} | null>
 *   LQAI.ensureConsentGroup(id, features, labels?, {mode?, force?, auto?}) -> same, ONE screen for several features (P7,
 *       groupInfo). force = show the screen even when a choice is remembered; auto = the screen also says what the
 *       TESTER auto-send of the Product Check live scan does ([data-auto]); the result then tells whether "remember my
 *       choice" was ticked and stored (saved: true)
 *   LQAI.send(feature, info, mode, input, {auto?}) -> the POST alone (a page step such as a photo preview sits between);
 *       auto: true marks a tester auto-send (the Worker accepts it only from a valid tester with the gate on)
 *   LQAI.consentState(feature|group)     -> {state: "remembered"|"session"|"", mode}
 *   LQAI.withdraw(feature)              -> boolean
 *   LQAI.renderWithdraw(container, feature) -> HTMLElement   button shown while a remembered consent exists
 *   LQAI.fallbackMessage(reason)        -> text in the current language (budget: "on-device result only")
 * Strings: TH / EN / ZH below (the page language comes from LQI18N.lang).
 */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;

  /** @type {Record<string, Record<string, string>>} */
  var STR = {
    th: {
      title: "ส่งให้ AI ช่วยตรวจหรือไม่", intro: "ระบบจะส่งข้อมูลไปให้ผู้ให้บริการ AI ด้านล่าง เฉพาะเมื่อคุณกดยินยอม",
      provider: "ผู้ให้บริการ", model: "โมเดล", region: "ประมวลผลที่", retention: "การเก็บข้อมูลของผู้ให้บริการ", fallbackTo: "ถ้าระบบแรกไม่ว่าง อาจใช้",
      sends: "สิ่งที่ส่ง", sendsText: "เฉพาะข้อความที่อ่านได้ในเครื่อง (ไม่ส่งภาพ)",
        sendsImage: "ข้อความที่อ่านได้ และภาพถ่ายสินค้าเฉพาะในกรอบ โดยเบลอใบหน้าบนเครื่องนี้ก่อน คุณจะเห็นภาพก่อนส่งทุกครั้ง",
      storesNothing: "LENSIQ ไม่เก็บข้อความ ภาพ หรือผลลัพธ์ไว้บนเซิร์ฟเวอร์", mode: "เลือกสิ่งที่ส่ง", modeText: "ข้อความเท่านั้น (แนะนำ)",
        modeImage: "ภาพถ่ายสินค้า (เบลอใบหน้าก่อนส่ง)", usedFor: "ใช้กับ", partRow: "{provider} · {model} · ประมวลผลที่ {region}",
      retentionAll: "การเก็บข้อมูลของผู้ให้บริการแต่ละราย", withdrawHow: "ถอนความยินยอมได้ทุกเมื่อด้วยปุ่ม \"ถอนความยินยอมการส่งให้ AI\" ใต้ผลตรวจ หรือในหน้าตั้งค่า ครั้งต่อไประบบจะถามใหม่",
      remember: "จำการเลือกนี้ไว้ในเครื่องนี้", agree: "ยินยอมและส่ง", cancel: "ไม่ส่ง ใช้ผลในเครื่อง", withdraw: "ถอนความยินยอมการส่งให้ AI", withdrawn: "ถอนความยินยอมแล้ว ครั้งหน้าระบบจะถามใหม่",
      checkedBy: "ตรวจโดย {provider}, {region}", routedTo: "ส่งต่อไปยัง {routed}",
      fbBudget: "ระบบตรวจด้วย AI หยุดชั่วคราวสำหรับเดือนนี้ คุณกำลังดูผลจากในเครื่องเท่านั้น", fbLimit: "ใช้การตรวจด้วย AI ครบจำนวนแล้วในขณะนี้ คุณกำลังดูผลจากในเครื่องเท่านั้น",
      fbDisabled: "การตรวจด้วย AI ยังไม่เปิดใช้งาน คุณกำลังดูผลจากในเครื่องเท่านั้น", fbConsent: "ไม่ได้ส่งข้อมูล เพราะยังไม่ได้รับความยินยอม คุณกำลังดูผลจากในเครื่องเท่านั้น",
      fbImage: "การส่งภาพไม่เปิดให้ใช้กับการตรวจนี้ ระบบส่งเฉพาะข้อความได้", fbInvalid: "คำตอบจาก AI ไม่ผ่านการตรวจรูปแบบ คุณกำลังดูผลจากในเครื่องเท่านั้น",
      fbPolicy: "ผู้ให้บริการ AI ไม่รับข้อมูลนี้ คุณกำลังดูผลจากในเครื่องเท่านั้น", fbTurnstile: "ยืนยันว่าไม่ใช่บอทไม่สำเร็จ คุณกำลังดูผลจากในเครื่องเท่านั้น",
      fbMember: "เข้าสู่ระบบเพื่อใช้การตรวจด้วย AI คุณกำลังดูผลจากในเครื่องเท่านั้น", fbNetwork: "เชื่อมต่อบริการ AI ไม่ได้ คุณกำลังดูผลจากในเครื่องเท่านั้น",
      fbError: "บริการ AI ขัดข้องชั่วคราว คุณกำลังดูผลจากในเครื่องเท่านั้น",
      fbTester: "การตรวจด้วย AI เปิดให้เฉพาะกลุ่มผู้ทดสอบ คุณกำลังดูผลจากในเครื่องเท่านั้น", fbOff: "บริการปิดชั่วคราว คุณกำลังดูผลจากในเครื่องเท่านั้น",
      fbCap: "วันนี้มีการใช้งานครบจำนวนแล้ว ลองใหม่พรุ่งนี้ คุณกำลังดูผลจากในเครื่องเท่านั้น", via: "{router} แล้วส่งต่อไปยัง {served}",
      fbAuto: "การส่งอัตโนมัติเปิดให้เฉพาะผู้ทดสอบ คุณกำลังดูผลจากในเครื่องเท่านั้น",
      autoNote: "ส่งอัตโนมัติขณะสแกน (เฉพาะผู้ทดสอบ): ถ้าเลือก \"จำการเลือกนี้\" ระบบจะส่งข้อความที่อ่านได้ให้ AI เองโดยไม่ถามและไม่ให้ดูก่อนทุกครั้ง (ไม่ส่งภาพอัตโนมัติ) " +
        "เฉพาะภาพที่เป็นฉลากสินค้า ไม่ใช่ฉลากจ่ายยาหรือเอกสารส่วนบุคคล ไม่พบชื่อหรือข้อมูลส่วนตัว และไม่พบใบหน้า สินค้าละ 1 ครั้ง " +
        "ไม่ส่งขณะซ่อนหน้านี้ หลังส่งจะแสดงข้อความที่ส่งไป หยุดและถอนความยินยอมได้ทันทีด้วยปุ่มใต้กล้อง ถ้าไม่เลือก \"จำการเลือกนี้\" " +
        "จะไม่เปิดการส่งอัตโนมัติ"
    },
    en: {
      title: "Send this to AI for a check?", intro: "Data is sent to the AI provider below only if you agree.",
      provider: "Provider", model: "Model", region: "Processed in", retention: "Provider's data retention", fallbackTo: "If the first one is busy, it may use",
      sends: "What is sent", sendsText: "Only the text read on this device (no image)",
      sendsImage: "The text read on this device and a photo of the product inside the box, with faces blurred on this device first; you see the photo before it is sent, every time",
      storesNothing: "LENSIQ stores no text, image or result on its servers", mode: "Choose what to send", modeText: "Text only (recommended)",
        modeImage: "Photo of the product (faces blurred first)", usedFor: "Used for", partRow: "{provider} · {model} · processed in {region}",
      retentionAll: "Data retention of each provider",
      withdrawHow: "You can withdraw at any time with the \"Withdraw consent to send to AI\" button under the result or in settings; you will then be asked again",
      remember: "Remember my choice on this device", agree: "Agree and send", cancel: "Don't send, use the on-device result",
      withdraw: "Withdraw consent to send to AI", withdrawn: "Consent withdrawn; you will be asked again next time",
      checkedBy: "Checked by {provider}, {region}", routedTo: "routed to {routed}",
      fbBudget: "AI checks are paused for this month; you are seeing the on-device result only", fbLimit: "The AI check limit has been reached for now; you are seeing the on-device result only",
      fbDisabled: "AI checks are not switched on; you are seeing the on-device result only", fbConsent: "Nothing was sent because consent was not given; you are seeing the on-device result only",
      fbImage: "Sending an image is not allowed for this check; text only can be sent", fbInvalid: "The AI answer failed the format check; you are seeing the on-device result only",
      fbPolicy: "The AI provider declined this input; you are seeing the on-device result only", fbTurnstile: "The bot check failed; you are seeing the on-device result only",
      fbMember: "Sign in to use AI checks; you are seeing the on-device result only", fbNetwork: "The AI service could not be reached; you are seeing the on-device result only",
      fbError: "The AI service is temporarily unavailable; you are seeing the on-device result only",
      fbTester: "AI checks are open to the closed tester group only; you are seeing the on-device result only", fbOff: "The service is switched off for now; you are seeing the on-device result only",
      fbCap: "The daily request limit has been reached; try again tomorrow. You are seeing the on-device result only", via: "{router}, then on to {served}",
      fbAuto: "Automatic sending is for testers only; you are seeing the on-device result only",
      autoNote: "Send automatically while scanning (testers only): with \"Remember my choice\" ticked, the page sends the text it read to AI by itself (never a photo), without asking and " +
        "without showing you a preview each time. It sends only captures that are a product label, not a dispensing label or a personal document, " +
        "with no name or personal data found and no face found; once per product, and never while this page is hidden. After each send it shows the " +
        "text that was sent. Stop and withdraw at any time with the button under the camera. Without \"Remember my choice\" automatic " +
        "sending stays off."
    },
    zh: {
      title: "要发送给 AI 核查吗？", intro: "只有在您同意后，数据才会发送给下面的 AI 服务商。",
      provider: "服务商", model: "模型", region: "处理地点", retention: "服务商的数据保留", fallbackTo: "如果第一个繁忙，可能改用",
      sends: "发送内容", sendsText: "仅发送本设备读取的文字（不发送图片）", sendsImage: "本设备读取的文字和框内的产品照片，人脸先在本设备上模糊处理；每次发送前您都会先看到照片",
      storesNothing: "LENSIQ 不在服务器上保存文字、图片或结果", mode: "选择发送内容", modeText: "仅文字（推荐）", modeImage: "产品照片（先模糊人脸）", usedFor: "用于", partRow: "{provider} · {model} · 处理地点 {region}",
      retentionAll: "各服务商的数据保留", withdrawHow: "您可随时通过结果下方或设置中的“撤回发送给 AI 的同意”按钮撤回，之后会再次询问",
      remember: "在本设备上记住我的选择", agree: "同意并发送", cancel: "不发送，使用本机结果", withdraw: "撤回发送给 AI 的同意", withdrawn: "已撤回同意，下次会再询问",
      checkedBy: "由 {provider} 核查，{region}", routedTo: "转接至 {routed}",
      fbBudget: "本月的 AI 核查已暂停；您看到的仅是本机结果", fbLimit: "目前已达到 AI 核查次数上限；您看到的仅是本机结果",
      fbDisabled: "AI 核查尚未开启；您看到的仅是本机结果", fbConsent: "因未获得同意，没有发送任何数据；您看到的仅是本机结果",
      fbImage: "此项核查不允许发送图片，只能发送文字", fbInvalid: "AI 回答未通过格式检查；您看到的仅是本机结果",
      fbPolicy: "AI 服务商拒绝了此输入；您看到的仅是本机结果", fbTurnstile: "人机验证未通过；您看到的仅是本机结果",
      fbMember: "登录后才能使用 AI 核查；您看到的仅是本机结果", fbNetwork: "无法连接 AI 服务；您看到的仅是本机结果",
      fbError: "AI 服务暂时不可用；您看到的仅是本机结果",
      fbTester: "AI 核查仅向封闭测试小组开放；您看到的仅是本机结果", fbOff: "服务暂时关闭；您看到的仅是本机结果",
      fbCap: "今日请求次数已达上限，请明天再试；您看到的仅是本机结果", via: "{router}，再转至 {served}",
      fbAuto: "自动发送仅向测试人员开放；您看到的仅是本机结果",
      autoNote: "扫描时自动发送（仅限测试人员）：勾选“记住我的选择”后，页面会自行将读取的文字发送给 AI（不自动发送照片），" +
        "不再每次询问，也不先给您预览。只发送属于产品标签的画面，不是配药标签或个人文件，未发现姓名或个人信息，也未发现人脸；每个产品只发送一次，页面隐藏时不发送。每次发送后会显示所发送的文字。可随时用相机下方的按钮停止并撤回同意。不勾选“记住我的选择”则不会开启自动发送。"
    }
  };
  var CONSENT_KEY = "lq-ai-consent";
  var FB = { budget: "fbBudget", limit: "fbLimit", disabled: "fbDisabled", unavailable: "fbDisabled", not_configured: "fbDisabled", consent_required: "fbConsent",
    image_not_allowed: "fbImage", invalid_output: "fbInvalid", content_policy: "fbPolicy", turnstile: "fbTurnstile", member_required: "fbMember", network: "fbNetwork",
    tester_required: "fbTester", tester_locked: "fbTester", service_off: "fbOff", daily_cap: "fbCap", d1_budget: "fbCap", route_off: "fbDisabled", auto_not_allowed: "fbAuto" };

  /** @param {any} l @returns {"th"|"en"|"zh"} */
  function lang(l) { return l === "en" || l === "zh" ? l : "th"; }
  /** @param {any} o @param {string} l */
  function pick(o, l) { return o ? String(o[l] || o.th || o.en || "") : ""; }
  /** @param {any} info @returns {string[]} */
  function ids(info) { return ((info && info.chain) || []).map(function (/** @type {any} */ c) { return String(c.provider); }); }

  /** The processors behind one chain entry, as stored with a remembered consent: the provider id, plus the pinned serving
   *  provider when the gateway pins one (deploy B6: "openrouter>google-vertex"). A different serving provider is a
   *  different consent. Unpinned entries give the plain provider id, as before. @param {any} info @returns {string[]} */
  function procs(info) {
    return ((info && info.chain) || []).map(function (/** @type {any} */ c) { return String(c.provider) + (c.routed && c.routed.slug ? ">" + String(c.routed.slug) : ""); });
  }
  /** Name shown for a chain entry: the provider, and the pinned serving provider behind a router. @param {any} c @param {"th"|"en"|"zh"} L */
  function nameOf(c, L) { return c && c.routed ? STR[L].via.replace("{router}", pick(c.name, L)).replace("{served}", pick(c.routed.name, L)) : pick(c && c.name, L); }
  /** Processing place of a chain entry: the pinned serving provider's when known. @param {any} c @param {"th"|"en"|"zh"} L */
  function regionOf(c, L) { return c && c.routed ? pick(c.routed.region, L) : pick(c && c.region, L); }

  /** Consent-screen content for the first provider in the chain (the one actually used) + the fallbacks.
   * @param {any} info GET /v1/ai/providers result @param {any} l language @param {string} mode */
  function consentView(info, l, mode) {
    var L = lang(l), first = (info && info.chain && info.chain[0]) || null;
    return {
      provider: first ? nameOf(first, L) : "", model: first ? String(first.model) : "", region: first ? regionOf(first, L) : "",
      retention: first ? pick(first.retention, L) : "",
      fallbacks: ((info && info.chain) || []).slice(1).map(function (/** @type {any} */ c) { return nameOf(c, L) + " (" + regionOf(c, L) + ")"; }),
      // retention / training note of EVERY provider that may receive the data, not only the first
      retentions: ((info && info.chain) || []).map(function (/** @type {any} */ c) { return pick(c.name, L) + ": " + pick(c.retention, L); }),
      withdrawHow: STR[L].withdrawHow,
      sends: mode === "image" ? STR[L].sendsImage : STR[L].sendsText, stores: STR[L].storesNothing,
      // one screen for several features (groupInfo): the provider, model and country actually used for EACH of them
      parts: ((info && info.parts) || []).map(function (/** @type {any} */ p) {
        return { label: pick(p.label, L), text: STR[L].partRow.replace("{provider}", nameOf(p.first, L)).replace("{model}", String(p.first.model)).replace("{region}", regionOf(p.first, L)) };
      })
    };
  }
  /** Unique values, first-seen order. @param {string[]} a */
  function uniq(a) { var o = /** @type {string[]} */ ([]); a.forEach(function (x) { if (o.indexOf(x) < 0) o.push(x); }); return o; }
  /**
   * ONE consent screen for several features of a page (Product Check: pc_fields + pc_claims + pc_translate). Merges the
   * GET /v1/ai/providers answers of the features that are switched on: the chain is every {provider, model} that may
   * receive data (first-seen order), parts names the first provider of EACH feature, image mode is offered when one of
   * them allows it. The remembered consent is stored under the group id and tied to that merged provider list.
   * @param {string} id group id @param {any[]} infos @param {Record<string, any>} [labels] feature -> {th, en, zh}
   */
  function groupInfo(id, infos, labels) {
    var on = (infos || []).filter(function (/** @type {any} */ i) { return i && i.enabled && ids(i).length; });
    /** @type {any[]} */ var chain = [];
    /** @type {Record<string, boolean>} */ var seen = {};
    on.forEach(function (/** @type {any} */ i) {
      i.chain.forEach(function (/** @type {any} */ c) { var k = c.provider + "|" + c.model; if (!seen[k]) { seen[k] = true; chain.push(c); } });
    });
    return {
      feature: id, enabled: on.length > 0, stores: false, chain: chain, features: on.map(function (/** @type {any} */ i) { return String(i.feature); }),
      imageModeAllowed: on.some(function (/** @type {any} */ i) { return !!i.imageModeAllowed; }),
      parts: on.map(function (/** @type {any} */ i) { return { feature: i.feature, label: (labels && labels[i.feature]) || { th: i.feature, en: i.feature, zh: i.feature }, first: i.chain[0] }; })
    };
  }
  /** @param {any} info @returns {string[]} */
  function modes(info) { return info && info.imageModeAllowed ? ["text", "image"] : ["text"]; }
  /** @param {any} info @param {any} wanted */
  function pickMode(info, wanted) { return wanted === "image" && modes(info).indexOf("image") >= 0 ? "image" : "text"; }

  /** @param {any} storage */
  function readAll(storage) {
    try { var v = storage && storage.getItem(CONSENT_KEY); var o = v ? JSON.parse(v) : {}; return o && typeof o === "object" ? o : {}; } catch (e) { return null; }
  }
  /** Remembered consent for this feature AND this exact chain, else null. @param {any} storage @param {any} info */
  function rememberedConsent(storage, info) {
    var all = readAll(storage);
    var c = all && info ? all[info.feature] : null;
    if (!c || !Array.isArray(c.providers) || c.providers.join(",") !== procs(info).join(",") || !ids(info).length) return null;
    return { mode: pickMode(info, c.mode), providers: c.providers.slice(), ts: c.ts || 0 };
  }
  /** @param {any} storage @param {any} info @param {string} mode @param {boolean} remember @returns {boolean} */
  function saveConsent(storage, info, mode, remember) {
    if (!remember || !info) return false;
    var all = readAll(storage);
    if (!all) return false;
    all[info.feature] = { providers: procs(info), mode: pickMode(info, mode), ts: Date.now() };
    try { storage.setItem(CONSENT_KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
  }
  /** @param {any} storage @param {string} feature @returns {boolean} */
  function withdraw(storage, feature) {
    var all = readAll(storage);
    if (!all) return false;
    delete all[feature];
    try { storage.setItem(CONSENT_KEY, JSON.stringify(all)); return true; } catch (e) { return false; }
  }
  /** POST body: consent + the providers the user saw (a provider not shown is never used). extra.auto = a tester auto-send
   *  (top level, never inside input: the Worker never passes it to a provider). @param {any} info @param {string} mode @param {any} input @param {{auto?: boolean}} [extra] */
  function requestBody(info, mode, input, extra) {
    var m = pickMode(info, mode), inp = Object.assign({}, input || {});
    if (m !== "image") delete inp.images;
    var b = /** @type {any} */ ({ consent: true, providers: uniq(ids(info)), mode: m, input: inp });
    if (extra && extra.auto === true) b.auto = true;
    return b;
  }
  /** @param {string} reason @param {any} [l] */
  function fallbackMessage(reason, l) { return STR[lang(l)][/** @type {any} */ (FB)[reason] || "fbError"]; }
  /** "Checked by <provider>, <location>" for the result card; a router (OpenRouter) also names the provider it routed
   *  to (res.routedVia, from the gateway). @param {any} res @param {any} [l] */
  function checkedBy(res, l) {
    var L = lang(l);
    var who = pick(res && res.providerName, L);
    if (res && typeof res.routedVia === "string" && res.routedVia) who += " (" + STR[L].routedTo.replace("{routed}", res.routedVia) + ")";
    return STR[L].checkedBy.replace("{provider}", who).replace("{region}", pick(res && res.regionText, L));
  }

  var pure = { STR: STR, CONSENT_KEY: CONSENT_KEY, procs: procs, consentView: consentView, groupInfo: groupInfo, modes: modes, pickMode: pickMode, rememberedConsent: rememberedConsent,
    saveConsent: saveConsent, withdraw: withdraw, requestBody: requestBody, fallbackMessage: fallbackMessage, checkedBy: checkedBy };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; return; }

  /* ============================ browser ============================ */
  var doc = root.document;
  if (!doc) return;
  var cur = function () { return lang(W.LQI18N ? W.LQI18N.lang : "th"); };
  var T = function (/** @type {string} */ k) { return STR[cur()][k]; };
  var store = function () { try { return root.localStorage; } catch (e) { return null; } };
  /** @type {Record<string, {mode: string, providers: string}>} */
  var session = {};

  /** @param {string} tag @param {Record<string, any>} [attrs] @param {string} [text] */
  function el(tag, attrs, text) {
    var e = doc.createElement(tag);
    for (var k in attrs || {}) e.setAttribute(k, String(/** @type {any} */ (attrs)[k]));
    if (text != null) e.textContent = text;
    return e;
  }

  /** Consent dialog (built with textContent only). Resolves {mode, remember} or null. @param {any} info @param {string} mode
   *  @param {{auto?: boolean}} [o] auto = also say what the tester auto-send does */
  function dialog(info, mode, o) {
    return new Promise(function (resolve) {
      var d = /** @type {any} */ (el("dialog", { "aria-labelledby": "lqAiT", class: "lq-ai-consent" }));
      d.style.maxWidth = "min(560px, calc(100vw - 32px))"; d.style.boxSizing = "border-box"; d.style.overflowWrap = "anywhere";
      var f = /** @type {HTMLFormElement} */ (el("form", { method: "dialog" }));
      var v = consentView(info, cur(), mode);
      f.appendChild(el("h2", { id: "lqAiT" }, T("title")));
      f.appendChild(el("p", undefined, T("intro")));
      var dl = el("dl");
      var row = function (/** @type {string} */ k, /** @type {string} */ val) { dl.appendChild(el("dt", undefined, T(k))); dl.appendChild(el("dd", undefined, val)); };
      if (v.parts.length > 1) {
        v.parts.forEach(function (/** @type {any} */ p) { dl.appendChild(el("dt", undefined, T("usedFor") + " " + p.label)); dl.appendChild(el("dd", { "data-part": "" }, p.text)); });
        row("retention", v.retention);
      } else { row("provider", v.provider); row("model", v.model); row("region", v.region); row("retention", v.retention); }
      if (v.fallbacks.length) row("fallbackTo", v.fallbacks.join(", "));
      if (v.retentions.length > 1) {
        dl.appendChild(el("dt", undefined, T("retentionAll")));
        v.retentions.forEach(function (/** @type {string} */ x) { dl.appendChild(el("dd", undefined, x)); });
      }
      f.appendChild(dl);
      var sends = el("p", undefined, T("sends") + ": " + v.sends);
      f.appendChild(sends);
      f.appendChild(el("p", undefined, v.stores));
      var picked = pickMode(info, mode);
      if (modes(info).length > 1) {
        var fs = el("fieldset");
        fs.appendChild(el("legend", undefined, T("mode")));
        modes(info).forEach(function (m) {
          var lab = el("label");
          var r = /** @type {HTMLInputElement} */ (el("input", { type: "radio", name: "lqAiMode", value: m }));
          r.checked = m === picked;
          r.addEventListener("change", function () { picked = m; sends.textContent = T("sends") + ": " + consentView(info, cur(), m).sends; });
          lab.appendChild(r); lab.appendChild(doc.createTextNode(" " + T(m === "image" ? "modeImage" : "modeText")));
          fs.appendChild(lab);
        });
        f.appendChild(fs);
      }
      var remLab = el("label");
      var rem = /** @type {HTMLInputElement} */ (el("input", { type: "checkbox" }));
      remLab.appendChild(rem); remLab.appendChild(doc.createTextNode(" " + T("remember")));
      f.appendChild(remLab);
      if (o && o.auto) f.appendChild(el("p", { "data-auto": "" }, T("autoNote"))); // tester auto-send: what changes, next to "remember"
      f.appendChild(el("p", undefined, v.withdrawHow)); // design §10.6: how to withdraw, next to "remember"
      var ok = el("button", { type: "submit", value: "ok" }, T("agree"));
      var no = el("button", { type: "submit", value: "cancel", formnovalidate: "" }, T("cancel"));
      f.appendChild(ok); f.appendChild(no);
      d.appendChild(f);
      doc.body.appendChild(d);
      d.addEventListener("close", function () {
        var res = d.returnValue === "ok" ? { mode: picked, remember: rem.checked } : null;
        d.remove();
        resolve(res);
      });
      if (typeof d.showModal === "function") d.showModal(); else { d.remove(); resolve(null); }
    });
  }

  /** @param {string} feature */
  function providers(feature) {
    var A = W.LQApi, TS = W.LQTester;
    if (!A || !A.enabled()) return Promise.resolve(null);
    // closed test (lensiq-tester.js): without tester access nothing is asked; with it the code goes in a header
    if (TS && !TS.unlocked()) return Promise.resolve(null);
    return A.getJSON("/v1/ai/providers?feature=" + encodeURIComponent(feature), TS ? { headers: TS.headers() } : undefined).then(function (/** @type {any} */ info) {
      if (info && info.tester === true && TS) TS.refused(); // the code was rotated or revoked
      return info;
    });
  }

  /** Consent for one consent-screen info (a feature, or a group from groupInfo). remembered = no screen was shown.
   *  o.force = always show the screen (a new, explicit choice); saved = "remember my choice" was ticked and stored.
   * @param {any} info @param {{mode?: string, force?: boolean, auto?: boolean}} [o] */
  function consentFor(info, o) {
    if (!info || !info.enabled || !ids(info).length) return Promise.resolve(null);
    var key = String(info.feature);
    var r = o && o.force ? null : rememberedConsent(store(), info);
    if (r) return Promise.resolve({ mode: o && o.mode === "text" ? "text" : r.mode, info: info, remembered: true }); // the page may ask for less, never for more
    var s = o && o.force ? null : session[key];
    if (s && s.providers === procs(info).join(",")) return Promise.resolve({ mode: o && o.mode === "text" ? "text" : pickMode(info, s.mode), info: info, remembered: false });
    return dialog(info, (o && o.mode) || "text", { auto: !!(o && o.auto) }).then(function (/** @type {any} */ c) {
      if (!c) return null;
      session[key] = { mode: c.mode, providers: procs(info).join(",") };
      var saved = saveConsent(store(), info, c.mode, c.remember);
      return { mode: pickMode(info, c.mode), info: info, remembered: false, saved: saved };
    });
  }
  /** @param {string} feature @param {{mode?: string}} [o] */
  function ensureConsent(feature, o) { return providers(feature).then(function (/** @type {any} */ info) { return consentFor(info, o); }); }
  /** One consent screen for several features (groupInfo). Resolves {mode, info, remembered} | null (nothing switched on,
   *  or the user did not agree). @param {string} id @param {string[]} features @param {Record<string, any>} [labels] @param {{mode?: string}} [o] */
  function ensureConsentGroup(id, features, labels, o) {
    return Promise.all(features.map(providers)).then(function (/** @type {any[]} */ infos) { return consentFor(groupInfo(id, infos, labels), o); });
  }

  /** @param {string} reason */
  function fallback(reason) { return { fallback: true, reason: reason, message: fallbackMessage(reason, cur()) }; }

  /** The POST alone, for a consent the page already holds (ensureConsent / ensureConsentGroup): lets a page put a step
   *  between consent and sending (Product Check: the blurred-photo preview). @param {string} feature @param {any} info
   *  @param {string} mode @param {any} input @param {{auto?: boolean}} [extra] */
  function send(feature, info, mode, input, extra) {
    var A = W.LQApi;
    if (!A || !A.enabled()) return Promise.resolve(fallback("disabled"));
    if (!info) return Promise.resolve(fallback("consent_required"));
    return Promise.resolve(typeof A.turnstile === "function" ? A.turnstile("ai") : "").then(function (/** @type {string} */ tok) {
      /** @type {Record<string, string>} */
      var headers = W.LQTester ? W.LQTester.headers() : {};
      if (tok) headers["X-Turnstile-Token"] = tok;
      var M = W.LQMember;
      var bearer = M && typeof M.token === "function" ? M.token() : "";
      if (bearer) headers.Authorization = "Bearer " + bearer;
      return A.call("/v1/ai/" + encodeURIComponent(feature), { method: "POST", body: requestBody(info, mode, input, extra), headers: headers, timeoutMs: 90000 });
    }).then(function (/** @type {any} */ r) {
      if (r && r.ok && r.j && r.j.ok) return { ok: true, json: r.j.json, provider: r.j.provider, model: r.j.model, checkedBy: checkedBy(r.j, cur()) };
      var why = r && r.j && r.j.reason ? String(r.j.reason) : r && r.status === 0 ? "network" : "provider_error";
      if (why === "tester_required" && W.LQTester) W.LQTester.refused();
      return fallback(why);
    });
  }
  /** @param {string} feature @param {any} input @param {{mode?: string}} [o] */
  function run(feature, input, o) {
    var A = W.LQApi;
    if (!A || !A.enabled()) return Promise.resolve(fallback("disabled"));
    return ensureConsent(feature, o).then(function (/** @type {any} */ c) {
      if (!c) return fallback("consent_required");
      return send(feature, c.info, c.mode, input);
    });
  }

  /** @param {string} feature */
  function withdrawNow(feature) { delete session[feature]; return withdraw(store(), feature); }
  /** What is in force for a feature or group: "remembered" (stored on this device), "session" (this page only) or "".
   *  The remembered mode comes with it. @param {string} feature */
  function consentState(feature) {
    var all = readAll(store()), c = all && all[feature];
    if (c && Array.isArray(c.providers)) return { state: "remembered", mode: c.mode === "image" ? "image" : "text" };
    if (session[feature]) return { state: "session", mode: session[feature].mode === "image" ? "image" : "text" };
    return { state: "", mode: "" };
  }

  /** "Withdraw" button, visible while a consent is remembered for the feature. @param {HTMLElement} container @param {string} feature */
  function renderWithdraw(container, feature) {
    var b = /** @type {HTMLButtonElement} */ (el("button", { type: "button", class: "lq-ai-withdraw" }, T("withdraw")));
    var all = readAll(store());
    b.hidden = !(all && all[feature]);
    b.addEventListener("click", function () { withdrawNow(feature); b.textContent = T("withdrawn"); b.disabled = true; });
    container.appendChild(b);
    return b;
  }

  // the browser API LAST, so the documented LQAI.withdraw(feature) / LQAI.fallbackMessage(reason) win over the pure
  // helpers of the same name (P7 fix: before, the pure withdraw(storage, feature) replaced it and did nothing)
  W.LQAI = Object.assign({}, pure, { run: run, send: send, ensureConsent: ensureConsent, ensureConsentGroup: ensureConsentGroup, consentState: consentState, providers: providers,
    renderWithdraw: renderWithdraw,
    withdraw: withdrawNow, fallbackMessage: function (/** @type {string} */ r) { return fallbackMessage(r, cur()); } });
})(typeof window !== "undefined" ? window : globalThis);
