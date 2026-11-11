// tests/e2e/fortune-wheel-labels.e2e.mjs — owner bug 2026-11-12: "text labels overlap on a circular fortune chart".
// Every circular / radial chart in the Fortune category, filled with real reading data, at 320 / 360 / 390 / 1280 px
// in th / en / zh:
//   astro.html      SVG zodiac wheel (sign glyphs + Sun / Moon / ASC markers)
//   horoscope.html  SVG Taksa wheel (8 planets + bhumi), SVG five-element pentagon, SVG compatibility ring
//   numbers.html    CSS donut score ring (#nmRing)
//   fengshui.html   canvas AR compass (8 direction labels) and the share-card compass (canvas, 1080 px image)
// For each chart: no two labels intersect (≤ 1 px allowed), every label stays inside the chart's box and the viewport,
// and every label renders at ≥ 12 CSS px (the site minimum, tools/mobile-audit.mjs "tinyText").
// SVG / HTML labels are measured with getBoundingClientRect; canvas labels through a test-only wrapper around
// CanvasRenderingContext2D.fillText (installed by this file's init script — the product code is not touched) that
// records each text's ink box (measureText) mapped through the current transform.
// LQ_WHEEL_OUT=/abs/path.json writes the full failure list (outside the repo) for the eval log.
import { writeFileSync } from "node:fs";
import { assert } from "./cdp.mjs";

const WIDTHS = [320, 360, 390, 1280], LANGS = ["th", "en", "zh"], MIN_PX = 12, TOL = 1;
const sleep = ms => new Promise(r => setTimeout(r, ms));

// test-only canvas text recorder (init script)
const CANVAS_HOOK = `(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.__lqText = [];
  P.fillText = function (txt, x, y, mw) {
    try {
      const m = this.measureText(String(txt)), T = this.getTransform(), fs = parseFloat((/([\\d.]+)px/.exec(this.font) || [])[1]) || 0;
      const L = x - m.actualBoundingBoxLeft, R = x + m.actualBoundingBoxRight, Tp = y - m.actualBoundingBoxAscent, B = y + m.actualBoundingBoxDescent;
      const pts = [[L, Tp], [R, Tp], [L, B], [R, B]].map(([a, b]) => [T.a * a + T.c * b + T.e, T.b * a + T.d * b + T.f]);
      const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
      window.__lqText.push({ cv: this.canvas, t: String(txt), l: Math.min(...xs), r: Math.max(...xs), tp: Math.min(...ys), b: Math.max(...ys),
        fs: fs * Math.hypot(T.a, T.b), moved: !(T.e === 0 && T.f === 0) });
    } catch (e) { /* recorder only */ }
    return orig.apply(this, arguments);
  };
})();`;

// in page: SVG chart → { chart, vw, labels }
const svgMeasure = sel => `(() => {
  const svg = document.querySelector(${JSON.stringify(sel)}); if (!svg) return null;
  const c = svg.getBoundingClientRect(); if (!c.width) return { hidden: true };
  const labels = [...svg.querySelectorAll("text")].filter(t => t.textContent.trim()).map(t => {
    const r = t.getBoundingClientRect(), ctm = t.getScreenCTM();
    return { t: t.textContent.trim(), l: r.left, r: r.right, tp: r.top, b: r.bottom, fs: parseFloat(getComputedStyle(t).fontSize) * Math.hypot(ctm.a, ctm.b) };
  });
  return { chart: { l: c.left, r: c.right, tp: c.top, b: c.bottom }, vw: document.documentElement.clientWidth, labels };
})()`;
const htmlMeasure = (sel, kids) => `(() => {
  const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return null;
  const c = el.getBoundingClientRect(); if (!c.width) return { hidden: true };
  const labels = [...el.querySelectorAll(${JSON.stringify(kids)})].filter(t => t.textContent.trim()).map(t => {
    const rg = document.createRange(); rg.selectNodeContents(t); const r = rg.getBoundingClientRect();
    return { t: t.textContent.trim(), l: r.left, r: r.right, tp: r.top, b: r.bottom, fs: parseFloat(getComputedStyle(t).fontSize) };
  });
  return { chart: { l: c.left, r: c.right, tp: c.top, b: c.bottom }, vw: document.documentElement.clientWidth, labels };
})()`;
// canvas labels recorded by CANVAS_HOOK, converted to CSS px of the on-screen canvas (or image px for an offscreen one)
const canvasMeasure = (sel, filter) => `(() => {
  const cv = ${sel}; if (!cv) return null;
  const box = cv.isConnected ? cv.getBoundingClientRect() : { left: 0, top: 0, width: cv.width, height: cv.height };
  const k = box.width / cv.width, keep = ${filter};
  const labels = window.__lqText.filter(x => x.cv === cv && x.t.trim() && keep(x, cv))
    .map(x => ({ t: x.t, l: box.left + x.l * k, r: box.left + x.r * k, tp: box.top + x.tp * k, b: box.top + x.b * k, fs: x.fs * k }));
  return { chart: { l: box.left, r: box.left + box.width, tp: box.top, b: box.top + box.height }, vw: cv.isConnected ? document.documentElement.clientWidth : cv.width, labels };
})()`;

