// tests/e2e/fortune-share-print.e2e.mjs — FIXED TEST SET, owner order 2026-11-16 items 1-2 ("fortune share & print"), Chrome.
// Written and locked BEFORE the build (~/LENSIQ-field/evals/fortune-share-print/, sha256 in evals-locks/fortune-share-print.sha256).
// Pure half: tests/unit/fortune-share-print.test.js. WebKit (iPhone) half: tests/e2e/fortune-share-print-webkit.e2e.mjs.
// Every fortune page (CLAUDE.md category 6, 18 pages) in TH / EN / ZH at 375 px; where the page has a reading, one is produced first
// (same recipes as fortune-layout.e2e.mjs). Then, per page and language:
//   S1  a visible share button and a visible print button with each result, labelled in the page language
//   S2  card defaults: the share dialog opens with "include my photo" (face / palm pages only) and "include birth data" OFF,
//       the card holds no photo, no birth data, no age, no name and nothing the user typed; turned on, it does; reopened,
//       both are off again. The card holds the page name, the final disclaimer line, the 1323 help line, the site link
//   S3  zero network requests (any origin, http / https / ws) while the card is made and shared through the share sheet,
//       LINE, Facebook and "save image"; LINE gets text + link only, Facebook the site URL only, the share sheet one image
//   S4  card text passes the reading safety filter (FortuneAI.safety.isSafe) and has no crisis words
//   S5  print view (print media): no nav, buttons, menus or help bar; every reading group expanded (no 3-line clamp);
//       the disclaimer line is printed; only the print view is printed
//   S6  black-and-white proxy: every colour swatch in the print view has a text label next to it
//   S7  PDF (Page.printToPDF = what Playwright page.pdf() calls in Chromium): non-empty, and EVERY PDF page contains the
//       disclaimer line (text read back with the site's own pdf.js); TH on all 18 pages, EN / ZH on horoscope and tarot
//   S8  crisis state on the page (support card shown): no share or print button, LQShare.share() / print() refuse
// Plus: calm session (tab flag "lq-fortune-calm"): no share or print button on any of the 18 pages, and both refuse;
// the real path (crisis words in the tarot question) in TH / EN / ZH shows the support card with no share or print button.
import { createRequire } from "node:module";
import { assert } from "./cdp.mjs";

const require = createRequire(import.meta.url);
global.PALM_KB = require("../../palm-kb.js");
global.FR_KB = require("../../faceread-kb.js");
const FA = require("../../fortune-ai.js");
const CR = require("../../fortune-crisis.js");

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const SCRIPT = { th: "[\\u0E00-\\u0E7F]", en: "^[A-Za-z][\\x20-\\x7E]*$", zh: "[\\u4E00-\\u9FFF]" };
const PHOTO = new Set(["faceread", "palm"]);
const PERSONAL = new Set(["horoscope", "bazi", "taksa", "lek7", "lifegraph", "zodiac", "astro", "fengshui", "report", "numbers", "faceread"]);
const NAME = "สมใจทดสอบ";
// pages where the recipe types a birth date or a name: the birth line must appear when the toggle is turned on
const BIRTH_TYPED = new Set(["horoscope", "astro", "fengshui", "bazi", "taksa", "lek7", "lifegraph", "report"]);

