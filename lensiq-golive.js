/* lensiq-golive.js — the owner's go-live checklist (help.html?owner=1#owner-golive). TH / EN / 中文.
 *
 * One list of every placeholder that is still empty before LENSIQ can sell: the seller details (window.LENSIQ_SELLER),
 * the site switches in lensiq-config.js (API, Turnstile, Google sign-in, commercial profile, research-licence models),
 * whether the lead forms have any channel at all, and the items that need outside resources (company registration,
 * counsel, Opn KYC, Worker deploy, model licence opinion, pilot). It reads only public config already on the page —
 * nothing secret, no network, no storage except the owner flag.
 *
 * Shown only to the owner: after opening help.html?owner=1 once on that browser (localStorage "lq-owner" = "1";
 * ?owner=0 or the "hide" button forgets it). Visitors never see it (it is not linked anywhere public). The backend has its own gate for the
 * Worker secrets (GET /admin/api/go-live, backend/src/golive.js); tools/check-legal.mjs prints the same list in CI.
 * Pure helpers checklist() / isOwner() are unit-tested in Node (tests/unit/commercial-collateral.test.js). */
(function (root) {
  "use strict";
  /** @type {any} */
  var W = root;
  /** @param {any} v */
  var has = function (v) { var t = typeof v === "string" ? v.trim() : ""; return !!t && !/^\[.*\]$/.test(t); };
  var isEmail = function (/** @type {any} */ e) { return /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]{2,}$/.test(String(e || "").trim()); };

  /** [key, required before sales, TH, EN, ZH] for LENSIQ_SELLER (= tools/check-legal.mjs REQUIRED + the optional ones) */
  var SELLER = [
    ["name", true, "ชื่อนิติบุคคล/ผู้ให้บริการ", "Seller / company name", "服务提供方名称"],
    ["tax_id", true, "เลขประจำตัวผู้เสียภาษี 13 หลัก", "13-digit tax ID", "13 位税号"],
    ["address", true, "ที่อยู่ผู้ให้บริการ", "Seller address", "服务提供方地址"],
    ["email", true, "อีเมลฝ่ายช่วยเหลือ", "Support e-mail", "客服邮箱"],
    ["effective_date", true, "วันที่มีผลของข้อกำหนด/นโยบาย", "Effective date of terms / policy", "条款／政策生效日期"],
    ["dpo_email", true, "อีเมล DPO / ผู้ติดต่อด้านข้อมูลส่วนบุคคล", "DPO / privacy contact e-mail", "DPO／个人数据联系人邮箱"],
    ["dpo_name", false, "ชื่อ/ตำแหน่ง DPO", "DPO name / role", "DPO 姓名／职位"],
    ["line", false, "LINE Official Account", "LINE Official Account", "LINE 官方账号"],
    ["status_url", false, "หน้าสถานะระบบ", "Status page URL", "系统状态页"],
    ["email_provider", false, "ผู้ให้บริการอีเมล (ผู้รับข้อมูลในนโยบาย)", "E-mail provider (privacy policy recipient)", "邮件服务商（隐私政策中的接收方）"],
    ["email_provider_location", false, "ประเทศของผู้ให้บริการอีเมล", "E-mail provider location", "邮件服务商所在国家"],
    ["anthropic_retention", false, "ระยะเวลาเก็บข้อมูลของผู้ให้บริการ AI", "AI provider retention period", "AI 服务商保存期限"]
  ];
  /** Outside-software items: [id, TH, EN, ZH, where] */
  var OUTSIDE = [
    ["entity", "จดทะเบียนนิติบุคคล/ทะเบียนพาณิชย์ และตัดสินใจเรื่องจด VAT กับนักบัญชี", "Register the selling entity and decide on VAT registration with an accountant", "注册经营主体，并与会计师决定是否登记增值税", "LENSIQ_SELLER · backend/wrangler.toml SELLER_* / VAT_REGISTERED"],
    ["counsel", "ทนายความ PDPA ตรวจข้อกำหนด นโยบาย ความยินยอม เกณฑ์อายุ การส่งข้อมูลต่างประเทศ แล้วลงนาม DPIA", "Thai PDPA counsel reviews terms, privacy, consent, age threshold and cross-border transfers, then signs the DPIA", "泰国 PDPA 律师审阅条款、隐私、同意、年龄门槛和跨境传输，然后签署 DPIA", "docs/LEGAL-REVIEW-PACK.md · docs/pdpa/DPIA.md · LENSIQ_SELLER.counsel_confirmed · LEGAL_TERMS_READY / LEGAL_PRIVACY_READY"],
    ["models", "ความเห็นทางกฎหมาย/สัญญาอนุญาตเชิงพาณิชย์ของโมเดลใบหน้า face-api.js (F5/F6) — จนกว่าจะได้ ใช้โปรไฟล์ commercial", "Legal opinion / commercial licence for the face-api.js face models (F5/F6) — until then deploy with the commercial profile", "取得 face-api.js 人脸模型（F5/F6）的法律意见或商用许可；在此之前使用 commercial 配置", "LICENSES/THIRD_PARTY.md F5/F6"],
    ["worker", "Deploy Cloudflare Worker + D1 (database_id, ALLOWED_ORIGINS, secrets) แล้วตั้ง LENSIQ_API_BASE", "Deploy the Cloudflare Worker + D1 (database_id, ALLOWED_ORIGINS, secrets), then set LENSIQ_API_BASE", "部署 Cloudflare Worker + D1（database_id、ALLOWED_ORIGINS、密钥），然后设置 LENSIQ_API_BASE", "docs/DEPLOYMENT-CHECKLIST.md · GET /admin/api/go-live"],
    ["opn", "Opn KYC + ทดสอบ PromptPay โหมดทดสอบครบวงจร (QR → ชำระ → webhook → ใบเสร็จ → คืนเงิน) แล้วจึงเปิด live", "Opn KYC + an end-to-end PromptPay test-mode charge (QR → paid → webhook → receipt → refund) before going live", "完成 Opn KYC，并在测试模式下完整测试 PromptPay（二维码 → 付款 → webhook → 收据 → 退款）后再上线", "docs/BILLING-PLAN.md §8"],
    ["pilot", "โครงการนำร่องหน้าร้าน/HR จริงพร้อมผลที่ลงนามร่วมกัน", "A real retail / HR pilot with a jointly signed result", "真实门店／HR 试点并取得双方签署的结果", "docs/PILOT-PLAN.md"],
    ["ai_cost", "วัดต้นทุน AI ต่อคำทำนายจริง (usage_counters) ก่อนกำหนดโควตา Plus", "Measure the real AI cost per reading (usage_counters) before fixing the Plus quota", "在确定 Plus 配额前实测每次解读的 AI 成本（usage_counters）", "docs/BILLING-PLAN.md 3.0"]
  ];

  /**
   * @param {any} seller window.LENSIQ_SELLER
   * @param {{api?: string, turnstile?: string, google?: string, profile?: string, locked?: boolean, ageGender?: boolean, faceparse?: boolean}} cfg
   *   locked: customer mode is locked by the operator (window.LENSIQ_RESEARCH.locked: LENSIQ_RESEARCH_DEMO = false or
   *   LENSIQ_PROFILE = "commercial" set before lensiq-config.js). Without it the research demo can still be switched on per device.
   * @returns {{id: string, group: string, state: string, required: boolean, where: string, th: string, en: string, zh: string}[]}
   */
  function checklist(seller, cfg) {
    var s = seller && typeof seller === "object" ? seller : {}, c = cfg || {}, out = [];
    SELLER.forEach(function (r) {
      var k = /** @type {string} */ (r[0]), ok = (k === "email" || k === "dpo_email") ? isEmail(s[k]) : has(s[k]);
      out.push({ id: "seller." + k, group: "seller", state: ok ? "ok" : r[1] ? "todo" : "optional", required: !!r[1], where: "lensiq-config.js LENSIQ_SELLER." + k, th: /** @type {string} */ (r[2]), en: /** @type {string} */ (r[3]), zh: /** @type {string} */ (r[4]) });
    });
    out.push({ id: "seller.counsel_confirmed", group: "seller", state: s.counsel_confirmed === true ? "ok" : "todo", required: true, where: "lensiq-config.js LENSIQ_SELLER.counsel_confirmed", th: "ทนายความยืนยันเกณฑ์อายุ ฐานการส่งข้อมูลต่างประเทศ และระยะเวลาเก็บแล้ว", en: "Counsel confirmed the age thresholds, transfer bases and retention periods", zh: "律师已确认年龄门槛、跨境传输依据和保存期限" });
    out.push({ id: "seller.sales_open", group: "seller", state: s.sales_open === true ? "ok" : "info", required: false, where: "lensiq-config.js LENSIQ_SELLER.sales_open", th: "เปิดขายแล้ว (ตั้งหลังรายการข้างบนครบเท่านั้น)", en: "Sales open (set only after everything above is done)", zh: "已开售（仅在以上各项完成后设置）" });
    var api = /^https?:\/\//.test(String(c.api || ""));
    var channel = api || isEmail(s.email) || has(s.line);
    out.push({ id: "config.lead_channel", group: "config", state: api ? "ok" : channel ? "warn" : "todo", required: true, where: "LENSIQ_SELLER.email / .line (mailto / LINE) · LENSIQ_API_BASE (/v1/leads)", th: api ? "แบบฟอร์มติดต่อส่งเข้ากล่องคำขอในหลังบ้าน" : channel ? "แบบฟอร์มติดต่อใช้ mailto/LINE ของผู้เยี่ยมชม (ยังไม่มีกล่องคำขอ)" : "แบบฟอร์มติดต่อยังไม่มีช่องทางใดเลย — คำขอค้างอยู่ในเบราว์เซอร์ของผู้เยี่ยมชม", en: api ? "Contact forms land in the admin inbox" : channel ? "Contact forms fall back to the visitor's own e-mail / LINE (no inbox yet)" : "Contact forms have no channel at all — requests wait in the visitor's browser", zh: api ? "联系表单进入后台收件箱" : channel ? "联系表单改用访客自己的邮件／LINE（尚无收件箱）" : "联系表单没有任何渠道，申请只留在访客浏览器中" });
    out.push({ id: "config.api", group: "config", state: api ? "ok" : "todo", required: true, where: "lensiq-config.js LENSIQ_API_BASE", th: "ที่อยู่ API Worker (สมาชิก การชำระเงิน กล่องคำขอ สถิติ)", en: "API Worker address (members, payments, lead inbox, statistics)", zh: "API Worker 地址（会员、付款、申请收件箱、统计）" });
    out.push({ id: "config.turnstile", group: "config", state: has(c.turnstile) ? "ok" : api ? "todo" : "optional", required: api, where: "lensiq-config.js LENSIQ_TURNSTILE_SITEKEY", th: "Cloudflare Turnstile site key (จำเป็นเมื่อมี API)", en: "Cloudflare Turnstile site key (required with the API)", zh: "Cloudflare Turnstile 站点密钥（启用 API 时必需）" });
    out.push({ id: "config.google", group: "config", state: has(c.google) ? "ok" : "optional", required: false, where: "lensiq-config.js LENSIQ_GOOGLE_CLIENT_ID", th: "Google OAuth Client ID (เข้าสู่ระบบสมาชิก)", en: "Google OAuth client ID (member sign-in)", zh: "Google OAuth 客户端 ID（会员登录）" });
    // round 16: "commercial" is now the default profile, so it only counts as done when the operator has locked it
    var prof = c.profile === "commercial" && c.locked ? "ok" : c.profile === "commercial" ? "open" : "demo";
    var PROF = {
      ok: ["ล็อกโหมดลูกค้าแล้ว (ปิดโมเดลที่ห้ามใช้เชิงพาณิชย์ และเปิดเดโมงานวิจัยในเครื่องไม่ได้)",
        "Customer mode locked (non-commercial models off; the research demo cannot be switched on)",
        "客户模式已锁定（不可商用的模型已关闭，无法开启研究演示）"],
      open: ["โหมดลูกค้าเป็นค่าเริ่มต้น แต่ยังไม่ล็อก — พนักงานยังเปิดเดโมงานวิจัย (อายุ/เพศ สีหน้า) ในแต่ละเครื่องได้ " +
          "ตั้ง LENSIQ_RESEARCH_DEMO = false ก่อนติดตั้งให้ลูกค้าที่จ่ายเงิน",
        "Customer mode by default but not locked — staff can still switch on the research demo (age/gender, expression) per device. " +
          "Set LENSIQ_RESEARCH_DEMO = false before any paid deployment",
        "默认为客户模式但尚未锁定：员工仍可在各设备上开启研究演示（年龄／性别、表情）。付费部署前请设置 LENSIQ_RESEARCH_DEMO = false"],
      demo: ["ยังเป็นโปรไฟล์เดโมเพื่อการวิจัย — ตั้ง LENSIQ_RESEARCH_DEMO = false ก่อนติดตั้งให้ลูกค้าที่จ่ายเงิน",
        "Still the research demo profile — set LENSIQ_RESEARCH_DEMO = false before any paid deployment",
        "仍为研究演示配置；付费部署前请设置 LENSIQ_RESEARCH_DEMO = false"]
    }[prof];
    out.push({ id: "config.profile", group: "config", state: prof === "ok" ? "ok" : "warn", required: true,
      where: "lensiq-config.js window.LENSIQ_RESEARCH_DEMO = false (or LENSIQ_PROFILE = \"commercial\" before lensiq-config.js)",
      th: PROF[0], en: PROF[1], zh: PROF[2] });
    var ag = c.ageGender ? "on" : c.locked ? "ok" : "open";
    var AG = {
      on: ["เปิดตัวเลือกอายุ/เพศ (โมเดล UTKFace ใบอนุญาตวิจัย)", "Age / gender option on (UTKFace, research licence)", "已开启年龄／性别选项（UTKFace，研究许可）"],
      ok: ["ปิดอายุ/เพศ (UTKFace) และล็อกไว้", "Age / gender off (UTKFace) and locked", "已关闭年龄／性别（UTKFace）并已锁定"],
      open: ["ปิดอายุ/เพศ (UTKFace) เป็นค่าเริ่มต้น แต่ยังเปิดได้จากสวิตช์เดโมงานวิจัยในแต่ละเครื่อง",
        "Age / gender off (UTKFace) by default, but the research demo switch can still turn it on per device",
        "默认关闭年龄／性别（UTKFace），但仍可通过各设备的研究演示开关开启"]
    }[ag];
    out.push({ id: "config.age_gender", group: "config", state: ag === "ok" ? "ok" : "warn", required: false,
      where: "lensiq-config.js LENSIQ_AGE_GENDER · LENSIQ_RESEARCH_DEMO", th: AG[0], en: AG[1], zh: AG[2] });
    if (c.faceparse) out.push({ id: "config.faceparse", group: "config", state: "warn", required: false, where: "lensiq-config.js LENSIQ_FACEPARSE", th: "เปิด BiSeNet (CelebAMask-HQ ไม่ใช่เชิงพาณิชย์)", en: "BiSeNet on (CelebAMask-HQ, non-commercial)", zh: "已开启 BiSeNet（CelebAMask-HQ，非商用）" });
    OUTSIDE.forEach(function (r) { out.push({ id: "outside." + r[0], group: "outside", state: "outside", required: true, where: r[4], th: r[1], en: r[2], zh: r[3] }); });
    return out;
  }
  /** Is this the owner's browser? @param {{search?: string}} loc @param {string|null} flag stored "lq-owner" */
  function isOwner(loc, flag) {
    var l = loc || {}, q = String(l.search || "");
    if (/[?&]owner=0\b/.test(q)) return false;
    return /[?&]owner=1\b/.test(q) || flag === "1";
  }
  /** Counts for a summary line. @param {{state: string}[]} list */
  function summaryOf(list) {
    var n = { ok: 0, todo: 0, warn: 0, optional: 0, outside: 0, info: 0 };
    list.forEach(function (x) { /** @type {any} */ (n)[x.state] = (/** @type {any} */ (n)[x.state] || 0) + 1; });
    return n;
  }
  var pure = { checklist: checklist, isOwner: isOwner, summaryOf: summaryOf, SELLER: SELLER, OUTSIDE: OUTSIDE };
  if (typeof module !== "undefined" && module.exports) { module.exports = pure; return; }

  /* ============================ browser ============================ */
  var doc = W.document;
  var flag = null;
  try {
    var q = String(location.search || "");
    if (/[?&]owner=1\b/.test(q)) W.localStorage.setItem("lq-owner", "1");
    if (/[?&]owner=0\b/.test(q)) W.localStorage.removeItem("lq-owner");
    flag = W.localStorage.getItem("lq-owner");
  } catch (e) { /* storage blocked: the query still works for this visit */ }
  var lang = function () { var l = String((W.LQI18N && W.LQI18N.lang) || doc.documentElement.lang || "th").toLowerCase(); return l.indexOf("zh") === 0 ? "zh" : l.indexOf("en") === 0 ? "en" : "th"; };
  var TX = /** @type {Record<string, string[]>} */ ({
    title: ["รายการก่อนเปิดขาย (เฉพาะเจ้าของระบบ)", "Go-live checklist (owner only)", "上线前检查清单（仅系统所有者）"],
    lead: ["อ่านจาก lensiq-config.js บนหน้านี้ — ผู้เยี่ยมชมไม่เห็นส่วนนี้ ช่องที่ยังว่างแสดงข้อความกลาง \"ประกาศก่อนเปิดขาย\" บนหน้าเว็บ", "Read from lensiq-config.js on this page — visitors never see this. Empty fields show the neutral \"announced before sales open\" wording on the site", "读取自本页的 lensiq-config.js，访客看不到此部分。空缺字段在网站上显示中性的“开售前公布”文字"],
    sum: ["ครบแล้ว {ok} · ต้องกรอกก่อนขาย {todo} · ควรตรวจ {warn} · ไม่บังคับ {optional} · ต้องใช้ทรัพยากรภายนอก {outside}", "Done {ok} · required before sales {todo} · check {warn} · optional {optional} · needs outside resources {outside}", "已完成 {ok} · 开售前必填 {todo} · 需检查 {warn} · 可选 {optional} · 需外部资源 {outside}"],
    seller: ["ข้อมูลผู้ขาย (LENSIQ_SELLER)", "Seller details (LENSIQ_SELLER)", "卖方信息（LENSIQ_SELLER）"],
    config: ["ค่าตั้งของเว็บ", "Site configuration", "网站配置"],
    outside: ["ต้องใช้ทรัพยากรภายนอก (ซอฟต์แวร์ทำแทนไม่ได้)", "Needs outside resources (software cannot do these)", "需外部资源（软件无法代替）"],
    ok: ["ครบ", "done", "完成"], todo: ["ต้องกรอก", "required", "必填"], warn: ["ตรวจ", "check", "检查"], optional: ["ไม่บังคับ", "optional", "可选"], outside_s: ["ภายนอก", "outside", "外部"], info: ["ข้อมูล", "info", "信息"],
    hide: ["ซ่อนส่วนนี้บนเบราว์เซอร์นี้", "Hide this on this browser", "在此浏览器中隐藏"],
    backend: ["ค่าลับฝั่ง Worker (SELLER_*, LEGAL_*_READY, Opn, TOTP) ตรวจที่หลังบ้าน: GET /admin/api/go-live · CI: npm run check:legal", "Worker-side secrets (SELLER_*, LEGAL_*_READY, Opn, TOTP) are checked in the admin: GET /admin/api/go-live · CI: npm run check:legal", "Worker 端密钥（SELLER_*、LEGAL_*_READY、Opn、TOTP）在后台检查：GET /admin/api/go-live · CI：npm run check:legal"]
  });
  var tx = function (/** @type {string} */ k, /** @type {any} */ v) { var i = { th: 0, en: 1, zh: 2 }[lang()] || 0; return String(TX[k][i]).replace(/\{(\w+)\}/g, function (m, x) { return v && v[x] != null ? v[x] : m; }); };
  /** @param {string} tag @param {string} [cls] @param {string} [text] */
  var mk = function (tag, cls, text) { var e = doc.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  function render() {
    if (!isOwner(location, flag)) return;
    var host = doc.getElementById("owner-golive");
    if (!host) {
      host = mk("section", "golive");
      host.id = "owner-golive";
      var main = doc.getElementById("main") || doc.body;
      main.appendChild(host);
    }
    host.textContent = "";
    host.setAttribute("lang", lang() === "zh" ? "zh-Hans" : lang());
    var list = checklist(W.LENSIQ_SELLER, { api: W.LENSIQ_API_BASE, turnstile: W.LENSIQ_TURNSTILE_SITEKEY, google: W.LENSIQ_GOOGLE_CLIENT_ID,
      profile: W.LENSIQ_PROFILE, locked: !!(W.LENSIQ_RESEARCH && W.LENSIQ_RESEARCH.locked),
      ageGender: W.LENSIQ_AGE_GENDER !== false, faceparse: W.LENSIQ_FACEPARSE === true });
    var L = lang();
    host.appendChild(mk("h2", "", tx("title")));
    host.appendChild(mk("p", "golive-lead", tx("lead")));
    host.appendChild(mk("p", "golive-sum", tx("sum", summaryOf(list))));
    ["seller", "config", "outside"].forEach(function (g) {
      host.appendChild(mk("h3", "", tx(g)));
      var ul = mk("ul", "golive-list");
      list.filter(function (x) { return x.group === g; }).forEach(function (x) {
        var li = mk("li", "golive-" + x.state);
        li.appendChild(mk("span", "golive-tag", tx(x.state === "outside" ? "outside_s" : x.state)));
        li.appendChild(mk("span", "golive-t", /** @type {any} */ (x)[L] || x.th));
        li.appendChild(mk("code", "golive-w", x.where));
        ul.appendChild(li);
      });
      host.appendChild(ul);
    });
    host.appendChild(mk("p", "golive-lead", tx("backend")));
    var hide = /** @type {HTMLButtonElement} */ (mk("button", "btn ghost", tx("hide")));
    hide.type = "button";
    hide.addEventListener("click", function () { try { W.localStorage.removeItem("lq-owner"); } catch (e) { /* ignore */ } flag = null; host.remove(); });
    host.appendChild(hide);
    if (location.hash === "#owner-golive") host.scrollIntoView({ block: "start" });
  }
  if (doc.readyState === "loading") doc.addEventListener("DOMContentLoaded", render); else render();
  W.addEventListener("lq-lang", function () { if (doc.getElementById("owner-golive")) render(); });
})(typeof window !== "undefined" ? window : /** @type {any} */ (globalThis));
