#!/usr/bin/env node
// tools/mobile-audit.mjs — headless phone audit of every page (default 390×844, touch, DPR 2).
// For each page reports:
//   overflow   document wider than the viewport (+ the widest offending elements)
//   targets    visible controls smaller than 44×44 CSS px (inline text links inside sentences are exempt, WCAG 2.5.8)
//   tinyText   visible text rendered below 12px
//   thaiBreaks Thai words split across lines at a non-word boundary (Intl.Segmenter), e.g. "แด|ชบอร์ด"
//   contrast   visible text below WCAG 1.4.3 contrast (4.5:1, large text 3:1) against its painted background
//              (solid backgrounds only — text over images / gradients / video is skipped; disabled controls exempt)
//   unlabeled  form controls without an accessible name (label, aria-label(ledby), title)
//   errors     uncaught exceptions while loading
//   hiddenShown elements carrying the [hidden] attribute that still render (an author display rule beat it)
//   crumbs     the breadcrumb (nav.js .lq-crumbs) wraps onto more than one line on a phone
//   thaiTracking Thai text that is letter-spaced (> .05em) or text-transform:uppercase (eyebrows, tags)
//   state      (--states only) a scenario's own expectations, e.g. "retry" shown on a page that did not fail
//
//   node tools/mobile-audit.mjs                     all ./*.html, table on stdout
//   node tools/mobile-audit.mjs palm store          only pages whose name contains a word
//   node tools/mobile-audit.mjs --json out.json     also write full JSON
//   node tools/mobile-audit.mjs --width 360 --lang zh   other width / language (lq-lang)
//   node tools/mobile-audit.mjs --selftest         verify the detectors on synthetic markup first
//   node tools/mobile-audit.mjs --strict            exit 1 when any page has findings (CI gate)
//   node tools/mobile-audit.mjs --strict --checks overflow,contrast   only these categories count for --strict
//   node tools/mobile-audit.mjs --states            post-interaction states instead of first load: open drawer, open
//                                                   language menu, sign-in dialog, guest + full reading results,
//                                                   signed-in account page and its error state (mocked API Worker
//                                                   from tests/e2e/member.e2e.mjs — nothing leaves the machine)
import { readdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { launch } from "../tests/e2e/cdp.mjs";
import { serve } from "./static-server.mjs";

const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : def; };
const width = +opt("--width", 390), height = +opt("--height", 844), lang = opt("--lang", "th"), jsonOut = opt("--json", null);
const strict = argv.includes("--strict");
const CHECKS = ["overflow", "targets", "tinyText", "thaiBreaks", "contrast", "unlabeled", "errors", "hiddenShown", "crumbs", "thaiTracking", "state"];
const checks = new Set(String(opt("--checks", CHECKS.join(","))).split(",").map(x => x.trim()).filter(Boolean));
const skipNext = new Set(["--width", "--height", "--lang", "--json", "--checks"]);
const words = argv.filter((a, i) => !a.startsWith("--") && !skipNext.has(argv[i - 1]));
const sleep = ms => new Promise(r => setTimeout(r, ms));