const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const lcFill = async p => {
  await p.evaluate(() => {
    document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
    document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
  });
  await p.waitFor(sections(2), 15000);
};
// page → read(page) produces the result; typed: what the user typed / chose that must never be on a default card
const PAGES = {
  fortune: { read: null, typed: [] },
  planner: {
    read: async p => { await ev(p, () => document.getElementById("plGo").click()); await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plList li").length > 0`, 10000); },
    typed: [],
  },
  luckycolor: { read: async p => { await p.waitFor(`document.getElementById("recBox").textContent.trim().length > 10`, 8000); }, typed: [] },
  iching: {
    read: async p => { await ev(p, setSel("icQuestion", "งานใหม่จะดีไหมครับ")); await ev(p, () => { document.getElementById("icStart").click(); document.getElementById("icAuto").click(); }); await p.waitFor(sections(3), 20000); },
    typed: ["งานใหม่จะดีไหมครับ"],
  },
  zodiac: {
    read: async p => { await ev(p, () => { document.querySelector('input[name="zdAnimal"][value="6"]').click(); document.getElementById("zdForm").requestSubmit(); }); await p.waitFor(sections(3), 15000); },
    typed: [],
  },
  astro: {
    read: async p => {
      await ev(p, setSel("asDay", "15")); await ev(p, setSel("asMonth", "5")); await ev(p, setSel("asYear", "2533"));
      await ev(p, () => document.getElementById("asForm").requestSubmit()); await p.waitFor(sections(3), 15000);
    },
    typed: ["2533", "1990"],
  },
  dream: {
    read: async p => {
      await ev(p, setSel("drText", "ฝันเห็นงูใหญ่ในบ้าน แล้วนั่งเครื่องบินไปทะเล")); await p.waitFor(`!document.getElementById("drGo").disabled`, 5000);
      await ev(p, () => document.getElementById("drGo").click()); await p.waitFor(sections(3), 15000);
    },
    typed: ["ฝันเห็นงูใหญ่ในบ้าน", "นั่งเครื่องบินไปทะเล"],
  },
  tarot: {
    read: async p => {
      await ev(p, setSel("trQuestion", "งานใหม่จะดีไหมครับ"));
      await ev(p, () => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
      await sleep(600); await ev(p, () => document.getElementById("trAuto").click()); await sleep(900); await ev(p, () => document.getElementById("trReveal").click());
      await p.waitFor(sections(3), 25000);
    },
    typed: ["งานใหม่จะดีไหมครับ"],
  },
  horoscope: {
    read: async p => {
      await ev(p, setSel("hsName", NAME));
      await ev(p, setSel("hsDay", "15")); await ev(p, setSel("hsMonth", "8")); await ev(p, setSel("hsYear", "1990"));
      await ev(p, () => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000);
    },
    typed: [NAME, "1990", "2533"],
  },
  numbers: {
    read: async p => { await ev(p, setSel("nmPhone", "0812345678")); await ev(p, () => document.getElementById("nmGo").click()); await p.waitFor(sections(2), 15000); },
    typed: ["0812345678", "081-234-5678", "081 234 5678"],
  },
  fengshui: {
    read: async p => {
      await ev(p, setSel("fsDay", "15")); await ev(p, setSel("fsMonth", "6")); await ev(p, setSel("fsYear", "2533"));
      await ev(p, () => document.getElementById("fsKuaForm").requestSubmit()); await sleep(500); await ev(p, () => document.getElementById("fsReadBtn").click());
      await p.waitFor(sections(2), 15000);
    },
    typed: ["2533", "1990"],
  },
  bazi: { read: lcFill, typed: ["2533", "1990"] }, taksa: { read: lcFill, typed: ["2533", "1990"] },
  lek7: { read: lcFill, typed: ["2533", "1990"] }, lifegraph: { read: lcFill, typed: ["2533", "1990"] },
  report: {
    read: async p => {
      await p.waitFor(() => window.__rp && document.getElementById("rpMode").textContent.length > 10, 8000);
      await ev(p, n => {
        document.querySelector('[data-rp-type="report_basic"]').click();
        document.getElementById("rpAYear").value = document.documentElement.lang === "th" ? "2533" : "1990";
        document.getElementById("rpName").value = n; document.getElementById("rpGo").click();
      }, NAME);
      await p.waitFor(() => document.querySelectorAll("#rpOut .rp-part").length >= 3, 10000);
    },
    typed: [NAME, "2533", "1990"],
  },
  faceread: {
    read: async p => {
      await ev(p, () => document.getElementById("frStartCam").click());
      await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
      await ev(p, d => { window.__dets = d; }, [FACE]);
      await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
      await ev(p, () => document.getElementById("frRead").click());
      await p.waitFor(`!document.getElementById("frResult").hidden && ` + sections(3), 20000);
    },
    typed: [],
  },
  palm: {
    read: async p => {
      await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
      await ev(p, () => document.getElementById("plStartCam").click());
      await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
      await ev(p, d => { window.__dets = d; }, [HAND]);
      await sleep(600);
      await ev(p, () => document.getElementById("plSnap").click());
      await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
      await ev(p, () => document.getElementById("plRead").click());
      await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
    },
    typed: [],
  },
};
const CAM = new Set(["faceread", "palm"]);

const VIS = `const vis = e => { if (!e || !e.isConnected) return false; const cs = getComputedStyle(e); if (cs.display === "none" || cs.visibility === "hidden") return false;
  for (let a = e; a; a = a.parentElement) { if (a.hidden) return false; const c = getComputedStyle(a); if (c.display === "none" || c.visibility === "hidden" || c.opacity === "0") return false; }
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;
/* the share / print buttons the reader can see */
const BUTTONS = `(() => { ${VIS}
  const all = k => [...document.querySelectorAll('[data-lq-sp="' + k + '"]')];
  return { share: all("share").filter(vis).map(b => b.textContent.trim()), print: all("print").filter(vis).map(b => b.textContent.trim()),
    hasApi: !!window.LQShare };
})()`;
/* the share dialog state after the card is made */
const DIALOG = `(() => { ${VIS}
  const d = document.getElementById("lqShareDlg"), q = s => d && d.querySelector(s);
  const ph = document.getElementById("lqSpPhoto"), bi = document.getElementById("lqSpBirth"), pv = document.getElementById("lqSpPreview");
  const act = k => { const b = q('[data-lq-sp-act="' + k + '"]'); return b ? vis(b) : false; };
  const L = window.LQShare && window.LQShare.last;
  return { open: vis(d), photo: ph ? { vis: vis(ph), on: ph.checked } : null, birth: bi ? { vis: vis(bi), on: bi.checked } : null,
    preview: !!(pv && vis(pv) && /^blob:|^data:image\\//.test(pv.src)), line: act("line"), fb: act("fb"), save: act("save"), close: act("close"), native: act("native"),
    last: L ? { lines: L.lines, text: L.text, photo: L.photo, birth: L.birth, birthLine: L.birthLine, lang: L.lang, page: L.page, link: L.link } : null };
})()`;
const STUBS = `(() => {
  window.__sp = { shared: [], opened: [], saved: [], printed: 0 };
  navigator.canShare = d => !!(d && d.files && d.files.length);
  navigator.share = async d => { window.__sp.shared.push({ files: (d.files || []).map(f => ({ name: f.name, type: f.type, size: f.size })), text: d.text || "", url: d.url || "", title: d.title || "" }); };
  window.open = (u) => { window.__sp.opened.push(String(u)); return null; };
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__sp.saved.push({ name: this.download, href: String(this.href).slice(0, 5) }); return; } return click.call(this); };
  window.print = () => { window.__sp.printed++; };
})()`;
/* the print view, read while the page is emulated as print media */
const PRINTED = `((line) => { ${VIS}
  const pv = document.getElementById("lqPrint"), bad = [];
  if (!pv || !vis(pv)) return { ok: false, bad: ["no visible print view #lqPrint"] };
  for (const s of ["#siteNav", ".lq-helpbar", "button", "nav", "select", "input", "textarea", ".lq-toc", "[data-lq-sp-bar]", "dialog"]) {
    const v = [...document.querySelectorAll(s)].filter(vis); if (v.length) bad.push("printed: " + s + " x" + v.length);
  }
  const others = [...document.body.children].filter(e => e !== pv && vis(e)).map(e => e.tagName + (e.id ? "#" + e.id : "") + "." + e.className);
  if (others.length) bad.push("more than the print view is printed: " + others.slice(0, 4).join(", "));
  const hidden = [...pv.querySelectorAll(".lq-more-body")].filter(e => !vis(e)).length; if (hidden) bad.push(hidden + " reading group(s) not expanded");
  const clamped = [...pv.querySelectorAll(".lq-gist")].filter(e => { const c = getComputedStyle(e); return (c.webkitLineClamp && c.webkitLineClamp !== "none") || c.overflow === "hidden"; }).length;
  if (clamped) bad.push(clamped + " overview(s) still clamped");
  const closed = [...pv.querySelectorAll("details")].filter(d => !d.open).length; if (closed) bad.push(closed + " <details> closed");
  const norm = s => s.replace(/\\s+/g, " ").trim();
  if (!norm(pv.innerText).includes(norm(line))) bad.push("disclaimer line not printed");
  // black-and-white proxy: a colour swatch (an element whose own style sets a colour background, or a swatch / chip class, no
  // own text, at most 64 px) has a text label right next to it (own aria-hidden is fine; the label is the visible text)
  const isSw = e => { if (!vis(e) || e.closest("svg")) return false; const r = e.getBoundingClientRect(); if (r.width > 64 || r.height > 64) return false;
    if ((e.textContent || "").trim()) return false;
    const st = e.getAttribute("style") || ""; return /background|--c\\s*:|--sw\\s*:/.test(st) || /(^|[\\s_-])(sw|swatch|chip|dot)([\\s_-]|$)/.test(e.className && e.className.baseVal == null ? e.className : ""); };
  const near = e => { const t = n => (n && (n.nodeType === 3 ? n.textContent : n.innerText) || "").trim();
    const p = e.parentElement, pt = p ? t(p) : ""; if (pt && pt.length <= 80) return true;
    return [e.previousSibling, e.nextSibling].some(n => { const s = t(n); return s.length > 0 && s.length <= 80; }); };
  const sw = [...pv.querySelectorAll("*")].filter(isSw), unl = sw.filter(e => !near(e));
  if (unl.length) bad.push(unl.length + "/" + sw.length + " swatch(es) without a text label: " + unl.slice(0, 3).map(e => e.outerHTML.slice(0, 90)).join(" | "));
  return { ok: !bad.length, bad, swatches: sw.length };
})`;

async function openPage(browser, base, fakeCams, p, lang, init = []) {
  const pre = [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`].concat(CAM.has(p) ? [fakeCams, detScript] : [], init);
  const page = await browser.newPage(null, { initScripts: pre, isolated: p === "report" });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/${p}.html${CAM.has(p) ? "?cpu&fakedet&nosw" : "?nosw"}`);
  await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
  await sleep(500);
  return page;
}
const isNet = u => /^(https?|wss?):/i.test(u);
const digits = s => String(s).replace(/\D+/g, "");

/** pdf.js (vendor/pdf.min.js, loaded by converter.html) reads the PDF back: text per page */
async function pdfText(reader, b64) {
  return reader.evaluate(async (data) => {
    const bin = atob(data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: u8 }).promise, out = [];
    for (let i = 1; i <= pdf.numPages; i++) { const tc = await (await pdf.getPage(i)).getTextContent(); out.push(tc.items.map(x => x.str).join("")); }
    return out;
  }, b64);
}
// Thai marks may come back from the PDF in another order: compare without spaces and without Thai vowel / tone marks
const fold = s => String(s).normalize("NFC").replace(/[\sัิ-ฺ็-๎]+/g, "");

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const reader = await browser.newPage(null);
  const cards = [];
  try {
    await reader.goto(`${base}/converter.html?nosw`);
    await reader.waitFor(`!!window.pdfjsLib`, 10000);
    for (const [p, cfg] of Object.entries(PAGES)) {
      for (const lang of LANGS) {
        const tag = `[${p}/${lang}]`;
        let page = null, err = null;
        try {
          page = await openPage(browser, base, fakeCams, p, lang, [STUBS]);
          if (cfg.read) await cfg.read(page);
          await sleep(600);
        } catch (e) { err = e; }
        const need = () => { if (err) throw new Error("no result: " + err.message); };
        try {
          await check(`S1 ${tag} a visible share button and print button with the result, in the page language`, async () => {
            need();
            const b = await page.evaluate(BUTTONS);
            assert(b.hasApi, "window.LQShare missing");
            assert(b.share.length >= 1 && b.print.length >= 1, "buttons " + S(b));
            const re = new RegExp(SCRIPT[lang]);
            for (const t of b.share.concat(b.print)) assert(re.test(t), `label not in ${lang}: ${t}`);
          });

          await check(`S2 ${tag} card defaults: no photo, no birth data, no name, nothing typed; on when turned on; off again when reopened`, async () => {
            need();
            await page.evaluate(() => document.querySelector('[data-lq-sp="share"]') && [...document.querySelectorAll('[data-lq-sp="share"]')].find(b => b.offsetParent).click());
            await page.waitFor(`!!(window.LQShare && window.LQShare.last && document.getElementById("lqSpPreview") && /^blob:|^data:/.test(document.getElementById("lqSpPreview").src))`, 15000);
            const d = await page.evaluate(DIALOG);
            assert(d.open && d.preview, "dialog / preview " + S({ open: d.open, preview: d.preview }));
            assert(d.line && d.fb && d.save && d.close, "LINE / Facebook / save image / close " + S(d));
            assert(d.last.photo === false && d.last.birth === false, "defaults " + S(d.last));
            if (PHOTO.has(p)) assert(d.photo && d.photo.vis && !d.photo.on, "photo toggle " + S(d.photo)); else assert(!d.photo || !d.photo.vis, "photo toggle on a page without a photo");
            if (PERSONAL.has(p)) assert(d.birth && d.birth.vis && !d.birth.on, "birth toggle " + S(d.birth));
            assert(d.last.birthLine == null, "birth line by default: " + d.last.birthLine);
            for (const t of cfg.typed) {
              assert(!d.last.text.includes(t), "card holds " + t);
              if (/^\d[\d -]+$/.test(t) && digits(t).length >= 8) assert(!digits(d.last.text).includes(digits(t)), "card holds the number " + t);
            }
            assert(d.last.text.includes(LINE[lang]), "disclaimer line on the card");
            assert(/1323/.test(d.last.text), "help line on the card");
            assert(d.last.link && d.last.link.includes(p + ".html") && d.last.text.includes(d.last.link), "site link " + d.last.link);
            assert(d.last.lines.length >= 1, "no overview on the card");
            cards.push({ p, lang, lines: d.last.lines });
            // turned on
            if (PERSONAL.has(p) || PHOTO.has(p)) {
              await page.evaluate(() => { for (const id of ["lqSpBirth", "lqSpPhoto"]) { const e = document.getElementById(id); if (e && e.offsetParent && !e.checked) e.click(); } });
              await page.waitFor(`!!window.LQShare.last && (window.LQShare.last.birth || window.LQShare.last.photo)`, 8000);
              const on = await page.evaluate(DIALOG);
              if (PERSONAL.has(p)) assert(on.last.birth === true && (!BIRTH_TYPED.has(p) || on.last.birthLine), "birth on " + S(on.last));
              if (PHOTO.has(p)) assert(on.last.photo === true, "photo on " + S(on.last));
              await page.evaluate(() => document.querySelector('#lqShareDlg [data-lq-sp-act="close"]').click());
              await sleep(300);
              await page.evaluate(() => [...document.querySelectorAll('[data-lq-sp="share"]')].find(b => b.offsetParent).click());
              // LQShare.last is null from the moment the dialog opens until its card is made
              await page.waitFor(`!!window.LQShare.last && document.getElementById("lqShareDlg") && document.getElementById("lqShareDlg").offsetParent !== null`, 8000);
              const again = await page.evaluate(DIALOG);
              assert(again.last.birth === false && again.last.photo === false, "reopened: back to off " + S(again.last));
              if (again.birth) assert(!again.birth.on, "birth toggle kept on");
              if (again.photo) assert(!again.photo.on, "photo toggle kept on");
            }
            await page.evaluate(() => document.querySelector('#lqShareDlg [data-lq-sp-act="close"]').click());
          });

          await check(`S3 ${tag} zero network requests while the card is made and shared (share sheet, LINE, Facebook, save image)`, async () => {
            need();
            await page.evaluate(() => window.LQShare.ready());
            const n0 = page.requests.length;
            await page.evaluate(() => { window.__sp.shared = []; window.__sp.opened = []; window.__sp.saved = []; [...document.querySelectorAll('[data-lq-sp="share"]')].find(b => b.offsetParent).click(); });
            await page.waitFor(`!!document.querySelector('#lqShareDlg [data-lq-sp-act="native"]') && document.querySelector('#lqShareDlg [data-lq-sp-act="native"]').offsetParent !== null`, 15000);
            for (const k of ["native", "line", "fb", "save"]) {
              await page.evaluate(k2 => document.querySelector('#lqShareDlg [data-lq-sp-act="' + k2 + '"]').click(), k);
              await sleep(400);
            }
            await sleep(800);
            const r = await page.evaluate(() => window.__sp);
            const net = page.requests.slice(n0).filter(q => isNet(q.url)).map(q => q.url);
            assert(!net.length, net.length + " request(s): " + net.slice(0, 5).join(", "));
            assert(r.shared.length === 1 && r.shared[0].files.length === 1 && /^image\/(png|jpeg)$/.test(r.shared[0].files[0].type), "share sheet " + S(r.shared));
            const line = r.opened.find(u => u.startsWith("https://line.me/R/share?text=")), fb = r.opened.find(u => u.startsWith("https://www.facebook.com/sharer/sharer.php?"));
            assert(line && !/data:|blob:/.test(line), "LINE " + S(r.opened));
            assert(fb && [...new URL(fb).searchParams.keys()].join() === "u", "Facebook " + S(r.opened));
            assert(r.saved.length === 1 && /\.(png|jpe?g)$/.test(r.saved[0].name) && /^(blob|data)/.test(r.saved[0].href), "save image " + S(r.saved));
            await page.evaluate(() => document.querySelector('#lqShareDlg [data-lq-sp-act="close"]').click());
          });

          await check(`S5+S6 ${tag} print view: clean page, groups expanded, disclaimer printed, every swatch labelled`, async () => {
            need();
            await page.evaluate(() => { window.__sp.printed = 0; [...document.querySelectorAll('[data-lq-sp="print"]')].find(b => b.offsetParent).click(); });
            await sleep(300);
            assert((await page.evaluate(() => window.__sp.printed)) === 1, "the print dialog was not opened");
            await page.send("Emulation.setEmulatedMedia", { media: "print" });
            await sleep(300);
            const r = await page.evaluate(`${PRINTED}(${S(LINE[lang])})`);
            assert(r.ok, r.bad.join("\n"));
            if (lang === "th" || ((p === "horoscope" || p === "tarot") && lang !== "th")) {
              const pdf = await page.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true });
              const bytes = Buffer.from(pdf.data, "base64");
              assert(bytes.length > 2000 && bytes.slice(0, 5).toString() === "%PDF-", "PDF " + bytes.length + " bytes");
              const pages = await pdfText(reader, pdf.data);
              const miss = pages.map((t, i) => fold(t).includes(fold(LINE[lang])) ? 0 : i + 1).filter(Boolean);
              assert(pages.length >= 1 && !miss.length, `S7 PDF: ${pages.length} page(s), disclaimer missing on page(s) ${miss.join(", ")}`);
            }
            await page.send("Emulation.setEmulatedMedia", { media: "" });
            await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
          });

          await check(`S8 ${tag} crisis state: no share or print button, share() / print() refuse`, async () => {
            need();
            await page.evaluate(() => { window.__sp.printed = 0; window.LQFortuneCrisis.setActive(document); });
            await sleep(300);
            const b = await page.evaluate(BUTTONS);
            assert(!b.share.length && !b.print.length, "buttons in the crisis state " + S(b));
            const r = await page.evaluate(async () => ({ s: await window.LQShare.share(), p: window.LQShare.print(), printed: window.__sp.printed,
              dlg: !!(document.getElementById("lqShareDlg") && document.getElementById("lqShareDlg").offsetParent), pv: !!document.getElementById("lqPrint") }));
            assert(r.s === false && r.p === false && r.printed === 0 && !r.dlg && !r.pv, "refuse " + S(r));
          });
        } finally { if (page) await page.close(); }
      }
    }

    await check("S4 card text from every page and language passes the reading safety filter and has no crisis words", async () => {
      assert(cards.length >= 54, "cards collected: " + cards.length + " of 54");
      const bad = [];
      for (const c of cards) for (const l of c.lines) {
        if (!FA.safety.isSafe(l)) bad.push(`${c.p}/${c.lang} unsafe: ${l}`);
        if (CR.check(l)) bad.push(`${c.p}/${c.lang} crisis words: ${l}`);
      }
      assert(!bad.length, bad.slice(0, 10).join("\n"));
    });

    await check("calm session (tab flag): no share or print button on any of the 18 pages, and both refuse", async () => {
      const bad = [];
      for (const [p, cfg] of Object.entries(PAGES)) {
        const page = await openPage(browser, base, fakeCams, p, "th", [STUBS, `try { sessionStorage.setItem("lq-fortune-calm", "1"); } catch (e) {}`]);
        try {
          try { if (cfg.read) await cfg.read(page); } catch (e) { /* a calm page may hold back a block; the check below still runs */ }
          await sleep(600);
          const b = await page.evaluate(BUTTONS);
          if (!b.hasApi) bad.push(p + ": window.LQShare missing");
          if (b.share.length || b.print.length) bad.push(p + ": buttons " + S(b));
          const r = await page.evaluate(async () => window.LQShare ? ({ s: await window.LQShare.share(), p: window.LQShare.print(), printed: window.__sp.printed }) : null);
          if (!r || r.s !== false || r.p !== false || r.printed) bad.push(p + ": does not refuse " + S(r));
        } catch (e) { bad.push(p + ": " + e.message); } finally { await page.close(); }
      }
      assert(!bad.length, bad.join("\n"));
    });

    const CRISIS = { th: "อยากตายจริงๆ ไม่ไหวแล้ว", en: "I want to kill myself", zh: "我不想活了" };
    for (const lang of LANGS) {
      await check(`real path [${lang}]: crisis words in the tarot question → support card, no share or print button`, async () => {
        const page = await openPage(browser, base, fakeCams, "tarot", lang, [STUBS]);
        try {
          await page.evaluate(t => { document.getElementById("trQuestion").value = t; document.getElementById("trStart").click(); }, CRISIS[lang]);
          await page.waitFor(() => !!document.querySelector(".fa-support"), 8000);
          await sleep(500);
          const b = await page.evaluate(BUTTONS);
          assert(b.hasApi, "window.LQShare missing");
          assert(!b.share.length && !b.print.length, "buttons next to the support card " + S(b));
          const r = await page.evaluate(async () => ({ s: await window.LQShare.share(), p: window.LQShare.print() }));
          assert(r.s === false && r.p === false, "refuse " + S(r));
        } finally { await page.close(); }
      });
    }
  } finally { await reader.close(); await browser.close(); }
}
