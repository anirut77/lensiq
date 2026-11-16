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
// RE-LOCK 2026-11-17 (coordinator decision 2, measured first): Chrome's PDF gives some ideographs back as CJK Radicals
// Supplement code points that NFKC does not fold (measured on this branch, Chrome 157, page.pdf + pdf.js: 页 -> U+2EDA,
// 巳 -> U+2E92, 食 -> U+2EDD, 风 -> U+2EDB). Every U+2E80-U+2FDF code point is mapped to its unified ideograph first, from
// Unicode EquivalentUnifiedIdeograph.txt (UCD 18.0.0, sha256 c86c80f6a0d1d47c9a5aadfbf1c26f1a732d662d9ccb0ed2d397919ecc47bf72).
const RADICALS = new Map("2E81:5382,2E82:4E5B,2E83:4E5A,2E84:4E59,2E85:4EBB,2E86:5182,2E87:20628,2E88:5200,2E89:5202,2E8A:535C,2E8B:353E,2E8C:5C0F,2E8D:5C0F,2E8E:5140,2E8F:5C23,2E90:5C22,2E91:21BC2,2E92:5DF3,2E93:5E7A,2E94:5F51,2E95:2B739,2E96:5FC4,2E97:5FC3,2E98:624C,2E99:6535,2E9B:65E1,2E9C:65E5,2E9D:6708,2E9E:6B7A,2E9F:6BCD,2EA0:6C11,2EA1:6C35,2EA2:6C3A,2EA3:706C,2EA4:722B,2EA5:722B,2EA6:4E2C,2EA7:725B,2EA8:72AD,2EA9:738B,2EAA:24D14,2EAB:76EE,2EAC:793A,2EAD:793B,2EAE:25AD7,2EAF:7CF9,2EB0:7E9F,2EB1:7F53,2EB2:7F52,2EB3:34C1,2EB4:5197,2EB5:2626B,2EB6:7F8A,2EB7:2634C,2EB8:2634B,2EB9:8002,2EBA:8080,2EBB:807F,2EBC:8089,2EBD:26951,2EBE:8279,2EBF:8279,2EC0:8279,2EC1:864E,2EC2:8864,2EC3:8980,2EC4:897F,2EC5:89C1,2EC6:89D2,2EC7:278B2,2EC8:8BA0,2EC9:8D1D,2ECA:27FB7,2ECB:8F66,2ECC:8FB6,2ECD:8FB6,2ECE:8FB6,2ECF:9091,2ED0:9485,2ED1:9577,2ED2:9578,2ED3:957F,2ED4:95E8,2ED5:28E0F,2ED6:961D,2ED7:96E8,2ED8:9752,2ED9:97E6,2EDA:9875,2EDB:98CE,2EDC:98DE,2EDD:98DF,2EDE:2967F,2EDF:98E0,2EE0:9963,2EE1:29810,2EE2:9A6C,2EE3:9AA8,2EE4:9B3C,2EE5:9C7C,2EE6:9E1F,2EE7:5364,2EE8:9EA6,2EE9:9EC4,2EEA:9EFE,2EEB:6589,2EEC:9F50,2EED:6B6F,2EEE:9F7F,2EEF:7ADC,2EF0:9F99,2EF1:9F9C,2EF2:4E80,2EF3:9F9F,2F00:4E00,2F01:4E28,2F02:4E36,2F03:4E3F,2F04:4E59,2F05:4E85,2F06:4E8C,2F07:4EA0,2F08:4EBA,2F09:513F,2F0A:5165,2F0B:516B,2F0C:5182,2F0D:5196,2F0E:51AB,2F0F:51E0,2F10:51F5,2F11:5200,2F12:529B,2F13:52F9,2F14:5315,2F15:531A,2F16:5338,2F17:5341,2F18:535C,2F19:5369,2F1A:5382,2F1B:53B6,2F1C:53C8,2F1D:53E3,2F1E:56D7,2F1F:571F,2F20:58EB,2F21:5902,2F22:590A,2F23:5915,2F24:5927,2F25:5973,2F26:5B50,2F27:5B80,2F28:5BF8,2F29:5C0F,2F2A:5C22,2F2B:5C38,2F2C:5C6E,2F2D:5C71,2F2E:5DDB,2F2F:5DE5,2F30:5DF1,2F31:5DFE,2F32:5E72,2F33:5E7A,2F34:5E7F,2F35:5EF4,2F36:5EFE,2F37:5F0B,2F38:5F13,2F39:5F50,2F3A:5F61,2F3B:5F73,2F3C:5FC3,2F3D:6208,2F3E:6236,2F3F:624B,2F40:652F,2F41:6534,2F42:6587,2F43:6597,2F44:65A4,2F45:65B9,2F46:65E0,2F47:65E5,2F48:66F0,2F49:6708,2F4A:6728,2F4B:6B20,2F4C:6B62,2F4D:6B79,2F4E:6BB3,2F4F:6BCB,2F50:6BD4,2F51:6BDB,2F52:6C0F,2F53:6C14,2F54:6C34,2F55:706B,2F56:722A,2F57:7236,2F58:723B,2F59:723F,2F5A:7247,2F5B:7259,2F5C:725B,2F5D:72AC,2F5E:7384,2F5F:7389,2F60:74DC,2F61:74E6,2F62:7518,2F63:751F,2F64:7528,2F65:7530,2F66:758B,2F67:7592,2F68:7676,2F69:767D,2F6A:76AE,2F6B:76BF,2F6C:76EE,2F6D:77DB,2F6E:77E2,2F6F:77F3,2F70:793A,2F71:79B8,2F72:79BE,2F73:7A74,2F74:7ACB,2F75:7AF9,2F76:7C73,2F77:7CF8,2F78:7F36,2F79:7F51,2F7A:7F8A,2F7B:7FBD,2F7C:8001,2F7D:800C,2F7E:8012,2F7F:8033,2F80:807F,2F81:8089,2F82:81E3,2F83:81EA,2F84:81F3,2F85:81FC,2F86:820C,2F87:821B,2F88:821F,2F89:826E,2F8A:8272,2F8B:8278,2F8C:864D,2F8D:866B,2F8E:8840,2F8F:884C,2F90:8863,2F91:897E,2F92:898B,2F93:89D2,2F94:8A00,2F95:8C37,2F96:8C46,2F97:8C55,2F98:8C78,2F99:8C9D,2F9A:8D64,2F9B:8D70,2F9C:8DB3,2F9D:8EAB,2F9E:8ECA,2F9F:8F9B,2FA0:8FB0,2FA1:8FB5,2FA2:9091,2FA3:9149,2FA4:91C6,2FA5:91CC,2FA6:91D1,2FA7:9577,2FA8:9580,2FA9:961C,2FAA:96B6,2FAB:96B9,2FAC:96E8,2FAD:9751,2FAE:975E,2FAF:9762,2FB0:9769,2FB1:97CB,2FB2:97ED,2FB3:97F3,2FB4:9801,2FB5:98A8,2FB6:98DB,2FB7:98DF,2FB8:9996,2FB9:9999,2FBA:99AC,2FBB:9AA8,2FBC:9AD8,2FBD:9ADF,2FBE:9B25,2FBF:9B2F,2FC0:9B32,2FC1:9B3C,2FC2:9B5A,2FC3:9CE5,2FC4:9E75,2FC5:9E7F,2FC6:9EA5,2FC7:9EBB,2FC8:9EC3,2FC9:9ECD,2FCA:9ED1,2FCB:9EF9,2FCC:9EFD,2FCD:9F0E,2FCE:9F13,2FCF:9F20,2FD0:9F3B,2FD1:9F4A,2FD2:9F52,2FD3:9F8D,2FD4:9F9C,2FD5:9FA0".split(",").map(x => x.split(":").map(h => String.fromCodePoint(parseInt(h, 16)))));
const unrad = s => String(s).replace(/[\u2E80-\u2FDF]/g, c => RADICALS.get(c) || c);
const fold = s => unrad(s).normalize("NFKC").replace(/[\sัิ-ฺ็-๎]+/g, "");
// RE-LOCK 2026-11-17 (coordinator decision 1): control / menu texts are matched as whole text units: on a word or text
// boundary (start / end, white space or punctuation on both sides), not across folded spaces (no false match of a short nav
// word inside a reading sentence). Spaces are kept (collapsed); Thai vowel / tone marks dropped as in fold().
const norm = s => unrad(s).normalize("NFKC").replace(/[ัิ-ฺ็-๎]+/g, "").replace(/\s+/g, " ").trim();
const escRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const unit = s => new RegExp("(?:^|[\\s\\p{P}\\p{S}])" + escRe(norm(s)) + "(?=$|[\\s\\p{P}\\p{S}])", "u");

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
            // RE-LOCK 2026-11-17 (coordinator decision 1): R3 contradicted R1 (the nav lists "LENSIQ" and the page names, which R1
            // requires in the header): EXACTLY the R1 header strings are left out of R3, nothing else; no minimum length
            const r1 = new Set(["LENSIQ", words.title, words.date, LINE[lang]].map(norm));
            const pageText = pages.map(x => norm(x.lines.map(l => l.text).join(" ")));
            for (const s of screen.bad) {
              if (r1.has(norm(s))) continue;
              const re = unit(s);
              if (pageText.some(t => re.test(t))) bad.push("control / menu / help text on paper: " + s);
            }
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
