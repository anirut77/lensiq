// tests/e2e/palm-orient-labels.e2e.mjs — FIXED TEST SET "palm-orient-labels" (owner review of the palm orient-shots, 2026-11-21,
// OWNER-INBOX-2026-11-21 Entry 4). Locked in evals-locks/palm-orient-labels.sha256 (~/LENSIQ-field/evals/palm-orient-labels/)
// BEFORE the product change. palm.html with window.LENSIQ_PALM_V2 = true (set before load; the shipped switch stays off), 360 px
// wide, one browser. DRAWN SYNTHETIC hands only (tests/fixtures/palm-v2/synth-capture.js + synth-orient.js), never a photo of a
// person; every number is SYNTHETIC.
//  A  labels on the result image (TH / EN / ZH), measured from the page's own text drawing (fillText + measureText of the canvas,
//     recorded by this file's init script; the product code is not touched): after the 7 taps on the drawn hand, (1) as detected
//     and (2) the owner's case (lines 5 6 7 8 10 not found, 1-4 and 9 drawn): no two label texts overlap, every text inside the
//     canvas, no label text covers a point of a drawn found / added line, and each drawn guide keeps its "? N <not found>" text.
//  G  the guide outline per mode: without hand points (fallback; own hand, someone else, after "rotate frame") the guide is the
//     simple palm frame (window.__palmV2.guide.shape "frame"; the drawn ink lies on PalmV2.guideFrame's paths, and the paths are
//     inked); with hand points (demo profile, LENSIQ_PALM_LANDMARKS, the hand-point call stubbed with drawn landmark sets) the
//     hand-shaped outline (shape "hand"), and back to the frame when the hand is lost.
//  W  the legend line under the image at 360 px (TH / EN / ZH): no line-wrap finding (tests/e2e/line-wrap-kit.mjs PROBE) on its
//     text, every line box inside the paragraph, no sideways overflow; on the printed image the legend is drawn as lines that
//     each fit inside the canvas, in order, with the whole legend text.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { assert } from "./cdp.mjs";
import { PROBE, excepted } from "./line-wrap-kit.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const SYNTHC = readFileSync(join(here, "..", "fixtures", "palm-v2", "synth-capture.js"), "utf8");
const SYNTHO = readFileSync(join(here, "..", "fixtures", "palm-v2", "synth-orient.js"), "utf8");
const S = JSON.stringify;
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LANGS = ["th", "en", "zh"];
const NOT_FOUND = { th: "ไม่พบในภาพ", en: "Not found in this photo", zh: "照片中未找到" };
const TAP_ORDER = ["wrist", "indexBase", "pinkyBase", "indexTip", "middleTip", "ringTip", "pinkyTip"];
const LANG = lang => `try { localStorage.setItem("lq-lang", ${S(lang)}); } catch (e) {}`;
/* records every text drawn on the result and print canvases: text, the transformed baseline point and the measured box */
const REC = `(() => {
  const P = CanvasRenderingContext2D.prototype, orig = P.fillText;
  window.__txt = [];
  P.fillText = function (t, x, y, mw) {
    const id = this.canvas && this.canvas.id;
    if (id === "pv2Canvas" || id === "pv2PrintCanvas") {
      const m = this.measureText(String(t)), M = this.getTransform(), X = M.a * x + M.c * y + M.e, Y = M.b * x + M.d * y + M.f;
      const sx = Math.hypot(M.a, M.b), w = m.width * sx, asc = (m.actualBoundingBoxAscent || 0) * sx, desc = (m.actualBoundingBoxDescent || 0) * sx;
      const left = this.textAlign === "center" ? X - w / 2 : this.textAlign === "right" || this.textAlign === "end" ? X - w : X;
      window.__txt.push({ c: id, text: String(t), x: left, y: Y - asc, w, h: asc + desc, cw: this.canvas.width, ch: this.canvas.height });
    }
    return orig.call(this, t, x, y, mw);
  };
})();`;
/* the test camera of palm-capture-orient (one rear camera streaming a 240 x 320 canvas); used only to start the live guide */
const CAM = `(() => {
  const md = navigator.mediaDevices; if (!md) return;
  const W = 240, H = 320, cv = document.createElement("canvas"); cv.width = W; cv.height = H;
  const cx = cv.getContext("2d");
  function draw() { cx.fillStyle = "rgb(60,80,110)"; cx.fillRect(0, 0, W, H); }
  setInterval(draw, 66);
  md.enumerateDevices = async () => [{ deviceId: "lbl-cam", groupId: "g", kind: "videoinput", label: "Back Camera", toJSON() { return {}; } }];
  md.getUserMedia = async () => { draw(); const s = cv.captureStream(15), tr = s.getVideoTracks()[0];
    const gs = tr.getSettings.bind(tr); tr.getSettings = () => Object.assign({}, gs(), { deviceId: "lbl-cam", width: W, height: H, facingMode: "environment" });
    tr.applyConstraints = async () => undefined; return s; };
})();`;

