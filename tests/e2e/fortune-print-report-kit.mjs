// tests/e2e/fortune-print-report-kit.mjs — FIXED TEST SET, owner order 2026-11-16 (testers item B, "print layout"), Chrome.
// Written and locked BEFORE any measurement (~/LENSIQ-field/evals/print-report/, sha256 in evals-locks/print-report.sha256).
// One file per language (fortune-print-report-{th,en,zh}.e2e.mjs) keeps each file inside the runner's per-file limit.
// Pure half: tests/unit/fortune-print.test.js. 5 fortune pages (horoscope, tarot, faceread, bazi, numbers) produce a reading at
// 375 px (same recipes as fortune-share-print-kit.mjs); the print button builds the report; Chromium prints it to PDF
// (Page.printToPDF = what Playwright page.pdf() calls) on A4 and A5 portrait; the PDF is read back with the site's pdf.js.
//   R1  every PDF page has the header (LENSIQ, report title, date), the disclaimer line and "<page word> i / n"
//   R2  every group heading of the reading on screen (.fa-section / .fa-summary / .fa-plan headings, including closed tabs)
//       is in the PDF (headings holding what the person typed are left out of this check: they are taken out by default)
//   R3  no button, menu, banner or help-control text in the PDF (the screen's visible buttons, site menu links, help line /
//       camera help, demo banner, "read more", the in-page menu title), unless that text is also reading text
//   R4  page breaks: no page's last body line is (the end of) a heading; every list item and table row of the report is
//       whole on one PDF page
//   R5  80 mm receipt: LQPrint.print({ size: "80mm" }) lays out at the roll's printable width (74 mm) with no element wider
//       than it and no horizontal scroll; the PDF page is 80 mm wide
//   R6  black and white: every colour swatch and icon in the report has a text label (and, over all pages, at least one
//       swatch is checked: the lucky-colour page is added in TH for that)
//   R7  crisis state: no print button; LQShare.print() and LQPrint.print() refuse; no report in the page
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HTML_LANG = { th: "th", en: "en", zh: "zh-Hans" };
const LINE = {
  th: "เป็นหลักโหราศาสตร์ ซึ่งเป็นความเชื่อส่วนบุคคล โปรดใช้วิจารณญาณ",
  en: "Based on astrological principles, which are a matter of personal belief. Please use your own judgement.",
  zh: "基于命理学原则，属个人信仰，请自行判断。",
};
const PAGE_NO = { th: (i, n) => `หน้า ${i} / ${n}`, en: (i, n) => `Page ${i} / ${n}`, zh: (i, n) => `第 ${i} / ${n} 页` };
const NAME = "สมใจทดสอบ";
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const ev = (page, fn, ...a) => page.evaluate(fn, ...a);
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n} && !document.querySelector(".fa-loading, [aria-busy=true] .fa-section")`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const PAGES = {
  horoscope: {
    read: async p => {
      await ev(p, setSel("hsName", NAME));
      await ev(p, setSel("hsDay", "15")); await ev(p, setSel("hsMonth", "8")); await ev(p, setSel("hsYear", "1990"));
      await ev(p, () => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000);
    },
    typed: [NAME, "1990", "2533"],
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
  faceread: {
    cam: true,
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
  bazi: {
    read: async p => {
      await p.evaluate(() => {
        document.getElementById("lcDay").value = "12"; document.getElementById("lcMonth").value = "5"; document.getElementById("lcYear").value = "2533";
        document.getElementById("lcTime").value = "08:00"; document.querySelector("#lcForm button[type=submit]").click();
      });
      await p.waitFor(sections(2), 15000);
    },
    typed: ["2533", "1990"],
  },
  numbers: {
    read: async p => { await ev(p, setSel("nmPhone", "0812345678")); await ev(p, () => document.getElementById("nmGo").click()); await p.waitFor(sections(2), 15000); },
    typed: ["0812345678", "081-234-5678", "081 234 5678"],
  },
};
const LUCKY = { read: async p => { await p.waitFor(`document.getElementById("recBox").textContent.trim().length > 10`, 8000); await p.evaluate(() => { window.scrollBy(0, 2); window.dispatchEvent(new Event("scroll")); }); }, typed: [] };

const STUBS = `(() => { window.__sp = { printed: 0 }; window.print = () => { window.__sp.printed++; }; })()`;
const VIS = `const vis = e => { if (!e || !e.isConnected) return false; for (let a = e; a; a = a.parentElement) { if (a.hidden) return false;
  const c = getComputedStyle(a); if (c.display === "none" || c.visibility === "hidden" || c.opacity === "0") return false; }
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;

// compare text read back from a PDF: NFKC (Kangxi radicals, ligatures, Thai sara am), no spaces, no Thai vowel / tone marks
const fold = s => String(s).normalize("NFKC").replace(/[\sัิ-ฺ็-๎]+/g, "");

/** what must be on paper and what must not, read from the page on screen (before the report is built) */
const SCREEN = `((typed) => { ${VIS}
  const t = e => (e.innerText || e.textContent || "").replace(/\\s+/g, " ").trim();
  const roots = (window.LQShare.config().results || []).map(r => document.querySelector(r.printRoot || r.root)).filter(Boolean);
  const inRoots = e => roots.some(r => r.contains(e));
  const heads = [...document.querySelectorAll(".fa-section > h3, .fa-section > h4, .fa-summary > h3, .fa-plan > h3")]
    .filter(h => inRoots(h) && !h.closest("form") && !h.closest(".fa-support")).map(t).filter(Boolean)
    .filter(h => !typed.some(v => v && h.includes(v)));
  const reading = roots.map(r => [...r.querySelectorAll("p, li, td, th, h2, h3, h4, caption")].filter(e => !e.closest("button, nav, form")).map(t).join(" ")).join(" ");
  const bad = new Set();
  for (const b of document.querySelectorAll("button")) if (vis(b) && b.getAttribute("role") !== "tab") bad.add(t(b));
  for (const a of document.querySelectorAll("#siteNav a, header.nav a, nav a")) bad.add(t(a));
  for (const e of document.querySelectorAll(".lq-helpline, .lq-camhelp, .lq-helpbar, .lq-demo-banner, [role=banner]")) bad.add(t(e));
  const out = [...bad].filter(s => s && s.length >= 4 && s.length <= 160 && !reading.includes(s));
  return { heads: [...new Set(heads)], bad: out };
})`;

/** pdf.js: per page, the text and its lines (items grouped by baseline, top to bottom) */
async function pdfRead(reader, b64) {
  return reader.evaluate(async (data) => {
    const bin = atob(data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: u8 }).promise, out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i), vp = pg.getViewport({ scale: 1 }), tc = await pg.getTextContent();
      const items = tc.items.filter(x => x.str && x.str.trim()).map(x => ({ s: x.str, y: Math.round(x.transform[5]), x: x.transform[4] }));
      const rows = new Map();
      for (const it of items) { let k = [...rows.keys()].find(y => Math.abs(y - it.y) <= 2); if (k == null) { k = it.y; rows.set(k, []); } rows.get(k).push(it); }
      const lines = [...rows.entries()].sort((a, b) => b[0] - a[0]).map(([y, xs]) => ({ y, text: xs.sort((a, b) => a.x - b.x).map(x => x.s).join("") }));
      out.push({ text: tc.items.map(x => x.str).join(""), lines, w: vp.width, h: vp.height });
    }
    return out;
  }, b64);
}
const A4 = { paperWidth: 8.27, paperHeight: 11.69 }, A5 = { paperWidth: 5.83, paperHeight: 8.27 };