// Runs inside the page.
function audit(W) {
  const vis = el => {
    const s = getComputedStyle(el), r = el.getBoundingClientRect();
    if (s.visibility === "hidden" || s.display === "none" || +s.opacity === 0 || r.width === 0 || r.height === 0) return false;
    for (let p = el; p; p = p.parentElement) { const ps = getComputedStyle(p); if (ps.display === "none" || ps.visibility === "hidden" || (+ps.opacity === 0 && p !== el)) return false; }
    const clip = s.clip !== "auto" && s.clip !== "" && /rect\(0/.test(s.clip);
    return !clip && !(r.width <= 1 && r.height <= 1);
  };
  const name = el => {
    const t = (el.getAttribute("aria-label") || el.textContent || el.value || el.name || "").trim().replace(/\s+/g, " ").slice(0, 28);
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).slice(0, 2).join(".") : ""}${t ? ` "${t}"` : ""}`;
  };
  const out = { scrollW: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight, overflow: [], targets: [], tinyText: [], thaiBreaks: [], contrast: [], unlabeled: [] };

  // overflow: elements sticking out of the viewport that are not inside a horizontal scroller
  if (out.scrollW > W + 1) {
    const inScroller = el => { for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden|clip)/.test(s.overflowX)) return true; } return false; };
    const offenders = [...document.body.querySelectorAll("*")].filter(el => { const r = el.getBoundingClientRect(); return r.right > W + 1 && r.width > 0 && !inScroller(el) && vis(el); });
    const top = offenders.filter(el => !offenders.includes(el.parentElement)).slice(0, 4);
    out.overflow = top.map(el => `${name(el)} right=${Math.round(el.getBoundingClientRect().right)}`);
  }

  // touch targets
  const ctrls = [...document.querySelectorAll("a[href],button,input,select,textarea,[role=button],[role=tab],[role=switch],summary,[tabindex]:not([tabindex='-1'])")].filter(vis);
  const isInline = a => {
    if (a.tagName !== "A") return false;
    const p = a.parentElement; if (!p) return false;
    const ps = getComputedStyle(a).display;
    if (!/inline/.test(ps) || ps === "inline-flex" || ps === "inline-block") return false;
    const txt = [...p.childNodes].filter(n => n !== a).map(n => n.textContent).join("").trim();
    return txt.length > 0; // a link inside running text
  };
  for (const el of ctrls) {
    if (el.type === "hidden" || isInline(el)) continue;
    if (el.matches("input[type=checkbox],input[type=radio]")) {
      const lab = el.closest("label") || (el.id && document.querySelector(`label[for="${CSS.escape(el.id)}"]`));
      if (lab && lab.getBoundingClientRect().height >= 44) continue;
    }
    if (el.matches("[tabindex]") && !el.matches("a,button,input,select,textarea,summary,[role]")) continue; // scroll containers etc.
    const r = el.getBoundingClientRect();
    if (r.height < 43.5 || r.width < 43.5) out.targets.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
  }

  // text below 12px (elements that directly hold text)
  const seenTiny = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (/^(SCRIPT|STYLE|SVG|CANVAS|NOSCRIPT|OPTION|TEMPLATE)$/i.test(el.tagName) || el.closest("svg")) continue;
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim());
    if (!direct || !vis(el)) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < 12 - 0.01) { const k = name(el) + " " + fs.toFixed(1) + "px"; if (!seenTiny.has(k)) { seenTiny.add(k); out.tinyText.push(k); } }
  }

  // Thai words broken across lines at a non-boundary
  const Seg = Intl.Segmenter ? new Intl.Segmenter("th", { granularity: "word" }) : null;
  const JOIN = ["แดชบอร์ด", "สติ๊กเกอร์", "โหงวเฮ้ง", "ฮวงจุ้ย", "อัจฉริยะ", "คีออสก์", "เซียมซี", "ทาโรต์", "นักษัตร", "อี้จิง", "เว็บแคม", "แท็บเล็ต", "ดาวน์โหลด", "ออฟไลน์", "ออนไลน์", "เบราว์เซอร์", "แพ็กเกจ", "แบรนด์", "โปรโมชัน", "คอนเทนต์", "อีเวนต์", "สตูดิโอ", "ฟีเจอร์", "เซิร์ฟเวอร์", "ฮาร์ดแวร์", "ซอฟต์แวร์", "แอปพลิเคชัน", "โซเชียล", "หน้าตา"]; // keep in sync with nav.js
  const THAI = /[฀-๿]/, MARK = /[ัิ-ฺ็-๎]/;
  if (Seg) {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let n, budget = 60000;
    const range = document.createRange();
    const seen = new Set();
    // treat text split by <wbr>/inline tags as one run per block parent
    while ((n = walker.nextNode()) && budget > 0) {
      const v = n.nodeValue;
      if (!THAI.test(v) || v.trim().length < 2) continue;
      const host = n.parentElement;
      if (!host || !vis(host) || host.closest("svg,canvas,script,style,option,select,textarea")) continue;
      budget -= v.length;
      // word boundaries = Intl.Segmenter, corrected like nav.js: a lone consonant joins the previous segment and
      // known loanwords stay whole (the segmenter itself splits "แด|ช|บอร์ด")
      const parts = [...Seg.segment(v)].map(s => s.segment);
      for (let m = parts.length - 1; m > 0; m--) if (/^[\u0E01-\u0E2E]$/.test(parts[m]) && THAI.test(parts[m - 1])) parts.splice(m - 1, 2, parts[m - 1] + parts[m]);
      for (let i = 0; i < parts.length; i++) for (let j = i + 1, acc = parts[i]; j < parts.length && j < i + 5; j++) { acc += parts[j]; if (JOIN.includes(acc)) { parts.splice(i, j - i + 1, acc); break; } }
      const bounds = new Set([0, v.length]);
      for (let i = 0, at = 0; i < parts.length; i++) { bounds.add(at); at += parts[i].length; }
      let prevTop = null, prevIdx = -1;
      for (let i = 0; i < v.length; i++) {
        if (MARK.test(v[i]) || /\s/.test(v[i])) continue;
        range.setStart(n, i); range.setEnd(n, i + 1);
        const rs = range.getClientRects(); if (!rs.length) continue;
        const top = rs[0].top;
        if (prevTop != null && top > prevTop + 2 && !bounds.has(i) && !/\s/.test(v[i - 1] || "") && THAI.test(v[i]) && THAI.test(v[prevIdx])) {
          let a = i, b = i;
          while (a > 0 && !bounds.has(a)) a--;
          while (b < v.length && !bounds.has(b)) b++;
          const w = v.slice(a, i) + "|" + v.slice(i, b);
          const k = w + "@" + name(host).slice(0, 40);
          if (!seen.has(k)) { seen.add(k); out.thaiBreaks.push(`${w} in ${name(host)}`); }
        }
        prevTop = top; prevIdx = i;
      }
    }
  }
  // contrast (WCAG 1.4.3): text colour vs the first painted ancestor background; unknown (image / gradient) -> skipped
  const rgba = c => { const m = String(c).match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[\s,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
  const lum = c => { const ch = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * ch(c.r) + 0.7152 * ch(c.g) + 0.0722 * ch(c.b); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const bgOf = el => {
    const layers = [];
    for (let p = el; p; p = p.parentElement) {
      const s = getComputedStyle(p);
      if (s.backgroundImage && s.backgroundImage !== "none") return null;
      if (/^(VIDEO|CANVAS|IMG)$/.test(p.tagName)) return null;
      const c = rgba(s.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      if (+s.opacity < 1 && p !== el) return null; // translucent ancestor: painted colour unknown
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) bg = over(layers[i], bg);
    return bg;
  };
  const seenC = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (/^(SCRIPT|STYLE|SVG|CANVAS|NOSCRIPT|OPTION|TEMPLATE|VIDEO|IMG)$/i.test(el.tagName) || el.closest("svg")) continue;
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && /[\p{L}\p{N}]/u.test(n.nodeValue));
    if (!direct || !vis(el)) continue;
    if (el.closest("[disabled],[aria-disabled=true],.lq-sr,.sr-only,.acct-sr")) continue;
    const s = getComputedStyle(el);
    if (+s.opacity < 1 || s.textShadow && s.textShadow !== "none" && /px [1-9]/.test(s.textShadow)) continue;
    const fg = rgba(s.color); const bg = bgOf(el);
    if (!fg || !bg) continue;
    const fs = parseFloat(s.fontSize), bold = +s.fontWeight >= 700 || s.fontWeight === "bold";
    const need = fs >= 24 || (bold && fs >= 18.66) ? 3 : 4.5;
    const r = ratio(over(fg, bg), bg);
    if (r + 0.005 < need) { const k = `${name(el)} ${r.toFixed(2)}:1`; if (!seenC.has(k)) { seenC.add(k); out.contrast.push(k); } }
  }
  out.contrast = out.contrast.slice(0, 200);

  // form controls without an accessible name
  for (const el of document.querySelectorAll("input,select,textarea")) {
    if (/^(hidden|submit|button|reset|image)$/.test(el.type) || !vis(el)) continue;
    const named = (el.getAttribute("aria-label") || "").trim() || (el.getAttribute("aria-labelledby") || "").split(/\s+/).some(id => id && document.getElementById(id) && document.getElementById(id).textContent.trim())
      || (el.labels && [...el.labels].some(l => l.textContent.trim())) || (el.getAttribute("title") || "").trim();
    if (!named) out.unlabeled.push(name(el) + (el.name ? `[name=${el.name}]` : ""));
  }

  // [hidden] elements that still render: `.btn{display:inline-flex}` & co. beat the UA [hidden] rule
  out.hiddenShown = [...document.querySelectorAll("[hidden]")].filter(el => {
    if (el.closest("template,head")) return false;
    const st = getComputedStyle(el), r = el.getBoundingClientRect();
    return st.display !== "none" && r.width > 0 && r.height > 0;
  }).slice(0, 20).map(name);

  // breadcrumb on one line (phones): items on several rows = an orphaned "/" or a page title pushed onto its own line
  out.crumbs = [];
  const ol = document.querySelector(".lq-crumbs ol");
  if (ol && vis(ol)) {
    const lis = [...ol.children].filter(vis);
    // rows = items whose vertical extent does not overlap the previous row (items of different heights share a row)
    const rects = lis.map(li => li.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    const tops = [];
    for (const r of rects) if (!tops.length || r.top >= tops[tops.length - 1] - 1) tops.push(r.bottom); else tops[tops.length - 1] = Math.max(tops[tops.length - 1], r.bottom);
    tops.size = tops.length;
    if (tops.size > 1) out.crumbs.push(`${name(ol)} wraps onto ${tops.size} lines: ${lis.map(li => li.textContent.trim()).join(" / ").slice(0, 80)}`);
  }

  // Thai text with wide tracking or upper-casing
  out.thaiTracking = [];
  const seenT = new Set();
  for (const el of document.body.querySelectorAll("*")) {
    if (/^(SCRIPT|STYLE|SVG|TEMPLATE)$/i.test(el.tagName)) continue;
    const direct = [...el.childNodes].some(n => n.nodeType === 3 && /[\u0E01-\u0E5B]/.test(n.nodeValue));
    if (!direct || !vis(el)) continue;
    const st = getComputedStyle(el), fs = parseFloat(st.fontSize) || 16;
    const ls = st.letterSpacing === "normal" ? 0 : parseFloat(st.letterSpacing) || 0;
    if (ls / fs > 0.05 + 1e-3 || st.textTransform === "uppercase") {
      const k = `${name(el).slice(0, 60)} letter-spacing ${(ls / fs).toFixed(2)}em${st.textTransform === "uppercase" ? " uppercase" : ""}`;
      if (!seenT.has(k)) { seenT.add(k); out.thaiTracking.push(k); }
    }
  }
  out.thaiTracking = out.thaiTracking.slice(0, 40);

  out.targets = out.targets.slice(0, 400);
  return out;
}

/* ---------------- post-interaction states (--states) ---------------- */
const SESSION = `try{sessionStorage.setItem("lq-member-session",JSON.stringify({t:"t".repeat(43),exp:Math.floor(Date.now()/1000)+3600}))}catch(e){}`;
const visible = sel => `(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const s = getComputedStyle(e), r = e.getBoundingClientRect(); return s.display !== "none" && s.visibility !== "hidden" && r.width > 0 && r.height > 0; })()`;
const castIching = async page => {
  await page.evaluate(() => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); });
  await page.waitFor(() => !document.getElementById("icResult").hidden, 15000);
  await page.waitFor(() => { const b = document.getElementById("icRd-body"); return !!b && b.querySelectorAll(".fa-section").length >= 1; }, 8000);
};
/** Each scenario: page, mock (API Worker stand-in), signedIn, run(page) to reach the state, expect -> problems (in page). */
export const SCENARIOS = [
  { name: "drawer-open", page: "store.html", run: async page => {
    await page.evaluate(() => { const t = document.querySelector(".nav-toggle"); if (t && getComputedStyle(t).display !== "none") t.click(); });
    await sleep(500);
  }, expect: `(() => { const t = document.querySelector(".nav-toggle"); if (!t || getComputedStyle(t).display === "none") return []; return t.getAttribute("aria-expanded") === "true" ? [] : ["menu button did not open the drawer"]; })()` },
  { name: "lang-menu-open", page: "pricing.html", width: 320, run: async page => {
    await page.evaluate(() => { const b = document.querySelector(".lang-switch button[aria-pressed=true]"); if (b) b.click(); });
    await sleep(300);
  }, expect: `(() => { const sw = document.querySelector(".lang-switch"); if (!sw) return ["no language switch"]; const other = [...sw.querySelectorAll("button[aria-pressed=false]")]; return other.length && other.every(b => b.getBoundingClientRect().height > 0) ? [] : ["the other languages are not reachable from the compact switch"]; })()` },
  { name: "signin-dialog", page: "iching.html", mock: true, run: async page => {
    await page.waitFor(() => window.LQMember && window.LQMember.ready(), 8000);
    await page.evaluate(() => { const b = document.querySelector(".lq-acct [data-lq-signin]"); if (b) b.click(); });
    await page.waitFor(() => !!document.querySelector("dialog.lq-dlg[open]"), 4000);
    await sleep(300);
  }, expect: `(() => { const d = document.querySelector("dialog.lq-dlg[open]"); if (!d) return ["dialog not open"]; const r = d.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 ? [] : ["dialog taller than the screen: " + Math.round(r.top) + ".." + Math.round(r.bottom)]; })()` },
  { name: "reading-guest", page: "iching.html", mock: true, run: async page => {
    await page.waitFor(() => window.LQMember && window.LQMember.ready(), 8000);
    await castIching(page);
    await page.waitFor(() => !!document.querySelector("#icRd-body .lq-gate"), 8000);
    await sleep(300);
  }, expect: `(() => { const b = document.getElementById("icRd-body"); return b && b.querySelector(".fa-reminder") ? [] : ["light reading lost its safety reminder"]; })()` },
  { name: "reading-full", page: "iching.html", run: async page => { await castIching(page); await sleep(300); },
    expect: `(() => document.querySelectorAll("#icRd-body .fa-section").length >= 3 ? [] : ["full reading has fewer than 3 sections"])()` },
  { name: "account-signed-in", page: "account.html", mock: true, signedIn: true, run: async page => {
    await page.waitFor(() => window.LQMember && window.LQMember.signedIn() && !document.getElementById("acApp").hidden, 8000);
    await page.waitFor(() => !!document.querySelector("#acPayments table") && !document.getElementById("acPayments").hasAttribute("aria-busy"), 8000);
    await sleep(300);
  }, expect: `(() => { const p = []; const v = ${visible("#acRetry")}, m = ${visible("#acMore")}, pr = ${visible("#acPricing")};
      if (v) p.push("'try loading again' shown although nothing failed"); if (m) p.push("'load more' shown at the end of the history");
      if (pr) p.push("plans link shown while pricing is off (free mode)");
      const t = document.querySelector("#acPayments table"), c = t && t.closest(".acct-card");
      if (t && c && t.getBoundingClientRect().width > c.getBoundingClientRect().width + 1) p.push("payments table wider than its card: " + Math.round(t.getBoundingClientRect().width) + " > " + Math.round(c.getBoundingClientRect().width));
      return p; })()` },
  { name: "account-error", page: "account.html", mock: true, signedIn: true, run: async page => {
    await page.waitFor(() => window.LQMember && window.LQMember.signedIn() && !!document.querySelector("#acPayments table"), 8000);
    await page.evaluate(() => { window.__histFail = true; const r = document.getElementById("acRetry"); r.hidden = false; r.click(); });
    await page.waitFor(() => document.getElementById("acHistMsg").classList.contains("bad"), 5000);
    await sleep(300);
  }, expect: `(() => { const p = []; if (!${visible("#acRetry")}) p.push("no retry after a failed load"); if (${visible("#acMore")}) p.push("'load more' shown after a failure"); if (!${visible("#acHistMsg")}) p.push("error message not visible"); return p; })()` }
];

if (argv.includes("--selftest")) {
  const srv0 = await serve(repo), b0 = await launch();
  try {
    const page = await b0.newPage(null);
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
    await page.goto(`${srv0.base}/converter.html?nosw`);
    await page.evaluate(() => {
      // contenteditable opts the planted bad case out of nav.js's Thai word wrapper (which would otherwise fix it)
      document.body.innerHTML = '<div id="bad" contenteditable="false" style="width:3.2em;font-size:16px;word-break:break-all">แดชบอร์ดรวม</div>' +
        '<div id="ok" style="width:70px;font-size:16px">แดชบอร์ดรวมสรุปผลจากทุกระบบ</div>' +
        '<p style="font-size:10px">ตัวเล็กเกินไป</p><button style="width:30px;height:30px;min-height:0;min-width:0;padding:0">x</button>' +
        '<div style="width:600px">กว้างเกินจอ</div>' +
        '<p id="lowc" style="color:#aaa;background:#fff">จางเกินไป</p><p id="okc" style="color:#111;background:#fff">ชัดเจน</p>' +
        '<input id="nolab" type="text"><label>ชื่อ <input id="haslab" type="text"></label>' +
        '<button id="hb" hidden style="display:inline-flex!important">ซ่อน</button><p id="hp" hidden>ซ่อนจริง</p>' +
        '<p id="trk" style="letter-spacing:.18em;font-size:16px">สมาชิก</p><p id="trkok" style="letter-spacing:.02em">สมาชิก</p>' +
        '<nav class="lq-crumbs"><ol style="display:flex;flex-wrap:wrap;width:120px;list-style:none;padding:0"><li>หน้าแรก</li><li>บูธและสตูดิโอ</li><li>สตูดิโอภาพโปรไฟล์</li></ol></nav>';
    });
    const r = await page.evaluate(audit, width);
    const fails = [];
    if (!r.thaiBreaks.some(x => x.includes("div#bad"))) fails.push("missed a mid-word Thai break: " + JSON.stringify(r.thaiBreaks));
    if (r.thaiBreaks.some(x => x.includes("div#ok"))) fails.push("false positive at word boundaries: " + JSON.stringify(r.thaiBreaks));
    if (!r.tinyText.some(x => /10\.0px/.test(x))) fails.push("missed 10px text");
    if (!r.targets.some(x => /30x30/.test(x))) fails.push("missed 30x30 button");
    if (!(r.scrollW > width) || !r.overflow.length) fails.push("missed overflow");
    if (!r.contrast.some(x => x.includes("p#lowc"))) fails.push("missed low contrast: " + JSON.stringify(r.contrast));
    if (r.contrast.some(x => x.includes("p#okc"))) fails.push("false positive contrast");
    if (!r.unlabeled.some(x => x.includes("input#nolab"))) fails.push("missed unlabeled input");
    if (r.unlabeled.some(x => x.includes("input#haslab"))) fails.push("false positive unlabeled input");
    if (!r.hiddenShown.some(x => x.includes("button#hb"))) fails.push("missed a visible [hidden] element: " + JSON.stringify(r.hiddenShown));
    if (r.hiddenShown.some(x => x.includes("p#hp"))) fails.push("false positive [hidden]");
    if (!r.thaiTracking.some(x => x.includes("p#trk"))) fails.push("missed letter-spaced Thai: " + JSON.stringify(r.thaiTracking));
    if (r.thaiTracking.some(x => x.includes("p#trkok"))) fails.push("false positive Thai tracking");
    if (!r.crumbs.length) fails.push("missed a wrapped breadcrumb");
    console.log(fails.length ? "SELFTEST FAIL\n  " + fails.join("\n  ") : "selftest ok: " + JSON.stringify({ thaiBreaks: r.thaiBreaks, tiny: r.tinyText, targets: r.targets, overflow: r.overflow }));
    process.exitCode = fails.length ? 1 : 0;
  } finally { await b0.close(); await srv0.close(); }
  process.exit(process.exitCode);
}

const statesMode = argv.includes("--states");
const pages = statesMode ? SCENARIOS.filter(sc => !words.length || words.some(w => sc.name.includes(w) || sc.page.includes(w))).map(sc => sc.name)
  : readdirSync(repo).filter(f => f.endsWith(".html") && (!words.length || words.some(w => f.includes(w)))).sort();
const srv = await serve(repo);
const browser = await launch();
const results = {};
const { MOCK } = statesMode ? await import("../tests/e2e/member.e2e.mjs") : { MOCK: "" };
try {
  if (statesMode) for (const nm of pages) {
    const sc = SCENARIOS.find(x => x.name === nm), w = sc.width || width;
    const init = [`try{localStorage.setItem("lq-lang",${JSON.stringify(lang)})}catch(e){}`];
    if (sc.mock) init.unshift(MOCK);
    if (sc.signedIn) init.push(SESSION);
    const page = await browser.newPage(null, { initScripts: init, isolated: true });
    await page.send("Emulation.setDeviceMetricsOverride", { width: w, height, deviceScaleFactor: 2, mobile: true });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    let r;
    try {
      const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " timeout")), ms))]);
      await limit(page.goto(`${srv.base}/${sc.page}?cpu`), 30000, "load");
      await sleep(800);
      await limit(sc.run(page), 40000, "scenario");
      r = await limit(page.evaluate(audit, w), 60000, "audit");
      r.state = sc.expect ? await page.evaluate(sc.expect) : [];
      r.errors = page.consoleErrors.filter(e => e.kind === "exception").map(e => String(e.text).split("\n")[0]).slice(0, 3);
      r.width = w;
    } catch (e) { r = { failed: String(e.message || e) }; }
    await Promise.race([page.close(), sleep(5000)]);
    results[nm] = r;
    const c = k => (r[k] ? r[k].length : 0);
    console.log(`${(nm + "@" + (sc.width || width)).padEnd(24)} ${r.failed ? "FAILED " + r.failed : `overflow=${r.scrollW > (r.width || width) + 1 ? "YES" : "no "} targets<44=${String(c("targets")).padStart(3)} contrast=${String(c("contrast")).padStart(3)} hiddenShown=${c("hiddenShown")} crumbs=${c("crumbs")} thaiTracking=${c("thaiTracking")} state=${c("state")} errors=${c("errors")}`}`);
    if (argv.includes("--details") && !r.failed) for (const k of CHECKS) if (k !== "overflow" && (r[k] || []).length) console.log(`    ${k}: ${r[k].slice(0, 8).join(" | ")}`);
    if (argv.includes("--details") && !r.failed && r.overflow.length) console.log(`    overflow: ${r.overflow.join(" | ")}`);
  }
  if (!statesMode) for (const f of pages) {
    const page = await browser.newPage(null, { initScripts: [`try{localStorage.setItem("lq-lang",${JSON.stringify(lang)})}catch(e){}`] });
    await page.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile: true });
    await page.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: 5 });
    await page.send("Emulation.setEmitTouchEventsForMouse", { enabled: true, configuration: "mobile" });
    let r;
    try {
      const limit = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(what + " timeout")), ms))]);
      await limit(page.goto(`${srv.base}/${f}${f === "insights.html" ? "?demo&cpu" : "?cpu"}`), 30000, "load");
      await sleep(1800);
      r = await limit(page.evaluate(audit, width), 60000, "audit");
      r.errors = page.consoleErrors.filter(e => e.kind === "exception").map(e => String(e.text).split("\n")[0]).slice(0, 3);
    } catch (e) { r = { failed: String(e.message || e) }; }
    await Promise.race([page.close(), sleep(5000)]);
    results[f] = r;
    const c = k => (r[k] ? r[k].length : 0);
    console.log(`${f.padEnd(18)} ${r.failed ? "FAILED " + r.failed : `h=${String(r.height).padStart(5)} overflow=${r.scrollW > width + 1 ? "YES" : "no "} targets<44=${String(c("targets")).padStart(3)} text<12=${String(c("tinyText")).padStart(3)} thaiBreaks=${String(c("thaiBreaks")).padStart(3)} contrast=${String(c("contrast")).padStart(3)} unlabeled=${String(c("unlabeled")).padStart(2)} hidden=${c("hiddenShown")} crumbs=${c("crumbs")} thaiTrk=${c("thaiTracking")} errors=${c("errors")}`}`);
    if (argv.includes("--details") && !r.failed) for (const k of CHECKS) if (k !== "overflow" && (r[k] || []).length) console.log(`    ${k}: ${r[k].slice(0, 8).join(" | ")}`);
    if (argv.includes("--details") && !r.failed && r.overflow.length) console.log(`    overflow: ${r.overflow.join(" | ")}`);
  }
} finally {
  await browser.close();
  await srv.close();
}
if (jsonOut) { writeFileSync(jsonOut, JSON.stringify({ width, height, lang, results }, null, 2)); console.log("JSON written to " + jsonOut); }
const anyBad = Object.values(results).some(r => r.failed || (checks.has("overflow") && r.scrollW > (r.width || width) + 1) ||
  CHECKS.filter(k => k !== "overflow").some(k => checks.has(k) && (r[k] || []).length));
process.exit(strict && anyBad ? 1 : 0);
