/* lensiq-research.js — round 16: the "Research demo" toggle (customer build switch, docs: lensiq-config.js LENSIQ_PROFILE).
 *
 * The public site and every host without an override run in customer mode: the face-api.js age/gender model (UTKFace,
 * non-commercial research data) and face-expression model (training data with unclear licensing) are never loaded or
 * shown (LICENSES/THIRD_PARTY.md F5). This module shows, on cameras.html#profile and on each page that uses those models
 * (signage, neuro, booth, photobooth), what is off and why, the licence label, and a per-device toggle (OFF by default)
 * that brings the research models back on THIS device only. An operator config (LENSIQ_RESEARCH_DEMO = false, or
 * LENSIQ_PROFILE = "commercial" before lensiq-config.js) locks the toggle off: a customer install can never enable it.
 *
 * Load after lensiq-config.js. Host element: <div data-lq-research="<page>"></div> (page = cameras | signage | neuro |
 * booth | photobooth). Text is TH / EN / ZH in this file (data-i18n-skip) and follows the language switch ("lq-lang").
 * Face detection, landmarks and recognition are not affected (a separate legal question, F5/F6).
 */
(function (root) {
  "use strict";
  var W = /** @type {any} */ (root);
  var KEY = "lq-research-demo";
  var LIC_HREF = "LICENSES/THIRD_PARTY.md"; // F5 is a table row, not a heading: no #fragment (the link text names the row)

  /** @type {Record<string, Record<string, string>>} */
  var TXT = {
    th: {
      "label": "เดโมงานวิจัย — โมเดลใบอนุญาตวิจัย (อายุ/เพศ, สีหน้า) ห้ามใช้เชิงพาณิชย์",
      "reload": "(จำไว้ในเครื่องนี้ หน้าเว็บจะโหลดใหม่)",
      "lic": "ป้ายใบอนุญาต: โมเดลอายุ/เพศของ face-api.js ฝึกจาก UTKFace (อนุญาตเฉพาะงานวิจัย ไม่ใช่เชิงพาณิชย์) และโมเดลสีหน้าฝึกจากชุดข้อมูลที่สิทธิ์ไม่ชัดเจน ใช้เพื่อสาธิตและวิจัยในเครื่องนี้เท่านั้น ดู",
      "licLink": "LICENSES/THIRD_PARTY.md ข้อ F5",
      "off": "ปิดอยู่ (โหมดลูกค้า ค่าเริ่มต้น): ไม่โหลดและไม่แสดงโมเดลอายุ/เพศและสีหน้า",
      "on": "เปิดอยู่ในเครื่องนี้เท่านั้น (จำไว้ในเบราว์เซอร์นี้) ปิดกลับได้ตลอด",
      "opDemo": "ผู้ติดตั้งตั้งเครื่องนี้เป็นเครื่องสาธิต (LENSIQ_PROFILE = \"demo\") ปิดในเครื่องนี้ได้",
      "locked": "ผู้ติดตั้งล็อกโหมดลูกค้าไว้ (การติดตั้งให้ลูกค้า) เปิดเดโมงานวิจัยในเครื่องนี้ไม่ได้",
      "face": "การตรวจจับใบหน้า จุดบนใบหน้า และการจดจำใบหน้าไม่เปลี่ยน เป็นคำถามทางกฎหมายแยกต่างหาก (F5/F6) ป้าย \"โมเดลใบอนุญาตวิจัย\" บนหน้ากล้องจึงยังแสดงอยู่",
      "why.cameras": "เว็บนี้ (รวมเว็บสาธิตบน GitHub Pages) เปิดในโหมดลูกค้าเป็นค่าเริ่มต้น: ไม่โหลดและไม่แสดงโมเดลอายุ/เพศและสีหน้า เปิด \"เดโมงานวิจัย\" ได้เฉพาะเครื่องนี้เพื่อสาธิตหรือวิจัย",
      "why.neuro": "โหมดลูกค้า: หน้านี้ต้องใช้โมเดลสีหน้า ซึ่งปิดอยู่เพราะข้อมูลฝึกยังไม่ได้รับการยืนยันสิทธิ์ใช้เชิงพาณิชย์ (F5) จึงยังไม่เปิดกล้องและไม่วิเคราะห์สีหน้า ผลการทดสอบที่บันทึกไว้ในเครื่องนี้ยังดูและส่งออกได้ เปิดเดโมงานวิจัยด้านล่างเพื่อสาธิต",
      "why.signage": "โหมดลูกค้า: ปิดโมเดลอายุ/เพศ (UTKFace) และโมเดลสีหน้า เพราะข้อมูลฝึกยังไม่ได้รับการยืนยันสิทธิ์ใช้เชิงพาณิชย์ (F5) ป้ายยังนับผู้ชม การมองจอ และเวลามองได้ แต่ไม่เลือกโฆษณาตามอายุ/เพศหรือรอยยิ้ม และไม่เก็บสถิติยิ้ม/Valence",
      "why.booth": "โหมดลูกค้า: ปิดโมเดลสีหน้า เพราะข้อมูลฝึกยังไม่ได้รับการยืนยันสิทธิ์ใช้เชิงพาณิชย์ (F5) บูธยังนับผู้เข้าชม เวลาอยู่ การหยุดชม และการหันมองได้ แต่ไม่วัดสีหน้าหลักและ Valence",
      "why.photobooth": "โหมดลูกค้า: ปิดโมเดลสีหน้า เพราะข้อมูลฝึกยังไม่ได้รับการยืนยันสิทธิ์ใช้เชิงพาณิชย์ (F5) การตรวจรูปติดบัตรจึงไม่ตรวจสีหน้า (ยิ้มกว้างเกินไป) ให้ตรวจด้วยตาก่อนพิมพ์ ส่วนอื่นทำงานเหมือนเดิม",
      "onnote": "เดโมงานวิจัยเปิดอยู่: หน้านี้ใช้โมเดลใบอนุญาตวิจัย ห้ามใช้เชิงพาณิชย์"
    },
    en: {
      "label": "Research demo — research-licence models (age/gender, expression), not for commercial use",
      "reload": "(remembered on this device; the page reloads)",
      "lic": "Licence label: the face-api.js age/gender model was trained on UTKFace (non-commercial research only) and the expression model on datasets with unclear licensing. For demonstration and research on this device only. See",
      "licLink": "LICENSES/THIRD_PARTY.md, item F5",
      "off": "Off (customer mode, the default): the age/gender and expression models are never loaded or shown",
      "on": "On for this device only (remembered in this browser). You can switch it off at any time",
      "opDemo": "The installer set this device up as a demo unit (LENSIQ_PROFILE = \"demo\"). You can switch it off on this device",
      "locked": "Customer mode is locked by the installer (customer installation). The research demo cannot be switched on here",
      "face": "Face detection, face landmarks and face recognition are not affected. They are a separate legal question (F5/F6), so the \"research-licence model\" label on camera pages stays",
      "why.cameras": "This site (including the GitHub Pages demo) runs in customer mode by default: the age/gender and expression models are never loaded or shown. The research demo can be switched on for this device only, for demonstrations or research",
      "why.neuro": "Customer mode: this page needs the face-expression model, which is off because its training data is not cleared for commercial use (F5). The camera is not opened and no expressions are analysed. Results already saved on this device can still be viewed and exported. Switch on the research demo below to demonstrate it",
      "why.signage": "Customer mode: the age/gender (UTKFace) and face-expression models are off because their training data is not cleared for commercial use (F5). The sign still counts viewers, gaze and viewing time, but does not pick ads by age/gender or smiles and records no smile or valence statistics",
      "why.booth": "Customer mode: the face-expression model is off because its training data is not cleared for commercial use (F5). The booth still counts visitors, dwell time, stops and attention, but does not measure the dominant expression or valence",
      "why.photobooth": "Customer mode: the face-expression model is off because its training data is not cleared for commercial use (F5). The ID-photo check therefore does not check the expression (smile too wide); check it by eye before printing. Everything else works as before",
      "onnote": "Research demo is on: this page uses research-licence models, not for commercial use"
    },
    zh: {
      "label": "研究演示 — 研究许可模型（年龄/性别、表情），不得用于商业用途",
      "reload": "（保存在本设备，页面将重新加载）",
      "lic": "许可标签：face-api.js 年龄/性别模型基于 UTKFace 训练（仅限非商业研究），表情模型的训练数据许可不明确。仅可在本设备上用于演示和研究。参见",
      "licLink": "LICENSES/THIRD_PARTY.md 第 F5 项",
      "off": "已关闭（客户模式，默认）：不加载、不显示年龄/性别与表情模型",
      "on": "仅在本设备开启（保存在此浏览器），可随时关闭",
      "opDemo": "安装人员已将本设备设为演示机（LENSIQ_PROFILE = \"demo\"），可在本设备关闭",
      "locked": "安装人员已锁定客户模式（客户部署），无法在此开启研究演示",
      "face": "人脸检测、面部特征点和人脸识别不受影响，它们是另一项法律问题（F5/F6），因此摄像头页面上的“研究许可模型”标签仍会显示",
      "why.cameras": "本网站（包括 GitHub Pages 演示站）默认以客户模式运行：不加载、不显示年龄/性别与表情模型。仅可在本设备上开启“研究演示”，用于演示或研究",
      "why.neuro": "客户模式：本页面需要表情模型，因其训练数据尚未确认可商用（F5）而关闭。因此不打开摄像头，也不分析表情。本设备上已保存的结果仍可查看和导出。如需演示，请在下方开启研究演示",
      "why.signage": "客户模式：年龄/性别（UTKFace）与表情模型已关闭，因其训练数据尚未确认可商用（F5）。屏幕仍会统计观众、注视和观看时长，但不会按年龄/性别或微笑选择广告，也不记录微笑或效价统计",
      "why.booth": "客户模式：表情模型已关闭，因其训练数据尚未确认可商用（F5）。展位仍会统计访客、停留时长、驻足和注视，但不测量主要表情和效价",
      "why.photobooth": "客户模式：表情模型已关闭，因其训练数据尚未确认可商用（F5）。因此证件照检查不检查表情（笑得太开），请在打印前目视检查。其他功能照常",
      "onnote": "研究演示已开启：本页面使用研究许可模型，不得用于商业用途"
    }
  };

  function lang() {
    var d = typeof document !== "undefined" ? document : null;
    var l = (W.LQI18N && W.LQI18N.lang) || (d && d.documentElement && d.documentElement.lang) || "th";
    return /^zh/.test(l) ? "zh" : /^en/.test(l) ? "en" : "th";
  }
  /** @param {string} k @param {string} [l] */
  function t(k, l) { var d = TXT[l || lang()] || TXT.th; return d[k] != null ? d[k] : TXT.th[k] || k; }

  /** Resolved state from lensiq-config.js; without it (config missing) = customer mode. */
  function state() {
    var r = W.LENSIQ_RESEARCH;
    if (r && typeof r === "object") return { on: r.on === true && W.LENSIQ_PROFILE === "demo", locked: r.locked || null, operatorDemo: !!r.operatorDemo };
    return { on: false, locked: null, operatorDemo: false };
  }
  /** True only in research demo mode with the expression model allowed. */
  function expressionOn() { return state().on && W.LENSIQ_EXPRESSION === true; }
  /** True only in research demo mode with the age/gender option allowed. */
  function ageGenderOn() { return state().on && W.LENSIQ_AGE_GENDER === true; }

  /** Store the per-device choice. Returns false (nothing stored) when the operator locked customer mode. */
  function set(on) {
    if (state().locked) return false;
    try {
      localStorage.setItem(KEY, on ? "on" : "off");
      if (on) localStorage.removeItem("lq-profile"); // round-12 "commercial on this device" = research off
    } catch (e) { return false; }
    return true;
  }

  var styled = false;
  function style() {
    if (styled || typeof document === "undefined") return; styled = true;
    var s = document.createElement("style");
    s.textContent = [
      ".lq-research{margin:10px 0;padding:10px 14px;border-radius:12px;border:1px solid #d7dcef;background:#f6f7fc;color:#1f2540",
      ";font-size:.88rem;line-height:1.5;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}",
      ".lq-research.is-on{border-color:#f3b7b0;background:#fdf1ef}.lq-research p{margin:4px 0}.lq-research .lq-r-why{font-weight:600}",
      ".lq-research label{display:flex;gap:8px;align-items:flex-start;cursor:pointer;font-weight:600;margin:6px 0}",
      // page CSS often sets input{width:100%}: keep the checkbox small and let the label text wrap (360 px phones)
      ".lq-research input[type=checkbox]{margin:3px 0 0;flex:none;width:auto;min-width:0;height:auto}.lq-research label>span{flex:1 1 auto;min-width:0}",
      ".lq-research input:disabled+span{opacity:.6}.lq-research .lq-r-lic,.lq-research .lq-r-face{font-size:.82rem;color:#4a5170}",
      ".lq-research .lq-r-state{font-size:.82rem}"
    ].join("");
    (document.head || document.documentElement).appendChild(s);
  }

  /**
   * Render the notice + toggle into host. page: cameras | signage | neuro | booth | photobooth.
   * @param {HTMLElement} host @param {string} page
   */
  function mount(host, page) {
    if (!host || host.getAttribute("data-lq-mounted")) return null;
    host.setAttribute("data-lq-mounted", "1"); style();
    var st = state();
    var box = document.createElement("section");
    box.className = "lq-research" + (st.on ? " is-on" : ""); box.setAttribute("data-i18n-skip", ""); box.setAttribute("data-page", page);
    box.setAttribute("aria-label", t("label"));
    var why = document.createElement("p"); why.className = "lq-r-why"; why.setAttribute("role", "note");
    var lab = document.createElement("label");
    var cb = document.createElement("input"); cb.type = "checkbox"; cb.id = page === "cameras" ? "lqResearch" : "lqResearch-" + page; cb.className = "lq-r-toggle";
    var span = document.createElement("span"), hint = document.createElement("small");
    lab.appendChild(cb); lab.appendChild(span);
    var stateP = document.createElement("p"); stateP.className = "lq-r-state"; stateP.setAttribute("role", "status");
    var lic = document.createElement("p"); lic.className = "lq-r-lic";
    var licT = document.createElement("span"), a = document.createElement("a"); a.href = LIC_HREF; a.target = "_blank"; a.rel = "noopener"; a.className = "lq-r-liclink";
    lic.appendChild(licT); lic.appendChild(document.createTextNode(" ")); lic.appendChild(a);
    var face = document.createElement("p"); face.className = "lq-r-face";
    box.appendChild(why); box.appendChild(lab); box.appendChild(stateP); box.appendChild(lic);
    if (page === "cameras") box.appendChild(face);
    cb.checked = st.on; cb.disabled = !!st.locked;
    var fill = function () {
      why.textContent = page !== "cameras" && st.on ? t("onnote") : t("why." + page);
      span.textContent = t("label") + " "; hint.textContent = t("reload"); span.appendChild(hint);
      stateP.textContent = st.locked ? t("locked") : st.on ? (st.operatorDemo ? t("opDemo") : t("on")) : t("off");
      licT.textContent = t("lic"); a.textContent = t("licLink"); face.textContent = t("face");
      box.setAttribute("aria-label", t("label"));
    };
    cb.addEventListener("change", function () {
      if (!set(cb.checked)) { cb.checked = state().on; return; }
      try { location.reload(); } catch (e) { /* ignore */ }
    });
    fill(); if (W.addEventListener) W.addEventListener("lq-lang", fill);
    host.appendChild(box);
    return box;
  }

  function mountAll() {
    if (typeof document === "undefined") return;
    var hosts = document.querySelectorAll("[data-lq-research]");
    for (var i = 0; i < hosts.length; i++) mount(/** @type {HTMLElement} */ (hosts[i]), hosts[i].getAttribute("data-lq-research") || "cameras");
  }

  var api = { KEY: KEY, LIC_HREF: LIC_HREF, TXT: TXT, t: t, state: state, expressionOn: expressionOn, ageGenderOn: ageGenderOn, set: set, mount: mount, mountAll: mountAll };
  W.LQResearch = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  if (typeof document !== "undefined") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mountAll); else mountAll();
  }
})(typeof window !== "undefined" ? window : globalThis);