async function open(browser, base, { lang = "th", demo = false, cam = false } = {}) {
  const init = [LANG(lang), SYNTHC, SYNTHO, REC, "window.LENSIQ_PALM_V2 = true; window.print = () => {};"].concat(demo ? ["window.LENSIQ_PROFILE = 'demo';"] : [], cam ? [CAM] : []);
  const page = await browser.newPage(null, { initScripts: init });
  await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 780, deviceScaleFactor: 2, mobile: true });
  await page.goto(`${base}/palm.html?cpu`);
  await page.waitFor(`!!(window.__palmV2 && window.__palmV2.ready)`, 20000);
  await page.evaluate("document.fonts ? document.fonts.ready.then(() => 1) : 1");
  return page;
}
const click = (page, sel) => page.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error("no " + s); e.scrollIntoView({ block: "center", behavior: "instant" });
  e.click(); return true; }, sel);
const guide = page => page.evaluate(() => window.__palmV2.guide);
async function mouse(page, type, p) { await page.send("Input.dispatchMouseEvent", { type, x: p[0], y: p[1], button: "left", buttons: type === "mouseReleased" ? 0 : 1, clickCount: 1,
  pointerType: "mouse" }); }
async function tapAt(page, p) { await mouse(page, "mousePressed", p); await mouse(page, "mouseReleased", p); await sleep(60); }
const upload = (page, o) => page.evaluate(async o => {
  const im = PalmCapSynth.palmImage(o);
  const c = document.createElement("canvas"); c.width = im.w; c.height = im.h;
  c.getContext("2d").putImageData(new ImageData(im.rgba, im.w, im.h), 0, 0);
  const blob = await new Promise(r => c.toBlob(r, "image/png"));
  const dt = new DataTransfer(); dt.items.add(new File([blob], "synthetic-palm.png", { type: "image/png" }));
  const inp = document.getElementById("pv2File"); inp.files = dt.files; inp.dispatchEvent(new Event("change", { bubbles: true }));
  return im.taps;
}, o);
async function tapAll(page, taps) {
  await page.waitFor(`!document.getElementById("pv2Work").hidden && /^1\\/7/.test(document.getElementById("pv2TapMsg").textContent)`, 20000);
  await sleep(150);
  for (const k of TAP_ORDER) await tapAt(page, await page.evaluate(q => window.__palmV2.imgToClient(q), taps[k]));
  await page.waitFor(`document.querySelectorAll("#pv2List [data-line]").length === 10 && !window.__palmV2.busy`, 40000);
  await sleep(200);
}
/** the texts drawn on the result canvas by one redraw, with the screen layout (line pixels) */
const redrawTexts = page => page.evaluate(() => { window.__txt = []; window.__palmV2.redraw();
  return { txt: window.__txt.filter(t => t.c === "pv2Canvas"), lay: window.__palmV2.layout("screen") }; });
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
function labelFindings(txt, lay, lang) {
  const bad = [], drawn = lay.lines.filter(L => (L.status === "found" || L.status === "added") && L.px);
  for (let i = 0; i < txt.length; i++) {
    const a = txt[i];
    if (a.x < -0.5 || a.y < -0.5 || a.x + a.w > a.cw + 0.5 || a.y + a.h > a.ch + 0.5) bad.push(`"${a.text}" outside the canvas ${S([a.x, a.y, a.w, a.h].map(Math.round))}`);
    for (let j = i + 1; j < txt.length; j++) if (overlap(a, txt[j])) bad.push(`"${a.text}" overlaps "${txt[j].text}"`);
    for (const L of drawn) { const p = L.px.find(q => q[0] > a.x && q[0] < a.x + a.w && q[1] > a.y && q[1] < a.y + a.h); if (p) bad.push(`"${a.text}" covers line ${L.id}`); }
  }
  lay.lines.forEach((L, k) => { if (L.status === "notFound" && !L.hidden && L.px && !txt.some(t => t.text.startsWith("? " + (k + 1) + " ") && t.text.includes(NOT_FOUND[lang])))
    bad.push(`guide ${L.id} has no "? ${k + 1} ${NOT_FOUND[lang]}" label`); });
  return bad;
}
/** ink of the guide canvas vs PalmV2.guideFrame's paths: share of ink pixels near a path, share of path points with ink near */
const frameInk = page => page.evaluate(() => {
  const c = document.getElementById("pv2Guide"), g = c.getContext("2d"), d = g.getImageData(0, 0, c.width, c.height).data, gd = window.__palmV2.guide;
  const fr = window.PalmV2.guideFrame(c.width, c.height, { angle: gd.angle, by: gd.by }), segs = [];
  fr.paths.forEach(P => { for (let i = 1; i < P.length; i++) segs.push([P[i - 1], P[i]]); });
  const dist = (x, y) => { let b = Infinity; for (const [a, z] of segs) { const dx = z[0] - a[0], dy = z[1] - a[1], l2 = dx * dx + dy * dy || 1e-9;
    let t = ((x - a[0]) * dx + (y - a[1]) * dy) / l2; t = Math.max(0, Math.min(1, t)); b = Math.min(b, Math.hypot(x - a[0] - t * dx, y - a[1] - t * dy)); } return b; };
  const tol = Math.max(4, c.width / 80);
  let n = 0, near = 0; for (let y = 0; y < c.height; y += 3) for (let x = 0; x < c.width; x += 3) if (d[(y * c.width + x) * 4 + 3] > 40) { n++; if (dist(x, y) <= tol) near++; }
  const inkAt = (x, y) => { for (let dy = -tol; dy <= tol; dy += 2) for (let dx = -tol; dx <= tol; dx += 2) { const X = Math.round(x + dx), Y = Math.round(y + dy);
    if (X >= 0 && Y >= 0 && X < c.width && Y < c.height && d[(Y * c.width + X) * 4 + 3] > 40) return true; } return false; };
  let pts = 0, hit = 0; fr.paths.forEach(P => { for (let i = 1; i < P.length; i++) for (let s = 0; s < 1; s += 0.25) { pts++; if (inkAt(P[i - 1][0] + (P[i][0] - P[i - 1][0]) * s, P[i - 1][1] + (P[i][1] - P[i - 1][1]) * s)) hit++; } });
  return { n, onFrame: n ? near / n : 0, inked: pts ? hit / pts : 0, shape: gd.shape };
});

