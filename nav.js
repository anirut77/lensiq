/* LENSIQ shared site header.
   Usage in every page:  <header class="nav" id="siteNav"></header><script src="nav.js?v=2"></script>
   Plain script, no dependencies. Change the brand in BRAND below. */
(function () {
  "use strict";

  var BRAND = { name: "LENS", accent: "IQ", full: "LENSIQ", tagline: "Computer Vision เพื่อการตลาดและการวิเคราะห์" };

  var MENU = [
    { label: "การตลาด", id: "mkt", items: [
      { href: "neuro.html", title: "วิเคราะห์อารมณ์ (Neuromarketing)", desc: "ทดสอบโฆษณาและบรรจุภัณฑ์จากสีหน้า" },
      { href: "signage.html", title: "ป้ายโฆษณาอัจฉริยะ", desc: "Smart signage และคีออสก์ไร้สัมผัส" },
      { href: "customers.html", title: "จดจำลูกค้า", desc: "ประวัติการสั่งและเมนูแนะนำ" },
      { href: "booth.html", title: "วิเคราะห์บูธ", desc: "นับผู้เข้าชมและเวลาหยุดชม" }
    ] },
    { label: "ดูดวงอัจฉริยะ", id: "fortune", items: [
      { href: "fortune.html", title: "รวมระบบดูดวง", desc: "เลือกศาสตร์ที่ต้องการ" },
      { href: "faceread.html", title: "โหงวเฮ้ง AI", desc: "อ่านโหงวเฮ้งจากใบหน้า" },
      { href: "palm.html", title: "ดูลายมือ AI", desc: "ถ่ายฝ่ามือ อ่านเส้นหลัก" },
      { href: "horoscope.html", title: "ดวงวันเดือนปีเกิด", desc: "โหราไทย ปาจื้อ เลขศาสตร์" },
      { href: "tarot.html", title: "ไพ่ทาโรต์ & เซียมซี", desc: "เปิดไพ่ เสี่ยงเซียมซี" },
      { href: "fengshui.html", title: "ฮวงจุ้ย", desc: "เลขกัว เข็มทิศ ผังบ้าน" },
      { href: "numbers.html", title: "เลขมงคล", desc: "เบอร์โทร ทะเบียนรถ เลขบ้าน" },
      { href: "iching.html", title: "อี้จิง เสี่ยงกว้า", desc: "โยนเหรียญ 64 กว้า" },
      { href: "zodiac.html", title: "12 นักษัตร · ปีชง", desc: "ดวงรายปี คู่มงคล" },
      { href: "astro.html", title: "ราศีตะวันตก", desc: "ราศีอาทิตย์ จันทร์ ลัคนา" },
      { href: "dream.html", title: "ทำนายฝัน", desc: "ความหมายสัญลักษณ์ในฝัน" }
    ] },
    { label: "วิเคราะห์", id: "ana", items: [
      { href: "store.html", title: "วิเคราะห์หน้าร้าน", desc: "นับคน แผนที่ความร้อน และคิว" },
      { href: "insights.html", title: "แดชบอร์ดรวม", desc: "สรุปผลจากทุกระบบในที่เดียว" }
    ] },
    { label: "ตู้ถ่ายรูป", id: "photo", items: [
      { href: "photobooth.html", title: "ตู้ถ่ายรูป", desc: "ตู้สติ๊กเกอร์และรูปติดบัตร" },
      { href: "studio.html", title: "สตูดิโอแต่งชุด", desc: "เปลี่ยนชุดให้เหมือนใส่จริง ตัดพื้นหลัง รีทัช" }
    ] },
    { label: "ระบบทั้งหมด", href: "cameras.html", cta: true }
  ];

  var header = document.getElementById("siteNav") || document.querySelector("header.nav");
  if (!header) return;
  if (!header.classList.contains("nav")) header.classList.add("nav");

  var page = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  if (page === "") page = "index.html";
  var isCur = function (href) { return href.toLowerCase() === page; };
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); };

  var chev = '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
  var mark = '<svg class="logo-mark" viewBox="0 0 32 32" aria-hidden="true"><rect x="1" y="1" width="30" height="30" rx="9" fill="#0e1430"/><path d="M8 12V8h4M24 12V8h-4M8 20v4h4M24 20v4h-4" stroke="#22d3ee" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="16" cy="16" r="4.2" fill="#674ff2"/></svg>';

  var html = '<a class="skip-link" href="#main">ข้ามไปยังเนื้อหา</a>' +
    '<a class="logo" href="index.html" aria-label="' + esc(BRAND.full) + ' หน้าแรก">' + mark + esc(BRAND.name) + '<span>' + esc(BRAND.accent) + '</span></a>' +
    '<button class="nav-toggle" type="button" aria-expanded="false" aria-controls="siteMenu" aria-label="เปิดเมนู">' +
      '<svg class="i-open" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16"/></svg>' +
      '<svg class="i-close" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>' +
    '</button>' +
    '<div class="nav-scrim" aria-hidden="true"></div>' +
    '<nav class="site-menu" id="siteMenu" aria-label="เมนูหลัก"><ul class="nav-list">';

  MENU.forEach(function (g) {
    if (g.items) {
      var cur = g.items.some(function (i) { return isCur(i.href); });
      html += '<li class="nav-item has-sub"><button class="nav-link' + (cur ? " is-current" : "") + '" type="button" aria-expanded="false" aria-controls="navsub-' + g.id + '">' + esc(g.label) + chev + '</button>' +
        '<ul class="nav-sub' + (g.items.length > 7 ? " cols-2" : "") + '" id="navsub-' + g.id + '">';
      g.items.forEach(function (i) {
        html += '<li><a href="' + i.href + '"' + (isCur(i.href) ? ' aria-current="page"' : "") + '><b>' + esc(i.title) + '</b><small>' + esc(i.desc) + '</small></a></li>';
      });
      html += '</ul></li>';
    } else {
      var c = isCur(g.href) ? ' aria-current="page"' : "";
      html += '<li class="nav-item">' + (g.cta
        ? '<a class="nav-cta" href="' + g.href + '"' + c + '>' + esc(g.label) + '</a>'
        : '<a class="nav-link' + (c ? " is-current" : "") + '" href="' + g.href + '"' + c + '>' + esc(g.label) + '</a>') + '</li>';
    }
  });
  html += '</ul></nav>';
  header.innerHTML = html;

  // Skip link target: first <main>, else hide the link.
  var main = document.querySelector("main");
  var skip = header.querySelector(".skip-link");
  if (main) { if (!main.id) main.id = "main"; skip.setAttribute("href", "#" + main.id); }
  else document.addEventListener("DOMContentLoaded", function () {
    var m = document.querySelector("main");
    if (m) { if (!m.id) m.id = "main"; skip.setAttribute("href", "#" + m.id); } else skip.remove();
  });

  var toggle = header.querySelector(".nav-toggle");
  var menu = header.querySelector(".site-menu");
  var scrim = header.querySelector(".nav-scrim");
  var subBtns = Array.prototype.slice.call(header.querySelectorAll(".has-sub > .nav-link"));
  var mq = window.matchMedia("(max-width: 859.98px), (pointer: coarse) and (max-height: 600px)");
  var hoverMq = window.matchMedia("(hover: hover) and (pointer: fine)");

  function setNavH() { document.documentElement.style.setProperty("--nav-h", header.offsetHeight + "px"); }

  function setSub(btn, open) {
    btn.setAttribute("aria-expanded", open ? "true" : "false");
    var sub = document.getElementById(btn.getAttribute("aria-controls"));
    if (sub) sub.classList.toggle("open", open);
  }
  function closeSubs(except) { subBtns.forEach(function (b) { if (b !== except) setSub(b, false); }); }

  function setDrawer(open, returnFocus) {
    header.classList.toggle("menu-open", open);
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    toggle.setAttribute("aria-label", open ? "ปิดเมนู" : "เปิดเมนู");
    document.documentElement.classList.toggle("nav-locked", open);
    if (open) {
      setNavH();
      // On mobile, expand the group containing the current page.
      subBtns.forEach(function (b) { if (b.classList.contains("is-current")) setSub(b, true); });
      var first = menu.querySelector("a, button");
      if (first) first.focus({ preventScroll: true });
    } else if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", function () { setDrawer(!header.classList.contains("menu-open")); });
  scrim.addEventListener("click", function () { setDrawer(false, true); });

  subBtns.forEach(function (btn) {
    var item = btn.parentNode;
    btn.addEventListener("click", function () {
      var open = btn.getAttribute("aria-expanded") !== "true";
      if (!mq.matches) closeSubs(btn);
      setSub(btn, open);
    });
    btn.addEventListener("keydown", function (e) {
      if (e.key === "ArrowDown") {
        e.preventDefault(); setSub(btn, true);
        var a = item.querySelector(".nav-sub a"); if (a) a.focus();
      }
    });
    item.addEventListener("keydown", function (e) {
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
      var links = Array.prototype.slice.call(item.querySelectorAll(".nav-sub a"));
      var i = links.indexOf(document.activeElement);
      if (i < 0) return;
      e.preventDefault();
      var n = links[(i + (e.key === "ArrowDown" ? 1 : links.length - 1)) % links.length];
      n.focus();
    });
    // Desktop: close dropdown when focus leaves it.
    item.addEventListener("focusout", function (e) {
      if (!mq.matches && !item.contains(e.relatedTarget)) setSub(btn, false);
    });
    // Desktop with mouse: open on hover.
    item.addEventListener("mouseenter", function () { if (!mq.matches && hoverMq.matches) { closeSubs(btn); setSub(btn, true); } });
    item.addEventListener("mouseleave", function () { if (!mq.matches && hoverMq.matches) setSub(btn, false); });
  });

  menu.addEventListener("click", function (e) {
    var a = e.target.closest ? e.target.closest("a") : null;
    if (a) { closeSubs(); if (header.classList.contains("menu-open")) setDrawer(false); }
  });

  document.addEventListener("click", function (e) {
    if (!mq.matches && !header.contains(e.target)) closeSubs();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    if (header.classList.contains("menu-open")) { setDrawer(false, true); return; }
    var openBtn = subBtns.filter(function (b) { return b.getAttribute("aria-expanded") === "true"; })[0];
    if (openBtn) { closeSubs(); openBtn.focus(); }
  });

  // Keep focus inside the drawer while it is open (mobile).
  document.addEventListener("keydown", function (e) {
    if (e.key !== "Tab" || !header.classList.contains("menu-open")) return;
    var f = [toggle].concat(Array.prototype.slice.call(menu.querySelectorAll("a, button"))).filter(function (el) { return el.offsetParent !== null; });
    var first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });

  function onMq() { setDrawer(false); closeSubs(); setNavH(); }
  if (mq.addEventListener) mq.addEventListener("change", onMq); else if (mq.addListener) mq.addListener(onMq);
  window.addEventListener("resize", setNavH);
  setNavH();

  window.LENSIQ_BRAND = BRAND;
})();
