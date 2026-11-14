/* lensiq-helpline.js — the ONE shared tap-to-call help-line component (owner order 2026-11-14, Part B).
 * Every help number the site shows (1323, 1669, 191, 1300, Samaritans 02 113 6789) is drawn by this component: a button with
 * a phone icon and a tel: link (at least 44 px tall, styles.css .lq-call*), a second line, small print with the agency, and
 * — on a computer (no touch, or a wide screen) — the number as large text that can be selected and copied.
 * Numbers and hours: only what docs/CRISIS-RESOURCES.md verified on the agency's own page (checked 2026-11-14). 1669 has
 * no hours or cost because niems.go.th does not state them on a page we can read. The wording (L63) awaits review by a
 * mental-health professional; the 1323 Thai wording is the owner's own (2026-11-14) and must stay warm: the button and the
 * second line never use the words in FORBIDDEN (tests/unit/helpline-call.test.js).
 * Users: tools/helpline.mjs writes the static HTML (fortune pages, medicine, nutrition, terms) with html(); fortune-crisis.js
 * (help line under a reading) and fortune-ai.js (crisis card) build it with el(). Thai output carries data-i18n keys
 * call.<id>.btn / .sub / .org; English and Chinese are in i18n/{en,zh}-common.js (unit-tested to match LINES). */
