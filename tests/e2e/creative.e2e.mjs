// tests/e2e/creative.e2e.mjs — Creative Lab (creative.html) on synthetic creatives drawn in the page (no image files,
// no datasets). Checks: predicted-attention map + order, text detection + WCAG contrast, palette, complexity ordering,
// region attention share, gaze cue (?fakedet scripted face), findings cards, A/B recommendation + caveat, 中文 switch,
// privacy (no storage of images, no /api, no third-party requests) and 390 px layout. Real face models load once (WASM).
import { assert, assertNoWebGL, privacyScan } from "./cdp.mjs";

const sleep = ms => new Promise(r => setTimeout(r, ms));
const hardErrors = (page, base) => page.consoleErrors.filter(e => !(e.kind === "log" && e.source === "network" && e.url && !e.url.startsWith(base)));

/* in-page: draw synthetic creatives and hand them to the page as Files (same path as the file input) */
const MAKE = () => {
  window.__mk = async (kind) => {
    const c = document.createElement("canvas"); c.width = 800; c.height = 600;
    const x = c.getContext("2d");
    if (kind === "clean") {
      x.fillStyle = "#ffffff"; x.fillRect(0, 0, 800, 600);
      x.fillStyle = "#111111"; x.font = "bold 64px sans-serif"; x.fillText("SALE 50% OFF", 60, 110);
      x.fillStyle = "#c8c8c8"; x.font = "22px sans-serif"; x.fillText("terms and conditions apply to this offer", 60, 160); // low contrast
      x.fillStyle = "#1e64c8"; x.beginPath(); x.arc(250, 360, 110, 0, 2 * Math.PI); x.fill();                  // "product"
      x.fillStyle = "#f76707"; x.fillRect(520, 470, 220, 80);                                                  // CTA button
      x.fillStyle = "#ffffff"; x.font = "bold 34px sans-serif"; x.fillText("BUY NOW", 548, 523);
    } else {
      let s = 12345; const R = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
      x.fillStyle = "#808080"; x.fillRect(0, 0, 800, 600);
      for (let i = 0; i < 900; i++) { x.fillStyle = `hsl(${Math.floor(R() * 360)},${50 + Math.floor(R() * 50)}%,${30 + Math.floor(R() * 40)}%)`; x.fillRect(R() * 800, R() * 600, 6 + R() * 40, 6 + R() * 40); }
      x.fillStyle = "#9a9a9a"; x.font = "bold 40px sans-serif"; x.fillText("BUY NOW", 520, 520);
    }
    const blob = await new Promise(r => c.toBlob(r, "image/png"));
    return new File([blob], kind + ".png", { type: "image/png" });
  };
};

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    await check("creative: map, order, text contrast, palette, regions, gaze cue, findings (fakedet face)", async () => {
      const page = await browser.newPage(null, { initScripts: [`(${MAKE})()`] });
      await page.goto(`${base}/creative.html?cpu&fakedet`);
      await assertNoWebGL(page);
      await page.evaluate(() => {
        // a face on the left, turned toward the image right (where the CTA is)
        window.__LQ_FAKE_DET = key => key === "creative" ? [{ x: 0.05, y: 0.55, w: 0.12, h: 0.16, score: 0.95, yaw: 0.4 }] : null;
      });
      await page.evaluate(async () => { const f = await window.__mk("clean"); const dt = new DataTransfer(); dt.items.add(f); const i = document.querySelector("#file"); i.files = dt.files; i.dispatchEvent(new Event("change")); });
      await page.waitFor(`window.__LQ_CR.items.length === 1 && !window.__LQ_CR.busy`, 20000);
      const r = await page.evaluate(() => {
        const it = window.__LQ_CR.items[0];
        let sum = 0; for (const v of it.map.data) sum += v;
        return { sum, w: it.map.w, h: it.map.h, order: it.order, texts: it.texts.map(t => ({ x: t.x, y: t.y, w: t.w, h: t.h, ratio: t.ratio, level: t.level })),
          fams: it.palette.map(p => p.family), cx: it.complexity, faces: it.faces, engine: document.querySelector("#engine").textContent,
          tiles: document.querySelectorAll("#tiles .tile").length, orderLis: document.querySelectorAll("#orderList li").length };
      });
      assert(Math.abs(r.sum - 1) < 1e-3 && r.w === 128 && r.h === 96, "map normalised at 128×96: " + JSON.stringify([r.sum, r.w, r.h]));
      assert(r.order.length >= 3 && r.orderLis === r.order.length, "≥3 predicted looks rendered: " + JSON.stringify(r.order));
      const big = r.texts.find(t => t.y < 0.2 && t.h > 0.05 && t.x < 0.2);
      assert(big && big.ratio > 12 && big.level !== "fail", "headline found with high contrast: " + JSON.stringify(r.texts));
      const faint = r.texts.find(t => t.y > 0.2 && t.y < 0.3);
      assert(faint && faint.level === "fail" && faint.ratio < 2, "light-grey small text fails WCAG: " + JSON.stringify(r.texts));
      assert(r.fams.includes("white") && r.fams.includes("blue") && r.fams.includes("orange"), "palette families " + r.fams);
      assert(r.faces.length === 1 && r.faces[0].dir === 1, "scripted face turned right " + JSON.stringify(r.faces));
      assert(r.tiles === 6 && /วิเคราะห์แล้ว 1 ภาพ/.test(r.engine), "tiles + status: " + r.tiles + " " + r.engine);

      // mark the CTA (520..740 × 470..550 of 800×600) and the product by dragging on the canvas
      const box = await page.evaluate(() => { const b = document.querySelector("#view").getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; });
      const drag = async (type, x0, y0, x1, y1) => {
        await page.evaluate(t => document.querySelector(`#typeSeg button[data-type=${t}]`).click(), type);
        await page.evaluate(() => document.querySelector("#view").scrollIntoView({ block: "center", behavior: "instant" }));
        const b = await page.evaluate(() => { const r = document.querySelector("#view").getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
        const P = (fx, fy) => ({ x: b.x + fx * b.w, y: b.y + fy * b.h });
        const a = P(x0, y0), z = P(x1, y1);
        await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: a.x, y: a.y, button: "left", clickCount: 1 });
        await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: (a.x + z.x) / 2, y: (a.y + z.y) / 2, button: "left", buttons: 1 });
        await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: z.x, y: z.y, button: "left", buttons: 1 });
        await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: z.x, y: z.y, button: "left", clickCount: 1 });
        await page.evaluate(t => document.querySelector(`#typeSeg button[data-type=${t}]`).click(), type); // leave draw mode
      };
      assert(box.w > 100, "canvas visible " + JSON.stringify(box));
      await drag("cta", 520 / 800, 470 / 600, 740 / 800, 550 / 600);
      await drag("product", 140 / 800, 250 / 600, 360 / 800, 470 / 600);
      const g = await page.evaluate(() => {
        const it = window.__LQ_CR.items[0];
        return { regs: it.regionsR.map(r => ({ type: r.type, share: r.share, area: r.area, lift: r.lift, rank: r.rank, distinct: r.distinct })),
          targets: it.faces[0].targets, rows: document.querySelectorAll("#regionTable tbody tr").length,
          cards: [...document.querySelectorAll("#findings .gcard")].map(c => ({ id: c.dataset.card, cls: c.className, found: c.querySelector(".found").textContent })),
          refs: [...document.querySelectorAll("#findings .refs a")].map(a => a.href) };
      });
      const cta = g.regs.find(r => r.type === "cta"), prod = g.regs.find(r => r.type === "product");
      assert(cta && Math.abs(cta.area - 0.0367) < 0.01, "CTA region ~3.7% of the image: " + JSON.stringify(cta));
      assert(cta.lift > 1 && cta.distinct > 20, "CTA gets more than its area share and stands out in colour: " + JSON.stringify(cta));
      assert(prod && prod.lift > 1 && prod.rank >= 1 && prod.rank <= 5, "product seen within the first 5 looks: " + JSON.stringify(prod));
      assert(g.rows === 2, "two region rows");
      assert(g.targets.includes("cta"), "face turned toward the CTA -> gaze target: " + JSON.stringify(g.targets));
      const gaze = g.cards.find(c => c.id === "gaze");
      assert(gaze && /st-good/.test(gaze.cls) && /หันไปทางพื้นที่สำคัญ/.test(gaze.found), "gaze card good: " + JSON.stringify(gaze));
      const leg = g.cards.find(c => c.id === "legibility");
      assert(leg && /st-tip/.test(leg.cls), "legibility tip for the faint text: " + JSON.stringify(leg));
      assert(g.cards.length >= 8 && g.refs.every(h => h.startsWith("https://")) && g.refs.some(h => h.includes("10.3389/fpsyg.2014.00166")), "cards with sources: " + g.cards.length);

      // second creative (cluttered) -> compare tab recommends the clean one, with the caveat and signage link
      await page.evaluate(async () => { await window.__LQ_CR.addFiles([await window.__mk("busy")]); });
      await page.waitFor(`window.__LQ_CR.items.length === 2 && !window.__LQ_CR.busy`, 20000);
      await page.evaluate(() => { window.__LQ_CR.addRegion("cta", { x: 0.64, y: 0.8, w: 0.3, h: 0.1 }, 1); window.__LQ_CR.addRegion("product", { x: 0.1, y: 0.3, w: 0.3, h: 0.3 }, 1); document.querySelector("#tab-compare").click(); });
      const cmp = await page.evaluate(() => ({
        cx: window.__LQ_CR.items.map(i => i.complexity), cols: document.querySelectorAll("#cmpBody thead th").length,
        rec: document.querySelector("#cmpBody .rec").textContent, win: document.querySelectorAll("#cmpBody td.win").length,
        cav: document.querySelector("#cmpCaveat").textContent, sig: !!document.querySelector('#cmpCaveat a[href="signage.html"]'),
        visible: !document.querySelector("#pane-compare").hidden
      }));
      assert(cmp.cx[0] + 15 < cmp.cx[1], "cluttered creative scores higher complexity: " + cmp.cx);
      assert(cmp.visible && cmp.cols === 3, "compare table has 2 creatives");
      assert(/แนะนำให้นำ A/.test(cmp.rec) && cmp.win > 0, "clean creative A recommended: " + cmp.rec);
      assert(/คาดการณ์/.test(cmp.cav) && cmp.sig, "caveat says predicted + links signage");

      // guide tab: all 10 cards with sources
      await page.evaluate(() => document.querySelector("#tab-guide").click());
      const gc = await page.evaluate(() => ({ n: document.querySelectorAll("#guideCards .gcard").length, ids: [...document.querySelectorAll("#guideCards .gcard")].map(c => c.dataset.card), refs: document.querySelectorAll("#guideCards .refs a").length }));
      for (const id of ["anchoring", "social", "scarcity", "decoy", "restorff", "reading", "exposure"]) assert(gc.ids.includes(id), "guide card " + id);
      assert(gc.refs >= 14, "guide refs " + gc.refs);

      // no "AI" in visible labels
      const ai = await page.evaluate(() => /\bAI\b/.test(document.querySelector("main").innerText));
      assert(!ai, "the word AI appears in user-facing text");
      await privacyScan(page);
      const st = await page.evaluate(() => Object.keys(localStorage).filter(k => k !== "lq-lang" && k !== "lq-i18n-debug"));
      assert(!st.length, "page wrote localStorage: " + st);
      const ext = page.requests.filter(q => !q.url.startsWith(base) && !/^(data|blob):/.test(q.url));
      assert(!ext.length, "third-party requests: " + ext.map(q => q.url));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });

    await check("creative: 中文 switch translates static + dynamic text; 390 px no overflow, 44 px targets", async () => {
      const page = await browser.newPage(null, { initScripts: [`(${MAKE})()`] });
      await page.goto(`${base}/creative.html?cpu&fakedet&lang=zh`);
      await page.waitFor(`window.LQI18N && LQI18N.lang === "zh"`, 8000);
      await page.evaluate(async () => { await window.__LQ_CR.addFiles([await window.__mk("clean")]); });
      await page.waitFor(`window.__LQ_CR.items.length === 1 && !window.__LQ_CR.busy`, 20000);
      await sleep(300);
      const z = await page.evaluate(() => ({ tab: document.querySelector("#tab-guide").textContent, tile: document.querySelector("#tiles .tile .k").textContent,
        card: document.querySelector("#findings .gcard h3").textContent, h1: document.querySelector("h1").textContent, engine: document.querySelector("#engine").textContent }));
      const cjk = s => /[一-鿿]/.test(s) && !/[฀-๿]/.test(s);
      assert(cjk(z.tab) && cjk(z.tile) && cjk(z.engine), "zh dynamic text: " + JSON.stringify(z));
      assert(/[一-鿿]/.test(z.card) && /[一-鿿]/.test(z.h1), "zh card/h1: " + JSON.stringify(z));
      const thaiLeft = await page.evaluate(() => { const m = document.querySelector("main"); return (m.innerText.match(/[฀-๿]+/g) || []).slice(0, 10); });
      assert(!thaiLeft.length, "Thai left in 中文 mode: " + thaiLeft.join(" | "));

      await page.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
      await sleep(500);
      const m = await page.evaluate(() => {
        const sw = document.documentElement.scrollWidth, cw = document.documentElement.clientWidth;
        const small = [...document.querySelectorAll("main button, main summary, main input[type=checkbox], main .drop")].filter(el => { const b = el.getBoundingClientRect(); if (!b.width) return false; const t = el.type === "checkbox" ? el.closest("label").getBoundingClientRect() : b; return t.height < 44 || t.width < 44; }).map(el => el.id || el.textContent.slice(0, 20));
        return { sw, cw, small };
      });
      assert(m.sw <= m.cw, `overflow at 390: ${m.sw} > ${m.cw}`);
      assert(!m.small.length, "targets < 44 px: " + JSON.stringify(m.small));
      await page.send("Emulation.clearDeviceMetricsOverride");
      await page.evaluate(() => LQI18N.setLang("th"));
      await page.close();
    });

    await check("creative: real face model on WASM loads and finds no face in a synthetic poster", async () => {
      const page = await browser.newPage(null, { initScripts: [`(${MAKE})()`] });
      await page.goto(`${base}/creative.html?cpu`);
      await page.evaluate(async () => { await window.__LQ_CR.addFiles([await window.__mk("clean")]); });
      await page.waitFor(`window.__LQ_CR.items.length === 1 && !window.__LQ_CR.busy`, 60000);
      const r = await page.evaluate(() => ({ model: window.__LQ_CR.faceModel, faces: window.__LQ_CR.items[0].faces.length, ok: window.__LQ_CR.items[0].facesOk, backend: faceapi.tf.getBackend() }));
      assert(r.model === "ready" && r.ok && r.faces === 0 && r.backend !== "webgl", "face model ready on " + JSON.stringify(r));
      const errs = hardErrors(page, base);
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      await page.close();
    });
  } finally { await browser.close(); }
}
