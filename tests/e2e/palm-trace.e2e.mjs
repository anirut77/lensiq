// tests/e2e/palm-trace.e2e.mjs — owner decision 174 ก (night order A4, 2026-11-21): the local palm tap-to-trace labelling tool
// (tools/palm-trace/, served by tools/palm-trace/serve.mjs on 127.0.0.1). FIXED TEST SET, hash-locked in
// evals-locks/palm-trace.sha256 (~/LENSIQ-field/evals/palm-trace/) BEFORE the product code.
// SYNTHETIC IMAGE ONLY: the test draws a plain skin-coloured PNG with four dark curves; no photo of a person is used or viewed.
//   1. phone width (360 px): no horizontal scroll, every control >= 44 px tall, TH / EN / 中文 texts switch
//   2. export with nothing traced is refused (message, no file)
//   3. the photo goes in through the file input; taps (mouse events at the real canvas position) at zoom 1 and zoom 2 with the
//      view scrolled, undo, clear, "not visible", labeller and hand; the downloaded JSON validates (core validateLabel), holds the
//      PNG width / height, its file name and sha256, the tapped points (<= 0.006 off), and no image data or EXIF
//   4. no network: every request the page made is one of its own four files on the loopback server; nothing after load;
//      localStorage holds no image; and a fetch from the page is blocked by its CSP (connect-src 'none')
import { assert, launch } from "./cdp.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

const require = createRequire(import.meta.url);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const W = 600, H = 800, TOL = 0.006;

/** the four synthetic curves, normalised (x, y) for t in [0, 1] */
const CURVES = {
  life: t => [0.42 - 0.18 * Math.sin(Math.PI * t * 0.9), 0.3 + 0.55 * t],
  head: t => [0.3 + 0.5 * t, 0.42 + 0.06 * t],
  heart: t => [0.25 + 0.6 * t, 0.3 - 0.05 * Math.sin(Math.PI * t)],
  fate: t => [0.55, 0.85 - 0.5 * t]
};

/** synthetic RGB PNG: skin-coloured background with the four curves drawn dark, 4 px wide */
function synthPng() {
  const px = Buffer.alloc(W * H * 3);
  for (let i = 0; i < W * H; i++) { px[i * 3] = 222; px[i * 3 + 1] = 184; px[i * 3 + 2] = 160; }
  for (const f of Object.values(CURVES)) {
    for (let k = 0; k <= 2000; k++) {
      const [nx, ny] = f(k / 2000), cx = Math.round(nx * W), cy = Math.round(ny * H);
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
        const x = cx + dx, y = cy + dy; if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const o = (y * W + x) * 3; px[o] = 120; px[o + 1] = 78; px[o + 2] = 66;
      }
    }
  }
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t, d) => { const l = Buffer.alloc(4), c = Buffer.alloc(4), td = Buffer.concat([Buffer.from(t), d]); l.writeUInt32BE(d.length); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; px.copy(raw, y * (W * 3 + 1) + 1, y * W * 3, (y + 1) * W * 3); }
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const click = async (page, sel) => {
  const ok = await page.evaluate(s => { const el = document.querySelector(s); if (!el) return false; el.click(); return true; }, sel);
  assert(ok, "no element " + sel);
};

/** scroll the photo point (nx, ny) into view (zoom container, then page) and press / release the mouse on it */
async function tap(page, nx, ny) {
  const p = await page.evaluate((x, y) => {
    const cv = document.querySelector("#cv"), wrap = document.querySelector("#wrap");
    let r = cv.getBoundingClientRect(), w = wrap.getBoundingClientRect();
    wrap.scrollLeft += r.left + x * r.width - (w.left + w.width / 2);
    wrap.scrollTop += r.top + y * r.height - (w.top + w.height / 2);
    r = cv.getBoundingClientRect();
    window.scrollBy(0, r.top + y * r.height - window.innerHeight / 2);
    r = cv.getBoundingClientRect();
    return { x: r.left + x * r.width, y: r.top + y * r.height };
  }, nx, ny);
  for (const type of ["mouseMoved", "mousePressed", "mouseReleased"]) {
    await page.send("Input.dispatchMouseEvent", { type, x: p.x, y: p.y, button: type === "mouseMoved" ? "none" : "left", clickCount: type === "mouseMoved" ? 0 : 1 });
  }
  await sleep(30);
}

async function waitDownload(dir, ms = 8000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const f = readdirSync(dir).filter(n => n.endsWith(".palm-trace.json"));
    if (f.length) return join(dir, f[0]);
    await sleep(100);
  }
  return null;
}