function problems(m) {
  const out = [], L = m.labels;
  for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L.length; j++) {
    const a = L[i], b = L[j], ox = Math.min(a.r, b.r) - Math.max(a.l, b.l), oy = Math.min(a.b, b.b) - Math.max(a.tp, b.tp);
    if (ox > TOL && oy > TOL) out.push(`overlap "${a.t}" × "${b.t}" (${ox.toFixed(1)}×${oy.toFixed(1)}px)`);
  }
  for (const a of L) {
    const c = m.chart;
    if (a.l < c.l - TOL || a.r > c.r + TOL || a.tp < c.tp - TOL || a.b > c.b + TOL) out.push(`outside chart "${a.t}" [${a.l.toFixed(0)},${a.r.toFixed(0)}] of [${c.l.toFixed(0)},${c.r.toFixed(0)}]`);
    else if (a.l < -TOL || a.r > m.vw + TOL) out.push(`outside viewport "${a.t}"`);
    if (a.fs < MIN_PX - 0.01) out.push(`font ${a.fs.toFixed(1)}px < ${MIN_PX} "${a.t}"`);
  }
  return out;
}

const setVal = (id, v) => `(() => { const e = document.getElementById(${JSON.stringify(id)}); e.value = ${JSON.stringify(v)};
  e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); })()`;
const clickEra = (name, v) => `document.querySelector('input[name="${name}"][value="${v}"]').click()`;
// make the tab panel that holds `sel` visible (horoscope result tabs)
const showTabOf = sel => `(() => { const el = document.querySelector(${JSON.stringify(sel)}); if (!el) return false; const p = el.closest("[role=tabpanel]");
  if (p && p.hidden && p.id) { const t = document.querySelector('[role=tab][aria-controls="' + p.id + '"]'); if (t) t.click(); } el.scrollIntoView({ block: "center" }); return true; })()`;

// reading inputs (worst cases included: the longest day name "Wednesday night", Sun / Moon / ASC on one longitude)
const HS_INPUTS = [["12", "8", "1990", ""], ["13", "8", "1990", ""], ["14", "8", "1990", ""], ["15", "8", "1990", "10:00"], ["15", "8", "1990", "20:00"],
  ["16", "8", "1990", ""], ["17", "8", "1990", ""], ["18", "8", "1990", ""]];
const AS_INPUTS = [["15", "5", "1990", ""], ["6", "1", "2000", "06:40"], ["21", "3", "1985", "18:30"], ["23", "9", "1979", "12:00"]];

