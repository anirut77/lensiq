// tests/e2e/fortune-print-colour.e2e.mjs — FIXED TEST SET, owner decision 82 ก (2026-11-17), Chrome. Locked before the colour
// was built (~/LENSIQ-field/evals/print-report/, evals-locks/print-report.sha256). Pure half: tests/unit/fortune-print-colour.test.js.
// TH horoscope and TH tarot, A4, through the real print button, print media:
//   K1  black-and-white legibility: every element of the report that holds its own text has a computed text colour with contrast
//       >= 7:1 against white (it prints dark on a black-and-white printer)
//   K2  colour is there for colour printers / PDF: the header rule, the section-heading bars and the advice icons have a computed
//       colour that is clearly a colour (HSL saturation >= 0.35) and still >= 3:1 against white (visible in black and white)
//   K3  the colour PDF shows colour: page 1 rendered by pdf.js has colour pixels (saturation >= 0.35) on >= 0.05 % of the page
//   K4  colour never carries meaning alone: every swatch chip and every icon in the report has a text label next to it
import { assert } from "./cdp.mjs";

const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const sections = n => `document.querySelectorAll(".fa-section").length >= ${n}`;
const setSel = (id, v) => `(() => { const e = document.getElementById(${S(id)}); e.value = ${S(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
// RE-LOCK 2026-11-17 (owner decision 88 A). BEFORE: the tarot reading was random, so some readings had no advice icon and K2
// ("icons present and in colour") failed on content, not on the report (CI 44001930827, branch-e2e-10-merge.log). NOW: the tarot
// reading is FIXED: Math.random and crypto.getRandomValues run from a seeded generator (seed 12, measured 3 x identical, 1 advice
// icon), the same three-card love spread as before. EQUAL: every K2 assertion is unchanged and unconditional (header rule,
// section bars, icons present and in colour); only the input is fixed so the check can always run.
const SEEDED = seed => `(() => { let a = ${seed} >>> 0; const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Math.random = next;
  crypto.getRandomValues = arr => { for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(next() * 4294967296) % (2 ** (8 * (arr.BYTES_PER_ELEMENT || 1))); return arr; }; })();`;
// RE-LOCK 2026-11-24 (phase fortune-print relock1, equal): the base's fortune voice / depth / determinism work changed the
// tarot wording, so seed 12 now gives no advice icon (measured: seeds 1-15, only seed 7 gives one) and K2 failed on content, not
// on the report. Same rule as decision 88 A: only the fixed input moves (seed 12 -> 7); every K2 assertion stays unconditional.
const TAROT_SEED = 7;
const PAGES = {
  horoscope: async p => {
    await p.evaluate(setSel("hsDay", "15")); await p.evaluate(setSel("hsMonth", "8")); await p.evaluate(setSel("hsYear", "1990"));
    await p.evaluate(() => document.getElementById("hsGo").click()); await p.waitFor(sections(3), 20000);
  },
  tarot: async p => {
    await p.evaluate(() => { document.querySelector('input[value="three"]').click(); document.querySelector('input[value="love"]').click(); document.getElementById("trStart").click(); });
    await sleep(600); await p.evaluate(() => document.getElementById("trAuto").click()); await sleep(900); await p.evaluate(() => document.getElementById("trReveal").click());
    await p.waitFor(sections(3), 25000);
  },
};
const COLOURS = `(() => {
  const rgb = s => { const m = /rgba?\\(\\s*(\\d+)[,\\s]+(\\d+)[,\\s]+(\\d+)/.exec(s || ""); return m ? [+m[1], +m[2], +m[3]] : null; };
  const lum = c => { const x = c.map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * x[0] + 0.7152 * x[1] + 0.0722 * x[2]; };
  const con = c => 1.05 / (lum(c) + 0.05);
  const sat = c => { const [r, g, b] = c.map(v => v / 255), mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2; return mx === mn ? 0 : (mx - mn) / (l > 0.5 ? 2 - mx - mn : mx + mn); };
  const pv = document.getElementById("lqPrint"), bad = [];
  if (!pv) return { bad: ["no report"] };
  // K1
  let texts = 0;
  for (const e of pv.querySelectorAll("*")) {
    if (e.closest("svg") || e.closest("style")) continue;
    const own = [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!own) continue;
    texts++;
    const c = rgb(getComputedStyle(e).color);
    if (!c || con(c) < 7) bad.push("K1 text colour " + getComputedStyle(e).color + " (" + (c ? con(c).toFixed(2) : "?") + ":1) on " + e.tagName + "." + e.className + " " + e.textContent.trim().slice(0, 30));
  }
  // K2
  const accent = (what, list, prop) => {
    if (!list.length) { bad.push("K2 no " + what); return; }
    for (const e of list) { const c = rgb(getComputedStyle(e)[prop]);
      if (!c || sat(c) < 0.35) bad.push("K2 " + what + " not in colour: " + getComputedStyle(e)[prop]);
      else if (con(c) < 3) bad.push("K2 " + what + " too light for black and white: " + getComputedStyle(e)[prop]); }
  };
  accent("header rule", [...pv.querySelectorAll(".lqp-head")], "borderBottomColor");
  accent("section-heading bar", [...pv.querySelectorAll(".lqp-h")], "borderLeftColor");
  accent("icon", [...pv.querySelectorAll(".lqp-ico-svg")], "color");
  // K4
  const lab = e => { const p = e.parentElement; return !!p && (p.textContent || "").replace(/\\s+/g, " ").trim().length > 0; };
  for (const e of pv.querySelectorAll(".lqp-chip")) if (!lab(e)) bad.push("K4 swatch without a label");
  for (const s of pv.querySelectorAll("svg")) if (!s.closest(".lqp-mark") && !lab(s)) bad.push("K4 icon without a label");
  return { bad, texts };
})()`;

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const reader = await browser.newPage(null);
  try {
    await reader.goto(`${base}/converter.html?nosw`);
    await reader.waitFor(`!!window.pdfjsLib`, 10000);
    for (const [p, read] of Object.entries(PAGES)) {
      const page = await browser.newPage(null, { initScripts: [`try { localStorage.setItem("lq-lang", "th"); } catch (e) {}`, `window.print = () => {};`]
        .concat(p === "tarot" ? [SEEDED(TAROT_SEED)] : []) }); // decision 88 A: the fixed tarot reading
      let err = null;
      try {
        await page.send("Emulation.setDeviceMetricsOverride", { width: 375, height: 800, deviceScaleFactor: 2, mobile: true });
        await page.goto(`${base}/${p}.html?nosw`);
        await page.waitFor(`document.readyState === "complete" && document.documentElement.lang === "th"`, 10000);
        await sleep(500);
        await read(page);
        await page.waitFor(`!!window.LQShare && [...document.querySelectorAll('[data-lq-sp="print"]')].some(b => b.offsetParent)`, 5000);
        await page.evaluate(() => window.LQShare.printReady());
        await page.evaluate(() => [...document.querySelectorAll('[data-lq-sp="print"]')].find(b => b.offsetParent).click());
        await page.waitFor(`!!document.querySelector("#lqPrint.lqp")`, 5000);
        await page.send("Emulation.setEmulatedMedia", { media: "print" });
        await sleep(300);
      } catch (e) { err = e; }
      try {
        await check(`K1 K2 K4 [${p}/th] black-and-white legible, colour accents present, colour never alone`, async () => {
          if (err) throw new Error("no report: " + err.message);
          const r = await page.evaluate(COLOURS);
          assert(r.texts >= 20, "text elements checked: " + r.texts);
          assert(!r.bad.length, r.bad.slice(0, 10).join("\n"));
        });
        await check(`K3 [${p}/th] the colour PDF shows colour on page 1`, async () => {
          if (err) throw new Error("no report: " + err.message);
          const pdf = await page.send("Page.printToPDF", { printBackground: true, preferCSSPageSize: true, paperWidth: 8.27, paperHeight: 11.69 });
          // RE-LOCK 2026-11-17 (harness fix, check unchanged): pdf.js draws in frames; a background tab stalls them (first run hung)
          await reader.send("Page.bringToFront");
          const share = await reader.evaluate(async (data) => {
            const bin = atob(data), u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
            const pdf = await window.pdfjsLib.getDocument({ data: u8 }).promise, pg = await pdf.getPage(1), vp = pg.getViewport({ scale: 1 });
            const c = document.createElement("canvas"); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
            const ctx = c.getContext("2d"); await pg.render({ canvasContext: ctx, viewport: vp }).promise;
            const d = ctx.getImageData(0, 0, c.width, c.height).data; let n = 0;
            for (let i = 0; i < d.length; i += 4) { const r = d[i] / 255, g = d[i + 1] / 255, b = d[i + 2] / 255, mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
              const s = mx === mn ? 0 : (mx - mn) / (l > 0.5 ? 2 - mx - mn : mx + mn); if (s >= 0.35 && l < 0.92) n++; }
            return n / (d.length / 4);
          }, pdf.data);
          assert(share >= 0.0005, "colour pixels on page 1: " + (share * 100).toFixed(3) + " %");
        });
      } finally { await page.close(); }
    }
  } finally { await reader.close(); await browser.close(); }
}