export async function run({ base, launch, check, fakeCams }, lang) {
  const browser = await launch();
  const reader = await browser.newPage(null);
  let swatches = 0;
  try {
    await reader.goto(`${base}/converter.html?nosw`);
    await reader.waitFor(`!!window.pdfjsLib`, 10000);
    const list = Object.entries(PAGES).concat(lang === "th" ? [["luckycolor", LUCKY]] : []);
    for (const [p, cfg] of list) {
      const tag = `[${p}/${lang}]`;
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`, STUBS].concat(cfg.cam ? [fakeCams, detScript] : []) });
      let err = null;
      try {
        await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
        await page.goto(`${base}/${p}.html${cfg.cam ? "?cpu&fakedet&nosw" : "?nosw"}`);
        await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === ${S(HTML_LANG[lang])}`, 10000);
        await sleep(500);
        await cfg.read(page);
        await page.waitFor(`!!window.LQShare && [...document.querySelectorAll('[data-lq-sp="print"]')].some(b => b.offsetParent)`, 5000);
        await page.waitFor(`!!window.LQPrint`, 8000);
        await page.evaluate(() => window.LQShare.printReady());
      } catch (e) { err = e; }
      const need = () => { if (err) throw new Error("no result / print module: " + err.message); };
      try {
        const screen = err ? null : await page.evaluate(`${SCREEN}(${S(cfg.typed)})`);
        const words = err ? null : await page.evaluate(l => ({ title: window.LQShare.pageName(window.LQShare.page, l), date: window.LQShare.dateText(new Date(), l) }), lang);
        const buildA = async () => {
          await page.evaluate(() => { window.__sp.printed = 0; [...document.querySelectorAll('[data-lq-sp="print"]')].find(b => b.offsetParent).click(); });
          await page.waitFor(`window.__sp.printed === 1 && !!document.querySelector("#lqPrint.lqp")`, 5000);
          await page.send("Emulation.setEmulatedMedia", { media: "print" });
          await sleep(300);
        };
        const endPrint = async () => {
          await page.send("Emulation.setEmulatedMedia", { media: "" });
          await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
          await sleep(200);
        };

        if (p !== "luckycolor") for (const [sz, paper] of [["A4", A4], ["A5", A5]]) {
          await check(`R1-R4 ${tag} ${sz}: header, disclaimer and page number on every page; every heading; no controls; clean breaks`, async () => {
            need();
            await buildA();
            const paperDom = await page.evaluate(() => {
              const t = e => (e.innerText || e.textContent || "").replace(/\s+/g, " ").trim(), pv = document.getElementById("lqPrint");
              return { heads: [...pv.querySelectorAll("[data-lqp-h]")].map(t), items: [...pv.querySelectorAll(".lqp-body li, .lqp-body tr")].map(t).filter(Boolean) };
            });
            const pdf = await page.send("Page.printToPDF", Object.assign({ printBackground: true, preferCSSPageSize: true }, paper));
            await endPrint();
            const pages = await pdfRead(reader, pdf.data);
            const n = pages.length, bad = [];
            assert(n >= 1, "no PDF pages");
            const ft = pages.map(x => fold(x.text));
            pages.forEach((x, i) => {
              for (const [k, s] of [["LENSIQ", "LENSIQ"], ["title", words.title], ["date", words.date], ["disclaimer", LINE[lang]], ["page number", PAGE_NO[lang](i + 1, n)]]) {
                if (!ft[i].includes(fold(s))) bad.push(`page ${i + 1}/${n}: no ${k} (${s})`);
              }
            });
            const all = ft.join("");
            for (const h of screen.heads) if (!all.includes(fold(h))) bad.push("heading missing: " + h);
            for (const s of screen.bad) if (all.includes(fold(s))) bad.push("control / menu / help text on paper: " + s);
            // R4: the last body line of each page is not (the end of) a heading
            const chrome = fold(["LENSIQ", words.title, words.date, LINE[lang]].join("")), fh = paperDom.heads.map(fold).filter(Boolean);
            pages.forEach((x, i) => {
              const body = x.lines.filter(l => { const f = fold(l.text); return f && !chrome.includes(f) && !/^(?:LENSIQ|.*\d+\/\d+.*)$/.test(f) && !f.includes(fold(LINE[lang]).slice(0, 12)) && !/lensiq|anirut77/i.test(f); });
              const last = body.length ? fold(body[body.length - 1].text) : "";
              if (i < n - 1 && last && fh.some(h => h.endsWith(last) || last.endsWith(h))) bad.push(`page ${i + 1} ends with a heading: ${body[body.length - 1].text}`);
            });
            for (const it of paperDom.items) { const f = fold(it); if (f.length >= 2 && !ft.some(t => t.includes(f))) bad.push("list item / table row split across pages: " + it.slice(0, 80)); }
            assert(!bad.length, `${n} page(s)\n` + bad.slice(0, 12).join("\n"));
          });
        }

        await check(`R5+R6 ${tag} 80 mm receipt without horizontal overflow; every swatch and icon labelled`, async () => {
          need();
          const ok = await page.evaluate(() => { window.__sp.printed = 0; return window.LQPrint.print({ size: "80mm" }); });
          assert(ok === true && (await page.evaluate(() => window.__sp.printed)) === 1, "LQPrint.print({ size: '80mm' })");
          const px = Math.floor((80 - 6) / 25.4 * 96);
          await page.send("Emulation.setDeviceMetricsOverride", { width: px, height: 1000, deviceScaleFactor: 1, mobile: false });
          await page.send("Emulation.setEmulatedMedia", { media: "print" });
          await sleep(400);
          const r = await page.evaluate((w) => {
            const pv = document.getElementById("lqPrint"), bad = [];
            if (!pv || !pv.classList.contains("lqp--r80")) return { bad: ["no 80 mm report"], sw: 0 };
            if (document.documentElement.scrollWidth > w + 1) bad.push("page scrolls sideways: " + document.documentElement.scrollWidth + " > " + w);
            for (const e of pv.querySelectorAll("*")) { const b = e.getBoundingClientRect(); if (b.width && b.right > w + 1) { bad.push("wider than the roll: " + e.tagName + "." + e.className + " right " + Math.round(b.right)); if (bad.length > 5) break; } }
            // R6 black-and-white proxy
            const lab = e => { const p = e.parentElement; return !!p && (p.textContent || "").replace(/\s+/g, " ").trim().length > 0; };
            let sw = 0;
            for (const e of pv.querySelectorAll("[style*=background], .lqp-chip")) { sw++; if (!lab(e)) bad.push("swatch without a label: " + e.outerHTML.slice(0, 80)); }
            for (const s of pv.querySelectorAll("svg")) { if (s.closest(".lqp-mark")) continue; if (!lab(s)) bad.push("icon without a label: " + s.outerHTML.slice(0, 80)); }
            return { bad, sw };
          }, px);
          swatches += r.sw;
          const pdf = await page.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, paperWidth: 3.15, paperHeight: 11.69 });
          const pages = await pdfRead(reader, pdf.data);
          if (!pages.length || Math.abs(pages[0].w - 226.77) > 2) r.bad.push("PDF page width " + (pages[0] && pages[0].w) + " pt, expected 80 mm (226.8 pt)");
          if (pages.length && !fold(pages.map(x => x.text).join("")).includes(fold(LINE[lang]))) r.bad.push("disclaimer missing on the receipt");
          await page.send("Emulation.setEmulatedMedia", { media: "" });
          await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
          await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
          assert(!r.bad.length, r.bad.join("\n"));
        });

        await check(`R7 ${tag} crisis state: no print button, LQShare.print() and LQPrint.print() refuse, no report`, async () => {
          need();
          await sleep(300);
          await page.evaluate(() => { window.__sp.printed = 0; window.LQFortuneCrisis.setActive(document); });
          await sleep(300);
          const r = await page.evaluate(() => {
            const btn = [...document.querySelectorAll('[data-lq-sp="print"]')].filter(b => b.offsetParent).length;
            const a = window.LQShare.print(), b = window.LQPrint.print(), c = window.LQPrint.print({ size: "80mm" });
            return { btn, a, b, c, printed: window.__sp.printed, pv: !!document.getElementById("lqPrint") };
          });
          assert(!r.btn && r.a === false && r.b === false && r.c === false && !r.printed && !r.pv, "refuse " + S(r));
        });
      } finally { await page.close(); }
    }
    if (lang === "th") await check("R6 [th] at least one colour swatch was checked over all pages", async () => { assert(swatches >= 1, "swatches checked: " + swatches); });
  } finally { await reader.close(); await browser.close(); }
}