export default async function ({ base, launch, check }) {
  const browser = await launch();
  const fails = [];
  const record = (chart, w, lang, input, m) => {
    if (!m || m.hidden) { fails.push(`${chart} @${w} ${lang} ${input}: chart not rendered`); return; }
    if (!m.labels.length) { fails.push(`${chart} @${w} ${lang} ${input}: no labels found`); return; }
    for (const p of problems(m)) fails.push(`${chart} @${w} ${lang} ${input}: ${p}`);
  };
  const size = (page, w) => page.send("Emulation.setDeviceMetricsOverride", { width: w, height: w < 600 ? 844 : 900, deviceScaleFactor: w < 600 ? 2 : 1, mobile: w < 600 });
  try {
    for (const lang of LANGS) {
      const init = [`try{localStorage.setItem("lq-lang",${JSON.stringify(lang)})}catch(e){}`, CANVAS_HOOK];

      await check(`fortune wheels (${lang}): astro zodiac wheel`, async () => {
        const page = await browser.newPage(null, { initScripts: init, isolated: true });
        try {
          await page.goto(`${base}/astro.html`);
          for (const w of WIDTHS) {
            await size(page, w); await sleep(150);
            for (const [d, mo, y, tm] of AS_INPUTS) {
              await page.evaluate(clickEra("asEra", "ce"));
              await page.evaluate(setVal("asDay", d)); await page.evaluate(setVal("asMonth", mo)); await page.evaluate(setVal("asYear", y));
              await page.evaluate(`(() => { const n = document.getElementById("asNoTime"); if (n.checked !== ${!tm}) n.click(); })()`);
              if (tm) await page.evaluate(setVal("asTime", tm));
              await page.evaluate(() => { document.getElementById("asWheel").innerHTML = ""; document.getElementById("asForm").requestSubmit(); });
              await page.waitFor(() => !!document.querySelector("#asWheel svg"), 8000);
              await page.evaluate(showTabOf("#asWheel svg")); await sleep(60);
              record("astro.wheel", w, lang, `${d}/${mo}/${y} ${tm}`, await page.evaluate(svgMeasure("#asWheel svg")));
            }
          }
        } finally { await page.close(); }
      });

      await check(`fortune wheels (${lang}): horoscope Taksa wheel, five-element pentagon, compatibility ring`, async () => {
        const page = await browser.newPage(null, { initScripts: init, isolated: true });
        try {
          await page.goto(`${base}/horoscope.html`);
          for (const w of WIDTHS) {
            await size(page, w); await sleep(150);
            for (const [d, mo, y, tm] of HS_INPUTS) {
              await page.evaluate(clickEra("hsEra", "ce"));
              await page.evaluate(setVal("hsDay", d)); await page.evaluate(setVal("hsMonth", mo)); await page.evaluate(setVal("hsYear", y));
              await page.evaluate(`(() => { const n = document.getElementById("hsNoTime"); if (n.checked !== ${!tm}) n.click(); })()`);
              if (tm) await page.evaluate(setVal("hsTime", tm));
              await page.evaluate(() => { document.querySelectorAll(".hs-wheel,.hs-penta").forEach(e => e.remove()); document.getElementById("hsGo").click(); });
              await page.waitFor(() => !!document.querySelector(".hs-wheel") && !!document.querySelector(".hs-penta"), 15000);
              const tag = `${d}/${mo}/${y} ${tm}`;
              await page.evaluate(showTabOf(".hs-wheel")); await sleep(60);
              record("horoscope.taksa", w, lang, tag, await page.evaluate(svgMeasure(".hs-wheel")));
              await page.evaluate(showTabOf(".hs-penta")); await sleep(60);
              record("horoscope.pentagon", w, lang, tag, await page.evaluate(svgMeasure(".hs-penta")));
            }
            await page.evaluate(setVal("hsPDay", "3")); await page.evaluate(setVal("hsPMonth", "2")); await page.evaluate(setVal("hsPYear", "1992"));
            await page.evaluate(() => { document.getElementById("hsCompat").innerHTML = ""; document.getElementById("hsPartner").requestSubmit(); });
            await page.waitFor(() => !!document.querySelector("#hsCompat svg"), 8000);
            await page.evaluate(showTabOf("#hsCompat svg")); await sleep(60);
            record("horoscope.compat", w, lang, "partner 3/2/1992", await page.evaluate(svgMeasure("#hsCompat svg")));
          }
        } finally { await page.close(); }
      });

      await check(`fortune wheels (${lang}): numbers score ring`, async () => {
        const page = await browser.newPage(null, { initScripts: init, isolated: true });
        try {
          await page.goto(`${base}/numbers.html`);
          for (const w of WIDTHS) {
            await size(page, w); await sleep(150);
            await page.evaluate(setVal("nmPhone", "0812345678")); await page.evaluate(() => document.getElementById("nmGo").click());
            await page.waitFor(() => !document.getElementById("nmResult").hidden, 8000); await sleep(100);
            await page.evaluate(showTabOf("#nmRing"));
            record("numbers.ring", w, lang, "0812345678", await page.evaluate(htmlMeasure("#nmRing", "b,small")));
          }
        } finally { await page.close(); }
      });

      await check(`fortune wheels (${lang}): fengshui AR compass and share-card compass`, async () => {
        const page = await browser.newPage(null, { initScripts: init, isolated: true });
        try {
          await page.goto(`${base}/fengshui.html?cpu`);
          await page.evaluate(setVal("fsEra", "ce"));
          await page.evaluate(setVal("fsDay", "15")); await page.evaluate(setVal("fsMonth", "6")); await page.evaluate(setVal("fsYear", "1990"));
          await page.evaluate(() => document.getElementById("fsKuaForm").requestSubmit()); await sleep(400);
          for (const w of WIDTHS) {
            await size(page, w); await sleep(200);
            for (const h of [0, 22, 123, 300]) {
              await page.evaluate(`(() => { document.getElementById("fsArBox").scrollIntoView({ block: "center" }); window.__lqText.length = 0; window.__fs.setHeading(${h}); })()`);
              await page.waitFor(() => window.__lqText.some(x => x.cv === document.getElementById("fsAr")), 3000);
              await sleep(50);
              // compass-dial labels are the ones drawn under the dial's translate (the heading tape draws at identity)
              record("fengshui.arCompass", w, lang, `heading ${h}`, await page.evaluate(canvasMeasure(`document.getElementById("fsAr")`, "x => x.moved")));
            }
          }
          await page.evaluate(() => { window.__lqText.length = 0; });
          await page.evaluate(() => window.__fs.makeCard().then(cv => { window.__card = cv; }));
          await page.waitFor(() => !!window.__card, 8000);
          // dial region of the 1080×1350 card: centre (540, 400), radius 230 + labels
          record("fengshui.cardCompass", 1080, lang, "kua card", await page.evaluate(canvasMeasure("window.__card", "(x, cv) => Math.hypot((x.l + x.r) / 2 - 540, (x.tp + x.b) / 2 - 400) < 260")));
        } finally { await page.close(); }
      });
    }
    if (process.env.LQ_WHEEL_OUT) writeFileSync(process.env.LQ_WHEEL_OUT, JSON.stringify({ when: new Date().toISOString(), fails }, null, 1));
    await check("fortune wheels: no overlapping / clipped / tiny labels on any chart, width or language", async () => {
      assert(!fails.length, `${fails.length} label problems:\n  ` + fails.slice(0, 80).join("\n  "));
    });
  } finally { await browser.close(); }
}
