// tests/e2e/fortune-print-photo.e2e.mjs — FIXED TEST SET, owner order 2026-11-17 (decision 82 addition), Chrome 375 px, Thai.
// Locked before the build (~/LENSIQ-field/evals/print-report/, evals-locks/print-report.sha256). Pure half:
// tests/unit/fortune-print-photo.test.js. Synthetic camera only (tests/e2e/fake-cams.js: a solid colour and a white box; no
// image of a person anywhere). Face reading and palm reading, per page:
//   P1  nothing on screen is missing on paper: every visible text of the result on screen (not controls, menus, help) is in the
//       PDF text (A4 and A5)
//   P2  the annotated photo is printed as a figure re-drawn at print resolution (image >= 1600 px wide and >= 1.5 x the screen
//       canvas), and the figure, its legend and the headline result are on the same PDF page, which holds the image
//   P3  black and white: every legend entry has a non-colour cue (line style / marker) and the cues differ; label boxes on the
//       figure have dark text on a light box (contrast >= 7:1)
//   P4  "include my photo in the report" next to the print button, ON by default; OFF = the figure is drawn on the neutral
//       outline (>= 50 % of its pixels are the neutral background; ON: < 5 %)
//   P5  no network request from the print tap to the PDF (nothing uploaded, no image data sent)
//   P6  80 mm receipt: a compact figure (image >= 600 px wide) inside the roll width
//   P7  when the page reports a consent line for the photo (another person, rear camera), it is printed with the figure
import { assert } from "./cdp.mjs";
import { readFileSync } from "node:fs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const FACE = { x: 0.35, y: 0.2, w: 0.3, h: 0.45, score: 0.95 };
const HAND = { x: 0.35, y: 0.18, w: 0.3, h: 0.6, score: 0.95, side: "right" };
const detScript = `(() => { window.__LQ_FAKE_CAMS = { n: 1, mode: "ok" }; window.__dets = []; window.__LQ_FAKE_DET = () => window.__dets.map(d => Object.assign({}, d)); })();`;
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n}`;
const PAGES = {
  faceread: {
    root: "#frResult", canvas: "#frResCanvas",
    read: async p => {
      await p.evaluate(() => document.getElementById("frStartCam").click());
      await p.waitFor(`!document.getElementById("frRead").hidden && document.querySelector("#frCam.live")`, 10000);
      await p.evaluate(d => { window.__dets = d; }, [FACE]);
      await p.waitFor(`!document.getElementById("frRead").disabled`, 8000);
      await p.evaluate(() => document.getElementById("frRead").click());
      await p.waitFor(`!document.getElementById("frResult").hidden && ` + sections(3), 20000);
    },
  },
  palm: {
    root: "#plResult", canvas: "#plResCanvas",
    read: async p => {
      await p.waitFor(`!!(window.__palm && document.getElementById("plEngine").classList.contains("ok"))`, 10000);
      await p.evaluate(() => document.getElementById("plStartCam").click());
      await p.waitFor(`document.querySelector("#plCam.live") && !document.getElementById("plSnap").hidden`, 10000);
      await p.evaluate(d => { window.__dets = d; }, [HAND]);
      await sleep(600);
      await p.evaluate(() => document.getElementById("plSnap").click());
      await p.waitFor(`!document.getElementById("plEdit").hidden && !!window.__palm.S.lines && !window.__palm.S.busy`, 20000);
      await p.evaluate(() => document.getElementById("plRead").click());
      await p.waitFor(`!document.getElementById("plResult").hidden && document.querySelectorAll("#plNarr .fa-section").length >= 3`, 20000);
    },
  },
};
// PDF read-back compared like the print-report kit: CI font glyph twins (tests/e2e/pdf-glyph-twins.json, pinned font hash), NFKC
const TWINS = (() => {
  const j = JSON.parse(readFileSync(new URL("./pdf-glyph-twins.json", import.meta.url), "utf8"));
  const lock = readFileSync(new URL("../../tools/ci-fonts.lock", import.meta.url), "utf8").split("\n").map(l => l.trim().split(/\s+/));
  const pinned = (lock.find(x => x[1] === j.source.package) || [])[0];
  if (!pinned || pinned !== j.source.sha256) throw new Error("pdf-glyph-twins.json does not match the font pinned in tools/ci-fonts.lock");
  return new Map(Object.entries(j.map).map(([a, b]) => [String.fromCodePoint(parseInt(a, 16)), String.fromCodePoint(parseInt(b, 16))]));
})();
const fold = s => [...String(s)].map(c => TWINS.get(c) || c).join("").normalize("NFKC").replace(/[\sัิ-ฺ็-๎]+/g, "");
const VIS = `const vis = e => { if (!e || !e.isConnected) return false; for (let a = e; a; a = a.parentElement) { if (a.hidden) return false;
  const c = getComputedStyle(a); if (c.display === "none" || c.visibility === "hidden" || c.opacity === "0") return false; }
  const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0; };`;
/** visible texts of the result on screen: every element with its own text, outside controls, menus and help */
const SCREEN = (root, canvas) => `(() => { ${VIS}
  const r = document.querySelector(${S(root)}), out = [];
  const SKIP = "button, select, input, textarea, label, nav, form, [data-lq-sp], [data-lq-sp-bar], [data-lq-sp-opt], [data-lq-sp-photo], .lq-helpline, .lq-camhelp, .lq-toc, [role=tablist], .sr-only, dialog";
  // RE-LOCK 2026-11-17 (owner decision 88 B). BEFORE: each element's own text nodes were joined, so text with inline children
  // came apart and was checked as a string that is not on screen ("ธาตุรอง: น้ำ 6%" checked as "ธาตุรอง: 6%"; Thai words in
  // line-break spans dropped: "ผลอ่านโหงวเฮ้งของคุณ" checked as "ผล ของ คุณ"). NOW: in every visible block element of the result,
  // each run of inline content between its block children (text + bold / span / word-break spans, without controls) is checked
  // as ONE piece of the PDF text. STRICTER: every own text node checked before is a contiguous part of a run checked now, and the
  // whole run must appear unbroken; inline elements are covered inside their parent's run.
  const inl = n => { const d = getComputedStyle(n).display; return /^inline/.test(d) || d === "contents"; };
  const runText = n => (n.nodeType === 3 ? n.textContent : n.closest(SKIP) || !vis(n) ? "" : n.innerText || n.textContent || "");
  for (const e of r.querySelectorAll("*")) {
    if (e.closest(SKIP) || !vis(e) || inl(e)) continue;
    let run = "";
    const flush = () => { const t = run.replace(/\\s+/g, " ").trim(); if (t.length >= 2) out.push(t); run = ""; };
    for (const n of e.childNodes) {
      if (n.nodeType === 3) run += n.textContent;
      else if (n.nodeType === 1 && inl(n) && !n.matches(SKIP)) run += runText(n);
      else if (n.nodeType === 1 && !inl(n)) flush();
    }
    flush();
  }
  const c = document.querySelector(${S(canvas)});
  return { texts: [...new Set(out)], canvasW: c ? c.width : 0 };
})()`;
async function pdfRead(reader, b64) {
  await reader.send("Page.bringToFront");
  return reader.evaluate(async (data) => {
    const bin = atob(data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    const pdf = await window.pdfjsLib.getDocument({ data: u8 }).promise, out = [];
    for (let i = 1; i <= pdf.numPages; i++) {
      const pg = await pdf.getPage(i), tc = await pg.getTextContent(), ops = await pg.getOperatorList();
      const img = ops.fnArray.some(f => f === window.pdfjsLib.OPS.paintImageXObject || f === window.pdfjsLib.OPS.paintInlineImageXObject);
      out.push({ text: tc.items.map(x => x.str).join(""), img, w: pg.getViewport({ scale: 1 }).width });
    }
    return out;
  }, b64);
}
/** the printed figure: its image (natural size, share of neutral pixels), headline, caption, legend, consent */
const FIG = `(async () => {
  const f = document.querySelector("#lqPrint .lqp-photofig"); if (!f) return null;
  const img = f.querySelector("img"); if (img && !img.complete) await new Promise(r => { img.onload = r; img.onerror = r; });
  const neutral = (f.getAttribute("data-neutral") || "").match(/[0-9a-f]{2}/gi);
  let share = null;
  if (img && neutral) {
    const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext("2d"); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data, n = neutral.map(h => parseInt(h, 16));
    let k = 0; for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - n[0]) <= 2 && Math.abs(d[i + 1] - n[1]) <= 2 && Math.abs(d[i + 2] - n[2]) <= 2) k++;
    share = k / (d.length / 4);
  }
  const t = s => { const e = f.querySelector(s); return e ? e.textContent.replace(/\\s+/g, " ").trim() : ""; };
  const r = img ? img.getBoundingClientRect() : null;
  return { nw: img ? img.naturalWidth : 0, shown: r ? r.width : 0, share, headline: t(".lqp-fig-head"), caption: t(".lqp-fig-cap"), consent: t(".lqp-fig-consent"),
    legend: [...f.querySelectorAll(".lqp-fig-legend li")].map(li => ({ label: (li.querySelector(".lqp-lg-label") || li).textContent.trim(), cue: (li.querySelector(".lqp-lg-cue") || {}).textContent || "" })),
    labelStyle: f.getAttribute("data-label-style") || "" };
})()`;
const lum = h => { const c = h.match(/[0-9a-f]{2}/gi).map(x => parseInt(x, 16) / 255).map(v => v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

export default async function ({ base, launch, check, fakeCams }) {
  const browser = await launch();
  const reader = await browser.newPage(null);
  try {
    await reader.goto(`${base}/converter.html?nosw`);
    await reader.waitFor(`!!window.pdfjsLib`, 10000);
    for (const [p, cfg] of Object.entries(PAGES)) {
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`, `window.print = () => { window.__printed = (window.__printed || 0) + 1; };`, fakeCams, detScript] });
      let err = null, screen = null;
      try {
        await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
        await page.goto(`${base}/${p}.html?cpu&fakedet&nosw`);
        await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === "th"`, 10000);
        await sleep(500);
        await cfg.read(page);
        await page.waitFor(`!!window.LQShare && [...document.querySelectorAll('[data-lq-sp="print"]')].some(b => b.offsetParent)`, 5000);
        await page.evaluate(() => window.LQShare.printReady());
        await sleep(400);
        screen = await page.evaluate(SCREEN(cfg.root, cfg.canvas));
      } catch (e) { err = e; }
      const need = () => { if (err) throw new Error("no result: " + err.message); };
      const printWith = async (photoOn, size) => {
        await page.send("Emulation.setEmulatedMedia", { media: "" });
        await page.evaluate(() => window.dispatchEvent(new Event("afterprint")));
        await sleep(200);
        await page.evaluate(on => { const c = document.querySelector("[data-lq-sp-photo] input"); if (c && c.checked !== on) c.click(); }, photoOn);
        const n0 = page.requests.length;
        if (size === "80mm") await page.evaluate(() => window.LQPrint.print({ size: "80mm" }));
        else await page.evaluate(() => [...document.querySelectorAll('[data-lq-sp="print"]')].find(b => b.offsetParent).click());
        await page.waitFor(`!!document.querySelector("#lqPrint.lqp")`, 8000);
        await page.send("Emulation.setEmulatedMedia", { media: "print" });
        await sleep(400);
        return n0;
      };
      try {
        await check(`P4 [${p}] "include my photo in the report" next to print, ON by default, in Thai`, async () => {
          need();
          const c = await page.evaluate(`(() => { ${VIS} const l = document.querySelector("[data-lq-sp-photo]"); const i = l && l.querySelector("input");
            return l ? { vis: vis(l), on: !!(i && i.checked), text: l.textContent.trim() } : null; })()`);
          assert(c && c.vis && c.on && c.text.includes("ใส่รูปถ่ายในรายงาน"), "photo checkbox " + S(c));
        });
        for (const [sz, paper] of [["A4", { paperWidth: 8.27, paperHeight: 11.69 }], ["A5", { paperWidth: 5.83, paperHeight: 8.27 }]]) {
          await check(`P1 P2 P3 P5 P7 [${p}] ${sz}: everything on screen on paper; print-resolution figure with legend + headline on one page; B/W cues; no requests`, async () => {
            need();
            const n0 = await printWith(true, sz);
            const f = await page.evaluate(FIG);
            assert(f, "no photo figure in the report");
            const pdf = await page.send("Page.printToPDF", Object.assign({ printBackground: true, preferCSSPageSize: true }, paper));
            const net = page.requests.slice(n0).map(q => q.url);
            const pages = await pdfRead(reader, pdf.data), all = fold(pages.map(x => x.text).join("")), bad = [];
            // P1
            for (const t of screen.texts) if (!all.includes(fold(t))) bad.push("P1 on screen, not on paper: " + t.slice(0, 80));
            // P2
            const minW = Math.max(1600, Math.ceil(1.5 * screen.canvasW));
            if (f.nw < minW) bad.push(`P2 figure image ${f.nw} px wide, need >= ${minW} (re-drawn for print, not the screen canvas)`);
            const hp = pages.findIndex(x => f.headline && fold(x.text).includes(fold(f.headline)));
            if (hp < 0) bad.push("P2 headline not in the PDF: " + f.headline);
            else {
              if (!fold(pages[hp].text).includes(fold(f.caption).slice(0, 16))) bad.push("P2 caption not on the headline's page");
              for (const l of f.legend) if (!fold(pages[hp].text).includes(fold(l.label))) bad.push("P2 legend entry not on the headline's page: " + l.label);
              if (!pages[hp].img) bad.push("P2 no image on the headline's page");
            }
            // P3
            if (f.legend.length < 3) bad.push("P3 legend entries: " + f.legend.length);
            const cues = f.legend.map(l => l.cue.trim());
            if (cues.some(c => !c)) bad.push("P3 legend entry without a non-colour cue");
            if (new Set(cues).size < cues.length) bad.push("P3 legend cues repeat: " + cues.join(" / "));
            const ls = (f.labelStyle || "").match(/#[0-9a-f]{6}/gi) || [];
            if (ls.length < 2 || contrast(ls[0], ls[1]) < 7) bad.push("P3 label boxes need dark text on a light box (>= 7:1): " + f.labelStyle);
            // P5
            if (net.length) bad.push("P5 network requests while printing: " + net.slice(0, 3).join(", "));
            // P7
            if (f.consent && !all.includes(fold(f.consent))) bad.push("P7 consent line not printed");
            assert(!bad.length, `${pages.length} page(s)\n` + bad.slice(0, 15).join("\n"));
          });
        }
        await check(`P4 [${p}] photo OFF: the figure is the neutral outline, no photo pixels; ON: photo`, async () => {
          need();
          await printWith(true, "A4");
          const on = await page.evaluate(FIG);
          await printWith(false, "A4");
          const off = await page.evaluate(FIG);
          assert(on && off, "figure missing " + S({ on: !!on, off: !!off }));
          assert(off.share != null && off.share >= 0.5, "photo OFF: neutral share " + off.share);
          assert(on.share != null && on.share < 0.05, "photo ON: neutral share " + on.share);
          await printWith(true, "A4"); // leave it on
        });
        await check(`P6 [${p}] 80 mm receipt: a compact figure inside the roll`, async () => {
          need();
          await printWith(true, "80mm");
          const px = Math.floor((80 - 6) / 25.4 * 96);
          await page.send("Emulation.setDeviceMetricsOverride", { width: px, height: 1000, deviceScaleFactor: 1, mobile: false });
          await sleep(300);
          const f = await page.evaluate(FIG);
          const r80 = await page.evaluate(() => !!document.querySelector("#lqPrint.lqp--r80 .lqp-photofig"));
          await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
          assert(r80 && f && f.nw >= 600 && f.shown <= px + 1, "80 mm figure " + S({ r80, nw: f && f.nw, shown: f && f.shown, px }));
        });
      } finally { await page.close(); }
    }
  } finally { await reader.close(); await browser.close(); }
}