export default async function ({ base, launch, check }) {
  const browser = await launch();
  try {
    for (const lang of LANGS) {
      await check(`A ${lang}: result-image labels at 360 px: no overlap, inside the image, never over a drawn line; each guide keeps its "? N" label`, async () => {
        const page = await open(browser, base, { lang });
        try {
          await tapAll(page, await upload(page, { pw: 480 }));
          let r = await redrawTexts(page);
          assert(r.txt.length >= 3, `${lang}: too few labels drawn ${S(r.txt.map(t => t.text))}`);
          let bad = labelFindings(r.txt, r.lay, lang);
          assert(!bad.length, `${lang} as detected: ${bad.length} finding(s):\n         ` + bad.slice(0, 20).join("\n         "));
          // the owner's case: 5 6 7 8 10 not found; 1-4 and 9 drawn (added on their guide where the detection did not find them)
          await page.evaluate(() => { const st = window.__palmV2.state(), G = window.PalmV2.guides(st.school);
            window.PalmV2.LINES.forEach((id, i) => {
              if ([4, 5, 6, 7, 9].includes(i)) window.__palmV2.setLine(id, { status: "notFound" });
              else if (st.lines[id].status !== "found") window.__palmV2.setLine(id, { status: "added", cp: G[id].cp.map(q => q.slice()) });
            }); });
          await sleep(200);
          r = await redrawTexts(page);
          const nf = r.lay.lines.filter(L => L.status === "notFound" && !L.hidden && L.px).length;
          assert(nf >= 4, `${lang}: owner's case not set up (${nf} guides drawn) ${S(r.lay.lines.map(L => L.id + ":" + L.status))}`);
          bad = labelFindings(r.txt, r.lay, lang);
          assert(!bad.length, `${lang} owner's case: ${bad.length} finding(s):\n         ` + bad.slice(0, 20).join("\n         "));
        } finally { await page.close(); }
      });
    }

    await check("G the guide is the simple palm frame without hand points (own hand, someone else, rotated), the hand outline only with hand points", async () => {
      const page = await open(browser, base, { lang: "th" });
      try {
        for (const [mode, rot] of [["self", false], ["self", true], ["other", false], ["other", true]]) {
          await click(page, `[data-pv2-mode="${mode}"]`);
          await sleep(150);
          if (((await guide(page)).flip === true) !== rot) await click(page, "#pv2Rotate");
          await sleep(200);
          const g = await guide(page), f = await frameInk(page);
          assert(g.by === "mode" && g.shape === "frame", `${mode} rotate ${rot}: guide ${S(g)}`);
          assert(f.n > 50 && f.onFrame >= 0.95 && f.inked >= 0.9, `${mode} rotate ${rot}: the drawn guide is not the palm frame ${S(f)}`);
        }
      } finally { await page.close(); }
      const p2 = await open(browser, base, { lang: "th", demo: true, cam: true });
      try {
        assert(await p2.evaluate(() => window.LENSIQ_PALM_LANDMARKS === true && !!window.__palm), "landmarks switch not on in the demo profile");
        await p2.evaluate(() => { window.__lmScene = null; window.__palm.loadModels = () => Promise.resolve();
          window.__palm.detectHand = () => Promise.resolve(window.__lmScene ? { pts: PalmCapSynth.landmarks(window.__lmScene).pts } : null); });
        await click(p2, "#pv2Start");
        await p2.waitFor(`!document.getElementById("pv2Stop").hidden`, 8000);
        for (const rot of [0, 90, 180]) {
          await p2.evaluate(sc => { window.__lmScene = sc; }, { side: "right", rot, mirror: false, at: [120, 200], scale: 40 });
          let g = null; const t0 = Date.now();
          while (Date.now() - t0 < 5000) { g = await guide(p2); if (g && g.by === "landmarks") break; await sleep(150); }
          assert(g && g.by === "landmarks" && g.shape === "hand", `hand points rot ${rot}: guide ${S(g)}`);
          const f = await frameInk(p2);
          assert(f.n > 50 && f.onFrame < 0.8, `hand points rot ${rot}: the palm frame is drawn instead of the hand outline ${S(f)}`);
        }
        await p2.evaluate(() => { window.__lmScene = null; });
        let g = null; const t0 = Date.now();
        while (Date.now() - t0 < 5000) { g = await guide(p2); if (g && g.by === "mode") break; await sleep(150); }
        assert(g && g.by === "mode" && g.shape === "frame", `hand lost: back to the palm frame ${S(g)}`);
      } finally { await p2.close(); }
    });

    for (const lang of LANGS) {
      await check(`W ${lang}: the legend under the image wraps cleanly at 360 px, on the screen and on the printed image`, async () => {
        const page = await open(browser, base, { lang });
        try {
          await tapAll(page, await upload(page, { pw: 480 }));
          const lg = await page.evaluate(() => { const p = document.querySelector('#pv2Work [data-pv2-t="legend"]'), r = p.getBoundingClientRect(), rg = document.createRange(), boxes = [];
            const walk = n => { if (n.nodeType === 3) { for (let i = 0; i < n.length; i++) { rg.setStart(n, i); rg.setEnd(n, i + 1); for (const b of rg.getClientRects()) boxes.push([b.left, b.right]); } }
              else n.childNodes.forEach(walk); };
            walk(p);
            return { text: p.textContent, left: r.left, right: r.right, shown: !!p.offsetParent, out: boxes.filter(b => b[0] < r.left - 1 || b[1] > r.right + 1).length,
              over: document.documentElement.scrollWidth > window.innerWidth + 1, sw: p.scrollWidth, cw: p.clientWidth }; });
          assert(lg.shown && lg.text.length > 10, `${lang}: legend not shown ${S(lg)}`);
          assert(!lg.out && !lg.over && lg.sw <= lg.cw + 1, `${lang}: legend overflows ${S(lg)}`);
          const f = (await page.evaluate(PROBE)).filter(x => !excepted({ ...x, page: "palm.html", lang, w: 360 }) && lg.text.split(" · ").some(seg => seg.length > 3 && x.text.includes(seg.slice(0, 6))));
          assert(!f.length, `${lang}: legend line-wrap findings ${S(f)}`);
          await click(page, "#pv2Read"); await sleep(300);
          await page.evaluate(() => { window.__txt = []; });
          await click(page, "#pv2Print"); await sleep(300);
          const pr = await page.evaluate(() => window.__txt.filter(t => t.c === "pv2PrintCanvas"));
          const legend = lg.text.replace(/\s+/g, " ").trim();
          const lines = pr.filter(t => legend.includes(t.text.trim()) && t.text.trim().length > 2);
          assert(lines.length >= 1, `${lang}: legend not drawn on the printed image ${S(pr.map(t => t.text))}`);
          assert(lines.map(t => t.text.trim()).join(" ").replace(/\s+/g, " ") === legend, `${lang}: printed legend text ${S(lines.map(t => t.text))} vs ${S(legend)}`);
          for (const t of lines) assert(t.x >= 0 && t.x + t.w <= t.cw + 0.5, `${lang}: printed legend line outside the image ${S(t)}`);
          for (let i = 1; i < lines.length; i++) assert(lines[i].y > lines[i - 1].y, `${lang}: printed legend lines out of order ${S(lines)}`);
        } finally { await page.close(); }
      });
    }
  } finally { await browser.close(); }
}
