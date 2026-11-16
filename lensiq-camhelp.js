/* lensiq-camhelp.js — one shared "how to allow the camera" help for every camera page (owner input 2026-11-16 from a real
 * iPhone 16 Pro, iOS 27.0.1, Safari: the refusal notice said what was refused but not how to turn the camera back on).
 *
 * Loading (speed budget): lensiq-camera.js carries a small stub that wraps getUserMedia, notes the notices already on the page
 * before each request and loads this file only after a refusal; checkout.html (no LQCam) loads this file itself.
 * When the camera is refused (NotAllowedError / SecurityError / PermissionDeniedError from getUserMedia), the page's own refusal
 * notice gets a small link "วิธีเปิดสิทธิ์กล้อง" (EN "How to allow the camera", ZH "如何允许使用相机"). It is a <details>
 * element: one tap opens the steps in place. No request, no storage, nothing sent. Demo mode (?demo=1, which refuses the
 * camera on purpose) gets no help block.
 * How the notice is found: the smallest visible element whose own text names the camera AND the permission (TH / EN / ZH),
 * that was not on the page when the camera was asked for. Page scripts often rewrite their notice (textContent); a
 * MutationObserver, active only while the camera stays refused, puts the help back and redraws it when the language changes.
 * The step wording lives in HELP: ONE constant per language. The owner will send the exact iOS 27 button and menu names;
 * swap them there in one edit. Step 1 is the owner's wording: on iOS 27 Safari collapses the address bar to the page title. */