(function (root) {
  "use strict";
  /** btn = the whole wording (the link's accessible name), read as the short label followed by the call button go (with the
   *  number): owner addition 2026-11-14, one compact row on a phone
   *  @typedef {{btn: string, label: string, go: string, sub: string, org: string}} Words */
  /** @typedef {{n: string, tel: string, th: Words, en: Words, zh: Words}} Line */
  /** @type {Record<string, Line>} */
  const LINES = {
    1323: {
      n: "1323", tel: "1323",
      th: { btn: "อยากมีคนรับฟัง โทร 1323", label: "อยากมีคนรับฟัง", go: "โทร 1323", sub: "พูดคุยได้ตลอด 24 ชั่วโมง กับผู้ที่พร้อมรับฟัง", org: "บริการของกรมสุขภาพจิต" },
      en: { btn: "Want someone to listen? Call 1323", label: "Want someone to listen?", go: "Call 1323", sub: "Talk any time, 24 hours a day, with someone ready to listen",
        org: "A service of the Department of Mental Health, Thailand" },
      zh: { btn: "想找人倾听？拨打 1323", label: "想找人倾听？", go: "拨打 1323", sub: "24 小时随时可以聊，有人愿意倾听", org: "泰国心理健康司提供的服务" },
    },
    1669: {
      n: "1669", tel: "1669",
      th: { btn: "เจ็บป่วยฉุกเฉิน โทร 1669", label: "เจ็บป่วยฉุกเฉิน", go: "โทร 1669", sub: "ขอรถพยาบาลและความช่วยเหลือทางการแพทย์ฉุกเฉิน", org: "สถาบันการแพทย์ฉุกเฉินแห่งชาติ (สพฉ.)" },
      en: { btn: "Medical emergency? Call 1669", label: "Medical emergency?", go: "Call 1669", sub: "Ambulance and emergency medical help", org: "National Institute for Emergency Medicine (NIEM)" },
      zh: { btn: "医疗急救 拨打 1669", label: "医疗急救", go: "拨打 1669", sub: "救护车和紧急医疗援助", org: "泰国国家紧急医疗研究院（NIEM）" },
    },
    191: {
      n: "191", tel: "191",
      th: { btn: "แจ้งเหตุด่วนเหตุร้าย โทร 191", label: "แจ้งเหตุด่วนเหตุร้าย", go: "โทร 191", sub: "แจ้งตำรวจได้ตลอด 24 ชั่วโมง", org: "สำนักงานตำรวจแห่งชาติ" },
      en: { btn: "Police emergency? Call 191", label: "Police emergency?", go: "Call 191", sub: "Reach the police, 24 hours a day", org: "Royal Thai Police" },
      zh: { btn: "报警 拨打 191", label: "报警", go: "拨打 191", sub: "24 小时联系警察", org: "泰国皇家警察" },
    },
    1300: {
      n: "1300", tel: "1300",
      th: { btn: "ศูนย์ช่วยเหลือสังคม โทร 1300", label: "ศูนย์ช่วยเหลือสังคม", go: "โทร 1300", sub: "ความรุนแรงในครอบครัว เด็กและเยาวชน ตลอด 24 ชั่วโมง 7 วัน",
        org: "กระทรวงการพัฒนาสังคมและความมั่นคงของมนุษย์ (พม.)" },
      en: { btn: "Social Assistance Center: Call 1300", label: "Social Assistance Center", go: "Call 1300", sub: "Domestic violence, children and young people; 24 hours, 7 days",
        org: "Ministry of Social Development and Human Security" },
      zh: { btn: "社会援助中心 拨打 1300", label: "社会援助中心", go: "拨打 1300", sub: "家庭暴力、儿童和青少年求助，每周 7 天 24 小时", org: "泰国社会发展与人类安全部" },
    },
    samaritans: {
      n: "02 113 6789", tel: "021136789",
      th: { btn: "สะมาริตันส์ โทร 02 113 6789", label: "สะมาริตันส์", go: "โทร 02 113 6789", sub: "รับฟังทุกเรื่องด้วยใจ เวลา 12:00–22:00 น.", org: "สมาคมสะมาริตันส์แห่งประเทศไทย" },
      en: { btn: "Samaritans: Call 02 113 6789", label: "Samaritans", go: "Call 02 113 6789", sub: "A listening line, 12:00–22:00", org: "Samaritans of Thailand" },
      zh: { btn: "撒玛利亚会 拨打 02 113 6789", label: "撒玛利亚会", go: "拨打 02 113 6789", sub: "倾听热线，12:00–22:00", org: "泰国撒玛利亚会（Samaritans of Thailand）" },
    },
  };
  const ORDER = ["1323", "1669", "191", "1300", "samaritans"];
  /** words that label the reader as ill: never on a button or a second line (owner lists 2026-11-14, plus close variants) */
  const FORBIDDEN = {
    th: ["ผู้ป่วย", "โรค", "จิตเวช", "อาการ", "ภาวะ", "ปัญหาสุขภาพจิต", "ป่วยทางจิต", "ป่วยจิต", "จิตไม่ปกติ"],
    en: ["patient", "disease", "illness", "psychiatric", "symptom", "disorder", "mental health problem", "mental illness", "mentally ill", "sick",
      "crazy", "insane", "diagnos"],
    zh: ["患者", "病", "精神科", "症状", "障碍", "心理疾病", "精神疾病", "疯", "诊断"],
  };
  /** the forbidden words found in a text (English: from a word start, case-insensitive) @param {string} text @param {string} lang */
  function forbiddenIn(text, lang) {
    const t = String(text || ""), list = FORBIDDEN[lang === "en" || lang === "zh" ? lang : "th"];
    return list.filter(w => (lang === "en" ? new RegExp("\\b" + w.replace(/\s+/g, "\\s+"), "i").test(t) : t.includes(w)));
  }
  const PHONE_D = "M7 3h3l1.5 5-2 1.5a12 12 0 0 0 5 5l1.5-2 5 1.5v3a2 2 0 0 1-2 2A17 17 0 0 1 5 5a2 2 0 0 1 2-2z";
  const ICON = '<svg class="lq-call-ico" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="' + PHONE_D + '"/></svg>';
  const langOf = (/** @type {any} */ l) => (l === "en" || l === "zh" ? l : "th");
  const esc = (/** @type {any} */ s) => String(s).replace(/[&<>"]/g, c => (/** @type {Record<string, string>} */ ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }))[c]);
  /** @param {string} id */
  const line = id => { const x = LINES[id]; if (!x) throw new Error("lensiq-helpline: unknown line " + id); return x; };
  /** compact drops the second line and the small print, except for 1323 (the owner's wording is always whole)
   *  @param {string} id @param {any} o */
  const full = (id, o) => id === "1323" || !(o && o.compact);

  /** the component as HTML. Thai carries data-i18n keys (the page translates it); EN / ZH are fixed text.
   *  @param {string} id @param {{lang?: string, cls?: string, compact?: boolean, keys?: boolean}} [o] */
  function html(id, o) {
    const x = line(id), l = langOf(o && o.lang), W = x[l], keys = l === "th" && !(o && o.keys === false);
    const k = (/** @type {string} */ f) => (keys ? ' data-i18n="call.' + id + "." + f + '"' : "");
    const cls = o && o.cls ? " " + esc(o.cls) : "";
    let h = '<span class="lq-call" data-lq-call="' + id + '">' +
      '<span class="lq-call-t"' + k("label") + ">" + esc(W.label) + "</span>" +
      '<a class="lq-call-btn' + cls + '" href="tel:' + x.tel + '" aria-label="' + esc(W.btn) + '"' +
      (keys ? ' data-i18n-attr="aria-label:call.' + id + '.btn"' : "") + ">" + ICON + '<span class="lq-call-go"' + k("go") + ">" + esc(W.go) + "</span></a>" +
      '<span class="lq-call-num">' + esc(x.n) + "</span>";
    if (full(id, o)) h += '<span class="lq-call-sub"' + k("sub") + ">" + esc(W.sub) + "</span>" + '<small class="lq-call-org"' + k("org") + ">" + esc(W.org) + "</small>";
    return h + "</span>";
  }

  /** the component as an element (textContent only, no innerHTML). Thai with keys when the page has LQI18N, else fixed text.
   *  @param {any} doc @param {string} id @param {{lang?: string, cls?: string, compact?: boolean, keys?: boolean}} [o] */
  function el(doc, id, o) {
    const d = doc || root.document, x = line(id), l = langOf(o && o.lang), W = x[l], keys = l === "th" && !!(o && o.keys);
    /** @param {string} tag @param {string} [c] @param {string} [t] @param {string} [f] */
    const mk = (tag, c, t, f) => {
      const e = d.createElement(tag); if (c) e.className = c; if (t != null) e.textContent = t;
      if (f && keys) e.setAttribute("data-i18n", "call." + id + "." + f);
      return e;
    };
    const box = mk("span", "lq-call"); box.setAttribute("data-lq-call", id);
    box.appendChild(mk("span", "lq-call-t", W.label, "label"));
    const a = mk("a", "lq-call-btn" + (o && o.cls ? " " + o.cls : "")); a.setAttribute("href", "tel:" + x.tel); a.setAttribute("aria-label", W.btn);
    if (keys) a.setAttribute("data-i18n-attr", "aria-label:call." + id + ".btn");
    try {
      const NS = "http://www.w3.org/2000/svg";
      if (d.createElementNS) {
        const svg = d.createElementNS(NS, "svg"), p = d.createElementNS(NS, "path");
        svg.setAttribute("class", "lq-call-ico"); svg.setAttribute("viewBox", "0 0 24 24");
        svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
        p.setAttribute("d", PHONE_D);
        svg.appendChild(p); a.appendChild(svg);
      }
    } catch (e) { /* no SVG: the text still says "call" */ }
    a.appendChild(mk("span", "lq-call-go", W.go, "go"));
    box.appendChild(a);
    box.appendChild(mk("span", "lq-call-num", x.n));
    if (full(id, o)) { box.appendChild(mk("span", "lq-call-sub", W.sub, "sub")); box.appendChild(mk("small", "lq-call-org", W.org, "org")); }
    return box;
  }

  /** the crisis card's lines in order: {id, n, tel, btn, t (second line), org} @param {string} [lang] */
  const cardLines = lang => ORDER.map(id => { const x = LINES[id], W = x[langOf(lang)]; return { id, n: x.n, tel: x.tel, btn: W.btn, t: W.sub, org: W.org }; });

  const api = { LINES, ORDER, FORBIDDEN, forbiddenIn, html, el, ICON, cardLines };
  if (typeof module !== "undefined" && module.exports) module.exports = api; else /** @type {any} */ (root).LQHelpline = api;
})(typeof window !== "undefined" ? window : globalThis);