export default async function (ctx) {
  const { check } = ctx;
  const core = require(join(ctx.repo, "tools", "palm-trace", "palm-trace-core.js"));
  const { startTraceServer } = await import(join(ctx.repo, "tools", "palm-trace", "serve.mjs"));
  const srv = await startTraceServer({ port: 0 });
  const origin = "http://127.0.0.1:" + srv.address().port;
  const tmp = mkdtempSync(join(tmpdir(), "lq-palmtrace-e2e-"));
  const dl = join(tmp, "downloads"); mkdirSync(dl);
  const png = synthPng(), pngName = "synthetic-palm.png", pngPath = join(tmp, pngName);
  writeFileSync(pngPath, png);
  const pngSha = createHash("sha256").update(png).digest("hex");
  const b = await launch();
  try {
    await b.send("Browser.setDownloadBehavior", { behavior: "allow", downloadPath: dl, eventsEnabled: true });
    // the save dialog cannot be driven headless: without showSaveFilePicker the page uses its download fallback
    const page = await b.newPage(null, { initScripts: ["Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true });"] });
    await page.send("Emulation.setDeviceMetricsOverride", { width: 360, height: 740, deviceScaleFactor: 2, mobile: true });
    await page.goto(origin + "/");
    const loadCount = page.requests.length;

    await check("1. 360 px: no horizontal scroll, controls >= 44 px, TH / EN / ZH texts", async () => {
      const r = await page.evaluate(() => ({
        sw: document.documentElement.scrollWidth, iw: window.innerWidth,
        small: [...document.querySelectorAll("button, select, input, label.file")].filter(e => e.offsetParent && e.type !== "hidden")
          .map(e => ({ id: e.id || e.dataset.line || e.dataset.lang || e.dataset.zoom || e.tagName, h: e.getBoundingClientRect().height })).filter(x => x.h < 44)
      }));
      assert(r.sw <= r.iw, "horizontal scroll: " + r.sw + " > " + r.iw);
      assert(!r.small.length, "controls under 44 px: " + JSON.stringify(r.small));
      for (const lang of ["en", "zh", "th"]) {
        await click(page, `[data-lang="${lang}"]`);
        const t = await page.evaluate(() => ({ h1: document.querySelector("h1").textContent.trim(), exp: document.querySelector("#export").textContent.trim(),
          undo: document.querySelector("#undo").textContent.trim(), life: document.querySelector('[data-line="life"]').textContent.trim(), lang: document.documentElement.lang }));
        assert(t.h1 === core.T[lang].title, lang + " title: " + t.h1);
        assert(t.exp === core.T[lang].export, lang + " export: " + t.exp);
        assert(t.undo === core.T[lang].undo, lang + " undo: " + t.undo);
        assert(t.life.includes(core.T[lang].line_life), lang + " life button: " + t.life);
        assert(t.lang === lang, "html lang " + t.lang);
        const sw = await page.evaluate(() => document.documentElement.scrollWidth);
        assert(sw <= 360, lang + " horizontal scroll " + sw);
      }
    });

    await check("2. export with no photo / nothing traced is refused with a message and no file", async () => {
      await click(page, "#export");
      await sleep(400);
      const m = await page.evaluate(() => ({ t: document.querySelector("#msg").textContent.trim(), c: document.querySelector("#msg").className }));
      assert(m.t.length > 0 && /err/.test(m.c), "error message expected, got " + JSON.stringify(m));
      assert(!readdirSync(dl).length, "no file written");
    });

    const taps = { life: [0.05, 0.3, 0.55, 0.8, 0.95].map(t => CURVES.life(t)), head: [0.1, 0.5, 0.9].map(t => CURVES.head(t)), heart: [0.2, 0.8].map(t => CURVES.heart(t)) };

    await check("3. synthetic photo in, taps / undo / clear / not visible, exported JSON is right and holds no image data", async () => {
      const { root } = await page.send("DOM.getDocument", { depth: 0 });
      const { nodeId } = await page.send("DOM.querySelector", { nodeId: root.nodeId, selector: "#photo" });
      await page.send("DOM.setFileInputFiles", { nodeId, files: [pngPath] });
      await page.waitFor(() => document.body.dataset.ready === "1", 10000);
      await page.evaluate(() => { const l = document.querySelector("#labeller"); l.value = "e2e-synthetic"; l.dispatchEvent(new Event("input", { bubbles: true })); l.dispatchEvent(new Event("change", { bubbles: true })); });
      await page.evaluate(() => { const h = document.querySelector("#hand"); h.value = "right"; h.dispatchEvent(new Event("change", { bubbles: true })); });
      // life: 5 taps + 1 stray tap, then undo
      await click(page, '[data-line="life"]');
      for (const [x, y] of taps.life) await tap(page, x, y);
      await tap(page, 0.9, 0.1);
      await click(page, "#undo");
      // head at zoom 2 with the view scrolled
      await click(page, '[data-zoom="2"]');
      await click(page, '[data-line="head"]');
      for (const [x, y] of taps.head) await tap(page, x, y);
      await click(page, '[data-zoom="1"]');
      // heart: 2 wrong taps, clear, then the 2 right ones
      await click(page, '[data-line="heart"]');
      await tap(page, 0.1, 0.9); await tap(page, 0.2, 0.95);
      await click(page, "#clear");
      for (const [x, y] of taps.heart) await tap(page, x, y);
      // fate: one tap, then "not visible" drops it
      await click(page, '[data-line="fate"]');
      await tap(page, 0.55, 0.6);
      await click(page, "#notvis");
      await click(page, "#export");
      const file = await waitDownload(dl);
      assert(file, "no .palm-trace.json downloaded; msg: " + await page.evaluate(() => document.querySelector("#msg").textContent));
      assert(file.endsWith("synthetic-palm.palm-trace.json"), "file name " + file);
      const text = readFileSync(file, "utf8"), j = JSON.parse(text);
      const errs = core.validateLabel(j);
      assert(!errs.length, "invalid label: " + errs.join("; "));
      assert(j.image.width === W && j.image.height === H, "image size " + JSON.stringify(j.image));
      assert(j.image.name === pngName, "image name " + j.image.name);
      assert(j.image.sha256 === pngSha, "image sha256");
      assert(j.labeller === "e2e-synthetic", "labeller " + j.labeller);
      assert(j.hand === "right", "hand " + j.hand);
      assert(j.tool.version === core.TOOL_VERSION && j.schema === core.SCHEMA, "tool / schema");
      assert(Math.abs(Date.parse(j.createdAt) - Date.now()) < 120000, "timestamp is now: " + j.createdAt);
      for (const id of ["life", "head", "heart"]) {
        const got = j.lines[id];
        assert(got.status === "traced", id + " status " + got.status);
        assert(got.points.length === taps[id].length, id + " points " + got.points.length + " expected " + taps[id].length);
        got.points.forEach((p, i) => assert(Math.abs(p[0] - taps[id][i][0]) <= TOL && Math.abs(p[1] - taps[id][i][1]) <= TOL,
          `${id}[${i}] ${JSON.stringify(p)} vs ${JSON.stringify(taps[id][i])}`));
      }
      assert(j.lines.fate.status === "notVisible" && !j.lines.fate.points.length, "fate not visible: " + JSON.stringify(j.lines.fate));
      assert(!/data:|base64|exif|iVBOR|\/9j\//i.test(text), "image data / EXIF words in the file");
      assert(text.length < 4096, "label file " + text.length + " bytes");
    });

    await check("4. no network: only the page's own files on the loopback server; nothing after load; CSP blocks a fetch", async () => {
      const allowed = new Set(["/", "/index.html", "/palm-trace.js", "/palm-trace-core.js", "/palm-trace.css"]);
      const bad = page.requests.filter(r => {
        if (/^(blob|data):/.test(r.url)) return false;
        let u; try { u = new URL(r.url); } catch { return true; }
        return u.origin !== origin || !allowed.has(u.pathname) || r.method !== "GET" || r.postData;
      });
      assert(!bad.length, "requests outside the page's own files: " + JSON.stringify(bad.slice(0, 5)));
      const after = page.requests.slice(loadCount).filter(r => !/^(blob|data):/.test(r.url));
      assert(!after.length, "requests after load: " + JSON.stringify(after.slice(0, 5)));
      const ls = await page.evaluate(() => Object.keys(localStorage).map(k => ({ k, n: (localStorage.getItem(k) || "").length, img: /data:image|base64/i.test(localStorage.getItem(k) || "") })));
      assert(!ls.some(e => e.img || e.n > 200), "localStorage holds image / large values: " + JSON.stringify(ls));
      const errs = page.consoleErrors.slice();
      assert(!errs.length, "console errors: " + JSON.stringify(errs.slice(0, 3)));
      const probe = await page.evaluate(o => fetch(o + "/index.html").then(() => "sent", () => "blocked"), origin);
      assert(probe === "blocked", "a fetch from the page must be blocked by connect-src 'none', got " + probe);
    });
  } finally {
    await b.close();
    await new Promise(r => srv.close(r));
    rmSync(tmp, { recursive: true, force: true });
  }
}