(function (root) {
  "use strict";
  if (typeof document === "undefined" || root.LQCamHelp) return;

  /** ONE constant per language (owner: names swappable in one edit) */
  const HELP = {
    th: {
      link: "วิธีเปิดสิทธิ์กล้อง",
      steps: [
        "แตะชื่อหน้าด้านบนสุด (เมื่อเลื่อนหน้า Safari จะย่อแถบที่อยู่เหลือแค่ชื่อหน้า)",
        "แตะปุ่มเมนูหน้าเว็บ (aA หรือไอคอนเมนู) ที่ช่องที่อยู่",
        "เลือก การตั้งค่าเว็บไซต์ > กล้อง > อนุญาต แล้วกดเปิดกล้องอีกครั้ง",
        "ถ้ายังไม่ได้: ไปที่ การตั้งค่า > แอป > Safari > กล้อง > อนุญาต",
        "บนคอมพิวเตอร์: กดไอคอนแม่กุญแจหรือไอคอนกล้องที่แถบที่อยู่ แล้วเลือก อนุญาต"
      ]
    },
    en: {
      link: "How to allow the camera",
      steps: [
        "Tap the page title at the very top (while you scroll, Safari shrinks the address bar to the page title)",
        "Tap the page menu button (aA or the menu icon) in the address bar",
        "Choose Website Settings > Camera > Allow, then start the camera again",
        "If that does not work: go to Settings > Apps > Safari > Camera > Allow",
        "On a computer: click the lock or camera icon in the address bar and choose Allow"
      ]
    },
    zh: {
      link: "如何允许使用相机",
      steps: [
        "点按最上方的页面标题（滚动时 Safari 会把地址栏缩成页面标题）",
        "点按地址栏中的页面菜单按钮（aA 或菜单图标）",
        "选择 网站设置 > 相机 > 允许，然后重新打开相机",
        "如果仍不行：前往 设置 > App > Safari > 相机 > 允许",
        "在电脑上：点按地址栏中的锁形或相机图标，然后选择 允许"
      ]
    }
  };
  // a refusal notice names the camera AND the permission (same words as tests/e2e/iphone-pages-webkit.e2e.mjs)
  const NOTICE = [[/กล้อง/, /อนุญาต|สิทธิ์|ถูกปฏิเสธ/], [/camera/i, /permission|allow|denied|blocked/i], [/摄像头|相机|镜头/, /权限|允许|拒绝/]];
  const SKIP = "#siteNav, header.nav, footer, .lq-helpline, .lq-camhelp, button, a, label, summary, option, select, textarea, script, style, noscript";

  const lang = () => {
    const l = (root.LQI18N && root.LQI18N.lang) || document.documentElement.lang || "th";
    return /^zh/i.test(l) ? "zh" : /^en/i.test(l) ? "en" : "th";
  };
  const denyName = e => /^(NotAllowedError|PermissionDeniedError|SecurityError)$/.test((e && e.name) || "");
  /** the element's own text, without a help block inside it */
  const ownText = el => {
    const h = el.querySelector(".lq-camhelp");
    return (h ? (el.innerText || "").replace(h.innerText || "", "") : el.innerText || "").replace(/\s+/g, " ").trim();
  };
  const shown = el => {
    const r = el.getBoundingClientRect(), s = getComputedStyle(el);
    // pointer-events none = a passing toast or a non-interactive overlay: the help link would not be tappable there
    return r.width > 0 && r.height > 0 && s.display !== "none" && s.visibility !== "hidden" && s.pointerEvents !== "none" && !el.closest("[hidden]");
  };
  const isNotice = t => !!t && t.length <= 400 && NOTICE.some(p => p[0].test(t) && p[1].test(t));
  function notices() {
    const out = [];
    for (const el of document.querySelectorAll("body *")) {
      const tc = el.textContent || ""; // cheap filter first: innerText forces layout
      if (tc.length > 3000 || !NOTICE.some(p => p[0].test(tc) && p[1].test(tc)) || el.closest(SKIP)) continue;
      const t = ownText(el);
      if (isNotice(t) && shown(el)) out.push({ el, t });
    }
    return out;
  }

  // before: element -> textContent of the notices that were on the page when the camera was asked for (not this refusal's)
  let denied = false, before = new Map(), obs = null, timer = 0, openWanted = false;
  const snap = () => { const m = new Map(); if (document.body) for (const el of document.body.querySelectorAll("*")) {
    const t = el.textContent || ""; if (t.length <= 3000 && NOTICE.some(p => p[0].test(t) && p[1].test(t))) m.set(el, t); } return m; };
  const old = n => before.get(n.el) === n.el.textContent;
  function build(l) {
    const H = HELP[l], d = document.createElement("details");
    d.className = "lq-camhelp"; d.setAttribute("translate", "no"); d.setAttribute("data-i18n-skip", ""); d.dataset.lang = l;
    d.style.display = "block"; d.style.marginTop = "6px"; d.style.fontWeight = "normal";
    const s = document.createElement("summary");
    s.textContent = H.link;
    Object.assign(s.style, { cursor: "pointer", minHeight: "44px", display: "flex", alignItems: "center", textDecoration: "underline", fontWeight: "600" });
    const ol = document.createElement("ol");
    ol.style.margin = "4px 0 0"; ol.style.paddingLeft = "1.4em";
    for (const step of H.steps) { const li = document.createElement("li"); li.textContent = step; li.style.margin = "2px 0"; ol.appendChild(li); }
    d.append(s, ol);
    if (openWanted) d.open = true;
    d.addEventListener("toggle", () => { openWanted = d.open; });
    return d;
  }
  function place() {
    timer = 0;
    if (!denied) return;
    const l = lang(), list = notices().filter(n => !old(n));
    if (!list.length) return;
    // a help block that still sits with a current notice stays where it is (pages rewrite their status often; moving it
    // would close it under the user's finger); it is only redrawn when the language changed
    const cur = document.querySelector(".lq-camhelp");
    if (cur) {
      const box = cur.dataset.after === "1" ? cur.previousElementSibling : cur.parentElement;
      if (box && list.some(n => n.el === box || box.contains(n.el))) {
        for (const x of document.querySelectorAll(".lq-camhelp")) if (x !== cur) x.remove();
        if (cur.dataset.lang !== l) { const d = build(l); d.dataset.after = cur.dataset.after || ""; cur.replaceWith(d); }
        return;
      }
    }
    // the smallest notice is the page's own refusal line (same text length: the innermost element)
    const depth = e => { let n = 0; for (let x = e; x; x = x.parentElement) n++; return n; };
    list.sort((a, b) => a.t.length - b.t.length || depth(b.el) - depth(a.el));
    const host = list[0].el;
    // a notice drawn over the camera picture (absolute / fixed overlay, or inside a box that clips) has no room for the steps:
    // the help goes right after that box instead, so it can open and be read (attendance ...)
    let after = null;
    for (let e = host, i = 0; e && e !== document.body && i < 4; e = e.parentElement, i++) {
      const cs = getComputedStyle(e);
      if (cs.position === "absolute" || cs.position === "fixed" || /hidden|clip/.test(cs.overflowY)) after = e;
    }
    for (const x of document.querySelectorAll(".lq-camhelp")) x.remove(); // one help block per page
    const d = build(l);
    if (after) { d.dataset.after = "1"; after.after(d); } else host.appendChild(d);
  }
  const later = () => { if (!timer) timer = setTimeout(place, 120); };
  function watch(on) {
    if (on && !obs && typeof MutationObserver !== "undefined") {
      obs = new MutationObserver(later);
      obs.observe(document.body || document.documentElement, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["hidden", "lang"] });
      document.documentElement && obs.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
    } else if (!on && obs) { obs.disconnect(); obs = null; }
  }
  function refused() {
    if (root.LQDemo && root.LQDemo.on) return; // demo mode refuses the camera on purpose
    denied = true; watch(true); later();
  }
  function allowed() {
    denied = false; openWanted = false; watch(false);
    for (const d of document.querySelectorAll(".lq-camhelp")) d.remove();
  }

  root.LQCamHelp = { HELP, refused, allowed, denied: () => denied, snap, setBefore: m => { before = m || new Map(); } };
  const md = typeof navigator !== "undefined" && navigator.mediaDevices;
  if (md && md.__lqHelpStub) {
    // loaded by the lensiq-camera.js stub after a refusal: take its note of the earlier notices and show the help now
    before = root.__lqCamBefore || new Map();
    if (root.__lqCamHelpLoading) refused();
  } else if (md && typeof md.getUserMedia === "function") {
    const gum = md.getUserMedia;
    md.getUserMedia = function (c) {
      // texts on the page before this request do not count as its refusal notice
      if (!denied && document.body) before = snap();
      return Promise.resolve(gum.call(md, c)).then(s => { allowed(); return s; }, e => { if (denyName(e)) refused(); throw e; });
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
